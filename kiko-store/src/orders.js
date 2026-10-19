'use strict';
// Order placement (atomic stock checks), status changes, payment state.
const { one, all, run, tx, insert, settings } = require('./db');
const { cartItems, clearCart, findCoupon, computeTotals } = require('./cart');
const { syncStock } = require('./catalog');
const { token, phoneTail } = require('./util');

const STATUSES = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'];
const PAY_STATUSES = ['unpaid', 'paid', 'failed', 'refunded'];

function placeOrder({ owner, userId, lang, ip, couponCode, data }) {
  return tx(() => {
    const s = settings();
    const items = cartItems(owner);
    if (!items.length) return { err: 'cart.empty' };
    const bad = items.find((it) => it.qty > it.stock);
    if (bad) return { err: 'cart.only_left_named', vars: { name: lang === 'ar' ? bad.name_ar : bad.name_en, n: Math.max(0, bad.stock) } };
    const zone = one('SELECT * FROM zones WHERE id = ? AND active = 1', data.zone_id);
    if (!zone) return { err: 'co.zone_required' };
    const tot = computeTotals({ items, coupon: findCoupon(couponCode), zone, method: data.payment });
    if (+s.min_order > 0 && tot.subtotal < +s.min_order) return { err: 'co.min_order', vars: { amount: +s.min_order } };
    // "one per customer" codes (e.g. WELCOME10): match earlier non-cancelled orders by account, phone or email
    if (tot.coupon?.per_customer > 0) {
      const usedBefore = one(`SELECT COUNT(*) n FROM orders WHERE coupon = ? AND status <> 'cancelled'
        AND (user_id = ? OR substr(phone, -9) = ? OR (email IS NOT NULL AND email <> '' AND email = ?))`,
      tot.coupon.code, userId || -1, phoneTail(data.phone), data.email || '#').n;
      if (usedBefore >= tot.coupon.per_customer) return { err: 'coupon.used_before' };
    }

    const id = insert('orders', {
      token: token(16), user_id: userId || null, lang, ip,
      name: data.name, phone: data.phone, email: data.email || null,
      zone_id: zone.id, zone_name: `${zone.name_en} / ${zone.name_ar}`, city: data.city, address: data.address, notes: data.notes || null,
      subtotal: tot.subtotal, discount: tot.discount, shipping: tot.shipping, fee: tot.fee, total: tot.total,
      coupon: tot.coupon ? tot.coupon.code : null, payment_method: data.payment, payment_status: 'unpaid', status: 'pending',
    });
    run('UPDATE orders SET number = ? WHERE id = ?', `${s.order_prefix || ''}${1000 + id}`, id);
    for (const it of items) {
      insert('order_items', {
        order_id: id, product_id: it.product_id, variant_id: it.variant_id || null,
        name: it.name_en, name_ar: it.name_ar, variant: it.v_en || null, variant_ar: it.v_ar || null,
        sku: it.vsku || it.sku || null, image: it.image, price: it.pi.price, qty: it.qty,
      });
      if (it.variant_id) run('UPDATE variants SET stock = stock - ? WHERE id = ?', it.qty, it.variant_id);
      run('UPDATE products SET stock = stock - ?, sold = sold + ? WHERE id = ?', it.qty, it.qty, it.product_id);
    }
    if (tot.coupon) run('UPDATE coupons SET used = used + 1 WHERE id = ?', tot.coupon.id);
    clearCart(owner);
    run('INSERT INTO order_events (order_id, status) VALUES (?, ?)', id, 'pending');
    return { order: one('SELECT * FROM orders WHERE id = ?', id) };
  });
}

// Can the items of a cancelled order be taken from stock again?
function stockAvailable(orderId) {
  return all('SELECT * FROM order_items WHERE order_id = ?', orderId).every((it) => {
    if (!it.product_id) return true;
    const s = it.variant_id ? one('SELECT stock FROM variants WHERE id = ?', it.variant_id)?.stock : one('SELECT stock FROM products WHERE id = ?', it.product_id)?.stock;
    return s === undefined || s >= it.qty; // deleted products don't block
  });
}

