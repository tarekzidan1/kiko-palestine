'use strict';
// Customer account pages: login/register, password reset, dashboard.
const { html, raw } = require('../html');
const { layout, icon, crumbs, alert, csrfField, field } = require('./ui');
const { fmtDate } = require('../util');

function auth(ctx, { login = {}, reg = {}, error, regError, next = '' } = {}) {
  const { t, u } = ctx;
  const body = html`<div class="container auth">
  ${crumbs(ctx, [{ name: t('acc.title') }])}
  <div class="auth-grid">
    <section class="card-box form">
      <h1>${t('acc.login')}</h1><p class="muted">${t('acc.login_text')}</p>
      ${alert(error)}
      <form method="post" action="${u('/account/login')}">${csrfField(ctx)}<input type="hidden" name="next" value="${next}">
        ${field(t('acc.email_or_phone'), html`<input name="login" required autocomplete="username" dir="ltr" value="${login.login || ''}">`)}
        ${field(t('acc.password'), html`<input name="password" type="password" required autocomplete="current-password">`)}
        <button class="btn btn-dark btn-block">${t('acc.login')}</button>
      </form>
      <p class="small"><a href="${u('/account/forgot')}">${t('acc.forgot')}</a></p>
    </section>
    <section class="card-box form">
      <h2 class="h1">${t('acc.register')}</h2><p class="muted">${t('acc.register_text')}</p>
      ${alert(regError)}
      <form method="post" action="${u('/account/register')}">${csrfField(ctx)}<input type="hidden" name="next" value="${next}">
        ${field(t('co.name'), html`<input name="name" required maxlength="80" autocomplete="name" value="${reg.name || ''}">`)}
        <div class="row2">
          ${field(t('common.email'), html`<input name="email" type="email" required maxlength="120" autocomplete="email" dir="ltr" value="${reg.email || ''}">`)}
          ${field(t('co.phone'), html`<input name="phone" type="tel" required maxlength="20" autocomplete="tel" dir="ltr" value="${reg.phone || ''}">`)}
        </div>
        ${field(t('acc.password'), html`<input name="password" type="password" required minlength="8" autocomplete="new-password">`, t('acc.password_hint'))}
        <label class="check"><input type="checkbox" name="newsletter" value="1"${reg.newsletter ? raw(' checked') : ''}> ${t('acc.newsletter')}</label>
        <button class="btn btn-dark btn-block">${t('acc.create')}</button>
      </form>
    </section>
  </div></div>`;
  return layout(ctx, { title: t('acc.login'), body, noindex: true });
}

function forgot(ctx, { sent, error, email = '' } = {}) {
  const { t, u } = ctx;
  const body = html`<div class="container narrow auth">
  <section class="card-box form"><h1>${t('acc.forgot')}</h1>
    ${sent ? alert(t('acc.reset_sent'), 'ok') : html`<p class="muted">${t('acc.forgot_text')}</p>${alert(error)}
    <form method="post" action="${u('/account/forgot')}">${csrfField(ctx)}
      ${field(t('common.email'), html`<input name="email" type="email" required dir="ltr" value="${email}">`)}
      <button class="btn btn-dark btn-block">${t('acc.send_link')}</button></form>`}
    <p class="small"><a href="${u('/account/login')}">${t('acc.back_login')}</a></p>
  </section></div>`;
  return layout(ctx, { title: t('acc.forgot'), body, noindex: true });
}

function reset(ctx, { token, error, done } = {}) {
  const { t, u } = ctx;
  const body = html`<div class="container narrow auth"><section class="card-box form"><h1>${t('acc.new_password')}</h1>
    ${done ? html`${alert(t('acc.reset_done'), 'ok')}<a class="btn btn-dark" href="${u('/account/login')}">${t('acc.login')}</a>` : html`${alert(error)}
    <form method="post" action="${u('/account/reset/' + token)}">${csrfField(ctx)}
      ${field(t('acc.password'), html`<input name="password" type="password" required minlength="8" autocomplete="new-password">`, t('acc.password_hint'))}
      <button class="btn btn-dark btn-block">${t('common.save')}</button></form>`}
  </section></div>`;
  return layout(ctx, { title: t('acc.new_password'), body, noindex: true });
}

