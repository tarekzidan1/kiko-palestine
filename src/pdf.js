'use strict';
// Small PDF writer with no dependencies: A4 pages, embedded + subsetted TrueType fonts (so Arabic and ₪ print
// correctly), Arabic letter shaping, right-to-left lines, rectangles/lines and JPEG/PNG images.
const fs = require('node:fs');
const zlib = require('node:zlib');

// ======================= TrueType font =======================
class TTF {
  constructor(buf) {
    this.buf = buf;
    this.t = {};
    for (let i = 0, n = buf.readUInt16BE(4); i < n; i++) {
      const o = 12 + i * 16;
      this.t[buf.toString('latin1', o, o + 4)] = { off: buf.readUInt32BE(o + 8), len: buf.readUInt32BE(o + 12) };
    }
    const head = this.t.head.off, hhea = this.t.hhea.off;
    this.upm = buf.readUInt16BE(head + 18);
    this.bbox = [0, 2, 4, 6].map((k) => buf.readInt16BE(head + 36 + k));
    this.longLoca = buf.readInt16BE(head + 50) === 1;
    this.ascent = buf.readInt16BE(hhea + 4);
    this.descent = buf.readInt16BE(hhea + 6);
    this.numGlyphs = buf.readUInt16BE(this.t.maxp.off + 4);
    const nHM = buf.readUInt16BE(hhea + 34), hm = this.t.hmtx.off;
    this.adv = new Uint16Array(this.numGlyphs);
    this.lsb = new Int16Array(this.numGlyphs);
    for (let g = 0, last = 0; g < this.numGlyphs; g++) {
      if (g < nHM) { last = buf.readUInt16BE(hm + g * 4); this.lsb[g] = buf.readInt16BE(hm + g * 4 + 2); }
      else this.lsb[g] = buf.readInt16BE(hm + nHM * 4 + (g - nHM) * 2);
      this.adv[g] = last;
    }
    const lo = this.t.loca.off;
    this.loca = new Uint32Array(this.numGlyphs + 1);
    for (let g = 0; g <= this.numGlyphs; g++) this.loca[g] = this.longLoca ? buf.readUInt32BE(lo + g * 4) : buf.readUInt16BE(lo + g * 2) * 2;
    const os2 = this.t['OS/2'];
    this.capHeight = os2 && buf.readUInt16BE(os2.off) >= 2 ? buf.readInt16BE(os2.off + 88) : this.ascent;
    this.cmap = this.readCmap();
  }
  readCmap() { // Windows Unicode BMP table (format 4)
    const b = this.buf, c = this.t.cmap.off, map = new Map();
    let sub = 0;
    for (let i = 0, n = b.readUInt16BE(c + 2); i < n; i++) {
      const pid = b.readUInt16BE(c + 4 + i * 8), eid = b.readUInt16BE(c + 6 + i * 8), off = b.readUInt32BE(c + 8 + i * 8);
      if (pid === 3 && eid === 1 && b.readUInt16BE(c + off) === 4) sub = c + off;
    }
    if (!sub) return map;
    const segX2 = b.readUInt16BE(sub + 6), ends = sub + 14, starts = ends + segX2 + 2, deltas = starts + segX2, ranges = deltas + segX2;
    for (let i = 0; i < segX2 / 2; i++) {
      const end = b.readUInt16BE(ends + i * 2), start = b.readUInt16BE(starts + i * 2);
      const delta = b.readInt16BE(deltas + i * 2), ro = b.readUInt16BE(ranges + i * 2);
      for (let cp = start; cp <= end && cp !== 0xffff; cp++) {
        let g = ro ? b.readUInt16BE(ranges + i * 2 + ro + (cp - start) * 2) : cp;
        if (ro && g === 0) continue;
        g = (g + delta) & 0xffff;
        if (g) map.set(cp, g);
      }
    }
    return map;
  }
  gid(cp) { return this.cmap.get(cp) || 0; }
  glyph(g) { const s = this.t.glyf.off + this.loca[g]; return this.buf.subarray(s, this.t.glyf.off + this.loca[g + 1]); }
  parts(d) { // [glyph id, byte position] of the pieces inside a composite glyph
    const out = [];
    if (d.length < 12 || d.readInt16BE(0) >= 0) return out;
    let p = 10, f;
    do {
      f = d.readUInt16BE(p);
      out.push([d.readUInt16BE(p + 2), p + 2]);
      p += 4 + (f & 1 ? 4 : 2) + (f & 8 ? 2 : f & 0x40 ? 4 : f & 0x80 ? 8 : 0);
    } while (f & 0x20 && p < d.length);
    return out;
  }
  // Compact subset: only the glyphs we used, renumbered in order of first use (list[newId] = oldId).
  // `add(oldId)` returns the new id and appends pieces of composite glyphs. Tables kept = the ones PDF needs.
  subset(list, add) {
    const chunks = [], offs = [], hmtx = [];
    let off = 0;
    for (let i = 0; i < list.length; i++) { // list can grow while we loop (composite pieces)
      let d = this.glyph(list[i]);
      const parts = this.parts(d);
      if (parts.length) { d = Buffer.from(d); for (const [g, pos] of parts) d.writeUInt16BE(add(g), pos); }
      offs.push(off);
      const pad = (4 - (d.length % 4)) % 4;
      chunks.push(d, Buffer.alloc(pad));
      off += d.length + pad;
      const m = Buffer.alloc(4); m.writeUInt16BE(this.adv[list[i]], 0); m.writeInt16BE(this.lsb[list[i]], 2); hmtx.push(m);
    }
    offs.push(off);
    const n = list.length, loca = Buffer.alloc(offs.length * 4);
    offs.forEach((o, i) => loca.writeUInt32BE(o, i * 4));
    const raw = (tag) => Buffer.from(this.buf.subarray(this.t[tag].off, this.t[tag].off + this.t[tag].len));
    const head = raw('head'), hhea = raw('hhea'), maxp = raw('maxp');
    head.writeInt16BE(1, 50); // long loca offsets
    hhea.writeUInt16BE(n, 34); // number of metrics
    maxp.writeUInt16BE(n, 4); // number of glyphs
    const tables = { head, hhea, maxp, loca, glyf: Buffer.concat(chunks), hmtx: Buffer.concat(hmtx) };
    for (const tag of ['cvt ', 'fpgm', 'prep']) if (this.t[tag]) tables[tag] = raw(tag);
    return buildFont(tables);
  }
}
const sum32 = (b) => { let s = 0; for (let i = 0; i < b.length; i += 4) s = (s + b.readUInt32BE(i)) >>> 0; return s; };
function buildFont(tables) {
  const tags = Object.keys(tables).sort(), n = tags.length;
  let es = 0; while (1 << (es + 1) <= n) es++;
  const dir = Buffer.alloc(12 + 16 * n);
  dir.writeUInt32BE(0x00010000, 0); dir.writeUInt16BE(n, 4); dir.writeUInt16BE(16 << es, 6); dir.writeUInt16BE(es, 8); dir.writeUInt16BE(n * 16 - (16 << es), 10);
  const bodies = [];
  let off = dir.length, headAt = 0;
  tags.forEach((tag, i) => {
    const data = tables[tag], body = Buffer.concat([data, Buffer.alloc((4 - (data.length % 4)) % 4)]);
    if (tag === 'head') { body.writeUInt32BE(0, 8); headAt = off; }
    dir.write(tag, 12 + i * 16, 'latin1');
    dir.writeUInt32BE(sum32(body), 16 + i * 16); dir.writeUInt32BE(off, 20 + i * 16); dir.writeUInt32BE(data.length, 24 + i * 16);
    bodies.push(body); off += body.length;
  });
  const font = Buffer.concat([dir, ...bodies]);
  font.writeUInt32BE((0xb1b0afba - sum32(font)) >>> 0, headAt + 8);
  return font;
}

