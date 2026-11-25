-- Migration: 008_module4_dashboard_navigation_profile_settings.sql
-- Description: Module 4 Schema: Database-Driven Navigation, User Sessions, Database Backups, Settings & Granular RBAC

-- 1. Extend Users Table if needed
ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS theme_preference VARCHAR(32) DEFAULT 'system';

-- Backfill first_name and last_name if empty
UPDATE users 
SET first_name = SPLIT_PART(name, ' ', 1),
    last_name = SUBSTRING(name FROM LENGTH(SPLIT_PART(name, ' ', 1)) + 2)
WHERE (first_name IS NULL OR first_name = '') AND name IS NOT NULL;

-- 2. User Sessions Table (Active Session Management & Revocation)
CREATE TABLE IF NOT EXISTS user_sessions (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(128) NOT NULL,
  ip_address VARCHAR(64) DEFAULT '127.0.0.1',
  user_agent TEXT,
  device_info VARCHAR(128) DEFAULT 'Desktop / Web Browser',
  browser VARCHAR(64) DEFAULT 'Web Browser',
  os VARCHAR(64) DEFAULT 'Linux / Unix',
  is_revoked BOOLEAN DEFAULT FALSE NOT NULL,
  last_active_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  expires_at TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_token_hash ON user_sessions(token_hash);

-- 3. Database-Driven Navigation Menu Items Table
CREATE TABLE IF NOT EXISTS menu_items (
  id VARCHAR(64) PRIMARY KEY,
  parent_id VARCHAR(64) REFERENCES menu_items(id) ON DELETE CASCADE,
  label VARCHAR(128) NOT NULL,
  route VARCHAR(128) NOT NULL,
  icon VARCHAR(64) NOT NULL DEFAULT 'LayoutDashboard',
  badge VARCHAR(32),
  display_order INTEGER NOT NULL DEFAULT 0,
  required_permission VARCHAR(64),
  module_code VARCHAR(64) NOT NULL DEFAULT 'MODULE_4',
  is_implemented BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_menu_items_parent_order ON menu_items(parent_id, display_order);
CREATE INDEX IF NOT EXISTS idx_menu_items_module ON menu_items(module_code);

-- 4. Database Backups Table (Disaster Recovery & Backup Ledger)
CREATE TABLE IF NOT EXISTS database_backups (
  id VARCHAR(64) PRIMARY KEY,
  filename VARCHAR(255) NOT NULL,
  size_bytes BIGINT NOT NULL DEFAULT 0,
  status VARCHAR(32) NOT NULL DEFAULT 'COMPLETED',
  backup_type VARCHAR(32) NOT NULL DEFAULT 'MANUAL',
  table_count INTEGER DEFAULT 0,
  row_count INTEGER DEFAULT 0,
  created_by VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
  created_by_name VARCHAR(255) DEFAULT 'System Administrator',
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 5. Extend System Settings Table
ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS timezone VARCHAR(64) DEFAULT 'UTC';
ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS locale VARCHAR(32) DEFAULT 'en-US';
ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS date_format VARCHAR(32) DEFAULT 'YYYY-MM-DD';
ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS time_format VARCHAR(32) DEFAULT '24h';
ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS session_timeout_minutes INTEGER DEFAULT 60;
ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS password_min_length INTEGER DEFAULT 8;
ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS password_require_special BOOLEAN DEFAULT TRUE;
ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS password_require_number BOOLEAN DEFAULT TRUE;
ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS allow_profile_updates BOOLEAN DEFAULT TRUE;

-- Insert default system settings if none exist
INSERT INTO system_settings (
  id, organization_id, clinic_name, legal_name, currency, default_tax_rate,
  opd_slot_duration_minutes, enable_sms_reminders, enable_email_reminders, enable_whatsapp,
  address, phone, email, timezone, locale, date_format, time_format, session_timeout_minutes,
  password_min_length, password_require_special, password_require_number, allow_profile_updates
)
SELECT 
  'sys-settings-default', 'org-mediera-01', 'MediEra Healthcare Systems', 'MediEra Multi-Speciality Clinics & ERP Ltd',
  'INR', 5.0, 15, FALSE, TRUE, TRUE,
  '100 Medical Center Parkway, Healthcare District', '+91 98765 43210', 'support@mediera.com',
  'Asia/Kolkata', 'en-IN', 'DD-MM-YYYY', '12h', 120,
  8, TRUE, TRUE, TRUE
WHERE NOT EXISTS (SELECT 1 FROM system_settings);

-- 6. Granular RBAC Permissions for Module 4 & Modules 5-11 Navigation
INSERT INTO permissions (id, code, module, action, description)
VALUES
  ('perm-dash-view', 'dashboard.view', 'Dashboard', 'view', 'View role-tailored dashboard metrics and activity'),
  ('perm-profile-view', 'profile.view', 'Profile', 'view', 'View personal user profile information'),
  ('perm-profile-update', 'profile.update', 'Profile', 'update', 'Update permitted personal profile fields'),
  ('perm-pass-change', 'password.change', 'Security', 'update', 'Change own account password'),
  ('perm-settings-view', 'settings.view', 'Settings', 'view', 'Access general system configuration views'),
  ('perm-settings-general', 'settings.general', 'Settings', 'manage', 'Modify system branding, timezones, and display settings'),
  ('perm-settings-notif', 'settings.notifications', 'Settings', 'manage', 'Configure system and user notification preferences'),
  ('perm-settings-audit', 'settings.audit', 'Settings', 'view', 'Search and review immutable system audit trails'),
  ('perm-settings-backups', 'settings.backups', 'Settings', 'manage', 'Create and monitor database backups'),
  ('perm-settings-sessions', 'settings.sessions', 'Settings', 'manage', 'View and revoke active user login sessions'),
  ('perm-workforce-view', 'workforce.view', 'Workforce', 'view', 'Access Workforce & Performance Monitoring (Module 5)'),
  ('perm-suppliers-view', 'suppliers.view', 'Suppliers', 'view', 'Access Supplier Management (Module 7)'),
  ('perm-purchasing-view', 'purchasing.view', 'Purchasing', 'view', 'Access Purchase Requests & Supplier Approval (Module 8)'),
  ('perm-goods-receipt-view', 'goods_receipt.view', 'Goods Receipt', 'view', 'Access Goods Receipt & Stock Updates (Module 9)')
ON CONFLICT (code) DO NOTHING;

-- 7. Populate Hierarchical Menu Items according to Main Menu Structure (Section 8)
-- Clear previous menu items if any to avoid duplication
DELETE FROM menu_items;

-- 7.1 Main Menu Root Items
-- 1. Dashboard
INSERT INTO menu_items (id, parent_id, label, route, icon, badge, display_order, required_permission, module_code, is_implemented, is_active)
VALUES ('menu-dashboard', NULL, 'Dashboard', '/erp/dashboard', 'LayoutDashboard', NULL, 1, 'dashboard.view', 'MODULE_4', TRUE, TRUE);

-- 2. Workforce & Performance Monitoring — Module 5
INSERT INTO menu_items (id, parent_id, label, route, icon, badge, display_order, required_permission, module_code, is_implemented, is_active)
VALUES ('menu-workforce', NULL, 'Workforce & Performance Monitoring', '/workforce', 'Users', 'Module 5', 2, 'workforce.view', 'MODULE_5', FALSE, TRUE);

INSERT INTO menu_items (id, parent_id, label, route, icon, badge, display_order, required_permission, module_code, is_implemented, is_active)
VALUES 
  ('menu-wf-employees', 'menu-workforce', 'Employee Management', '/workforce/employees', 'UserCheck', NULL, 1, 'workforce.view', 'MODULE_5', FALSE, TRUE),
  ('menu-wf-teams', 'menu-workforce', 'Team Management', '/workforce/teams', 'Building2', NULL, 2, 'workforce.view', 'MODULE_5', FALSE, TRUE),
  ('menu-wf-workstations', 'menu-workforce', 'Workstation Assignments', '/workforce/workstations', 'Layers', NULL, 3, 'workforce.view', 'MODULE_5', FALSE, TRUE),
  ('menu-wf-completion', 'menu-workforce', 'Work Completion', '/workforce/completion', 'CheckCircle2', NULL, 4, 'workforce.view', 'MODULE_5', FALSE, TRUE),
  ('menu-wf-reports', 'menu-workforce', 'Performance Reports', '/workforce/reports', 'TrendingUp', NULL, 5, 'workforce.view', 'MODULE_5', FALSE, TRUE);

-- 3. Inventory Management — Module 6
INSERT INTO menu_items (id, parent_id, label, route, icon, badge, display_order, required_permission, module_code, is_implemented, is_active)
VALUES ('menu-inventory', NULL, 'Inventory Management', '/inventory', 'Boxes', 'Module 6', 3, 'inventory.view', 'MODULE_6', TRUE, TRUE);

INSERT INTO menu_items (id, parent_id, label, route, icon, badge, display_order, required_permission, module_code, is_implemented, is_active)
VALUES 
  ('menu-inv-categories', 'menu-inventory', 'Categories', '/inventory/categories', 'FolderOpen', NULL, 1, 'inventory.view', 'MODULE_6', TRUE, TRUE),
  ('menu-inv-items', 'menu-inventory', 'Items', '/inventory/items', 'Package', NULL, 2, 'inventory.view', 'MODULE_6', TRUE, TRUE),
  ('menu-inv-stock-levels', 'menu-inventory', 'Stock Levels', '/inventory/stock-levels', 'Layers', NULL, 3, 'inventory.view', 'MODULE_6', TRUE, TRUE),
  ('menu-inv-movements', 'menu-inventory', 'Stock Movements', '/inventory/movements', 'Activity', NULL, 4, 'inventory.view', 'MODULE_6', TRUE, TRUE),
  ('menu-inv-low-stock', 'menu-inventory', 'Low-Stock Alerts', '/inventory/low-stock', 'AlertTriangle', NULL, 5, 'inventory.view', 'MODULE_6', TRUE, TRUE);

-- 4. Supplier Management — Module 7
INSERT INTO menu_items (id, parent_id, label, route, icon, badge, display_order, required_permission, module_code, is_implemented, is_active)
VALUES ('menu-suppliers', NULL, 'Supplier Management', '/suppliers', 'Building2', 'Module 7', 4, 'suppliers.view', 'MODULE_7', FALSE, TRUE);

INSERT INTO menu_items (id, parent_id, label, route, icon, badge, display_order, required_permission, module_code, is_implemented, is_active)
VALUES 
  ('menu-sup-list', 'menu-suppliers', 'Suppliers', '/suppliers/list', 'Building2', NULL, 1, 'suppliers.view', 'MODULE_7', FALSE, TRUE),
  ('menu-sup-contacts', 'menu-suppliers', 'Supplier Contacts', '/suppliers/contacts', 'Contact2', NULL, 2, 'suppliers.view', 'MODULE_7', FALSE, TRUE),
  ('menu-sup-history', 'menu-suppliers', 'Communication History', '/suppliers/history', 'History', NULL, 3, 'suppliers.view', 'MODULE_7', FALSE, TRUE);

-- 5. Purchase Requests & Supplier Approval — Module 8
INSERT INTO menu_items (id, parent_id, label, route, icon, badge, display_order, required_permission, module_code, is_implemented, is_active)
VALUES ('menu-purchasing', NULL, 'Purchase Requests & Supplier Approval', '/purchasing', 'FileText', 'Module 8', 5, 'purchasing.view', 'MODULE_8', FALSE, TRUE);

INSERT INTO menu_items (id, parent_id, label, route, icon, badge, display_order, required_permission, module_code, is_implemented, is_active)
VALUES 
  ('menu-pr-requests', 'menu-purchasing', 'Purchase Requests', '/purchasing/requests', 'FileText', NULL, 1, 'purchasing.view', 'MODULE_8', FALSE, TRUE),
  ('menu-pr-responses', 'menu-purchasing', 'Supplier Responses', '/purchasing/responses', 'Send', NULL, 2, 'purchasing.view', 'MODULE_8', FALSE, TRUE),
  ('menu-pr-approvals', 'menu-purchasing', 'Approval Status', '/purchasing/approvals', 'CheckCircle2', NULL, 3, 'purchasing.view', 'MODULE_8', FALSE, TRUE);

-- 6. Goods Receipt & Stock Updates — Module 9
INSERT INTO menu_items (id, parent_id, label, route, icon, badge, display_order, required_permission, module_code, is_implemented, is_active)
VALUES ('menu-goods-receipt', NULL, 'Goods Receipt & Stock Updates', '/goods-receipt', 'PackageCheck', 'Module 9', 6, 'goods_receipt.view', 'MODULE_9', FALSE, TRUE);

INSERT INTO menu_items (id, parent_id, label, route, icon, badge, display_order, required_permission, module_code, is_implemented, is_active)
VALUES 
  ('menu-gr-receipts', 'menu-goods-receipt', 'Goods Receipts', '/goods-receipt/list', 'PackageCheck', NULL, 1, 'goods_receipt.view', 'MODULE_9', FALSE, TRUE),
  ('menu-gr-quantities', 'menu-goods-receipt', 'Received Quantities', '/goods-receipt/quantities', 'Boxes', NULL, 2, 'goods_receipt.view', 'MODULE_9', FALSE, TRUE),
  ('menu-gr-discrepancies', 'menu-goods-receipt', 'Discrepancies', '/goods-receipt/discrepancies', 'AlertCircle', NULL, 3, 'goods_receipt.view', 'MODULE_9', FALSE, TRUE),
  ('menu-gr-adjustments', 'menu-goods-receipt', 'Stock Adjustments', '/goods-receipt/adjustments', 'SlidersHorizontal', NULL, 4, 'goods_receipt.view', 'MODULE_9', FALSE, TRUE);

-- 7. Reports & Analytics — Module 10
INSERT INTO menu_items (id, parent_id, label, route, icon, badge, display_order, required_permission, module_code, is_implemented, is_active)
VALUES ('menu-reports', NULL, 'Reports & Analytics', '/reports', 'BarChart3', 'Module 10', 7, 'reports.view', 'MODULE_10', FALSE, TRUE);

INSERT INTO menu_items (id, parent_id, label, route, icon, badge, display_order, required_permission, module_code, is_implemented, is_active)
VALUES 
  ('menu-rep-workforce', 'menu-reports', 'Workforce Reports', '/reports/workforce', 'Users', NULL, 1, 'reports.view', 'MODULE_10', FALSE, TRUE),
  ('menu-rep-inventory', 'menu-reports', 'Inventory Reports', '/reports/inventory', 'Boxes', NULL, 2, 'reports.view', 'MODULE_10', FALSE, TRUE),
  ('menu-rep-purchasing', 'menu-reports', 'Purchasing Reports', '/reports/purchasing', 'Receipt', NULL, 3, 'reports.view', 'MODULE_10', FALSE, TRUE);

-- 8. Audit, Notifications & System Settings — Module 11
INSERT INTO menu_items (id, parent_id, label, route, icon, badge, display_order, required_permission, module_code, is_implemented, is_active)
VALUES ('menu-audit-module', NULL, 'Audit, Notifications & System Settings', '/audit-system', 'ShieldCheck', 'Module 11', 8, 'audit.view', 'MODULE_11', FALSE, TRUE);

INSERT INTO menu_items (id, parent_id, label, route, icon, badge, display_order, required_permission, module_code, is_implemented, is_active)
VALUES 
  ('menu-am-audit-logs', 'menu-audit-module', 'Audit Logs', '/admin/audit-logs', 'History', NULL, 1, 'audit.view', 'MODULE_11', TRUE, TRUE),
  ('menu-am-email-logs', 'menu-audit-module', 'Email Delivery Logs', '/audit-system/email-logs', 'Send', NULL, 2, 'audit.view', 'MODULE_11', FALSE, TRUE),
  ('menu-am-notifications', 'menu-audit-module', 'Notifications', '/audit-system/notifications', 'Bell', NULL, 3, 'audit.view', 'MODULE_11', FALSE, TRUE),
  ('menu-am-app-settings', 'menu-audit-module', 'Application Settings', '/audit-system/settings', 'Settings', NULL, 4, 'audit.view', 'MODULE_11', FALSE, TRUE);

-- 9. Settings
INSERT INTO menu_items (id, parent_id, label, route, icon, badge, display_order, required_permission, module_code, is_implemented, is_active)
VALUES ('menu-settings', NULL, 'Settings', '/settings', 'Settings', NULL, 9, 'settings.view', 'MODULE_4', TRUE, TRUE);

INSERT INTO menu_items (id, parent_id, label, route, icon, badge, display_order, required_permission, module_code, is_implemented, is_active)
VALUES 
  ('menu-set-general', 'menu-settings', 'General Settings', '/settings/general', 'SlidersHorizontal', NULL, 1, 'settings.view', 'MODULE_4', TRUE, TRUE),
  ('menu-set-notifications', 'menu-settings', 'Notifications', '/settings/notifications', 'Bell', NULL, 2, 'settings.view', 'MODULE_4', TRUE, TRUE),
  ('menu-set-audit', 'menu-settings', 'Audit Trail', '/settings/audit', 'History', NULL, 3, 'settings.view', 'MODULE_4', TRUE, TRUE),
  ('menu-set-backups', 'menu-settings', 'Database Backups', '/settings/backups', 'Database', NULL, 4, 'settings.view', 'MODULE_4', TRUE, TRUE),
  ('menu-set-sessions', 'menu-settings', 'Active Sessions', '/settings/sessions', 'KeyRound', NULL, 5, 'settings.view', 'MODULE_4', TRUE, TRUE);

-- 10. My Profile
INSERT INTO menu_items (id, parent_id, label, route, icon, badge, display_order, required_permission, module_code, is_implemented, is_active)
VALUES ('menu-my-profile', NULL, 'My Profile', '/profile', 'User', NULL, 10, 'profile.view', 'MODULE_4', TRUE, TRUE);

-- 11. Change Password
INSERT INTO menu_items (id, parent_id, label, route, icon, badge, display_order, required_permission, module_code, is_implemented, is_active)
VALUES ('menu-change-password', NULL, 'Change Password', '/change-password', 'Lock', NULL, 11, 'password.change', 'MODULE_4', TRUE, TRUE);
