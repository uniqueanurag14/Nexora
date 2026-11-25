/**
 * NEXORA ERP — Automated Verification Suite for:
 * 1. Versioned PostgreSQL Migration Runner (`npm run db:update`)
 * 2. Performance Employee Registration Enhancements (Hardware ID, Employee Type, Auto-ID Concurrency)
 * 3. Backup Multi-Scheduler (Validation, Asia/Kolkata Timezone Next-Run, Feb/Short-Month Clamping, Safe Retention)
 * 4. Controlled Maintenance Mode Middleware & Granular RBAC Separation (Viewer vs Isolated vs Production Super Admin)
 */

import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DISABLE_PG_FOR_TESTS = 'true';
process.env.NODE_ENV = 'test';

import { NEXORA_MIGRATIONS, type MigrationDefinition } from '../server/migrations/migrations';
import {
  runPendingMigrations,
  computeMigrationChecksum,
  type MigrationPoolLike,
} from '../server/migrations/migrationRunner';
import {
  normalizeEmployeeType,
  validateHardwareId,
  generateNextPerformanceEmployeeId,
} from '../server/performanceRoutes';
import {
  validateSchedulerInput,
  computeNextExecution,
  selectBackupsForRetentionCleanup,
} from '../server/security/backupSchedulerService';
import {
  sanitizeIsolatedDatabaseName,
  PRODUCTION_RESTORE_CONFIRMATION_PHRASE,
} from '../server/security/restoreService';
import {
  enterMaintenanceMode,
  exitMaintenanceMode,
  isMaintenanceModeActive,
  maintenanceModeMiddleware,
} from '../server/security/maintenanceMode';
import { store } from '../server/store';
import { hasAnyPermission } from '../server/security/backupRestoreRoutes';

// =========================================================================
// 1. VERSIONED POSTGRESQL MIGRATION RUNNER TESTS
// =========================================================================

test('Migration definitions are ordered, idempotent DDL-only, and contain zero seed/dummy inserts', () => {
  assert.ok(NEXORA_MIGRATIONS.length >= 3, 'Expected at least 3 versioned migrations');
  const versions = NEXORA_MIGRATIONS.map((m) => m.version);
  const sorted = [...versions].sort((a, b) => a.localeCompare(b));
  assert.deepEqual(versions, sorted, 'Migration versions must be strictly ordered');

  for (const mig of NEXORA_MIGRATIONS) {
    assert.ok(mig.statements.length > 0, `Migration ${mig.version} must contain SQL statements`);
    for (const stmt of mig.statements) {
      assert.ok(!/\bDROP\s+TABLE\b/i.test(stmt), `Migration ${mig.version} must never DROP TABLE`);
      assert.ok(!/\bTRUNCATE\b/i.test(stmt), `Migration ${mig.version} must never TRUNCATE`);
      assert.ok(!/\bINSERT\s+INTO\b/i.test(stmt), `Migration ${mig.version} must never insert seed data`);
    }
  }
});

test('Migration runner applies pending migrations transactionally and skips already-applied versions on re-run', async () => {
  const appliedRows: Array<{ version: string; name: string; checksum: string; applied_at: string }> = [];
  const executedSql: string[] = [];

  const fakePool: MigrationPoolLike = {
    async query(sql: string) {
      executedSql.push(sql.trim());
      if (sql.includes('SELECT version, checksum, applied_at FROM nexora_schema_migrations')) {
        return { rows: [...appliedRows] };
      }
      return { rows: [] };
    },
    async connect() {
      let txPending: Array<{ version: string; name: string; checksum: string; applied_at: string }> = [];
      return {
        async query(sql: string, params?: any[]) {
          executedSql.push(sql.trim());
          if (sql.trim() === 'BEGIN') {
            txPending = [];
            return { rows: [] };
          }
          if (sql.includes('INSERT INTO nexora_schema_migrations') && params) {
            txPending.push({
              version: String(params[0]),
              name: String(params[1]),
              checksum: String(params[2]),
              applied_at: new Date().toISOString(),
            });
            return { rows: [] };
          }
          if (sql.trim() === 'COMMIT') {
            appliedRows.push(...txPending);
            txPending = [];
            return { rows: [] };
          }
          if (sql.trim() === 'ROLLBACK') {
            txPending = [];
            return { rows: [] };
          }
          return { rows: [] };
        },
        release() {},
      };
    },
  };

  const silentLog = { info: () => {}, error: () => {} };

  // First run: applies all 3 migrations
  const firstRun = await runPendingMigrations(fakePool, NEXORA_MIGRATIONS, silentLog);
  assert.equal(firstRun.success, true);
  assert.equal(firstRun.applied.length, NEXORA_MIGRATIONS.length);
  assert.equal(firstRun.skipped.length, 0);
  assert.equal(appliedRows.length, NEXORA_MIGRATIONS.length);

  // Second run: idempotent — skips all 3 migrations without re-running DDL
  const secondRun = await runPendingMigrations(fakePool, NEXORA_MIGRATIONS, silentLog);
  assert.equal(secondRun.success, true);
  assert.equal(secondRun.applied.length, 0);
  assert.equal(secondRun.skipped.length, NEXORA_MIGRATIONS.length);
});

