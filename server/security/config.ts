import crypto from 'crypto';
import path from 'path';
import dotenv from 'dotenv';
import {
  runtimeConfig,
  reloadRuntimeConfig,
  TrustProxySetting,
} from '../config/runtimeConfig';

dotenv.config();

export interface SecurityConfig {
  nodeEnv: string;
  isProduction: boolean;
  appName: string;
  appCompany: string;
  appTimezone: string;
  appUrl: string;
  frontendUrl: string;
  backendUrl: string;
  corsAllowedOrigins: string[];
  trustProxy: TrustProxySetting;
  httpsOnly: boolean;
  secureCookies: boolean;
  // Authentication & Lockout
  maxLoginAttempts: number;
  loginLockoutMinutes: number;
  sessionIdleTimeoutMinutes: number;
  refreshTokenExpiryDays: number;
  requireAdminMfa: boolean;
  // Audit Logging
  auditLogEnabled: boolean;
  auditLogRetentionDays: number;
  auditSigningKey: string;
  auditMirrorPath: string;
  // Login & Device Tracking
  loginTrackingEnabled: boolean;
  deviceTrackingEnabled: boolean;
  verifiedAgentToken: string;
  // Alerting
  securityAlertEmail: string;
  alertCooldownMinutes: number;
  // Rate Limiting
  apiRateLimitWindowMs: number;
  apiRateLimitMax: number;
  authRateLimitWindowMs: number;
  authRateLimitMax: number;
  // Backups
  backupEnabled: boolean;
  backupSchedule: string;
  backupRetentionDays: number;
  backupDir: string;
  backupOffsiteDir: string;
  backupEncryptionKey: Buffer;
  backupEncryptionKeyConfigured: boolean;
  // Hardware IoT device endpoint authentication
  hardwareDeviceToken: string;
  // Startup warnings
  warnings: string[];
}

function parseBool(val: string | undefined, fallback: boolean): boolean {
  if (val === undefined || val === '') return fallback;
  return val.toLowerCase() === 'true' || val === '1';
}

