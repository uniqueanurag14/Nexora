/**
 * Nexora Centralized Frontend API & Runtime Configuration
 *
 * Reads ONLY public Vite environment variables (`VITE_*`).
 * Never contains secrets, hardcoded server IP addresses, or hardcoded localhost URLs.
 * Defaults to relative `/api` so a single production build works behind any custom domain
 * (e.g. https://abcd.com) without modifying React source code.
 */

const rawApiBase = (import.meta.env.VITE_API_BASE_URL || '/api').trim();
const normalizedApiBase =
  rawApiBase === '/'
    ? '/api'
    : rawApiBase.replace(/\/+$/, '');

export const apiConfig = {
  appName: (import.meta.env.VITE_APP_NAME || 'Nexora').trim(),
  appEnv: (import.meta.env.VITE_APP_ENV || import.meta.env.MODE || 'development').trim(),
  apiBaseUrl: normalizedApiBase,
  isProduction:
    (import.meta.env.VITE_APP_ENV || import.meta.env.MODE || '').toLowerCase() === 'production' ||
    Boolean(import.meta.env.PROD),
} as const;

/**
 * Builds an API endpoint URL using the centralized `VITE_API_BASE_URL`.
 * Example: buildApiUrl('/users') -> '/api/users'
 */
export function buildApiUrl(endpoint: string): string {
  const clean = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  if (clean === apiConfig.apiBaseUrl || clean.startsWith(`${apiConfig.apiBaseUrl}/`)) {
    return clean;
  }
  return `${apiConfig.apiBaseUrl}${clean}`;
}

/**
 * Builds an authenticated same-origin Server-Sent Events (SSE) URL.
 * Supports single-domain HTTPS deployments (e.g. https://abcd.com/api/events).
 */
export function buildSseUrl(endpoint: string, token?: string | null): string {
  const base = buildApiUrl(endpoint);
  if (!token) return base;
  const separator = base.includes('?') ? '&' : '?';
  return `${base}${separator}token=${encodeURIComponent(token)}`;
}

/**
 * Resolves uploaded or external media URLs safely on any domain.
 */
export function buildAssetUrl(assetPath?: string | null): string {
  if (!assetPath) return '';
  const trimmed = assetPath.trim();
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
    return trimmed;
  }
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}
