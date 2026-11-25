# NEXORA ERP — Single-Server Production Deployment & Domain Configuration Guide

This guide explains how to deploy **NEXORA ERP** (React 19 + Vite 8 + Express 4.21 + PostgreSQL + JSON Store) on a single production server under one custom HTTPS domain (for example, `https://abcd.com`) with **zero hardcoded IP addresses or localhost URLs**.

> **Portability Guarantee:** To move Nexora to a different domain or server in the future, you only need to update `.env`, DNS records, SSL certificate, and your reverse proxy / cPanel domain settings — **no React or Express business logic changes are required**.

---

## 1. Single-Domain URL Architecture

All components run behind one HTTPS origin (`https://abcd.com`):

| Path | Handled By | Purpose |
| :--- | :--- | :--- |
| `https://abcd.com/` | Static `dist/` (or Express SPA fallback) | React 19 ERP Frontend |
| `https://abcd.com/admin` | React SPA route | ERP Administration Console |
| `https://abcd.com/security-center` | React SPA route | Enterprise Security & Backup Center |
| `https://abcd.com/api/*` | Reverse Proxy → `127.0.0.1:3001` | Express REST APIs |
| `https://abcd.com/api/health` | Express Public Health Probe | Uptime, PostgreSQL & JSON Store status (no secrets) |
| `https://abcd.com/api/health/admin` | Express Authenticated Admin Probe | Pool stats, latency, memory & storage metrics |
| `https://abcd.com/api/events` | Reverse Proxy (unbuffered) → Express | Authenticated Server-Sent Events (SSE) |
| `https://abcd.com/uploads/*` | Express Static (`nosniff`) | User avatars & approved uploads |

---

## 2. Domain & DNS Configuration

Configure your domain's DNS zone at your domain registrar (Cloudflare, GoDaddy, Namecheap, Route 53, or cPanel Zone Editor):

| Record Type | Host / Name | Value / Target | TTL |
| :--- | :--- | :--- | :--- |
| `A` | `@` (apex `abcd.com`) | `<YOUR_PRODUCTION_SERVER_IP>` | `300` (5 min) |
| `A` (or `CNAME`) | `www` (`www.abcd.com`) | `<YOUR_PRODUCTION_SERVER_IP>` (or `abcd.com.`) | `300` (5 min) |

> **Never put your server IP inside application code.** The server IP belongs exclusively in DNS records and hosting/firewall settings.

### Verify DNS Propagation
```bash
dig +short A abcd.com
dig +short A www.abcd.com
# Or with nslookup:
nslookup abcd.com
```
Wait until both records resolve to your production server IP before issuing SSL certificates.

---

## 3. SSL / TLS Certificate & HTTPS Redirects

