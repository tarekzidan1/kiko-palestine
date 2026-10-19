'use strict';
// SQLite via Node's built-in node:sqlite (no native npm modules to compile).
const fs = require('node:fs');
const path = require('node:path');
const cfg = require('./config');

// node:sqlite prints an "ExperimentalWarning" on some Node versions — hide just that one line
const emitWarning = process.emitWarning;
process.emitWarning = (w, ...a) => (/SQLite/i.test(String(w && w.message ? w.message : w)) ? undefined : emitWarning.call(process, w, ...a));

let DatabaseSync;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch {
  console.error('\n✖ This app needs Node.js 22.13 or newer (it uses the built-in SQLite).\n  Download Node.js 24 LTS from https://nodejs.org\n');
  process.exit(1);
}

fs.mkdirSync(path.dirname(cfg.DB_PATH), { recursive: true });
const db = new DatabaseSync(cfg.DB_PATH);
db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA synchronous=NORMAL;');

// ---------- schema ----------
db.exec(`
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE COLLATE NOCASE, phone TEXT,
  password TEXT, role TEXT NOT NULL DEFAULT 'customer', lang TEXT DEFAULT 'ar',
  zone_id INTEGER, city TEXT, address TEXT, newsletter INTEGER DEFAULT 0,
  reset_token TEXT, reset_expires INTEGER, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS users_phone ON users(phone);

CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, user_id INTEGER, coupon TEXT, expires INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  slug TEXT UNIQUE NOT NULL, name_en TEXT NOT NULL, name_ar TEXT NOT NULL, desc_en TEXT, desc_ar TEXT,
  image TEXT, sort INTEGER DEFAULT 0, menu INTEGER DEFAULT 1, active INTEGER DEFAULT 1);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY, slug TEXT UNIQUE NOT NULL, sku TEXT,
  name_en TEXT NOT NULL, name_ar TEXT NOT NULL, short_en TEXT, short_ar TEXT,
  desc_en TEXT, desc_ar TEXT, howto_en TEXT, howto_ar TEXT, ingredients TEXT,
  price REAL NOT NULL DEFAULT 0, sale_price REAL, stock INTEGER NOT NULL DEFAULT 0,
  is_new INTEGER DEFAULT 0, is_bestseller INTEGER DEFAULT 0, is_limited INTEGER DEFAULT 0, featured INTEGER DEFAULT 0,
  images TEXT NOT NULL DEFAULT '[]', active INTEGER DEFAULT 1, sort INTEGER DEFAULT 0, sold INTEGER DEFAULT 0,
  main_cat INTEGER, meta_title TEXT, meta_desc TEXT, search TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS products_active ON products(active, sort);

CREATE TABLE IF NOT EXISTS product_categories (
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (product_id, category_id));
CREATE INDEX IF NOT EXISTS pc_cat ON product_categories(category_id);

CREATE TABLE IF NOT EXISTS variants (
  id INTEGER PRIMARY KEY, product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name_en TEXT, name_ar TEXT, color TEXT, sku TEXT, stock INTEGER NOT NULL DEFAULT 0, image TEXT, sort INTEGER DEFAULT 0);
CREATE INDEX IF NOT EXISTS variants_product ON variants(product_id);

CREATE TABLE IF NOT EXISTS cart_items (
  owner TEXT NOT NULL, product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_id INTEGER NOT NULL DEFAULT 0, qty INTEGER NOT NULL, added_at INTEGER,
  PRIMARY KEY (owner, product_id, variant_id));

CREATE TABLE IF NOT EXISTS wishlist (
  owner TEXT NOT NULL, product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  PRIMARY KEY (owner, product_id));

CREATE TABLE IF NOT EXISTS zones (
  id INTEGER PRIMARY KEY, name_en TEXT NOT NULL, name_ar TEXT NOT NULL, fee REAL NOT NULL DEFAULT 0,
  free_over REAL, days_en TEXT, days_ar TEXT, sort INTEGER DEFAULT 0, active INTEGER DEFAULT 1);

CREATE TABLE IF NOT EXISTS coupons (
  id INTEGER PRIMARY KEY, code TEXT UNIQUE COLLATE NOCASE NOT NULL, type TEXT NOT NULL DEFAULT 'percent',
  value REAL NOT NULL DEFAULT 0, min_total REAL DEFAULT 0, max_uses INTEGER, used INTEGER DEFAULT 0,
  per_customer INTEGER DEFAULT 0, starts TEXT, ends TEXT, active INTEGER DEFAULT 1);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY, number TEXT UNIQUE, token TEXT NOT NULL, user_id INTEGER, lang TEXT,
  name TEXT, phone TEXT, email TEXT, zone_id INTEGER, zone_name TEXT, city TEXT, address TEXT, notes TEXT,
  subtotal REAL, discount REAL DEFAULT 0, shipping REAL DEFAULT 0, fee REAL DEFAULT 0, total REAL,
  coupon TEXT, payment_method TEXT, payment_status TEXT DEFAULT 'unpaid', payment_ref TEXT,
  charge_amount REAL, charge_currency TEXT,
  status TEXT DEFAULT 'pending', admin_note TEXT, ip TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS orders_created ON orders(created_at);
CREATE INDEX IF NOT EXISTS orders_user ON orders(user_id);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER, variant_id INTEGER, name TEXT, name_ar TEXT, variant TEXT, variant_ar TEXT,
  sku TEXT, image TEXT, price REAL, qty INTEGER);
CREATE INDEX IF NOT EXISTS oi_order ON order_items(order_id);

CREATE TABLE IF NOT EXISTS order_events (
  id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status TEXT, note TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);

CREATE TABLE IF NOT EXISTS banners (
  id INTEGER PRIMARY KEY, placement TEXT NOT NULL, title_en TEXT, title_ar TEXT, sub_en TEXT, sub_ar TEXT,
  cta_en TEXT, cta_ar TEXT, link TEXT, image TEXT, bg TEXT, sort INTEGER DEFAULT 0, active INTEGER DEFAULT 1);

CREATE TABLE IF NOT EXISTS sections (
  id INTEGER PRIMARY KEY, title_en TEXT, title_ar TEXT, source TEXT NOT NULL, limit_n INTEGER DEFAULT 12,
  sort INTEGER DEFAULT 0, active INTEGER DEFAULT 1);

CREATE TABLE IF NOT EXISTS pages (
  id INTEGER PRIMARY KEY, slug TEXT UNIQUE NOT NULL, title_en TEXT, title_ar TEXT, body_en TEXT, body_ar TEXT,
  footer INTEGER DEFAULT 1, menu INTEGER DEFAULT 0, sort INTEGER DEFAULT 0, active INTEGER DEFAULT 1);

CREATE TABLE IF NOT EXISTS subscribers (id INTEGER PRIMARY KEY, email TEXT UNIQUE COLLATE NOCASE, lang TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY, name TEXT, email TEXT, phone TEXT, body TEXT, read INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP);
`);

