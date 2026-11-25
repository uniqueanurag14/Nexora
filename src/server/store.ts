import dotenv from 'dotenv';
dotenv.config();
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';

export interface UserEntity {
  id: number;
  first_name: string;
  last_name: string;
  name: string;
  email: string;
  username: string;
  phone: string;
  department: string;
  password_hash: string;
  role: string;
  roles?: string[];
  is_active: boolean;
  is_verified: boolean;
  last_login_at: string | null;
  created_at: string;
}

export interface RoleEntity {
  id: number;
  name: string;
  code: string;
  description: string;
  is_system: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface NavigationMenuEntity {
  id: number;
  label: string;
  icon: string;
  route: string;
  parent_id: number | null;
  display_order: number;
  is_active: boolean;
  required_permission: string;
  module_tag: string;
  is_implemented: boolean;
}

export interface PermissionEntity {
  code: string;
  name: string;
  module: string;
  category: 'menu' | 'data' | 'action';
}

export interface AuditTrailEntity {
  id: number;
  user_id: number | null;
  user_email: string;
  action: string;
  module: string;
  details: string;
  ip_address: string;
  timestamp: string;
}

export interface SystemSettingEntity {
  key: string;
  value: string;
  category: string;
  updated_at: string;
  updated_by: string;
}

export interface UserSessionEntity {
  id: number;
  user_id: number;
  jti: string;
  ip_address: string;
  user_agent: string;
  created_at: string;
  last_active_at: string;
  is_revoked: boolean;
}

export interface SupplierEntity {
  id: number;
  code: string;
  name: string;
  category: string;
  tax_id: string;
  status: 'active' | 'disabled';
  contact_first_name: string;
  contact_last_name: string;
  email: string;
  phone: string;
  alternate_phone: string;
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  website: string;
  notes: string;
  created_by?: number | null;
  created_at: string;
  updated_at: string;
}

export interface InventoryCategoryEntity {
  id: number;
  code: string;
  name: string;
  description: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface UnitOfMeasureEntity {
  id: number;
  code: string;
  name: string;
  symbol: string;
  is_active: boolean;
  created_at: string;
}

export interface WarehouseEntity {
  id: number;
  code: string;
  name: string;
  address: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface InventoryItemEntity {
  id: number;
  code: string;
  name: string;
  description: string;
  category_id?: number | null;
  uom_id?: number | null;
  barcode?: string;
  min_stock_level: number;
  reorder_quantity: number;
  cost_price: number;
  selling_price: number;
  status: 'active' | 'disabled';
  created_by?: number | null;
  created_at: string;
  updated_at: string;
}

export interface StockBalanceEntity {
  id: number;
  item_id: number;
  warehouse_id: number;
  quantity: number;
  updated_at: string;
}

export interface StockTransactionEntity {
  id: number;
  transaction_type: 'receipt' | 'issue' | 'adjustment' | 'transfer';
  reference_no: string;
  item_id: number;
  quantity: number;
  source_warehouse_id?: number | null;
  destination_warehouse_id?: number | null;
  supplier_id?: number | null;
  unit_cost?: number | null;
  reason?: string;
  notes?: string;
  transaction_date: string;
  user_id?: number | null;
  created_at: string;
}

export interface ReorderRequestEntity {
  id: number;
  reorder_no: string;
  item_id: number;
  supplier_id: number;
  quantity: number;
  unit_price: number;
  total_amount: number;
  expected_delivery_date: string | null;
  notes: string;
  status: 'pending_supplier_response' | 'counteroffer_received' | 'accepted' | 'rejected' | 'revised_offer' | 'cancelled';
  supplier_token_hash: string;
  token_expires_at: string;
  responded_at: string | null;
  supplier_response_notes: string | null;
  counter_unit_price: number | null;
  counter_quantity: number | null;
  counter_delivery_date: string | null;
  rejection_reason: string | null;
  created_by?: number | null;
  created_at: string;
  updated_at: string;
}

export interface ReorderNegotiationEntity {
  id: number;
  reorder_id: number;
  actor: 'buyer' | 'supplier' | 'system';
  action: string;
  unit_price: number | null;
  quantity: number | null;
  delivery_date: string | null;
  notes: string;
  timestamp: string;
}

interface DatabaseSchema {
  users: UserEntity[];
  roles: RoleEntity[];
  navigation_menus: NavigationMenuEntity[];
  permissions: PermissionEntity[];
  role_permissions: { role: string; permission_code: string }[];
  audit_trail: AuditTrailEntity[];
  system_settings: Record<string, SystemSettingEntity>;
  user_sessions: UserSessionEntity[];
  revoked_tokens: { jti: string; revoked_at: string }[];
  suppliers: SupplierEntity[];
  inventory_categories: InventoryCategoryEntity[];
  units_of_measure: UnitOfMeasureEntity[];
  warehouses: WarehouseEntity[];
  inventory_items: InventoryItemEntity[];
  stock_balances: StockBalanceEntity[];
  stock_transactions: StockTransactionEntity[];
  reorder_requests: ReorderRequestEntity[];
  reorder_negotiations: ReorderNegotiationEntity[];
}

class Store {
  private filePath = path.resolve(process.cwd(), 'database', 'nexora_store.json');
  private data: DatabaseSchema = {
    users: [],
    roles: [],
    navigation_menus: [],
    permissions: [],
    role_permissions: [],
    audit_trail: [],
    system_settings: {},
    user_sessions: [],
    revoked_tokens: [],
    suppliers: [],
    inventory_categories: [],
    units_of_measure: [],
    warehouses: [],
    inventory_items: [],
    stock_balances: [],
    stock_transactions: [],
    reorder_requests: [],
    reorder_negotiations: [],
  };

  constructor() {
    this.loadFromDisk();
    this.initSeed();
  }

  public save() {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const tempFile = path.join(dir, `.nexora_store.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`);
    try {
      const payload = JSON.stringify(this.data, null, 2);
      fs.writeFileSync(tempFile, payload, 'utf-8');

      // Flush file descriptor to storage
      const fd = fs.openSync(tempFile, 'r+');
      fs.fsyncSync(fd);
      fs.closeSync(fd);

      // Atomic rename replacement
      fs.renameSync(tempFile, this.filePath);
    } catch (err) {
      if (fs.existsSync(tempFile)) {
        try { fs.unlinkSync(tempFile); } catch {}
      }
      console.error('[Store Critical Error]: Failed to persist database/nexora_store.json:', err);
      throw new Error(`Database mutation failed: ${(err as any)?.message || err}`);
    }
  }

