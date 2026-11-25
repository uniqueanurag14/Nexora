import test from 'node:test';
import assert from 'node:assert/strict';
import { store } from '../../server/store.ts';
import { getPerformanceTier, getTierStyle } from './performanceThresholds.ts';

test('Performance Management Module: RBAC role mapping for performance_user', () => {
  store.initSeed();

  // Verify performance_user exists in roles
  const roles = store.getRoles();
  const perfRole = roles.find(r => r.code === 'performance_user');
  assert.ok(perfRole, 'Role performance_user must exist');
  assert.strictEqual(perfRole?.name, 'Performance User');

  // Verify role grants
  const perms = store.getRolePermissions('performance_user');
  assert.ok(perms.includes('performance.view'), 'Must have performance.view');
  assert.ok(perms.includes('performance.manage'), 'Must have performance.manage');
  assert.ok(perms.includes('performance.simulate'), 'Must have performance.simulate');
  assert.ok(perms.includes('performance.export'), 'Must have performance.export');
  assert.ok(perms.includes('menu.workforce'), 'Must have menu.workforce access');

  // Verify performance_user has NO access to unrelated administrative modules
  assert.strictEqual(perms.includes('users.create'), false, 'Must not have users.create');
  assert.strictEqual(perms.includes('users.delete'), false, 'Must not have users.delete');
  assert.strictEqual(perms.includes('roles.create'), false, 'Must not have roles.create');
  assert.strictEqual(perms.includes('roles.delete'), false, 'Must not have roles.delete');
  assert.strictEqual(perms.includes('*'), false, 'Must not have wildcard super_admin permission');
});

test('Performance Management Module: Navigation menu hierarchy', () => {
  store.initSeed();

  const menus = store.getNavigationMenus();

  // Workforce & Monitoring parent (id 6)
  const wfParent = menus.find(m => m.id === 6);
  assert.ok(wfParent, 'Workforce & Monitoring menu parent must exist');
  assert.strictEqual(wfParent?.is_implemented, true, 'Workforce & Monitoring must be marked implemented');

  // Performance Management subgroup (id 60)
  const perfGroup = menus.find(m => m.id === 60);
  assert.ok(perfGroup, 'Performance Management subgroup must exist');
  assert.strictEqual(perfGroup?.parent_id, 6, 'Must be child of Workforce & Monitoring');

  // Subitem 1: Employee Registration (id 601)
  const regItem = menus.find(m => m.id === 601);
  assert.ok(regItem, 'Employee Registration must exist');
  assert.strictEqual(regItem?.parent_id, 60);
  assert.strictEqual(regItem?.route, '/workforce/performance/registration');
  assert.strictEqual(regItem?.display_order, 1);

  // Subitem 2: Live Performance (id 61)
  const liveItem = menus.find(m => m.id === 61);
  assert.ok(liveItem, 'Live Performance must exist');
  assert.strictEqual(liveItem?.parent_id, 60);
  assert.strictEqual(liveItem?.route, '/workforce/performance/live');
  assert.strictEqual(liveItem?.display_order, 2);

  // Subitem 3: Performance Reports (id 62)
  const reportsItem = menus.find(m => m.id === 62);
  assert.ok(reportsItem, 'Performance Reports must exist');
  assert.strictEqual(reportsItem?.parent_id, 60);
  assert.strictEqual(reportsItem?.route, '/workforce/performance/reports');
  assert.strictEqual(reportsItem?.display_order, 3);
});

test('Performance Management Module: Sorting algorithm - newest activity on top, inactive below', () => {
  const employees = [
    { id: 1, emp_id: 'EMP-001', name: 'Alice', last_event_timestamp: null },
    { id: 2, emp_id: 'EMP-002', name: 'Bob', last_event_timestamp: '2026-10-28T10:00:00Z' },
    { id: 3, emp_id: 'EMP-003', name: 'Charlie', last_event_timestamp: '2026-10-28T11:30:00Z' },
    { id: 4, emp_id: 'EMP-004', name: 'David', last_event_timestamp: null },
    { id: 5, emp_id: 'EMP-005', name: 'Eve', last_event_timestamp: '2026-10-28T09:15:00Z' },
  ];

  employees.sort((a, b) => {
    if (a.last_event_timestamp && b.last_event_timestamp) {
      const diff = new Date(b.last_event_timestamp).getTime() - new Date(a.last_event_timestamp).getTime();
      if (diff !== 0) return diff;
      return a.id - b.id;
    }
    if (a.last_event_timestamp && !b.last_event_timestamp) return -1;
    if (!a.last_event_timestamp && b.last_event_timestamp) return 1;
    return a.id - b.id;
  });

  // Expected order:
  // 1. Charlie (11:30:00 - newest)
  // 2. Bob (10:00:00)
  // 3. Eve (09:15:00)
  // 4. Alice (no activity, id: 1)
  // 5. David (no activity, id: 4)
  assert.strictEqual(employees[0].name, 'Charlie');
  assert.strictEqual(employees[1].name, 'Bob');
  assert.strictEqual(employees[2].name, 'Eve');
  assert.strictEqual(employees[3].name, 'Alice');
  assert.strictEqual(employees[4].name, 'David');
});

