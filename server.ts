import dotenv from 'dotenv';
dotenv.config();

import express, { Request, Response, NextFunction } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import * as XLSX from 'xlsx';
import crypto from 'crypto';
import { store } from './server/store';
import { emailService } from './server/emailService';
import { authService } from './server/authService';
import { getDb, checkPostgresHealth, closeDbPool } from './server/db';
import performanceRouter, {
  handleSseStream,
  getActiveSseClientCount,
  closeAllSseClients,
} from './server/performanceRoutes';
import { healthMonitor } from './server/healthMonitor';
import {
  runtimeConfig,
  validateRuntimeEnvironment,
  ensureStorageDirectories,
  getAuthCookieOptions,
} from './server/config/runtimeConfig';
import { securityConfig, validateSecurityEnvironment } from './server/security/config';
import { extractDeviceContext } from './server/security/deviceParser';
import { securityStore } from './server/security/securityStore';
import { auditService } from './server/security/auditService';
import { securityMonitor } from './server/security/securityMonitor';
import { backupService } from './server/security/backupService';
import { mfaService } from './server/security/mfaService';
import { createSecurityRouter } from './server/security/securityRoutes';
import { createBackupRestoreRouter } from './server/security/backupRestoreRoutes';
import { backupSchedulerService } from './server/security/backupSchedulerService';
import { maintenanceModeMiddleware } from './server/security/maintenanceMode';
import { createErpRouter } from './server/erpRoutes';
import { createOperationsPerformanceRouter } from './server/operationsPerformanceRoutes';
import { createDashboardRouter } from './server/dashboardRoutes';
import {
  httpsEnforcementMiddleware,
  requestLoggingMiddleware,
  securityHeadersMiddleware,
  corsPolicyMiddleware,
  csrfOriginProtectionMiddleware,
  createRateLimiter,
  sqliProbeMonitorMiddleware,
  mutatingRouteAuditMiddleware,
  safeErrorHandler,
} from './server/security/middleware';

// Ensure storage directories, validate startup environment, and seed core store
ensureStorageDirectories();
validateRuntimeEnvironment();
store.initSeed();
validateSecurityEnvironment();

export const app = express();
const SERVER_HOST = runtimeConfig.serverHost;
const PORT = runtimeConfig.serverPort;
const APP_NAME = runtimeConfig.appName;
const APP_ENV = runtimeConfig.appEnv;

// Configure trusted proxy strictly from TRUST_PROXY (never blindly trust arbitrary proxies)
app.set('trust proxy', runtimeConfig.trustProxy);
app.disable('x-powered-by');

// PostgreSQL Connection Pool (Optional / Resilient)
let pgPool: pg.Pool | null = null;
if (runtimeConfig.databaseUrl && process.env.DISABLE_PG_FOR_TESTS !== 'true') {
  try {
    pgPool = new pg.Pool({
      connectionString: runtimeConfig.databaseUrl,
      max: Math.min(10, runtimeConfig.pgPoolMax),
      connectionTimeoutMillis: runtimeConfig.pgConnectionTimeoutMs,
      idleTimeoutMillis: runtimeConfig.pgIdleTimeoutMs,
      statement_timeout: runtimeConfig.pgStatementTimeoutMs,
      ssl: runtimeConfig.pgSsl,
    });
    pgPool.on('error', (err) => {
      console.warn('[Nexora PG Pool Notice]:', err.message);
    });
  } catch {}
}

// Production HTTPS enforcement, request logging, security headers, CORS & CSRF origin guard
app.use(httpsEnforcementMiddleware);
app.use(requestLoggingMiddleware);
app.use(securityHeadersMiddleware);
app.use(corsPolicyMiddleware);
app.use(csrfOriginProtectionMiddleware);
app.use(express.json({ limit: runtimeConfig.requestBodyLimit }));
app.use(express.urlencoded({ limit: runtimeConfig.requestBodyLimit, extended: true }));
app.use(maintenanceModeMiddleware);

// Sliding-window API rate limiting & SQLi probe telemetry
const globalApiLimiter = createRateLimiter({
  windowMs: securityConfig.apiRateLimitWindowMs,
  maxRequests: securityConfig.apiRateLimitMax,
  keyPrefix: 'api',
});
const authEndpointLimiter = createRateLimiter({
  windowMs: securityConfig.authRateLimitWindowMs,
  maxRequests: securityConfig.authRateLimitMax,
  keyPrefix: 'auth',
  message: 'Too many authentication attempts. Please wait before trying again.',
});
app.use('/api', globalApiLimiter);
app.use('/api', sqliProbeMonitorMiddleware);
app.use('/api', mutatingRouteAuditMiddleware);

// Static uploads directory serving (configurable via UPLOADS_DIR; private dirs are strictly isolated)
const uploadsDir = runtimeConfig.uploadsDir;
const avatarsDir = path.join(uploadsDir, 'avatars');
if (!fs.existsSync(avatarsDir)) {
  fs.mkdirSync(avatarsDir, { recursive: true });
}

app.use('/uploads', (_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  next();
}, express.static(uploadsDir, { maxAge: '7d', dotfiles: 'deny' }));

// Authentication Middleware
export interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    email: string;
    username?: string;
    role: string;
    jti: string;
    session_id?: string;
  };
}

const authenticateToken = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

  if (!token) {
    const dev = extractDeviceContext(req);
    securityMonitor.trackUnauthorizedAccess({
      statusCode: 401,
      ipAddress: dev.ipAddress,
      deviceId: dev.deviceId,
      deviceName: dev.deviceName,
      endpoint: req.originalUrl,
    }).catch(() => {});
    return res.status(401).json({ success: false, message: 'Authentication required. No access token provided.' });
  }

  try {
    const decoded = authService.verifyAccessToken(token);
    if (decoded.jti && store.isTokenRevoked(decoded.jti)) {
      return res.status(401).json({ success: false, message: 'Session token has been revoked. Please sign in again.' });
    }
    if (decoded.jti) {
      const sessState = securityStore.isSessionActive(decoded.jti);
      if (!sessState.active) {
        return res.status(401).json({ success: false, message: sessState.reason || 'Session is no longer active. Please sign in again.' });
      }
      securityStore.touchSessionActivity(decoded.jti);
      req.user = {
        id: decoded.uid || decoded.id,
        email: decoded.sub,
        username: decoded.username,
        role: decoded.role,
        jti: decoded.jti,
        session_id: sessState.session?.session_id,
      };
    } else {
      req.user = {
        id: decoded.uid || decoded.id,
        email: decoded.sub,
        username: decoded.username,
        role: decoded.role,
        jti: decoded.jti,
      };
    }

    next();
  } catch (err: any) {
    const dev = extractDeviceContext(req);
    securityMonitor.trackUnauthorizedAccess({
      statusCode: 401,
      ipAddress: dev.ipAddress,
      deviceId: dev.deviceId,
      deviceName: dev.deviceName,
      endpoint: req.originalUrl,
    }).catch(() => {});
    const msg = err?.name === 'TokenExpiredError'
      ? 'Your session has expired. Please log in again.'
      : 'Invalid or expired authentication token.';
    return res.status(401).json({ success: false, message: msg });
  }
};

const requirePermission = (permissionCode: string) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Unauthorized: Authentication required.' });
    }

    const user = store.findUserById(req.user.id);
    const isSuper = req.user.role === 'super_admin' || (user && user.roles && user.roles.includes('super_admin'));
    if (isSuper) {
      return next();
    }

    const perms = user ? store.getUserEffectivePermissions(user) : store.getRolePermissions(req.user.role);
    const aliases = [permissionCode];
    if (permissionCode.endsWith('.edit')) aliases.push(permissionCode.replace('.edit', '.update'));
    if (permissionCode.endsWith('.update')) aliases.push(permissionCode.replace('.update', '.edit'));
    if (permissionCode.endsWith('.view')) aliases.push(permissionCode.replace('.view', '.read'));
    if (permissionCode.startsWith('categories.')) aliases.push(permissionCode.replace('categories.', 'inventory.'));
    if (permissionCode.startsWith('items.')) aliases.push(permissionCode.replace('items.', 'inventory.'));
    if (permissionCode.startsWith('warehouses.')) aliases.push(permissionCode.replace('warehouses.', 'inventory.'));
    if (permissionCode.startsWith('settings.') || permissionCode === 'settings') {
      aliases.push('menu.settings');
      if (permissionCode.endsWith('.view')) aliases.push('settings.view');
      if (permissionCode.endsWith('.edit') || permissionCode.endsWith('.reset')) aliases.push('settings.edit');
    }

    const hasPerm =
      perms.includes('*') ||
      aliases.some(a => perms.includes(a)) ||
      (permissionCode === 'settings.view' && perms.some(p => p.startsWith('settings.') && p.endsWith('.view')));
    if (!hasPerm) {
      const dev = extractDeviceContext(req);
      store.logAudit({
        user_id: req.user.id,
        user_email: req.user.email,
        action: 'ACCESS_DENIED',
        module: 'Authorization',
        details: `Access denied to [${permissionCode}]. Assigned roles: ${(user?.roles || [req.user.role]).join(', ')}`,
        ip_address: dev.ipAddress,
      });
      auditService.log({
        req,
        module_name: 'Authorization',
        action_type: 'ACCESS_DENIED',
        status: 'DENIED',
        response_status_code: 403,
        description: `Permission [${permissionCode}] denied for ${req.user.email}`,
      }).catch(() => {});
      securityMonitor.trackUnauthorizedAccess({
        statusCode: 403,
        userId: req.user.id,
        username: req.user.username,
        userEmail: req.user.email,
        ipAddress: dev.ipAddress,
        deviceId: dev.deviceId,
        deviceName: dev.deviceName,
        endpoint: req.originalUrl,
        permission: permissionCode,
      }).catch(() => {});
      return res.status(403).json({
        success: false,
        message: `Forbidden: Missing required authorization [${permissionCode}].`,
      });
    }

    next();
  };
};

// Mount Performance Router WITH strict authentication & RBAC (preserving dedicated hardware token route & SSE token check)
app.use('/api/performance', (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (req.path === '/events/hardware' || req.path === '/events/stream' || req.path === '/live/stream') {
    return next();
  }
  return authenticateToken(req, res, () => {
    const isRead = req.method === 'GET' || req.method === 'HEAD';
    const neededPerm = isRead ? 'performance.view' : 'performance.manage';
    const user = store.findUserById(req.user!.id);
    const isSuper = req.user!.role === 'super_admin' || (user?.roles || []).includes('super_admin');
    if (isSuper) return next();
    const perms = user ? store.getUserEffectivePermissions(user) : store.getRolePermissions(req.user!.role);
    const allowed = isRead
      ? perms.includes('*') ||
        perms.includes('performance.view') ||
        perms.includes('performance.manage') ||
        perms.includes('menu.performance')
      : perms.includes('*') || perms.includes('performance.manage');
    if (!allowed) {
      return res.status(403).json({ success: false, message: `Forbidden: Missing required authorization [${neededPerm}].` });
    }
    next();
  });
}, performanceRouter);

// Unified Single-Domain Server-Sent Events Endpoint (https://domain/api/events)
app.get('/api/events', handleSseStream);

// Mount Enterprise Security Center API Router (/api/security/*)
app.use('/api/security', createSecurityRouter({ authenticateToken, requirePermission }));

// Mount Operation-Based Performance, Quality, Readiness, Forecasting & Rewards API Router (/api/operations-engine/*)
app.use('/api/operations-engine', createOperationsPerformanceRouter({ authenticateToken, requirePermission }));

// Mount Dynamic Role-Based & Permission-Based Visual Manufacturing Dashboard API Router (/api/dashboard/*)
app.use('/api/dashboard', createDashboardRouter({ authenticateToken, requirePermission }));

// ==========================================
// REST API ROUTES (/api/*)
// ==========================================

// --- Public Production-Safe Health Probes (No secrets, DB credentials, or internal paths) ---
app.get('/api/health', async (_req, res) => {
  const [pgHealth, storeHealth] = await Promise.all([
    checkPostgresHealth(),
    Promise.resolve(store.checkHealth()),
  ]);
  const isReady = pgHealth.connected || storeHealth.available;
  const overallStatus = pgHealth.connected ? 'healthy' : storeHealth.available ? 'degraded' : 'unhealthy';
  const httpCode = isReady ? 200 : 503;

  res.status(httpCode).json({
    success: isReady,
    status: overallStatus,
    message: overallStatus === 'healthy'
      ? 'Nexora Enterprise Backend API active and connected to PostgreSQL'
      : 'Nexora Backend API running (PostgreSQL database connection unavailable)',
    data: {
      app: APP_NAME,
      status: overallStatus,
      environment: APP_ENV,
      storage_engine: 'postgresql',
      postgresql: pgHealth.connected ? 'connected' : 'unavailable',
      uptime_seconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    },
  });
});

// Authenticated Detailed Administrative Health Endpoint
app.get('/api/health/admin', authenticateToken, requirePermission('settings.view'), async (_req, res) => {
  const [pgHealth, storeHealth] = await Promise.all([
    checkPostgresHealth(),
    Promise.resolve(store.checkHealth()),
  ]);
  const mem = process.memoryUsage();
  res.json({
    success: true,
    data: {
      app: APP_NAME,
      environment: APP_ENV,
      node_env: runtimeConfig.nodeEnv,
      timezone: runtimeConfig.appTimezone,
      https_only: runtimeConfig.httpsOnly,
      secure_cookies: runtimeConfig.secureCookies,
      uptime_seconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      storage_engine: 'postgresql',
      postgresql: {
        status: pgHealth.connected ? 'connected' : 'unavailable',
        latency_ms: pgHealth.latency_ms,
        pool_total: pgHealth.pool_total,
        pool_idle: pgHealth.pool_idle,
        pool_waiting: pgHealth.pool_waiting,
        state_store: {
          status: storeHealth.available ? 'available' : 'unavailable',
          writable: storeHealth.writable,
          size_bytes: storeHealth.size_bytes,
          engine: storeHealth.engine,
        },
      },
      sse_active_clients: getActiveSseClientCount(),
      smtp_configured: Boolean(process.env.SMTP_HOST),
      backup_encryption_configured: securityConfig.backupEncryptionKeyConfigured,
      memory_mb: {
        rss: Math.round(mem.rss / 1048576),
        heap_used: Math.round(mem.heapUsed / 1048576),
        heap_total: Math.round(mem.heapTotal / 1048576),
      },
    },
  });
});

app.get('/api/health/liveness', (_req, res) => {
  res.json({
    success: true,
    message: 'Backend process active',
    data: { status: 'ok', app: APP_NAME, uptime_seconds: Math.round(process.uptime()) },
  });
});

app.get('/api/health/readiness', async (_req, res) => {
  const [pgHealth, storeHealth] = await Promise.all([
    checkPostgresHealth(),
    Promise.resolve(store.checkHealth()),
  ]);
  const ready = pgHealth.connected || storeHealth.available;
  res.status(ready ? 200 : 503).json({
    success: ready,
    message: pgHealth.connected ? 'System ready (PostgreSQL connected)' : ready ? 'System ready (degraded)' : 'PostgreSQL unavailable',
    data: {
      status: pgHealth.connected ? 'healthy' : ready ? 'degraded' : 'unhealthy',
      storage_engine: 'postgresql',
      postgresql: pgHealth.connected ? 'connected' : 'unavailable',
      app: APP_NAME,
      env: APP_ENV,
      timestamp: new Date().toISOString(),
    },
  });
});

app.get('/api/branding', (_req, res) => {
  const branding = store.getBrandingConfig();
  res.json({
    success: true,
    message: 'Branding settings retrieved',
    data: {
      app_name: branding.app_name,
      company_name: branding.company_name,
      brand_tagline: branding.brand_tagline,
    },
  });
});

app.get('/api/health/status', async (_req, res) => {
  const pgHealth = await checkPostgresHealth();
  res.json({
    success: true,
    message: 'Operational status retrieved',
    data: {
      app_name: APP_NAME,
      environment: APP_ENV,
      storage_engine: 'postgresql',
      database_connected: pgHealth.connected,
      smtp_configured: !!process.env.SMTP_HOST,
      timezone: runtimeConfig.appTimezone,
      uptime_seconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    },
  });
});

// --- Full System Health Monitor (Live Server & Connection Status) ---
app.get('/api/system/health-monitor', async (_req, res) => {
  try {
    const report = await healthMonitor.runFullCheck();
    res.json({
      success: true,
      data: report,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to execute system health check',
      error: runtimeConfig.isProduction ? 'Health check unavailable' : err.message,
    });
  }
});

