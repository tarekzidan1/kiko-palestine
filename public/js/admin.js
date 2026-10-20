/* Admin helpers: image upload (auto-resized), product images & shades editors, CSV import, confirmations. */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const csrf = ($('meta[name="csrf-token"]') || {}).content || '';

  // Read a file, downscale big photos to max 1600px (webp/jpeg), return a data URL.
  function readImage(file, logo = false) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onerror = reject;
      fr.onload = () => {
        const url = fr.result;
        if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return resolve(url); // keep svg/gif as-is
        const img = new Image();
        img.onload = () => {
          const max = 1600, scale = Math.min(1, max / Math.max(img.width, img.height));
          const toPng = logo && file.type === 'image/webp'; // the logo must stay PNG/JPG so it can be printed on PDF invoices
          if (scale === 1 && file.size < 900e3 && !toPng) return resolve(url);
          const c = document.createElement('canvas');
          c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          if (logo) return resolve(c.toDataURL(file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png', 0.9));
          const out = c.toDataURL('image/webp', 0.86);
          resolve(out.startsWith('data:image/webp') ? out : c.toDataURL('image/jpeg', 0.88));
        };
        img.onerror = () => resolve(url);
        img.src = url;
      };
      fr.readAsDataURL(file);
    });
  }
  async function upload(file, logo = false) {
    const data = await readImage(file, logo);
    const r = await fetch('/admin/upload', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf, Accept: 'application/json' }, body: JSON.stringify({ name: file.name, data }) });
    const j = await r.json().catch(() => ({}));
    if (!j.ok) throw new Error(j.error || 'Upload failed');
    return j.url;
  }

  // Single image fields (banners, logo, shade photos)
  function bindImg1(box) {
    const hidden = $('input[type=hidden]', box), img = $('img', box), file = $('input[type=file]', box);
    file?.addEventListener('change', async () => {
      if (!file.files[0]) return;
      box.classList.add('uploading');
      try { hidden.value = await upload(file.files[0], box.hasAttribute('data-logo')); img.src = hidden.value; img.hidden = false; } catch (e) { alert(e.message); }
      box.classList.remove('uploading'); file.value = '';
    });
    $('[data-clear]', box)?.addEventListener('click', () => { hidden.value = ''; img.hidden = true; img.removeAttribute('src'); });
  }
  $$('[data-img1]').forEach(bindImg1);

  // Product gallery editor: order matters (first = main photo)
  const gal = $('[data-images]');
  if (gal) {
    const hidden = $('input[name=images]', gal), list = $('.imgs-list', gal), file = $('input[type=file]', gal);
    let imgs = [];
    try { imgs = JSON.parse(hidden.value || '[]'); } catch { imgs = []; }
    const render = () => {
      hidden.value = JSON.stringify(imgs);
      list.innerHTML = '';
      imgs.forEach((src, i) => {
        const d = document.createElement('div');
        d.className = 'imgs-item';
        d.innerHTML = `<img alt=""><div class="tools"><button type="button" data-m="-1">‹</button><button type="button" data-x>×</button><button type="button" data-m="1">›</button></div>`;
        $('img', d).src = src;
        d.addEventListener('click', (e) => {
          const b = e.target.closest('button'); if (!b) return;
          if (b.hasAttribute('data-x')) imgs.splice(i, 1);
          else { const j = i + +b.dataset.m; if (j >= 0 && j < imgs.length) [imgs[i], imgs[j]] = [imgs[j], imgs[i]]; }
          render();
        });
        list.appendChild(d);
      });
    };
    const addFiles = async (files) => {
      gal.classList.add('uploading');
      for (const f of files) { if (!f.type.startsWith('image/')) continue; try { imgs.push(await upload(f)); render(); } catch (e) { alert(e.message); } }
      gal.classList.remove('uploading'); file.value = '';
    };
    file.addEventListener('change', () => addFiles([...file.files]));
    // drag & drop photos from the computer
    gal.addEventListener('dragover', (e) => { e.preventDefault(); gal.classList.add('drag'); });
    gal.addEventListener('dragleave', () => gal.classList.remove('drag'));
    gal.addEventListener('drop', (e) => { e.preventDefault(); gal.classList.remove('drag'); addFiles([...e.dataTransfer.files]); });
    render();
  }

  // Shades / variants rows
  const vbody = $('[data-vbody]'), tpl = $('[data-vtpl]');
  if (vbody && tpl) {
    $('[data-vadd]').addEventListener('click', () => {
      const tr = tpl.content.firstElementChild.cloneNode(true);
      vbody.appendChild(tr);
      $$('[data-img1]', tr).forEach(bindImg1);
      $('input[name="v_name_en[]"]', tr).focus();
    });
    vbody.addEventListener('click', (e) => { if (e.target.closest('[data-vdel]')) e.target.closest('[data-vrow]').remove(); });
  }

  // Auto slug from English name on new items
  const slug = $('input[name=slug]'), nameEn = $('input[name=name_en]') || $('input[name=title_en]');
  if (slug && nameEn && !slug.value) {
    nameEn.addEventListener('input', () => { if (!slug.dataset.touched) slug.placeholder = nameEn.value.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); });
    slug.addEventListener('input', () => (slug.dataset.touched = 1));
  }

  // Colour text <-> picker
  $$('.color-f').forEach((w) => {
    const pick = $('input[type=color]', w), txt = $('[data-color-text]', w);
    pick.addEventListener('input', () => (txt.value = pick.value));
    txt.addEventListener('input', () => { if (/^#[0-9a-f]{6}$/i.test(txt.value)) pick.value = txt.value; });
  });

  // Confirm destructive actions
  document.addEventListener('submit', (e) => { const m = e.target.dataset.confirm; if (m && !confirm(m)) e.preventDefault(); });

  // CSV import: read the file in the browser and post its text
  const csvForm = $('[data-csv]');
  csvForm?.addEventListener('submit', async (e) => {
    const f = $('input[type=file]', csvForm).files[0];
    if (!f) return;
    e.preventDefault();
    $('input[name=csv]', csvForm).value = await f.text();
    $('input[type=file]', csvForm).disabled = true;
    csvForm.submit();
  });

  // Orders + statistics filters: apply as soon as a dropdown changes; date boxes only for "Custom dates"
  $$('[data-autosubmit]').forEach((form) => {
    const period = $('[data-period]', form);
    const dates = $$('.custom-d', form);
    const sync = () => dates.forEach((l) => { const on = period.value === 'custom'; l.hidden = !on; $('input', l).disabled = !on; });
    form.addEventListener('change', (e) => {
      if (e.target === period) { sync(); if (period.value === 'custom') return $('input', dates[0])?.focus(); }
      if (e.target.type === 'date' && !dates.every((l) => $('input', l).value)) return; // wait for both dates
      if (e.target.name === 'q') return; // the search box submits with Enter / the button
      form.submit();
    });
  });

  document.documentElement.classList.add('js');
  const post = async (form) => {
    const r = await fetch(form.action, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', 'X-CSRF-Token': csrf }, body: new URLSearchParams(new FormData(form)) });
    return r.json().catch(() => ({ ok: false }));
  };

  // Products list: quick edit (price / sale / stock) saved without leaving the page
  $$('form[data-quick]').forEach((form) => {
    const row = form.closest('tr'), inputs = $$(`[form="${form.id}"]`);
    inputs.forEach((i) => i.addEventListener('input', () => { row.classList.add('dirty'); i.classList.remove('saved', 'bad'); }));
    inputs.forEach((i) => i.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); form.requestSubmit(); } }));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const j = await post(form);
      inputs.forEach((i) => i.classList.toggle(j.ok ? 'saved' : 'bad', true));
      if (j.ok) { row.classList.remove('dirty'); setTimeout(() => inputs.forEach((i) => i.classList.remove('saved')), 1500); } else alert(j.error || 'Error');
    });
  });
  // Show / hide toggle
  $$('form[data-toggle]').forEach((form) => form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const j = await post(form), b = $('button', form);
    if (j.ok) { b.classList.toggle('on', !!j.active); b.textContent = j.active ? b.dataset.on : b.dataset.off; }
  }));
  // Bulk actions: tick boxes, choose an action (extra field appears when needed)
  const bulk = $('form[data-bulk]');
  if (bulk) {
    const boxes = () => $$('input[name="ids[]"]'), act = $('[data-bulk-action]', bulk), count = $('[data-bulk-count]', bulk);
    const upd = () => { const n = boxes().filter((b) => b.checked).length; count.textContent = n ? `(${n})` : ''; };
    $('[data-checkall]', bulk).addEventListener('change', (e) => { boxes().forEach((b) => (b.checked = e.target.checked)); upd(); });
    document.addEventListener('change', (e) => { if (e.target.name === 'ids[]') upd(); });
    const opts = () => $$('.bulk-opt', bulk).forEach((o) => o.classList.toggle('on', o.dataset.for.split(' ').includes(act.value)));
    act.addEventListener('change', opts); opts();
    bulk.addEventListener('submit', (e) => {
      if (!boxes().some((b) => b.checked)) { e.preventDefault(); return alert(act.options[0].text); }
      if (act.value === 'delete' && !confirm(bulk.dataset.confirmDelete)) e.preventDefault();
    });
  }
  // Product form: live "customers save X%" hint
  const price = $('[data-price]'), sale = $('[data-sale]'), info = $('[data-sale-info]');
  if (price && sale && info) {
    const show = () => {
      const p = parseFloat(price.value), s = parseFloat(sale.value);
      info.classList.remove('bad'); info.textContent = '';
      if (!(p > 0) || !(s >= 0) || sale.value === '') return;
      if (s >= p) { info.classList.add('bad'); info.textContent = info.dataset.err; return; }
      info.textContent = info.dataset.tpl.replace('{pct}', Math.round((1 - s / p) * 100)).replace('{amount}', (Math.round((p - s) * 100) / 100).toString());
    };
    price.addEventListener('input', show); sale.addEventListener('input', show); show();
  }

  if (document.body.hasAttribute('data-autoprint')) setTimeout(() => print(), 400);
})();
