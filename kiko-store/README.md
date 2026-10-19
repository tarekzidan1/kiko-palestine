# Kiko Palestine — bilingual beauty store (Arabic / English)

A complete online shop for makeup, skincare and fragrance in Palestine: storefront, admin panel and database in one small Node.js app with **zero npm dependencies** (it uses Node's built-in SQLite).

- **Storefront (AR + EN, full RTL):** announcement bar, countdown offer bar, mega menu, hero slider, category circles, collection cards, beauty-services tiles, product carousels, shade swatches, cart drawer, wishlist, live search with suggestions, filters & sorting, product pages with galleries, guest checkout, order tracking, customer accounts, newsletter popup with a welcome code, WhatsApp button, cookie notice, SEO (sitemap, hreflang, JSON-LD).
- **Checkout for Palestine:** delivery zones (West Bank / Jerusalem / 48 areas) with their own fees and free-delivery thresholds, city suggestions, phone validation (accepts Arabic digits ٠-٩), **cash on delivery** and **card payments via PayTabs** (works in Palestine through MEPS).
- **Admin panel (AR + EN):** dashboard with sales chart & low-stock alerts, orders (status workflow, printable invoice, WhatsApp the customer, CSV export), products with shades/images/stock (CSV import/export, auto-resized photo uploads), categories, home-page banners & sections, discount codes, delivery zones, pages, customers, messages, subscribers, theme colours, settings and one-click database backup.
- **Notifications:** order confirmation & status emails (SMTP), new-order alerts to your email and optionally Telegram.
- **Security:** scrypt passwords, CSRF protection, rate limiting, strict security headers, sandboxed uploads, payments only confirmed server-to-server with PayTabs.

> The demo products, photos (generated illustrations) and texts are placeholders. Replace them with your own in the admin panel. Only use brand names, logos and product photos you have the rights to.

---

## 1. Run it on your computer (5 minutes)

1. Install **Node.js 24 LTS** (or any version ≥ 22.13) from <https://nodejs.org>.
2. Unzip `kiko-palestine-store.zip` into an empty folder and open a terminal in it (Windows: right-click the folder → *Open in Terminal*).
3. Create your settings file:
   - Windows: `copy .env.example .env`  ·  macOS/Linux: `cp .env.example .env`
   - Open `.env` and set `ADMIN_EMAIL` and `ADMIN_PASSWORD` (keep `BASE_URL=http://localhost:3000` for now).
4. Start the store: `npm start` — the first start loads the demo catalog automatically (set `DEMO_DATA=off` in `.env` to start empty).
5. The setup checklist is in `docs/store-setup-guide.pdf`.
6. Open <http://localhost:3000> (store) and <http://localhost:3000/admin> (admin).

No `npm install` is needed. Run `npm test` any time to run the 40 automated end-to-end checks (they use a throw-away database).

Useful commands: `npm run dev` (auto-restart while editing) · `npm run seed -- --reset` (wipe the catalog and reload the demo; orders and customers are kept) · `npm run check-i18n` (verify every text exists in Arabic and English).

## 2. Put it online

**Your hosting plan must support Node.js 22.13 or newer** (Node 24 recommended). A plain PHP/“HTML only” hosting plan cannot run this store. The app also needs to keep files between restarts: the `data/` folder (created automatically) holds the database and uploaded photos.

What happens on the first start: the database is created, the demo catalog is loaded once (set `DEMO_DATA=off` to start empty) and the admin account is created from `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

> **Updating later:** upload the new files over the old ones but **never delete or overwrite the `data/` folder** — it contains your products, orders and photos.

### Option A — cPanel hosting with “Setup Node.js App” (most shared hosts)

1. cPanel → **Setup Node.js App** → **Create Application**
   - Node.js version: **22.13+ or 24** · Application mode: **Production**
   - Application root: `kiko-palestine-store` · Application URL: your domain · Application startup file: `server.js`
2. cPanel → **File Manager** → open the `kiko-palestine-store` folder → **Upload** `kiko-palestine-store.zip` → right-click → **Extract** (the files must sit directly in that folder, next to `server.js`).
3. Back in Setup Node.js App → your app → **Environment variables** → add:
   `NODE_ENV=production`, `BASE_URL=https://yourdomain.ps`, `ADMIN_EMAIL=you@yourdomain.ps`, `ADMIN_PASSWORD=a-long-password` → **Save** → **Restart**.
   (No “Run NPM Install” needed — there are no packages to install.)
4. Open your domain. The admin panel is at `https://yourdomain.ps/admin`.

### Option B — a VPS (recommended for growth; e.g. Hetzner, DigitalOcean, any Linux server)

```bash
# on Ubuntu
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash - && sudo apt install -y nodejs nginx unzip
sudo mkdir -p /var/www/store && sudo chown $USER /var/www/store
unzip kiko-palestine-store.zip -d /var/www/store
cd /var/www/store && cp .env.example .env && nano .env               # NODE_ENV=production, BASE_URL=https://yourstore.ps, admin email/password
```

`/etc/systemd/system/store.service`:

```ini
[Unit]
Description=Store
After=network.target
[Service]
WorkingDirectory=/var/www/store
ExecStart=/usr/bin/node --disable-warning=ExperimentalWarning server.js
Restart=always
User=www-data
Environment=NODE_ENV=production
[Install]
WantedBy=multi-user.target
```

```bash
sudo chown -R www-data /var/www/store/data && sudo systemctl enable --now store
```

Nginx (`/etc/nginx/sites-available/store`, then link it into `sites-enabled`):

```nginx
server {
  server_name yourstore.ps www.yourstore.ps;
  client_max_body_size 20m;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

Then get a free HTTPS certificate: `sudo apt install certbot python3-certbot-nginx && sudo certbot --nginx`.

### Option C — Render / Railway

Create a Node web service with start command `npm start`, add a **persistent disk/volume mounted at the project’s `data` folder**, and set the environment variables from `.env.example` (`NODE_ENV=production`, `BASE_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`).

### Before you announce the shop
- [ ] Sign in to `/admin` with a strong password (`npm run reset-admin -- email "password"` changes it any time).
- [ ] Settings → Store: name, logo, phone, WhatsApp, address, social links.
- [ ] Settings → Theme colours.
- [ ] Delete or edit the demo products, banners and pages; review the template **privacy / terms** pages with a lawyer.
- [ ] Delivery zones and fees; discount codes.
- [ ] Email (SMTP) and/or Telegram notifications — use *Send test email* in Settings.
- [ ] `BASE_URL` set to your real https address.
- [ ] Back up `data/` regularly (Settings → *Download backup* gives a consistent copy of the database; also copy `data/uploads`).

## 3. Card payments with PayTabs

1. Open a merchant account with PayTabs (they operate in Palestine with MEPS). Ask which **region URL** and **currencies** your account uses.
2. In the PayTabs dashboard → Developers → Key management, copy your **Profile ID** and **Server Key**.
3. Admin → Settings → Payments: enable *Credit / debit card*, provider *PayTabs*, fill Profile ID, Server Key and region URL (e.g. `https://secure-jordan.paytabs.com`).
4. PayTabs does not list ₪ (ILS) as a charge currency, so set **Charge cards in** (e.g. `USD` or `JOD`) and the **exchange rate** (1 ₪ = ? USD). The customer pays the converted amount; the order keeps the ₪ total.
5. The return and callback URLs (`/pay/paytabs/return`, `/pay/paytabs/callback`) are sent automatically with each payment — `BASE_URL` must be your public https address.

How it stays safe: an order is marked *paid* only after the server asks PayTabs directly (`/payment/query`) and the amount and currency match. Unpaid card orders hold stock and are cancelled automatically after the time you choose (default 6 h); the customer can retry payment from the order page.

**Test mode:** choose provider *Test mode* to try the whole flow with a fake payment page (only works when `NODE_ENV` is not `production`). The admin dashboard warns you while it is on.

## 4. Email & Telegram notifications

- **SMTP:** Admin → Settings → Notifications (host, port 465 or 587, user, password, from-address) or `SMTP_URL` in `.env`. Gmail works with an *App password*; any hosting email works too.
- **Telegram:** create a bot with @BotFather, send it a message, put the bot token and your chat ID in Settings. You get every new order on your phone instantly.

## 5. Everyday use (admin)

| Task | Where |
|---|---|
| See & process new orders, print invoice, message the customer on WhatsApp | Orders |
| Add a product with shades (each shade: colour, name, SKU, stock, photo) | Products → New product |
| Import/export the whole catalog in Excel-compatible CSV | Products → Import CSV / CSV |
| Main menu & mega menu | Categories (top level = menu; empty categories hide automatically) |
| Hero slides, category circles, collection cards, services, promo banner | Banners |
| Home-page product rows (best sellers, a category, offers…) | Home sections |
| Top bar messages, countdown offer, welcome popup & code, site-wide % off | Settings → Marketing / Shop rules |
| Colours of the whole site | Settings → Theme colours |

Order statuses: *Received → Confirmed → Out for delivery → Delivered* (or *Cancelled*, which returns the items to stock). Tick “Email the customer” to notify them.

## 6. Project structure

```
server.js            entry point (routes, sessions, background jobs)
src/http.js          tiny web framework (routing, cookies, gzip, static files, security headers)
src/db.js            SQLite schema, helpers, settings
src/catalog.js       categories, pricing, product listing & search (Arabic-aware)
src/cart.js          cart, coupons, totals      src/orders.js   orders, stock, statuses
src/payments.js      PayTabs + test gateway      src/mailer.js   SMTP client   src/notify.js  emails/Telegram
src/routes/*.js      storefront, account, api, payment, admin routes
src/views/*.js       HTML templates (auto-escaped)   src/lang/{ar,en}.js   all texts
public/              CSS, JS, icons                  scripts/        seed, tests, i18n check
data/                database + uploaded images (created on first run — back it up)
```

## 7. Troubleshooting

- **“This app needs Node.js 22.13 or newer”** → install Node.js 24 LTS.
- **Port already in use** → change `PORT` in `.env`.
- **Emails not arriving** → Settings → *Send test email* shows the SMTP error; check port 465 vs 587 and the app password.
- **Forgot the admin password** → `npm run reset-admin -- you@yourstore.ps "a new long password"`.
- **Where is the first admin password?** It is the `ADMIN_PASSWORD` from `.env`; if you left it empty, a random one is printed once in the terminal on first start.
