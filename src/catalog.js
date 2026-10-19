'use strict';
// Catalog: category tree (cached), pricing, product listing/search.
const { one, all, run, val, settings } = require('./db');
const { safeJSON, normSearch, round2 } = require('./util');

// ---------- categories ----------
let tree = null;
function cats() {
  if (tree) return tree;
  const rows = all('SELECT * FROM categories WHERE active = 1 ORDER BY sort, id');
  const byId = new Map(rows.map((c) => [c.id, { ...c, children: [] }]));
  const roots = [];
  for (const c of byId.values()) (c.parent_id && byId.has(c.parent_id) ? byId.get(c.parent_id).children : roots).push(c);
  const direct = new Map(all(`SELECT pc.category_id id, COUNT(*) n FROM product_categories pc
    JOIN products p ON p.id = pc.product_id AND p.active = 1 GROUP BY pc.category_id`).map((r) => [r.id, r.n]));
  const count = (c) => (c.count = (direct.get(c.id) || 0) + c.children.reduce((s, ch) => s + count(ch), 0));
  roots.forEach(count);
  const bySlug = new Map([...byId.values()].map((c) => [c.slug, c]));
  const flags = one(`SELECT COALESCE(SUM(is_bestseller), 0) bestseller, COALESCE(SUM(is_new), 0) new,
    COALESCE(SUM(${priceSQL()} < p.price), 0) sale FROM products p WHERE p.active = 1`);
  return (tree = { roots, byId, bySlug, flags });
}
const invalidate = () => { tree = null; };
const descendantIds = (c) => [c.id, ...c.children.flatMap(descendantIds)];
function trail(c) {
  const t = [], { byId } = cats();
  for (let x = c; x; x = x.parent_id ? byId.get(x.parent_id) : null) t.unshift(x);
  return t;
}

// ---------- pricing ----------
function priceInfo(p) {
  const reg = +p.price || 0;
  let price = p.sale_price > 0 && p.sale_price < reg ? +p.sale_price : reg;
  const d = +settings().sitewide_discount || 0;
  if (d > 0 && d < 100) price = Math.min(price, round2(reg * (1 - d / 100)));
  return { price: round2(price), regular: reg, off: price < reg && reg > 0 ? Math.round((1 - price / reg) * 100) : 0 };
}
function priceSQL() {
  const base = 'CASE WHEN p.sale_price > 0 AND p.sale_price < p.price THEN p.sale_price ELSE p.price END';
  const d = +settings().sitewide_discount || 0;
  return d > 0 && d < 100 ? `MIN(${base}, ROUND(p.price * ${(1 - d / 100).toFixed(4)}, 2))` : base;
}

// Attach parsed images, variants and price info to product rows.
function hydrate(list) {
  if (!list.length) return list;
  const ids = list.map((p) => p.id);
  const vs = all(`SELECT * FROM variants WHERE product_id IN (${ids.map(() => '?').join(',')}) ORDER BY sort, id`, ...ids);
  const by = new Map();
  for (const v of vs) { if (!by.has(v.product_id)) by.set(v.product_id, []); by.get(v.product_id).push(v); }
  for (const p of list) {
    p.images = Array.isArray(p.images) ? p.images : safeJSON(p.images, []);
    p.variants = by.get(p.id) || [];
    p.pi = priceInfo(p);
  }
  return list;
}

// ---------- listing ----------
const SORTS = ['featured', 'new', 'best', 'price_asc', 'price_desc'];
function listProducts({ catIds, flag, q, min, max, sort, page = 1, per = 24, inStock, onSale, excludeId } = {}) {
  const P = priceSQL();
  const where = ['p.active = 1'], params = [];
  if (catIds?.length) {
    where.push(`p.id IN (SELECT product_id FROM product_categories WHERE category_id IN (${catIds.map(() => '?').join(',')}))`);
    params.push(...catIds);
  }
  if (flag === 'new') where.push('p.is_new = 1');
  if (flag === 'bestseller') where.push('p.is_bestseller = 1');
  if (flag === 'featured') where.push('p.featured = 1');
  if (flag === 'limited') where.push('p.is_limited = 1');
  if (flag === 'sale' || onSale) where.push(`${P} < p.price`);
  if (excludeId) { where.push('p.id <> ?'); params.push(excludeId); }
  if (q) for (const w of normSearch(q).replace(/[%_\\]/g, '').split(' ').filter(Boolean).slice(0, 6)) { where.push('p.search LIKE ?'); params.push(`%${w}%`); }
  if (inStock) where.push('p.stock > 0');
  const boundsWhere = where.join(' AND '), boundsParams = [...params];
  if (min > 0) { where.push(`${P} >= ?`); params.push(+min); }
  if (max > 0) { where.push(`${P} <= ?`); params.push(+max); }
  const ORDERS = {
    new: 'p.created_at DESC, p.id DESC', best: 'p.sold DESC, p.id DESC',
    price_asc: `${P} ASC, p.id`, price_desc: `${P} DESC, p.id`,
  };
  const order = Object.hasOwn(ORDERS, sort) ? ORDERS[sort] : flag === 'bestseller' ? 'p.sold DESC, p.sort, p.id' : 'p.featured DESC, p.sort, p.id DESC';
  const w = where.join(' AND ');
  const total = val(`SELECT COUNT(*) FROM products p WHERE ${w}`, ...params) || 0;
  per = Math.min(Math.max(1, per), 96);
  const pages = Math.max(1, Math.ceil(total / per));
  page = Math.min(Math.max(1, page), pages);
  const rows = all(`SELECT p.* FROM products p WHERE ${w} ORDER BY (p.stock <= 0), ${order} LIMIT ? OFFSET ?`, ...params, per, (page - 1) * per);
  const b = one(`SELECT MIN(${P}) lo, MAX(${P}) hi FROM products p WHERE ${boundsWhere}`, ...boundsParams) || {};
  return { items: hydrate(rows), total, page, pages, per, bounds: { lo: Math.floor(b.lo || 0), hi: Math.ceil(b.hi || 0) } };
}

