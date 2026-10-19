'use strict';
// Minimal HTTP framework: routing, body/cookie parsing, gzip, static files, security headers.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const cfg = require('./config');
const { Raw } = require('./html');

class HttpError extends Error {
  constructor(status, message) { super(message || String(status)); this.status = status; }
}

const MIME = {
  '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.gif': 'image/gif', '.avif': 'image/avif', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};
const COMPRESSIBLE = /text|json|javascript|svg|xml/;

const CSP = [
  "default-src 'self'", "img-src 'self' data: https:", "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com", "script-src 'self'", "connect-src 'self'",
  "frame-ancestors 'self'", "base-uri 'self'", "object-src 'none'",
].join('; ');
const baseHeaders = (secure) => ({
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'SAMEORIGIN',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  ...(secure ? { 'Strict-Transport-Security': 'max-age=15552000' } : {}),
});

function compile(pattern) {
  const keys = [];
  const src = pattern
    .replace(/\/:(\w+)(\?)?/g, (_, k, opt) => {
      keys.push(k);
      const g = k === 'lang' ? '(ar|en)' : '([^/]+)';
      return opt ? `(?:/${g})?` : `/${g}`;
    })
    .replace(/\/\*$/, '/(.*)');
  if (pattern.endsWith('/*')) keys.push('rest');
  return { re: new RegExp('^' + src + '/?$'), keys };
}