// --- Auth Routes (Hardened with Lockout, Device Tracking, Refresh Rotation & Optional MFA) ---
app.post('/api/auth/login', authEndpointLimiter, async (req, res) => {
  const identifier = String(req.body?.username || req.body?.email || req.body?.email_or_username || '').trim();
  const password = String(req.body?.password || '');
  const mfaCode = String(req.body?.mfa_code || '').trim();
  const devCtx = extractDeviceContext(req);
  const ip = devCtx.ipAddress;

  if (!identifier || !password) {
    return res.status(400).json({
      success: false,
      message: 'Email/username and password are required.',
      errors: [
        { field: 'email', message: !identifier ? 'Email or username is required' : '' },
        { field: 'password', message: !password ? 'Password is required' : '' },
      ].filter(e => e.message),
    });
  }

  // Enforce brute-force lockout protection
  const lockCheck = securityMonitor.checkAccountLockout(identifier, ip);
  if (lockCheck.locked) {
    await securityStore.recordLoginEvent({
      user_id: null,
      username: identifier,
      email: identifier.includes('@') ? identifier : null,
      user_role: null,
      session_id: null,
      event_type: 'LOGIN_FAILED',
      login_status: 'LOCKED',
      failure_reason: lockCheck.reason || 'Account locked',
      ip_address: ip,
      device_id: devCtx.deviceId,
      device_name: devCtx.deviceName,
      device_type: devCtx.deviceType,
      os_name: devCtx.osName,
      os_version: devCtx.osVersion,
      browser_name: devCtx.browserName,
      browser_version: devCtx.browserVersion,
      user_agent: devCtx.userAgent,
      client_source: devCtx.clientSource,
      verified_machine_name: devCtx.verifiedMachineName,
      is_new_device: false,
      is_suspicious: true,
      login_at: new Date().toISOString(),
      logout_at: null,
    });
    res.setHeader('Retry-After', String(lockCheck.retryAfterSeconds));
    return res.status(429).json({
      success: false,
      message: `Too many failed sign-in attempts. Please wait ${Math.ceil(lockCheck.retryAfterSeconds / 60)} minute(s) before retrying.`,
      retry_after_seconds: lockCheck.retryAfterSeconds,
    });
  }

  // Check PostgreSQL first if available, then fallback to store
  let user: any = null;
  if (pgPool) {
    try {
      const resDb = await pgPool.query(
        'SELECT * FROM users WHERE LOWER(email) = LOWER($1) OR LOWER(username) = LOWER($1) LIMIT 1',
        [identifier]
      );
      if (resDb.rows.length > 0) {
        user = resDb.rows[0];
        if (!user.first_name && user.name) {
          const parts = user.name.split(' ');
          user.first_name = parts[0];
          user.last_name = parts.slice(1).join(' ');
        }
      }
    } catch {
      user = null;
    }
  }

  if (!user) {
    user = store.findUserByUsernameOrEmail(identifier);
  }

  const genericAuthError = 'Invalid credentials. Please verify your email/username and password.';

  if (!user) {
    await securityMonitor.recordFailedLoginAttempt({
      identifier,
      ipAddress: ip,
      deviceId: devCtx.deviceId,
      deviceName: devCtx.deviceName,
      reason: 'Account not found',
    });
    await securityStore.recordLoginEvent({
      user_id: null,
      username: identifier,
      email: identifier.includes('@') ? identifier : null,
      user_role: null,
      session_id: null,
      event_type: 'LOGIN_FAILED',
      login_status: 'FAILED',
      failure_reason: 'Invalid credentials',
      ip_address: ip,
      device_id: devCtx.deviceId,
      device_name: devCtx.deviceName,
      device_type: devCtx.deviceType,
      os_name: devCtx.osName,
      os_version: devCtx.osVersion,
      browser_name: devCtx.browserName,
      browser_version: devCtx.browserVersion,
      user_agent: devCtx.userAgent,
      client_source: devCtx.clientSource,
      verified_machine_name: devCtx.verifiedMachineName,
      is_new_device: false,
      is_suspicious: false,
      login_at: new Date().toISOString(),
      logout_at: null,
    });
    store.logAudit({
      user_id: null,
      user_email: identifier.includes('@') ? identifier : `${identifier}@system`,
      username: identifier,
      action: 'LOGIN_FAILED',
      module: 'Authentication',
      details: `Sign-in failed for identifier "${identifier}"`,
      ip_address: ip,
    });
    await auditService.log({
      req,
      user_id: null,
      username: identifier,
      module_name: 'Authentication',
      action_type: 'LOGIN_FAILED',
      status: 'FAILED',
      response_status_code: 401,
      description: `Failed login attempt for unknown identifier "${identifier}"`,
    });
    return res.status(401).json({ success: false, message: genericAuthError });
  }

  if (!user.is_active) {
    await securityStore.recordLoginEvent({
      user_id: user.id,
      username: user.username,
      email: user.email,
      user_role: user.role,
      session_id: null,
      event_type: 'LOGIN_FAILED',
      login_status: 'INACTIVE_ACCOUNT',
      failure_reason: 'Account inactive or disabled',
      ip_address: ip,
      device_id: devCtx.deviceId,
      device_name: devCtx.deviceName,
      device_type: devCtx.deviceType,
      os_name: devCtx.osName,
      os_version: devCtx.osVersion,
      browser_name: devCtx.browserName,
      browser_version: devCtx.browserVersion,
      user_agent: devCtx.userAgent,
      client_source: devCtx.clientSource,
      verified_machine_name: devCtx.verifiedMachineName,
      is_new_device: false,
      is_suspicious: true,
      login_at: new Date().toISOString(),
      logout_at: null,
    });
    store.logAudit({
      user_id: user.id,
      user_email: user.email,
      username: user.username,
      action: 'LOGIN_BLOCKED_INACTIVE',
      module: 'Authentication',
      details: `Sign-in rejected: Account ${user.email} is inactive or disabled.`,
      ip_address: ip,
    });
    return res.status(401).json({
      success: false,
      message: 'Your account is deactivated or disabled. Please contact your system administrator.',
    });
  }

  const validPassword = await authService.verifyPassword(password, user.password_hash);
  if (!validPassword) {
    await securityMonitor.recordFailedLoginAttempt({
      identifier,
      userId: user.id,
      username: user.username,
      email: user.email,
      ipAddress: ip,
      deviceId: devCtx.deviceId,
      deviceName: devCtx.deviceName,
      reason: 'Incorrect password',
    });
    await securityStore.recordLoginEvent({
      user_id: user.id,
      username: user.username,
      email: user.email,
      user_role: user.role,
      session_id: null,
      event_type: 'LOGIN_FAILED',
      login_status: 'FAILED',
      failure_reason: 'Invalid credentials',
      ip_address: ip,
      device_id: devCtx.deviceId,
      device_name: devCtx.deviceName,
      device_type: devCtx.deviceType,
      os_name: devCtx.osName,
      os_version: devCtx.osVersion,
      browser_name: devCtx.browserName,
      browser_version: devCtx.browserVersion,
      user_agent: devCtx.userAgent,
      client_source: devCtx.clientSource,
      verified_machine_name: devCtx.verifiedMachineName,
      is_new_device: false,
      is_suspicious: false,
      login_at: new Date().toISOString(),
      logout_at: null,
    });
    store.logAudit({
      user_id: user.id,
      user_email: user.email,
      username: user.username,
      action: 'LOGIN_FAILED',
      module: 'Authentication',
      details: `Sign-in failed: Incorrect password attempt for account ${user.email}`,
      ip_address: ip,
    });
    await auditService.log({
      req,
      user_id: user.id,
      username: user.username,
      user_email: user.email,
      user_role: user.role,
      module_name: 'Authentication',
      action_type: 'LOGIN_FAILED',
      status: 'FAILED',
      response_status_code: 401,
      description: `Incorrect password attempt for ${user.email}`,
    });
    return res.status(401).json({ success: false, message: genericAuthError });
  }

  // Check if this client device has been explicitly blocked by an administrator
  if (securityStore.isDeviceBlocked(user.id, devCtx.deviceId)) {
    await securityStore.recordLoginEvent({
      user_id: user.id,
      username: user.username,
      email: user.email,
      user_role: user.role,
      session_id: null,
      event_type: 'LOGIN_FAILED',
      login_status: 'BLOCKED_DEVICE',
      failure_reason: 'Device blocked by administrator',
      ip_address: ip,
      device_id: devCtx.deviceId,
      device_name: devCtx.deviceName,
      device_type: devCtx.deviceType,
      os_name: devCtx.osName,
      os_version: devCtx.osVersion,
      browser_name: devCtx.browserName,
      browser_version: devCtx.browserVersion,
      user_agent: devCtx.userAgent,
      client_source: devCtx.clientSource,
      verified_machine_name: devCtx.verifiedMachineName,
      is_new_device: false,
      is_suspicious: true,
      login_at: new Date().toISOString(),
      logout_at: null,
    });
    await securityMonitor.raiseEvent({
      event_code: 'BLOCKED_DEVICE_LOGIN_ATTEMPT',
      title: 'Blocked Device Attempted Sign-In',
      severity: 'HIGH',
      user_id: user.id,
      username: user.username,
      user_email: user.email,
      ip_address: ip,
      device_id: devCtx.deviceId,
      device_name: devCtx.deviceName,
      endpoint: '/api/auth/login',
      description: `User ${user.email} attempted to sign in from blocked device "${devCtx.deviceName}" (${ip}).`,
      notifyAdmin: true,
    });
    return res.status(403).json({
      success: false,
      message: 'This device has been blocked by your system administrator. Contact IT Security to restore access.',
    });
  }

  // Optional Administrator TOTP MFA verification if enrolled
  const userMfa = securityStore.getUserMfa(user.id);
  if (userMfa?.enabled && userMfa.secret_encrypted) {
    if (!mfaCode) {
      return res.status(200).json({
        success: false,
        mfa_required: true,
        message: 'Two-factor authentication code is required to complete sign-in.',
      });
    }
    const secret = mfaService.decryptSecret(userMfa.secret_encrypted);
    let mfaOk = mfaService.verifyCode(secret, mfaCode);
    if (!mfaOk && userMfa.recovery_code_hashes.length > 0) {
      const recHash = mfaService.hashRecoveryCode(mfaCode);
      const idx = userMfa.recovery_code_hashes.indexOf(recHash);
      if (idx !== -1) {
        mfaOk = true;
        userMfa.recovery_code_hashes.splice(idx, 1);
        await securityStore.saveUserMfa(userMfa);
      }
    }
    if (!mfaOk) {
      await securityStore.recordLoginEvent({
        user_id: user.id,
        username: user.username,
        email: user.email,
        user_role: user.role,
        session_id: null,
        event_type: 'MFA_FAILED',
        login_status: 'FAILED',
        failure_reason: 'Invalid MFA code',
        ip_address: ip,
        device_id: devCtx.deviceId,
        device_name: devCtx.deviceName,
        device_type: devCtx.deviceType,
        os_name: devCtx.osName,
        os_version: devCtx.osVersion,
        browser_name: devCtx.browserName,
        browser_version: devCtx.browserVersion,
        user_agent: devCtx.userAgent,
        client_source: devCtx.clientSource,
        verified_machine_name: devCtx.verifiedMachineName,
        is_new_device: false,
        is_suspicious: true,
        login_at: new Date().toISOString(),
        logout_at: null,
      });
      return res.status(401).json({ success: false, mfa_required: true, message: 'Invalid authenticator or recovery code.' });
    }
  }

  // Clear brute-force counter on successful authentication
  securityMonitor.clearFailedLoginAttempts(identifier);
  if (user.email) securityMonitor.clearFailedLoginAttempts(user.email);
  if (user.username) securityMonitor.clearFailedLoginAttempts(user.username);

  const jti = `jti_${crypto.randomBytes(16).toString('hex')}`;
  const refresh = authService.generateRefreshToken();
  const nowMs = Date.now();
  const now = new Date(nowMs).toISOString();
  const accessExpSec = authService.getAccessTokenExpirySeconds();
  const expiresAt = new Date(nowMs + accessExpSec * 1000).toISOString();
  const refreshExpiresAt = new Date(nowMs + securityConfig.refreshTokenExpiryDays * 86400 * 1000).toISOString();

  // Register/update client device & detect new device / IP anomalies
  const deviceResult = await securityStore.upsertDevice({
    user_id: user.id,
    username: user.username,
    user_email: user.email,
    device_id: devCtx.deviceId,
    device_name: devCtx.deviceName,
    device_type: devCtx.deviceType,
    os_name: devCtx.osName,
    os_version: devCtx.osVersion,
    browser_name: devCtx.browserName,
    browser_version: devCtx.browserVersion,
    user_agent: devCtx.userAgent,
    client_source: devCtx.clientSource,
    verified_machine_name: devCtx.verifiedMachineName,
    ip_address: ip,
  });

  // Update last login in PostgreSQL and store
  if (pgPool) {
    try {
      await pgPool.query('UPDATE users SET last_login_at = $1 WHERE id = $2', [now, user.id]);
    } catch {}
  }
  store.updateUser(user.id, { last_login_at: now });

  // Create server-side tracked session (in both enterprise securityStore & legacy store)
  const secSession = await securityStore.createSession({
    user_id: user.id,
    username: user.username,
    user_email: user.email,
    user_role: user.role,
    access_jti: jti,
    refresh_token_hash: refresh.hash,
    device_id: devCtx.deviceId,
    device_name: devCtx.deviceName,
    device_type: devCtx.deviceType,
    os_name: devCtx.osName,
    browser_name: devCtx.browserName,
    ip_address: ip,
    user_agent: devCtx.userAgent,
    client_source: devCtx.clientSource,
    expires_at: expiresAt,
    refresh_expires_at: refreshExpiresAt,
  });

  store.createSession({
    user_id: user.id,
    jti,
    ip_address: ip,
    user_agent: devCtx.userAgent,
  });

  await securityStore.recordLoginEvent({
    user_id: user.id,
    username: user.username,
    email: user.email,
    user_role: user.role,
    session_id: secSession.session_id,
    event_type: 'LOGIN',
    login_status: 'SUCCESS',
    failure_reason: null,
    ip_address: ip,
    device_id: devCtx.deviceId,
    device_name: devCtx.deviceName,
    device_type: devCtx.deviceType,
    os_name: devCtx.osName,
    os_version: devCtx.osVersion,
    browser_name: devCtx.browserName,
    browser_version: devCtx.browserVersion,
    user_agent: devCtx.userAgent,
    client_source: devCtx.clientSource,
    verified_machine_name: devCtx.verifiedMachineName,
    is_new_device: deviceResult.isNewDevice,
    is_suspicious: deviceResult.isNewDevice || deviceResult.ipChanged,
    login_at: now,
    logout_at: null,
  });

  if (deviceResult.isNewDevice) {
    await securityMonitor.raiseEvent({
      event_code: 'NEW_DEVICE_LOGIN',
      title: 'Sign-In Detected from New Device',
      severity: 'MEDIUM',
      user_id: user.id,
      username: user.username,
      user_email: user.email,
      ip_address: ip,
      device_id: devCtx.deviceId,
      device_name: devCtx.deviceName,
      endpoint: '/api/auth/login',
      description: `User ${user.email} signed in from a previously unseen device "${devCtx.deviceName}" (${ip}).`,
      notifyAdmin: true,
      notifyUserEmail: user.email,
      notifyUserName: `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username,
      cooldownKey: `newdev:${user.id}:${devCtx.deviceId}`,
    });
  } else if (deviceResult.ipChanged) {
    await securityMonitor.raiseEvent({
      event_code: 'UNUSUAL_IP_CHANGE',
      title: 'Device IP Address Changed on Sign-In',
      severity: 'LOW',
      user_id: user.id,
      username: user.username,
      user_email: user.email,
      ip_address: ip,
      device_id: devCtx.deviceId,
      device_name: devCtx.deviceName,
      endpoint: '/api/auth/login',
      description: `Device "${devCtx.deviceName}" for ${user.email} signed in from a different IP (${ip}).`,
    });
  }

  // Audit logs (both tamper-evident enterprise log and legacy store log)
  store.logAudit({
    user_id: user.id,
    user_email: user.email,
    username: user.username,
    action: 'LOGIN_SUCCESS',
    module: 'Authentication',
    details: `User signed in successfully from ${ip} (${devCtx.deviceName})`,
    ip_address: ip,
  });
  await auditService.log({
    req,
    user_id: user.id,
    username: user.username,
    user_email: user.email,
    user_role: user.role,
    session_id: secSession.session_id,
    module_name: 'Authentication',
    action_type: 'LOGIN_SUCCESS',
    entity_type: 'UserSession',
    entity_id: secSession.session_id,
    status: 'SUCCESS',
    response_status_code: 200,
    description: `Authenticated from ${ip} via ${devCtx.deviceName} (${devCtx.clientSource})`,
  });

  // Generate centralized JWT token
  const token = authService.signAccessToken({
    sub: user.email,
    uid: user.id,
    id: user.id,
    username: user.username,
    role: user.role,
    jti,
  });

  const safeUser = {
    id: user.id,
    first_name: user.first_name,
    last_name: user.last_name,
    name: `${user.first_name} ${user.last_name}`,
    email: user.email,
    username: user.username,
    phone: user.phone || '',
    department: user.department || '',
    profile_picture: user.profile_picture || '',
    role: user.role,
    is_active: user.is_active,
    is_verified: user.is_verified,
    mfa_enabled: Boolean(userMfa?.enabled),
    last_login_at: now,
    created_at: user.created_at,
    permissions: store.getRolePermissions(user.role),
  };

  res.cookie(
    'nexora_refresh_token',
    refresh.raw,
    getAuthCookieOptions(securityConfig.refreshTokenExpiryDays * 86400 * 1000)
  );

  return res.json({
    success: true,
    message: 'Authentication successful.',
    data: {
      user: safeUser,
      access_token: token,
      refresh_token: refresh.raw,
      session_id: secSession.session_id,
      token_type: 'bearer',
      expires_in_seconds: accessExpSec,
    },
  });
});

function readRefreshCookie(req: Request): string {
  const raw = req.headers.cookie || '';
  const match = raw.match(/(?:^|;\s*)nexora_refresh_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

// Refresh Token Rotation Endpoint (with automatic reuse/theft detection)
app.post('/api/auth/refresh', authEndpointLimiter, async (req, res) => {
  const rawRefresh = String(req.body?.refresh_token || readRefreshCookie(req) || '').trim();
  if (!rawRefresh) {
    return res.status(400).json({ success: false, message: 'Refresh token is required.' });
  }

  const oldHash = authService.hashToken(rawRefresh);
  const newJti = `jti_${crypto.randomBytes(16).toString('hex')}`;
  const newRefresh = authService.generateRefreshToken();
  const nowMs = Date.now();
  const accessExpSec = authService.getAccessTokenExpirySeconds();
  const expiresAt = new Date(nowMs + accessExpSec * 1000).toISOString();
  const refreshExpiresAt = new Date(nowMs + securityConfig.refreshTokenExpiryDays * 86400 * 1000).toISOString();

  const rotated = await securityStore.rotateRefreshToken({
    refreshTokenHash: oldHash,
    newAccessJti: newJti,
    newRefreshTokenHash: newRefresh.hash,
    newExpiresAt: expiresAt,
    newRefreshExpiresAt: refreshExpiresAt,
  });

  if (!('session' in rotated)) {
    if (rotated.compromised && rotated.userId) {
      store.revokeAllUserSessions(rotated.userId);
      await securityMonitor.raiseEvent({
        event_code: 'REFRESH_TOKEN_REUSE_COMPROMISE',
        title: 'CRITICAL: Refresh Token Reuse Detected — Sessions Terminated',
        severity: 'CRITICAL',
        user_id: rotated.userId,
        ip_address: extractDeviceContext(req).ipAddress,
        endpoint: '/api/auth/refresh',
        description: rotated.reason,
        notifyAdmin: true,
      });
    }
    return res.status(401).json({ success: false, message: rotated.reason });
  }

  const user = store.findUserById(rotated.session.user_id);
  if (!user || !user.is_active) {
    await securityStore.revokeSessionById(rotated.session.session_id, null, 'User inactive during refresh');
    return res.status(401).json({ success: false, message: 'Account is no longer active.' });
  }

  const accessToken = authService.signAccessToken({
    sub: user.email,
    uid: user.id,
    id: user.id,
    username: user.username,
    role: user.role,
    jti: newJti,
  });

  res.cookie(
    'nexora_refresh_token',
    newRefresh.raw,
    getAuthCookieOptions(securityConfig.refreshTokenExpiryDays * 86400 * 1000)
  );

  return res.json({
    success: true,
    data: {
      access_token: accessToken,
      refresh_token: newRefresh.raw,
      session_id: rotated.session.session_id,
      token_type: 'bearer',
      expires_in_seconds: accessExpSec,
    },
  });
});

app.post('/api/auth/logout', authenticateToken, async (req: AuthenticatedRequest, res) => {
  const devCtx = extractDeviceContext(req);
  if (req.user?.jti) {
    store.revokeToken(req.user.jti);
    const revoked = await securityStore.revokeSessionById(req.user.jti, req.user.id, 'User signed out', 'logged_out');
    if (revoked) {
      await securityStore.markLoginLogout(revoked.session_id);
    }
    await securityStore.recordLoginEvent({
      user_id: req.user.id,
      username: req.user.username || null,
      email: req.user.email,
      user_role: req.user.role,
      session_id: revoked?.session_id || req.user.session_id || null,
      event_type: 'LOGOUT',
      login_status: 'LOGGED_OUT',
      failure_reason: null,
      ip_address: devCtx.ipAddress,
      device_id: devCtx.deviceId,
      device_name: devCtx.deviceName,
      device_type: devCtx.deviceType,
      os_name: devCtx.osName,
      os_version: devCtx.osVersion,
      browser_name: devCtx.browserName,
      browser_version: devCtx.browserVersion,
      user_agent: devCtx.userAgent,
      client_source: devCtx.clientSource,
      verified_machine_name: devCtx.verifiedMachineName,
      is_new_device: false,
      is_suspicious: false,
      login_at: new Date().toISOString(),
      logout_at: new Date().toISOString(),
    });
    store.logAudit({
      user_id: req.user.id,
      user_email: req.user.email,
      action: 'LOGOUT',
      module: 'Authentication',
      details: 'User terminated active session',
      ip_address: devCtx.ipAddress,
    });
    await auditService.log({
      req,
      module_name: 'Authentication',
      action_type: 'LOGOUT',
      entity_type: 'UserSession',
      entity_id: revoked?.session_id || req.user.jti,
      status: 'SUCCESS',
      response_status_code: 200,
      description: `User ${req.user.email} signed out cleanly`,
    });
  }
  res.clearCookie('nexora_refresh_token', {
    ...getAuthCookieOptions(0),
    maxAge: undefined,
  });
  res.json({ success: true, message: 'Logged out successfully.' });
});

app.get('/api/auth/me', authenticateToken, (req: AuthenticatedRequest, res) => {
  const user = store.findUserById(req.user!.id);
  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found.' });
  }

  const safeUser = {
    id: user.id,
    first_name: user.first_name,
    last_name: user.last_name,
    name: `${user.first_name} ${user.last_name}`,
    email: user.email,
    username: user.username,
    phone: user.phone || '',
    department: user.department || '',
    profile_picture: user.profile_picture || '',
    role: user.role,
    is_active: user.is_active,
    is_verified: user.is_verified,
    last_login_at: user.last_login_at,
    created_at: user.created_at,
    permissions: store.getRolePermissions(user.role),
  };

  res.json({
    success: true,
    message: 'Session active',
    data: {
      authenticated: true,
      user: safeUser,
    },
  });
});

// --- Password Recovery Rate Limiting ---
interface RateLimitRecord {
  count: number;
  resetAt: number;
}
const forgotPasswordRateLimits = new Map<string, RateLimitRecord>();
const resetPasswordRateLimits = new Map<string, RateLimitRecord>();

function checkRateLimit(map: Map<string, RateLimitRecord>, key: string, maxAttempts: number, windowMs: number): boolean {
  const now = Date.now();
  const record = map.get(key);
  if (!record || record.resetAt < now) {
    map.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (record.count >= maxAttempts) {
    return false;
  }
  record.count++;
  return true;
}

// POST /api/auth/forgot-password
app.post('/api/auth/forgot-password', async (req, res) => {
  const { email } = req.body;
  const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() || req.ip || req.socket.remoteAddress || '127.0.0.1';

  if (!email || typeof email !== 'string' || !email.trim()) {
    return res.status(400).json({
      success: false,
      message: 'Account email address is required.',
    });
  }

  const cleanEmail = email.trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(cleanEmail)) {
    return res.status(400).json({
      success: false,
      message: 'Please provide a valid email address.',
    });
  }

  // Rate limit: max 5 requests per 15 minutes per email/IP
  const rateLimitKey = `${clientIp}_${cleanEmail}`;
  if (!checkRateLimit(forgotPasswordRateLimits, rateLimitKey, 5, 15 * 60 * 1000)) {
    return res.status(429).json({
      success: false,
      message: 'Too many password reset requests. Please wait 15 minutes before trying again.',
    });
  }

  // Look up user in regular Nexora login accounts (distinct from performance employees)
  const user = store.findUserByEmail(cleanEmail);

  // If user does not exist or is inactive, return standard privacy-preserving confirmation
  if (!user || !user.is_active) {
    return res.json({
      success: true,
      message: 'If the provided email is associated with an active account, password recovery instructions have been sent.',
    });
  }

  // Check email service availability
  if (!emailService.isConfigured()) {
    console.error('[Auth Error] Cannot process forgot-password: SMTP is not configured in server environment.');
    return res.status(503).json({
      success: false,
      message: 'Email delivery service is currently unavailable on the server. Please contact your system administrator.',
    });
  }

  try {
    // Read dynamic reset token expiration setting (default 15 minutes)
    const expirySetting = store.getEffectiveSetting('reset_token_expiry_minutes');
    const expiryMinutes = parseInt(expirySetting?.value || '15', 10) || 15;
    const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

    // Generate secure single-use token and hash
    const rawToken = authService.generateSecureToken();
    const tokenHash = authService.hashToken(rawToken);

    // Save in store (invalidates prior unused tokens)
    store.createPasswordResetToken(user.id, tokenHash, expiresAt);

    // Save in PostgreSQL if DB is available
    try {
      const db = await getDb();
      // Invalidate prior unused tokens
      await db.query(
        'UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL',
        [user.id]
      );
      await db.query(
        'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, created_at) VALUES ($1, $2, $3, NOW())',
        [user.id, tokenHash, expiresAt.toISOString()]
      );
    } catch (dbErr: any) {
      console.warn('[DB Notice] Reset token stored in memory store; PostgreSQL write notice:', dbErr.message);
    }

    // Deliver email via SMTP
    const displayName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username || user.email;
    const emailResult = await emailService.sendPasswordResetEmail({
      recipientEmail: user.email,
      recipientName: displayName,
      resetToken: rawToken,
      expiresAt: expiresAt,
      appUrl: process.env.APP_URL || `${req.protocol}://${req.get('host')}`,
    });

    if (!emailResult.success) {
      return res.status(503).json({
        success: false,
        message: emailResult.error || 'The email delivery service could not dispatch the reset instructions. Please verify SMTP settings.',
      });
    }

    store.logAudit({
      user_id: user.id,
      user_email: user.email,
      action: 'PASSWORD_RESET_REQUESTED',
      module: 'Authentication',
      details: 'Password recovery email dispatched successfully via SMTP.',
      ip_address: clientIp,
    });

    return res.json({
      success: true,
      message: 'If the provided email is associated with an active account, password recovery instructions have been sent.',
    });
  } catch (err: any) {
    console.error('[Auth Error] Error processing forgot-password:', err);
    return res.status(500).json({
      success: false,
      message: 'An unexpected error occurred while processing your request. Please try again.',
    });
  }
});

// GET /api/auth/verify-reset-token
app.get('/api/auth/verify-reset-token', async (req, res) => {
  const { token } = req.query;

  if (!token || typeof token !== 'string' || !token.trim()) {
    return res.status(400).json({
      success: false,
      valid: false,
      message: 'Password reset token is required.',
    });
  }

  const rawToken = token.trim();
  const tokenHash = authService.hashToken(rawToken);

  // Check store
  let tokenRecord = store.findPasswordResetToken(tokenHash);

  // If not found in store, check PostgreSQL
  if (!tokenRecord) {
    try {
      const db = await getDb();
      const dbRes = await db.query('SELECT * FROM password_reset_tokens WHERE token_hash = $1', [tokenHash]);
      if (dbRes.rows && dbRes.rows.length > 0) {
        const r = dbRes.rows[0];
        tokenRecord = {
          id: r.id,
          user_id: r.user_id,
          token_hash: r.token_hash,
          expires_at: new Date(r.expires_at).toISOString(),
          used_at: r.used_at ? new Date(r.used_at).toISOString() : null,
          created_at: new Date(r.created_at).toISOString(),
        };
      }
    } catch {}
  }

  if (!tokenRecord) {
    return res.status(400).json({
      success: false,
      valid: false,
      message: 'This password reset link is invalid or has expired. Please request a new recovery link.',
    });
  }

  if (tokenRecord.used_at) {
    return res.status(400).json({
      success: false,
      valid: false,
      message: 'This password reset link has already been used. Please request a new link if needed.',
    });
  }

  if (new Date(tokenRecord.expires_at) < new Date()) {
    return res.status(400).json({
      success: false,
      valid: false,
      message: 'This password reset link has expired. Please request a new recovery link.',
    });
  }

  const user = store.findUserById(tokenRecord.user_id);
  if (!user || !user.is_active) {
    return res.status(400).json({
      success: false,
      valid: false,
      message: 'The associated user account is inactive or unavailable.',
    });
  }

  // Mask email for user reassurance
  const [local, domain] = user.email.split('@');
  const maskedLocal = local.length > 2 ? `${local[0]}${'*'.repeat(local.length - 2)}${local.slice(-1)}` : `${local[0]}*`;
  const maskedEmail = `${maskedLocal}@${domain}`;

  return res.json({
    success: true,
    valid: true,
    data: {
      email: maskedEmail,
      expires_at: tokenRecord.expires_at,
    },
    message: 'Reset token is valid.',
  });
});

// POST /api/auth/reset-password
app.post('/api/auth/reset-password', async (req, res) => {
  const { token, new_password, confirm_password } = req.body;
  const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() || req.ip || req.socket.remoteAddress || '127.0.0.1';

  // Rate limit: max 5 reset attempts per 15 minutes per IP
  if (!checkRateLimit(resetPasswordRateLimits, clientIp, 5, 15 * 60 * 1000)) {
    return res.status(429).json({
      success: false,
      message: 'Too many password reset attempts. Please wait 15 minutes before trying again.',
    });
  }

  if (!token || typeof token !== 'string' || !token.trim()) {
    return res.status(400).json({
      success: false,
      message: 'Reset token is required.',
    });
  }

  if (!new_password || typeof new_password !== 'string') {
    return res.status(400).json({
      success: false,
      message: 'New password is required.',
    });
  }

  if (confirm_password !== undefined && new_password !== confirm_password) {
    return res.status(400).json({
      success: false,
      message: 'New password and confirmation password do not match.',
    });
  }

  const complexity = authService.validatePasswordComplexity(new_password);
  if (!complexity.valid) {
    return res.status(400).json({
      success: false,
      message: complexity.message || 'Password does not meet enterprise security requirements.',
      errors: complexity.errors,
    });
  }

  const rawToken = token.trim();
  const tokenHash = authService.hashToken(rawToken);

  // Check store
  let tokenRecord = store.findPasswordResetToken(tokenHash);

  // If not found in store, check PostgreSQL
  if (!tokenRecord) {
    try {
      const db = await getDb();
      const dbRes = await db.query('SELECT * FROM password_reset_tokens WHERE token_hash = $1', [tokenHash]);
      if (dbRes.rows && dbRes.rows.length > 0) {
        const r = dbRes.rows[0];
        tokenRecord = {
          id: r.id,
          user_id: r.user_id,
          token_hash: r.token_hash,
          expires_at: new Date(r.expires_at).toISOString(),
          used_at: r.used_at ? new Date(r.used_at).toISOString() : null,
          created_at: new Date(r.created_at).toISOString(),
        };
      }
    } catch {}
  }

  if (!tokenRecord) {
    return res.status(400).json({
      success: false,
      message: 'This password reset link is invalid or has expired. Please request a new recovery email.',
    });
  }

  if (tokenRecord.used_at) {
    return res.status(400).json({
      success: false,
      message: 'This reset link has already been used. Please request a new recovery link.',
    });
  }

  if (new Date(tokenRecord.expires_at) < new Date()) {
    return res.status(400).json({
      success: false,
      message: 'This password reset link has expired. Please request a new recovery link.',
    });
  }

  const user = store.findUserById(tokenRecord.user_id);
  if (!user) {
    return res.status(400).json({
      success: false,
      message: 'The associated user account could not be found.',
    });
  }

  // Prevent password reuse across current password and last 5 passwords
  const existingHistory = Array.isArray(user.password_history) ? user.password_history : [];
  if (await authService.isPasswordReused(new_password, user.password_hash, existingHistory)) {
    return res.status(400).json({
      success: false,
      message: 'For enterprise security, you cannot reuse your current or previous 5 passwords.',
    });
  }

  // Hash new password using centralized bcrypt 12 rounds
  const newHash = await authService.hashPassword(new_password);
  const updatedHistory = [newHash, ...existingHistory].slice(0, 5);

  // Update user in store (activates account upon first-time setup or reset)
  store.updateUser(user.id, {
    password_hash: newHash,
    password_history: updatedHistory,
    is_active: true,
    is_verified: true,
  });

  // Update user in PostgreSQL
  try {
    const db = await getDb();
    await db.query(
      'UPDATE users SET password_hash = $1, password_history = $2, is_active = TRUE, is_verified = TRUE, updated_at = NOW() WHERE id = $3',
      [newHash, JSON.stringify(updatedHistory), user.id]
    );
    await db.query('UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1', [tokenRecord.id]);
  } catch (dbErr: any) {
    console.warn('[DB Notice] Reset password DB write notice:', dbErr.message);
  }

  // Consume token in store
  store.consumePasswordResetToken(tokenRecord.id);

  // Invalidate all existing sessions for this user across both legacy & enterprise stores
  store.revokeAllUserSessions(user.id);
  const revokedJtis = await securityStore.revokeAllUserSessions(user.id, user.id, 'Password reset forced logout');
  for (const j of revokedJtis) store.revokeToken(j);

  store.logAudit({
    user_id: user.id,
    user_email: user.email,
    action: 'PASSWORD_RESET_SUCCESS',
    module: 'Authentication',
    details: 'User successfully completed password reset/activation. All prior active sessions invalidated.',
    ip_address: clientIp,
  });
  await auditService.log({
    req,
    user_id: user.id,
    user_email: user.email,
    module_name: 'Authentication',
    action_type: 'PASSWORD_RESET_SUCCESS',
    entity_type: 'User',
    entity_id: user.id,
    status: 'SUCCESS',
    description: 'Password reset completed; all prior active sessions forcibly invalidated.',
  });

  // Dispatch confirmation email
  try {
    const displayName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username || user.email;
    await emailService.sendPasswordChangedConfirmationEmail({
      recipientEmail: user.email,
      recipientName: displayName,
      changedAt: new Date(),
      appUrl: process.env.APP_URL || `${req.protocol}://${req.get('host')}`,
    });
  } catch (emailErr) {
    console.warn('[Auth Notice] Password reset confirmation email notice:', emailErr);
  }

  return res.json({
    success: true,
    message: 'Your password has been successfully configured. You may now sign in with your new credentials.',
  });
});

app.post('/api/auth/change-password', authenticateToken, async (req: AuthenticatedRequest, res) => {
  const { current_password, new_password } = req.body;
  const userId = req.user!.id;

  if (!current_password || !new_password) {
    return res.status(400).json({
      success: false,
      message: 'Both current password and new password are required.',
    });
  }

  const user = store.findUserById(userId);
  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found.' });
  }

  const match = await authService.verifyPassword(current_password, user.password_hash);
  if (!match) {
    return res.status(400).json({
      success: false,
      message: 'Current password does not match records.',
      errors: [{ field: 'current_password', message: 'Current password is incorrect.' }],
    });
  }

  const complexity = authService.validatePasswordComplexity(new_password);
  if (!complexity.valid) {
    return res.status(400).json({
      success: false,
      message: complexity.message || 'New password does not meet complexity requirements.',
      errors: complexity.errors.map(err => ({ field: 'new_password', message: err })),
    });
  }

  const existingHistory = Array.isArray(user.password_history) ? user.password_history : [];
  if (await authService.isPasswordReused(new_password, user.password_hash, existingHistory)) {
    return res.status(400).json({
      success: false,
      message: 'For enterprise security, you cannot reuse your current or recent 5 passwords.',
      errors: [{ field: 'new_password', message: 'Cannot reuse current or recent 5 passwords.' }],
    });
  }

  const newHash = await authService.hashPassword(new_password);
  const updatedHistory = [newHash, ...existingHistory].slice(0, 5);

  store.updateUser(userId, {
    password_hash: newHash,
    password_history: updatedHistory,
  });

  if (pgPool) {
    try {
      await pgPool.query(
        'UPDATE users SET password_hash = $1, password_history = $2, updated_at = NOW() WHERE id = $3',
        [newHash, JSON.stringify(updatedHistory), userId]
      );
    } catch {}
  }

  // Invalidate other sessions across both legacy & enterprise stores
  const sessions = store.getUserSessions(userId);
  for (const s of sessions) {
    if (s.jti !== req.user!.jti) {
      store.revokeSession(s.id);
    }
  }
  const otherJtis = await securityStore.revokeAllUserSessions(userId, userId, 'Password changed forced logout', req.user!.jti);
  for (const j of otherJtis) store.revokeToken(j);

  store.logAudit({
    user_id: userId,
    user_email: user.email,
    action: 'PASSWORD_CHANGE',
    module: 'Profile',
    details: 'User successfully changed account password. Other sessions invalidated.',
    ip_address: req.ip || '127.0.0.1',
  });
  (res.locals as any).__nexoraAudited = true;
  await auditService.log({
    req,
    module_name: 'Profile',
    action_type: 'PASSWORD_CHANGE',
    entity_type: 'User',
    entity_id: userId,
    status: 'SUCCESS',
    description: `User changed password; ${otherJtis.length} other session(s) forcibly revoked.`,
  });

  // Dispatch confirmation email
  try {
    const displayName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username || user.email;
    await emailService.sendPasswordChangedConfirmationEmail({
      recipientEmail: user.email,
      recipientName: displayName,
      changedAt: new Date(),
      appUrl: process.env.APP_URL || `${req.protocol}://${req.get('host')}`,
    });
  } catch (emailErr) {
    console.warn('[Auth Notice] Password change confirmation email notice:', emailErr);
  }

  res.json({
    success: true,
    message: 'Password updated successfully. Other active sessions have been safely invalidated.',
  });
});