  private loadFromDisk() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          for (const key of Object.keys(parsed)) {
            (this.data as any)[key] = parsed[key];
          }
        }
      }
    } catch (err) {
      console.warn('[Store Load Note]:', err);
    }
    if (!this.data.suppliers) this.data.suppliers = [];
    if (!this.data.inventory_categories) this.data.inventory_categories = [];
    if (!this.data.units_of_measure) this.data.units_of_measure = [];
    if (!this.data.warehouses) this.data.warehouses = [];
    if (!this.data.inventory_items) this.data.inventory_items = [];
    if (!this.data.stock_balances) this.data.stock_balances = [];
    if (!this.data.stock_transactions) this.data.stock_transactions = [];
    if (!this.data.reorder_requests) this.data.reorder_requests = [];
    if (!this.data.reorder_negotiations) this.data.reorder_negotiations = [];
  }

  public initSeed() {
    // 1. Initial Super Admin configuration with separate First Name and Last Name
    let adminFirstName = (process.env.SUPER_ADMIN_FIRST_NAME || '').trim();
    let adminLastName = (process.env.SUPER_ADMIN_LAST_NAME || '').trim();
    const adminName = (process.env.SUPER_ADMIN_NAME || '').trim();

    if (!adminFirstName && !adminLastName && adminName) {
      const parts = adminName.split(' ');
      adminFirstName = parts[0] || 'System';
      adminLastName = parts.slice(1).join(' ') || 'Administrator';
    } else if ((!adminFirstName || adminFirstName === 'System') && (!adminLastName || adminLastName === 'Administrator') && adminName && adminName !== 'System Administrator') {
      const parts = adminName.split(' ');
      adminFirstName = parts[0] || 'System';
      adminLastName = parts.slice(1).join(' ') || 'Administrator';
    }
    if (!adminFirstName) adminFirstName = 'System';
    if (!adminLastName) adminLastName = 'Administrator';

    const adminEmail = (process.env.SUPER_ADMIN_EMAIL || 'admin@example.com').trim().toLowerCase();
    const rawPassword = process.env.SUPER_ADMIN_PASSWORD || 'NexoraAdmin2026!SecureKey';
    const now = new Date().toISOString();

    let hasChanged = false;

    // Check for existing super admin by email, role, or username
    const existingAdmin =
      this.data.users.find(u => u.email.toLowerCase() === adminEmail) ||
      this.data.users.find(u => u.role === 'super_admin') ||
      this.data.users.find(u => u.username === 'superadmin');

    if (!existingAdmin) {
      const salt = bcrypt.genSaltSync(12);
      const hash = bcrypt.hashSync(rawPassword, salt);

      this.data.users.push({
        id: this.data.users.length > 0 ? Math.max(...this.data.users.map(u => u.id)) + 1 : 1,
        first_name: adminFirstName,
        last_name: adminLastName,
        name: `${adminFirstName} ${adminLastName}`.trim(),
        email: adminEmail,
        username: 'superadmin',
        phone: '+1-555-0199',
        department: 'System Architecture',
        password_hash: hash,
        role: 'super_admin',
        roles: ['super_admin'],
        is_active: true,
        is_verified: true,
        last_login_at: null,
        created_at: now,
      });
      hasChanged = true;
    } else {
      // Retain the existing account, identity, and password. Never reset password or overwrite existing records.
      if (!existingAdmin.first_name || !existingAdmin.last_name) {
        existingAdmin.first_name = existingAdmin.first_name || adminFirstName;
        existingAdmin.last_name = existingAdmin.last_name || adminLastName;
        existingAdmin.name = `${existingAdmin.first_name} ${existingAdmin.last_name}`.trim();
        hasChanged = true;
      }
      if (!existingAdmin.roles || !Array.isArray(existingAdmin.roles) || existingAdmin.roles.length === 0) {
        existingAdmin.roles = ['super_admin'];
        hasChanged = true;
      } else if (!existingAdmin.roles.includes('super_admin')) {
        existingAdmin.roles.unshift('super_admin');
        hasChanged = true;
      }
    }

    // 2. Seed System Roles
    if (!this.data.roles || this.data.roles.length === 0) {
      this.data.roles = [
        {
          id: 1,
          name: 'Super Administrator',
          code: 'super_admin',
          description: 'Full unrestricted administrative privileges and ownership across all modules',
          is_system: true,
          is_active: true,
          created_at: now,
          updated_at: now,
        },
        {
          id: 2,
          name: 'Administrator',
          code: 'admin',
          description: 'Operational administration, user account management, and operational workflows',
          is_system: true,
          is_active: true,
          created_at: now,
          updated_at: now,
        },
        {
          id: 3,
          name: 'Standard User',
          code: 'user',
          description: 'Standard employee/user access to personal profile, assigned workflows, and dashboard',
          is_system: true,
          is_active: true,
          created_at: now,
          updated_at: now,
        },
        {
          id: 4,
          name: 'Auditor',
          code: 'auditor',
          description: 'Security & compliance officer with read-only access to audit trail and reports',
          is_system: false,
          is_active: true,
          created_at: now,
          updated_at: now,
        },
        {
          id: 5,
          name: 'Performance User',
          code: 'performance_user',
          description: 'Dedicated workforce performance monitoring, employee registration, and work event tracking',
          is_system: true,
          is_active: true,
          created_at: now,
          updated_at: now,
        },
      ];
      hasChanged = true;
    } else {
      if (!this.data.roles.find(r => r.code === 'performance_user')) {
        const nextId = this.data.roles.length > 0 ? Math.max(...this.data.roles.map(r => r.id)) + 1 : 5;
        this.data.roles.push({
          id: nextId,
          name: 'Performance User',
          code: 'performance_user',
          description: 'Dedicated workforce performance monitoring, employee registration, and work event tracking',
          is_system: true,
          is_active: true,
          created_at: now,
          updated_at: now,
        });
        hasChanged = true;
      }
    }

    // 3. Seed Permissions (Module 3 fine-grained convention)
    const permissions: PermissionEntity[] = [
      // Users Module Permissions (View, Create, Edit, Delete, Disable)
      { code: 'users.view', name: 'View Users and Employees Directory', module: 'Users', category: 'action' },
      { code: 'users.create', name: 'Create User and Employee Accounts', module: 'Users', category: 'action' },
      { code: 'users.edit', name: 'Edit User Information & Roles', module: 'Users', category: 'action' },
      { code: 'users.update', name: 'Update User Information (Legacy Alias)', module: 'Users', category: 'action' },
      { code: 'users.delete', name: 'Delete User Accounts', module: 'Users', category: 'action' },
      { code: 'users.disable', name: 'Disable / Deactivate User Accounts', module: 'Users', category: 'action' },

      // Roles Module Permissions (View, Create, Edit, Delete, Disable)
      { code: 'roles.view', name: 'View System Roles & Permissions', module: 'Roles', category: 'action' },
      { code: 'roles.create', name: 'Create Custom System Roles', module: 'Roles', category: 'action' },
      { code: 'roles.edit', name: 'Edit Roles & Assign Permissions', module: 'Roles', category: 'action' },
      { code: 'roles.update', name: 'Update Roles (Legacy Alias)', module: 'Roles', category: 'action' },
      { code: 'roles.delete', name: 'Delete Custom System Roles', module: 'Roles', category: 'action' },
      { code: 'roles.disable', name: 'Disable / Deactivate Roles', module: 'Roles', category: 'action' },

      // Permissions Module Permissions (View, Create, Edit, Delete, Disable / Assign)
      { code: 'permissions.view', name: 'View Permission Catalog', module: 'Permissions', category: 'action' },
      { code: 'permissions.create', name: 'Define New System Permissions', module: 'Permissions', category: 'action' },
      { code: 'permissions.edit', name: 'Edit Permission Definitions', module: 'Permissions', category: 'action' },
      { code: 'permissions.delete', name: 'Delete Custom Permissions', module: 'Permissions', category: 'action' },
      { code: 'permissions.disable', name: 'Disable Permissions', module: 'Permissions', category: 'action' },
      { code: 'permissions.assign', name: 'Assign Permissions to Roles', module: 'Permissions', category: 'action' },

      // Profile Actions
      { code: 'profile.view', name: 'View Own Profile', module: 'Profile', category: 'action' },
      { code: 'profile.edit', name: 'Update Own Profile', module: 'Profile', category: 'action' },
      { code: 'profile.update', name: 'Update Own Profile (Legacy Alias)', module: 'Profile', category: 'action' },
      { code: 'profile.password', name: 'Change Own Password', module: 'Profile', category: 'action' },
      { code: 'security.password.change', name: 'Change Own Password', module: 'Profile', category: 'action' },
      { code: 'security.password.reset', name: 'Reset Account Password', module: 'Profile', category: 'action' },

      // Dashboard & Settings
      { code: 'dashboard.view', name: 'View Role-Based Dashboard', module: 'Dashboard', category: 'menu' },
      { code: 'settings.view', name: 'View System Settings', module: 'Settings', category: 'menu' },
      { code: 'settings.edit', name: 'Update System Settings', module: 'Settings', category: 'action' },
      { code: 'settings.update', name: 'Update System Settings (Legacy Alias)', module: 'Settings', category: 'action' },
      { code: 'settings.backup', name: 'Manage Database Backups', module: 'Settings', category: 'action' },
      { code: 'settings.sessions', name: 'View & Revoke Active Sessions', module: 'Settings', category: 'action' },
      { code: 'backups.manage', name: 'Manage Database Backups', module: 'Settings', category: 'action' },
      { code: 'sessions.manage', name: 'View & Revoke Active Sessions', module: 'Settings', category: 'action' },

      // Navigation & Menu permissions
      { code: 'menu.dashboard', name: 'View Dashboard', module: 'Dashboard', category: 'menu' },
      { code: 'menu.users', name: 'Access User & Role Management', module: 'Users', category: 'menu' },
      { code: 'menu.workforce', name: 'Access Workforce Module', module: 'Workforce', category: 'menu' },
      { code: 'menu.inventory', name: 'Access Inventory Module', module: 'Inventory', category: 'menu' },
      { code: 'menu.suppliers', name: 'Access Suppliers Module', module: 'Suppliers', category: 'menu' },
      { code: 'menu.purchasing', name: 'Access Purchasing Module', module: 'Purchasing', category: 'menu' },
      { code: 'menu.goods_receipt', name: 'Access Goods Receipt Module', module: 'Goods Receipt', category: 'menu' },
      { code: 'menu.reports', name: 'Access Reports Module', module: 'Reports', category: 'menu' },
      { code: 'menu.audit_system', name: 'Access System Audit & Settings', module: 'Audit', category: 'menu' },
      { code: 'menu.settings', name: 'Access General Settings', module: 'Settings', category: 'menu' },
      { code: 'menu.profile', name: 'Access My Profile', module: 'Profile', category: 'menu' },
      { code: 'menu.change_password', name: 'Access Change Password', module: 'Profile', category: 'menu' },

      // Supplier Module Permissions (Module 7)
      { code: 'suppliers.view', name: 'View Supplier Directory and Profiles', module: 'Suppliers', category: 'action' },
      { code: 'suppliers.create', name: 'Create and Register New Suppliers', module: 'Suppliers', category: 'action' },
      { code: 'suppliers.edit', name: 'Edit Supplier Information', module: 'Suppliers', category: 'action' },
      { code: 'suppliers.update', name: 'Update Supplier Information (Alias)', module: 'Suppliers', category: 'action' },
      { code: 'suppliers.delete', name: 'Delete Supplier Records', module: 'Suppliers', category: 'action' },
      { code: 'suppliers.disable', name: 'Disable / Deactivate Suppliers', module: 'Suppliers', category: 'action' },
      { code: 'suppliers.export', name: 'Export Supplier Data to Excel', module: 'Suppliers', category: 'action' },
      { code: 'suppliers.import', name: 'Import Suppliers from Excel Spreadsheet', module: 'Suppliers', category: 'action' },

      // Inventory Module Permissions (Module 6)
      { code: 'menu.inventory', name: 'Access Inventory Module', module: 'Inventory', category: 'menu' },
      { code: 'inventory.view', name: 'View Inventory Master and Stock Balances', module: 'Inventory', category: 'action' },
      { code: 'inventory.create', name: 'Create and Register Inventory Items', module: 'Inventory', category: 'action' },
      { code: 'inventory.edit', name: 'Edit Inventory Items', module: 'Inventory', category: 'action' },
      { code: 'inventory.update', name: 'Update Inventory Items (Alias)', module: 'Inventory', category: 'action' },
      { code: 'inventory.delete', name: 'Delete Inventory Records', module: 'Inventory', category: 'action' },
      { code: 'inventory.disable', name: 'Disable / Deactivate Items', module: 'Inventory', category: 'action' },
      { code: 'inventory.receive', name: 'Receive Stock Into Warehouses', module: 'Inventory', category: 'action' },
      { code: 'inventory.issue', name: 'Issue Stock Out of Warehouses', module: 'Inventory', category: 'action' },
      { code: 'inventory.adjust', name: 'Adjust Stock Balances with Count Discrepancy', module: 'Inventory', category: 'action' },
      { code: 'inventory.transfer', name: 'Transfer Stock Across Warehouses', module: 'Inventory', category: 'action' },
      { code: 'inventory.reorder', name: 'Create and Manage Supplier Reorders', module: 'Inventory', category: 'action' },
      { code: 'inventory.export', name: 'Export Inventory Data to Excel', module: 'Inventory', category: 'action' },
      { code: 'inventory.import', name: 'Import Inventory Items from Excel', module: 'Inventory', category: 'action' },
      { code: 'inventory.reports.view', name: 'View Inventory Valuation & Movements Reports', module: 'Inventory', category: 'action' },

      // Performance Module Permissions
      { code: 'performance.view', name: 'View Live Performance & Work Events', module: 'Performance', category: 'action' },
      { code: 'performance.manage', name: 'Register and Manage Performance Employees', module: 'Performance', category: 'action' },
      { code: 'performance.simulate', name: 'Simulate Hardware Work Events', module: 'Performance', category: 'action' },
      { code: 'performance.export', name: 'Export Performance Reports to CSV', module: 'Performance', category: 'action' },

      // Legacy compatibility
      { code: 'action.profile_update', name: 'Update Own Profile', module: 'Profile', category: 'action' },
      { code: 'action.password_change', name: 'Change Own Password', module: 'Profile', category: 'action' },
      { code: 'action.settings_update', name: 'Update System Settings', module: 'Settings', category: 'action' },
      { code: 'action.backup_manage', name: 'Manage Database Backups', module: 'Settings', category: 'action' },
      { code: 'action.session_revoke', name: 'Revoke Active Sessions', module: 'Settings', category: 'action' },
      { code: 'action.users_view', name: 'View All User Accounts', module: 'Users', category: 'data' },
    ];

    if (!this.data.permissions || this.data.permissions.length === 0) {
      this.data.permissions = permissions;
      hasChanged = true;
    }

    // 4. Role Permissions Mapping
    const existingRolePerms = new Set(this.data.role_permissions.map(rp => `${rp.role}:${rp.permission_code}`));

    const defaultRoleGrants: Record<string, string[]> = {
      super_admin: permissions.map(p => p.code),
      admin: [
        'users.view', 'users.create', 'users.update', 'users.delete',
        'roles.view', 'roles.create', 'roles.update',
        'permissions.view', 'permissions.assign',
        'profile.view', 'profile.update', 'security.password.change',
        'dashboard.view', 'menu.dashboard', 'menu.users', 'menu.workforce', 'menu.inventory',
        'menu.suppliers', 'menu.purchasing', 'menu.goods_receipt', 'menu.reports',
        'menu.profile', 'menu.change_password', 'action.profile_update',
        'action.password_change', 'action.users_view',
        'suppliers.view', 'suppliers.create', 'suppliers.edit', 'suppliers.update', 'suppliers.delete', 'suppliers.disable', 'suppliers.export', 'suppliers.import',
        'inventory.view', 'inventory.create', 'inventory.edit', 'inventory.update', 'inventory.delete', 'inventory.disable',
        'inventory.receive', 'inventory.issue', 'inventory.adjust', 'inventory.transfer', 'inventory.reorder',
        'inventory.export', 'inventory.import', 'inventory.reports.view',
        'performance.view', 'performance.manage', 'performance.simulate', 'performance.export',
      ],
      user: [
        'profile.view', 'profile.update', 'security.password.change',
        'dashboard.view', 'menu.dashboard', 'menu.profile', 'menu.change_password',
        'action.profile_update', 'action.password_change',
        'suppliers.view', 'suppliers.export',
        'inventory.view', 'inventory.export', 'inventory.reports.view',
      ],
      auditor: [
        'users.view', 'roles.view', 'permissions.view', 'profile.view',
        'dashboard.view', 'settings.view', 'menu.dashboard', 'menu.reports',
        'menu.audit_system', 'menu.settings', 'menu.profile', 'action.users_view',
        'suppliers.view', 'suppliers.export',
        'inventory.view', 'inventory.export', 'inventory.reports.view',
        'performance.view', 'performance.export',
      ],
      performance_user: [
        'menu.dashboard',
        'dashboard.view',
        'menu.workforce',
        'performance.view',
        'performance.manage',
        'performance.simulate',
        'performance.export',
        'profile.view',
        'profile.update',
        'security.password.change',
        'menu.profile',
        'menu.change_password',
      ],
    };

    if (!this.data.role_permissions || !Array.isArray(this.data.role_permissions)) {
      this.data.role_permissions = [];
    }
    for (const [role, codes] of Object.entries(defaultRoleGrants)) {
      for (const code of codes) {
        const key = `${role}:${code}`;
        if (!existingRolePerms.has(key)) {
          this.data.role_permissions.push({ role, permission_code: code });
          existingRolePerms.add(key);
          hasChanged = true;
        }
      }
    }

    // 5. Hierarchical Navigation Menus
    const menus: NavigationMenuEntity[] = [
      { id: 1, label: 'Dashboard', icon: 'LayoutDashboard', route: '/dashboard', parent_id: null, display_order: 1, is_active: true, required_permission: 'menu.dashboard', module_tag: 'core', is_implemented: true },

      // Module 3: Administration (Users & Roles)
      { id: 2, label: 'Administration', icon: 'Shield', route: '/users', parent_id: null, display_order: 2, is_active: true, required_permission: 'users.view', module_tag: 'module3', is_implemented: true },
      { id: 3, label: 'Users & Employees', icon: 'Users', route: '/users', parent_id: 2, display_order: 1, is_active: true, required_permission: 'users.view', module_tag: 'module3', is_implemented: true },
      { id: 4, label: 'Roles & Access', icon: 'UserCheck', route: '/roles', parent_id: 2, display_order: 2, is_active: true, required_permission: 'roles.view', module_tag: 'module3', is_implemented: true },
      { id: 5, label: 'Permissions Catalog', icon: 'Key', route: '/permissions', parent_id: 2, display_order: 3, is_active: true, required_permission: 'permissions.view', module_tag: 'module3', is_implemented: true },

      // Planned Modules (Preserved for future extensions)
      { id: 6, label: 'Workforce & Monitoring', icon: 'Briefcase', route: '/workforce', parent_id: null, display_order: 3, is_active: true, required_permission: 'menu.workforce', module_tag: 'module5', is_implemented: false },

      // Module 6: Inventory Management (Active & Implemented)
      { id: 7, label: 'Inventory Management', icon: 'Package', route: '/inventory', parent_id: null, display_order: 4, is_active: true, required_permission: 'inventory.view', module_tag: 'module6', is_implemented: true },
      { id: 71, label: 'Inventory Dashboard', icon: 'LayoutDashboard', route: '/inventory/dashboard', parent_id: 7, display_order: 1, is_active: true, required_permission: 'inventory.view', module_tag: 'module6', is_implemented: true },
      { id: 72, label: 'Items / Products', icon: 'Package', route: '/inventory/items', parent_id: 7, display_order: 2, is_active: true, required_permission: 'inventory.view', module_tag: 'module6', is_implemented: true },
      { id: 73, label: 'Categories & Units', icon: 'FolderTree', route: '/inventory/categories', parent_id: 7, display_order: 3, is_active: true, required_permission: 'inventory.view', module_tag: 'module6', is_implemented: true },
      { id: 74, label: 'Warehouses / Locations', icon: 'Building2', route: '/inventory/warehouses', parent_id: 7, display_order: 4, is_active: true, required_permission: 'inventory.view', module_tag: 'module6', is_implemented: true },
      { id: 75, label: 'Stock Operations', icon: 'ArrowLeftRight', route: '/inventory/operations', parent_id: 7, display_order: 5, is_active: true, required_permission: 'inventory.view', module_tag: 'module6', is_implemented: true },
      { id: 76, label: 'Stock Movements', icon: 'TrendingUp', route: '/inventory/movements', parent_id: 7, display_order: 6, is_active: true, required_permission: 'inventory.view', module_tag: 'module6', is_implemented: true },
      { id: 77, label: 'Low Stock Alerts', icon: 'AlertTriangle', route: '/inventory/alerts', parent_id: 7, display_order: 7, is_active: true, required_permission: 'inventory.view', module_tag: 'module6', is_implemented: true },
      { id: 80, label: 'Reorders & Negotiations', icon: 'ShoppingCart', route: '/inventory/reorders', parent_id: 7, display_order: 8, is_active: true, required_permission: 'inventory.view', module_tag: 'module6', is_implemented: true },
      { id: 78, label: 'Reports & Valuation', icon: 'PieChart', route: '/inventory/reports', parent_id: 7, display_order: 9, is_active: true, required_permission: 'inventory.reports.view', module_tag: 'module6', is_implemented: true },
      { id: 79, label: 'Import / Export', icon: 'FileSpreadsheet', route: '/inventory/import-export', parent_id: 7, display_order: 10, is_active: true, required_permission: 'inventory.view', module_tag: 'module6', is_implemented: true },

      // Module 7: Supplier Management (Active & Implemented)
      { id: 8, label: 'Supplier Management', icon: 'Truck', route: '/suppliers/directory', parent_id: null, display_order: 5, is_active: true, required_permission: 'suppliers.view', module_tag: 'module7', is_implemented: true },
      { id: 81, label: 'Suppliers Directory', icon: 'Building2', route: '/suppliers/directory', parent_id: 8, display_order: 1, is_active: true, required_permission: 'suppliers.view', module_tag: 'module7', is_implemented: true },

      { id: 9, label: 'Purchase Requests', icon: 'ShoppingCart', route: '/purchasing', parent_id: null, display_order: 6, is_active: true, required_permission: 'menu.purchasing', module_tag: 'module8', is_implemented: false },
      { id: 10, label: 'Goods Receipt', icon: 'ClipboardCheck', route: '/goods-receipt', parent_id: null, display_order: 7, is_active: true, required_permission: 'menu.goods_receipt', module_tag: 'module9', is_implemented: false },
      { id: 11, label: 'Reports & Analytics', icon: 'PieChart', route: '/reports', parent_id: null, display_order: 8, is_active: true, required_permission: 'menu.reports', module_tag: 'module10', is_implemented: false },

      // Settings
      { id: 12, label: 'Settings', icon: 'Settings', route: '/settings', parent_id: null, display_order: 9, is_active: true, required_permission: 'menu.settings', module_tag: 'core', is_implemented: true },
      { id: 13, label: 'General Settings', icon: 'SlidersHorizontal', route: '/settings/general', parent_id: 12, display_order: 1, is_active: true, required_permission: 'menu.settings', module_tag: 'core', is_implemented: true },
      { id: 14, label: 'Audit Trail', icon: 'ShieldCheck', route: '/settings/audit-trail', parent_id: 12, display_order: 2, is_active: true, required_permission: 'menu.settings', module_tag: 'core', is_implemented: true },
      { id: 15, label: 'Active Sessions', icon: 'Smartphone', route: '/settings/sessions', parent_id: 12, display_order: 3, is_active: true, required_permission: 'menu.settings', module_tag: 'core', is_implemented: true },
      { id: 16, label: 'Database Backups', icon: 'Database', route: '/settings/backups', parent_id: 12, display_order: 4, is_active: true, required_permission: 'menu.settings', module_tag: 'core', is_implemented: true },

      // Profile
      { id: 17, label: 'My Profile', icon: 'User', route: '/profile', parent_id: null, display_order: 10, is_active: true, required_permission: 'menu.profile', module_tag: 'core', is_implemented: true },
      { id: 18, label: 'Change Password', icon: 'KeyRound', route: '/change-password', parent_id: null, display_order: 11, is_active: true, required_permission: 'menu.change_password', module_tag: 'core', is_implemented: true },
    ];

    if (!this.data.navigation_menus || this.data.navigation_menus.length === 0) {
      this.data.navigation_menus = menus;
      hasChanged = true;
    }

    // Ensure Workforce & Monitoring Performance Management hierarchy is active
    const wfParent = this.data.navigation_menus.find(m => m.id === 6);
    if (wfParent) {
      wfParent.is_implemented = true;
      wfParent.route = '/workforce/performance/live';
      hasChanged = true;
    }

    if (!this.data.navigation_menus.some(m => m.id === 60)) {
      this.data.navigation_menus.push({
        id: 60,
        label: 'Performance Management',
        icon: 'TrendingUp',
        route: '/workforce/performance/live',
        parent_id: 6,
        display_order: 1,
        is_active: true,
        required_permission: 'menu.workforce',
        module_tag: 'module5',
        is_implemented: true,
      });
      hasChanged = true;
    }

    // Subitem 1: Employee Registration
    if (!this.data.navigation_menus.some(m => m.id === 601)) {
      this.data.navigation_menus.push({
        id: 601,
        label: 'Employee Registration',
        icon: 'UserCheck',
        route: '/workforce/performance/registration',
        parent_id: 60,
        display_order: 1,
        is_active: true,
        required_permission: 'menu.workforce',
        module_tag: 'module5',
        is_implemented: true,
      });
      hasChanged = true;
    }

    // Subitem 2: Live Performance
    const liveMenu = this.data.navigation_menus.find(m => m.id === 61);
    if (!liveMenu) {
      this.data.navigation_menus.push({
        id: 61,
        label: 'Live Performance',
        icon: 'Monitor',
        route: '/workforce/performance/live',
        parent_id: 60,
        display_order: 2,
        is_active: true,
        required_permission: 'menu.workforce',
        module_tag: 'module5',
        is_implemented: true,
      });
      hasChanged = true;
    } else {
      liveMenu.display_order = 2;
    }

    // Subitem 3: Performance Reports
    const repMenu = this.data.navigation_menus.find(m => m.id === 62);
    if (!repMenu) {
      this.data.navigation_menus.push({
        id: 62,
        label: 'Performance Reports',
        icon: 'BarChart2',
        route: '/workforce/performance/reports',
        parent_id: 60,
        display_order: 3,
        is_active: true,
        required_permission: 'menu.workforce',
        module_tag: 'module5',
        is_implemented: true,
      });
      hasChanged = true;
    } else {
      repMenu.display_order = 3;
    }

    // 6. Seed system settings
    if (Object.keys(this.data.system_settings).length === 0) {
      this.data.system_settings = {
        app_name: { key: 'app_name', value: process.env.APP_NAME || 'Nexora', category: 'general', updated_at: now, updated_by: 'system' },
        timezone: { key: 'timezone', value: process.env.APP_TIMEZONE || 'Asia/Kolkata', category: 'general', updated_at: now, updated_by: 'system' },
        date_format: { key: 'date_format', value: 'YYYY-MM-DD', category: 'display', updated_at: now, updated_by: 'system' },
        session_timeout_minutes: { key: 'session_timeout_minutes', value: '15', category: 'security', updated_at: now, updated_by: 'system' },
      };
      hasChanged = true;
    }

    if (hasChanged) {
      this.save();
    }
  }

  // --- User Queries & CRUD ---
  public findUserByEmail(email: string): UserEntity | undefined {
    return this.data.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  }

  public findUserById(id: number): UserEntity | undefined {
    return this.data.users.find(u => u.id === id);
  }

  public getAllUsers(): UserEntity[] {
    return this.data.users;
  }

  public createUser(user: Omit<UserEntity, 'id' | 'created_at'>): UserEntity {
    const id = (this.data.users.length > 0 ? Math.max(...this.data.users.map(u => u.id)) : 0) + 1;
    const now = new Date().toISOString();
    const entry: UserEntity = {
      id,
      ...user,
      created_at: now,
    };
    this.data.users.push(entry);
    this.save();
    return entry;
  }

  public updateUser(id: number, fields: Partial<UserEntity>): UserEntity | undefined {
    const user = this.findUserById(id);
    if (!user) return undefined;

    // Safeguard the last active Super Admin from demotion, role revocation, or disabling
    const isCurrentlySuper = user.role === 'super_admin' || (user.roles && user.roles.includes('super_admin'));
    if (isCurrentlySuper) {
      const activeSuperAdmins = this.data.users.filter(u =>
        u.id !== id && (u.role === 'super_admin' || (u.roles && u.roles.includes('super_admin'))) && u.is_active
      );
      if (activeSuperAdmins.length === 0) {
        if (fields.is_active === false) {
          throw new Error('Cannot disable or deactivate the last active Super Administrator.');
        }
        if (fields.role && fields.role !== 'super_admin') {
          throw new Error('Cannot remove Super Admin privileges from the last active Super Administrator.');
        }
        if (fields.roles && !fields.roles.includes('super_admin')) {
          throw new Error('Cannot remove Super Admin role assignment from the last active Super Administrator.');
        }
      }
    }

    if (fields.roles && fields.roles.length > 0) {
      if (!fields.role) {
        fields.role = fields.roles[0];
      }
    } else if (fields.role && (!fields.roles || fields.roles.length === 0)) {
      fields.roles = [fields.role];
    }

    Object.assign(user, fields);
    if (fields.first_name || fields.last_name) {
      user.name = `${user.first_name || ''} ${user.last_name || ''}`.trim();
    }
    this.save();
    return user;
  }

  public deleteUser(id: number): { success: boolean; message: string } {
    const user = this.findUserById(id);
    if (!user) return { success: false, message: 'User not found.' };

    // Super Admin safeguard
    if (user.role === 'super_admin' || (user.roles && user.roles.includes('super_admin'))) {
      const activeSuperAdmins = this.data.users.filter(u =>
        u.id !== id && (u.role === 'super_admin' || (u.roles && u.roles.includes('super_admin'))) && u.is_active
      );
      if (activeSuperAdmins.length === 0) {
        return { success: false, message: 'Cannot delete the last remaining active Super Administrator.' };
      }
    }

    this.data.users = this.data.users.filter(u => u.id !== id);
    this.data.user_sessions = this.data.user_sessions.filter(s => s.user_id !== id);
    this.save();
    return { success: true, message: 'User deleted successfully.' };
  }

  public getRoleUserCount(roleCode: string): number {
    return this.data.users.filter(u => u.role === roleCode || (u.roles && u.roles.includes(roleCode))).length;
  }

  public searchUsers(query?: string, role?: string, status?: string): UserEntity[] {
    return this.data.users.filter(u => {
      if (status && status !== 'all') {
        const isActive = status === 'active';
        if (u.is_active !== isActive) return false;
      }
      if (role && role !== 'all') {
        const hasRole = u.role === role || (u.roles && u.roles.includes(role));
        if (!hasRole) return false;
      }
      if (query && query.trim()) {
        const q = query.trim().toLowerCase();
        const fullName = `${u.first_name} ${u.last_name}`.toLowerCase();
        const matchesName = fullName.includes(q) || (u.name && u.name.toLowerCase().includes(q));
        const matchesEmail = u.email.toLowerCase().includes(q);
        const matchesDept = (u.department || '').toLowerCase().includes(q);
        const matchesRole = (u.role || '').toLowerCase().includes(q);
        if (!matchesName && !matchesEmail && !matchesDept && !matchesRole) {
          return false;
        }
      }
      return true;
    });
  }

  // --- Role Queries & CRUD ---
  public getRoles(): RoleEntity[] {
    return this.data.roles;
  }

  public getRoleById(id: number): RoleEntity | undefined {
    return this.data.roles.find(r => r.id === id);
  }

  public getRoleByCode(code: string): RoleEntity | undefined {
    return this.data.roles.find(r => r.code === code);
  }

  public createRole(role: Omit<RoleEntity, 'id' | 'created_at' | 'updated_at'>, permissions: string[] = []): RoleEntity {
    const id = (this.data.roles.length > 0 ? Math.max(...this.data.roles.map(r => r.id)) : 0) + 1;
    const now = new Date().toISOString();
    const entry: RoleEntity = {
      id,
      ...role,
      created_at: now,
      updated_at: now,
    };
    this.data.roles.push(entry);

    for (const p of permissions) {
      this.data.role_permissions.push({ role: entry.code, permission_code: p });
    }

    this.save();
    return entry;
  }

  public updateRole(id: number, data: Partial<RoleEntity>, permissions?: string[]): RoleEntity | undefined {
    const role = this.getRoleById(id);
    if (!role) return undefined;

    Object.assign(role, data);
    role.updated_at = new Date().toISOString();

    if (permissions !== undefined) {
      this.data.role_permissions = this.data.role_permissions.filter(rp => rp.role !== role.code);
      for (const p of permissions) {
        this.data.role_permissions.push({ role: role.code, permission_code: p });
      }
    }

    this.save();
    return role;
  }

  public deleteRole(id: number): { success: boolean; message: string } {
    const role = this.getRoleById(id);
    if (!role) return { success: false, message: 'Role not found.' };

    if (role.is_system || ['super_admin', 'admin', 'user'].includes(role.code)) {
      return { success: false, message: `System-critical role '${role.name}' cannot be deleted.` };
    }

    const assignedUsers = this.data.users.filter(u => u.role === role.code).length;
    if (assignedUsers > 0) {
      return { success: false, message: `Cannot delete role '${role.name}': assigned to ${assignedUsers} user(s).` };
    }

    this.data.roles = this.data.roles.filter(r => r.id !== id);
    this.data.role_permissions = this.data.role_permissions.filter(rp => rp.role !== role.code);
    this.save();
    return { success: true, message: `Role '${role.name}' deleted successfully.` };
  }

  // --- Permissions Queries ---
  public getPermissions(): PermissionEntity[] {
    return this.data.permissions;
  }

  public getRolePermissions(role: string): string[] {
    if (role === 'super_admin') {
      return ['*'];
    }
    return this.data.role_permissions
      .filter(rp => rp.role === role)
      .map(rp => rp.permission_code);
  }

  public setRolePermissions(roleCode: string, permissions: string[]): boolean {
    const role = this.getRoleByCode(roleCode);
    if (!role) return false;
    this.data.role_permissions = this.data.role_permissions.filter(rp => rp.role !== roleCode);
    for (const p of permissions) {
      this.data.role_permissions.push({ role: roleCode, permission_code: p });
    }
    this.save();
    return true;
  }

  public getUserEffectivePermissions(user: UserEntity): string[] {
    if (user.role === 'super_admin' || (user.roles && user.roles.includes('super_admin'))) {
      return ['*'];
    }
    const userRoles = [user.role, ...(user.roles || [])].filter(Boolean);
    const perms = new Set<string>();
    for (const rCode of userRoles) {
      const roleObj = this.getRoleByCode(rCode);
      if (roleObj && roleObj.is_active) {
        const rPerms = this.data.role_permissions.filter(rp => rp.role === rCode);
        for (const rp of rPerms) {
          perms.add(rp.permission_code);
          // If update exists, also allow edit and vice versa
          if (rp.permission_code.endsWith('.update')) {
            perms.add(rp.permission_code.replace('.update', '.edit'));
          } else if (rp.permission_code.endsWith('.edit')) {
            perms.add(rp.permission_code.replace('.edit', '.update'));
          }
        }
      }
    }
    return Array.from(perms);
  }

  // --- Navigation Menus ---
  public getNavigationMenus(): NavigationMenuEntity[] {
    return this.data.navigation_menus;
  }

  // --- Audit Trail ---
  public logAudit(log: Omit<AuditTrailEntity, 'id' | 'timestamp'>) {
    const id = (this.data.audit_trail.length > 0 ? Math.max(...this.data.audit_trail.map(a => a.id)) : 0) + 1;
    const entry: AuditTrailEntity = {
      id,
      ...log,
      timestamp: new Date().toISOString(),
    };
    this.data.audit_trail.unshift(entry);
    if (this.data.audit_trail.length > 200) {
      this.data.audit_trail = this.data.audit_trail.slice(0, 200);
    }
    this.save();
  }

  public getAuditTrail(filter: { module?: string; user_email?: string; action?: string } = {}): AuditTrailEntity[] {
    return this.data.audit_trail.filter(a => {
      if (filter.module && a.module !== filter.module) return false;
      if (filter.user_email && !a.user_email.toLowerCase().includes(filter.user_email.toLowerCase())) return false;
      if (filter.action && a.action !== filter.action) return false;
      return true;
    });
  }

  // --- Settings ---
  public getSettings(): Record<string, string> {
    const res: Record<string, string> = {};
    for (const [k, v] of Object.entries(this.data.system_settings)) {
      res[k] = v.value;
    }
    return res;
  }

  public updateSetting(key: string, value: string, category: string, updatedBy: string) {
    this.data.system_settings[key] = {
      key,
      value,
      category,
      updated_at: new Date().toISOString(),
      updated_by: updatedBy,
    };
    this.save();
  }

  // --- Sessions & Token Revocation ---
  public createSession(session: Omit<UserSessionEntity, 'id' | 'created_at' | 'last_active_at' | 'is_revoked'>): UserSessionEntity {
    const id = (this.data.user_sessions.length > 0 ? Math.max(...this.data.user_sessions.map(s => s.id)) : 0) + 1;
    const now = new Date().toISOString();
    const entry: UserSessionEntity = {
      id,
      ...session,
      created_at: now,
      last_active_at: now,
      is_revoked: false,
    };
    this.data.user_sessions.unshift(entry);
    this.save();
    return entry;
  }

  public getUserSessions(userId: number): UserSessionEntity[] {
    return this.data.user_sessions.filter(s => s.user_id === userId);
  }

  public revokeSession(id: number): boolean {
    const s = this.data.user_sessions.find(item => item.id === id);
    if (!s) return false;
    s.is_revoked = true;
    if (s.jti) {
      this.revokeToken(s.jti);
    }
    this.save();
    return true;
  }

  public revokeToken(jti: string) {
    if (!this.data.revoked_tokens.some(t => t.jti === jti)) {
      this.data.revoked_tokens.push({ jti, revoked_at: new Date().toISOString() });
      this.save();
    }
  }

  public isTokenRevoked(jti: string): boolean {
    return this.data.revoked_tokens.some(t => t.jti === jti);
  }

  // --- Supplier Master Methods (Module 7) ---
  public getSuppliers(options: {
    search?: string;
    category?: string;
    status?: string;
    page?: number;
    pageSize?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) {
    let list = [...(this.data.suppliers || [])];

    if (options.search && options.search.trim()) {
      const q = options.search.trim().toLowerCase();
      list = list.filter(
        s =>
          (s.code && s.code.toLowerCase().includes(q)) ||
          (s.name && s.name.toLowerCase().includes(q)) ||
          (s.email && s.email.toLowerCase().includes(q)) ||
          (s.contact_first_name && s.contact_first_name.toLowerCase().includes(q)) ||
          (s.contact_last_name && s.contact_last_name.toLowerCase().includes(q)) ||
          (s.city && s.city.toLowerCase().includes(q))
      );
    }

    if (options.category && options.category.trim() && options.category !== 'all') {
      list = list.filter(s => s.category === options.category);
    }

    if (options.status && options.status.trim() && options.status !== 'all') {
      list = list.filter(s => s.status === options.status);
    }

    const sortBy = options.sortBy || 'created_at';
    const order = options.sortOrder === 'asc' ? 1 : -1;
    list.sort((a: any, b: any) => {
      const valA = a[sortBy] ?? '';
      const valB = b[sortBy] ?? '';
      if (valA < valB) return -1 * order;
      if (valA > valB) return 1 * order;
      return 0;
    });

    const total = list.length;
    const page = options.page || 1;
    const pageSize = options.pageSize || 10;
    const offset = (page - 1) * pageSize;
    const items = list.slice(offset, offset + pageSize);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    const categories = Array.from(new Set((this.data.suppliers || []).map(s => s.category).filter(Boolean))).sort();

    return {
      items,
      total,
      page,
      pageSize,
      totalPages,
      categories,
    };
  }

  public getSupplierById(id: number): SupplierEntity | undefined {
    return (this.data.suppliers || []).find(s => s.id === id);
  }

  public getSupplierByCode(code: string): SupplierEntity | undefined {
    return (this.data.suppliers || []).find(s => s.code.toUpperCase() === code.trim().toUpperCase());
  }

  public getNextSupplierCode(): string {
    const list = this.data.suppliers || [];
    let num = list.length + 1;
    let code = `SUP-${String(num).padStart(5, '0')}`;
    while (list.some(s => s.code.toUpperCase() === code)) {
      num++;
      code = `SUP-${String(num).padStart(5, '0')}`;
    }
    return code;
  }

  public createSupplier(data: Omit<SupplierEntity, 'id' | 'created_at' | 'updated_at'>): SupplierEntity {
    if (!this.data.suppliers) this.data.suppliers = [];
    const id = (this.data.suppliers.length > 0 ? Math.max(...this.data.suppliers.map(s => s.id)) : 0) + 1;
    const now = new Date().toISOString();
    const entry: SupplierEntity = {
      id,
      code: data.code.trim().toUpperCase(),
      name: data.name.trim(),
      category: data.category?.trim() || '',
      tax_id: data.tax_id?.trim() || '',
      status: data.status || 'active',
      contact_first_name: data.contact_first_name?.trim() || '',
      contact_last_name: data.contact_last_name?.trim() || '',
      email: data.email?.trim().toLowerCase() || '',
      phone: data.phone?.trim() || '',
      alternate_phone: data.alternate_phone?.trim() || '',
      address_line1: data.address_line1?.trim() || '',
      address_line2: data.address_line2?.trim() || '',
      city: data.city?.trim() || '',
      state: data.state?.trim() || '',
      postal_code: data.postal_code?.trim() || '',
      country: data.country?.trim() || 'India',
      website: data.website?.trim() || '',
      notes: data.notes?.trim() || '',
      created_by: data.created_by ?? null,
      created_at: now,
      updated_at: now,
    };
    this.data.suppliers.unshift(entry);
    this.save();
    return entry;
  }

  public updateSupplier(id: number, data: Partial<SupplierEntity>): SupplierEntity | null {
    const s = this.getSupplierById(id);
    if (!s) return null;
    const now = new Date().toISOString();
    if (data.code !== undefined) s.code = data.code.trim().toUpperCase();
    if (data.name !== undefined) s.name = data.name.trim();
    if (data.category !== undefined) s.category = data.category.trim();
    if (data.tax_id !== undefined) s.tax_id = data.tax_id.trim();
    if (data.status !== undefined) s.status = data.status;
    if (data.contact_first_name !== undefined) s.contact_first_name = data.contact_first_name.trim();
    if (data.contact_last_name !== undefined) s.contact_last_name = data.contact_last_name.trim();
    if (data.email !== undefined) s.email = data.email.trim().toLowerCase();
    if (data.phone !== undefined) s.phone = data.phone.trim();
    if (data.alternate_phone !== undefined) s.alternate_phone = data.alternate_phone.trim();
    if (data.address_line1 !== undefined) s.address_line1 = data.address_line1.trim();
    if (data.address_line2 !== undefined) s.address_line2 = data.address_line2.trim();
    if (data.city !== undefined) s.city = data.city.trim();
    if (data.state !== undefined) s.state = data.state.trim();
    if (data.postal_code !== undefined) s.postal_code = data.postal_code.trim();
    if (data.country !== undefined) s.country = data.country.trim();
    if (data.website !== undefined) s.website = data.website.trim();
    if (data.notes !== undefined) s.notes = data.notes.trim();
    s.updated_at = now;
    this.save();
    return s;
  }

  public deleteSupplier(id: number, forceDisable: boolean = false): { success: boolean; action: 'deleted' | 'disabled'; supplier?: SupplierEntity } {
    const s = this.getSupplierById(id);
    if (!s) return { success: false, action: 'deleted' };

    if (forceDisable) {
      s.status = 'disabled';
      s.updated_at = new Date().toISOString();
      this.save();
      return { success: true, action: 'disabled', supplier: s };
    }

    const idx = (this.data.suppliers || []).findIndex(item => item.id === id);
    if (idx !== -1) {
      this.data.suppliers.splice(idx, 1);
      this.save();
      return { success: true, action: 'deleted', supplier: s };
    }
    return { success: false, action: 'deleted' };
  }

  // ==========================================
  // INVENTORY MANAGEMENT MODULE (Module 6)
  // ==========================================

  // --- Categories ---
  public getCategories(): InventoryCategoryEntity[] {
    return (this.data.inventory_categories || []).sort((a, b) => a.name.localeCompare(b.name));
  }

  public getCategoryById(id: number): InventoryCategoryEntity | undefined {
    return (this.data.inventory_categories || []).find(c => c.id === id);
  }

  public getCategoryByCode(code: string): InventoryCategoryEntity | undefined {
    return (this.data.inventory_categories || []).find(c => c.code.toUpperCase() === code.trim().toUpperCase());
  }

  public createCategory(data: { code: string; name: string; description?: string }): InventoryCategoryEntity {
    const cleanCode = data.code.trim().toUpperCase();
    if (this.getCategoryByCode(cleanCode)) {
      throw new Error(`Category code '${cleanCode}' already exists.`);
    }
    const now = new Date().toISOString();
    const id = (this.data.inventory_categories || []).length > 0 ? Math.max(...this.data.inventory_categories.map(c => c.id)) + 1 : 1;
    const cat: InventoryCategoryEntity = {
      id,
      code: cleanCode,
      name: data.name.trim(),
      description: data.description ? data.description.trim() : '',
      is_active: true,
      created_at: now,
      updated_at: now,
    };
    if (!this.data.inventory_categories) this.data.inventory_categories = [];
    this.data.inventory_categories.push(cat);
    this.save();
    return cat;
  }

  public updateCategory(id: number, data: { code?: string; name?: string; description?: string; is_active?: boolean }): InventoryCategoryEntity | null {
    const cat = this.getCategoryById(id);
    if (!cat) return null;
    if (data.code !== undefined && data.code.trim()) {
      const clean = data.code.trim().toUpperCase();
      if (clean !== cat.code) {
        const existing = this.getCategoryByCode(clean);
        if (existing && existing.id !== id) {
          throw new Error(`Category code '${clean}' is already assigned to another category.`);
        }
        cat.code = clean;
      }
    }
    if (data.name !== undefined) cat.name = data.name.trim();
    if (data.description !== undefined) cat.description = data.description.trim();
    if (data.is_active !== undefined) cat.is_active = data.is_active;
    cat.updated_at = new Date().toISOString();
    this.save();
    return cat;
  }

  public deleteCategory(id: number): boolean {
    const hasItems = (this.data.inventory_items || []).some(it => it.category_id === id);
    if (hasItems) {
      throw new Error("Cannot delete category referenced by active inventory items.");
    }
    const idx = (this.data.inventory_categories || []).findIndex(c => c.id === id);
    if (idx !== -1) {
      this.data.inventory_categories.splice(idx, 1);
      this.save();
      return true;
    }
    return false;
  }

  // --- Units of Measure ---
  public getUOMs(): UnitOfMeasureEntity[] {
    return (this.data.units_of_measure || []).sort((a, b) => a.name.localeCompare(b.name));
  }

  public getUOMById(id: number): UnitOfMeasureEntity | undefined {
    return (this.data.units_of_measure || []).find(u => u.id === id);
  }

  public getUOMByCode(code: string): UnitOfMeasureEntity | undefined {
    return (this.data.units_of_measure || []).find(u => u.code.toUpperCase() === code.trim().toUpperCase());
  }

  public createUOM(data: { code: string; name: string; symbol: string }): UnitOfMeasureEntity {
    const cleanCode = data.code.trim().toUpperCase();
    if (this.getUOMByCode(cleanCode)) {
      throw new Error(`UOM code '${cleanCode}' already exists.`);
    }
    const id = (this.data.units_of_measure || []).length > 0 ? Math.max(...this.data.units_of_measure.map(u => u.id)) + 1 : 1;
    const uom: UnitOfMeasureEntity = {
      id,
      code: cleanCode,
      name: data.name.trim(),
      symbol: data.symbol.trim(),
      is_active: true,
      created_at: new Date().toISOString(),
    };
    if (!this.data.units_of_measure) this.data.units_of_measure = [];
    this.data.units_of_measure.push(uom);
    this.save();
    return uom;
  }

  // --- Warehouses / Locations ---
  public getWarehouses(): WarehouseEntity[] {
    return (this.data.warehouses || []).sort((a, b) => a.name.localeCompare(b.name));
  }

  public getWarehouseById(id: number): WarehouseEntity | undefined {
    return (this.data.warehouses || []).find(w => w.id === id);
  }

  public getWarehouseByCode(code: string): WarehouseEntity | undefined {
    return (this.data.warehouses || []).find(w => w.code.toUpperCase() === code.trim().toUpperCase());
  }

  public createWarehouse(data: { code: string; name: string; address?: string }): WarehouseEntity {
    const cleanCode = data.code.trim().toUpperCase();
    if (this.getWarehouseByCode(cleanCode)) {
      throw new Error(`Warehouse code '${cleanCode}' already exists.`);
    }
    const now = new Date().toISOString();
    const id = (this.data.warehouses || []).length > 0 ? Math.max(...this.data.warehouses.map(w => w.id)) + 1 : 1;
    const wh: WarehouseEntity = {
      id,
      code: cleanCode,
      name: data.name.trim(),
      address: data.address ? data.address.trim() : '',
      is_active: true,
      created_at: now,
      updated_at: now,
    };
    if (!this.data.warehouses) this.data.warehouses = [];
    this.data.warehouses.push(wh);
    this.save();
    return wh;
  }

  public updateWarehouse(id: number, data: { name?: string; address?: string; is_active?: boolean }): WarehouseEntity | null {
    const wh = this.getWarehouseById(id);
    if (!wh) return null;
    if (data.name !== undefined) wh.name = data.name.trim();
    if (data.address !== undefined) wh.address = data.address.trim();
    if (data.is_active !== undefined) wh.is_active = data.is_active;
    wh.updated_at = new Date().toISOString();
    this.save();
    return wh;
  }

  // --- Item Master ---
  public getNextItemCode(): string {
    const items = this.data.inventory_items || [];
    let maxNum = items.length;
    for (const it of items) {
      const match = it.code.match(/SKU-(\d+)/i);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) maxNum = num;
      }
    }
    let nextNum = maxNum + 1;
    let code = `SKU-${String(nextNum).padStart(5, '0')}`;
    while (items.some(i => i.code.toUpperCase() === code.toUpperCase())) {
      nextNum++;
      code = `SKU-${String(nextNum).padStart(5, '0')}`;
    }
    return code;
  }

  public getItemById(id: number): InventoryItemEntity | undefined {
    return (this.data.inventory_items || []).find(it => it.id === id);
  }

  public getItemByCode(code: string): InventoryItemEntity | undefined {
    return (this.data.inventory_items || []).find(it => it.code.toUpperCase() === code.trim().toUpperCase());
  }

  public getItemTotalOnHand(itemId: number): number {
    return (this.data.stock_balances || [])
      .filter(b => b.item_id === itemId)
      .reduce((sum, b) => sum + Number(b.quantity || 0), 0);
  }

  public getStockBalances(itemId: number): Array<{ warehouse_id: number; warehouse_name: string; warehouse_code: string; quantity: number; updated_at: string }> {
    const balances = (this.data.stock_balances || []).filter(b => b.item_id === itemId);
    return balances.map(b => {
      const wh = this.getWarehouseById(b.warehouse_id);
      return {
        warehouse_id: b.warehouse_id,
        warehouse_name: wh?.name || 'Unknown',
        warehouse_code: wh?.code || 'N/A',
        quantity: Number(b.quantity || 0),
        updated_at: b.updated_at,
      };
    });
  }

  public getItems(options: {
    search?: string;
    category_id?: number;
    status?: string;
    page?: number;
    pageSize?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): {
    items: Array<InventoryItemEntity & { category_name?: string; uom_symbol?: string; total_on_hand: number; balances: any[] }>;
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  } {
    let list = [...(this.data.inventory_items || [])];

    if (options.search && options.search.trim()) {
      const s = options.search.trim().toLowerCase();
      list = list.filter(it =>
        it.code.toLowerCase().includes(s) ||
        it.name.toLowerCase().includes(s) ||
        (it.barcode && it.barcode.toLowerCase().includes(s)) ||
        (it.description && it.description.toLowerCase().includes(s))
      );
    }

    if (options.category_id) {
      list = list.filter(it => it.category_id === Number(options.category_id));
    }

    if (options.status && options.status !== 'all') {
      list = list.filter(it => it.status === options.status);
    }

    const sortField = options.sortBy || 'created_at';
    const isAsc = options.sortOrder === 'asc';

    list.sort((a: any, b: any) => {
      const valA = a[sortField] !== undefined ? a[sortField] : '';
      const valB = b[sortField] !== undefined ? b[sortField] : '';
      if (valA < valB) return isAsc ? -1 : 1;
      if (valA > valB) return isAsc ? 1 : -1;
      return 0;
    });

    const total = list.length;
    const page = Math.max(1, options.page || 1);
    const pageSize = Math.max(1, options.pageSize || 10);
    const offset = (page - 1) * pageSize;
    const paged = list.slice(offset, offset + pageSize);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    const enriched = paged.map(it => {
      const cat = it.category_id ? this.getCategoryById(it.category_id) : undefined;
      const uom = it.uom_id ? this.getUOMById(it.uom_id) : undefined;
      const balances = this.getStockBalances(it.id);
      const total_on_hand = balances.reduce((sum, b) => sum + b.quantity, 0);

      return {
        ...it,
        category_name: cat?.name,
        uom_symbol: uom?.symbol,
        total_on_hand,
        balances,
      };
    });

    return {
      items: enriched,
      total,
      page,
      pageSize,
      totalPages,
    };
  }

  public createItem(data: {
    code: string;
    name: string;
    description?: string;
    category_id?: number | null;
    uom_id?: number | null;
    barcode?: string;
    min_stock_level?: number;
    reorder_quantity?: number;
    cost_price?: number;
    selling_price?: number;
    status?: 'active' | 'disabled';
    initial_warehouse_id?: number;
    initial_quantity?: number;
    created_by?: number | null;
  }): InventoryItemEntity {
    const cleanCode = data.code.trim().toUpperCase();
    if (this.getItemByCode(cleanCode)) {
      throw new Error(`Item code '${cleanCode}' is already registered.`);
    }

    const now = new Date().toISOString();
    const id = (this.data.inventory_items || []).length > 0 ? Math.max(...this.data.inventory_items.map(i => i.id)) + 1 : 1;

    const item: InventoryItemEntity = {
      id,
      code: cleanCode,
      name: data.name.trim(),
      description: data.description ? data.description.trim() : '',
      category_id: data.category_id || null,
      uom_id: data.uom_id || null,
      barcode: data.barcode ? data.barcode.trim() : '',
      min_stock_level: Number(data.min_stock_level || 0),
      reorder_quantity: Number(data.reorder_quantity || 0),
      cost_price: Number(data.cost_price || 0),
      selling_price: Number(data.selling_price || 0),
      status: data.status || 'active',
      created_by: data.created_by || null,
      created_at: now,
      updated_at: now,
    };

    if (!this.data.inventory_items) this.data.inventory_items = [];
    this.data.inventory_items.push(item);

    // Initial stock setup if requested
    if (data.initial_warehouse_id && data.initial_quantity && data.initial_quantity > 0) {
      this.receiveStock({
        reference_no: `INIT-${cleanCode}`,
        item_id: item.id,
        warehouse_id: data.initial_warehouse_id,
        quantity: data.initial_quantity,
        notes: 'Initial opening stock',
        user_id: data.created_by || undefined,
      });
    } else {
      this.save();
    }

    return item;
  }

  public updateItem(id: number, data: Partial<InventoryItemEntity>): InventoryItemEntity | null {
    const it = this.getItemById(id);
    if (!it) return null;

    if (data.code !== undefined && data.code.trim()) {
      const cleanCode = data.code.trim().toUpperCase();
      if (cleanCode !== it.code) {
        const existing = this.getItemByCode(cleanCode);
        if (existing && existing.id !== id) {
          throw new Error(`Item code '${cleanCode}' is already assigned to another item.`);
        }
        it.code = cleanCode;
      }
    }

    if (data.name !== undefined) it.name = data.name.trim();
    if (data.description !== undefined) it.description = data.description.trim();
    if (data.category_id !== undefined) it.category_id = data.category_id;
    if (data.uom_id !== undefined) it.uom_id = data.uom_id;
    if (data.barcode !== undefined) it.barcode = data.barcode.trim();
    if (data.min_stock_level !== undefined) it.min_stock_level = Number(data.min_stock_level);
    if (data.reorder_quantity !== undefined) it.reorder_quantity = Number(data.reorder_quantity);
    if (data.cost_price !== undefined) it.cost_price = Number(data.cost_price);
    if (data.selling_price !== undefined) it.selling_price = Number(data.selling_price);
    if (data.status !== undefined) it.status = data.status;

    it.updated_at = new Date().toISOString();
    this.save();
    return it;
  }

  public deleteItem(id: number, forceDisable: boolean = false): { success: boolean; action: 'deleted' | 'disabled'; item?: InventoryItemEntity } {
    const it = this.getItemById(id);
    if (!it) return { success: false, action: 'deleted' };

    const hasTx = (this.data.stock_transactions || []).some(t => t.item_id === id);
    if (hasTx || forceDisable) {
      it.status = 'disabled';
      it.updated_at = new Date().toISOString();
      this.save();
      return { success: true, action: 'disabled', item: it };
    }

    const idx = (this.data.inventory_items || []).findIndex(i => i.id === id);
    if (idx !== -1) {
      this.data.inventory_items.splice(idx, 1);
      if (this.data.stock_balances) {
        this.data.stock_balances = this.data.stock_balances.filter(b => b.item_id !== id);
      }
      this.save();
      return { success: true, action: 'deleted', item: it };
    }
    return { success: false, action: 'deleted' };
  }

  // --- Stock Operations: Receive, Issue, Adjust, Transfer ---
  public receiveStock(data: {
    reference_no: string;
    item_id: number;
    warehouse_id: number;
    quantity: number;
    supplier_id?: number;
    unit_cost?: number;
    notes?: string;
    transaction_date?: string;
    user_id?: number;
  }): { transaction: StockTransactionEntity; new_balance: number } {
    const item = this.getItemById(data.item_id);
    if (!item) throw new Error("Inventory item not found.");
    const qty = Number(data.quantity);
    if (qty <= 0) throw new Error("Received quantity must be positive.");

    if (!this.data.stock_balances) this.data.stock_balances = [];
    let balance = this.data.stock_balances.find(b => b.item_id === data.item_id && b.warehouse_id === data.warehouse_id);
    const now = new Date().toISOString();

    if (balance) {
      balance.quantity = Number(balance.quantity) + qty;
      balance.updated_at = now;
    } else {
      const bId = this.data.stock_balances.length > 0 ? Math.max(...this.data.stock_balances.map(b => b.id)) + 1 : 1;
      balance = {
        id: bId,
        item_id: data.item_id,
        warehouse_id: data.warehouse_id,
        quantity: qty,
        updated_at: now,
      };
      this.data.stock_balances.push(balance);
    }

    if (!this.data.stock_transactions) this.data.stock_transactions = [];
    const tId = this.data.stock_transactions.length > 0 ? Math.max(...this.data.stock_transactions.map(t => t.id)) + 1 : 1;
    const tx: StockTransactionEntity = {
      id: tId,
      transaction_type: 'receipt',
      reference_no: data.reference_no.trim(),
      item_id: data.item_id,
      quantity: qty,
      destination_warehouse_id: data.warehouse_id,
      supplier_id: data.supplier_id || null,
      unit_cost: data.unit_cost !== undefined ? Number(data.unit_cost) : null,
      notes: data.notes ? data.notes.trim() : '',
      transaction_date: data.transaction_date || now,
      user_id: data.user_id || null,
      created_at: now,
    };
    this.data.stock_transactions.push(tx);
    this.save();
    return { transaction: tx, new_balance: balance.quantity };
  }

  public issueStock(data: {
    reference_no: string;
    item_id: number;
    warehouse_id: number;
    quantity: number;
    reason: string;
    notes?: string;
    transaction_date?: string;
    user_id?: number;
  }): { transaction: StockTransactionEntity; remaining_balance: number } {
    const item = this.getItemById(data.item_id);
    if (!item) throw new Error("Inventory item not found.");
    const qty = Number(data.quantity);
    if (qty <= 0) throw new Error("Issued quantity must be positive.");

    if (!this.data.stock_balances) this.data.stock_balances = [];
    const balance = this.data.stock_balances.find(b => b.item_id === data.item_id && b.warehouse_id === data.warehouse_id);
    const available = balance ? Number(balance.quantity) : 0;

    if (available < qty) {
      throw new Error(`Insufficient stock in warehouse. Available: ${available}, Requested: ${qty}. Negative stock is prohibited.`);
    }

    const now = new Date().toISOString();
    balance!.quantity = available - qty;
    balance!.updated_at = now;

    if (!this.data.stock_transactions) this.data.stock_transactions = [];
    const tId = this.data.stock_transactions.length > 0 ? Math.max(...this.data.stock_transactions.map(t => t.id)) + 1 : 1;
    const tx: StockTransactionEntity = {
      id: tId,
      transaction_type: 'issue',
      reference_no: data.reference_no.trim(),
      item_id: data.item_id,
      quantity: qty,
      source_warehouse_id: data.warehouse_id,
      reason: data.reason.trim(),
      notes: data.notes ? data.notes.trim() : '',
      transaction_date: data.transaction_date || now,
      user_id: data.user_id || null,
      created_at: now,
    };
    this.data.stock_transactions.push(tx);
    this.save();
    return { transaction: tx, remaining_balance: balance!.quantity };
  }

  public adjustStock(data: {
    reference_no: string;
    item_id: number;
    warehouse_id: number;
    actual_quantity: number;
    reason: string;
    notes?: string;
    user_id?: number;
  }): { transaction: StockTransactionEntity; difference: number; new_balance: number } {
    const item = this.getItemById(data.item_id);
    if (!item) throw new Error("Inventory item not found.");
    const actual = Number(data.actual_quantity);
    if (actual < 0) throw new Error("Counted quantity cannot be negative.");

    if (!this.data.stock_balances) this.data.stock_balances = [];
    let balance = this.data.stock_balances.find(b => b.item_id === data.item_id && b.warehouse_id === data.warehouse_id);
    const current = balance ? Number(balance.quantity) : 0;
    const diff = actual - current;
    const now = new Date().toISOString();

    if (balance) {
      balance.quantity = actual;
      balance.updated_at = now;
    } else {
      const bId = this.data.stock_balances.length > 0 ? Math.max(...this.data.stock_balances.map(b => b.id)) + 1 : 1;
      balance = {
        id: bId,
        item_id: data.item_id,
        warehouse_id: data.warehouse_id,
        quantity: actual,
        updated_at: now,
      };
      this.data.stock_balances.push(balance);
    }

    if (!this.data.stock_transactions) this.data.stock_transactions = [];
    const tId = this.data.stock_transactions.length > 0 ? Math.max(...this.data.stock_transactions.map(t => t.id)) + 1 : 1;
    const tx: StockTransactionEntity = {
      id: tId,
      transaction_type: 'adjustment',
      reference_no: data.reference_no.trim(),
      item_id: data.item_id,
      quantity: diff,
      destination_warehouse_id: data.warehouse_id,
      reason: data.reason.trim(),
      notes: data.notes ? data.notes.trim() : '',
      transaction_date: now,
      user_id: data.user_id || null,
      created_at: now,
    };
    this.data.stock_transactions.push(tx);
    this.save();
    return { transaction: tx, difference: diff, new_balance: actual };
  }

  public transferStock(data: {
    reference_no: string;
    item_id: number;
    source_warehouse_id: number;
    destination_warehouse_id: number;
    quantity: number;
    notes?: string;
    user_id?: number;
  }): { transaction: StockTransactionEntity } {
    if (data.source_warehouse_id === data.destination_warehouse_id) {
      throw new Error("Source and destination warehouses must be different.");
    }
    const item = this.getItemById(data.item_id);
    if (!item) throw new Error("Inventory item not found.");
    const qty = Number(data.quantity);
    if (qty <= 0) throw new Error("Transfer quantity must be positive.");

    if (!this.data.stock_balances) this.data.stock_balances = [];
    const srcBalance = this.data.stock_balances.find(b => b.item_id === data.item_id && b.warehouse_id === data.source_warehouse_id);
    const available = srcBalance ? Number(srcBalance.quantity) : 0;
    if (available < qty) {
      throw new Error(`Insufficient stock in source warehouse. Available: ${available}, Required: ${qty}.`);
    }

    const now = new Date().toISOString();
    srcBalance!.quantity = available - qty;
    srcBalance!.updated_at = now;

    let destBalance = this.data.stock_balances.find(b => b.item_id === data.item_id && b.warehouse_id === data.destination_warehouse_id);
    if (destBalance) {
      destBalance.quantity = Number(destBalance.quantity) + qty;
      destBalance.updated_at = now;
    } else {
      const bId = this.data.stock_balances.length > 0 ? Math.max(...this.data.stock_balances.map(b => b.id)) + 1 : 1;
      destBalance = {
        id: bId,
        item_id: data.item_id,
        warehouse_id: data.destination_warehouse_id,
        quantity: qty,
        updated_at: now,
      };
      this.data.stock_balances.push(destBalance);
    }

    if (!this.data.stock_transactions) this.data.stock_transactions = [];
    const tId = this.data.stock_transactions.length > 0 ? Math.max(...this.data.stock_transactions.map(t => t.id)) + 1 : 1;
    const tx: StockTransactionEntity = {
      id: tId,
      transaction_type: 'transfer',
      reference_no: data.reference_no.trim(),
      item_id: data.item_id,
      quantity: qty,
      source_warehouse_id: data.source_warehouse_id,
      destination_warehouse_id: data.destination_warehouse_id,
      notes: data.notes ? data.notes.trim() : '',
      transaction_date: now,
      user_id: data.user_id || null,
      created_at: now,
    };
    this.data.stock_transactions.push(tx);
    this.save();
    return { transaction: tx };
  }

  // --- Movements Ledger ---
  public getStockMovements(options: {
    item_id?: number;
    transaction_type?: string;
    warehouse_id?: number;
    page?: number;
    pageSize?: number;
  }): {
    transactions: any[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  } {
    let list = [...(this.data.stock_transactions || [])];

    if (options.item_id) {
      list = list.filter(t => t.item_id === Number(options.item_id));
    }
    if (options.transaction_type && options.transaction_type !== 'all') {
      list = list.filter(t => t.transaction_type === options.transaction_type);
    }
    if (options.warehouse_id) {
      const wid = Number(options.warehouse_id);
      list = list.filter(t => t.source_warehouse_id === wid || t.destination_warehouse_id === wid);
    }

    list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const total = list.length;
    const page = Math.max(1, options.page || 1);
    const pageSize = Math.max(1, options.pageSize || 20);
    const offset = (page - 1) * pageSize;
    const paged = list.slice(offset, offset + pageSize);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    const enriched = paged.map(t => {
      const item = this.getItemById(t.item_id);
      const srcWh = t.source_warehouse_id ? this.getWarehouseById(t.source_warehouse_id) : undefined;
      const destWh = t.destination_warehouse_id ? this.getWarehouseById(t.destination_warehouse_id) : undefined;
      const supplier = t.supplier_id ? this.getSupplierById(t.supplier_id) : undefined;
      const user = t.user_id ? this.findUserById(t.user_id) : undefined;

      return {
        ...t,
        item_code: item?.code,
        item_name: item?.name,
        source_warehouse_name: srcWh?.name,
        destination_warehouse_name: destWh?.name,
        supplier_name: supplier?.name,
        user_name: user?.name,
      };
    });

    return {
      transactions: enriched,
      total,
      page,
      pageSize,
      totalPages,
    };
  }

  // --- Low Stock Alerts ---
  public getLowStockAlerts(): any[] {
    const items = (this.data.inventory_items || []).filter(i => i.status === 'active');
    const alerts: any[] = [];

    for (const it of items) {
      const totalQty = this.getItemTotalOnHand(it.id);
      if (totalQty <= it.min_stock_level) {
        const cat = it.category_id ? this.getCategoryById(it.category_id) : undefined;
        const uom = it.uom_id ? this.getUOMById(it.uom_id) : undefined;
        alerts.push({
          item_id: it.id,
          item_code: it.code,
          item_name: it.name,
          category_name: cat?.name,
          uom_symbol: uom?.symbol,
          quantity_on_hand: totalQty,
          min_stock_level: it.min_stock_level,
          reorder_quantity: it.reorder_quantity,
          status: totalQty === 0 ? 'out_of_stock' : 'low_stock',
        });
      }
    }
    return alerts;
  }

  // --- Dashboard Data ---
  public getInventoryDashboard(): {
    total_active_items: number;
    total_quantity_on_hand: number;
    low_stock_items_count: number;
    out_of_stock_items_count: number;
    recent_receipts_count: number;
    recent_issues_count: number;
    recent_adjustments_count: number;
    recent_transfers_count: number;
    inventory_valuation: number;
    pending_reorders_count: number;
    counteroffers_count: number;
    stock_by_location: Array<{ warehouse_id: number; warehouse_name: string; warehouse_code: string; total_quantity: number; items_count: number }>;
  } {
    const activeItems = (this.data.inventory_items || []).filter(i => i.status === 'active');
    let totalQty = 0;
    let lowStock = 0;
    let outOfStock = 0;
    let valuation = 0;

    for (const it of activeItems) {
      const qty = this.getItemTotalOnHand(it.id);
      totalQty += qty;
      if (qty === 0) outOfStock++;
      else if (qty <= it.min_stock_level) lowStock++;
      if (it.cost_price > 0) valuation += qty * it.cost_price;
    }

    const txs = this.data.stock_transactions || [];
    const reorders = this.data.reorder_requests || [];
    const pendingReorders = reorders.filter(r => r.status === 'pending_supplier_response' || r.status === 'revised_offer').length;
    const counteroffers = reorders.filter(r => r.status === 'counteroffer_received').length;

    // Aggregate stock by warehouse
    const warehouses = this.getWarehouses();
    const balances = this.data.stock_balances || [];
    const stockByLocation = warehouses.map(wh => {
      const whBalances = balances.filter(b => b.warehouse_id === wh.id);
      const totalWhQty = whBalances.reduce((sum, b) => sum + Number(b.quantity || 0), 0);
      const itemsCount = whBalances.filter(b => Number(b.quantity || 0) > 0).length;
      return {
        warehouse_id: wh.id,
        warehouse_name: wh.name,
        warehouse_code: wh.code,
        total_quantity: totalWhQty,
        items_count: itemsCount,
      };
    });

    return {
      total_active_items: activeItems.length,
      total_quantity_on_hand: totalQty,
      low_stock_items_count: lowStock,
      out_of_stock_items_count: outOfStock,
      recent_receipts_count: txs.filter(t => t.transaction_type === 'receipt').length,
      recent_issues_count: txs.filter(t => t.transaction_type === 'issue').length,
      recent_adjustments_count: txs.filter(t => t.transaction_type === 'adjustment').length,
      recent_transfers_count: txs.filter(t => t.transaction_type === 'transfer').length,
      inventory_valuation: valuation,
      pending_reorders_count: pendingReorders,
      counteroffers_count: counteroffers,
      stock_by_location: stockByLocation,
    };
  }

  // ==========================================
  // ONLINE SUPPLIER REORDERING & NEGOTIATIONS
  // ==========================================

  public getNextReorderNo(): string {
    const list = this.data.reorder_requests || [];
    let maxNum = list.length;
    for (const r of list) {
      const match = r.reorder_no.match(/RO-(\d+)/i);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) maxNum = num;
      }
    }
    let next = maxNum + 1;
    let no = `RO-${String(next).padStart(5, '0')}`;
    while (list.some(r => r.reorder_no.toUpperCase() === no.toUpperCase())) {
      next++;
      no = `RO-${String(next).padStart(5, '0')}`;
    }
    return no;
  }

  public createReorderRequest(data: {
    item_id: number;
    supplier_id: number;
    quantity: number;
    unit_price: number;
    expected_delivery_date?: string | null;
    notes?: string;
    user_id?: number | null;
  }): { reorder: ReorderRequestEntity; token: string } {
    const item = this.getItemById(data.item_id);
    if (!item) throw new Error("Inventory item not found.");

    const supplier = this.getSupplierById(data.supplier_id);
    if (!supplier) throw new Error("Supplier not found.");

    const qty = Number(data.quantity);
    if (qty <= 0) throw new Error("Reorder quantity must be greater than zero.");

    const unitPrice = Number(data.unit_price);
    if (unitPrice < 0) throw new Error("Unit price cannot be negative.");

    const totalAmount = qty * unitPrice;
    const reorderNo = this.getNextReorderNo();
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    const expiryHours = parseInt(process.env.SUPPLIER_LINK_EXPIRY_HOURS || '72', 10);
    const expiresAt = new Date(Date.now() + expiryHours * 3600 * 1000).toISOString();
    const now = new Date().toISOString();

    const id = (this.data.reorder_requests || []).length > 0
      ? Math.max(...this.data.reorder_requests.map(r => r.id)) + 1
      : 1;

    const reorder: ReorderRequestEntity = {
      id,
      reorder_no: reorderNo,
      item_id: data.item_id,
      supplier_id: data.supplier_id,
      quantity: qty,
      unit_price: unitPrice,
      total_amount: totalAmount,
      expected_delivery_date: data.expected_delivery_date || null,
      notes: data.notes ? data.notes.trim() : '',
      status: 'pending_supplier_response',
      supplier_token_hash: tokenHash,
      token_expires_at: expiresAt,
      responded_at: null,
      supplier_response_notes: null,
      counter_unit_price: null,
      counter_quantity: null,
      counter_delivery_date: null,
      rejection_reason: null,
      created_by: data.user_id || null,
      created_at: now,
      updated_at: now,
    };

    if (!this.data.reorder_requests) this.data.reorder_requests = [];
    this.data.reorder_requests.push(reorder);

    // Initial audit / negotiation timeline
    if (!this.data.reorder_negotiations) this.data.reorder_negotiations = [];
    const negId = this.data.reorder_negotiations.length > 0
      ? Math.max(...this.data.reorder_negotiations.map(n => n.id)) + 1
      : 1;

    this.data.reorder_negotiations.push({
      id: negId,
      reorder_id: reorder.id,
      actor: 'buyer',
      action: 'REORDER_CREATED',
      unit_price: unitPrice,
      quantity: qty,
      delivery_date: data.expected_delivery_date || null,
      notes: data.notes || 'Initial purchase reorder proposed.',
      timestamp: now,
    });

    this.save();
    return { reorder, token: rawToken };
  }

  public getReorders(options: {
    status?: string;
    item_id?: number;
    supplier_id?: number;
    search?: string;
    page?: number;
    pageSize?: number;
  }): {
    reorders: any[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  } {
    let list = [...(this.data.reorder_requests || [])];

    if (options.status && options.status !== 'all') {
      list = list.filter(r => r.status === options.status);
    }
    if (options.item_id) {
      list = list.filter(r => r.item_id === Number(options.item_id));
    }
    if (options.supplier_id) {
      list = list.filter(r => r.supplier_id === Number(options.supplier_id));
    }
    if (options.search && options.search.trim()) {
      const q = options.search.trim().toLowerCase();
      list = list.filter(r => {
        const it = this.getItemById(r.item_id);
        const sup = this.getSupplierById(r.supplier_id);
        return (
          r.reorder_no.toLowerCase().includes(q) ||
          (it && (it.name.toLowerCase().includes(q) || it.code.toLowerCase().includes(q))) ||
          (sup && sup.name.toLowerCase().includes(q))
        );
      });
    }

    list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const total = list.length;
    const page = Math.max(1, options.page || 1);
    const pageSize = Math.max(1, options.pageSize || 10);
    const offset = (page - 1) * pageSize;
    const paged = list.slice(offset, offset + pageSize);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    const enriched = paged.map(r => this.enrichReorder(r));

    return {
      reorders: enriched,
      total,
      page,
      pageSize,
      totalPages,
    };
  }

  public getReorderById(id: number): any | null {
    const r = (this.data.reorder_requests || []).find(req => req.id === id);
    if (!r) return null;
    return this.enrichReorder(r);
  }

  public getReorderByToken(rawToken: string): { reorder?: any; isExpired?: boolean; error?: string } {
    if (!rawToken || !rawToken.trim()) {
      return { error: 'Invalid or missing link token.' };
    }
    const tokenHash = crypto.createHash('sha256').update(rawToken.trim()).digest('hex');
    const r = (this.data.reorder_requests || []).find(req => req.supplier_token_hash === tokenHash);
    if (!r) {
      return { error: 'Invalid or unrecognized supplier reorder link.' };
    }

    const isExpired = new Date(r.token_expires_at).getTime() < Date.now();
    const enriched = this.enrichReorder(r);

    if (isExpired) {
      return { reorder: enriched, isExpired: true, error: 'This secure reorder link has expired. Please contact the procurement team.' };
    }

    return { reorder: enriched, isExpired: false };
  }

  public supplierAcceptReorder(rawToken: string, notes?: string): { success: boolean; reorder: any; message: string } {
    const verified = this.getReorderByToken(rawToken);
    if (verified.error || !verified.reorder) {
      throw new Error(verified.error || 'Invalid or expired token.');
    }
    if (verified.isExpired) {
      throw new Error('This supplier link has expired.');
    }

    const r = (this.data.reorder_requests || []).find(req => req.id === verified.reorder.id);
    if (!r) throw new Error('Reorder request not found.');

    if (r.status === 'accepted') {
      return { success: true, reorder: this.enrichReorder(r), message: 'Reorder has already been accepted.' };
    }
    if (r.status === 'cancelled') {
      throw new Error('This reorder has been cancelled by the purchasing organization.');
    }

    const now = new Date().toISOString();
    r.status = 'accepted';
    r.responded_at = now;
    r.supplier_response_notes = notes ? notes.trim() : 'Supplier accepted proposed terms.';
    r.updated_at = now;

    const negId = (this.data.reorder_negotiations || []).length > 0
      ? Math.max(...this.data.reorder_negotiations.map(n => n.id)) + 1
      : 1;

    this.data.reorder_negotiations.push({
      id: negId,
      reorder_id: r.id,
      actor: 'supplier',
      action: 'SUPPLIER_ACCEPTED',
      unit_price: r.unit_price,
      quantity: r.quantity,
      delivery_date: r.expected_delivery_date,
      notes: r.supplier_response_notes,
      timestamp: now,
    });

    this.save();
    return { success: true, reorder: this.enrichReorder(r), message: 'You have accepted the reorder request. The buyer has been notified.' };
  }

  public supplierNegotiateReorder(rawToken: string, counter: {
    unit_price: number;
    quantity: number;
    delivery_date?: string;
    notes: string;
  }): { success: boolean; reorder: any; message: string } {
    const verified = this.getReorderByToken(rawToken);
    if (verified.error || !verified.reorder) {
      throw new Error(verified.error || 'Invalid or expired token.');
    }
    if (verified.isExpired) {
      throw new Error('This supplier link has expired.');
    }

    const r = (this.data.reorder_requests || []).find(req => req.id === verified.reorder.id);
    if (!r) throw new Error('Reorder request not found.');

    if (r.status === 'cancelled') {
      throw new Error('This reorder has been cancelled by the purchasing organization.');
    }

    const unitPrice = Number(counter.unit_price);
    const qty = Number(counter.quantity);
    if (unitPrice <= 0 || qty <= 0) {
      throw new Error('Counteroffer price and quantity must be greater than zero.');
    }

    const now = new Date().toISOString();
    r.status = 'counteroffer_received';
    r.responded_at = now;
    r.counter_unit_price = unitPrice;
    r.counter_quantity = qty;
    r.counter_delivery_date = counter.delivery_date || null;
    r.supplier_response_notes = counter.notes ? counter.notes.trim() : 'Supplier submitted a counteroffer.';
    r.updated_at = now;

    const negId = (this.data.reorder_negotiations || []).length > 0
      ? Math.max(...this.data.reorder_negotiations.map(n => n.id)) + 1
      : 1;

    this.data.reorder_negotiations.push({
      id: negId,
      reorder_id: r.id,
      actor: 'supplier',
      action: 'SUPPLIER_COUNTEROFFER',
      unit_price: unitPrice,
      quantity: qty,
      delivery_date: counter.delivery_date || null,
      notes: r.supplier_response_notes,
      timestamp: now,
    });

    this.save();
    return {
      success: true,
      reorder: this.enrichReorder(r),
      message: 'Your counteroffer has been submitted and is awaiting review by the buyer.',
    };
  }

  public supplierRejectReorder(rawToken: string, reason: string): { success: boolean; reorder: any; message: string } {
    const verified = this.getReorderByToken(rawToken);
    if (verified.error || !verified.reorder) {
      throw new Error(verified.error || 'Invalid or expired token.');
    }
    if (!reason || !reason.trim()) {
      throw new Error('A rejection reason is mandatory.');
    }

    const r = (this.data.reorder_requests || []).find(req => req.id === verified.reorder.id);
    if (!r) throw new Error('Reorder request not found.');

    const now = new Date().toISOString();
    r.status = 'rejected';
    r.responded_at = now;
    r.rejection_reason = reason.trim();
    r.updated_at = now;

    const negId = (this.data.reorder_negotiations || []).length > 0
      ? Math.max(...this.data.reorder_negotiations.map(n => n.id)) + 1
      : 1;

    this.data.reorder_negotiations.push({
      id: negId,
      reorder_id: r.id,
      actor: 'supplier',
      action: 'SUPPLIER_REJECTED',
      unit_price: r.unit_price,
      quantity: r.quantity,
      delivery_date: null,
      notes: r.rejection_reason,
      timestamp: now,
    });

    this.save();
    return { success: true, reorder: this.enrichReorder(r), message: 'Reorder request rejected.' };
  }

  public buyerAcceptCounteroffer(reorderId: number, userId?: number, notes?: string): any {
    const r = (this.data.reorder_requests || []).find(req => req.id === reorderId);
    if (!r) throw new Error('Reorder request not found.');
    if (r.status !== 'counteroffer_received') {
      throw new Error(`Cannot accept counteroffer in status '${r.status}'.`);
    }

    const now = new Date().toISOString();
    if (r.counter_unit_price !== null && r.counter_unit_price !== undefined) {
      r.unit_price = r.counter_unit_price;
    }
    if (r.counter_quantity !== null && r.counter_quantity !== undefined) {
      r.quantity = r.counter_quantity;
    }
    if (r.counter_delivery_date) {
      r.expected_delivery_date = r.counter_delivery_date;
    }
    r.total_amount = r.unit_price * r.quantity;
    r.status = 'accepted';
    r.updated_at = now;

    const negId = (this.data.reorder_negotiations || []).length > 0
      ? Math.max(...this.data.reorder_negotiations.map(n => n.id)) + 1
      : 1;

    this.data.reorder_negotiations.push({
      id: negId,
      reorder_id: r.id,
      actor: 'buyer',
      action: 'BUYER_ACCEPTED_COUNTEROFFER',
      unit_price: r.unit_price,
      quantity: r.quantity,
      delivery_date: r.expected_delivery_date,
      notes: notes || 'Buyer accepted supplier counteroffer terms.',
      timestamp: now,
    });

    this.save();
    return this.enrichReorder(r);
  }

  public buyerReviseProposal(reorderId: number, data: {
    unit_price: number;
    quantity: number;
    expected_delivery_date?: string | null;
    notes?: string;
    userId?: number;
  }): { reorder: any; token: string } {
    const r = (this.data.reorder_requests || []).find(req => req.id === reorderId);
    if (!r) throw new Error('Reorder request not found.');

    const qty = Number(data.quantity);
    const unitPrice = Number(data.unit_price);
    if (qty <= 0 || unitPrice < 0) {
      throw new Error('Valid positive quantity and price are required.');
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiryHours = parseInt(process.env.SUPPLIER_LINK_EXPIRY_HOURS || '72', 10);
    const expiresAt = new Date(Date.now() + expiryHours * 3600 * 1000).toISOString();
    const now = new Date().toISOString();

    r.quantity = qty;
    r.unit_price = unitPrice;
    r.total_amount = qty * unitPrice;
    if (data.expected_delivery_date !== undefined) r.expected_delivery_date = data.expected_delivery_date;
    r.status = 'revised_offer';
    r.supplier_token_hash = tokenHash;
    r.token_expires_at = expiresAt;
    r.counter_unit_price = null;
    r.counter_quantity = null;
    r.counter_delivery_date = null;
    r.updated_at = now;

    const negId = (this.data.reorder_negotiations || []).length > 0
      ? Math.max(...this.data.reorder_negotiations.map(n => n.id)) + 1
      : 1;

    this.data.reorder_negotiations.push({
      id: negId,
      reorder_id: r.id,
      actor: 'buyer',
      action: 'BUYER_REVISED_OFFER',
      unit_price: unitPrice,
      quantity: qty,
      delivery_date: r.expected_delivery_date,
      notes: data.notes || 'Buyer submitted a revised proposal to the supplier.',
      timestamp: now,
    });

    this.save();
    return { reorder: this.enrichReorder(r), token: rawToken };
  }

  public buyerCancelReorder(reorderId: number, userId?: number, reason?: string): any {
    const r = (this.data.reorder_requests || []).find(req => req.id === reorderId);
    if (!r) throw new Error('Reorder request not found.');
    if (r.status === 'accepted') {
      throw new Error('Cannot cancel an order that has already been accepted.');
    }

    const now = new Date().toISOString();
    r.status = 'cancelled';
    r.updated_at = now;

    const negId = (this.data.reorder_negotiations || []).length > 0
      ? Math.max(...this.data.reorder_negotiations.map(n => n.id)) + 1
      : 1;

    this.data.reorder_negotiations.push({
      id: negId,
      reorder_id: r.id,
      actor: 'buyer',
      action: 'BUYER_CANCELLED',
      unit_price: r.unit_price,
      quantity: r.quantity,
      delivery_date: r.expected_delivery_date,
      notes: reason || 'Reorder request cancelled by buyer.',
      timestamp: now,
    });

    this.save();
    return this.enrichReorder(r);
  }

  public regenerateSupplierToken(reorderId: number): { reorder: any; token: string } {
    const r = (this.data.reorder_requests || []).find(req => req.id === reorderId);
    if (!r) throw new Error('Reorder request not found.');

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiryHours = parseInt(process.env.SUPPLIER_LINK_EXPIRY_HOURS || '72', 10);
    const expiresAt = new Date(Date.now() + expiryHours * 3600 * 1000).toISOString();
    const now = new Date().toISOString();

    r.supplier_token_hash = tokenHash;
    r.token_expires_at = expiresAt;
    r.updated_at = now;

    this.save();
    return { reorder: this.enrichReorder(r), token: rawToken };
  }

  public getNegotiationHistory(reorderId: number): ReorderNegotiationEntity[] {
    const list = (this.data.reorder_negotiations || []).filter(n => n.reorder_id === reorderId);
    return list.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }

  private enrichReorder(r: ReorderRequestEntity): any {
    const item = this.getItemById(r.item_id);
    const supplier = this.getSupplierById(r.supplier_id);
    const user = r.created_by ? this.findUserById(r.created_by) : undefined;
    const cat = item?.category_id ? this.getCategoryById(item.category_id) : undefined;
    const uom = item?.uom_id ? this.getUOMById(item.uom_id) : undefined;
    const currentStock = item ? this.getItemTotalOnHand(item.id) : 0;

    return {
      ...r,
      item_code: item?.code || 'N/A',
      item_name: item?.name || 'Unknown Item',
      category_name: cat?.name || 'General',
      uom_symbol: uom?.symbol || 'pcs',
      min_stock_level: item?.min_stock_level || 0,
      current_available_stock: currentStock,
      supplier_name: supplier?.name || 'Unknown Supplier',
      supplier_code: supplier?.code || 'N/A',
      supplier_email: supplier?.email || '',
      supplier_phone: supplier?.phone || '',
      supplier_contact_name: supplier ? `${supplier.contact_first_name || ''} ${supplier.contact_last_name || ''}`.trim() : '',
      created_by_name: user?.name || 'Purchasing Team',
    };
  }
}

export const store = new Store();
