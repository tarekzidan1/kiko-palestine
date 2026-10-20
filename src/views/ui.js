'use strict';
// Storefront layout (header, mega menu, footer, drawers) + shared components (cards, rails, prices...).
const cfg = require('../config');
const { html, raw, json } = require('../html');
const { cats } = require('../catalog');
const { pages, assetVersion, baseUrl } = require('../content');
const { mix } = require('../art');

// ---------- icons (one inline sprite, referenced with <use>) ----------
const ICONS = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  heart: '<path d="M12 20s-7-4.4-9-9a4.8 4.8 0 0 1 9-3 4.8 4.8 0 0 1 9 3c-2 4.6-9 9-9 9z"/>',
  bag: '<path d="M5 8h14l-1 12H6L5 8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  chev: '<path d="m9 6 6 6-6 6"/>',
  chevd: '<path d="m6 9 6 6 6-6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  truck: '<path d="M3 6h11v10H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
  cash: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="3"/>',
  card: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  whatsapp: '<path d="M20 12a8 8 0 0 1-11.8 7L4 20l1.1-4A8 8 0 1 1 20 12z"/><path d="M9 9c0 3 3 6 6 6l1-1.5-2-1-1 .8c-1-.4-1.9-1.3-2.3-2.3l.8-1-1-2L9 9z"/>',
  instagram: '<rect x="4" y="4" width="16" height="16" rx="5"/><circle cx="12" cy="12" r="3.5"/><circle cx="17" cy="7" r=".6"/>',
  facebook: '<path d="M14 8h3V4h-3a4 4 0 0 0-4 4v3H7v4h3v6h4v-6h3l1-4h-4V8z"/>',
  tiktok: '<path d="M14 4v10.5a3.5 3.5 0 1 1-3.5-3.5"/><path d="M14 4c.5 2.5 2.5 4 5 4"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  pin: '<path d="M12 21s7-6 7-12a7 7 0 0 0-14 0c0 6 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  gift: '<rect x="3" y="8" width="18" height="5"/><path d="M5 13v8h14v-8M12 8v13M12 8c-2-4-6-4-6-1s6 1 6 1zm0 0c2-4 6-4 6-1s-6 1-6 1z"/>',
  play: '<circle cx="12" cy="12" r="9"/><path d="m10 8 6 4-6 4z"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 10h8M8 13h5"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 16l.7 1.8 1.8.7-1.8.7L19 21l-.7-1.8-1.8-.7 1.8-.7z"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
  return: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
  filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
  logout: '<path d="M15 4h4v16h-4M10 16l4-4-4-4M14 12H4"/>',
  box: '<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
  invoice: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>',
};
const sprite = raw(`<svg width="0" height="0" class="sprite" aria-hidden="true" focusable="false">${Object.entries(ICONS).map(([k, d]) => `<symbol id="i-${k}" viewBox="0 0 24 24">${d}</symbol>`).join('')}</svg>`);
const icon = (name, cls = '') => raw(`<svg class="ic ${cls}" aria-hidden="true" focusable="false"><use href="#i-${name}"/></svg>`);

const PLACEHOLDER = '/assets/img/placeholder.svg';
// Plain text logo (the store name on one line). Upload an image logo in Admin → Settings to replace it.
const wordmark = (name, cls = '') => html`<span class="wordmark ${cls}">${String(name || '').trim()}</span>`;
const abs = (ctx, u) => (/^https?:/.test(u) ? u : baseUrl(ctx) + u);

// ---------- components ----------
const priceTag = (ctx, pi, cls = '') => html`<div class="price ${cls}">${pi.off
  ? html`<ins>${ctx.money(pi.price)}</ins> <del>${ctx.money(pi.regular)}</del>`
  : html`<span>${ctx.money(pi.price)}</span>`}</div>`;

const wishBtn = (ctx, pid, cls = '') => {
  const on = ctx.wishIds?.has(pid);
  return html`<button type="button" class="wish ${cls}${on ? ' on' : ''}" data-wish="${pid}" aria-pressed="${on ? 'true' : 'false'}" aria-label="${ctx.t('wish.toggle')}">${icon('heart')}</button>`;
};

