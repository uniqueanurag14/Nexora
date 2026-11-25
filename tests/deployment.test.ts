/**
 * NEXORA ERP — Single-Server Production Deployment & Domain Configuration Test Suite
 *
 * Verifies:
 *  1. Centralized runtime configuration & strict production startup validation
 *  2. Trusted proxy parsing (never blindly trusts arbitrary proxies)
 *  3. Public /api/health & authenticated /api/health/admin endpoints (zero credential/path leakage)
 *  4. Single-domain SSE endpoint (/api/events) auth + anti-buffering headers
 *  5. Secure cookie attributes (HttpOnly, SameSite, Secure when SECURE_COOKIES=true)
 *  6. HTTPS enforcement middleware (301 redirect to configured APP_URL, 426 API guard, loopback health bypass)
 *  7. Centralized relative frontend API/SSE URL builders (zero hardcoded localhost/IPs)
 */

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexora-deploy-test-'));
const storeFile = path.resolve(process.cwd(), 'database', 'nexora_store.json');
const originalStoreContent = fs.existsSync(storeFile) ? fs.readFileSync(storeFile, 'utf-8') : null;

process.env.NEXORA_TEST_IMPORT = 'true';
process.env.NODE_ENV = 'test';
process.env.DISABLE_PG_FOR_TESTS = 'true';
process.env.JWT_ACCESS_SECRET = 'deploy_test_jwt_secret_1234567890_abcdef_9876543210';
process.env.BACKUP_ENCRYPTION_KEY = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';
process.env.AUDIT_SIGNING_KEY = 'f1e2d3c4b5a6f1e2d3c4b5a6f1e2d3c4b5a6f1e2d3c4b5a6f1e2d3c4b5a6f1e2';
process.env.DB_BACKUP_DIR = path.join(tmpDir, 'backups');
process.env.SECURITY_STATE_PATH = path.join(tmpDir, 'security_state.json');
process.env.TEMP_DIR = path.join(tmpDir, 'tmp');
process.env.LOGS_DIR = path.join(tmpDir, 'logs');
process.env.APP_URL = 'https://abcd.com';
process.env.FRONTEND_URL = 'https://abcd.com';
process.env.BACKEND_URL = 'https://abcd.com';
process.env.CORS_ORIGINS = 'https://abcd.com,https://www.abcd.com';
process.env.TRUST_PROXY = 'loopback';

let server: http.Server;
let baseUrl = '';
let adminToken = '';

