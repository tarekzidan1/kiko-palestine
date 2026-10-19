'use strict';
// Payment endpoints: retry, PayTabs return/callback, and the built-in test gateway.
const cfg = require('../config');
const { one } = require('../db');
const { HttpError } = require('../http');
const { limited } = require('../util');
const { safeEqual } = require('../auth');
const { setPayment } = require('../orders');
const payments = require('../payments');
const notify = require('../notify');
const { html } = require('../html');
const { money } = require('../util');

const orderUrl = (o, extra = '') => `/${o.lang || 'ar'}/order/${encodeURIComponent(o.number)}?t=${o.token}${extra}`;
const byToken = (number, token) => {
  const o = one('SELECT * FROM orders WHERE number = ?', String(number || ''));
  return o && token && safeEqual(token, o.token) ? o : null;
};
const after = (before, o) => { if (o && before.payment_status !== 'paid' && o.payment_status === 'paid') notify.paymentReceived(o).catch(() => {}); };

module.exports = (app) => {
  // "Pay now" again for an unpaid card order
  app.post('/pay/retry', async (ctx) => {
    const o = byToken(ctx.body.number, ctx.body.t);
    if (!o) throw new HttpError(404);
    if (o.payment_status === 'paid' || o.status === 'cancelled' || o.payment_method !== 'card') return ctx.redirect(orderUrl(o));
    try { return ctx.redirect(await payments.start(o, ctx)); }
    catch (e) { console.error('[payment]', e.message); return ctx.redirect(orderUrl(o, '&pay=error')); }
  });

  // Customer's browser comes back here (cross-site POST from PayTabs: no cookies, no CSRF token).
  // The redirect contains the order's secret link, so we only give it out when the request is proven genuine:
  // a valid PayTabs signature, or a transaction that PayTabs itself confirms belongs to this order.
  app.post('/pay/paytabs/return', async (ctx) => {
    const b = ctx.body;
    if (limited('ptreturn:' + ctx.ip, 30, 600e3)) throw new HttpError(429, 'Too many requests');
    const o0 = one('SELECT * FROM orders WHERE number = ? AND payment_method = ?', String(b.cartId || ''), 'card');
    if (!o0) throw new HttpError(404);
    let verified = payments.validReturnSignature({ ...b });
    let o = o0;
    if (b.tranRef) {
      try { const r = await payments.confirm(String(b.tranRef)); if (r && r.id === o0.id) { o = r; verified = true; } } catch (e) { console.error('[paytabs] query failed', e.message); }
    }
    if (!verified) { console.warn('[paytabs] unverified return for', o0.number); return ctx.redirect(`/${o0.lang || 'ar'}/track`); }
    after(o0, o);
    return ctx.redirect(orderUrl(o, o.payment_status === 'paid' || b.respStatus === 'A' ? '&pay=ok' : '&pay=failed'));
  });

  // Server-to-server notification from PayTabs (must carry a valid signature header)
  app.post('/pay/paytabs/callback', async (ctx) => {
    const sig = ctx.req.headers.signature;
    if (!sig || !payments.validCallbackSignature(ctx.rawBody, sig)) { console.warn('[paytabs] bad/missing callback signature'); return ctx.send('bad signature', 401, 'text/plain'); }
    const ref = ctx.body.tran_ref;
    if (ref) {
      const o0 = one('SELECT * FROM orders WHERE number = ?', String(ctx.body.cart_id || ''));
      try { const o = await payments.confirm(String(ref)); if (o0) after(o0, o); } catch (e) { console.error('[paytabs] callback query failed', e.message); return ctx.send('retry', 500, 'text/plain'); }
    }
    return ctx.send('OK', 200, 'text/plain');
  });

  // ---------- Test mode gateway (Admin → Settings → Card provider = "Test mode"; disabled when NODE_ENV=production) ----------
  const mockGuard = (ctx) => { if (cfg.PROD || ctx.s.card_provider !== 'mock' || ctx.s.card_enabled !== '1') throw new HttpError(404); };
  app.get('/pay/mock/:number', mockGuard, (ctx) => {
    const o = byToken(ctx.params.number, ctx.query.t);
    if (!o || o.payment_method !== 'card') throw new HttpError(404);
    const amount = o.charge_currency && o.charge_currency !== ctx.s.currency ? `${o.charge_amount} ${o.charge_currency}` : money(o.total, ctx.s.currency_symbol);
    return html`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Test payment</title>
<link rel="stylesheet" href="/assets/css/store.css"></head><body class="mock-pay"><main class="container narrow" style="padding:48px 16px">
<div class="card-box form"><p class="badge b-ltd">TEST MODE — no real money</p><h1>Pay ${amount}</h1><p class="muted">Order ${o.number}. This page simulates the card gateway so you can test the full checkout. Switch the provider to PayTabs in Admin → Settings when you go live.</p>
<form method="post" action="/pay/mock/${encodeURIComponent(o.number)}"><input type="hidden" name="_csrf" value="${ctx.csrf}"><input type="hidden" name="t" value="${o.token}">
<button class="btn btn-dark btn-block" name="result" value="paid">Simulate successful payment</button>
<button class="btn btn-ghost btn-block" name="result" value="failed" style="margin-top:10px">Simulate declined card</button></form></div></main></body></html>`;
  });
  app.post('/pay/mock/:number', mockGuard, (ctx) => {
    const o = byToken(ctx.params.number, ctx.body.t);
    if (!o || o.payment_method !== 'card') throw new HttpError(404);
    const ok = ctx.body.result === 'paid';
    setPayment(o.id, ok ? 'paid' : 'failed', 'Test mode payment', 'TEST-' + Date.now());
    after(o, one('SELECT * FROM orders WHERE id = ?', o.id));
    return ctx.redirect(orderUrl(o, ok ? '&pay=ok' : '&pay=failed'));
  });
};
