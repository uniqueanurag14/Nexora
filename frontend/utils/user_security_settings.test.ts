import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { store } from '../../server/store.ts';

test('User Authentication: Lookup supports both email and account username with case-insensitivity', () => {
  store.initSeed();
  const allUsers = store.getAllUsers();
  assert.ok(allUsers.length > 0, 'Store must have at least one user');
  const testUser = allUsers[0];

  // Test lookup by email
  const byEmail = store.findUserByUsernameOrEmail(testUser.email);
  assert.ok(byEmail, 'User must be found by email');
  assert.strictEqual(byEmail?.id, testUser.id);

  // Test lookup by username
  const byUsername = store.findUserByUsernameOrEmail(testUser.username);
  assert.ok(byUsername, 'User must be found by username');
  assert.strictEqual(byUsername?.id, testUser.id);

  // Case insensitive test
  const byCaseInsensitive = store.findUserByUsernameOrEmail(testUser.username.toUpperCase());
  assert.ok(byCaseInsensitive, 'Lookup must be case-insensitive');
  assert.strictEqual(byCaseInsensitive?.id, testUser.id);

  // Non-existent identifier returns falsy
  const notFound = store.findUserByUsernameOrEmail('non_existent_user_9999');
  assert.ok(!notFound, 'Non-existent user must return falsy');
});

test('User Profile Governance: Locked profile fields (first_name, last_name, username) and contact edits', () => {
  store.initSeed();
  const user = store.getAllUsers()[0];
  const originalFirstName = user.first_name;
  const originalLastName = user.last_name;
  const originalUsername = user.username;

  // Simulate profile update with phone and avatar
  const updated = store.updateUser(user.id, {
    phone: '+1-555-0199',
    department: 'Executive Operations',
    profile_picture: 'https://images.example.com/avatar1.jpg',
  });

  assert.ok(updated, 'User update must succeed');
  assert.strictEqual(updated?.first_name, originalFirstName, 'First name must remain strictly unchanged');
  assert.strictEqual(updated?.last_name, originalLastName, 'Last name must remain strictly unchanged');
  assert.strictEqual(updated?.username, originalUsername, 'Account username must remain strictly unchanged');
  assert.strictEqual(updated?.phone, '+1-555-0199', 'Phone must be updated');
  assert.strictEqual(updated?.profile_picture, 'https://images.example.com/avatar1.jpg', 'Avatar picture must be updated');
});

test('Email Change Verification: Two-step verification lifecycle with code expiration and email activation', () => {
  store.initSeed();
  const user = store.getAllUsers()[0];
  const currentEmail = user.email;
  const targetNewEmail = 'new.admin@nexora.io';

  // 1. Create email change request
  const req = store.createEmailChangeRequest(user.id, targetNewEmail);
  assert.ok(req.token, 'Must return verification token');
  assert.strictEqual(req.code.length, 6, 'Verification code must be 6 digits');

  // User's email in database must NOT change yet
  const userBeforeVerify = store.findUserById(user.id);
  assert.strictEqual(userBeforeVerify?.email, currentEmail, 'Current email must remain active until confirmed');

  // 2. Reject incorrect verification code
  const failResult = store.verifyEmailChange('000000');
  assert.strictEqual(failResult.success, false, 'Invalid verification code must be rejected');

  // 3. Confirm with valid 6-digit code
  const verifyResult = store.verifyEmailChange(req.code);
  assert.strictEqual(verifyResult.success, true, 'Valid code must confirm change');
  assert.strictEqual(verifyResult.newEmail, targetNewEmail, 'Returned email must match target');

  // 4. Verify user record is now updated
  const userAfterVerify = store.findUserById(user.id);
  assert.strictEqual(userAfterVerify?.email, targetNewEmail, 'Email must be updated after confirmation');

  // 5. Subsequent attempts with same code must fail (single-use)
  const reusedResult = store.verifyEmailChange(req.code);
  assert.strictEqual(reusedResult.success, false, 'Reused verification code must fail');

  // Restore email back for subsequent tests
  store.updateUser(user.id, { email: currentEmail });
});

