'use strict';
// Translations: src/lang/en.js + src/lang/ar.js. t('key', {var}) replaces {var}.
const DICT = { en: require('./lang/en'), ar: require('./lang/ar') };
const LANGS = ['ar', 'en'];
const missing = new Set();

function tr(lang, key, vars) {
  let s = DICT[lang]?.[key] ?? DICT.en[key];
  if (s === undefined) {
    if (!missing.has(key)) { missing.add(key); console.warn('[i18n] missing key:', key); }
    s = key;
  }
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m)) : s;
}
// Localised DB field: loc(product, 'name', 'ar') → product.name_ar (falls back to the other language)
const loc = (o, f, lang) => (o ? o[`${f}_${lang}`] || o[`${f}_${lang === 'ar' ? 'en' : 'ar'}`] || o[f] || '' : '');
// Admin-entered links like "/sale" become "/ar/sale"; absolute/other links stay as they are.
function link(lang, href) {
  if (!href) return '#';
  if (/^(https?:|mailto:|tel:|#|\/\/)/i.test(href) || /^\/(ar|en)(\/|$)/.test(href) || /^\/(uploads|assets|admin|pay)\//.test(href)) return href;
  return href.startsWith('/') ? `/${lang}${href === '/' ? '' : href}` : `/${lang}/${href}`;
}
module.exports = { tr, loc, link, LANGS, DICT };
