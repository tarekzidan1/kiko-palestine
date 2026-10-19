'use strict';
// Notifications: customer/admin emails (bilingual) + optional Telegram alerts for new orders.
const { all, settings } = require('./db');
const { sendMail } = require('./mailer');
const { tr, loc } = require('./i18n');
const { esc } = require('./html');
const { money } = require('./util');
const cfg = require('./config');

const base = () => cfg.BASE_URL || '';
const sym = () => settings().currency_symbol;

function shell(lang, title, inner) {
  const s = settings();
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  const align = lang === 'ar' ? 'right' : 'left';
  return `<!doctype html><html lang="${lang}" dir="${dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(title)}</title></head>
<body style="margin:0;background:#f5f2ef;font-family:Tahoma,Arial,sans-serif;color:#151515">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f2ef;padding:24px 0"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:12px;overflow:hidden" dir="${dir}">
<tr><td style="background:#151515;color:#fff;padding:20px 28px;font-size:22px;letter-spacing:3px;text-align:center">${esc(loc(s, 'store_name', lang))}</td></tr>
<tr><td style="padding:28px;text-align:${align};font-size:15px;line-height:1.6">${inner}</td></tr>
<tr><td style="padding:18px 28px;background:#faf8f6;color:#777;font-size:12px;text-align:center">${esc(loc(s, 'store_name', lang))} · ${esc(s.phone || '')} · ${esc(s.email || '')}</td></tr>
</table></td></tr></table></body></html>`;
}

function orderTable(o, items, lang) {
  const t = (k, v) => tr(lang, k, v);
  const m = (n) => money(n, sym());
  const rows = items.map((it) => `<tr><td style="padding:8px 0;border-bottom:1px solid #eee">${esc(lang === 'ar' ? it.name_ar || it.name : it.name)}${it.variant ? `<br><small style="color:#777">${esc(lang === 'ar' ? it.variant_ar || it.variant : it.variant)}</small>` : ''}</td>
    <td style="padding:8px;border-bottom:1px solid #eee;text-align:center">×${it.qty}</td><td style="padding:8px 0;border-bottom:1px solid #eee;white-space:nowrap">${m(it.price * it.qty)}</td></tr>`).join('');
  const line = (label, val, bold) => `<tr><td colspan="2" style="padding:4px 0;${bold ? 'font-weight:bold' : 'color:#555'}">${esc(label)}</td><td style="padding:4px 0;white-space:nowrap;${bold ? 'font-weight:bold' : ''}">${val}</td></tr>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;margin:16px 0">${rows}
    ${line(t('cart.subtotal'), m(o.subtotal))}${o.discount ? line(t('cart.discount'), '-' + m(o.discount)) : ''}
    ${line(t('cart.shipping'), o.shipping ? m(o.shipping) : esc(t('co.free')))}${o.fee ? line(t('pay.cod_fee_label'), m(o.fee)) : ''}
    ${line(t('cart.total'), m(o.total), true)}</table>
    <p style="font-size:14px;color:#444"><b>${esc(t('order.delivery_to'))}:</b> ${esc(o.name)} — <span dir="ltr">${esc(o.phone)}</span><br>${esc(o.address)}, ${esc(o.city)} (${esc(o.zone_name || '')})<br>
    <b>${esc(t('order.payment'))}:</b> ${esc(t(o.payment_method === 'card' ? 'pay.card' : 'pay.cod'))} — ${esc(t('paystatus.' + o.payment_status))}</p>`;
}

const orderLink = (o) => (base() ? `${base()}/${o.lang}/order/${encodeURIComponent(o.number)}?t=${o.token}` : '');
const button = (href, label) => (href ? `<p style="text-align:center;margin:24px 0"><a href="${esc(href)}" style="background:#151515;color:#fff;text-decoration:none;padding:12px 26px;border-radius:30px;display:inline-block">${esc(label)}</a></p>` : '');

async function safe(fn) { try { return await fn(); } catch (e) { console.error('[notify]', e.message); return false; } }

async function telegram(text) {
  const s = settings();
  if (!s.telegram_token || !s.telegram_chat) return false;
  const r = await fetch(`https://api.telegram.org/bot${s.telegram_token}/sendMessage`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: s.telegram_chat, text, disable_web_page_preview: true }), signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) throw new Error('Telegram HTTP ' + r.status);
  return true;
}