// --- Database-Driven Navigation Menu API ---
app.get('/api/navigation/menu', authenticateToken, (req: AuthenticatedRequest, res) => {
  const user = store.findUserById(req.user!.id);
  const isSuper = req.user!.role === 'super_admin' || (user && user.roles && user.roles.includes('super_admin'));
  const allMenus = store.getNavigationMenus();
  const perms = isSuper ? ['*'] : (user ? store.getUserEffectivePermissions(user) : store.getRolePermissions(req.user!.role));

  const checkPerm = (permCode?: string) => {
    if (isSuper) return true;
    if (!permCode) return true;
    return (
      perms.includes('*') ||
      perms.includes(permCode) ||
      (permCode.startsWith('settings.') && permCode.endsWith('.view') && (perms.includes('settings.view') || perms.includes('menu.settings'))) ||
      (permCode.endsWith('.edit') && perms.includes(permCode.replace('.edit', '.update'))) ||
      (permCode.endsWith('.update') && perms.includes(permCode.replace('.update', '.edit')))
    );
  };

  const buildSubmenu = (parentId: number): any[] => {
    const children = allMenus.filter(m => m.parent_id === parentId);
    const authChildren = isSuper ? children : children.filter(c => checkPerm(c.required_permission));
    return authChildren.map(c => {
      const grandChildren = buildSubmenu(c.id);
      return {
        id: c.id,
        label: c.label,
        icon: c.icon,
        route: c.route,
        is_implemented: c.is_implemented,
        module_tag: c.module_tag,
        children: grandChildren.length > 0 ? grandChildren : undefined,
      };
    });
  };

  const parents = allMenus.filter(m => m.parent_id === null);
  const tree = [];

  for (const parent of parents) {
    const children = buildSubmenu(parent.id);
    const hasChildren = children.length > 0;

    if (hasChildren) {
      if (!isSuper && children.length === 0) {
        continue;
      }
    } else {
      if (!checkPerm(parent.required_permission)) {
        continue;
      }
    }

    tree.push({
      id: parent.id,
      label: parent.label,
      icon: parent.icon,
      route: parent.route,
      is_implemented: parent.is_implemented,
      module_tag: parent.module_tag,
      children,
    });
  }

  res.json({
    success: true,
    message: 'Navigation menu retrieved',
    data: tree,
  });
});

// --- User Profile APIs ---
app.get('/api/users/profile', authenticateToken, (req: AuthenticatedRequest, res) => {
  const user = store.findUserById(req.user!.id);
  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found.' });
  }

  res.json({
    success: true,
    message: 'User profile retrieved successfully.',
    data: {
      id: user.id,
      first_name: user.first_name,
      last_name: user.last_name,
      name: `${user.first_name} ${user.last_name}`,
      email: user.email,
      username: user.username,
      phone: user.phone || '',
      department: user.department || 'Executive',
      profile_picture: user.profile_picture || '',
      role: user.role,
      is_active: user.is_active,
      is_verified: user.is_verified,
      last_login_at: user.last_login_at,
      created_at: user.created_at,
    },
  });
});

app.put('/api/users/profile', authenticateToken, async (req: AuthenticatedRequest, res) => {
  const { first_name, last_name, phone, department, profile_picture } = req.body;
  const userId = req.user!.id;

  const user = store.findUserById(userId);
  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found.' });
  }

  // Validate First Name and Last Name if provided (mandatory, non-empty, trimmed)
  let cleanFirst = user.first_name;
  if (first_name !== undefined) {
    cleanFirst = String(first_name).trim();
    if (!cleanFirst) {
      return res.status(400).json({ success: false, message: 'First name is required and cannot be blank.' });
    }
  }

  let cleanLast = user.last_name;
  if (last_name !== undefined) {
    cleanLast = String(last_name).trim();
    if (!cleanLast) {
      return res.status(400).json({ success: false, message: 'Last name is required and cannot be blank.' });
    }
  }

  const updated = store.updateUser(userId, {
    first_name: cleanFirst,
    last_name: cleanLast,
    name: `${cleanFirst} ${cleanLast}`.trim(),
    phone: phone !== undefined ? String(phone).trim() : user.phone,
    department: department !== undefined ? String(department).trim() : user.department,
    profile_picture: profile_picture !== undefined ? String(profile_picture).trim() : user.profile_picture,
  });

  if (!updated) {
    return res.status(404).json({ success: false, message: 'User not found.' });
  }

  // Mirror updates to PostgreSQL if connected
  if (pgPool) {
    try {
      await pgPool.query(
        `UPDATE users SET first_name = $1, last_name = $2, phone = $3, department = $4, profile_picture = $5, updated_at = NOW() WHERE id = $6`,
        [updated.first_name, updated.last_name, updated.phone, updated.department, updated.profile_picture, userId]
      );
    } catch (pgErr) {
      console.warn('[PostgreSQL Sync Note]', pgErr);
    }
  }

  store.logAudit({
    user_id: userId,
    user_email: updated.email,
    username: updated.username,
    action: 'PROFILE_UPDATED',
    module: 'Profile',
    details: `User updated personal profile (name: ${cleanFirst} ${cleanLast}, phone, department, avatar).`,
    ip_address: req.ip || '127.0.0.1',
  });

  res.json({
    success: true,
    message: 'Profile updated successfully.',
    data: {
      id: updated.id,
      first_name: updated.first_name,
      last_name: updated.last_name,
      name: `${updated.first_name} ${updated.last_name}`,
      email: updated.email,
      username: updated.username,
      phone: updated.phone || '',
      department: updated.department || 'Executive',
      profile_picture: updated.profile_picture || '',
      role: updated.role,
      is_active: updated.is_active,
      is_verified: updated.is_verified,
      last_login_at: updated.last_login_at,
      created_at: updated.created_at,
    },
  });
});

// Dedicated endpoint to upload or link profile picture
app.post('/api/users/profile/picture', authenticateToken, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const user = store.findUserById(userId);
  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found.' });
  }

  const { image_data, image_url, file_name } = req.body;

  if (!image_data && !image_url) {
    return res.status(400).json({ success: false, message: 'Please provide either an image file or a valid image URL.' });
  }

  let finalPictureUrl = '';

  if (image_url) {
    const cleanUrl = String(image_url).trim();
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://') && !cleanUrl.startsWith('/uploads/')) {
      return res.status(400).json({ success: false, message: 'Profile image URL must start with http://, https://, or /uploads/.' });
    }
    finalPictureUrl = cleanUrl;
  } else if (image_data) {
    let base64Content = String(image_data).trim();
    let ext = 'jpg';

    // Match data URI scheme: data:image/(png|jpeg|jpg|webp);base64,....
    const dataUriMatch = base64Content.match(/^data:image\/(jpeg|jpg|png|webp);base64,(.+)$/i);
    if (dataUriMatch) {
      const rawExt = dataUriMatch[1].toLowerCase();
      ext = rawExt === 'jpeg' ? 'jpg' : rawExt;
      base64Content = dataUriMatch[2];
    } else if (file_name) {
      const fileExt = path.extname(file_name).toLowerCase().replace('.', '');
      if (['jpg', 'jpeg', 'png', 'webp'].includes(fileExt)) {
        ext = fileExt === 'jpeg' ? 'jpg' : fileExt;
      } else {
        return res.status(400).json({ success: false, message: 'Invalid image format. Allowed formats: JPEG, JPG, PNG, WEBP.' });
      }
    }

    const allowedExts = ['jpg', 'png', 'webp'];
    if (!allowedExts.includes(ext)) {
      return res.status(400).json({ success: false, message: 'Invalid image format. Allowed formats: JPEG, JPG, PNG, WEBP.' });
    }

    try {
      const buffer = Buffer.from(base64Content, 'base64');
      const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
      if (buffer.length > MAX_SIZE_BYTES) {
        return res.status(400).json({ success: false, message: 'Profile picture exceeds the maximum allowed size of 5 MB.' });
      }

      const filename = `avatar_${userId}_${Date.now()}.${ext}`;
      const filePath = path.join(avatarsDir, filename);

      fs.writeFileSync(filePath, buffer);
      finalPictureUrl = `/uploads/avatars/${filename}`;
    } catch (writeErr) {
      console.error('[Profile Picture Write Error]', writeErr);
      return res.status(500).json({ success: false, message: 'Failed to process or save profile picture.' });
    }
  }

  const updated = store.updateUser(userId, {
    profile_picture: finalPictureUrl,
  });

  if (!updated) {
    return res.status(404).json({ success: false, message: 'User not found.' });
  }

  if (pgPool) {
    try {
      await pgPool.query(
        `UPDATE users SET profile_picture = $1, updated_at = NOW() WHERE id = $2`,
        [finalPictureUrl, userId]
      );
    } catch (pgErr) {
      console.warn('[PostgreSQL Sync Note]', pgErr);
    }
  }

  store.logAudit({
    user_id: userId,
    user_email: updated.email,
    username: updated.username,
    action: 'PROFILE_PICTURE_UPDATED',
    module: 'Profile',
    details: `User updated profile picture (${finalPictureUrl.startsWith('/uploads') ? 'Uploaded File' : 'Image URL'}).`,
    ip_address: req.ip || '127.0.0.1',
  });

  res.json({
    success: true,
    message: 'Profile picture updated successfully.',
    data: {
      profile_picture: finalPictureUrl,
      user: {
        id: updated.id,
        first_name: updated.first_name,
        last_name: updated.last_name,
        name: `${updated.first_name} ${updated.last_name}`,
        email: updated.email,
        username: updated.username,
        phone: updated.phone || '',
        department: updated.department || 'Executive',
        profile_picture: updated.profile_picture || '',
        role: updated.role,
        is_active: updated.is_active,
        is_verified: updated.is_verified,
        last_login_at: updated.last_login_at,
        created_at: updated.created_at,
      },
    },
  });
});


// Request email change (dispatches 6-digit verification code to the new address)
app.post('/api/profile/email/request-change', authenticateToken, async (req: AuthenticatedRequest, res) => {
  const { new_email } = req.body;
  const userId = req.user!.id;
  const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() || req.ip || req.socket.remoteAddress || '127.0.0.1';

  if (!new_email || typeof new_email !== 'string') {
    return res.status(400).json({ success: false, message: 'New email address is required.' });
  }

  const cleanEmail = new_email.trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(cleanEmail)) {
    return res.status(400).json({ success: false, message: 'Please provide a valid email format.' });
  }

  const user = store.findUserById(userId);
  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found.' });
  }

  if (cleanEmail === user.email.toLowerCase()) {
    return res.status(400).json({ success: false, message: 'New email cannot be identical to your current verified email.' });
  }

  // Check if another account is already using this email
  const existingWithEmail = store.findUserByEmail(cleanEmail);
  if (existingWithEmail && existingWithEmail.id !== userId) {
    return res.status(400).json({ success: false, message: 'The specified email address is already in use by another account.' });
  }

  try {
    const { token, code, expires_at } = store.createEmailChangeRequest(userId, cleanEmail);

    // Dispatch verification email
    const displayName = `${user.first_name} ${user.last_name}`.trim() || user.username || 'User';
    await emailService.sendEmailVerificationEmail({
      recipientEmail: cleanEmail,
      recipientName: displayName,
      verificationCode: code,
      verificationToken: token,
      appUrl: process.env.APP_URL || `${req.protocol}://${req.get('host')}`,
    });

    store.logAudit({
      user_id: userId,
      user_email: user.email,
      username: user.username,
      action: 'EMAIL_CHANGE_REQUESTED',
      module: 'Profile',
      details: `Verification request initiated to change email to ${cleanEmail}. Current email remains active until confirmed.`,
      previous_value: user.email,
      updated_value: cleanEmail,
      ip_address: clientIp,
    });

    res.json({
      success: true,
      message: `Verification code sent to ${cleanEmail}. Your current email remains active until confirmed.`,
      data: {
        pending_email: cleanEmail,
        expires_at,
      },
    });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message || 'Failed to initiate email verification.' });
  }
});

// Verify and confirm email change
app.post('/api/profile/email/verify', authenticateToken, (req: AuthenticatedRequest, res) => {
  const { code, token } = req.body;
  const tokenOrCode = (code || token || '').trim();
  const userId = req.user!.id;
  const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() || req.ip || req.socket.remoteAddress || '127.0.0.1';

  if (!tokenOrCode) {
    return res.status(400).json({ success: false, message: 'Verification code or token is required.' });
  }

  const user = store.findUserById(userId);
  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found.' });
  }

  const result = store.verifyEmailChange(tokenOrCode);
  if (!result.success || !result.newEmail) {
    return res.status(400).json({ success: false, message: result.message });
  }

  store.logAudit({
    user_id: userId,
    user_email: result.newEmail,
    username: user.username,
    action: 'EMAIL_CHANGED',
    module: 'Profile',
    details: `Email address successfully updated and verified.`,
    previous_value: user.email,
    updated_value: result.newEmail,
    ip_address: clientIp,
  });

  res.json({
    success: true,
    message: 'Email address successfully updated and verified.',
    data: {
      new_email: result.newEmail,
    },
  });
});

// User's own active sessions
app.get('/api/profile/sessions', authenticateToken, (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const sessions = store.getUserSessions(userId);

  const formatted = sessions.map(s => ({
    id: s.id,
    ip_address: s.ip_address,
    user_agent: s.user_agent,
    created_at: s.created_at,
    last_active_at: s.last_active_at,
    is_current: s.jti === req.user!.jti,
    is_revoked: s.is_revoked,
  }));

  res.json({
    success: true,
    message: 'Personal active sessions retrieved.',
    data: formatted,
  });
});

// Revoke all other sessions for current user
app.delete('/api/profile/sessions/other', authenticateToken, (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const currentJti = req.user!.jti;
  const revokedCount = store.revokeOtherUserSessions(userId, currentJti);

  store.logAudit({
    user_id: userId,
    user_email: req.user!.email,
    action: 'SESSION_REVOKE_OTHERS',
    module: 'Profile',
    details: `User terminated ${revokedCount} other active session(s).`,
    ip_address: req.ip || '127.0.0.1',
  });

  res.json({
    success: true,
    message: `Successfully signed out from ${revokedCount} other active session(s).`,
    revoked_count: revokedCount,
  });
});

// Revoke a specific personal session
app.delete('/api/profile/sessions/:id', authenticateToken, (req: AuthenticatedRequest, res) => {
  const sessionId = parseInt(req.params.id, 10);
  const userId = req.user!.id;
  const userSessions = store.getUserSessions(userId);
  const targetSession = userSessions.find(s => s.id === sessionId);

  if (!targetSession) {
    return res.status(404).json({ success: false, message: 'Session not found in your active sessions.' });
  }

  store.revokeSession(sessionId);

  store.logAudit({
    user_id: userId,
    user_email: req.user!.email,
    action: 'SESSION_REVOKED',
    module: 'Profile',
    details: `User terminated personal session #${sessionId} (${targetSession.ip_address})`,
    ip_address: req.ip || '127.0.0.1',
  });

  res.json({
    success: true,
    message: 'Session successfully revoked.',
  });
});

// ==========================================
// USER MANAGEMENT ENDPOINTS (Section 4 & 9)
// ==========================================

// 1. List Users with Search and Filtering
app.get('/api/users', authenticateToken, requirePermission('users.view'), async (req: AuthenticatedRequest, res) => {
  const query = (req.query.search as string) || (req.query.q as string) || '';
  const roleFilter = (req.query.role as string) || '';
  const statusFilter = (req.query.status as string) || '';

  const filtered = store.searchUsers(query, roleFilter, statusFilter);
  const data = filtered.map(u => ({
    id: u.id,
    first_name: u.first_name,
    last_name: u.last_name,
    name: `${u.first_name} ${u.last_name}`.trim(),
    email: u.email,
    username: u.username,
    phone: u.phone,
    department: u.department,
    profile_picture: u.profile_picture || '',
    role: u.role,
    roles: u.roles && u.roles.length > 0 ? u.roles : [u.role],
    is_active: u.is_active,
    is_verified: u.is_verified,
    last_login_at: u.last_login_at,
    created_at: u.created_at,
  }));

  res.json({
    success: true,
    message: `Retrieved ${data.length} user account(s).`,
    data,
  });
});

// 2. View Single User Details
app.get('/api/users/:id', authenticateToken, requirePermission('users.view'), (req: AuthenticatedRequest, res) => {
  const id = parseInt(req.params.id, 10);
  const user = store.findUserById(id);
  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found.' });
  }

  const effectiveRoles = user.roles && user.roles.length > 0 ? user.roles : [user.role];
  const effectivePerms = store.getUserEffectivePermissions(user);

  res.json({
    success: true,
    message: 'User details retrieved.',
    data: {
      id: user.id,
      first_name: user.first_name,
      last_name: user.last_name,
      name: `${user.first_name} ${user.last_name}`.trim(),
      email: user.email,
      username: user.username,
      phone: user.phone,
      department: user.department,
      profile_picture: user.profile_picture || '',
      role: user.role,
      roles: effectiveRoles,
      is_active: user.is_active,
      is_verified: user.is_verified,
      last_login_at: user.last_login_at,
      created_at: user.created_at,
      permissions: effectivePerms,
    },
  });
});

// 3. Create User with Separate First & Last Name, Validated Email, Department, and Activation Flow
app.post('/api/users', authenticateToken, requirePermission('users.create'), async (req: AuthenticatedRequest, res) => {
  const { first_name, last_name, email, password, role, roles, phone, department, is_active, profile_picture } = req.body;

  const errors: { field: string; message: string }[] = [];
  if (!first_name || !first_name.trim()) {
    errors.push({ field: 'first_name', message: 'First name is required.' });
  }
  if (!last_name || !last_name.trim()) {
    errors.push({ field: 'last_name', message: 'Last name is required.' });
  }
  if (!email || !email.trim()) {
    errors.push({ field: 'email', message: 'Email address is required.' });
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    errors.push({ field: 'email', message: 'Email address must be a valid RFC format.' });
  }

  const cleanEmail = (email || '').trim().toLowerCase();
  if (cleanEmail && store.findUserByEmail(cleanEmail)) {
    errors.push({ field: 'email', message: 'A user account with this email address already exists.' });
  }

  // Validate active department when provided
  const cleanDept = (department || '').trim();
  const deptObj = cleanDept
    ? store.getDepartmentByName(cleanDept) || store.getDepartmentByCode(cleanDept)
    : undefined;
  if (deptObj && deptObj.status !== 'active') {
    errors.push({ field: 'department', message: `Cannot assign inactive department '${deptObj.name}'. Please choose an active department.` });
  }

  // Validate assigned roles
  const assignedRoles: string[] = Array.isArray(roles) && roles.length > 0 ? roles : role ? [role] : [];
  if (assignedRoles.length === 0) {
    errors.push({ field: 'roles', message: 'At least one existing role must be assigned.' });
  } else {
    for (const rCode of assignedRoles) {
      const existingRole = store.getRoleByCode(rCode);
      if (!existingRole) {
        errors.push({ field: 'roles', message: `Specified role '${rCode}' does not exist.` });
      } else if (!existingRole.is_active) {
        errors.push({ field: 'roles', message: `Cannot assign disabled role '${existingRole.name}'.` });
      }
    }
  }

  // If password provided, validate complexity
  if (password) {
    const pwValidation = authService.validatePasswordComplexity(password);
    if (!pwValidation.valid) {
      errors.push({ field: 'password', message: pwValidation.message || 'Password does not meet complexity requirements.' });
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed. Please correct the highlighted fields.',
      errors,
    });
  }

  const primaryRole = assignedRoles[0];
  const cleanFirst = first_name.trim();
  const cleanLast = last_name.trim();
  const cleanPhone = (phone || '').trim();
  const activeStatus = is_active !== false;

  // Single-use account setup & activation token
  const expirySetting = store.getEffectiveSetting('reset_token_expiry_minutes');
  const expiryMinutes = parseInt(expirySetting?.value || '15', 10) || 15;
  const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);
  const setupToken = authService.generateSecureToken();
  const setupTokenHash = authService.hashToken(setupToken);

  // Generate initial secure password hash (never stored or emailed as plaintext)
  const initialPasswordHash = password
    ? await authService.hashPassword(password)
    : await authService.hashPassword(authService.generateSecureToken());

  const newUser = store.createUser({
    first_name: cleanFirst,
    last_name: cleanLast,
    name: `${cleanFirst} ${cleanLast}`.trim(),
    email: cleanEmail,
    username: cleanEmail.split('@')[0],
    phone: cleanPhone,
    department: deptObj ? deptObj.name : cleanDept,
    password_hash: initialPasswordHash,
    role: primaryRole,
    roles: assignedRoles,
    is_active: activeStatus,
    is_verified: password ? true : false,
    profile_picture: (profile_picture || '').trim(),
    last_login_at: null,
  });

  // Save single-use activation/setup token
  store.createPasswordResetToken(newUser.id, setupTokenHash, expiresAt);

  // Mirror to PostgreSQL if connected
  if (pgPool) {
    try {
      await pgPool.query(
        `INSERT INTO users (id, first_name, last_name, email, username, phone, department, password_hash, role, is_active, is_verified, profile_picture, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
         ON CONFLICT (email) DO NOTHING`,
        [newUser.id, cleanFirst, cleanLast, cleanEmail, newUser.username, cleanPhone, newUser.department, initialPasswordHash, primaryRole, activeStatus, !password ? false : true, newUser.profile_picture || '']
      );
      // Insert user_roles
      for (const rCode of assignedRoles) {
        await pgPool.query(
          `INSERT INTO user_roles (user_id, role_code, created_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT DO NOTHING`,
          [newUser.id, rCode]
        );
      }
    } catch (pgErr) {
      console.warn('[PostgreSQL Sync Note]', pgErr);
    }
  }

  // Dispatch activation / password setup email
  try {
    await emailService.sendAccountActivationEmail({
      recipientEmail: newUser.email,
      recipientName: newUser.name,
      setupToken,
      expiresAt,
      appUrl: process.env.APP_URL || `${req.protocol}://${req.get('host')}`,
    });
  } catch (emailErr) {
    console.warn('[User Creation] Activation email dispatch warning:', emailErr);
  }

  store.logAudit({
    user_id: req.user!.id,
    user_email: req.user!.email,
    action: 'USER_CREATED',
    module: 'User Management',
    details: `Created new user account for ${cleanFirst} ${cleanLast} (${cleanEmail}) with role(s): ${assignedRoles.join(', ')}. Activation email sent.`,
    ip_address: req.ip || '127.0.0.1',
  });

  res.status(201).json({
    success: true,
    message: `User account '${cleanFirst} ${cleanLast}' created successfully. An activation email has been sent with a secure password setup link.`,
    data: {
      id: newUser.id,
      first_name: newUser.first_name,
      last_name: newUser.last_name,
      name: newUser.name,
      email: newUser.email,
      username: newUser.username,
      phone: newUser.phone,
      department: newUser.department,
      profile_picture: newUser.profile_picture || '',
      role: newUser.role,
      roles: newUser.roles,
      is_active: newUser.is_active,
      is_verified: newUser.is_verified,
      created_at: newUser.created_at,
      activation_link_sent: true,
    },
  });
});

// 4. Update User Details & Roles
app.put('/api/users/:id', authenticateToken, requirePermission('users.edit'), async (req: AuthenticatedRequest, res) => {
  const id = parseInt(req.params.id, 10);
  const existingUser = store.findUserById(id);
  if (!existingUser) {
    return res.status(404).json({ success: false, message: 'User not found.' });
  }

  const { first_name, last_name, email, role, roles, phone, department, is_active, profile_picture } = req.body;

  const errors: { field: string; message: string }[] = [];
  if (first_name !== undefined && !first_name.trim()) {
    errors.push({ field: 'first_name', message: 'First name cannot be blank.' });
  }
  if (last_name !== undefined && !last_name.trim()) {
    errors.push({ field: 'last_name', message: 'Last name cannot be blank.' });
  }

  if (email !== undefined) {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      errors.push({ field: 'email', message: 'Email cannot be blank.' });
    } else {
      const emailConflict = store.findUserByEmail(cleanEmail);
      if (emailConflict && emailConflict.id !== id) {
        errors.push({ field: 'email', message: 'Another user already uses this email address.' });
      }
    }
  }

  // Validate department if provided
  let validatedDeptName: string | undefined = undefined;
  if (department !== undefined && department.trim()) {
    const cleanDept = department.trim();
    const deptObj = store.getDepartmentByName(cleanDept) || store.getDepartmentByCode(cleanDept);
    if (deptObj && deptObj.status !== 'active') {
      errors.push({ field: 'department', message: `Cannot assign inactive department '${deptObj.name}'.` });
    } else if (deptObj) {
      validatedDeptName = deptObj.name;
    } else {
      validatedDeptName = cleanDept;
    }
  }

  // Validate assigned roles if provided
  let newAssignedRoles: string[] | undefined = undefined;
  if (roles !== undefined || role !== undefined) {
    newAssignedRoles = Array.isArray(roles) && roles.length > 0 ? roles : role ? [role] : [];
    if (newAssignedRoles.length === 0) {
      errors.push({ field: 'roles', message: 'A user must have at least one assigned role.' });
    } else {
      for (const rCode of newAssignedRoles) {
        const existingRole = store.getRoleByCode(rCode);
        if (!existingRole) {
          errors.push({ field: 'roles', message: `Role '${rCode}' does not exist.` });
        }
      }
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed. Please correct the highlighted errors.',
      errors,
    });
  }

  try {
    const updatePayload: Partial<typeof existingUser> = {};
    if (first_name !== undefined) updatePayload.first_name = first_name.trim();
    if (last_name !== undefined) updatePayload.last_name = last_name.trim();
    if (email !== undefined) updatePayload.email = email.trim().toLowerCase();
    if (phone !== undefined) updatePayload.phone = phone.trim();
    if (validatedDeptName !== undefined) updatePayload.department = validatedDeptName;
    if (is_active !== undefined) updatePayload.is_active = !!is_active;
    if (profile_picture !== undefined) updatePayload.profile_picture = String(profile_picture).trim();
    if (newAssignedRoles && newAssignedRoles.length > 0) {
      updatePayload.roles = newAssignedRoles;
      updatePayload.role = newAssignedRoles[0];
    }

    const updated = store.updateUser(id, updatePayload);
    if (!updated) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    // Mirror updates to PostgreSQL
    if (pgPool) {
      try {
        await pgPool.query(
          `UPDATE users SET first_name = $1, last_name = $2, email = $3, phone = $4, department = $5, role = $6, is_active = $7, profile_picture = $8, updated_at = NOW() WHERE id = $9`,
          [updated.first_name, updated.last_name, updated.email, updated.phone, updated.department, updated.role, updated.is_active, updated.profile_picture || '', id]
        );
        if (newAssignedRoles && newAssignedRoles.length > 0) {
          await pgPool.query('DELETE FROM user_roles WHERE user_id = $1', [id]);
          for (const rCode of newAssignedRoles) {
            await pgPool.query('INSERT INTO user_roles (user_id, role_code, created_at) VALUES ($1, $2, NOW()) ON CONFLICT DO NOTHING', [id, rCode]);
          }
        }
      } catch (pgErr) {
        console.warn('[PostgreSQL Sync Note]', pgErr);
      }
    }

    store.logAudit({
      user_id: req.user!.id,
      user_email: req.user!.email,
      action: 'USER_UPDATED',
      module: 'User Management',
      details: `Updated user account details for ${updated.name} (ID: ${id})`,
      ip_address: req.ip || '127.0.0.1',
    });

    res.json({
      success: true,
      message: `User '${updated.name}' updated successfully.`,
      data: updated,
    });
  } catch (err: any) {
    return res.status(400).json({
      success: false,
      message: err.message || 'Failed to update user.',
    });
  }
});

