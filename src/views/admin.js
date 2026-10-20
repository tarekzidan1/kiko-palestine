'use strict';
// Admin panel views (bilingual UI, RTL-aware).
const { html, raw, json } = require('../html');
const { ICONS } = require('./ui');
const { assetVersion } = require('../content');
const { fmtDate, utcToZonedInput, waNumber } = require('../util');

const AICONS = {
  ...ICONS,
  dash: '<rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="5" rx="1"/><rect x="13" y="10" width="8" height="11" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/>',
  tag: '<path d="M3 12V3h9l9 9-9 9z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20c1-3.5 3.8-5 7-5s6 1.5 7 5"/><path d="M16 4a3.5 3.5 0 0 1 0 7M22 20c-.6-2.5-2-4-4-4.6"/>',
  cog: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
  file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 17-5-5-8 8"/>',
  folder: '<path d="M3 6h7l2 2h9v11H3z"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M4 20h16"/>',
  upload: '<path d="M12 20V9M7 14l5-5 5 5M4 4h16"/>',
  percent: '<path d="M19 5 5 19"/><circle cx="7" cy="7" r="2.5"/><circle cx="17" cy="17" r="2.5"/>',
  inbox: '<path d="M3 13h5l1 3h6l1-3h5"/><path d="M5 5h14l2 8v6H3v-6z"/>',
  home: '<path d="M3 11l9-7 9 7v9H3z"/><path d="M9 20v-6h6v6"/>',
  print: '<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/>',
  copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
  chart: '<path d="M3 21h18"/><rect x="5" y="11" width="3" height="7" rx="1"/><rect x="10.5" y="6" width="3" height="12" rx="1"/><rect x="16" y="13" width="3" height="5" rx="1"/>',
  bolt: '<path d="M13 3 5 14h6l-1 7 8-11h-6z"/>',
};
const sprite = raw(`<svg width="0" height="0" class="sprite" aria-hidden="true">${Object.entries(AICONS).map(([k, d]) => `<symbol id="i-${k}" viewBox="0 0 24 24">${d}</symbol>`).join('')}</svg>`);
const ic = (n) => raw(`<svg class="ic" aria-hidden="true"><use href="#i-${n}"/></svg>`);
const csrf = (ctx) => html`<input type="hidden" name="_csrf" value="${ctx.csrf}">`;
const sel = (cond) => (cond ? raw(' selected') : '');
const chk = (cond) => (cond ? raw(' checked') : '');
const flash = (ctx) => {
  const m = { saved: ['ok', 'adm.saved'], deleted: ['ok', 'adm.deleted'], imported: ['ok', 'adm.imported'], sent: ['ok', 'adm.test_sent'], mailed: ['ok', 'adm.mailed'], err: ['err', 'adm.error'] }[ctx.query.f];
  return m ? html`<div class="alert alert-${m[0]}">${ctx.t(m[1])}${ctx.query.m ? ' — ' + ctx.query.m : ''}</div>` : '';
};
const badge = (ctx, st) => html`<span class="st st-${st}">${ctx.t('status.' + st)}</span>`;
const pbadge = (ctx, st) => html`<span class="pay pay-${st}">${ctx.t('paystatus.' + st)}</span>`;

const NAV = [
  ['/admin', 'adm.dashboard', 'dash'], ['/admin/stats', 'adm.stats', 'chart'], ['/admin/orders', 'adm.orders', 'box'], ['/admin/products', 'adm.products', 'tag'],
  ['/admin/r/categories', 'adm.categories', 'folder'], ['/admin/r/banners', 'adm.banners', 'image'], ['/admin/r/sections', 'adm.sections', 'layers'],
  ['/admin/r/coupons', 'adm.coupons', 'percent'], ['/admin/r/zones', 'adm.zones', 'truck'], ['/admin/r/pages', 'adm.pages', 'file'],
  ['/admin/customers', 'adm.users', 'users'], ['/admin/messages', 'adm.messages', 'inbox'], ['/admin/subscribers', 'adm.subscribers', 'mail'],
  ['/admin/settings', 'adm.settings', 'cog'], ['/admin/account', 'adm.my_account', 'user'],
];

function layout(ctx, { title, body, active, counts = {} }) {
  const { t, lang } = ctx;
  return html`<!doctype html><html lang="${lang}" dir="${lang === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} · ${t('adm.admin')}</title><meta name="robots" content="noindex"><meta name="csrf-token" content="${ctx.csrf}">
<link rel="icon" href="/assets/img/favicon.svg"><link rel="stylesheet" href="/assets/css/admin.css?v=${assetVersion}"><script src="/assets/js/admin.js?v=${assetVersion}" defer></script></head>
<body class="adm">${sprite}
<input type="checkbox" id="nav-t" class="nav-t" hidden>
<aside class="side"><a class="brand" href="/admin">${ctx.L(ctx.s, 'store_name')} <small>${t('adm.admin')}</small></a>
<nav>${NAV.map(([href, k, i]) => html`<a href="${href}" class="${active === href ? 'on' : ''}">${ic(i)}<span>${t(k)}</span>${counts[href] ? html`<b class="cnt">${counts[href]}</b>` : ''}</a>`)}</nav></aside>
<label for="nav-t" class="scrim"></label>
<div class="main"><header class="top"><label for="nav-t" class="burger" aria-label="Menu">${ic('menu')}</label><h1>${title}</h1>
<div class="top-end"><a href="/${lang}" target="_blank" rel="noopener">${ic('eye')} <span>${t('adm.view_store')}</span></a>
<a href="/admin/account">${ic('user')} <span>${ctx.user?.name || ''}</span></a>
<a href="/admin/lang?to=${lang === 'ar' ? 'en' : 'ar'}">${lang === 'ar' ? 'English' : 'العربية'}</a>
<form method="post" action="/admin/logout">${csrf(ctx)}<button class="lnk">${ic('logout')} <span>${t('acc.logout')}</span></button></form></div></header>
<div class="content">${ctx.user?.must_change ? html`<div class="alert alert-err">${t('adm.starter_login_warning')} <a href="/admin/account"><b>${t('adm.my_account')} →</b></a></div>` : ''}${flash(ctx)}${body}</div></div></body></html>`;
}

function login(ctx, error) {
  const { t, lang } = ctx;
  return html`<!doctype html><html lang="${lang}" dir="${lang === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${t('adm.login')}</title>
<meta name="robots" content="noindex"><link rel="stylesheet" href="/assets/css/admin.css?v=${assetVersion}"></head><body class="adm login-page">
<form class="login-box" method="post" action="/admin/login">${csrf(ctx)}<input type="hidden" name="next" value="${ctx.query.next || ''}">
<h1>${ctx.L(ctx.s, 'store_name')}</h1><p class="muted">${t('adm.login')}</p>${error ? html`<div class="alert alert-err">${error}</div>` : ''}
<label>${t('common.email')}<input name="email" type="email" required autofocus dir="ltr"></label>
<label>${t('acc.password')}<input name="password" type="password" required></label>
<button class="btn">${t('acc.login')}</button><p class="small"><a href="/admin/lang?to=${lang === 'ar' ? 'en' : 'ar'}">${lang === 'ar' ? 'English' : 'العربية'}</a></p></form></body></html>`;
}

// ---------- dashboard ----------
function chart(ctx, series) {
  const max = Math.max(1, ...series.map((d) => d.v));
  const w = 28, gap = 10, h = 140;
  return html`<svg class="chart" viewBox="0 0 ${series.length * (w + gap)} ${h + 34}" role="img" aria-label="${ctx.t('adm.sales_14')}">${series.map((d, i) => {
    const bh = Math.round((d.v / max) * h);
    return raw(`<g><title>${d.k}: ${ctx.money(d.v)}</title><rect x="${i * (w + gap)}" y="${h - bh}" width="${w}" height="${Math.max(bh, 1)}" rx="4" class="bar"/><text x="${i * (w + gap) + w / 2}" y="${h + 16}" text-anchor="middle">${d.k.slice(8)}</text></g>`);
  })}</svg>`;
}

function dashboard(ctx, d) {
  const { t, L } = ctx;
  const kpi = (label, val, sub) => html`<div class="kpi"><span>${label}</span><strong>${val}</strong>${sub ? html`<small>${sub}</small>` : ''}</div>`;
  const body = html`${(d.alerts || []).map(([type, key]) => html`<div class="alert alert-${type === 'err' ? 'err' : 'info'}">${t(key)} <a href="/admin/settings">${t('adm.settings')} →</a></div>`)}
  <div class="kpis">
    ${kpi(t('adm.today'), ctx.money(d.today.s), t('adm.n_orders', { n: d.today.n }))}
    ${kpi(t('adm.last7'), ctx.money(d.week.s), t('adm.n_orders', { n: d.week.n }))}
    ${kpi(t('adm.last30'), ctx.money(d.month.s), t('adm.n_orders', { n: d.month.n }))}
    ${kpi(t('adm.pending'), d.pending, html`<a href="/admin/orders?status=pending">${t('common.view')}</a>`)}
  </div>
  <div class="grid2">
    <section class="panel"><h2>${t('adm.sales_14')} <a class="small" href="/admin/stats">${ic('chart')} ${t('st.more')}</a></h2>${chart(ctx, d.series)}</section>
    <section class="panel"><h2>${t('adm.top_products')}</h2>${d.top.length ? html`<table class="tbl"><tbody>${d.top.map((p) => html`<tr><td>${ctx.lang === 'ar' ? p.name_ar || p.name : p.name}</td><td class="num">×${p.q}</td><td class="num">${ctx.money(p.s)}</td></tr>`)}</tbody></table>` : html`<p class="muted">${t('adm.no_data')}</p>`}</section>
  </div>
  <div class="grid2">
    <section class="panel"><h2>${t('adm.recent_orders')} <a class="small" href="/admin/orders">${t('common.view_all')}</a></h2>${ordersTable(ctx, d.recent)}</section>
    <section class="panel"><h2>${t('adm.low_stock')}</h2>${d.low.length ? html`<table class="tbl"><tbody>${d.low.map((p) => html`<tr><td><a href="/admin/products/${p.id}">${L(p, 'name')}</a>${p.vname ? html` <small class="muted">— ${p.vname}</small>` : ''}</td><td class="num ${p.stock <= 0 ? 'neg' : 'warn'}">${p.stock}</td></tr>`)}</tbody></table>` : html`<p class="muted">${t('adm.stock_ok')}</p>`}
      ${d.unread ? html`<p><a class="btn btn-ghost" href="/admin/messages">${ic('inbox')} ${t('adm.unread', { n: d.unread })}</a></p>` : ''}</section>
  </div>`;
  return layout(ctx, { title: t('adm.dashboard'), body, active: '/admin', counts: d.counts });
}

