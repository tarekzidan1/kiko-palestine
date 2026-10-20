'use strict';
// Storefront routes (all under /ar/... or /en/...).
const cfg = require('../config');
const { one, all, run, insert } = require('../db');
const { HttpError } = require('../http');
const { cats, trail, descendantIds, listProducts, productBySlug, mainCategory, related, productsByIds, sectionProducts } = require('../catalog');
const { cartItems, findCoupon, computeTotals, zones } = require('../cart');
const { placeOrder, orderItems, orderEvents } = require('../orders');
const { banners, sections, pageBySlug, baseUrl, pages } = require('../content');
const { int, num, isEmail, isPhone, normPhone, phoneTail, toAscii, limited } = require('../util');
const { safeEqual } = require('../auth');
const payments = require('../payments');
const notify = require('../notify');
const { sendInvoicePdf } = require('../invoice');
const V = require('../views/shop');

const filtersFrom = (q) => ({ min: num(q.min) || 0, max: num(q.max) || 0, stock: q.stock === '1', sale: q.sale === '1' });
const methodsEnabled = (s) => [s.cod_enabled === '1' && 'cod', s.card_enabled === '1' && 'card'].filter(Boolean);

module.exports = (app) => {
  // language root
  app.get('/', (ctx) => {
    const al = String(ctx.req.headers['accept-language'] || '').slice(0, 2).toLowerCase();
    const lang = ['ar', 'en'].includes(ctx.cookies.lang) ? ctx.cookies.lang : ['ar', 'en'].includes(al) ? al : cfg.DEFAULT_LANG;
    ctx.redirect('/' + lang, 302);
  });

  app.get('/:lang', (ctx) => V.home(ctx, {
    hero: banners('hero'), circles: banners('circle'), cards: banners('card'), services: banners('service'), promo: banners('promo'),
    sections: sections().map((s) => ({ s, items: sectionProducts(s.source, s.limit_n || 12) })).filter((x) => x.items.length),
  }));

  // ---------- listings ----------
  app.get('/:lang/c/:slug', (ctx) => {
    const { L, u } = ctx;
    const c = cats().bySlug.get(ctx.params.slug);
    if (!c) throw new HttpError(404);
    const f = filtersFrom(ctx.query);
    const result = listProducts({ catIds: descendantIds(c), sort: ctx.query.sort, page: int(ctx.query.page, 1), min: f.min, max: f.max, inStock: f.stock, onSale: f.sale });
    const tr = trail(c);
    const kids = c.children.filter((x) => x.count > 0);
    const parent = c.parent_id ? cats().byId.get(c.parent_id) : null;
    const chips = kids.length ? kids.map((k) => ({ name: L(k, 'name'), href: u('/c/' + k.slug) }))
      : parent ? parent.children.filter((x) => x.count > 0).map((k) => ({ name: L(k, 'name'), href: u('/c/' + k.slug), on: k.id === c.id })) : [];
    return V.listing(ctx, {
      title: L(c, 'name'), desc: L(c, 'desc'), chips, result, f, sort: ctx.query.sort, baseHref: u('/c/' + c.slug),
      crumbList: tr.map((x, i) => ({ name: L(x, 'name'), href: i < tr.length - 1 ? u('/c/' + x.slug) : null })),
      canonical: baseUrl(ctx) + u('/c/' + c.slug) + (result.page > 1 ? '?page=' + result.page : ''),
    });
  });

  const flagPage = (flag, titleKey, path) => (ctx) => {
    const f = filtersFrom(ctx.query);
    const result = listProducts({ flag, sort: ctx.query.sort || (flag === 'new' ? 'new' : ''), page: int(ctx.query.page, 1), min: f.min, max: f.max, inStock: f.stock, onSale: f.sale });
    return V.listing(ctx, { title: ctx.t(titleKey), result, f, sort: ctx.query.sort, baseHref: ctx.u(path), crumbList: [{ name: ctx.t(titleKey) }], hideSale: flag === 'sale' });
  };
  app.get('/:lang/best-sellers', flagPage('bestseller', 'nav.bestsellers', '/best-sellers'));
  app.get('/:lang/new', flagPage('new', 'nav.new', '/new'));
  app.get('/:lang/sale', flagPage('sale', 'nav.offers', '/sale'));

  app.get('/:lang/search', (ctx) => {
    const q = String(ctx.query.q || '').trim().slice(0, 80);
    const f = filtersFrom(ctx.query);
    const result = q ? listProducts({ q, sort: ctx.query.sort, page: int(ctx.query.page, 1), min: f.min, max: f.max, inStock: f.stock, onSale: f.sale })
      : { items: [], total: 0, page: 1, pages: 1, bounds: { lo: 0, hi: 0 } };
    return V.listing(ctx, {
      title: q ? ctx.t('search.results_for', { q }) : ctx.t('search.label'), q, result, f, sort: ctx.query.sort, baseHref: ctx.u('/search'),
      crumbList: [{ name: ctx.t('search.label') }], emptyText: q ? ctx.t('search.no_results') : ctx.t('search.type'),
    });
  });

  // ---------- product ----------
  app.get('/:lang/p/:slug', (ctx) => {
    const { L, u } = ctx;
    const p = productBySlug(ctx.params.slug);
    if (!p) throw new HttpError(404);
    const c = mainCategory(p);
    const crumbList = [...(c ? trail(c).map((x) => ({ name: L(x, 'name'), href: u('/c/' + x.slug) })) : []), { name: L(p, 'name') }];
    return V.product(ctx, p, { crumbList, related: related(p) });
  });

  // ---------- cart & checkout ----------
  app.get('/:lang/cart', (ctx) => {
    const items = cartItems(ctx.owner);
    const code = ctx.session?.coupon;
    const tot = computeTotals({ items, coupon: findCoupon(code) });
    const errKey = ['pdp.out_of_stock', 'pdp.choose_shade', 'err.not_found', 'cart.only_left'].includes(ctx.query.err) ? ctx.query.err : null;
    return V.cartPage(ctx, items, tot, code, errKey ? { text: ctx.t(errKey, { n: '' }), type: 'err' } : null);
  });

  function checkoutData(ctx, f = {}) {
    const items = cartItems(ctx.owner);
    const zs = zones();
    const code = f.coupon_code !== undefined ? f.coupon_code : ctx.session?.coupon;
    const zone = zs.find((z) => z.id === +f.zone_id) || null;
    const methods = methodsEnabled(ctx.s);
    const tot = computeTotals({ items, coupon: findCoupon(code), zone, method: f.payment || methods[0] });
    return { items, zones: zs, code, tot, methods };
  }

  app.get('/:lang/checkout', (ctx) => {
    const u = ctx.user || {};
    const f = { name: u.name, phone: u.phone, email: u.email, zone_id: u.zone_id, city: u.city, address: u.address };
    const d = checkoutData(ctx, f);
    if (!d.items.length) return ctx.redirect(ctx.u('/cart'));
    return V.checkout(ctx, { ...d, f, errors: {} });
  });

  app.post('/:lang/checkout', async (ctx) => {
    const { t } = ctx;
    const b = ctx.body;
    const f = {};
    for (const k of ['name', 'phone', 'email', 'zone_id', 'city', 'address', 'notes', 'payment', 'coupon_code']) f[k] = String(b[k] ?? '').trim().slice(0, k === 'notes' ? 500 : 200);
    f.email = f.email.toLowerCase();
    const d = checkoutData(ctx, f);
    if (!d.items.length) return ctx.redirect(ctx.u('/cart'));
    const errors = {};
    if (f.name.length < 2) errors.name = t('err.required');
    if (!isPhone(f.phone)) errors.phone = t('err.phone');
    if (f.email && !isEmail(f.email)) errors.email = t('err.email');
    if (f.payment === 'card' && !f.email) errors.email = t('co.email_card');
    if (!d.zones.some((z) => z.id === +f.zone_id)) errors.zone_id = t('co.zone_required');
    if (!f.city) errors.city = t('err.required');
    if (f.address.length < 3) errors.address = t('err.required');
    if (!d.methods.includes(f.payment)) errors.payment = t('co.payment_required');
    if (d.tot.couponErr) errors.coupon = t(d.tot.couponErr.key);
    if (Object.keys(errors).length) return V.checkout(ctx, { ...d, f, errors, error: t('co.fix_errors') });
    if (limited('order:' + ctx.ip, 20, 3600e3)) return V.checkout(ctx, { ...d, f, errors, error: t('err.too_many') });

    const r = placeOrder({ owner: ctx.owner, userId: ctx.user?.id, lang: ctx.lang, ip: ctx.ip, couponCode: f.coupon_code || ctx.session?.coupon, data: { ...f, phone: normPhone(f.phone), zone_id: +f.zone_id } });
    if (r.err) return V.checkout(ctx, { ...checkoutData(ctx, f), f, errors: {}, error: t(r.err, r.vars) });
    const o = r.order;
    if (ctx.session?.coupon) run('UPDATE sessions SET coupon = NULL WHERE id = ?', ctx.session.id);
    if (ctx.user && !ctx.user.address) run('UPDATE users SET zone_id = ?, city = ?, address = ?, phone = COALESCE(phone, ?) WHERE id = ?', o.zone_id, o.city, o.address, o.phone, ctx.user.id);
    notify.orderPlaced(o).catch((e) => console.error('[notify]', e.message));
    const orderUrl = `/${o.lang}/order/${o.number}?t=${o.token}&new=1`;
    if (o.payment_method === 'card') {
      try { return ctx.redirect(await payments.start(o, ctx)); }
      catch (e) { console.error('[payment]', e.message); return ctx.redirect(orderUrl + '&pay=error'); }
    }
    return ctx.redirect(orderUrl);
  });

  // ---------- orders ----------
  // an order is visible with its secret link (?t=…), to the customer's account, or to admins
  const visibleOrder = (ctx) => {
    const o = one('SELECT * FROM orders WHERE number = ?', ctx.params.number);
    const allowed = o && ((ctx.query.t && safeEqual(ctx.query.t, o.token)) || (ctx.user && (ctx.user.id === o.user_id || ctx.user.role === 'admin')));
    if (!allowed) throw new HttpError(404);
    return o;
  };
  app.get('/:lang/order/:number/invoice.pdf', (ctx) => sendInvoicePdf(ctx, visibleOrder(ctx), ctx.lang));
  app.get('/:lang/order/:number', (ctx) => {
    const o = visibleOrder(ctx);
    const pay = ctx.query.pay;
    const payMsg = pay && o.payment_status === 'paid' ? { text: ctx.t('order.paid_ok'), type: 'ok' }
      : pay === 'failed' ? { text: ctx.t('order.pay_failed'), type: 'err' } : pay === 'error' ? { text: ctx.t('order.pay_error'), type: 'err' }
        : pay === 'ok' ? { text: ctx.t('order.pay_pending'), type: 'ok' } : null;
    const canPay = o.payment_method === 'card' && o.payment_status !== 'paid' && o.status !== 'cancelled' && ctx.s.card_enabled === '1';
    return V.orderPage(ctx, o, orderItems(o.id), orderEvents(o.id), { fresh: ctx.query.new === '1', payMsg, canPay });
  });

  app.get('/:lang/track', (ctx) => V.track(ctx));
  app.post('/:lang/track', (ctx) => {
    const f = { number: toAscii(ctx.body.number).trim().toUpperCase().replace(/\s+/g, '').slice(0, 30), phone: String(ctx.body.phone || '').trim().slice(0, 20) };
    if (limited('track:' + ctx.ip, 15, 600e3)) return V.track(ctx, f, ctx.t('err.too_many'));
    const o = one('SELECT number, token, phone FROM orders WHERE UPPER(number) = ?', f.number);
    if (!o || phoneTail(o.phone) !== phoneTail(f.phone) || phoneTail(f.phone).length < 9) return V.track(ctx, f, ctx.t('track.not_found'));
    return ctx.redirect(ctx.u(`/order/${o.number}?t=${o.token}`));
  });

  // ---------- wishlist / pages / contact ----------
  app.get('/:lang/wishlist', (ctx) => {
    const ids = ctx.owner ? all('SELECT product_id FROM wishlist WHERE owner = ?', ctx.owner).map((r) => r.product_id) : [];
    return V.wishlist(ctx, productsByIds(ids));
  });

  app.get('/:lang/page/:slug', (ctx) => {
    if (ctx.params.slug === 'contact') return ctx.redirect(ctx.u('/contact'), 301);
    const p = pageBySlug(ctx.params.slug);
    if (!p) throw new HttpError(404);
    return V.cmsPage(ctx, p);
  });

  app.get('/:lang/contact', (ctx) => V.contact(ctx, pageBySlug('contact'), { name: ctx.user?.name, email: ctx.user?.email, phone: ctx.user?.phone }));
  app.post('/:lang/contact', (ctx) => {
    const { t } = ctx;
    const f = {};
    for (const k of ['name', 'email', 'phone', 'body']) f[k] = String(ctx.body[k] || '').trim().slice(0, k === 'body' ? 3000 : 120);
    const page = pageBySlug('contact');
    if (ctx.body.website) return V.contact(ctx, page, {}, { text: t('contact.sent'), type: 'ok' }); // honeypot
    if (!f.name || !isEmail(f.email) || f.body.length < 5) return V.contact(ctx, page, f, { text: t('co.fix_errors'), type: 'err' });
    if (limited('contact:' + ctx.ip, 5, 3600e3)) return V.contact(ctx, page, f, { text: t('err.too_many'), type: 'err' });
    const id = insert('messages', f);
    notify.contactMessage({ id, ...f }).catch((e) => console.error('[notify]', e.message));
    return V.contact(ctx, page, {}, { text: t('contact.sent'), type: 'ok' });
  });

  // ---------- SEO ----------
  app.get('/robots.txt', (ctx) => ctx.send(`User-agent: *\nDisallow: /admin\nDisallow: /api/\nDisallow: /pay/\nDisallow: /*/cart\nDisallow: /*/checkout\nDisallow: /*/account\nDisallow: /*/order/\nSitemap: ${baseUrl(ctx)}/sitemap.xml\n`, 200, 'text/plain; charset=utf-8'));
  app.get('/sitemap.xml', (ctx) => {
    const base = baseUrl(ctx);
    const paths = ['', '/best-sellers', '/new', '/sale', '/contact',
      ...[...cats().byId.values()].filter((c) => c.count > 0).map((c) => '/c/' + encodeURIComponent(c.slug)),
      ...all('SELECT slug FROM products WHERE active = 1').map((p) => '/p/' + encodeURIComponent(p.slug)),
      ...pages().map((p) => '/page/' + encodeURIComponent(p.slug))];
    const urls = paths.flatMap((p) => ['ar', 'en'].map((l) => `<url><loc>${base}/${l}${p}</loc><xhtml:link rel="alternate" hreflang="ar" href="${base}/ar${p}"/><xhtml:link rel="alternate" hreflang="en" href="${base}/en${p}"/></url>`));
    ctx.headers['Cache-Control'] = 'public, max-age=3600';
    return ctx.send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${urls.join('')}</urlset>`, 200, 'application/xml; charset=utf-8');
  });
};