function dashboard(ctx, { orders, zones, tab = 'orders', msg, err }) {
  const { t, u, L, user } = ctx;
  const tabs = [['orders', 'acc.orders', 'box'], ['profile', 'acc.profile', 'user'], ['password', 'acc.password', 'shield']];
  const body = html`<div class="container account">
  ${crumbs(ctx, [{ name: t('acc.title') }])}
  <div class="acc-head"><h1>${t('acc.hello', { name: user.name.split(' ')[0] })}</h1>
    <form method="post" action="${u('/account/logout')}">${csrfField(ctx)}<button class="btn btn-ghost btn-sm">${icon('logout')} ${t('acc.logout')}</button></form></div>
  <div class="acc-grid">
    <nav class="acc-nav">${tabs.map(([k, l, ic]) => html`<a class="${tab === k ? 'on' : ''}" href="${u('/account')}?tab=${k}">${icon(ic)} ${t(l)}</a>`)}
      <a href="${u('/wishlist')}">${icon('heart')} ${t('nav.wishlist')}</a>
      ${user.role === 'admin' ? html`<a href="/admin">${icon('sparkle')} ${t('acc.admin')}</a>` : ''}</nav>
    <div class="acc-main">
      ${msg ? alert(msg, 'ok') : ''}${alert(err)}
      ${tab === 'orders' ? (orders.length ? html`<div class="table-wrap"><table class="table">
        <thead><tr><th>${t('order.number')}</th><th>${t('order.date')}</th><th>${t('order.status')}</th><th>${t('cart.total')}</th><th></th></tr></thead>
        <tbody>${orders.map((o) => html`<tr><td dir="ltr">${o.number}</td><td dir="ltr">${fmtDate(o.created_at, false)}</td><td><span class="st st-${o.status}">${t('status.' + o.status)}</span></td><td>${ctx.money(o.total)}</td><td><a href="${u('/account/orders/' + o.number)}">${t('common.view')}</a></td></tr>`)}</tbody></table></div>`
    : html`<div class="empty">${icon('box')}<p>${t('acc.no_orders')}</p><a class="btn btn-dark" href="${u('/')}">${t('common.continue')}</a></div>`) : ''}
      ${tab === 'profile' ? html`<form class="card-box form" method="post" action="${u('/account/profile')}">${csrfField(ctx)}
        <div class="row2">${field(t('co.name'), html`<input name="name" required maxlength="80" value="${user.name}">`)}${field(t('co.phone'), html`<input name="phone" type="tel" required dir="ltr" maxlength="20" value="${user.phone || ''}">`)}</div>
        ${field(t('common.email'), html`<input name="email" type="email" required dir="ltr" maxlength="120" value="${user.email || ''}">`)}
        <div class="row2">${field(t('co.zone'), html`<select name="zone_id"><option value="">—</option>${zones.map((z) => html`<option value="${z.id}"${user.zone_id === z.id ? raw(' selected') : ''}>${L(z, 'name')}</option>`)}</select>`)}
        ${field(t('co.city'), html`<input name="city" maxlength="60" value="${user.city || ''}">`)}</div>
        ${field(t('co.address'), html`<input name="address" maxlength="200" value="${user.address || ''}">`)}
        <label class="check"><input type="checkbox" name="newsletter" value="1"${user.newsletter ? raw(' checked') : ''}> ${t('acc.newsletter')}</label>
        <button class="btn btn-dark">${t('common.save')}</button></form>` : ''}
      ${tab === 'password' ? html`<form class="card-box form" method="post" action="${u('/account/password')}">${csrfField(ctx)}
        ${field(t('acc.current_password'), html`<input name="current" type="password" required autocomplete="current-password">`)}
        ${field(t('acc.new_password'), html`<input name="password" type="password" required minlength="8" autocomplete="new-password">`, t('acc.password_hint'))}
        <button class="btn btn-dark">${t('common.save')}</button></form>` : ''}
    </div>
  </div></div>`;
  return layout(ctx, { title: t('acc.title'), body, noindex: true });
}

module.exports = { auth, forgot, reset, dashboard };
