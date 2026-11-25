import fs from 'fs';
import path from 'path';
import type { Request, Response, NextFunction } from 'express';
import { securityConfig } from './config';
import { runtimeConfig } from '../config/runtimeConfig';
import { extractClientIp, extractDeviceContext } from './deviceParser';
import { containsSqliProbe, redactSensitiveData } from './redaction';
import { securityMonitor } from './securityMonitor';
import { auditService } from './auditService';

// ============================================================================
// 0. HTTPS ENFORCEMENT & PRODUCTION REQUEST LOGGING
// ============================================================================
function isLoopbackIp(ip: string): boolean {
  const clean = ip.replace(/^::ffff:/, '');
  return clean === '127.0.0.1' || clean === '::1';
}

export function httpsEnforcementMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!runtimeConfig.httpsOnly) return next();

  // Allow local loopback health probes from reverse proxy / systemd / cPanel monitors
  const sockIp = String(req.socket?.remoteAddress || '');
  if (
    isLoopbackIp(sockIp) &&
    (req.path === '/api/health' || req.path === '/api/health/liveness' || req.path === '/api/health/readiness')
  ) {
    return next();
  }

  // Express calculates `req.secure` using TLS socket OR `X-Forwarded-Proto` ONLY when from a trusted proxy
  if (req.secure) {
    return next();
  }

  // Never trust an unvalidated Host header for redirects — always redirect to configured APP_URL origin
  if (req.method === 'GET' || req.method === 'HEAD') {
    try {
      const targetOrigin = new URL(runtimeConfig.appUrl).origin;
      const safePath = req.originalUrl.startsWith('/') ? req.originalUrl : '/';
      return res.redirect(301, `${targetOrigin}${safePath}`);
    } catch {
      return res.status(426).json({
        success: false,
        message: 'HTTPS is required to access this application.',
      });
    }
  }

  return res.status(426).json({
    success: false,
    message: 'HTTPS is required for API requests.',
  });
}

function sanitizeUrlForLogs(originalUrl: string): string {
  // Never leak JWT query tokens (e.g., SSE ?token=...) or reset tokens into access logs
  return originalUrl.replace(/([?&](?:token|access_token|refresh_token|password|key)=)[^&]+/gi, '$1[REDACTED]');
}

export function requestLoggingMiddleware(req: Request, res: Response, next: NextFunction) {
  if (runtimeConfig.isTest) return next();
  // Avoid noisy static asset logging in dev
  if (!runtimeConfig.isProduction && !req.path.startsWith('/api/')) return next();

  const startedAt = Date.now();
  res.on('finish', () => {
    const durationMs = Date.now() - startedAt;
    const ip = extractClientIp(req);
    const safeUrl = sanitizeUrlForLogs(req.originalUrl || req.path);
    const line = `${new Date().toISOString()} [HTTP] ${req.method} ${safeUrl} ${res.statusCode} ${durationMs}ms ip=${ip}`;

    if (res.statusCode >= 500) {
      console.error(line);
    } else if (runtimeConfig.isProduction || req.path.startsWith('/api/')) {
      console.log(line);
    }

    if (runtimeConfig.isProduction && runtimeConfig.logsDir) {
      try {
        const dayStamp = new Date().toISOString().slice(0, 10);
        const logFile = path.join(runtimeConfig.logsDir, `access-${dayStamp}.log`);
        fs.appendFile(logFile, `${line}\n`, { mode: 0o600 }, () => {});
      } catch {
        // Non-fatal logging safeguard
      }
    }
  });

  next();
}

