'use strict';
// Tiny auto-escaping HTML templating: html`<p>${userText}</p>` escapes; raw(str) opts out.
class Raw {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}
const MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => MAP[c]);
const render = (v) => (v == null || v === false ? '' : v instanceof Raw ? v.s : Array.isArray(v) ? v.map(render).join('') : esc(v));
const html = (strings, ...vals) => {
  let out = strings[0];
  for (let i = 0; i < vals.length; i++) out += render(vals[i]) + strings[i + 1];
  return new Raw(out);
};
const raw = (s) => new Raw(s == null ? '' : String(s));
// Safe JSON for embedding inside <script type="application/json">
const json = (o) => raw(JSON.stringify(o).replace(/</g, '\\u003c'));
// Allow a small, safe subset of HTML for admin-written rich text (pages/descriptions).
function richText(s) {
  if (!s) return raw('');
  let h = esc(s);
  // re-enable basic tags the admin may type: <b> <strong> <i> <em> <u> <br> <p> <ul> <ol> <li> <h2> <h3> <h4> <hr>
  h = h.replace(/&lt;(\/?)(b|strong|i|em|u|br|p|ul|ol|li|h2|h3|h4|hr)\s*\/?&gt;/gi, '<$1$2>');
  // links: <a href="https://..."> or relative (/...)
  h = h.replace(/&lt;a href=&quot;((?:https?:\/\/|\/|mailto:|tel:)[^"&<>]*)&quot;&gt;/gi, '<a href="$1">').replace(/&lt;\/a&gt;/gi, '</a>');
  // plain-text paragraphs if no block tags used
  if (!/<(p|ul|ol|h2|h3|h4)>/i.test(h)) h = h.split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
  return raw(h);
}
module.exports = { html, raw, esc, json, richText, Raw };