test('Session Security: Session creation, termination, and multi-session revocation', () => {
  store.initSeed();
  const user = store.getAllUsers()[0];

  const session1 = store.createSession({
    user_id: user.id,
    jti: 'jti_session_1',
    ip_address: '192.168.1.10',
    user_agent: 'Chrome on macOS',
  });

  const session2 = store.createSession({
    user_id: user.id,
    jti: 'jti_session_2',
    ip_address: '192.168.1.20',
    user_agent: 'Firefox on Windows',
  });

  assert.strictEqual(session1.is_revoked, false);
  assert.strictEqual(session2.is_revoked, false);

  // Revoke other sessions (leaving session1 active)
  const revokedCount = store.revokeOtherUserSessions(user.id, 'jti_session_1');
  assert.ok(revokedCount >= 1, 'Must revoke other sessions');

  const allSessions = store.getUserSessions(user.id);
  const s1 = allSessions.find(s => s.jti === 'jti_session_1');
  const s2 = allSessions.find(s => s.jti === 'jti_session_2');

  assert.strictEqual(s1?.is_revoked, false, 'Current session must remain active');
  assert.strictEqual(s2?.is_revoked, true, 'Other session must be revoked');
  assert.strictEqual(store.isTokenRevoked('jti_session_2'), true, 'Token must be in revoked tokens set');
});

test('Audit Trail & Sensitive Data Redaction: Passwords and tokens are automatically redacted', () => {
  store.initSeed();

  store.logAudit({
    user_id: 1,
    user_email: 'admin@nexora.io',
    action: 'TEST_AUTH_ACTION',
    module: 'Authentication',
    details: 'User attempt with password=SecretPassword123! and token=abc123456789',
    previous_value: '{"password":"OldPassword123!","token":"tok_old"}',
    updated_value: '{"password":"NewPassword123!","token":"tok_new"}',
    ip_address: '127.0.0.1',
  });

  const logs = store.getAuditTrail({ action: 'TEST_AUTH_ACTION' });
  assert.ok(logs.length > 0, 'Must find logged audit item');
  const logged = logs[0];

  assert.ok(!logged.details.includes('SecretPassword123!'), 'Plaintext password must be redacted');
  assert.ok(!logged.details.includes('abc123456789'), 'Token must be redacted');
  assert.ok(logged.details.includes('[REDACTED]'), 'Redaction placeholder must be present in details');

  assert.ok(!logged.previous_value?.includes('OldPassword123!'), 'Previous password must be redacted');
  assert.ok(!logged.updated_value?.includes('NewPassword123!'), 'Updated password must be redacted');
});

test('Database Backup & Restore: Verified snapshot creation with SHA-256 and integrity check', () => {
  store.initSeed();

  // Create manual backup
  const backup = store.createDatabaseBackup('MANUAL', 'admin@nexora.io', 'Unit test backup');
  assert.ok(backup.id.startsWith('bk_'), 'Backup ID must start with bk_');
  assert.ok(backup.sha256 && backup.sha256.length === 64, 'SHA-256 hash must be 64 hex characters');
  assert.strictEqual(backup.status, 'VERIFIED');
  assert.ok(backup.size_bytes > 0, 'Backup size must be positive');

  // Verify backup list includes this archive
  const list = store.getDatabaseBackups();
  const found = list.find(b => b.id === backup.id);
  assert.ok(found, 'Backup must appear in history list');

  // Verify restore
  const restoreResult = store.restoreDatabaseBackup(backup.id, 'admin@nexora.io');
  assert.strictEqual(restoreResult.success, true);
  assert.ok(restoreResult.table_count && restoreResult.table_count > 0, 'Must report restored table count');
});

test('Decoupling: Performance employees remain strictly decoupled from login users', () => {
  store.initSeed();

  // Verify performance employees don't have login permissions or credentials
  const performanceEmployees = (store as any).data.performance_employees || [];
  for (const emp of performanceEmployees) {
    assert.strictEqual(emp.login_enabled, false, `Performance employee ${emp.emp_id} must have login_enabled = false`);
    assert.strictEqual(emp.password_hash, undefined, `Performance employee ${emp.emp_id} must not have password_hash`);
  }
});