// ---------- orders ----------
function ordersTable(ctx, rows) {
  const { t } = ctx;
  if (!rows.length) return html`<p class="muted">${t('adm.no_data')}</p>`;
  return html`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>${t('adm.customer')}</th><th>${t('order.date')}</th><th>${t('cart.total')}</th><th>${t('order.payment')}</th><th>${t('order.status')}</th></tr></thead>
  <tbody>${rows.map((o) => html`<tr class="rowlink"><td><a href="/admin/orders/${o.id}" dir="ltr">${o.number}</a></td><td>${o.name}<br><small class="muted" dir="ltr">${o.phone}</small></td>
  <td dir="ltr" class="nowrap">${fmtDate(o.created_at)}</td><td class="num">${ctx.money(o.total)}</td><td>${o.payment_method === 'card' ? ic('card') : ic('cash')} ${pbadge(ctx, o.payment_status)}</td><td>${badge(ctx, o.status)}</td></tr>`)}</tbody></table></div>`;
}

// dropdowns shared by Orders + Statistics
const PERIOD_KEYS = ['today', 'yesterday', '7d', '30d', 'this_month', 'last_month', 'this_year', '12m', 'all', 'custom'];
function filterFields(ctx, f, { zones, payStatuses, anyPeriod }) {
  const { t, L } = ctx;
  const o = (v, label, cur) => html`<option value="${v}"${sel(String(cur ?? '') === String(v))}>${label}</option>`;
  const custom = f.period === 'custom';
  return html`<label class="f"><span>${t('st.period')}</span><select name="period" data-period>${anyPeriod ? o('', t('st.p.any'), f.period) : ''}${PERIOD_KEYS.filter((k) => !(anyPeriod && k === 'all')).map((k) => o(k, t('st.p.' + k), f.period))}</select></label>
    <label class="f custom-d"${custom ? '' : raw(' hidden')}><span>${t('st.from')}</span><input type="date" name="from" value="${f.from || ''}"${custom ? '' : raw(' disabled')}></label>
    <label class="f custom-d"${custom ? '' : raw(' hidden')}><span>${t('st.to')}</span><input type="date" name="to" value="${f.to || ''}"${custom ? '' : raw(' disabled')}></label>
    <label class="f"><span>${t('st.method')}</span><select name="method">${o('', t('st.any'), f.method)}${o('cod', t('pay.cod'), f.method)}${o('card', t('pay.card'), f.method)}</select></label>
    <label class="f"><span>${t('st.pay')}</span><select name="pay">${o('', t('st.any'), f.pay)}${payStatuses.map((p) => o(p, t('paystatus.' + p), f.pay))}</select></label>
    <label class="f"><span>${t('st.zone')}</span><select name="zone">${o('', t('st.any'), f.zone || '')}${zones.map((z) => o(z.id, L(z, 'name'), f.zone))}</select></label>`;
}
const qs = (o) => Object.entries(o).filter(([, v]) => v !== '' && v != null && v !== 0).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');

function orders(ctx, { rows, total, sum, page, pages, q, status, f, counts, statuses, payStatuses, zones }) {
  const { t } = ctx;
  const keep = { q, period: f.period, from: f.period === 'custom' ? f.from : '', to: f.period === 'custom' ? f.to : '', method: f.method, pay: f.pay, zone: f.zone };
  const filtered = !!(f.period || f.method || f.pay || f.zone || q);
  const body = html`<nav class="tabs mb">${status === 'active' ? html`<a class="on" href="/admin/orders?${qs({ ...keep, status })}">${t('st.active')} <b>${total}</b></a>` : ''}<a class="${!status ? 'on' : ''}" href="/admin/orders?${qs(keep)}">${t('adm.all')} <b>${counts.all || 0}</b></a>${statuses.map((s) => html`<a class="${status === s ? 'on' : ''}" href="/admin/orders?${qs({ ...keep, status: s })}">${t('status.' + s)} <b>${counts[s] || 0}</b></a>`)}</nav>
  <form class="panel filters" method="get" action="/admin/orders" data-autosubmit><input type="hidden" name="status" value="${status || ''}">
    <label class="f grow"><span>${t('search.label')}</span><input name="q" value="${q || ''}" placeholder="${t('adm.search_orders')}"></label>
    ${filterFields(ctx, f, { zones, payStatuses, anyPeriod: true })}
    <div class="f-actions"><button class="btn">${ic('search')} ${t('st.apply')}</button>${filtered ? html`<a class="btn btn-ghost" href="/admin/orders${status ? '?status=' + status : ''}">${t('st.reset')}</a>` : ''}
    <a class="btn btn-ghost" href="/admin/orders/export.csv?${qs({ ...keep, status })}">${ic('download')} CSV</a></div></form>
  <section class="panel">${ordersTable(ctx, rows)}${pager(page, pages, (n) => `/admin/orders?${qs({ ...keep, status, page: n })}`)}<p class="muted small">${t('adm.total_n', { n: total })} · ${t('st.revenue')}: ${ctx.money(sum)}</p></section>`;
  return layout(ctx, { title: t('adm.orders'), body, active: '/admin/orders' });
}