function card(ctx, p, { lazy = true } = {}) {
  const { t, L, u } = ctx;
  const vs = p.variants || [];
  const v0 = vs.find((v) => v.stock > 0) || vs[0];
  const img = (v0 && v0.image) || p.images[0] || PLACEHOLDER;
  const out = p.stock <= 0;
  const href = u('/p/' + p.slug);
  const badges = [p.is_bestseller && ['best', t('badge.bestseller')], p.is_new && ['new', t('badge.new')], p.is_limited && ['ltd', t('badge.limited')]].filter(Boolean).slice(0, 2);
  const shown = vs.slice(0, 5);
  return html`<article class="card${out ? ' is-out' : ''}" data-pid="${p.id}" data-vid="${v0 ? v0.id : 0}">
  <div class="card-media">
    <a href="${href}" class="card-img" tabindex="-1" aria-hidden="true"><img src="${img}" alt="" width="600" height="600" loading="${lazy ? 'lazy' : 'eager'}" data-main>${p.images[1] && !vs.length ? html`<img class="alt" src="${p.images[1]}" alt="" loading="lazy">` : ''}</a>
    <div class="badges">${badges.map(([k, l]) => html`<span class="badge b-${k}">${l}</span>`)}${p.pi.off ? html`<span class="badge b-off">-${p.pi.off}%</span>` : ''}</div>
    ${wishBtn(ctx, p.id)}
  </div>
  <div class="card-body">
    ${vs.length > 1 ? html`<div class="sw-row">${shown.map((v) => html`<button type="button" class="sw${v === v0 ? ' on' : ''}${v.stock <= 0 ? ' sw-out' : ''}" style="--c:${v.color || '#ccc'}" data-vid="${v.id}" data-img="${v.image || ''}" aria-label="${L(v, 'name')}" title="${L(v, 'name')}"></button>`)}${vs.length > shown.length ? html`<a class="sw-more" href="${href}">+${vs.length - shown.length}</a>` : ''}</div>` : ''}
    <h3 class="card-title"><a href="${href}">${L(p, 'name')}</a></h3>
    ${L(p, 'short') ? html`<p class="card-sub">${L(p, 'short')}</p>` : ''}
    ${priceTag(ctx, p.pi)}
    ${out ? html`<button type="button" class="btn btn-sm btn-block btn-ghost" disabled>${t('pdp.out_of_stock')}</button>`
    : html`<button type="button" class="btn btn-sm btn-block btn-dark" data-add>${t('card.add')}</button>`}
  </div>
</article>`;
}

function rail(ctx, { title, items, more }) {
  if (!items?.length) return '';
  const { t } = ctx;
  return html`<section class="rail container">
  <div class="sec-head"><h2 class="sec-title">${title}</h2>
    <div class="rail-tools">${more ? html`<a class="link-more" href="${more}">${t('common.view_all')}</a>` : ''}
      <button type="button" class="rail-btn" data-rail="-1" aria-label="${t('common.prev')}">${icon('chev', 'ic-dir flip')}</button>
      <button type="button" class="rail-btn" data-rail="1" aria-label="${t('common.next')}">${icon('chev', 'ic-dir')}</button></div></div>
  <div class="rail-track">${items.map((p) => card(ctx, p))}</div>
</section>`;
}

const grid = (ctx, items) => html`<div class="grid">${items.map((p, i) => card(ctx, p, { lazy: i > 7 }))}</div>`;

function crumbs(ctx, list) {
  const items = [{ name: ctx.t('nav.home'), href: ctx.u('/') }, ...list];
  return html`<nav class="crumbs" aria-label="${ctx.t('common.breadcrumbs')}"><ol>${items.map((c, i) => html`<li>${i < items.length - 1 && c.href ? html`<a href="${c.href}">${c.name}</a>` : html`<span aria-current="page">${c.name}</span>`}</li>`)}</ol></nav>`;
}
const crumbsLD = (ctx, list) => ({
  '@context': 'https://schema.org', '@type': 'BreadcrumbList',
  itemListElement: [{ name: ctx.t('nav.home'), href: ctx.u('/') }, ...list].map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: c.href ? abs(ctx, c.href) : undefined })),
});

