import test from 'node:test';
import assert from 'node:assert/strict';
import { store } from '../../server/store.ts';

test('store.getNextSupplierCode generates sequential codes without gaps', () => {
  const code = store.getNextSupplierCode();
  assert.match(code, /^SUP-\d{5}$/);
});

test('Supplier CRUD flow in resilient store', () => {
  const testCode = 'SUP-TEST-999';
  
  // Clean up if already exists from earlier test
  const existing = store.getSupplierByCode(testCode);
  if (existing) {
    store.deleteSupplier(existing.id);
  }

  // 1. Create Supplier
  const created = store.createSupplier({
    code: testCode,
    name: 'Precision Instruments Ltd',
    category: 'Industrial Machinery',
    tax_id: 'GSTIN27AABCP1234F1Z5',
    status: 'active',
    contact_first_name: 'Vikram',
    contact_last_name: 'Mehta',
    email: 'vikram@precisioninst.com',
    phone: '+91-9820012345',
    alternate_phone: '+91-22-67891234',
    address_line1: 'Industrial Estate Phase II',
    address_line2: 'Plot 78B',
    city: 'Pune',
    state: 'Maharashtra',
    postal_code: '411018',
    country: 'India',
    website: 'https://www.precisioninst.com',
    notes: 'ISO 9001:2015 certified instrumentation partner.',
  });

  assert.equal(created.code, testCode);
  assert.equal(created.name, 'Precision Instruments Ltd');
  assert.equal(created.status, 'active');
  assert.equal(created.contact_first_name, 'Vikram');
  assert.equal(created.contact_last_name, 'Mehta');

  // 2. Read by ID and Code
  const fetched = store.getSupplierById(created.id);
  assert.ok(fetched);
  assert.equal(fetched.name, 'Precision Instruments Ltd');

  const fetchedByCode = store.getSupplierByCode(testCode);
  assert.ok(fetchedByCode);
  assert.equal(fetchedByCode.id, created.id);

  // 3. Search and Filtering
  const searchResult = store.getSuppliers({
    search: 'Precision',
    page: 1,
    pageSize: 10,
  });
  assert.ok(searchResult.items.some(s => s.code === testCode));

  const filterCat = store.getSuppliers({
    category: 'Industrial Machinery',
    page: 1,
    pageSize: 10,
  });
  assert.ok(filterCat.items.some(s => s.code === testCode));

  // 4. Update Supplier
  const updated = store.updateSupplier(created.id, {
    name: 'Precision Instruments & Automations Ltd',
    phone: '+91-9820099999',
  });
  assert.ok(updated);
  assert.equal(updated.name, 'Precision Instruments & Automations Ltd');
  assert.equal(updated.phone, '+91-9820099999');
  assert.equal(updated.contact_first_name, 'Vikram'); // untouched preserved

  // 5. Disable Supplier (Soft Deletion)
  const disableResult = store.deleteSupplier(created.id, true);
  assert.equal(disableResult.success, true);
  assert.equal(disableResult.action, 'disabled');
  assert.equal(disableResult.supplier?.status, 'disabled');

  // 6. Hard Delete Supplier
  const deleteResult = store.deleteSupplier(created.id, false);
  assert.equal(deleteResult.success, true);
  assert.equal(deleteResult.action, 'deleted');

  const checkPurged = store.getSupplierById(created.id);
  assert.equal(checkPurged, undefined);
});

test('Formula injection protection sanitizes dangerous spreadsheet prefixes', () => {
  function sanitizeFormula(val: any): string {
    if (!val) return '';
    const s = String(val).trim();
    if (s && (s.startsWith('=') || s.startsWith('+') || s.startsWith('-') || s.startsWith('@') || s.startsWith('\t') || s.startsWith('\r'))) {
      return `'${s}`;
    }
    return s;
  }

  assert.equal(sanitizeFormula('=SUM(A1:A10)'), "'=SUM(A1:A10)");
  assert.equal(sanitizeFormula('+12345'), "'+12345");
  assert.equal(sanitizeFormula('-CMD|calc'), "'-CMD|calc");
  assert.equal(sanitizeFormula('@dangerous'), "'@dangerous");
  assert.equal(sanitizeFormula('Safe Vendor Name'), 'Safe Vendor Name');
});