// ---------- statistics ----------
function statsChart(ctx, series, byMonth) {
  const n = series.length, max = Math.max(1, ...series.map((s) => s.v));
  const w = n > 45 ? 12 : n > 20 ? 18 : 30, gap = n > 45 ? 4 : 7, h = 170, every = Math.ceil(n / 16);
  const label = (k) => (byMonth ? `${k.slice(5, 7)}/${k.slice(2, 4)}` : `${k.slice(8)}/${k.slice(5, 7)}`);
  return html`<div dir="ltr"><svg class="chart" viewBox="0 0 ${n * (w + gap)} ${h + 30}" role="img" aria-label="${ctx.t(byMonth ? 'st.chart_month' : 'st.chart_day')}">${series.map((d, i) => {
    const bh = Math.round((d.v / max) * h);
    return raw(`<g><title>${label(d.k)}: ${ctx.money(d.v)} · ${ctx.t('adm.n_orders', { n: d.n })}</title><rect x="${i * (w + gap)}" y="${h - bh}" width="${w}" height="${Math.max(bh, 1)}" rx="3" class="bar"/>${i % every === 0 ? `<text x="${i * (w + gap) + w / 2}" y="${h + 16}" text-anchor="middle">${label(d.k)}</text>` : ''}</g>`);
  })}</svg></div>`;
}
function stats(ctx, { d, zones, statuses, payStatuses, counts }) {
  const { t, L } = ctx;
  const f = d.f, k = d.kpi;
  const o = (v, label, cur) => html`<option value="${v}"${sel(String(cur) === String(v))}>${label}</option>`;
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const sbar = (v, max) => html`<span class="sbar"><i style="width:${max ? Math.max(2, Math.round((v / max) * 100)) : 0}%"></i></span>`;
  const change = (now, before) => {
    if (!d.prev) return '';
    if (!before) return now ? html`<small class="chg up">${t('st.new')}</small>` : '';
    const c = Math.round(((now - before) / before) * 100);
    return html`<small class="chg ${c >= 0 ? 'up' : 'down'}" title="${t('st.vs_prev')}">${c >= 0 ? '▲' : '▼'} ${Math.abs(c)}% <span class="muted">${t('st.vs_prev')}</span></small>`;
  };
  const kpi = (key, label, val, sub) => html`<div class="kpi" data-kpi="${key}"><span>${label}</span><strong>${val}</strong>${sub || ''}</div>`;
  const keepF = { period: f.period, from: f.period === 'custom' ? f.from : '', to: f.period === 'custom' ? f.to : '', method: f.method, pay: f.pay, zone: f.zone };
  const ordersLink = (extra = {}) => `/admin/orders?${qs({ ...keepF, period: f.period === 'all' ? '' : f.period, status: STATUS_LINK(f.status), ...extra })}`;
  const empty = html`<p class="muted">${t('adm.no_data')}</p>`;
  const breakdown = (key, title, rows, label, link) => html`<section class="panel" data-breakdown="${key}"><h2>${title}</h2>${rows.length ? html`<table class="tbl stat"><thead><tr><th></th><th class="num">${t('st.orders')}</th><th class="num">${t('st.revenue')}</th><th class="share">${t('st.share')}</th></tr></thead>
    <tbody>${rows.map((r) => html`<tr><td>${link ? html`<a href="${link(r)}">${label(r)}</a>` : label(r)}</td><td class="num">${r.n}</td><td class="num">${ctx.money(r.s)}</td><td class="share">${sbar(r.s, k.revenue)}<small>${pct(r.s, k.revenue)}%</small></td></tr>`)}</tbody></table>` : empty}</section>`;

  const body = html`<form class="panel filters" method="get" action="/admin/stats" data-autosubmit>
    ${filterFields(ctx, f, { zones, payStatuses })}
    <label class="f"><span>${t('st.status')}</span><select name="status">${o('active', t('st.active'), f.status)}${o('all', t('st.all'), f.status)}${statuses.map((s) => o(s, t('status.' + s), f.status))}</select></label>
    <div class="f-actions"><button class="btn">${ic('chart')} ${t('st.apply')}</button><a class="btn btn-ghost" href="/admin/stats">${t('st.reset')}</a></div>
  </form>
  <div class="bar"><p class="muted range" data-range="${d.from}..${d.to}">${ic('clock')} ${t('st.range', { from: fmtDate(d.from + 'T12:00:00Z', false), to: fmtDate(d.to + 'T12:00:00Z', false), n: d.days })}</p>
    <div class="actions"><a class="btn btn-ghost" href="${ordersLink()}">${ic('box')} ${t('st.view_orders')}</a><a class="btn btn-ghost" href="/admin/stats/export.csv?${qs({ ...keepF, status: f.status })}">${ic('download')} ${t('st.export')}</a></div></div>
  <div class="kpis kpis-8">
    ${kpi('revenue', t('st.revenue'), ctx.money(k.revenue), change(k.revenue, d.prev?.s))}
    ${kpi('orders', t('st.orders'), k.orders, change(k.orders, d.prev?.n))}
    ${kpi('aov', t('st.aov'), ctx.money(k.aov))}
    ${kpi('items', t('st.items'), k.items)}
    ${kpi('customers', t('st.customers'), k.customers, html`<small>${t('st.repeat', { n: d.repeat })}</small>`)}
    ${kpi('collected', t('st.collected'), ctx.money(k.collected), html`<small>${t('st.to_collect', { amount: ctx.money(k.toCollect) })}</small>`)}
    ${kpi('discounts', t('st.discounts'), ctx.money(k.discounts), html`<small>${t('st.delivery_sub', { amount: ctx.money(k.delivery) })}</small>`)}
    ${kpi('cancelled', t('st.cancel_rate'), k.cancelRate + '%', html`<small>${t('st.cancel_sub', { n: k.cancelled, total: k.allOrders })}</small>`)}
  </div>
  <section class="panel"><h2>${t(d.byMonth ? 'st.chart_month' : 'st.chart_day')}</h2>${k.orders ? statsChart(ctx, d.series, d.byMonth) : html`<p class="muted">${t('st.no_orders')}</p>`}</section>
  <div class="grid2">
    <section class="panel" data-breakdown="products"><h2>${t('st.top_products')}</h2>${d.topProducts.length ? html`<table class="tbl stat"><thead><tr><th></th><th class="num">${t('st.qty')}</th><th class="num">${t('st.revenue')}</th><th class="share">${t('st.share')}</th></tr></thead>
      <tbody>${d.topProducts.map((p) => html`<tr><td>${p.id ? html`<a href="/admin/products/${p.id}">${p.label}</a>` : p.label}</td><td class="num">${p.q}</td><td class="num">${ctx.money(p.s)}</td><td class="share">${sbar(p.s, d.itemsTotal)}<small>${pct(p.s, d.itemsTotal)}%</small></td></tr>`)}</tbody></table>` : empty}</section>
    <section class="panel" data-breakdown="categories"><h2>${t('st.by_cat')}</h2>${d.byCategory.length ? html`<table class="tbl stat"><thead><tr><th></th><th class="num">${t('st.qty')}</th><th class="num">${t('st.revenue')}</th><th class="share">${t('st.share')}</th></tr></thead>
      <tbody>${d.byCategory.map((c) => html`<tr><td>${c.label || t('st.other')}</td><td class="num">${c.q}</td><td class="num">${ctx.money(c.s)}</td><td class="share">${sbar(c.s, d.itemsTotal)}<small>${pct(c.s, d.itemsTotal)}%</small></td></tr>`)}</tbody></table>` : empty}</section>
  </div>
  <div class="grid2">
    ${breakdown('status', t('st.by_status'), d.byStatus, (r) => html`<span class="st st-${r.key}">${t('status.' + r.key)}</span>`, (r) => ordersLink({ status: r.key }))}
    ${breakdown('zone', t('st.by_zone'), d.byZone, (r) => r.label, (r) => (r.key ? ordersLink({ zone: r.key }) : ''))}
  </div>
  <div class="grid2">
    ${breakdown('method', t('st.by_method'), d.byMethod, (r) => html`${ic(r.key === 'card' ? 'card' : 'cash')} ${t(r.key === 'card' ? 'pay.card' : 'pay.cod')}`, (r) => ordersLink({ method: r.key }))}
    ${breakdown('pay', t('st.by_pay'), d.byPay, (r) => html`<span class="pay pay-${r.key}">${t('paystatus.' + r.key)}</span>`, (r) => ordersLink({ pay: r.key }))}
  </div>
  <div class="grid2">
    <section class="panel" data-breakdown="customers"><h2>${t('st.top_customers')}</h2>${d.topCustomers.length ? html`<table class="tbl stat"><thead><tr><th></th><th class="num">${t('st.orders')}</th><th class="num">${t('st.revenue')}</th></tr></thead>
      <tbody>${d.topCustomers.map((c) => html`<tr><td>${c.user_id ? html`<a href="/admin/customers/${c.user_id}">${c.name}</a>` : html`<a href="/admin/orders?q=${encodeURIComponent(String(c.phone || '').slice(-9))}">${c.name}</a>`}<br><small class="muted" dir="ltr">${c.phone}</small></td><td class="num">${c.n}</td><td class="num">${ctx.money(c.s)}</td></tr>`)}</tbody></table>` : empty}</section>
    <div>
      <section class="panel" data-breakdown="weekdays"><h2>${t('st.weekdays')}</h2>${k.orders ? html`<table class="tbl stat"><tbody>${d.weekdays.map((w) => html`<tr><td>${w.label}</td><td class="num">${t('adm.n_orders', { n: w.n })}</td><td class="num">${ctx.money(w.s)}</td><td class="share">${sbar(w.n, Math.max(...d.weekdays.map((x) => x.n)))}</td></tr>`)}</tbody></table>` : empty}</section>
      <section class="panel" data-breakdown="coupons"><h2>${t('st.coupons')}</h2>${d.coupons.length ? html`<table class="tbl stat"><thead><tr><th></th><th class="num">${t('st.uses')}</th><th class="num">${t('cart.discount')}</th><th class="num">${t('st.revenue')}</th></tr></thead>
        <tbody>${d.coupons.map((c) => html`<tr><td><code>${c.key}</code></td><td class="num">${c.n}</td><td class="num">${ctx.money(c.d)}</td><td class="num">${ctx.money(c.s)}</td></tr>`)}</tbody></table>` : empty}</section>
    </div>
  </div>`;
  return layout(ctx, { title: t('adm.stats'), body, active: '/admin/stats', counts });
}
const STATUS_LINK = (st) => (st === 'all' ? '' : st); // 'active' = all except cancelled (the orders list understands it)

function orderDetail(ctx, { o, items, events, statuses, payStatuses, customer }) {
  const { t, lang } = ctx;
  const wa = waNumber(o.phone);
  const body = html`<div class="bar"><a class="btn btn-ghost" href="/admin/orders">${ic('chev')} ${t('adm.back')}</a>
    <div class="actions"><a class="btn btn-ghost" href="/admin/orders/${o.id}/invoice.pdf?lang=ar" target="_blank" data-pdf="ar">${ic('file')} ${t('adm.invoice_pdf')} (عربي)</a>
    <a class="btn btn-ghost" href="/admin/orders/${o.id}/invoice.pdf?lang=en" target="_blank" data-pdf="en">${ic('file')} ${t('adm.invoice_pdf')} (English)</a>
    <a class="btn btn-ghost" href="/admin/orders/${o.id}/invoice" target="_blank">${ic('print')} ${t('adm.print')}</a>
    ${o.email ? html`<form method="post" action="/admin/orders/${o.id}/email-invoice">${csrf(ctx)}<button class="btn btn-ghost" data-email-invoice>${ic('mail')} ${t('adm.email_invoice')}</button></form>` : ''}
    <a class="btn btn-ghost" href="/${o.lang}/order/${encodeURIComponent(o.number)}?t=${o.token}" target="_blank">${ic('eye')} ${t('adm.customer_view')}</a></div></div>
  <div class="grid2 wide-first">
    <div>
      <section class="panel"><h2>${t('order.title', { n: o.number })} ${badge(ctx, o.status)} ${pbadge(ctx, o.payment_status)}</h2>
        <p class="muted" dir="ltr">${fmtDate(o.created_at)}${o.ip ? ' · ' + o.ip : ''}</p>
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th></th><th>${t('adm.product')}</th><th>SKU</th><th class="num">${t('adm.price')}</th><th class="num">${t('cart.qty')}</th><th class="num">${t('cart.total')}</th></tr></thead>
        <tbody>${items.map((it) => html`<tr><td><img class="thumb" src="${it.image || '/assets/img/placeholder.svg'}" alt=""></td><td>${it.product_id ? html`<a href="/admin/products/${it.product_id}">${lang === 'ar' ? it.name_ar || it.name : it.name}</a>` : it.name}${it.variant ? html`<br><small class="muted">${lang === 'ar' ? it.variant_ar || it.variant : it.variant}</small>` : ''}</td>
          <td dir="ltr"><small>${it.sku || ''}</small></td><td class="num">${ctx.money(it.price)}</td><td class="num">${it.qty}</td><td class="num">${ctx.money(it.price * it.qty)}</td></tr>`)}</tbody>
        <tfoot><tr><td colspan="5">${t('cart.subtotal')}</td><td class="num">${ctx.money(o.subtotal)}</td></tr>
        ${o.discount ? html`<tr><td colspan="5">${t('cart.discount')} ${o.coupon ? html`<code>${o.coupon}</code>` : ''}</td><td class="num">-${ctx.money(o.discount)}</td></tr>` : ''}
        <tr><td colspan="5">${t('cart.shipping')}</td><td class="num">${ctx.money(o.shipping)}</td></tr>
        ${o.fee ? html`<tr><td colspan="5">${t('pay.cod_fee_label')}</td><td class="num">${ctx.money(o.fee)}</td></tr>` : ''}
        <tr class="grand"><td colspan="5">${t('cart.total')}</td><td class="num">${ctx.money(o.total)}</td></tr>
        ${o.charge_currency && o.charge_currency !== ctx.s.currency ? html`<tr><td colspan="5" class="muted">${t('adm.charged')}</td><td class="num">${o.charge_amount} ${o.charge_currency}</td></tr>` : ''}</tfoot></table></div>
      </section>
      <section class="panel"><h2>${t('order.history')}</h2><ul class="timeline">${events.map((e) => html`<li><b>${e.status.startsWith('payment_') ? t('paystatus.' + e.status.slice(8)) : t('status.' + e.status)}</b> <span class="muted" dir="ltr">${fmtDate(e.created_at)}</span>${e.note ? html`<br><small>${e.note}</small>` : ''}</li>`)}</ul></section>
    </div>
    <div>
      <section class="panel"><h2>${t('adm.update_status')}</h2>
        <form method="post" action="/admin/orders/${o.id}/status" class="stack">${csrf(ctx)}
          <select name="status">${statuses.map((s) => html`<option value="${s}"${sel(o.status === s)}>${t('status.' + s)}</option>`)}</select>
          <input name="note" placeholder="${t('adm.note_optional')}" maxlength="300">
          <label class="check"><input type="checkbox" name="notify" value="1"${chk(!!o.email)}${o.email ? '' : raw(' disabled')}> ${t('adm.email_customer')}</label>
          <button class="btn">${t('common.save')}</button></form>
        <form method="post" action="/admin/orders/${o.id}/payment" class="stack mt">${csrf(ctx)}
          <label>${t('order.payment')} (${t(o.payment_method === 'card' ? 'pay.card' : 'pay.cod')})<select name="payment_status">${payStatuses.map((s) => html`<option value="${s}"${sel(o.payment_status === s)}>${t('paystatus.' + s)}</option>`)}</select></label>
          ${o.payment_ref ? html`<small class="muted" dir="ltr">Ref: ${o.payment_ref}</small>` : ''}
          ${o.email && o.payment_status !== 'paid' ? html`<label class="check"><input type="checkbox" name="notify_pay" value="1" checked> ${t('adm.email_receipt')}</label>` : ''}
          <button class="btn btn-ghost">${t('common.save')}</button></form>
      </section>
      <section class="panel"><h2>${t('adm.customer')}</h2>
        <p><strong>${o.name}</strong>${customer ? html` · <a href="/admin/customers/${customer.id}">${t('adm.account')}</a>` : html` · <span class="muted">${t('adm.guest')}</span>`}</p>
        <p><a href="tel:${o.phone}" dir="ltr">${o.phone}</a> · <a href="https://wa.me/${wa}" target="_blank" rel="noopener">${ic('whatsapp')} WhatsApp</a>${o.email ? html`<br><a href="mailto:${o.email}">${o.email}</a>` : ''}</p>
        <p>${o.address}<br>${o.city} — ${o.zone_name}</p>${o.notes ? html`<p class="note">${o.notes}</p>` : ''}
      </section>
      <section class="panel"><h2>${t('adm.internal_note')}</h2><form method="post" action="/admin/orders/${o.id}/note" class="stack">${csrf(ctx)}<textarea name="admin_note" rows="3" maxlength="2000">${o.admin_note || ''}</textarea><button class="btn btn-ghost">${t('common.save')}</button></form></section>
    </div>
  </div>`;
  return layout(ctx, { title: t('order.title', { n: o.number }), body, active: '/admin/orders' });
}

