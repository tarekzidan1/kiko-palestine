'use strict';
// Verifies every translation key used in the code exists in both en.js and ar.js.
const fs = require('node:fs');
const path = require('node:path');
const en = require('../src/lang/en');
const ar = require('../src/lang/ar');

const root = path.join(__dirname, '..', 'src');
const files = [];
(function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); fs.statSync(p).isDirectory() ? walk(p) : p.endsWith('.js') && !p.includes(`${path.sep}lang${path.sep}`) && files.push(p); } })(root);

const used = new Set();
const NS = '(?:common|nav|search|wish|badge|card|pdp|cart|coupon|co|pay|order|status|paystatus|track|contact|cat|home|promo|nl|ftr|popup|cookie|err|acc|mail|adm)';
const re = new RegExp(`['"\`](${NS}\\.[a-z0-9_.]+)['"\`]`, 'g');
for (const f of files) for (const m of fs.readFileSync(f, 'utf8').matchAll(re)) used.add(m[1]);
// keys built dynamically
['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'].forEach((s) => { used.add('status.' + s); if (s !== 'pending') used.add('mail.status_' + s); });
['unpaid', 'paid', 'failed', 'refunded'].forEach((s) => used.add('paystatus.' + s));
['hero', 'circle', 'card', 'service', 'promo'].forEach((s) => used.add('adm.place.' + s));
['bestseller', 'new', 'sale', 'featured', 'limited'].forEach((s) => used.add('adm.src.' + s));

let bad = 0;
for (const k of [...used].sort()) {
  if (k.endsWith('.') || k.endsWith('_')) continue; // dynamic prefixes
  if (!(k in en)) { console.log('missing in en:', k); bad++; }
  if (!(k in ar)) { console.log('missing in ar:', k); bad++; }
}
for (const k of Object.keys(en)) if (!(k in ar)) { console.log('in en but not ar:', k); bad++; }
for (const k of Object.keys(ar)) if (!(k in en)) { console.log('in ar but not en:', k); bad++; }
console.log(bad ? `\n✖ ${bad} problem(s)` : `✔ ${used.size} keys used, all translated (${Object.keys(en).length} total)`);
process.exit(bad ? 1 : 0);