function pager(ctx, page, pages, hrefFor) {
  if (pages <= 1) return '';
  const nums = [];
  for (let i = 1; i <= pages; i++) if (i === 1 || i === pages || Math.abs(i - page) <= 1) nums.push(i); else if (nums[nums.length - 1] !== '…') nums.push('…');
  return html`<nav class="pager" aria-label="${ctx.t('common.pages')}">
    ${page > 1 ? html`<a href="${hrefFor(page - 1)}" rel="prev" aria-label="${ctx.t('common.prev')}">${icon('chev', 'ic-dir flip')}</a>` : ''}
    ${nums.map((n) => (n === '…' ? html`<span class="gap">…</span>` : n === page ? html`<span class="cur" aria-current="page">${n}</span>` : html`<a href="${hrefFor(n)}">${n}</a>`))}
    ${page < pages ? html`<a href="${hrefFor(page + 1)}" rel="next" aria-label="${ctx.t('common.next')}">${icon('chev', 'ic-dir')}</a>` : ''}
  </nav>`;
}

const alert = (msg, type = 'err') => (msg ? html`<div class="alert alert-${type}" role="alert">${msg}</div>` : '');
const csrfField = (ctx) => html`<input type="hidden" name="_csrf" value="${ctx.csrf}">`;
const field = (label, input, hint) => html`<label class="field"><span class="field-l">${label}</span>${input}${hint ? html`<small class="hint">${hint}</small>` : ''}</label>`;

// ---------- header pieces ----------
function navModel(ctx) {
  const { roots, flags } = cats();
  const visible = (c) => c.menu && c.count > 0;
  const items = roots.filter(visible).map((c) => ({ c, kids: c.children.filter(visible) }));
  const extra = [];
  if (flags.bestseller > 0) extra.push({ name: ctx.t('nav.bestsellers'), href: ctx.u('/best-sellers') });
  if (flags.sale > 0) extra.push({ name: ctx.t('nav.offers'), href: ctx.u('/sale'), hot: true });
  for (const p of pages()) if (p.menu) extra.push({ name: ctx.L(p, 'title'), href: ctx.u('/page/' + p.slug) });
  return { items, extra, visible };
}

function megaMenu(ctx, { c, kids }, visible) {
  const { L, u, t } = ctx;
  if (!kids.length) return '';
  return html`<div class="mega"><div class="container mega-in">
    <div class="mega-cols">${kids.map((k) => html`<div class="mega-col"><a class="mega-h" href="${u('/c/' + k.slug)}">${L(k, 'name')}</a>
      ${k.children.filter(visible).length ? html`<ul>${k.children.filter(visible).map((g) => html`<li><a href="${u('/c/' + g.slug)}">${L(g, 'name')}</a></li>`)}</ul>` : ''}</div>`)}</div>
    <a class="mega-all" href="${u('/c/' + c.slug)}">${t('nav.view_all_in', { name: L(c, 'name') })} ${icon('chev', 'ic-dir')}</a>
  </div></div>`;
}