// ======================= Arabic shaping + right-to-left order =======================
const F = { // isolated, final, initial, medial (0 = this letter has no such form)
  0x621: [0xfe80, 0, 0, 0], 0x622: [0xfe81, 0xfe82, 0, 0], 0x623: [0xfe83, 0xfe84, 0, 0], 0x624: [0xfe85, 0xfe86, 0, 0],
  0x625: [0xfe87, 0xfe88, 0, 0], 0x626: [0xfe89, 0xfe8a, 0xfe8b, 0xfe8c], 0x627: [0xfe8d, 0xfe8e, 0, 0], 0x628: [0xfe8f, 0xfe90, 0xfe91, 0xfe92],
  0x629: [0xfe93, 0xfe94, 0, 0], 0x62a: [0xfe95, 0xfe96, 0xfe97, 0xfe98], 0x62b: [0xfe99, 0xfe9a, 0xfe9b, 0xfe9c], 0x62c: [0xfe9d, 0xfe9e, 0xfe9f, 0xfea0],
  0x62d: [0xfea1, 0xfea2, 0xfea3, 0xfea4], 0x62e: [0xfea5, 0xfea6, 0xfea7, 0xfea8], 0x62f: [0xfea9, 0xfeaa, 0, 0], 0x630: [0xfeab, 0xfeac, 0, 0],
  0x631: [0xfead, 0xfeae, 0, 0], 0x632: [0xfeaf, 0xfeb0, 0, 0], 0x633: [0xfeb1, 0xfeb2, 0xfeb3, 0xfeb4], 0x634: [0xfeb5, 0xfeb6, 0xfeb7, 0xfeb8],
  0x635: [0xfeb9, 0xfeba, 0xfebb, 0xfebc], 0x636: [0xfebd, 0xfebe, 0xfebf, 0xfec0], 0x637: [0xfec1, 0xfec2, 0xfec3, 0xfec4], 0x638: [0xfec5, 0xfec6, 0xfec7, 0xfec8],
  0x639: [0xfec9, 0xfeca, 0xfecb, 0xfecc], 0x63a: [0xfecd, 0xfece, 0xfecf, 0xfed0], 0x641: [0xfed1, 0xfed2, 0xfed3, 0xfed4], 0x642: [0xfed5, 0xfed6, 0xfed7, 0xfed8],
  0x643: [0xfed9, 0xfeda, 0xfedb, 0xfedc], 0x644: [0xfedd, 0xfede, 0xfedf, 0xfee0], 0x645: [0xfee1, 0xfee2, 0xfee3, 0xfee4], 0x646: [0xfee5, 0xfee6, 0xfee7, 0xfee8],
  0x647: [0xfee9, 0xfeea, 0xfeeb, 0xfeec], 0x648: [0xfeed, 0xfeee, 0, 0], 0x649: [0xfeef, 0xfef0, 0, 0], 0x64a: [0xfef1, 0xfef2, 0xfef3, 0xfef4],
  // letters used for foreign sounds (\u067e \u0686 \u06a4 \u06a9 \u06af \u06cc)
  0x67e: [0xfb56, 0xfb57, 0xfb58, 0xfb59], 0x686: [0xfb7a, 0xfb7b, 0xfb7c, 0xfb7d], 0x6a4: [0xfb6a, 0xfb6b, 0xfb6c, 0xfb6d],
  0x6a9: [0xfb8e, 0xfb8f, 0xfb90, 0xfb91], 0x6af: [0xfb92, 0xfb93, 0xfb94, 0xfb95], 0x6cc: [0xfbfc, 0xfbfd, 0xfbfe, 0xfbff],
};
const LAM_ALEF = { 0x622: [0xfef5, 0xfef6], 0x623: [0xfef7, 0xfef8], 0x625: [0xfef9, 0xfefa], 0x627: [0xfefb, 0xfefc] };
const joinsNext = (c) => c === 0x640 || !!(F[c] && F[c][2]);
const joinsPrev = (c) => c === 0x640 || !!(F[c] && F[c][1]);
// strong right-to-left letters (Hebrew + Arabic, not Arabic digits) / strong left-to-right letters
const RTL = /[\u0590-\u05ff\u0600-\u065f\u066a-\u06ef\u06fa-\u08ff\ufb1d-\ufdff\ufe70-\ufeff]/;
const LATIN = /[A-Za-z\u00c0-\u024f\u0370-\u03ff\u0400-\u04ff]/;

