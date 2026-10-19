'use strict';
// Storefront pages.
const { html, raw, esc, richText } = require('../html');
const { layout, icon, card, rail, grid, crumbs, crumbsLD, pager, priceTag, wishBtn, alert, csrfField, field, PLACEHOLDER, abs } = require('./ui');
const { fmtDate } = require('../util');

const lum = (hex) => { const h = String(hex || '#fff').replace('#', ''); const n = parseInt(h.length === 3 ? [...h].map((c) => c + c).join('') : h, 16) || 0; return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };
const tone = (bg) => (lum(bg) < 0.55 ? 'on-dark' : 'on-light');
const ext = (href) => (/^https?:/.test(href || '') ? raw(' target="_blank" rel="noopener"') : '');

const CITIES = [
  ['Ramallah', 'رام الله'], ['Al-Bireh', 'البيرة'], ['Birzeit', 'بيرزيت'], ['Nablus', 'نابلس'], ['Hebron', 'الخليل'], ['Halhul', 'حلحول'],
  ['Dura', 'دورا'], ['Yatta', 'يطا'], ['Bethlehem', 'بيت لحم'], ['Beit Jala', 'بيت جالا'], ['Beit Sahour', 'بيت ساحور'], ['Jenin', 'جنين'],
  ['Tulkarm', 'طولكرم'], ['Qalqilya', 'قلقيلية'], ['Jericho', 'أريحا'], ['Salfit', 'سلفيت'], ['Tubas', 'طوباس'], ['Abu Dis', 'أبو ديس'],
  ['Al-Eizariya', 'العيزرية'], ['Jerusalem', 'القدس'], ['Beit Hanina', 'بيت حنينا'], ['Shuafat', 'شعفاط'], ['Silwan', 'سلوان'],
  ['Nazareth', 'الناصرة'], ['Haifa', 'حيفا'], ['Akka', 'عكا'], ['Jaffa', 'يافا'], ['Umm al-Fahm', 'أم الفحم'], ['Taybeh', 'الطيبة'],
  ['Tira', 'الطيرة'], ['Sakhnin', 'سخنين'], ['Shefa-Amr', 'شفاعمرو'], ['Tamra', 'طمرة'], ['Kafr Qasim', 'كفر قاسم'], ['Baqa al-Gharbiyye', 'باقة الغربية'],
  ['Rahat', 'رهط'], ['Lod', 'اللد'], ['Ramla', 'الرملة'],
];

// ---------- home ----------
function home(ctx, d) {
  const { t, L, u } = ctx;
  const hero = d.hero.length ? html`<section class="hero" aria-roledescription="carousel" aria-label="${t('home.highlights')}">
  <div class="hero-track" data-hero>
    ${d.hero.map((b, i) => html`<div class="hero-slide ${tone(b.bg)}" style="--bg:${b.bg || '#f3e6e3'}" role="group" aria-roledescription="slide" aria-label="${i + 1} / ${d.hero.length}">
      <div class="container hero-in">
        <div class="hero-text">
          <h2 class="hero-title">${L(b, 'title')}</h2>
          ${L(b, 'sub') ? html`<p class="hero-sub">${L(b, 'sub')}</p>` : ''}
          ${b.link ? html`<a class="btn ${tone(b.bg) === 'on-dark' ? 'btn-light' : 'btn-dark'}" href="${u(b.link)}"${ext(b.link)}>${L(b, 'cta') || t('promo.shop_now')}</a>` : ''}
        </div>
        ${b.image ? html`<div class="hero-art"><img src="${b.image}" alt="" width="900" height="700" loading="${i ? 'lazy' : 'eager'}"></div>` : ''}
      </div>
    </div>`)}
  </div>
  ${d.hero.length > 1 ? html`<div class="hero-dots">${d.hero.map((_, i) => html`<button type="button" class="${i ? '' : 'on'}" data-dot="${i}" aria-label="${i + 1}"></button>`)}</div>` : ''}
</section>` : '';

  const circles = d.circles.length ? html`<section class="circles container" aria-label="${t('home.shop_by')}"><div class="circles-track">
    ${d.circles.map((b) => html`<a class="circle" href="${u(b.link)}"><span class="circle-img" style="--bg:${b.bg || '#f4efec'}"><img src="${b.image || PLACEHOLDER}" alt="" loading="lazy"></span><span class="circle-l">${L(b, 'title')}</span></a>`)}
  </div></section>` : '';

  const tiles = d.cards.length ? html`<section class="container sec"><div class="sec-head"><h2 class="sec-title">${t('home.collections')}</h2></div>
  <div class="tiles">${d.cards.map((b) => html`<a class="tile ${tone(b.bg)}" href="${u(b.link)}" style="--bg:${b.bg || '#eee'}">
    ${b.image ? html`<img src="${b.image}" alt="" loading="lazy">` : ''}
    <span class="tile-cap"><strong>${L(b, 'title')}</strong>${L(b, 'sub') ? html`<small>${L(b, 'sub')}</small>` : ''}<span class="tile-cta">${L(b, 'cta') || t('promo.shop_now')} ${icon('chev', 'ic-dir')}</span></span></a>`)}</div>
</section>` : '';

  const services = d.services.length ? html`<section class="container sec"><div class="sec-head"><h2 class="sec-title">${t('home.services')}</h2></div>
  <div class="services">${d.services.map((b, i) => html`<a class="service" href="${u(b.link)}"${ext(b.link)} style="--bg:${b.bg || '#f6efe9'}">
    ${b.image ? html`<img class="service-img" src="${b.image}" alt="" loading="lazy">` : html`<span class="service-ic">${icon(/wa\.me|whatsapp/.test(b.link || '') ? 'chat' : ['play', 'sparkle', 'gift'][i % 3])}</span>`}
    <span class="service-t"><strong>${L(b, 'title')}</strong>${L(b, 'sub') ? html`<span>${L(b, 'sub')}</span>` : ''}<span class="link-more">${L(b, 'cta') || t('common.learn_more')}</span></span></a>`)}</div>
</section>` : '';

  const promos = d.promo.map((b) => html`<section class="container sec"><a class="promo-banner ${tone(b.bg)}" href="${u(b.link)}"${ext(b.link)} style="--bg:${b.bg || '#151515'}">
    <span class="pb-text"><strong class="pb-title">${L(b, 'title')}</strong>${L(b, 'sub') ? html`<span class="pb-sub">${L(b, 'sub')}</span>` : ''}<span class="btn ${tone(b.bg) === 'on-dark' ? 'btn-light' : 'btn-dark'}">${L(b, 'cta') || t('promo.shop_now')}</span></span>
    ${b.image ? html`<img src="${b.image}" alt="" loading="lazy">` : ''}</a></section>`);

  const more = (src) => (src === 'bestseller' ? u('/best-sellers') : src === 'new' ? u('/new') : src === 'sale' ? u('/sale') : src.startsWith('cat:') ? u('/c/' + src.slice(4)) : null);
  const R = d.sections.map((x) => rail(ctx, { title: L(x.s, 'title'), items: x.items, more: more(x.s.source) }));
  const body = html`${hero}${circles}${R[0] || ''}${tiles}${R[1] || ''}${services}${R[2] || ''}${promos}${R.slice(3)}`;
  return layout(ctx, {
    body, bodyClass: 'home',
    jsonld: [{ '@context': 'https://schema.org', '@type': 'Organization', name: L(ctx.s, 'store_name'), url: abs(ctx, '/'), telephone: ctx.s.phone || undefined, email: ctx.s.email || undefined }],
  });
}

