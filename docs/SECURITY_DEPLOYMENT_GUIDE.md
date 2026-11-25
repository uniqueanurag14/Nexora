# NEXORA ERP — Enterprise Security, Audit Logging & Dual-Storage Backup Deployment Guide

**Client:** FunZoo Toys, Jewar, Uttar Pradesh  
**Timezone:** `Asia/Kolkata` (IST) · **Currency:** `INR`  
**Stack:** React 19 · TypeScript 5.7 · Vite 8 · Tailwind CSS 4 · Node.js + Express 4.21 · PostgreSQL + JSON Store · JWT + bcryptjs · Nodemailer + SMTP · Shared Hosting / cPanel

---

## 1. Architecture Summary & Security Improvements Implemented

### Critical Vulnerabilities Remediated in Existing Codebase
1. **SQL Injection in Workforce Performance Reports (`server/performanceRoutes.ts`)**:
   - Replaced raw string interpolation of `start_date`, `end_date`, and `filterEmp` in `/api/performance/reports` and `/api/performance/reports/export` with strict calendar date validation (`YYYY-MM-DD`) and 100% `$1/$2` parameterized PostgreSQL queries.
2. **Unauthenticated Performance API & Wildcard SSE Stream (`server.ts`, `server/performanceRoutes.ts`)**:
   - Moved `/api/performance` behind `authenticateToken` + RBAC permission checks while preserving timing-safe hardware device authentication on `/api/performance/events/hardware`.
   - Secured `/api/performance/events/stream` SSE stream with JWT verification + session revocation checks and removed `Access-Control-Allow-Origin: *` in favor of strict allowlisted origins.
3. **Missing RBAC on 20 Warehouse & Supplier Routes (`server.ts`)**:
   - Enforced `requirePermission('warehouses.view' | 'warehouses.create' | 'warehouses.edit' | 'warehouses.delete' | 'inventory.edit' | 'suppliers.view')` across all 18 `/api/warehouses/*` endpoints, `/api/inventory/reorders/:id/goods-receipt`, and `/api/suppliers/conversations`.
4. **Hardcoded Secret & Database Fallbacks (`server/authService.ts`, `server/db.ts`)**:
   - Removed hardcoded PostgreSQL credential fallback from `server/db.ts` and enforced startup failure in production if `JWT_ACCESS_SECRET` or `BACKUP_ENCRYPTION_KEY` is missing or reused.
5. **Defense-in-Depth Web Security (`server/security/middleware.ts`)**:
   - Added Content-Security-Policy, `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy`, `Permissions-Policy`, production HSTS, removed `X-Powered-By`, enforced CORS origin allowlist, added sliding-window API & auth rate limiters, SQLi probe telemetry, sensitive field redaction, and safe production error masking.

### New Enterprise Capabilities Added
- **Database Migration (`database/migrations/20261120_enterprise_security.sql`)**:
  - `user_login_history`, `user_device_history`, `user_sessions`, `user_activity_logs` (with PostgreSQL append-only mutation trigger), `security_events`, `database_backup_history`, `security_settings`, plus additive MFA columns on `users`.
- **Login, Honest Device Telemetry & Session Control**:
  - Distinguishes standard `browser_reported` telemetry (persistent random `X-Nexora-Device-Id` + parsed OS/Browser/DeviceType) from optional `verified_agent` enterprise desktop agents (`X-Nexora-Agent-Token` + `X-Nexora-Machine-Name`). Never fabricates hostnames or MAC addresses.
  - Supports refresh token rotation with automatic compromise/reuse detection, immediate server-side session revocation, forced logout on password reset/change, device blocking, and optional RFC 6238 TOTP 2FA for Administrators.
- **Centralized Tamper-Evident Audit Service (`server/security/auditService.ts`)**:
  - SHA-256 hash chaining + HMAC-SHA256 signing using external `AUDIT_SIGNING_KEY` (stored outside PostgreSQL), independent append-only NDJSON mirror (`private_backups/audit_mirror.ndjson`), automatic deep redaction of passwords/JWTs/SMTP credentials/keys, and one-click integrity verification.
