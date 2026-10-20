'use strict';
// Sales statistics for Admin → Statistics. Filters: period, order status, payment method/status, delivery area.
// Days are counted in Palestine time (Asia/Hebron), like everywhere else in the admin.
const { one, all } = require('./db');
const { dayKey, zonedToUtc, phoneTail, round2 } = require('./util');
const { STATUSES, PAY_STATUSES } = require('./orders');

const PERIODS = ['today', 'yesterday', '7d', '30d', 'this_month', 'last_month', 'this_year', '12m', 'all', 'custom'];
const isKey = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !Number.isNaN(Date.parse(s)) && new Date(s + 'T00:00:00Z').toISOString().startsWith(s); // rejects 2026-02-30
const addDays = (key, n) => { const d = new Date(key + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5) + 1;
const utc = (key) => zonedToUtc(key + 'T00:00').replace('T', ' ').slice(0, 19); // local midnight → stored UTC format

// Clean the query string into known filter values
function readFilters(q = {}) {
  const f = {
    period: PERIODS.includes(q.period) ? q.period : '30d',
    status: q.status === 'all' || STATUSES.includes(q.status) ? q.status : 'active',
    method: ['cod', 'card'].includes(q.method) ? q.method : '',
    pay: PAY_STATUSES.includes(q.pay) ? q.pay : '',
    zone: +q.zone > 0 ? +q.zone : 0,
    from: isKey(q.from) ? q.from : '', to: isKey(q.to) ? q.to : '',
  };
  if (f.period === 'custom' && !(f.from && f.to)) f.period = '30d';
  return f;
}

function range(f) {
  const today = dayKey(new Date());
  const ym = today.slice(0, 7), [y, m] = ym.split('-').map(Number);
  const monthStart = (yy, mm) => `${yy + Math.floor((mm - 1) / 12)}-${String((((mm - 1) % 12) + 12) % 12 + 1).padStart(2, '0')}-01`;
  switch (f.period) {
    case 'today': return [today, today];
    case 'yesterday': return [addDays(today, -1), addDays(today, -1)];
    case '7d': return [addDays(today, -6), today];
    case 'this_month': return [`${ym}-01`, today];
    case 'last_month': return [monthStart(y, m - 1), addDays(`${ym}-01`, -1)];
    case 'this_year': return [`${y}-01-01`, today];
    case '12m': return [monthStart(y, m - 11), today];
    case 'all': { const first = one('SELECT MIN(created_at) d FROM orders').d; return [first ? dayKey(first) : today, today]; }
    case 'custom': return f.from <= f.to ? [f.from, f.to] : [f.to, f.from];
    default: return [addDays(today, -29), today];
  }
}

// The period to compare with: the previous month / year for calendar periods, otherwise the same number of days just before
const pad2 = (n) => String(n).padStart(2, '0');
function shiftMonths(key, n) { // same day n months earlier/later (clamped to the month's last day)
  const [y, m, d] = key.split('-').map(Number), t = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  return `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}-${pad2(Math.min(d, last))}`;
}
function prevRange(f, from, to) {
  if (f.period === 'this_month' || f.period === 'last_month') {
    const a = shiftMonths(from, -1);
    return [a, f.period === 'last_month' ? addDays(from, -1) : shiftMonths(to, -1) < a ? a : shiftMonths(to, -1)];
  }
  if (f.period === 'this_year' || f.period === '12m') return [shiftMonths(from, -12), shiftMonths(to, -12)];
  const days = daysBetween(from, to);
  return [addDays(from, -days), addDays(from, -1)];
}

// SQL condition for the filters (table alias "o")
function where(f, from, to, { ignoreStatus = false, ignorePay = false } = {}) {
  const w = ['o.created_at >= ?', 'o.created_at < ?'], p = [utc(from), utc(addDays(to, 1))];
  if (!ignoreStatus && f.status === 'active') w.push("o.status <> 'cancelled'");
  else if (!ignoreStatus && f.status !== 'all') { w.push('o.status = ?'); p.push(f.status); }
  if (f.method) { w.push('o.payment_method = ?'); p.push(f.method); }
  if (f.pay && !ignorePay) { w.push('o.payment_status = ?'); p.push(f.pay); }
  if (f.zone) { w.push('o.zone_id = ?'); p.push(f.zone); }
  return { sql: w.join(' AND '), p };
}

const sum = (rows, k) => round2(rows.reduce((a, r) => a + (+r[k] || 0), 0));
// group rows → [{ key, label, n, s }] sorted by sales
function group(rows, keyFn, labelFn = (k) => k) {
  const m = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    const g = m.get(k) || { key: k, label: labelFn(k, r), n: 0, s: 0 };
    g.n++; g.s = round2(g.s + r.total);
    m.set(k, g);
  }
  return [...m.values()].sort((a, b) => b.s - a.s || b.n - a.n);
}

