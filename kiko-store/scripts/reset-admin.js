'use strict';
// Reset (or create) an admin login from the command line:
//   npm run reset-admin -- you@yourstore.ps "new long password"
const { one, run } = require('../src/db');
const { hashPassword } = require('../src/auth');

(async () => {
  const [email, password] = process.argv.slice(2);
  if (!email || !password || password.length < 8) {
    console.log('Usage: npm run reset-admin -- <email> "<password of 8+ characters>"');
    process.exit(1);
  }
  const hash = await hashPassword(password);
  const u = one('SELECT id FROM users WHERE email = ?', email.toLowerCase());
  if (u) run("UPDATE users SET password = ?, role = 'admin' WHERE id = ?", hash, u.id);
  else run("INSERT INTO users (name, email, password, role) VALUES ('Admin', ?, ?, 'admin')", email.toLowerCase(), hash);
  run('DELETE FROM sessions WHERE user_id = (SELECT id FROM users WHERE email = ?)', email.toLowerCase());
  console.log(`✔ Admin ${email} can now sign in at /admin with the new password.`);
})();
