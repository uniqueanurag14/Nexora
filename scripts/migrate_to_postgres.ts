import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';

async function migrate() {
  const pgDir = path.resolve(process.cwd(), 'database', 'pgdata');
  if (!fs.existsSync(pgDir)) {
    fs.mkdirSync(pgDir, { recursive: true });
  }

  const jsonPath = path.resolve(process.cwd(), 'database', 'nexora_store.json');
  if (!fs.existsSync(jsonPath)) {
    console.log('No nexora_store.json found to migrate.');
    return;
  }

  const raw = fs.readFileSync(jsonPath, 'utf-8');
  const data = JSON.parse(raw);

  console.log('[PostgreSQL Migration] Initializing PostgreSQL database in database/pgdata...');
  const pg = new PGlite(pgDir);
  await pg.waitReady;

  console.log('[PostgreSQL Migration] Creating PostgreSQL schema...');

  await pg.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      username VARCHAR(100) UNIQUE,
      first_name VARCHAR(100) NOT NULL,
      last_name VARCHAR(100) NOT NULL,
      name VARCHAR(255),
      phone VARCHAR(50),
      department VARCHAR(100),
      password_hash VARCHAR(255) NOT NULL,
      role VARCHAR(50) NOT NULL DEFAULT 'user',
      roles JSONB DEFAULT '["user"]'::jsonb,
      is_active BOOLEAN NOT NULL DEFAULT true,
      is_verified BOOLEAN NOT NULL DEFAULT true,
      last_login_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS roles (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      code VARCHAR(50) UNIQUE NOT NULL,
      description TEXT,
      is_system BOOLEAN NOT NULL DEFAULT false,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS permissions (
      code VARCHAR(100) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      module VARCHAR(100) NOT NULL,
      category VARCHAR(50) NOT NULL DEFAULT 'action'
    );

    CREATE TABLE IF NOT EXISTS role_permissions (
      role VARCHAR(50) NOT NULL,
      permission_code VARCHAR(100) NOT NULL,
      PRIMARY KEY (role, permission_code)
    );

    CREATE TABLE IF NOT EXISTS navigation_menus (
      id SERIAL PRIMARY KEY,
      label VARCHAR(100) NOT NULL,
      icon VARCHAR(50) NOT NULL,
      route VARCHAR(255) NOT NULL,
      parent_id INTEGER,
      display_order INTEGER NOT NULL DEFAULT 1,
      is_active BOOLEAN NOT NULL DEFAULT true,
      required_permission VARCHAR(100) NOT NULL,
      module_tag VARCHAR(50) NOT NULL DEFAULT 'core',
      is_implemented BOOLEAN NOT NULL DEFAULT true
    );

    CREATE TABLE IF NOT EXISTS system_settings (
      key VARCHAR(100) PRIMARY KEY,
      value TEXT NOT NULL,
      category VARCHAR(50) NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_by VARCHAR(100) NOT NULL DEFAULT 'system'
    );

    CREATE TABLE IF NOT EXISTS user_sessions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      token_jti VARCHAR(100),
      jti VARCHAR(100),
      ip_address VARCHAR(50),
      user_agent TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ,
      last_activity_at TIMESTAMPTZ,
      last_active_at TIMESTAMPTZ,
      is_revoked BOOLEAN NOT NULL DEFAULT false
    );

    CREATE TABLE IF NOT EXISTS revoked_tokens (
      jti VARCHAR(100) PRIMARY KEY,
      revoked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS audit_trail (
      id SERIAL PRIMARY KEY,
      user_id INTEGER,
      user_email VARCHAR(255),
      action VARCHAR(100) NOT NULL,
      module VARCHAR(100) NOT NULL,
      details TEXT NOT NULL,
      ip_address VARCHAR(50),
      timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS suppliers (
      id SERIAL PRIMARY KEY,
      code VARCHAR(100) UNIQUE NOT NULL,
      name VARCHAR(255) NOT NULL,
      category VARCHAR(100),
      tax_id VARCHAR(100),
      status VARCHAR(50) NOT NULL DEFAULT 'active',
      contact_first_name VARCHAR(100),
      contact_last_name VARCHAR(100),
      email VARCHAR(255),
      phone VARCHAR(50),
      alternate_phone VARCHAR(50),
      address_line1 VARCHAR(255),
      address_line2 VARCHAR(255),
      city VARCHAR(100),
      state VARCHAR(100),
      postal_code VARCHAR(50),
      country VARCHAR(100) DEFAULT 'India',
      website VARCHAR(255),
      notes TEXT,
      created_by INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS inventory_categories (
      id SERIAL PRIMARY KEY,
      code VARCHAR(50) UNIQUE NOT NULL,
      name VARCHAR(150) NOT NULL,
      description TEXT,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS units_of_measure (
      id SERIAL PRIMARY KEY,
      code VARCHAR(50) UNIQUE NOT NULL,
      name VARCHAR(100) NOT NULL,
      symbol VARCHAR(20) NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS warehouses (
      id SERIAL PRIMARY KEY,
      code VARCHAR(50) UNIQUE NOT NULL,
      name VARCHAR(150) NOT NULL,
      address TEXT,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS inventory_items (
      id SERIAL PRIMARY KEY,
      code VARCHAR(100) UNIQUE NOT NULL,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      category_id INTEGER REFERENCES inventory_categories(id) ON DELETE SET NULL,
      uom_id INTEGER REFERENCES units_of_measure(id) ON DELETE SET NULL,
      barcode VARCHAR(100),
      min_stock_level NUMERIC(12, 2) NOT NULL DEFAULT 0,
      reorder_quantity NUMERIC(12, 2) NOT NULL DEFAULT 0,
      cost_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
      selling_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
      status VARCHAR(50) NOT NULL DEFAULT 'active',
      created_by INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS stock_balances (
      id SERIAL PRIMARY KEY,
      item_id INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
      warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
      quantity NUMERIC(14, 4) NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(item_id, warehouse_id)
    );

    CREATE TABLE IF NOT EXISTS stock_transactions (
      id SERIAL PRIMARY KEY,
      transaction_type VARCHAR(50) NOT NULL,
      reference_no VARCHAR(100) NOT NULL,
      item_id INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
      quantity NUMERIC(14, 4) NOT NULL,
      source_warehouse_id INTEGER REFERENCES warehouses(id) ON DELETE RESTRICT,
      destination_warehouse_id INTEGER REFERENCES warehouses(id) ON DELETE RESTRICT,
      supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
      unit_cost NUMERIC(12, 2),
      reason VARCHAR(255),
      notes TEXT,
      transaction_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      user_id INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS reorder_requests (
      id SERIAL PRIMARY KEY,
      reorder_no VARCHAR(100) UNIQUE NOT NULL,
      item_id INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
      supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
      quantity NUMERIC(12, 2) NOT NULL,
      unit_price NUMERIC(12, 2) NOT NULL,
      total_amount NUMERIC(14, 2) NOT NULL,
      expected_delivery_date VARCHAR(50),
      notes TEXT,
      status VARCHAR(50) NOT NULL DEFAULT 'pending_supplier_response',
      supplier_token_hash VARCHAR(128) UNIQUE NOT NULL,
      token_expires_at TIMESTAMPTZ NOT NULL,
      responded_at TIMESTAMPTZ,
      supplier_response_notes TEXT,
      counter_unit_price NUMERIC(12, 2),
      counter_quantity NUMERIC(12, 2),
      counter_delivery_date VARCHAR(50),
      rejection_reason TEXT,
      created_by INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS reorder_negotiations (
      id SERIAL PRIMARY KEY,
      reorder_id INTEGER NOT NULL REFERENCES reorder_requests(id) ON DELETE CASCADE,
      actor VARCHAR(50) NOT NULL,
      action VARCHAR(100) NOT NULL,
      unit_price NUMERIC(12, 2),
      quantity NUMERIC(12, 2),
      delivery_date VARCHAR(50),
      notes TEXT,
      timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  console.log('[PostgreSQL Migration] Migrating existing records...');

  // Users
  for (const u of data.users || []) {
    await pg.query(`
      INSERT INTO users (id, email, username, first_name, last_name, name, phone, department, password_hash, role, roles, is_active, is_verified, last_login_at, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        password_hash = EXCLUDED.password_hash;
    `, [
      u.id, u.email, u.username || null, u.first_name, u.last_name, u.name,
      u.phone || null, u.department || null, u.password_hash, u.role,
      JSON.stringify(u.roles || [u.role]), u.is_active, u.is_verified,
      u.last_login_at || null, u.created_at
    ]);
  }

  // Roles
  for (const r of data.roles || []) {
    await pg.query(`
      INSERT INTO roles (id, name, code, description, is_system, is_active, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (id) DO NOTHING;
    `, [r.id, r.name, r.code, r.description || null, r.is_system, r.is_active, r.created_at, r.updated_at]);
  }

  // Permissions
  for (const p of data.permissions || []) {
    await pg.query(`
      INSERT INTO permissions (code, name, module, category)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (code) DO NOTHING;
    `, [p.code, p.name, p.module, p.category || 'action']);
  }

  // Add explicit item and category permissions if not present
  const additionalPerms = [
    { code: 'categories.view', name: 'View Inventory Categories', module: 'Inventory', category: 'action' },
    { code: 'categories.create', name: 'Create Inventory Categories', module: 'Inventory', category: 'action' },
    { code: 'categories.update', name: 'Update Inventory Categories', module: 'Inventory', category: 'action' },
    { code: 'categories.delete', name: 'Delete Inventory Categories', module: 'Inventory', category: 'action' },
    { code: 'categories.disable', name: 'Disable Inventory Categories', module: 'Inventory', category: 'action' },
    { code: 'categories.import', name: 'Import Categories from Excel', module: 'Inventory', category: 'action' },
    { code: 'categories.export', name: 'Export Categories to Excel', module: 'Inventory', category: 'action' },
    { code: 'items.view', name: 'View Inventory Items', module: 'Inventory', category: 'action' },
    { code: 'items.create', name: 'Create Inventory Items', module: 'Inventory', category: 'action' },
    { code: 'items.update', name: 'Update Inventory Items', module: 'Inventory', category: 'action' },
    { code: 'items.delete', name: 'Delete Inventory Items', module: 'Inventory', category: 'action' },
    { code: 'items.disable', name: 'Disable Inventory Items', module: 'Inventory', category: 'action' },
    { code: 'items.import', name: 'Import Items from Excel', module: 'Inventory', category: 'action' },
    { code: 'items.export', name: 'Export Items to Excel', module: 'Inventory', category: 'action' },
  ];
  for (const p of additionalPerms) {
    await pg.query(`
      INSERT INTO permissions (code, name, module, category)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (code) DO NOTHING;
    `, [p.code, p.name, p.module, p.category]);
  }

  // Role Permissions
  for (const rp of data.role_permissions || []) {
    await pg.query(`
      INSERT INTO role_permissions (role, permission_code)
      VALUES ($1, $2)
      ON CONFLICT (role, permission_code) DO NOTHING;
    `, [rp.role, rp.permission_code]);
  }
  for (const p of additionalPerms) {
    await pg.query(`
      INSERT INTO role_permissions (role, permission_code)
      VALUES ('super_admin', $1)
      ON CONFLICT (role, permission_code) DO NOTHING;
    `, [p.code]);
    await pg.query(`
      INSERT INTO role_permissions (role, permission_code)
      VALUES ('admin', $1)
      ON CONFLICT (role, permission_code) DO NOTHING;
    `, [p.code]);
  }

  // Navigation Menus
  for (const m of data.navigation_menus || []) {
    await pg.query(`
      INSERT INTO navigation_menus (id, label, icon, route, parent_id, display_order, is_active, required_permission, module_tag, is_implemented)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (id) DO NOTHING;
    `, [m.id, m.label, m.icon, m.route, m.parent_id || null, m.display_order, m.is_active, m.required_permission, m.module_tag, m.is_implemented]);
  }

  // System Settings
  for (const [key, s] of Object.entries(data.system_settings || {})) {
    await pg.query(`
      INSERT INTO system_settings (key, value, category, updated_at, updated_by)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (key) DO NOTHING;
    `, [s.key, s.value, s.category, s.updated_at, s.updated_by]);
  }

  // User Sessions
  for (const s of data.user_sessions || []) {
    await pg.query(`
      INSERT INTO user_sessions (id, user_id, token_jti, jti, ip_address, user_agent, created_at, expires_at, last_activity_at, last_active_at, is_revoked)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (id) DO NOTHING;
    `, [s.id, s.user_id, s.jti || s.token_jti || null, s.jti || s.token_jti || null, s.ip_address || '', s.user_agent || '', s.created_at, s.expires_at || null, s.last_active_at || s.last_activity_at || null, s.last_active_at || s.last_activity_at || null, !!s.is_revoked]);
  }

  // Audit Trail
  for (const a of data.audit_trail || []) {
    await pg.query(`
      INSERT INTO audit_trail (id, user_id, user_email, action, module, details, ip_address, timestamp)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (id) DO NOTHING;
    `, [a.id, a.user_id || null, a.user_email || null, a.action, a.module, a.details, a.ip_address || null, a.timestamp]);
  }

  // Suppliers
  for (const s of data.suppliers || []) {
    await pg.query(`
      INSERT INTO suppliers (id, code, name, category, tax_id, status, contact_first_name, contact_last_name, email, phone, alternate_phone, address_line1, address_line2, city, state, postal_code, country, website, notes, created_by, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
      ON CONFLICT (id) DO NOTHING;
    `, [
      s.id, s.code, s.name, s.category || '', s.tax_id || '', s.status,
      s.contact_first_name || '', s.contact_last_name || '', s.email || '',
      s.phone || '', s.alternate_phone || '', s.address_line1 || '',
      s.address_line2 || '', s.city || '', s.state || '', s.postal_code || '',
      s.country || 'India', s.website || '', s.notes || '', s.created_by || null,
      s.created_at, s.updated_at
    ]);
  }

  // Categories
  for (const c of data.inventory_categories || []) {
    await pg.query(`
      INSERT INTO inventory_categories (id, code, name, description, is_active, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (id) DO NOTHING;
    `, [c.id, c.code, c.name, c.description || '', c.is_active, c.created_at, c.updated_at]);
  }

  // Units of Measure
  for (const u of data.units_of_measure || []) {
    await pg.query(`
      INSERT INTO units_of_measure (id, code, name, symbol, is_active, created_at)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (id) DO NOTHING;
    `, [u.id, u.code, u.name, u.symbol, u.is_active, u.created_at]);
  }

  // Warehouses
  for (const w of data.warehouses || []) {
    await pg.query(`
      INSERT INTO warehouses (id, code, name, address, is_active, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (id) DO NOTHING;
    `, [w.id, w.code, w.name, w.address || '', w.is_active, w.created_at, w.updated_at]);
  }

  // Inventory Items
  for (const it of data.inventory_items || []) {
    await pg.query(`
      INSERT INTO inventory_items (id, code, name, description, category_id, uom_id, barcode, min_stock_level, reorder_quantity, cost_price, selling_price, status, created_by, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      ON CONFLICT (id) DO NOTHING;
    `, [
      it.id, it.code, it.name, it.description || '', it.category_id || null,
      it.uom_id || null, it.barcode || '', it.min_stock_level, it.reorder_quantity,
      it.cost_price, it.selling_price, it.status, it.created_by || null,
      it.created_at, it.updated_at
    ]);
  }

  // Stock Balances
  for (const sb of data.stock_balances || []) {
    await pg.query(`
      INSERT INTO stock_balances (id, item_id, warehouse_id, quantity, updated_at)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (item_id, warehouse_id) DO UPDATE SET quantity = EXCLUDED.quantity;
    `, [sb.id, sb.item_id, sb.warehouse_id, sb.quantity, sb.updated_at]);
  }

  // Stock Transactions
  for (const st of data.stock_transactions || []) {
    await pg.query(`
      INSERT INTO stock_transactions (id, transaction_type, reference_no, item_id, quantity, source_warehouse_id, destination_warehouse_id, supplier_id, unit_cost, reason, notes, transaction_date, user_id, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      ON CONFLICT (id) DO NOTHING;
    `, [
      st.id, st.transaction_type, st.reference_no, st.item_id, st.quantity,
      st.source_warehouse_id || null, st.destination_warehouse_id || null,
      st.supplier_id || null, st.unit_cost || null, st.reason || '',
      st.notes || '', st.transaction_date, st.user_id || null, st.created_at
    ]);
  }

  // Reorder Requests
  for (const ro of data.reorder_requests || []) {
    await pg.query(`
      INSERT INTO reorder_requests (id, reorder_no, item_id, supplier_id, quantity, unit_price, total_amount, expected_delivery_date, notes, status, supplier_token_hash, token_expires_at, responded_at, supplier_response_notes, counter_unit_price, counter_quantity, counter_delivery_date, rejection_reason, created_by, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
      ON CONFLICT (id) DO NOTHING;
    `, [
      ro.id, ro.reorder_no, ro.item_id, ro.supplier_id, ro.quantity, ro.unit_price,
      ro.total_amount, ro.expected_delivery_date || '', ro.notes || '', ro.status,
      ro.supplier_token_hash, ro.token_expires_at, ro.responded_at || null,
      ro.supplier_response_notes || null, ro.counter_unit_price || null,
      ro.counter_quantity || null, ro.counter_delivery_date || null,
      ro.rejection_reason || null, ro.created_by || null, ro.created_at, ro.updated_at
    ]);
  }

  // Reorder Negotiations
  for (const rn of data.reorder_negotiations || []) {
    await pg.query(`
      INSERT INTO reorder_negotiations (id, reorder_id, actor, action, unit_price, quantity, delivery_date, notes, timestamp)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (id) DO NOTHING;
    `, [rn.id, rn.reorder_id, rn.actor, rn.action, rn.unit_price || null, rn.quantity || null, rn.delivery_date || null, rn.notes || '', rn.timestamp]);
  }

  console.log('[PostgreSQL Migration] All existing application records migrated into PostgreSQL successfully!');
  await pg.close();
}

migrate()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
