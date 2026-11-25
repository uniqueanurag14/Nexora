import test from 'node:test';
import assert from 'node:assert/strict';

test('Module 4: Profile Name & Username Validation Rules', () => {
  // Username validation regex test
  const usernameRegex = /^[a-zA-Z0-9_-]{3,50}$/;
  assert.equal(usernameRegex.test('admin_user'), true);
  assert.equal(usernameRegex.test('john-doe'), true);
  assert.equal(usernameRegex.test('ab'), false); // Too short
  assert.equal(usernameRegex.test('user@domain'), false); // Disallowed characters

  // First & Last name validation
  const validateFirstLast = (first: string, last: string) => {
    return first.trim().length >= 2 && last.trim().length >= 1;
  };
  assert.equal(validateFirstLast('John', 'Doe'), true);
  assert.equal(validateFirstLast('A', 'Doe'), false);
  assert.equal(validateFirstLast('Jane', ''), false);
});

test('Module 4: Change Password Verification and Complexity Rules', () => {
  const checkChangePasswordRules = (current: string, next: string, confirm: string) => {
    if (!current) return { valid: false, error: 'Current password required' };
    if (!next || next.length < 8) return { valid: false, error: 'Minimum 8 characters' };
    if (next === current) return { valid: false, error: 'Cannot be identical to current' };
    if (next !== confirm) return { valid: false, error: 'Confirmation mismatch' };
    return { valid: true };
  };

  assert.equal(checkChangePasswordRules('', 'NewSecret123!', 'NewSecret123!').valid, false);
  assert.equal(checkChangePasswordRules('OldSecret123!', 'OldSecret123!', 'OldSecret123!').valid, false);
  assert.equal(checkChangePasswordRules('OldSecret123!', 'NewSecret123!', 'Mismatch123!').valid, false);
  assert.equal(checkChangePasswordRules('OldSecret123!', 'NewSecret123!', 'NewSecret123!').valid, true);
});

test('Module 4: Role-Based Access Control and Navigation Rules', () => {
  const checkMenuPermission = (role: string, itemCode: string) => {
    if (role === 'super_admin') return true;
    if (itemCode === 'settings_backups') return false; // restricted to super_admin
    if (itemCode.startsWith('settings') && itemCode !== 'settings_sessions') {
      return role === 'admin';
    }
    return true;
  };

  assert.equal(checkMenuPermission('super_admin', 'settings_backups'), true);
  assert.equal(checkMenuPermission('admin', 'settings_backups'), false);
  assert.equal(checkMenuPermission('admin', 'settings_general'), true);
  assert.equal(checkMenuPermission('user', 'settings_general'), false);
  assert.equal(checkMenuPermission('user', 'settings_sessions'), true);
  assert.equal(checkMenuPermission('user', 'dashboard'), true);
});

test('Module 4: Session Revocation Logic', () => {
  interface Session {
    id: number;
    tokenHash: string;
    isRevoked: boolean;
  }

  const sessions: Session[] = [
    { id: 1, tokenHash: 'current_hash_123', isRevoked: false },
    { id: 2, tokenHash: 'secondary_hash_456', isRevoked: false },
    { id: 3, tokenHash: 'mobile_hash_789', isRevoked: false },
  ];

  // Revoke all OTHER sessions
  const currentToken = 'current_hash_123';
  const updated = sessions.map((s) => ({
    ...s,
    isRevoked: s.tokenHash !== currentToken ? true : s.isRevoked,
  }));

  assert.equal(updated.find((s) => s.id === 1)?.isRevoked, false);
  assert.equal(updated.find((s) => s.id === 2)?.isRevoked, true);
  assert.equal(updated.find((s) => s.id === 3)?.isRevoked, true);
});