test('Migration runner rolls back transaction cleanly and stops on SQL failure', async () => {
  const events: string[] = [];
  const failingMigrations: MigrationDefinition[] = [
    {
      version: '001_good',
      name: 'Good migration',
      description: 'succeeds',
      statements: ['CREATE TABLE IF NOT EXISTS t1 (id INT)'],
    },
    {
      version: '002_bad',
      name: 'Bad migration',
      description: 'fails intentionally',
      statements: ['FAIL_SQL_STATEMENT'],
    },
  ];

  const applied = new Set<string>();
  const fakePool: MigrationPoolLike = {
    async query(sql: string) {
      if (sql.includes('SELECT version')) {
        return { rows: Array.from(applied).map((v) => ({ version: v, checksum: 'x', applied_at: new Date().toISOString() })) };
      }
      return { rows: [] };
    },
    async connect() {
      let pendingVer: string | null = null;
      return {
        async query(sql: string, params?: any[]) {
          const s = sql.trim();
          events.push(s);
          if (s === 'FAIL_SQL_STATEMENT') {
            throw new Error('Simulated syntax error');
          }
          if (s.includes('INSERT INTO nexora_schema_migrations') && params) {
            pendingVer = String(params[0]);
          }
          if (s === 'COMMIT' && pendingVer) {
            applied.add(pendingVer);
            pendingVer = null;
          }
          if (s === 'ROLLBACK') {
            pendingVer = null;
          }
          return { rows: [] };
        },
        release() {},
      };
    },
  };

  const res = await runPendingMigrations(fakePool, failingMigrations, { info: () => {}, error: () => {} });
  assert.equal(res.success, false);
  assert.equal(res.applied.length, 1);
  assert.equal(res.failed?.version, '002_bad');
  assert.ok(events.includes('ROLLBACK'), 'Failed migration must trigger ROLLBACK');
  assert.equal(applied.has('002_bad'), false, 'Failed migration must NOT be recorded as applied');
  assert.ok(computeMigrationChecksum(failingMigrations[0]).length === 64);
});

// =========================================================================
// 2. PERFORMANCE EMPLOYEE REGISTRATION ENHANCEMENT TESTS
// =========================================================================

test('Performance Employee validation enforces exact Employee Type options and Hardware ID format', () => {
  assert.equal(normalizeEmployeeType('full_time'), 'full_time');
  assert.equal(normalizeEmployeeType('Full-time'), 'full_time');
  assert.equal(normalizeEmployeeType('Training'), 'training');
  assert.equal(normalizeEmployeeType('Third-party'), 'third_party');
  assert.equal(normalizeEmployeeType('contractor'), null);
  assert.equal(normalizeEmployeeType(''), null);

  assert.equal(validateHardwareId('hw-line1-01').valid, true);
  assert.equal(validateHardwareId('hw-line1-01').value, 'HW-LINE1-01');
  assert.equal(validateHardwareId('').valid, false);
  assert.equal(validateHardwareId('A').valid, false);
  assert.equal(validateHardwareId('HW; DROP TABLE users;--').valid, false);
});

test('Auto-generated Employee ID acquires PostgreSQL advisory lock and produces monotonic company-prefixed IDs', async () => {
  let lockCalled = false;
  const mockClient = {
    async query(sql: string) {
      if (sql.includes('pg_advisory_xact_lock')) {
        lockCalled = true;
        return { rows: [{ pg_advisory_xact_lock: '' }] };
      }
      if (sql.includes('FROM performance_employees')) {
        return { rows: [{ emp_id: 'FZT-001' }, { emp_id: 'FZT-002' }] };
      }
      if (sql.includes('FROM users')) {
        return { rows: [{ employee_id: 'FZT-003' }] };
      }
      return { rows: [] };
    },
  };

  store.initSeed();
  const next = await generateNextPerformanceEmployeeId(mockClient);
  assert.equal(lockCalled, true, 'Must acquire transaction-scoped PostgreSQL advisory lock');
  assert.match(next.next_emp_id, /^[A-Z0-9]{3}-\d{3,}$/);
  assert.notEqual(next.next_emp_id, 'FZT-001');
  assert.notEqual(next.next_emp_id, 'FZT-002');
  assert.notEqual(next.next_emp_id, 'FZT-003');
});