function header(ctx) {
  const { t, L, u, s, lang } = ctx;
  const nav = navModel(ctx);
  const store = L(s, 'store_name');
  const other = lang === 'ar' ? 'en' : 'ar';
  const switchHref = `/${other}${ctx.path.replace(/^\/(ar|en)(?=\/|$)/, '')}${ctx.url.search}`;
  return html`<header class="hdr" id="top">
  <div class="hdr-main container">
    <div class="hdr-start">
      <button type="button" class="icon-btn only-m" data-open="menu-drawer" aria-label="${t('nav.menu')}">${icon('menu')}</button>
      <button type="button" class="icon-btn only-m" data-toggle-search aria-label="${t('search.label')}">${icon('search')}</button>
      <form class="hdr-search" action="${u('/search')}" role="search" data-search>
        <input type="search" name="q" placeholder="${t('search.placeholder')}" aria-label="${t('search.label')}" autocomplete="off" maxlength="80" value="${ctx.query.q && ctx.path.endsWith('/search') ? ctx.query.q : ''}">
        <button type="submit" aria-label="${t('search.label')}">${icon('search')}</button>
        <div class="suggest" hidden></div>
      </form>
    </div>
    <a class="logo" href="${u('/')}" aria-label="${store}">${s.logo ? html`<img src="${s.logo}" alt="${store}" height="40">` : wordmark(store)}</a>
    <div class="hdr-end">
      <a class="lang-btn" href="${switchHref}" hreflang="${other}" lang="${other}">${other === 'ar' ? 'العربية' : 'English'}</a>
      <a class="icon-btn hide-m" href="${u(ctx.user ? '/account' : '/account/login')}" aria-label="${t('nav.account')}">${icon('user')}</a>
      <a class="icon-btn" href="${u('/wishlist')}" aria-label="${t('nav.wishlist')}">${icon('heart')}<span class="count" data-wish-count${ctx.wishIds?.size ? '' : ' hidden'}>${ctx.wishIds?.size || 0}</span></a>
      <a class="icon-btn" href="${u('/cart')}" data-open="cart-drawer" aria-label="${t('nav.cart')}">${icon('bag')}<span class="count" data-cart-count${ctx.cartCount ? '' : ' hidden'}>${ctx.cartCount || 0}</span></a>
    </div>
  </div>
  <nav class="nav hide-m" aria-label="${t('nav.main')}"><ul class="nav-list container">
    ${nav.items.map((it) => html`<li class="nav-item${it.kids.length ? ' has-mega' : ''}"><a class="nav-link" href="${u('/c/' + it.c.slug)}">${L(it.c, 'name')}</a>${megaMenu(ctx, it, nav.visible)}</li>`)}
    ${nav.extra.map((x) => html`<li class="nav-item"><a class="nav-link${x.hot ? ' hot' : ''}" href="${x.href}">${x.name}</a></li>`)}
  </ul></nav>
</header>`;
}

function mobileMenu(ctx) {
  const { t, L, u, s, lang } = ctx;
  const nav = navModel(ctx);
  const other = lang === 'ar' ? 'en' : 'ar';
  const switchHref = `/${other}${ctx.path.replace(/^\/(ar|en)(?=\/|$)/, '')}${ctx.url.search}`;
  const sub = (c) => {
    const kids = c.children.filter(nav.visible);
    if (!kids.length) return html`<a class="m-link" href="${u('/c/' + c.slug)}">${L(c, 'name')}</a>`;
    return html`<details class="m-acc"><summary>${L(c, 'name')} ${icon('chevd')}</summary><div class="m-sub"><a class="m-link m-all" href="${u('/c/' + c.slug)}">${t('nav.view_all_in', { name: L(c, 'name') })}</a>${kids.map(sub)}</div></details>`;
  };
  return html`<div class="drawer drawer-start" id="menu-drawer" aria-hidden="true">
  <div class="drawer-panel" role="dialog" aria-modal="true" aria-label="${t('nav.menu')}">
    <div class="drawer-head">${wordmark(L(s, 'store_name'), 'sm')}<button type="button" class="icon-btn" data-close aria-label="${t('common.close')}">${icon('close')}</button></div>
    <nav class="m-nav">${nav.items.map((it) => sub(it.c))}${nav.extra.map((x) => html`<a class="m-link${x.hot ? ' hot' : ''}" href="${x.href}">${x.name}</a>`)}</nav>
    <div class="m-foot">
      <a href="${switchHref}" hreflang="${other}" lang="${other}">${icon('globe')} ${other === 'ar' ? 'العربية' : 'English'}</a>
      <a href="${u(ctx.user ? '/account' : '/account/login')}">${icon('user')} ${ctx.user ? t('nav.account') : t('acc.login')}</a>
      <a href="${u('/wishlist')}">${icon('heart')} ${t('nav.wishlist')}</a>
      <a href="${u('/track')}">${icon('box')} ${t('nav.track')}</a>
      ${s.whatsapp ? html`<a href="https://wa.me/${s.whatsapp.replace(/\D/g, '')}" target="_blank" rel="noopener">${icon('whatsapp')} WhatsApp</a>` : ''}
    </div>
  </div>
  <div class="drawer-backdrop" data-close></div>
</div>`;
}

