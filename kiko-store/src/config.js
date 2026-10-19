'use strict';
// Loads .env (KEY=VALUE lines) without dependencies, then exposes typed config.
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

(function loadEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
    if (!m || line.trim().startsWith('#')) continue;
    let v = m[2];
    if (/^(['"]).*\1$/.test(v)) v = v.slice(1, -1); // strip matching quotes
    if (process.env[m[1]] === undefined) process.env[m[1]] = v; // real env wins
  }
})();

const env = (k, d = '') => process.env[k] || d;
const bool = (k, d = false) => (!process.env[k] ? d : /^(1|true|yes|on)$/i.test(process.env[k]));

module.exports = {
  ROOT,
  PORT: +env('PORT', 3000),
  HOST: env('HOST', '0.0.0.0'),
  BASE_URL: env('BASE_URL', '').replace(/\/$/, ''), // public URL, e.g. https://kiko.ps (needed for payments/emails)
  DB_PATH: path.resolve(ROOT, env('DB_PATH', 'data/store.db')),
  UPLOAD_DIR: path.resolve(ROOT, env('UPLOAD_DIR', 'data/uploads')), // keep data + uploads together (one folder to back up)
  PROD: env('NODE_ENV') === 'production',
  // auto = trust X-Forwarded-* only from local/private proxies (Nginx, Render, Railway); or "always" / "never"
  TRUST_PROXY: (['always', 'never'].includes(env('TRUST_PROXY')) ? env('TRUST_PROXY') : /^(1|true|yes)$/i.test(env('TRUST_PROXY')) ? 'always' : /^(0|false|no)$/i.test(env('TRUST_PROXY')) ? 'never' : 'auto'),
  PROXY_HOPS: Math.max(1, +env('PROXY_HOPS', 1) || 1), // number of reverse proxies in front of the app
  COOKIE_SECURE: bool('COOKIE_SECURE', env('NODE_ENV') === 'production'),
  DEFAULT_LANG: env('DEFAULT_LANG', 'ar'),
  DEMO_DATA: !/^(0|off|false|no)$/i.test(env('DEMO_DATA', 'on')), // load the demo catalog on the very first start
  ADMIN_EMAIL: env('ADMIN_EMAIL', 'admin@example.com'),
  ADMIN_PASSWORD: env('ADMIN_PASSWORD', ''),
  // Optional overrides (otherwise set in Admin → Settings)
  SMTP_URL: env('SMTP_URL', ''), // smtps://user:pass@smtp.host:465
  PAYTABS_PROFILE_ID: env('PAYTABS_PROFILE_ID', ''),
  PAYTABS_SERVER_KEY: env('PAYTABS_SERVER_KEY', ''),
  PAYTABS_DOMAIN: env('PAYTABS_DOMAIN', ''),
  TELEGRAM_BOT_TOKEN: env('TELEGRAM_BOT_TOKEN', ''),
  TELEGRAM_CHAT_ID: env('TELEGRAM_CHAT_ID', ''),
};