function adjustStock(orderId, dir) {
  for (const it of all('SELECT * FROM order_items WHERE order_id = ?', orderId)) {
    if (!it.product_id) continue;
    if (it.variant_id) run('UPDATE variants SET stock = stock + ? WHERE id = ?', dir * it.qty, it.variant_id);
    run('UPDATE products SET stock = stock + ?, sold = MAX(0, sold - ?) WHERE id = ?', dir * it.qty, dir * it.qty, it.product_id);
    if (it.variant_id) syncStock(it.product_id);
  }
}

// Returns true when the status changed (or 'no_stock' when a cancelled order can't be restored).
// Cancelling gives stock (and the coupon use) back; un-cancelling takes them again — only if enough stock remains.
function setStatus(orderId, status, note) {
  if (!STATUSES.includes(status)) return false;
  return tx(() => {
    const o = one('SELECT * FROM orders WHERE id = ?', orderId);
    if (!o || o.status === status) return false;
    if (status === 'cancelled') {
      adjustStock(o.id, +1);
      if (o.coupon) run('UPDATE coupons SET used = MAX(0, used - 1) WHERE code = ?', o.coupon);
    } else if (o.status === 'cancelled') {
      if (!stockAvailable(o.id)) return 'no_stock';
      adjustStock(o.id, -1);
      if (o.coupon) run('UPDATE coupons SET used = used + 1 WHERE code = ?', o.coupon);
    }
    run('UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', status, o.id);
    run('INSERT INTO order_events (order_id, status, note) VALUES (?, ?, ?)', o.id, status, note || null);
    return true;
  });
}

function setPayment(orderId, payStatus, note, ref) {
  if (!PAY_STATUSES.includes(payStatus)) return false;
  return tx(() => {
    const o = one('SELECT * FROM orders WHERE id = ?', orderId);
    if (!o || o.payment_status === payStatus) return false;
    if (payStatus === 'failed' && o.payment_status === 'paid') return false; // never downgrade a confirmed payment
    if (payStatus === 'paid' && o.payment_status === 'refunded' && !note?.startsWith('by ')) return false; // gateway can't undo a refund
    if (payStatus === 'paid' && o.status === 'cancelled') { // paid after auto-cancel: revive the order if stock allows
      if (stockAvailable(o.id)) {
        adjustStock(o.id, -1);
        if (o.coupon) run('UPDATE coupons SET used = used + 1 WHERE code = ?', o.coupon);
        run("UPDATE orders SET status = 'pending' WHERE id = ?", o.id);
      } else {
        run('INSERT INTO order_events (order_id, status, note) VALUES (?, ?, ?)', o.id, 'cancelled', 'Paid after cancellation but items are out of stock — please refund the customer');
      }
    }
    run('UPDATE orders SET payment_status = ?, payment_ref = COALESCE(?, payment_ref), updated_at = CURRENT_TIMESTAMP WHERE id = ?', payStatus, ref || null, o.id);
    run('INSERT INTO order_events (order_id, status, note) VALUES (?, ?, ?)', o.id, 'payment_' + payStatus, note || null);
    return true;
  });
}

const orderItems = (id) => all('SELECT * FROM order_items WHERE order_id = ? ORDER BY id', id);
const orderEvents = (id) => all('SELECT * FROM order_events WHERE order_id = ? ORDER BY id', id);

// Unpaid card orders hold stock; release it after the configured timeout.
function cancelStaleCardOrders() {
  const h = Math.max(1, +settings().card_timeout_hours || 6);
  const rows = all(`SELECT id FROM orders WHERE payment_method = 'card' AND payment_status <> 'paid' AND status = 'pending'
    AND created_at < datetime('now', ?)`, `-${h} hours`);
  for (const r of rows) setStatus(r.id, 'cancelled', 'Auto-cancelled: card payment not completed');
  return rows.length;
}

module.exports = { STATUSES, PAY_STATUSES, placeOrder, setStatus, setPayment, orderItems, orderEvents, cancelStaleCardOrders };