// 5. Delete User with Last Super Admin Safeguard
app.delete('/api/users/:id', authenticateToken, requirePermission('users.delete'), async (req: AuthenticatedRequest, res) => {
  const id = parseInt(req.params.id, 10);
  const targetUser = store.findUserById(id);
  if (!targetUser) {
    return res.status(404).json({ success: false, message: 'User not found.' });
  }

  const result = store.deleteUser(id);
  if (!result.success) {
    return res.status(400).json({ success: false, message: result.message });
  }

  if (pgPool) {
    try {
      await pgPool.query('DELETE FROM user_roles WHERE user_id = $1', [id]);
      await pgPool.query('DELETE FROM users WHERE id = $1', [id]);
    } catch (pgErr) {
      console.warn('[PostgreSQL Sync Note]', pgErr);
    }
  }

  store.logAudit({
    user_id: req.user!.id,
    user_email: req.user!.email,
    action: 'USER_DELETED',
    module: 'User Management',
    details: `Deleted user record: ${targetUser.name} (${targetUser.email})`,
    ip_address: req.ip || '127.0.0.1',
  });

  res.json({
    success: true,
    message: result.message,
  });
});

// 6. Activate or Disable User Status
app.put('/api/users/:id/status', authenticateToken, requirePermission('users.disable'), async (req: AuthenticatedRequest, res) => {
  const id = parseInt(req.params.id, 10);
  const { is_active } = req.body;

  if (is_active === undefined) {
    return res.status(400).json({ success: false, message: 'Account status (is_active) is required.' });
  }

  try {
    const updated = store.updateUser(id, { is_active: !!is_active });
    if (!updated) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    if (!is_active) {
      // Invalidate all active sessions for the disabled user
      const userSessions = store.getUserSessions(id);
      for (const s of userSessions) {
        store.revokeSession(s.id);
      }
    }

    if (pgPool) {
      try {
        await pgPool.query('UPDATE users SET is_active = $1, updated_at = NOW() WHERE id = $2', [!!is_active, id]);
      } catch (pgErr) {
        console.warn('[PostgreSQL Sync Note]', pgErr);
      }
    }

    store.logAudit({
      user_id: req.user!.id,
      user_email: req.user!.email,
      action: is_active ? 'USER_ACTIVATED' : 'USER_DISABLED',
      module: 'User Management',
      details: `${is_active ? 'Activated' : 'Disabled'} user account: ${updated.name} (${updated.email})`,
      ip_address: req.ip || '127.0.0.1',
    });

    res.json({
      success: true,
      message: `User account '${updated.name}' has been ${is_active ? 'activated' : 'disabled'}.`,
      data: updated,
    });
  } catch (err: any) {
    return res.status(400).json({
      success: false,
      message: err.message || 'Operation failed.',
    });
  }
});

// 7. Admin-Initiated Password Reset (Dispatches reset email with configured expiration)
app.post('/api/users/:id/reset-password', authenticateToken, requirePermission('users.edit'), async (req: AuthenticatedRequest, res) => {
  const id = parseInt(req.params.id, 10);
  const targetUser = store.findUserById(id);
  if (!targetUser) {
    return res.status(404).json({ success: false, message: 'User account not found.' });
  }

  const expirySetting = store.getEffectiveSetting('reset_token_expiry_minutes');
  const expiryMinutes = parseInt(expirySetting?.value || '15', 10) || 15;
  const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

  const resetToken = authService.generateSecureToken();
  const tokenHash = authService.hashToken(resetToken);

  store.createPasswordResetToken(targetUser.id, tokenHash, expiresAt);

  const adminName = req.user?.username || req.user?.email || 'System Administrator';
  const displayName = targetUser.name || `${targetUser.first_name} ${targetUser.last_name}`.trim();

  try {
    await emailService.sendAdminInitiatedPasswordResetEmail({
      recipientEmail: targetUser.email,
      recipientName: displayName,
      resetToken,
      expiresAt,
      adminName,
      appUrl: process.env.APP_URL || `${req.protocol}://${req.get('host')}`,
    });
  } catch (emailErr: any) {
    return res.status(500).json({ success: false, message: `Failed to dispatch reset email: ${emailErr.message}` });
  }

  store.logAudit({
    user_id: req.user!.id,
    user_email: req.user!.email,
    action: 'ADMIN_PASSWORD_RESET_DISPATCHED',
    module: 'User Management',
    details: `Admin requested password reset for ${targetUser.email} (Link expires in ${expiryMinutes} minutes)`,
    ip_address: req.ip || '127.0.0.1',
  });

  res.json({
    success: true,
    message: `Password reset email sent to ${targetUser.email}. The link expires in ${expiryMinutes} minutes.`,
  });
});

// 8. Resend Account Setup / Activation Email
app.post('/api/users/:id/resend-activation', authenticateToken, requirePermission('users.edit'), async (req: AuthenticatedRequest, res) => {
  const id = parseInt(req.params.id, 10);
  const targetUser = store.findUserById(id);
  if (!targetUser) {
    return res.status(404).json({ success: false, message: 'User account not found.' });
  }

  const expirySetting = store.getEffectiveSetting('reset_token_expiry_minutes');
  const expiryMinutes = parseInt(expirySetting?.value || '15', 10) || 15;
  const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

  const setupToken = authService.generateSecureToken();
  const tokenHash = authService.hashToken(setupToken);

  store.createPasswordResetToken(targetUser.id, tokenHash, expiresAt);

  const displayName = targetUser.name || `${targetUser.first_name} ${targetUser.last_name}`.trim();

  try {
    await emailService.sendAccountActivationEmail({
      recipientEmail: targetUser.email,
      recipientName: displayName,
      setupToken,
      expiresAt,
      appUrl: process.env.APP_URL || `${req.protocol}://${req.get('host')}`,
    });
  } catch (emailErr: any) {
    return res.status(500).json({ success: false, message: `Failed to dispatch activation email: ${emailErr.message}` });
  }

  store.logAudit({
    user_id: req.user!.id,
    user_email: req.user!.email,
    action: 'ACTIVATION_EMAIL_RESENT',
    module: 'User Management',
    details: `Resent account activation email to ${targetUser.email}`,
    ip_address: req.ip || '127.0.0.1',
  });

  res.json({
    success: true,
    message: `Account setup and activation instructions resent to ${targetUser.email}.`,
  });
});

// ==========================================
// DEPARTMENT MANAGEMENT ENDPOINTS
// ==========================================

// 1. List All Departments (accessible to roles managing departments, users, or workforce performance)
app.get('/api/departments', authenticateToken, (req: AuthenticatedRequest, res) => {
  const user = store.findUserById(req.user!.id);
  const isSuper = req.user!.role === 'super_admin' || Boolean(user?.roles?.includes('super_admin'));
  if (!isSuper) {
    const perms = user ? store.getUserEffectivePermissions(user) : store.getRolePermissions(req.user!.role);
    const allowed = [
      'departments.view',
      'departments.read',
      'users.view',
      'users.create',
      'users.edit',
      'users.update',
      'performance.view',
      'performance.manage',
    ];
    if (!perms.includes('*') && !allowed.some(p => perms.includes(p))) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: Missing permission required to view departments.',
      });
    }
  }
  const search = (req.query.search as string) || '';
  const status = (req.query.status as string) || '';
  const departments = store.getDepartments({ search, status });
  res.json({
    success: true,
    message: `Retrieved ${departments.length} department(s).`,
    data: departments,
  });
});

// 2. View Single Department
app.get('/api/departments/:id', authenticateToken, requirePermission('departments.view'), (req: AuthenticatedRequest, res) => {
  const id = parseInt(req.params.id, 10);
  const dept = store.getDepartmentById(id);
  if (!dept) {
    return res.status(404).json({ success: false, message: 'Department not found.' });
  }
  const employee_count = store.getDepartmentEmployeeCount(dept.name);
  res.json({
    success: true,
    message: 'Department details retrieved.',
    data: { ...dept, employee_count },
  });
});

// 3. Create Department (Enforces Unique Code and Name)
app.post('/api/departments', authenticateToken, requirePermission('departments.create'), async (req: AuthenticatedRequest, res) => {
  const { code, name, description, status } = req.body;
  if (!code || !code.trim()) {
    return res.status(400).json({ success: false, message: 'Department code is required.' });
  }
  if (!name || !name.trim()) {
    return res.status(400).json({ success: false, message: 'Department name is required.' });
  }

  try {
    const newDept = store.createDepartment({
      code: code.trim(),
      name: name.trim(),
      description: description ? description.trim() : '',
      status: status === 'disabled' ? 'disabled' : 'active',
    });

    if (pgPool) {
      try {
        await pgPool.query(
          'INSERT INTO departments (id, code, name, description, status, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, NOW(), NOW()) ON CONFLICT (code) DO NOTHING',
          [newDept.id, newDept.code, newDept.name, newDept.description, newDept.status]
        );
      } catch {}
    }

    store.logAudit({
      user_id: req.user!.id,
      user_email: req.user!.email,
      action: 'DEPARTMENT_CREATED',
      module: 'Departments',
      details: `Created department '${newDept.name}' (${newDept.code})`,
      ip_address: req.ip || '127.0.0.1',
    });

    res.status(201).json({
      success: true,
      message: `Department '${newDept.name}' created successfully.`,
      data: { ...newDept, employee_count: 0 },
    });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message || 'Failed to create department.' });
  }
});

// 4. Update Department
app.put('/api/departments/:id', authenticateToken, requirePermission('departments.edit'), async (req: AuthenticatedRequest, res) => {
  const id = parseInt(req.params.id, 10);
  const { code, name, description, status } = req.body;

  try {
    const updated = store.updateDepartment(id, { code, name, description, status });
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Department not found.' });
    }

    if (pgPool) {
      try {
        await pgPool.query(
          'UPDATE departments SET code = $1, name = $2, description = $3, status = $4, updated_at = NOW() WHERE id = $5',
          [updated.code, updated.name, updated.description, updated.status, id]
        );
      } catch {}
    }

    store.logAudit({
      user_id: req.user!.id,
      user_email: req.user!.email,
      action: 'DEPARTMENT_UPDATED',
      module: 'Departments',
      details: `Updated department '${updated.name}' (${updated.code})`,
      ip_address: req.ip || '127.0.0.1',
    });

    const employee_count = store.getDepartmentEmployeeCount(updated.name);
    res.json({
      success: true,
      message: `Department '${updated.name}' updated successfully.`,
      data: { ...updated, employee_count },
    });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message || 'Failed to update department.' });
  }
});

// 5. Enable or Disable Department
app.put('/api/departments/:id/status', authenticateToken, requirePermission('departments.disable'), (req: AuthenticatedRequest, res) => {
  const id = parseInt(req.params.id, 10);
  const { status } = req.body;
  if (status !== 'active' && status !== 'disabled') {
    return res.status(400).json({ success: false, message: "Status must be 'active' or 'disabled'." });
  }

  const updated = store.toggleDepartmentStatus(id, status);
  if (!updated) {
    return res.status(404).json({ success: false, message: 'Department not found.' });
  }

  store.logAudit({
    user_id: req.user!.id,
    user_email: req.user!.email,
    action: 'DEPARTMENT_STATUS_TOGGLED',
    module: 'Departments',
    details: `Changed department '${updated.name}' status to ${status}`,
    ip_address: req.ip || '127.0.0.1',
  });

  const employee_count = store.getDepartmentEmployeeCount(updated.name);
  res.json({
    success: true,
    message: `Department '${updated.name}' is now ${status}.`,
    data: { ...updated, employee_count },
  });
});

// 6. Delete Department with Safe Check (Blocked if Users Assigned)
app.delete('/api/departments/:id', authenticateToken, requirePermission('departments.delete'), (req: AuthenticatedRequest, res) => {
  const id = parseInt(req.params.id, 10);
  const dept = store.getDepartmentById(id);
  if (!dept) {
    return res.status(404).json({ success: false, message: 'Department not found.' });
  }

  const result = store.deleteDepartment(id);
  if (!result.success) {
    return res.status(400).json({ success: false, message: result.message });
  }

  if (pgPool) {
    try {
      pgPool.query('DELETE FROM departments WHERE id = $1', [id]);
    } catch {}
  }

  store.logAudit({
    user_id: req.user!.id,
    user_email: req.user!.email,
    action: 'DEPARTMENT_DELETED',
    module: 'Departments',
    details: `Deleted department '${dept.name}' (${dept.code})`,
    ip_address: req.ip || '127.0.0.1',
  });

  res.json({
    success: true,
    message: result.message,
  });
});

// ==========================================
// ROLE & PERMISSION MANAGEMENT ENDPOINTS (Section 5, 6, 8)
// ==========================================

// 1. List All Roles
app.get('/api/roles', authenticateToken, requirePermission('roles.view'), (req: AuthenticatedRequest, res) => {
  const roles = store.getRoles();
  const data = roles.map(r => {
    const permissions = store.getRolePermissions(r.code);
    const userCount = store.getRoleUserCount(r.code);
    return {
      id: r.id,
      name: r.name,
      code: r.code,
      description: r.description,
      is_system: r.is_system,
      is_active: r.is_active,
      permissions,
      user_count: userCount,
      created_at: r.created_at,
      updated_at: r.updated_at,
    };
  });

  res.json({
    success: true,
    message: `Retrieved ${data.length} system role(s).`,
    data,
  });
});

// 2. View Single Role
app.get('/api/roles/:id', authenticateToken, requirePermission('roles.view'), (req: AuthenticatedRequest, res) => {
  const id = parseInt(req.params.id, 10);
  const role = store.getRoleById(id);
  if (!role) {
    return res.status(404).json({ success: false, message: 'Role not found.' });
  }

  const permissions = store.getRolePermissions(role.code);
  const userCount = store.getRoleUserCount(role.code);

  res.json({
    success: true,
    message: 'Role details retrieved.',
    data: {
      id: role.id,
      name: role.name,
      code: role.code,
      description: role.description,
      is_system: role.is_system,
      is_active: role.is_active,
      permissions,
      user_count: userCount,
      created_at: role.created_at,
      updated_at: role.updated_at,
    },
  });
});

// 3. Create Role
app.post('/api/roles', authenticateToken, requirePermission('roles.create'), async (req: AuthenticatedRequest, res) => {
  const { name, code, description, is_active, permissions } = req.body;

  const errors: { field: string; message: string }[] = [];
  if (!name || !name.trim()) {
    errors.push({ field: 'name', message: 'Role name is required.' });
  }
  if (!code || !code.trim()) {
    errors.push({ field: 'code', message: 'Role code or slug is required.' });
  } else {
    const slug = code.trim().toLowerCase().replace(/\s+/g, '_');
    if (store.getRoleByCode(slug)) {
      errors.push({ field: 'code', message: `Role code '${slug}' is already taken.` });
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed. Please correct the highlighted fields.',
      errors,
    });
  }

  const slug = code.trim().toLowerCase().replace(/\s+/g, '_');
  const cleanName = name.trim();
  const cleanDesc = (description || '').trim();
  const activeStatus = is_active !== false;
  // Creating a role does not automatically grant permissions unless explicitly specified
  const initialPerms = Array.isArray(permissions) ? permissions : [];

  const newRole = store.createRole(
    {
      name: cleanName,
      code: slug,
      description: cleanDesc,
      is_system: false,
      is_active: activeStatus,
    },
    initialPerms
  );

  if (pgPool) {
    try {
      await pgPool.query(
        `INSERT INTO roles (id, name, code, description, is_system, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, false, $5, NOW(), NOW())
         ON CONFLICT (code) DO NOTHING`,
        [newRole.id, cleanName, slug, cleanDesc, activeStatus]
      );
      for (const p of initialPerms) {
        await pgPool.query(
          `INSERT INTO role_permissions (role, permission_code) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [slug, p]
        );
      }
    } catch (pgErr) {
      console.warn('[PostgreSQL Sync Note]', pgErr);
    }
  }

  store.logAudit({
    user_id: req.user!.id,
    user_email: req.user!.email,
    action: 'ROLE_CREATED',
    module: 'Role Management',
    details: `Created new role '${cleanName}' [${slug}] with ${initialPerms.length} initial permission(s)`,
    ip_address: req.ip || '127.0.0.1',
  });

  res.status(201).json({
    success: true,
    message: `Role '${cleanName}' created successfully.`,
    data: {
      ...newRole,
      permissions: initialPerms,
      user_count: 0,
    },
  });
});

// 4. Update Role Details & Permissions
app.put('/api/roles/:id', authenticateToken, requirePermission('roles.edit'), async (req: AuthenticatedRequest, res) => {
  const id = parseInt(req.params.id, 10);
  const role = store.getRoleById(id);
  if (!role) {
    return res.status(404).json({ success: false, message: 'Role not found.' });
  }

  const { name, description, is_active, permissions } = req.body;
  const errors: { field: string; message: string }[] = [];

  if (name !== undefined && !name.trim()) {
    errors.push({ field: 'name', message: 'Role name cannot be empty.' });
  }

  if (role.is_system && is_active === false) {
    errors.push({ field: 'is_active', message: `System-critical role '${role.name}' cannot be deactivated.` });
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed.',
      errors,
    });
  }

  const updatedFields: Partial<typeof role> = {};
  if (name !== undefined) updatedFields.name = name.trim();
  if (description !== undefined) updatedFields.description = description.trim();
  if (is_active !== undefined) updatedFields.is_active = !!is_active;

  const updatedRole = store.updateRole(id, updatedFields, permissions);
  if (!updatedRole) {
    return res.status(404).json({ success: false, message: 'Role not found.' });
  }

  if (pgPool) {
    try {
      await pgPool.query(
        `UPDATE roles SET name = $1, description = $2, is_active = $3, updated_at = NOW() WHERE id = $4`,
        [updatedRole.name, updatedRole.description, updatedRole.is_active, id]
      );
      if (permissions !== undefined) {
        await pgPool.query(`DELETE FROM role_permissions WHERE role = $1`, [updatedRole.code]);
        for (const p of permissions) {
          await pgPool.query(`INSERT INTO role_permissions (role, permission_code) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [updatedRole.code, p]);
        }
      }
    } catch (pgErr) {
      console.warn('[PostgreSQL Sync Note]', pgErr);
    }
  }

  store.logAudit({
    user_id: req.user!.id,
    user_email: req.user!.email,
    action: 'ROLE_UPDATED',
    module: 'Role Management',
    details: `Updated role definition for '${updatedRole.name}' [${updatedRole.code}]`,
    ip_address: req.ip || '127.0.0.1',
  });

  const currentPerms = store.getRolePermissions(updatedRole.code);

  res.json({
    success: true,
    message: `Role '${updatedRole.name}' updated successfully.`,
    data: {
      ...updatedRole,
      permissions: currentPerms,
      user_count: store.getRoleUserCount(updatedRole.code),
    },
  });
});

// 5. Delete Role
app.delete('/api/roles/:id', authenticateToken, requirePermission('roles.delete'), async (req: AuthenticatedRequest, res) => {
  const id = parseInt(req.params.id, 10);
  const role = store.getRoleById(id);
  if (!role) {
    return res.status(404).json({ success: false, message: 'Role not found.' });
  }

  const result = store.deleteRole(id);
  if (!result.success) {
    return res.status(400).json({ success: false, message: result.message });
  }

  if (pgPool) {
    try {
      await pgPool.query('DELETE FROM role_permissions WHERE role = $1', [role.code]);
      await pgPool.query('DELETE FROM roles WHERE id = $1', [id]);
    } catch (pgErr) {
      console.warn('[PostgreSQL Sync Note]', pgErr);
    }
  }

  store.logAudit({
    user_id: req.user!.id,
    user_email: req.user!.email,
    action: 'ROLE_DELETED',
    module: 'Role Management',
    details: `Deleted role: '${role.name}' [${role.code}]`,
    ip_address: req.ip || '127.0.0.1',
  });

  res.json({
    success: true,
    message: result.message,
  });
});

// 6. Toggle Role Status
app.put('/api/roles/:id/status', authenticateToken, requirePermission('roles.disable'), async (req: AuthenticatedRequest, res) => {
  const id = parseInt(req.params.id, 10);
  const role = store.getRoleById(id);
  if (!role) {
    return res.status(404).json({ success: false, message: 'Role not found.' });
  }

  const { is_active } = req.body;
  if (role.is_system && is_active === false) {
    return res.status(400).json({ success: false, message: `System-critical role '${role.name}' cannot be disabled.` });
  }

  const updated = store.updateRole(id, { is_active: !!is_active });
  if (!updated) {
    return res.status(404).json({ success: false, message: 'Role not found.' });
  }

  if (pgPool) {
    try {
      await pgPool.query('UPDATE roles SET is_active = $1, updated_at = NOW() WHERE id = $2', [!!is_active, id]);
    } catch (pgErr) {
      console.warn('[PostgreSQL Sync Note]', pgErr);
    }
  }

  store.logAudit({
    user_id: req.user!.id,
    user_email: req.user!.email,
    action: is_active ? 'ROLE_ACTIVATED' : 'ROLE_DISABLED',
    module: 'Role Management',
    details: `${is_active ? 'Activated' : 'Disabled'} role: '${role.name}'`,
    ip_address: req.ip || '127.0.0.1',
  });

  res.json({
    success: true,
    message: `Role '${role.name}' ${is_active ? 'activated' : 'disabled'} successfully.`,
    data: updated,
  });
});

// 7. Update Permissions for Role (by ID or Code)
app.put(['/api/roles/:id/permissions', '/api/roles/:code/permissions'], authenticateToken, requirePermission('permissions.assign'), async (req: AuthenticatedRequest, res) => {
  const param = req.params.id || req.params.code;
  let role = !isNaN(Number(param)) ? store.getRoleById(Number(param)) : store.getRoleByCode(param);

  if (!role) {
    return res.status(404).json({ success: false, message: 'Role not found.' });
  }

  const { permissions } = req.body;
  if (!Array.isArray(permissions)) {
    return res.status(400).json({ success: false, message: 'Permissions payload must be an array of permission strings.' });
  }

  // Prevent duplicate assignments
  const uniquePerms = Array.from(new Set(permissions));

  store.setRolePermissions(role.code, uniquePerms);

  if (pgPool) {
    try {
      await pgPool.query('DELETE FROM role_permissions WHERE role = $1', [role.code]);
      for (const p of uniquePerms) {
        await pgPool.query('INSERT INTO role_permissions (role, permission_code) VALUES ($1, $2) ON CONFLICT DO NOTHING', [role.code, p]);
      }
    } catch (pgErr) {
      console.warn('[PostgreSQL Sync Note]', pgErr);
    }
  }

  store.logAudit({
    user_id: req.user!.id,
    user_email: req.user!.email,
    action: 'PERMISSIONS_ASSIGNED',
    module: 'Permissions',
    details: `Updated permissions for role '${role.name}' (${uniquePerms.length} assigned)`,
    ip_address: req.ip || '127.0.0.1',
  });

  res.json({
    success: true,
    message: `Permissions updated successfully for role '${role.name}'.`,
    data: {
      role: role.code,
      permissions: uniquePerms,
    },
  });
});

// 8. List All System Permissions
app.get('/api/permissions', authenticateToken, requirePermission('permissions.view'), (req: AuthenticatedRequest, res) => {
  const perms = store.getPermissions();
  res.json({
    success: true,
    message: `Retrieved ${perms.length} system permission(s).`,
    data: perms,
  });
});

// 9. Menu Items Catalog for Permission Matrix (Section 8)
app.get('/api/navigation/menu-items', authenticateToken, requirePermission('roles.view'), (req: AuthenticatedRequest, res) => {
  const allMenus = store.getNavigationMenus();
  res.json({
    success: true,
    message: 'Menu items retrieved for matrix mapping.',
    data: allMenus,
  });
});

// --- Role-Specific Dashboard Data API ---
app.get('/api/dashboard/widgets', authenticateToken, async (req: AuthenticatedRequest, res) => {
  const role = req.user!.role;
  const users = store.getAllUsers();
  const recentAudit = store.getAuditTrail().slice(0, 5);
  const activeSessionCount = store.getUserSessions(req.user!.id).filter(s => !s.is_revoked).length;
  const pgHealth = await checkPostgresHealth();

  const summaryCards = [
    {
      id: 'active_sessions',
      title: 'Active Sessions',
      value: activeSessionCount,
      status: 'normal',
      description: 'Your authenticated session tokens',
      permission: 'menu.dashboard',
    },
    {
      id: 'registered_accounts',
      title: 'Total Accounts',
      value: users.length,
      status: 'normal',
      description: 'Persistent user accounts in database',
      permission: 'action.users_view',
    },
    {
      id: 'system_roles',
      title: 'Configured Roles',
      value: store.getRoles().filter(r => r.is_active).length,
      status: 'success',
      description: 'Active RBAC role definitions in database',
      permission: 'menu.dashboard',
    },
  ];

  const filteredCards = role === 'super_admin' ? summaryCards : summaryCards.filter(c => c.permission === 'menu.dashboard');

  res.json({
    success: true,
    message: 'Dashboard data retrieved',
    data: {
      summaryCards: filteredCards,
      recentActivity: recentAudit.map(a => ({
        id: a.id,
        action: a.action,
        module: a.module,
        details: a.details,
        user_email: a.user_email,
        timestamp: a.timestamp,
      })),
      systemReadiness: {
        database: pgHealth.connected ? 'connected' : 'unavailable',
        rbac: 'enforced',
        navigation: 'database_driven',
      },
    },
  });
});