// ---------- listing (category / flags / search) ----------
function listing(ctx, o) {
  const { t, u } = ctx;
  const r = o.result;
  const cur = { q: o.q || '', sort: o.sort || '', min: o.f.min || '', max: o.f.max || '', stock: o.f.stock ? 1 : '', sale: o.f.sale ? 1 : '' };
  const qs = (extra = {}) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...cur, ...extra })) if (v !== '' && v != null && v !== false && !(k === 'page' && +v === 1)) p.set(k, v);
    const s = p.toString();
    return o.baseHref + (s ? '?' + s : '');
  };
  const sorts = [['', 'cat.sort_featured'], ['new', 'cat.sort_new'], ['best', 'cat.sort_best'], ['price_asc', 'cat.sort_price_asc'], ['price_desc', 'cat.sort_price_desc']];
  const hidden = (keys) => keys.filter((k) => cur[k] !== '').map((k) => html`<input type="hidden" name="${k}" value="${cur[k]}">`);
  const activeFilters = !!(cur.min || cur.max || cur.stock || cur.sale);
  const body = html`<div class="container listing">
  ${crumbs(ctx, o.crumbList)}
  <header class="list-head"><h1>${o.title}</h1>${o.desc ? html`<p class="list-desc">${o.desc}</p>` : ''}</header>
  ${o.chips?.length ? html`<nav class="chips" aria-label="${t('cat.subcategories')}">${o.chips.map((c) => html`<a class="chip${c.on ? ' on' : ''}" href="${c.href}">${c.name}</a>`)}</nav>` : ''}
  <div class="toolbar">
    <button type="button" class="btn btn-sm btn-ghost only-m" data-open="filters">${icon('filter')} ${t('cat.filter')}${activeFilters ? ' •' : ''}</button>
    <span class="toolbar-count">${t('cat.count', { n: r.total })}</span>
    <form class="sort-form" method="get" action="${o.baseHref}">${hidden(['q', 'min', 'max', 'stock', 'sale'])}
      <label><span class="sr">${t('cat.sort')}</span><select name="sort" data-autosubmit aria-label="${t('cat.sort')}">${sorts.map(([v, k]) => html`<option value="${v}"${cur.sort === v ? raw(' selected') : ''}>${t(k)}</option>`)}</select></label>
      <noscript><button class="btn btn-sm">OK</button></noscript>
    </form>
  </div>
  <div class="list-layout">
    <div class="drawer drawer-start fdrawer" id="filters" aria-hidden="true">
      <div class="drawer-panel" role="dialog" aria-label="${t('cat.filter')}">
        <div class="drawer-head only-m"><h2 class="drawer-title">${t('cat.filter')}</h2><button type="button" class="icon-btn" data-close aria-label="${t('common.close')}">${icon('close')}</button></div>
        <form class="filters" method="get" action="${o.baseHref}">${hidden(['q', 'sort'])}
          <fieldset><legend>${t('cat.price')}</legend>
            <div class="row2 tight"><label class="field"><span class="field-l">${t('cat.min')}</span><input type="number" name="min" min="0" step="1" inputmode="numeric" value="${cur.min}" placeholder="${r.bounds.lo || 0}"></label>
            <label class="field"><span class="field-l">${t('cat.max')}</span><input type="number" name="max" min="0" step="1" inputmode="numeric" value="${cur.max}" placeholder="${r.bounds.hi || ''}"></label></div>
          </fieldset>
          <fieldset><legend>${t('cat.availability')}</legend>
            <label class="check"><input type="checkbox" name="stock" value="1"${cur.stock ? raw(' checked') : ''}> ${t('cat.in_stock')}</label>
            ${o.hideSale ? '' : html`<label class="check"><input type="checkbox" name="sale" value="1"${cur.sale ? raw(' checked') : ''}> ${t('cat.on_sale')}</label>`}
          </fieldset>
          <div class="filter-btns"><button class="btn btn-dark btn-block" type="submit">${t('cat.apply')}</button>${activeFilters ? html`<a class="btn btn-ghost btn-block" href="${qs({ min: '', max: '', stock: '', sale: '' })}">${t('cat.clear')}</a>` : ''}</div>
        </form>
      </div>
      <div class="drawer-backdrop only-m" data-close></div>
    </div>
    <div class="list-main">
      ${r.items.length ? grid(ctx, r.items) : html`<div class="empty">${icon('search')}<p>${o.emptyText || t('cat.empty')}</p><a class="btn btn-dark" href="${u('/')}">${t('common.continue')}</a></div>`}
      ${pager(ctx, r.page, r.pages, (n) => qs({ page: n }))}
    </div>
  </div>
</div>`;
  return layout(ctx, { title: o.metaTitle || o.title, desc: o.metaDesc, body, noindex: !!o.q || activeFilters, jsonld: o.crumbList?.length ? [crumbsLD(ctx, o.crumbList)] : [], canonical: o.canonical });
}