// ============================================================================
// 1. SECURITY HEADERS & CSP MIDDLEWARE
// ============================================================================
export function securityHeadersMiddleware(req: Request, res: Response, next: NextFunction) {
  const isApiRoute = req.path.startsWith('/api/');
  res.removeHeader('X-Powered-By');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Enforce strict SAMEORIGIN framing in production and on all /api/* routes.
  // In development, allow embedded preview iframes (e.g. AI Studio preview) on HTML routes.
  if (securityConfig.isProduction || isApiRoute) {
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  }

  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  res.setHeader('X-Download-Options', 'noopen');

  // Content Security Policy compatible with Vite React dev & single-domain production builds
  const scriptSrc = securityConfig.isProduction
    ? "script-src 'self'"
    : "script-src 'self' 'unsafe-inline' 'unsafe-eval'";
  const connectSrc = securityConfig.isProduction
    ? "connect-src 'self'"
    : "connect-src 'self' ws: wss: https:";
  const frameAncestors = securityConfig.isProduction
    ? "frame-ancestors 'self'"
    : "frame-ancestors 'self' https: http://localhost:* http://127.0.0.1:*";

  const csp = [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    connectSrc,
    "object-src 'none'",
    "base-uri 'self'",
    frameAncestors,
  ].join('; ');
  res.setHeader('Content-Security-Policy', csp);

  if (securityConfig.isProduction || runtimeConfig.httpsOnly) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  // Prevent caching sensitive API responses in shared proxies (SSE sets its own no-cache, no-transform headers)
  const isSse = req.path === '/api/events' || req.path === '/api/performance/events/stream' || req.path === '/api/performance/live/stream';
  if (isApiRoute && !isSse) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
  }

  next();
}

// ============================================================================
// 2. STRICT CORS ALLOWLIST & CSRF ORIGIN VERIFICATION MIDDLEWARE
// ============================================================================
function isSameHostOrigin(req: Request, originHeader: string): boolean {
  try {
    const originHost = new URL(originHeader).host.toLowerCase();
    const requestHost = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim().toLowerCase();
    return Boolean(originHost && requestHost && originHost === requestHost);
  } catch {
    return false;
  }
}

export function corsPolicyMiddleware(req: Request, res: Response, next: NextFunction) {
  const origin = req.headers.origin;
  if (origin) {
    const normalized = origin.replace(/\/+$/, '');
    const isAllowed =
      isSameHostOrigin(req, normalized) ||
      securityConfig.corsAllowedOrigins.includes(normalized) ||
      (!securityConfig.isProduction && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(normalized));

    if (isAllowed) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization, X-Nexora-Device-Id, X-Nexora-Agent-Token, X-Nexora-Machine-Name, X-Hardware-Token'
      );
      res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, X-RateLimit-Remaining');
    } else if (req.path.startsWith('/api/')) {
      return res.status(403).json({
        success: false,
        message: 'CORS policy: Origin is not authorized to access this API.',
      });
    }
  }

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  next();
}

export function csrfOriginProtectionMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!req.path.startsWith('/api/')) return next();
  const isStateChanging = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
  if (!isStateChanging) return next();

  // Hardware IoT device endpoint authenticates via X-Hardware-Token, not browser cookies
  if (req.path === '/api/performance/events/hardware') return next();

  // Reject browser-initiated cross-site state changes when Sec-Fetch-Site explicitly signals cross-site
  const fetchSite = String(req.headers['sec-fetch-site'] || '').toLowerCase();
  if (fetchSite === 'cross-site' && securityConfig.isProduction) {
    const origin = String(req.headers.origin || '').replace(/\/+$/, '');
    if (!origin || !securityConfig.corsAllowedOrigins.includes(origin)) {
      return res.status(403).json({
        success: false,
        message: 'CSRF protection: Cross-site request rejected.',
      });
    }
  }

  next();
}

// ============================================================================
// 3. SLIDING-WINDOW RATE LIMITER (In-memory, zero external infrastructure)
// ============================================================================
export function createRateLimiter(options: {
  windowMs: number;
  maxRequests: number;
  keyPrefix: string;
  message?: string;
}) {
  const buckets = new Map<string, number[]>();

  // Periodic garbage collection to keep memory footprint tiny on shared hosting
  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [k, stamps] of buckets.entries()) {
      const kept = stamps.filter(ts => now - ts < options.windowMs);
      if (kept.length === 0) buckets.delete(k);
      else buckets.set(k, kept);
    }
  }, Math.max(30000, options.windowMs));
  if (typeof cleanupTimer.unref === 'function') cleanupTimer.unref();

  return (req: Request, res: Response, next: NextFunction) => {
    const ip = extractClientIp(req);
    const key = `${options.keyPrefix}:${ip}`;
    const now = Date.now();

    const timestamps = (buckets.get(key) || []).filter(ts => now - ts < options.windowMs);
    if (timestamps.length >= options.maxRequests) {
      const oldest = timestamps[0] || now;
      const retryAfter = Math.max(1, Math.ceil((oldest + options.windowMs - now) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      res.setHeader('X-RateLimit-Limit', String(options.maxRequests));
      res.setHeader('X-RateLimit-Remaining', '0');

      securityMonitor
        .raiseEvent({
          event_code: 'RATE_LIMIT_EXCEEDED',
          title: 'API Rate Limit Exceeded',
          severity: 'MEDIUM',
          ip_address: ip,
          endpoint: req.originalUrl,
          description: `IP ${ip} exceeded rate limit (${options.maxRequests} req/${Math.round(options.windowMs / 1000)}s) on ${req.path}.`,
          details: { bucket: options.keyPrefix, limit: options.maxRequests },
          cooldownKey: `ratelimit:${key}`,
        })
        .catch(() => {});

      return res.status(429).json({
        success: false,
        message: options.message || 'Too many requests. Please slow down and try again shortly.',
        retry_after_seconds: retryAfter,
      });
    }

    timestamps.push(now);
    buckets.set(key, timestamps);
    res.setHeader('X-RateLimit-Limit', String(options.maxRequests));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, options.maxRequests - timestamps.length)));
    next();
  };
}

// ============================================================================
// 4. SQL INJECTION PROBE DETECTION (Defense-in-Depth Telemetry)
// ============================================================================
export function sqliProbeMonitorMiddleware(req: Request, _res: Response, next: NextFunction) {
  const fullPath = `${req.baseUrl || ''}${req.path}`;
  if (!fullPath.startsWith('/api/')) return next();

  const suspicious =
    containsSqliProbe(req.query) ||
    containsSqliProbe(req.params) ||
    (req.body && typeof req.body === 'object' && containsSqliProbe(req.body));

  if (suspicious) {
    const dev = extractDeviceContext(req);
    const u = (req as any).user;
    securityMonitor
      .raiseEvent({
        event_code: 'SQLI_PROBE_DETECTED',
        title: 'Potential SQL Injection Payload Detected',
        severity: 'HIGH',
        user_id: u?.id ?? null,
        username: u?.username ?? null,
        user_email: u?.email ?? null,
        ip_address: dev.ipAddress,
        device_id: dev.deviceId,
        device_name: dev.deviceName,
        endpoint: req.originalUrl,
        description: `Request to ${req.method} ${fullPath} contained SQL injection signature patterns (neutralized by parameterized queries and strict validation).`,
        details: {
          method: req.method,
          query: redactSensitiveData(req.query),
        },
        notifyAdmin: true,
        cooldownKey: `sqli:${dev.ipAddress}:${fullPath}`,
      })
      .catch(() => {});
  }

  next();
}

// ============================================================================
// 5. AUTOMATIC MUTATING API AUDIT HOOK (Ensures full ERP coverage)
// ============================================================================
function inferModuleFromPath(apiPath: string): string {
  const p = apiPath.toLowerCase();
  if (p.startsWith('/api/auth')) return 'Authentication';
  if (p.startsWith('/api/security')) return 'Security Center';
  if (p.startsWith('/api/users')) return 'User Management';
  if (p.startsWith('/api/roles') || p.startsWith('/api/permissions')) return 'Roles & Permissions';
  if (p.startsWith('/api/departments')) return 'Departments';
  if (p.startsWith('/api/inventory')) return 'Inventory';
  if (p.startsWith('/api/warehouses')) return 'Warehouse';
  if (p.startsWith('/api/suppliers')) return 'Suppliers';
  if (p.startsWith('/api/purchasing') || p.startsWith('/api/purchase-requests')) return 'Procurement';
  if (p.startsWith('/api/performance')) return 'Performance';
  if (p.startsWith('/api/settings')) return 'Settings';
  if (p.startsWith('/api/profile')) return 'Profile';
  return 'ERP Core';
}

export function mutatingRouteAuditMiddleware(req: Request, res: Response, next: NextFunction) {
  const fullPath = `${req.baseUrl || ''}${req.path}`;
  if (!fullPath.startsWith('/api/')) return next();
  const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
  const isExport = req.method === 'GET' && /export|download/i.test(fullPath);

  if (!isMutation && !isExport) return next();

  res.on('finish', () => {
    // Skip if route already emitted an explicit detailed audit log
    if ((res.locals as any).__nexoraAudited) return;
    // Skip noisy health/login routes that emit dedicated structured logs
    if (fullPath === '/api/auth/login' || fullPath === '/api/auth/logout' || fullPath.startsWith('/api/health')) {
      return;
    }

    const u = (req as any).user;
    const statusCode = res.statusCode;
    const status: 'SUCCESS' | 'FAILED' | 'DENIED' =
      statusCode === 401 || statusCode === 403 ? 'DENIED' : statusCode >= 400 ? 'FAILED' : 'SUCCESS';
    const moduleName = inferModuleFromPath(fullPath);
    const actionType = isExport
      ? 'DATA_EXPORT'
      : req.method === 'POST'
        ? 'CREATE_OR_ACTION'
        : req.method === 'DELETE'
          ? 'DELETE'
          : 'UPDATE';

    auditService
      .log({
        req,
        user_id: u?.id ?? null,
        username: u?.username ?? null,
        user_email: u?.email ?? null,
        user_role: u?.role ?? null,
        module_name: moduleName,
        action_type: actionType,
        http_method: req.method,
        api_endpoint: req.originalUrl,
        status,
        response_status_code: statusCode,
        description: `${req.method} ${fullPath} completed with HTTP ${statusCode}`,
        after_values: isMutation && req.body && typeof req.body === 'object' ? redactSensitiveData(req.body) : null,
      })
      .catch(() => {});

    if (isExport && u?.id && status === 'SUCCESS') {
      securityMonitor
        .trackExportActivity({
          userId: u.id,
          username: u.username,
          userEmail: u.email,
          ipAddress: extractClientIp(req),
          endpoint: fullPath,
          moduleName,
        })
        .catch(() => {});
    }
  });

  next();
}

// ============================================================================
// 6. SAFE CENTRALIZED ERROR HANDLER
// ============================================================================
export function safeErrorHandler(err: any, req: Request, res: Response, _next: NextFunction) {
  const status = err?.status || err?.statusCode || 500;
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({
      success: false,
      message: 'Request payload exceeds the maximum allowed size.',
    });
  }
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({
      success: false,
      message: 'Malformed JSON request payload.',
    });
  }

  console.error(`[Nexora API Error] ${req.method} ${req.path}:`, err?.message || err);
  res.status(status >= 400 && status < 600 ? status : 500).json({
    success: false,
    message: securityConfig.isProduction
      ? 'An internal server error occurred. Please contact your system administrator.'
      : (err?.message || 'Internal server error.'),
  });
}