function cartDrawer(ctx) {
  const { t } = ctx;
  return html`<div class="drawer drawer-end" id="cart-drawer" aria-hidden="true">
  <div class="drawer-panel" role="dialog" aria-modal="true" aria-label="${t('cart.title')}">
    <div class="drawer-head"><h2 class="drawer-title">${t('cart.title')}</h2><button type="button" class="icon-btn" data-close aria-label="${t('common.close')}">${icon('close')}</button></div>
    <div class="drawer-body" data-cart-body><div class="loading">…</div></div>
  </div>
  <div class="drawer-backdrop" data-close></div>
</div>`;
}

function announce(ctx) {
  const msgs = ctx.L(ctx.s, 'announcements').split('\n').map((x) => x.trim()).filter(Boolean);
  if (!msgs.length) return '';
  const href = ctx.s.announcement_link ? ctx.u(ctx.s.announcement_link) : null;
  return html`<div class="announce" data-announce><div class="container announce-in">
    ${msgs.map((m, i) => html`<p class="announce-msg${i ? '' : ' on'}">${href ? html`<a href="${href}">${m}</a>` : m}</p>`)}
  </div></div>`;
}

function promoBar(ctx) {
  const s = ctx.s;
  if (s.promo_enabled !== '1') return '';
  const end = Date.parse(s.promo_ends);
  if (s.promo_ends && (!end || end < Date.now())) return '';
  const text = ctx.L(s, 'promo_text');
  if (!text) return '';
  return html`<div class="promo" data-promo="${end || ''}" hidden><div class="container promo-in">
    <span class="promo-text">${text}</span>
    ${end ? html`<span class="promo-timer" data-timer aria-label="${ctx.t('promo.ends_in')}"></span>` : ''}
    ${s.promo_link ? html`<a class="promo-cta" href="${ctx.u(s.promo_link)}">${ctx.t('promo.shop_now')}</a>` : ''}
    <button type="button" class="promo-x" data-promo-close aria-label="${ctx.t('common.close')}">${icon('close')}</button>
  </div></div>`;
}

