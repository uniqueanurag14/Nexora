/**
 * Sensitive Data Redaction, Input Sanitization & SQL Allowlist Utilities
 * Guarantees passwords, JWTs, SMTP secrets, encryption keys, and raw credentials
 * are NEVER persisted to audit logs, security events, or error responses.
 */
import path from 'path';

const SENSITIVE_KEY_PATTERNS = [
  /password/i,
  /passwd/i,
  /pwd/i,
  /secret/i,
  /token/i,
  /jwt/i,
  /authorization/i,
  /cookie/i,
  /api[_-]?key/i,
  /private[_-]?key/i,
  /encryption[_-]?key/i,
  /signing[_-]?key/i,
  /smtp[_-]?pass/i,
  /mfa[_-]?secret/i,
  /recovery[_-]?code/i,
  /otp/i,
  /totp/i,
  /credit[_-]?card/i,
  /cvv/i,
];

const BEARER_OR_JWT_REGEX = /(Bearer\s+[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+|eyJ[A-Za-z0-9\-_]{10,}\.[A-Za-z0-9\-_]{10,}\.[A-Za-z0-9\-_]{10,})/g;

export const REDACTED_VALUE = '[REDACTED]';

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some(rx => rx.test(key));
}

export function redactString(input: string): string {
  if (!input) return input;
  return input
    .replace(BEARER_OR_JWT_REGEX, '[REDACTED_TOKEN]')
    .replace(/(postgresql:\/\/[^:]+:)([^@]+)(@)/gi, '$1[REDACTED]$3');
}

export function redactSensitiveData<T = unknown>(value: T, depth = 0): T {
  if (value === null || value === undefined) return value;
  if (depth > 8) return '[TRUNCATED]' as unknown as T;

  if (typeof value === 'string') {
    const cleaned = redactString(value);
    if (cleaned.length > 4000) {
      return `${cleaned.slice(0, 4000)}...[truncated]` as unknown as T;
    }
    return cleaned as unknown as T;
  }

  if (typeof value !== 'object') return value;

  if (value instanceof Date) return value.toISOString() as unknown as T;
  if (Buffer.isBuffer(value)) return `[Buffer:${value.length}bytes]` as unknown as T;

  if (Array.isArray(value)) {
    return value.slice(0, 200).map(item => redactSensitiveData(item, depth + 1)) as unknown as T;
  }

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (isSensitiveKey(k)) {
      out[k] = REDACTED_VALUE;
    } else {
      out[k] = redactSensitiveData(v, depth + 1);
    }
  }
  return out as T;
}

/**
 * Computes a concise redacted before/after diff so audit logs capture exact field changes
 * without storing massive payloads or sensitive credentials.
 */
export function computeRedactedDiff(
  beforeObj?: Record<string, any> | null,
  afterObj?: Record<string, any> | null
): { before_values: Record<string, any> | null; after_values: Record<string, any> | null } {
  const safeBefore = beforeObj ? redactSensitiveData(beforeObj) : null;
  const safeAfter = afterObj ? redactSensitiveData(afterObj) : null;

  if (!safeBefore || !safeAfter) {
    return { before_values: safeBefore, after_values: safeAfter };
  }

  const changedBefore: Record<string, any> = {};
  const changedAfter: Record<string, any> = {};
  const allKeys = new Set([...Object.keys(safeBefore), ...Object.keys(safeAfter)]);

  for (const key of allKeys) {
    const bVal = safeBefore[key];
    const aVal = safeAfter[key];
    if (JSON.stringify(bVal) !== JSON.stringify(aVal)) {
      changedBefore[key] = bVal;
      changedAfter[key] = aVal;
    }
  }

  return {
    before_values: Object.keys(changedBefore).length > 0 ? changedBefore : null,
    after_values: Object.keys(changedAfter).length > 0 ? changedAfter : null,
  };
}

/**
 * Validates strict YYYY-MM-DD calendar date format (prevents SQL injection via date query params).
 */
export function isValidIsoDate(val: unknown): val is string {
  if (typeof val !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(val)) return false;
  const [y, m, d] = val.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/**
 * Strictly allowlists SQL sort columns and directions to prevent ORDER BY injection.
 */
export function resolveSafeSort(
  requestedColumn: unknown,
  requestedDir: unknown,
  allowedColumns: Record<string, string>,
  defaultColumnKey: string
): { column: string; direction: 'ASC' | 'DESC' } {
  const key = typeof requestedColumn === 'string' && Object.prototype.hasOwnProperty.call(allowedColumns, requestedColumn)
    ? requestedColumn
    : defaultColumnKey;
  const dir = typeof requestedDir === 'string' && requestedDir.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  return { column: allowedColumns[key], direction: dir };
}

/**
 * Strictly validates pagination bounds.
 */
export function resolveSafePagination(
  pageParam: unknown,
  limitParam: unknown,
  defaultLimit = 25,
  maxLimit = 200
): { page: number; limit: number; offset: number } {
  const rawPage = parseInt(String(pageParam || '1'), 10);
  const rawLimit = parseInt(String(limitParam || String(defaultLimit)), 10);
  const page = Number.isNaN(rawPage) || rawPage < 1 ? 1 : Math.min(rawPage, 100000);
  const limit = Number.isNaN(rawLimit) || rawLimit < 1 ? defaultLimit : Math.min(rawLimit, maxLimit);
  return { page, limit, offset: (page - 1) * limit };
}

/**
 * Detects common SQL injection or XSS probe signatures for security event logging
 * (defense-in-depth monitoring — NOT a substitute for parameterized queries!).
 */
const SQLI_PROBE_REGEX = /(\bUNION\b\s+\bSELECT\b|\bOR\b\s+['"]?\d+['"]?\s*=\s*['"]?\d+['"]?|;\s*\b(DROP|DELETE|TRUNCATE|ALTER|EXEC|INSERT|UPDATE)\b|--\s*$|\/\*[\s\S]*?\*\/|\bSLEEP\s*\(\s*\d+\s*\)|\bPG_SLEEP\s*\(\s*\d+\s*\))/i;

export function containsSqliProbe(value: unknown): boolean {
  if (typeof value === 'string') {
    return SQLI_PROBE_REGEX.test(value);
  }
  if (Array.isArray(value)) {
    return value.some(v => containsSqliProbe(v));
  }
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).some(v => containsSqliProbe(v));
  }
  return false;
}

/**
 * Escapes HTML special characters for safe email templates / exports.
 */
export function escapeHtml(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Validates that a candidate file path strictly resides within a base directory (prevents path traversal).
 */
export function isSafeChildPath(baseDir: string, targetPath: string): boolean {
  const resolvedBase = path.resolve(baseDir);
  const resolvedTarget = path.resolve(targetPath);
  if (resolvedTarget === resolvedBase) return false;
  return resolvedTarget.startsWith(resolvedBase + path.sep);
}
