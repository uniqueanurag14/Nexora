import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractCompanyPrefix,
  computeNextEmployeeId,
  formatEmployeeId,
} from '../../server/utils/employeeId.ts';
import { store } from '../../server/store.ts';

test('Company Prefix Extractor: derives deterministic 3-char prefix from company names', () => {
  assert.strictEqual(extractCompanyPrefix('FunZoo Toys Jewar, Uttar Pradesh'), 'FZT');
  assert.strictEqual(extractCompanyPrefix('Fun Zoo Toys Pvt Ltd'), 'FZT');
  assert.strictEqual(extractCompanyPrefix('Toy BiZ ltd'), 'TBZ');
  assert.strictEqual(extractCompanyPrefix('Acme Corp'), 'ACM');
});

test('Sequential Employee ID Generator: fills first next sequence cleanly without truncating 1000+', () => {
  assert.strictEqual(formatEmployeeId('FZT', 1), 'FZT-001');
  assert.strictEqual(formatEmployeeId('FZT', 42), 'FZT-042');
  assert.strictEqual(formatEmployeeId('FZT', 999), 'FZT-999');
  assert.strictEqual(formatEmployeeId('FZT', 1000), 'FZT-1000');

  const first = computeNextEmployeeId('FunZoo Toys Jewar, Uttar Pradesh', []);
  assert.strictEqual(first.prefix, 'FZT');
  assert.strictEqual(first.next_emp_id, 'FZT-001');

  const next = computeNextEmployeeId('FunZoo Toys Jewar, Uttar Pradesh', ['FZT-001', 'FZT-002', 'EMP-099']);
  assert.strictEqual(next.prefix, 'FZT');
  assert.strictEqual(next.sequence, 3);
  assert.strictEqual(next.next_emp_id, 'FZT-003');
});

test('Runtime Branding Config: syncs dynamically between .env defaults and settings overrides', () => {
  store.initSeed();
  store.resetAllSettings();

  const initialBranding = store.getBrandingConfig();
  assert.strictEqual(
    initialBranding.company_name,
    process.env.App_Company || process.env.APP_COMPANY || 'FunZoo Toys Jewar, Uttar Pradesh'
  );
  assert.strictEqual(
    initialBranding.reset_token_expiry_minutes,
    parseInt(process.env.PASSWORD_RESET_EXPIRES_MINUTES || '15', 10)
  );

  store.updateCategorySettings('general', { company_name: 'Horizon Robotics Ltd' }, 'admin@nexora.io');
  const updated = store.getBrandingConfig();
  assert.strictEqual(updated.company_name, 'Horizon Robotics Ltd');
  assert.strictEqual(store.getAppCompany().company_name, 'Horizon Robotics Ltd');

  store.resetAllSettings();
  const reverted = store.getBrandingConfig();
  assert.strictEqual(
    reverted.company_name,
    process.env.App_Company || process.env.APP_COMPANY || 'FunZoo Toys Jewar, Uttar Pradesh'
  );
});
