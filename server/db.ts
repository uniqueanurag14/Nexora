import pg from 'pg';
import dotenv from 'dotenv';
import { runtimeConfig } from './config/runtimeConfig.ts';
dotenv.config();

let pool: pg.Pool | null = null;
let lastKnownPgConnected = false;
let lastConnectionWarnAt = 0;

export class DatabaseUnavailableError extends Error {
  public readonly code = 'DB_UNAVAILABLE';
  public readonly statusCode = 503;

  constructor(message: string) {
    super(message);
    this.name = 'DatabaseUnavailableError';
  }
}

export interface DbClientLike {
  query: <T = any>(sql: string, params?: any[]) => Promise<{ rows: T[] }>;
  release: () => void;
}

export interface DbPoolHandle {
  query: <T = any>(sql: string, params?: any[]) => Promise<{ rows: T[] }>;
  connect: () => Promise<DbClientLike>;
}

export function isDbReady(): boolean {
  return Boolean(runtimeConfig.databaseUrl && process.env.DISABLE_PG_FOR_TESTS !== 'true');
}

export function isDbConnected(): boolean {
  return isDbReady() && lastKnownPgConnected;
}

export async function getDb(options: { silent?: boolean } = {}): Promise<DbPoolHandle> {
  if (process.env.DISABLE_PG_FOR_TESTS === 'true') {
    const noopQuery = async <T = any>(): Promise<{ rows: T[] }> => ({ rows: [] });
    return {
      query: noopQuery,
      connect: async () => ({ query: noopQuery, release: () => {} }),
    };
  }

  if (!runtimeConfig.databaseUrl) {
    lastKnownPgConnected = false;
    throw new DatabaseUnavailableError(
      'PostgreSQL database is not configured. Configure DATABASE_URL in .env and run "npm run db:update".'
    );
  }

  const p = getPool();
  try {
    const client = await p.connect();
    client.release();
    lastKnownPgConnected = true;
    return p as unknown as DbPoolHandle;
  } catch (err: any) {
    lastKnownPgConnected = false;
    const now = Date.now();
    if (!options.silent && now - lastConnectionWarnAt > 60_000) {
      lastConnectionWarnAt = now;
      console.warn('[PostgreSQL Connection Warning]:', err?.message || err);
    }
    throw new DatabaseUnavailableError(
      'Unable to connect to the PostgreSQL database. Please verify database connectivity and run "npm run db:update" if schema updates are pending.'
    );
  }
}

export function getPool(): pg.Pool {
  if (!pool) {
    pool = new pg.Pool({
      connectionString: runtimeConfig.databaseUrl || process.env.DATABASE_URL || '',
      max: runtimeConfig.pgPoolMax,
      connectionTimeoutMillis: runtimeConfig.pgConnectionTimeoutMs,
      idleTimeoutMillis: runtimeConfig.pgIdleTimeoutMs,
      statement_timeout: runtimeConfig.pgStatementTimeoutMs,
      ssl: runtimeConfig.pgSsl,
    });

    pool.on('error', (err) => {
      lastKnownPgConnected = false;
      console.warn('[PostgreSQL Pool Warning]:', err.message);
    });
  }
  return pool;
}

export async function checkPostgresHealth(): Promise<{
  connected: boolean;
  latency_ms: number;
  pool_total: number;
  pool_idle: number;
  pool_waiting: number;
}> {
  const startedAt = Date.now();
  if (!runtimeConfig.databaseUrl || process.env.DISABLE_PG_FOR_TESTS === 'true') {
    lastKnownPgConnected = false;
    return { connected: false, latency_ms: 0, pool_total: 0, pool_idle: 0, pool_waiting: 0 };
  }
  try {
    const p = getPool();
    const client = await p.connect();
    try {
      await client.query('SELECT 1');
    } finally {
      client.release();
    }
    lastKnownPgConnected = true;
    return {
      connected: true,
      latency_ms: Date.now() - startedAt,
      pool_total: p.totalCount,
      pool_idle: p.idleCount,
      pool_waiting: p.waitingCount,
    };
  } catch {
    lastKnownPgConnected = false;
    return {
      connected: false,
      latency_ms: Date.now() - startedAt,
      pool_total: pool?.totalCount ?? 0,
      pool_idle: pool?.idleCount ?? 0,
      pool_waiting: pool?.waitingCount ?? 0,
    };
  }
}

export async function closeDbPool(): Promise<void> {
  if (pool) {
    const closing = pool;
    pool = null;
    try {
      await closing.end();
    } catch {
      // Ignore shutdown errors
    }
  }
}

export async function query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  const db = await getDb();
  try {
    const res = await db.query<T>(sql, params);
    return res.rows || [];
  } catch (error) {
    console.error('PostgreSQL execution error:', error, 'Query was:', sql);
    throw error;
  }
}

export async function queryOne<T = any>(sql: string, params: any[] = []): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] || null;
}