function shape(s) {
  const cps = [...String(s).replace(/[\u064b-\u065f\u0670]/g, '')].map((c) => c.codePointAt(0)), out = [];
  for (let i = 0; i < cps.length; i++) {
    const c = cps[i], prev = cps[i - 1], next = cps[i + 1];
    if (c === 0x644 && LAM_ALEF[next]) { out.push(LAM_ALEF[next][joinsNext(prev) ? 1 : 0]); i++; continue; }
    const f = F[c];
    if (!f) { out.push(c); continue; }
    const p = joinsNext(prev), q = joinsPrev(next);
    out.push(p && q && f[3] ? f[3] : p && f[1] ? f[1] : q && f[2] ? f[2] : f[0]);
  }
  return String.fromCodePoint(...out);
}
const MIRROR = { '(': ')', ')': '(', '[': ']', ']': '[', '<': '>', '>': '<', '«': '»', '»': '«', '{': '}', '}': '{' };
// Words: Latin/number "words" stay together (e.g. "KP-1001", "120.50", "info@shop.ps"); everything else is one character each.
const W = 'A-Za-z0-9\\u00c0-\\u024f\\u0370-\\u03ff\\u0400-\\u04ff\\u0660-\\u0669\\u06f0-\\u06f9';
const TOK = new RegExp(`[${W}₪$€@#%][${W}₪$€@#%.,:/+\\-–_'&]*[${W}₪$€%]|[${W}₪$€@#%]|[\\s\\S]`, 'gu');
const isR = (t) => RTL.test(t);
const isL = (t) => LATIN.test(t);
const isNum = (t) => /[0-9٠-٩۰-۹]/.test(t) && !LATIN.test(t);
// keep a bracket pair together: if the stretch [i, end) opened "(" or "[", extend it to the closing one
function closeBrackets(toks, i, end, stop) {
  let open = 0;
  for (let k = i; k < end; k++) open += toks[k] === '(' || toks[k] === '[' ? 1 : toks[k] === ')' || toks[k] === ']' ? -1 : 0;
  for (let k = end; open > 0 && k < toks.length && !stop(toks[k]); k++) if (toks[k] === ')' || toks[k] === ']') { open--; end = k + 1; }
  return end;
}
// How far a stretch starting at token i reaches: it takes its own kind of words (and numbers), crosses spaces and
// punctuation, and stops at the other direction's words or at a ")" closing a bracket opened before the stretch.
function reach(toks, i, own, stop) {
  let end = i + 1, depth = 0;
  for (let j = i + 1; j < toks.length && !stop(toks[j]); j++) {
    const t = toks[j];
    if (t === '(' || t === '[') depth++;
    else if (t === ')' || t === ']') { if (!depth) break; depth--; }
    if (own(t) || isNum(t)) end = j + 1;
  }
  return closeBrackets(toks, i, end, stop);
}
// Visual (left-to-right drawing) order of one line — a compact version of the Unicode bidi rules:
// in Arabic lines, Latin words + numbers keep their order; in English lines, Arabic stretches are flipped.
function visual(s, rtlBase) {
  const toks = String(s).match(TOK) || [], out = [];
  if (rtlBase) {
    for (let i = 0; i < toks.length;) {
      if (!isL(toks[i])) { out.push(MIRROR[toks[i]] || toks[i]); i++; continue; }
      const end = reach(toks, i, isL, isR);
      out.push(toks.slice(i, end).join(''));
      i = end;
    }
    return out.reverse().join('');
  }
  for (let i = 0; i < toks.length;) {
    if (!isR(toks[i])) { out.push(toks[i++]); continue; }
    const end = reach(toks, i, isR, isL);
    out.push(...toks.slice(i, end).reverse().map((t) => MIRROR[t] || t));
    i = end;
  }
  return out.join('');
}
const firstStrongRtl = (s) => { for (const c of String(s)) { if (RTL.test(c)) return true; if (LATIN.test(c)) return false; } return null; };