// ---------- product ----------
function product(ctx, p, o) {
  const { t, L, s } = ctx;
  const vs = p.variants;
  const sel = vs.find((v) => v.id === +ctx.query.v) || vs.find((v) => v.stock > 0) || vs[0] || null;
  const imgs = [...new Set([sel && sel.image, ...p.images].filter(Boolean))];
  if (!imgs.length) imgs.push(PLACEHOLDER);
  const stock = sel ? sel.stock : p.stock;
  const low = +s.low_stock || 5;
  const stockText = stock <= 0 ? t('pdp.out_of_stock') : stock <= low ? t('pdp.only_left', { n: stock }) : t('pdp.in_stock');
  const badges = [p.is_bestseller && ['best', t('badge.bestseller')], p.is_new && ['new', t('badge.new')], p.is_limited && ['ltd', t('badge.limited')]].filter(Boolean);
  const name = L(p, 'name');
  const body = html`<div class="container pdp">
  ${crumbs(ctx, o.crumbList)}
  <div class="pdp-grid">
    <div class="gallery" data-gallery>
      <div class="g-main"><img src="${imgs[0]}" alt="${name}" width="600" height="600" data-g-main></div>
      ${imgs.length > 1 ? html`<div class="g-thumbs">${imgs.map((im, i) => html`<button type="button" class="g-thumb${i ? '' : ' on'}" data-g-img="${im}" aria-label="${t('pdp.image_n', { n: i + 1 })}"><img src="${im}" alt="" loading="lazy"></button>`)}</div>` : ''}
    </div>
    <div class="pdp-info">
      ${badges.length || p.pi.off ? html`<div class="badges static">${badges.map(([k, l]) => html`<span class="badge b-${k}">${l}</span>`)}${p.pi.off ? html`<span class="badge b-off">-${p.pi.off}%</span>` : ''}</div>` : ''}
      <h1 class="pdp-title">${name}</h1>
      ${L(p, 'short') ? html`<p class="pdp-sub">${L(p, 'short')}</p>` : ''}
      ${priceTag(ctx, p.pi, 'lg')}
      <form class="buy" action="/api/cart/add" method="post" data-buy>
        ${csrfField(ctx)}<input type="hidden" name="product_id" value="${p.id}"><input type="hidden" name="variant_id" value="${sel ? sel.id : 0}" data-vid-input><input type="hidden" name="lang" value="${ctx.lang}">
        ${vs.length ? html`<div class="shade-head">${t('pdp.shade')}: <strong data-shade-name>${L(sel, 'name')}</strong></div>
        <div class="shades" role="radiogroup" aria-label="${t('pdp.shade')}">${vs.map((v) => html`<button type="button" role="radio" aria-checked="${v === sel ? 'true' : 'false'}" class="sw lg${v === sel ? ' on' : ''}${v.stock <= 0 ? ' sw-out' : ''}" style="--c:${v.color || '#ccc'}" data-vid="${v.id}" data-img="${v.image || ''}" data-stock="${v.stock}" data-name="${L(v, 'name')}" data-sku="${v.sku || ''}" title="${L(v, 'name')}" aria-label="${L(v, 'name')}"></button>`)}</div>` : ''}
        <p class="stock-line ${stock <= 0 ? 'out' : stock <= low ? 'low' : 'ok'}" data-stock-line data-low="${low}" data-ok="${t('pdp.in_stock')}" data-out="${t('pdp.out_of_stock')}" data-low-tpl="${t('pdp.only_left', { n: '{n}' })}">${stockText}</p>
        <div class="buy-row">
          <div class="qty" data-qty><button type="button" data-step="-1" aria-label="${t('cart.decrease')}">${icon('minus')}</button><input type="number" name="qty" value="1" min="1" max="99" inputmode="numeric" aria-label="${t('cart.qty')}"><button type="button" data-step="1" aria-label="${t('cart.increase')}">${icon('plus')}</button></div>
          <button type="submit" class="btn btn-dark btn-add-lg" data-add-main data-add-text="${t('card.add')}"${stock <= 0 ? raw(' disabled') : ''}>${stock <= 0 ? t('pdp.out_of_stock') : t('card.add')}</button>
          ${wishBtn(ctx, p.id, 'wish-lg')}
        </div>
      </form>
      <ul class="perks">
        <li>${icon('truck')} ${+s.free_shipping_min > 0 ? t('pdp.free_ship_over', { amount: ctx.money(+s.free_shipping_min) }) : t('pdp.fast_delivery')}</li>
        ${s.cod_enabled === '1' ? html`<li>${icon('cash')} ${t('pdp.cod')}</li>` : ''}
        ${s.card_enabled === '1' ? html`<li>${icon('card')} ${t('pdp.card')}</li>` : ''}
        <li>${icon('return')} ${t('pdp.returns')}</li>
      </ul>
      <div class="acc">
        ${L(p, 'desc') ? html`<details open><summary>${t('pdp.description')} ${icon('chevd')}</summary><div class="rich">${richText(L(p, 'desc'))}</div></details>` : ''}
        ${L(p, 'howto') ? html`<details><summary>${t('pdp.how_to')} ${icon('chevd')}</summary><div class="rich">${richText(L(p, 'howto'))}</div></details>` : ''}
        ${p.ingredients ? html`<details><summary>${t('pdp.ingredients')} ${icon('chevd')}</summary><div class="rich small" dir="ltr">${p.ingredients}</div></details>` : ''}
      </div>
      ${p.sku || sel?.sku ? html`<p class="sku">${t('pdp.sku')}: <span data-sku dir="ltr">${(sel && sel.sku) || p.sku}</span></p>` : ''}
    </div>
  </div>
</div>
${rail(ctx, { title: t('pdp.related'), items: o.related })}`;
  const url = abs(ctx, ctx.path);
  const ld = {
    '@context': 'https://schema.org', '@type': 'Product', name, sku: p.sku || undefined,
    image: imgs.map((i) => abs(ctx, i)), description: L(p, 'short') || undefined,
    offers: { '@type': 'Offer', url, priceCurrency: s.currency, price: p.pi.price.toFixed(2), availability: `https://schema.org/${p.stock > 0 ? 'InStock' : 'OutOfStock'}` },
  };
  return layout(ctx, { title: p.meta_title || name, desc: p.meta_desc || L(p, 'short'), image: imgs[0], ogType: 'product', body, jsonld: [ld, crumbsLD(ctx, o.crumbList)] });
}

