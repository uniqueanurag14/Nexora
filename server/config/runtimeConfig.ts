import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

export type TrustProxySetting = boolean | number | string | string[];

export interface RuntimeConfig {
  appName: string;
  appCompany: string;
  appEnv: string;
  nodeEnv: string;
  isProduction: boolean;
  isTest: boolean;
  appTimezone: string;
  // Domain & Routing
  appUrl: string;
  frontendUrl: string;
  backendUrl: string;
  apiBaseUrl: string;
  // Server Binding
  serverHost: string;
  serverPort: number;
  // Proxy, HTTPS & Cookies
  trustProxy: TrustProxySetting;
  httpsOnly: boolean;
  secureCookies: boolean;
  cookieSameSite: 'lax' | 'strict' | 'none';
  requestBodyLimit: string;
  corsOrigins: string[];
  // PostgreSQL Connection & Pooling
  databaseUrl: string;
  pgPoolMax: number;
  pgIdleTimeoutMs: number;
  pgConnectionTimeoutMs: number;
  pgStatementTimeoutMs: number;
  pgSsl: boolean | { rejectUnauthorized: boolean };
  // Configurable Storage Directories
  jsonStorePath: string;
  uploadsDir: string;
  tempDir: string;
  logsDir: string;
  backupDir: string;
  backupOffsiteDir: string;
  // Diagnostics
  warnings: string[];
  errors: string[];
}

function parseBool(val: string | undefined, fallback: boolean): boolean {
  if (val === undefined || val === '') return fallback;
  const v = val.trim().toLowerCase();
  if (v === 'true' || v === '1' || v === 'yes') return true;
  if (v === 'false' || v === '0' || v === 'no') return false;
  return fallback;
}

