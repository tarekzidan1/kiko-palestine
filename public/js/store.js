/* Storefront interactions (vanilla JS, no dependencies). Every feature degrades to plain links/forms without JS. */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const html = document.documentElement;
  const lang = html.lang || 'ar';
  const rtl = html.dir === 'rtl';
  const T = JSON.parse(($('#i18n') || {}).textContent || '{}');
  const csrf = ($('meta[name="csrf-token"]') || {}).content || '';
  const store = { // localStorage can throw (private mode) — never let it break the page
    get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
  };
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- helpers ----------
  async function api(url, data, method = data ? 'POST' : 'GET') {
    const opt = { method, headers: { Accept: 'application/json', 'X-Requested-With': 'fetch', 'X-CSRF-Token': csrf }, credentials: 'same-origin' };
    if (data) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify({ ...data, lang }); }
    const sep = url.includes('?') ? '&' : '?';
    const res = await fetch(method === 'GET' ? `${url}${sep}lang=${lang}` : url, opt);
    const json = await res.json().catch(() => ({ ok: false }));
    if (!res.ok && !json.error) json.error = T['common.error'];
    return json;
  }
  let toastTimer;
  function toast(msg, err) {
    const el = $('.toast');
    if (!el || !msg) return;
    el.textContent = msg;
    el.classList.toggle('err', !!err);
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.hidden = true), 2800);
  }
  const setCount = (sel, n) => $$(sel).forEach((el) => { el.textContent = n; el.hidden = !n; });
  const formData = (form, submitter) => {
    const o = Object.fromEntries(new FormData(form));
    if (submitter && submitter.name) o[submitter.name] = submitter.value;
    return o;
  };

  // ---------- drawers & modals ----------
  let lastFocus = null;
  function open(id, skipLoad) {
    const el = document.getElementById(id);
    if (!el) return false;
    lastFocus = document.activeElement;
    el.classList.add('open');
    el.setAttribute('aria-hidden', 'false');
    document.body.classList.add('lock');
    setTimeout(() => ($('[data-close].icon-btn, button, a, input', el.querySelector('.drawer-panel, .modal-box') || el) || el).focus({ preventScroll: true }), 50);
    if (id === 'cart-drawer' && !skipLoad) loadCart();
    return true;
  }
  function close(el) {
    if (!el) return;
    el.classList.remove('open');
    el.setAttribute('aria-hidden', 'true');
    if (!$('.drawer.open, .modal.open')) document.body.classList.remove('lock');
    if (el.id === 'welcome') store.set('popup_seen', String(Date.now()));
    lastFocus?.focus?.({ preventScroll: true });
  }
  document.addEventListener('click', (e) => {
    const o = e.target.closest('[data-open]');
    if (o && !(o.dataset.open === 'filters' && innerWidth > 960)) { if (open(o.dataset.open)) e.preventDefault(); return; }
    const c = e.target.closest('[data-close]');
    if (c) { e.preventDefault(); close(c.closest('.drawer, .modal')); }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $$('.drawer.open, .modal.open').forEach(close); });

  // ---------- cart ----------
  const cartBody = () => $('[data-cart-body]');
  function renderCart(r) {
    if (r.html !== undefined && cartBody()) cartBody().innerHTML = r.html;
    if (r.count !== undefined) setCount('[data-cart-count]', r.count);
  }
  async function loadCart() { renderCart(await api('/api/cart')); }
  async function addToCart(product_id, variant_id, qty, btn) {
    btn?.classList.add('is-busy');
    try {
      const r = await api('/api/cart/add', { product_id, variant_id, qty });
      if (!r.ok) return toast(r.error, true);
      renderCart(r);
      open('cart-drawer', true);
      toast(r.msg);
    } catch { toast(T['common.error'], true); } finally { btn?.classList.remove('is-busy'); }
  }
  // "Add to bag" on product cards
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-add]');
    if (!b) return;
    const card = b.closest('.card');
    addToCart(+card.dataset.pid, +card.dataset.vid, 1, b);
  });
  // Shade swatches on cards swap the photo + chosen variant
  document.addEventListener('click', (e) => {
    const sw = e.target.closest('.card .sw');
    if (!sw) return;
    const card = sw.closest('.card');
    card.dataset.vid = sw.dataset.vid;
    $$('.sw', card).forEach((x) => x.classList.toggle('on', x === sw));
    if (sw.dataset.img) $('[data-main]', card).src = sw.dataset.img;
  });
  // Quantity / remove inside the drawer or the cart page (forms work without JS too)
  document.addEventListener('submit', async (e) => {
    const f = e.target;
    if (f.matches('[data-line]')) {
      e.preventDefault();
      const r = await api('/api/cart/update', formData(f, e.submitter));
      if (r.error) toast(r.error, true);
      if (f.closest('[data-cart-body]')) renderCart(r); else location.reload();
    } else if (f.matches('[data-coupon]')) {
      e.preventDefault();
      const r = await api('/api/cart/coupon', formData(f, e.submitter));
      toast(r.msg || r.error, !r.ok);
      if (r.ok) setTimeout(() => location.reload(), 400);
    } else if (f.matches('[data-buy]')) {
      e.preventDefault();
      const d = formData(f);
      addToCart(+d.product_id, +d.variant_id, +d.qty || 1, $('[data-add-main]', f));
    } else if (f.matches('[data-newsletter]')) {
      e.preventDefault();
      const r = await api('/api/newsletter', formData(f));
      toast(r.msg || r.error, !r.ok);
      if (r.ok) {
        f.reset();
        const rev = f.dataset.reveal && f.parentElement.querySelector('.reveal');
        if (rev) { f.hidden = true; rev.hidden = false; }
        store.set('popup_seen', 'joined');
      }
    } else if (f.matches('[data-checkout]')) {
      const btn = $('[data-place]', f);
      if (btn.classList.contains('is-busy')) return e.preventDefault(); // no double orders
      btn.classList.add('is-busy');
    }
  });

  // ---------- product page ----------
  const buy = $('[data-buy]');
  if (buy) {
    const main = $('[data-g-main]');
    const swap = (src) => { if (!src || !main || main.getAttribute('src') === src) return; main.style.opacity = 0; setTimeout(() => { main.src = src; main.style.opacity = 1; }, 120); };
    $$('[data-g-img]').forEach((t) => t.addEventListener('click', () => { swap(t.dataset.gImg); $$('[data-g-img]').forEach((x) => x.classList.toggle('on', x === t)); }));
    const line = $('[data-stock-line]'), addBtn = $('[data-add-main]'), low = +(line?.dataset.low || 5);
    $$('.shades .sw').forEach((sw) => sw.addEventListener('click', () => {
      $$('.shades .sw').forEach((x) => { x.classList.toggle('on', x === sw); x.setAttribute('aria-checked', x === sw); });
      $('[data-vid-input]', buy).value = sw.dataset.vid;
      $('[data-shade-name]').textContent = sw.dataset.name;
      const sku = $('[data-sku]'); if (sku && sw.dataset.sku) sku.textContent = sw.dataset.sku;
      swap(sw.dataset.img);
      const n = +sw.dataset.stock;
      if (line) { // texts come translated from the server (data-ok / data-out / data-low-tpl)
        line.className = 'stock-line ' + (n <= 0 ? 'out' : n <= low ? 'low' : 'ok');
        line.textContent = n <= 0 ? line.dataset.out : n <= low ? line.dataset.lowTpl.replace('{n}', n) : line.dataset.ok;
      }
      if (addBtn) { addBtn.disabled = n <= 0; addBtn.textContent = n <= 0 ? line.dataset.out : addBtn.dataset.addText; }
      const u = new URL(location.href); u.searchParams.set('v', sw.dataset.vid); history.replaceState(null, '', u);
    }));
    $$('[data-qty] [data-step]').forEach((b) => b.addEventListener('click', () => {
      const i = $('input', b.parentElement);
      i.value = Math.min(99, Math.max(1, (+i.value || 1) + +b.dataset.step));
    }));
  }

  // ---------- wishlist ----------
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-wish]');
    if (!b) return;
    e.preventDefault();
    const r = await api('/api/wishlist/toggle', { product_id: +b.dataset.wish });
    if (!r.ok) return toast(r.error, true);
    $$(`[data-wish="${b.dataset.wish}"]`).forEach((x) => { x.classList.toggle('on', r.on); x.setAttribute('aria-pressed', r.on); x.classList.add('pop'); setTimeout(() => x.classList.remove('pop'), 400); });
    setCount('[data-wish-count]', r.count);
    toast(r.msg);
    if (!r.on && /\/wishlist$/.test(location.pathname)) b.closest('.card')?.remove();
  });

  // ---------- checkout: live totals ----------
  const co = $('[data-checkout]');
  if (co) {
    const refresh = async () => {
      const zone = ($('input[name="zone_id"]:checked', co) || {}).value || '';
      const pay = ($('input[name="payment"]:checked', co) || {}).value || '';
      const r = await api(`/api/checkout/summary?zone_id=${zone}&payment=${pay}`);
      if (r.html) $('[data-summary]', co).innerHTML = r.html;
    };
    co.addEventListener('change', (e) => { if (e.target.name === 'zone_id' || e.target.name === 'payment') refresh(); });
    co.addEventListener('click', async (e) => {
      const apply = e.target.closest('[data-coupon-apply]'), rem = e.target.closest('[data-coupon-remove]');
      if (!apply && !rem) return;
      e.preventDefault();
      const code = rem ? '' : ($('[name="coupon_code"]', co).value || '').trim();
      const r = await api('/api/cart/coupon', rem ? { remove: 1 } : { code });
      toast(r.msg || r.error, !r.ok);
      refresh();
    });
    co.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.name === 'coupon_code') { e.preventDefault(); $('[data-coupon-apply]', co)?.click(); } });
    if ($('input[name="zone_id"]:checked', co)) refresh();
  }

  // ---------- search suggestions ----------
  $$('[data-search]').forEach((form) => {
    const input = $('input[name="q"]', form), box = $('.suggest', form);
    let timer, ctrl, idx = -1;
    const hide = () => { box.hidden = true; idx = -1; };
    const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    input.addEventListener('input', () => {
      clearTimeout(timer);
      const q = input.value.trim();
      if (q.length < 2) return hide();
      timer = setTimeout(async () => {
        ctrl?.abort(); ctrl = new AbortController();
        try {
          const r = await (await fetch(`/api/suggest?lang=${lang}&q=${encodeURIComponent(q)}`, { signal: ctrl.signal, headers: { Accept: 'application/json' } })).json();
          let h = '';
          if (r.categories?.length) h += `<p class="sg-h">${esc(T['search.categories'])}</p><div class="sg-cats">${r.categories.map((c) => `<a class="sg-cat" href="${esc(c.url)}">${esc(c.name)}</a>`).join('')}</div>`;
          if (r.products?.length) h += `<p class="sg-h">${esc(T['search.products'])}</p>` + r.products.map((p) => `<a class="sg-item" href="${esc(p.url)}"><img src="${esc(p.image)}" alt=""><span>${esc(p.name)}</span><b>${esc(p.price)}${p.regular ? ` <del>${esc(p.regular)}</del>` : ''}</b></a>`).join('');
          h += r.total ? `<a class="sg-all" href="${esc(r.all)}">${esc(T['search.see_all'])} (${r.total})</a>` : `<p class="sg-empty">${esc(T['search.no_results'])}</p>`;
          box.innerHTML = h; box.hidden = false; idx = -1;
        } catch { /* aborted */ }
      }, 220);
    });
    input.addEventListener('keydown', (e) => {
      const items = $$('a', box);
      if (box.hidden || !items.length) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        idx = (idx + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        items.forEach((a, i) => a.classList.toggle('act', i === idx));
      } else if (e.key === 'Enter' && idx >= 0) { e.preventDefault(); location.href = items[idx].href; } else if (e.key === 'Escape') hide();
    });
    document.addEventListener('click', (e) => { if (!form.contains(e.target)) hide(); });
  });
  $('[data-toggle-search]')?.addEventListener('click', () => {
    const h = $('.hdr');
    h.classList.toggle('search-open');
    if (h.classList.contains('search-open')) $('.hdr-search input', h).focus();
  });

  // ---------- announcement bar, promo countdown ----------
  const msgs = $$('.announce-msg');
  if (msgs.length > 1 && !reduced) {
    let i = 0;
    setInterval(() => { msgs[i].classList.remove('on'); i = (i + 1) % msgs.length; msgs[i].classList.add('on'); }, 4500);
  }
  const promo = $('[data-promo]');
  if (promo && store.get('promo_closed') !== promo.dataset.promo) {
    promo.hidden = false;
    const end = +promo.dataset.promo, timer = $('[data-timer]', promo);
    if (end && timer) {
      const pad = (n) => String(n).padStart(2, '0');
      const tick = () => {
        const s = Math.max(0, Math.floor((end - Date.now()) / 1000));
        if (!s) { promo.hidden = true; return clearInterval(iv); }
        const d = Math.floor(s / 86400), h = Math.floor(s / 3600) % 24, m = Math.floor(s / 60) % 60;
        timer.innerHTML = `${d ? `<b>${d}${T['promo.d']}</b>` : ''}<b>${pad(h)}${T['promo.h']}</b><b>${pad(m)}${T['promo.m']}</b><b>${pad(s % 60)}${T['promo.s']}</b>`;
      };
      const iv = setInterval(tick, 1000); tick();
    }
    $('[data-promo-close]', promo)?.addEventListener('click', () => { promo.hidden = true; store.set('promo_closed', promo.dataset.promo); });
  }

  // ---------- hero slider (scroll-snap + dots + autoplay) ----------
  const hero = $('[data-hero]');
  if (hero) {
    const slides = hero.children, dots = $$('.hero-dots button');
    const cur = () => Math.round(Math.abs(hero.scrollLeft) / hero.clientWidth);
    const go = (i) => hero.scrollTo({ left: (rtl ? -1 : 1) * i * hero.clientWidth, behavior: reduced ? 'auto' : 'smooth' });
    hero.addEventListener('scroll', () => { const i = cur(); dots.forEach((d, j) => d.classList.toggle('on', i === j)); }, { passive: true });
    dots.forEach((d) => d.addEventListener('click', () => { go(+d.dataset.dot); paused = true; }));
    let paused = false;
    ['pointerdown', 'mouseenter', 'focusin'].forEach((ev) => hero.addEventListener(ev, () => (paused = true)));
    hero.addEventListener('mouseleave', () => (paused = false));
    if (slides.length > 1 && !reduced) setInterval(() => { if (!paused && !document.hidden) go((cur() + 1) % slides.length); }, 6000);
  }
  // product rails
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-rail]');
    if (!b) return;
    const track = b.closest('.rail').querySelector('.rail-track');
    track.scrollBy({ left: +b.dataset.rail * (rtl ? -1 : 1) * track.clientWidth * 0.9, behavior: reduced ? 'auto' : 'smooth' });
  });

  // ---------- misc ----------
  $$('[data-autosubmit]').forEach((s) => s.addEventListener('change', () => s.form.submit()));
  const cookie = $('[data-cookie]');
  if (cookie && !store.get('cookie_ok')) {
    cookie.hidden = false;
    document.body.classList.add('has-cookie');
    $('[data-cookie-ok]', cookie).addEventListener('click', () => { store.set('cookie_ok', '1'); cookie.hidden = true; document.body.classList.remove('has-cookie'); });
  }
  const popup = $('[data-popup]');
  const seen = store.get('popup_seen');
  if (popup && (!seen || (seen !== 'joined' && Date.now() - +seen > 7 * 864e5)) && !/\/(checkout|cart|order|account)/.test(location.pathname)) {
    setTimeout(() => { if (!$('.drawer.open, .modal.open')) open('welcome'); }, 12000);
  }
})();