// ---------- cart ----------
function freeShip(ctx, tot) {
  if (!(tot.freeOver > 0) || !tot.count) return '';
  const pct = Math.min(100, Math.round((1 - tot.remaining / tot.freeOver) * 100));
  return html`<div class="freeship"><p>${tot.remaining > 0 ? raw(esc(ctx.t('cart.free_left', { amount: '\u0000' })).replace('\u0000', `<b>${esc(ctx.money(tot.remaining))}</b>`)) : html`${icon('check')} ${ctx.t('cart.free_reached')}`}</p><div class="bar"><span style="width:${pct}%"></span></div></div>`;
}
function lines(ctx, items, big = false) {
  const { t, L, u, lang } = ctx;
  return html`<ul class="lines${big ? ' lg' : ''}">${items.map((it) => html`<li class="line">
    <a class="line-img" href="${u('/p/' + it.slug)}"><img src="${it.image || PLACEHOLDER}" alt="" loading="lazy"></a>
    <div class="line-info">
      <a class="line-name" href="${u('/p/' + it.slug)}">${L(it, 'name')}</a>
      ${it.variant_id ? html`<span class="line-var"><i class="dot" style="--c:${it.color || '#ccc'}"></i>${lang === 'ar' ? it.v_ar || it.v_en : it.v_en || it.v_ar}</span>` : ''}
      ${priceTag(ctx, it.pi, 'sm')}
      <form class="line-actions" method="post" action="/api/cart/update" data-line>
        ${csrfField(ctx)}<input type="hidden" name="product_id" value="${it.product_id}"><input type="hidden" name="variant_id" value="${it.variant_id}"><input type="hidden" name="lang" value="${lang}">
        <div class="qty sm"><button name="qty" value="${it.qty - 1}" aria-label="${t('cart.decrease')}">${icon('minus')}</button><span class="qty-v" aria-label="${t('cart.qty')}">${it.qty}</span><button name="qty" value="${it.qty + 1}" aria-label="${t('cart.increase')}"${it.qty >= it.stock ? raw(' disabled') : ''}>${icon('plus')}</button></div>
        <button class="link-btn rm" name="qty" value="0">${icon('trash')}<span>${t('cart.remove')}</span></button>
      </form>
    </div>
    <strong class="line-total">${ctx.money(it.line)}</strong>
  </li>`)}</ul>`;
}
const emptyCart = (ctx) => html`<div class="empty">${icon('bag')}<p>${ctx.t('cart.empty')}</p><a class="btn btn-dark" href="${ctx.u('/')}">${ctx.t('common.continue')}</a></div>`;

