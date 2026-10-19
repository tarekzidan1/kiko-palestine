'use strict';
// JSON endpoints used by store.js (they also work as plain form posts without JavaScript).
const { one, run, val } = require('../db');
const { HttpError } = require('../http');
const { cats, listProducts } = require('../catalog');
const { cartItems, addToCart, setQty, findCoupon, computeTotals, zones } = require('../cart');
const { ensureSession } = require('../auth');
const { int, isEmail, normSearch, limited } = require('../util');
const { PLACEHOLDER } = require('../views/ui');
const V = require('../views/shop');

function cartJSON(ctx, extra = {}) {
  const items = cartItems(ctx.owner);
  const tot = computeTotals({ items, coupon: findCoupon(ctx.session?.coupon) });
  return { ...extra, count: tot.count, html: V.cartFragment(ctx, items, tot).s };
}
const back = (ctx, path) => ctx.redirect(ctx.u(path));

module.exports = (app) => {
  app.get('/api/cart', (ctx) => cartJSON(ctx, { ok: true }));

  app.post('/api/cart/add', (ctx) => {
    ensureSession(ctx);
    const r = addToCart(ctx.owner, int(ctx.body.product_id), int(ctx.body.variant_id), int(ctx.body.qty, 1));
    if (!ctx.wantsJSON) return back(ctx, '/cart' + (r ? '?err=' + encodeURIComponent(r.err) : ''));
    if (r) return ctx.json({ ok: false, error: ctx.t(r.err, r.vars) }, 400);
    return cartJSON(ctx, { ok: true, msg: ctx.t('card.added') });
  });

  app.post('/api/cart/update', (ctx) => {
    if (!ctx.owner) return ctx.wantsJSON ? cartJSON(ctx, { ok: true }) : back(ctx, '/cart');
    const r = setQty(ctx.owner, int(ctx.body.product_id), int(ctx.body.variant_id), int(ctx.body.qty));
    if (!ctx.wantsJSON) return back(ctx, '/cart');
    return cartJSON(ctx, { ok: !r, error: r ? ctx.t(r.err, r.vars) : undefined });
  });

  app.post('/api/cart/coupon', (ctx) => {
    ensureSession(ctx);
    const code = String(ctx.body.code || '').trim().slice(0, 40);
    let res;
    if (code && !ctx.body.remove && limited('coupon:' + ctx.ip, 20, 600e3)) res = { ok: false, error: ctx.t('err.too_many') }; // stop code guessing
    else if (ctx.body.remove || !code) {
      run('UPDATE sessions SET coupon = NULL WHERE id = ?', ctx.session.id);
      res = { ok: true, msg: ctx.t('coupon.removed') };
    } else {
      const c = findCoupon(code);
      const err = c ? computeTotals({ items: cartItems(ctx.owner), coupon: c }).couponErr : { key: 'coupon.invalid' };
      if (err) res = { ok: false, error: ctx.t(err.key, { amount: ctx.money(err.vars?.amount || 0) }) };
      else { run('UPDATE sessions SET coupon = ? WHERE id = ?', c.code, ctx.session.id); ctx.session.coupon = c.code; res = { ok: true, msg: ctx.t('coupon.applied') }; }
    }
    if (!ctx.wantsJSON) return back(ctx, '/cart');
    return ctx.json(res, res.ok ? 200 : 400);
  });

  // Live order summary on the checkout page (zone / payment / coupon changes)
  app.get('/api/checkout/summary', (ctx) => {
    const items = cartItems(ctx.owner);
    const zone = zones().find((z) => z.id === int(ctx.query.zone_id)) || null;
    const code = ctx.session?.coupon;
    const tot = computeTotals({ items, coupon: findCoupon(code), zone, method: ctx.query.payment });
    return { ok: true, html: V.summary(ctx, items, tot, code, ctx.query.payment).s };
  });

  app.post('/api/wishlist/toggle', (ctx) => {
    ensureSession(ctx);
    const pid = int(ctx.body.product_id);
    if (!one('SELECT 1 FROM products WHERE id = ? AND active = 1', pid)) throw new HttpError(404);
    const had = one('SELECT 1 FROM wishlist WHERE owner = ? AND product_id = ?', ctx.owner, pid);
    if (had) run('DELETE FROM wishlist WHERE owner = ? AND product_id = ?', ctx.owner, pid);
    else run('INSERT OR IGNORE INTO wishlist (owner, product_id) VALUES (?, ?)', ctx.owner, pid);
    if (!ctx.wantsJSON) return back(ctx, '/wishlist');
    return { ok: true, on: !had, count: val('SELECT COUNT(*) FROM wishlist WHERE owner = ?', ctx.owner), msg: ctx.t(had ? 'wish.removed' : 'wish.added') };
  });

  app.get('/api/suggest', (ctx) => {
    const { L, u } = ctx;
    const q = String(ctx.query.q || '').trim().slice(0, 60);
    if (q.length < 2) return { products: [], categories: [], total: 0 };
    const r = listProducts({ q, per: 6 });
    const nq = normSearch(q);
    const cs = [...cats().byId.values()].filter((c) => c.count > 0 && normSearch(`${c.name_en} ${c.name_ar}`).includes(nq)).slice(0, 4);
    ctx.headers['Cache-Control'] = 'no-store';
    return {
      total: r.total, all: u('/search?q=' + encodeURIComponent(q)),
      products: r.items.map((p) => ({ name: L(p, 'name'), url: u('/p/' + p.slug), image: p.variants[0]?.image || p.images[0] || PLACEHOLDER, price: ctx.money(p.pi.price), regular: p.pi.off ? ctx.money(p.pi.regular) : null })),
      categories: cs.map((c) => ({ name: L(c, 'name'), url: u('/c/' + c.slug) })),
    };
  });

  app.post('/api/newsletter', (ctx) => {
    const ok = { ok: true, msg: ctx.t('nl.thanks') };
    const done = (res, code = 200) => (ctx.wantsJSON ? ctx.json(res, code) : back(ctx, '/'));
    if (ctx.body.website) return done(ok); // honeypot for bots
    const email = String(ctx.body.email || '').trim().toLowerCase().slice(0, 120);
    if (!isEmail(email)) return done({ ok: false, error: ctx.t('err.email') }, 400);
    if (limited('nl:' + ctx.ip, 10, 3600e3)) return done({ ok: false, error: ctx.t('err.too_many') }, 429);
    run('INSERT OR IGNORE INTO subscribers (email, lang) VALUES (?, ?)', email, ctx.lang);
    return done(ok);
  });
};
