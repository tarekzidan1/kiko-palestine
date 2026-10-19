'use strict';
// Entry point: node server.js  (Node.js 22.13+; no npm install needed)
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const cfg = require('./src/config');
const { one, all, run, settings } = require('./src/db');
const { createApp } = require('./src/http');
const { tr, loc, link } = require('./src/i18n');
const { money } = require('./src/util');
const { loadSession, csrfCookie, checkCsrf, cleanupSessions, ensureAdmin } = require('./src/auth');
const { cartCount } = require('./src/cart');
const { cancelStaleCardOrders } = require('./src/orders');
const shopViews = require('./src/views/shop');

fs.mkdirSync(cfg.UPLOAD_DIR, { recursive: true });

// POSTs that come from outside the site (payment gateway) skip CSRF checks
const CSRF_EXEMPT = new Set(['/pay/paytabs/return', '/pay/paytabs/callback']);

const app = createApp({
  statics: [
    { prefix: '/assets/', dir: path.join(cfg.ROOT, 'public'), immutable: true },
    { prefix: '/uploads/', dir: cfg.UPLOAD_DIR, sandbox: true },
  ],
  bodyLimit: (p) => (p === '/admin/upload' || p === '/admin/products/import' ? 15e6 : 2e6),
  notFound: (ctx) => (ctx.path.startsWith('/api/') ? { ok: false, error: 'Not found' } : shopViews.errorPage(ctx, 404)),
  onError: (ctx, err) => {
    const status = err.status || 500;
    if (ctx.wantsJSON || ctx.path.startsWith('/api/')) return { ok: false, error: status < 500 ? err.message : ctx.t('err.text') };
    if (!ctx.t) return `Error ${status}`;
    return shopViews.errorPage(ctx, status, status < 500 ? err.message : null);
  },
});

// Per-request context: language, session/user, settings, CSRF, helpers for views
app.use((ctx) => {
  const isAdmin = ctx.path.startsWith('/admin');
  if (!ctx.lang) {
    const pick = (v) => (v === 'ar' || v === 'en' ? v : null);
    ctx.lang = isAdmin ? pick(ctx.cookies.alang) || 'en' : pick(ctx.query.lang) || pick(ctx.body.lang) || pick(ctx.cookies.lang) || cfg.DEFAULT_LANG;
  } else if (ctx.cookies.lang !== ctx.lang) ctx.setCookie('lang', ctx.lang, { maxAge: 365 * 86400 });
  ctx.s = settings();
  ctx.t = (k, v) => tr(ctx.lang, k, v);
  ctx.L = (o, f) => loc(o, f, ctx.lang);
  ctx.u = (p) => link(ctx.lang, p);
  ctx.money = (n) => money(n, ctx.s.currency_symbol);
  loadSession(ctx);
  csrfCookie(ctx);
  if (ctx.method === 'POST' && !CSRF_EXEMPT.has(ctx.path)) checkCsrf(ctx);
  if (ctx.method === 'GET' && !isAdmin && !ctx.path.startsWith('/api/')) {
    ctx.cartCount = cartCount(ctx.owner);
    ctx.wishIds = new Set(ctx.owner ? all('SELECT product_id FROM wishlist WHERE owner = ?', ctx.owner).map((r) => r.product_id) : []);
  }
});

require('./src/routes/shop')(app);
require('./src/routes/account')(app);
require('./src/routes/api')(app);
require('./src/routes/pay')(app);
require('./src/routes/admin')(app);
app.get('/healthz', () => ({ ok: true }));

// first start on a new server: load the demo catalog once (DEMO_DATA=off to start with an empty shop)
if (!one("SELECT 1 FROM settings WHERE key = 'demo_seeded'")) {
  if (cfg.DEMO_DATA && !one('SELECT 1 FROM products LIMIT 1')) {
    try { require('./scripts/seed').seedDemo(); } catch (e) { console.error('[demo data]', e); }
  }
  run("INSERT OR REPLACE INTO settings (key, value) VALUES ('demo_seeded', '1')");
}
// first run: make sure an admin exists
ensureAdmin().catch((e) => console.error(e));

// ---------- background jobs ----------
function jobs() {
  try {
    cleanupSessions();
    run("DELETE FROM cart_items WHERE owner LIKE 's:%' AND substr(owner, 3) NOT IN (SELECT id FROM sessions)");
    run("DELETE FROM wishlist WHERE owner LIKE 's:%' AND substr(owner, 3) NOT IN (SELECT id FROM sessions)");
    const n = cancelStaleCardOrders();
    if (n) console.log(`[jobs] auto-cancelled ${n} unpaid card order(s)`);
  } catch (e) { console.error('[jobs]', e); }
}
setInterval(jobs, 10 * 60e3).unref();
setTimeout(jobs, 5e3).unref();

const server = http.createServer(app.handle);
server.keepAliveTimeout = 65e3;
server.listen(cfg.PORT, cfg.HOST, () => {
  const s = settings();
  console.log(`✔ ${s.store_name_en} running on http://localhost:${cfg.PORT}  (admin: /admin)`);
  if (!cfg.BASE_URL) console.log('  Tip: set BASE_URL in .env (e.g. https://yourstore.ps) for emails & card payments.');
});
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { server.close(); process.exit(0); });
process.on('unhandledRejection', (e) => console.error('[unhandledRejection]', e)); // never crash the shop on a stray promise
if (cfg.PROD && !cfg.BASE_URL) console.warn('⚠ NODE_ENV=production but BASE_URL is not set — password-reset emails are disabled until you set it.');

module.exports = { app, server };