function cartFragment(ctx, items, tot) {
  if (!items.length) return emptyCart(ctx);
  const { t, u } = ctx;
  return html`${freeShip(ctx, tot)}${lines(ctx, items)}
  <div class="drawer-foot">
    <div class="sum-row"><span>${t('cart.subtotal')}</span><strong>${ctx.money(tot.subtotal)}</strong></div>
    ${tot.discount ? html`<div class="sum-row disc"><span>${t('cart.discount')} (${tot.coupon.code})</span><strong>-${ctx.money(tot.discount)}</strong></div>` : ''}
    <p class="small muted">${t('cart.ship_note')}</p>
    <a class="btn btn-dark btn-block" href="${u('/checkout')}">${t('cart.checkout')}</a>
    <a class="btn btn-ghost btn-block" href="${u('/cart')}">${t('cart.view')}</a>
  </div>`;
}

function couponBox(ctx, tot, code, inline = false) {
  const { t } = ctx;
  const msg = tot.coupon ? html`<p class="coupon-ok">${icon('check')} ${t('coupon.applied_code', { code: tot.coupon.code })}</p>`
    : tot.couponErr ? html`<p class="ferr">${t(tot.couponErr.key, { amount: ctx.money(tot.couponErr.vars?.amount || 0) })}</p>` : '';
  if (inline) {
    return html`<div class="coupon-form" data-coupon-inline><input name="coupon_code" value="${code || ''}" placeholder="${t('coupon.placeholder')}" aria-label="${t('coupon.placeholder')}" autocomplete="off">
      ${tot.coupon ? html`<button type="button" class="btn btn-ghost" data-coupon-remove>${t('coupon.remove')}</button>` : html`<button type="button" class="btn btn-ghost" data-coupon-apply>${t('coupon.apply')}</button>`}</div>${msg}`;
  }
  return html`<form class="coupon-form" method="post" action="/api/cart/coupon" data-coupon>${csrfField(ctx)}<input type="hidden" name="lang" value="${ctx.lang}">
    <input name="code" value="${code || ''}" placeholder="${t('coupon.placeholder')}" aria-label="${t('coupon.placeholder')}" autocomplete="off">
    ${tot.coupon ? html`<button class="btn btn-ghost" name="remove" value="1">${t('coupon.remove')}</button>` : html`<button class="btn btn-ghost">${t('coupon.apply')}</button>`}</form>${msg}`;
}

function totalsList(ctx, tot, { method } = {}) {
  const { t } = ctx;
  return html`<dl class="totals">
    <div><dt>${t('cart.subtotal')}</dt><dd>${ctx.money(tot.subtotal)}</dd></div>
    ${tot.discount ? html`<div class="disc"><dt>${t('cart.discount')}</dt><dd>-${ctx.money(tot.discount)}</dd></div>` : ''}
    <div><dt>${t('cart.shipping')}</dt><dd>${tot.zone ? (tot.shipping ? ctx.money(tot.shipping) : t('co.free')) : html`<span class="muted">${t('cart.at_checkout')}</span>`}</dd></div>
    ${tot.fee && method === 'cod' ? html`<div><dt>${t('pay.cod_fee_label')}</dt><dd>${ctx.money(tot.fee)}</dd></div>` : ''}
    <div class="grand"><dt>${t('cart.total')}</dt><dd>${ctx.money(tot.total)}</dd></div>
  </dl>`;
}

function cartPage(ctx, items, tot, code, msg) {
  const { t, u } = ctx;
  const body = html`<div class="container cart-page">
  ${crumbs(ctx, [{ name: t('cart.title') }])}
  <h1>${t('cart.title')}</h1>
  ${msg ? alert(msg.text, msg.type) : ''}
  ${items.length ? html`<div class="cart-grid">
    <div>${lines(ctx, items, true)}</div>
    <aside class="summary">
      ${freeShip(ctx, tot)}
      ${couponBox(ctx, tot, code)}
      ${totalsList(ctx, tot)}
      <a class="btn btn-dark btn-block btn-lg" href="${u('/checkout')}">${t('cart.checkout')}</a>
      <ul class="perks sm"><li>${icon('shield')} ${t('cart.secure')}</li><li>${icon('truck')} ${t('cart.delivery_areas')}</li></ul>
    </aside>
  </div>` : emptyCart(ctx)}
</div>`;
  return layout(ctx, { title: t('cart.title'), body, noindex: true });
}

