'use strict';
const crypto = require('node:crypto');

const TZ = process.env.TZ_DISPLAY || 'Asia/Hebron';
const token = (n = 24) => crypto.randomBytes(n).toString('base64url');
// Arabic-Indic (٠-٩) and Persian (۰-۹) digits → 0-9, so "٠٥٩٩١٢٣٤٥٦" works as a phone number
const toAscii = (s) => String(s ?? '').replace(/[٠-٩۰-۹]/g, (d) => String(d.charCodeAt(0) % 16)).replace(/٫/g, '.');
const int = (v, d = 0) => { const n = parseInt(toAscii(v), 10); return Number.isFinite(n) ? n : d; };
const num = (v, d = 0) => { const n = parseFloat(toAscii(v).replace(',', '.')); return Number.isFinite(n) ? n : d; };
const round2 = (n) => Math.round((+n + Number.EPSILON) * 100) / 100;
const arr = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(s || '').trim());
const normPhone = (s) => toAscii(s).replace(/[^\d+]/g, '');
const isPhone = (s) => /^\+?\d{9,15}$/.test(normPhone(s));
const phoneTail = (s) => normPhone(s).replace(/\D/g, '').slice(-9); // compare numbers regardless of 0 / +970 / +972 prefix

function slugify(s) {
  return String(s || '').normalize('NFKC').toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 80) || token(4).toLowerCase();
}

// Arabic-aware normalisation so "أحمر" matches "احمر", "ة" matches "ه", etc.
function normSearch(s) {
  return toAscii(s).toLowerCase()
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
    .replace(/\s+/g, ' ').trim();
}

function money(n, symbol = '₪') {
  const v = round2(n || 0);
  const dec = Number.isInteger(v) ? 0 : 2;
  return `${v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })} ${symbol}`;
}

const toDate = (s) => (s instanceof Date ? s : new Date(String(s).includes('T') ? s : String(s).replace(' ', 'T') + 'Z'));
function fmtDate(s, time = true) {
  if (!s) return '';
  const o = { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' };
  if (time) Object.assign(o, { hour: '2-digit', minute: '2-digit', hour12: false });
  return new Intl.DateTimeFormat('en-GB', o).format(toDate(s));
}
const dayKey = (s) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(toDate(s)); // YYYY-MM-DD local

// ---------- CSV (Excel-friendly UTF-8 with BOM) ----------
function csvParse(text) {
  text = String(text).replace(/^﻿/, '');
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.length > 1 || r[0] !== '');
}
const csvCell = (v) => {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s) && isNaN(s)) s = "'" + s; // block spreadsheet formula injection
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
const csvStringify = (rows) => '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
const csvClean = (s) => String(s ?? '').replace(/^'(?=[=+\-@])/, '').trim();

// ---------- in-memory rate limiter ----------
const buckets = new Map();
function limited(key, max, windowMs) {
  const now = Date.now();
  if (buckets.size > 100_000) buckets.clear(); // memory guard
  let b = buckets.get(key);
  if (!b || b.reset < now) { b = { n: 0, reset: now + windowMs }; buckets.set(key, b); }
  return ++b.n > max;
}
setInterval(() => { const now = Date.now(); for (const [k, b] of buckets) if (b.reset < now) buckets.delete(k); }, 60_000).unref();

const safeJSON = (s, d) => { try { return JSON.parse(s); } catch { return d; } };

// "2026-10-21T23:59" typed in Palestine time ⇄ UTC ISO string (for promo countdowns)
function zonedToUtc(local) {
  if (!local) return '';
  const asUTC = Date.parse(local.length === 16 ? local + ':00Z' : local + 'Z');
  if (!asUTC) return '';
  const d = new Date(asUTC);
  const offset = new Date(d.toLocaleString('en-US', { timeZone: TZ })) - new Date(d.toLocaleString('en-US', { timeZone: 'UTC' }));
  return new Date(asUTC - offset).toISOString();
}
function utcToZonedInput(iso) {
  const ms = Date.parse(iso);
  if (!ms) return '';
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour === '24' ? '00' : p.hour}:${p.minute}`;
}

// WhatsApp link number: 059/056 → Palestine (+970), other 05x → +972
function waNumber(phone) {
  let d = String(phone || '').replace(/\D/g, '');
  if (/^05\d{8}$/.test(d)) d = (/^05[69]/.test(d) ? '970' : '972') + d.slice(1);
  return d;
}

module.exports = { token, toAscii, int, num, round2, arr, isEmail, isPhone, normPhone, phoneTail, slugify, normSearch, money, fmtDate, dayKey, toDate, csvParse, csvStringify, csvClean, limited, safeJSON, zonedToUtc, utcToZonedInput, waNumber, TZ };