// --- Unified Settings & Configuration Governance APIs ---
// 1. Get Effective System Settings (all categories, or filtered by ?category=)
app.get('/api/settings/effective', authenticateToken, requirePermission('settings.view'), (req: AuthenticatedRequest, res) => {
  const category = (req.query.category as string) || undefined;
  const result = store.getEffectiveSettings(category);
  res.json({
    success: true,
    message: 'Effective system settings retrieved',
    data: result,
  });
});

// 2. Get Category Definitions and Effective Settings
app.get('/api/settings/category/:category', authenticateToken, requirePermission('settings.view'), (req: AuthenticatedRequest, res) => {
  const category = req.params.category;
  const result = store.getEffectiveSettings(category);
  res.json({
    success: true,
    message: `Settings retrieved for category '${category}'`,
    data: result,
  });
});

// 3. Update Category Settings (Database Override)
app.post('/api/settings/category/:category', authenticateToken, requirePermission('settings.edit'), (req: AuthenticatedRequest, res) => {
  const category = req.params.category;
  const updates = req.body || {};
  const prevSettings = store.getSettings();

  const result = store.updateCategorySettings(category, updates, req.user!.email);

  store.logAudit({
    user_id: req.user!.id,
    user_email: req.user!.email,
    username: req.user!.username,
    action: 'CATEGORY_SETTINGS_UPDATED',
    module: 'Settings',
    details: `Updated ${result.updated.length} setting(s) in category '${category}': ${result.updated.join(', ')}`,
    previous_value: JSON.stringify(prevSettings),
    updated_value: JSON.stringify(store.getSettings()),
    ip_address: req.ip || '127.0.0.1',
  });

  if (category === 'email_smtp') {
    emailService.reloadConfig();
  }

  res.json({
    success: true,
    message: `Settings for '${category}' saved successfully.`,
    data: store.getEffectiveSettings(category),
  });
});

// 4. Reset Category to .env Defaults (Removes Database Overrides for that category)
app.post('/api/settings/category/:category/reset', authenticateToken, requirePermission('settings.edit'), (req: AuthenticatedRequest, res) => {
  const category = req.params.category;
  const result = store.resetSettingCategory(category);

  if (category === 'email_smtp') {
    emailService.reloadConfig();
  }

  store.logAudit({
    user_id: req.user!.id,
    user_email: req.user!.email,
    username: req.user!.username,
    action: 'CATEGORY_SETTINGS_RESET',
    module: 'Settings',
    details: `Reverted ${result.count} override(s) in category '${category}' to .env defaults.`,
    ip_address: req.ip || '127.0.0.1',
  });

  res.json({
    success: true,
    message: `Category '${category}' reset to original .env defaults. Removed ${result.count} database override(s).`,
    data: store.getEffectiveSettings(category),
  });
});

// 5. Reset Single Setting Key to .env Default
app.post('/api/settings/key/:key/reset', authenticateToken, requirePermission('settings.edit'), (req: AuthenticatedRequest, res) => {
  const key = req.params.key;
  const removed = store.resetSettingKey(key);

  store.logAudit({
    user_id: req.user!.id,
    user_email: req.user!.email,
    username: req.user!.username,
    action: 'SETTING_KEY_RESET',
    module: 'Settings',
    details: `Reverted setting '${key}' to original .env default.`,
    ip_address: req.ip || '127.0.0.1',
  });

  res.json({
    success: true,
    message: `Setting '${key}' reverted to .env default.`,
    removed,
  });
});

// 6. Reset ALL Configurable Settings to .env Defaults
app.post('/api/settings/reset-all', authenticateToken, requirePermission('settings.edit'), (req: AuthenticatedRequest, res) => {
  const result = store.resetAllSettings();

  store.logAudit({
    user_id: req.user!.id,
    user_email: req.user!.email,
    username: req.user!.username,
    action: 'ALL_SETTINGS_RESET',
    module: 'Settings',
    details: `All database overrides cleared (${result.count} cleared). Reverted to original .env defaults.`,
    ip_address: req.ip || '127.0.0.1',
  });

  res.json({
    success: true,
    message: `All configurable settings have been successfully restored to their original .env defaults (${result.count} overrides removed).`,
    data: store.getEffectiveSettings(),
  });
});

// 7. Test Email & SMTP Connectivity
app.post('/api/settings/email-smtp/test', authenticateToken, requirePermission('settings.edit'), async (req: AuthenticatedRequest, res) => {
  const recipientEmail = req.body.recipient_email || req.user!.email;

  if (!recipientEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
    return res.status(400).json({ success: false, message: 'Valid recipient email address is required.' });
  }

  const result = await emailService.sendTestEmail({
    recipientEmail,
    senderName: process.env.SMTP_FROM_NAME || 'Nexora Services',
    senderEmail: process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER,
  });

  store.logAudit({
    user_id: req.user!.id,
    user_email: req.user!.email,
    username: req.user!.username,
    action: result.success ? 'SMTP_TEST_EMAIL_SUCCESS' : 'SMTP_TEST_EMAIL_FAILED',
    module: 'Settings',
    details: result.success
      ? `Successfully dispatched SMTP test verification email to ${recipientEmail}`
      : `Failed to dispatch SMTP test verification email to ${recipientEmail}: ${result.error}`,
    ip_address: req.ip || '127.0.0.1',
  });

  if (result.success) {
    return res.json({
      success: true,
      message: `Test email successfully dispatched to ${recipientEmail}. Please check your inbox or spam folder.`,
      messageId: result.messageId,
    });
  } else {
    return res.status(500).json({
      success: false,
      message: result.error || 'Failed to send test verification email. Please check your SMTP credentials.',
    });
  }
});

// 7b. Test SMTP Connection Handshake (without sending email)
app.post('/api/settings/email-smtp/verify-connection', authenticateToken, requirePermission('settings.view'), async (req: AuthenticatedRequest, res) => {
  const result = await emailService.testConnection();
  if (result.success) {
    return res.json({
      success: true,
      message: 'SMTP handshake connection verified successfully! Mail server is reachable and credentials are valid.',
    });
  } else {
    return res.status(400).json({
      success: false,
      message: result.error || 'SMTP server connection handshake failed. Please check host, port, credentials and SSL/TLS configuration.',
    });
  }
});

// --- Legacy Settings API Support ---
app.get('/api/settings/general', authenticateToken, (req: AuthenticatedRequest, res) => {
  const currentSettings = store.getSettings();
  res.json({
    success: true,
    message: 'General settings retrieved',
    data: {
      app_name: currentSettings.app_name || process.env.APP_NAME || 'Nexora',
      company_name: currentSettings.company_name || process.env.APP_COMPANY || '',
      timezone: currentSettings.timezone || process.env.APP_TIMEZONE || 'Asia/Kolkata',
      date_format: currentSettings.date_format || 'YYYY-MM-DD',
      currency: currentSettings.currency || 'USD',
      support_email: currentSettings.support_email || 'support@nexora.io',
      session_timeout_minutes: currentSettings.session_timeout_minutes || '15',
    },
  });
});

app.put('/api/settings/general', authenticateToken, requirePermission('settings.edit'), (req: AuthenticatedRequest, res) => {
  const { app_name, company_name, timezone, date_format, currency, support_email, session_timeout_minutes } = req.body;
  const prevSettings = store.getSettings();

  if (app_name) store.updateSetting('app_name', String(app_name).trim(), 'general', req.user!.email);
  if (company_name) store.updateSetting('company_name', String(company_name).trim(), 'general', req.user!.email);
  if (timezone) store.updateSetting('timezone', String(timezone).trim(), 'general', req.user!.email);
  if (date_format) store.updateSetting('date_format', String(date_format).trim(), 'display', req.user!.email);
  if (currency) store.updateSetting('currency', String(currency).trim(), 'general', req.user!.email);
  if (support_email) store.updateSetting('support_email', String(support_email).trim(), 'general', req.user!.email);
  if (session_timeout_minutes) store.updateSetting('session_timeout_minutes', String(session_timeout_minutes).trim(), 'security', req.user!.email);

  store.logAudit({
    user_id: req.user!.id,
    user_email: req.user!.email,
    username: req.user!.username,
    action: 'SETTINGS_UPDATED',
    module: 'Settings',
    details: 'General application branding and governance preferences updated.',
    previous_value: JSON.stringify(prevSettings),
    updated_value: JSON.stringify(store.getSettings()),
    ip_address: req.ip || '127.0.0.1',
  });

  res.json({
    success: true,
    message: 'General application settings saved successfully.',
    data: store.getSettings(),
  });
});

// Security & Password Policy Settings
app.get('/api/settings/security', authenticateToken, requirePermission('settings.view'), (req: AuthenticatedRequest, res) => {
  const currentSettings = store.getSettings();
  res.json({
    success: true,
    message: 'Security governance settings retrieved',
    data: {
      min_password_length: parseInt(currentSettings.min_password_length || '8', 10),
      require_uppercase: currentSettings.require_uppercase !== 'false',
      require_numbers: currentSettings.require_numbers !== 'false',
      require_symbols: currentSettings.require_symbols !== 'false',
      session_timeout_minutes: parseInt(currentSettings.session_timeout_minutes || '15', 10),
      max_login_attempts: parseInt(currentSettings.max_login_attempts || '5', 10),
      lockout_duration_minutes: parseInt(currentSettings.lockout_duration_minutes || '15', 10),
      reset_token_expiry_minutes: parseInt(currentSettings.reset_token_expiry_minutes || '60', 10),
      auto_backup_schedule: currentSettings.auto_backup_schedule || 'daily_midnight',
    },
  });
});

app.put('/api/settings/security', authenticateToken, requirePermission('settings.edit'), (req: AuthenticatedRequest, res) => {
  const {
    min_password_length,
    require_uppercase,
    require_numbers,
    require_symbols,
    session_timeout_minutes,
    max_login_attempts,
    lockout_duration_minutes,
    reset_token_expiry_minutes,
    auto_backup_schedule,
  } = req.body;

  const prev = store.getSettings();

  if (min_password_length !== undefined) store.updateSetting('min_password_length', String(min_password_length), 'security', req.user!.email);
  if (require_uppercase !== undefined) store.updateSetting('require_uppercase', String(require_uppercase), 'security', req.user!.email);
  if (require_numbers !== undefined) store.updateSetting('require_numbers', String(require_numbers), 'security', req.user!.email);
  if (require_symbols !== undefined) store.updateSetting('require_symbols', String(require_symbols), 'security', req.user!.email);
  if (session_timeout_minutes !== undefined) store.updateSetting('session_timeout_minutes', String(session_timeout_minutes), 'security', req.user!.email);
  if (max_login_attempts !== undefined) store.updateSetting('max_login_attempts', String(max_login_attempts), 'security', req.user!.email);
  if (lockout_duration_minutes !== undefined) store.updateSetting('lockout_duration_minutes', String(lockout_duration_minutes), 'security', req.user!.email);
  if (reset_token_expiry_minutes !== undefined) store.updateSetting('reset_token_expiry_minutes', String(reset_token_expiry_minutes), 'security', req.user!.email);
  if (auto_backup_schedule !== undefined) store.updateSetting('auto_backup_schedule', String(auto_backup_schedule), 'security', req.user!.email);

  store.logAudit({
    user_id: req.user!.id,
    user_email: req.user!.email,
    username: req.user!.username,
    action: 'SECURITY_SETTINGS_UPDATED',
    module: 'Security',
    details: 'Security governance, lockout thresholds, and backup schedules updated.',
    previous_value: JSON.stringify(prev),
    updated_value: JSON.stringify(store.getSettings()),
    ip_address: req.ip || '127.0.0.1',
  });

  res.json({
    success: true,
    message: 'Security governance settings saved successfully.',
    data: store.getSettings(),
  });
});

app.get('/api/settings/audit-trail', authenticateToken, requirePermission('settings.view'), (req: AuthenticatedRequest, res) => {
  const { module, user_email, action, search } = req.query;
  const logs = store.getAuditTrail({
    module: module as string,
    user_email: user_email as string,
    action: action as string,
    search: search as string,
  });

  res.json({
    success: true,
    message: 'Audit trail retrieved',
    data: logs,
  });
});

// Admin View: All Active Sessions across users
app.get(['/api/settings/sessions', '/api/settings/active-sessions'], authenticateToken, requirePermission('settings.sessions'), (req: AuthenticatedRequest, res) => {
  const { search, status, user_id } = req.query;
  const sessions = store.getAllSessions({
    search: search as string,
    status: status as string,
    user_id: user_id ? parseInt(user_id as string, 10) : undefined,
  });

  const formatted = sessions.map(s => ({
    id: s.id,
    user_id: s.user_id,
    username: s.username || 'unknown',
    employee_name: s.employee_name || 'Staff User',
    ip_address: s.ip_address,
    user_agent: s.user_agent,
    created_at: s.created_at,
    last_active_at: s.last_active_at,
    is_current: s.jti === req.user!.jti,
    is_revoked: s.is_revoked,
    status: s.is_revoked ? 'REVOKED' : 'ACTIVE',
  }));

  res.json({
    success: true,
    message: 'Active user sessions retrieved',
    data: formatted,
  });
});

// Admin: Revoke specific session
app.delete(['/api/settings/sessions/:id', '/api/settings/active-sessions/:id'], authenticateToken, requirePermission('settings.sessions'), (req: AuthenticatedRequest, res) => {
  const sessionId = parseInt(req.params.id, 10);
  const allSessions = store.getAllSessions();
  const target = allSessions.find(s => s.id === sessionId);

  if (!target) {
    return res.status(404).json({ success: false, message: 'Session record not found.' });
  }

  const success = store.revokeSession(sessionId);
  if (!success) {
    return res.status(400).json({ success: false, message: 'Could not revoke session.' });
  }

  store.logAudit({
    user_id: req.user!.id,
    user_email: req.user!.email,
    username: req.user!.username,
    action: 'ADMIN_SESSION_TERMINATED',
    module: 'Sessions',
    details: `Administrator terminated active session #${sessionId} for user '${target.username}' (IP: ${target.ip_address})`,
    ip_address: req.ip || '127.0.0.1',
  });

  res.json({ success: true, message: `Session for '${target.username}' successfully terminated.` });
});

// Admin: Batch terminate sessions
app.post(['/api/settings/sessions/terminate-batch', '/api/settings/active-sessions/terminate-batch'], authenticateToken, requirePermission('settings.sessions'), (req: AuthenticatedRequest, res) => {
  const { session_ids, user_id, all } = req.body;
  const allSessions = store.getAllSessions();
  let count = 0;

  if (all) {
    // Revoke all non-current sessions
    for (const s of allSessions) {
      if (!s.is_revoked && s.jti !== req.user!.jti) {
        store.revokeSession(s.id);
        count++;
      }
    }
  } else if (user_id) {
    for (const s of allSessions) {
      if (s.user_id === Number(user_id) && !s.is_revoked && s.jti !== req.user!.jti) {
        store.revokeSession(s.id);
        count++;
      }
    }
  } else if (Array.isArray(session_ids)) {
    for (const id of session_ids) {
      const s = allSessions.find(item => item.id === Number(id));
      if (s && !s.is_revoked && s.jti !== req.user!.jti) {
        store.revokeSession(s.id);
        count++;
      }
    }
  }

  store.logAudit({
    user_id: req.user!.id,
    user_email: req.user!.email,
    username: req.user!.username,
    action: 'ADMIN_BATCH_SESSIONS_TERMINATED',
    module: 'Sessions',
    details: `Administrator terminated ${count} active user session(s).`,
    ip_address: req.ip || '127.0.0.1',
  });

  res.json({
    success: true,
    message: `Successfully terminated ${count} active session(s).`,
    terminated_count: count,
  });
});

// Database Backups History
app.get(['/api/settings/backups', '/api/settings/database-backups'], authenticateToken, requirePermission('settings.backup'), (req: AuthenticatedRequest, res) => {
  const backups = store.getDatabaseBackups();
  res.json({
    success: true,
    message: 'Database backup history retrieved',
    data: backups,
  });
});

// Create manual backup
app.post(['/api/settings/backups', '/api/settings/database-backups'], authenticateToken, requirePermission('settings.backup'), (req: AuthenticatedRequest, res) => {
  const { notes } = req.body;
  try {
    const backup = store.createDatabaseBackup('MANUAL', req.user!.email, notes);

    store.logAudit({
      user_id: req.user!.id,
      user_email: req.user!.email,
      username: req.user!.username,
      action: 'DATABASE_BACKUP_CREATED',
      module: 'Database',
      details: `Generated snapshot: ${backup.filename} (${backup.size_bytes} bytes, SHA-256: ${backup.sha256.substring(0, 12)}...)`,
      ip_address: req.ip || '127.0.0.1',
    });

    res.json({
      success: true,
      message: `Database backup snapshot '${backup.filename}' created and verified successfully.`,
      data: backup,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: `Backup generation failed: ${err.message}` });
  }
});

// Restore database backup (Protected: Requires Super Admin or Password Confirmation)
app.post(['/api/settings/backups/restore', '/api/settings/database-backups/restore'], authenticateToken, requirePermission('settings.backup'), async (req: AuthenticatedRequest, res) => {
  const { backup_id, admin_password } = req.body;

  if (!backup_id) {
    return res.status(400).json({ success: false, message: 'Backup identifier is required for restoration.' });
  }

  // Safety confirmation: verify user's password before initiating restore
  const adminUser = store.findUserById(req.user!.id);
  if (!adminUser) {
    return res.status(404).json({ success: false, message: 'Authenticated administrator account not found.' });
  }

  if (!admin_password) {
    return res.status(400).json({
      success: false,
      message: 'Restoring a database snapshot will overwrite application state. Please confirm with your administrator password.',
    });
  }

  const validPassword = await bcrypt.compare(admin_password, adminUser.password_hash);
  if (!validPassword) {
    store.logAudit({
      user_id: req.user!.id,
      user_email: req.user!.email,
      username: req.user!.username,
      action: 'RESTORE_PASSWORD_FAILED',
      module: 'Database',
      details: `Failed database restore attempt for backup ${backup_id}: Incorrect confirmation password`,
      ip_address: req.ip || '127.0.0.1',
    });
    return res.status(401).json({
      success: false,
      message: 'Incorrect administrator password. Database restore aborted.',
    });
  }

  try {
    const result = store.restoreDatabaseBackup(backup_id, req.user!.email);

    store.logAudit({
      user_id: req.user!.id,
      user_email: req.user!.email,
      username: req.user!.username,
      action: 'DATABASE_BACKUP_RESTORED',
      module: 'Database',
      details: `Database restored from snapshot ${backup_id}. Tables restored: ${result.table_count || 'all'}.`,
      ip_address: req.ip || '127.0.0.1',
    });

    res.json({
      success: true,
      message: result.message,
      data: {
        backup_id,
        restored_at: new Date().toISOString(),
        table_count: result.table_count,
      },
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: `Database restore failed: ${err.message}`,
    });
  }
});

// Download database backup file
app.get(['/api/settings/backups/:id/download', '/api/settings/database-backups/:id/download'], authenticateToken, requirePermission('settings.backups.download'), (req: AuthenticatedRequest, res) => {
  const backupId = req.params.id;
  const backup = store.getDatabaseBackups().find(b => b.id === backupId);
  if (!backup) {
    return res.status(404).json({ success: false, message: 'Backup record not found.' });
  }
  const filepath = path.resolve(process.cwd(), 'database', 'backups', backup.filename);
  if (!fs.existsSync(filepath)) {
    return res.status(404).json({ success: false, message: 'Backup file missing from disk.' });
  }
  res.download(filepath, backup.filename);
});

// Delete database backup snapshot
app.delete(['/api/settings/backups/:id', '/api/settings/database-backups/:id'], authenticateToken, requirePermission('settings.backups.delete'), (req: AuthenticatedRequest, res) => {
  const backupId = req.params.id;
  const deleted = store.deleteDatabaseBackup(backupId);
  if (!deleted) {
    return res.status(404).json({ success: false, message: 'Backup snapshot not found.' });
  }
  store.logAudit({
    user_id: req.user!.id,
    user_email: req.user!.email,
    username: req.user!.username,
    action: 'DATABASE_BACKUP_DELETED',
    module: 'Database',
    details: `Deleted backup snapshot ${backupId}`,
    ip_address: req.ip || '127.0.0.1',
  });
  res.json({ success: true, message: 'Database backup removed successfully.' });
});

// Export Audit Trail
app.get('/api/settings/audit-trail/export', authenticateToken, requirePermission('settings.audit.export'), (req: AuthenticatedRequest, res) => {
  const { format = 'csv' } = req.query;
  const logs = store.getAuditTrail();
  if (format === 'json') {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="nexora_audit_${Date.now()}.json"`);
    return res.json({ success: true, data: logs });
  }
  const header = ['ID', 'Timestamp', 'User Email', 'Action', 'Module', 'IP Address', 'Details'];
  const rows = logs.map(l => [
    l.id,
    l.timestamp,
    `"${(l.user_email || '').replace(/"/g, '""')}"`,
    `"${(l.action || '').replace(/"/g, '""')}"`,
    `"${(l.module || '').replace(/"/g, '""')}"`,
    l.ip_address,
    `"${(l.details || '').replace(/"/g, '""')}"`,
  ]);
  const csvContent = [header.join(','), ...rows.map(r => r.join(','))].join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="nexora_audit_${Date.now()}.csv"`);
  res.send(csvContent);
});

// ==========================================
// MODULE 7: SUPPLIER MANAGEMENT ROUTES
// ==========================================

function sanitizeFormula(val: any): string {
  if (val === null || val === undefined) return '';
  const str = String(val).trim();
  if (['=', '+', '-', '@', '\t', '\r'].includes(str.charAt(0))) {
    return `'${str}`;
  }
  return str;
}

// Get next supplier code
app.get('/api/suppliers/next-code', authenticateToken, (req: AuthenticatedRequest, res) => {
  const code = store.getNextSupplierCode();
  res.json({
    success: true,
    data: { next_code: code },
    message: 'Next supplier code generated.',
  });
});

// List suppliers with search, filter, and pagination
app.get('/api/suppliers', authenticateToken, requirePermission('suppliers.view'), async (req: AuthenticatedRequest, res) => {
  const { search, category, status, page, page_size, sort_by, sort_order } = req.query;

  const result = store.getSuppliers({
    search: search as string,
    category: category as string,
    status: status as string,
    page: page ? parseInt(page as string, 10) : 1,
    pageSize: page_size ? parseInt(page_size as string, 10) : 10,
    sortBy: (sort_by as string) || 'created_at',
    sortOrder: (sort_order as 'asc' | 'desc') || 'desc',
  });

  res.json({
    success: true,
    data: result,
    message: 'Suppliers retrieved successfully.',
  });
});


