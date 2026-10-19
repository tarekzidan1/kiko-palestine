'use strict';
// Cart, coupons and totals. Prices/stock always come from the DB (never from the browser).
const { one, all, run, settings } = require('./db');
const { priceInfo } = require('./catalog');
const { safeJSON, round2, dayKey } = require('./util');

function cartItems(owner) {
  if (!owner) return [];
  const rows = all(`SELECT ci.qty, ci.product_id, ci.variant_id, p.slug, p.sku, p.name_en, p.name_ar, p.price, p.sale_price,
      p.images, p.stock pstock, p.active, v.id vid, v.name_en v_en, v.name_ar v_ar, v.color, v.sku vsku, v.stock vstock, v.image vimage,
      (SELECT COUNT(*) FROM variants x WHERE x.product_id = p.id) vcount
    FROM cart_items ci JOIN products p ON p.id = ci.product_id
    LEFT JOIN variants v ON v.id = ci.variant_id AND v.product_id = p.id
    WHERE ci.owner = ? ORDER BY ci.added_at`, owner);
  return rows
    .filter((r) => r.active && (r.variant_id ? r.vid : r.vcount === 0))
    .map((r) => {
      const pi = priceInfo(r);
      return { ...r, pi, stock: r.variant_id ? r.vstock : r.pstock, image: r.vimage || safeJSON(r.images, [])[0] || '', line: round2(pi.price * r.qty) };
    });
}
const cartCount = (owner) => (owner ? one('SELECT COALESCE(SUM(qty), 0) n FROM cart_items WHERE owner = ?', owner).n : 0);

// Returns null on success or an error key (+ data) for the UI.
function addToCart(owner, productId, variantId, qty) {
  qty = Math.max(1, Math.min(99, qty | 0));
  const p = one('SELECT id, stock, active FROM products WHERE id = ?', productId);
  if (!p || !p.active) return { err: 'err.not_found' };
  const hasVariants = one('SELECT COUNT(*) n FROM variants WHERE product_id = ?', p.id).n > 0;
  let stock = p.stock;
  if (hasVariants) {
    const v = one('SELECT id, stock FROM variants WHERE id = ? AND product_id = ?', variantId, p.id);
    if (!v) return { err: 'pdp.choose_shade' };
    stock = v.stock; variantId = v.id;
  } else variantId = 0;
  const inCart = one('SELECT qty FROM cart_items WHERE owner = ? AND product_id = ? AND variant_id = ?', owner, p.id, variantId)?.qty || 0;
  if (stock <= 0) return { err: 'pdp.out_of_stock' };
  if (inCart + qty > stock) return { err: 'cart.only_left', vars: { n: stock } };
  run(`INSERT INTO cart_items (owner, product_id, variant_id, qty, added_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(owner, product_id, variant_id) DO UPDATE SET qty = MIN(99, qty + excluded.qty)`, owner, p.id, variantId, qty, Date.now());
  return null;
}
function setQty(owner, productId, variantId, qty) {
  qty |= 0;
  if (qty <= 0) { run('DELETE FROM cart_items WHERE owner = ? AND product_id = ? AND variant_id = ?', owner, productId, variantId); return null; }
  const it = cartItems(owner).find((i) => i.product_id === productId && i.variant_id === variantId);
  if (!it) return { err: 'err.not_found' };
  const max = Math.min(99, Math.max(0, it.stock));
  run('UPDATE cart_items SET qty = ? WHERE owner = ? AND product_id = ? AND variant_id = ?', Math.min(qty, max) || 1, owner, productId, variantId);
  return qty > max ? { err: 'cart.only_left', vars: { n: max } } : null;
}
const clearCart = (owner) => run('DELETE FROM cart_items WHERE owner = ?', owner);

// ---------- coupons ----------
const findCoupon = (code) => (code ? one('SELECT * FROM coupons WHERE code = ? AND active = 1', String(code).trim()) : null);
function couponError(c, subtotal) {
  if (!c) return { key: 'coupon.invalid' };
  const today = dayKey(new Date());
  if (c.starts && today < c.starts) return { key: 'coupon.invalid' };
  if (c.ends && today > c.ends) return { key: 'coupon.expired' };
  if (c.max_uses && c.used >= c.max_uses) return { key: 'coupon.expired' };
  if (c.min_total && subtotal < c.min_total) return { key: 'coupon.min', vars: { amount: c.min_total } };
  return null;
}

function computeTotals({ items, coupon, zone, method }) {
  const s = settings();
  const subtotal = round2(items.reduce((a, i) => a + i.line, 0));
  let discount = 0, freeShip = false;
  const couponErr = coupon ? couponError(coupon, subtotal) : null;
  if (coupon && !couponErr) {
    if (coupon.type === 'percent') discount = round2((subtotal * Math.min(100, coupon.value)) / 100);
    else if (coupon.type === 'fixed') discount = Math.min(subtotal, +coupon.value);
    else if (coupon.type === 'shipping') freeShip = true;
  }
  const after = round2(subtotal - discount);
  const freeOver = zone && zone.free_over !== null && zone.free_over !== '' && zone.free_over !== undefined ? +zone.free_over : +s.free_shipping_min || 0;
  let shipping = zone ? +zone.fee : 0;
  if (freeShip || (freeOver > 0 && after >= freeOver)) shipping = 0;
  const fee = method === 'cod' ? +s.cod_fee || 0 : 0;
  return {
    subtotal, discount: round2(discount), shipping, fee, total: round2(after + shipping + fee),
    freeOver, remaining: freeOver > 0 ? Math.max(0, round2(freeOver - after)) : 0, freeShip: freeShip || (freeOver > 0 && after >= freeOver),
    couponErr, coupon: coupon && !couponErr ? coupon : null, count: items.reduce((a, i) => a + i.qty, 0), zone,
  };
}

const zones = () => all('SELECT * FROM zones WHERE active = 1 ORDER BY sort, id');

module.exports = { cartItems, cartCount, addToCart, setQty, clearCart, findCoupon, couponError, computeTotals, zones };