### Option A: cPanel Shared Hosting (No Root Access Required)
1. Open **cPanel → SSL/TLS Status**.
2. Select `abcd.com` and `www.abcd.com` and click **Run AutoSSL** (provisions free Sectigo / Let's Encrypt certificates automatically).
3. Open **cPanel → Domains** and toggle **Force HTTPS Redirect** ON for `abcd.com`.
4. Ensure `HTTPS_ONLY=true` and `SECURE_COOKIES=true` in `.env`.

### Option B: Linux VPS with Nginx / Apache (Certbot / Let's Encrypt)
```bash
# Nginx
sudo certbot --nginx -d abcd.com -d www.abcd.com --redirect

# Apache
sudo certbot --apache -d abcd.com -d www.abcd.com --redirect

# Verify automatic renewal timer
sudo certbot renew --dry-run
```

---

## 4. Private Directory Layout & Filesystem Permissions

Keep sensitive data, logs, temp files, `.env`, and encrypted backups **strictly outside** `public_html/`, `dist/`, `public/`, and `uploads/`.

### Recommended cPanel Directory Structure
```text
/home/<cpanel_user>/
├── nexora/                     # Application source + built dist/ (chmod 750)
│   ├── .env                    # Production secrets (chmod 600 — NEVER commit)
│   ├── dist/                   # Built React frontend (`npm run build`)
│   └── deploy/cpanel/passenger_entry.mjs
├── nexora_data/                # Private persistent ERP data (chmod 700)
│   ├── database/               # JSON_STORE_PATH -> nexora_store.json
│   ├── uploads/                # UPLOADS_DIR (chmod 755 for avatar serving via Express)
│   ├── private_tmp/            # TEMP_DIR (chmod 700)
│   ├── private_logs/           # LOGS_DIR (chmod 700)
│   └── private_backups/        # DB_BACKUP_DIR (chmod 700)
└── public_html/                # Webroot (.htaccess / Passenger routing)
```

Create and lock permissions:
```bash
mkdir -p ~/nexora_data/{database,uploads/avatars,private_tmp,private_logs,private_backups}
chmod 700 ~/nexora_data ~/nexora_data/database ~/nexora_data/private_tmp ~/nexora_data/private_logs ~/nexora_data/private_backups
chmod 755 ~/nexora_data/uploads ~/nexora_data/uploads/avatars
```

---

## 5. Production Environment Setup (`.env`)

1. Copy `.env.production.example` to `.env`:
   ```bash
   cp .env.production.example .env
   chmod 600 .env
   ```
2. Generate **three separate cryptographic secrets** (never reuse `JWT_ACCESS_SECRET` for backups or audit signing):
   ```bash
   echo "JWT_ACCESS_SECRET=$(openssl rand -hex 32)"
   echo "AUDIT_SIGNING_KEY=$(openssl rand -hex 32)"
   echo "BACKUP_ENCRYPTION_KEY=$(openssl rand -hex 32)"
   echo "HARDWARE_DEVICE_TOKEN=$(openssl rand -hex 24)"
   ```
   Store a copy of `BACKUP_ENCRYPTION_KEY` in your offline password manager / vault — without it, encrypted backups cannot be decrypted!
3. Update domain, database credentials, SMTP settings, and storage paths in `.env`:
   - `APP_URL=https://abcd.com`
   - `FRONTEND_URL=https://abcd.com`
   - `BACKEND_URL=https://abcd.com`
   - `CORS_ORIGINS=https://abcd.com,https://www.abcd.com`
   - `SERVER_HOST=127.0.0.1`
   - `SERVER_PORT=3001` (or cPanel-assigned `PORT`)
   - `TRUST_PROXY=loopback` (use `1` if behind 1 reverse proxy hop; never blindly trust arbitrary proxies)
   - `HTTPS_ONLY=true`
   - `SECURE_COOKIES=true`

> **Startup Safety Guard:** In `NODE_ENV=production`, Nexora automatically refuses to boot if `APP_URL` contains `localhost`/`127.0.0.1`, if `CORS_ORIGINS` contains `*`, if `JWT_ACCESS_SECRET` or `BACKUP_ENCRYPTION_KEY` is missing/placeholder/reused, or if any private directory resides inside `public/`, `dist/`, or `uploads/`.

---

## 6. PostgreSQL Single-Server Setup & Migrations

1. Create the PostgreSQL database & dedicated least-privilege user (via **cPanel → PostgreSQL Databases** or `psql` on VPS):
   ```sql
   CREATE USER nexora_user WITH PASSWORD 'REPLACE_WITH_STRONG_PASSWORD';
   CREATE DATABASE nexora OWNER nexora_user;
   REVOKE ALL ON DATABASE nexora FROM PUBLIC;
   GRANT ALL PRIVILEGES ON DATABASE nexora TO nexora_user;
   ```
2. Ensure PostgreSQL listens **only on `127.0.0.1`** (`listen_addresses = 'localhost'` in `postgresql.conf`) and firewall port `5432` from public internet access.
3. Run the idempotent Enterprise Security SQL migration (preserves all existing ERP tables & records):
   ```bash
   psql "$DATABASE_URL" -f database/migrations/20261120_enterprise_security.sql
   ```
4. Configure pooling via `.env`:
   - `PG_POOL_MAX=20`
   - `PG_IDLE_TIMEOUT_MS=30000`
   - `PG_CONNECTION_TIMEOUT_MS=3000`
   - `PG_STATEMENT_TIMEOUT_MS=15000`
5. Preserve your existing `nexora_store.json`: copy it into your configured `JSON_STORE_PATH` (`chmod 600`). **Do not migrate or delete existing JSON Store records.**

---

## 7. Build & Deployment Instructions

### Step 1: Install Dependencies & Build Frontend
```bash
npm ci --include=dev
NODE_ENV=production VITE_API_BASE_URL=/api VITE_APP_NAME=Nexora VITE_APP_ENV=production npm run build
```
Verify `dist/index.html` and `dist/assets/` are generated cleanly (source maps are disabled in production).

### Step 2A: Deploy on cPanel Shared Hosting (Node.js Selector / Phusion Passenger — No Root Required)
1. Open **cPanel → Setup Node.js App** → **Create Application**:
   - **Node.js version:** `20.x` or `22.x`
   - **Application mode:** `Production`
   - **Application root:** `/home/<cpanel_user>/nexora`
   - **Application URL:** `abcd.com` (leave URI path blank for single-domain root)
   - **Application startup file:** `deploy/cpanel/passenger_entry.mjs`
2. Click **Create**, then click **Run NPM Install** (or run `npm ci --include=dev` inside the cPanel virtual environment SSH shell).
3. Copy the security/SSE directives from `deploy/cpanel/.htaccess` into `~/public_html/.htaccess` **without overwriting** the `DO NOT REMOVE. CLOUDLINUX PASSENGER CONFIGURATION` block that cPanel auto-generates.
4. Click **Restart** in cPanel Node.js App.

> **Why Passenger Works Cleanly:** Express serves `dist/` (with immutable `/assets/` caching and SPA fallback), `/api/*`, `/api/events` (SSE with `X-Accel-Buffering: no` and `no-gzip`), and `/uploads/*` through one single HTTPS domain without exposing any internal port publicly.

### Step 2B: Deploy on Single-Server VPS (Nginx or Apache + systemd)
1. Install the systemd service:
   ```bash
   sudo cp deploy/systemd/nexora.service /etc/systemd/system/nexora.service
   # Edit User/WorkingDirectory if different from /var/www/nexora
   sudo systemctl daemon-reload
   sudo systemctl enable --now nexora
   sudo systemctl status nexora
   ```
2. Install the reverse proxy config:
   - **Nginx:** Copy `deploy/nginx/nexora.conf` to `/etc/nginx/sites-available/nexora.conf`, replace `abcd.com` & paths, symlink into `sites-enabled/`, run `sudo nginx -t && sudo systemctl reload nginx`.
   - **Apache:** Copy `deploy/apache/nexora-vhost.conf` to `/etc/apache2/sites-available/nexora.conf`, enable `ssl proxy proxy_http rewrite headers`, run `sudo apache2ctl configtest && sudo systemctl reload apache2`.
3. Verify firewall allows ONLY ports `80` and `443` publicly (`3001` and `5432` stay strictly bound to `127.0.0.1`).

---

## 8. Daily cPanel Cron Jobs (Encrypted Backups & Retention)

In **cPanel → Cron Jobs**, configure the following schedules (adjust for server timezone if server clock is UTC; `Asia/Kolkata` 02:00 IST = `30 20 * * *` UTC, or prefix `TZ=Asia/Kolkata`):

1. **Daily Encrypted Dual-Storage Backup (PostgreSQL + JSON Store) — 02:00 IST:**
   ```cron
   0 2 * * * cd /home/CPANEL_USER/nexora && TZ=Asia/Kolkata /usr/bin/env npm run backup:database >> /home/CPANEL_USER/nexora_data/private_logs/cron-backup.log 2>&1
   ```
2. **Daily Backup Integrity Verification (SHA-256 + AES-256-GCM Decrypt Test) — 02:30 IST:**
   ```cron
   30 2 * * * cd /home/CPANEL_USER/nexora && TZ=Asia/Kolkata /usr/bin/env npm run backup:verify >> /home/CPANEL_USER/nexora_data/private_logs/cron-verify.log 2>&1
   ```
3. **Daily 30-Day Retention Cleanup — 03:00 IST:**
   ```cron
   0 3 * * * cd /home/CPANEL_USER/nexora && TZ=Asia/Kolkata /usr/bin/env npm run backup:cleanup >> /home/CPANEL_USER/nexora_data/private_logs/cron-cleanup.log 2>&1
   ```
4. **Weekly Audit Retention Cleanup (365-day default) — Sunday 03:30 IST:**
   ```cron
   30 3 * * 0 cd /home/CPANEL_USER/nexora && TZ=Asia/Kolkata /usr/bin/env npm run audit:cleanup >> /home/CPANEL_USER/nexora_data/private_logs/cron-audit.log 2>&1
   ```

> On cPanel Node.js Selector environments, replace `/usr/bin/env npm` with your Node virtual environment binary, e.g. `/home/CPANEL_USER/nodevenv/nexora/20/bin/npm`.

---

## 9. Health Monitoring & Post-Deployment Verification

Run these checks immediately after deployment:

```bash
# 1. Verify HTTPS redirect (must return 301 -> https://abcd.com/)
curl -I http://abcd.com/

# 2. Verify public health endpoint (must return HTTP 200, NO secrets/paths)
curl -sS https://abcd.com/api/health | jq .

# 3. Verify security headers (HSTS, CSP, X-Content-Type-Options, no X-Powered-By)
curl -I https://abcd.com/api/health

# 4. Verify SPA deep-link routing (/admin and /security-center return 200 HTML)
curl -I https://abcd.com/admin
curl -I https://abcd.com/security-center

# 5. Verify SSE endpoint rejects unauthenticated clients (401) and streams when authenticated
curl -i https://abcd.com/api/events
# With valid JWT:
curl -N -H "Authorization: Bearer <YOUR_JWT>" https://abcd.com/api/events

# 6. Verify private files are strictly blocked (must return 403 or 404)
curl -I https://abcd.com/.env
curl -I https://abcd.com/database/nexora_store.json
curl -I https://abcd.com/private_backups/

# 7. Verify encrypted backup & restore readiness
npm run backup:database
npm run backup:verify
```

---

## 10. Moving Nexora to Another Domain or Server

To migrate from `https://abcd.com` to `https://erp.newdomain.com`:
1. Provision DNS `A` + `www` records and SSL certificate for `erp.newdomain.com`.
2. Update `.env`:
   - `APP_URL=https://erp.newdomain.com`
   - `FRONTEND_URL=https://erp.newdomain.com`
   - `BACKEND_URL=https://erp.newdomain.com`
   - `CORS_ORIGINS=https://erp.newdomain.com,https://www.erp.newdomain.com`
   - `DATABASE_URL` & storage paths (if moving servers).
3. Update the domain name in cPanel Node.js App / Nginx / Apache config.
4. Restart the application (`systemctl restart nexora` or cPanel **Restart**).
5. **No frontend rebuild is needed** because `VITE_API_BASE_URL=/api` uses relative single-origin paths!