- **Encrypted Dual-Storage Backup & Controlled Restoration (`server/security/backupService.ts`)**:
  - Protects **both** PostgreSQL (`pg_dump -Fc` when available, or pure-Node `pg` logical dump fallback on restricted cPanel environments) **and** the core ERP JSON Store (`database/nexora_store.json`) via atomic snapshot.
  - Compresses with gzip and encrypts using **AES-256-GCM** with dedicated external `BACKUP_ENCRYPTION_KEY` (strictly forbidden from reusing `JWT_ACCESS_SECRET`).
  - Stores artifacts outside public webroot (`DB_BACKUP_DIR=./private_backups`, mode `0700`/`0600`) with SHA-256 checksums, lock-file concurrency guard, optional offsite copy, and two-step verified restoration with automatic `pre_restore` safety snapshots.
- **Nexora Security Center Dashboard (`/security-center`)**:
  - Integrated directly into Nexora Settings navigation with 7 tabs: Overview, Login History, Devices, Active Sessions, Activity Logs (with redacted before/after diff viewer & XLSX export), Security Events, and Backups & Restore Manager.

---

## 2. Production `.env` Setup (Generate Dedicated Keys First)

Run on the server to generate independent 256-bit keys (never reuse one key across purposes):

```bash
node -e "console.log('JWT_ACCESS_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log('AUDIT_SIGNING_KEY=' + require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log('BACKUP_ENCRYPTION_KEY=' + require('crypto').randomBytes(32).toString('hex'))"
```

Configure in production `.env`:

```env
NODE_ENV=production
APP_ENV=production
APP_URL=https://erp.funzootoys.in
APP_TIMEZONE=Asia/Kolkata
CORS_ALLOWED_ORIGINS=https://erp.funzootoys.in
TRUST_PROXY=true

# Separate cryptographic secrets (NEVER store in PostgreSQL or backup files)
JWT_ACCESS_SECRET=<generated-64-char-hex-1>
AUDIT_SIGNING_KEY=<generated-64-char-hex-2>
BACKUP_ENCRYPTION_KEY=<generated-64-char-hex-3>

# Lockout & Session Policy
MAX_LOGIN_ATTEMPTS=5
LOGIN_LOCKOUT_MINUTES=15
SESSION_IDLE_TIMEOUT_MINUTES=60
REFRESH_TOKEN_EXPIRY_DAYS=7

# Security Alerts (uses existing SMTP settings)
SECURITY_ALERT_EMAIL=security@funzootoys.in
SECURITY_ALERT_COOLDOWN_MINUTES=10

# Encrypted Backup Settings (strictly outside public_html / dist / uploads)
DB_BACKUP_ENABLED=true
DB_BACKUP_SCHEDULE=0 2 * * *
DB_BACKUP_RETENTION_DAYS=30
DB_BACKUP_DIR=/home/<cpanel_user>/nexora_private_backups
DB_BACKUP_OFFSITE_DIR=/home/<cpanel_user>/nexora_offsite_sync
```

Ensure strict directory permissions on cPanel / Linux:

```bash
mkdir -p /home/<cpanel_user>/nexora_private_backups
chmod 700 /home/<cpanel_user>/nexora_private_backups
```

---

## 3. Applying the PostgreSQL Migration

```bash
psql "$DATABASE_URL" -f database/migrations/20261120_enterprise_security.sql
```

The migration is fully idempotent (`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`) and safe to run on a live database without dropping existing records.

---

## 4. Shared Hosting / cPanel Cron Job Configuration (`Asia/Kolkata`)

Because shared hosting Node.js workers may sleep or restart, schedule the official CLI scripts via **cPanel → Cron Jobs** (the lock-file guard ensures zero collision even if the in-process scheduler is active):

