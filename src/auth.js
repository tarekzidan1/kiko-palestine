'use strict';
// Password hashing (scrypt), DB-backed sessions, CSRF (double-submit cookie), guards.
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const { one, all, run, tx } = require('./db');
const { token } = require('./util');
const { HttpError } = require('./http');

const scrypt = promisify(crypto.scrypt);
const SESSION_DAYS = 30;
const DAY = 864e5;

async function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(String(pw), salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt.toString('base64')}$${key.toString('base64')}`;
}
async function verifyPassword(pw, stored) {
  const [alg, n, r, p, salt, key] = String(stored || '').split('$');
  if (alg !== 'scrypt' || !key) return false;
  const want = Buffer.from(key, 'base64');
  const got = await scrypt(String(pw), Buffer.from(salt, 'base64'), want.length, { N: +n, r: +r, p: +p, maxmem: 64 << 20 });
  return crypto.timingSafeEqual(got, want);
}
const safeEqual = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

const USER_COLS = 'id, name, email, phone, role, lang, zone_id, city, address, newsletter, must_change, created_at';

function loadSession(ctx) {
  ctx.session = null; ctx.user = null;
  const sid = ctx.cookies.sid;
  if (sid) {
    const s = one('SELECT * FROM sessions WHERE id = ? AND expires > ?', sid, Date.now());
    if (s) {
      ctx.session = s;
      if (s.user_id) ctx.user = one(`SELECT ${USER_COLS} FROM users WHERE id = ?`, s.user_id) || null;
      if (s.expires - Date.now() < (SESSION_DAYS - 1) * DAY) { // sliding expiry, refreshed at most daily
        s.expires = Date.now() + SESSION_DAYS * DAY;
        run('UPDATE sessions SET expires = ? WHERE id = ?', s.expires, s.id);
        ctx.setCookie('sid', s.id, { maxAge: SESSION_DAYS * 86400 });
      }
    }
  }
  ctx.owner = ctx.user ? 'u:' + ctx.user.id : ctx.session ? 's:' + ctx.session.id : null;
}

function newSession(ctx, userId = null, coupon = null) {
  const id = token(32), expires = Date.now() + SESSION_DAYS * DAY;
  run('INSERT INTO sessions (id, user_id, coupon, expires) VALUES (?, ?, ?, ?)', id, userId, coupon, expires);
  ctx.session = { id, user_id: userId, coupon, expires };
  ctx.setCookie('sid', id, { maxAge: SESSION_DAYS * 86400 });
  return ctx.session;
}
function ensureSession(ctx) {
  if (!ctx.session) { newSession(ctx); ctx.owner = 's:' + ctx.session.id; }
  return ctx.session;
}

// Move guest cart/wishlist into the user's account (quantities are merged).
function mergeOwner(from, to) {
  if (!from || from === to) return;
  tx(() => {
    for (const it of all('SELECT * FROM cart_items WHERE owner = ?', from)) {
      run(`INSERT INTO cart_items (owner, product_id, variant_id, qty, added_at) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(owner, product_id, variant_id) DO UPDATE SET qty = MIN(99, qty + excluded.qty)`,
      to, it.product_id, it.variant_id, it.qty, it.added_at);
    }
    run('DELETE FROM cart_items WHERE owner = ?', from);
    run('INSERT OR IGNORE INTO wishlist (owner, product_id) SELECT ?, product_id FROM wishlist WHERE owner = ?', to, from);
    run('DELETE FROM wishlist WHERE owner = ?', from);
  });
}

function login(ctx, user) {
  const guestOwner = ctx.session && !ctx.session.user_id ? 's:' + ctx.session.id : null;
  const coupon = ctx.session?.coupon || null;
  if (ctx.session) run('DELETE FROM sessions WHERE id = ?', ctx.session.id); // rotate id (prevents fixation)
  newSession(ctx, user.id, coupon);
  mergeOwner(guestOwner, 'u:' + user.id);
  ctx.user = one(`SELECT ${USER_COLS} FROM users WHERE id = ?`, user.id);
  ctx.owner = 'u:' + user.id;
}
function logout(ctx) {
  if (ctx.session) run('DELETE FROM sessions WHERE id = ?', ctx.session.id);
  ctx.setCookie('sid', '', { maxAge: 0 });
  ctx.session = null; ctx.user = null; ctx.owner = null;
}

// ---------- CSRF ----------
function csrfCookie(ctx) {
  let t = ctx.cookies.csrf;
  if (!t || t.length < 20) { t = token(18); ctx.cookies.csrf = t; ctx.setCookie('csrf', t, { maxAge: 30 * 86400 }); }
  ctx.csrf = t;
}
function checkCsrf(ctx) {
  const sent = ctx.req.headers['x-csrf-token'] || ctx.body._csrf;
  if (!sent || !ctx.cookies.csrf || !safeEqual(sent, ctx.cookies.csrf)) throw new HttpError(403, 'Invalid or expired form. Please reload the page and try again.');
}

// ---------- guards ----------
const requireUser = (ctx) => { if (!ctx.user) return ctx.redirect(`/${ctx.lang || 'ar'}/account/login?next=${encodeURIComponent(ctx.url.pathname + ctx.url.search)}`); };
const requireAdmin = (ctx) => {
  if (!ctx.user || ctx.user.role !== 'admin') {
    if (ctx.method === 'GET') return ctx.redirect('/admin/login?next=' + encodeURIComponent(ctx.url.pathname + ctx.url.search));
    throw new HttpError(403, 'Admins only');
  }
};

const cleanupSessions = () => run('DELETE FROM sessions WHERE expires < ?', Date.now());

// First run: create the first admin (ADMIN_EMAIL / ADMIN_PASSWORD, default tarek@admin.com / tarek123).
async function ensureAdmin() {
  if (one("SELECT 1 FROM users WHERE role = 'admin'")) return null;
  const cfg = require('./config');
  const pw = cfg.ADMIN_PASSWORD || token(9);
  const email = cfg.ADMIN_EMAIL.toLowerCase();
  const hash = await hashPassword(pw);
  const mustChange = pw === cfg.STARTER_PASSWORD ? 1 : 0;
  const ex = one('SELECT id FROM users WHERE email = ?', email);
  if (ex) run("UPDATE users SET role = 'admin', password = ?, must_change = ? WHERE id = ?", hash, mustChange, ex.id);
  else run("INSERT INTO users (name, email, password, role, must_change) VALUES ('Tarek', ?, ?, 'admin', ?)", email, hash, mustChange);
  console.log(`\n  ➜ Admin account: ${email}  /  ${process.env.ADMIN_PASSWORD ? '(password from .env)' : pw}\n    Sign in at /admin and change it in "My account".\n`);
  return { email, password: pw };
}

module.exports = { hashPassword, verifyPassword, loadSession, ensureSession, login, logout, csrfCookie, checkCsrf, requireUser, requireAdmin, cleanupSessions, ensureAdmin, safeEqual, USER_COLS };