function parseIntSafe(val: string | undefined, fallback: number, min = 1, max = 100000): number {
  const n = parseInt(String(val || ''), 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function deriveKeyMaterial(raw: string, context: string): Buffer {
  if (/^[0-9a-fA-F]{64}$/.test(raw.trim())) {
    return Buffer.from(raw.trim(), 'hex');
  }
  return crypto.createHash('sha256').update(`${context}:${raw}`).digest();
}

function buildSecurityConfig(): SecurityConfig {
  const rt = runtimeConfig;
  const warnings: string[] = [...rt.warnings];
  const nodeEnv = rt.nodeEnv;
  const isProduction = rt.isProduction;

  const appUrl = rt.appUrl;
  const jwtSecret = process.env.JWT_ACCESS_SECRET || '';
  if (!jwtSecret || jwtSecret.length < 32) {
    warnings.push('JWT_ACCESS_SECRET is missing or shorter than 32 characters.');
  }

  // Dedicated backup encryption key — NEVER reuse JWT_ACCESS_SECRET
  const rawBackupKey = (process.env.BACKUP_ENCRYPTION_KEY || '').trim();
  let backupEncryptionKeyConfigured = false;
  let backupEncryptionKey: Buffer;

  if (rawBackupKey && jwtSecret && rawBackupKey === jwtSecret) {
    warnings.push(
      'CRITICAL CONFIGURATION ERROR: BACKUP_ENCRYPTION_KEY must NEVER reuse JWT_ACCESS_SECRET. Falling back to isolated ephemeral derivation until fixed.'
    );
    if (isProduction) {
      throw new Error('SECURITY FATAL: BACKUP_ENCRYPTION_KEY cannot equal JWT_ACCESS_SECRET in production.');
    }
    backupEncryptionKey = deriveKeyMaterial(`isolated-dev-backup-${process.cwd()}-${process.pid}`, 'nexora-backup-aes256gcm');
  } else if (rawBackupKey.length >= 32) {
    backupEncryptionKeyConfigured = true;
    backupEncryptionKey = deriveKeyMaterial(rawBackupKey, 'nexora-backup-aes256gcm');
  } else {
    warnings.push(
      'BACKUP_ENCRYPTION_KEY is not set (min 32 chars recommended). Using deterministic local development key — set a dedicated BACKUP_ENCRYPTION_KEY in production .env.'
    );
    if (isProduction) {
      throw new Error('SECURITY FATAL: BACKUP_ENCRYPTION_KEY must be configured (32+ chars) in production.');
    }
    backupEncryptionKey = deriveKeyMaterial(`dev-local-nexora-backup-key-${path.resolve(process.cwd())}`, 'nexora-backup-aes256gcm');
  }

  // Dedicated audit HMAC signing key — stored externally from PostgreSQL
  const rawAuditKey = (process.env.AUDIT_SIGNING_KEY || '').trim();
  let auditSigningKey: string;
  if (rawAuditKey && jwtSecret && rawAuditKey === jwtSecret) {
    warnings.push('AUDIT_SIGNING_KEY should be separate from JWT_ACCESS_SECRET.');
  }
  if (rawAuditKey.length >= 24) {
    auditSigningKey = rawAuditKey;
  } else {
    warnings.push('AUDIT_SIGNING_KEY is not configured; using isolated development HMAC key.');
    auditSigningKey = crypto
      .createHash('sha256')
      .update(`dev-local-nexora-audit-hmac:${path.resolve(process.cwd())}`)
      .digest('hex');
  }

  const backupDir = rt.backupDir;
  const publicDir = path.resolve(process.cwd(), 'public');
  const distDir = path.resolve(process.cwd(), 'dist');
  const uploadsDir = rt.uploadsDir;
  if (
    backupDir.startsWith(publicDir) ||
    backupDir.startsWith(distDir) ||
    backupDir.startsWith(uploadsDir)
  ) {
    throw new Error('SECURITY FATAL: DB_BACKUP_DIR must be outside public/, dist/, and uploads/ directories.');
  }

  return {
    nodeEnv,
    isProduction,
    appName: rt.appName,
    appCompany: rt.appCompany,
    appTimezone: rt.appTimezone,
    appUrl,
    frontendUrl: rt.frontendUrl,
    backendUrl: rt.backendUrl,
    corsAllowedOrigins: rt.corsOrigins,
    trustProxy: rt.trustProxy,
    httpsOnly: rt.httpsOnly,
    secureCookies: rt.secureCookies,
    maxLoginAttempts: parseIntSafe(process.env.MAX_LOGIN_ATTEMPTS, 5, 3, 25),
    loginLockoutMinutes: parseIntSafe(process.env.LOGIN_LOCKOUT_MINUTES, 15, 1, 1440),
    sessionIdleTimeoutMinutes: parseIntSafe(process.env.SESSION_IDLE_TIMEOUT_MINUTES, 60, 5, 1440),
    refreshTokenExpiryDays: parseIntSafe(process.env.REFRESH_TOKEN_EXPIRY_DAYS, 7, 1, 90),
    requireAdminMfa: parseBool(process.env.REQUIRE_ADMIN_MFA, false),
    auditLogEnabled: parseBool(process.env.AUDIT_LOG_ENABLED, true),
    auditLogRetentionDays: parseIntSafe(process.env.AUDIT_LOG_RETENTION_DAYS, 365, 30, 3650),
    auditSigningKey,
    auditMirrorPath: path.join(backupDir, 'audit_mirror.ndjson'),
    loginTrackingEnabled: parseBool(process.env.LOGIN_TRACKING_ENABLED, true),
    deviceTrackingEnabled: parseBool(process.env.DEVICE_TRACKING_ENABLED, true),
    verifiedAgentToken: (process.env.VERIFIED_AGENT_TOKEN || '').trim(),
    securityAlertEmail: (process.env.SECURITY_ALERT_EMAIL || process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || '').trim(),
    alertCooldownMinutes: parseIntSafe(process.env.SECURITY_ALERT_COOLDOWN_MINUTES, 10, 1, 120),
    apiRateLimitWindowMs: parseIntSafe(process.env.API_RATE_LIMIT_WINDOW_MS, 60000, 1000, 3600000),
    apiRateLimitMax: parseIntSafe(process.env.API_RATE_LIMIT_MAX, 300, 20, 10000),
    authRateLimitWindowMs: parseIntSafe(process.env.AUTH_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000, 5000, 3600000),
    authRateLimitMax: parseIntSafe(process.env.AUTH_RATE_LIMIT_MAX, 20, 5, 200),
    backupEnabled: parseBool(process.env.DB_BACKUP_ENABLED, true),
    backupSchedule: (process.env.DB_BACKUP_SCHEDULE || '0 2 * * *').trim(),
    backupRetentionDays: parseIntSafe(process.env.DB_BACKUP_RETENTION_DAYS, 30, 1, 3650),
    backupDir,
    backupOffsiteDir: rt.backupOffsiteDir,
    backupEncryptionKey,
    backupEncryptionKeyConfigured,
    hardwareDeviceToken: (process.env.HARDWARE_DEVICE_TOKEN || '').trim(),
    warnings,
  };
}

export let securityConfig: SecurityConfig = buildSecurityConfig();

export function reloadSecurityConfig(): SecurityConfig {
  reloadRuntimeConfig();
  securityConfig = buildSecurityConfig();
  return securityConfig;
}

export function validateSecurityEnvironment(): { ok: boolean; warnings: string[] } {
  const cfg = securityConfig;
  if (cfg.warnings.length > 0 && process.env.NODE_ENV !== 'test') {
    for (const w of cfg.warnings) {
      console.warn(`[Nexora Security Config] ${w}`);
    }
  }
  return { ok: cfg.warnings.length === 0, warnings: [...cfg.warnings] };
}