function footer(ctx) {
  const { t, L, u, s } = ctx;
  const nav = navModel(ctx);
  const fpages = pages().filter((p) => p.footer);
  const year = new Date().getFullYear();
  const wa = (s.whatsapp || '').replace(/\D/g, '');
  return html`<footer class="ftr">
  <section class="nl-band"><div class="container nl-in">
    <div><h2 class="nl-title">${t('nl.title')}</h2><p class="nl-text">${t('nl.text')}</p></div>
    <form class="nl-form" data-newsletter action="/api/newsletter" method="post">${csrfField(ctx)}
      <input type="email" name="email" required placeholder="${t('nl.placeholder')}" aria-label="${t('common.email')}">
      <input type="text" name="website" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
      <button class="btn btn-dark" type="submit">${t('nl.cta')}</button>
    </form>
  </div></section>
  <div class="container ftr-cols">
    <div class="ftr-col ftr-about">
      ${wordmark(L(s, 'store_name'), 'ftr-wm')}
      <p>${L(s, 'tagline')}</p>
      <div class="social">
        ${s.instagram ? html`<a href="${s.instagram}" target="_blank" rel="noopener" aria-label="Instagram">${icon('instagram')}</a>` : ''}
        ${s.facebook ? html`<a href="${s.facebook}" target="_blank" rel="noopener" aria-label="Facebook">${icon('facebook')}</a>` : ''}
        ${s.tiktok ? html`<a href="${s.tiktok}" target="_blank" rel="noopener" aria-label="TikTok">${icon('tiktok')}</a>` : ''}
        ${wa ? html`<a href="https://wa.me/${wa}" target="_blank" rel="noopener" aria-label="WhatsApp">${icon('whatsapp')}</a>` : ''}
      </div>
    </div>
    <div class="ftr-col"><h3>${t('ftr.shop')}</h3><ul>
      ${nav.items.map((it) => html`<li><a href="${u('/c/' + it.c.slug)}">${L(it.c, 'name')}</a></li>`)}
      ${nav.extra.slice(0, 2).map((x) => html`<li><a href="${x.href}">${x.name}</a></li>`)}
    </ul></div>
    <div class="ftr-col"><h3>${t('ftr.help')}</h3><ul>
      ${fpages.map((p) => html`<li><a href="${u('/page/' + p.slug)}">${L(p, 'title')}</a></li>`)}
      <li><a href="${u('/track')}">${t('nav.track')}</a></li>
      <li><a href="${u('/contact')}">${t('contact.title')}</a></li>
    </ul></div>
    <div class="ftr-col ftr-contact"><h3>${t('ftr.contact')}</h3><ul>
      ${s.phone ? html`<li>${icon('phone')}<a href="tel:${s.phone.replace(/[^\d+]/g, '')}" dir="ltr">${s.phone}</a></li>` : ''}
      ${wa ? html`<li>${icon('whatsapp')}<a href="https://wa.me/${wa}" target="_blank" rel="noopener" dir="ltr">+${wa}</a></li>` : ''}
      ${s.email ? html`<li>${icon('mail')}<a href="mailto:${s.email}">${s.email}</a></li>` : ''}
      ${L(s, 'address') ? html`<li>${icon('pin')}<span>${L(s, 'address')}</span></li>` : ''}
      ${L(s, 'hours') ? html`<li>${icon('clock')}<span>${L(s, 'hours')}</span></li>` : ''}
    </ul></div>
  </div>
  <div class="ftr-bottom"><div class="container ftr-bottom-in">
    <p>© ${year} ${L(s, 'store_name')}. ${t('ftr.rights')}</p>
    <ul class="pay-icons" aria-label="${t('ftr.payments')}">
      ${s.cod_enabled === '1' ? html`<li>${icon('cash')} ${t('pay.cod')}</li>` : ''}
      ${s.card_enabled === '1' ? html`<li>${icon('card')} ${t('pay.card_short')}</li>` : ''}
      <li>${icon('shield')} ${t('ftr.secure')}</li>
    </ul>
  </div></div>
</footer>`;
}

function popup(ctx) {
  const { s, t, L } = ctx;
  if (s.popup_enabled !== '1' || !L(s, 'popup_title')) return '';
  return html`<div class="modal" id="welcome" aria-hidden="true" data-popup>
  <div class="modal-box" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
    <button type="button" class="icon-btn modal-x" data-close aria-label="${t('common.close')}">${icon('close')}</button>
    <div class="modal-art" aria-hidden="true">${icon('gift')}</div>
    <h2 id="welcome-title">${L(s, 'popup_title')}</h2>
    <p>${L(s, 'popup_text')}</p>
    <form class="nl-form stack" data-newsletter data-reveal="${s.popup_coupon}" action="/api/newsletter" method="post">${csrfField(ctx)}
      <input type="email" name="email" required placeholder="${t('nl.placeholder')}" aria-label="${t('common.email')}">
      <input type="text" name="website" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
      <button class="btn btn-dark btn-block" type="submit">${t('nl.cta')}</button>
    </form>
    <div class="reveal" hidden><p>${t('popup.your_code')}</p><strong class="code">${s.popup_coupon}</strong></div>
    <button type="button" class="link-btn" data-close>${t('popup.no_thanks')}</button>
  </div>
  <div class="modal-backdrop" data-close></div>
</div>`;
}

const cookieBar = (ctx) => html`<div class="cookie" data-cookie hidden><div class="container cookie-in"><p>${ctx.t('cookie.text')} <a href="${ctx.u('/page/privacy')}">${ctx.t('cookie.more')}</a></p><button type="button" class="btn btn-sm btn-dark" data-cookie-ok>${ctx.t('cookie.ok')}</button></div></div>`;
const whatsFloat = (ctx) => { const wa = (ctx.s.whatsapp || '').replace(/\D/g, ''); return wa ? html`<a class="wa-float" href="https://wa.me/${wa}" target="_blank" rel="noopener" aria-label="WhatsApp">${icon('whatsapp')}</a>` : ''; };

