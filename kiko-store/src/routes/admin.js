'use strict';
// Admin panel routes. Everything here requires role = admin.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cfg = require('../config');
const { db, one, all, run, val, tx, insert, update, settings, saveSettings, DEFAULTS } = require('../db');
const { HttpError } = require('../http');
const { html } = require('../html');
const { hashPassword, verifyPassword, login, logout, requireAdmin } = require('../auth');
const { cats, invalidate, hydrate, reindex } = require('../catalog');
const { STATUSES, PAY_STATUSES, setStatus, setPayment, orderItems, orderEvents } = require('../orders');
const { invalidateContent } = require('../content');
const { int, num, arr, slugify, token, csvParse, csvStringify, csvClean, dayKey, fmtDate, limited, zonedToUtc, normSearch } = require('../util');
const notify = require('../notify');
const { sendMail, smtpConfig } = require('../mailer');
const A = require('../views/admin');

const SAFE_IMG = /^(\/uploads\/[\w\-./]+|\/assets\/[\w\-./]+|https:\/\/[^\s"'<>]+)$/;
const cleanImg = (u) => { const s = String(u || '').trim(); return SAFE_IMG.test(s) && !s.includes('..') ? s : ''; };
const str = (v, max = 500) => String(v ?? '').trim().slice(0, max);
const go = (ctx, url, flag, msg) => ctx.redirect(url + (url.includes('?') ? '&' : '?') + 'f=' + flag + (msg ? '&m=' + encodeURIComponent(msg) : ''));
const csvSend = (ctx, name, rows) => { ctx.headers['Content-Disposition'] = `attachment; filename="${name}"`; ctx.send(csvStringify(rows), 200, 'text/csv; charset=utf-8'); };
const navCounts = () => ({ '/admin/orders': val("SELECT COUNT(*) FROM orders WHERE status = 'pending'"), '/admin/messages': val('SELECT COUNT(*) FROM messages WHERE read = 0') });

// ---------- generic resources ----------
const catOptions = () => [{ v: '', l: '—' }, ...A.flatCats(cats().roots).map((c) => ({ v: c.id, l: c.label }))];
const yes = (r, k) => (r[k] ? '✓' : '—');
const RES = {
  categories: {
    table: 'categories', title: 'adm.categories', order: 'sort, id', hint: 'adm.hint.categories',
    fields: [
      { k: 'name_en', label: 'adm.f.name_en', req: 1, dir: 'ltr' }, { k: 'name_ar', label: 'adm.f.name_ar', req: 1, dir: 'rtl' },
      { k: 'slug', label: 'adm.f.slug', dir: 'ltr', ph: 'adm.auto' }, { k: 'parent_id', label: 'adm.f.parent', type: 'select', options: catOptions },
      { k: 'desc_en', label: 'adm.f.desc_en', type: 'textarea', dir: 'ltr' }, { k: 'desc_ar', label: 'adm.f.desc_ar', type: 'textarea', dir: 'rtl' },
      { k: 'image', label: 'adm.image', type: 'image' }, { k: 'sort', label: 'adm.sort', type: 'number', def: 0 },
      { k: 'menu', label: 'adm.f.in_menu', type: 'bool', def: 1 }, { k: 'active', label: 'adm.active', type: 'bool', def: 1 },
    ],
    cols: [{ k: 'name', label: 'adm.f.name', render: (r, ctx) => html`${'— '.repeat(r.depth || 0)}<a href="/admin/r/categories/${r.id}">${ctx.L(r, 'name')}</a>` }, { k: 'slug', label: 'adm.f.slug' }, { k: 'count', label: 'adm.products' }, { k: 'sort', label: 'adm.sort' }, { k: 'active', label: 'adm.active', render: (r) => yes(r, 'active') }],
    list: () => { // tree order with depth + product counts
      const rows = all('SELECT * FROM categories ORDER BY sort, id');
      const counts = new Map(all('SELECT category_id id, COUNT(*) n FROM product_categories GROUP BY category_id').map((r) => [r.id, r.n]));
      const out = [];
      const walk = (pid, depth) => rows.filter((r) => (r.parent_id || null) === pid).forEach((r) => { out.push({ ...r, depth, count: counts.get(r.id) || 0 }); walk(r.id, depth + 1); });
      walk(null, 0);
      rows.filter((r) => !out.some((o) => o.id === r.id)).forEach((r) => out.push({ ...r, depth: 0, count: counts.get(r.id) || 0 }));
      return out;
    },
    prepare: (d, id) => {
      d.slug = slugify(d.slug || d.name_en);
      d.parent_id = +d.parent_id || null;
      if (id && d.parent_id) { // prevent cycles
        for (let p = d.parent_id; p; p = one('SELECT parent_id FROM categories WHERE id = ?', p)?.parent_id) if (p === +id) return 'adm.err.cycle';
      }
      return null;
    },
    after: () => { invalidate(); all('SELECT id FROM products').forEach((p) => reindex(p.id)); },
  },
  zones: {
    table: 'zones', title: 'adm.zones', order: 'sort, id', hint: 'adm.hint.zones',
    fields: [
      { k: 'name_en', label: 'adm.f.name_en', req: 1, dir: 'ltr' }, { k: 'name_ar', label: 'adm.f.name_ar', req: 1, dir: 'rtl' },
      { k: 'fee', label: 'adm.f.fee', type: 'number', req: 1, def: 0 }, { k: 'free_over', label: 'adm.f.free_over', type: 'number', ph: 'adm.f.free_over_ph', hint: 'adm.f.free_over_hint' },
      { k: 'days_en', label: 'adm.f.days_en', dir: 'ltr' }, { k: 'days_ar', label: 'adm.f.days_ar', dir: 'rtl' },
      { k: 'sort', label: 'adm.sort', type: 'number', def: 0 }, { k: 'active', label: 'adm.active', type: 'bool', def: 1 },
    ],
    cols: [{ k: 'name', label: 'adm.f.name', render: (r, ctx) => html`<a href="/admin/r/zones/${r.id}">${ctx.L(r, 'name')}</a>` }, { k: 'fee', label: 'adm.f.fee', render: (r, ctx) => ctx.money(r.fee) }, { k: 'free_over', label: 'adm.f.free_over', render: (r, ctx) => (r.free_over == null ? '—' : ctx.money(r.free_over)) }, { k: 'active', label: 'adm.active', render: (r) => yes(r, 'active') }],
    prepare: (d) => { d.fee = Math.max(0, num(d.fee)); d.free_over = d.free_over === '' || d.free_over == null ? null : Math.max(0, num(d.free_over)); return null; },
  },
  coupons: {
    table: 'coupons', title: 'adm.coupons', order: 'id DESC', hint: 'adm.hint.coupons',
    fields: [
      { k: 'code', label: 'adm.f.code', req: 1, dir: 'ltr', max: 40 },
      { k: 'type', label: 'adm.f.type', type: 'select', options: [{ v: 'percent', l: 'adm.f.percent' }, { v: 'fixed', l: 'adm.f.fixed' }, { v: 'shipping', l: 'adm.f.free_shipping' }] },
      { k: 'value', label: 'adm.f.value', type: 'number', def: 10 }, { k: 'min_total', label: 'adm.f.min_total', type: 'number', def: 0 },
      { k: 'max_uses', label: 'adm.f.max_uses', type: 'number', ph: 'adm.f.unlimited' }, { k: 'per_customer', label: 'adm.f.per_customer', type: 'number', def: 0, hint: 'adm.f.per_customer_hint' },
      { k: 'starts', label: 'adm.f.starts', type: 'date' }, { k: 'ends', label: 'adm.f.ends', type: 'date' },
      { k: 'active', label: 'adm.active', type: 'bool', def: 1 },
    ],
    cols: [{ k: 'code', label: 'adm.f.code', render: (r) => html`<a href="/admin/r/coupons/${r.id}"><code>${r.code}</code></a>` }, { k: 'type', label: 'adm.f.type', render: (r, ctx) => (r.type === 'percent' ? r.value + '%' : r.type === 'fixed' ? ctx.money(r.value) : ctx.t('adm.f.free_shipping')) }, { k: 'used', label: 'adm.f.used', render: (r) => `${r.used}${r.max_uses ? ' / ' + r.max_uses : ''}` }, { k: 'ends', label: 'adm.f.ends' }, { k: 'active', label: 'adm.active', render: (r) => yes(r, 'active') }],
    prepare: (d) => { d.code = String(d.code).toUpperCase().replace(/\s+/g, ''); d.value = Math.max(0, num(d.value)); d.min_total = Math.max(0, num(d.min_total)); d.max_uses = int(d.max_uses) || null; d.per_customer = Math.max(0, int(d.per_customer)); d.starts = d.starts || null; d.ends = d.ends || null; if (!['percent', 'fixed', 'shipping'].includes(d.type)) d.type = 'percent'; if (d.type === 'percent') d.value = Math.min(100, d.value); return null; },
  },
  banners: {
    table: 'banners', title: 'adm.banners', order: 'placement, sort, id', hint: 'adm.hint.banners',
    fields: [
      { k: 'placement', label: 'adm.f.placement', type: 'select', options: ['hero', 'circle', 'card', 'service', 'promo'].map((p) => ({ v: p, l: 'adm.place.' + p })) },
      { k: 'link', label: 'adm.f.link', dir: 'ltr', ph: 'adm.f.link_ph' },
      { k: 'title_en', label: 'adm.f.title_en', dir: 'ltr' }, { k: 'title_ar', label: 'adm.f.title_ar', dir: 'rtl' },
      { k: 'sub_en', label: 'adm.f.sub_en', dir: 'ltr' }, { k: 'sub_ar', label: 'adm.f.sub_ar', dir: 'rtl' },
      { k: 'cta_en', label: 'adm.f.cta_en', dir: 'ltr' }, { k: 'cta_ar', label: 'adm.f.cta_ar', dir: 'rtl' },
      { k: 'image', label: 'adm.image', type: 'image' }, { k: 'bg', label: 'adm.f.bg', type: 'color' },
      { k: 'sort', label: 'adm.sort', type: 'number', def: 0 }, { k: 'active', label: 'adm.active', type: 'bool', def: 1 },
    ],
    cols: [{ k: 'image', label: 'adm.image', render: (r) => (r.image ? html`<img class="thumb" src="${r.image}" alt="" style="background:${r.bg || '#eee'}">` : '') }, { k: 'placement', label: 'adm.f.placement', render: (r, ctx) => ctx.t('adm.place.' + r.placement) }, { k: 'title', label: 'adm.f.title', render: (r, ctx) => html`<a href="/admin/r/banners/${r.id}">${ctx.L(r, 'title') || '—'}</a>` }, { k: 'sort', label: 'adm.sort' }, { k: 'active', label: 'adm.active', render: (r) => yes(r, 'active') }],
    prepare: (d) => { d.image = cleanImg(d.image) || null; d.bg = /^#[0-9a-f]{3,6}$/i.test(d.bg || '') ? d.bg : null; return null; },
    after: invalidateContent,
  },
  sections: {
    table: 'sections', title: 'adm.sections', order: 'sort, id', hint: 'adm.hint.sections',
    fields: [
      { k: 'title_en', label: 'adm.f.title_en', dir: 'ltr', req: 1 }, { k: 'title_ar', label: 'adm.f.title_ar', dir: 'rtl', req: 1 },
      { k: 'source', label: 'adm.f.source', type: 'select', options: () => [['bestseller', 'nav.bestsellers'], ['new', 'nav.new'], ['sale', 'nav.offers'], ['featured', 'adm.featured'], ['limited', 'badge.limited']].map(([v, l]) => ({ v, l: 'adm.src.' + v })).concat(A.flatCats(cats().roots).map((c) => ({ v: 'cat:' + cats().byId.get(c.id).slug, l: c.label }))) },
      { k: 'limit_n', label: 'adm.f.limit', type: 'number', def: 12 }, { k: 'sort', label: 'adm.sort', type: 'number', def: 0 }, { k: 'active', label: 'adm.active', type: 'bool', def: 1 },
    ],
    cols: [{ k: 'title', label: 'adm.f.title', render: (r, ctx) => html`<a href="/admin/r/sections/${r.id}">${ctx.L(r, 'title')}</a>` }, { k: 'source', label: 'adm.f.source' }, { k: 'limit_n', label: 'adm.f.limit' }, { k: 'sort', label: 'adm.sort' }, { k: 'active', label: 'adm.active', render: (r) => yes(r, 'active') }],
    prepare: (d) => { d.limit_n = Math.min(48, Math.max(1, int(d.limit_n, 12))); return null; },
    after: invalidateContent,
  },
  pages: {
    table: 'pages', title: 'adm.pages', order: 'sort, id', hint: 'adm.hint.pages',
    fields: [
      { k: 'title_en', label: 'adm.f.title_en', req: 1, dir: 'ltr' }, { k: 'title_ar', label: 'adm.f.title_ar', req: 1, dir: 'rtl' },
      { k: 'slug', label: 'adm.f.slug', dir: 'ltr', ph: 'adm.auto' }, { k: 'sort', label: 'adm.sort', type: 'number', def: 0 },
      { k: 'body_en', label: 'adm.f.body_en', type: 'textarea', rows: 12, dir: 'ltr', wide: 1, hint: 'adm.rich_hint' }, { k: 'body_ar', label: 'adm.f.body_ar', type: 'textarea', rows: 12, dir: 'rtl', wide: 1 },
      { k: 'footer', label: 'adm.f.in_footer', type: 'bool', def: 1 }, { k: 'menu', label: 'adm.f.in_menu', type: 'bool', def: 0 }, { k: 'active', label: 'adm.active', type: 'bool', def: 1 },
    ],
    cols: [{ k: 'title', label: 'adm.f.title', render: (r, ctx) => html`<a href="/admin/r/pages/${r.id}">${ctx.L(r, 'title')}</a>` }, { k: 'slug', label: 'adm.f.slug', render: (r, ctx) => html`<a href="/${ctx.lang}/page/${r.slug}" target="_blank">/page/${r.slug}</a>` }, { k: 'footer', label: 'adm.f.in_footer', render: (r) => yes(r, 'footer') }, { k: 'menu', label: 'adm.f.in_menu', render: (r) => yes(r, 'menu') }, { k: 'active', label: 'adm.active', render: (r) => yes(r, 'active') }],
    prepare: (d) => { d.slug = slugify(d.slug || d.title_en); return null; },
    after: invalidateContent,
  },
};

function readFields(def, body) {
  const d = {};
  for (const f of def.fields) {
    const v = body[f.k];
    if (f.type === 'bool') d[f.k] = v ? 1 : 0;
    else if (f.type === 'number') d[f.k] = v === '' || v == null ? (f.def !== undefined ? f.def : null) : num(v);
    else if (f.type === 'image') d[f.k] = cleanImg(v) || null;
    else d[f.k] = str(v, f.type === 'textarea' ? 20000 : 500);
  }
  return d;
}

// ---------- products ----------
function productForm(id) {
  if (id === 'new') return { active: 1, price: '', stock: 0, images: [], variants: [], catIds: [], sort: 0 };
  const p = one('SELECT * FROM products WHERE id = ?', +id);
  if (!p) throw new HttpError(404);
  hydrate([p]);
  p.catIds = all('SELECT category_id FROM product_categories WHERE product_id = ?', p.id).map((r) => r.category_id);
  return p;
}
const uniqueSlug = (slug, id) => { let s = slug, i = 2; while (one('SELECT 1 FROM products WHERE slug = ? AND id <> ?', s, id || 0)) s = `${slug}-${i++}`; return s; };
const allCatTree = () => { // include inactive categories in admin
  const rows = all('SELECT * FROM categories ORDER BY sort, id').map((c) => ({ ...c, children: [] }));
  const by = new Map(rows.map((c) => [c.id, c])), roots = [];
  for (const c of rows) (c.parent_id && by.has(c.parent_id) ? by.get(c.parent_id).children : roots).push(c);
  return roots;
};

function saveProduct(id, b) {
  const d = {
    name_en: str(b.name_en, 200), name_ar: str(b.name_ar, 200), short_en: str(b.short_en, 300), short_ar: str(b.short_ar, 300),
    desc_en: str(b.desc_en, 20000), desc_ar: str(b.desc_ar, 20000), howto_en: str(b.howto_en, 5000), howto_ar: str(b.howto_ar, 5000), ingredients: str(b.ingredients, 5000),
    sku: str(b.sku, 60) || null, price: Math.max(0, num(b.price)), sale_price: b.sale_price === '' || b.sale_price == null ? null : Math.max(0, num(b.sale_price)),
    stock: int(b.stock), sort: int(b.sort), active: b.active ? 1 : 0, is_new: b.is_new ? 1 : 0, is_bestseller: b.is_bestseller ? 1 : 0, is_limited: b.is_limited ? 1 : 0, featured: b.featured ? 1 : 0,
    meta_title: str(b.meta_title, 200) || null, meta_desc: str(b.meta_desc, 300) || null, main_cat: int(b.main_cat) || null,
  };
  if (!d.name_en || !d.name_ar) return { error: 'adm.err.names' };
  if (d.sale_price !== null && d.sale_price >= d.price) d.sale_price = null;
  let imgs = [];
  try { imgs = JSON.parse(b.images || '[]'); } catch { /* ignore */ }
  d.images = JSON.stringify(arr(imgs).map(cleanImg).filter(Boolean).slice(0, 20));
  const catIds = arr(b.cats).map(Number).filter((x) => one('SELECT 1 FROM categories WHERE id = ?', x));
  if (d.main_cat && !catIds.includes(d.main_cat)) d.main_cat = null;
  return tx(() => {
    d.slug = uniqueSlug(slugify(str(b.slug, 120) || d.name_en), id === 'new' ? 0 : +id);
    let pid;
    if (id === 'new') pid = insert('products', d);
    else { pid = +id; update('products', pid, { ...d, updated_at: new Date().toISOString().replace('T', ' ').slice(0, 19) }); }
    run('DELETE FROM product_categories WHERE product_id = ?', pid);
    for (const c of catIds) run('INSERT OR IGNORE INTO product_categories (product_id, category_id) VALUES (?, ?)', pid, c);
    // variants (shades)
    const ids = arr(b.v_id), keep = [];
    for (let i = 0; i < ids.length; i++) {
      const v = {
        name_en: str(arr(b.v_name_en)[i], 100), name_ar: str(arr(b.v_name_ar)[i], 100), sku: str(arr(b.v_sku)[i], 60) || null,
        color: /^#[0-9a-f]{6}$/i.test(arr(b.v_color)[i] || '') ? arr(b.v_color)[i] : null, stock: int(arr(b.v_stock)[i]), image: cleanImg(arr(b.v_image)[i]) || null, sort: i,
      };
      if (!v.name_en && !v.name_ar) continue;
      v.name_en ||= v.name_ar; v.name_ar ||= v.name_en;
      if (+ids[i] && one('SELECT 1 FROM variants WHERE id = ? AND product_id = ?', +ids[i], pid)) { update('variants', +ids[i], v); keep.push(+ids[i]); }
      else keep.push(insert('variants', { ...v, product_id: pid }));
    }
    const gone = all('SELECT id FROM variants WHERE product_id = ?', pid).map((r) => r.id).filter((x) => !keep.includes(x));
    for (const vid of gone) { run('DELETE FROM cart_items WHERE variant_id = ?', vid); run('DELETE FROM variants WHERE id = ?', vid); }
    if (keep.length) run('DELETE FROM cart_items WHERE product_id = ? AND variant_id = 0', pid);
    reindex(pid);
    invalidate();
    return { id: pid };
  });
}

const CSV_COLS = ['slug', 'sku', 'name_en', 'name_ar', 'short_en', 'short_ar', 'price', 'sale_price', 'stock', 'categories', 'main_category', 'is_new', 'is_bestseller', 'is_limited', 'featured', 'active', 'images', 'variants', 'desc_en', 'desc_ar', 'howto_en', 'howto_ar', 'ingredients'];

function importCSV(text) {
  const rows = csvParse(text);
  if (!rows.length) return { created: 0, updated: 0, errors: ['Empty file'] };
  const head = rows[0].map((h) => csvClean(h).toLowerCase());
  const res = { created: 0, updated: 0, errors: [] };
  const catBySlug = new Map(all('SELECT id, slug FROM categories').map((c) => [c.slug, c.id]));
  rows.slice(1).forEach((r, i) => {
    const o = Object.fromEntries(head.map((h, j) => [h, csvClean(r[j])]));
    if (!o.name_en && !o.name_ar) return;
    const slug = slugify(o.slug || o.name_en || o.name_ar);
    const existing = one('SELECT id FROM products WHERE slug = ?', slug);
    const b = { ...o, slug, active: o.active === '' || o.active === undefined ? 1 : +o.active, is_new: +o.is_new, is_bestseller: +o.is_bestseller, is_limited: +o.is_limited, featured: +o.featured,
      images: JSON.stringify((o.images || '').split('|').map((x) => x.trim()).filter(Boolean)),
      cats: (o.categories || '').split('|').map((s) => catBySlug.get(s.trim())).filter(Boolean), main_cat: catBySlug.get(o.main_category) || '' };
    const vs = (o.variants || '').split('|').map((x) => x.split('~')).filter((x) => x[0] || x[1]);
    const old = existing ? all('SELECT id, name_en FROM variants WHERE product_id = ?', existing.id) : [];
    Object.assign(b, {
      v_id: vs.map((x) => old.find((ov) => ov.name_en === (x[0] || x[1]))?.id || ''), v_name_en: vs.map((x) => x[0] || ''), v_name_ar: vs.map((x) => x[1] || ''),
      v_color: vs.map((x) => x[2] || ''), v_sku: vs.map((x) => x[3] || ''), v_stock: vs.map((x) => x[4] || '0'), v_image: vs.map((x) => x[5] || ''),
    });
    if (!vs.length && existing) Object.assign(b, { v_id: old.map((x) => x.id), ...variantArrays(existing.id) }); // keep shades if column empty
    try {
      const r2 = saveProduct(existing ? existing.id : 'new', b);
      if (r2.error) res.errors.push(`Row ${i + 2}: missing name`); else existing ? res.updated++ : res.created++;
    } catch (e) { res.errors.push(`Row ${i + 2}: ${e.message}`); }
  });
  return res;
}
function variantArrays(pid) {
  const vs = all('SELECT * FROM variants WHERE product_id = ? ORDER BY sort, id', pid);
  return { v_name_en: vs.map((v) => v.name_en), v_name_ar: vs.map((v) => v.name_ar), v_color: vs.map((v) => v.color || ''), v_sku: vs.map((v) => v.sku || ''), v_stock: vs.map((v) => String(v.stock)), v_image: vs.map((v) => v.image || '') };
}

// ---------- routes ----------
module.exports = (app) => {
  app.get('/admin/lang', (ctx) => {
    ctx.setCookie('alang', ctx.query.to === 'ar' ? 'ar' : 'en', { maxAge: 365 * 86400 });
    let p = '/admin';
    try { p = new URL(ctx.req.headers.referer || '/admin', 'http://x').pathname; } catch { /* keep default */ }
    return ctx.redirect(/^\/admin(\/[\w\-/.]*)?$/.test(p) && !p.startsWith('//') ? p : '/admin'); // local admin paths only
  });
  app.get('/admin/login', (ctx) => (ctx.user?.role === 'admin' ? ctx.redirect('/admin') : A.login(ctx)));
  app.post('/admin/login', async (ctx) => {
    if (limited('alogin:' + ctx.ip, 8, 900e3)) return A.login(ctx, ctx.t('err.too_many'));
    const u = one('SELECT * FROM users WHERE email = ?', str(ctx.body.email, 120).toLowerCase());
    if (!u || u.role !== 'admin' || !(await verifyPassword(String(ctx.body.password || ''), u.password))) return A.login(ctx, ctx.t('acc.bad_login'));
    login(ctx, u);
    const next = String(ctx.body.next || '');
    return ctx.redirect(/^\/admin(\/|$)/.test(next) ? next : '/admin');
  });
  app.post('/admin/logout', (ctx) => { logout(ctx); return ctx.redirect('/admin/login'); });

  // ----- dashboard -----
  app.get('/admin', requireAdmin, (ctx) => {
    const recent30 = all("SELECT total, created_at FROM orders WHERE status <> 'cancelled' AND created_at >= datetime('now', '-31 days')");
    const today = dayKey(new Date());
    const daysAgo = (n) => dayKey(new Date(Date.now() - n * 864e5));
    const agg = (from) => recent30.filter((o) => dayKey(o.created_at) >= from).reduce((a, o) => ({ n: a.n + 1, s: a.s + o.total }), { n: 0, s: 0 });
    const series = Array.from({ length: 14 }, (_, i) => { const k = daysAgo(13 - i); return { k, v: recent30.filter((o) => dayKey(o.created_at) === k).reduce((s, o) => s + o.total, 0) }; });
    const low = +ctx.s.low_stock || 5;
    return A.dashboard(ctx, {
      today: agg(today), week: agg(daysAgo(6)), month: agg(daysAgo(29)), series,
      pending: val("SELECT COUNT(*) FROM orders WHERE status = 'pending'"),
      recent: all('SELECT * FROM orders ORDER BY id DESC LIMIT 8'),
      top: all(`SELECT oi.name, oi.name_ar, SUM(oi.qty) q, SUM(oi.qty * oi.price) s FROM order_items oi JOIN orders o ON o.id = oi.order_id
        WHERE o.status <> 'cancelled' AND o.created_at >= datetime('now', '-30 days') GROUP BY oi.product_id ORDER BY q DESC LIMIT 6`),
      low: all(`SELECT p.id, p.name_en, p.name_ar, COALESCE(v.stock, p.stock) stock, v.name_en vname FROM products p LEFT JOIN variants v ON v.product_id = p.id
        WHERE p.active = 1 AND COALESCE(v.stock, p.stock) <= ? ORDER BY stock LIMIT 12`, low),
      unread: val('SELECT COUNT(*) FROM messages WHERE read = 0'), counts: navCounts(),
      alerts: [
        ctx.s.card_enabled === '1' && ctx.s.card_provider === 'mock' && ['err', 'adm.alert.mock'],
        ctx.s.card_enabled === '1' && ctx.s.card_provider === 'paytabs' && !(ctx.s.paytabs_profile_id && ctx.s.paytabs_server_key) && ['err', 'adm.alert.paytabs'],
        !cfg.BASE_URL && ['info', 'adm.alert.base_url'],
        !smtpConfig() && ['info', 'adm.alert.smtp'],
      ].filter(Boolean),
    });
  });

  // ----- uploads (base64 JSON from admin.js; images are resized in the browser first) -----
  const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg', 'image/avif': 'avif' };
  app.post('/admin/upload', requireAdmin, (ctx) => {
    const m = /^data:([\w/+.-]+);base64,([A-Za-z0-9+/=]+)$/.exec(String(ctx.body.data || ''));
    if (!m || !EXT[m[1]]) return ctx.json({ ok: false, error: 'Unsupported image type' }, 400);
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > 8e6) return ctx.json({ ok: false, error: 'Image too large (max 8MB)' }, 413);
    const sig = buf.subarray(0, 12).toString('hex');
    // SVGs are served with a sandbox CSP anyway; this also rejects active content outright
    const svgText = EXT[m[1]] === 'svg' ? buf.toString('utf8') : '';
    const svgOk = /<svg[\s>]/i.test(svgText.slice(0, 4000)) && !/<\s*(script|foreignObject|iframe|embed|object|handler|animate|set)\b|\bon[a-z]+\s*=|javascript\s*:|&#|data\s*:\s*text\/html|<!ENTITY/i.test(svgText);
    const okMagic = { png: sig.startsWith('89504e47'), jpg: sig.startsWith('ffd8ff'), gif: sig.startsWith('47494638'), webp: sig.startsWith('52494646') && buf.subarray(8, 12).toString() === 'WEBP', avif: buf.subarray(4, 12).toString().includes('ftyp'), svg: svgOk }[EXT[m[1]]];
    if (!okMagic) return ctx.json({ ok: false, error: 'File content does not match its type' }, 400);
    const sub = new Date().toISOString().slice(0, 7);
    const dir = path.join(cfg.UPLOAD_DIR, sub);
    fs.mkdirSync(dir, { recursive: true });
    // web-safe file name: lowercase a-z, 0-9 and dashes only (Arabic or spaced names become "image-…")
    const base = slugify(path.parse(String(ctx.body.name || 'image')).name).replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'image';
    const name = `${base}-${token(4).toLowerCase().replace(/[^a-z0-9]/g, 'x')}.${EXT[m[1]]}`;
    fs.writeFileSync(path.join(dir, name), buf);
    return { ok: true, url: `/uploads/${sub}/${name}` };
  });

  // ----- orders -----
  app.get('/admin/orders', requireAdmin, (ctx) => {
    const status = STATUSES.includes(ctx.query.status) ? ctx.query.status : '';
    const q = str(ctx.query.q, 80);
    const where = [], p = [];
    if (status) { where.push('status = ?'); p.push(status); }
    if (q) { where.push('(number LIKE ? OR name LIKE ? OR phone LIKE ? OR email LIKE ?)'); p.push(...Array(4).fill(`%${q.replace(/[%_]/g, '')}%`)); }
    const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const total = val(`SELECT COUNT(*) FROM orders ${w}`, ...p);
    const per = 30, pages = Math.max(1, Math.ceil(total / per)), page = Math.min(pages, Math.max(1, int(ctx.query.page, 1)));
    const counts = Object.fromEntries(all('SELECT status, COUNT(*) n FROM orders GROUP BY status').map((r) => [r.status, r.n]));
    counts.all = Object.values(counts).reduce((a, b) => a + b, 0);
    return A.orders(ctx, { rows: all(`SELECT * FROM orders ${w} ORDER BY id DESC LIMIT ? OFFSET ?`, ...p, per, (page - 1) * per), total, page, pages, q, status, counts, statuses: STATUSES });
  });
  app.get('/admin/orders/export.csv', requireAdmin, (ctx) => {
    const status = STATUSES.includes(ctx.query.status) ? ctx.query.status : null;
    const rows = all(`SELECT * FROM orders ${status ? 'WHERE status = ?' : ''} ORDER BY id DESC`, ...(status ? [status] : []));
    const items = new Map();
    for (const it of all('SELECT order_id, name, variant, qty FROM order_items')) { if (!items.has(it.order_id)) items.set(it.order_id, []); items.get(it.order_id).push(`${it.qty}x ${it.name}${it.variant ? ' (' + it.variant + ')' : ''}`); }
    csvSend(ctx, `orders-${dayKey(new Date())}.csv`, [['number', 'date', 'status', 'payment_method', 'payment_status', 'name', 'phone', 'email', 'zone', 'city', 'address', 'notes', 'items', 'subtotal', 'discount', 'coupon', 'shipping', 'fee', 'total'],
      ...rows.map((o) => [o.number, fmtDate(o.created_at), o.status, o.payment_method, o.payment_status, o.name, o.phone, o.email, o.zone_name, o.city, o.address, o.notes, (items.get(o.id) || []).join('; '), o.subtotal, o.discount, o.coupon, o.shipping, o.fee, o.total])]);
  });
  const getOrder = (id) => { const o = one('SELECT * FROM orders WHERE id = ?', int(id)); if (!o) throw new HttpError(404); return o; };
  app.get('/admin/orders/:id', requireAdmin, (ctx) => {
    const o = getOrder(ctx.params.id);
    return A.orderDetail(ctx, { o, items: orderItems(o.id), events: orderEvents(o.id), statuses: STATUSES, payStatuses: PAY_STATUSES, customer: o.user_id ? one('SELECT id, name FROM users WHERE id = ?', o.user_id) : null });
  });
  app.get('/admin/orders/:id/invoice', requireAdmin, (ctx) => { const o = getOrder(ctx.params.id); return A.invoice(ctx, { o, items: orderItems(o.id) }); });
  app.post('/admin/orders/:id/status', requireAdmin, (ctx) => {
    const o = getOrder(ctx.params.id);
    const st = String(ctx.body.status);
    const r = setStatus(o.id, st, str(ctx.body.note, 300) || `by ${ctx.user.name}`);
    if (r === 'no_stock') return go(ctx, `/admin/orders/${o.id}`, 'err', ctx.t('adm.err.no_stock'));
    if (r === true && ctx.body.notify) notify.orderStatus(o, st).catch(() => {});
    return go(ctx, `/admin/orders/${o.id}`, 'saved');
  });
  app.post('/admin/orders/:id/payment', requireAdmin, (ctx) => {
    const o = getOrder(ctx.params.id);
    setPayment(o.id, String(ctx.body.payment_status), `by ${ctx.user.name}`);
    return go(ctx, `/admin/orders/${o.id}`, 'saved');
  });
  app.post('/admin/orders/:id/note', requireAdmin, (ctx) => { const o = getOrder(ctx.params.id); run('UPDATE orders SET admin_note = ? WHERE id = ?', str(ctx.body.admin_note, 2000), o.id); return go(ctx, `/admin/orders/${o.id}`, 'saved'); });

  // ----- products -----
  app.get('/admin/products', requireAdmin, (ctx) => {
    const q = str(ctx.query.q, 80), cat = int(ctx.query.cat), status = ctx.query.status;
    const where = [], p = [];
    if (q) { where.push('(search LIKE ? OR sku LIKE ? OR slug LIKE ?)'); p.push(`%${normSearch(q).replace(/[%_]/g, '')}%`, `%${q}%`, `%${q}%`); }
    if (cat) { where.push('id IN (SELECT product_id FROM product_categories WHERE category_id = ?)'); p.push(cat); }
    if (status === 'active') where.push('active = 1');
    if (status === 'hidden') where.push('active = 0');
    if (status === 'low') { where.push('stock <= ?'); p.push(+ctx.s.low_stock || 5); }
    const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const total = val(`SELECT COUNT(*) FROM products ${w}`, ...p);
    const per = 40, pages = Math.max(1, Math.ceil(total / per)), page = Math.min(pages, Math.max(1, int(ctx.query.page, 1)));
    const rows = hydrate(all(`SELECT * FROM products ${w} ORDER BY id DESC LIMIT ? OFFSET ?`, ...p, per, (page - 1) * per));
    return A.products(ctx, { rows, total, page, pages, q, cat, status, catOptions: A.flatCats(allCatTree()) });
  });
  app.get('/admin/products/export.csv', requireAdmin, (ctx) => {
    const catsOf = new Map();
    for (const r of all('SELECT pc.product_id, c.slug FROM product_categories pc JOIN categories c ON c.id = pc.category_id')) { if (!catsOf.has(r.product_id)) catsOf.set(r.product_id, []); catsOf.get(r.product_id).push(r.slug); }
    const slugOf = new Map(all('SELECT id, slug FROM categories').map((c) => [c.id, c.slug]));
    const rows = hydrate(all('SELECT * FROM products ORDER BY id'));
    csvSend(ctx, `products-${dayKey(new Date())}.csv`, [CSV_COLS, ...rows.map((p) => [p.slug, p.sku, p.name_en, p.name_ar, p.short_en, p.short_ar, p.price, p.sale_price ?? '', p.stock, (catsOf.get(p.id) || []).join('|'), slugOf.get(p.main_cat) || '',
      p.is_new, p.is_bestseller, p.is_limited, p.featured, p.active, p.images.join('|'), p.variants.map((v) => [v.name_en, v.name_ar, v.color || '', v.sku || '', v.stock, v.image || ''].join('~')).join('|'),
      p.desc_en, p.desc_ar, p.howto_en, p.howto_ar, p.ingredients])]);
  });
  app.get('/admin/products/import', requireAdmin, (ctx) => A.importPage(ctx));
  app.post('/admin/products/import', requireAdmin, (ctx) => A.importPage(ctx, importCSV(String(ctx.body.csv || ''))));
  app.get('/admin/products/:id', requireAdmin, (ctx) => A.productForm(ctx, { p: productForm(ctx.params.id), catTree: allCatTree() }));
  app.post('/admin/products/:id', requireAdmin, (ctx) => {
    const id = ctx.params.id === 'new' ? 'new' : int(ctx.params.id);
    if (id !== 'new' && !one('SELECT 1 FROM products WHERE id = ?', id)) throw new HttpError(404);
    const r = saveProduct(id, ctx.body);
    if (r.error) return A.productForm(ctx, { p: { ...ctx.body, id: id === 'new' ? null : id, images: [], variants: [], catIds: arr(ctx.body.cats).map(Number) }, catTree: allCatTree(), error: ctx.t(r.error) });
    return go(ctx, `/admin/products/${r.id}`, 'saved');
  });
  app.post('/admin/products/:id/delete', requireAdmin, (ctx) => {
    tx(() => { run('DELETE FROM cart_items WHERE product_id = ?', int(ctx.params.id)); run('DELETE FROM products WHERE id = ?', int(ctx.params.id)); });
    invalidate();
    return go(ctx, '/admin/products', 'deleted');
  });
  app.post('/admin/products/:id/duplicate', requireAdmin, (ctx) => {
    const p = productForm(ctx.params.id);
    const r = saveProduct('new', { ...p, slug: p.slug + '-copy', active: 0, images: JSON.stringify(p.images), cats: p.catIds, sku: p.sku ? p.sku + '-COPY' : '',
      name_en: p.name_en + ' (copy)', name_ar: p.name_ar + ' (نسخة)', v_id: p.variants.map(() => ''), ...variantArrays(p.id) });
    return go(ctx, `/admin/products/${r.id}`, 'saved');
  });

  // ----- generic resources -----
  const resDef = (ctx) => { if (!Object.hasOwn(RES, ctx.params.res)) throw new HttpError(404); return RES[ctx.params.res]; };
  app.get('/admin/r/:res', requireAdmin, (ctx) => { const def = resDef(ctx); return A.resList(ctx, { res: ctx.params.res, def, rows: def.list ? def.list() : all(`SELECT * FROM ${def.table} ORDER BY ${def.order}`) }); });
  app.get('/admin/r/:res/:id', requireAdmin, (ctx) => {
    const def = resDef(ctx);
    const row = ctx.params.id === 'new' ? {} : one(`SELECT * FROM ${def.table} WHERE id = ?`, int(ctx.params.id));
    if (!row) throw new HttpError(404);
    return A.resForm(ctx, { res: ctx.params.res, def, row });
  });
  app.post('/admin/r/:res/:id', requireAdmin, (ctx) => {
    const def = resDef(ctx), res = ctx.params.res, isNew = ctx.params.id === 'new', id = isNew ? null : int(ctx.params.id);
    const d = readFields(def, ctx.body);
    const missing = def.fields.find((f) => f.req && (d[f.k] === '' || d[f.k] == null));
    const err = missing ? ctx.t('err.required') + ': ' + ctx.t(missing.label) : def.prepare ? def.prepare(d, id) : null;
    if (err) return A.resForm(ctx, { res, def, row: { ...d, id }, error: err.startsWith('adm.') ? ctx.t(err) : err });
    try {
      const newId = isNew ? insert(def.table, d) : (update(def.table, id, d), id);
      def.after?.();
      return go(ctx, `/admin/r/${res}/${newId}`, 'saved');
    } catch (e) {
      if (/UNIQUE/.test(e.message)) return A.resForm(ctx, { res, def, row: { ...d, id }, error: ctx.t('adm.err.unique') });
      throw e;
    }
  });
  app.post('/admin/r/:res/:id/delete', requireAdmin, (ctx) => {
    const def = resDef(ctx);
    run(`DELETE FROM ${def.table} WHERE id = ?`, int(ctx.params.id));
    def.after?.();
    return go(ctx, `/admin/r/${ctx.params.res}`, 'deleted');
  });

  // ----- customers -----
  app.get('/admin/customers', requireAdmin, (ctx) => {
    const q = str(ctx.query.q, 80);
    const w = q ? 'WHERE u.name LIKE ? OR u.email LIKE ? OR u.phone LIKE ?' : '';
    const p = q ? Array(3).fill(`%${q.replace(/[%_]/g, '')}%`) : [];
    const total = val(`SELECT COUNT(*) FROM users u ${w}`, ...p);
    const per = 50, pages = Math.max(1, Math.ceil(total / per)), page = Math.min(pages, Math.max(1, int(ctx.query.page, 1)));
    const rows = all(`SELECT u.*, (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id) orders, (SELECT COALESCE(SUM(total), 0) FROM orders o WHERE o.user_id = u.id AND o.status <> 'cancelled') spent
      FROM users u ${w} ORDER BY u.id DESC LIMIT ? OFFSET ?`, ...p, per, (page - 1) * per);
    return A.customers(ctx, { rows, q, total, page, pages });
  });
  app.get('/admin/customers/export.csv', requireAdmin, (ctx) => csvSend(ctx, 'customers.csv', [['name', 'email', 'phone', 'city', 'address', 'newsletter', 'joined'], ...all('SELECT * FROM users ORDER BY id').map((u) => [u.name, u.email, u.phone, u.city, u.address, u.newsletter, fmtDate(u.created_at)])]));
  const getUser = (id) => { const u = one('SELECT * FROM users WHERE id = ?', int(id)); if (!u) throw new HttpError(404); return u; };
  app.get('/admin/customers/:id', requireAdmin, (ctx) => { const u = getUser(ctx.params.id); return A.customer(ctx, { u, orders: all('SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC', u.id) }); });
  app.post('/admin/customers/:id/role', requireAdmin, (ctx) => {
    const u = getUser(ctx.params.id);
    if (u.id !== ctx.user.id) run('UPDATE users SET role = ? WHERE id = ?', ctx.body.role === 'admin' ? 'admin' : 'customer', u.id);
    return go(ctx, `/admin/customers/${u.id}`, 'saved');
  });
  app.post('/admin/customers/:id/password', requireAdmin, async (ctx) => {
    const u = getUser(ctx.params.id);
    const pw = String(ctx.body.password || '');
    if (pw.length < 8) return go(ctx, `/admin/customers/${u.id}`, 'err', ctx.t('acc.password_hint'));
    run('UPDATE users SET password = ? WHERE id = ?', await hashPassword(pw), u.id);
    run('DELETE FROM sessions WHERE user_id = ?', u.id);
    return go(ctx, `/admin/customers/${u.id}`, 'saved');
  });
  app.post('/admin/customers/:id/delete', requireAdmin, (ctx) => {
    const u = getUser(ctx.params.id);
    if (u.id === ctx.user.id) return go(ctx, `/admin/customers/${u.id}`, 'err');
    tx(() => { run('UPDATE orders SET user_id = NULL WHERE user_id = ?', u.id); run('DELETE FROM sessions WHERE user_id = ?', u.id); run("DELETE FROM cart_items WHERE owner = ?", 'u:' + u.id); run("DELETE FROM wishlist WHERE owner = ?", 'u:' + u.id); run('DELETE FROM users WHERE id = ?', u.id); });
    return go(ctx, '/admin/customers', 'deleted');
  });

  // ----- messages & subscribers -----
  app.get('/admin/messages', requireAdmin, (ctx) => A.messages(ctx, all('SELECT * FROM messages ORDER BY id DESC LIMIT 300')));
  app.post('/admin/messages/:id/read', requireAdmin, (ctx) => { run('UPDATE messages SET read = 1 WHERE id = ?', int(ctx.params.id)); return ctx.redirect('/admin/messages'); });
  app.post('/admin/messages/:id/delete', requireAdmin, (ctx) => { run('DELETE FROM messages WHERE id = ?', int(ctx.params.id)); return go(ctx, '/admin/messages', 'deleted'); });
  app.get('/admin/subscribers', requireAdmin, (ctx) => A.subscribers(ctx, all('SELECT * FROM subscribers ORDER BY id DESC')));
  app.get('/admin/subscribers/export.csv', requireAdmin, (ctx) => csvSend(ctx, 'subscribers.csv', [['email', 'lang', 'date'], ...all('SELECT * FROM subscribers ORDER BY id').map((s) => [s.email, s.lang, fmtDate(s.created_at)])]));
  app.post('/admin/subscribers/:id/delete', requireAdmin, (ctx) => { run('DELETE FROM subscribers WHERE id = ?', int(ctx.params.id)); return go(ctx, '/admin/subscribers', 'deleted'); });

  // ----- settings -----
  const SECRETS = ['paytabs_server_key', 'smtp_pass', 'telegram_token'];
  app.get('/admin/settings', requireAdmin, (ctx) => A.settings(ctx, { s: settings(), smtpEnv: !!cfg.SMTP_URL }));
  app.post('/admin/settings', requireAdmin, (ctx) => {
    const d = {};
    for (const k of Object.keys(DEFAULTS)) {
      if (!(k in ctx.body)) continue;
      let v = Array.isArray(ctx.body[k]) ? ctx.body[k][ctx.body[k].length - 1] : ctx.body[k];
      v = String(v ?? '').slice(0, 5000);
      if (SECRETS.includes(k) && !v.trim()) continue; // blank = keep existing secret
      if (k === 'logo') v = cleanImg(v);
      if (k === 'promo_ends') v = zonedToUtc(v);
      if (k.startsWith('theme_') && !/^#[0-9a-f]{6}$/i.test(v.trim())) continue; // colours: hex only
      if (/_enabled$/.test(k)) v = v === '1' ? '1' : '0';
      d[k] = v.trim();
    }
    if (d.whatsapp) d.whatsapp = d.whatsapp.replace(/\D/g, '');
    if (d.paytabs_currency) d.paytabs_currency = d.paytabs_currency.toUpperCase();
    saveSettings(d);
    invalidate(); invalidateContent();
    return go(ctx, '/admin/settings', 'saved');
  });
  app.post('/admin/settings/test-email', requireAdmin, async (ctx) => {
    const to = settings().notify_email || settings().email || ctx.user.email;
    if (!smtpConfig()) return go(ctx, '/admin/settings', 'err', 'SMTP not configured');
    try { await sendMail({ to, subject: 'Test email ✔', html: '<p>Your store email settings work.</p>' }); return go(ctx, '/admin/settings', 'sent', to); }
    catch (e) { return go(ctx, '/admin/settings', 'err', e.message.slice(0, 200)); }
  });
  app.post('/admin/settings/test-telegram', requireAdmin, async (ctx) => {
    try { const ok = await notify.telegram('✅ Test message from your store'); return go(ctx, '/admin/settings', ok ? 'sent' : 'err', ok ? 'Telegram' : 'Telegram not configured'); }
    catch (e) { return go(ctx, '/admin/settings', 'err', e.message.slice(0, 200)); }
  });

  // Consistent copy of the live database (safe while the store is running)
  app.get('/admin/backup', requireAdmin, (ctx) => {
    const file = path.join(os.tmpdir(), `store-backup-${Date.now()}.db`);
    db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
    const buf = fs.readFileSync(file);
    fs.unlinkSync(file);
    ctx.headers['Content-Disposition'] = `attachment; filename="store-${dayKey(new Date())}.db"`;
    return ctx.send(buf, 200, 'application/octet-stream');
  });
};

module.exports.saveProduct = saveProduct; // used by the seed script