function invoice(ctx, { o, items }) {
  const { t, L, lang, s } = ctx;
  return html`<!doctype html><html lang="${lang}" dir="${lang === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><title>${o.number}</title><link rel="stylesheet" href="/assets/css/admin.css?v=${assetVersion}"><script src="/assets/js/admin.js?v=${assetVersion}" defer></script></head>
<body class="invoice" data-autoprint><div class="inv">
<header><div><h1>${L(s, 'store_name')}</h1><p>${L(s, 'address')}<br><span dir="ltr">${s.phone}</span> · ${s.email}</p></div>
<div class="inv-meta"><h2>${t('adm.invoice')}</h2><p><b dir="ltr">${o.number}</b><br><span dir="ltr">${fmtDate(o.created_at)}</span></p></div></header>
<section class="inv-to"><h3>${t('order.delivery_to')}</h3><p><b>${o.name}</b> · <span dir="ltr">${o.phone}</span><br>${o.address}, ${o.city}<br>${o.zone_name}</p>${o.notes ? html`<p><i>${o.notes}</i></p>` : ''}</section>
<table class="tbl"><thead><tr><th>${t('adm.product')}</th><th>SKU</th><th class="num">${t('adm.price')}</th><th class="num">${t('cart.qty')}</th><th class="num">${t('cart.total')}</th></tr></thead>
<tbody>${items.map((it) => html`<tr><td>${lang === 'ar' ? it.name_ar || it.name : it.name}${it.variant ? html` — ${lang === 'ar' ? it.variant_ar || it.variant : it.variant}` : ''}</td><td dir="ltr">${it.sku || ''}</td><td class="num">${ctx.money(it.price)}</td><td class="num">${it.qty}</td><td class="num">${ctx.money(it.price * it.qty)}</td></tr>`)}</tbody>
<tfoot><tr><td colspan="4">${t('cart.subtotal')}</td><td class="num">${ctx.money(o.subtotal)}</td></tr>${o.discount ? html`<tr><td colspan="4">${t('cart.discount')}</td><td class="num">-${ctx.money(o.discount)}</td></tr>` : ''}
<tr><td colspan="4">${t('cart.shipping')}</td><td class="num">${ctx.money(o.shipping)}</td></tr>${o.fee ? html`<tr><td colspan="4">${t('pay.cod_fee_label')}</td><td class="num">${ctx.money(o.fee)}</td></tr>` : ''}
<tr class="grand"><td colspan="4">${t('cart.total')}</td><td class="num">${ctx.money(o.total)}</td></tr></tfoot></table>
<p class="inv-pay">${t('order.payment')}: ${t(o.payment_method === 'card' ? 'pay.card' : 'pay.cod')} — ${t('paystatus.' + o.payment_status)}</p>
<p class="muted small center">${t('adm.thank_you')}</p></div></body></html>`;
}

// ---------- products ----------
function products(ctx, { rows, total, page, pages, q, cat, status, catOptions }) {
  const { t, L } = ctx;
  const listUrl = `/admin/products?q=${encodeURIComponent(q || '')}&cat=${cat || ''}&status=${status || ''}&page=${page}`;
  const back = html`<input type="hidden" name="back" value="${listUrl}">`;
  const body = html`<div class="bar"><form class="search" method="get">
    <input name="q" value="${q || ''}" placeholder="${t('adm.search_products')}">
    <select name="cat"><option value="">${t('adm.all_categories')}</option>${catOptions.map((c) => html`<option value="${c.id}"${sel(+cat === c.id)}>${c.label}</option>`)}</select>
    <select name="status"><option value="">${t('adm.all')}</option><option value="active"${sel(status === 'active')}>${t('adm.active')}</option><option value="hidden"${sel(status === 'hidden')}>${t('adm.hidden')}</option><option value="low"${sel(status === 'low')}>${t('adm.low_stock')}</option></select>
    <button class="btn btn-ghost">${ic('search')}</button></form>
    <div class="actions"><a class="btn btn-ghost" href="/admin/products/import">${ic('upload')} ${t('adm.import')}</a><a class="btn btn-ghost" href="/admin/products/export.csv">${ic('download')} CSV</a><a class="btn" href="/admin/products/new">${ic('plus')} ${t('adm.new_product')}</a></div></div>
  <p class="tip">${ic('bolt')} ${t('adm.quick_tip')}</p>
  <form id="bulk" class="bulkbar" method="post" action="/admin/products/bulk" data-bulk data-confirm-delete="${t('adm.confirm_bulk_delete')}">${csrf(ctx)}${back}
    <label class="check"><input type="checkbox" data-checkall> ${t('adm.select_all')}</label>
    <select name="action" data-bulk-action required><option value="">${t('adm.bulk_with')}</option>
      <option value="show">${t('adm.bulk.show')}</option><option value="hide">${t('adm.bulk.hide')}</option>
      <option value="sale">${t('adm.bulk.sale')}</option><option value="sale_off">${t('adm.bulk.sale_off')}</option>
      <option value="new_on">${t('adm.bulk.new_on')}</option><option value="new_off">${t('adm.bulk.new_off')}</option>
      <option value="best_on">${t('adm.bulk.best_on')}</option><option value="best_off">${t('adm.bulk.best_off')}</option>
      <option value="cat_add">${t('adm.bulk.cat_add')}</option><option value="cat_remove">${t('adm.bulk.cat_remove')}</option>
      <option value="delete">${t('adm.bulk.delete')}</option></select>
    <label class="bulk-opt" data-for="sale"><input name="percent" type="number" min="1" max="90" step="1" placeholder="%" class="w-num"> %</label>
    <select name="cat" class="bulk-opt" data-for="cat_add cat_remove"><option value="">${t('adm.bulk_choose_cat')}</option>${catOptions.map((c) => html`<option value="${c.id}">${c.label}</option>`)}</select>
    <button class="btn btn-ghost">${t('adm.apply')}</button> <small class="muted" data-bulk-count></small></form>
  <section class="panel"><div class="tbl-wrap"><table class="tbl plist"><thead><tr><th></th><th></th><th>${t('adm.product')}</th><th>${t('adm.price')} (${ctx.s.currency_symbol})</th><th>${t('adm.sale_price')}</th><th>${t('adm.stock')}</th><th>${t('adm.sold')}</th><th>${t('adm.status')}</th><th></th></tr></thead>
  <tbody>${rows.map((p) => {
    const fid = 'qe-' + p.id, shades = p.variants.length;
    return html`<tr data-row="${p.id}"><td><input type="checkbox" name="ids[]" value="${p.id}" form="bulk" aria-label="${L(p, 'name')}"></td>
    <td><a href="/admin/products/${p.id}"><img class="thumb" src="${p.images[0] || '/assets/img/placeholder.svg'}" alt=""></a></td>
    <td><a href="/admin/products/${p.id}"><b>${L(p, 'name')}</b></a><br><small class="muted">${ctx.lang === 'ar' ? p.name_en : p.name_ar}${shades ? ` · ${t('adm.n_shades', { n: shades })}` : ''}</small></td>
    <td><input class="qe" form="${fid}" name="price" type="number" min="0" step="any" value="${p.price}" required aria-label="${t('adm.price')}"></td>
    <td><input class="qe" form="${fid}" name="sale_price" type="number" min="0" step="any" value="${p.sale_price ?? ''}" placeholder="—" aria-label="${t('adm.sale_price')}">${p.pi.off ? html`<small class="off">-${p.pi.off}%</small>` : ''}</td>
    <td>${shades ? html`<a class="num ${p.stock <= 0 ? 'neg' : p.stock <= +ctx.s.low_stock ? 'warn' : ''}" href="/admin/products/${p.id}#shades" title="${t('adm.stock_in_shades')}">${p.stock}</a>`
      : html`<input class="qe w-num ${p.stock <= 0 ? 'neg' : p.stock <= +ctx.s.low_stock ? 'warn' : ''}" form="${fid}" name="stock" type="number" step="1" value="${p.stock}" aria-label="${t('adm.stock')}">`}</td>
    <td class="num">${p.sold}</td>
    <td><form method="post" action="/admin/products/${p.id}/toggle" data-toggle>${csrf(ctx)}${back}<button class="pill-btn ${p.active ? 'on' : ''}" title="${t('adm.toggle_hint')}" data-on="${t('adm.active')}" data-off="${t('adm.hidden')}">${p.active ? t('adm.active') : t('adm.hidden')}</button></form>${p.is_bestseller ? html` <span class="pill">★</span>` : ''}${p.is_new ? html` <span class="pill">${t('badge.new')}</span>` : ''}</td>
    <td class="nowrap"><form id="${fid}" method="post" action="/admin/products/${p.id}/quick" data-quick>${csrf(ctx)}${back}<button class="btn btn-ghost btn-xs" title="${t('common.save')}">${ic('check')} <span>${t('common.save')}</span></button></form>
      <a class="btn btn-ghost btn-xs" href="/admin/products/${p.id}" title="${t('adm.edit')}">${ic('edit')}</a></td></tr>`;
  })}</tbody></table></div>
  ${rows.length ? '' : html`<div class="empty-box"><p>${t('adm.no_products')}</p><a class="btn" href="/admin/products/new">${ic('plus')} ${t('adm.new_product')}</a></div>`}
  ${pager(page, pages, (n) => `/admin/products?q=${encodeURIComponent(q || '')}&cat=${cat || ''}&status=${status || ''}&page=${n}`)}<p class="muted small">${t('adm.total_n', { n: total })}</p></section>`;
  return layout(ctx, { title: t('adm.products'), body, active: '/admin/products' });
}

