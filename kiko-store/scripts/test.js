'use strict';
// End-to-end test: seeds a throw-away database, starts the server and walks through real shopper + admin flows.
// Usage: npm test   (does not touch your real database)
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const assert = require('node:assert/strict');

const ROOT = path.join(__dirname, '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'store-test-'));
const PORT = 3900 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${PORT}`;
const env = { ...process.env, PORT: String(PORT), DB_PATH: path.join(TMP, 'test.db'), UPLOAD_DIR: path.join(TMP, 'uploads'), ADMIN_EMAIL: 'boss@test.ps', ADMIN_PASSWORD: 'admin-pass-123', BASE_URL: BASE, NODE_ENV: 'test' };
const NODE = [process.execPath, '--disable-warning=ExperimentalWarning'];

let passed = 0;
const step = async (name, fn) => { await fn(); passed++; console.log('  ✔', name); };

// ---------- tiny browser with a cookie jar ----------
function browser() {
  const jar = new Map();
  const b = {
    jar,
    async req(url, { method = 'GET', form, json, headers = {}, follow = false } = {}) {
      const h = { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; '), ...headers };
      let body;
      if (form) { h['content-type'] = 'application/x-www-form-urlencoded'; body = new URLSearchParams(Object.entries({ _csrf: jar.get('csrf'), ...form }).flatMap(([k, v]) => (Array.isArray(v) ? v.map((x) => [k, x]) : [[k, v ?? '']]))).toString(); }
      if (json) { h['content-type'] = 'application/json'; h.accept = 'application/json'; h['x-csrf-token'] = jar.get('csrf'); body = JSON.stringify(json); }
      const res = await fetch(BASE + url, { method: form || json ? 'POST' : method, headers: h, body, redirect: 'manual' });
      for (const c of res.headers.getSetCookie()) { const [kv, ...attrs] = c.split(';'); const i = kv.indexOf('='); const k = kv.slice(0, i), v = decodeURIComponent(kv.slice(i + 1)); if (/max-age=0/i.test(attrs.join(';'))) jar.delete(k); else jar.set(k, v); }
      const text = await res.text();
      const out = { status: res.status, location: res.headers.get('location'), text, json: (() => { try { return JSON.parse(text); } catch { return null; } })() };
      if (follow && out.location) return b.req(out.location);
      return out;
    },
    get: (u, o) => b.req(u, o), post: (u, form, o) => b.req(u, { form, ...o }), api: (u, json) => b.req(u, { json }),
  };
  return b;
}

// ---------- fake SMTP server (captures emails) ----------
const mails = [];
function smtpServer() {
  return new Promise((resolve) => {
    const srv = net.createServer((s) => {
      let data = false, buf = '', msg = '';
      s.write('220 test ESMTP\r\n');
      s.on('data', (d) => {
        buf += d;
        let i;
        while ((i = buf.indexOf('\r\n')) >= 0) {
          const line = buf.slice(0, i); buf = buf.slice(i + 2);
          if (data) { if (line === '.') { data = false; mails.push(msg); msg = ''; s.write('250 OK queued\r\n'); } else msg += line + '\n'; continue; }
          const cmd = line.slice(0, 4).toUpperCase();
          if (cmd === 'EHLO') s.write('250-test\r\n250 SIZE 10000000\r\n');
          else if (cmd === 'DATA') { data = true; s.write('354 go\r\n'); }
          else if (cmd === 'QUIT') { s.write('221 bye\r\n'); s.end(); }
          else s.write('250 OK\r\n');
        }
      });
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}
const decodeMail = (m) => { const parts = m.split(/Content-Transfer-Encoding: base64\n\n/).slice(1).map((p) => Buffer.from(p.split('\n--')[0].replace(/\n/g, ''), 'base64').toString('utf8')); return { raw: m, text: parts.join('\n') }; };
const waitFor = async (fn, ms = 4000) => { const t = Date.now(); while (Date.now() - t < ms) { if (fn()) return true; await new Promise((r) => setTimeout(r, 50)); } return false; };

(async () => {
  console.log('Seeding test database…');
  execFileSync(NODE[0], [...NODE.slice(1), path.join(ROOT, 'scripts/seed.js')], { env, stdio: 'ignore' });
  const smtp = await smtpServer();
  let server, log = '';
  const startServer = async () => {
    const mark = log.length;
    server = spawn(NODE[0], [...NODE.slice(1), path.join(ROOT, 'server.js')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    server.stdout.on('data', (d) => (log += d)); server.stderr.on('data', (d) => (log += d));
    await waitFor(() => log.slice(mark).includes('running on'), 8000);
  };
  const stopServer = () => new Promise((r) => { server.once('exit', r); server.kill(); });
  await startServer();
  const db = () => new (require('node:sqlite').DatabaseSync)(env.DB_PATH);

  try {
    const shopper = browser();
    console.log('Storefront');
    await step('root redirects to a language', async () => { const r = await shopper.get('/'); assert.equal(r.status, 302); assert.match(r.location, /^\/(ar|en)$/); });
    await step('Arabic home renders RTL with products', async () => { const r = await shopper.get('/ar'); assert.equal(r.status, 200); assert.match(r.text, /<html lang="ar" dir="rtl">/); assert.match(r.text, /class="card/); assert.ok(shopper.jar.get('csrf')); });
    await step('English home renders LTR', async () => { const r = await shopper.get('/en'); assert.match(r.text, /<html lang="en" dir="ltr">/); assert.match(r.text, /Best Sellers/); assert.match(r.text, /Kiko Palestine/); });
    await step('category, product, search, flags and pages', async () => {
      for (const u of ['/ar/c/makeup', '/en/c/lipstick', '/ar/p/cloud-matte-lipstick', '/en/search?q=lipstick', '/ar/search?q=احمر', '/ar/best-sellers', '/en/sale', '/ar/new', '/ar/page/shipping', '/en/contact', '/ar/track', '/sitemap.xml', '/robots.txt']) assert.equal((await shopper.get(u)).status, 200, u);
      assert.equal((await shopper.get('/ar/p/does-not-exist')).status, 404);
    });
    await step('Arabic search normalisation (احمر → أحمر)', async () => { const r = await shopper.get('/ar/search?q=احمر'); assert.match(r.text, /cloud-matte-lipstick/); });
    await step('search suggestions API', async () => { const r = await shopper.get('/api/suggest?q=mascara&lang=en'); assert.ok(r.json.products.length >= 1); });
    await step('POST without CSRF token is rejected', async () => { const r = await fetch(BASE + '/api/cart/add', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: '{}' }); assert.equal(r.status, 403); });

    const d = db();
    const lip = d.prepare("SELECT p.id pid, v.id vid, v.stock FROM products p JOIN variants v ON v.product_id = p.id WHERE p.slug = 'cloud-matte-lipstick' AND v.stock >= 10 ORDER BY v.id LIMIT 1").get();
    const outV = d.prepare("SELECT v.id vid FROM variants v JOIN products p ON p.id = v.product_id WHERE p.slug = 'cloud-matte-lipstick' AND v.stock = 0").get();
    const mascara = d.prepare("SELECT id, stock FROM products WHERE slug = 'big-lash-mascara'").get();
    d.close();

    console.log('Cart & checkout');
    await step('add shade to bag (JSON)', async () => { const r = await shopper.api('/api/cart/add', { product_id: lip.pid, variant_id: lip.vid, qty: 2 }); assert.equal(r.json.ok, true); assert.equal(r.json.count, 2); assert.match(r.json.html, /line/); });
    await step('out-of-stock shade is refused', async () => { const r = await shopper.api('/api/cart/add', { product_id: lip.pid, variant_id: outV.vid, qty: 1 }); assert.equal(r.status, 400); });
    await step('product with shades requires a shade', async () => { const r = await shopper.api('/api/cart/add', { product_id: lip.pid, variant_id: 0, qty: 1 }); assert.equal(r.status, 400); });
    await step('add simple product + update quantity', async () => {
      await shopper.api('/api/cart/add', { product_id: mascara.id, variant_id: 0, qty: 1 });
      const r = await shopper.api('/api/cart/update', { product_id: mascara.id, variant_id: 0, qty: 3 });
      assert.equal(r.json.count, 5);
    });
    await step('invalid coupon rejected, WELCOME10 applied', async () => {
      assert.equal((await shopper.api('/api/cart/coupon', { code: 'NOPE' })).status, 400);
      const r = await shopper.api('/api/cart/coupon', { code: 'welcome10' }); assert.equal(r.json.ok, true);
      const c = await shopper.get('/en/cart'); assert.match(c.text, /WELCOME10/);
    });
    await step('checkout summary updates with zone', async () => { const r = await shopper.get('/api/checkout/summary?zone_id=1&payment=cod&lang=en'); assert.match(r.json.html, /Delivery/); });
    await step('checkout validation errors are shown', async () => { const r = await shopper.post('/en/checkout', { name: 'A', phone: '12', zone_id: '', city: '', address: '', payment: 'cod' }); assert.equal(r.status, 200); assert.match(r.text, /Please enter a valid mobile number/); });
    let order;
    await step('place a cash-on-delivery order', async () => {
      const r = await shopper.post('/en/checkout', { name: 'Lina Haddad', phone: '0599 123 456', email: 'lina@test.ps', zone_id: '1', city: 'Ramallah', address: 'Al-Tireh, building 4', notes: 'Call before', payment: 'cod' });
      assert.equal(r.status, 303); assert.match(r.location, /\/en\/order\/KP-\d+\?t=.+&new=1/);
      const page = await shopper.get(r.location); assert.match(page.text, /Thank you for your order/);
      const x = db(); order = x.prepare('SELECT * FROM orders ORDER BY id DESC LIMIT 1').get();
      const v = x.prepare('SELECT stock FROM variants WHERE id = ?').get(lip.vid); const m = x.prepare('SELECT stock FROM products WHERE id = ?').get(mascara.id); x.close();
      assert.equal(v.stock, lip.stock - 2); assert.equal(m.stock, mascara.stock - 3);
      assert.equal(order.coupon, 'WELCOME10'); assert.ok(order.discount > 0); assert.equal(order.payment_method, 'cod');
      assert.equal(Math.round((order.subtotal - order.discount + order.shipping) * 100), Math.round(order.total * 100));
      assert.equal((await shopper.get('/api/cart')).json.count, 0);
    });
    await step('order page is private without the token', async () => { assert.equal((await browser().get(`/en/order/${order.number}`)).status, 404); });
    await step('track order with number + phone', async () => { const b = browser(); await b.get('/ar/track'); const r = await b.post('/ar/track', { number: order.number.toLowerCase(), phone: '+970599123456' }); assert.equal(r.status, 303); assert.match(r.location, /t=/); });
    await step('WELCOME10 is limited to one use per customer', async () => {
      const b = browser(); await b.get('/en');
      await b.api('/api/cart/add', { product_id: mascara.id, variant_id: 0, qty: 1 });
      await b.api('/api/cart/coupon', { code: 'WELCOME10' });
      const r = await b.post('/en/checkout', { name: 'Lina H', phone: '+970599123456', zone_id: '1', city: 'Ramallah', address: 'Al-Tireh 2', payment: 'cod' });
      assert.equal(r.status, 200); assert.match(r.text, /only be used once per customer/);
    });
    await step('Arabic-Indic digits work in phone numbers', async () => {
      const b = browser(); await b.get('/ar');
      await b.api('/api/cart/add', { product_id: mascara.id, variant_id: 0, qty: 1 });
      const r = await b.post('/ar/checkout', { name: 'سارة', phone: '٠٥٩٨٧٦٥٤٣٢', zone_id: '1', city: 'رام الله', address: 'البيرة، شارع القدس', payment: 'cod' });
      assert.equal(r.status, 303);
    });

    console.log('Accounts, wishlist, newsletter, contact');
    const cust = browser();
    await cust.get('/en');
    await step('guest wishlist + cart merge into new account', async () => {
      await cust.api('/api/wishlist/toggle', { product_id: mascara.id });
      await cust.api('/api/cart/add', { product_id: mascara.id, variant_id: 0, qty: 1 });
      const r = await cust.post('/en/account/register', { name: 'Sara Khalil', email: 'sara@test.ps', phone: '0569876543', password: 'secret-123' });
      assert.equal(r.status, 303);
      assert.equal((await cust.get('/api/cart')).json.count, 1);
      assert.match((await cust.get('/en/wishlist')).text, /big-lash-mascara/);
    });
    await step('logout + login with phone number', async () => {
      await cust.post('/en/account/logout', {});
      assert.equal((await cust.get('/en/account')).status, 303);
      await cust.get('/en/account/login');
      const r = await cust.post('/en/account/login', { login: '+970 56 987 6543', password: 'secret-123' });
      assert.equal(r.status, 303);
      assert.match((await cust.get('/en/account')).text, /Hello, Sara/);
    });
    await step('wrong password is rejected', async () => { const b = browser(); await b.get('/en/account/login'); const r = await b.post('/en/account/login', { login: 'sara@test.ps', password: 'nope' }); assert.match(r.text, /Incorrect login details/); });
    await step('newsletter + contact form', async () => {
      assert.equal((await cust.api('/api/newsletter', { email: 'fan@test.ps' })).json.ok, true);
      const r = await cust.post('/en/contact', { name: 'Sara', email: 'sara@test.ps', body: 'Do you have this in pink?' }); assert.match(r.text, /received your message/);
    });

    console.log('Admin');
    const admin = browser();
    await admin.get('/admin/login');
    await step('customers cannot open admin', async () => { assert.equal((await cust.get('/admin')).status, 303); });
    await step('admin login + dashboard', async () => {
      const r = await admin.post('/admin/login', { email: 'boss@test.ps', password: 'admin-pass-123' }); assert.equal(r.status, 303);
      const dsh = await admin.get('/admin'); assert.equal(dsh.status, 200); assert.match(dsh.text, /Sales — last 14 days/);
    });
    await step('all admin pages load', async () => {
      for (const u of ['/admin/orders', `/admin/orders/${order.id}`, `/admin/orders/${order.id}/invoice`, '/admin/products', '/admin/products/new', `/admin/products/${mascara.id}`, '/admin/products/import', '/admin/r/categories', '/admin/r/categories/new', '/admin/r/zones', '/admin/r/coupons', '/admin/r/banners', '/admin/r/sections', '/admin/r/pages', '/admin/customers', '/admin/messages', '/admin/subscribers', '/admin/settings', '/admin/orders/export.csv', '/admin/products/export.csv', '/admin/customers/export.csv', '/admin/subscribers/export.csv'])
        assert.equal((await admin.get(u)).status, 200, u);
    });
    await step('cancelling an order restores stock; confirming takes it again', async () => {
      await admin.post(`/admin/orders/${order.id}/status`, { status: 'cancelled', note: 'test' });
      let x = db(); assert.equal(x.prepare('SELECT stock FROM variants WHERE id = ?').get(lip.vid).stock, lip.stock); x.close();
      await admin.post(`/admin/orders/${order.id}/status`, { status: 'confirmed' });
      x = db(); assert.equal(x.prepare('SELECT stock FROM variants WHERE id = ?').get(lip.vid).stock, lip.stock - 2); assert.equal(x.prepare('SELECT status FROM orders WHERE id = ?').get(order.id).status, 'confirmed'); x.close();
    });
    let newId;
    await step('upload image + create product with shades (XSS-safe)', async () => {
      const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
      const up = await admin.api('/admin/upload', { name: 'photo.png', data: png }); assert.equal(up.json.ok, true); assert.match(up.json.url, /^\/uploads\//);
      assert.equal((await admin.api('/admin/upload', { name: 'x.png', data: 'data:image/png;base64,PHNjcmlwdD4=' })).status, 400);
      const r = await admin.post('/admin/products/new', {
        name_en: 'Test <script>alert(1)</script> Gloss', name_ar: 'ملمع تجريبي', price: '50', sale_price: '40', stock: '0', active: '1', is_new: '1', images: JSON.stringify([up.json.url]),
        'cats[]': ['3'], 'v_id[]': ['', ''], 'v_name_en[]': ['Pink', 'Red'], 'v_name_ar[]': ['وردي', 'أحمر'], 'v_color[]': ['#ff99aa', '#cc0000'], 'v_sku[]': ['T-1', 'T-2'], 'v_stock[]': ['5', '7'], 'v_image[]': ['', ''],
      });
      assert.equal(r.status, 303); newId = +r.location.match(/products\/(\d+)/)[1];
      const x = db(); const p = x.prepare('SELECT * FROM products WHERE id = ?').get(newId); x.close();
      assert.equal(p.stock, 12); assert.equal(p.sale_price, 40);
      const page = await shopper.get('/en/p/' + p.slug); assert.equal(page.status, 200); assert.ok(!page.text.includes('<script>alert(1)</script>')); assert.match(page.text, /&lt;script&gt;/);
    });
    await step('CSV export → import round-trip', async () => {
      const csv = (await admin.get('/admin/products/export.csv')).text;
      const r = await admin.post('/admin/products/import', { csv }); assert.match(r.text, /Created 0, updated \d+/);
    });
    await step('generic CRUD: create a coupon, reject duplicate', async () => {
      assert.equal((await admin.post('/admin/r/coupons/new', { code: 'eid25', type: 'percent', value: '25', min_total: '0', active: '1' })).status, 303);
      const dup = await admin.post('/admin/r/coupons/new', { code: 'EID25', type: 'percent', value: '5', active: '1' }); assert.match(dup.text, /already used/);
    });

    console.log('Order scenario — deep checks (database & backend)');
    await step('prices are computed on the server (tampered form fields are ignored)', async () => {
      const b = browser(); await b.get('/en');
      await b.api('/api/cart/add', { product_id: mascara.id, variant_id: 0, qty: 2 });
      const r = await b.post('/en/checkout', { name: 'Tamper Test', phone: '0591230000', zone_id: '2', city: 'Jerusalem', address: 'Old City 1', payment: 'cod', price: '1', total: '1', subtotal: '1', shipping: '0', discount: '999' });
      assert.equal(r.status, 303);
      const x = db(); const o = x.prepare('SELECT * FROM orders ORDER BY id DESC LIMIT 1').get(); const p = x.prepare('SELECT price, sale_price FROM products WHERE id = ?').get(mascara.id); x.close();
      const unit = p.sale_price && p.sale_price < p.price ? p.sale_price : p.price;
      assert.equal(o.subtotal, unit * 2); assert.equal(o.shipping, 30); assert.equal(o.total, unit * 2 + 30); assert.equal(o.discount, 0);
    });
    await step('full order lifecycle: received → confirmed → out for delivery → delivered', async () => {
      const b = browser(); await b.get('/ar');
      await b.api('/api/cart/add', { product_id: mascara.id, variant_id: 0, qty: 1 });
      const r = await b.post('/ar/checkout', { name: 'نور', phone: '0592223333', email: 'nour@test.ps', zone_id: '1', city: 'جنين', address: 'شارع حيفا', payment: 'cod' });
      assert.equal(r.status, 303);
      const x = db(); const o = x.prepare('SELECT * FROM orders ORDER BY id DESC LIMIT 1').get(); x.close();
      assert.equal(o.status, 'pending'); assert.equal(o.lang, 'ar');
      for (const st of ['confirmed', 'shipped', 'delivered']) assert.equal((await admin.post(`/admin/orders/${o.id}/status`, { status: st })).status, 303);
      const y = db(); const ev = y.prepare('SELECT status FROM order_events WHERE order_id = ? ORDER BY id').all(o.id).map((e) => e.status); const o2 = y.prepare('SELECT status FROM orders WHERE id = ?').get(o.id); y.close();
      assert.deepEqual(ev, ['pending', 'confirmed', 'shipped', 'delivered']); assert.equal(o2.status, 'delivered');
      const page = await b.get(r.location.replace('&new=1', '')); assert.match(page.text, /class="st st-delivered">تم التوصيل/);
      const adminView = await admin.get(`/admin/orders/${o.id}`); assert.match(adminView.text, /class="st st-delivered">Delivered/);
    });
    await step('two customers racing for the last unit: exactly one order, stock never negative', async () => {
      const x = db(); const v = x.prepare("SELECT v.id vid, v.product_id pid FROM variants v JOIN products p ON p.id = v.product_id WHERE p.slug = 'gel-effect-nail-polish' ORDER BY v.id LIMIT 1").get();
      x.prepare('UPDATE variants SET stock = 1 WHERE id = ?').run(v.vid); x.close();
      const [b1, b2] = [browser(), browser()];
      await Promise.all([b1.get('/en'), b2.get('/en')]);
      await b1.api('/api/cart/add', { product_id: v.pid, variant_id: v.vid, qty: 1 });
      await b2.api('/api/cart/add', { product_id: v.pid, variant_id: v.vid, qty: 1 });
      const form = (n) => ({ name: 'Racer ' + n, phone: '05900000' + n + n, zone_id: '1', city: 'Ramallah', address: 'Main St ' + n, payment: 'cod' });
      const [r1, r2] = await Promise.all([b1.post('/en/checkout', form(1)), b2.post('/en/checkout', form(2))]);
      assert.equal([r1, r2].filter((r) => r.status === 303).length, 1, 'exactly one order must win');
      const loser = [r1, r2].find((r) => r.status !== 303); assert.match(loser.text, /only 0 left/);
      const y = db(); assert.equal(y.prepare('SELECT stock FROM variants WHERE id = ?').get(v.vid).stock, 0); y.close();
    });
    await step('data survives a server restart (orders, sessions, settings)', async () => {
      const before = (await admin.get('/admin/orders')).text.match(/KP-\d+/g).length;
      await stopServer(); await startServer();
      const after = await admin.get('/admin/orders'); assert.equal(after.status, 200, 'admin session persisted'); assert.equal(after.text.match(/KP-\d+/g).length, before);
      const x = db(); const o = x.prepare('SELECT number, token, lang FROM orders WHERE id = ?').get(order.id); x.close();
      assert.match((await browser().get(`/${o.lang}/order/${o.number}?t=${o.token}`)).text, new RegExp(o.number));
    });
    await step('database integrity and foreign keys are clean', async () => {
      const x = db();
      assert.equal(x.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
      assert.equal(x.prepare('PRAGMA foreign_key_check').all().length, 0);
      assert.equal(x.prepare('SELECT COUNT(*) n FROM variants WHERE stock < 0').get().n, 0);
      assert.equal(x.prepare('SELECT COUNT(*) n FROM products WHERE stock < 0').get().n, 0);
      x.close();
    });

    console.log('Card payments (test mode) + email notifications');
    await step('enable card payments (test mode) + SMTP', async () => {
      const r = await admin.post('/admin/settings', { card_enabled: '1', card_provider: 'mock', paytabs_currency: 'USD', paytabs_rate: '0.27', smtp_host: '127.0.0.1', smtp_port: String(smtp.address().port), notify_email: 'owner@test.ps' });
      assert.equal(r.status, 303);
    });
    let cardOrder;
    await step('card checkout redirects to gateway; success marks paid', async () => {
      const b = browser(); await b.get('/en');
      await b.api('/api/cart/add', { product_id: mascara.id, variant_id: 0, qty: 1 });
      const r = await b.post('/en/checkout', { name: 'Omar Saleh', phone: '0591112223', email: 'omar@test.ps', zone_id: '2', city: 'Jerusalem', address: 'Beit Hanina', payment: 'card' });
      assert.equal(r.status, 303); assert.match(r.location, /^\/pay\/mock\//);
      const page = await b.get(r.location); assert.match(page.text, /TEST MODE/);
      const x = db(); cardOrder = x.prepare('SELECT * FROM orders ORDER BY id DESC LIMIT 1').get(); x.close();
      assert.equal(cardOrder.charge_currency, 'USD'); assert.equal(cardOrder.charge_amount, Math.round(cardOrder.total * 0.27 * 100) / 100);
      const t = new URL(BASE + r.location).searchParams.get('t');
      const done = await b.post(`/pay/mock/${cardOrder.number}`, { t, result: 'paid' }); assert.match(done.location, /pay=ok/);
      const op = await b.get(done.location); assert.match(op.text, /Payment received/);
      const y = db(); assert.equal(y.prepare('SELECT payment_status FROM orders WHERE id = ?').get(cardOrder.id).payment_status, 'paid'); y.close();
    });
    await step('forged gateway return cannot reveal an order link', async () => {
      const r = await fetch(`${BASE}/pay/paytabs/return`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ cartId: cardOrder.number, respStatus: 'A' }) });
      assert.equal(r.status, 303); assert.doesNotMatch(r.headers.get('location'), /t=/);
    });
    await step('declined card leaves order unpaid with a retry button', async () => {
      const b = browser(); await b.get('/ar');
      await b.api('/api/cart/add', { product_id: mascara.id, variant_id: 0, qty: 1 });
      const r = await b.post('/ar/checkout', { name: 'Huda', phone: '0597770001', email: 'huda@test.ps', zone_id: '1', city: 'نابلس', address: 'رفيديا', payment: 'card' });
      const t = new URL(BASE + r.location).searchParams.get('t'); const num = r.location.split('/')[3];
      const done = await b.post(`/pay/mock/${num}`, { t, result: 'failed' });
      const op = await b.get(done.location); assert.match(op.text, /لم تكتمل عملية الدفع/); assert.match(op.text, /pay\/retry/);
    });
    await step('order emails reach customer and shop owner (SMTP)', async () => {
      assert.ok(await waitFor(() => mails.length >= 2), 'no emails received');
      const all = mails.map(decodeMail);
      assert.ok(all.some((m) => /To: omar@test\.ps/.test(m.raw) && m.text.includes(cardOrder.number)), 'customer email');
      assert.ok(all.some((m) => /To: owner@test\.ps/.test(m.raw)), 'owner email');
    });
    await step('status change emails the customer', async () => {
      const before = mails.length;
      await admin.post(`/admin/orders/${cardOrder.id}/status`, { status: 'shipped', notify: '1' });
      assert.ok(await waitFor(() => mails.length > before));
      assert.match(decodeMail(mails[mails.length - 1]).text, /on its way/);
    });
    console.log('PayTabs integration (simulated gateway)');
    await step('return-URL signature matches the PayTabs documentation example', async () => {
      process.env.DB_PATH = env.DB_PATH; // load app modules against the test DB
      const { validReturnSignature, validCallbackSignature } = require('../src/payments');
      const doc = Object.fromEntries(new URLSearchParams('acquirerMessage=&acquirerRRN=&cartId=cart_11111&customerEmail=email%40domain.com&respCode=G84718&respMessage=Authorised&respStatus=A&signature=7a181a32c768621eb6966107752ee70205a01f1c4403a3d13c0ff604f591f988&token=&tranRef=TST2215201242166'));
      assert.equal(validReturnSignature(doc, 'SGJNZ96JLG-JDMKHGRWT9-RWRK2KJNRJ'), true);
      assert.equal(validReturnSignature({ ...doc, respStatus: 'D' }, 'SGJNZ96JLG-JDMKHGRWT9-RWRK2KJNRJ'), false);
      const raw = Buffer.from('{"tran_ref":"X"}');
      const sig = require('node:crypto').createHmac('sha256', 'k').update(raw).digest('hex');
      assert.equal(validCallbackSignature(raw, sig, 'k'), true);
      assert.equal(validCallbackSignature(raw, 'bad', 'k'), false);
    });
    const gw = { requests: [] };
    const fake = require('node:http').createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        if (req.headers.authorization !== 'SKEY-TEST') { res.writeHead(401); return res.end('{"message":"Authentication failed"}'); }
        const j = JSON.parse(body || '{}');
        gw.requests.push({ path: req.url, body: j });
        res.setHeader('content-type', 'application/json');
        if (req.url === '/payment/request') { gw.last = j; return res.end(JSON.stringify({ tran_ref: 'TST0001', cart_id: j.cart_id, redirect_url: `http://127.0.0.1:${fake.address().port}/payment/page/ABC` })); }
        if (req.url === '/payment/query') return res.end(JSON.stringify({ tran_ref: j.tran_ref, cart_id: gw.last.cart_id, cart_amount: Number(gw.last.cart_amount).toFixed(2), cart_currency: gw.last.cart_currency, payment_result: { response_status: 'A', response_message: 'Authorised' } }));
        res.writeHead(404); res.end('{}');
      });
    }).listen(0, '127.0.0.1');
    await new Promise((r) => fake.once('listening', r));
    await step('PayTabs: request → redirect → return → query → paid', async () => {
      await admin.post('/admin/settings', { card_provider: 'paytabs', paytabs_profile_id: '123456', paytabs_server_key: 'SKEY-TEST', paytabs_domain: `http://127.0.0.1:${fake.address().port}`, paytabs_currency: 'USD', paytabs_rate: '0.27' });
      const b = browser(); await b.get('/en');
      await b.api('/api/cart/add', { product_id: mascara.id, variant_id: 0, qty: 2 });
      const r = await b.post('/en/checkout', { name: 'Rami Odeh', phone: '0598884444', email: 'rami@test.ps', zone_id: '1', city: 'Bethlehem', address: 'Star St', payment: 'card' });
      assert.equal(r.status, 303); assert.match(r.location, /\/payment\/page\/ABC$/);
      const sent = gw.last;
      assert.equal(sent.profile_id, 123456); assert.equal(sent.tran_type, 'sale'); assert.equal(sent.tran_class, 'ecom'); assert.equal(sent.cart_currency, 'USD');
      assert.equal(sent.return, `${BASE}/pay/paytabs/return`); assert.equal(sent.callback, `${BASE}/pay/paytabs/callback`); assert.equal(sent.customer_details.email, 'rami@test.ps'); assert.equal(sent.paypage_lang, 'en');
      const x = db(); const o = x.prepare('SELECT * FROM orders WHERE number = ?').get(sent.cart_id); x.close();
      assert.equal(sent.cart_amount, Math.round(o.total * 0.27 * 100) / 100);
      // the customer's browser comes back with a cross-site POST (no cookies, no CSRF token)
      const back = await fetch(`${BASE}/pay/paytabs/return`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ tranRef: 'TST0001', cartId: o.number, respStatus: 'A', respMessage: 'Authorised' }) });
      assert.equal(back.status, 303); assert.match(back.headers.get('location'), /pay=ok/);
      assert.ok(gw.requests.some((q) => q.path === '/payment/query' && q.body.tran_ref === 'TST0001'));
      const y = db(); const o2 = y.prepare('SELECT payment_status, payment_ref FROM orders WHERE id = ?').get(o.id); y.close();
      assert.equal(o2.payment_status, 'paid'); assert.equal(o2.payment_ref, 'TST0001');
    });
    await step('PayTabs callback: bad signature 401, good signature 200', async () => {
      const raw = JSON.stringify({ tran_ref: 'TST0001', cart_id: gw.last.cart_id });
      const bad = await fetch(`${BASE}/pay/paytabs/callback`, { method: 'POST', headers: { 'content-type': 'application/json', signature: 'nope' }, body: raw });
      assert.equal(bad.status, 401);
      const sig = require('node:crypto').createHmac('sha256', 'SKEY-TEST').update(raw).digest('hex');
      const good = await fetch(`${BASE}/pay/paytabs/callback`, { method: 'POST', headers: { 'content-type': 'application/json', signature: sig }, body: raw });
      assert.equal(good.status, 200);
    });
    fake.close();

    await step('backup download is a valid SQLite file', async () => { const r = await fetch(BASE + '/admin/backup', { headers: { cookie: [...admin.jar].map(([k, v]) => `${k}=${v}`).join('; ') } }); const buf = Buffer.from(await r.arrayBuffer()); assert.equal(buf.subarray(0, 15).toString(), 'SQLite format 3'); });

    console.log(`\n✔ All ${passed} checks passed.`);
  } catch (e) {
    console.error('\n✖ FAILED:', e.message, '\n', e.stack?.split('\n').slice(1, 4).join('\n'));
    console.error('\n--- server log ---\n' + log.slice(-3000));
    process.exitCode = 1;
  } finally {
    server.kill(); smtp.close();
    fs.rmSync(TMP, { recursive: true, force: true });
  }
})();