// Export suppliers to Excel (.xlsx) with formula sanitization
app.get('/api/suppliers/export/excel', authenticateToken, requirePermission('suppliers.export'), (req: AuthenticatedRequest, res) => {
  const { search, category, status, sort_by, sort_order } = req.query;
  const result = store.getSuppliers({
    search: search as string,
    category: category as string,
    status: status as string,
    page: 1,
    pageSize: 100000,
    sortBy: (sort_by as string) || 'created_at',
    sortOrder: (sort_order as 'asc' | 'desc') || 'desc',
  });

  const rows = result.items.map(s => ({
    'Supplier Code': sanitizeFormula(s.code),
    'Supplier Name': sanitizeFormula(s.name),
    'Category': sanitizeFormula(s.category),
    'Status': sanitizeFormula(s.status),
    'Contact First Name': sanitizeFormula(s.contact_first_name),
    'Contact Last Name': sanitizeFormula(s.contact_last_name),
    'Email Address': sanitizeFormula(s.email),
    'Phone': sanitizeFormula(s.phone),
    'Alternate Phone': sanitizeFormula(s.alternate_phone),
    'Tax ID / GSTIN': sanitizeFormula(s.tax_id),
    'Address Line 1': sanitizeFormula(s.address_line1),
    'Address Line 2': sanitizeFormula(s.address_line2),
    'City': sanitizeFormula(s.city),
    'State': sanitizeFormula(s.state),
    'Postal Code': sanitizeFormula(s.postal_code),
    'Country': sanitizeFormula(s.country),
    'Website': sanitizeFormula(s.website),
    'Notes': sanitizeFormula(s.notes),
    'Created Date': s.created_at ? s.created_at.split('T')[0] : '',
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Suppliers');

  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  const dateStr = new Date().toISOString().split('T')[0];
  const filename = `Nexora_Suppliers_${dateStr}.xlsx`;

  store.logAudit({
    user_id: req.user!.id,
    user_email: req.user!.email,
    action: 'SUPPLIERS_EXPORTED',
    module: 'Suppliers',
    details: `Exported ${result.items.length} supplier record(s) to Excel (${filename})`,
    ip_address: req.ip || '127.0.0.1',
  });

  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buffer);
});

// Download blank Excel import template
app.get('/api/suppliers/import/template', authenticateToken, (req: AuthenticatedRequest, res) => {
  const headers = [
    {
      'Supplier Code': '',
      'Supplier Name': '',
      'Category': '',
      'Tax ID': '',
      'Status': 'active',
      'Contact First Name': '',
      'Contact Last Name': '',
      'Email': '',
      'Phone': '',
      'Alternate Phone': '',
      'Address Line 1': '',
      'Address Line 2': '',
      'City': '',
      'State': '',
      'Postal Code': '',
      'Country': 'India',
      'Website': '',
      'Notes': '',
    }
  ];

  const worksheet = XLSX.utils.json_to_sheet(headers);
  XLSX.utils.sheet_add_aoa(worksheet, [
    [
      'Supplier Code', 'Supplier Name', 'Category', 'Tax ID', 'Status',
      'Contact First Name', 'Contact Last Name', 'Email', 'Phone', 'Alternate Phone',
      'Address Line 1', 'Address Line 2', 'City', 'State', 'Postal Code', 'Country',
      'Website', 'Notes'
    ]
  ], { origin: 'A1' });

  const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1:R1');
  range.e.r = 0;
  worksheet['!ref'] = XLSX.utils.encode_range(range);

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Supplier_Import_Template');

  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  const filename = 'Nexora_Supplier_Import_Template.xlsx';

  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buffer);
});

// Preview uploaded spreadsheet data before commit
app.post('/api/suppliers/import/preview', authenticateToken, requirePermission('suppliers.import'), (req: AuthenticatedRequest, res) => {
  const { file_data, rows: rawRows } = req.body;
  let parsedRows: any[] = [];

  if (file_data) {
    try {
      const base64Data = file_data.replace(/^data:[^;]+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const firstSheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[firstSheetName];
      parsedRows = XLSX.utils.sheet_to_json(sheet);
    } catch (e: any) {
      return res.status(400).json({
        success: false,
        message: `Failed to parse Excel spreadsheet: ${e.message}`,
      });
    }
  } else if (Array.isArray(rawRows)) {
    parsedRows = rawRows;
  } else {
    return res.status(400).json({
      success: false,
      message: 'No spreadsheet file or row data provided.',
    });
  }

  if (parsedRows.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'The uploaded spreadsheet contains no data rows.',
    });
  }

  const preview_items: any[] = [];
  const seenCodes = new Set<string>();
  let validCount = 0;
  let duplicateCount = 0;

  for (let i = 0; i < parsedRows.length; i++) {
    const r = parsedRows[i];
    const rowNum = i + 2;
    const errors: string[] = [];

    const code = sanitizeFormula(r['Supplier Code'] || r['code'] || r['Code'] || '').toUpperCase();
    const name = sanitizeFormula(r['Supplier Name'] || r['name'] || r['Name'] || '');
    const category = sanitizeFormula(r['Category'] || r['category'] || '');
    const tax_id = sanitizeFormula(r['Tax ID'] || r['tax_id'] || '');
    const contact_first_name = sanitizeFormula(r['Contact First Name'] || r['contact_first_name'] || r['First Name'] || '');
    const contact_last_name = sanitizeFormula(r['Contact Last Name'] || r['contact_last_name'] || r['Last Name'] || '');
    const email = sanitizeFormula(r['Email'] || r['email'] || r['Email Address'] || '');
    const phone = sanitizeFormula(r['Phone'] || r['phone'] || '');
    const alternate_phone = sanitizeFormula(r['Alternate Phone'] || r['alternate_phone'] || '');
    const address_line1 = sanitizeFormula(r['Address Line 1'] || r['address_line1'] || '');
    const address_line2 = sanitizeFormula(r['Address Line 2'] || r['address_line2'] || '');
    const city = sanitizeFormula(r['City'] || r['city'] || '');
    const state = sanitizeFormula(r['State'] || r['state'] || '');
    const postal_code = sanitizeFormula(r['Postal Code'] || r['postal_code'] || '');
    const country = sanitizeFormula(r['Country'] || r['country'] || 'India');
    const website = sanitizeFormula(r['Website'] || r['website'] || '');
    const notes = sanitizeFormula(r['Notes'] || r['notes'] || '');
    const status = (r['Status'] || r['status'] || 'active').toLowerCase() === 'disabled' ? 'disabled' : 'active';

    if (!name) {
      errors.push('Supplier Name is required.');
    }
    if (!code) {
      errors.push('Supplier Code is required.');
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push('Invalid email address format.');
    }
    if (phone && !/^[+0-9()\s-]{7,25}$/.test(phone)) {
      errors.push('Invalid phone number format.');
    }

    if (code && seenCodes.has(code)) {
      errors.push(`Duplicate supplier code '${code}' in this import file.`);
    } else if (code) {
      seenCodes.add(code);
    }

    const existing = code ? store.getSupplierByCode(code) : null;
    const is_duplicate = !!existing;
    if (is_duplicate) {
      duplicateCount++;
    }

    const is_valid = errors.length === 0;
    if (is_valid) validCount++;

    preview_items.push({
      row_number: rowNum,
      code,
      name,
      category,
      tax_id,
      contact_first_name,
      contact_last_name,
      email,
      phone,
      alternate_phone,
      address_line1,
      address_line2,
      city,
      state,
      postal_code,
      country,
      website,
      notes,
      status,
      is_valid,
      is_duplicate,
      errors,
    });
  }

  res.json({
    success: true,
    data: {
      total_rows: parsedRows.length,
      valid_rows: validCount,
      invalid_rows: parsedRows.length - validCount,
      duplicate_rows: duplicateCount,
      preview_items,
    },
    message: `Preview generated: ${validCount} valid, ${duplicateCount} existing duplicates detected.`,
  });
});

// Commit validated spreadsheet records using atomic policy
app.post('/api/suppliers/import/commit', authenticateToken, requirePermission('suppliers.import'), async (req: AuthenticatedRequest, res) => {
  const { duplicate_policy, rows } = req.body;
  const policy = duplicate_policy === 'update' ? 'update' : 'skip';

  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'No records provided for commit.',
    });
  }

  let created_count = 0;
  let updated_count = 0;
  let skipped_count = 0;
  let failed_count = 0;
  const errors: string[] = [];

  for (const row of rows) {
    try {
      const code = sanitizeFormula(row.code || row['Supplier Code'] || '').toUpperCase();
      const name = sanitizeFormula(row.name || row['Supplier Name'] || '');

      if (!code || !name) {
        failed_count++;
        errors.push(`Row ${row.row_number || '?'}: Missing code or name.`);
        continue;
      }

      const existing = store.getSupplierByCode(code);
      if (existing) {
        if (policy === 'update') {
          const updated = store.updateSupplier(existing.id, {
            name,
            category: row.category !== undefined ? row.category : existing.category,
            tax_id: row.tax_id !== undefined ? row.tax_id : existing.tax_id,
            contact_first_name: row.contact_first_name !== undefined ? row.contact_first_name : existing.contact_first_name,
            contact_last_name: row.contact_last_name !== undefined ? row.contact_last_name : existing.contact_last_name,
            email: row.email !== undefined ? row.email : existing.email,
            phone: row.phone !== undefined ? row.phone : existing.phone,
            alternate_phone: row.alternate_phone !== undefined ? row.alternate_phone : existing.alternate_phone,
            address_line1: row.address_line1 !== undefined ? row.address_line1 : existing.address_line1,
            address_line2: row.address_line2 !== undefined ? row.address_line2 : existing.address_line2,
            city: row.city !== undefined ? row.city : existing.city,
            state: row.state !== undefined ? row.state : existing.state,
            postal_code: row.postal_code !== undefined ? row.postal_code : existing.postal_code,
            country: row.country !== undefined ? row.country : existing.country,
            website: row.website !== undefined ? row.website : existing.website,
            notes: row.notes !== undefined ? row.notes : existing.notes,
            status: row.status || existing.status,
          });

          if (pgPool && updated) {
            try {
              await pgPool.query(
                `UPDATE suppliers SET
                  name = $1, category = $2, tax_id = $3, contact_first_name = $4, contact_last_name = $5,
                  email = $6, phone = $7, alternate_phone = $8, address_line1 = $9, address_line2 = $10,
                  city = $11, state = $12, postal_code = $13, country = $14, website = $15,
                  notes = $16, status = $17, updated_at = NOW()
                 WHERE id = $18`,
                [
                  updated.name, updated.category, updated.tax_id, updated.contact_first_name, updated.contact_last_name,
                  updated.email, updated.phone, updated.alternate_phone, updated.address_line1, updated.address_line2,
                  updated.city, updated.state, updated.postal_code, updated.country, updated.website,
                  updated.notes, updated.status, updated.id
                ]
              );
            } catch (pgErr) {
              console.warn('[PostgreSQL Supplier Import Update Note]', pgErr);
            }
          }

          updated_count++;
        } else {
          skipped_count++;
        }
      } else {
        const newSup = store.createSupplier({
          code,
          name,
          category: row.category || '',
          tax_id: row.tax_id || '',
          status: row.status || 'active',
          contact_first_name: row.contact_first_name || '',
          contact_last_name: row.contact_last_name || '',
          email: row.email || '',
          phone: row.phone || '',
          alternate_phone: row.alternate_phone || '',
          address_line1: row.address_line1 || '',
          address_line2: row.address_line2 || '',
          city: row.city || '',
          state: row.state || '',
          postal_code: row.postal_code || '',
          country: row.country || 'India',
          website: row.website || '',
          notes: row.notes || '',
          created_by: req.user!.id,
        });

        if (pgPool) {
          try {
            await pgPool.query(
              `INSERT INTO suppliers (
                code, name, category, tax_id, status,
                contact_first_name, contact_last_name, email, phone, alternate_phone,
                address_line1, address_line2, city, state, postal_code, country,
                website, notes, created_by, created_at, updated_at
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, NOW(), NOW())
              ON CONFLICT (code) DO NOTHING`,
              [
                newSup.code, newSup.name, newSup.category, newSup.tax_id, newSup.status,
                newSup.contact_first_name, newSup.contact_last_name, newSup.email, newSup.phone, newSup.alternate_phone,
                newSup.address_line1, newSup.address_line2, newSup.city, newSup.state, newSup.postal_code, newSup.country,
                newSup.website, newSup.notes, newSup.created_by
              ]
            );
          } catch (pgErr) {
            console.warn('[PostgreSQL Supplier Import Insert Note]', pgErr);
          }
        }

        created_count++;
      }
    } catch (err: any) {
      failed_count++;
      errors.push(`Row ${row.row_number || '?'}: ${err.message}`);
    }
  }

  store.logAudit({
    user_id: req.user!.id,
    user_email: req.user!.email,
    action: 'SUPPLIERS_IMPORTED',
    module: 'Suppliers',
    details: `Imported suppliers with policy [${policy}]: Created ${created_count}, Updated ${updated_count}, Skipped ${skipped_count}, Failed ${failed_count}`,
    ip_address: req.ip || '127.0.0.1',
  });

  res.json({
    success: true,
    data: {
      total_processed: rows.length,
      created_count,
      updated_count,
      skipped_count,
      failed_count,
      errors,
    },
    message: `Batch import completed. Created: ${created_count}, Updated: ${updated_count}, Skipped: ${skipped_count}.`,
  });
});

// Get single supplier details
app.get('/api/suppliers/:id(\\d+)', authenticateToken, requirePermission('suppliers.view'), async (req: AuthenticatedRequest, res) => {
  const id = parseInt(req.params.id, 10);

  if (pgPool) {
    try {
      const resDb = await pgPool.query('SELECT * FROM suppliers WHERE id = $1 LIMIT 1', [id]);
      if (resDb.rows.length > 0) {
        const r = resDb.rows[0];
        const existing = store.getSupplierById(r.id);
        if (!existing) {
          store.createSupplier({
            code: r.code,
            name: r.name,
            category: r.category || '',
            tax_id: r.tax_id || '',
            status: r.status || 'active',
            contact_first_name: r.contact_first_name || '',
            contact_last_name: r.contact_last_name || '',
            email: r.email || '',
            phone: r.phone || '',
            alternate_phone: r.alternate_phone || '',
            address_line1: r.address_line1 || '',
            address_line2: r.address_line2 || '',
            city: r.city || '',
            state: r.state || '',
            postal_code: r.postal_code || '',
            country: r.country || 'India',
            website: r.website || '',
            notes: r.notes || '',
            created_by: r.created_by,
          });
        }
      }
    } catch (pgErr) {
      console.warn('[PostgreSQL Supplier Get Note]', pgErr);
    }
  }

  const supplier = store.getSupplierById(id);
  if (!supplier) {
    return res.status(404).json({ success: false, message: 'Supplier not found.' });
  }
  res.json({ success: true, data: supplier, message: 'Supplier retrieved.' });
});

// Create supplier
app.post('/api/suppliers', authenticateToken, requirePermission('suppliers.create'), async (req: AuthenticatedRequest, res) => {
  const {
    code, name, category, tax_id, status,
    contact_first_name, contact_last_name, email, phone, alternate_phone,
    address_line1, address_line2, city, state, postal_code, country,
    website, notes
  } = req.body;

  if (!code || !code.trim()) {
    return res.status(400).json({ success: false, message: 'Supplier code is required.' });
  }
  if (!name || !name.trim()) {
    return res.status(400).json({ success: false, message: 'Supplier name is required.' });
  }

  const cleanCode = code.trim().toUpperCase();
  const existing = store.getSupplierByCode(cleanCode);
  if (existing) {
    return res.status(400).json({ success: false, message: `Supplier code '${cleanCode}' is already registered.` });
  }

  if (email && email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return res.status(400).json({ success: false, message: 'Invalid email address format.' });
  }
  if (phone && phone.trim() && !/^[+0-9()\s-]{7,25}$/.test(phone.trim())) {
    return res.status(400).json({ success: false, message: 'Invalid phone number format.' });
  }

  const newSupplier = store.createSupplier({
    code: cleanCode,
    name: name.trim(),
    category: category ? category.trim() : '',
    tax_id: tax_id ? tax_id.trim() : '',
    status: status === 'disabled' ? 'disabled' : 'active',
    contact_first_name: contact_first_name ? contact_first_name.trim() : '',
    contact_last_name: contact_last_name ? contact_last_name.trim() : '',
    email: email ? email.trim().toLowerCase() : '',
    phone: phone ? phone.trim() : '',
    alternate_phone: alternate_phone ? alternate_phone.trim() : '',
    address_line1: address_line1 ? address_line1.trim() : '',
    address_line2: address_line2 ? address_line2.trim() : '',
    city: city ? city.trim() : '',
    state: state ? state.trim() : '',
    postal_code: postal_code ? postal_code.trim() : '',
    country: country ? country.trim() : 'India',
    website: website ? website.trim() : '',
    notes: notes ? notes.trim() : '',
    created_by: req.user!.id,
  });

  if (pgPool) {
    try {
      await pgPool.query(
        `INSERT INTO suppliers (
          code, name, category, tax_id, status,
          contact_first_name, contact_last_name, email, phone, alternate_phone,
          address_line1, address_line2, city, state, postal_code, country,
          website, notes, created_by, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, NOW(), NOW())
        ON CONFLICT (code) DO NOTHING`,
        [
          newSupplier.code, newSupplier.name, newSupplier.category, newSupplier.tax_id, newSupplier.status,
          newSupplier.contact_first_name, newSupplier.contact_last_name, newSupplier.email, newSupplier.phone, newSupplier.alternate_phone,
          newSupplier.address_line1, newSupplier.address_line2, newSupplier.city, newSupplier.state, newSupplier.postal_code, newSupplier.country,
          newSupplier.website, newSupplier.notes, newSupplier.created_by
        ]
      );
    } catch (pgErr) {
      console.warn('[PostgreSQL Supplier Insert Note]', pgErr);
    }
  }

  store.logAudit({
    user_id: req.user!.id,
    user_email: req.user!.email,
    action: 'SUPPLIER_CREATED',
    module: 'Suppliers',
    details: `Registered new supplier '${newSupplier.name}' (${newSupplier.code})`,
    ip_address: req.ip || '127.0.0.1',
  });

  res.status(201).json({
    success: true,
    data: newSupplier,
    message: `Supplier '${newSupplier.name}' created successfully.`,
  });
});

// Update supplier
app.put('/api/suppliers/:id(\\d+)', authenticateToken, requirePermission('suppliers.edit'), async (req: AuthenticatedRequest, res) => {
  const id = parseInt(req.params.id, 10);
  const supplier = store.getSupplierById(id);
  if (!supplier) {
    return res.status(404).json({ success: false, message: 'Supplier not found.' });
  }

  const {
    code, name, category, tax_id, status,
    contact_first_name, contact_last_name, email, phone, alternate_phone,
    address_line1, address_line2, city, state, postal_code, country,
    website, notes
  } = req.body;

  if (code && code.trim()) {
    const cleanCode = code.trim().toUpperCase();
    if (cleanCode !== supplier.code) {
      const existing = store.getSupplierByCode(cleanCode);
      if (existing && existing.id !== id) {
        return res.status(400).json({ success: false, message: `Supplier code '${cleanCode}' is already registered to another supplier.` });
      }
    }
  }

  if (name !== undefined && !name.trim()) {
    return res.status(400).json({ success: false, message: 'Supplier name cannot be empty.' });
  }

  if (email && email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return res.status(400).json({ success: false, message: 'Invalid email address format.' });
  }
  if (phone && phone.trim() && !/^[+0-9()\s-]{7,25}$/.test(phone.trim())) {
    return res.status(400).json({ success: false, message: 'Invalid phone number format.' });
  }

  const updated = store.updateSupplier(id, {
    ...(code !== undefined && { code: code.trim().toUpperCase() }),
    ...(name !== undefined && { name: name.trim() }),
    ...(category !== undefined && { category }),
    ...(tax_id !== undefined && { tax_id }),
    ...(status !== undefined && { status }),
    ...(contact_first_name !== undefined && { contact_first_name }),
    ...(contact_last_name !== undefined && { contact_last_name }),
    ...(email !== undefined && { email }),
    ...(phone !== undefined && { phone }),
    ...(alternate_phone !== undefined && { alternate_phone }),
    ...(address_line1 !== undefined && { address_line1 }),
    ...(address_line2 !== undefined && { address_line2 }),
    ...(city !== undefined && { city }),
    ...(state !== undefined && { state }),
    ...(postal_code !== undefined && { postal_code }),
    ...(country !== undefined && { country }),
    ...(website !== undefined && { website }),
    ...(notes !== undefined && { notes }),
  });

  if (pgPool && updated) {
    try {
      await pgPool.query(
        `UPDATE suppliers SET
          code = $1, name = $2, category = $3, tax_id = $4, status = $5,
          contact_first_name = $6, contact_last_name = $7, email = $8, phone = $9, alternate_phone = $10,
          address_line1 = $11, address_line2 = $12, city = $13, state = $14, postal_code = $15, country = $16,
          website = $17, notes = $18, updated_at = NOW()
         WHERE id = $19`,
        [
          updated.code, updated.name, updated.category, updated.tax_id, updated.status,
          updated.contact_first_name, updated.contact_last_name, updated.email, updated.phone, updated.alternate_phone,
          updated.address_line1, updated.address_line2, updated.city, updated.state, updated.postal_code, updated.country,
          updated.website, updated.notes, id
        ]
      );
    } catch (pgErr) {
      console.warn('[PostgreSQL Supplier Update Note]', pgErr);
    }
  }

  store.logAudit({
    user_id: req.user!.id,
    user_email: req.user!.email,
    action: 'SUPPLIER_UPDATED',
    module: 'Suppliers',
    details: `Updated supplier '${updated!.name}' (${updated!.code})`,
    ip_address: req.ip || '127.0.0.1',
  });

  res.json({
    success: true,
    data: updated,
    message: `Supplier '${updated!.name}' updated successfully.`,
  });
});

// Delete or Disable supplier
app.delete('/api/suppliers/:id(\\d+)', authenticateToken, requirePermission('suppliers.delete'), async (req: AuthenticatedRequest, res) => {
  const id = parseInt(req.params.id, 10);
  const supplier = store.getSupplierById(id);
  if (!supplier) {
    return res.status(404).json({ success: false, message: 'Supplier not found.' });
  }

  const forceDisable = req.query.force_disable === 'true';
  const result = store.deleteSupplier(id, forceDisable);

  if (!result.success) {
    return res.status(400).json({ success: false, message: 'Failed to process supplier deletion.' });
  }

  if (pgPool) {
    try {
      if (result.action === 'disabled') {
        await pgPool.query('UPDATE suppliers SET status = $1, updated_at = NOW() WHERE id = $2', ['disabled', id]);
      } else {
        await pgPool.query('DELETE FROM suppliers WHERE id = $1', [id]);
      }
    } catch (pgErr) {
      console.warn('[PostgreSQL Supplier Delete Note]', pgErr);
    }
  }

  const actionName = result.action === 'disabled' ? 'SUPPLIER_DISABLED' : 'SUPPLIER_DELETED';
  store.logAudit({
    user_id: req.user!.id,
    user_email: req.user!.email,
    action: actionName,
    module: 'Suppliers',
    details: `${result.action === 'disabled' ? 'Disabled' : 'Deleted'} supplier '${supplier.name}' (${supplier.code})`,
    ip_address: req.ip || '127.0.0.1',
  });

  res.json({
    success: true,
    data: { id, status: result.action },
    message: `Supplier '${supplier.name}' (${supplier.code}) ${result.action === 'disabled' ? 'disabled' : 'deleted'} successfully.`,
  });
});

// ==========================================
// INVENTORY MANAGEMENT ROUTES (Module 6)
// ==========================================

// --- Dashboard & Low-Stock Alerts ---
app.get('/api/inventory/dashboard', authenticateToken, requirePermission('inventory.view'), (req: AuthenticatedRequest, res) => {
  const data = store.getInventoryDashboard();
  res.json({ success: true, data, message: 'Inventory dashboard metrics retrieved.' });
});

app.get('/api/inventory/alerts/low-stock', authenticateToken, requirePermission('inventory.view'), (req: AuthenticatedRequest, res) => {
  const alerts = store.getLowStockAlerts();
  res.json({ success: true, data: alerts, message: `${alerts.length} low-stock alerts retrieved.` });
});

// --- Categories ---
app.get('/api/inventory/categories', authenticateToken, requirePermission('inventory.view'), (req: AuthenticatedRequest, res) => {
  const { search, status } = req.query;
  let categories = store.getCategories();
  if (search && typeof search === 'string' && search.trim()) {
    const q = search.trim().toLowerCase();
    categories = categories.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.code.toLowerCase().includes(q) ||
      (c.description && c.description.toLowerCase().includes(q))
    );
  }
  if (status && status !== 'all') {
    const isActive = status === 'active';
    categories = categories.filter(c => c.is_active === isActive);
  }
  res.json({ success: true, data: categories, message: 'Categories retrieved.' });
});