test('Performance Management Module: Dynamic display name derivation', () => {
  const formatDisplayName = (first: string, last: string, empId: string) => {
    const combined = [first, last].filter(Boolean).map(s => s.trim()).filter(Boolean).join(' ');
    return combined || `Employee #${empId}`;
  };

  assert.strictEqual(formatDisplayName('Anurag', 'Sinha', 'EMP-1001'), 'Anurag Sinha');
  assert.strictEqual(formatDisplayName('Dev', '', 'EMP-1002'), 'Dev');
  assert.strictEqual(formatDisplayName('', '', 'EMP-1003'), 'Employee #EMP-1003');
});

test('Performance Management Module: Performance tier calculation & color thresholds', () => {
  // Today's period rules: High >= 5, Medium 2..4, Low 1, Inactive 0
  assert.strictEqual(getPerformanceTier(10, 'today'), 'high');
  assert.strictEqual(getPerformanceTier(5, 'today'), 'high');
  assert.strictEqual(getPerformanceTier(4, 'today'), 'medium');
  assert.strictEqual(getPerformanceTier(2, 'today'), 'medium');
  assert.strictEqual(getPerformanceTier(1, 'today'), 'low');
  assert.strictEqual(getPerformanceTier(0, 'today'), 'inactive');

  // Verify styling definitions
  const highStyle = getTierStyle('high');
  assert.strictEqual(highStyle.label, 'High Output');
  assert.ok(highStyle.badgeClass.includes('emerald'));
  assert.ok(highStyle.rowClass.includes('emerald'));

  const medStyle = getTierStyle('medium');
  assert.strictEqual(medStyle.label, 'Medium Output');
  assert.ok(medStyle.badgeClass.includes('amber'));
  assert.ok(medStyle.rowClass.includes('amber'));

  const lowStyle = getTierStyle('low');
  assert.strictEqual(lowStyle.label, 'Low Output');
  assert.ok(lowStyle.badgeClass.includes('rose'));
  assert.ok(lowStyle.rowClass.includes('rose'));

  const inactStyle = getTierStyle('inactive');
  assert.strictEqual(inactStyle.label, 'No Activity');
  assert.ok(inactStyle.badgeClass.includes('slate'));
});

test('Performance Management Module: Full-screen route resolution and shell bypass', () => {
  const isFullScreenRoute = (route: string) =>
    route === '/workforce/performance/live/fullscreen' ||
    route.startsWith('/workforce/performance/live/fullscreen') ||
    route === '/workforce/performance/fullscreen' ||
    route === '/workforce/fullscreen';

  assert.strictEqual(isFullScreenRoute('/workforce/performance/live/fullscreen'), true);
  assert.strictEqual(isFullScreenRoute('/workforce/performance/live/fullscreen?period=today'), true);
  assert.strictEqual(isFullScreenRoute('/workforce/performance/fullscreen'), true);
  assert.strictEqual(isFullScreenRoute('/workforce/fullscreen'), true);
  assert.strictEqual(isFullScreenRoute('/workforce/performance/live'), false);
  assert.strictEqual(isFullScreenRoute('/dashboard'), false);
});

test('Workforce Performance Reports: Date range validation logic', () => {
  const validateCustomDateRange = (start: string, end: string) => {
    if (!start || !end) return { isValid: true, error: null };
    if (start > end) {
      return { isValid: false, error: 'Start date cannot be after end date.' };
    }
    return { isValid: true, error: null };
  };

  assert.deepStrictEqual(validateCustomDateRange('2026-10-01', '2026-10-29'), { isValid: true, error: null });
  assert.deepStrictEqual(validateCustomDateRange('2026-10-29', '2026-10-29'), { isValid: true, error: null });
  assert.strictEqual(validateCustomDateRange('2026-10-30', '2026-10-29').isValid, false);
  assert.strictEqual(validateCustomDateRange('2026-10-30', '2026-10-29').error, 'Start date cannot be after end date.');
});