const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
function parseForm(str) {
  const out = Object.create(null);
  for (const [k0, v] of new URLSearchParams(str)) {
    const isArr = k0.endsWith('[]');
    const k = isArr ? k0.slice(0, -2) : k0;
    if (BAD_KEYS.has(k)) continue;
    if (isArr) { if (!Array.isArray(out[k])) out[k] = out[k] === undefined ? [] : [out[k]]; out[k].push(v); } else out[k] = v;
  }
  return out;
}
function parseCookies(h) {
  const out = Object.create(null);
  for (const part of (h || '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (BAD_KEYS.has(k)) continue;
    try { out[k] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* ignore bad cookie */ }
  }
  return out;
}

// ---------- static files (with ETag + cached gzip) ----------
const gzCache = new Map();
function serveStatic(ctx, baseDir, rel, { immutable = false, sandbox = false } = {}) {
  let file;
  try { file = path.resolve(baseDir, decodeURIComponent(rel)); } catch { return false; }
  if (!file.startsWith(baseDir + path.sep) || /(^|[\\/])\./.test(rel)) return false;
  let stat;
  try { stat = fs.statSync(file); } catch { return false; }
  if (!stat.isFile()) return false;
  const ext = path.extname(file).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  if (ext === '.svg') sandbox = true; // an SVG opened directly can never run scripts
  const etag = `W/"${stat.size.toString(36)}-${stat.mtimeMs.toString(36)}"`;
  const headers = {
    'Content-Type': type, ETag: etag, 'X-Content-Type-Options': 'nosniff',
    'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'public, max-age=86400',
    ...(sandbox ? { 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox" } : {}),
  };
  if (ctx.req.headers['if-none-match'] === etag) { ctx.res.writeHead(304, headers); ctx.res.end(); return true; }
  const gz = COMPRESSIBLE.test(type) && /\bgzip\b/.test(ctx.req.headers['accept-encoding'] || '') && stat.size > 512;
  if (gz) {
    const key = file + etag;
    let buf = gzCache.get(key);
    if (!buf) { buf = zlib.gzipSync(fs.readFileSync(file)); if (gzCache.size > 300) gzCache.clear(); gzCache.set(key, buf); }
    ctx.res.writeHead(200, { ...headers, 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding', 'Content-Length': buf.length });
    ctx.res.end(ctx.method === 'HEAD' ? undefined : buf);
  } else {
    ctx.res.writeHead(200, { ...headers, 'Content-Length': stat.size });
    if (ctx.method === 'HEAD') ctx.res.end(); else fs.createReadStream(file).pipe(ctx.res);
  }
  return true;
}

// ---------- context ----------
// Proxy headers (X-Forwarded-*) are only trusted when the request comes from a local/private address
// (Nginx, Render, Railway…). Then the RIGHT-most X-Forwarded-For hop is used: it is the one our proxy
// appended, so clients cannot spoof their IP to dodge rate limits.
const PRIVATE = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|f[cd][0-9a-f]{2}:|fe80:)/i;
function proxyTrusted(req) {
  if (cfg.TRUST_PROXY === 'never') return false;
  if (cfg.TRUST_PROXY === 'always') return true;
  return PRIVATE.test(String(req.socket.remoteAddress || '').replace(/^::ffff:/, ''));
}
function clientIp(req, trusted) {
  const peer = String(req.socket.remoteAddress || '').replace(/^::ffff:/, '');
  if (!trusted) return peer;
  const hops = String(req.headers['x-forwarded-for'] || '').split(',').map((s) => s.trim()).filter(Boolean);
  return hops[Math.max(0, hops.length - cfg.PROXY_HOPS)] || peer;
}

function makeCtx(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const trusted = proxyTrusted(req);
  const proto = trusted ? String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() : '';
  const secure = proto === 'https' || !!req.socket.encrypted;
  const ctx = {
    req, res, url, secure, proxied: trusted,
    method: req.method === 'HEAD' ? 'GET' : req.method,
    path: url.pathname,
    query: Object.assign(Object.create(null), Object.fromEntries(url.searchParams)),
    params: {}, body: Object.create(null), rawBody: null,
    cookies: parseCookies(req.headers.cookie),
    ip: clientIp(req, trusted),
    outCookies: [], headers: {},
    wantsJSON: /application\/json/.test(req.headers.accept || '') || req.headers['x-requested-with'] === 'fetch',
    setCookie(name, value, { maxAge, httpOnly = true, sameSite = 'Lax' } = {}) {
      let c = `${name}=${encodeURIComponent(value)}; Path=/; SameSite=${sameSite}`;
      if (httpOnly) c += '; HttpOnly';
      if (cfg.COOKIE_SECURE || secure) c += '; Secure';
      if (maxAge !== undefined) c += `; Max-Age=${Math.floor(maxAge)}`;
      ctx.outCookies.push(c);
    },
    send(body, status = 200, type = 'text/html; charset=utf-8') {
      if (res.headersSent) return;
      let buf = Buffer.isBuffer(body) ? body : Buffer.from(body instanceof Raw ? body.s : String(body ?? ''));
      const h = { ...baseHeaders(secure), 'Content-Type': type, ...ctx.headers };
      if (type.startsWith('text/html')) { h['Content-Security-Policy'] = CSP; h['Cache-Control'] ||= 'no-store'; }
      if (ctx.outCookies.length) h['Set-Cookie'] = ctx.outCookies;
      if (buf.length > 1024 && COMPRESSIBLE.test(type) && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
        buf = zlib.gzipSync(buf, { level: 6 });
        h['Content-Encoding'] = 'gzip'; h.Vary = 'Accept-Encoding';
      }
      h['Content-Length'] = buf.length;
      res.writeHead(status, h);
      res.end(req.method === 'HEAD' ? undefined : buf);
    },
    json(obj, status = 200) { ctx.headers['Cache-Control'] = 'no-store'; ctx.send(JSON.stringify(obj), status, 'application/json; charset=utf-8'); },
    redirect(to, status = 303) {
      if (res.headersSent) return;
      const h = { ...baseHeaders(secure), Location: to };
      if (ctx.outCookies.length) h['Set-Cookie'] = ctx.outCookies;
      res.writeHead(status, h);
      res.end();
    },
    get done() { return res.headersSent || res.writableEnded; },
  };
  return ctx;
}

async function readBody(req, limit) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw new HttpError(413, 'Payload too large');
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}

// ---------- app ----------
function createApp({ onError, notFound, statics = [], bodyLimit = () => 2e6 }) {
  const routes = [];
  const mws = [];
  const add = (method) => (pattern, ...handlers) => routes.push({ method, ...compile(pattern), handlers });
  const app = { get: add('GET'), post: add('POST'), use: (fn) => mws.push(fn) };

  app.handle = async (req, res) => {
    let ctx;
    try { ctx = makeCtx(req, res); } catch { res.writeHead(400); return res.end('Bad request'); }
    try {
      // static first (no session/db work)
      for (const s of statics) {
        if (ctx.path.startsWith(s.prefix) && (ctx.method === 'GET')) {
          if (serveStatic(ctx, s.dir, ctx.path.slice(s.prefix.length), { immutable: !!(s.immutable && ctx.url.searchParams.has('v')), sandbox: s.sandbox })) return;
          throw new HttpError(404);
        }
      }
      if (ctx.method === 'POST') {
        const buf = await readBody(req, bodyLimit(ctx.path));
        ctx.rawBody = buf;
        const type = req.headers['content-type'] || '';
        if (type.includes('application/json')) { try { ctx.body = JSON.parse(buf.toString('utf8') || '{}'); } catch { throw new HttpError(400, 'Bad JSON'); } }
        else if (type.includes('application/x-www-form-urlencoded')) ctx.body = parseForm(buf.toString('utf8'));
        if (!ctx.body || typeof ctx.body !== 'object') ctx.body = Object.create(null);
      } else if (ctx.method !== 'GET') throw new HttpError(405);

      let route, m;
      for (const r of routes) { if (r.method === ctx.method && (m = r.re.exec(ctx.path))) { route = r; break; } }
      if (route) route.keys.forEach((k, i) => { try { ctx.params[k] = m[i + 1] === undefined ? undefined : decodeURIComponent(m[i + 1]); } catch { throw new HttpError(400); } });
      ctx.lang = ctx.params.lang;

      for (const mw of mws) { const out = await mw(ctx); if (ctx.done) return; if (out !== undefined) return respond(ctx, out); }
      if (!route) return respond(ctx, await notFound(ctx), 404);
      for (const h of route.handlers) {
        const out = await h(ctx);
        if (ctx.done) return;
        if (out !== undefined) return respond(ctx, out);
      }
      if (!ctx.done) throw new HttpError(500, 'No response');
    } catch (err) {
      if (!(err instanceof HttpError) || err.status >= 500) console.error(new Date().toISOString(), req.method, req.url, err);
      if (ctx.done) return;
      try { respond(ctx, await onError(ctx, err), err.status || 500); } catch (e2) { console.error(e2); if (!ctx.done) { res.writeHead(500); res.end('Server error'); } }
    }
  };
  return app;
}

function respond(ctx, out, status = 200) {
  if (ctx.done) return;
  if (out instanceof Raw || typeof out === 'string') return ctx.send(out, status);
  return ctx.json(out, status);
}

module.exports = { createApp, HttpError, MIME };
