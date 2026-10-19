'use strict';
// Customer accounts: register/login (email or phone), profile, password reset, order history.
const { one, all, run, insert } = require('../db');
const { HttpError } = require('../http');
const { hashPassword, verifyPassword, login, logout, requireUser } = require('../auth');
const { zones } = require('../cart');
const { orderItems, orderEvents } = require('../orders');
const cfg = require('../config');
const { isEmail, isPhone, normPhone, phoneTail, limited, token } = require('../util');
const notify = require('../notify');
const V = require('../views/account');
const S = require('../views/shop');

// Only allow local redirects after login
const safeNext = (ctx, n) => (typeof n === 'string' && /^\/(ar|en)\/[^/]/.test(n) && !n.startsWith('//') ? n : ctx.u('/account'));

module.exports = (app) => {
  app.get('/:lang/account/login', (ctx) => (ctx.user ? ctx.redirect(safeNext(ctx, ctx.query.next)) : V.auth(ctx, { next: ctx.query.next || '' })));

  app.post('/:lang/account/login', async (ctx) => {
    const { t } = ctx;
    const loginId = String(ctx.body.login || '').trim().slice(0, 120);
    const next = String(ctx.body.next || '');
    // limit per IP and per account (stops password guessing even from many IPs)
    if (limited('login:' + ctx.ip, 10, 900e3) || limited('login-id:' + loginId.toLowerCase(), 8, 900e3)) return V.auth(ctx, { login: { login: loginId }, error: t('err.too_many'), next });
    const tail9 = phoneTail(loginId); // 059.., +97059.. and 97259.. all match
    const candidates = isEmail(loginId) ? all('SELECT * FROM users WHERE email = ?', loginId.toLowerCase())
      : tail9.length === 9 ? all('SELECT * FROM users WHERE substr(phone, -9) = ? ORDER BY id DESC LIMIT 5', tail9) : [];
    const pw = String(ctx.body.password || '');
    let user = null;
    for (const c of candidates) if (await verifyPassword(pw, c.password)) { user = c; break; }
    if (!user) return V.auth(ctx, { login: { login: loginId }, error: t('acc.bad_login'), next });
    login(ctx, user);
    return ctx.redirect(safeNext(ctx, next));
  });

  app.post('/:lang/account/register', async (ctx) => {
    const { t } = ctx;
    const f = { name: String(ctx.body.name || '').trim().slice(0, 80), email: String(ctx.body.email || '').trim().toLowerCase().slice(0, 120), phone: normPhone(ctx.body.phone).slice(0, 20), newsletter: ctx.body.newsletter ? 1 : 0 };
    const pw = String(ctx.body.password || '');
    const next = String(ctx.body.next || '');
    const fail = (msg) => V.auth(ctx, { reg: f, regError: msg, next });
    if (limited('reg:' + ctx.ip, 10, 3600e3)) return fail(t('err.too_many'));
    if (f.name.length < 2) return fail(t('err.required'));
    if (!isEmail(f.email)) return fail(t('err.email'));
    if (!isPhone(f.phone)) return fail(t('err.phone'));
    if (pw.length < 8) return fail(t('acc.password_hint'));
    if (one('SELECT 1 FROM users WHERE email = ?', f.email)) return fail(t('acc.email_taken'));
    if (one('SELECT 1 FROM users WHERE substr(phone, -9) = ?', phoneTail(f.phone))) return fail(t('acc.phone_taken'));
    const id = insert('users', { ...f, password: await hashPassword(pw), lang: ctx.lang });
    if (f.newsletter) run('INSERT OR IGNORE INTO subscribers (email, lang) VALUES (?, ?)', f.email, ctx.lang);
    login(ctx, { id });
    return ctx.redirect(safeNext(ctx, next));
  });

  app.post('/:lang/account/logout', (ctx) => { logout(ctx); return ctx.redirect(ctx.u('/')); });

  app.get('/:lang/account', requireUser, (ctx) => V.dashboard(ctx, {
    tab: ['orders', 'profile', 'password'].includes(ctx.query.tab) ? ctx.query.tab : 'orders',
    orders: all('SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC LIMIT 100', ctx.user.id), zones: zones(),
    msg: ctx.query.saved ? ctx.t('common.saved') : null,
  }));

  app.post('/:lang/account/profile', requireUser, (ctx) => {
    const { t } = ctx;
    const f = { name: String(ctx.body.name || '').trim().slice(0, 80), email: String(ctx.body.email || '').trim().toLowerCase().slice(0, 120), phone: normPhone(ctx.body.phone).slice(0, 20),
      zone_id: +ctx.body.zone_id || null, city: String(ctx.body.city || '').trim().slice(0, 60), address: String(ctx.body.address || '').trim().slice(0, 200), newsletter: ctx.body.newsletter ? 1 : 0 };
    const err = f.name.length < 2 ? t('err.required') : !isEmail(f.email) ? t('err.email') : !isPhone(f.phone) ? t('err.phone')
      : one('SELECT 1 FROM users WHERE email = ? AND id <> ?', f.email, ctx.user.id) ? t('acc.email_taken')
        : one('SELECT 1 FROM users WHERE substr(phone, -9) = ? AND id <> ?', phoneTail(f.phone), ctx.user.id) ? t('acc.phone_taken') : null;
    if (err) return V.dashboard(ctx, { tab: 'profile', orders: [], zones: zones(), err });
    run('UPDATE users SET name = ?, email = ?, phone = ?, zone_id = ?, city = ?, address = ?, newsletter = ? WHERE id = ?', f.name, f.email, f.phone, f.zone_id, f.city, f.address, f.newsletter, ctx.user.id);
    if (f.newsletter) run('INSERT OR IGNORE INTO subscribers (email, lang) VALUES (?, ?)', f.email, ctx.lang);
    return ctx.redirect(ctx.u('/account?tab=profile&saved=1'));
  });

  app.post('/:lang/account/password', requireUser, async (ctx) => {
    const { t } = ctx;
    const u = one('SELECT password FROM users WHERE id = ?', ctx.user.id);
    const pw = String(ctx.body.password || '');
    const err = !(await verifyPassword(String(ctx.body.current || ''), u.password)) ? t('acc.bad_password') : pw.length < 8 ? t('acc.password_hint') : null;
    if (err) return V.dashboard(ctx, { tab: 'password', orders: [], zones: zones(), err });
    run('UPDATE users SET password = ? WHERE id = ?', await hashPassword(pw), ctx.user.id);
    run('DELETE FROM sessions WHERE user_id = ? AND id <> ?', ctx.user.id, ctx.session.id); // sign out other devices
    return ctx.redirect(ctx.u('/account?tab=password&saved=1'));
  });

  app.get('/:lang/account/orders/:number', requireUser, (ctx) => {
    const o = one('SELECT * FROM orders WHERE number = ? AND user_id = ?', ctx.params.number, ctx.user.id);
    if (!o) throw new HttpError(404);
    const canPay = o.payment_method === 'card' && o.payment_status !== 'paid' && o.status !== 'cancelled' && ctx.s.card_enabled === '1';
    return S.orderPage(ctx, o, orderItems(o.id), orderEvents(o.id), { canPay });
  });

  // ---------- password reset (needs SMTP configured) ----------
  app.get('/:lang/account/forgot', (ctx) => V.forgot(ctx));
  app.post('/:lang/account/forgot', async (ctx) => {
    const email = String(ctx.body.email || '').trim().toLowerCase().slice(0, 120);
    if (limited('forgot:' + ctx.ip, 5, 3600e3)) return V.forgot(ctx, { email, error: ctx.t('err.too_many') });
    const user = isEmail(email) && one('SELECT id, name, email FROM users WHERE email = ?', email);
    if (user && !limited('forgot-user:' + user.id, 3, 3600e3)) {
      if (!cfg.BASE_URL) console.error('[reset] BASE_URL is not set in .env — password reset email not sent (links are never built from request headers).');
      else {
        const tk = token(24);
        run('UPDATE users SET reset_token = ?, reset_expires = ? WHERE id = ?', tk, Date.now() + 3600e3, user.id);
        try { await notify.passwordReset(user, `${cfg.BASE_URL}/${ctx.lang}/account/reset/${tk}`, ctx.lang); } catch (e) { console.error('[mail]', e.message); }
      }
    }
    return V.forgot(ctx, { sent: true }); // same answer whether or not the email exists
  });
  const resetUser = (tk) => (tk && tk.length > 20 ? one('SELECT id FROM users WHERE reset_token = ? AND reset_expires > ?', tk, Date.now()) : null);
  app.get('/:lang/account/reset/:token', (ctx) => (resetUser(ctx.params.token) ? V.reset(ctx, { token: ctx.params.token }) : V.forgot(ctx, { error: ctx.t('acc.reset_invalid') })));
  app.post('/:lang/account/reset/:token', async (ctx) => {
    const u = resetUser(ctx.params.token);
    if (!u) return V.forgot(ctx, { error: ctx.t('acc.reset_invalid') });
    const pw = String(ctx.body.password || '');
    if (pw.length < 8) return V.reset(ctx, { token: ctx.params.token, error: ctx.t('acc.password_hint') });
    run('UPDATE users SET password = ?, reset_token = NULL, reset_expires = NULL WHERE id = ?', await hashPassword(pw), u.id);
    run('DELETE FROM sessions WHERE user_id = ?', u.id);
    return V.reset(ctx, { done: true });
  });
};
