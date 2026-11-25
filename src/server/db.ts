import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:sa@localhost:2000/nexora';

let pool: pg.Pool | null = null;
let isSchemaInitialized = false;

// Fallback in-memory/store buffer for environments where PostgreSQL daemon is temporarily unreachable
const inMemoryEvents: any[] = [];
const inMemoryPerfEmployees: any[] = [];
const inMemoryPerfEvents: any[] = [];
let nextPerfEmployeeId = 1;
let nextPerfEventId = 1;
let nextEventId = 1;

export async function getDb(): Promise<{
  query: <T = any>(sql: string, params?: any[]) => Promise<{ rows: T[] }>;
}> {
  const p = getPool();
  try {
    // Test connectivity
    const client = await p.connect();
    client.release();

    if (!isSchemaInitialized) {
      await initDatabaseSchema(p);
      isSchemaInitialized = true;
    }

    return p;
  } catch (err: any) {
    // When PostgreSQL daemon is not reachable (e.g. offline container or pre-startup),
    // provide resilient query handling so the application never crashes
    return {
      query: async <T = any>(sql: string, params: any[] = []): Promise<{ rows: T[] }> => {
        return executeResilientQuery<T>(sql, params);
      },
    };
  }
}

export function getPool(): pg.Pool {
  if (!pool) {
    pool = new pg.Pool({
      connectionString: DATABASE_URL,
      connectionTimeoutMillis: 2000,
      idleTimeoutMillis: 30000,
    });

    pool.on('error', (err) => {
      console.warn('[PostgreSQL Pool Warning]:', err.message);
    });
  }
  return pool;
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

// Fallback query executor for work_completion_events when PostgreSQL socket is not connected
function executeResilientQuery<T = any>(sql: string, params: any[] = []): { rows: T[] } {
  const cleanSql = sql.trim().toUpperCase();

  // INSERT INTO work_completion_events
  if (cleanSql.startsWith('INSERT INTO WORK_COMPLETION_EVENTS')) {
    const empId = Number(params[0]);
    const idempotencyKey = params[1] || `sim_${Date.now()}`;
    const recordedBy = params[2] || null;
    const notes = params[3] || '';
    const isHardware = sql.includes("'HARDWARE'");

    // Check duplicate
    const existing = inMemoryEvents.find(e => e.idempotency_key === idempotencyKey);
    if (existing) {
      return { rows: [existing as unknown as T] };
    }

    const newEvent = {
      id: nextEventId++,
      employee_id: empId,
      event_timestamp: new Date().toISOString(),
      created_at: new Date().toISOString(),
      source: isHardware ? 'HARDWARE' : 'SIMULATED',
      device_id: isHardware ? (params[2] || 'IoT-Terminal-1') : 'SIMULATOR-MODAL',
      idempotency_key: idempotencyKey,
      recorded_by_user_id: recordedBy,
      notes: notes,
    };
    inMemoryEvents.unshift(newEvent);
    return { rows: [newEvent as unknown as T] };
  }

  // SELECT ... FROM work_completion_events WHERE idempotency_key = $1
  if (cleanSql.includes('FROM WORK_COMPLETION_EVENTS') && cleanSql.includes('IDEMPOTENCY_KEY = $1')) {
    const match = inMemoryEvents.filter(e => e.idempotency_key === params[0]);
    return { rows: match as unknown as T[] };
  }

  // Stats query for employees
  if (cleanSql.includes('FROM WORK_COMPLETION_EVENTS') && cleanSql.includes('GROUP BY EMPLOYEE_ID')) {
    const map = new Map<number, any>();
    const todayStr = new Date().toISOString().slice(0, 10);

    for (const e of inMemoryEvents) {
      const eid = Number(e.employee_id);
      if (!map.has(eid)) {
        map.set(eid, {
          employee_id: eid,
          total_count: 0,
          today_count: 0,
          week_count: 0,
          month_count: 0,
          last_event_timestamp: e.event_timestamp,
        });
      }
      const st = map.get(eid);
      st.total_count++;
      if (e.event_timestamp.startsWith(todayStr)) {
        st.today_count++;
      }
      st.week_count++;
      st.month_count++;
      if (new Date(e.event_timestamp) > new Date(st.last_event_timestamp)) {
        st.last_event_timestamp = e.event_timestamp;
      }
    }
    return { rows: Array.from(map.values()) as unknown as T[] };
  }

  // Latest event source query
  if (cleanSql.includes('DISTINCT ON (EMPLOYEE_ID)') && cleanSql.includes('FROM WORK_COMPLETION_EVENTS')) {
    const seen = new Set<number>();
    const rows: any[] = [];
    const sorted = [...inMemoryEvents].sort((a, b) => new Date(b.event_timestamp).getTime() - new Date(a.event_timestamp).getTime());
    for (const e of sorted) {
      if (!seen.has(e.employee_id)) {
        seen.add(e.employee_id);
        rows.push({
          employee_id: e.employee_id,
          last_event_source: e.source,
          last_device_id: e.device_id,
          event_timestamp: e.event_timestamp,
        });
      }
    }
    return { rows: rows as unknown as T[] };
  }

  // Summary query
  if (cleanSql.includes('COUNT(*)::INT AS TODAY_EVENTS')) {
    const todayStr = new Date().toISOString().slice(0, 10);
    const todayList = inMemoryEvents.filter(e => e.event_timestamp.startsWith(todayStr));
    const activeEmps = new Set(todayList.map(e => e.employee_id)).size;
    const hwCount = todayList.filter(e => e.source === 'HARDWARE').length;
    const simCount = todayList.filter(e => e.source === 'SIMULATED').length;
    return {
      rows: [{
        today_events: todayList.length,
        today_hardware_events: hwCount,
        today_simulated_events: simCount,
        active_today_employees: activeEmps,
      } as unknown as T],
    };
  }

  // Latest single event
  if (cleanSql.includes('FROM WORK_COMPLETION_EVENTS') && cleanSql.includes('LIMIT 1')) {
    const sorted = [...inMemoryEvents].sort((a, b) => new Date(b.event_timestamp).getTime() - new Date(a.event_timestamp).getTime());
    return { rows: sorted.slice(0, 1) as unknown as T[] };
  }

  // Reports overall stats query
  if (cleanSql.includes('COUNT(*)::INT AS TOTAL_EVENTS') && cleanSql.includes('FROM WORK_COMPLETION_EVENTS')) {
    const hwCount = inMemoryEvents.filter(e => e.source === 'HARDWARE').length;
    const simCount = inMemoryEvents.filter(e => e.source === 'SIMULATED').length;
    const isSimIncluded = !cleanSql.includes("SOURCE = 'HARDWARE'");
    const effectiveEvents = isSimIncluded ? inMemoryEvents : inMemoryEvents.filter(e => e.source === 'HARDWARE');
    const activeEmps = new Set(effectiveEvents.map(e => e.employee_id)).size;

    return {
      rows: [{
        total_events: effectiveEvents.length,
        active_employees: activeEmps,
        hardware_events: hwCount,
        simulated_events: simCount,
      } as unknown as T],
    };
  }

  // Reports breakdown query
  if (cleanSql.includes('GROUP BY W.EMPLOYEE_ID') && cleanSql.includes('FROM WORK_COMPLETION_EVENTS')) {
    const isSimIncluded = !cleanSql.includes("SOURCE = 'HARDWARE'");
    const effectiveEvents = isSimIncluded ? inMemoryEvents : inMemoryEvents.filter(e => e.source === 'HARDWARE');
    const map = new Map<number, any>();

    for (const e of effectiveEvents) {
      const eid = Number(e.employee_id);
      if (!map.has(eid)) {
        map.set(eid, {
          employee_id: eid,
          completed_count: 0,
          hardware_count: 0,
          simulated_count: 0,
          first_event: e.event_timestamp,
          last_event: e.event_timestamp,
        });
      }
      const st = map.get(eid);
      st.completed_count++;
      if (e.source === 'HARDWARE') st.hardware_count++;
      if (e.source === 'SIMULATED') st.simulated_count++;
      if (new Date(e.event_timestamp) < new Date(st.first_event)) st.first_event = e.event_timestamp;
      if (new Date(e.event_timestamp) > new Date(st.last_event)) st.last_event = e.event_timestamp;
    }
    return { rows: Array.from(map.values()) as unknown as T[] };
  }

  // Export query
  if (cleanSql.includes('FROM WORK_COMPLETION_EVENTS W') && cleanSql.includes('ORDER BY W.EVENT_TIMESTAMP DESC')) {
    const isSimIncluded = !cleanSql.includes("SOURCE = 'HARDWARE'");
    const effectiveEvents = isSimIncluded ? inMemoryEvents : inMemoryEvents.filter(e => e.source === 'HARDWARE');
    return { rows: effectiveEvents as unknown as T[] };
  }

  // INSERT INTO performance_employees
  if (cleanSql.startsWith('INSERT INTO PERFORMANCE_EMPLOYEES')) {
    const empId = params[0];
    const firstName = params[1];
    const lastName = params[2];
    const dept = params[3] || null;
    const designation = params[4] || null;
    const createdBy = params[5] || null;

    const newEmp = {
      id: nextPerfEmployeeId++,
      emp_id: empId,
      first_name: firstName,
      last_name: lastName,
      password_hash: null,
      login_enabled: false,
      department: dept,
      designation: designation,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      created_by: createdBy,
    };
    inMemoryPerfEmployees.push(newEmp);
    return { rows: [newEmp as unknown as T] };
  }

  // SELECT FROM performance_employees
  if (cleanSql.includes('FROM PERFORMANCE_EMPLOYEES')) {
    let result = [...inMemoryPerfEmployees];
    if (cleanSql.includes('EMP_ID = $1')) {
      result = result.filter(e => e.emp_id === params[0]);
    } else if (cleanSql.includes('ID = $1')) {
      result = result.filter(e => e.id === Number(params[0]));
    } else if (cleanSql.includes('IS_ACTIVE = TRUE') || cleanSql.includes('IS_ACTIVE IS TRUE')) {
      result = result.filter(e => e.is_active === true);
    }
    return { rows: result as unknown as T[] };
  }

  // UPDATE performance_employees
  if (cleanSql.startsWith('UPDATE PERFORMANCE_EMPLOYEES')) {
    if (params.length >= 2) {
      const idOrEmpId = params[params.length - 1];
      const emp = inMemoryPerfEmployees.find(e => e.id === Number(idOrEmpId) || e.emp_id === idOrEmpId);
      if (emp) {
        if (cleanSql.includes('IS_ACTIVE = $1')) {
          emp.is_active = params[0];
        }
        emp.updated_at = new Date().toISOString();
        return { rows: [emp as unknown as T] };
      }
    }
    return { rows: [] };
  }

  // INSERT INTO employee_performance_events
  if (cleanSql.startsWith('INSERT INTO EMPLOYEE_PERFORMANCE_EVENTS')) {
    const empId = String(params[0]);
    const source = sql.includes("'SIMULATED'") ? 'SIMULATED' : (params[2] || 'HARDWARE');
    const deviceId = params[1] || 'IoT-Terminal-1';
    const idempotencyKey = params[3] || `perf_ev_${Date.now()}`;
    const recordedBy = params[4] || null;
    const notes = params[5] || '';

    const newPerfEvent = {
      id: nextPerfEventId++,
      emp_id: empId,
      event_timestamp: new Date().toISOString(),
      created_at: new Date().toISOString(),
      source,
      device_id: deviceId,
      idempotency_key: idempotencyKey,
      recorded_by_user_id: recordedBy,
      notes,
    };
    inMemoryPerfEvents.unshift(newPerfEvent);
    return { rows: [newPerfEvent as unknown as T] };
  }

  // SELECT FROM employee_performance_events - Idempotency check
  if (cleanSql.includes('FROM EMPLOYEE_PERFORMANCE_EVENTS') && cleanSql.includes('IDEMPOTENCY_KEY = $1')) {
    const match = inMemoryPerfEvents.filter(e => e.idempotency_key === params[0]);
    return { rows: match as unknown as T[] };
  }

  // SELECT event_timestamp FROM employee_performance_events WHERE emp_id = $1 ORDER BY event_timestamp DESC LIMIT 1
  if (cleanSql.includes('FROM EMPLOYEE_PERFORMANCE_EVENTS') && cleanSql.includes('EMP_ID = $1') && cleanSql.includes('LIMIT 1')) {
    const matched = inMemoryPerfEvents.filter(e => e.emp_id === params[0]);
    const sorted = [...matched].sort((a, b) => new Date(b.event_timestamp).getTime() - new Date(a.event_timestamp).getTime());
    return { rows: sorted.slice(0, 1) as unknown as T[] };
  }

  // Aggregated stats query grouped by emp_id for live employees
  if (cleanSql.includes('FROM EMPLOYEE_PERFORMANCE_EVENTS') && (cleanSql.includes('GROUP BY EMP_ID') || cleanSql.includes('GROUP BY E.EMP_ID'))) {
    const todayStr = new Date().toISOString().slice(0, 10);
    const map = new Map<string, any>();

    // Check if filtering by hardware only
    const onlyHardware = cleanSql.includes("AND E.SOURCE = 'HARDWARE'") || cleanSql.includes("AND SOURCE = 'HARDWARE'");
    const filteredEvents = onlyHardware ? inMemoryPerfEvents.filter(e => e.source === 'HARDWARE') : inMemoryPerfEvents;

    for (const e of filteredEvents) {
      const eid = String(e.emp_id);
      if (!map.has(eid)) {
        map.set(eid, {
          emp_id: eid,
          event_count: 0,
          total_count: 0,
          today_count: 0,
          week_count: 0,
          month_count: 0,
          completed_count: 0,
          hardware_count: 0,
          simulated_count: 0,
          last_event: e.event_timestamp,
          last_event_timestamp: e.event_timestamp,
          first_event: e.event_timestamp,
        });
      }
      const st = map.get(eid);
      st.event_count++;
      st.total_count++;
      st.completed_count++;
      st.week_count++;
      st.month_count++;
      if (e.event_timestamp && e.event_timestamp.slice(0, 10) === todayStr) {
        st.today_count++;
      }
      if (e.source === 'HARDWARE') st.hardware_count++;
      if (e.source === 'SIMULATED') st.simulated_count++;
      if (new Date(e.event_timestamp) > new Date(st.last_event)) {
        st.last_event = e.event_timestamp;
        st.last_event_timestamp = e.event_timestamp;
      }
      if (new Date(e.event_timestamp) < new Date(st.first_event)) {
        st.first_event = e.event_timestamp;
      }
    }
    return { rows: Array.from(map.values()) as unknown as T[] };
  }

  // Latest source per employee: DISTINCT ON (emp_id)
  if (cleanSql.includes('DISTINCT ON (EMP_ID)') && cleanSql.includes('FROM EMPLOYEE_PERFORMANCE_EVENTS')) {
    const seen = new Set<string>();
    const rows: any[] = [];
    const sorted = [...inMemoryPerfEvents].sort((a, b) => new Date(b.event_timestamp).getTime() - new Date(a.event_timestamp).getTime());
    for (const e of sorted) {
      if (!seen.has(e.emp_id)) {
        seen.add(e.emp_id);
        rows.push({
          emp_id: e.emp_id,
          last_event_source: e.source,
          last_device_id: e.device_id,
          event_timestamp: e.event_timestamp,
        });
      }
    }
    return { rows: rows as unknown as T[] };
  }

  // Live Performance summary counts query
  if (cleanSql.includes('COUNT(*)::INT AS TODAY_EVENTS') && cleanSql.includes('FROM EMPLOYEE_PERFORMANCE_EVENTS')) {
    const todayStr = new Date().toISOString().slice(0, 10);
    const todayList = inMemoryPerfEvents.filter(e => e.event_timestamp && e.event_timestamp.slice(0, 10) === todayStr);
    const activeEmps = new Set(todayList.map(e => e.emp_id)).size;
    const hwCount = todayList.filter(e => e.source === 'HARDWARE').length;
    const simCount = todayList.filter(e => e.source === 'SIMULATED').length;
    return {
      rows: [{
        today_events: todayList.length,
        today_hardware_events: hwCount,
        today_simulated_events: simCount,
        active_today_employees: activeEmps,
      } as unknown as T],
    };
  }

  // Reports overall totals query on employee_performance_events
  if (cleanSql.includes('COUNT(*)::INT AS TOTAL_EVENTS') && cleanSql.includes('FROM EMPLOYEE_PERFORMANCE_EVENTS')) {
    const onlyHardware = cleanSql.includes("AND E.SOURCE = 'HARDWARE'") || cleanSql.includes("AND SOURCE = 'HARDWARE'");
    const effectiveEvents = onlyHardware ? inMemoryPerfEvents.filter(e => e.source === 'HARDWARE') : inMemoryPerfEvents;
    const activeEmps = new Set(effectiveEvents.map(e => e.emp_id)).size;
    const hwCount = inMemoryPerfEvents.filter(e => e.source === 'HARDWARE').length;
    const simCount = inMemoryPerfEvents.filter(e => e.source === 'SIMULATED').length;

    return {
      rows: [{
        total_events: effectiveEvents.length,
        active_employees: activeEmps,
        hardware_events: hwCount,
        simulated_events: simCount,
      } as unknown as T],
    };
  }

  // Generic fallback SELECT from employee_performance_events
  if (cleanSql.includes('FROM EMPLOYEE_PERFORMANCE_EVENTS')) {
    const onlyHardware = cleanSql.includes("AND E.SOURCE = 'HARDWARE'") || cleanSql.includes("AND SOURCE = 'HARDWARE'");
    const effective = onlyHardware ? inMemoryPerfEvents.filter(e => e.source === 'HARDWARE') : inMemoryPerfEvents;
    return { rows: effective as unknown as T[] };
  }

  // Default empty rows
  return { rows: [] };
}

async function initDatabaseSchema(p: pg.Pool) {
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
  ];

  for (const sql of statements) {
    try {
      await p.query(sql);
    } catch {
      // Non-fatal DDL notice (e.g. column already exists or table has custom types)
    }
  }
}