// =========================================================================
// 3. BACKUP MULTI-SCHEDULER & SAFE RETENTION TESTS
// =========================================================================

test('Backup scheduler validation enforces daily/weekly/monthly rules, valid timezones, and retention bounds', () => {
  const dailyOk = validateSchedulerInput({
    name: 'Nightly Full PG Backup',
    frequency: 'daily',
    scheduled_time: '02:00',
    timezone: 'Asia/Kolkata',
    retention_days: 30,
  });
  assert.equal(dailyOk.valid, true);

  const weeklyMissingDays = validateSchedulerInput({
    name: 'Weekly Backup',
    frequency: 'weekly',
    selected_days: [],
    scheduled_time: '03:30',
    timezone: 'Asia/Kolkata',
    retention_days: 60,
  });
  assert.equal(weeklyMissingDays.valid, false);
  assert.equal(weeklyMissingDays.errors[0].field, 'selected_days');

  const monthlyBadDay = validateSchedulerInput({
    name: 'Monthly Backup',
    frequency: 'monthly',
    monthly_day: 32,
    scheduled_time: '01:00',
    timezone: 'Asia/Kolkata',
    retention_days: 365,
  });
  assert.equal(monthlyBadDay.valid, false);
  assert.equal(monthlyBadDay.errors[0].field, 'monthly_day');

  const badTz = validateSchedulerInput({
    name: 'Invalid TZ',
    frequency: 'daily',
    scheduled_time: '02:00',
    timezone: 'Mars/Olympus',
    retention_days: 14,
  });
  assert.equal(badTz.valid, false);
  assert.equal(badTz.errors[0].field, 'timezone');
});

test('computeNextExecution accurately computes Asia/Kolkata daily, weekly, and February-clamped monthly schedules', () => {
  // 2026-02-15 01:00 IST = 2026-02-14T19:30:00Z
  const ref = new Date('2026-02-14T19:30:00.000Z');

  // Daily 02:00 IST -> 2026-02-14T20:30:00Z (30 minutes later on 2026-02-15 02:00 IST)
  const nextDaily = computeNextExecution(
    { frequency: 'daily', scheduled_time: '02:00', timezone: 'Asia/Kolkata' },
    ref
  );
  assert.equal(nextDaily.toISOString(), '2026-02-14T20:30:00.000Z');

  // Monthly day 31 in non-leap Feb 2026 -> clamps safely to Feb 28 2026 02:00 IST = 2026-02-27T20:30:00Z
  const nextMonthlyFeb = computeNextExecution(
    { frequency: 'monthly', monthly_day: 31, scheduled_time: '02:00', timezone: 'Asia/Kolkata' },
    ref
  );
  assert.equal(nextMonthlyFeb.toISOString(), '2026-02-27T20:30:00.000Z');

  // Weekly on Monday (1) at 02:00 IST from Sun Feb 15 01:00 IST -> Mon Feb 16 02:00 IST = 2026-02-15T20:30:00Z
  const nextWeekly = computeNextExecution(
    { frequency: 'weekly', selected_days: [1], scheduled_time: '02:00', timezone: 'Asia/Kolkata' },
    ref
  );
  assert.equal(nextWeekly.toISOString(), '2026-02-15T20:30:00.000Z');
});

