import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateEmail,
  validatePassword,
  validateName,
  validateFirstName,
  validateLastName,
  validateRoleCode,
  validateRoleSelection,
  validatePasswordConfirmation,
  validateSupplierCode,
  validateSupplierName,
  validatePhone,
} from './validation.ts';

test('validateEmail validates RFC compliant emails', () => {
  assert.equal(validateEmail('admin@example.com').valid, true);
  assert.equal(validateEmail('dev.sinha14@gmail.com').valid, true);
  assert.equal(validateEmail('').valid, false);
  assert.equal(validateEmail('invalid-email').valid, false);
  assert.equal(validateEmail('user@').valid, false);
});

test('validatePassword rejects weak passwords and approves complex ones', () => {
  // Too short
  const r1 = validatePassword('Short1!');
  assert.equal(r1.valid, false);
  assert.equal(r1.error, 'Password must be at least 8 characters long.');

  // Missing digit
  const r2 = validatePassword('NoDigitHere!');
  assert.equal(r2.valid, false);
  assert.equal(r2.error, 'Password must include at least one digit.');

  // Missing special char
  const r3 = validatePassword('NoSpecialChar123');
  assert.equal(r3.valid, false);
  assert.equal(r3.error, 'Password must include at least one special character.');

  // Valid strong password
  const r4 = validatePassword('NexoraAdmin2026!SecureKey');
  assert.equal(r4.valid, true);
  assert.equal(r4.strength, 'strong');
});

test('validateName validates length boundaries', () => {
  assert.equal(validateName('Alice Smith').valid, true);
  assert.equal(validateName('   ').valid, false);
  assert.equal(validateName('A').valid, false);
  assert.equal(validateName('A'.repeat(101)).valid, false);
});

test('validatePasswordConfirmation checks equality', () => {
  assert.equal(validatePasswordConfirmation('Secret123!', 'Secret123!').valid, true);
  assert.equal(validatePasswordConfirmation('Secret123!', 'Different123!').valid, false);
  assert.equal(validatePasswordConfirmation('Secret123!', '').valid, false);
});

test('validateFirstName and validateLastName enforce required boundaries', () => {
  assert.equal(validateFirstName('Dev').valid, true);
  assert.equal(validateFirstName('').valid, false);
  assert.equal(validateFirstName('   ').valid, false);
  assert.equal(validateFirstName('A'.repeat(51)).valid, false);

  assert.equal(validateLastName('Sinha').valid, true);
  assert.equal(validateLastName('').valid, false);
  assert.equal(validateLastName('   ').valid, false);
  assert.equal(validateLastName('B'.repeat(51)).valid, false);
});

test('validateRoleCode validates slug rules', () => {
  assert.equal(validateRoleCode('warehouse_manager').valid, true);
  assert.equal(validateRoleCode('audit-analyst').valid, true);
  assert.equal(validateRoleCode('a').valid, false); // too short
  assert.equal(validateRoleCode('Invalid Role Code').valid, false); // spaces/caps
  assert.equal(validateRoleCode('').valid, false);
});

test('validateRoleSelection requires at least one assigned role', () => {
  assert.equal(validateRoleSelection(['admin']).valid, true);
  assert.equal(validateRoleSelection(['admin', 'operator']).valid, true);
  assert.equal(validateRoleSelection([]).valid, false);
});

test('validateSupplierCode enforces unique code syntax', () => {
  assert.equal(validateSupplierCode('SUP-00001').valid, true);
  assert.equal(validateSupplierCode('VEND_123').valid, true);
  assert.equal(validateSupplierCode('').valid, false);
  assert.equal(validateSupplierCode('A').valid, false); // too short
  assert.equal(validateSupplierCode('SUP@#$!').valid, false); // invalid characters
});

test('validateSupplierName enforces required non-empty boundary', () => {
  assert.equal(validateSupplierName('Apex Industrial Ltd').valid, true);
  assert.equal(validateSupplierName('').valid, false);
  assert.equal(validateSupplierName('   ').valid, false);
  assert.equal(validateSupplierName('A').valid, false);
});

test('validatePhone enforces optional but valid phone formats', () => {
  assert.equal(validatePhone('').valid, true); // optional
  assert.equal(validatePhone('+91-9876543210').valid, true);
  assert.equal(validatePhone('(022) 2890-1234').valid, true);
  assert.equal(validatePhone('123').valid, false); // too short
  assert.equal(validatePhone('abc-def-ghij').valid, false);
});

