'use strict';
// Generates original, brand-free SVG product illustrations used as placeholder photos.
// Replace them anytime by uploading real photos in Admin → Products.

const hex2rgb = (h) => { h = String(h || '#999').replace('#', ''); if (h.length === 3) h = [...h].map((c) => c + c).join(''); const n = parseInt(h, 16) || 0; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgb2hex = (r, g, b) => '#' + [r, g, b].map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => { const A = hex2rgb(a), B = hex2rgb(b); return rgb2hex(...A.map((x, i) => x + (B[i] - x) * t)); };
const light = (c, t) => mix(c, '#ffffff', t);
const dark = (c, t) => mix(c, '#000000', t);

// gradient helpers (ids are prefixed so several products can share one SVG)
const lg = (id, stops, x2 = 1, y2 = 0) => `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}">${stops.map((s, i) => `<stop offset="${(i / (stops.length - 1)).toFixed(2)}" stop-color="${s}"/>`).join('')}</linearGradient>`;
const rg = (id, stops) => `<radialGradient id="${id}" cx=".38" cy=".35" r=".75">${stops.map((s, i) => `<stop offset="${(i / (stops.length - 1)).toFixed(2)}" stop-color="${s}"/>`).join('')}</radialGradient>`;
const metal = (id, base = '#1b1b1b') => lg(id, [base, light(base, 0.25), base, dark(base, 0.3)]);
const gold = (id) => lg(id, ['#a8843f', '#e9d6a0', '#b8975a', '#8c6d2e']);
const shine = (x, y, w, h, o = 0.28, rx = 6) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="#fff" opacity="${o}"/>`;

const K = {
  lipstick(c, u, o = {}) {
    const w = o.wide ? 150 : 110, x = 330 - (w - 110) / 2;
    return {
      defs: metal(u + 'm') + gold(u + 'g') + lg(u + 'b', [light(c, 0.25), c, dark(c, 0.35)]),
      body: `<rect x="140" y="215" width="${w}" height="305" rx="10" fill="url(#${u}m)"/>${shine(160, 230, 10, 270, 0.18, 5)}
      <rect x="${x}" y="335" width="${w}" height="185" rx="8" fill="url(#${u}m)"/>
      <rect x="${x}" y="312" width="${w}" height="26" rx="3" fill="url(#${u}g)"/>
      <rect x="${x + 14}" y="250" width="${w - 28}" height="64" fill="url(#${u}g)"/>
      <path d="M${x + 20} 252 L${x + 20} 168 Q${x + 20} 148 ${x + 40} 138 L${x + w - 30} 112 Q${x + w - 20} 108 ${x + w - 20} 122 L${x + w - 20} 252 Z" fill="url(#${u}b)"/>
      ${shine(x + 30, 150, 12, 96, 0.3, 6)}`,
    };
  },
  liquid(c, u, o = {}) {
    return {
      defs: metal(u + 'm') + lg(u + 'l', [light(c, 0.3), c, dark(c, 0.3)]),
      body: `<rect x="238" y="205" width="124" height="320" rx="22" fill="url(#${u}l)"/>
      <rect x="238" y="205" width="124" height="320" rx="22" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="5"/>
      ${shine(256, 225, 14, 280, o.gloss ? 0.5 : 0.3, 7)}${o.gloss ? shine(330, 240, 8, 120, 0.35, 4) : ''}
      <rect x="248" y="58" width="104" height="160" rx="12" fill="url(#${u}m)"/>${shine(262, 70, 9, 135, 0.18, 4)}`,
    };
  },
  pencil(c, u, o = {}) {
    const wood = '#e8c49a', body = o.body || c;
    return {
      defs: lg(u + 'p', [light(body, 0.2), body, dark(body, 0.3)]),
      body: `<g transform="rotate(-38 300 300)">
      <rect x="276" y="150" width="48" height="380" rx="6" fill="url(#${u}p)"/>${shine(284, 160, 7, 360, 0.25, 3)}
      <rect x="276" y="500" width="48" height="30" rx="4" fill="${dark(body, 0.45)}"/>
      <path d="M276 150 L300 70 L324 150 Z" fill="${wood}"/><path d="M291 100 L300 70 L309 100 Z" fill="${c}"/></g>`,
    };
  },
  mascara(c, u) {
    return {
      defs: metal(u + 'm', c) + metal(u + 'k'),
      body: `<rect x="150" y="190" width="96" height="335" rx="14" fill="url(#${u}m)"/>${shine(164, 205, 10, 300, 0.22, 5)}
      <rect x="150" y="150" width="96" height="44" rx="6" fill="url(#${u}k)"/>
      <g transform="rotate(14 380 525)"><rect x="376" y="150" width="8" height="250" fill="#222"/>
      <g stroke="#111" stroke-width="5" stroke-linecap="round">${Array.from({ length: 12 }, (_, i) => `<line x1="362" y1="${62 + i * 9}" x2="398" y2="${62 + i * 9}"/>`).join('')}</g>
      <rect x="358" y="385" width="44" height="140" rx="12" fill="url(#${u}k)"/>${shine(366, 395, 6, 115, 0.2, 3)}</g>`,
    };
  },
  eyeliner(c, u) {
    return {
      defs: metal(u + 'm', c),
      body: `<g transform="rotate(-35 300 300)"><rect x="275" y="150" width="50" height="380" rx="12" fill="url(#${u}m)"/>${shine(285, 165, 8, 350, 0.2, 4)}
      <path d="M281 150 L300 80 L319 150 Z" fill="#111"/><rect x="275" y="140" width="50" height="14" fill="#b8975a"/></g>`,
    };
  },
  palette(c, u, o = {}) {
    const cols = o.colors || [light(c, 0.55), light(c, 0.3), c, mix(c, '#c08552', 0.4), dark(c, 0.2), light(mix(c, '#e7b98a', 0.5), 0.2), mix(c, '#7a4b3a', 0.5), dark(c, 0.45), light(mix(c, '#f2d4b8', 0.6), 0.1)];
    const n = cols.length, colsN = n > 6 ? 3 : n > 3 ? 3 : n, rows = Math.ceil(n / colsN);
    const pw = 360 / colsN, ph = 230 / rows;
    let pans = '';
    cols.forEach((col, i) => {
      const cx = 120 + (i % colsN) * pw, cy = 185 + Math.floor(i / colsN) * ph;
      pans += `<rect x="${cx + 8}" y="${cy + 8}" width="${pw - 16}" height="${ph - 16}" rx="10" fill="${col}"/><rect x="${cx + 8}" y="${cy + 8}" width="${pw - 16}" height="${(ph - 16) / 2}" rx="10" fill="#fff" opacity=".14"/>`;
    });
    return { defs: metal(u + 'm', o.case || '#1d1d1d'), body: `<rect x="95" y="160" width="410" height="290" rx="26" fill="url(#${u}m)"/><rect x="112" y="177" width="376" height="256" rx="16" fill="#0d0d0d" opacity=".55"/>${pans}` };
  },
  compact(c, u, o = {}) {
    return {
      defs: metal(u + 'm', o.case || '#1d1d1d') + rg(u + 'p', [light(c, 0.35), c, dark(c, 0.2)]) + gold(u + 'g'),
      body: `<circle cx="300" cy="320" r="190" fill="url(#${u}m)"/><circle cx="300" cy="320" r="168" fill="url(#${u}g)" opacity=".9"/>
      <circle cx="300" cy="320" r="155" fill="url(#${u}p)"/>
      <g fill="none" stroke="#fff" stroke-opacity="${o.shimmer ? 0.35 : 0.16}" stroke-width="3">${[40, 75, 110, 140].map((r) => `<circle cx="300" cy="320" r="${r}"/>`).join('')}</g>
      ${o.shimmer ? '<ellipse cx="250" cy="270" rx="70" ry="38" fill="#fff" opacity=".35" transform="rotate(-25 250 270)"/>' : '<ellipse cx="250" cy="270" rx="60" ry="30" fill="#fff" opacity=".12" transform="rotate(-25 250 270)"/>'}`,
    };
  },
  foundation(c, u) {
    return {
      defs: lg(u + 'f', [light(c, 0.25), c, dark(c, 0.18)]) + metal(u + 'm') + gold(u + 'g'),
      body: `<rect x="205" y="215" width="190" height="310" rx="30" fill="url(#${u}f)"/><rect x="205" y="215" width="190" height="310" rx="30" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="6"/>
      ${shine(225, 240, 16, 255, 0.35, 8)}<rect x="268" y="178" width="64" height="44" fill="url(#${u}g)"/>
      <rect x="240" y="72" width="120" height="112" rx="14" fill="url(#${u}m)"/>${shine(255, 84, 9, 90, 0.18, 4)}`,
    };
  },
  nail(c, u) {
    return {
      defs: rg(u + 'n', [light(c, 0.35), c, dark(c, 0.3)]) + metal(u + 'm'),
      body: `<rect x="200" y="300" width="200" height="225" rx="46" fill="url(#${u}n)"/><rect x="200" y="300" width="200" height="225" rx="46" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="6"/>
      ${shine(222, 322, 16, 170, 0.4, 8)}<rect x="268" y="270" width="64" height="40" fill="${light(c, 0.5)}" opacity=".8"/>
      <rect x="252" y="90" width="96" height="190" rx="12" fill="url(#${u}m)"/>${shine(264, 104, 8, 160, 0.18, 4)}`,
    };
  },
  jar(c, u) {
    return {
      defs: lg(u + 'j', ['#ffffff', '#f2eeeb', '#d9d3cf']) + lg(u + 'l', [light(c, 0.2), c, dark(c, 0.25)]),
      body: `<rect x="140" y="300" width="320" height="220" rx="34" fill="url(#${u}j)"/><rect x="140" y="390" width="320" height="34" fill="${c}" opacity=".85"/>
      ${shine(160, 318, 14, 180, 0.6, 7)}<rect x="128" y="236" width="344" height="84" rx="20" fill="url(#${u}l)"/>${shine(146, 248, 300, 10, 0.25, 5)}`,
    };
  },
  serum(c, u) {
    return {
      defs: lg(u + 's', [light(c, 0.3), c, dark(c, 0.35)]) + gold(u + 'g') + metal(u + 'k'),
      body: `<rect x="220" y="262" width="160" height="262" rx="26" fill="url(#${u}s)"/><rect x="220" y="262" width="160" height="262" rx="26" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="5"/>
      ${shine(238, 282, 14, 220, 0.35, 7)}<rect x="244" y="350" width="112" height="90" rx="6" fill="#fff" opacity=".85"/>
      <rect x="252" y="214" width="96" height="56" rx="6" fill="url(#${u}g)"/><path d="M262 216 Q262 120 300 96 Q338 120 338 216 Z" fill="url(#${u}k)"/>`,
    };
  },
  tube(c, u) {
    return {
      defs: lg(u + 't', [light(c, 0.35), light(c, 0.1), dark(c, 0.15)]) + metal(u + 'm', dark(c, 0.5)),
      body: `<path d="M248 440 L222 118 L378 118 L352 440 Z" fill="url(#${u}t)"/>${shine(244, 135, 12, 280, 0.35, 6)}
      <rect x="216" y="96" width="168" height="28" rx="4" fill="${light(c, 0.15)}"/>
      <g stroke="${dark(c, 0.15)}" stroke-width="2">${Array.from({ length: 12 }, (_, i) => `<line x1="${226 + i * 13}" y1="100" x2="${226 + i * 13}" y2="120"/>`).join('')}</g>
      <rect x="240" y="436" width="120" height="88" rx="12" fill="url(#${u}m)"/>`,
    };
  },
  brush(c, u, o = {}) {
    const head = o.head || 'round';
    const bristle = head === 'round' ? 'M300 40 Q235 60 238 160 L362 160 Q365 60 300 40 Z' : head === 'flat' ? 'M258 60 Q300 45 342 60 L352 160 L248 160 Z' : head === 'fine' ? 'M300 70 L286 160 L314 160 Z' : 'M300 75 Q272 95 274 160 L326 160 Q328 95 300 75 Z';
    return {
      defs: lg(u + 'b', [dark(c, 0.2), c, light(c, 0.45)], 0, 1) + metal(u + 'h', '#202020') + lg(u + 'f', ['#9a9a9a', '#f1f1f1', '#b4b4b4', '#7c7c7c']),
      body: `<g transform="rotate(-35 300 300)"><path d="${bristle}" fill="url(#${u}b)"/><rect x="266" y="156" width="68" height="74" rx="6" fill="url(#${u}f)"/>
      <path d="M270 228 L330 228 L314 540 Q300 552 286 540 Z" fill="url(#${u}h)"/></g>`,
    };
  },
  sponge(c, u) {
    return {
      defs: rg(u + 's', [light(c, 0.35), c, dark(c, 0.25)]),
      body: `<path d="M300 90 C390 160 430 290 410 380 C392 470 208 470 190 380 C170 290 210 160 300 90 Z" fill="url(#${u}s)"/>
      <ellipse cx="262" cy="230" rx="30" ry="60" fill="#fff" opacity=".2" transform="rotate(20 262 230)"/>`,
    };
  },
  perfume(c, u, o = {}) {
    return {
      defs: lg(u + 'p', [light(c, 0.45), light(c, 0.15), c]) + (o.capColor ? metal(u + 'c', o.capColor) : gold(u + 'c')) + gold(u + 'g'),
      body: `<rect x="170" y="240" width="260" height="285" rx="34" fill="url(#${u}p)" opacity=".95"/><rect x="170" y="240" width="260" height="285" rx="34" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="7"/>
      <rect x="198" y="268" width="204" height="229" rx="22" fill="${c}" opacity=".35"/>${shine(192, 262, 18, 240, 0.45, 9)}
      <rect x="262" y="205" width="76" height="42" fill="url(#${u}g)"/><rect x="228" y="100" width="144" height="110" rx="16" fill="url(#${u}c)"/>`,
    };
  },
  bag(c, u) {
    return {
      defs: lg(u + 'b', [light(c, 0.2), c, dark(c, 0.25)], 0, 1) + gold(u + 'g'),
      body: `<path d="M130 220 Q130 200 150 200 L450 200 Q470 200 470 220 L500 490 Q502 520 472 520 L128 520 Q98 520 100 490 Z" fill="url(#${u}b)"/>
      <rect x="140" y="214" width="320" height="10" rx="5" fill="url(#${u}g)"/><rect x="420" y="196" width="22" height="70" rx="8" fill="url(#${u}g)"/>
      ${shine(140, 240, 330, 14, 0.18, 7)}`,
    };
  },
  lashes(c, u) {
    const lash = (cx) => `<g stroke="#151515" stroke-width="3.2" stroke-linecap="round" fill="none"><path d="M${cx - 95} 330 Q${cx} 290 ${cx + 95} 330" stroke-width="6"/>${Array.from({ length: 22 }, (_, i) => { const t = i / 21, x = cx - 95 + 190 * t, y = 330 - 40 * Math.sin(Math.PI * t) + 0; return `<line x1="${x.toFixed(1)}" y1="${(y + 6).toFixed(1)}" x2="${(x + (t - 0.5) * 40).toFixed(1)}" y2="${(y - 55 - 25 * Math.sin(Math.PI * t)).toFixed(1)}"/>`; }).join('')}</g>`;
    return { defs: '', body: `<rect x="90" y="170" width="420" height="300" rx="24" fill="${light(c, 0.75)}"/><rect x="90" y="170" width="420" height="300" rx="24" fill="none" stroke="${c}" stroke-width="4"/>${lash(200)}${lash(400)}` };
  },
  bottle(c, u) {
    return {
      defs: lg(u + 'b', [light(c, 0.55), light(c, 0.3), light(c, 0.05)]) + metal(u + 'm', dark(c, 0.3)),
      body: `<rect x="225" y="160" width="150" height="365" rx="34" fill="url(#${u}b)"/>${shine(242, 185, 14, 310, 0.45, 7)}
      <rect x="240" y="300" width="120" height="110" rx="8" fill="#fff" opacity=".8"/><rect x="262" y="96" width="76" height="72" rx="10" fill="url(#${u}m)"/>`,
    };
  },
  file(c, u) {
    return {
      defs: lg(u + 'f', [light(c, 0.4), c, dark(c, 0.2)]),
      body: `<g transform="rotate(-40 300 300)"><rect x="278" y="70" width="44" height="460" rx="22" fill="url(#${u}f)"/>${shine(286, 90, 6, 420, 0.4, 3)}</g>`,
    };
  },
};
K.stick = (c, u) => K.lipstick(c, u, { wide: true });
K.gloss = (c, u) => K.liquid(c, u, { gloss: true });

const KINDS = Object.keys(K);
let seq = 0;

// Single product on a soft background (square)
function productSVG(kind, color = '#c2185b', opts = {}) {
  const f = K[kind] || K.jar;
  const u = 'a' + (seq++).toString(36);
  const { defs, body } = f(color, u, opts);
  const bg = opts.bg || '#f1f1f1';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="600" height="600"><defs>${defs}${rg(u + 'bg', ['#ffffff', bg])}</defs>`
    + `<rect width="600" height="600" fill="url(#${u}bg)"/><ellipse cx="300" cy="532" rx="175" ry="16" fill="#000" opacity=".09"/>${body}</svg>`;
}

// Several products composed on a transparent/colored canvas (hero banners, cards)
function composeSVG(items, { w = 900, h = 700, bg = null, circle = null } = {}) {
  let defs = '', body = '';
  if (circle) body += `<circle cx="${circle.x}" cy="${circle.y}" r="${circle.r}" fill="${circle.fill}" opacity="${circle.o ?? 1}"/>`;
  for (const it of items) {
    const u = 'c' + (seq++).toString(36);
    const r = (K[it.kind] || K.jar)(it.color, u, it.opts || {});
    defs += r.defs;
    body += `<g transform="translate(${it.x} ${it.y}) scale(${it.s || 1})"><ellipse cx="300" cy="530" rx="160" ry="14" fill="#000" opacity=".12"/>${r.body}</g>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><defs>${defs}</defs>${bg ? `<rect width="${w}" height="${h}" fill="${bg}"/>` : ''}${body}</svg>`;
}

module.exports = { productSVG, composeSVG, KINDS, mix, light, dark };