function productForm(ctx, { p, catTree, error }) {
  const { t } = ctx;
  const isNew = !p.id;
  const v = (k) => (p[k] == null ? '' : p[k]);
  const hint = (k) => (k ? html`<small class="muted">${t(k)}</small>` : '');
  const tx = (k, label, o = {}) => html`<label class="f ${o.cls || ''}"><span>${label}${o.req ? html` <b class="req">*</b>` : ''}</span><input name="${k}" value="${v(k)}"${o.dir ? raw(` dir="${o.dir}"`) : ''}${o.req === 'html' ? raw(' required') : ''}${o.type ? raw(` type="${o.type}" step="any" min="0"`) : ''}${o.ph ? raw(` placeholder="${o.ph}"`) : ''}${o.data ? raw(` ${o.data}`) : ''}>${hint(o.hint)}</label>`;
  const ta = (k, label, o = {}) => html`<label class="f"><span>${label}</span><textarea name="${k}" rows="${o.rows || 4}"${o.dir ? raw(` dir="${o.dir}"`) : ''}>${v(k)}</textarea></label>`;
  const flag = (k, label, h) => html`<label class="check"><input type="checkbox" name="${k}" value="1"${chk(+p[k])}> ${label}${h ? html` <small class="muted">— ${t(h)}</small>` : ''}</label>`;
  const catRow = (c, depth) => html`<label class="check" style="padding-inline-start:${depth * 18}px"><input type="checkbox" name="cats[]" value="${c.id}"${chk((p.catIds || []).includes(c.id))}> ${ctx.L(c, 'name')}</label>${c.children.map((k) => catRow(k, depth + 1))}`;
  const variants = p.variants || [];
  const vrow = (x = {}) => html`<tr data-vrow><td><input type="hidden" name="v_id[]" value="${x.id || ''}"><input type="color" name="v_color[]" value="${x.color || '#c2185b'}"></td>
    <td><input name="v_name_en[]" value="${x.name_en || ''}" placeholder="01 Rose"></td><td><input name="v_name_ar[]" dir="rtl" value="${x.name_ar || ''}" placeholder="01 وردي"></td>
    <td><input name="v_sku[]" value="${x.sku || ''}" dir="ltr"></td><td><input name="v_stock[]" type="number" value="${x.stock ?? 0}" class="w-num"></td>
    <td><div class="img1" data-img1><input type="hidden" name="v_image[]" value="${x.image || ''}"><img src="${x.image || ''}" alt=""${x.image ? '' : raw(' hidden')}><label class="btn btn-ghost btn-xs">${ic('upload')}<input type="file" accept="image/*" hidden></label><button type="button" class="btn btn-ghost btn-xs" data-clear>×</button></div></td>
    <td><button type="button" class="btn btn-ghost btn-xs" data-vdel aria-label="${t('adm.delete')}">${ic('trash')}</button></td></tr>`;
  const hasDetails = ['desc_en', 'desc_ar', 'howto_en', 'howto_ar', 'ingredients'].some((k) => v(k));
  const step = (n, title, sub) => html`<h2><span class="stepno">${n}</span> ${title}${sub ? html` <small class="muted">${sub}</small>` : ''}</h2>`;
  const body = html`${error ? html`<div class="alert alert-err">${error}</div>` : ''}
  ${isNew ? html`<div class="guide">${ic('sparkle')} <div><b>${t('adm.pguide_title')}</b><ol><li>${t('adm.pguide_1')}</li><li>${t('adm.pguide_2')}</li><li>${t('adm.pguide_3')}</li><li>${t('adm.pguide_4')}</li></ol></div></div>` : ''}
  <form method="post" action="/admin/products/${isNew ? 'new' : p.id}" class="pform" data-pform>${csrf(ctx)}
  <div class="grid2 wide-first"><div>
    <section class="panel">${step(1, t('adm.basic'))}
      <div class="row2">${tx('name_ar', t('adm.f.name_ar'), { dir: 'rtl' })}${tx('name_en', t('adm.f.name_en'), { dir: 'ltr' })}</div>
      <p class="muted small">${t('adm.names_hint')}</p>
      <div class="row2">${tx('short_ar', t('adm.f.short_ar'), { dir: 'rtl' })}${tx('short_en', t('adm.f.short_en'), { dir: 'ltr' })}</div>
    </section>
    <section class="panel">${step(2, t('adm.images'))}<div class="imgs" data-images><input type="hidden" name="images" value="${JSON.stringify(p.images || [])}"><div class="imgs-list"></div>
      <div class="dropzone"><label class="btn btn-ghost">${ic('upload')} ${t('adm.upload_images')}<input type="file" accept="image/*" multiple hidden></label><span class="muted small">${t('adm.drop_hint')}</span></div><p class="muted small">${t('adm.images_hint')}</p></div></section>
    <section class="panel" id="shades">${step(5, t('adm.shades'), t('adm.optional'))}<p class="muted small">${t('adm.shades_hint')}</p>
      <div class="tbl-wrap"><table class="tbl vtable"><thead><tr><th>${t('adm.color')}</th><th>${t('adm.f.name_en')}</th><th>${t('adm.f.name_ar')}</th><th>SKU</th><th>${t('adm.stock')}</th><th>${t('adm.image')}</th><th></th></tr></thead>
      <tbody data-vbody>${variants.map(vrow)}</tbody></table></div>
      <template data-vtpl>${vrow()}</template><button type="button" class="btn btn-ghost" data-vadd>${ic('plus')} ${t('adm.add_shade')}</button></section>
    <details class="panel"${hasDetails ? raw(' open') : ''}><summary>${step(6, t('adm.content'), t('adm.optional'))}</summary>
      <div class="row2">${ta('desc_ar', t('adm.f.desc_ar'), { dir: 'rtl' })}${ta('desc_en', t('adm.f.desc_en'), { dir: 'ltr' })}</div>
      <div class="row2">${ta('howto_ar', t('adm.f.howto_ar'), { dir: 'rtl', rows: 3 })}${ta('howto_en', t('adm.f.howto_en'), { dir: 'ltr', rows: 3 })}</div>
      ${ta('ingredients', t('pdp.ingredients'), { dir: 'ltr', rows: 3 })}<p class="muted small">${t('adm.rich_hint')}</p>
    </details>
    <details class="panel"><summary><h2>${ic('cog')} ${t('adm.advanced')} <small class="muted">${t('adm.optional')}</small></h2></summary>
      <div class="row2">${tx('slug', t('adm.f.slug'), { dir: 'ltr', ph: t('adm.auto'), hint: 'adm.slug_hint' })}${tx('sort', t('adm.sort'), { type: 'number', hint: 'adm.sort_hint' })}</div>
      <div class="row2">${tx('meta_title', t('adm.f.meta_title'))}${tx('meta_desc', t('adm.f.meta_desc'))}</div>
    </details>
  </div><div>
    <section class="panel">${step(3, t('adm.pricing'))}
      ${tx('price', t('adm.price') + ` (${ctx.s.currency_symbol})`, { req: 'html', type: 'number', data: 'data-price' })}
      ${tx('sale_price', t('adm.sale_price') + ` (${ctx.s.currency_symbol})`, { type: 'number', ph: t('adm.optional'), hint: 'adm.sale_hint', data: 'data-sale' })}<p class="sale-info small" data-sale-info data-tpl="${t('adm.sale_info')}" data-err="${t('adm.err.sale_price')}" aria-live="polite"></p>
      ${variants.length ? html`<p class="muted small">${t('adm.stock')}: <b>${p.stock}</b> — ${t('adm.stock_in_shades')}</p><input type="hidden" name="stock" value="${v('stock')}">` : tx('stock', t('adm.stock'), { type: 'number', hint: 'adm.stock_hint' })}
      ${tx('sku', t('adm.f.sku'), { dir: 'ltr', hint: 'adm.sku_hint' })}</section>
    <section class="panel">${step(4, t('adm.categories'))}<div class="cats">${catTree.map((c) => catRow(c, 0))}</div>
      <label class="f"><span>${t('adm.main_cat')}</span><select name="main_cat"><option value="">${t('adm.auto')}</option>${flatCats(catTree).map((c) => html`<option value="${c.id}"${sel(p.main_cat === c.id)}>${c.label}</option>`)}</select></label></section>
    <section class="panel"><h2>${t('adm.visibility')}</h2>
      ${flag('active', t('adm.active'), 'adm.active_hint')}${flag('is_new', t('badge.new'))}${flag('is_bestseller', t('badge.bestseller'))}${flag('is_limited', t('badge.limited'))}${flag('featured', t('adm.featured'), 'adm.featured_hint')}</section>
    <div class="sticky-actions"><button class="btn btn-block" data-save>${ic('check')} ${t('common.save')}</button>
      ${isNew ? html`<button class="btn btn-ghost btn-block" name="next" value="new">${ic('plus')} ${t('adm.save_add_another')}</button>` : html`<button class="btn btn-ghost btn-block" name="next" value="list">${t('adm.save_back')}</button>`}
      ${isNew ? '' : html`<a class="btn btn-ghost btn-block" href="/${ctx.lang}/p/${p.slug}" target="_blank">${ic('eye')} ${t('adm.view_in_store')}</a>`}
      <a class="btn btn-ghost btn-block" href="/admin/products">${ic('chev')} ${t('adm.back')}</a></div>
  </div></div></form>
  ${isNew ? '' : html`<div class="danger-row"><form method="post" action="/admin/products/${p.id}/duplicate">${csrf(ctx)}<button class="btn btn-ghost">${ic('copy')} ${t('adm.duplicate')}</button></form>
    <form method="post" action="/admin/products/${p.id}/delete" data-confirm="${t('adm.confirm_delete')}">${csrf(ctx)}<button class="btn btn-danger">${ic('trash')} ${t('adm.delete')}</button></form></div>`}`;
  return layout(ctx, { title: isNew ? t('adm.new_product') : ctx.L(p, 'name'), body, active: '/admin/products' });
}
const flatCats = (tree, depth = 0, out = []) => { for (const c of tree) { out.push({ id: c.id, label: '— '.repeat(depth) + c.name_en + ' / ' + c.name_ar }); flatCats(c.children, depth + 1, out); } return out; };

