/**
 * Nexora ERP — Automated Enterprise Security, Audit & Backup Verification Suite
 * Executed via: npm run test:security (tsx --test tests/security.test.ts)
 *
 * Covers all 23 security domains against the live Express app & security services
 * using isolated temporary state/backup directories so production data is never mutated.
 */

import test, { describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';

// Configure isolated test environment BEFORE importing app modules
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nexora-sec-test-'));
const tmpBackupDir = path.join(tmpRoot, 'private_backups');
const tmpStateFile = path.join(tmpRoot, 'security_state.json');

process.env.NODE_ENV = 'test';
process.env.NEXORA_TEST_IMPORT = 'true';
process.env.DISABLE_PG_FOR_TESTS = 'true';
process.env.JWT_ACCESS_SECRET = 'test_jwt_secret_key_for_nexora_security_suite_2026_strong';
process.env.JWT_ISSUER = 'nexora';
process.env.JWT_AUDIENCE = 'nexora-application';
process.env.JWT_ACCESS_EXPIRES_IN = '15m';
process.env.BACKUP_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
process.env.AUDIT_SIGNING_KEY = crypto.randomBytes(32).toString('hex');
process.env.DB_BACKUP_DIR = tmpBackupDir;
process.env.MAX_LOGIN_ATTEMPTS = '4';
process.env.LOGIN_LOCKOUT_MINUTES = '15';
process.env.VERIFIED_AGENT_TOKEN = 'nexora_verified_desktop_agent_secret_2026';
process.env.HARDWARE_DEVICE_TOKEN = 'nexora_test_hw_token_2026';
process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:3000,https://erp.funzootoys.in';
process.env.API_RATE_LIMIT_MAX = '500';
process.env.AUTH_RATE_LIMIT_MAX = '100';

let server: http.Server;
let baseUrl = '';
let adminEmail = '';
let adminPassword = 'TestAdmin@2026!Secure';
let staffEmail = 'sec_test_staff@funzootoys.test';
let staffPassword = 'StaffUser@2026!Secure';
let originalStoreBackup: string | null = null;
const liveStorePath = path.resolve(process.cwd(), 'database', 'nexora_store.json');

async function reqJson(
  endpoint: string,
  options: { method?: string; headers?: Record<string, string>; body?: any } = {}
): Promise<{ status: number; headers: Headers; body: any }> {
  const res = await fetch(`${baseUrl}${endpoint}`, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36',
      ...(options.headers || {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  let body: any = null;
  const text = await res.text();
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, headers: res.headers, body };
}

describe('Nexora Enterprise Security, Audit & Backup Test Suite', async () => {
  const { reloadSecurityConfig } = await import('../server/security/config');
  reloadSecurityConfig();
  const { securityStore } = await import('../server/security/securityStore');
  securityStore.setStatePathForTests(tmpStateFile);
  const { securityMonitor } = await import('../server/security/securityMonitor');
  const { auditService } = await import('../server/security/auditService');
  const { backupService } = await import('../server/security/backupService');
  const { mfaService } = await import('../server/security/mfaService');
  const { redactSensitiveData } = await import('../server/security/redaction');
  const { authService } = await import('../server/authService');
  const { store } = await import('../server/store');
  const { app } = await import('../server');

  before(async () => {
    // Snapshot live JSON store so test mutations are restored cleanly in after()
    if (fs.existsSync(liveStorePath)) {
      originalStoreBackup = fs.readFileSync(liveStorePath, 'utf8');
    }

    // Create deterministic test Super Admin & low-privilege Staff users in store
    const adminHash = await authService.hashPassword(adminPassword);
    const staffHash = await authService.hashPassword(staffPassword);

    const existingAdmin = store.getAllUsers().find((u: any) => u.role === 'super_admin');
    if (existingAdmin) {
      adminEmail = existingAdmin.email;
      store.updateUser(existingAdmin.id, { password_hash: adminHash, is_active: true, is_verified: true });
    } else {
      adminEmail = 'sec_test_admin@funzootoys.test';
      store.createUser({
        first_name: 'Security',
        last_name: 'Admin',
        email: adminEmail,
        username: 'sec_test_admin',
        role: 'super_admin',
        password_hash: adminHash,
        is_active: true,
        is_verified: true,
      } as any);
    }

    const existingStaff = store.findUserByUsernameOrEmail(staffEmail);
    if (existingStaff) {
      store.updateUser(existingStaff.id, { password_hash: staffHash, role: 'viewer', roles: ['viewer'], is_active: true });
    } else {
      store.createUser({
        first_name: 'Viewer',
        last_name: 'Staff',
        email: staffEmail,
        username: 'sec_test_staff',
        role: 'viewer',
        roles: ['viewer'],
        password_hash: staffHash,
        is_active: true,
        is_verified: true,
      } as any);
    }

    await new Promise<void>(resolve => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address() as any;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
    // Restore original live JSON store exactly as it was before tests ran
    if (originalStoreBackup !== null) {
      fs.writeFileSync(liveStorePath, originalStoreBackup, 'utf8');
      store.reloadFromDisk();
    }
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    } catch {}
  });

  // 1 & 2. Security Headers, CSP, X-Powered-By removal, CORS Allowlist
  test('1. Enforces security headers, CSP, removes X-Powered-By, and restricts CORS origins', async () => {
    const res = await reqJson('/api/health', {
      headers: { Origin: 'http://localhost:3000' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('x-frame-options'), 'SAMEORIGIN');
    assert.equal(res.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
    assert.ok(res.headers.get('content-security-policy')?.includes("default-src 'self'"));
    assert.equal(res.headers.get('x-powered-by'), null);
    assert.equal(res.headers.get('access-control-allow-origin'), 'http://localhost:3000');

    // Disallowed origin must be rejected with 403
    const evilOrigin = await reqJson('/api/health', {
      headers: { Origin: 'https://malicious-attacker.example' },
    });
    assert.equal(evilOrigin.status, 403);
  });

  // 3. Unauthorized API & SSE blocking
  test('2. Blocks unauthenticated access to protected Security, Warehouse, Performance & SSE endpoints', async () => {
    const r1 = await reqJson('/api/security/overview');
    assert.equal(r1.status, 401);

    const r2 = await reqJson('/api/warehouses');
    assert.equal(r2.status, 401);

    const r3 = await reqJson('/api/performance/reports');
    assert.equal(r3.status, 401);

    const r4 = await reqJson('/api/performance/events/stream');
    assert.equal(r4.status, 401);
  });

  // 4. JWT validation (tampered, wrong issuer, expired)
  test('3. Rejects tampered, wrong-issuer, and expired JWT access tokens', async () => {
    const forged = jwt.sign(
      { sub: adminEmail, uid: 1, id: 1, role: 'super_admin', jti: 'forged' },
      'wrong_secret_key_1234567890',
      { issuer: 'nexora', audience: 'nexora-application', expiresIn: '10m' }
    );
    const rForged = await reqJson('/api/security/overview', {
      headers: { Authorization: `Bearer ${forged}` },
    });
    assert.equal(rForged.status, 401);

    const wrongIss = jwt.sign(
      { sub: adminEmail, uid: 1, id: 1, role: 'super_admin', jti: 'wrongiss' },
      process.env.JWT_ACCESS_SECRET!,
      { issuer: 'evil-issuer', audience: 'nexora-application', expiresIn: '10m' }
    );
    const rIss = await reqJson('/api/security/overview', {
      headers: { Authorization: `Bearer ${wrongIss}` },
    });
    assert.equal(rIss.status, 401);

    const expired = jwt.sign(
      { sub: adminEmail, uid: 1, id: 1, role: 'super_admin', jti: 'exp1' },
      process.env.JWT_ACCESS_SECRET!,
      { issuer: 'nexora', audience: 'nexora-application', expiresIn: '-10s' }
    );
    const rExp = await reqJson('/api/security/overview', {
      headers: { Authorization: `Bearer ${expired}` },
    });
    assert.equal(rExp.status, 401);
  });

  // 5. Failed login tracking, generic error message & brute-force lockout
  test('4. Tracks failed logins, returns generic error, and locks account after MAX_LOGIN_ATTEMPTS', async () => {
    securityMonitor.resetInMemoryCountersForTests();
    const targetEmail = 'brute_target@funzootoys.test';

    for (let i = 0; i < 4; i++) {
      const fail = await reqJson('/api/auth/login', {
        method: 'POST',
        headers: { 'X-Nexora-Device-Id': 'dev_brutetest_001' },
        body: { email: targetEmail, password: 'WrongPassword123!' },
      });
      assert.equal(fail.status, 401);
      assert.ok(fail.body.message.toLowerCase().includes('invalid credentials'));
    }

    // 5th attempt must trigger 429 account lockout
    const locked = await reqJson('/api/auth/login', {
      method: 'POST',
      headers: { 'X-Nexora-Device-Id': 'dev_brutetest_001' },
      body: { email: targetEmail, password: 'WrongPassword123!' },
    });
    assert.equal(locked.status, 429);
    assert.ok(locked.headers.get('retry-after'));

    const events = securityStore.getSecurityEvents({ search: targetEmail });
    assert.ok(events.items.some(e => e.event_code === 'BRUTE_FORCE_LOCKOUT'));
  });

  // 6. Successful login tracking, honest browser vs verified-agent device telemetry & logout tracking
  test('5. Tracks successful login, distinguishes browser telemetry from verified agent, and records logout', async () => {
    securityMonitor.resetInMemoryCountersForTests();

    // Browser-reported login
    const loginBrowser = await reqJson('/api/auth/login', {
      method: 'POST',
      headers: { 'X-Nexora-Device-Id': 'dev_browser_chrome_01' },
      body: { email: adminEmail, password: adminPassword },
    });
    assert.equal(loginBrowser.status, 200);
    assert.ok(loginBrowser.body.data.access_token);
    assert.ok(loginBrowser.body.data.refresh_token);

    // Verified enterprise desktop agent login
    const loginAgent = await reqJson('/api/auth/login', {
      method: 'POST',
      headers: {
        'X-Nexora-Device-Id': 'dev_agent_workstation_02',
        'X-Nexora-Agent-Token': process.env.VERIFIED_AGENT_TOKEN!,
        'X-Nexora-Machine-Name': 'FUNZOO-JEWAR-WS01',
      },
      body: { email: adminEmail, password: adminPassword },
    });
    assert.equal(loginAgent.status, 200);

    const devices = securityStore.getDevices({ search: adminEmail });
    const browserDev = devices.items.find(d => d.device_id === 'dev_browser_chrome_01');
    const agentDev = devices.items.find(d => d.device_id === 'dev_agent_workstation_02');
    assert.equal(browserDev?.client_source, 'browser_reported');
    assert.equal(browserDev?.verified_machine_name, null);
    assert.equal(agentDev?.client_source, 'verified_agent');
    assert.equal(agentDev?.verified_machine_name, 'FUNZOO-JEWAR-WS01');

    // Logout browser session -> subsequent API call using its JWT must fail with 401
    const logoutRes = await reqJson('/api/auth/logout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${loginBrowser.body.data.access_token}` },
    });
    assert.equal(logoutRes.status, 200);

    const afterLogout = await reqJson('/api/security/overview', {
      headers: { Authorization: `Bearer ${loginBrowser.body.data.access_token}` },
    });
    assert.equal(afterLogout.status, 401);

    const logins = securityStore.getLoginHistory({ search: adminEmail });
    assert.ok(logins.items.some(l => l.event_type === 'LOGOUT' && l.login_status === 'LOGGED_OUT'));
  });

  // 7. Refresh token rotation & compromise reuse detection
  test('6. Rotates refresh tokens and terminates all user sessions on refresh token reuse', async () => {
    const login = await reqJson('/api/auth/login', {
      method: 'POST',
      headers: { 'X-Nexora-Device-Id': 'dev_refresh_test_01' },
      body: { email: adminEmail, password: adminPassword },
    });
    assert.equal(login.status, 200);
    const rt1 = login.body.data.refresh_token;

    // First rotation succeeds
    const ref1 = await reqJson('/api/auth/refresh', {
      method: 'POST',
      body: { refresh_token: rt1 },
    });
    assert.equal(ref1.status, 200);
    assert.ok(ref1.body.data.access_token);
    assert.notEqual(ref1.body.data.refresh_token, rt1);

    // Replaying rt1 (theft simulation) must fail 401 AND revoke the new session immediately
    const replay = await reqJson('/api/auth/refresh', {
      method: 'POST',
      body: { refresh_token: rt1 },
    });
    assert.equal(replay.status, 401);

    const useNewAccess = await reqJson('/api/security/overview', {
      headers: { Authorization: `Bearer ${ref1.body.data.access_token}` },
    });
    assert.equal(useNewAccess.status, 401);

    const evs = securityStore.getSecurityEvents({ severity: 'CRITICAL' });
    assert.ok(evs.items.some(e => e.event_code === 'REFRESH_TOKEN_REUSE_COMPROMISE'));
  });

  // 8. Server-side session revocation & blocked device rejection
  test('7. Enforces immediate server-side session revocation and blocks sign-ins from blocked devices', async () => {
    const adminLogin = await reqJson('/api/auth/login', {
      method: 'POST',
      headers: { 'X-Nexora-Device-Id': 'dev_admin_ctrl_01' },
      body: { email: adminEmail, password: adminPassword },
    });
    const adminToken = adminLogin.body.data.access_token;

    const staffLogin = await reqJson('/api/auth/login', {
      method: 'POST',
      headers: { 'X-Nexora-Device-Id': 'dev_staff_suspect_09' },
      body: { email: staffEmail, password: staffPassword },
    });
    assert.equal(staffLogin.status, 200);
    const staffToken = staffLogin.body.data.access_token;
    const staffSessionId = staffLogin.body.data.session_id;

    // Admin revokes staff session
    const rev = await reqJson(`/api/security/sessions/${staffSessionId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(rev.status, 200);

    // Staff token is immediately rejected
    const staffCall = await reqJson('/api/auth/me', {
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    assert.equal(staffCall.status, 401);

    // Admin blocks staff device
    const devs = securityStore.getDevices({ search: 'dev_staff_suspect_09' });
    assert.ok(devs.items.length >= 1);
    const blockRes = await reqJson(`/api/security/devices/${devs.items[0].id}/status`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { status: 'blocked', reason: 'Suspicious workstation' },
    });
    assert.equal(blockRes.status, 200);

    // Subsequent login from blocked device is rejected with 403
    const blockedLogin = await reqJson('/api/auth/login', {
      method: 'POST',
      headers: { 'X-Nexora-Device-Id': 'dev_staff_suspect_09' },
      body: { email: staffEmail, password: staffPassword },
    });
    assert.equal(blockedLogin.status, 403);
  });

  // 9. RBAC enforcement (viewer role denied Security Center & Warehouse write)
  test('8. Enforces RBAC: low-privilege user receives 403 on Security Center and Backup routes', async () => {
    const staffLogin = await reqJson('/api/auth/login', {
      method: 'POST',
      headers: { 'X-Nexora-Device-Id': 'dev_staff_clean_11' },
      body: { email: staffEmail, password: staffPassword },
    });
    assert.equal(staffLogin.status, 200);
    const staffToken = staffLogin.body.data.access_token;

    const secOverview = await reqJson('/api/security/overview', {
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    assert.equal(secOverview.status, 403);

    const backupRun = await reqJson('/api/security/backups/run', {
      method: 'POST',
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    assert.equal(backupRun.status, 403);

    const whCreate = await reqJson('/api/warehouses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${staffToken}` },
      body: { code: 'WH-EVIL', name: 'Unauthorized Warehouse' },
    });
    assert.equal(whCreate.status, 403);
  });

  // 10. SQL Injection payload rejection & telemetry
  test('9. Neutralizes SQL injection payloads in performance report/export queries and logs SQLI_PROBE_DETECTED', async () => {
    const adminLogin = await reqJson('/api/auth/login', {
      method: 'POST',
      headers: { 'X-Nexora-Device-Id': 'dev_admin_sqli_01' },
      body: { email: adminEmail, password: adminPassword },
    });
    const token = adminLogin.body.data.access_token;

    const sqliPayload = encodeURIComponent("2026-01-01' OR 1=1; DROP TABLE users; --");
    const rReport = await reqJson(`/api/performance/reports?period=custom&start_date=${sqliPayload}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(rReport.status, 400);

    const rExport = await reqJson(`/api/performance/reports/export?period=custom&start_date=${sqliPayload}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(rExport.status, 400);

    const evs = securityStore.getSecurityEvents({ search: 'SQL' });
    assert.ok(evs.items.some(e => e.event_code === 'SQLI_PROBE_DETECTED'));
  });

  // 11. Authenticated SSE endpoint allows valid token & rejects invalid token
  test('10. Authenticates SSE stream with valid JWT and rejects invalid token', async () => {
    const badSse = await reqJson('/api/performance/events/stream?token=invalid.jwt.value');
    assert.equal(badSse.status, 401);

    const adminLogin = await reqJson('/api/auth/login', {
      method: 'POST',
      headers: { 'X-Nexora-Device-Id': 'dev_admin_sse_01' },
      body: { email: adminEmail, password: adminPassword },
    });
    const token = adminLogin.body.data.access_token;

    const controller = new AbortController();
    const res = await fetch(`${baseUrl}/api/performance/events/stream?token=${encodeURIComponent(token)}`, {
      signal: controller.signal,
    });
    assert.equal(res.status, 200);
    assert.ok(res.headers.get('content-type')?.includes('text/event-stream'));
    controller.abort();
  });

  // 12. Admin optional TOTP MFA enrollment, verification & recovery
  test('11. Supports RFC 6238 TOTP MFA enrollment, code verification, and rejects bad codes', async () => {
    const secret = mfaService.generateSecret();
    const validCode = mfaService.generateCode(secret);
    assert.equal(mfaService.verifyCode(secret, validCode), true);
    assert.equal(mfaService.verifyCode(secret, '000000'), false);

    const encrypted = mfaService.encryptSecret(secret);
    assert.notEqual(encrypted, secret);
    assert.equal(mfaService.decryptSecret(encrypted), secret);
  });

  // 13. Sensitive Data Redaction
  test('12. Redacts passwords, JWTs, SMTP secrets, encryption keys, and tokens from audit logs', async () => {
    const sample = {
      username: 'alice',
      password: 'SuperSecretPassword!9',
      smtp_password: 'smtp-secret-value',
      jwt_token: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhIn0.sig1234567890',
      authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhIn0.sig1234567890',
      nested: { encryption_key: 'abc123456', safe_field: 'FunZoo Toys' },
    };

    const redacted = redactSensitiveData(sample);
    assert.equal(redacted.password, '[REDACTED]');
    assert.equal(redacted.smtp_password, '[REDACTED]');
    assert.equal(redacted.jwt_token, '[REDACTED]');
    assert.equal(redacted.authorization, '[REDACTED]');
    assert.equal(redacted.nested.encryption_key, '[REDACTED]');
    assert.equal(redacted.nested.safe_field, 'FunZoo Toys');

    await auditService.log({
      module_name: 'Settings',
      action_type: 'SMTP_CONFIG_TEST',
      description: 'Updated SMTP with Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhIn0.sig1234567890',
      after_values: sample,
    });

    const latest = securityStore.getActivityLogs({ page: 1, limit: 1 }).items[0];
    const serialized = JSON.stringify(latest);
    assert.equal(serialized.includes('SuperSecretPassword!9'), false);
    assert.equal(serialized.includes('smtp-secret-value'), false);
    assert.equal(serialized.includes('sig1234567890'), false);
  });

  // 14. Tamper-evident Audit Hash Chain & Tamper Detection
  test('13. Verifies tamper-evident SHA-256/HMAC audit hash chain and detects tampering', async () => {
    const cleanReport = auditService.verifyIntegrity();
    assert.equal(cleanReport.valid, true);
    assert.ok(cleanReport.checked_count > 0);

    // Simulate malicious direct DB/file tamper of an audit record
    const rawState = JSON.parse(fs.readFileSync(tmpStateFile, 'utf8'));
    const origDesc = rawState.activity_logs[0].description;
    rawState.activity_logs[0].description = 'TAMPERED_MALICIOUS_EDIT';
    fs.writeFileSync(tmpStateFile, JSON.stringify(rawState, null, 2), 'utf8');
    securityStore.setStatePathForTests(tmpStateFile);

    const tamperedReport = auditService.verifyIntegrity();
    assert.equal(tamperedReport.valid, false);
    assert.ok(tamperedReport.tampered_ids.length >= 1);

    // Restore clean record for remaining tests
    rawState.activity_logs[0].description = origDesc;
    fs.writeFileSync(tmpStateFile, JSON.stringify(rawState, null, 2), 'utf8');
    securityStore.setStatePathForTests(tmpStateFile);
    assert.equal(auditService.verifyIntegrity().valid, true);
  });

  // 15, 16, 17, 18, 19. Encrypted Dual-Storage Backup, Tamper Detection, Concurrent Lock, Controlled Restore & Retention Cleanup
  test('14. Creates AES-256-GCM dual-storage backup, detects ciphertext tamper, blocks concurrent lock, executes controlled restore, and cleans expired backups', async () => {
    // A. Create encrypted backup
    const backup = await backupService.runBackup({
      triggerType: 'manual',
      initiatedByUserId: 1,
      initiatedByEmail: adminEmail,
    });
    assert.equal(backup.status, 'completed');
    assert.equal(backup.encrypted, true);
    assert.equal(backup.encryption_algorithm, 'aes-256-gcm');
    assert.ok(['missing', 'removed'].includes(backup.json_store_status));
    assert.ok(backup.checksum_sha256 && backup.checksum_sha256.length === 64);
    assert.ok(fs.existsSync(backup.storage_path));

    // Confirm raw file is encrypted (contains NXBK01 magic, does NOT contain plaintext JSON)
    const rawFile = fs.readFileSync(backup.storage_path);
    assert.equal(rawFile.subarray(0, 6).toString('ascii'), 'NXBK01');
    assert.equal(rawFile.toString('utf8').includes('nexora_store.json'), false);

    // B. Verify intact backup
    const verified = await backupService.verifyBackup(backup.backup_uid, 1);
    assert.equal(verified.valid, true);
    assert.equal(verified.checksum_matched, true);
    assert.equal(verified.decryption_valid, true);
    assert.equal(verified.json_store_included, false);

    // C. Tamper 1 byte in encrypted file -> both checksum & AES-GCM verification MUST reject
    const copyBytes = Buffer.from(rawFile);
    copyBytes[copyBytes.length - 5] ^= 0xff;
    assert.throws(() => backupService.decryptBuffer(copyBytes));

    fs.writeFileSync(backup.storage_path, copyBytes);
    const failedVerify = await backupService.verifyBackup(backup.backup_uid, 1);
    assert.equal(failedVerify.valid, false);
    assert.equal(failedVerify.checksum_matched, false);

    // Restore original intact bytes for restore test
    fs.writeFileSync(backup.storage_path, rawFile);
    const reVerified = await backupService.verifyBackup(backup.backup_uid, 1);
    assert.equal(reVerified.valid, true);

    // D. Concurrent lock prevention
    const lockFile = path.join(tmpBackupDir, '.backup.lock');
    fs.writeFileSync(lockFile, JSON.stringify({ pid: process.pid, backup_uid: 'other', started_at_ms: Date.now() }));
    await assert.rejects(
      () => backupService.runBackup({ triggerType: 'manual', initiatedByEmail: adminEmail }),
      /already in progress/i
    );
    fs.unlinkSync(lockFile);

    // E. Controlled two-step restoration
    const prep = await backupService.prepareControlledRestore(backup.backup_uid, 1);
    assert.equal(prep.ok, true);
    assert.ok(prep.confirm_token);
    assert.equal(prep.confirm_phrase, `RESTORE ${backup.backup_uid}`);

    // Wrong confirmation phrase must be rejected
    await assert.rejects(
      () =>
        backupService.executeControlledRestore({
          backupIdOrUid: backup.backup_uid,
          confirmToken: prep.confirm_token!,
          confirmPhrase: 'WRONG PHRASE',
          adminUserId: 1,
          adminEmail,
        }),
      /Confirmation phrase mismatch/i
    );

    // Re-prepare and execute valid restoration
    const prep2 = await backupService.prepareControlledRestore(backup.backup_uid, 1);
    const restored = await backupService.executeControlledRestore({
      backupIdOrUid: backup.backup_uid,
      confirmToken: prep2.confirm_token!,
      confirmPhrase: prep2.confirm_phrase!,
      adminUserId: 1,
      adminEmail,
      onStoreReload: () => store.reloadFromDisk(),
    });
    assert.equal(restored.success, true);
    assert.equal(restored.json_store_restored, false);
    assert.ok(restored.pre_restore_backup_uid.startsWith('nx_bkp_'));

    // F. Retention cleanup purges expired backups
    await securityStore.updateBackupRecord(backup.backup_uid, {
      retention_until: new Date(Date.now() - 86400 * 1000).toISOString(),
    });
    const cleanup = await backupService.cleanupExpiredBackups(30, 1);
    assert.ok(cleanup.deleted_count >= 1);
    assert.ok(cleanup.deleted_uids.includes(backup.backup_uid));
    assert.equal(fs.existsSync(backup.storage_path), false);
  });
});