// ---------- checkout ----------
function summary(ctx, items, tot, code, method) {
  const { t, L, lang } = ctx;
  return html`<h2 class="summary-title">${t('co.summary')} <small>(${tot.count})</small></h2>
  <ul class="mini-lines">${items.map((it) => html`<li><span class="mini-img"><img src="${it.image || PLACEHOLDER}" alt="" loading="lazy"><b>${it.qty}</b></span>
    <span class="mini-name">${L(it, 'name')}${it.variant_id ? html`<small>${lang === 'ar' ? it.v_ar || it.v_en : it.v_en || it.v_ar}</small>` : ''}</span><span>${ctx.money(it.line)}</span></li>`)}</ul>
  ${couponBox(ctx, tot, code, true)}
  ${totalsList(ctx, tot, { method })}`;
}

function checkout(ctx, o) {
  const { t, L, u, s, lang } = ctx;
  const err = (k) => (o.errors[k] ? html`<small class="ferr">${o.errors[k]}</small>` : '');
  const method = o.f.payment && o.methods.includes(o.f.payment) ? o.f.payment : o.methods[0];
  const body = html`<div class="container co">
  <h1>${t('co.title')}</h1>
  ${alert(o.error)}
  ${!ctx.user ? html`<p class="co-login">${t('co.have_account')} <a href="${u('/account/login')}?next=${encodeURIComponent(u('/checkout'))}">${t('acc.login')}</a></p>` : ''}
  <form class="co-grid" method="post" action="${u('/checkout')}" data-checkout novalidate>
    ${csrfField(ctx)}
    <div class="co-main">
      <section class="co-box"><h2><span class="step">1</span>${t('co.contact')}</h2>
        <div class="row2">
          <div>${field(t('co.name'), html`<input name="name" required maxlength="80" autocomplete="name" value="${o.f.name || ''}">`)}${err('name')}</div>
          <div>${field(t('co.phone'), html`<input name="phone" type="tel" required maxlength="20" autocomplete="tel" dir="ltr" placeholder="059 000 0000" value="${o.f.phone || ''}">`)}${err('phone')}</div>
        </div>
        ${field(t('co.email'), html`<input name="email" type="email" maxlength="120" autocomplete="email" dir="ltr" value="${o.f.email || ''}">`, t('co.email_hint'))}${err('email')}
      </section>
      <section class="co-box"><h2><span class="step">2</span>${t('co.delivery')}</h2>
        <fieldset class="zones"><legend class="field-l">${t('co.zone')}</legend>
          ${o.zones.map((z) => html`<label class="zone"><input type="radio" name="zone_id" value="${z.id}" required${+o.f.zone_id === z.id ? raw(' checked') : ''}>
            <span class="zone-box"><strong>${L(z, 'name')}</strong><span class="zone-meta">${+z.fee ? ctx.money(z.fee) : t('co.free')}${L(z, 'days') ? ' · ' + L(z, 'days') : ''}</span></span></label>`)}
        </fieldset>${err('zone_id')}
        <div class="row2">
          <div>${field(t('co.city'), html`<input name="city" required maxlength="60" list="cities" autocomplete="address-level2" value="${o.f.city || ''}"><datalist id="cities">${CITIES.map((c) => html`<option value="${lang === 'ar' ? c[1] : c[0]}">`)}</datalist>`)}${err('city')}</div>
          <div>${field(t('co.address'), html`<input name="address" required maxlength="200" autocomplete="street-address" value="${o.f.address || ''}">`)}${err('address')}</div>
        </div>
        ${field(t('co.notes'), html`<textarea name="notes" rows="2" maxlength="500" placeholder="${t('co.notes_ph')}">${o.f.notes || ''}</textarea>`)}
      </section>
      <section class="co-box"><h2><span class="step">3</span>${t('co.payment')}</h2>
        <div class="pay-opts">
          ${o.methods.includes('cod') ? html`<label class="pay-opt"><input type="radio" name="payment" value="cod"${method === 'cod' ? raw(' checked') : ''}><span class="pay-box">${icon('cash')}<span><strong>${t('pay.cod')}</strong><small>${t('pay.cod_desc')}${+s.cod_fee ? ' ' + t('pay.cod_fee', { amount: ctx.money(+s.cod_fee) }) : ''}</small></span></span></label>` : ''}
          ${o.methods.includes('card') ? html`<label class="pay-opt"><input type="radio" name="payment" value="card"${method === 'card' ? raw(' checked') : ''}><span class="pay-box">${icon('card')}<span><strong>${t('pay.card')}</strong><small>${t('pay.card_desc')}</small></span></span></label>` : ''}
        </div>${err('payment')}
      </section>
    </div>
    <aside class="co-side">
      <div class="summary" data-summary>${summary(ctx, o.items, o.tot, o.code, method)}</div>
      <button type="submit" class="btn btn-dark btn-block btn-lg" data-place>${t('co.place')}</button>
      <p class="small muted center">${t('co.agree')} <a href="${u('/page/terms')}">${t('co.terms')}</a></p>
    </aside>
  </form>
</div>`;
  return layout(ctx, { title: t('co.title'), body, noindex: true, bodyClass: 'checkout-page' });
}

