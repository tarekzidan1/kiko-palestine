'use strict';
// Minimal SMTP client (implicit TLS on 465, STARTTLS on 587/25, AUTH PLAIN). No dependencies.
const net = require('node:net');
const tls = require('node:tls');
const crypto = require('node:crypto');
const cfg = require('./config');
const { settings } = require('./db');

function smtpConfig() {
  const s = settings();
  if (cfg.SMTP_URL) {
    const u = new URL(cfg.SMTP_URL);
    const secure = u.protocol === 'smtps:';
    return { host: u.hostname, port: +u.port || (secure ? 465 : 587), secure, user: decodeURIComponent(u.username), pass: decodeURIComponent(u.password), from: s.smtp_from || decodeURIComponent(u.username) };
  }
  if (!s.smtp_host) return null;
  const port = +s.smtp_port || 465;
  return { host: s.smtp_host, port, secure: port === 465, user: s.smtp_user, pass: s.smtp_pass, from: s.smtp_from || s.smtp_user || s.email };
}

// Reads complete SMTP replies (handles multi-line "250-..." responses).
function reader(sock) {
  let buf = '', lines = [], waiting = null, error = null;
  const check = () => {
    if (!waiting) return;
    const i = lines.findIndex((l) => /^\d{3}(?: |$)/.test(l));
    if (i >= 0) { const res = lines.splice(0, i + 1); const w = waiting; waiting = null; w.resolve({ code: +res[i].slice(0, 3), text: res.join('\n') }); }
    else if (error) { const w = waiting; waiting = null; w.reject(error); }
  };
  const onData = (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { lines.push(buf.slice(0, i).replace(/\r$/, '')); buf = buf.slice(i + 1); } check(); };
  const onErr = (e) => { error = e || new Error('SMTP connection closed'); check(); };
  const onClose = () => onErr();
  sock.setEncoding('utf8');
  sock.on('data', onData); sock.on('error', onErr); sock.on('close', onClose);
  return {
    next: (ms = 20000) => new Promise((resolve, reject) => {
      const timer = setTimeout(() => { waiting = null; reject(new Error('SMTP timeout')); }, ms);
      waiting = { resolve: (v) => { clearTimeout(timer); resolve(v); }, reject: (e) => { clearTimeout(timer); reject(e); } };
      check();
    }),
    detach: () => { sock.off('data', onData); sock.off('error', onErr); sock.off('close', onClose); },
  };
}

const b64 = (s) => Buffer.from(String(s), 'utf8').toString('base64');
const wrap76 = (s) => s.replace(/.{1,76}/g, '$&\r\n').trimEnd();
const encHeader = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`);
const addrOnly = (s) => (String(s).match(/<([^>]+)>/) || [, String(s)])[1].trim();
const cleanHeader = (s) => String(s || '').replace(/[\r\n]+/g, ' ').trim(); // block header injection

function buildMessage({ from, fromName, to, subject, html, text, replyTo }) {
  const boundary = 'b' + crypto.randomBytes(12).toString('hex');
  const domain = addrOnly(from).split('@')[1] || 'localhost';
  const head = [
    `From: ${fromName ? `${encHeader(cleanHeader(fromName))} <${addrOnly(from)}>` : addrOnly(from)}`,
    `To: ${to.map(cleanHeader).join(', ')}`,
    `Subject: ${encHeader(cleanHeader(subject))}`,
    replyTo ? `Reply-To: ${cleanHeader(replyTo)}` : null,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomBytes(10).toString('hex')}@${domain}>`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ].filter(Boolean).join('\r\n');
  const part = (type, body) => `--${boundary}\r\nContent-Type: ${type}; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${wrap76(b64(body))}\r\n`;
  const plain = text || String(html).replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|tr|h\d|li)>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  return `${head}\r\n\r\n${part('text/plain', plain)}${part('text/html', html)}--${boundary}--`;
}

async function sendMail({ to, subject, html, text, replyTo }) {
  const c = smtpConfig();
  const rcpts = [].concat(to || []).map((x) => String(x).trim()).filter(Boolean);
  if (!c || !rcpts.length) { console.log(`[mail] not sent (SMTP not configured): "${subject}" → ${rcpts.join(', ')}`); return false; }
  const s = settings();
  let sock = await new Promise((resolve, reject) => {
    const so = c.secure ? tls.connect({ host: c.host, port: c.port, servername: c.host }) : net.connect({ host: c.host, port: c.port });
    so.once(c.secure ? 'secureConnect' : 'connect', () => resolve(so));
    so.once('error', reject);
    so.setTimeout(30000, () => so.destroy(new Error('SMTP socket timeout')));
  });
  let r = reader(sock);
  const cmd = async (line, ok) => {
    if (line != null) sock.write(line + '\r\n');
    const res = await r.next();
    if (!ok.includes(res.code)) throw new Error(`SMTP ${line ? line.split(' ')[0] : 'greeting'} failed: ${res.text}`);
    return res;
  };
  try {
    await cmd(null, [220]);
    let ehlo = await cmd('EHLO ' + (addrOnly(c.from).split('@')[1] || 'localhost'), [250]);
    if (!c.secure && /\bSTARTTLS\b/i.test(ehlo.text)) {
      await cmd('STARTTLS', [220]);
      r.detach();
      sock = await new Promise((resolve, reject) => { const t = tls.connect({ socket: sock, servername: c.host }, () => resolve(t)); t.once('error', reject); });
      r = reader(sock);
      ehlo = await cmd('EHLO ' + (addrOnly(c.from).split('@')[1] || 'localhost'), [250]);
    }
    if (c.user) await cmd('AUTH PLAIN ' + b64(`\0${c.user}\0${c.pass}`), [235]);
    await cmd(`MAIL FROM:<${addrOnly(c.from)}>`, [250]);
    for (const rc of rcpts) await cmd(`RCPT TO:<${addrOnly(rc)}>`, [250, 251]);
    await cmd('DATA', [354]);
    await cmd(buildMessage({ from: c.from, fromName: s.store_name_en, to: rcpts, subject, html, text, replyTo }) + '\r\n.', [250]);
    await cmd('QUIT', [221]).catch(() => {});
    return true;
  } finally {
    sock.end();
  }
}

module.exports = { sendMail, smtpConfig, buildMessage };