function importPage(ctx, result) {
  const { t } = ctx;
  const body = html`<section class="panel"><h2>${t('adm.import')}</h2><p class="muted">${t('adm.import_hint')}</p>
  <pre class="code" dir="ltr">slug,sku,name_en,name_ar,short_en,short_ar,price,sale_price,stock,categories,main_category,is_new,is_bestseller,is_limited,featured,active,images,variants,desc_en,desc_ar,howto_en,howto_ar,ingredients</pre>
  <p class="muted small" dir="ltr">categories: lipstick|desert-rose · images: /uploads/a.jpg|/uploads/b.jpg · variants: 01 Rose~01 وردي~#c98b86~SKU1~25~/uploads/x.jpg|02 Red~02 أحمر~#b3263e~SKU2~10~</p>
  <form method="post" action="/admin/products/import" data-csv class="stack">${csrf(ctx)}<input type="hidden" name="csv"><input type="file" accept=".csv,text/csv" required>
  <button class="btn">${ic('upload')} ${t('adm.import')}</button></form>
  ${result ? html`<div class="alert ${result.errors.length ? 'alert-err' : 'alert-ok'}">${t('adm.import_result', { c: result.created, u: result.updated })}${result.errors.length ? html`<ul>${result.errors.slice(0, 30).map((e) => html`<li>${e}</li>`)}</ul>` : ''}</div>` : ''}
  <p><a href="/admin/products/export.csv">${ic('download')} ${t('adm.export_template')}</a></p></section>`;
  return layout(ctx, { title: t('adm.import'), body, active: '/admin/products' });
}

// ---------- generic CRUD (categories, zones, coupons, banners, sections, pages) ----------
function resList(ctx, { res, def, rows }) {
  const { t } = ctx;
  const body = html`<div class="bar"><p class="muted">${def.hint ? t(def.hint) : ''}</p><div class="actions"><a class="btn" href="/admin/r/${res}/new">${ic('plus')} ${t('adm.add')}</a></div></div>
  <section class="panel"><div class="tbl-wrap"><table class="tbl"><thead><tr>${def.cols.map((c) => html`<th>${t(c.label)}</th>`)}<th></th></tr></thead>
  <tbody>${rows.map((r) => html`<tr>${def.cols.map((c) => html`<td>${c.render ? c.render(r, ctx) : r[c.k]}</td>`)}<td class="nowrap"><a class="btn btn-ghost btn-xs" href="/admin/r/${res}/${r.id}">${ic('edit')}</a></td></tr>`)}</tbody></table></div>
  ${rows.length ? '' : html`<p class="muted">${t('adm.no_data')}</p>`}</section>`;
  return layout(ctx, { title: t(def.title), body, active: '/admin/r/' + res });
}

function resForm(ctx, { res, def, row, error }) {
  const { t } = ctx;
  const isNew = !row.id;
  const input = (f) => {
    const v = row[f.k] ?? (isNew ? f.def ?? '' : '');
    const req = f.req ? raw(' required') : '';
    const dir = f.dir ? raw(` dir="${f.dir}"`) : '';
    switch (f.type) {
      case 'textarea': return html`<textarea name="${f.k}" rows="${f.rows || 4}"${dir}${req}>${v}</textarea>`;
      case 'select': return html`<select name="${f.k}"${req}>${(typeof f.options === 'function' ? f.options() : f.options).map((o) => html`<option value="${o.v}"${sel(String(v) === String(o.v))}>${o.l.startsWith('adm.') || o.l.startsWith('status.') ? t(o.l) : o.l}</option>`)}</select>`;
      case 'bool': return html`<input type="checkbox" name="${f.k}" value="1"${chk(+v)}>`;
      case 'number': return html`<input type="number" step="any" name="${f.k}" value="${v}"${req}${f.ph ? raw(` placeholder="${t(f.ph)}"`) : ''}>`;
      case 'date': return html`<input type="date" name="${f.k}" value="${v}">`;
      case 'color': return html`<span class="color-f"><input type="color" name="${f.k}" value="${v || '#f4efec'}"><input type="text" value="${v || ''}" data-color-text dir="ltr" maxlength="7"></span>`;
      case 'image': return html`<div class="img1 lg" data-img1><input type="hidden" name="${f.k}" value="${v}"><img src="${v}" alt=""${v ? '' : raw(' hidden')}><label class="btn btn-ghost btn-xs">${ic('upload')} ${t('adm.upload')}<input type="file" accept="image/*" hidden></label><button type="button" class="btn btn-ghost btn-xs" data-clear>×</button></div>`;
      default: return html`<input name="${f.k}" value="${v}"${dir}${req}${f.ph ? raw(` placeholder="${t(f.ph)}"`) : ''}${f.max ? raw(` maxlength="${f.max}"`) : ''}>`;
    }
  };
  const body = html`${error ? html`<div class="alert alert-err">${error}</div>` : ''}
  <form method="post" action="/admin/r/${res}/${isNew ? 'new' : row.id}" class="panel rform">${csrf(ctx)}
    <div class="fgrid">${def.fields.map((f) => html`<label class="f ${f.wide ? 'wide' : ''} ${f.type === 'bool' ? 'inline' : ''}"><span>${t(f.label)}${f.req ? ' *' : ''}</span>${input(f)}${f.hint ? html`<small class="muted">${t(f.hint)}</small>` : ''}</label>`)}</div>
    <div class="form-actions"><button class="btn">${t('common.save')}</button><a class="btn btn-ghost" href="/admin/r/${res}">${t('adm.cancel')}</a></div>
  </form>
  ${isNew ? '' : html`<form method="post" action="/admin/r/${res}/${row.id}/delete" data-confirm="${t('adm.confirm_delete')}" class="danger-row">${csrf(ctx)}<button class="btn btn-danger">${ic('trash')} ${t('adm.delete')}</button></form>`}`;
  return layout(ctx, { title: `${t(def.title)} · ${isNew ? t('adm.add') : t('adm.edit')}`, body, active: '/admin/r/' + res });
}

// ---------- users (admins + customers) / my account / messages / subscribers ----------
function customers(ctx, { rows, q, role, total, page, pages, counts }) {
  const { t } = ctx;
  const tab = (r, label) => html`<a class="${(role || '') === r ? 'on' : ''}" href="/admin/customers${r ? '?role=' + r : ''}">${t(label)} <b>${counts[r || 'all'] || 0}</b></a>`;
  const body = html`<div class="bar"><nav class="tabs">${tab('', 'adm.all')}${tab('admin', 'adm.admins')}${tab('customer', 'adm.customers')}</nav>
    <div class="actions"><form class="search" method="get"><input type="hidden" name="role" value="${role || ''}"><input name="q" value="${q || ''}" placeholder="${t('adm.search_customers')}"><button class="btn btn-ghost">${ic('search')}</button></form>
    <a class="btn btn-ghost" href="/admin/customers/export.csv">${ic('download')} CSV</a><a class="btn" href="/admin/customers/new">${ic('plus')} ${t('adm.add_user')}</a></div></div>
  <section class="panel"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>${t('co.name')}</th><th>${t('adm.role')}</th><th>${t('common.email')}</th><th>${t('co.phone')}</th><th class="num">${t('adm.orders')}</th><th class="num">${t('adm.spent')}</th><th>${t('adm.joined')}</th><th></th></tr></thead>
  <tbody>${rows.map((u) => html`<tr><td><a href="/admin/customers/${u.id}"><b>${u.name}</b></a>${u.id === ctx.user.id ? html` <span class="pill">${t('adm.you')}</span>` : ''}</td>
    <td>${u.role === 'admin' ? html`<span class="pill on">${t('adm.role_admin_short')}</span>` : html`<span class="pill">${t('adm.role_customer')}</span>`}</td>
    <td dir="ltr">${u.email}</td><td dir="ltr">${u.phone || ''}</td><td class="num">${u.orders}</td><td class="num">${ctx.money(u.spent)}</td><td dir="ltr">${fmtDate(u.created_at, false)}</td>
    <td class="nowrap"><a class="btn btn-ghost btn-xs" href="/admin/customers/${u.id}">${ic('edit')} ${t('adm.edit')}</a></td></tr>`)}</tbody></table></div>
  ${rows.length ? '' : html`<p class="muted">${t('adm.no_data')}</p>`}
  ${pager(page, pages, (n) => `/admin/customers?role=${role || ''}&q=${encodeURIComponent(q || '')}&page=${n}`)}<p class="muted small">${t('adm.total_n', { n: total })}</p></section>`;
  return layout(ctx, { title: t('adm.users'), body, active: '/admin/customers' });
}

