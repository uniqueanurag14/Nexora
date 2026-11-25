/**
 * NEXORA ERP — Versioned PostgreSQL Schema Migrations
 *
 * Strict Rules:
 * - PostgreSQL ONLY.
 * - DDL-only & safe non-destructive backfills (NO seed data, NO dummy/sample records).
 * - Every migration is idempotent (compatible with existing `npm run db:init` installations).
 * - Never drops, truncates, or overwrites existing production tables or records.
 */

export interface MigrationDefinition {
  version: string;
  name: string;
  description: string;
  /**
   * Ordered list of idempotent SQL statements executed inside a single transaction.
   */
  statements: string[];
}

export const NEXORA_MIGRATIONS: MigrationDefinition[] = [
  {
    version: '001_core_erp_and_pg_only_state',
    name: 'Core ERP Schema & PostgreSQL-Only State Persistence',
    description:
      'Ensures PostgreSQL-only state persistence table, security/audit/backup base tables, and all 10 ERP module tables (Suppliers, Inventory, Purchasing, Warehouses, Goods Receiving, Stock, Products/BOM, Production, Product Readiness) exist without inserting any seed data.',
    statements: [
      `CREATE TABLE IF NOT EXISTS nexora_app_state (
        state_key VARCHAR(120) PRIMARY KEY,
        payload JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS nexora_security_state (
        state_key VARCHAR(120) PRIMARY KEY,
        payload JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role VARCHAR(50) NOT NULL DEFAULT 'user',
        first_name VARCHAR(100),
        last_name VARCHAR(100),
        full_name VARCHAR(255),
        department VARCHAR(100),
        designation VARCHAR(100),
        phone VARCHAR(50),
        employee_id VARCHAR(50) UNIQUE,
        is_active BOOLEAN DEFAULT TRUE,
        is_locked BOOLEAN DEFAULT FALSE,
        failed_login_attempts INT DEFAULT 0,
        last_login TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS departments (
        id SERIAL PRIMARY KEY,
        code VARCHAR(50) UNIQUE NOT NULL,
        name VARCHAR(150) UNIQUE NOT NULL,
        description TEXT DEFAULT '',
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS roles (
        id SERIAL PRIMARY KEY,
        code VARCHAR(80) UNIQUE NOT NULL,
        name VARCHAR(150) NOT NULL,
        description TEXT DEFAULT '',
        is_system BOOLEAN NOT NULL DEFAULT FALSE,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS permissions (
        code VARCHAR(120) PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        module VARCHAR(100) NOT NULL,
        category VARCHAR(40) NOT NULL DEFAULT 'action'
      )`,
      `CREATE TABLE IF NOT EXISTS role_permissions (
        role_code VARCHAR(80) NOT NULL,
        permission_code VARCHAR(120) NOT NULL,
        PRIMARY KEY (role_code, permission_code)
      )`,
      `CREATE TABLE IF NOT EXISTS system_settings (
        setting_key VARCHAR(120) PRIMARY KEY,
        category VARCHAR(80) NOT NULL,
        value_json JSONB NOT NULL,
        updated_by VARCHAR(255),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS performance_employees (
        id SERIAL PRIMARY KEY,
        emp_id VARCHAR(50) UNIQUE NOT NULL,
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100) NOT NULL,
        password_hash TEXT,
        login_enabled BOOLEAN DEFAULT FALSE,
        department VARCHAR(100),
        designation VARCHAR(100),
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_by VARCHAR(100)
      )`,
      `CREATE TABLE IF NOT EXISTS employee_performance_events (
        id SERIAL PRIMARY KEY,
        emp_id VARCHAR(50) NOT NULL,
        event_timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        source VARCHAR(20) NOT NULL DEFAULT 'HARDWARE',
        device_id VARCHAR(100),
        idempotency_key VARCHAR(150) UNIQUE,
        recorded_by_user_id INT,
        notes TEXT
      )`,
      `CREATE TABLE IF NOT EXISTS work_completion_events (
        id SERIAL PRIMARY KEY,
        employee_id INT NOT NULL,
        event_timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        source VARCHAR(20) NOT NULL DEFAULT 'HARDWARE',
        device_id VARCHAR(100),
        idempotency_key VARCHAR(150) UNIQUE,
        recorded_by_user_id INT,
        notes TEXT
      )`,
      `CREATE TABLE IF NOT EXISTS suppliers (
        id SERIAL PRIMARY KEY,
        supplier_code VARCHAR(50) UNIQUE NOT NULL,
        supplier_name VARCHAR(255) NOT NULL,
        contact_person VARCHAR(150),
        email VARCHAR(255),
        phone VARCHAR(50),
        alternate_phone VARCHAR(50),
        address TEXT,
        city VARCHAR(100),
        state VARCHAR(100),
        country VARCHAR(100) DEFAULT 'India',
        gst_number VARCHAR(50),
        payment_terms VARCHAR(100),
        status VARCHAR(30) NOT NULL DEFAULT 'Active',
        notes TEXT,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_by VARCHAR(100),
        updated_by VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS supplier_contacts (
        id SERIAL PRIMARY KEY,
        supplier_id INT NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
        contact_name VARCHAR(150) NOT NULL,
        designation VARCHAR(120),
        email VARCHAR(255),
        phone VARCHAR(50),
        is_primary BOOLEAN NOT NULL DEFAULT FALSE,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS supplier_agreements (
        id SERIAL PRIMARY KEY,
        supplier_id INT NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
        agreement_number VARCHAR(100) UNIQUE NOT NULL,
        title VARCHAR(255) NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE,
        payment_terms VARCHAR(120),
        credit_limit NUMERIC(14, 2) NOT NULL DEFAULT 0,
        status VARCHAR(40) NOT NULL DEFAULT 'Active',
        terms_summary TEXT,
        created_by VARCHAR(150),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS supplier_history (
        id SERIAL PRIMARY KEY,
        supplier_id INT NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
        event_type VARCHAR(60) NOT NULL,
        reference_code VARCHAR(100),
        summary TEXT NOT NULL,
        performed_by VARCHAR(150),
        event_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS warehouses (
        id SERIAL PRIMARY KEY,
        warehouse_code VARCHAR(50) UNIQUE NOT NULL,
        warehouse_name VARCHAR(200) NOT NULL,
        location VARCHAR(255),
        address TEXT,
        manager_name VARCHAR(150),
        contact_phone VARCHAR(50),
        is_default BOOLEAN NOT NULL DEFAULT FALSE,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_by VARCHAR(150),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS warehouse_locations (
        id SERIAL PRIMARY KEY,
        warehouse_id INT NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
        location_code VARCHAR(80) NOT NULL,
        zone VARCHAR(80),
        rack VARCHAR(80),
        bin VARCHAR(80),
        capacity NUMERIC(14, 3) NOT NULL DEFAULT 0,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (warehouse_id, location_code)
      )`,
      `CREATE TABLE IF NOT EXISTS inventory_items (
        id SERIAL PRIMARY KEY,
        item_code VARCHAR(50) UNIQUE NOT NULL,
        sku VARCHAR(100) UNIQUE,
        item_name VARCHAR(255) NOT NULL,
        item_type VARCHAR(40) NOT NULL DEFAULT 'raw_material',
        category_id INT,
        category_name VARCHAR(150),
        unit_id INT,
        unit_name VARCHAR(50) DEFAULT 'PCS',
        description TEXT,
        current_stock NUMERIC(14, 3) NOT NULL DEFAULT 0,
        reorder_level NUMERIC(14, 3) NOT NULL DEFAULT 10,
        min_stock_level NUMERIC(14, 3) NOT NULL DEFAULT 0,
        max_stock_level NUMERIC(14, 3) NOT NULL DEFAULT 1000,
        standard_cost NUMERIC(14, 2) NOT NULL DEFAULT 0,
        preferred_supplier_id INT,
        warehouse_id INT,
        location_bin VARCHAR(100),
        status VARCHAR(30) NOT NULL DEFAULT 'Active',
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_by VARCHAR(100),
        updated_by VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS item_type VARCHAR(40) NOT NULL DEFAULT 'raw_material'`,
      `CREATE TABLE IF NOT EXISTS stock_movements (
        id SERIAL PRIMARY KEY,
        item_id INT NOT NULL,
        warehouse_id INT,
        movement_type VARCHAR(30) NOT NULL,
        quantity NUMERIC(14, 3) NOT NULL,
        previous_stock NUMERIC(14, 3) NOT NULL DEFAULT 0,
        new_stock NUMERIC(14, 3) NOT NULL DEFAULT 0,
        unit_cost NUMERIC(14, 2) NOT NULL DEFAULT 0,
        reference_type VARCHAR(50),
        reference_number VARCHAR(100),
        supplier_id INT,
        notes TEXT,
        performed_by VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS purchase_requests (
        id SERIAL PRIMARY KEY,
        pr_number VARCHAR(60) UNIQUE NOT NULL,
        item_id INT NOT NULL,
        supplier_id INT,
        requested_qty NUMERIC(14, 3) NOT NULL,
        estimated_unit_price NUMERIC(14, 2) DEFAULT 0,
        expected_delivery_date DATE,
        status VARCHAR(40) NOT NULL DEFAULT 'Pending Approval',
        priority VARCHAR(20) NOT NULL DEFAULT 'Medium',
        requested_by VARCHAR(150),
        approved_by VARCHAR(150),
        approved_at TIMESTAMP,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS purchase_orders (
        id SERIAL PRIMARY KEY,
        po_number VARCHAR(60) UNIQUE NOT NULL,
        purchase_request_id INT REFERENCES purchase_requests(id) ON DELETE SET NULL,
        supplier_id INT NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
        warehouse_id INT REFERENCES warehouses(id) ON DELETE SET NULL,
        order_date DATE NOT NULL DEFAULT CURRENT_DATE,
        expected_delivery_date DATE,
        status VARCHAR(40) NOT NULL DEFAULT 'Draft',
        total_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
        currency VARCHAR(10) NOT NULL DEFAULT 'INR',
        payment_terms VARCHAR(120),
        notes TEXT,
        created_by VARCHAR(150),
        approved_by VARCHAR(150),
        approved_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS purchase_order_items (
        id SERIAL PRIMARY KEY,
        purchase_order_id INT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
        item_id INT NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
        ordered_qty NUMERIC(14, 3) NOT NULL,
        received_qty NUMERIC(14, 3) NOT NULL DEFAULT 0,
        unit_price NUMERIC(14, 2) NOT NULL DEFAULT 0,
        line_total NUMERIC(14, 2) NOT NULL DEFAULT 0,
        notes TEXT
      )`,
      `CREATE TABLE IF NOT EXISTS goods_receipt_notes (
        id SERIAL PRIMARY KEY,
        grn_number VARCHAR(60) UNIQUE NOT NULL,
        purchase_order_id INT REFERENCES purchase_orders(id) ON DELETE SET NULL,
        supplier_id INT NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
        warehouse_id INT REFERENCES warehouses(id) ON DELETE SET NULL,
        received_date DATE NOT NULL DEFAULT CURRENT_DATE,
        invoice_number VARCHAR(100),
        vehicle_number VARCHAR(60),
        status VARCHAR(40) NOT NULL DEFAULT 'Received',
        qc_status VARCHAR(40) NOT NULL DEFAULT 'Pending',
        received_by VARCHAR(150),
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS grn_items (
        id SERIAL PRIMARY KEY,
        grn_id INT NOT NULL REFERENCES goods_receipt_notes(id) ON DELETE CASCADE,
        po_item_id INT REFERENCES purchase_order_items(id) ON DELETE SET NULL,
        item_id INT NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
        expected_qty NUMERIC(14, 3) NOT NULL DEFAULT 0,
        received_qty NUMERIC(14, 3) NOT NULL,
        accepted_qty NUMERIC(14, 3) NOT NULL DEFAULT 0,
        rejected_qty NUMERIC(14, 3) NOT NULL DEFAULT 0,
        unit_cost NUMERIC(14, 2) NOT NULL DEFAULT 0,
        batch_number VARCHAR(80),
        notes TEXT
      )`,
      `CREATE TABLE IF NOT EXISTS grn_quality_checks (
        id SERIAL PRIMARY KEY,
        grn_id INT NOT NULL REFERENCES goods_receipt_notes(id) ON DELETE CASCADE,
        grn_item_id INT REFERENCES grn_items(id) ON DELETE CASCADE,
        inspector_name VARCHAR(150) NOT NULL,
        inspected_qty NUMERIC(14, 3) NOT NULL,
        passed_qty NUMERIC(14, 3) NOT NULL,
        failed_qty NUMERIC(14, 3) NOT NULL DEFAULT 0,
        result VARCHAR(30) NOT NULL DEFAULT 'Passed',
        defect_notes TEXT,
        checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        product_code VARCHAR(60) UNIQUE NOT NULL,
        sku VARCHAR(100) UNIQUE,
        product_name VARCHAR(255) NOT NULL,
        category VARCHAR(120),
        unit_name VARCHAR(40) NOT NULL DEFAULT 'PCS',
        standard_cost NUMERIC(14, 2) NOT NULL DEFAULT 0,
        selling_price NUMERIC(14, 2) NOT NULL DEFAULT 0,
        finished_goods_item_id INT REFERENCES inventory_items(id) ON DELETE SET NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'Active',
        description TEXT,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_by VARCHAR(150),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS product_components (
        id SERIAL PRIMARY KEY,
        component_code VARCHAR(60) UNIQUE NOT NULL,
        component_name VARCHAR(255) NOT NULL,
        inventory_item_id INT REFERENCES inventory_items(id) ON DELETE SET NULL,
        unit_name VARCHAR(40) NOT NULL DEFAULT 'PCS',
        unit_cost NUMERIC(14, 2) NOT NULL DEFAULT 0,
        specifications TEXT,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_by VARCHAR(150),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS bom_headers (
        id SERIAL PRIMARY KEY,
        bom_code VARCHAR(60) UNIQUE NOT NULL,
        product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        version VARCHAR(30) NOT NULL DEFAULT 'v1.0',
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        notes TEXT,
        created_by VARCHAR(150),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS bom_items (
        id SERIAL PRIMARY KEY,
        bom_id INT NOT NULL REFERENCES bom_headers(id) ON DELETE CASCADE,
        component_id INT REFERENCES product_components(id) ON DELETE SET NULL,
        inventory_item_id INT REFERENCES inventory_items(id) ON DELETE SET NULL,
        quantity_per_unit NUMERIC(14, 4) NOT NULL,
        unit_name VARCHAR(40) NOT NULL DEFAULT 'PCS',
        scrap_percent NUMERIC(6, 2) NOT NULL DEFAULT 0,
        notes TEXT
      )`,
      `CREATE TABLE IF NOT EXISTS work_orders (
        id SERIAL PRIMARY KEY,
        work_order_number VARCHAR(60) UNIQUE NOT NULL,
        product_id INT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
        bom_id INT REFERENCES bom_headers(id) ON DELETE SET NULL,
        warehouse_id INT REFERENCES warehouses(id) ON DELETE SET NULL,
        planned_qty NUMERIC(14, 3) NOT NULL,
        completed_qty NUMERIC(14, 3) NOT NULL DEFAULT 0,
        rejected_qty NUMERIC(14, 3) NOT NULL DEFAULT 0,
        priority VARCHAR(20) NOT NULL DEFAULT 'Medium',
        status VARCHAR(30) NOT NULL DEFAULT 'Planned',
        scheduled_start_date DATE,
        scheduled_end_date DATE,
        actual_start_at TIMESTAMPTZ,
        actual_end_at TIMESTAMPTZ,
        assigned_team VARCHAR(120),
        notes TEXT,
        created_by VARCHAR(150),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS production_progress_logs (
        id SERIAL PRIMARY KEY,
        work_order_id INT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
        stage_name VARCHAR(120) NOT NULL,
        team_name VARCHAR(120),
        produced_qty NUMERIC(14, 3) NOT NULL DEFAULT 0,
        rejected_qty NUMERIC(14, 3) NOT NULL DEFAULT 0,
        recorded_by VARCHAR(150),
        notes TEXT,
        logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS production_teams (
        id SERIAL PRIMARY KEY,
        team_code VARCHAR(50) UNIQUE NOT NULL,
        team_name VARCHAR(150) UNIQUE NOT NULL,
        department VARCHAR(120),
        lead_name VARCHAR(150),
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS product_readiness_tracking (
        id SERIAL PRIMARY KEY,
        work_order_id INT REFERENCES work_orders(id) ON DELETE CASCADE,
        product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        team_id INT NOT NULL REFERENCES production_teams(id) ON DELETE RESTRICT,
        stage_name VARCHAR(120) NOT NULL,
        target_qty NUMERIC(14, 3) NOT NULL DEFAULT 0,
        completed_qty NUMERIC(14, 3) NOT NULL DEFAULT 0,
        completion_percent NUMERIC(5, 2) NOT NULL DEFAULT 0,
        status VARCHAR(30) NOT NULL DEFAULT 'Not Started',
        updated_by VARCHAR(150),
        notes TEXT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS user_sessions (
        session_id VARCHAR(64) PRIMARY KEY,
        jti VARCHAR(64) UNIQUE NOT NULL,
        user_id INT NOT NULL,
        user_email VARCHAR(255) NOT NULL,
        user_role VARCHAR(50) NOT NULL,
        login_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_activity_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        logout_time TIMESTAMPTZ,
        status VARCHAR(30) NOT NULL DEFAULT 'active',
        ip_address VARCHAR(64),
        forwarded_for TEXT,
        user_agent TEXT,
        browser_name VARCHAR(80),
        browser_version VARCHAR(40),
        os_name VARCHAR(80),
        os_version VARCHAR(40),
        device_type VARCHAR(30),
        device_fingerprint VARCHAR(128),
        geo_location VARCHAR(120),
        is_suspicious BOOLEAN DEFAULT FALSE,
        suspicious_reason TEXT,
        revoked_by VARCHAR(255),
        revoked_reason TEXT
      )`,
      `CREATE TABLE IF NOT EXISTS user_login_history (
        id BIGSERIAL PRIMARY KEY,
        user_id INT,
        email_attempted VARCHAR(255) NOT NULL,
        role VARCHAR(50),
        outcome VARCHAR(30) NOT NULL,
        failure_reason TEXT,
        ip_address VARCHAR(64),
        user_agent TEXT,
        browser_name VARCHAR(80),
        os_name VARCHAR(80),
        device_type VARCHAR(30),
        device_fingerprint VARCHAR(128),
        geo_location VARCHAR(120),
        is_new_device BOOLEAN DEFAULT FALSE,
        is_suspicious BOOLEAN DEFAULT FALSE,
        risk_score INT DEFAULT 0,
        attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS user_activity_logs (
        id BIGSERIAL PRIMARY KEY,
        event_uid VARCHAR(64) UNIQUE NOT NULL,
        user_id INT,
        user_email VARCHAR(255),
        user_role VARCHAR(50),
        session_id VARCHAR(64),
        module VARCHAR(80) NOT NULL,
        action VARCHAR(80) NOT NULL,
        entity_type VARCHAR(80),
        entity_id VARCHAR(120),
        http_method VARCHAR(10),
        endpoint VARCHAR(255),
        status_code INT,
        ip_address VARCHAR(64),
        user_agent TEXT,
        device_fingerprint VARCHAR(128),
        old_values JSONB,
        new_values JSONB,
        summary TEXT,
        severity VARCHAR(20) NOT NULL DEFAULT 'info',
        previous_hash VARCHAR(64) NOT NULL,
        event_hash VARCHAR(64) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS security_alerts (
        id BIGSERIAL PRIMARY KEY,
        alert_uid VARCHAR(64) UNIQUE NOT NULL,
        alert_type VARCHAR(80) NOT NULL,
        severity VARCHAR(20) NOT NULL DEFAULT 'medium',
        title VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        user_id INT,
        user_email VARCHAR(255),
        ip_address VARCHAR(64),
        endpoint VARCHAR(255),
        metadata JSONB,
        status VARCHAR(30) NOT NULL DEFAULT 'open',
        resolved_by VARCHAR(255),
        resolved_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS database_backup_history (
        id BIGSERIAL PRIMARY KEY,
        backup_uid VARCHAR(64) UNIQUE NOT NULL,
        backup_type VARCHAR(30) NOT NULL DEFAULT 'manual',
        storage_path TEXT NOT NULL,
        file_name VARCHAR(255) NOT NULL,
        encrypted BOOLEAN NOT NULL DEFAULT TRUE,
        encryption_algo VARCHAR(40) NOT NULL DEFAULT 'aes-256-gcm',
        file_size_bytes BIGINT NOT NULL DEFAULT 0,
        checksum_sha256 VARCHAR(64) NOT NULL,
        pg_status VARCHAR(40) NOT NULL DEFAULT 'completed',
        json_store_status VARCHAR(40) NOT NULL DEFAULT 'removed',
        status VARCHAR(30) NOT NULL DEFAULT 'completed',
        verified BOOLEAN NOT NULL DEFAULT FALSE,
        verified_at TIMESTAMPTZ,
        initiated_by VARCHAR(255) NOT NULL DEFAULT 'system',
        notes TEXT,
        error_message TEXT,
        duration_ms INT DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
    ],
  },
  {
    version: '002_performance_employee_enhancements',
    name: 'Performance Employee Registration Enhancements',
    description:
      'Adds hardware_id, employee_type, department_id FK, and role_id FK to performance_employees with active hardware uniqueness, employee_type CHECK constraint, and safe non-destructive department_id backfill.',
    statements: [
      `ALTER TABLE performance_employees ADD COLUMN IF NOT EXISTS hardware_id VARCHAR(100)`,
      `ALTER TABLE performance_employees ADD COLUMN IF NOT EXISTS employee_type VARCHAR(32) NOT NULL DEFAULT 'full_time'`,
      `ALTER TABLE performance_employees ADD COLUMN IF NOT EXISTS department_id INT`,
      `ALTER TABLE performance_employees ADD COLUMN IF NOT EXISTS role_id INT`,
      // Enforce allowed employee_type values safely if constraint does not exist yet
      `DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'chk_performance_employees_employee_type'
            AND conrelid = 'performance_employees'::regclass
        ) THEN
          ALTER TABLE performance_employees
            ADD CONSTRAINT chk_performance_employees_employee_type
            CHECK (employee_type IN ('full_time', 'training', 'third_party'));
        END IF;
      END $$;`,
      // Foreign key to departments(id)
      `DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'fk_performance_employees_department_id'
            AND conrelid = 'performance_employees'::regclass
        ) THEN
          ALTER TABLE performance_employees
            ADD CONSTRAINT fk_performance_employees_department_id
            FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL;
        END IF;
      END $$;`,
      // Foreign key to roles(id)
      `DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'fk_performance_employees_role_id'
            AND conrelid = 'performance_employees'::regclass
        ) THEN
          ALTER TABLE performance_employees
            ADD CONSTRAINT fk_performance_employees_role_id
            FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE SET NULL;
        END IF;
      END $$;`,
      // Prevent assigning the same hardware device ID to multiple active employees
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_performance_employees_active_hardware_id
        ON performance_employees (UPPER(TRIM(hardware_id)))
        WHERE is_active = TRUE AND hardware_id IS NOT NULL AND TRIM(hardware_id) <> ''`,
      `CREATE INDEX IF NOT EXISTS idx_performance_employees_department_id
        ON performance_employees (department_id)`,
      `CREATE INDEX IF NOT EXISTS idx_performance_employees_role_id
        ON performance_employees (role_id)`,
      `CREATE INDEX IF NOT EXISTS idx_performance_employees_employee_type
        ON performance_employees (employee_type)`,
      // Safe non-destructive backfill for existing employees whose department text matches an existing department
      `UPDATE performance_employees pe
       SET department_id = d.id
       FROM departments d
       WHERE pe.department_id IS NULL
         AND pe.department IS NOT NULL
         AND LOWER(TRIM(pe.department)) = LOWER(TRIM(d.name))`,
      // Safe non-destructive backfill for existing employees whose designation text matches an existing role
      `UPDATE performance_employees pe
       SET role_id = r.id
       FROM roles r
       WHERE pe.role_id IS NULL
         AND pe.designation IS NOT NULL
         AND (LOWER(TRIM(pe.designation)) = LOWER(TRIM(r.name)) OR LOWER(TRIM(pe.designation)) = LOWER(TRIM(r.code)))`,
    ],
  },
  {
    version: '003_backup_scheduler_and_restore_management',
    name: 'PostgreSQL Backup Multi-Scheduler & Back Office Restore Management',
    description:
      'Creates backup_schedulers, backup_execution_history, backup_scheduler_audit_history, and database_restore_history tables with integrity constraints and indexes.',
    statements: [
      `CREATE TABLE IF NOT EXISTS backup_schedulers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(160) NOT NULL,
        description TEXT DEFAULT '',
        frequency VARCHAR(20) NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly')),
        selected_days INT[] DEFAULT NULL,
        monthly_day INT DEFAULT NULL CHECK (monthly_day IS NULL OR (monthly_day >= 1 AND monthly_day <= 31)),
        scheduled_time VARCHAR(8) NOT NULL DEFAULT '02:00',
        timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Kolkata',
        backup_type VARCHAR(20) NOT NULL DEFAULT 'full' CHECK (backup_type IN ('full')),
        destination_ref VARCHAR(255) NOT NULL DEFAULT 'local_encrypted_vault',
        retention_days INT NOT NULL DEFAULT 30 CHECK (retention_days >= 1 AND retention_days <= 3650),
        is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
        next_run_at TIMESTAMPTZ,
        last_run_at TIMESTAMPTZ,
        last_status VARCHAR(30) NOT NULL DEFAULT 'never_run',
        last_error TEXT,
        created_by INT,
        created_by_email VARCHAR(255),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_by INT,
        updated_by_email VARCHAR(255),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ DEFAULT NULL
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_backup_schedulers_active_name
        ON backup_schedulers (LOWER(TRIM(name)))
        WHERE deleted_at IS NULL`,
      `CREATE INDEX IF NOT EXISTS idx_backup_schedulers_due
        ON backup_schedulers (is_enabled, next_run_at)
        WHERE deleted_at IS NULL`,
      `CREATE TABLE IF NOT EXISTS backup_execution_history (
        id BIGSERIAL PRIMARY KEY,
        backup_uid VARCHAR(64) UNIQUE NOT NULL,
        scheduler_id INT REFERENCES backup_schedulers(id) ON DELETE SET NULL,
        scheduler_name VARCHAR(160),
        execution_type VARCHAR(30) NOT NULL CHECK (execution_type IN ('automatic', 'manual', 'pre_restore', 'cli')),
        started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        completed_at TIMESTAMPTZ,
        duration_ms INT NOT NULL DEFAULT 0,
        destination_ref VARCHAR(255) NOT NULL DEFAULT 'local_encrypted_vault',
        archive_identifier VARCHAR(255) NOT NULL,
        file_name VARCHAR(255) NOT NULL,
        storage_path TEXT NOT NULL,
        file_size_bytes BIGINT NOT NULL DEFAULT 0,
        pg_version VARCHAR(120),
        database_name VARCHAR(120),
        checksum_sha256 VARCHAR(64) NOT NULL,
        verification_status VARCHAR(30) NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending', 'verified', 'failed', 'missing', 'corrupted')),
        execution_status VARCHAR(30) NOT NULL DEFAULT 'running' CHECK (execution_status IN ('running', 'completed', 'failed', 'skipped')),
        initiated_by INT,
        initiated_by_email VARCHAR(255) NOT NULL DEFAULT 'system',
        is_protected_recovery BOOLEAN NOT NULL DEFAULT FALSE,
        error_details TEXT,
        notes TEXT,
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      `CREATE INDEX IF NOT EXISTS idx_backup_execution_history_scheduler
        ON backup_execution_history (scheduler_id, started_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_backup_execution_history_status
        ON backup_execution_history (execution_status, verification_status, started_at DESC)`,
      `CREATE TABLE IF NOT EXISTS backup_scheduler_audit_history (
        id BIGSERIAL PRIMARY KEY,
        scheduler_id INT REFERENCES backup_schedulers(id) ON DELETE SET NULL,
        scheduler_name VARCHAR(160) NOT NULL,
        action VARCHAR(30) NOT NULL CHECK (action IN ('CREATED', 'UPDATED', 'ENABLED', 'DISABLED', 'DELETED', 'TRIGGERED_NOW')),
        previous_config JSONB,
        new_config JSONB,
        performed_by INT,
        performed_by_email VARCHAR(255) NOT NULL,
        performed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      `CREATE INDEX IF NOT EXISTS idx_backup_scheduler_audit_scheduler
        ON backup_scheduler_audit_history (scheduler_id, performed_at DESC)`,
      `CREATE TABLE IF NOT EXISTS database_restore_history (
        id BIGSERIAL PRIMARY KEY,
        restore_uid VARCHAR(64) UNIQUE NOT NULL,
        backup_uid VARCHAR(64) NOT NULL,
        backup_created_at TIMESTAMPTZ,
        restore_mode VARCHAR(20) NOT NULL CHECK (restore_mode IN ('isolated', 'production')),
        target_database_name VARCHAR(120) NOT NULL,
        initiated_by INT,
        initiated_by_email VARCHAR(255) NOT NULL,
        started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        completed_at TIMESTAMPTZ,
        duration_ms INT NOT NULL DEFAULT 0,
        pre_restore_backup_uid VARCHAR(64),
        verification_status VARCHAR(30) NOT NULL DEFAULT 'pending',
        restore_status VARCHAR(40) NOT NULL DEFAULT 'pending' CHECK (
          restore_status IN (
            'pending',
            'validating',
            'creating_recovery_backup',
            'preparing_database',
            'maintenance_mode',
            'restoring',
            'verifying',
            'completed',
            'failed',
            'recovery_required'
          )
        ),
        error_details TEXT,
        recovery_action_status VARCHAR(60),
        metadata JSONB DEFAULT '{}'::jsonb
      )`,
      `CREATE INDEX IF NOT EXISTS idx_database_restore_history_started
        ON database_restore_history (started_at DESC)`,
    ],
  },
  {
    version: '004_operation_performance_and_production_readiness',
    name: 'Operation-Based Employee Performance, Quality, WIP Readiness, Forecasting & Rewards Engine',
    description:
      'Adds normalised PostgreSQL tables for Operation Master, effective-dated standard time history, Product Operation Structure, Shifts, Employee Operation Assignments, Hardware Production Events & Exception Queue, Task Time Sessions, Quality/Rework Inspections, WIP Quantity Transactions, Production Assembly Records, Authorised Downtime, Performance Scoring Policies, Employee Rewards, and Manufacturing Audit Logs. Zero seed or dummy data.',
    statements: [
      // Ensure products and work_orders compatibility columns exist safely across legacy and migrated schemas
      `ALTER TABLE products ADD COLUMN IF NOT EXISTS name VARCHAR(255)`,
      `ALTER TABLE products ADD COLUMN IF NOT EXISTS product_name VARCHAR(255)`,
      `ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS wo_number VARCHAR(100)`,
      `ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS work_order_number VARCHAR(100)`,
      `ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS planned_quantity NUMERIC(14, 3)`,
      `ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS planned_qty NUMERIC(14, 3)`,

      // 1. Operation Master
      `CREATE TABLE IF NOT EXISTS manufacturing_operations (
        id SERIAL PRIMARY KEY,
        operation_code VARCHAR(50) UNIQUE NOT NULL,
        name VARCHAR(180) NOT NULL,
        department_id INT REFERENCES departments(id) ON DELETE SET NULL,
        department_name VARCHAR(150),
        description TEXT DEFAULT '',
        uom VARCHAR(40) NOT NULL DEFAULT 'Piece',
        standard_time_minutes NUMERIC(10, 4) NOT NULL CHECK (standard_time_minutes > 0),
        time_unit VARCHAR(20) NOT NULL DEFAULT 'Minutes' CHECK (time_unit IN ('Minutes')),
        quality_requirements TEXT DEFAULT '',
        is_assembly_operation BOOLEAN NOT NULL DEFAULT FALSE,
        status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
        created_by VARCHAR(255),
        updated_by VARCHAR(255),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_manufacturing_operations_name_dept
        ON manufacturing_operations (LOWER(TRIM(name)), COALESCE(department_id, 0))`,
      `CREATE INDEX IF NOT EXISTS idx_manufacturing_operations_status
        ON manufacturing_operations (status, department_id)`,

      // 2. Effective-dated Standard Time Version History (preserves historical performance accuracy)
      `CREATE TABLE IF NOT EXISTS operation_standard_history (
        id BIGSERIAL PRIMARY KEY,
        operation_id INT NOT NULL REFERENCES manufacturing_operations(id) ON DELETE CASCADE,
        product_id INT REFERENCES products(id) ON DELETE CASCADE,
        version_number INT NOT NULL DEFAULT 1,
        standard_time_minutes NUMERIC(10, 4) NOT NULL CHECK (standard_time_minutes > 0),
        uom VARCHAR(40) NOT NULL DEFAULT 'Piece',
        effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        effective_to TIMESTAMPTZ DEFAULT NULL,
        changed_by VARCHAR(255) NOT NULL,
        change_reason TEXT DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      `CREATE INDEX IF NOT EXISTS idx_op_std_history_lookup
        ON operation_standard_history (operation_id, COALESCE(product_id, 0), effective_from DESC)`,

      // 3. Product Operation Structure (configurable components & operations per finished toy model)
      `CREATE TABLE IF NOT EXISTS product_operation_structures (
        id SERIAL PRIMARY KEY,
        product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        operation_id INT NOT NULL REFERENCES manufacturing_operations(id) ON DELETE RESTRICT,
        component_name VARCHAR(180) NOT NULL,
        required_qty_per_unit NUMERIC(12, 4) NOT NULL CHECK (required_qty_per_unit > 0),
        standard_time_override_minutes NUMERIC(10, 4) CHECK (standard_time_override_minutes IS NULL OR standard_time_override_minutes > 0),
        sequence_order INT NOT NULL DEFAULT 1 CHECK (sequence_order >= 1),
        is_mandatory BOOLEAN NOT NULL DEFAULT TRUE,
        is_assembly_stage BOOLEAN NOT NULL DEFAULT FALSE,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        notes TEXT DEFAULT '',
        created_by VARCHAR(255),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (product_id, operation_id)
      )`,
      `CREATE INDEX IF NOT EXISTS idx_prod_op_struct_product
        ON product_operation_structures (product_id, is_active, sequence_order)`,

      // 4. Configurable Shifts (never assume hardcoded 480 minutes)
      `CREATE TABLE IF NOT EXISTS manufacturing_shifts (
        id SERIAL PRIMARY KEY,
        shift_code VARCHAR(50) UNIQUE NOT NULL,
        name VARCHAR(120) UNIQUE NOT NULL,
        start_time VARCHAR(8) NOT NULL,
        end_time VARCHAR(8) NOT NULL,
        gross_minutes INT NOT NULL CHECK (gross_minutes > 0 AND gross_minutes <= 1440),
        break_minutes INT NOT NULL DEFAULT 0 CHECK (break_minutes >= 0 AND break_minutes < gross_minutes),
        available_productive_minutes INT NOT NULL CHECK (available_productive_minutes > 0),
        working_days INT[] NOT NULL DEFAULT ARRAY[1,2,3,4,5,6],
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_by VARCHAR(255),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,

      // 5. Employee Operation Assignments (supports mid-shift transfers, multi-product & full history)
      `CREATE TABLE IF NOT EXISTS employee_operation_assignments (
        id BIGSERIAL PRIMARY KEY,
        assignment_code VARCHAR(60) UNIQUE NOT NULL,
        employee_id INT NOT NULL REFERENCES performance_employees(id) ON DELETE RESTRICT,
        emp_id VARCHAR(50) NOT NULL,
        department_id INT REFERENCES departments(id) ON DELETE SET NULL,
        product_id INT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
        operation_id INT NOT NULL REFERENCES manufacturing_operations(id) ON DELETE RESTRICT,
        hardware_id VARCHAR(100) NOT NULL,
        production_order_id INT REFERENCES work_orders(id) ON DELETE SET NULL,
        workstation VARCHAR(120) DEFAULT '',
        shift_id INT REFERENCES manufacturing_shifts(id) ON DELETE SET NULL,
        shift_name VARCHAR(120) DEFAULT '',
        supervisor_name VARCHAR(150) DEFAULT '',
        start_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        end_at TIMESTAMPTZ DEFAULT NULL,
        daily_target NUMERIC(12, 2) CHECK (daily_target IS NULL OR daily_target >= 0),
        status VARCHAR(30) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'transferred', 'completed', 'inactive')),
        notes TEXT DEFAULT '',
        assigned_by VARCHAR(255),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      `CREATE INDEX IF NOT EXISTS idx_emp_op_assign_emp_time
        ON employee_operation_assignments (employee_id, status, start_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_emp_op_assign_hw
        ON employee_operation_assignments (UPPER(TRIM(hardware_id)), status, start_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_emp_op_assign_order
        ON employee_operation_assignments (production_order_id, operation_id, status)`,

      // 6. Hardware Button Production Events & Supervisor Exception Queue
      `CREATE TABLE IF NOT EXISTS hardware_production_events (
        id BIGSERIAL PRIMARY KEY,
        event_uid VARCHAR(120) UNIQUE NOT NULL,
        idempotency_key VARCHAR(150) UNIQUE,
        hardware_id VARCHAR(100) NOT NULL,
        employee_id INT REFERENCES performance_employees(id) ON DELETE SET NULL,
        emp_id VARCHAR(50),
        department_id INT REFERENCES departments(id) ON DELETE SET NULL,
        product_id INT REFERENCES products(id) ON DELETE SET NULL,
        operation_id INT REFERENCES manufacturing_operations(id) ON DELETE SET NULL,
        production_order_id INT REFERENCES work_orders(id) ON DELETE SET NULL,
        assignment_id BIGINT REFERENCES employee_operation_assignments(id) ON DELETE SET NULL,
        workstation VARCHAR(120),
        shift_id INT REFERENCES manufacturing_shifts(id) ON DELETE SET NULL,
        quantity NUMERIC(12, 4) NOT NULL DEFAULT 1 CHECK (quantity > 0),
        standard_time_snapshot_minutes NUMERIC(10, 4),
        event_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        processing_status VARCHAR(40) NOT NULL DEFAULT 'accepted' CHECK (
          processing_status IN (
            'accepted',
            'duplicate_idempotent',
            'duplicate_debounce',
            'exception_unassigned',
            'exception_ambiguous',
            'invalid_hardware',
            'rejected_inactive',
            'resolved_accepted',
            'resolved_discarded'
          )
        ),
        duplicate_status VARCHAR(30) NOT NULL DEFAULT 'unique' CHECK (
          duplicate_status IN ('unique', 'idempotent_duplicate', 'debounce_duplicate')
        ),
        source VARCHAR(30) NOT NULL DEFAULT 'HARDWARE',
        exception_reason TEXT,
        resolved_by VARCHAR(255),
        resolved_at TIMESTAMPTZ,
        resolution_notes TEXT,
        raw_payload JSONB DEFAULT '{}'::jsonb
      )`,
      `CREATE INDEX IF NOT EXISTS idx_hw_prod_events_emp_time
        ON hardware_production_events (employee_id, event_timestamp DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_hw_prod_events_hw_time
        ON hardware_production_events (UPPER(TRIM(hardware_id)), event_timestamp DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_hw_prod_events_status
        ON hardware_production_events (processing_status, event_timestamp DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_hw_prod_events_order_op
        ON hardware_production_events (production_order_id, operation_id, processing_status)`,

      // 7. Optional Start/Pause/Resume/Complete Task Timing Workflow (non-mandatory for 1-button mode)
      `CREATE TABLE IF NOT EXISTS task_time_sessions (
        id BIGSERIAL PRIMARY KEY,
        session_code VARCHAR(60) UNIQUE NOT NULL,
        employee_id INT NOT NULL REFERENCES performance_employees(id) ON DELETE RESTRICT,
        assignment_id BIGINT REFERENCES employee_operation_assignments(id) ON DELETE SET NULL,
        product_id INT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
        operation_id INT NOT NULL REFERENCES manufacturing_operations(id) ON DELETE RESTRICT,
        production_order_id INT REFERENCES work_orders(id) ON DELETE SET NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'paused', 'completed', 'cancelled')),
        started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        paused_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        accumulated_active_seconds INT NOT NULL DEFAULT 0 CHECK (accumulated_active_seconds >= 0),
        completed_qty NUMERIC(12, 4) NOT NULL DEFAULT 0,
        notes TEXT DEFAULT '',
        created_by VARCHAR(255),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,

      // 8. Authorised Downtime & Approved Breaks
      `CREATE TABLE IF NOT EXISTS production_downtime_logs (
        id BIGSERIAL PRIMARY KEY,
        downtime_code VARCHAR(60) UNIQUE NOT NULL,
        employee_id INT REFERENCES performance_employees(id) ON DELETE CASCADE,
        department_id INT REFERENCES departments(id) ON DELETE SET NULL,
        production_order_id INT REFERENCES work_orders(id) ON DELETE SET NULL,
        operation_id INT REFERENCES manufacturing_operations(id) ON DELETE SET NULL,
        downtime_type VARCHAR(40) NOT NULL CHECK (downtime_type IN ('approved_break', 'machine_breakdown', 'material_shortage', 'power_outage', 'changeover', 'training', 'other_authorised')),
        start_at TIMESTAMPTZ NOT NULL,
        end_at TIMESTAMPTZ NOT NULL,
        duration_minutes NUMERIC(10, 2) NOT NULL CHECK (duration_minutes > 0),
        is_approved BOOLEAN NOT NULL DEFAULT TRUE,
        approved_by VARCHAR(255),
        reason TEXT NOT NULL DEFAULT '',
        created_by VARCHAR(255),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      `CREATE INDEX IF NOT EXISTS idx_downtime_emp_date
        ON production_downtime_logs (employee_id, start_at DESC, is_approved)`,

      // 9. Quality Inspections & Rework Tracking (strictly prevents double-counting)
      `CREATE TABLE IF NOT EXISTS operation_quality_inspections (
        id BIGSERIAL PRIMARY KEY,
        inspection_code VARCHAR(60) UNIQUE NOT NULL,
        employee_id INT NOT NULL REFERENCES performance_employees(id) ON DELETE RESTRICT,
        product_id INT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
        operation_id INT NOT NULL REFERENCES manufacturing_operations(id) ON DELETE RESTRICT,
        responsible_operation_id INT REFERENCES manufacturing_operations(id) ON DELETE SET NULL,
        production_order_id INT REFERENCES work_orders(id) ON DELETE SET NULL,
        inspection_scope VARCHAR(20) NOT NULL DEFAULT 'component' CHECK (inspection_scope IN ('component', 'final_product')),
        submitted_qty NUMERIC(12, 4) NOT NULL CHECK (submitted_qty >= 0),
        inspected_qty NUMERIC(12, 4) NOT NULL CHECK (inspected_qty >= 0),
        first_pass_accepted_qty NUMERIC(12, 4) NOT NULL DEFAULT 0 CHECK (first_pass_accepted_qty >= 0),
        rejected_qty NUMERIC(12, 4) NOT NULL DEFAULT 0 CHECK (rejected_qty >= 0),
        rework_qty NUMERIC(12, 4) NOT NULL DEFAULT 0 CHECK (rework_qty >= 0),
        accepted_after_rework_qty NUMERIC(12, 4) NOT NULL DEFAULT 0 CHECK (accepted_after_rework_qty >= 0),
        pending_inspection_qty NUMERIC(12, 4) NOT NULL DEFAULT 0 CHECK (pending_inspection_qty >= 0),
        defect_reason VARCHAR(255) DEFAULT '',
        rework_status VARCHAR(30) NOT NULL DEFAULT 'none' CHECK (rework_status IN ('none', 'pending_rework', 'in_rework', 'rework_completed', 'scrapped')),
        inspector_id INT,
        inspector_name VARCHAR(200) NOT NULL,
        inspected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        remarks TEXT DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CHECK (accepted_after_rework_qty <= rework_qty),
        CHECK (first_pass_accepted_qty + rejected_qty + rework_qty <= inspected_qty + 0.0001)
      )`,
      `CREATE INDEX IF NOT EXISTS idx_op_qc_emp_date
        ON operation_quality_inspections (employee_id, inspected_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_op_qc_order_op
        ON operation_quality_inspections (production_order_id, operation_id, inspection_scope)`,

      // 10. WIP Quantity Transactions Ledger (atomic movements & assembly consumption)
      `CREATE TABLE IF NOT EXISTS wip_quantity_transactions (
        id BIGSERIAL PRIMARY KEY,
        tx_code VARCHAR(64) UNIQUE NOT NULL,
        production_order_id INT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
        product_id INT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
        operation_id INT REFERENCES manufacturing_operations(id) ON DELETE SET NULL,
        employee_id INT REFERENCES performance_employees(id) ON DELETE SET NULL,
        tx_type VARCHAR(40) NOT NULL CHECK (
          tx_type IN (
            'component_completed',
            'component_qc_accepted',
            'component_qc_rejected',
            'component_rework_started',
            'component_rework_accepted',
            'transferred_next',
            'consumed_in_assembly',
            'assembly_completed',
            'finished_qc_approved',
            'finished_qc_rejected',
            'manual_correction'
          )
        ),
        quantity NUMERIC(14, 4) NOT NULL,
        source_event_id BIGINT REFERENCES hardware_production_events(id) ON DELETE SET NULL,
        reference_id VARCHAR(120),
        performed_by VARCHAR(255),
        notes TEXT DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      `CREATE INDEX IF NOT EXISTS idx_wip_tx_order_op_type
        ON wip_quantity_transactions (production_order_id, operation_id, tx_type)`,

      // 11. Production Assembly & Finished Toy Records
      `CREATE TABLE IF NOT EXISTS production_assembly_records (
        id BIGSERIAL PRIMARY KEY,
        assembly_code VARCHAR(60) UNIQUE NOT NULL,
        production_order_id INT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
        product_id INT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
        assembled_qty NUMERIC(12, 4) NOT NULL CHECK (assembled_qty > 0),
        final_approved_qty NUMERIC(12, 4) NOT NULL DEFAULT 0 CHECK (final_approved_qty >= 0),
        final_rejected_qty NUMERIC(12, 4) NOT NULL DEFAULT 0 CHECK (final_rejected_qty >= 0),
        rework_required_qty NUMERIC(12, 4) NOT NULL DEFAULT 0 CHECK (rework_required_qty >= 0),
        status VARCHAR(40) NOT NULL DEFAULT 'awaiting_final_qc' CHECK (
          status IN ('assembly_in_progress', 'awaiting_final_qc', 'finished_approved', 'rework_required')
        ),
        assembled_by VARCHAR(255),
        inspected_by VARCHAR(255),
        assembled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        inspected_at TIMESTAMPTZ,
        notes TEXT DEFAULT ''
      )`,
      `CREATE INDEX IF NOT EXISTS idx_prod_assembly_order
        ON production_assembly_records (production_order_id, status)`,

      // 12. Performance Scoring & Governance Policy (management-configurable weights & thresholds)
      `CREATE TABLE IF NOT EXISTS performance_scoring_policies (
        id SERIAL PRIMARY KEY,
        policy_name VARCHAR(120) UNIQUE NOT NULL,
        productivity_weight NUMERIC(5, 2) NOT NULL CHECK (productivity_weight >= 0 AND productivity_weight <= 100),
        quality_weight NUMERIC(5, 2) NOT NULL CHECK (quality_weight >= 0 AND quality_weight <= 100),
        consistency_weight NUMERIC(5, 2) NOT NULL CHECK (consistency_weight >= 0 AND consistency_weight <= 100),
        productivity_metric_mode VARCHAR(30) NOT NULL DEFAULT 'accepted_output' CHECK (productivity_metric_mode IN ('accepted_output', 'gross_output')),
        quality_metric_mode VARCHAR(30) NOT NULL DEFAULT 'final_acceptance' CHECK (quality_metric_mode IN ('first_pass', 'final_acceptance')),
        max_productivity_score_cap NUMERIC(6, 2) NOT NULL DEFAULT 120.00 CHECK (max_productivity_score_cap >= 100 AND max_productivity_score_cap <= 200),
        consistency_min_productivity_pct NUMERIC(5, 2) NOT NULL DEFAULT 85.00,
        consistency_min_quality_pct NUMERIC(5, 2) NOT NULL DEFAULT 95.00,
        min_eligible_workdays_weekly INT NOT NULL DEFAULT 4 CHECK (min_eligible_workdays_weekly >= 1),
        min_eligible_workdays_monthly INT NOT NULL DEFAULT 15 CHECK (min_eligible_workdays_monthly >= 1),
        min_reward_productivity_pct NUMERIC(5, 2) NOT NULL DEFAULT 90.00,
        min_reward_quality_pct NUMERIC(5, 2) NOT NULL DEFAULT 95.00,
        hardware_debounce_seconds INT NOT NULL DEFAULT 2 CHECK (hardware_debounce_seconds >= 0 AND hardware_debounce_seconds <= 120),
        scoring_bands JSONB NOT NULL DEFAULT '[]'::jsonb,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        updated_by VARCHAR(255),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CHECK (ROUND(productivity_weight + quality_weight + consistency_weight, 2) = 100.00)
      )`,

      // 13. Reward Rules & Approval History
      `CREATE TABLE IF NOT EXISTS employee_reward_rules (
        id SERIAL PRIMARY KEY,
        rule_code VARCHAR(60) UNIQUE NOT NULL,
        rule_name VARCHAR(160) NOT NULL,
        category VARCHAR(50) NOT NULL CHECK (
          category IN (
            'best_employee_day',
            'best_employee_week',
            'best_employee_month',
            'best_performer_operation',
            'best_quality_performer',
            'most_consistent_employee',
            'overall_best_employee'
          )
        ),
        frequency VARCHAR(20) NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly', 'custom')),
        min_productivity_pct NUMERIC(5, 2) NOT NULL DEFAULT 90.00,
        min_quality_pct NUMERIC(5, 2) NOT NULL DEFAULT 95.00,
        min_working_days INT NOT NULL DEFAULT 1 CHECK (min_working_days >= 1),
        reward_type VARCHAR(80) NOT NULL DEFAULT 'Monetary Bonus',
        reward_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (reward_amount >= 0),
        approval_authority VARCHAR(120) NOT NULL DEFAULT 'Plant Manager / Admin',
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_by VARCHAR(255),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS employee_reward_records (
        id BIGSERIAL PRIMARY KEY,
        award_code VARCHAR(60) UNIQUE NOT NULL,
        rule_id INT REFERENCES employee_reward_rules(id) ON DELETE SET NULL,
        category VARCHAR(50) NOT NULL,
        period_type VARCHAR(20) NOT NULL CHECK (period_type IN ('daily', 'weekly', 'monthly', 'custom')),
        period_start DATE NOT NULL,
        period_end DATE NOT NULL,
        employee_id INT NOT NULL REFERENCES performance_employees(id) ON DELETE RESTRICT,
        emp_id VARCHAR(50) NOT NULL,
        operation_id INT REFERENCES manufacturing_operations(id) ON DELETE SET NULL,
        productivity_pct NUMERIC(8, 2) NOT NULL,
        quality_pct NUMERIC(8, 2) NOT NULL,
        consistency_pct NUMERIC(8, 2) NOT NULL,
        final_score NUMERIC(8, 2) NOT NULL,
        eligible_working_days INT NOT NULL DEFAULT 0,
        reward_type VARCHAR(80) NOT NULL,
        reward_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
        approval_status VARCHAR(30) NOT NULL DEFAULT 'pending_approval' CHECK (
          approval_status IN ('pending_approval', 'approved', 'rejected', 'disbursed')
        ),
        nominated_by VARCHAR(255),
        approved_by VARCHAR(255),
        approved_at TIMESTAMPTZ,
        review_notes TEXT DEFAULT '',
        supporting_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      `CREATE INDEX IF NOT EXISTS idx_emp_rewards_period
        ON employee_reward_records (period_type, period_start DESC, approval_status)`,

      // 14. Dedicated Manufacturing Operations Audit Log
      `CREATE TABLE IF NOT EXISTS manufacturing_audit_logs (
        id BIGSERIAL PRIMARY KEY,
        actor_id INT,
        actor_email VARCHAR(255) NOT NULL,
        actor_role VARCHAR(80),
        entity_type VARCHAR(80) NOT NULL,
        entity_id VARCHAR(120) NOT NULL,
        action VARCHAR(80) NOT NULL,
        before_values JSONB,
        after_values JSONB,
        reason TEXT DEFAULT '',
        ip_address VARCHAR(64),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      `CREATE INDEX IF NOT EXISTS idx_mfg_audit_entity
        ON manufacturing_audit_logs (entity_type, created_at DESC)`,
    ],
  },
  {
    version: '005_dashboard_notifications_and_roster_fixes',
    name: 'Performance Roster Schema Alignment & Persistent Dashboard Notification Centre',
    description:
      'Aligns departments (is_active/status) and roles (is_active) columns across legacy and migrated installations to eliminate roster registration schema drift, and creates dashboard_notifications and dashboard_notification_reads tables for real event-driven notifications. Zero seed or dummy data.',
    statements: [
      // 1. Align departments and roles active flags across legacy & migrated schemas
      `ALTER TABLE departments ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active'`,
      `ALTER TABLE departments ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE`,
      `UPDATE departments SET is_active = (LOWER(COALESCE(status, 'active')) = 'active') WHERE is_active IS NULL`,
      `ALTER TABLE roles ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE`,
      `ALTER TABLE roles ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT FALSE`,

      // 2. Persistent Role & Permission-Scoped Dashboard Notification Centre (Zero seed data)
      `CREATE TABLE IF NOT EXISTS dashboard_notifications (
        id BIGSERIAL PRIMARY KEY,
        notification_uid VARCHAR(150) UNIQUE NOT NULL,
        notification_type VARCHAR(60) NOT NULL,
        severity VARCHAR(20) NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        target_permission VARCHAR(120) NOT NULL,
        department_id INT REFERENCES departments(id) ON DELETE SET NULL,
        department_name VARCHAR(150),
        employee_id INT REFERENCES performance_employees(id) ON DELETE SET NULL,
        operation_id INT,
        production_order_id INT,
        action_route VARCHAR(255),
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      `CREATE INDEX IF NOT EXISTS idx_dash_notif_perm_created
        ON dashboard_notifications (target_permission, created_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_dash_notif_dept_created
        ON dashboard_notifications (department_id, created_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_dash_notif_emp_created
        ON dashboard_notifications (employee_id, created_at DESC)`,
      `CREATE TABLE IF NOT EXISTS dashboard_notification_reads (
        notification_id BIGINT NOT NULL REFERENCES dashboard_notifications(id) ON DELETE CASCADE,
        user_id INT NOT NULL,
        read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (notification_id, user_id)
      )`,
      `CREATE INDEX IF NOT EXISTS idx_dash_notif_reads_user
        ON dashboard_notification_reads (user_id, read_at DESC)`,
    ],
  },
];