// ---------- light migrations for databases created by older versions ----------
function ensureColumn(table, col, def) {
  if (!db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
}
ensureColumn('coupons', 'per_customer', 'INTEGER DEFAULT 0');

// ---------- query helpers (prepared statements are cached) ----------
const cache = new Map();
const st = (sql) => {
  let s = cache.get(sql);
  if (!s) {
    if (cache.size > 400) cache.clear();
    s = db.prepare(sql);
    cache.set(sql, s);
  }
  return s;
};
const norm = (p) => p.map((v) => (v === undefined ? null : typeof v === 'boolean' ? +v : v));
const one = (sql, ...p) => st(sql).get(...norm(p));
const all = (sql, ...p) => st(sql).all(...norm(p));
const run = (sql, ...p) => st(sql).run(...norm(p));
const val = (sql, ...p) => { const r = one(sql, ...p); return r ? Object.values(r)[0] : undefined; };

let depth = 0; // allow nested tx() calls (inner ones just join the outer transaction)
function tx(fn) {
  if (depth++) { try { return fn(); } finally { depth--; } }
  db.exec('BEGIN IMMEDIATE');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
  finally { depth--; }
}

// Table/column names always come from code, never from user input.
const insert = (table, o) => {
  const k = Object.keys(o);
  return Number(run(`INSERT INTO ${table} (${k.join(',')}) VALUES (${k.map(() => '?').join(',')})`, ...k.map((x) => o[x])).lastInsertRowid);
};
const update = (table, id, o) => {
  const k = Object.keys(o);
  if (k.length) run(`UPDATE ${table} SET ${k.map((x) => x + '=?').join(',')} WHERE id=?`, ...k.map((x) => o[x]), id);
};

// ---------- settings (key/value, cached in memory) ----------
const DEFAULTS = {
  store_name_en: 'Kiko Palestine', store_name_ar: 'كيكو فلسطين',
  tagline_en: 'Makeup, skincare & beauty', tagline_ar: 'مكياج وعناية وجمال',
  logo: '', email: 'info@example.com', phone: '+970 59 000 0000', whatsapp: '970590000000',
  address_en: 'Ramallah, Palestine', address_ar: 'رام الله، فلسطين',
  hours_en: 'Sat–Thu, 9:00–18:00', hours_ar: 'السبت–الخميس، 9:00–18:00',
  instagram: '', facebook: '', tiktok: '',
  currency: 'ILS', currency_symbol: '₪',
  free_shipping_min: '199', sitewide_discount: '0', low_stock: '5', order_prefix: 'KP-', min_order: '0',
  announcements_en: '', announcements_ar: '', announcement_link: '',
  promo_enabled: '0', promo_text_en: '', promo_text_ar: '', promo_link: '/sale', promo_ends: '',
  popup_enabled: '0', popup_title_en: '', popup_title_ar: '', popup_text_en: '', popup_text_ar: '', popup_coupon: '',
  cod_enabled: '1', cod_fee: '0',
  card_enabled: '0', card_provider: 'paytabs',
  paytabs_profile_id: '', paytabs_server_key: '', paytabs_domain: 'https://secure-global.paytabs.com',
  paytabs_currency: 'USD', paytabs_rate: '0.27', card_timeout_hours: '6',
  smtp_host: '', smtp_port: '465', smtp_user: '', smtp_pass: '', smtp_from: '', notify_email: '',
  telegram_token: '', telegram_chat: '',
  meta_title_en: '', meta_title_ar: '', meta_desc_en: '', meta_desc_ar: '',
  // theme colours (Admin → Settings → Theme)
  theme_ink: '#000000', theme_accent: '#000000', theme_sale: '#000000', theme_soft: '#f5f5f5',
};
let settingsCache = null;
function settings() {
  if (!settingsCache) {
    settingsCache = { ...DEFAULTS };
    for (const r of all('SELECT key, value FROM settings')) settingsCache[r.key] = r.value;
    // .env overrides for secrets
    if (cfg.PAYTABS_PROFILE_ID) settingsCache.paytabs_profile_id = cfg.PAYTABS_PROFILE_ID;
    if (cfg.PAYTABS_SERVER_KEY) settingsCache.paytabs_server_key = cfg.PAYTABS_SERVER_KEY;
    if (cfg.PAYTABS_DOMAIN) settingsCache.paytabs_domain = cfg.PAYTABS_DOMAIN;
    if (cfg.TELEGRAM_BOT_TOKEN) settingsCache.telegram_token = cfg.TELEGRAM_BOT_TOKEN;
    if (cfg.TELEGRAM_CHAT_ID) settingsCache.telegram_chat = cfg.TELEGRAM_CHAT_ID;
  }
  return settingsCache;
}
function saveSettings(obj) {
  tx(() => {
    for (const [k, v] of Object.entries(obj)) {
      if (!(k in DEFAULTS)) continue; // only known keys
      run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', k, v == null ? '' : String(v));
    }
  });
  settingsCache = null;
}

module.exports = { db, one, all, run, val, tx, insert, update, settings, saveSettings, DEFAULTS };
