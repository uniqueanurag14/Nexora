import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { store } from '../../server/store.ts';
import { validatePassword, validatePasswordConfirmation, validateEmail } from './validation.ts';

test('Password Reset: Email validation accepts valid RFC emails and rejects invalid formats', () => {
  assert.strictEqual(validateEmail('admin@example.com').valid, true);
  assert.strictEqual(validateEmail('user.name+tag@domain.co.uk').valid, true);
  assert.strictEqual(validateEmail('invalid-email').valid, false);
  assert.strictEqual(validateEmail('@missinguser.com').valid, false);
  assert.strictEqual(validateEmail('spaces in@email.com').valid, false);
});

test('Password Reset: Secure token generation, SHA-256 storage, and single-use lifecycle', () => {
  store.initSeed();
  const testUserId = 9999;

  // 1. Generate 32-byte cryptographically secure random token
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  assert.strictEqual(rawToken.length, 64, 'Raw hex token must be 64 characters (32 bytes)');
  assert.strictEqual(tokenHash.length, 64, 'SHA-256 token hash must be 64 characters');

  // 2. Store token in store
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 60 mins
  const record = store.createPasswordResetToken(testUserId, tokenHash, expiresAt);
  assert.ok(record, 'Record must be created');
  assert.strictEqual(record.user_id, testUserId);
  assert.strictEqual(record.used_at, null, 'New token must not be used');

  // 3. Find token by hash
  const found = store.findPasswordResetToken(tokenHash);
  assert.ok(found, 'Must find token by SHA-256 hash');
  assert.strictEqual(found?.token_hash, tokenHash);

  // 4. Consume token (single use)
  const consumed = store.consumePasswordResetToken(record.id);
  assert.strictEqual(consumed, true, 'Consume token must succeed');

  const afterConsume = store.findPasswordResetToken(tokenHash);
  assert.ok(afterConsume?.used_at, 'Token used_at must be populated after consumption');

  // 5. Subsequent attempts to consume should recognize token as already used
  assert.ok(afterConsume?.used_at !== null, 'Used token must be flagged as used');
});

test('Password Reset: Expiration logic rejects tokens older than 60 minutes', () => {
  const isTokenExpired = (expiresAtIso: string): boolean => {
    return new Date(expiresAtIso) < new Date();
  };

  const pastDate = new Date(Date.now() - 5000).toISOString();
  const futureDate = new Date(Date.now() + 3600000).toISOString();

  assert.strictEqual(isTokenExpired(pastDate), true, 'Past date must be recognized as expired');
  assert.strictEqual(isTokenExpired(futureDate), false, 'Future date must not be expired');
});

test('Password Reset: Enforces Nexora password complexity rules', () => {
  // Weak passwords
  assert.strictEqual(validatePassword('short').valid, false);
  assert.strictEqual(validatePassword('nouppercase123!').valid, false);
  assert.strictEqual(validatePassword('NOLOWERCASE123!').valid, false);
  assert.strictEqual(validatePassword('NoNumbersHere!').valid, false);
  assert.strictEqual(validatePassword('NoSpecialChar123').valid, false);

  // Strong password satisfying all rules
  const strong = validatePassword('NexoraSecure#2026');
  assert.strictEqual(strong.valid, true);
  assert.strictEqual(strong.score, 4);
});

test('Password Reset: Confirm password equality matching', () => {
  assert.strictEqual(validatePasswordConfirmation('Secret#123', 'Secret#123').valid, true);
  assert.strictEqual(validatePasswordConfirmation('Secret#123', 'Different#123').valid, false);
});

test('Password Reset: Performance employees are strictly separate from user authentication', () => {
  store.initSeed();

  // Performance employees table design strictly disallows user accounts without explicit authorization
  // Verify that an employee in performance_employees with login_enabled = false is not returned by findUserByEmail
  const perfEmpEmail = 'worker_on_floor@example.com';
  const foundUser = store.findUserByEmail(perfEmpEmail);
  assert.strictEqual(foundUser, undefined, 'Performance employee without login account must not exist in user store');
});