// ---------- order confirmation / details ----------
const STEPS = ['pending', 'confirmed', 'shipped', 'delivered'];
function orderView(ctx, o, items, events, opts = {}) {
  const { t, lang } = ctx;
  const cancelled = o.status === 'cancelled';
  const idx = STEPS.indexOf(o.status);
  const isCard = o.payment_method === 'card';
  return html`<div class="order-view">
  ${opts.fresh ? html`<div class="thanks">${icon('check', 'big')}<h1>${t('order.thanks')}</h1><p>${t(isCard && o.payment_status !== 'paid' ? 'order.thanks_card_pending' : 'order.thanks_text', { n: o.number })}</p></div>` : html`<h1>${t('order.title', { n: o.number })}</h1>`}
  ${opts.payMsg ? alert(opts.payMsg.text, opts.payMsg.type) : ''}
  ${opts.canPay ? html`<form class="pay-again" method="post" action="/pay/retry">${csrfField(ctx)}<input type="hidden" name="number" value="${o.number}"><input type="hidden" name="t" value="${o.token}"><button class="btn btn-dark">${icon('card')} ${t('order.pay_now', { amount: ctx.money(o.total) })}</button></form>` : ''}
  <div class="order-meta">
    <div><span>${t('order.number')}</span><strong dir="ltr">${o.number}</strong></div>
    <div><span>${t('order.date')}</span><strong dir="ltr">${fmtDate(o.created_at)}</strong></div>
    <div><span>${t('order.payment')}</span><strong>${t(isCard ? 'pay.card' : 'pay.cod')} · <em class="pay-${o.payment_status}">${t('paystatus.' + o.payment_status)}</em></strong></div>
    <div><span>${t('order.status')}</span><strong class="st st-${o.status}">${t('status.' + o.status)}</strong></div>
  </div>
  ${cancelled ? '' : html`<ol class="steps">${STEPS.map((st, i) => html`<li class="${i <= idx ? 'done' : ''}${i === idx ? ' cur' : ''}"><span></span>${t('status.' + st)}</li>`)}</ol>`}
  <div class="order-grid">
    <section class="card-box"><h2>${t('order.items')}</h2>
      <ul class="mini-lines">${items.map((it) => html`<li><span class="mini-img"><img src="${it.image || PLACEHOLDER}" alt="" loading="lazy"><b>${it.qty}</b></span>
        <span class="mini-name">${lang === 'ar' ? it.name_ar || it.name : it.name}${it.variant ? html`<small>${lang === 'ar' ? it.variant_ar || it.variant : it.variant}</small>` : ''}</span><span>${ctx.money(it.price * it.qty)}</span></li>`)}</ul>
      <dl class="totals">
        <div><dt>${t('cart.subtotal')}</dt><dd>${ctx.money(o.subtotal)}</dd></div>
        ${o.discount ? html`<div class="disc"><dt>${t('cart.discount')}${o.coupon ? ` (${o.coupon})` : ''}</dt><dd>-${ctx.money(o.discount)}</dd></div>` : ''}
        <div><dt>${t('cart.shipping')}</dt><dd>${o.shipping ? ctx.money(o.shipping) : t('co.free')}</dd></div>
        ${o.fee ? html`<div><dt>${t('pay.cod_fee_label')}</dt><dd>${ctx.money(o.fee)}</dd></div>` : ''}
        <div class="grand"><dt>${t('cart.total')}</dt><dd>${ctx.money(o.total)}</dd></div>
      </dl>
    </section>
    <section class="card-box"><h2>${t('order.delivery_to')}</h2>
      <p><strong>${o.name}</strong><br><span dir="ltr">${o.phone}</span>${o.email ? html`<br>${o.email}` : ''}</p>
      <p>${o.address}<br>${o.city} — ${String(o.zone_name || '').split(' / ')[lang === 'ar' ? 1 : 0] || o.zone_name}</p>
      ${o.notes ? html`<p class="muted">${o.notes}</p>` : ''}
      <h3>${t('order.history')}</h3>
      <ul class="events">${events.filter((e) => !e.status.startsWith('payment_') || e.status === 'payment_paid').map((e) => html`<li><span dir="ltr">${fmtDate(e.created_at)}</span> — ${t(e.status === 'payment_paid' ? 'paystatus.paid' : 'status.' + e.status)}</li>`)}</ul>
    </section>
  </div>
</div>`;
}
function orderPage(ctx, o, items, events, opts) {
  const body = html`<div class="container narrow">${orderView(ctx, o, items, events, opts)}
    <p class="center"><a class="btn btn-ghost" href="${ctx.u('/')}">${ctx.t('common.continue')}</a></p></div>`;
  return layout(ctx, { title: ctx.t('order.title', { n: o.number }), body, noindex: true });
}

