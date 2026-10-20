'use strict';
// PDF invoice for an order, in Arabic (right-to-left) or English. Used for downloads and email attachments.
const fs = require('node:fs');
const path = require('node:path');
const cfg = require('./config');
const { all, settings } = require('./db');
const { PDF } = require('./pdf');
const { tr, loc } = require('./i18n');
const { money, fmtDate, round2 } = require('./util');

const FONTS = { R: path.join(cfg.ROOT, 'fonts', 'dejavu-sans.ttf'), B: path.join(cfg.ROOT, 'fonts', 'dejavu-sans-bold.ttf') };
const INK = '#000000', GREY = '#666666', LINE = '#d6d6d6', SOFT = '#f3f3f3', RED = '#c62828';

// Store logo from Admin → Settings (PNG or JPG; other formats fall back to the store name)
function logoBytes(url) {
  const u = String(url || '');
  if (u.includes('..')) return null;
  const file = u.startsWith('/uploads/') ? path.join(cfg.UPLOAD_DIR, u.slice(9)) : u.startsWith('/assets/') ? path.join(cfg.ROOT, 'public', u.slice(8)) : null;
  try { return file ? fs.readFileSync(file) : null; } catch { return null; }
}
// text typed by customers: no control characters or emoji (the PDF font has no emoji)
const clean = (s) => String(s ?? '').replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u061c\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, '').replace(/[\u{10000}-\u{10ffff}]/gu, '').replace(/[ \t]+/g, ' ').trim();
const fileName = (o) => `invoice-${String(o.number || o.id).replace(/[^A-Za-z0-9-]/g, '-')}.pdf`;

