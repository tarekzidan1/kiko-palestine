'use strict';
// Cached CMS content (pages, banners, home sections) + small shared helpers.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const cfg = require('./config');
const { all, one } = require('./db');

let cache = {};
const memo = (k, fn) => (k in cache ? cache[k] : (cache[k] = fn()));
const invalidateContent = () => { cache = {}; };

const pages = () => memo('pages', () => all('SELECT id, slug, title_en, title_ar, footer, menu, sort FROM pages WHERE active = 1 ORDER BY sort, id'));
const banners = (placement) => memo('b:' + placement, () => all('SELECT * FROM banners WHERE active = 1 AND placement = ? ORDER BY sort, id', placement));
const sections = () => memo('sections', () => all('SELECT * FROM sections WHERE active = 1 ORDER BY sort, id'));
const pageBySlug = (slug) => one('SELECT * FROM pages WHERE slug = ? AND active = 1', slug);

// Cache-busting version for /assets (changes when CSS/JS files change)
const assetVersion = (() => {
  const h = crypto.createHash('md5');
  for (const f of ['css/store.css', 'js/store.js', 'css/admin.css', 'js/admin.js']) {
    try { h.update(String(fs.statSync(path.join(cfg.ROOT, 'public', f)).mtimeMs)); } catch { /* missing in tests */ }
  }
  return h.digest('hex').slice(0, 8);
})();

// Public site URL. Always set BASE_URL in production: links in emails (password reset, orders) and
// payment return URLs are ONLY built from it, never from request headers (which a client can forge).
function baseUrl(ctx) {
  if (cfg.BASE_URL) return cfg.BASE_URL;
  const host = String((ctx.proxied && ctx.req.headers['x-forwarded-host']) || ctx.req.headers.host || 'localhost').split(',')[0].trim();
  return `${ctx.secure ? 'https' : 'http'}://${/^[a-z0-9.:[\]-]+$/i.test(host) ? host : 'localhost'}`;
}

module.exports = { pages, banners, sections, pageBySlug, invalidateContent, assetVersion, baseUrl };