app.post('/api/inventory/categories', authenticateToken, requirePermission('inventory.create'), (req: AuthenticatedRequest, res) => {
  const { code, name, description } = req.body;
  if (!code || !name) {
    return res.status(400).json({ success: false, message: 'Category code and name are required.' });
  }
  try {
    const cat = store.createCategory({ code, name, description });
    res.status(201).json({ success: true, data: cat, message: 'Category created.' });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

app.put('/api/inventory/categories/:id', authenticateToken, requirePermission('inventory.edit'), (req: AuthenticatedRequest, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    const updated = store.updateCategory(id, req.body);
    if (!updated) return res.status(404).json({ success: false, message: 'Category not found.' });
    res.json({ success: true, data: updated, message: 'Category updated.' });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

app.delete('/api/inventory/categories/:id', authenticateToken, requirePermission('inventory.delete'), (req: AuthenticatedRequest, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    const ok = store.deleteCategory(id);
    if (!ok) return res.status(404).json({ success: false, message: 'Category not found.' });
    res.json({ success: true, message: 'Category deleted.' });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// --- Category Excel Export & Import ---
app.get(['/api/inventory/categories/export/excel', '/api/inventory/export/categories/excel'], authenticateToken, requirePermission('inventory.export'), (req: AuthenticatedRequest, res) => {
  const { search, status } = req.query;
  let categories = store.getCategories();

  if (search && typeof search === 'string' && search.trim()) {
    const q = search.trim().toLowerCase();
    categories = categories.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.code.toLowerCase().includes(q) ||
      (c.description && c.description.toLowerCase().includes(q))
    );
  }

  if (status && status !== 'all') {
    const isActive = status === 'active';
    categories = categories.filter(c => c.is_active === isActive);
  }

  const rows = categories.map(c => ({
    'Category Code': sanitizeFormula(c.code),
    'Category Name': sanitizeFormula(c.name),
    'Description': sanitizeFormula(c.description || ''),
    'Status': c.is_active ? 'active' : 'disabled',
    'Created Date': c.created_at ? c.created_at.split('T')[0] : '',
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Categories');

  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  const dateStr = new Date().toISOString().split('T')[0];
  const filename = `Nexora_Categories_${dateStr}.xlsx`;

  store.logAudit({
    user_id: req.user!.id,
    user_email: req.user!.email,
    action: 'CATEGORIES_EXPORTED',
    module: 'Inventory',
    details: `Exported ${categories.length} category records to Excel (${filename})`,
    ip_address: req.ip || '127.0.0.1',
  });

  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buffer);
});

// Category Excel Template Download (No fake/sample data)
app.get(['/api/inventory/categories/import/template', '/api/inventory/import/categories/template'], authenticateToken, (req: AuthenticatedRequest, res) => {
  const headers = [
    {
      'Category Code': '',
      'Category Name': '',
      'Description': '',
      'Status': 'active',
    }
  ];

  const worksheet = XLSX.utils.json_to_sheet(headers);
  XLSX.utils.sheet_add_aoa(worksheet, [
    ['Category Code', 'Category Name', 'Description', 'Status']
  ], { origin: 'A1' });

  const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1:D1');
  range.e.r = 0;
  worksheet['!ref'] = XLSX.utils.encode_range(range);

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Category_Import_Template');

  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  const filename = 'Nexora_Category_Import_Template.xlsx';

  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buffer);
});

// Category Excel Import Preview
app.post(['/api/inventory/categories/import/preview', '/api/inventory/import/categories/preview'], authenticateToken, requirePermission('inventory.import'), (req: AuthenticatedRequest, res) => {
  const { file_data, rows: rawRows } = req.body;
  let parsedRows: any[] = [];

  if (file_data) {
    try {
      const base64Data = file_data.replace(/^data:[^;]+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const firstSheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[firstSheetName];
      parsedRows = XLSX.utils.sheet_to_json(sheet);
    } catch (e: any) {
      return res.status(400).json({ success: false, message: `Failed to parse Excel spreadsheet: ${e.message}` });
    }
  } else if (Array.isArray(rawRows)) {
    parsedRows = rawRows;
  } else {
    return res.status(400).json({ success: false, message: 'No spreadsheet file or row data provided.' });
  }

  if (parsedRows.length === 0) {
    return res.status(400).json({ success: false, message: 'The uploaded spreadsheet contains no data rows.' });
  }

  const preview_categories: any[] = [];
  const seenCodes = new Set<string>();
  let validCount = 0;
  let duplicateCount = 0;

  for (let i = 0; i < parsedRows.length; i++) {
    const r = parsedRows[i];
    const rowNum = i + 2;
    const errors: string[] = [];

    const code = sanitizeFormula(r['Category Code'] || r['code'] || r['Code'] || '').toUpperCase();
    const name = sanitizeFormula(r['Category Name'] || r['name'] || r['Name'] || '');
    const description = sanitizeFormula(r['Description'] || r['description'] || '');
    const status = (r['Status'] || r['status'] || 'active').toLowerCase() === 'disabled' ? 'disabled' : 'active';

    if (!code) errors.push('Category Code is required.');
    if (!name) errors.push('Category Name is required.');

    if (code && seenCodes.has(code)) {
      errors.push(`Duplicate category code '${code}' in this import file.`);
    } else if (code) {
      seenCodes.add(code);
    }

    const existing = code ? store.getCategoryByCode(code) : null;
    const is_duplicate = !!existing;
    if (is_duplicate) duplicateCount++;

    const is_valid = errors.length === 0;
    if (is_valid) validCount++;

    preview_categories.push({
      row_number: rowNum,
      code,
      name,
      description,
      status,
      is_valid,
      is_duplicate,
      errors,
    });
  }

  res.json({
    success: true,
    data: {
      total_rows: parsedRows.length,
      valid_rows: validCount,
      invalid_rows: parsedRows.length - validCount,
      duplicate_rows: duplicateCount,
      preview_categories,
    },
    message: `Category preview generated: ${validCount} valid, ${duplicateCount} duplicates detected.`,
  });
});

// Category Excel Import Commit
app.post(['/api/inventory/categories/import/commit', '/api/inventory/import/categories/commit'], authenticateToken, requirePermission('inventory.import'), (req: AuthenticatedRequest, res) => {
  const { duplicate_policy, rows } = req.body;
  const policy = duplicate_policy === 'update' ? 'update' : 'skip';

  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ success: false, message: 'No category records provided for commit.' });
  }

  let created_count = 0;
  let updated_count = 0;
  let skipped_count = 0;
  let failed_count = 0;
  const errors: string[] = [];

  for (const row of rows) {
    try {
      const code = sanitizeFormula(row.code || row['Category Code'] || '').toUpperCase();
      const name = sanitizeFormula(row.name || row['Category Name'] || '');
      const description = sanitizeFormula(row.description || row['Description'] || '');
      const is_active = (row.status || 'active').toLowerCase() !== 'disabled';

      if (!code || !name) {
        failed_count++;
        errors.push(`Row ${row.row_number || '?'}: Missing code or name.`);
        continue;
      }

      const existing = store.getCategoryByCode(code);
      if (existing) {
        if (policy === 'update') {
          store.updateCategory(existing.id, {
            name,
            description,
            is_active,
          });
          updated_count++;
        } else {
          skipped_count++;
        }
      } else {
        store.createCategory({
          code,
          name,
          description,
        });
        created_count++;
      }
    } catch (err: any) {
      failed_count++;
      errors.push(`Row ${row.row_number || '?'}: ${err.message}`);
    }
  }

  store.logAudit({
    user_id: req.user!.id,
    user_email: req.user!.email,
    action: 'CATEGORIES_IMPORTED',
    module: 'Inventory',
    details: `Imported categories: ${created_count} created, ${updated_count} updated, ${skipped_count} skipped, ${failed_count} failed`,
    ip_address: req.ip || '127.0.0.1',
  });

  res.json({
    success: true,
    data: {
      total_rows: rows.length,
      created_count,
      updated_count,
      skipped_count,
      failed_count,
      errors,
    },
    message: `Category import complete: ${created_count} created, ${updated_count} updated, ${skipped_count} skipped, ${failed_count} failed.`,
  });
});

// --- Units of Measure ---
app.get(['/api/inventory/uom', '/api/inventory/uoms'], authenticateToken, requirePermission('inventory.view'), (req: AuthenticatedRequest, res) => {
  const uoms = store.getUOMs();
  res.json({ success: true, data: uoms, message: 'Units of measure retrieved.' });
});

app.post(['/api/inventory/uom', '/api/inventory/uoms'], authenticateToken, requirePermission('inventory.create'), (req: AuthenticatedRequest, res) => {
  const { code, name, symbol } = req.body;
  if (!code || !name) {
    return res.status(400).json({ success: false, message: 'UOM code and name are required.' });
  }
  try {
    const uom = store.createUOM({ code, name, symbol: symbol || code });
    res.status(201).json({ success: true, data: uom, message: 'Unit of measure created.' });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// --- Warehouses / Locations ---
app.get('/api/inventory/warehouses', authenticateToken, requirePermission('inventory.view'), (req: AuthenticatedRequest, res) => {
  const whs = store.getWarehouses();
  res.json({ success: true, data: whs, message: 'Warehouses retrieved.' });
});

app.post('/api/inventory/warehouses', authenticateToken, requirePermission('inventory.create'), (req: AuthenticatedRequest, res) => {
  const { code, name, address } = req.body;
  if (!code || !name) {
    return res.status(400).json({ success: false, message: 'Warehouse code and name are required.' });
  }
  try {
    const wh = store.createWarehouse({ code, name, address });
    res.status(201).json({ success: true, data: wh, message: 'Warehouse created.' });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

app.put('/api/inventory/warehouses/:id', authenticateToken, requirePermission('inventory.edit'), (req: AuthenticatedRequest, res) => {
  const id = parseInt(req.params.id, 10);
  const updated = store.updateWarehouse(id, req.body);
  if (!updated) return res.status(404).json({ success: false, message: 'Warehouse not found.' });
  res.json({ success: true, data: updated, message: 'Warehouse updated.' });
});

// --- Item Master ---
app.get('/api/inventory/items/next-code', authenticateToken, (req: AuthenticatedRequest, res) => {
  const code = store.getNextItemCode();
  res.json({ success: true, data: { next_code: code }, message: 'Next item code generated.' });
});

app.get('/api/inventory/items', authenticateToken, requirePermission('inventory.view'), (req: AuthenticatedRequest, res) => {
  const { search, category_id, status, page, page_size, sort_by, sort_order } = req.query;
  const result = store.getItems({
    search: search as string,
    category_id: category_id ? parseInt(category_id as string, 10) : undefined,
    status: status as string,
    page: page ? parseInt(page as string, 10) : 1,
    pageSize: page_size ? parseInt(page_size as string, 10) : 10,
    sortBy: (sort_by as string) || 'created_at',
    sortOrder: (sort_order as 'asc' | 'desc') || 'desc',
  });
  res.json({ success: true, data: result, message: 'Items retrieved.' });
});

app.get('/api/inventory/items/:id', authenticateToken, requirePermission('inventory.view'), (req: AuthenticatedRequest, res) => {
  const id = parseInt(req.params.id, 10);
  const item = store.getItemById(id);
  if (!item) return res.status(404).json({ success: false, message: 'Item not found.' });
  const cat = item.category_id ? store.getCategoryById(item.category_id) : undefined;
  const uom = item.uom_id ? store.getUOMById(item.uom_id) : undefined;
  const balances = store.getStockBalances(item.id);
  const total_on_hand = balances.reduce((sum, b) => sum + b.quantity, 0);

  res.json({
    success: true,
    data: {
      ...item,
      category_name: cat?.name,
      uom_symbol: uom?.symbol,
      total_on_hand,
      balances,
    },
    message: 'Item retrieved.',
  });
});

app.post('/api/inventory/items', authenticateToken, requirePermission('inventory.create'), (req: AuthenticatedRequest, res) => {
  const {
    code, name, description, category_id, uom_id, item_type, barcode,
    min_stock_level, reorder_quantity, cost_price, selling_price, status,
    initial_warehouse_id, initial_quantity,
  } = req.body;

  if (!code || !code.trim()) {
    return res.status(400).json({ success: false, message: 'Item code is required.' });
  }
  if (!name || !name.trim()) {
    return res.status(400).json({ success: false, message: 'Item name is required.' });
  }

  try {
    const item = store.createItem({
      code,
      name,
      description,
      category_id: category_id ? parseInt(category_id, 10) : null,
      uom_id: uom_id ? parseInt(uom_id, 10) : null,
      item_type,
      barcode,
      min_stock_level: min_stock_level ? parseFloat(min_stock_level) : 0,
      reorder_quantity: reorder_quantity ? parseFloat(reorder_quantity) : 0,
      cost_price: cost_price ? parseFloat(cost_price) : 0,
      selling_price: selling_price ? parseFloat(selling_price) : 0,
      status: status || 'active',
      initial_warehouse_id: initial_warehouse_id ? parseInt(initial_warehouse_id, 10) : undefined,
      initial_quantity: initial_quantity ? parseFloat(initial_quantity) : undefined,
      created_by: req.user!.id,
    });

    store.logAudit({
      user_id: req.user!.id,
      user_email: req.user!.email,
      action: 'ITEM_CREATED',
      module: 'Inventory',
      details: `Registered item '${item.name}' (${item.code})`,
      ip_address: req.ip || '127.0.0.1',
    });

    res.status(201).json({ success: true, data: item, message: `Item '${item.name}' created.` });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

app.put('/api/inventory/items/:id', authenticateToken, requirePermission('inventory.edit'), (req: AuthenticatedRequest, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    const updated = store.updateItem(id, req.body);
    if (!updated) return res.status(404).json({ success: false, message: 'Item not found.' });

    store.logAudit({
      user_id: req.user!.id,
      user_email: req.user!.email,
      action: 'ITEM_UPDATED',
      module: 'Inventory',
      details: `Updated item '${updated.name}' (${updated.code})`,
      ip_address: req.ip || '127.0.0.1',
    });

    res.json({ success: true, data: updated, message: `Item '${updated.name}' updated.` });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

app.delete('/api/inventory/items/:id', authenticateToken, requirePermission('inventory.delete'), (req: AuthenticatedRequest, res) => {
  const id = parseInt(req.params.id, 10);
  const forceDisable = req.query.force_disable === 'true';
  const result = store.deleteItem(id, forceDisable);

  if (!result.success) {
    return res.status(404).json({ success: false, message: 'Item not found.' });
  }

  store.logAudit({
    user_id: req.user!.id,
    user_email: req.user!.email,
    action: result.action === 'disabled' ? 'ITEM_DISABLED' : 'ITEM_DELETED',
    module: 'Inventory',
    details: `${result.action === 'disabled' ? 'Disabled' : 'Deleted'} item ID ${id}`,
    ip_address: req.ip || '127.0.0.1',
  });

  res.json({
    success: true,
    data: { id, status: result.action },
    message: `Item ${result.action === 'disabled' ? 'disabled' : 'deleted'} successfully.`,
  });
});

// --- Stock Operations ---
app.post('/api/inventory/operations/receive', authenticateToken, requirePermission('inventory.receive'), (req: AuthenticatedRequest, res) => {
  const { reference_no, item_id, warehouse_id, quantity, supplier_id, unit_cost, notes, transaction_date } = req.body;
  if (!reference_no || !item_id || !warehouse_id || !quantity) {
    return res.status(400).json({ success: false, message: 'Reference number, item, warehouse, and quantity are required.' });
  }

  try {
    const result = store.receiveStock({
      reference_no,
      item_id: parseInt(item_id, 10),
      warehouse_id: parseInt(warehouse_id, 10),
      quantity: parseFloat(quantity),
      supplier_id: supplier_id ? parseInt(supplier_id, 10) : undefined,
      unit_cost: unit_cost ? parseFloat(unit_cost) : undefined,
      notes,
      transaction_date,
      user_id: req.user!.id,
    });

    store.logAudit({
      user_id: req.user!.id,
      user_email: req.user!.email,
      action: 'STOCK_RECEIVED',
      module: 'Inventory',
      details: `Received ${quantity} units (Ref: ${reference_no})`,
      ip_address: req.ip || '127.0.0.1',
    });

    res.status(201).json({ success: true, data: result, message: 'Stock received and balance updated.' });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

app.post('/api/inventory/operations/issue', authenticateToken, requirePermission('inventory.issue'), (req: AuthenticatedRequest, res) => {
  const { reference_no, item_id, warehouse_id, quantity, reason, notes, transaction_date } = req.body;
  if (!reference_no || !item_id || !warehouse_id || !quantity || !reason) {
    return res.status(400).json({ success: false, message: 'Reference number, item, warehouse, quantity, and reason are required.' });
  }

  try {
    const result = store.issueStock({
      reference_no,
      item_id: parseInt(item_id, 10),
      warehouse_id: parseInt(warehouse_id, 10),
      quantity: parseFloat(quantity),
      reason,
      notes,
      transaction_date,
      user_id: req.user!.id,
    });

    store.logAudit({
      user_id: req.user!.id,
      user_email: req.user!.email,
      action: 'STOCK_ISSUED',
      module: 'Inventory',
      details: `Issued ${quantity} units (Ref: ${reference_no}, Reason: ${reason})`,
      ip_address: req.ip || '127.0.0.1',
    });

    res.json({ success: true, data: result, message: 'Stock issued and balance updated.' });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

app.post('/api/inventory/operations/adjust', authenticateToken, requirePermission('inventory.adjust'), (req: AuthenticatedRequest, res) => {
  const { reference_no, item_id, warehouse_id, actual_quantity, reason, notes } = req.body;
  if (!reference_no || !item_id || !warehouse_id || actual_quantity === undefined || !reason) {
    return res.status(400).json({ success: false, message: 'Reference number, item, warehouse, actual quantity, and reason are required.' });
  }

  try {
    const result = store.adjustStock({
      reference_no,
      item_id: parseInt(item_id, 10),
      warehouse_id: parseInt(warehouse_id, 10),
      actual_quantity: parseFloat(actual_quantity),
      reason,
      notes,
      user_id: req.user!.id,
    });

    store.logAudit({
      user_id: req.user!.id,
      user_email: req.user!.email,
      action: 'STOCK_ADJUSTED',
      module: 'Inventory',
      details: `Adjusted stock to ${actual_quantity} units (Diff: ${result.difference}, Reason: ${reason})`,
      ip_address: req.ip || '127.0.0.1',
    });

    res.json({ success: true, data: result, message: 'Stock adjusted successfully.' });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

app.post('/api/inventory/operations/transfer', authenticateToken, requirePermission('inventory.transfer'), (req: AuthenticatedRequest, res) => {
  const { reference_no, item_id, source_warehouse_id, destination_warehouse_id, quantity, notes } = req.body;
  if (!reference_no || !item_id || !source_warehouse_id || !destination_warehouse_id || !quantity) {
    return res.status(400).json({ success: false, message: 'Reference number, item, source/destination warehouses, and quantity are required.' });
  }

  try {
    const result = store.transferStock({
      reference_no,
      item_id: parseInt(item_id, 10),
      source_warehouse_id: parseInt(source_warehouse_id, 10),
      destination_warehouse_id: parseInt(destination_warehouse_id, 10),
      quantity: parseFloat(quantity),
      notes,
      user_id: req.user!.id,
    });

    store.logAudit({
      user_id: req.user!.id,
      user_email: req.user!.email,
      action: 'STOCK_TRANSFERRED',
      module: 'Inventory',
      details: `Transferred ${quantity} units across warehouses (Ref: ${reference_no})`,
      ip_address: req.ip || '127.0.0.1',
    });

    res.json({ success: true, data: result, message: 'Stock transferred successfully.' });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// --- Stock Movements / Ledger ---
app.get('/api/inventory/movements', authenticateToken, requirePermission('inventory.view'), (req: AuthenticatedRequest, res) => {
  const { item_id, transaction_type, warehouse_id, page, page_size } = req.query;
  const result = store.getStockMovements({
    item_id: item_id ? parseInt(item_id as string, 10) : undefined,
    transaction_type: transaction_type as string,
    warehouse_id: warehouse_id ? parseInt(warehouse_id as string, 10) : undefined,
    page: page ? parseInt(page as string, 10) : 1,
    pageSize: page_size ? parseInt(page_size as string, 10) : 20,
  });
  res.json({ success: true, data: result, message: 'Stock movements retrieved.' });
});

// --- Excel Export for Inventory Items ---
app.get('/api/inventory/export/excel', authenticateToken, requirePermission('inventory.export'), (req: AuthenticatedRequest, res) => {
  const { search, category_id, status } = req.query;
  const result = store.getItems({
    search: search as string,
    category_id: category_id ? parseInt(category_id as string, 10) : undefined,
    status: status as string,
    page: 1,
    pageSize: 100000,
  });

  const rows = result.items.map(it => ({
    'Item Code': sanitizeFormula(it.code),
    'Item Name': sanitizeFormula(it.name),
    'Category': sanitizeFormula(it.category_name || ''),
    'Unit of Measure': sanitizeFormula(it.uom_symbol || ''),
    'Quantity On Hand': it.total_on_hand,
    'Min Stock Level': it.min_stock_level,
    'Reorder Quantity': it.reorder_quantity,
    'Cost Price': it.cost_price,
    'Selling Price': it.selling_price,
    'Barcode': sanitizeFormula(it.barcode || ''),
    'Status': sanitizeFormula(it.status),
    'Description': sanitizeFormula(it.description || ''),
    'Created Date': it.created_at ? it.created_at.split('T')[0] : '',
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Inventory_Items');

  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  const dateStr = new Date().toISOString().split('T')[0];
  const filename = `Nexora_Inventory_${dateStr}.xlsx`;

  store.logAudit({
    user_id: req.user!.id,
    user_email: req.user!.email,
    action: 'INVENTORY_EXPORTED',
    module: 'Inventory',
    details: `Exported ${result.items.length} inventory item(s) to Excel (${filename})`,
    ip_address: req.ip || '127.0.0.1',
  });

  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buffer);
});

// --- Excel Template Download ---
app.get('/api/inventory/import/template', authenticateToken, (req: AuthenticatedRequest, res) => {
  const headers = [
    {
      'Item Code': '',
      'Item Name': '',
      'Category': '',
      'Unit of Measure': '',
      'Min Stock Level': 0,
      'Reorder Quantity': 0,
      'Cost Price': 0,
      'Selling Price': 0,
      'Barcode': '',
      'Status': 'active',
      'Description': '',
    }
  ];

  const worksheet = XLSX.utils.json_to_sheet(headers);
  XLSX.utils.sheet_add_aoa(worksheet, [
    [
      'Item Code', 'Item Name', 'Category', 'Unit of Measure',
      'Min Stock Level', 'Reorder Quantity', 'Cost Price', 'Selling Price',
      'Barcode', 'Status', 'Description'
    ]
  ], { origin: 'A1' });

  const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1:K1');
  range.e.r = 0;
  worksheet['!ref'] = XLSX.utils.encode_range(range);

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Item_Import_Template');

  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  const filename = 'Nexora_Inventory_Import_Template.xlsx';

  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buffer);
});

// --- Excel Import Preview & Commit ---
app.post('/api/inventory/import/preview', authenticateToken, requirePermission('inventory.import'), (req: AuthenticatedRequest, res) => {
  const { file_data, rows: rawRows } = req.body;
  let parsedRows: any[] = [];

  if (file_data) {
    try {
      const base64Data = file_data.replace(/^data:[^;]+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const firstSheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[firstSheetName];
      parsedRows = XLSX.utils.sheet_to_json(sheet);
    } catch (e: any) {
      return res.status(400).json({ success: false, message: `Failed to parse Excel spreadsheet: ${e.message}` });
    }
  } else if (Array.isArray(rawRows)) {
    parsedRows = rawRows;
  } else {
    return res.status(400).json({ success: false, message: 'No spreadsheet file or row data provided.' });
  }

  if (parsedRows.length === 0) {
    return res.status(400).json({ success: false, message: 'The uploaded spreadsheet contains no data rows.' });
  }

  const preview_items: any[] = [];
  const seenCodes = new Set<string>();
  let validCount = 0;
  let duplicateCount = 0;

  for (let i = 0; i < parsedRows.length; i++) {
    const r = parsedRows[i];
    const rowNum = i + 2;
    const errors: string[] = [];

    const code = sanitizeFormula(r['Item Code'] || r['code'] || r['Code'] || '').toUpperCase();
    const name = sanitizeFormula(r['Item Name'] || r['name'] || r['Name'] || '');
    const category = sanitizeFormula(r['Category'] || r['category'] || '');
    const uom = sanitizeFormula(r['Unit of Measure'] || r['uom'] || r['UOM'] || '');
    const min_stock = parseFloat(r['Min Stock Level'] || r['min_stock_level'] || '0') || 0;
    const reorder_qty = parseFloat(r['Reorder Quantity'] || r['reorder_quantity'] || '0') || 0;
    const cost_price = parseFloat(r['Cost Price'] || r['cost_price'] || '0') || 0;
    const selling_price = parseFloat(r['Selling Price'] || r['selling_price'] || '0') || 0;
    const barcode = sanitizeFormula(r['Barcode'] || r['barcode'] || '');
    const status = (r['Status'] || r['status'] || 'active').toLowerCase() === 'disabled' ? 'disabled' : 'active';
    const description = sanitizeFormula(r['Description'] || r['description'] || '');

    if (!code) errors.push('Item Code is required.');
    if (!name) errors.push('Item Name is required.');

    if (code && seenCodes.has(code)) {
      errors.push(`Duplicate item code '${code}' in this import file.`);
    } else if (code) {
      seenCodes.add(code);
    }

    const existing = code ? store.getItemByCode(code) : null;
    const is_duplicate = !!existing;
    if (is_duplicate) duplicateCount++;

    const is_valid = errors.length === 0;
    if (is_valid) validCount++;

    preview_items.push({
      row_number: rowNum,
      code,
      name,
      category,
      uom,
      min_stock_level: min_stock,
      reorder_quantity: reorder_qty,
      cost_price,
      selling_price,
      barcode,
      status,
      description,
      is_valid,
      is_duplicate,
      errors,
    });
  }

  res.json({
    success: true,
    data: {
      total_rows: parsedRows.length,
      valid_rows: validCount,
      invalid_rows: parsedRows.length - validCount,
      duplicate_rows: duplicateCount,
      preview_items,
    },
    message: `Preview generated: ${validCount} valid, ${duplicateCount} duplicates detected.`,
  });
});

app.post('/api/inventory/import/commit', authenticateToken, requirePermission('inventory.import'), (req: AuthenticatedRequest, res) => {
  const { duplicate_policy, rows } = req.body;
  const policy = duplicate_policy === 'update' ? 'update' : 'skip';

  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ success: false, message: 'No records provided for commit.' });
  }

  let created_count = 0;
  let updated_count = 0;
  let skipped_count = 0;
  let failed_count = 0;
  const errors: string[] = [];

  for (const row of rows) {
    try {
      const code = sanitizeFormula(row.code || row['Item Code'] || '').toUpperCase();
      const name = sanitizeFormula(row.name || row['Item Name'] || '');

      if (!code || !name) {
        failed_count++;
        errors.push(`Row ${row.row_number || '?'}: Missing code or name.`);
        continue;
      }

      // Resolve category if provided (do not auto-create)
      let categoryId: number | null = null;
      if (row.category && String(row.category).trim()) {
        const catQuery = String(row.category).trim();
        const matchedCat = store.getCategoryByCode(catQuery.toUpperCase()) ||
          store.getCategories().find(c => c.name.toLowerCase() === catQuery.toLowerCase() || c.code.toLowerCase() === catQuery.toLowerCase());
        if (matchedCat) {
          categoryId = matchedCat.id;
        }
      }

      // Resolve UOM if provided
      let uomId: number | null = null;
      if (row.uom && String(row.uom).trim()) {
        const uomQuery = String(row.uom).trim();
        const matchedUom = store.getUOMByCode(uomQuery.toUpperCase()) ||
          store.getUOMs().find(u => u.name.toLowerCase() === uomQuery.toLowerCase() || u.symbol.toLowerCase() === uomQuery.toLowerCase());
        if (matchedUom) {
          uomId = matchedUom.id;
        }
      }

      const existing = store.getItemByCode(code);
      if (existing) {
        if (policy === 'update') {
          const updatePayload: any = {
            name,
            min_stock_level: row.min_stock_level !== undefined ? row.min_stock_level : existing.min_stock_level,
            reorder_quantity: row.reorder_quantity !== undefined ? row.reorder_quantity : existing.reorder_quantity,
            cost_price: row.cost_price !== undefined ? row.cost_price : existing.cost_price,
            selling_price: row.selling_price !== undefined ? row.selling_price : existing.selling_price,
            barcode: row.barcode !== undefined ? row.barcode : existing.barcode,
            status: row.status || existing.status,
            description: row.description !== undefined ? row.description : existing.description,
          };
          if (categoryId !== null) {
            updatePayload.category_id = categoryId;
          }
          if (uomId !== null) {
            updatePayload.uom_id = uomId;
          }
          store.updateItem(existing.id, updatePayload);
          updated_count++;
        } else {
          skipped_count++;
        }
      } else {
        store.createItem({
          code,
          name,
          category_id: categoryId,
          uom_id: uomId,
          min_stock_level: row.min_stock_level || 0,
          reorder_quantity: row.reorder_quantity || 0,
          cost_price: row.cost_price || 0,
          selling_price: row.selling_price || 0,
          barcode: row.barcode || '',
          status: row.status || 'active',
          description: row.description || '',
          created_by: req.user!.id,
        });
        created_count++;
      }
    } catch (err: any) {
      failed_count++;
      errors.push(`Row ${row.row_number || '?'}: ${err.message}`);
    }
  }

  store.logAudit({
    user_id: req.user!.id,
    user_email: req.user!.email,
    action: 'INVENTORY_IMPORTED',
    module: 'Inventory',
    details: `Imported inventory with policy [${policy}]: Created ${created_count}, Updated ${updated_count}, Skipped ${skipped_count}, Failed ${failed_count}`,
    ip_address: req.ip || '127.0.0.1',
  });

  res.json({
    success: true,
    data: {
      total_processed: rows.length,
      created_count,
      updated_count,
      skipped_count,
      failed_count,
      errors,
    },
    message: `Batch import completed. Created: ${created_count}, Updated: ${updated_count}, Skipped: ${skipped_count}.`,
  });
});

// ==========================================
// ONLINE SUPPLIER REORDERING & NEGOTIATIONS
// ==========================================

// --- List & Search Reorders ---
app.get('/api/inventory/reorders', authenticateToken, requirePermission('inventory.view'), (req: AuthenticatedRequest, res) => {
  const { status, item_id, supplier_id, search, page, page_size } = req.query;
  const result = store.getReorders({
    status: status as string,
    item_id: item_id ? parseInt(item_id as string, 10) : undefined,
    supplier_id: supplier_id ? parseInt(supplier_id as string, 10) : undefined,
    search: search as string,
    page: page ? parseInt(page as string, 10) : 1,
    pageSize: page_size ? parseInt(page_size as string, 10) : 10,
  });
  res.json({ success: true, data: result, message: 'Reorders retrieved successfully.' });
});

// --- Get Reorder Details ---
app.get('/api/inventory/reorders/:id', authenticateToken, requirePermission('inventory.view'), (req: AuthenticatedRequest, res) => {
  const id = parseInt(req.params.id, 10);
  const reorder = store.getReorderById(id);
  if (!reorder) {
    return res.status(404).json({ success: false, message: 'Reorder request not found.' });
  }
  const negotiations = store.getNegotiationHistory(id);
  res.json({
    success: true,
    data: {
      ...reorder,
      negotiations,
    },
    message: 'Reorder retrieved.',
  });
});

// --- Create New Online Reorder Request ---
app.post('/api/inventory/reorders', authenticateToken, requirePermission('inventory.reorder'), async (req: AuthenticatedRequest, res) => {
  const { item_id, supplier_id, quantity, unit_price, expected_delivery_date, notes } = req.body;
  if (!item_id || !supplier_id || !quantity || unit_price === undefined) {
    return res.status(400).json({ success: false, message: 'Item, supplier, quantity, and unit price are required.' });
  }

  try {
    const { reorder, token } = store.createReorderRequest({
      item_id: parseInt(item_id, 10),
      supplier_id: parseInt(supplier_id, 10),
      quantity: parseFloat(quantity),
      unit_price: parseFloat(unit_price),
      expected_delivery_date,
      notes,
      user_id: req.user!.id,
    });

    const item = store.getItemById(reorder.item_id);
    const supplier = store.getSupplierById(reorder.supplier_id);
    const appUrl = `${req.protocol}://${req.get('host')}`;

    // Send email to supplier
    let emailResult: any = { success: true, supplierLink: `${appUrl}/supplier-portal/${token}` };
    if (supplier && supplier.email) {
      emailResult = await emailService.sendSupplierReorderEmail({
        supplierEmail: supplier.email,
        supplierName: supplier.name,
        reorderNo: reorder.reorder_no,
        itemName: item?.name || 'Inventory Item',
        itemCode: item?.code || 'SKU',
        quantity: reorder.quantity,
        unitPrice: reorder.unit_price,
        totalAmount: reorder.total_amount,
        expectedDeliveryDate: reorder.expected_delivery_date,
        notes: reorder.notes,
        token,
        appUrl,
      });
    }

    store.logAudit({
      user_id: req.user!.id,
      user_email: req.user!.email,
      action: 'REORDER_CREATED',
      module: 'Inventory',
      details: `Created reorder ${reorder.reorder_no} for ${item?.name} (${supplier?.name}) - ₹${reorder.total_amount}`,
      ip_address: req.ip || '127.0.0.1',
    });

    const enriched = store.getReorderById(reorder.id);
    res.status(201).json({
      success: true,
      data: {
        ...enriched,
        supplier_link: emailResult.supplierLink,
        token,
      },
      message: `Reorder request ${reorder.reorder_no} generated and dispatched to supplier.`,
    });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// --- Accept Supplier Counteroffer ---
app.post('/api/inventory/reorders/:id/accept-counteroffer', authenticateToken, requirePermission('inventory.reorder'), (req: AuthenticatedRequest, res) => {
  const id = parseInt(req.params.id, 10);
  const { notes } = req.body;
  try {
    const updated = store.buyerAcceptCounteroffer(id, req.user!.id, notes);
    store.logAudit({
      user_id: req.user!.id,
      user_email: req.user!.email,
      action: 'COUNTEROFFER_ACCEPTED',
      module: 'Inventory',
      details: `Accepted supplier counteroffer for reorder ${updated.reorder_no}`,
      ip_address: req.ip || '127.0.0.1',
    });
    res.json({ success: true, data: updated, message: 'Supplier counteroffer accepted.' });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// --- Revise Proposal / Counter-Propose ---
app.post('/api/inventory/reorders/:id/revise', authenticateToken, requirePermission('inventory.reorder'), async (req: AuthenticatedRequest, res) => {
  const id = parseInt(req.params.id, 10);
  const { unit_price, quantity, expected_delivery_date, notes } = req.body;
  if (!unit_price || !quantity) {
    return res.status(400).json({ success: false, message: 'Unit price and quantity are required.' });
  }

  try {
    const { reorder, token } = store.buyerReviseProposal(id, {
      unit_price: parseFloat(unit_price),
      quantity: parseFloat(quantity),
      expected_delivery_date,
      notes,
      userId: req.user!.id,
    });

    const supplier = store.getSupplierById(reorder.supplier_id);
    const item = store.getItemById(reorder.item_id);
    const appUrl = `${req.protocol}://${req.get('host')}`;

    if (supplier && supplier.email) {
      await emailService.sendSupplierReorderEmail({
        supplierEmail: supplier.email,
        supplierName: supplier.name,
        reorderNo: reorder.reorder_no,
        itemName: item?.name || 'Inventory Item',
        itemCode: item?.code || 'SKU',
        quantity: reorder.quantity,
        unitPrice: reorder.unit_price,
        totalAmount: reorder.total_amount,
        expectedDeliveryDate: reorder.expected_delivery_date,
        notes: `Revised Proposal: ${notes || ''}`,
        token,
        appUrl,
      });
    }

    store.logAudit({
      user_id: req.user!.id,
      user_email: req.user!.email,
      action: 'REORDER_REVISED',
      module: 'Inventory',
      details: `Revised proposal for reorder ${reorder.reorder_no}`,
      ip_address: req.ip || '127.0.0.1',
    });

    res.json({
      success: true,
      data: {
        ...reorder,
        supplier_link: `${appUrl}/supplier-portal/${token}`,
      },
      message: 'Revised offer dispatched to supplier.',
    });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// --- Cancel Reorder ---
app.post('/api/inventory/reorders/:id/cancel', authenticateToken, requirePermission('inventory.reorder'), (req: AuthenticatedRequest, res) => {
  const id = parseInt(req.params.id, 10);
  const { reason } = req.body;
  try {
    const updated = store.buyerCancelReorder(id, req.user!.id, reason);
    store.logAudit({
      user_id: req.user!.id,
      user_email: req.user!.email,
      action: 'REORDER_CANCELLED',
      module: 'Inventory',
      details: `Cancelled reorder ${updated.reorder_no}. Reason: ${reason || 'N/A'}`,
      ip_address: req.ip || '127.0.0.1',
    });
    res.json({ success: true, data: updated, message: 'Reorder cancelled.' });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// --- Resend Notification Email / Refresh Link ---
app.post('/api/inventory/reorders/:id/resend-email', authenticateToken, requirePermission('inventory.reorder'), async (req: AuthenticatedRequest, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    const { reorder, token } = store.regenerateSupplierToken(id);
    const supplier = store.getSupplierById(reorder.supplier_id);
    const item = store.getItemById(reorder.item_id);
    const appUrl = `${req.protocol}://${req.get('host')}`;

    let emailResult: any = { success: true, supplierLink: `${appUrl}/supplier-portal/${token}` };
    if (supplier && supplier.email) {
      emailResult = await emailService.sendSupplierReorderEmail({
        supplierEmail: supplier.email,
        supplierName: supplier.name,
        reorderNo: reorder.reorder_no,
        itemName: item?.name || 'Inventory Item',
        itemCode: item?.code || 'SKU',
        quantity: reorder.quantity,
        unitPrice: reorder.unit_price,
        totalAmount: reorder.total_amount,
        expectedDeliveryDate: reorder.expected_delivery_date,
        notes: reorder.notes,
        token,
        appUrl,
      });
    }

    res.json({
      success: true,
      data: {
        ...reorder,
        supplier_link: emailResult.supplierLink,
      },
      message: 'Reorder link refreshed and notification email re-sent.',
    });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// --- Negotiation Audit History ---
app.get('/api/inventory/reorders/:id/negotiations', authenticateToken, requirePermission('inventory.view'), (req: AuthenticatedRequest, res) => {
  const id = parseInt(req.params.id, 10);
  const negotiations = store.getNegotiationHistory(id);
  res.json({ success: true, data: negotiations, message: 'Negotiation history retrieved.' });
});

// ==========================================
// PUBLIC SUPPLIER PORTAL (Token-protected)
// ==========================================

// --- Supplier Views Reorder Details via Protected Link ---
app.get('/api/public/supplier-reorders/:token', (req, res) => {
  const token = req.params.token;
  const result = store.getReorderByToken(token);
  if (result.error && !result.reorder) {
    return res.status(404).json({ success: false, message: result.error });
  }
  const negotiations = result.reorder ? store.getNegotiationHistory(result.reorder.id) : [];
  res.json({
    success: true,
    data: {
      ...result.reorder,
      is_expired: !!result.isExpired,
      negotiations,
    },
    message: result.error || 'Reorder details retrieved.',
  });
});

// --- Supplier Accepts Reorder ---
app.post('/api/public/supplier-reorders/:token/accept', (req, res) => {
  const token = req.params.token;
  const { notes } = req.body;
  try {
    const outcome = store.supplierAcceptReorder(token, notes);
    res.json({ success: true, data: outcome.reorder, message: outcome.message });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// --- Supplier Submits Counteroffer / Negotiates ---
app.post('/api/public/supplier-reorders/:token/negotiate', (req, res) => {
  const token = req.params.token;
  const unit_price = req.body.unit_price ?? req.body.counter_unit_price;
  const quantity = req.body.quantity ?? req.body.counter_quantity;
  const delivery_date = req.body.delivery_date ?? req.body.counter_delivery_date;
  const notes = req.body.notes ?? req.body.counter_notes ?? '';

  if (unit_price === undefined || unit_price === null || quantity === undefined || quantity === null) {
    return res.status(400).json({ success: false, message: 'Proposed unit price and quantity are required.' });
  }
  try {
    const outcome = store.supplierNegotiateReorder(token, {
      unit_price: parseFloat(unit_price),
      quantity: parseFloat(quantity),
      delivery_date,
      notes,
    });
    res.json({ success: true, data: outcome.reorder, message: outcome.message });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// --- Supplier Rejects Reorder ---
app.post('/api/public/supplier-reorders/:token/reject', (req, res) => {
  const token = req.params.token;
  const { reason } = req.body;
  if (!reason || !reason.trim()) {
    return res.status(400).json({ success: false, message: 'A rejection reason is required.' });
  }
  try {
    const outcome = store.supplierRejectReorder(token, reason);
    res.json({ success: true, data: outcome.reorder, message: outcome.message });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// ==========================================
// MODULE 8: WAREHOUSE MANAGEMENT & CROSS-MODULE
// ==========================================

// --- Warehouse Directory (RBAC Protected) ---
app.get('/api/warehouses', authenticateToken, requirePermission('warehouses.view'), (req: AuthenticatedRequest, res) => {
  const warehouses = store.getWarehouses();
  res.json({
    success: true,
    data: warehouses,
    message: `${warehouses.length} warehouse(s) retrieved.`,
  });
});

app.get('/api/warehouses/dashboard-stats', authenticateToken, requirePermission('warehouses.view'), (req: AuthenticatedRequest, res) => {
  const stats = store.getWarehouseDashboardStats();
  res.json({
    success: true,
    data: stats,
    message: 'Warehouse dashboard statistics retrieved.',
  });
});

app.get('/api/warehouses/stock', authenticateToken, requirePermission('warehouses.view'), (req: AuthenticatedRequest, res) => {
  const warehouseId = req.query.warehouse_id ? parseInt(req.query.warehouse_id as string, 10) : undefined;
  const stock = store.getWarehouseStockDetails(warehouseId);
  res.json({
    success: true,
    data: stock,
    message: 'Warehouse stock balances retrieved.',
  });
});

app.get('/api/warehouses/:id(\\d+)', authenticateToken, requirePermission('warehouses.view'), (req: AuthenticatedRequest, res) => {
  const id = parseInt(req.params.id, 10);
  const warehouse = store.getWarehouseById(id);
  if (!warehouse) {
    return res.status(404).json({ success: false, message: 'Warehouse not found.' });
  }
  const stock = store.getWarehouseStockDetails(id);
  res.json({
    success: true,
    data: { ...warehouse, stock_items: stock },
    message: 'Warehouse details retrieved.',
  });
});

app.post('/api/warehouses', authenticateToken, requirePermission('warehouses.create'), (req: AuthenticatedRequest, res) => {
  const { code, name, address, contact_details, manager_name, manager_email, manager_phone, warehouse_type, capacity } = req.body;
  if (!code || !name) {
    return res.status(400).json({ success: false, message: 'Warehouse code and name are required.' });
  }
  try {
    const warehouse = store.createWarehouse({
      code,
      name,
      address: contact_details ? `${address || ''} (Contact: ${contact_details})`.trim() : address,
      manager_name,
      manager_email,
      manager_phone,
      warehouse_type,
      capacity: capacity ? parseFloat(capacity) : undefined,
    });
    store.logAudit({
      user_id: req.user!.id,
      user_email: req.user!.email,
      action: 'WAREHOUSE_CREATED',
      module: 'Warehouse',
      details: `Created warehouse '${warehouse.name}' (${warehouse.code})`,
      ip_address: req.ip || '127.0.0.1',
    });
    res.status(201).json({ success: true, data: warehouse, message: 'Warehouse created successfully.' });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

app.put('/api/warehouses/:id(\\d+)', authenticateToken, requirePermission('warehouses.edit'), (req: AuthenticatedRequest, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    const updated = store.updateWarehouse(id, req.body);
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Warehouse not found.' });
    }
    store.logAudit({
      user_id: req.user!.id,
      user_email: req.user!.email,
      action: 'WAREHOUSE_UPDATED',
      module: 'Warehouse',
      details: `Updated warehouse '${updated.name}' (${updated.code})`,
      ip_address: req.ip || '127.0.0.1',
    });
    res.json({ success: true, data: updated, message: 'Warehouse updated successfully.' });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

app.delete('/api/warehouses/:id(\\d+)', authenticateToken, requirePermission('warehouses.delete'), (req: AuthenticatedRequest, res) => {
  const id = parseInt(req.params.id, 10);
  const forceDisable = req.query.force_disable === 'true';
  try {
    const result = store.deleteWarehouse(id, forceDisable);
    if (!result.success) {
      return res.status(400).json({ success: false, message: result.message });
    }
    store.logAudit({
      user_id: req.user!.id,
      user_email: req.user!.email,
      action: result.action === 'disabled' ? 'WAREHOUSE_DISABLED' : 'WAREHOUSE_DELETED',
      module: 'Warehouse',
      details: `${result.message} (ID: ${id})`,
      ip_address: req.ip || '127.0.0.1',
    });
    res.json({ success: true, message: result.message });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// --- Warehouse Stock Transfers (RBAC Protected) ---
app.get('/api/warehouses/transfers', authenticateToken, requirePermission('warehouses.view'), (req: AuthenticatedRequest, res) => {
  const transfers = store.getStockTransfers(req.query as any);
  res.json({ success: true, data: transfers, message: `${transfers.length} transfer(s) retrieved.` });
});

app.get('/api/warehouses/transfers/:id', authenticateToken, requirePermission('warehouses.view'), (req: AuthenticatedRequest, res) => {
  const id = parseInt(req.params.id, 10);
  const transfer = store.getTransferById(id);
  if (!transfer) {
    return res.status(404).json({ success: false, message: 'Stock transfer not found.' });
  }
  res.json({ success: true, data: transfer, message: 'Stock transfer retrieved.' });
});

app.post('/api/warehouses/transfers', authenticateToken, requirePermission('warehouses.edit'), (req: AuthenticatedRequest, res) => {
  const { source_warehouse_id, destination_warehouse_id, item_id, requested_quantity, remarks, notes } = req.body;
  if (!source_warehouse_id || !destination_warehouse_id || !item_id || !requested_quantity) {
    return res.status(400).json({ success: false, message: 'Source, destination, item, and quantity are required.' });
  }
  try {
    const transfer = store.createStockTransfer({
      source_warehouse_id: parseInt(source_warehouse_id, 10),
      destination_warehouse_id: parseInt(destination_warehouse_id, 10),
      item_id: parseInt(item_id, 10),
      requested_quantity: parseFloat(requested_quantity),
      notes: remarks || notes,
      submit_for_approval: true,
      user_id: req.user!.id,
      user_name: req.user!.username,
    });
    store.logAudit({
      user_id: req.user!.id,
      user_email: req.user!.email,
      action: 'STOCK_TRANSFER_REQUESTED',
      module: 'Warehouse',
      details: `Created stock transfer ${transfer.transfer_no}`,
      ip_address: req.ip || '127.0.0.1',
    });
    res.status(201).json({ success: true, data: transfer, message: `Transfer ${transfer.transfer_no} requested.` });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

app.put('/api/warehouses/transfers/:id/approve', authenticateToken, requirePermission('warehouses.edit'), (req: AuthenticatedRequest, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    const updated = store.approveStockTransfer(id, req.user!.id, req.user!.username);
    store.logAudit({
      user_id: req.user!.id,
      user_email: req.user!.email,
      action: 'STOCK_TRANSFER_APPROVED',
      module: 'Warehouse',
      details: `Approved stock transfer ${updated.transfer_no}`,
      ip_address: req.ip || '127.0.0.1',
    });
    res.json({ success: true, data: updated, message: `Transfer ${updated.transfer_no} approved.` });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

app.put('/api/warehouses/transfers/:id/dispatch', authenticateToken, requirePermission('warehouses.edit'), (req: AuthenticatedRequest, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    const updated = store.dispatchStockTransfer(id, req.user!.id, req.user!.username);
    store.logAudit({
      user_id: req.user!.id,
      user_email: req.user!.email,
      action: 'STOCK_TRANSFER_DISPATCHED',
      module: 'Warehouse',
      details: `Dispatched stock transfer ${updated.transfer_no} (${updated.requested_quantity} units removed from source)`,
      ip_address: req.ip || '127.0.0.1',
    });
    res.json({ success: true, data: updated, message: `Transfer ${updated.transfer_no} dispatched in-transit.` });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

app.put('/api/warehouses/transfers/:id/receive', authenticateToken, requirePermission('warehouses.edit'), (req: AuthenticatedRequest, res) => {
  const id = parseInt(req.params.id, 10);
  const { received_quantity, remarks, discrepancy_reason } = req.body;
  if (received_quantity === undefined) {
    return res.status(400).json({ success: false, message: 'Received quantity is required.' });
  }
  try {
    const updated = store.receiveStockTransfer(
      id,
      parseFloat(received_quantity),
      remarks || discrepancy_reason,
      req.user!.id,
      req.user!.username
    );
    store.logAudit({
      user_id: req.user!.id,
      user_email: req.user!.email,
      action: 'STOCK_TRANSFER_RECEIVED',
      module: 'Warehouse',
      details: `Received stock transfer ${updated.transfer_no} (${updated.received_quantity} units credited to destination)`,
      ip_address: req.ip || '127.0.0.1',
    });
    res.json({ success: true, data: updated, message: `Transfer ${updated.transfer_no} received and stock updated.` });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

app.put('/api/warehouses/transfers/:id/cancel', authenticateToken, requirePermission('warehouses.edit'), (req: AuthenticatedRequest, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    const updated = store.cancelStockTransfer(
      id,
      req.body.remarks || req.body.reason || 'Cancelled by user',
      req.user!.id,
      req.user!.username
    );
    store.logAudit({
      user_id: req.user!.id,
      user_email: req.user!.email,
      action: 'STOCK_TRANSFER_CANCELLED',
      module: 'Warehouse',
      details: `Cancelled stock transfer ${updated.transfer_no}`,
      ip_address: req.ip || '127.0.0.1',
    });
    res.json({ success: true, data: updated, message: `Transfer ${updated.transfer_no} cancelled.` });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// --- Physical Stock Verification (RBAC Protected) ---
app.get('/api/warehouses/verifications', authenticateToken, requirePermission('warehouses.view'), (req: AuthenticatedRequest, res) => {
  const verifications = store.getStockVerifications(req.query as any);
  res.json({ success: true, data: verifications, message: `${verifications.length} verification(s) retrieved.` });
});

app.get('/api/warehouses/verifications/:id', authenticateToken, requirePermission('warehouses.view'), (req: AuthenticatedRequest, res) => {
  const id = parseInt(req.params.id, 10);
  const verification = store.getVerificationById(id);
  if (!verification) {
    return res.status(404).json({ success: false, message: 'Stock verification not found.' });
  }
  res.json({ success: true, data: verification, message: 'Stock verification retrieved.' });
});

app.post('/api/warehouses/verifications', authenticateToken, requirePermission('warehouses.edit'), (req: AuthenticatedRequest, res) => {
  const { warehouse_id, items, remarks, notes } = req.body;
  if (!warehouse_id || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, message: 'Warehouse ID and counted items list are required.' });
  }
  try {
    const verification = store.createStockVerification({
      warehouse_id: parseInt(warehouse_id, 10),
      items: items.map((it: any) => ({
        item_id: parseInt(it.item_id, 10),
        counted_quantity: parseFloat(it.physical_quantity !== undefined ? it.physical_quantity : (it.counted_quantity || 0)),
        reason: it.discrepancy_reason || it.reason,
      })),
      notes: remarks || notes,
      submit_for_approval: true,
      user_id: req.user!.id,
      user_name: req.user!.username,
    });
    store.logAudit({
      user_id: req.user!.id,
      user_email: req.user!.email,
      action: 'STOCK_VERIFICATION_SUBMITTED',
      module: 'Warehouse',
      details: `Submitted physical stock audit ${verification.verification_no} for ${items.length} item(s)`,
      ip_address: req.ip || '127.0.0.1',
    });
    res.status(201).json({ success: true, data: verification, message: `Verification session ${verification.verification_no} submitted.` });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

app.put('/api/warehouses/verifications/:id/approve', authenticateToken, requirePermission('warehouses.edit'), (req: AuthenticatedRequest, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    const updated = store.approveStockVerification(id, req.user!.id, req.user!.username);
    store.logAudit({
      user_id: req.user!.id,
      user_email: req.user!.email,
      action: 'STOCK_VERIFICATION_APPROVED',
      module: 'Warehouse',
      details: `Approved physical stock audit ${updated.verification_no} and adjusted system inventory`,
      ip_address: req.ip || '127.0.0.1',
    });
    res.json({ success: true, data: updated, message: `Verification ${updated.verification_no} approved and stock adjusted.` });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// --- Cross-Module: Goods Receipt from Purchase Requests (RBAC Protected) ---
app.post(['/api/inventory/reorders/:id/goods-receipt', '/api/purchasing/requests/:id/receive'], authenticateToken, requirePermission('inventory.edit'), (req: AuthenticatedRequest, res) => {
  const id = parseInt(req.params.id, 10);
  const { warehouse_id, received_quantity, challan_no, notes } = req.body;
  if (!warehouse_id || received_quantity === undefined) {
    return res.status(400).json({ success: false, message: 'Destination warehouse and received quantity are required.' });
  }
  try {
    const result = store.receiveGoodsForReorder(id, {
      destination_warehouse_id: parseInt(warehouse_id, 10),
      received_quantity: parseFloat(received_quantity),
      invoice_ref: challan_no,
      notes,
      user_id: req.user!.id,
      user_name: req.user!.username,
    });
    store.logAudit({
      user_id: req.user!.id,
      user_email: req.user!.email,
      action: 'GOODS_RECEIVED_PURCHASE',
      module: 'Procurement',
      details: `Received ${received_quantity} units into warehouse ${warehouse_id} for reorder #${id} (Challan: ${challan_no || 'N/A'})`,
      ip_address: req.ip || '127.0.0.1',
    });
    res.json({ success: true, data: result, message: 'Goods received and warehouse inventory updated.' });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// --- Supplier & Email Communications History (RBAC Protected) ---
app.get('/api/suppliers/conversations', authenticateToken, requirePermission('suppliers.view'), (req: AuthenticatedRequest, res) => {
  const { reorder_id, search } = req.query;
  const conversations = store.getEmailConversations({
    reorder_id: reorder_id ? parseInt(reorder_id as string, 10) : undefined,
    search: search ? String(search) : undefined,
  });
  res.json({ success: true, data: conversations, message: `${conversations.length} conversation record(s) retrieved.` });
});

// Mount Persistent PostgreSQL Backup Multi-Scheduler & Back Office Restore Management Routes
app.use('/api/security', createBackupRestoreRouter(authenticateToken));

// Mount PostgreSQL-Only ERP Module Routes (Suppliers Ext, Warehouse Locations, Purchase Orders, GRN/QC, Products/BOM, Production, Readiness, Reporting & Analytics)
app.use('/api', createErpRouter(authenticateToken, requirePermission));

// Catch-all 404 handler for unmatched /api routes
app.all('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `API endpoint ${req.method} ${req.path} not found.`,
  });
});

// Centralized safe error handler (never leaks stack traces or SQL internals in production)
app.use(safeErrorHandler);

// ==========================================
// BOOTSTRAP VITE & START SERVER
// ==========================================
async function startServer() {
  if (runtimeConfig.databaseUrl && process.env.DISABLE_PG_FOR_TESTS !== 'true') {
    const pgStatus = await checkPostgresHealth();
    if (pgStatus.connected) {
      console.log(`[Nexora Database] PostgreSQL connected (${pgStatus.latency_ms}ms) — hydrating PostgreSQL-only state...`);
      await Promise.allSettled([
        store.hydrateFromPostgres(),
        securityStore.hydrateFromPostgres(),
      ]);
    } else {
      console.warn('[Nexora Database] PostgreSQL unavailable at startup. Verify DATABASE_URL and run "npm run db:update" manually if needed.');
    }
  }

  if (runtimeConfig.isProduction) {
    const distPath = path.resolve(process.cwd(), 'dist');
    const assetsPath = path.join(distPath, 'assets');

    // Immutable long-term cache for Vite content-hashed static assets
    if (fs.existsSync(assetsPath)) {
      app.use('/assets', express.static(assetsPath, { maxAge: '30d', immutable: true, dotfiles: 'deny' }));
    }

    // Serve remaining built frontend files (excluding dotfiles and never caching index.html)
    app.use(
      express.static(distPath, {
        dotfiles: 'deny',
        index: false,
        maxAge: '1h',
      })
    );

    // SPA fallback routing for single-domain deployment (e.g. /admin, /inventory, /security-center)
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) {
        return next();
      }
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  } else {
    // Mount Vite dev server middleware directly (ignoring runtime data writes so login never triggers a page reload)
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
        watch:
          process.env.DISABLE_HMR === 'true'
            ? null
            : {
                ignored: [
                  '**/database/**',
                  '**/private_backups/**',
                  '**/private_logs/**',
                  '**/private_tmp/**',
                  '**/uploads/**',
                  '**/server/**',
                  '**/server.ts',
                  '**/tests/**',
                  '**/deploy/**',
                  '**/docs/**',
                ],
              },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  // Start persistent PostgreSQL backup multi-scheduler & lock-guarded fallback scheduler
  backupSchedulerService.start();
  backupService.startInProcessScheduler();

  const server = app.listen(PORT, SERVER_HOST, () => {
    console.log(
      `[Nexora Server] Listening on http://${SERVER_HOST}:${PORT} (env=${APP_ENV}, public=${runtimeConfig.appUrl})`
    );
    // Non-blocking initial health check & display standardized monitor banner
    setTimeout(async () => {
      try {
        const report = await healthMonitor.runFullCheck();
        healthMonitor.printStatusBanner(report);
        healthMonitor.startMonitoring();
      } catch (err: any) {
        console.error('[Nexora Health Monitor Startup Error]:', err.message);
      }
    }, 350);
  });

  // Tune HTTP keep-alive & headers timeout cleanly for Nginx/Apache reverse proxies
  server.keepAliveTimeout = 65000;
  server.headersTimeout = 66000;

  let isShuttingDown = false;
  const gracefulShutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`[Nexora Server] Received ${signal}. Initiating graceful shutdown...`);

    // Force-exit safety net after 10 seconds
    const forceTimer = setTimeout(() => {
      console.error('[Nexora Server] Graceful shutdown timed out; forcing exit.');
      process.exit(1);
    }, 10000);
    if (typeof forceTimer.unref === 'function') forceTimer.unref();

    try {
      healthMonitor.stopMonitoring();
      backupSchedulerService.stop();
      backupService.stopInProcessScheduler();
      closeAllSseClients();

      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });

      await Promise.allSettled([
        store.flushPendingWrites(),
        pgPool ? pgPool.end() : Promise.resolve(),
        closeDbPool(),
        securityStore.close(),
      ]);
      console.log('[Nexora Server] All connections closed cleanly. Exiting.');
      process.exit(0);
    } catch (err: any) {
      console.error('[Nexora Server] Shutdown error:', err?.message || err);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => void gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'));
}

if (process.env.NEXORA_TEST_IMPORT !== 'true') {
  startServer().catch(err => {
    console.error('Failed to start Nexora server:', err);
    process.exit(1);
  });
}