// ======================= images (logo) =======================
// undo PNG row filters → raw bytes (stride = bytes per row, bpp = bytes per pixel for the filter, at least 1)
function unfilter(raw, h, stride, bpp) {
  const px = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), o = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[o + x - bpp] : 0, b = y ? px[o - stride + x] : 0, c = x >= bpp && y ? px[o - stride + x - bpp] : 0;
      const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
      px[o + x] = (row[x] + [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][f]) & 255;
    }
  }
  return px;
}
function readImage(buf) {
  if (buf[0] === 0xff && buf[1] === 0xd8) { // JPEG
    let adobe = false;
    for (let p = 2; p + 4 <= buf.length;) {
      if (buf[p] !== 0xff) return null;
      const m = buf[p + 1], len = buf.readUInt16BE(p + 2);
      if (m === 0xee && buf.toString('latin1', p + 4, p + 9) === 'Adobe') adobe = true; // Adobe apps store CMYK inverted
      if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) {
        const comps = buf[p + 9];
        const cs = comps === 1 ? 'DeviceGray' : comps === 4 ? 'DeviceCMYK' : 'DeviceRGB';
        return { w: buf.readUInt16BE(p + 7), h: buf.readUInt16BE(p + 5), dict: `/ColorSpace /${cs} /BitsPerComponent 8${comps === 4 && adobe ? ' /Decode [1 0 1 0 1 0 1 0]' : ''} /Filter /DCTDecode`, data: buf };
      }
      p += 2 + len;
    }
    return null;
  }
  if (buf.length < 8 || buf.readUInt32BE(0) !== 0x89504e47) return null; // PNG
  let p = 8, w, h, depth, type, inter, plte, trns;
  const idat = [];
  while (p + 8 <= buf.length) {
    const len = buf.readUInt32BE(p), kind = buf.toString('latin1', p + 4, p + 8), d = buf.subarray(p + 8, p + 8 + len);
    if (kind === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); depth = d[8]; type = d[9]; inter = d[12]; }
    else if (kind === 'PLTE') plte = d; else if (kind === 'tRNS') trns = d; else if (kind === 'IDAT') idat.push(d); else if (kind === 'IEND') break;
    p += 12 + len;
  }
  if (inter || !w || !h || ![1, 2, 4, 8, 16].includes(depth) || (type === 3 && !plte)) return null;
  const z = Buffer.concat(idat);
  const palette = () => `[/Indexed /DeviceRGB ${plte.length / 3 - 1} <${plte.toString('hex')}>]`;
  if (type === 2 || type === 0 || (type === 3 && !trns)) { // no transparency: the PNG data can be used as it is
    const colors = type === 2 ? 3 : 1;
    const cs = type === 3 ? palette() : type === 2 ? '/DeviceRGB' : '/DeviceGray';
    return { w, h, dict: `/ColorSpace ${cs} /BitsPerComponent ${depth} /Filter /FlateDecode /DecodeParms << /Predictor 15 /Colors ${colors} /BitsPerComponent ${depth} /Columns ${w} >>`, data: z };
  }
  if (type === 3) { // palette + transparency (any bit depth): unpack the colour indexes
    const stride = Math.ceil((w * depth) / 8), px = unfilter(zlib.inflateSync(z), h, stride, 1), mask = (1 << depth) - 1;
    const rgb = Buffer.alloc(w * h * 3), alpha = Buffer.alloc(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const bit = x * depth, k = (px[y * stride + (bit >> 3)] >> (8 - depth - (bit & 7))) & mask, i = y * w + x;
      plte.copy(rgb, i * 3, k * 3, k * 3 + 3); alpha[i] = k < trns.length ? trns[k] : 255;
    }
    return { w, h, dict: '/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode', data: zlib.deflateSync(rgb), smask: zlib.deflateSync(alpha) };
  }
  if ((type !== 6 && type !== 4) || depth !== 8) return null;
  // colour + alpha channel: split into a colour image and a soft mask
  const bpp = type === 6 ? 4 : 2, px = unfilter(zlib.inflateSync(z), h, w * bpp, bpp);
  const nc = type === 4 ? 1 : 3, rgb = Buffer.alloc(w * h * nc), alpha = Buffer.alloc(w * h);
  for (let i = 0; i < w * h; i++) { px.copy(rgb, i * nc, i * bpp, i * bpp + nc); alpha[i] = px[i * bpp + nc]; }
  return { w, h, dict: `/ColorSpace /${nc === 1 ? 'DeviceGray' : 'DeviceRGB'} /BitsPerComponent 8 /Filter /FlateDecode`, data: zlib.deflateSync(rgb), smask: zlib.deflateSync(alpha) };
}