function parseIntSafe(val: string | undefined, fallback: number, min = 1, max = 600000): number {
  const n = parseInt(String(val || '').trim(), 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function resolvePathSafe(raw: string | undefined, fallbackRel: string): string {
  const value = (raw || fallbackRel).trim();
  return path.isAbsolute(value) ? path.normalize(value) : path.resolve(process.cwd(), value);
}

/**
 * Parses TRUST_PROXY safely.
 * Never blindly trusts all proxies (`true`) in production unless explicitly forced;
 * prefers hop counts (`1`), `'loopback'`, or explicit trusted proxy IP/CIDR allowlists.
 */
export function parseTrustProxy(raw: string | undefined, isProduction: boolean): TrustProxySetting {
  if (raw === undefined || raw.trim() === '') {
    // On single-server reverse-proxy deployments (Apache/Nginx/cPanel), loopback is the safest default
    return isProduction ? 'loopback' : 'loopback';
  }
  const trimmed = raw.trim();
  const lower = trimmed.toLowerCase();
  if (lower === 'false' || lower === '0' || lower === 'off' || lower === 'none') {
    return false;
  }
  if (lower === 'true') {
    // Map legacy `TRUST_PROXY=true` safely to single-hop reverse proxy (`1`) rather than unbounded trust
    return 1;
  }
  if (/^\d+$/.test(trimmed)) {
    return Math.max(0, Math.min(5, parseInt(trimmed, 10)));
  }
  if (lower === 'loopback' || lower === 'linklocal' || lower === 'uniquelocal') {
    return lower;
  }
  const list = trimmed.split(',').map(s => s.trim()).filter(Boolean);
  return list.length === 1 ? list[0] : list;
}

function parsePgSsl(raw: string | undefined): boolean | { rejectUnauthorized: boolean } {
  const val = (raw || 'false').trim().toLowerCase();
  if (val === 'true' || val === 'require' || val === 'verify-full') {
    return { rejectUnauthorized: true };
  }
  if (val === 'no-verify' || val === 'allow-self-signed') {
    return { rejectUnauthorized: false };
  }
  return false;
}

function isInsideDir(candidatePath: string, parentDir: string): boolean {
  const resolvedCandidate = path.resolve(candidatePath);
  const resolvedParent = path.resolve(parentDir);
  return (
    resolvedCandidate === resolvedParent ||
    resolvedCandidate.startsWith(resolvedParent + path.sep)
  );
}

function normalizeUrl(raw: string | undefined, fallback: string): string {
  const v = (raw || fallback).trim().replace(/\/+$/, '');
  return v || fallback;
}

function buildRuntimeConfig(): RuntimeConfig {
  const warnings: string[] = [];
  const errors: string[] = [];

  const nodeEnv = (process.env.NODE_ENV || process.env.APP_ENV || 'development').trim().toLowerCase();
  const appEnv = (process.env.APP_ENV || nodeEnv || 'development').trim().toLowerCase();
  const isTest = nodeEnv === 'test' || process.env.NEXORA_TEST_IMPORT === 'true';
  const isProduction = !isTest && (nodeEnv === 'production' || appEnv === 'production');

  const serverPort = parseIntSafe(
    process.env.PORT || process.env.SERVER_PORT,
    3000,
    1,
    65535
  );
  const serverHost = (process.env.SERVER_HOST || (isProduction ? '127.0.0.1' : '0.0.0.0')).trim();

  const defaultDevUrl = `http://localhost:${serverPort}`;
  const appUrl = normalizeUrl(process.env.APP_URL, isProduction ? '' : defaultDevUrl);
  const frontendUrl = normalizeUrl(process.env.FRONTEND_URL || process.env.APP_URL, appUrl || defaultDevUrl);
  const backendUrl = normalizeUrl(process.env.BACKEND_URL || process.env.APP_URL, appUrl || defaultDevUrl);

  const rawApiBase = (process.env.API_BASE_URL || '/api').trim();
  const apiBaseUrl = rawApiBase === '/' ? '/api' : rawApiBase.replace(/\/+$/, '');

  const trustProxy = parseTrustProxy(process.env.TRUST_PROXY, isProduction);
  const httpsOnly = parseBool(process.env.HTTPS_ONLY, isProduction);
  const secureCookies = parseBool(process.env.SECURE_COOKIES, isProduction);

  const rawSameSite = (process.env.COOKIE_SAMESITE || 'lax').trim().toLowerCase();
  const cookieSameSite: 'lax' | 'strict' | 'none' =
    rawSameSite === 'strict' || rawSameSite === 'none' ? rawSameSite : 'lax';

  const requestBodyLimit = (process.env.REQUEST_BODY_LIMIT || '5mb').trim();

  // Support both CORS_ORIGINS (new standard) and CORS_ALLOWED_ORIGINS (legacy)
  const rawCors = (process.env.CORS_ORIGINS || process.env.CORS_ALLOWED_ORIGINS || '').trim();
  const defaultOrigins = Array.from(
    new Set(
      [
        appUrl,
        frontendUrl,
        backendUrl,
        ...(!isProduction ? [`http://localhost:${serverPort}`, `http://127.0.0.1:${serverPort}`, 'http://localhost:3000', 'http://127.0.0.1:3000'] : []),
      ].filter(Boolean)
    )
  );
  const corsOrigins = rawCors
    ? Array.from(new Set(rawCors.split(',').map(s => s.trim().replace(/\/+$/, '')).filter(Boolean)))
    : defaultOrigins;

  // Configurable runtime paths (database persistence is strictly PostgreSQL-only via DATABASE_URL)
  const jsonStorePath = '';
  const uploadsDir = resolvePathSafe(process.env.UPLOADS_DIR, './uploads');
  const tempDir = resolvePathSafe(process.env.TEMP_DIR, './private_tmp');
  const logsDir = resolvePathSafe(process.env.LOGS_DIR, './private_logs');
  const backupDir = resolvePathSafe(process.env.DB_BACKUP_DIR, './private_backups');
  const offsiteRaw = (process.env.DB_BACKUP_OFFSITE_DIR || '').trim();
  const backupOffsiteDir = offsiteRaw ? resolvePathSafe(offsiteRaw, '') : '';

  // Ensure sensitive paths NEVER reside inside publicly served directories
  const publicDir = path.resolve(process.cwd(), 'public');
  const distDir = path.resolve(process.cwd(), 'dist');
  const sensitivePaths: Array<{ name: string; target: string }> = [
    { name: 'DB_BACKUP_DIR', target: backupDir },
    { name: 'TEMP_DIR', target: tempDir },
    { name: 'LOGS_DIR', target: logsDir },
  ];
  for (const item of sensitivePaths) {
    if (
      isInsideDir(item.target, publicDir) ||
      isInsideDir(item.target, distDir) ||
      isInsideDir(item.target, uploadsDir)
    ) {
      errors.push(`${item.name} (${item.target}) must reside outside public/, dist/, and uploads/.`);
    }
  }

  // Strict production safety checks so dev settings cannot accidentally run in production
  if (isProduction) {
    if (!appUrl) {
      errors.push('APP_URL must be explicitly configured in production (e.g. https://abcd.com).');
    } else {
      if (/localhost|127\.0\.0\.1/i.test(appUrl)) {
        errors.push(`APP_URL (${appUrl}) must not point to localhost or 127.0.0.1 in production.`);
      }
      if (httpsOnly && !appUrl.startsWith('https://')) {
        errors.push(`APP_URL (${appUrl}) must use https:// when HTTPS_ONLY=true in production.`);
      }
    }

    if (frontendUrl && /localhost|127\.0\.0\.1/i.test(frontendUrl)) {
      errors.push(`FRONTEND_URL (${frontendUrl}) must not point to localhost in production.`);
    }

    if (corsOrigins.includes('*')) {
      errors.push('CORS_ORIGINS must never contain wildcard "*" in production.');
    }

    if (corsOrigins.length === 0) {
      errors.push('CORS_ORIGINS (or APP_URL) must be configured in production.');
    }

    const jwtSecret = (process.env.JWT_ACCESS_SECRET || '').trim();
    if (!jwtSecret || jwtSecret.length < 32 || /replace-with|change-me|example/i.test(jwtSecret)) {
      errors.push('JWT_ACCESS_SECRET must be a strong secret (32+ chars, non-placeholder) in production.');
    }

    const backupKey = (process.env.BACKUP_ENCRYPTION_KEY || '').trim();
    if (!backupKey || backupKey.length < 32 || /replace-with|change-me|example/i.test(backupKey)) {
      errors.push('BACKUP_ENCRYPTION_KEY must be a dedicated 32+ char secret in production.');
    } else if (jwtSecret && backupKey === jwtSecret) {
      errors.push('BACKUP_ENCRYPTION_KEY must NEVER equal JWT_ACCESS_SECRET.');
    }

    if (cookieSameSite === 'none' && !secureCookies) {
      errors.push('COOKIE_SAMESITE=none requires SECURE_COOKIES=true.');
    }
  } else {
    if (!process.env.DATABASE_URL) {
      warnings.push('DATABASE_URL is not configured; PostgreSQL endpoints require a live database connection and manual "npm run db:update".');
    }
  }

  return {
    appName: (process.env.APP_NAME || 'Nexora').trim(),
    appCompany: (process.env.APP_COMPANY || '').trim(),
    appEnv,
    nodeEnv,
    isProduction,
    isTest,
    appTimezone: (process.env.APP_TIMEZONE || 'Asia/Kolkata').trim(),
    appUrl: appUrl || defaultDevUrl,
    frontendUrl,
    backendUrl,
    apiBaseUrl,
    serverHost,
    serverPort,
    trustProxy,
    httpsOnly,
    secureCookies,
    cookieSameSite,
    requestBodyLimit,
    corsOrigins,
    databaseUrl: (process.env.DATABASE_URL || '').trim(),
    pgPoolMax: parseIntSafe(process.env.PG_POOL_MAX, 15, 2, 100),
    pgIdleTimeoutMs: parseIntSafe(process.env.PG_IDLE_TIMEOUT_MS, 30000, 5000, 300000),
    pgConnectionTimeoutMs: parseIntSafe(process.env.PG_CONNECTION_TIMEOUT_MS, 3000, 500, 30000),
    pgStatementTimeoutMs: parseIntSafe(process.env.PG_STATEMENT_TIMEOUT_MS, 15000, 1000, 120000),
    pgSsl: parsePgSsl(process.env.PG_SSL),
    jsonStorePath,
    uploadsDir,
    tempDir,
    logsDir,
    backupDir,
    backupOffsiteDir,
    warnings,
    errors,
  };
}

export let runtimeConfig: RuntimeConfig = buildRuntimeConfig();

export function reloadRuntimeConfig(): RuntimeConfig {
  runtimeConfig = buildRuntimeConfig();
  return runtimeConfig;
}

/**
 * Validates runtime environment on startup.
 * Throws in production if mandatory settings or security constraints are violated.
 */
export function validateRuntimeEnvironment(): {
  ok: boolean;
  errors: string[];
  warnings: string[];
} {
  const cfg = runtimeConfig;
  if (cfg.errors.length > 0) {
    const formatted = cfg.errors.map(e => `  - ${e}`).join('\n');
    if (cfg.isProduction || cfg.errors.some(e => e.includes('must reside outside'))) {
      throw new Error(`NEXORA STARTUP CONFIGURATION ERROR:\n${formatted}`);
    }
  }
  if (cfg.warnings.length > 0 && !cfg.isTest) {
    for (const w of cfg.warnings) {
      console.warn(`[Nexora Runtime Config] ${w}`);
    }
  }
  return { ok: cfg.errors.length === 0, errors: [...cfg.errors], warnings: [...cfg.warnings] };
}

/**
 * Ensures configured storage directories exist with appropriate filesystem permissions.
 * Private directories use 0o700 (owner rwx only).
 */
export function ensureStorageDirectories(): void {
  const privateDirs = [
    path.dirname(runtimeConfig.jsonStorePath),
    runtimeConfig.tempDir,
    runtimeConfig.logsDir,
    runtimeConfig.backupDir,
  ];
  for (const dir of privateDirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
    try {
      fs.chmodSync(dir, 0o700);
    } catch {
      // Ignore on filesystems that don't support POSIX chmod
    }
  }

  const publicUploadDirs = [runtimeConfig.uploadsDir, path.join(runtimeConfig.uploadsDir, 'avatars')];
  for (const dir of publicUploadDirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o755 });
    }
  }
}

/**
 * Standard cookie attributes for auth/refresh cookies, honoring SECURE_COOKIES.
 */
export function getAuthCookieOptions(maxAgeMs: number) {
  return {
    httpOnly: true,
    secure: runtimeConfig.secureCookies,
    sameSite: runtimeConfig.cookieSameSite,
    path: `${runtimeConfig.apiBaseUrl}/auth`,
    maxAge: maxAgeMs,
  };
}