function sectionProducts(source, limit = 12) {
  if (source.startsWith('cat:')) {
    const c = cats().bySlug.get(source.slice(4));
    return c ? listProducts({ catIds: descendantIds(c), per: limit, sort: 'best' }).items : [];
  }
  const map = { bestseller: { flag: 'bestseller' }, new: { flag: 'new', sort: 'new' }, sale: { flag: 'sale' }, featured: { flag: 'featured' }, limited: { flag: 'limited' } };
  return listProducts({ ...(map[source] || {}), per: limit }).items;
}

function productBySlug(slug, { includeInactive = false } = {}) {
  const p = one(`SELECT * FROM products WHERE slug = ? ${includeInactive ? '' : 'AND active = 1'}`, slug);
  if (!p) return null;
  hydrate([p]);
  p.catIds = all('SELECT category_id FROM product_categories WHERE product_id = ?', p.id).map((r) => r.category_id);
  return p;
}
function mainCategory(p) {
  const { byId } = cats();
  if (p.main_cat && byId.has(p.main_cat)) return byId.get(p.main_cat);
  const c = (p.catIds || []).map((id) => byId.get(id)).filter(Boolean).sort((a, b) => trail(b).length - trail(a).length)[0];
  return c || null;
}
function related(p, limit = 12) {
  const c = mainCategory(p);
  let items = c ? listProducts({ catIds: [c.id], per: limit, sort: 'best', excludeId: p.id }).items : [];
  if (items.length < 4) items = items.concat(listProducts({ flag: 'bestseller', per: limit, excludeId: p.id }).items.filter((x) => !items.some((y) => y.id === x.id))).slice(0, limit);
  return items;
}
function productsByIds(ids) {
  if (!ids.length) return [];
  const rows = all(`SELECT * FROM products WHERE active = 1 AND id IN (${ids.map(() => '?').join(',')})`, ...ids);
  return hydrate(rows);
}

// Search text includes names (both languages), category names, shade names and SKUs.
function reindex(id) {
  const p = one('SELECT * FROM products WHERE id = ?', id);
  if (!p) return;
  const vs = all('SELECT name_en, name_ar, sku, stock FROM variants WHERE product_id = ?', id);
  const cs = all('SELECT c.name_en, c.name_ar FROM categories c JOIN product_categories pc ON pc.category_id = c.id WHERE pc.product_id = ?', id);
  const text = normSearch([p.name_en, p.name_ar, p.short_en, p.short_ar, p.sku, ...vs.flatMap((v) => [v.name_en, v.name_ar, v.sku]), ...cs.flatMap((c) => [c.name_en, c.name_ar])].filter(Boolean).join(' '));
  const stock = vs.length ? vs.reduce((s, v) => s + Math.max(0, v.stock), 0) : p.stock;
  run('UPDATE products SET search = ?, stock = ? WHERE id = ?', text, stock, id);
}
const syncStock = (id) => run(`UPDATE products SET stock = (SELECT COALESCE(SUM(MAX(stock, 0)), 0) FROM variants WHERE product_id = ?)
  WHERE id = ? AND EXISTS (SELECT 1 FROM variants WHERE product_id = ?)`, id, id, id);

module.exports = { cats, invalidate, descendantIds, trail, priceInfo, hydrate, listProducts, sectionProducts, productBySlug, mainCategory, related, productsByIds, reindex, syncStock, SORTS };