export async function initDatabaseSchema(p: pg.Pool): Promise<{ applied: number; total: number }> {
  const statements = [
    `CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      username VARCHAR(100) UNIQUE,
      first_name VARCHAR(100) NOT NULL DEFAULT '',
      last_name VARCHAR(100) NOT NULL DEFAULT '',
      phone VARCHAR(50),
      department VARCHAR(100),
      password_hash TEXT NOT NULL,
      role VARCHAR(50) NOT NULL DEFAULT 'viewer',
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      is_verified BOOLEAN NOT NULL DEFAULT TRUE,
      last_login_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name VARCHAR(100)`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name VARCHAR(100)`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS name VARCHAR(255)`,
    `ALTER TABLE users ALTER COLUMN name DROP NOT NULL`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS department VARCHAR(100)`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(50)`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(100)`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_picture TEXT`,
    `CREATE TABLE IF NOT EXISTS menu_items (
      id SERIAL PRIMARY KEY,
      code VARCHAR(50) UNIQUE NOT NULL,
      title VARCHAR(100) NOT NULL,
      path VARCHAR(255) NOT NULL,
      icon VARCHAR(50) NOT NULL,
      module_order INT NOT NULL DEFAULT 0,
      is_implemented BOOLEAN NOT NULL DEFAULT TRUE,
      parent_id INT REFERENCES menu_items(id)
    )`,
    `CREATE TABLE IF NOT EXISTS suppliers (
      id SERIAL PRIMARY KEY,
      code VARCHAR(50) UNIQUE NOT NULL,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL,
      phone VARCHAR(50),
      address TEXT,
      contact_person VARCHAR(255),
      payment_terms VARCHAR(100) DEFAULT 'Net 30',
      tax_id VARCHAR(100),
      status VARCHAR(50) DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS inventory_items (
      id SERIAL PRIMARY KEY,
      code VARCHAR(50) UNIQUE NOT NULL,
      name VARCHAR(255) NOT NULL,
      category VARCHAR(100) NOT NULL,
      unit VARCHAR(50) NOT NULL DEFAULT 'Units',
      unit_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
      cost_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
      min_stock_level NUMERIC(12, 2) NOT NULL DEFAULT 0,
      max_stock_level NUMERIC(12, 2) NOT NULL DEFAULT 0,
      preferred_supplier_id INT REFERENCES suppliers(id) ON DELETE SET NULL,
      description TEXT,
      status VARCHAR(50) DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS stock_balances (
      id SERIAL PRIMARY KEY,
      item_id INT NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
      location VARCHAR(100) NOT NULL DEFAULT 'Main Warehouse',
      quantity_on_hand NUMERIC(12, 2) NOT NULL DEFAULT 0,
      quantity_reserved NUMERIC(12, 2) NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_item_location UNIQUE (item_id, location)
    )`,
    `CREATE TABLE IF NOT EXISTS stock_transactions (
      id SERIAL PRIMARY KEY,
      reference_no VARCHAR(100) UNIQUE NOT NULL,
      item_id INT NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
      type VARCHAR(50) NOT NULL,
      quantity NUMERIC(12, 2) NOT NULL,
      unit_price NUMERIC(12, 2) DEFAULT 0,
      reference_type VARCHAR(50),
      reference_id VARCHAR(100),
      location_from VARCHAR(100),
      location_to VARCHAR(100),
      notes TEXT,
      created_by VARCHAR(255),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS reorder_requests (
      id SERIAL PRIMARY KEY,
      reference_no VARCHAR(100) UNIQUE NOT NULL,
      item_id INT NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
      supplier_id INT NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
      requested_quantity NUMERIC(12, 2) NOT NULL,
      agreed_quantity NUMERIC(12, 2),
      proposed_unit_price NUMERIC(12, 2) NOT NULL,
      final_unit_price NUMERIC(12, 2),
      status VARCHAR(50) NOT NULL DEFAULT 'pending',
      token_hash VARCHAR(64) UNIQUE NOT NULL,
      token_expiry TIMESTAMPTZ NOT NULL,
      delivery_date VARCHAR(50),
      notes TEXT,
      rejection_reason TEXT,
      email_sent_at TIMESTAMPTZ,
      email_status VARCHAR(50) DEFAULT 'pending',
      email_error TEXT,
      created_by VARCHAR(255),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS reorder_negotiations (
      id SERIAL PRIMARY KEY,
      reorder_id INT NOT NULL REFERENCES reorder_requests(id) ON DELETE CASCADE,
      sender_type VARCHAR(50) NOT NULL,
      proposed_quantity NUMERIC(12, 2) NOT NULL,
      proposed_unit_price NUMERIC(12, 2) NOT NULL,
      proposed_delivery_date VARCHAR(50),
      notes TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS invoices (
      id VARCHAR(100) PRIMARY KEY,
      invoice_number VARCHAR(100) UNIQUE NOT NULL,
      customer_name VARCHAR(255) NOT NULL,
      customer_email VARCHAR(255),
      customer_phone VARCHAR(50),
      customer_address TEXT,
      issue_date VARCHAR(50) NOT NULL,
      due_date VARCHAR(50) NOT NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'draft',
      subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0,
      tax_rate NUMERIC(5, 2) NOT NULL DEFAULT 0,
      tax_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
      discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
      total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
      amount_paid NUMERIC(12, 2) NOT NULL DEFAULT 0,
      balance_due NUMERIC(12, 2) NOT NULL DEFAULT 0,
      payment_terms VARCHAR(100) DEFAULT 'Net 30',
      notes TEXT,
      created_by VARCHAR(255),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS invoice_items (
      id SERIAL PRIMARY KEY,
      invoice_id VARCHAR(100) NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      item_id INT REFERENCES inventory_items(id) ON DELETE SET NULL,
      description TEXT NOT NULL,
      quantity NUMERIC(12, 2) NOT NULL,
      unit_price NUMERIC(12, 2) NOT NULL,
      tax_rate NUMERIC(5, 2) NOT NULL DEFAULT 0,
      total_price NUMERIC(12, 2) NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS payments (
      id SERIAL PRIMARY KEY,
      invoice_id VARCHAR(100) NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
      payment_number VARCHAR(100) UNIQUE NOT NULL,
      amount NUMERIC(12, 2) NOT NULL,
      payment_date VARCHAR(50) NOT NULL,
      payment_method VARCHAR(50) NOT NULL,
      reference_note TEXT,
      status VARCHAR(50) DEFAULT 'completed',
      created_by VARCHAR(255),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_invoice_id_fkey') THEN ALTER TABLE payments ADD CONSTRAINT payments_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE RESTRICT; END IF; END $$;`,
    `CREATE TABLE IF NOT EXISTS work_completion_events (
      id SERIAL PRIMARY KEY,
      employee_id INT NOT NULL,
      event_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      source VARCHAR(50) NOT NULL DEFAULT 'SIMULATED',
      device_id VARCHAR(100),
      idempotency_key VARCHAR(100) UNIQUE,
      recorded_by_user_id INT,
      notes TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_work_events_emp_time ON work_completion_events(employee_id, event_timestamp DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_work_events_time ON work_completion_events(event_timestamp DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_work_events_source ON work_completion_events(source)`,
    `CREATE INDEX IF NOT EXISTS idx_work_events_idempotency ON work_completion_events(idempotency_key)`,
    `CREATE TABLE IF NOT EXISTS performance_employees (
      id SERIAL PRIMARY KEY,
      emp_id VARCHAR(50) UNIQUE NOT NULL,
      first_name VARCHAR(100) NOT NULL,
      last_name VARCHAR(100) NOT NULL,
      password_hash VARCHAR(255) NULL,
      login_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      department VARCHAR(100),
      designation VARCHAR(100),
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by VARCHAR(255)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_perf_employees_emp_id ON performance_employees(emp_id)`,
    `CREATE INDEX IF NOT EXISTS idx_perf_employees_active ON performance_employees(is_active)`,
    `CREATE TABLE IF NOT EXISTS employee_performance_events (
      id SERIAL PRIMARY KEY,
      emp_id VARCHAR(50) NOT NULL,
      event_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      source VARCHAR(20) NOT NULL DEFAULT 'HARDWARE',
      device_id VARCHAR(100),
      idempotency_key VARCHAR(100) UNIQUE,
      recorded_by_user_id INT,
      notes TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_emp_perf_events_emp_time ON employee_performance_events(emp_id, event_timestamp DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_emp_perf_events_time ON employee_performance_events(event_timestamp DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_emp_perf_events_source ON employee_performance_events(source)`,
    `CREATE INDEX IF NOT EXISTS idx_emp_perf_events_idempotency ON employee_performance_events(idempotency_key)`,
    `CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash VARCHAR(64) UNIQUE NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token_hash ON password_reset_tokens(token_hash)`,
    `CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens(user_id)`,
    `CREATE TABLE IF NOT EXISTS departments (
      id SERIAL PRIMARY KEY,
      code VARCHAR(50) UNIQUE NOT NULL,
      name VARCHAR(150) UNIQUE NOT NULL,
      description TEXT,
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `ALTER TABLE departments ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active'`,
    `ALTER TABLE departments ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE`,
    `UPDATE departments SET is_active = (LOWER(COALESCE(status, 'active')) = 'active') WHERE is_active IS NULL`,
    `ALTER TABLE performance_employees ADD COLUMN IF NOT EXISTS hardware_id VARCHAR(100)`,
    `ALTER TABLE performance_employees ADD COLUMN IF NOT EXISTS employee_type VARCHAR(32) NOT NULL DEFAULT 'full_time'`,
    `ALTER TABLE performance_employees ADD COLUMN IF NOT EXISTS department_id INT`,
    `ALTER TABLE performance_employees ADD COLUMN IF NOT EXISTS role_id INT`,
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_performance_employees_active_hardware_id ON performance_employees (UPPER(TRIM(hardware_id))) WHERE is_active = TRUE AND hardware_id IS NOT NULL AND TRIM(hardware_id) <> ''`,
    `CREATE INDEX IF NOT EXISTS idx_departments_code ON departments(code)`,
    `CREATE INDEX IF NOT EXISTS idx_departments_status ON departments(status)`,
    `CREATE TABLE IF NOT EXISTS email_logs (
      id SERIAL PRIMARY KEY,
      to_email VARCHAR(255) NOT NULL,
      subject VARCHAR(255) NOT NULL,
      event_type VARCHAR(100) NOT NULL,
      status VARCHAR(50) NOT NULL,
      message_id VARCHAR(255),
      error_message TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_email_logs_to ON email_logs(to_email)`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS password_history JSONB DEFAULT '[]'::jsonb`,
    `ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS approval_status VARCHAR(50) DEFAULT 'approved'`,
    `ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS approval_notes TEXT`,
    `ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ`,
    `ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS approved_by VARCHAR(255)`,
    `ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS rejection_reason TEXT`,
    `CREATE TABLE IF NOT EXISTS supplier_approvals (
      id SERIAL PRIMARY KEY,
      supplier_id INT NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
      action VARCHAR(50) NOT NULL,
      actor_id INT REFERENCES users(id) ON DELETE SET NULL,
      actor_name VARCHAR(255) NOT NULL,
      actor_role VARCHAR(50) NOT NULL,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_supplier_approvals_supplier_id ON supplier_approvals(supplier_id)`,
    `CREATE TABLE IF NOT EXISTS purchase_requests (
      id SERIAL PRIMARY KEY,
      pr_number VARCHAR(100) UNIQUE NOT NULL,
      requester_id INT REFERENCES users(id) ON DELETE SET NULL,
      requester_name VARCHAR(255) NOT NULL,
      department VARCHAR(100),
      request_date VARCHAR(50) NOT NULL,
      required_date VARCHAR(50),
      preferred_supplier_id INT REFERENCES suppliers(id) ON DELETE SET NULL,
      preferred_supplier_name VARCHAR(255),
      status VARCHAR(50) NOT NULL DEFAULT 'draft',
      priority VARCHAR(50) NOT NULL DEFAULT 'medium',
      total_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
      notes TEXT,
      rejection_reason TEXT,
      attachment_name VARCHAR(255),
      created_by VARCHAR(255),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      submitted_at TIMESTAMPTZ,
      approved_at TIMESTAMPTZ,
      approved_by VARCHAR(255)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_purchase_requests_pr_number ON purchase_requests(pr_number)`,
    `CREATE INDEX IF NOT EXISTS idx_purchase_requests_status ON purchase_requests(status)`,
    `CREATE INDEX IF NOT EXISTS idx_purchase_requests_requester_id ON purchase_requests(requester_id)`,
    `CREATE TABLE IF NOT EXISTS purchase_request_items (
      id SERIAL PRIMARY KEY,
      pr_id INT NOT NULL REFERENCES purchase_requests(id) ON DELETE CASCADE,
      item_id INT REFERENCES inventory_items(id) ON DELETE SET NULL,
      item_code VARCHAR(100) NOT NULL,
      item_name VARCHAR(255) NOT NULL,
      uom VARCHAR(50),
      quantity NUMERIC(12, 2) NOT NULL,
      estimated_unit_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
      total_price NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
      specifications TEXT,
      preferred_supplier_id INT REFERENCES suppliers(id) ON DELETE SET NULL,
      preferred_supplier_name VARCHAR(255),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_purchase_request_items_pr_id ON purchase_request_items(pr_id)`,
    `CREATE TABLE IF NOT EXISTS purchase_request_approvals (
      id SERIAL PRIMARY KEY,
      pr_id INT NOT NULL REFERENCES purchase_requests(id) ON DELETE CASCADE,
      action VARCHAR(50) NOT NULL,
      actor_id INT REFERENCES users(id) ON DELETE SET NULL,
      actor_name VARCHAR(255) NOT NULL,
      actor_role VARCHAR(50) NOT NULL,
      comments TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_purchase_request_approvals_pr_id ON purchase_request_approvals(pr_id)`,
    // --- Enterprise Security, Login/Device Tracking, Sessions, Audit Logs & Backups ---
    `CREATE TABLE IF NOT EXISTS user_login_history (
      id BIGSERIAL PRIMARY KEY,
      user_id INT REFERENCES users(id) ON DELETE SET NULL,
      username VARCHAR(255),
      email VARCHAR(255),
      user_role VARCHAR(100),
      session_id VARCHAR(128),
      event_type VARCHAR(40) NOT NULL DEFAULT 'LOGIN',
      login_status VARCHAR(32) NOT NULL,
      failure_reason VARCHAR(255),
      ip_address VARCHAR(64) NOT NULL DEFAULT 'unknown',
      device_id VARCHAR(128),
      device_name VARCHAR(255),
      device_type VARCHAR(64),
      os_name VARCHAR(100),
      os_version VARCHAR(64),
      browser_name VARCHAR(100),
      browser_version VARCHAR(64),
      user_agent TEXT,
      client_source VARCHAR(32) NOT NULL DEFAULT 'browser_reported',
      verified_machine_name VARCHAR(255),
      is_new_device BOOLEAN NOT NULL DEFAULT FALSE,
      is_suspicious BOOLEAN NOT NULL DEFAULT FALSE,
      login_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      logout_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_ulh_user_id ON user_login_history(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_ulh_login_at ON user_login_history(login_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_ulh_ip ON user_login_history(ip_address)`,
    `CREATE TABLE IF NOT EXISTS user_device_history (
      id BIGSERIAL PRIMARY KEY,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      device_id VARCHAR(128) NOT NULL,
      device_name VARCHAR(255) NOT NULL,
      device_type VARCHAR(64) NOT NULL DEFAULT 'Desktop',
      os_name VARCHAR(100),
      os_version VARCHAR(64),
      browser_name VARCHAR(100),
      browser_version VARCHAR(64),
      user_agent TEXT,
      client_source VARCHAR(32) NOT NULL DEFAULT 'browser_reported',
      verified_machine_name VARCHAR(255),
      first_ip_address VARCHAR(64),
      last_ip_address VARCHAR(64),
      first_login_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_login_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      login_count INT NOT NULL DEFAULT 1,
      trust_status VARCHAR(32) NOT NULL DEFAULT 'trusted',
      blocked_at TIMESTAMPTZ,
      blocked_by INT REFERENCES users(id) ON DELETE SET NULL,
      block_reason VARCHAR(255),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, device_id)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_udh_user_id ON user_device_history(user_id)`,
    `CREATE TABLE IF NOT EXISTS user_sessions (
      id BIGSERIAL PRIMARY KEY,
      session_id VARCHAR(128) UNIQUE NOT NULL,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      username VARCHAR(255),
      user_email VARCHAR(255),
      user_role VARCHAR(100),
      access_jti VARCHAR(128) UNIQUE NOT NULL,
      refresh_token_hash VARCHAR(128),
      previous_refresh_hash VARCHAR(128),
      device_id VARCHAR(128),
      device_name VARCHAR(255),
      device_type VARCHAR(64),
      os_name VARCHAR(100),
      browser_name VARCHAR(100),
      ip_address VARCHAR(64) NOT NULL DEFAULT 'unknown',
      user_agent TEXT,
      client_source VARCHAR(32) NOT NULL DEFAULT 'browser_reported',
      status VARCHAR(32) NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL,
      refresh_expires_at TIMESTAMPTZ,
      revoked_at TIMESTAMPTZ,
      revoked_by INT REFERENCES users(id) ON DELETE SET NULL,
      revoke_reason VARCHAR(255)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_us_user_id ON user_sessions(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_us_access_jti ON user_sessions(access_jti)`,
    `CREATE TABLE IF NOT EXISTS user_activity_logs (
      id BIGSERIAL PRIMARY KEY,
      user_id INT REFERENCES users(id) ON DELETE SET NULL,
      username VARCHAR(255),
      user_email VARCHAR(255),
      user_role VARCHAR(100),
      module_name VARCHAR(100) NOT NULL,
      action_type VARCHAR(100) NOT NULL,
      entity_type VARCHAR(100),
      entity_id VARCHAR(128),
      http_method VARCHAR(16),
      api_endpoint VARCHAR(500),
      ip_address VARCHAR(64) NOT NULL DEFAULT 'unknown',
      device_id VARCHAR(128),
      device_name VARCHAR(255),
      browser_name VARCHAR(100),
      os_name VARCHAR(100),
      session_id VARCHAR(128),
      status VARCHAR(32) NOT NULL DEFAULT 'SUCCESS',
      response_status_code INT,
      description TEXT,
      before_values JSONB,
      after_values JSONB,
      metadata JSONB,
      prev_hash VARCHAR(128) NOT NULL,
      entry_hash VARCHAR(128) NOT NULL,
      hmac_signature VARCHAR(128) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_ual_user_id ON user_activity_logs(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_ual_module ON user_activity_logs(module_name)`,
    `CREATE INDEX IF NOT EXISTS idx_ual_created_at ON user_activity_logs(created_at DESC)`,
    `CREATE TABLE IF NOT EXISTS security_events (
      id BIGSERIAL PRIMARY KEY,
      event_code VARCHAR(100) NOT NULL,
      title VARCHAR(255) NOT NULL,
      severity VARCHAR(16) NOT NULL,
      user_id INT REFERENCES users(id) ON DELETE SET NULL,
      username VARCHAR(255),
      user_email VARCHAR(255),
      ip_address VARCHAR(64) NOT NULL DEFAULT 'unknown',
      device_id VARCHAR(128),
      device_name VARCHAR(255),
      endpoint VARCHAR(500),
      description TEXT NOT NULL,
      details JSONB,
      alert_email_sent BOOLEAN NOT NULL DEFAULT FALSE,
      alert_sent_at TIMESTAMPTZ,
      is_resolved BOOLEAN NOT NULL DEFAULT FALSE,
      resolved_at TIMESTAMPTZ,
      resolved_by INT REFERENCES users(id) ON DELETE SET NULL,
      resolution_notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_se_severity ON security_events(severity)`,
    `CREATE INDEX IF NOT EXISTS idx_se_created_at ON security_events(created_at DESC)`,
    `CREATE TABLE IF NOT EXISTS database_backup_history (
      id BIGSERIAL PRIMARY KEY,
      backup_uid VARCHAR(128) UNIQUE NOT NULL,
      file_name VARCHAR(255) NOT NULL,
      storage_path TEXT NOT NULL,
      offsite_path TEXT,
      trigger_type VARCHAR(32) NOT NULL DEFAULT 'manual',
      status VARCHAR(32) NOT NULL DEFAULT 'in_progress',
      pg_status VARCHAR(32) NOT NULL DEFAULT 'pending',
      pg_engine VARCHAR(64),
      json_store_status VARCHAR(32) NOT NULL DEFAULT 'pending',
      file_size_bytes BIGINT NOT NULL DEFAULT 0,
      checksum_sha256 VARCHAR(128),
      encrypted BOOLEAN NOT NULL DEFAULT TRUE,
      encryption_algorithm VARCHAR(64) NOT NULL DEFAULT 'aes-256-gcm',
      compression_algorithm VARCHAR(32) NOT NULL DEFAULT 'gzip',
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ,
      duration_ms INT,
      verified_at TIMESTAMPTZ,
      verified_by INT REFERENCES users(id) ON DELETE SET NULL,
      verification_status VARCHAR(32),
      retention_until TIMESTAMPTZ,
      initiated_by INT REFERENCES users(id) ON DELETE SET NULL,
      initiated_by_email VARCHAR(255),
      error_message TEXT,
      metadata JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_dbh_created_at ON database_backup_history(created_at DESC)`,
    `CREATE TABLE IF NOT EXISTS security_settings (
      setting_key VARCHAR(128) PRIMARY KEY,
      setting_value JSONB NOT NULL,
      description TEXT,
      updated_by INT REFERENCES users(id) ON DELETE SET NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN DEFAULT FALSE`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_secret_encrypted TEXT`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_recovery_codes JSONB DEFAULT '[]'::jsonb`,

    // --- PostgreSQL-Only Core ERP State & Master Tables (replaces file-based JSON storage) ---
    `CREATE TABLE IF NOT EXISTS nexora_app_state (
      state_key VARCHAR(64) PRIMARY KEY,
      state_data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS roles (
      id SERIAL PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      code VARCHAR(80) UNIQUE NOT NULL,
      description TEXT,
      is_system BOOLEAN NOT NULL DEFAULT FALSE,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS permissions (
      id SERIAL PRIMARY KEY,
      code VARCHAR(120) UNIQUE NOT NULL,
      name VARCHAR(180) NOT NULL,
      module VARCHAR(100) NOT NULL,
      description TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS role_permissions (
      role_id INT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
      permission_id INT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
      PRIMARY KEY (role_id, permission_id)
    )`,
    `CREATE TABLE IF NOT EXISTS system_settings (
      setting_key VARCHAR(128) PRIMARY KEY,
      setting_value TEXT NOT NULL DEFAULT '',
      category VARCHAR(64) NOT NULL DEFAULT 'general',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS audit_trail (
      id BIGSERIAL PRIMARY KEY,
      actor_user_id INT,
      actor_email VARCHAR(255),
      action VARCHAR(120) NOT NULL,
      module VARCHAR(120) NOT NULL,
      details TEXT,
      ip_address VARCHAR(64),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_audit_trail_created_at ON audit_trail(created_at DESC)`,
    `CREATE TABLE IF NOT EXISTS revoked_tokens (
      token_hash VARCHAR(128) PRIMARY KEY,
      expires_at TIMESTAMPTZ NOT NULL,
      revoked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS pending_email_changes (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL,
      old_email VARCHAR(255) NOT NULL,
      new_email VARCHAR(255) NOT NULL,
      token_hash VARCHAR(128) UNIQUE NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS inventory_categories (
      id SERIAL PRIMARY KEY,
      code VARCHAR(50) UNIQUE NOT NULL,
      name VARCHAR(150) UNIQUE NOT NULL,
      description TEXT,
      parent_id INT REFERENCES inventory_categories(id) ON DELETE SET NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS units_of_measure (
      id SERIAL PRIMARY KEY,
      code VARCHAR(32) UNIQUE NOT NULL,
      name VARCHAR(100) NOT NULL,
      abbreviation VARCHAR(32) NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS warehouses (
      id SERIAL PRIMARY KEY,
      code VARCHAR(50) UNIQUE NOT NULL,
      name VARCHAR(200) NOT NULL,
      address TEXT,
      contact_details TEXT,
      manager_name VARCHAR(150),
      manager_email VARCHAR(255),
      manager_phone VARCHAR(50),
      warehouse_type VARCHAR(80) NOT NULL DEFAULT 'Distribution Center',
      capacity NUMERIC(14, 2) NOT NULL DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS stock_transfers (
      id SERIAL PRIMARY KEY,
      transfer_number VARCHAR(100) UNIQUE NOT NULL,
      source_warehouse_id INT NOT NULL,
      destination_warehouse_id INT NOT NULL,
      status VARCHAR(40) NOT NULL DEFAULT 'pending',
      notes TEXT,
      items JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_by VARCHAR(255),
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS stock_verifications (
      id SERIAL PRIMARY KEY,
      verification_number VARCHAR(100) UNIQUE NOT NULL,
      warehouse_id INT NOT NULL,
      status VARCHAR(40) NOT NULL DEFAULT 'in_progress',
      notes TEXT,
      items JSONB NOT NULL DEFAULT '[]'::jsonb,
      verified_by VARCHAR(255),
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,

    // Inventory classification (Raw Material / Component / Finished Good / Consumable)
    `ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS item_type VARCHAR(32) NOT NULL DEFAULT 'raw_material'`,
    `CREATE INDEX IF NOT EXISTS idx_inventory_items_item_type ON inventory_items(item_type)`,

    // --- Module: Supplier Management Extensions (Contacts, Agreements, History) ---
    `CREATE TABLE IF NOT EXISTS supplier_contacts (
      id SERIAL PRIMARY KEY,
      supplier_id INT NOT NULL,
      full_name VARCHAR(200) NOT NULL,
      designation VARCHAR(120),
      department VARCHAR(120),
      email VARCHAR(255),
      phone VARCHAR(60),
      is_primary BOOLEAN NOT NULL DEFAULT FALSE,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_supplier_contacts_supplier_id ON supplier_contacts(supplier_id)`,
    `CREATE TABLE IF NOT EXISTS supplier_agreements (
      id SERIAL PRIMARY KEY,
      supplier_id INT NOT NULL,
      agreement_number VARCHAR(100) UNIQUE NOT NULL,
      title VARCHAR(255) NOT NULL,
      agreement_type VARCHAR(80) NOT NULL DEFAULT 'Supply Contract',
      start_date DATE NOT NULL,
      end_date DATE,
      payment_terms VARCHAR(120) DEFAULT 'Net 30',
      credit_limit NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
      currency VARCHAR(16) NOT NULL DEFAULT 'INR',
      status VARCHAR(40) NOT NULL DEFAULT 'active',
      terms_summary TEXT,
      created_by VARCHAR(255),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_supplier_agreements_supplier_id ON supplier_agreements(supplier_id)`,
    `CREATE TABLE IF NOT EXISTS supplier_history (
      id BIGSERIAL PRIMARY KEY,
      supplier_id INT NOT NULL,
      event_type VARCHAR(80) NOT NULL,
      reference_no VARCHAR(120),
      summary VARCHAR(255) NOT NULL,
      details TEXT,
      actor_name VARCHAR(255),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_supplier_history_supplier_id ON supplier_history(supplier_id, created_at DESC)`,

    // --- Module: Warehouse Management Locations (Zones, Aisles, Racks, Bins) ---
    `CREATE TABLE IF NOT EXISTS warehouse_locations (
      id SERIAL PRIMARY KEY,
      warehouse_id INT NOT NULL,
      location_code VARCHAR(80) UNIQUE NOT NULL,
      zone VARCHAR(60) NOT NULL DEFAULT 'General',
      aisle VARCHAR(40),
      rack VARCHAR(40),
      bin VARCHAR(40),
      location_type VARCHAR(60) NOT NULL DEFAULT 'Storage',
      capacity NUMERIC(14, 2) NOT NULL DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_warehouse_locations_wh ON warehouse_locations(warehouse_id)`,

    // --- Module: Purchase Management (Purchase Orders) ---
    `CREATE TABLE IF NOT EXISTS purchase_orders (
      id SERIAL PRIMARY KEY,
      po_number VARCHAR(100) UNIQUE NOT NULL,
      pr_id INT REFERENCES purchase_requests(id) ON DELETE SET NULL,
      supplier_id INT NOT NULL,
      supplier_name VARCHAR(255) NOT NULL,
      warehouse_id INT,
      warehouse_name VARCHAR(200),
      order_date DATE NOT NULL DEFAULT CURRENT_DATE,
      expected_delivery_date DATE,
      status VARCHAR(40) NOT NULL DEFAULT 'draft',
      payment_terms VARCHAR(120) DEFAULT 'Net 30',
      subtotal NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
      tax_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
      total_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
      notes TEXT,
      created_by VARCHAR(255),
      approved_by VARCHAR(255),
      approved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders(status)`,
    `CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier ON purchase_orders(supplier_id)`,
    `CREATE TABLE IF NOT EXISTS purchase_order_items (
      id SERIAL PRIMARY KEY,
      po_id INT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
      item_id INT,
      item_code VARCHAR(100) NOT NULL,
      item_name VARCHAR(255) NOT NULL,
      uom VARCHAR(50) NOT NULL DEFAULT 'Units',
      ordered_quantity NUMERIC(12, 2) NOT NULL,
      received_quantity NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
      unit_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
      tax_rate NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
      total_price NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_purchase_order_items_po_id ON purchase_order_items(po_id)`,

    // --- Module: Goods Receiving (GRN, Received Quantities & Quality Checks) ---
    `CREATE TABLE IF NOT EXISTS goods_receipt_notes (
      id SERIAL PRIMARY KEY,
      grn_number VARCHAR(100) UNIQUE NOT NULL,
      po_id INT REFERENCES purchase_orders(id) ON DELETE SET NULL,
      po_number VARCHAR(100),
      supplier_id INT NOT NULL,
      supplier_name VARCHAR(255) NOT NULL,
      warehouse_id INT,
      warehouse_name VARCHAR(200) NOT NULL DEFAULT 'Main Warehouse',
      receipt_date DATE NOT NULL DEFAULT CURRENT_DATE,
      delivery_challan_no VARCHAR(120),
      vehicle_no VARCHAR(60),
      status VARCHAR(40) NOT NULL DEFAULT 'pending_qc',
      qc_status VARCHAR(40) NOT NULL DEFAULT 'pending',
      received_by VARCHAR(255),
      notes TEXT,
      stock_posted BOOLEAN NOT NULL DEFAULT FALSE,
      stock_posted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_grn_status ON goods_receipt_notes(status)`,
    `CREATE INDEX IF NOT EXISTS idx_grn_po_id ON goods_receipt_notes(po_id)`,
    `CREATE TABLE IF NOT EXISTS grn_items (
      id SERIAL PRIMARY KEY,
      grn_id INT NOT NULL REFERENCES goods_receipt_notes(id) ON DELETE CASCADE,
      po_item_id INT REFERENCES purchase_order_items(id) ON DELETE SET NULL,
      item_id INT,
      item_code VARCHAR(100) NOT NULL,
      item_name VARCHAR(255) NOT NULL,
      uom VARCHAR(50) NOT NULL DEFAULT 'Units',
      expected_quantity NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
      received_quantity NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
      accepted_quantity NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
      rejected_quantity NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
      unit_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
      batch_number VARCHAR(100),
      location_code VARCHAR(80),
      qc_status VARCHAR(40) NOT NULL DEFAULT 'pending',
      remarks TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_grn_items_grn_id ON grn_items(grn_id)`,
    `CREATE TABLE IF NOT EXISTS grn_quality_checks (
      id SERIAL PRIMARY KEY,
      grn_id INT NOT NULL REFERENCES goods_receipt_notes(id) ON DELETE CASCADE,
      grn_item_id INT REFERENCES grn_items(id) ON DELETE CASCADE,
      inspector_name VARCHAR(200) NOT NULL,
      inspection_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      parameter_name VARCHAR(150) NOT NULL,
      expected_spec VARCHAR(255),
      observed_value VARCHAR(255),
      sample_size INT NOT NULL DEFAULT 1,
      passed_qty NUMERIC(12, 2) NOT NULL DEFAULT 0,
      failed_qty NUMERIC(12, 2) NOT NULL DEFAULT 0,
      result VARCHAR(32) NOT NULL DEFAULT 'pass',
      remarks TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_grn_qc_grn_id ON grn_quality_checks(grn_id)`,

    // --- Module: Product Management (Products, Components & BOM) ---
    `CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      product_code VARCHAR(80) UNIQUE NOT NULL,
      name VARCHAR(255) NOT NULL,
      category VARCHAR(120) NOT NULL DEFAULT 'General',
      sku VARCHAR(100) UNIQUE,
      uom VARCHAR(50) NOT NULL DEFAULT 'PCS',
      selling_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
      standard_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
      status VARCHAR(40) NOT NULL DEFAULT 'active',
      description TEXT,
      created_by VARCHAR(255),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_products_status ON products(status)`,
    `CREATE TABLE IF NOT EXISTS product_components (
      id SERIAL PRIMARY KEY,
      product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      inventory_item_id INT,
      component_code VARCHAR(80) NOT NULL,
      component_name VARCHAR(255) NOT NULL,
      component_type VARCHAR(50) NOT NULL DEFAULT 'raw_material',
      uom VARCHAR(50) NOT NULL DEFAULT 'PCS',
      quantity_per_unit NUMERIC(12, 4) NOT NULL DEFAULT 1,
      unit_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
      scrap_percent NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_product_components_product_id ON product_components(product_id)`,
    `CREATE TABLE IF NOT EXISTS bom_headers (
      id SERIAL PRIMARY KEY,
      bom_code VARCHAR(100) UNIQUE NOT NULL,
      product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      version VARCHAR(32) NOT NULL DEFAULT '1.0',
      status VARCHAR(40) NOT NULL DEFAULT 'active',
      effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
      batch_size NUMERIC(12, 2) NOT NULL DEFAULT 1,
      total_material_cost NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
      notes TEXT,
      created_by VARCHAR(255),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_bom_headers_product_id ON bom_headers(product_id)`,
    `CREATE TABLE IF NOT EXISTS bom_items (
      id SERIAL PRIMARY KEY,
      bom_id INT NOT NULL REFERENCES bom_headers(id) ON DELETE CASCADE,
      inventory_item_id INT,
      item_code VARCHAR(80) NOT NULL,
      item_name VARCHAR(255) NOT NULL,
      item_type VARCHAR(50) NOT NULL DEFAULT 'raw_material',
      quantity NUMERIC(12, 4) NOT NULL DEFAULT 1,
      uom VARCHAR(50) NOT NULL DEFAULT 'PCS',
      unit_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
      scrap_percent NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
      line_cost NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_bom_items_bom_id ON bom_items(bom_id)`,

    // --- Module: Production Management (Work Orders, Operations & Progress Logs) ---
    `CREATE TABLE IF NOT EXISTS work_orders (
      id SERIAL PRIMARY KEY,
      wo_number VARCHAR(100) UNIQUE NOT NULL,
      product_id INT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      product_code VARCHAR(80) NOT NULL,
      product_name VARCHAR(255) NOT NULL,
      bom_id INT REFERENCES bom_headers(id) ON DELETE SET NULL,
      warehouse_id INT,
      warehouse_name VARCHAR(200),
      planned_quantity NUMERIC(12, 2) NOT NULL,
      produced_quantity NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
      scrap_quantity NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
      unit_of_measure VARCHAR(50) NOT NULL DEFAULT 'PCS',
      priority VARCHAR(32) NOT NULL DEFAULT 'medium',
      status VARCHAR(40) NOT NULL DEFAULT 'planned',
      planned_start_date DATE,
      planned_end_date DATE,
      actual_start_at TIMESTAMPTZ,
      actual_end_at TIMESTAMPTZ,
      assigned_team VARCHAR(150),
      supervisor_name VARCHAR(150),
      notes TEXT,
      created_by VARCHAR(255),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_work_orders_status ON work_orders(status)`,
    `CREATE INDEX IF NOT EXISTS idx_work_orders_product_id ON work_orders(product_id)`,
    `CREATE TABLE IF NOT EXISTS work_order_operations (
      id SERIAL PRIMARY KEY,
      work_order_id INT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
      sequence_no INT NOT NULL DEFAULT 1,
      operation_name VARCHAR(200) NOT NULL,
      workstation VARCHAR(150),
      assigned_team VARCHAR(150),
      target_qty NUMERIC(12, 2) NOT NULL DEFAULT 0,
      completed_qty NUMERIC(12, 2) NOT NULL DEFAULT 0,
      status VARCHAR(40) NOT NULL DEFAULT 'pending',
      started_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_wo_operations_wo_id ON work_order_operations(work_order_id)`,
    `CREATE TABLE IF NOT EXISTS production_progress_logs (
      id BIGSERIAL PRIMARY KEY,
      work_order_id INT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
      operation_id INT REFERENCES work_order_operations(id) ON DELETE SET NULL,
      log_date DATE NOT NULL DEFAULT CURRENT_DATE,
      shift VARCHAR(40) DEFAULT 'Day',
      team_name VARCHAR(150),
      operator_name VARCHAR(150),
      quantity_produced NUMERIC(12, 2) NOT NULL DEFAULT 0,
      quantity_scrapped NUMERIC(12, 2) NOT NULL DEFAULT 0,
      downtime_minutes INT NOT NULL DEFAULT 0,
      status_after VARCHAR(40),
      remarks TEXT,
      recorded_by VARCHAR(255),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_prod_progress_wo_id ON production_progress_logs(work_order_id, created_at DESC)`,

    // --- Module: Product Readiness (Team-wise & Product-wise Completion Tracking) ---
    `CREATE TABLE IF NOT EXISTS production_teams (
      id SERIAL PRIMARY KEY,
      team_code VARCHAR(60) UNIQUE NOT NULL,
      team_name VARCHAR(150) UNIQUE NOT NULL,
      department VARCHAR(120),
      lead_name VARCHAR(150),
      member_count INT NOT NULL DEFAULT 1,
      status VARCHAR(32) NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS product_readiness_stages (
      id SERIAL PRIMARY KEY,
      stage_code VARCHAR(60) UNIQUE NOT NULL,
      stage_name VARCHAR(150) NOT NULL,
      sequence_order INT NOT NULL DEFAULT 1,
      default_team_id INT REFERENCES production_teams(id) ON DELETE SET NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS product_readiness_tracking (
      id SERIAL PRIMARY KEY,
      product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      work_order_id INT REFERENCES work_orders(id) ON DELETE SET NULL,
      team_id INT REFERENCES production_teams(id) ON DELETE SET NULL,
      team_name VARCHAR(150) NOT NULL,
      stage_name VARCHAR(150) NOT NULL,
      target_units NUMERIC(12, 2) NOT NULL DEFAULT 0,
      completed_units NUMERIC(12, 2) NOT NULL DEFAULT 0,
      readiness_percent NUMERIC(5, 2) NOT NULL DEFAULT 0,
      status VARCHAR(40) NOT NULL DEFAULT 'not_started',
      blocker_notes TEXT,
      updated_by VARCHAR(255),
      last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_prod_readiness_product ON product_readiness_tracking(product_id)`,
    `CREATE INDEX IF NOT EXISTS idx_prod_readiness_team ON product_readiness_tracking(team_id)`,
  ];

  let applied = 0;
  for (const sql of statements) {
    try {
      await p.query(sql);
      applied++;
    } catch {
      // Non-fatal DDL notice (e.g. column already exists or table has custom types)
    }
  }
  return { applied, total: statements.length };
}