async function orderPlaced(o) {
  const s = settings();
  const items = all('SELECT * FROM order_items WHERE order_id = ?', o.id);
  const L = o.lang || 'ar';
  const t = (k, v) => tr(L, k, v);
  const jobs = [];
  if (o.email) {
    jobs.push(safe(() => sendMail({
      to: o.email, subject: t('mail.order_subject', { n: o.number, store: loc(s, 'store_name', L) }),
      html: shell(L, t('order.thanks'), `<h2 style="margin:0 0 8px">${esc(t('order.thanks'))}</h2><p>${esc(t('mail.order_intro', { name: o.name, n: o.number }))}</p>${orderTable(o, items, L)}${button(orderLink(o), t('mail.view_order'))}`),
    })));
  }
  const adminTo = s.notify_email || s.email;
  const A = 'en';
  if (adminTo) {
    jobs.push(safe(() => sendMail({
      to: adminTo, replyTo: o.email || undefined, subject: `🛍 New order ${o.number} — ${money(o.total, sym())} (${o.payment_method.toUpperCase()})`,
      html: shell(A, 'New order', `<h2 style="margin:0 0 8px">New order ${esc(o.number)}</h2>${orderTable(o, items, A)}${o.notes ? `<p><b>Notes:</b> ${esc(o.notes)}</p>` : ''}${button(base() ? `${base()}/admin/orders/${o.id}` : '', 'Open in admin')}`),
    })));
  }
  jobs.push(safe(() => telegram(`🛍 New order ${o.number}\n${o.name} — ${o.phone}\n${o.city} · ${o.zone_name}\n${items.map((i) => `• ${i.qty}× ${i.name}${i.variant ? ' — ' + i.variant : ''}`).join('\n')}\nTotal: ${money(o.total, sym())} · ${o.payment_method.toUpperCase()}${o.notes ? '\nNotes: ' + o.notes : ''}`)));
  return Promise.all(jobs);
}

async function orderStatus(o, status) {
  if (!o.email || !['confirmed', 'shipped', 'delivered', 'cancelled'].includes(status)) return false;
  const L = o.lang || 'ar';
  const t = (k, v) => tr(L, k, v);
  const s = settings();
  return safe(() => sendMail({
    to: o.email, subject: t('mail.status_subject', { n: o.number, status: t('status.' + status), store: loc(s, 'store_name', L) }),
    html: shell(L, t('status.' + status), `<h2 style="margin:0 0 8px">${esc(t('mail.status_title', { status: t('status.' + status) }))}</h2><p>${esc(t('mail.status_' + status, { n: o.number }))}</p>${button(orderLink(o), t('mail.view_order'))}`),
  }));
}

async function paymentReceived(o) {
  return safe(() => telegram(`✅ Payment received for ${o.number}: ${money(o.total, sym())}`));
}

async function passwordReset(user, link, lang) {
  const t = (k, v) => tr(lang, k, v);
  return sendMail({ to: user.email, subject: t('mail.reset_subject'), html: shell(lang, t('mail.reset_subject'), `<p>${esc(t('mail.reset_text', { name: user.name }))}</p>${button(link, t('acc.new_password'))}<p style="color:#777;font-size:12px">${esc(t('mail.reset_ignore'))}</p>`) });
}

async function contactMessage(m) {
  const s = settings();
  const to = s.notify_email || s.email;
  const jobs = [safe(() => telegram(`✉️ New message from ${m.name} (${m.email}${m.phone ? ', ' + m.phone : ''}):\n${m.body}`))];
  if (to) jobs.push(safe(() => sendMail({ to, replyTo: m.email, subject: `✉️ Contact form: ${m.name}`, html: shell('en', 'Contact', `<p><b>${esc(m.name)}</b> — ${esc(m.email)} ${esc(m.phone || '')}</p><p style="white-space:pre-wrap">${esc(m.body)}</p>`) })));
  return Promise.all(jobs);
}

module.exports = { orderPlaced, orderStatus, paymentReceived, passwordReset, contactMessage, telegram };
