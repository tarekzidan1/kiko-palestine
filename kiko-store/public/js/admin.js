/* Admin helpers: image upload (auto-resized), product images & shades editors, CSV import, confirmations. */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const csrf = ($('meta[name="csrf-token"]') || {}).content || '';

  // Read a file, downscale big photos to max 1600px (webp/jpeg), return a data URL.
  function readImage(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onerror = reject;
      fr.onload = () => {
        const url = fr.result;
        if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return resolve(url); // keep svg/gif as-is
        const img = new Image();
        img.onload = () => {
          const max = 1600, scale = Math.min(1, max / Math.max(img.width, img.height));
          if (scale === 1 && file.size < 900e3) return resolve(url);
          const c = document.createElement('canvas');
          c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          const out = c.toDataURL('image/webp', 0.86);
          resolve(out.startsWith('data:image/webp') ? out : c.toDataURL('image/jpeg', 0.88));
        };
        img.onerror = () => resolve(url);
        img.src = url;
      };
      fr.readAsDataURL(file);
    });
  }
  async function upload(file) {
    const data = await readImage(file);
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
      try { hidden.value = await upload(file.files[0]); img.src = hidden.value; img.hidden = false; } catch (e) { alert(e.message); }
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
    file.addEventListener('change', async () => {
      gal.classList.add('uploading');
      for (const f of file.files) { try { imgs.push(await upload(f)); render(); } catch (e) { alert(e.message); } }
      gal.classList.remove('uploading'); file.value = '';
    });
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

  if (document.body.hasAttribute('data-autoprint')) setTimeout(() => print(), 400);
})();