// ======================= document =======================
const A4 = [595.28, 841.89];
const fontCache = {};
const loadFont = (file) => (fontCache[file] ||= new TTF(fs.readFileSync(file)));
const n2 = (v) => (Math.round(v * 100) / 100).toString();
const rgb = (hex) => { const h = String(hex || '#000').replace('#', ''); const n = parseInt(h.length === 3 ? [...h].map((c) => c + c).join('') : h, 16) || 0; return [n >> 16, (n >> 8) & 255, n & 255].map((v) => n2(v / 255)).join(' '); };
const pdfStr = (s) => `<FEFF${Buffer.from(String(s), 'utf16le').swap16().toString('hex').toUpperCase()}>`; // UTF-16BE text string

class PDF {
  constructor({ fonts, rtl = false, title = '' }) {
    this.fonts = {};
    let i = 1;
    // list[newId] = font glyph id, map = the reverse, uni = newId → character (for copy/paste + search)
    for (const [key, file] of Object.entries(fonts)) this.fonts[key] = { ttf: loadFont(file), id: 'F' + i++, list: [0], map: new Map([[0, 0]]), uni: new Map() };
    this.rtl = rtl; this.title = title; this.pages = []; this.images = [];
    this.W = A4[0]; this.H = A4[1];
  }
  addPage() { this.page = { ops: [], fonts: new Set(), imgs: new Set() }; this.pages.push(this.page); return this.page; }
  gid(f, g) { let id = f.map.get(g); if (id === undefined) { id = f.list.push(g) - 1; f.map.set(g, id); } return id; }
  // shaped glyph run for one line (visual order) + its width
  run(text, font = 'R', size = 10, dir = 'auto') {
    const f = this.fonts[font], s = String(text ?? '');
    const rtl = dir === 'rtl' ? true : dir === 'ltr' ? false : firstStrongRtl(s) ?? this.rtl;
    const vis = visual(RTL.test(s) ? shape(s) : s, rtl);
    const ids = [];
    let w = 0;
    for (const ch of vis) {
      const cp = ch.codePointAt(0);
      let g = f.ttf.gid(cp);
      if (!g && (cp === 0x2009 || cp === 0xa0)) g = f.ttf.gid(0x20); // thin / no-break space
      const id = this.gid(f, g);
      ids.push(id); w += f.ttf.adv[g];
      if (g) f.uni.set(id, cp);
    }
    return { ids, width: (w * size) / f.ttf.upm };
  }
  width(text, font, size) { return this.run(text, font, size).width; }
  // Draw one line. x = left edge of a box of `width` (align: start | end | center | left | right).
  text(text, x, y, { font = 'R', size = 10, color = '#000000', align = 'start', width = 0, dir = 'auto' } = {}) {
    if (text == null || text === '') return 0;
    const r = this.run(text, font, size, dir), f = this.fonts[font];
    const a = align === 'start' ? (this.rtl ? 'right' : 'left') : align === 'end' ? (this.rtl ? 'left' : 'right') : align;
    const tx = a === 'right' ? x + width - r.width : a === 'center' ? x + (width - r.width) / 2 : x;
    this.page.fonts.add(font);
    this.page.ops.push(`BT /${f.id} ${n2(size)} Tf ${rgb(color)} rg 1 0 0 1 ${n2(tx)} ${n2(this.H - y)} Tm <${r.ids.map((g) => g.toString(16).padStart(4, '0')).join('')}> Tj ET`);
    return r.width;
  }
  // Split text into lines that fit `width` (words are measured in logical order, each line shaped on its own).
  wrap(text, width, font = 'R', size = 10) {
    const lines = [];
    for (const para of String(text ?? '').split(/\n/)) {
      let line = '';
      for (let word of para.split(/\s+/).filter(Boolean)) {
        while (this.width(word, font, size) > width && word.length > 1) { // hard-break a word that can't fit on any line
          let n = word.length - 1;
          while (n > 1 && this.width(word.slice(0, n), font, size) > width) n--;
          if (line) { lines.push(line); line = ''; }
          lines.push(word.slice(0, n)); word = word.slice(n);
        }
        const test = line ? line + ' ' + word : word;
        if (line && this.width(test, font, size) > width) { lines.push(line); line = word; } else line = test;
      }
      lines.push(line);
    }
    return lines;
  }
  rect(x, y, w, h, { fill, stroke, lw = 0.6 } = {}) {
    const ops = [];
    if (fill) ops.push(`${rgb(fill)} rg`);
    if (stroke) ops.push(`${rgb(stroke)} RG ${n2(lw)} w`);
    ops.push(`${n2(x)} ${n2(this.H - y - h)} ${n2(w)} ${n2(h)} re ${fill && stroke ? 'B' : fill ? 'f' : 'S'}`);
    this.page.ops.push(ops.join(' '));
  }
  line(x1, y1, x2, y2, color = '#000000', lw = 0.6) { this.page.ops.push(`${rgb(color)} RG ${n2(lw)} w ${n2(x1)} ${n2(this.H - y1)} m ${n2(x2)} ${n2(this.H - y2)} l S`); }
  image(buf, x, y, maxW, maxH) { // returns drawn [w, h] or null
    let img;
    try { img = readImage(buf); } catch { img = null; }
    if (!img) return null;
    const k = Math.min(maxW / img.w, maxH / img.h, 1e9), w = img.w * k, h = img.h * k;
    const id = this.images.push(img);
    this.page.imgs.add(id);
    this.page.ops.push(`q ${n2(w)} 0 0 ${n2(h)} ${n2(this.rtl ? x + maxW - w : x)} ${n2(this.H - y - h)} cm /Im${id} Do Q`);
    return [w, h];
  }