function compute(f, lang = 'en') {
  const [from, to] = range(f);
  const days = daysBetween(from, to);
  const W = where(f, from, to);
  const orders = all(`SELECT o.id, o.number, o.total, o.subtotal, o.discount, o.shipping, o.fee, o.status, o.payment_method, o.payment_status,
    o.zone_id, o.zone_name, o.coupon, o.phone, o.name, o.user_id, o.created_at FROM orders o WHERE ${W.sql} ORDER BY o.id`, ...W.p);
  const items = all(`SELECT oi.product_id, oi.name, oi.name_ar, oi.qty, oi.price FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE ${W.sql}`, ...W.p);
  const L = (en, ar) => (lang === 'ar' ? ar || en : en || ar) || '';

  // ----- key numbers -----
  const revenue = sum(orders, 'total');
  const kpi = {
    revenue, orders: orders.length, aov: orders.length ? round2(revenue / orders.length) : 0,
    items: items.reduce((a, i) => a + i.qty, 0),
    customers: new Set(orders.map((o) => phoneTail(o.phone) || o.id)).size,
    collected: sum(orders.filter((o) => o.payment_status === 'paid'), 'total'),
    toCollect: sum(orders.filter((o) => o.status !== 'cancelled' && !['paid', 'refunded'].includes(o.payment_status)), 'total'),
    discounts: sum(orders, 'discount'), delivery: sum(orders, 'shipping'),
  };
  const C = where(f, from, to, { ignoreStatus: true, ignorePay: true }); // cancellation rate looks at every order
  const cr = one(`SELECT COUNT(*) n, COALESCE(SUM(o.status = 'cancelled'), 0) c FROM orders o WHERE ${C.sql}`, ...C.p);
  kpi.cancelled = cr.c; kpi.allOrders = cr.n; kpi.cancelRate = cr.n ? Math.round((cr.c / cr.n) * 100) : 0;
  // same-length period just before, for the ▲▼ comparison
  let prev = null;
  if (f.period !== 'all') {
    const P = where(f, ...prevRange(f, from, to));
    prev = one(`SELECT COUNT(*) n, COALESCE(SUM(o.total), 0) s FROM orders o WHERE ${P.sql}`, ...P.p);
  }

  // ----- sales over time (per day, or per month for long periods) -----
  const byMonth = days > 62;
  const series = [];
  if (byMonth) for (let k = from.slice(0, 7); k <= to.slice(0, 7); k = addDays(k + '-28', 4).slice(0, 7)) series.push({ k, v: 0, n: 0 });
  else for (let k = from; k <= to; k = addDays(k, 1)) series.push({ k, v: 0, n: 0 });
  const idx = new Map(series.map((s, i) => [s.k, i]));
  for (const o of orders) {
    const k = byMonth ? dayKey(o.created_at).slice(0, 7) : dayKey(o.created_at);
    const s = series[idx.get(k)];
    if (s) { s.v = round2(s.v + o.total); s.n++; }
  }

  // ----- breakdowns -----
  const zoneLabel = (k, o) => { const [en, ar] = String(o.zone_name || '').split(' / '); return L(en, ar) || '—'; };
  const byStatus = group(orders, (o) => o.status);
  const byMethod = group(orders, (o) => o.payment_method);
  const byPay = group(orders, (o) => o.payment_status);
  const byZone = group(orders, (o) => o.zone_id || 0, zoneLabel);
  const coupons = group(orders.filter((o) => o.coupon), (o) => o.coupon).map((g) => ({ ...g, d: sum(orders.filter((o) => o.coupon === g.key), 'discount') }));

  // products + their top-level category
  const catRows = all('SELECT id, parent_id, name_en, name_ar FROM categories');
  const catById = new Map(catRows.map((c) => [c.id, c]));
  const rootOf = (id) => { let c = catById.get(id), guard = 0; while (c && c.parent_id && catById.has(c.parent_id) && guard++ < 20) c = catById.get(c.parent_id); return c; };
  const prodCat = new Map(all('SELECT p.id, COALESCE(p.main_cat, (SELECT MIN(category_id) FROM product_categories pc WHERE pc.product_id = p.id)) cat FROM products p').map((r) => [r.id, r.cat]));
  const pm = new Map(), cm = new Map();
  for (const it of items) {
    const key = it.product_id || 'x:' + it.name;
    const p = pm.get(key) || { id: it.product_id, label: L(it.name, it.name_ar), q: 0, s: 0 };
    p.q += it.qty; p.s = round2(p.s + it.qty * it.price); pm.set(key, p);
    const root = rootOf(prodCat.get(it.product_id));
    const ck = root ? root.id : 0;
    const c = cm.get(ck) || { key: ck, label: root ? L(root.name_en, root.name_ar) : '', q: 0, s: 0 };
    c.q += it.qty; c.s = round2(c.s + it.qty * it.price); cm.set(ck, c);
  }
  const itemsTotal = round2([...pm.values()].reduce((a, p) => a + p.s, 0));
  const topProducts = [...pm.values()].sort((a, b) => b.s - a.s || b.q - a.q).slice(0, 10);
  const byCategory = [...cm.values()].sort((a, b) => b.s - a.s);

  // customers (same phone number = same customer, also for guests)
  const cust = new Map();
  for (const o of orders) {
    const k = phoneTail(o.phone) || 'o' + o.id;
    const c = cust.get(k) || { name: o.name, phone: o.phone, user_id: o.user_id, n: 0, s: 0 };
    c.n++; c.s = round2(c.s + o.total); c.name = o.name; c.user_id ||= o.user_id; cust.set(k, c);
  }
  const topCustomers = [...cust.values()].sort((a, b) => b.s - a.s || b.n - a.n).slice(0, 10);
  const repeat = [...cust.values()].filter((c) => c.n > 1).length;

  // weekday pattern (Saturday first, like the Palestinian week)
  const wdName = new Intl.DateTimeFormat(lang === 'ar' ? 'ar' : 'en-GB', { weekday: 'long', timeZone: 'UTC' });
  const weekdays = [6, 0, 1, 2, 3, 4, 5].map((d) => ({ d, label: wdName.format(new Date(Date.UTC(2024, 0, 7 + d))), n: 0, s: 0 })); // 7 Jan 2024 = Sunday
  for (const o of orders) { const w = weekdays.find((x) => x.d === new Date(dayKey(o.created_at) + 'T12:00:00Z').getUTCDay()); w.n++; w.s = round2(w.s + o.total); }

  return { f, from, to, days, byMonth, kpi, prev, series, byStatus, byMethod, byPay, byZone, coupons, topProducts, byCategory, itemsTotal, topCustomers, repeat, weekdays, orderIds: orders.map((o) => o.id) };
}

// Filters for the Orders list (same dropdowns; no period = any time). Returns SQL pieces for "orders o".
function listFilters(q = {}) {
  const f = readFilters({ ...q, status: 'all' });
  if (!PERIODS.includes(q.period)) f.period = '';
  const w = [], p = [];
  if (f.period) { const [a, b] = range(f); w.push('o.created_at >= ?', 'o.created_at < ?'); p.push(utc(a), utc(addDays(b, 1))); }
  if (f.method) { w.push('o.payment_method = ?'); p.push(f.method); }
  if (f.pay) { w.push('o.payment_status = ?'); p.push(f.pay); }
  if (f.zone) { w.push('o.zone_id = ?'); p.push(f.zone); }
  return { f, w, p };
}

module.exports = { compute, readFilters, where, range, prevRange, listFilters, PERIODS };