// Shared user form (new user, edit user)
function userFields(ctx, u = {}, { isNew, self } = {}) {
  const { t } = ctx;
  return html`<div class="fgrid">
    <label class="f"><span>${t('co.name')} *</span><input name="name" required maxlength="80" value="${u.name || ''}"></label>
    <label class="f"><span>${t('adm.role')} *</span><select name="role"${self ? raw(' disabled') : ''}><option value="customer"${sel(u.role !== 'admin')}>${t('adm.role_customer')}</option><option value="admin"${sel(u.role === 'admin')}>${t('adm.role_admin')}</option></select>
      ${self ? html`<small class="muted">${t('adm.err.self_role')}</small>` : html`<small class="muted">${t('adm.role_hint')}</small>`}</label>
    <label class="f"><span>${t('common.email')} *</span><input name="email" type="email" required maxlength="120" dir="ltr" value="${u.email || ''}" autocomplete="off"></label>
    <label class="f"><span>${t('co.phone')}</span><input name="phone" type="tel" maxlength="20" dir="ltr" value="${u.phone || ''}"></label>
    <label class="f"><span>${isNew ? t('acc.password') + ' *' : t('adm.new_password_optional')}</span><input name="password" type="text" minlength="8" maxlength="200" autocomplete="new-password"${isNew ? raw(' required') : ''} placeholder="${t('acc.password_hint')}"></label>
    <label class="f inline"><span>${t('acc.newsletter')}</span><input type="checkbox" name="newsletter" value="1"${chk(+u.newsletter)}></label>
  </div>`;
}

function userNew(ctx, { u = {}, error } = {}) {
  const { t } = ctx;
  const body = html`<div class="bar"><a class="btn btn-ghost" href="/admin/customers">${ic('chev')} ${t('adm.back')}</a></div>
  ${error ? html`<div class="alert alert-err">${error}</div>` : ''}
  <form method="post" action="/admin/customers/new" class="panel rform">${csrf(ctx)}<h2>${t('adm.add_user')}</h2>${userFields(ctx, u, { isNew: true })}
    <div class="form-actions"><button class="btn">${t('common.save')}</button><a class="btn btn-ghost" href="/admin/customers">${t('adm.cancel')}</a></div></form>`;
  return layout(ctx, { title: t('adm.add_user'), body, active: '/admin/customers' });
}

function customer(ctx, { u, orders, error }) {
  const { t } = ctx;
  const self = ctx.user.id === u.id;
  const body = html`<div class="bar"><a class="btn btn-ghost" href="/admin/customers">${ic('chev')} ${t('adm.back')}</a>
    ${u.phone ? html`<a class="btn btn-ghost" href="https://wa.me/${waNumber(u.phone)}" target="_blank" rel="noopener">${ic('whatsapp')} WhatsApp</a>` : ''}</div>
  ${error ? html`<div class="alert alert-err">${error}</div>` : ''}
  <div class="grid2 wide-first">
    <div><form method="post" action="/admin/customers/${u.id}/save" class="panel rform">${csrf(ctx)}<h2>${u.name} ${u.role === 'admin' ? html`<span class="pill on">${t('adm.role_admin_short')}</span>` : ''}</h2>
      ${userFields(ctx, u, { self })}
      <p class="muted small">${t('adm.joined')}: <span dir="ltr">${fmtDate(u.created_at)}</span>${u.address ? html` · ${u.address} ${u.city || ''}` : ''}</p>
      <div class="form-actions"><button class="btn">${t('common.save')}</button></div></form>
    <section class="panel"><h2>${t('adm.orders')}</h2>${ordersTable(ctx, orders)}</section></div>
    <div>${self ? html`<section class="panel"><p>${t('adm.self_note')}</p><a class="btn btn-ghost" href="/admin/account">${t('adm.my_account')}</a></section>`
    : html`<section class="panel"><h2>${t('adm.delete_user')}</h2><p class="muted small">${t('adm.delete_user_hint')}</p>
      <form method="post" action="/admin/customers/${u.id}/delete" data-confirm="${t('adm.confirm_delete')}">${csrf(ctx)}<button class="btn btn-danger">${ic('trash')} ${t('adm.delete')}</button></form></section>`}</div>
  </div>`;
  return layout(ctx, { title: u.name, body, active: '/admin/customers' });
}

function account(ctx, { error } = {}) {
  const { t } = ctx;
  const u = ctx.user;
  const body = html`${error ? html`<div class="alert alert-err">${error}</div>` : ''}
  <div class="grid2">
    <form method="post" action="/admin/account" class="panel rform">${csrf(ctx)}<h2>${t('adm.my_details')}</h2>
      <label class="f"><span>${t('co.name')}</span><input name="name" required maxlength="80" value="${u.name}"></label>
      <label class="f"><span>${t('adm.login_email')}</span><input name="email" type="email" required maxlength="120" dir="ltr" value="${u.email}" autocomplete="username"></label>
      <label class="f"><span>${t('adm.new_password_optional')}</span><input name="password" type="password" minlength="8" maxlength="200" autocomplete="new-password" placeholder="${t('acc.password_hint')}"></label>
      <label class="f"><span>${t('adm.confirm_password')}</span><input name="password2" type="password" maxlength="200" autocomplete="new-password"></label>
      <label class="f"><span>${t('acc.current_password')} *</span><input name="current" type="password" required autocomplete="current-password"><small class="muted">${t('adm.current_pw_hint')}</small></label>
      <div class="form-actions"><button class="btn">${t('common.save')}</button></div></form>
    <section class="panel"><h2>${t('adm.account_help_title')}</h2><p>${t('adm.account_help')}</p><p class="muted small">${t('adm.account_cli')}</p><pre class="code" dir="ltr">npm run reset-admin -- you@yourdomain.ps "new-long-password"</pre></section>
  </div>`;
  return layout(ctx, { title: t('adm.my_account'), body, active: '/admin/account' });
}

function messages(ctx, rows) {
  const { t } = ctx;
  const body = html`<section class="panel">${rows.length ? html`<ul class="msgs">${rows.map((m) => html`<li class="${m.read ? '' : 'unread'}"><div class="msg-h"><b>${m.name}</b> <a href="mailto:${m.email}" dir="ltr">${m.email}</a> ${m.phone ? html`<span dir="ltr">${m.phone}</span>` : ''} <small class="muted" dir="ltr">${fmtDate(m.created_at)}</small></div>
    <p class="msg-b">${m.body}</p><div class="actions">${m.read ? '' : html`<form method="post" action="/admin/messages/${m.id}/read">${csrf(ctx)}<button class="btn btn-ghost btn-xs">${ic('check')} ${t('adm.mark_read')}</button></form>`}
    <a class="btn btn-ghost btn-xs" href="mailto:${m.email}">${ic('mail')} ${t('adm.reply')}</a><form method="post" action="/admin/messages/${m.id}/delete" data-confirm="${t('adm.confirm_delete')}">${csrf(ctx)}<button class="btn btn-ghost btn-xs">${ic('trash')}</button></form></div></li>`)}</ul>` : html`<p class="muted">${t('adm.no_data')}</p>`}</section>`;
  return layout(ctx, { title: t('adm.messages'), body, active: '/admin/messages' });
}

function subscribers(ctx, rows) {
  const { t } = ctx;
  const body = html`<div class="bar"><p class="muted">${t('adm.total_n', { n: rows.length })}</p><div class="actions"><a class="btn btn-ghost" href="/admin/subscribers/export.csv">${ic('download')} CSV</a></div></div>
  <section class="panel"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>${t('common.email')}</th><th>${t('adm.lang')}</th><th>${t('adm.joined')}</th><th></th></tr></thead><tbody>${rows.map((s) => html`<tr><td dir="ltr">${s.email}</td><td>${s.lang}</td><td dir="ltr">${fmtDate(s.created_at, false)}</td><td><form method="post" action="/admin/subscribers/${s.id}/delete">${csrf(ctx)}<button class="btn btn-ghost btn-xs">${ic('trash')}</button></form></td></tr>`)}</tbody></table></div></section>`;
  return layout(ctx, { title: t('adm.subscribers'), body, active: '/admin/subscribers' });
}