test('Workforce Performance Reports: Distinct active personnel vs registered personnel', () => {
  // Scenario: 4 registered employees in roster, but only 2 have recorded qualifying events
  const registered = [
    { emp_id: 'EMP-01', name: 'Alice' },
    { emp_id: 'EMP-02', name: 'Bob' },
    { emp_id: 'EMP-03', name: 'Charlie' },
    { emp_id: 'EMP-04', name: 'David' },
  ];

  const eventsInPeriod = [
    { emp_id: 'EMP-01', source: 'HARDWARE' },
    { emp_id: 'EMP-01', source: 'HARDWARE' },
    { emp_id: 'EMP-03', source: 'HARDWARE' },
  ];

  const distinctActive = new Set(eventsInPeriod.map(e => e.emp_id)).size;
  const totalRegistered = registered.length;

  assert.strictEqual(distinctActive, 2, 'Distinct active in period must be 2');
  assert.strictEqual(totalRegistered, 4, 'Total registered roster must be 4');
  assert.notStrictEqual(distinctActive, totalRegistered, 'Active count must not be confused with registered count');
});

test('Workforce Performance Reports: Top performing personnel ranking and simulated exclusion', () => {
  const events = [
    { emp_id: 'EMP-01', source: 'HARDWARE' },
    { emp_id: 'EMP-01', source: 'HARDWARE' },
    { emp_id: 'EMP-02', source: 'HARDWARE' },
    { emp_id: 'EMP-02', source: 'HARDWARE' },
    { emp_id: 'EMP-02', source: 'HARDWARE' },
    { emp_id: 'EMP-03', source: 'SIMULATED' }, // Simulated event
    { emp_id: 'EMP-03', source: 'SIMULATED' }, // Simulated event
  ];

  // Official mode: exclude simulated
  const officialEvents = events.filter(e => e.source === 'HARDWARE');
  const countMap = new Map<string, number>();
  for (const e of officialEvents) {
    countMap.set(e.emp_id, (countMap.get(e.emp_id) || 0) + 1);
  }

  const ranked = Array.from(countMap.entries())
    .map(([emp_id, count]) => ({ emp_id, count }))
    .sort((a, b) => b.count - a.count);

  assert.strictEqual(ranked[0].emp_id, 'EMP-02', 'Top performer must be EMP-02 with 3 hardware events');
  assert.strictEqual(ranked[0].count, 3);
  assert.strictEqual(ranked[1].emp_id, 'EMP-01');
  assert.strictEqual(ranked[1].count, 2);
  assert.strictEqual(ranked.find(r => r.emp_id === 'EMP-03'), undefined, 'EMP-03 with only simulated events must be excluded from official ranking');
});

test('Workforce Performance Reports: 24-Hour hourly distribution integrity', () => {
  const events = [
    { timestamp: '2026-10-29T08:15:00Z', source: 'HARDWARE' },
    { timestamp: '2026-10-29T08:45:00Z', source: 'HARDWARE' },
    { timestamp: '2026-10-29T14:20:00Z', source: 'HARDWARE' },
  ];

  const hourMap = new Map<number, number>();
  for (const e of events) {
    const h = new Date(e.timestamp).getUTCHours();
    hourMap.set(h, (hourMap.get(h) || 0) + 1);
  }

  const hourlyDistribution = Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    label: `${String(h).padStart(2, '0')}:00`,
    count: hourMap.get(h) || 0,
  }));

  assert.strictEqual(hourlyDistribution.length, 24, 'Hourly distribution must contain all 24 hours');
  assert.strictEqual(hourlyDistribution[8].count, 2, 'Hour 08:00 must have 2 events');
  assert.strictEqual(hourlyDistribution[14].count, 1, 'Hour 14:00 must have 1 event');
  assert.strictEqual(hourlyDistribution[0].count, 0, 'Genuine zero hour must be 0, not fabricated');
  assert.strictEqual(hourlyDistribution[23].count, 0, 'Genuine zero hour must be 0');
});