test('Retention cleanup never deletes the last valid backup, protected recovery backups, or active restore targets', () => {
  const now = new Date('2026-06-01T00:00:00.000Z');
  const oldDate = '2026-01-01T02:00:00.000Z';
  const slightlyNewerOldDate = '2026-02-01T02:00:00.000Z';

  // Case A: Only 1 valid verified backup exists (even though older than retention) -> MUST NOT BE DELETED
  const onlyOne = selectBackupsForRetentionCleanup(
    [
      {
        backup_uid: 'bkp_only_valid',
        started_at: oldDate,
        completed_at: oldDate,
        verification_status: 'verified',
        execution_status: 'completed',
        is_protected_recovery: false,
      },
    ],
    30,
    new Set(),
    now
  );
  assert.deepEqual(onlyOne, [], 'Must NEVER delete the only remaining valid verified backup');

  // Case B: Protected recovery backup & active restore target are both preserved, while older excess backup is pruned
  const pruned = selectBackupsForRetentionCleanup(
    [
      {
        backup_uid: 'bkp_newest_valid',
        started_at: slightlyNewerOldDate,
        completed_at: slightlyNewerOldDate,
        verification_status: 'verified',
        execution_status: 'completed',
        is_protected_recovery: false,
      },
      {
        backup_uid: 'bkp_protected_recovery',
        started_at: oldDate,
        completed_at: oldDate,
        verification_status: 'verified',
        execution_status: 'completed',
        is_protected_recovery: true,
      },
      {
        backup_uid: 'bkp_in_active_restore',
        started_at: oldDate,
        completed_at: oldDate,
        verification_status: 'verified',
        execution_status: 'completed',
        is_protected_recovery: false,
      },
      {
        backup_uid: 'bkp_safe_to_prune',
        started_at: oldDate,
        completed_at: oldDate,
        verification_status: 'verified',
        execution_status: 'completed',
        is_protected_recovery: false,
      },
    ],
    30,
    new Set(['bkp_in_active_restore']),
    now
  );
  assert.deepEqual(pruned, ['bkp_safe_to_prune']);
});

// =========================================================================
// 4. RESTORE SAFETY, MAINTENANCE MODE & RBAC SEPARATION TESTS
// =========================================================================

test('Isolated database name sanitizer blocks SQL injection and enforces safe identifier format', () => {
  assert.equal(sanitizeIsolatedDatabaseName('nexora_verify_qa'), 'nexora_verify_qa');
  assert.equal(sanitizeIsolatedDatabaseName('  Test_DB_123  '), 'test_db_123');
  assert.match(sanitizeIsolatedDatabaseName(), /^nexora_restore_\d{14}$/);
  assert.throws(() => sanitizeIsolatedDatabaseName('123_invalid'), /must start with a letter/i);
  assert.equal(PRODUCTION_RESTORE_CONFIRMATION_PHRASE, 'RESTORE NEXORA PRODUCTION');
});

test('Controlled Maintenance Mode blocks mutating API requests with HTTP 503 while allowing health & restore status', () => {
  exitMaintenanceMode();
  assert.equal(isMaintenanceModeActive(), false);

  enterMaintenanceMode({ restore_uid: 'rst_prod_test', initiated_by: 'superadmin@nexora.local' });
  assert.equal(isMaintenanceModeActive(), true);

  let statusCode = 200;
  let body: any = null;
  let nextCalled = false;

  const mockRes: any = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(payload: any) {
      body = payload;
      return this;
    },
  };

  // Mutating ERP POST must be blocked with 503
  maintenanceModeMiddleware({ method: 'POST', path: '/api/inventory/items' } as any, mockRes, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, false);
  assert.equal(statusCode, 503);
  assert.equal(body?.code, 'MAINTENANCE_MODE');

  // Health & restore monitoring remain accessible
  nextCalled = false;
  maintenanceModeMiddleware({ method: 'GET', path: '/api/health' } as any, mockRes, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, true);

  nextCalled = false;
  maintenanceModeMiddleware({ method: 'GET', path: '/api/security/database-restore/status' } as any, mockRes, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, true);

  exitMaintenanceMode();
  assert.equal(isMaintenanceModeActive(), false);
});

test('RBAC strictly separates backup viewers/regular admins from Super Admin production restore permission', () => {
  store.initSeed();
  const superAdminPerms = store.getRolePermissions('super_admin');
  const adminPerms = store.getRolePermissions('admin');
  const auditorPerms = store.getRolePermissions('auditor');
  const userPerms = store.getRolePermissions('user');

  const catalogCodes = store.getPermissions().map((p) => p.code);
  assert.ok(catalogCodes.includes('settings.backups.restore.production'));
  assert.ok(catalogCodes.includes('settings.backups.restore.isolated'));
  assert.ok(catalogCodes.includes('settings.backups.manage'));
  assert.ok(catalogCodes.includes('settings.backups.restore.history'));

  assert.ok(superAdminPerms.includes('*') || superAdminPerms.includes('settings.backups.restore.production'));
  assert.equal(adminPerms.includes('settings.backups.restore.production'), false);
  assert.equal(auditorPerms.includes('settings.backups.restore.production'), false);
  assert.equal(userPerms.includes('settings.backups.restore.production'), false);

  assert.equal(hasAnyPermission('super_admin', ['settings.backups.restore.production']), true);
  assert.equal(hasAnyPermission('admin', ['settings.backups.restore.production']), false);
  assert.equal(hasAnyPermission('auditor', ['settings.backups.restore.production']), false);
});