function invoicePDF(o, langIn) {
  const lang = langIn === 'en' || langIn === 'ar' ? langIn : o.lang === 'en' ? 'en' : 'ar';
  const s = settings();
  const t = (k, v) => tr(lang, k, v);
  const m = (n) => money(n, s.currency_symbol);
  const rtl = lang === 'ar', D = rtl ? 'rtl' : 'ltr';
  const items = all('SELECT * FROM order_items WHERE order_id = ? ORDER BY id', o.id);
  const store = loc(s, 'store_name', lang);
  const title = loc(s, 'invoice_title', lang) || t('inv.title');
  const doc = new PDF({ fonts: FONTS, rtl, title: `${title} ${o.number} — ${store}` });
  const M = 40, CW = doc.W - 2 * M, BOTTOM = doc.H - 64;
  // x is measured from the side where reading starts (left in English, right in Arabic)
  const X = (x, w) => (rtl ? M + CW - x - w : M + x);
  const text = (str, x, y, w, opt = {}) => doc.text(clean(str), X(x, w), y, { width: w, dir: D, ...opt });
  const lines = (str, w, font = 'R', size = 9) => doc.wrap(clean(str), w, font, size).filter((l, i, a) => l || a.length === 1);
  const pick = (en, ar) => (rtl ? ar || en : en || ar) || '';
  const zone = () => { const [en, ar] = String(o.zone_name || '').split(' / '); return pick(en, ar); };

  // ---------- header ----------
  doc.addPage();
  let y = M;
  const logo = logoBytes(s.logo);
  const drawn = logo && doc.image(logo, X(0, 200), y, 200, 54);
  let ly = drawn ? y + drawn[1] + 14 : y + 18;
  if (!drawn) text(store, 0, ly, 300, { font: 'B', size: 18 });
  ly += drawn ? 0 : 16;
  const storeLines = [s.company_name, loc(s, 'address', lang), [s.phone, s.email].filter(Boolean).join('  ·  '), cfg.BASE_URL.replace(/^https?:\/\//, ''), s.tax_id ? `${t('inv.tax_id')}: ${s.tax_id}` : '']
    .filter(Boolean);
  for (const l of storeLines) { text(l, 0, ly, 300, { size: 8.5, color: GREY, dir: 'auto' }); ly += 12; }

  text(title.toUpperCase(), CW - 230, y + 18, 230, { font: 'B', size: 22, align: 'end' });
  const meta = [
    [t('inv.number'), o.number, 'ltr'], [t('order.date'), fmtDate(o.created_at), 'ltr'],
    [t('order.status'), t('status.' + o.status)], [t('order.payment'), t(o.payment_method === 'card' ? 'pay.card' : 'pay.cod')],
    [t('inv.pay_status'), t('paystatus.' + o.payment_status)],
  ];
  let my = y + 40;
  for (const [k, v, dir] of meta) {
    text(k, CW - 230, my, 100, { size: 8.5, color: GREY });
    text(v, CW - 130, my, 130, { size: 9, font: 'B', align: 'end', dir: dir || D, color: v === t('status.cancelled') ? RED : INK });
    my += 13;
  }
  y = Math.max(ly, my) + 8;
  doc.line(M, y, M + CW, y, INK, 1);
  y += 16;

  // ---------- customer + delivery ----------
  const colW = (CW - 20) / 2;
  const block = (x, head, rows) => {
    let by = y;
    text(head.toUpperCase(), x, by, colW, { font: 'B', size: 8, color: GREY });
    by += 14;
    rows.filter(Boolean).forEach(([str, opt = {}]) => {
      for (const l of lines(str, colW, opt.font || 'R', 9.5)) { text(l, x, by, colW, { size: 9.5, dir: 'auto', ...opt }); by += 13; }
    });
    return by;
  };
  const b1 = block(0, t('inv.bill_to'), [[o.name, { font: 'B' }], [o.phone, { dir: 'ltr' }], o.email && [o.email, { dir: 'ltr' }]]);
  const b2 = block(colW + 20, t('order.delivery_to'), [[o.address], [[o.city, zone()].filter(Boolean).join(' — ')]]);
  y = Math.max(b1, b2) + 12;

  // ---------- items ----------
  const cols = [ // [key, width, align]
    ['#', 22, 'center'], ['item', 0, 'start'], ['sku', 80, 'start'], ['qty', 38, 'center'], ['unit', 72, 'end'], ['total', 78, 'end'],
  ];
  cols[1][1] = CW - cols.reduce((a, c) => a + c[1], 0);
  const colX = []; cols.reduce((x, c, i) => { colX[i] = x; return x + c[1]; }, 0);
  const PAD = 6;
  const heads = ['#', t('inv.item'), t('inv.sku'), t('inv.qty'), t('inv.unit'), t('cart.total')];
  const tableHead = () => {
    doc.rect(M, y, CW, 20, { fill: INK });
    cols.forEach((c, i) => text(heads[i], colX[i] + PAD, y + 13.5, c[1] - 2 * PAD, { font: 'B', size: 8, color: '#ffffff', align: c[2] }));
    y += 20;
  };
  const newPage = () => {
    doc.addPage();
    y = M;
    text(store, 0, y + 10, 300, { font: 'B', size: 11 });
    text(`${title} ${o.number}`, CW - 260, y + 10, 260, { size: 9, color: GREY, align: 'end', dir: 'auto' });
    y += 24;
    doc.line(M, y, M + CW, y, LINE);
    y += 12;
  };
  tableHead();
  items.forEach((it, n) => {
    const name = rtl ? it.name_ar || it.name : it.name || it.name_ar;
    const variant = rtl ? it.variant_ar || it.variant : it.variant || it.variant_ar;
    const nameLines = lines(name, cols[1][1] - 2 * PAD, 'R', 9.5).slice(0, 4);
    const h = 10 + nameLines.length * 12.5 + (variant ? 11 : 0) + 4;
    if (y + h > BOTTOM - 20) { newPage(); tableHead(); }
    if (n % 2) doc.rect(M, y, CW, h, { fill: SOFT });
    const base = y + 15;
    text(String(n + 1), colX[0] + PAD, base, cols[0][1] - 2 * PAD, { size: 9, color: GREY, align: 'center' });
    nameLines.forEach((l, i) => text(l, colX[1] + PAD, base + i * 12.5, cols[1][1] - 2 * PAD, { size: 9.5 }));
    if (variant) text(`${t('pdp.shade')}: ${variant}`, colX[1] + PAD, base + nameLines.length * 12.5, cols[1][1] - 2 * PAD, { size: 8, color: GREY });
    text(it.sku || '—', colX[2] + PAD, base, cols[2][1] - 2 * PAD, { size: 8, color: GREY, dir: 'ltr' });
    text(String(it.qty), colX[3] + PAD, base, cols[3][1] - 2 * PAD, { size: 9.5, align: 'center' });
    text(m(it.price), colX[4] + PAD, base, cols[4][1] - 2 * PAD, { size: 9.5, align: 'end' });
    text(m(it.price * it.qty), colX[5] + PAD, base, cols[5][1] - 2 * PAD, { size: 9.5, font: 'B', align: 'end' });
    y += h;
  });
  doc.line(M, y, M + CW, y, LINE);
  y += 14;

  // ---------- totals (end side) + payment details (start side) ----------
  const vat = Math.max(0, Math.min(100, +s.vat_rate || 0));
  const rows = [
    [t('cart.subtotal'), m(o.subtotal)],
    o.discount ? [t('cart.discount') + (o.coupon ? ` (${o.coupon})` : ''), '-' + m(o.discount)] : null,
    [t('cart.shipping'), o.shipping ? m(o.shipping) : t('co.free')],
    o.fee ? [t('pay.cod_fee_label'), m(o.fee)] : null,
  ].filter(Boolean);
  const paid = o.payment_status === 'paid';
  const payLines = [
    `${t('order.payment')}: ${t(o.payment_method === 'card' ? 'pay.card' : 'pay.cod')}`,
    paid ? `${t('paystatus.paid')} — ${t('inv.thank_paid')}` : o.payment_status === 'refunded' ? t('paystatus.refunded')
      : o.status === 'cancelled' ? t('status.cancelled') : o.payment_method === 'cod' ? t('inv.due_cod', { amount: m(o.total) }) : t('inv.due_card', { amount: m(o.total) }),
    paid && o.payment_ref ? `${t('inv.ref')}: ${o.payment_ref}` : '',
    o.charge_currency && o.charge_currency !== s.currency && o.payment_method === 'card' && o.charge_amount ? `${t('adm.charged')}: ${o.charge_amount} ${o.charge_currency}` : '',
  ].filter(Boolean);
  const notes = clean(o.notes), leftW = CW - 270;
  const payWrapped = payLines.map((l, i) => lines(l, leftW, i === 1 ? 'B' : 'R', 9.5));
  const noteLines = notes ? lines(notes, leftW, 'R', 9).slice(0, 6) : [];
  const leftH = 14 + payWrapped.reduce((a, w) => a + w.length * 13, 0) + (notes ? 22 + noteLines.length * 12 : 0);
  const rightH = rows.length * 16 + 36 + (vat ? 14 : 0);
  if (y + Math.max(leftH, rightH) + 10 > BOTTOM) newPage();
  const ty = y;
  rows.forEach(([k, v]) => {
    text(k, CW - 250, y, 150, { size: 9.5, color: '#333333' });
    text(v, CW - 100, y, 100, { size: 9.5, align: 'end' });
    y += 16;
  });
  y += 2;
  doc.rect(X(CW - 256, 256), y - 4, 256, 26, { fill: INK });
  text(t('cart.total'), CW - 250, y + 13, 150, { font: 'B', size: 11, color: '#ffffff' });
  text(m(o.total), CW - 100, y + 13, 94, { font: 'B', size: 11, color: '#ffffff', align: 'end' });
  y += 34;
  if (vat) {
    const vatAmount = round2(o.total - o.total / (1 + vat / 100));
    text(t('inv.vat_included', { rate: vat, amount: m(vatAmount) }), CW - 256, y, 256, { size: 8, color: GREY, align: 'end' });
    y += 14;
  }
  let py = ty;
  text(t('inv.payment_info').toUpperCase(), 0, py, leftW, { font: 'B', size: 8, color: GREY });
  py += 14;
  payWrapped.forEach((ws, i) => { for (const w of ws) { text(w, 0, py, leftW, { size: 9.5, font: i === 1 ? 'B' : 'R', dir: 'auto' }); py += 13; } });
  if (notes) {
    py += 8;
    text(t('inv.notes').toUpperCase(), 0, py, leftW, { font: 'B', size: 8, color: GREY });
    py += 14;
    for (const l of noteLines) { text(l, 0, py, leftW, { size: 9, dir: 'auto' }); py += 12; }
  }
  y = Math.max(y, py) + 10;

  // ---------- note from the store (Admin → Settings → Invoices) ----------
  const note = clean(loc(s, 'invoice_note', lang));
  if (note) {
    const nl = lines(note, CW, 'R', 8.5);
    if (y + nl.length * 12 + 16 > BOTTOM) newPage();
    doc.line(M, y, M + CW, y, LINE);
    y += 14;
    for (const l of nl) { text(l, 0, y, CW, { size: 8.5, color: GREY, dir: 'auto' }); y += 12; }
  }

  // ---------- footer on every page ----------
  const total = doc.pages.length;
  doc.pages.forEach((p, i) => {
    doc.page = p;
    doc.line(M, doc.H - 46, M + CW, doc.H - 46, LINE);
    text(t('inv.thanks', { store }), 0, doc.H - 32, CW - 90, { size: 8, color: GREY });
    text(t('inv.page', { n: i + 1, total }), CW - 90, doc.H - 32, 90, { size: 8, color: GREY, align: 'end' });
  });
  return doc.build();
}

// Send the PDF to the browser: opens in its PDF viewer (?download=1 saves the file). Never cached — it holds personal data.
function sendInvoicePdf(ctx, o, lang) {
  const buf = invoicePDF(o, lang);
  ctx.headers['Content-Disposition'] = `${ctx.query.download === '1' ? 'attachment' : 'inline'}; filename="${fileName(o)}"`;
  ctx.headers['Cache-Control'] = 'private, no-store';
  ctx.headers['X-Robots-Tag'] = 'noindex';
  return ctx.send(buf, 200, 'application/pdf');
}

module.exports = { invoicePDF, invoiceFileName: fileName, sendInvoicePdf };