  build() {
    const objs = [];
    const add = (body) => { objs.push(body); return objs.length; };
    const stream = (dict, data, compress = true) => {
      const d = compress ? zlib.deflateSync(Buffer.isBuffer(data) ? data : Buffer.from(data, 'latin1')) : data;
      return Buffer.concat([Buffer.from(`<< ${dict}${compress ? ' /Filter /FlateDecode' : ''} /Length ${d.length} >>\nstream\n`, 'latin1'), d, Buffer.from('\nendstream', 'latin1')]);
    };
    const catalog = add(null), pagesObj = add(null), info = add(`<< /Title ${pdfStr(this.title)} /Producer (Store invoice generator) /CreationDate (D:${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}Z) >>`);
    const fontRef = {}, usedFonts = new Set(this.pages.flatMap((p) => [...p.fonts]));
    for (const [key, f] of Object.entries(this.fonts)) {
      if (!usedFonts.has(key)) continue;
      const t = f.ttf, k = 1000 / t.upm, name = `ZHFNT${String.fromCharCode(65 + Object.keys(fontRef).length)}+${key === 'B' ? 'DejaVuSans-Bold' : 'DejaVuSans'}`;
      const file = t.subset(f.list, (g) => this.gid(f, g));
      const ff = add(stream(`/Length1 ${file.length}`, file));
      const desc = add(`<< /Type /FontDescriptor /FontName /${name} /Flags 32 /FontBBox [${t.bbox.map((v) => Math.round(v * k)).join(' ')}] /ItalicAngle 0 /Ascent ${Math.round(t.ascent * k)} /Descent ${Math.round(t.descent * k)} /CapHeight ${Math.round(t.capHeight * k)} /StemV 80 /FontFile2 ${ff} 0 R >>`);
      const cid = add(`<< /Type /Font /Subtype /CIDFontType2 /BaseFont /${name} /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${desc} 0 R /CIDToGIDMap /Identity /DW 600 /W [0 [${f.list.map((g) => Math.round(t.adv[g] * k)).join(' ')}]] >>`);
      const bf = [], uni = [...f.uni];
      for (let i = 0; i < uni.length; i += 100) {
        const part = uni.slice(i, i + 100);
        // Arabic display forms map back to normal letters, so copy/paste and search work
        // (lam-alef is stored reversed because readers reverse right-to-left runs, including this pair)
        const plain = (u) => { const s = String.fromCodePoint(u); if (u < 0xfb50 || u > 0xfeff) return s; const b = s.normalize('NFKC'); return u >= 0xfef5 && u <= 0xfefc ? [...b].reverse().join('') : b; };
        const hex = (u) => Buffer.from(plain(u), 'utf16le').swap16().toString('hex');
        bf.push(`${part.length} beginbfchar\n${part.map(([id, u]) => `<${id.toString(16).padStart(4, '0')}> <${hex(u)}>`).join('\n')}\nendbfchar`);
      }
      const cmap = `/CIDInit /ProcSet findresource begin 12 dict begin begincmap /CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def /CMapName /Adobe-Identity-UCS def /CMapType 2 def 1 begincodespacerange <0000> <FFFF> endcodespacerange\n${bf.join('\n')}\nendcmap CMapName currentdict /CMap defineresource pop end end`;
      const tu = add(stream('', cmap));
      fontRef[key] = add(`<< /Type /Font /Subtype /Type0 /BaseFont /${name} /Encoding /Identity-H /DescendantFonts [${cid} 0 R] /ToUnicode ${tu} 0 R >>`);
    }
    const imgRef = this.images.map((img) => {
      const sm = img.smask ? add(stream(`/Type /XObject /Subtype /Image /Width ${img.w} /Height ${img.h} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode`, img.smask, false)) : 0;
      return add(stream(`/Type /XObject /Subtype /Image /Width ${img.w} /Height ${img.h} ${img.dict}${sm ? ` /SMask ${sm} 0 R` : ''}`, img.data, false));
    });
    const kids = this.pages.map((p) => {
      const content = add(stream('', p.ops.join('\n')));
      const fr = [...p.fonts].filter((k) => fontRef[k]).map((k) => `/${this.fonts[k].id} ${fontRef[k]} 0 R`).join(' ');
      const ir = [...p.imgs].map((id) => `/Im${id} ${imgRef[id - 1]} 0 R`).join(' ');
      return add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${this.W} ${this.H}] /Resources << /Font << ${fr} >> /XObject << ${ir} >> >> /Contents ${content} 0 R >>`);
    });
    objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R /ViewerPreferences << /DisplayDocTitle true >> >>`;
    objs[pagesObj - 1] = `<< /Type /Pages /Kids [${kids.map((k) => k + ' 0 R').join(' ')}] /Count ${kids.length} >>`;
    // serialise with a cross-reference table
    const parts = [Buffer.from('%PDF-1.7\n%\xe2\xe3\xcf\xd3\n', 'latin1')];
    const offsets = [];
    let pos = parts[0].length;
    objs.forEach((o, i) => {
      const body = Buffer.isBuffer(o) ? o : Buffer.from(o, 'latin1');
      const chunk = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`, 'latin1'), body, Buffer.from('\nendobj\n', 'latin1')]);
      offsets.push(pos); parts.push(chunk); pos += chunk.length;
    });
    const xref = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${pos}\n%%EOF\n`;
    parts.push(Buffer.from(xref, 'latin1'));
    return Buffer.concat(parts);
  }
}

module.exports = { PDF, shape, visual };