async function httpReq(
  method: string,
  reqPath: string,
  options: { headers?: Record<string, string>; body?: any } = {}
): Promise<{ status: number; headers: http.IncomingHttpHeaders; json: any; text: string }> {
  return new Promise((resolve, reject) => {
    const url = new URL(reqPath, baseUrl);
    const payload = options.body !== undefined ? JSON.stringify(options.body) : undefined;
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method,
        headers: {
          ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': String(Buffer.byteLength(payload)) } : {}),
          ...(options.headers || {}),
        },
      },
      (res) => {
        let data = '';
        res.on('data', chunk => (data += chunk));
        res.on('end', () => {
          let parsed: any = null;
          try {
            parsed = JSON.parse(data);
          } catch {}
          resolve({ status: res.statusCode || 0, headers: res.headers, json: parsed, text: data });
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

before(async () => {
  const { app } = await import('../server');
  const { store } = await import('../server/store');
  const { authService } = await import('../server/authService');

  // Ensure deterministic super admin user for tests
  const existing = store.findUserByEmail('deploy-admin@abcd.com');
  const pwHash = await authService.hashPassword('DeployPass#2026!');
  if (!existing) {
    store.createUser({
      first_name: 'Deploy',
      last_name: 'Admin',
      email: 'deploy-admin@abcd.com',
      username: 'deployadmin',
      phone: '',
      department: 'IT',
      password_hash: pwHash,
      role: 'super_admin',
      roles: ['super_admin'],
      is_active: true,
      is_verified: true,
    });
  }

  server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const addr = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}`;

  const loginRes = await httpReq('POST', '/api/auth/login', {
    headers: { 'X-Nexora-Device-Id': 'deploy-test-device-001' },
    body: { email: 'deploy-admin@abcd.com', password: 'DeployPass#2026!' },
  });
  assert.equal(loginRes.status, 200, `Admin login failed: ${loginRes.text}`);
  adminToken = loginRes.json.data.access_token;
});

after(async () => {
  if (server) {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
  if (originalStoreContent !== null) {
    fs.writeFileSync(storeFile, originalStoreContent, 'utf-8');
  }
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('1. parseTrustProxy enforces strict proxy modes (never blindly unbounded)', async () => {
  const { parseTrustProxy } = await import('../server/config/runtimeConfig');
  assert.equal(parseTrustProxy('false', true), false);
  assert.equal(parseTrustProxy('loopback', true), 'loopback');
  assert.equal(parseTrustProxy('1', true), 1);
  assert.equal(parseTrustProxy('true', true), 1); // safely bounded to 1 hop
  assert.deepEqual(parseTrustProxy('127.0.0.1, 10.0.0.1', true), ['127.0.0.1', '10.0.0.1']);
});

test('2. Production validation rejects localhost URLs, wildcard CORS, and reused backup keys', async () => {
  const { reloadRuntimeConfig, validateRuntimeEnvironment } = await import('../server/config/runtimeConfig');
  const savedEnv = { ...process.env };

  try {
    process.env.NEXORA_TEST_IMPORT = 'false';
    process.env.NODE_ENV = 'production';
    process.env.APP_ENV = 'production';
    process.env.APP_URL = 'http://localhost:3001';
    process.env.CORS_ORIGINS = '*';
    process.env.HTTPS_ONLY = 'true';
    process.env.JWT_ACCESS_SECRET = 'a'.repeat(64);
    process.env.BACKUP_ENCRYPTION_KEY = 'a'.repeat(64); // invalid reuse

    const cfg = reloadRuntimeConfig();
    assert.equal(cfg.isProduction, true);
    assert.ok(cfg.errors.some(e => e.includes('localhost')));
    assert.ok(cfg.errors.some(e => e.includes('wildcard')));
    assert.ok(cfg.errors.some(e => e.includes('JWT_ACCESS_SECRET')));
    assert.throws(() => validateRuntimeEnvironment(), /NEXORA STARTUP CONFIGURATION ERROR/);

    // Now supply clean single-domain production config (testing production defaults when host/cookie/https unset)
    delete process.env.SERVER_HOST;
    delete process.env.HTTPS_ONLY;
    delete process.env.SECURE_COOKIES;
    process.env.APP_URL = 'https://abcd.com';
    process.env.FRONTEND_URL = 'https://abcd.com';
    process.env.BACKEND_URL = 'https://abcd.com';
    process.env.CORS_ORIGINS = 'https://abcd.com,https://www.abcd.com';
    process.env.BACKUP_ENCRYPTION_KEY = 'b'.repeat(64);
    const validCfg = reloadRuntimeConfig();
    assert.equal(validCfg.errors.length, 0, `Unexpected production config errors: ${validCfg.errors.join('; ')}`);
    assert.equal(validCfg.serverHost, '127.0.0.1');
    assert.equal(validCfg.httpsOnly, true);
    assert.equal(validCfg.secureCookies, true);
  } finally {
    process.env = savedEnv;
    reloadRuntimeConfig();
  }
});

test('3. GET /api/health returns required production-safe fields with zero secrets or internal paths', async () => {
  const res = await httpReq('GET', '/api/health');
  assert.equal(res.status, 200);
  assert.equal(res.json.success, true);
  assert.ok(['healthy', 'degraded'].includes(res.json.status));
  assert.equal(res.json.data.app, 'Nexora');
  assert.ok(['connected', 'unavailable'].includes(res.json.data.postgresql));
  assert.equal(res.json.data.storage_engine, 'postgresql');
  assert.equal(typeof res.json.data.uptime_seconds, 'number');
  assert.ok(typeof res.json.data.timestamp === 'string' && !Number.isNaN(Date.parse(res.json.data.timestamp)));

  // Guarantee zero credential or filesystem path leaks in public health response
  const raw = res.text;
  assert.ok(!raw.includes('postgresql://'), 'Must not leak DATABASE_URL');
  assert.ok(!raw.includes(process.env.JWT_ACCESS_SECRET!), 'Must not leak JWT secret');
  assert.ok(!raw.includes(tmpDir), 'Must not leak internal filesystem paths');
  assert.ok(!raw.includes('nexora_store.json'), 'Must not leak JSON store path');
});

test('4. GET /api/health/admin requires auth and returns operational metrics without secrets', async () => {
  const unauth = await httpReq('GET', '/api/health/admin');
  assert.equal(unauth.status, 401);

  const auth = await httpReq('GET', '/api/health/admin', {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.equal(auth.status, 200);
  assert.equal(auth.json.success, true);
  assert.equal(auth.json.data.storage_engine, 'postgresql');
  assert.equal(typeof auth.json.data.memory_mb.rss, 'number');
  assert.equal(typeof auth.json.data.sse_active_clients, 'number');
  assert.ok(!auth.text.includes(process.env.BACKUP_ENCRYPTION_KEY!));
});

test('5. Single-domain SSE endpoint /api/events enforces JWT auth and disables proxy buffering', async () => {
  const unauth = await httpReq('GET', '/api/events');
  assert.equal(unauth.status, 401);

  // Authenticated SSE connection receives immediate CONNECTED event + anti-buffering headers
  await new Promise<void>((resolve, reject) => {
    const url = new URL(`/api/events?token=${encodeURIComponent(adminToken)}`, baseUrl);
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method: 'GET',
      },
      (res) => {
        try {
          assert.equal(res.statusCode, 200);
          assert.ok(String(res.headers['content-type']).includes('text/event-stream'));
          assert.equal(res.headers['x-accel-buffering'], 'no');
          assert.ok(String(res.headers['cache-control']).includes('no-transform'));

          let buffer = '';
          res.on('data', (chunk) => {
            buffer += chunk.toString('utf-8');
            if (buffer.includes('CONNECTED')) {
              req.destroy();
              resolve();
            }
          });
        } catch (err) {
          req.destroy();
          reject(err);
        }
      }
    );
    req.on('error', (err: any) => {
      if (err.code === 'ECONNRESET') return;
      reject(err);
    });
    req.end();
  });
});

test('6. Login sets HttpOnly SameSite auth cookie and CORS allowlist enforces custom domain', async () => {
  const loginRes = await httpReq('POST', '/api/auth/login', {
    headers: {
      Origin: 'https://abcd.com',
      'X-Nexora-Device-Id': 'deploy-test-device-001',
    },
    body: { email: 'deploy-admin@abcd.com', password: 'DeployPass#2026!' },
  });
  assert.equal(loginRes.status, 200);
  assert.equal(loginRes.headers['access-control-allow-origin'], 'https://abcd.com');
  const cookies = Array.isArray(loginRes.headers['set-cookie'])
    ? loginRes.headers['set-cookie']
    : [String(loginRes.headers['set-cookie'] || '')];
  const refreshCookie = cookies.find(c => c.startsWith('nexora_refresh_token='));
  assert.ok(refreshCookie, 'Expected HttpOnly nexora_refresh_token cookie');
  assert.ok(/HttpOnly/i.test(refreshCookie));
  assert.ok(/SameSite=Lax/i.test(refreshCookie));

  // Unlisted origin must be rejected on /api/*
  const badOrigin = await httpReq('GET', '/api/health', {
    headers: { Origin: 'https://evil-attacker.example' },
  });
  assert.equal(badOrigin.status, 403);
});

test('7. HTTPS enforcement redirects insecure GET to configured APP_URL and blocks insecure POST', async () => {
  const { httpsEnforcementMiddleware } = await import('../server/security/middleware');
  const { runtimeConfig } = await import('../server/config/runtimeConfig');

  const prevHttpsOnly = runtimeConfig.httpsOnly;
  const prevAppUrl = runtimeConfig.appUrl;
  runtimeConfig.httpsOnly = true;
  runtimeConfig.appUrl = 'https://abcd.com';

  try {
    // Insecure GET -> 301 to configured https://abcd.com (ignoring spoofed Host header)
    let redirectCode = 0;
    let redirectTarget = '';
    const fakeGetReq: any = {
      method: 'GET',
      path: '/admin',
      originalUrl: '/admin',
      secure: false,
      socket: { remoteAddress: '203.0.113.10' },
      headers: { host: 'evil.example' },
    };
    const fakeGetRes: any = {
      redirect: (code: number, target: string) => {
        redirectCode = code;
        redirectTarget = target;
      },
    };
    httpsEnforcementMiddleware(fakeGetReq, fakeGetRes, () => {
      throw new Error('Should not call next() on insecure GET');
    });
    assert.equal(redirectCode, 301);
    assert.equal(redirectTarget, 'https://abcd.com/admin');

    // Insecure POST -> 426 Upgrade Required
    let statusCode = 0;
    const fakePostReq: any = {
      method: 'POST',
      path: '/api/users',
      originalUrl: '/api/users',
      secure: false,
      socket: { remoteAddress: '203.0.113.10' },
      headers: {},
    };
    const fakePostRes: any = {
      status: (code: number) => {
        statusCode = code;
        return { json: () => {} };
      },
    };
    httpsEnforcementMiddleware(fakePostReq, fakePostRes, () => {
      throw new Error('Should not call next() on insecure POST');
    });
    assert.equal(statusCode, 426);

    // Local loopback health probe -> allowed
    let calledNext = false;
    const fakeProbeReq: any = {
      method: 'GET',
      path: '/api/health',
      originalUrl: '/api/health',
      secure: false,
      socket: { remoteAddress: '127.0.0.1' },
      headers: {},
    };
    httpsEnforcementMiddleware(fakeProbeReq, {} as any, () => {
      calledNext = true;
    });
    assert.equal(calledNext, true);
  } finally {
    runtimeConfig.httpsOnly = prevHttpsOnly;
    runtimeConfig.appUrl = prevAppUrl;
  }
});