| Job | Schedule (IST) | Command |
|---|---|---|
| **Daily Encrypted Backup** | `0 2 * * *` (02:00 AM IST) | `TZ=Asia/Kolkata cd /home/<cpanel_user>/nexora && npm run backup:database >> /home/<cpanel_user>/nexora_private_backups/cron.log 2>&1` |
| **Daily Backup Integrity Verify** | `30 2 * * *` (02:30 AM IST) | `TZ=Asia/Kolkata cd /home/<cpanel_user>/nexora && npm run backup:verify >> /home/<cpanel_user>/nexora_private_backups/cron.log 2>&1` |
| **Daily Backup Retention Cleanup** | `0 3 * * *` (03:00 AM IST) | `TZ=Asia/Kolkata cd /home/<cpanel_user>/nexora && npm run backup:cleanup >> /home/<cpanel_user>/nexora_private_backups/cron.log 2>&1` |
| **Weekly Audit Log Retention** | `0 4 * * 0` (Sunday 04:00 AM IST) | `TZ=Asia/Kolkata cd /home/<cpanel_user>/nexora && npm run audit:cleanup >> /home/<cpanel_user>/nexora_private_backups/cron.log 2>&1` |

### Hosting Capability Check (`pg_dump` vs Fallback)
- If `pg_dump` and `pg_restore` binaries are available in PATH, Nexora automatically uses `pg_dump -Fc` (PostgreSQL custom binary archive format).
- If `pg_dump` is restricted or absent on shared hosting, Nexora automatically falls back to its pure-Node `pg` logical dump (`node_pg_logical`) and records the exact engine used in `database_backup_history` and the Security Center dashboard.

---

## 5. Remaining Security Risks & Shared Hosting Limitations

No web application is 100% immune to all threats. Please account for these operational boundaries:

1. **In-Memory Rate Limiting**: On single-worker shared hosting / cPanel Passenger, the sliding-window rate limiter protects effectively without Redis. If you later scale horizontally across multiple Node.js instances, move rate-limit counters to a shared store or upstream WAF (e.g., Cloudflare).
2. **Browser Telemetry vs. Physical Machine Identity**: Web browsers intentionally do not expose physical MAC addresses or OS computer hostnames. Without deploying an authorized desktop agent presenting `VERIFIED_AGENT_TOKEN`, Nexora honestly labels client identity as `browser_reported`.
3. **Shared Hosting Host-Level Isolation**: File permissions (`0700`/`0600`) protect backups from web visitors and other cPanel accounts, but a root-level compromise of the shared host can read `.env` keys and local backups. Always copy encrypted `.nxenc` backups to an external offsite destination (Google Drive, S3, or NAS) and store `BACKUP_ENCRYPTION_KEY` in a separate password manager.
4. **JSON Store Concurrency**: Core ERP data remains in `database/nexora_store.json` per requirement. Backups snapshot it atomically, and restoration swaps it via `renameSync`, but extremely high multi-process write concurrency would eventually benefit from migrating remaining store collections into PostgreSQL.
5. **TLS & Firewall Layer**: Ensure cPanel AutoSSL / HTTPS redirection is enforced at Apache/Nginx reverse proxy level so JWTs and refresh tokens never traverse plaintext HTTP.

---

## 6. Production Security Verification Checklist

- [ ] `NODE_ENV=production` and `APP_ENV=production` set in `.env`
- [ ] Unique 64-char hex keys set for `JWT_ACCESS_SECRET`, `AUDIT_SIGNING_KEY`, and `BACKUP_ENCRYPTION_KEY`
- [ ] `DB_BACKUP_DIR` located strictly outside `public_html` / `dist` / `uploads` with `chmod 700`
- [ ] `CORS_ALLOWED_ORIGINS` restricted strictly to production domain(s)
- [ ] PostgreSQL migration `20261120_enterprise_security.sql` applied cleanly
- [ ] HTTPS / TLS enabled via cPanel AutoSSL with valid certificate
- [ ] SMTP credentials tested and `SECURITY_ALERT_EMAIL` verified
- [ ] Super Admin TOTP 2FA enabled via Security Center → Overview and recovery codes stored offline
- [ ] `npm run backup:database` and `npm run backup:verify` tested manually via SSH/Terminal
- [ ] cPanel Cron Jobs configured for 02:00 / 02:30 / 03:00 IST
- [ ] `npm run test:security` passing 100%
