import test from 'node:test';
import assert from 'node:assert/strict';
import { store } from '../../server/store.ts';

test('Settings Redesign: Category definitions provide all 12 system sections', () => {
  store.initSeed();
  const summaries = store.getCategorySummaries();
  assert.strictEqual(summaries.length, 12, 'Must have exactly 12 categories');

  const slugs = summaries.map(s => s.slug);
  const expectedSlugs = [
    'general',
    'regional',
    'email-smtp',
    'notifications',
    'branding',
    'application-preferences',
    'workforce',
    'supplier',
    'security',
    'audit-trail',
    'active-sessions',
    'database-backups',
  ];

  for (const expected of expectedSlugs) {
    assert.ok(slugs.includes(expected), `Summaries must include category '${expected}'`);
  }
});

test('Settings Priority Hierarchy: Fallback to .env defaults when not overridden', () => {
  store.initSeed();
  // Clear any overrides to test pristine default state
  store.resetAllSettings();

  const effective = store.getEffectiveSettings('general');
  assert.ok(effective.settings.length > 0, 'Must have general settings defined');

  const appNameSetting = effective.settings.find(s => s.key === 'app_name');
  assert.ok(appNameSetting, 'app_name must exist');
  assert.strictEqual(appNameSetting?.is_overridden, false, 'Must not be marked as overridden');
  assert.strictEqual(appNameSetting?.value, process.env.APP_NAME || 'Nexora', 'Must match APP_NAME from .env');

  const companySetting = effective.settings.find(s => s.key === 'company_name');
  assert.ok(companySetting, 'company_name must exist');
  assert.strictEqual(companySetting?.is_overridden, false, 'Must not be marked as overridden');
  assert.strictEqual(companySetting?.value, process.env.APP_COMPANY || 'Toy BiZ ltd', 'Must match APP_COMPANY from .env');
});

test('Settings Database Override Priority: Custom database values override .env defaults', () => {
  store.initSeed();
  store.resetAllSettings();

  // Save an override in database
  store.updateCategorySettings('general', { app_name: 'Nexora Custom Enterprise' }, 'admin@nexora.io');

  const effective = store.getEffectiveSettings('general');
  const appNameSetting = effective.settings.find(s => s.key === 'app_name');
  assert.ok(appNameSetting, 'app_name must exist');
  assert.strictEqual(appNameSetting?.is_overridden, true, 'Must now be marked as overridden');
  assert.strictEqual(appNameSetting?.value, 'Nexora Custom Enterprise', 'Must return custom database override');
  assert.strictEqual(appNameSetting?.env_default, process.env.APP_NAME || 'Nexora', 'Must preserve original .env default');
});

test('Settings Single Key Reset: Reverts to .env default and removes database override', () => {
  store.initSeed();
  store.resetAllSettings();

  // Set override
  store.updateCategorySettings('regional', { currency: 'EUR' }, 'admin@nexora.io');
  assert.strictEqual(store.isSettingOverridden('currency'), true);

  // Reset single key
  const removed = store.resetSettingKey('currency');
  assert.strictEqual(removed, true, 'resetSettingKey must return true');
  assert.strictEqual(store.isSettingOverridden('currency'), false, 'Key must no longer be overridden');

  // Verify effective value is now .env default
  const effective = store.getEffectiveSettings('regional');
  const currencySetting = effective.settings.find(s => s.key === 'currency');
  assert.strictEqual(currencySetting?.is_overridden, false);
  assert.strictEqual(currencySetting?.value, process.env.APP_CURRENCY || 'INR');
});

test('Settings Category Reset: Reverts all settings in category without affecting other categories', () => {
  store.initSeed();
  store.resetAllSettings();

  // Set overrides in workforce AND branding
  store.updateCategorySettings('workforce', { work_event_cooldown_seconds: '120', max_daily_shifts: '3' }, 'admin@nexora.io');
  store.updateCategorySettings('branding', { brand_tagline: 'Custom Tagline 2026' }, 'admin@nexora.io');

  assert.strictEqual(store.isSettingOverridden('work_event_cooldown_seconds'), true);
  assert.strictEqual(store.isSettingOverridden('max_daily_shifts'), true);
  assert.strictEqual(store.isSettingOverridden('brand_tagline'), true);

  // Reset only workforce category
  const res = store.resetSettingCategory('workforce');
  assert.strictEqual(res.count, 2, 'Must have removed 2 overrides in workforce');
  assert.strictEqual(store.isSettingOverridden('work_event_cooldown_seconds'), false);
  assert.strictEqual(store.isSettingOverridden('max_daily_shifts'), false);

  // Branding must remain overridden
  assert.strictEqual(store.isSettingOverridden('brand_tagline'), true, 'Branding override must remain untouched');
});

test('Settings Reset All: Restores all configurable categories to pristine .env defaults', () => {
  store.initSeed();
  store.updateCategorySettings('supplier', { quotation_approval_threshold: '100000' }, 'admin@nexora.io');
  store.updateCategorySettings('notifications', { system_alerts_enabled: 'false' }, 'admin@nexora.io');

  const res = store.resetAllSettings();
  assert.ok(res.count >= 2, 'Must have removed all stored overrides');

  const summaries = store.getCategorySummaries();
  const totalOverrides = summaries.reduce((sum, c) => sum + (c.overridden_count || 0), 0);
  assert.strictEqual(totalOverrides, 0, 'Total overrides across all categories must be 0 after resetAll');
});

test('Security & Sensitive Data: Sensitive credentials (SMTP password) are masked in responses', () => {
  store.initSeed();
  const effective = store.getEffectiveSettings('email_smtp');
  const smtpPassSetting = effective.settings.find(s => s.key === 'smtp_password');

  assert.ok(smtpPassSetting, 'smtp_password must exist');
  assert.strictEqual(smtpPassSetting?.isSensitive, true, 'Must be marked as sensitive');
  assert.strictEqual(smtpPassSetting?.value, '••••••••••••', 'Value must be masked with dots');
  assert.strictEqual(smtpPassSetting?.env_default, '••••••••••••', 'Default must be masked with dots');
  assert.notStrictEqual(smtpPassSetting?.value, process.env.SMTP_PASSWORD, 'Plain text password must never be exposed');
});

test('Operational Ledgers: Audit trail, active sessions, and backups are functional', () => {
  store.initSeed();

  // Audit log test
  store.logAudit({
    user_id: 1,
    user_email: 'test@example.com',
    action: 'TEST_SETTINGS_ACTION',
    module: 'Settings',
    details: 'Verified settings redesign audit capability',
    ip_address: '127.0.0.1',
  });

  const logs = store.getAuditTrail({ action: 'TEST_SETTINGS_ACTION' });
  assert.ok(logs.length > 0, 'Logged audit action must be retrievable');
  assert.strictEqual(logs[0].action, 'TEST_SETTINGS_ACTION');

  // Session test
  const activeSessions = store.getAllSessions();
  assert.ok(Array.isArray(activeSessions), 'getAllSessions must return array');

  // Backup test
  const backups = store.getDatabaseBackups();
  assert.ok(Array.isArray(backups), 'getDatabaseBackups must return array');
});