function track(ctx, f = {}, error) {
  const { t, u } = ctx;
  const body = html`<div class="container narrow">
  ${crumbs(ctx, [{ name: t('nav.track') }])}
  <h1>${t('nav.track')}</h1><p class="muted">${t('track.text')}</p>
  ${alert(error)}
  <form class="card-box form" method="post" action="${u('/track')}">${csrfField(ctx)}
    ${field(t('track.number'), html`<input name="number" required dir="ltr" placeholder="${ctx.s.order_prefix}1001" value="${f.number || ''}">`)}
    ${field(t('co.phone'), html`<input name="phone" type="tel" required dir="ltr" value="${f.phone || ''}">`)}
    <button class="btn btn-dark btn-block">${t('track.cta')}</button>
  </form></div>`;
  return layout(ctx, { title: t('nav.track'), body });
}

// ---------- CMS / contact / wishlist / errors ----------
function cmsPage(ctx, p) {
  const { L } = ctx;
  const body = html`<div class="container narrow page">${crumbs(ctx, [{ name: L(p, 'title') }])}<h1>${L(p, 'title')}</h1><div class="rich">${richText(L(p, 'body'))}</div></div>`;
  return layout(ctx, { title: L(p, 'title'), desc: String(L(p, 'body') || '').replace(/<[^>]+>/g, ' ').slice(0, 160), body });
}

function contact(ctx, p, f = {}, msg) {
  const { t, L, u, s } = ctx;
  const wa = (s.whatsapp || '').replace(/\D/g, '');
  const body = html`<div class="container page">
  ${crumbs(ctx, [{ name: t('contact.title') }])}
  <h1>${p ? L(p, 'title') : t('contact.title')}</h1>
  ${p && L(p, 'body') ? html`<div class="rich">${richText(L(p, 'body'))}</div>` : ''}
  <div class="contact-grid">
    <form class="card-box form" method="post" action="${u('/contact')}">${csrfField(ctx)}
      ${msg ? alert(msg.text, msg.type) : ''}
      <div class="row2">${field(t('co.name'), html`<input name="name" required maxlength="80" value="${f.name || ''}">`)}${field(t('co.phone'), html`<input name="phone" type="tel" dir="ltr" maxlength="20" value="${f.phone || ''}">`)}</div>
      ${field(t('common.email'), html`<input name="email" type="email" dir="ltr" maxlength="120" required value="${f.email || ''}">`)}
      ${field(t('contact.message'), html`<textarea name="body" rows="5" required maxlength="3000">${f.body || ''}</textarea>`)}
      <input type="text" name="website" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
      <button class="btn btn-dark">${t('contact.send')}</button>
    </form>
    <aside class="card-box contact-info">
      <h2>${L(s, 'store_name')}</h2>
      <ul class="info-list">
        ${s.phone ? html`<li>${icon('phone')}<a href="tel:${s.phone.replace(/[^\d+]/g, '')}" dir="ltr">${s.phone}</a></li>` : ''}
        ${wa ? html`<li>${icon('whatsapp')}<a href="https://wa.me/${wa}" target="_blank" rel="noopener" dir="ltr">+${wa}</a></li>` : ''}
        ${s.email ? html`<li>${icon('mail')}<a href="mailto:${s.email}">${s.email}</a></li>` : ''}
        ${L(s, 'address') ? html`<li>${icon('pin')}${L(s, 'address')}</li>` : ''}
        ${L(s, 'hours') ? html`<li>${icon('clock')}${L(s, 'hours')}</li>` : ''}
      </ul>
    </aside>
  </div></div>`;
  return layout(ctx, { title: t('contact.title'), body });
}

function wishlist(ctx, items) {
  const { t, u } = ctx;
  const body = html`<div class="container listing">${crumbs(ctx, [{ name: t('nav.wishlist') }])}
    <header class="list-head"><h1>${t('nav.wishlist')}</h1></header>
    ${items.length ? grid(ctx, items) : html`<div class="empty">${icon('heart')}<p>${t('wish.empty')}</p><a class="btn btn-dark" href="${u('/')}">${t('common.continue')}</a></div>`}</div>`;
  return layout(ctx, { title: t('nav.wishlist'), body, noindex: true });
}

function errorPage(ctx, status, message) {
  const { t, u } = ctx;
  const nf = status === 404;
  const body = html`<div class="container narrow err-page">
    <p class="err-code">${status}</p><h1>${nf ? t('err.404_title') : t('err.title')}</h1><p class="muted">${nf ? t('err.404_text') : message || t('err.text')}</p>
    <form class="hdr-search inline" action="${u('/search')}" role="search"><input type="search" name="q" placeholder="${t('search.placeholder')}" aria-label="${t('search.label')}"><button aria-label="${t('search.label')}">${icon('search')}</button></form>
    <a class="btn btn-dark" href="${u('/')}">${t('nav.home')}</a></div>`;
  return layout(ctx, { title: nf ? t('err.404_title') : t('err.title'), body, noindex: true });
}

module.exports = { home, listing, product, cartPage, cartFragment, checkout, summary, orderPage, orderView, track, cmsPage, contact, wishlist, errorPage, CITIES };
