'use strict';
// Card payments: PayTabs Hosted Payment Page (PT2 API) + a built-in "test mode" gateway.
// Flow: create payment request → redirect customer → on return/callback we QUERY PayTabs
// with our server key (authoritative) before marking the order paid.
const crypto = require('node:crypto');
const { one, run, settings } = require('./db');
const { setPayment } = require('./orders');
const { round2 } = require('./util');
const { safeEqual } = require('./auth');
const { baseUrl } = require('./content');

const cfgPT = () => {
  const s = settings();
  return { profile: +s.paytabs_profile_id, key: s.paytabs_server_key, domain: String(s.paytabs_domain || 'https://secure-global.paytabs.com').replace(/\/+$/, '') };
};

// Amount + currency actually charged (PayTabs may not support ILS → convert with the admin rate).
function chargeFor(o) {
  const s = settings();
  const cur = String(s.paytabs_currency || s.currency || 'USD').toUpperCase();
  const same = cur === String(s.currency).toUpperCase();
  return { currency: cur, amount: same ? round2(o.total) : round2(o.total * (+s.paytabs_rate || 1)) };
}

async function ptPost(path, body) {
  const { key, domain } = cfgPT();
  const r = await fetch(domain + path, {
    method: 'POST', headers: { authorization: key, 'content-type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(25000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`PayTabs ${path} HTTP ${r.status}: ${j.message || ''}`);
  return j;
}

async function start(o, ctx) {
  const s = settings();
  const { currency, amount } = chargeFor(o);
  run('UPDATE orders SET charge_amount = ?, charge_currency = ? WHERE id = ?', amount, currency, o.id);
  if (s.card_provider === 'mock') return `/pay/mock/${encodeURIComponent(o.number)}?t=${o.token}`;
  const { profile, key } = cfgPT();
  if (!profile || !key) throw new Error('PayTabs is not configured (profile id / server key missing)');
  const base = baseUrl(ctx);
  const j = await ptPost('/payment/request', {
    profile_id: profile, tran_type: 'sale', tran_class: 'ecom',
    cart_id: o.number, cart_description: `Order ${o.number}`.slice(0, 128), cart_currency: currency, cart_amount: amount,
    paypage_lang: o.lang === 'ar' ? 'ar' : 'en', return: `${base}/pay/paytabs/return`, callback: `${base}/pay/paytabs/callback`,
    hide_shipping: true,
    customer_details: { name: o.name, email: o.email, phone: o.phone, street1: o.address, city: o.city, state: 'PS', country: 'PS', zip: '00000', ip: o.ip || undefined },
  });
  if (!j.redirect_url) throw new Error('PayTabs: ' + (j.message || 'no redirect_url'));
  run('UPDATE orders SET payment_ref = ? WHERE id = ?', j.tran_ref || null, o.id);
  return j.redirect_url;
}

// Ask PayTabs for the real transaction state and update the order.
async function confirm(tranRef) {
  const { profile } = cfgPT();
  const j = await ptPost('/payment/query', { profile_id: profile, tran_ref: tranRef });
  const o = one('SELECT * FROM orders WHERE number = ?', j.cart_id);
  if (!o) return null;
  if (String(j.tran_type || 'sale').toLowerCase() !== 'sale') return o; // refunds/voids are handled by the admin, never mark "paid"
  const st = j.payment_result?.response_status;
  const msg = `PayTabs ${tranRef}: ${st} ${j.payment_result?.response_message || ''}`.trim();
  const amountOk = Math.abs(+j.cart_amount - (o.charge_amount ?? o.total)) < 0.01 && String(j.cart_currency).toUpperCase() === String(o.charge_currency || '').toUpperCase();
  let justPaid = false; // true only for the one request that changed the order to "paid" (return + callback can race)
  if (st === 'A' && amountOk) justPaid = setPayment(o.id, 'paid', msg, tranRef) === true;
  else if (st === 'A') console.error('[paytabs] amount/currency mismatch for', o.number, j.cart_amount, j.cart_currency);
  else if (['D', 'E', 'C', 'X', 'V'].includes(st)) setPayment(o.id, 'failed', msg, tranRef);
  return { ...one('SELECT * FROM orders WHERE id = ?', o.id), justPaid };
}

// PHP-style urlencode (PayTabs signs with http_build_query)
const phpEnc = (s) => encodeURIComponent(s).replace(/[!'()*~]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase()).replace(/%20/g, '+');
function validReturnSignature(fields, key = cfgPT().key) {
  if (!fields.signature || !key) return false;
  const q = Object.keys(fields).filter((k) => k !== 'signature' && fields[k] !== '' && fields[k] !== '0' && fields[k] != null).sort()
    .map((k) => `${phpEnc(k)}=${phpEnc(fields[k])}`).join('&');
  return safeEqual(crypto.createHmac('sha256', key).update(q).digest('hex'), fields.signature);
}
function validCallbackSignature(raw, header, key = cfgPT().key) {
  return !!(key && header) && safeEqual(crypto.createHmac('sha256', key).update(raw).digest('hex'), String(header));
}

module.exports = { start, confirm, chargeFor, validReturnSignature, validCallbackSignature };