// Theme colours from Admin → Settings → Theme (hex only, so nothing else can be injected into CSS)
const HEX = /^#[0-9a-f]{6}$/i;
function themeStyle(s) {
  const v = {};
  if (HEX.test(s.theme_ink)) { v['--ink'] = s.theme_ink; v['--ink-2'] = mix(s.theme_ink, '#ffffff', 0.18); }
  if (HEX.test(s.theme_accent)) { v['--accent'] = s.theme_accent; v['--accent-soft'] = mix(s.theme_accent, '#ffffff', 0.94); }
  if (HEX.test(s.theme_sale)) v['--sale'] = s.theme_sale;
  if (HEX.test(s.theme_soft)) v['--soft'] = s.theme_soft;
  return raw(`<style>:root{${Object.entries(v).map(([k, c]) => `${k}:${c}`).join(';')}}</style>`);
}

const CLIENT_KEYS = ['card.added', 'common.error', 'wish.added', 'wish.removed', 'search.no_results', 'search.products', 'search.categories', 'search.see_all', 'nl.thanks', 'promo.d', 'promo.h', 'promo.m', 'promo.s', 'common.close', 'cart.updated', 'coupon.applied', 'coupon.removed'];
const clientStrings = (ctx) => Object.fromEntries(CLIENT_KEYS.map((k) => [k, ctx.t(k)]));

function layout(ctx, o) {
  const { t, L, s, lang } = ctx;
  const store = L(s, 'store_name');
  const title = o.title ? `${o.title} | ${store}` : L(s, 'meta_title') || `${store} | ${L(s, 'tagline')}`;
  const desc = String(o.desc || L(s, 'meta_desc') || L(s, 'tagline') || '').slice(0, 300);
  const base = baseUrl(ctx);
  const rest = ctx.path.replace(/^\/(ar|en)(?=\/|$)/, '');
  const alt = (l) => `${base}/${l}${rest}`;
  const canonical = o.canonical || base + ctx.path;
  const V = assetVersion;
  return html`<!doctype html>
<html lang="${lang}" dir="${lang === 'ar' ? 'rtl' : 'ltr'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="${desc}">
${o.noindex ? raw('<meta name="robots" content="noindex">') : ''}
<link rel="canonical" href="${canonical}">
<link rel="alternate" hreflang="ar" href="${alt('ar')}"><link rel="alternate" hreflang="en" href="${alt('en')}"><link rel="alternate" hreflang="x-default" href="${alt(cfg.DEFAULT_LANG)}">
<meta property="og:site_name" content="${store}"><meta property="og:type" content="${o.ogType || 'website'}"><meta property="og:title" content="${title}">
<meta property="og:description" content="${desc}"><meta property="og:url" content="${canonical}"><meta property="og:locale" content="${lang === 'ar' ? 'ar_PS' : 'en_US'}">
${o.image ? html`<meta property="og:image" content="${abs(ctx, o.image)}">` : ''}
<meta name="theme-color" content="#151515">
<meta name="csrf-token" content="${ctx.csrf}">
<link rel="icon" href="/assets/img/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Jost:wght@400;500;600&family=Tajawal:wght@400;500;700&display=swap">
<link rel="stylesheet" href="/assets/css/store.css?v=${V}">
${themeStyle(s)}
${(o.jsonld || []).map((j) => html`<script type="application/ld+json">${json(j)}</script>`)}
<script src="/assets/js/store.js?v=${V}" defer></script>
</head>
<body class="${o.bodyClass || ''}">
<a class="skip" href="#main">${t('common.skip')}</a>
${sprite}${announce(ctx)}${promoBar(ctx)}${header(ctx)}
<main id="main">${o.body}</main>
${footer(ctx)}${mobileMenu(ctx)}${cartDrawer(ctx)}${popup(ctx)}${cookieBar(ctx)}${whatsFloat(ctx)}
<div class="toast" role="status" aria-live="polite" hidden></div>
<script type="application/json" id="i18n">${json(clientStrings(ctx))}</script>
</body>
</html>`;
}

module.exports = { layout, icon, sprite, card, rail, grid, crumbs, crumbsLD, pager, priceTag, wishBtn, alert, csrfField, field, PLACEHOLDER, abs, ICONS };