// ---------- settings ----------
function settings(ctx, { s, smtpEnv }) {
  const t = (k, vars) => (/^[a-z]+\.[\w.]+$/.test(k) ? ctx.t(k, vars) : k); // plain labels (e.g. "SMTP host") pass through
  const v = (k) => s[k] ?? '';
  const tx = (k, label, o = {}) => html`<label class="f ${o.wide ? 'wide' : ''}"><span>${t(label)}</span><input name="${k}" value="${v(k)}"${o.dir ? raw(` dir="${o.dir}"`) : ''}${o.type ? raw(` type="${o.type}" step="any"`) : ''}${o.ph ? raw(` placeholder="${o.ph}"`) : ''}>${o.hint ? html`<small class="muted">${t(o.hint)}</small>` : ''}</label>`;
  const ta = (k, label, o = {}) => html`<label class="f ${o.wide ? 'wide' : ''}"><span>${t(label)}</span><textarea name="${k}" rows="${o.rows || 3}"${o.dir ? raw(` dir="${o.dir}"`) : ''}>${v(k)}</textarea>${o.hint ? html`<small class="muted">${t(o.hint)}</small>` : ''}</label>`;
  const secret = (k, label) => html`<label class="f"><span>${t(label)}</span><input name="${k}" type="password" autocomplete="new-password" placeholder="${v(k) ? '•••••••• ' + t('adm.unchanged') : ''}"></label>`;
  const yes = (k, label) => html`<label class="f inline"><span>${t(label)}</span><input type="hidden" name="${k}" value="0"><input type="checkbox" name="${k}" value="1"${chk(v(k) === '1')}></label>`;
  const sec = (id, title, inner) => html`<section class="panel" id="${id}"><h2>${t(title)}</h2><div class="fgrid">${inner}</div></section>`;
  const color = (k, label) => html`<label class="f"><span>${t(label)}</span><span class="color-f"><input type="color" name="${k}" value="${v(k) || '#000000'}"><input type="text" value="${v(k)}" data-color-text dir="ltr" maxlength="7"></span></label>`;
  const body = html`<nav class="tabs sticky">${[['general', 'adm.s.general'], ['theme', 'adm.s.theme'], ['commerce', 'adm.s.commerce'], ['payments', 'adm.s.payments'], ['invoices', 'adm.s.invoices'], ['marketing', 'adm.s.marketing'], ['notify', 'adm.s.notify'], ['seo', 'adm.s.seo'], ['backup', 'adm.s.backup']].map(([id, k]) => html`<a href="#${id}">${t(k)}</a>`)}</nav>
  <form method="post" action="/admin/settings">${csrf(ctx)}
  ${sec('general', 'adm.s.general', html`${tx('store_name_en', 'adm.f.store_name_en', { dir: 'ltr' })}${tx('store_name_ar', 'adm.f.store_name_ar', { dir: 'rtl' })}
    ${tx('tagline_en', 'adm.f.tagline_en', { dir: 'ltr' })}${tx('tagline_ar', 'adm.f.tagline_ar', { dir: 'rtl' })}
    <label class="f"><span>${t('adm.f.logo')}</span><div class="img1 lg" data-img1 data-logo><input type="hidden" name="logo" value="${v('logo')}"><img src="${v('logo')}" alt=""${v('logo') ? '' : raw(' hidden')}><label class="btn btn-ghost btn-xs">${ic('upload')} ${t('adm.upload')}<input type="file" accept="image/*" hidden></label><button type="button" class="btn btn-ghost btn-xs" data-clear>×</button></div><small class="muted">${t('adm.f.logo_hint')}</small></label>
    ${tx('email', 'common.email', { dir: 'ltr', type: 'email' })}${tx('phone', 'co.phone', { dir: 'ltr' })}${tx('whatsapp', 'adm.f.whatsapp', { dir: 'ltr', hint: 'adm.f.whatsapp_hint' })}
    ${tx('address_en', 'adm.f.address_en', { dir: 'ltr' })}${tx('address_ar', 'adm.f.address_ar', { dir: 'rtl' })}${tx('hours_en', 'adm.f.hours_en', { dir: 'ltr' })}${tx('hours_ar', 'adm.f.hours_ar', { dir: 'rtl' })}
    ${tx('instagram', 'Instagram URL', { dir: 'ltr' })}${tx('facebook', 'Facebook URL', { dir: 'ltr' })}${tx('tiktok', 'TikTok URL', { dir: 'ltr' })}`)}
  ${sec('theme', 'adm.s.theme', html`${color('theme_ink', 'adm.f.theme_ink')}${color('theme_accent', 'adm.f.theme_accent')}${color('theme_sale', 'adm.f.theme_sale')}${color('theme_soft', 'adm.f.theme_soft')}<p class="muted small wide">${t('adm.f.theme_hint')}</p>`)}
  ${sec('commerce', 'adm.s.commerce', html`${tx('currency', 'adm.f.currency', { dir: 'ltr' })}${tx('currency_symbol', 'adm.f.currency_symbol')}
    ${tx('free_shipping_min', 'adm.f.free_shipping_min', { type: 'number', hint: 'adm.f.free_shipping_hint' })}${tx('min_order', 'adm.f.min_order', { type: 'number' })}
    ${tx('sitewide_discount', 'adm.f.sitewide_discount', { type: 'number', hint: 'adm.f.sitewide_hint' })}${tx('low_stock', 'adm.f.low_stock', { type: 'number' })}${tx('order_prefix', 'adm.f.order_prefix', { dir: 'ltr' })}`)}
  ${sec('payments', 'adm.s.payments', html`${yes('cod_enabled', 'pay.cod')}${tx('cod_fee', 'adm.f.cod_fee', { type: 'number' })}${yes('card_enabled', 'pay.card')}
    <label class="f"><span>${t('adm.f.card_provider')}</span><select name="card_provider"><option value="paytabs"${sel(v('card_provider') === 'paytabs')}>PayTabs</option><option value="mock"${sel(v('card_provider') === 'mock')}>${t('adm.f.test_mode')}</option></select></label>
    ${tx('paytabs_profile_id', 'adm.f.pt_profile', { dir: 'ltr' })}${secret('paytabs_server_key', 'adm.f.pt_key')}
    ${tx('paytabs_domain', 'adm.f.pt_domain', { dir: 'ltr', hint: 'adm.f.pt_domain_hint' })}${tx('paytabs_currency', 'adm.f.pt_currency', { dir: 'ltr', hint: 'adm.f.pt_currency_hint' })}
    ${tx('paytabs_rate', 'adm.f.pt_rate', { type: 'number', hint: 'adm.f.pt_rate_hint' })}${tx('card_timeout_hours', 'adm.f.card_timeout', { type: 'number' })}
    <p class="muted small wide">${t('adm.f.pt_urls')} <code dir="ltr">/pay/paytabs/callback</code> · <code dir="ltr">/pay/paytabs/return</code></p>`)}
  ${sec('invoices', 'adm.s.invoices', html`<p class="muted small wide">${t('adm.f.invoice_hint')}</p>
    ${tx('invoice_title_en', 'adm.f.invoice_title_en', { dir: 'ltr' })}${tx('invoice_title_ar', 'adm.f.invoice_title_ar', { dir: 'rtl' })}
    ${tx('company_name', 'adm.f.company_name')}${tx('tax_id', 'adm.f.tax_id', { dir: 'ltr' })}
    ${tx('vat_rate', 'adm.f.vat_rate', { type: 'number', hint: 'adm.f.vat_hint' })}${yes('invoice_email_enabled', 'adm.f.invoice_email')}
    ${ta('invoice_note_en', 'adm.f.invoice_note_en', { dir: 'ltr', hint: 'adm.f.invoice_note_hint' })}${ta('invoice_note_ar', 'adm.f.invoice_note_ar', { dir: 'rtl' })}`)}
  ${sec('marketing', 'adm.s.marketing', html`${ta('announcements_en', 'adm.f.announcements_en', { dir: 'ltr', hint: 'adm.f.one_per_line' })}${ta('announcements_ar', 'adm.f.announcements_ar', { dir: 'rtl', hint: 'adm.f.one_per_line' })}
    ${tx('announcement_link', 'adm.f.link', { dir: 'ltr', ph: '/sale' })}<span></span>
    ${yes('promo_enabled', 'adm.f.promo')}<label class="f"><span>${t('adm.f.promo_ends')}</span><input type="datetime-local" name="promo_ends" value="${utcToZonedInput(v('promo_ends'))}"></label>
    ${tx('promo_text_en', 'adm.f.promo_text_en', { dir: 'ltr' })}${tx('promo_text_ar', 'adm.f.promo_text_ar', { dir: 'rtl' })}${tx('promo_link', 'adm.f.link', { dir: 'ltr', ph: '/sale' })}<span></span>
    ${yes('popup_enabled', 'adm.f.popup')}${tx('popup_coupon', 'adm.f.popup_coupon', { dir: 'ltr' })}
    ${tx('popup_title_en', 'adm.f.popup_title_en', { dir: 'ltr' })}${tx('popup_title_ar', 'adm.f.popup_title_ar', { dir: 'rtl' })}
    ${tx('popup_text_en', 'adm.f.popup_text_en', { dir: 'ltr' })}${tx('popup_text_ar', 'adm.f.popup_text_ar', { dir: 'rtl' })}`)}
  ${sec('notify', 'adm.s.notify', html`${tx('notify_email', 'adm.f.notify_email', { dir: 'ltr', hint: 'adm.f.notify_email_hint' })}<span></span>
    ${smtpEnv ? html`<p class="wide muted">${t('adm.f.smtp_env')}</p>` : html`${tx('smtp_host', 'SMTP host', { dir: 'ltr', ph: 'smtp.gmail.com' })}${tx('smtp_port', 'SMTP port', { type: 'number', ph: '465' })}
    ${tx('smtp_user', 'SMTP user', { dir: 'ltr' })}${secret('smtp_pass', 'SMTP password')}${tx('smtp_from', 'adm.f.smtp_from', { dir: 'ltr', ph: 'Store <info@yourdomain.com>' })}<span></span>`}
    ${secret('telegram_token', 'adm.f.tg_token')}${tx('telegram_chat', 'adm.f.tg_chat', { dir: 'ltr' })}<p class="muted small wide">${t('adm.f.tg_hint')}</p>`)}
  ${sec('seo', 'adm.s.seo', html`${tx('meta_title_en', 'adm.f.meta_title_en', { dir: 'ltr' })}${tx('meta_title_ar', 'adm.f.meta_title_ar', { dir: 'rtl' })}${ta('meta_desc_en', 'adm.f.meta_desc_en', { dir: 'ltr' })}${ta('meta_desc_ar', 'adm.f.meta_desc_ar', { dir: 'rtl' })}`)}
  <div class="sticky-save"><button class="btn">${t('common.save')}</button></div></form>
  <section class="panel" id="backup"><h2>${t('adm.s.backup')}</h2><p class="muted">${t('adm.backup_hint')}</p><div class="actions">
    <a class="btn" href="/admin/backup">${ic('download')} ${t('adm.download_backup')}</a>
    <form method="post" action="/admin/settings/test-email">${csrf(ctx)}<button class="btn btn-ghost">${ic('mail')} ${t('adm.test_email')}</button></form>
    <form method="post" action="/admin/settings/test-telegram">${csrf(ctx)}<button class="btn btn-ghost">${ic('chat')} ${t('adm.test_telegram')}</button></form></div></section>`;
  return layout(ctx, { title: t('adm.settings'), body, active: '/admin/settings' });
}

function pager(page, pages, href) {
  if (pages <= 1) return '';
  const nums = [];
  for (let i = 1; i <= pages; i++) if (i === 1 || i === pages || Math.abs(i - page) <= 2) nums.push(i); else if (nums[nums.length - 1] !== '…') nums.push('…');
  return html`<nav class="pager">${nums.map((n) => (n === '…' ? html`<span>…</span>` : n === page ? html`<b>${n}</b>` : html`<a href="${href(n)}">${n}</a>`))}</nav>`;
}

module.exports = { stats, layout, login, dashboard, orders, orderDetail, invoice, products, productForm, importPage, resList, resForm, customers, customer, userNew, account, messages, subscribers, settings, flatCats, json };
