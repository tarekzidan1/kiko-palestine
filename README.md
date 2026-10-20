# Kiko Palestine — bilingual beauty store (Arabic / English)

A complete online shop for makeup, skincare and fragrance in Palestine: storefront, admin panel and database in one small Node.js app with **zero npm dependencies** (it uses Node's built-in SQLite).

- **Storefront (AR + EN, full RTL):** announcement bar, countdown offer bar, mega menu, hero slider, category circles, collection cards, product carousels, shade swatches, cart drawer, wishlist, live search with suggestions, filters & sorting, product pages with galleries, guest checkout, order tracking, customer accounts, newsletter popup with a welcome code, WhatsApp button, SEO (sitemap, hreflang, JSON-LD).
- **Checkout for Palestine:** delivery zones (West Bank / Jerusalem / 48 areas) with their own fees and free-delivery thresholds, phone validation (accepts Arabic digits ٠-٩), **cash on delivery** and **card payments via PayTabs**.
- **PDF invoices:** every order gets an invoice in the customer's language (Arabic right-to-left or English) with your logo, items, shades, totals, VAT and tax number. Customers download it from their order page and receive it attached to their confirmation email.
- **Admin panel (AR + EN):**
  - **Statistics** with dropdown filters (period, order status, payment method, payment status, delivery area): sales, orders, average order, items sold, customers, money collected, discounts, cancellation rate, comparison with the previous period, daily/monthly chart, best-selling products, categories, areas, top customers, coupons, busiest weekdays, CSV export.
  - **Orders:** status workflow, filters, PDF invoice (Arabic/English), print, email the invoice, WhatsApp the customer, CSV export.
  - **Products made easy:** change price / sale price / stock straight from the list, show/hide with one click, bulk actions (sale %, show/hide, labels, categories, delete), a guided 4-step product form with drag & drop photos, shades with their own stock and photo, CSV import/export.
  - Categories, home-page banners & sections, discount codes, delivery zones, pages, **users & admins**, messages, subscribers, theme colours, settings and one-click database backup.
- **Notifications:** order confirmations with the PDF invoice, status emails, new-order alerts to your email (with the invoice) and optionally Telegram.
- **Security:** scrypt passwords, CSRF protection, rate limiting, strict security headers, sandboxed uploads, payments confirmed server-to-server with PayTabs.

> The demo products, photos (generated illustrations) and texts are placeholders. Replace them with your own in the admin panel. Only use brand names, logos and product photos you have the rights to.

---

## 1. Run it on your computer (5 minutes)

1. Install **Node.js 24 LTS** (or any version ≥ 22.13) from <https://nodejs.org>.
2. Unzip `kiko-palestine-store.zip` into an empty folder and open a terminal in it (Windows: right-click the folder → *Open in Terminal*).
3. Create your settings file: Windows `copy .env.example .env` · macOS/Linux `cp .env.example .env` (keep `BASE_URL=http://localhost:3000` for now).
4. Start the store: `npm start` — the first start creates the database and loads the demo catalog (set `DEMO_DATA=off` in `.env` to start empty).
5. Open <http://localhost:3000> (store) and <http://localhost:3000/admin> (admin).

**Admin login:** `tarek@admin.com` / `tarek123`.
Change it after the first sign-in: **Admin → My account** (name, login email, new password). Until you do, the admin panel shows a reminder.

No `npm install` is needed. `npm test` runs 59 automated end-to-end checks on a throw-away database (orders, payments, invoices, emails, statistics, product tools, admin accounts…).

Useful commands: `npm run dev` (auto-restart while editing) · `npm run seed -- --reset` (wipe the catalog and reload the demo; orders and customers are kept) · `npm run check-i18n` (verify every text exists in Arabic and English) · `npm run reset-admin -- you@yourstore.ps "new long password"` (if you ever lose access).

## 2. Put it online

**Your hosting plan must support Node.js 22.13 or newer** (Node 24 recommended). A plain PHP/“HTML only” hosting plan cannot run this store. The app must keep files between restarts: the `data/` folder (created automatically) holds the database and uploaded photos.

First start on the server: the database is created, the demo catalog is loaded once, and the admin `tarek@admin.com` / `tarek123` is created (or the `ADMIN_EMAIL` / `ADMIN_PASSWORD` you set). **Change the login in Admin → My account right away.**

> **Updating later:** upload the new files over the old ones but **never delete or overwrite the `data/` folder** — it contains your products, orders and photos.

### Option A — cPanel hosting with “Setup Node.js App” (most shared hosts)

1. cPanel → **Setup Node.js App** → **Create Application**
   - Node.js version: **22.13+ or 24** · Application mode: **Production**
  - Application root: `kiko-palestine-store` · Application URL: your domain · Application startup file: `server.js`
2. cPanel → **File Manager** → open the `kiko-palestine-store` folder → **Upload** `kiko-palestine-store.zip` → right-click → **Extract** (the files must sit directly in that folder, next to `server.js`).
3. Setup Node.js App → your app → **Environment variables** → add `NODE_ENV=production` and `BASE_URL=https://yourdomain.ps` → **Save** → **Restart**. (No “Run NPM Install” needed — there are no packages.)
4. Open your domain. The admin panel is at `https://yourdomain.ps/admin`.

### Option B — a VPS (recommended for growth; e.g. Hetzner, DigitalOcean, any Linux server)

```bash
# on Ubuntu
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash - && sudo apt install -y nodejs nginx unzip
sudo mkdir -p /var/www/store && sudo chown $USER /var/www/store
unzip kiko-palestine-store.zip -d /var/www/store
cd /var/www/store && cp .env.example .env && nano .env               # NODE_ENV=production, BASE_URL=https://yourstore.ps
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
sudo mkdir -p /var/www/store/data && sudo chown -R www-data /var/www/store/data && sudo systemctl enable --now store
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

Create a Node web service with start command `npm start`, add a **persistent disk/volume mounted at the project’s `data` folder**, and set `NODE_ENV=production` and `BASE_URL`.

### Before you announce the shop
- [ ] Admin → **My account**: your own login email and a strong password (replaces `tarek@admin.com` / `tarek123`).
- [ ] Admin → **Users & admins**: add other staff as *Admin* (each with their own login); remove anyone who should no longer have access.
- [ ] Settings → Store: name, logo (PNG/JPG), phone, WhatsApp, address, social links · Settings → Theme colours.
- [ ] Settings → **Invoices**: legal/company name, tax ID, VAT %, note at the bottom (e.g. return policy).
- [ ] Settings → **Notifications**: your website mailbox (see section 4) → *Send test email*.
- [ ] Delete or edit the demo products, banners and pages; review the template **privacy / terms** pages with a lawyer.
- [ ] Delivery zones and fees; discount codes.
- [ ] `BASE_URL` set to your real https address.
- [ ] Back up `data/` regularly (Settings → *Download backup* gives a consistent copy of the database; also copy `data/uploads`).

## 3. Card payments (PayTabs) — ready to switch on

The payment gateway is already built in; you only need a merchant account.

1. Open a merchant account with PayTabs. Ask which **region URL** and **currencies** your account uses.
2. In the PayTabs dashboard → Developers → Key management, copy your **Profile ID** and **Server Key**.
3. Admin → Settings → Payments: enable *Credit / debit card*, provider *PayTabs*, fill Profile ID, Server Key and region URL (e.g. `https://secure-jordan.paytabs.com`).
4. If your account cannot charge ₪ (ILS), set **Charge cards in** (e.g. `USD` or `JOD`) and the **exchange rate** (1 ₪ = ? USD). The customer pays the converted amount; the order keeps the ₪ total.
5. The return and callback URLs (`/pay/paytabs/return`, `/pay/paytabs/callback`) are sent automatically with each payment — `BASE_URL` must be your public https address.

How it stays safe: an order is marked *paid* only after the server asks PayTabs directly (`/payment/query`) and the amount and currency match. Unpaid card orders hold stock and are cancelled automatically after the time you choose (default 6 h); the customer can retry payment from the order page. When the payment is confirmed, the customer receives the confirmation email with the PDF invoice (exactly once).

**Test mode:** choose provider *Test mode* to try the whole flow with a fake payment page (only works when `NODE_ENV` is not `production`). The dashboard warns you while it is on.

*Another gateway later?* All card-payment code is in `src/payments.js` (`start`, `confirm`) and `src/routes/pay.js` — a developer can add a second provider there without touching the rest of the shop.

## 4. Emails from your website's mailbox (+ Telegram)

Use the email address that comes with your hosting (e.g. `info@yourdomain.ps`):

1. cPanel → **Email Accounts** → *Create* `info@yourdomain.ps` (or use an existing one) → **Connect Devices** shows the outgoing (SMTP) server, usually `mail.yourdomain.ps`, port **465 (SSL)**.
2. Admin → Settings → **Notifications**: SMTP host `mail.yourdomain.ps`, port `465`, user `info@yourdomain.ps`, its password, *From address* `Kiko Palestine <info@yourdomain.ps>`, and *Send new-order emails to* (your own inbox).
3. Click **Send test email** (Settings → Backup & tests). Errors are shown on screen.
4. Ask your host to set up SPF/DKIM for the domain so emails don't land in spam (most cPanel hosts enable it by default).

Gmail also works (`smtp.gmail.com`, 465, with an *App password*). You can also put everything in `.env` as `SMTP_URL=smtps://info%40yourdomain.ps:password@mail.yourdomain.ps:465`.

What is sent automatically:

| When | Customer gets | You get |
|---|---|---|
| Cash-on-delivery order placed | Confirmation + **PDF invoice** | New-order email + invoice copy (+ Telegram) |
| Card order placed | — (waits for the payment) | New-order email (+ Telegram) |
| Card payment confirmed | “Payment received” + **PDF invoice (Paid)** | Payment email + invoice (+ Telegram) |
| You mark an order *paid* (tick “Email the customer a receipt”) | Receipt + invoice | — |
| Status changed with “Email the customer about this change” ticked | Status update | — |
| Order page → **Email invoice to customer** | The invoice again | — |

**Telegram:** create a bot with @BotFather, send it a message, put the bot token and your chat ID in Settings. You get every new order on your phone instantly.

## 5. PDF invoices

- Created automatically for every order, in the customer's language (Arabic right-to-left or English).
- Customers: *Download invoice (PDF)* on their order page (also from their account).
- Admin → order: **Invoice PDF (عربي)**, **Invoice PDF (English)**, *Print*, **Email invoice to customer**.
- Settings → **Invoices**: invoice title, legal/company name, tax ID / licensed dealer number, VAT % included in your prices (0 = not shown), a note at the bottom (e.g. return policy), and whether to attach the invoice to emails.
- Your logo is printed on invoices when it is a PNG or JPG (Settings → Store → Logo).
- Invoice number = order number (e.g. `KP-1001`); the prefix is set in Settings → Shop rules.

## 6. Everyday use (admin)

| Task | Where |
|---|---|
| Sales numbers for any period, filtered by status / payment / area; export to Excel | **Statistics** |
| Process new orders, invoices, WhatsApp the customer; filter by date, payment, area | Orders |
| Change prices, sale prices or stock quickly | Products → edit in the list → *Save* on that row |
| Put many products on sale, hide them, add them to a category | Products → tick them → *With the selected products…* → Apply |
| Add a product (name → photos → price & stock → category → Save) | Products → New product |
| Import/export the whole catalog in Excel-compatible CSV | Products → Import CSV / CSV |
| Add or remove admins, edit or delete customers | Users & admins |
| Change your own login email and password | My account |
| Main menu & mega menu | Categories (top level = menu; empty categories hide automatically) |
| Hero slides, category circles, collection cards, promo banner | Banners |
| Home-page product rows (best sellers, a category, offers…) | Home sections |
| Top bar messages, countdown offer, welcome popup & code, site-wide % off | Settings → Marketing / Shop rules |
| Colours of the whole site | Settings → Theme colours |

Order statuses: *Received → Confirmed → Out for delivery → Delivered* (or *Cancelled*, which returns the items to stock). Tick “Email the customer about this change” to notify them.

## 7. Project structure

```
server.js            entry point (routes, sessions, background jobs)
src/http.js          tiny web framework (routing, cookies, gzip, static files, security headers)
src/db.js            SQLite schema, helpers, settings
src/catalog.js       categories, pricing, product listing & search (Arabic-aware)
src/cart.js          cart, coupons, totals        src/orders.js    orders, stock, statuses
src/payments.js      PayTabs + test gateway        src/mailer.js    SMTP client (attachments)
src/notify.js        emails / Telegram             src/stats.js     statistics & filters
src/pdf.js           PDF writer (Arabic shaping, right-to-left, embedded fonts, logo)
src/invoice.js       the invoice layout            fonts/           DejaVu fonts used in invoices (free licence)
src/routes/*.js      storefront, account, api, payment, admin routes
src/views/*.js       HTML templates (auto-escaped)   src/lang/{ar,en}.js   all texts
public/              CSS, JS, icons                  scripts/        seed, tests, i18n check, reset-admin
docs/                setup guide (PDF)
data/                database + uploaded images (created on first run — back it up)
```

## 8. Troubleshooting

- **“This app needs Node.js 22.13 or newer”** → install Node.js 24 LTS.
- **Port already in use** → change `PORT` in `.env`.
- **Emails not arriving** → Settings → *Send test email* shows the SMTP error; check port 465 vs 587 and the mailbox password. The store refuses to send your password over an unencrypted connection.
- **Logo missing on invoices** → upload the logo as PNG or JPG.
- **Locked out of the admin** → `npm run reset-admin -- you@yourstore.ps "a new long password"`.
- **Where is the first admin login?** `tarek@admin.com` / `tarek123` (or `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `.env` if you changed them before the first start). It is also printed in the server log on the first start.
