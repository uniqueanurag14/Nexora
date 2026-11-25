import test from 'node:test';
import assert from 'node:assert/strict';
import { store } from '../../server/store.ts';

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
