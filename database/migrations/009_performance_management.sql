-- Migration: 009_performance_management.sql
-- Description: Adds work_completion_events and workstation_devices tables for Workforce Performance Management
-- Applied to: PostgreSQL (Nexora Store database)

-- ============================================================================
-- UP MIGRATION
-- ============================================================================

CREATE TABLE IF NOT EXISTS work_completion_events (
  id SERIAL PRIMARY KEY,
  event_uuid VARCHAR(64) UNIQUE NOT NULL,
  employee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  event_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  event_source VARCHAR(32) NOT NULL DEFAULT 'SIMULATED', -- 'SIMULATED' or 'HARDWARE'
  device_id VARCHAR(100),
  workstation_name VARCHAR(150),
  units_completed INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  ip_address VARCHAR(50),
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wce_employee_id ON work_completion_events(employee_id);
CREATE INDEX IF NOT EXISTS idx_wce_timestamp ON work_completion_events(event_timestamp);
CREATE INDEX IF NOT EXISTS idx_wce_source ON work_completion_events(event_source);
CREATE INDEX IF NOT EXISTS idx_wce_created_at ON work_completion_events(created_at);

CREATE TABLE IF NOT EXISTS workstation_devices (
  id SERIAL PRIMARY KEY,
  device_code VARCHAR(100) UNIQUE NOT NULL,
  device_name VARCHAR(150) NOT NULL,
  workstation_name VARCHAR(150),
  assigned_employee_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  api_key_hash VARCHAR(128),
  last_heartbeat_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wd_device_code ON workstation_devices(device_code);
CREATE INDEX IF NOT EXISTS idx_wd_assigned_employee ON workstation_devices(assigned_employee_id);

-- Register Permissions
INSERT INTO permissions (code, name, module, category)
VALUES
  ('performance.view', 'View Workforce Live Performance & Reports', 'Workforce', 'action'),
  ('performance.simulate', 'Test Work Completion Button (Simulated Event)', 'Workforce', 'action'),
  ('performance.export', 'Export Workforce Performance Reports', 'Workforce', 'action'),
  ('performance.manage', 'Manage Workstations & Hardware Devices', 'Workforce', 'action')
ON CONFLICT (code) DO NOTHING;

-- Grant permissions to super_admin and admin roles
INSERT INTO role_permissions (role, permission_code)
VALUES
  ('super_admin', 'performance.view'),
  ('super_admin', 'performance.simulate'),
  ('super_admin', 'performance.export'),
  ('super_admin', 'performance.manage'),
  ('admin', 'performance.view'),
  ('admin', 'performance.simulate'),
  ('admin', 'performance.export')
ON CONFLICT (role, permission_code) DO NOTHING;

-- Update navigation menu for Workforce & Monitoring
UPDATE navigation_menus
SET is_implemented = true, route = '/workforce/performance/live'
WHERE id = 6;

-- Insert child navigation menus
INSERT INTO navigation_menus (id, label, icon, route, parent_id, display_order, is_active, required_permission, module_tag, is_implemented)
VALUES
  (61, 'Live Performance', 'Monitor', '/workforce/performance/live', 6, 1, true, 'performance.view', 'module5', true),
  (62, 'Performance Reports', 'BarChart2', '/workforce/performance/reports', 6, 2, true, 'performance.view', 'module5', true)
ON CONFLICT (id) DO UPDATE SET
  label = EXCLUDED.label,
  icon = EXCLUDED.icon,
  route = EXCLUDED.route,
  parent_id = EXCLUDED.parent_id,
  display_order = EXCLUDED.display_order,
  is_active = EXCLUDED.is_active,
  required_permission = EXCLUDED.required_permission,
  module_tag = EXCLUDED.module_tag,
  is_implemented = EXCLUDED.is_implemented;

-- ============================================================================
-- DOWN / ROLLBACK MIGRATION
-- ============================================================================
-- To rollback this migration, run the following SQL statements:
-- DELETE FROM navigation_menus WHERE id IN (61, 62);
-- UPDATE navigation_menus SET is_implemented = false WHERE id = 6;
-- DELETE FROM role_permissions WHERE permission_code LIKE 'performance.%';
-- DELETE FROM permissions WHERE code LIKE 'performance.%';
-- DROP TABLE IF EXISTS workstation_devices CASCADE;
-- DROP TABLE IF EXISTS work_completion_events CASCADE;
