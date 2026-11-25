import dotenv from 'dotenv';
dotenv.config();
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { getPool } from './db.ts';

export interface UserEntity {
  id: number;
  first_name: string;
  last_name: string;
  name: string;
  email: string;
  username: string;
  phone: string;
  department: string;
  profile_picture?: string;
  password_hash: string;
  password_history?: string[];
  role: string;
  roles?: string[];
  is_active: boolean;
  is_verified: boolean;
  last_login_at: string | null;
  created_at: string;
}

export interface DepartmentEntity {
  id: number;
  code: string;
  name: string;
  description: string;
  status: 'active' | 'disabled';
  created_at: string;
  updated_at: string;
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
  username?: string;
  action: string;
  module: string;
  details: string;
  previous_value?: string | null;
  updated_value?: string | null;
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

export interface SettingDefinition {
  key: string;
  category: string;
  label: string;
  description: string;
  type: 'text' | 'number' | 'boolean' | 'password' | 'select';
  options?: { value: string; label: string }[];
  envKey?: string;
  defaultValue: string;
  isSensitive?: boolean;
}

export interface EffectiveSettingItem extends SettingDefinition {
  value: string;
  env_default: string;
  is_overridden: boolean;
  updated_at?: string;
  updated_by?: string;
}

export interface CategorySummary {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: string;
  route: string;
  total_settings: number;
  overridden_count: number;
  is_operational?: boolean;
}

export const SYSTEM_SETTING_DEFINITIONS: SettingDefinition[] = [
  // 1. General Settings
  {
    key: 'app_name',
    category: 'general',
    label: 'Application Name',
    description: 'System name displayed in headers, emails, and browser tab title',
    type: 'text',
    envKey: 'APP_NAME',
    defaultValue: 'Nexora',
  },
  {
    key: 'company_name',
    category: 'general',
    label: 'Company / Organization Name',
    description: 'Legal operating entity name shown on reports, purchase orders, and invoices',
    type: 'text',
    envKey: 'APP_COMPANY',
    defaultValue: 'Toy BiZ ltd',
  },
  {
    key: 'support_email',
    category: 'general',
    label: 'Support Contact Email',
    description: 'Primary customer and internal support email address displayed on help pages',
    type: 'text',
    defaultValue: 'support@nexora.io',
  },
  {
    key: 'support_phone',
    category: 'general',
    label: 'Support Hotline Phone',
    description: 'Enterprise telephone support number for urgent system and order inquiries',
    type: 'text',
    defaultValue: '+91 80 4000 8900',
  },
  {
    key: 'company_address',
    category: 'general',
    label: 'Corporate Office Address',
    description: 'Operating registered business address displayed on official paperwork and invoices',
    type: 'text',
    defaultValue: 'Plot 42, Electronics City Phase 1, Bangalore, Karnataka 560100',
  },
  {
    key: 'app_url',
    category: 'general',
    label: 'Application Base URL',
    description: 'Fully qualified canonical URL for generating verification links and notifications',
    type: 'text',
    envKey: 'APP_URL',
    defaultValue: 'http://localhost:3000',
  },
  {
    key: 'help_url',
    category: 'general',
    label: 'Documentation & Knowledge Base URL',
    description: 'Destination URL for the navigation Help button and system guides',
    type: 'text',
    defaultValue: 'https://docs.nexora.io',
  },
  {
    key: 'app_env',
    category: 'general',
    label: 'Environment Mode',
    description: 'Active operating deployment environment (development / staging / production)',
    type: 'select',
    options: [
      { value: 'development', label: 'Development' },
      { value: 'staging', label: 'Staging' },
      { value: 'production', label: 'Production' },
    ],
    envKey: 'APP_ENV',
    defaultValue: 'development',
  },

  // 2. Regional Settings
  {
    key: 'timezone',
    category: 'regional',
    label: 'System Timezone',
    description: 'Default timezone applied to all audit timestamps, shift logs, and reports',
    type: 'select',
    options: [
      { value: 'Asia/Kolkata', label: 'Asia/Kolkata (IST +5:30)' },
      { value: 'UTC', label: 'UTC (Coordinated Universal Time)' },
      { value: 'America/New_York', label: 'America/New_York (EST/EDT)' },
      { value: 'Europe/London', label: 'Europe/London (GMT/BST)' },
      { value: 'Asia/Dubai', label: 'Asia/Dubai (GST +4:00)' },
      { value: 'Asia/Singapore', label: 'Asia/Singapore (SGT +8:00)' },
      { value: 'Asia/Tokyo', label: 'Asia/Tokyo (JST +9:00)' },
      { value: 'Europe/Berlin', label: 'Europe/Berlin (CET/CEST)' },
    ],
    envKey: 'APP_TIMEZONE',
    defaultValue: 'Asia/Kolkata',
  },
  {
    key: 'currency',
    category: 'regional',
    label: 'Primary Currency',
    description: 'Currency symbol and formatting applied to inventory valuation and purchase orders',
    type: 'select',
    options: [
      { value: 'INR', label: 'INR (₹ - Indian Rupee)' },
      { value: 'USD', label: 'USD ($ - US Dollar)' },
      { value: 'EUR', label: 'EUR (€ - Euro)' },
      { value: 'GBP', label: 'GBP (£ - British Pound)' },
      { value: 'AED', label: 'AED (د.إ - UAE Dirham)' },
      { value: 'SGD', label: 'SGD (S$ - Singapore Dollar)' },
    ],
    envKey: 'APP_CURRENCY',
    defaultValue: 'INR',
  },
  {
    key: 'date_format',
    category: 'regional',
    label: 'Date Display Format',
    description: 'Presentation format for calendar pickers, data tables, and export spreadsheets',
    type: 'select',
    options: [
      { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD (2026-10-30 - ISO 8601 Standard)' },
      { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY (30/10/2026 - British/Indian)' },
      { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY (10/30/2026 - US Standard)' },
      { value: 'DD-MMM-YYYY', label: 'DD-MMM-YYYY (30-Oct-2026)' },
    ],
    defaultValue: 'YYYY-MM-DD',
  },
  {
    key: 'time_format',
    category: 'regional',
    label: 'Time Display Format',
    description: 'Format for displaying timestamps across telemetry, audit logs, and workforce streams',
    type: 'select',
    options: [
      { value: '24h', label: '24-hour military clock (e.g. 14:30:00)' },
      { value: '12h', label: '12-hour clock with AM/PM (e.g. 02:30:00 PM)' },
    ],
    defaultValue: '24h',
  },
  {
    key: 'locale',
    category: 'regional',
    label: 'System Number & Language Locale',
    description: 'Formatting standard for numbers, currencies, and decimal separators',
    type: 'select',
    options: [
      { value: 'en-IN', label: 'English (India) - en-IN' },
      { value: 'en-US', label: 'English (United States) - en-US' },
      { value: 'en-GB', label: 'English (United Kingdom) - en-GB' },
      { value: 'de-DE', label: 'German (Germany) - de-DE' },
      { value: 'fr-FR', label: 'French (France) - fr-FR' },
    ],
    envKey: 'APP_LOCALE',
    defaultValue: 'en-IN',
  },

  // 3. Email & SMTP Settings
  {
    key: 'smtp_host',
    category: 'email_smtp',
    label: 'SMTP Server Hostname',
    description: 'Outgoing mail server address (e.g. smtp.gmail.com or mail.domain.com)',
    type: 'text',
    envKey: 'SMTP_HOST',
    defaultValue: 'smtp.gmail.com',
  },
  {
    key: 'smtp_port',
    category: 'email_smtp',
    label: 'SMTP Port',
    description: 'Connection port (typically 465 for SSL or 587 for STARTTLS)',
    type: 'number',
    envKey: 'SMTP_PORT',
    defaultValue: '465',
  },
  {
    key: 'smtp_secure',
    category: 'email_smtp',
    label: 'Use TLS / SSL Encryption',
    description: 'Enable strict SSL/TLS cryptographic channel encryption',
    type: 'boolean',
    envKey: 'SMTP_SECURE',
    defaultValue: 'true',
  },
  {
    key: 'smtp_user',
    category: 'email_smtp',
    label: 'SMTP Username / Account',
    description: 'Authenticated account email or username used to connect to mail server',
    type: 'text',
    envKey: 'SMTP_USER',
    defaultValue: 'toanuragsinha@gmail.com',
  },
  {
    key: 'smtp_password',
    category: 'email_smtp',
    label: 'SMTP Password / App Password',
    description: 'Password or dedicated application password (masked and protected)',
    type: 'password',
    envKey: 'SMTP_PASSWORD',
    defaultValue: '••••••••••••',
    isSensitive: true,
  },
  {
    key: 'smtp_from_name',
    category: 'email_smtp',
    label: 'Sender Display Name',
    description: 'Name appearing in email recipient inboxes (e.g. Nexora Services)',
    type: 'text',
    envKey: 'SMTP_FROM_NAME',
    defaultValue: 'Nexora Services',
  },
  {
    key: 'smtp_from_email',
    category: 'email_smtp',
    label: 'Sender Email Address',
    description: 'Return address for outgoing emails (must be authorized by your SMTP server)',
    type: 'text',
    envKey: 'SMTP_FROM_EMAIL',
    defaultValue: 'toanuragsinha@gmail.com',
  },
  {
    key: 'smtp_reply_to',
    category: 'email_smtp',
    label: 'Reply-To Email Address',
    description: 'Designated recipient when users click Reply in their email client',
    type: 'text',
    envKey: 'SMTP_REPLY_TO',
    defaultValue: 'toanuragsinha@gmail.com',
  },

  // 4. Notification Settings
  {
    key: 'enable_email_notifications',
    category: 'notifications',
    label: 'Dispatch Outgoing Email Notifications',
    description: 'Master toggle to enable or suppress all outgoing email communications',
    type: 'boolean',
    envKey: 'ENABLE_EMAIL_NOTIFICATIONS',
    defaultValue: 'true',
  },
  {
    key: 'system_alerts_enabled',
    category: 'notifications',
    label: 'Show In-App Notification Banners',
    description: 'Display interactive toast alert notifications inside the application shell',
    type: 'boolean',
    defaultValue: 'true',
  },
  {
    key: 'digest_frequency',
    category: 'notifications',
    label: 'Inventory & Stock Digest Frequency',
    description: 'Scheduled cadence for batch low-stock and reorder notification summaries',
    type: 'select',
    options: [
      { value: 'immediate', label: 'Immediate (Trigger on every event)' },
      { value: 'daily', label: 'Daily Digest (Morning 08:00 AM)' },
      { value: 'weekly', label: 'Weekly Summary (Monday Morning)' },
      { value: 'disabled', label: 'Disabled' },
    ],
    defaultValue: 'daily',
  },
  {
    key: 'notify_on_user_registration',
    category: 'notifications',
    label: 'Notify Administrators on Account Creation',
    description: 'Send confirmation email to Super Admins when a new user account is provisioned',
    type: 'boolean',
    defaultValue: 'true',
  },
  {
    key: 'notify_on_failed_logins',
    category: 'notifications',
    label: 'Alert on Excessive Failed Logins',
    description: 'Dispatch immediate security alert when an IP or account triggers lockout thresholds',
    type: 'boolean',
    defaultValue: 'true',
  },

  // 5. Branding Settings
  {
    key: 'organization_name',
    category: 'branding',
    label: 'Branding Organization Label',
    description: 'Company moniker displayed on the sidebar brand badge',
    type: 'text',
    envKey: 'APP_COMPANY',
    defaultValue: 'Toy BiZ ltd',
  },
  {
    key: 'brand_tagline',
    category: 'branding',
    label: 'System Tagline',
    description: 'Short descriptive motto rendered under the main brand badge',
    type: 'text',
    defaultValue: 'Enterprise Platform',
  },
  {
    key: 'app_logo_url',
    category: 'branding',
    label: 'Application Logo Asset URL / Path',
    description: 'Primary logo image displayed in the top sidebar navigation header',
    type: 'text',
    defaultValue: '/logo.svg',
  },
  {
    key: 'company_logo_url',
    category: 'branding',
    label: 'Company Brand Crest URL / Path',
    description: 'Secondary brand emblem rendered on printed PO PDFs and delivery slips',
    type: 'text',
    defaultValue: '/company-logo.svg',
  },
  {
    key: 'primary_brand_color',
    category: 'branding',
    label: 'Primary Action Accent (#Hex)',
    description: 'Primary button and navigation active indicator color (#0084CC)',
    type: 'text',
    defaultValue: '#0084CC',
  },
  {
    key: 'accent_brand_color',
    category: 'branding',
    label: 'Secondary Cyan Highlight (#Hex)',
    description: 'Subtle accent color for chips, progress meters, and badges (#00B8E8)',
    type: 'text',
    defaultValue: '#00B8E8',
  },
  {
    key: 'footer_text',
    category: 'branding',
    label: 'Global Application Footer',
    description: 'Copyright and compliance text displayed in dashboard and email footers',
    type: 'text',
    defaultValue: '© 2026 Nexora Platform. All rights reserved.',
  },

  // 6. Application Preferences
  {
    key: 'default_landing_page',
    category: 'application_preferences',
    label: 'Default Post-Login Landing Page',
    description: 'First screen presented to authenticated users upon signing in',
    type: 'select',
    options: [
      { value: '/dashboard', label: 'Executive Dashboard (/dashboard)' },
      { value: '/inventory/items', label: 'Items Master Directory (/inventory/items)' },
      { value: '/suppliers/directory', label: 'Suppliers Directory (/suppliers/directory)' },
      { value: '/workforce/performance/live', label: 'Live Workforce Stream (/workforce/performance/live)' },
    ],
    defaultValue: '/dashboard',
  },
  {
    key: 'items_per_page',
    category: 'application_preferences',
    label: 'Default Table Page Size',
    description: 'Initial number of records displayed per page in all data tables',
    type: 'select',
    options: [
      { value: '10', label: '10 records per page' },
      { value: '25', label: '25 records per page' },
      { value: '50', label: '50 records per page' },
      { value: '100', label: '100 records per page' },
    ],
    defaultValue: '10',
  },
  {
    key: 'compact_table_mode',
    category: 'application_preferences',
    label: 'Compact Data Table Density',
    description: 'Reduce row padding across tables to maximize on-screen information density',
    type: 'boolean',
    defaultValue: 'false',
  },
  {
    key: 'auto_refresh_interval_seconds',
    category: 'application_preferences',
    label: 'Live Telemetry Refresh Interval',
    description: 'Polling interval in seconds for live workforce stream and inventory counters',
    type: 'select',
    options: [
      { value: '15', label: '15 seconds (High Frequency)' },
      { value: '30', label: '30 seconds (Balanced - Recommended)' },
      { value: '60', label: '60 seconds (Conserve Bandwidth)' },
      { value: '120', label: '2 minutes' },
    ],
    defaultValue: '30',
  },
  {
    key: 'theme_mode',
    category: 'application_preferences',
    label: 'Application Theme Mode',
    description: 'Visual brightness and contrast theme mode',
    type: 'select',
    options: [
      { value: 'system', label: 'System Automatic' },
      { value: 'light', label: 'Clean Enterprise Light (#F6F9FC)' },
    ],
    defaultValue: 'light',
  },

  // 7. Workforce Settings
  {
    key: 'work_event_cooldown_seconds',
    category: 'workforce',
    label: 'Work Event Anti-Spam Cooldown (Seconds)',
    description: 'Cooldown duration in seconds preventing double-scanning of RFID barcode badges',
    type: 'number',
    envKey: 'WORK_EVENT_COOLDOWN_SECONDS',
    defaultValue: '60',
  },
  {
    key: 'max_daily_shifts',
    category: 'workforce',
    label: 'Maximum Daily Consecutive Shifts',
    description: 'Compliance safety limit on consecutive operator shifts within a 24-hour cycle',
    type: 'number',
    defaultValue: '2',
  },
  {
    key: 'overtime_threshold_hours',
    category: 'workforce',
    label: 'Daily Overtime Threshold (Hours)',
    description: 'Hours worked after which productivity calculations enter overtime rates',
    type: 'number',
    defaultValue: '8',
  },
  {
    key: 'auto_checkout_timeout_hours',
    category: 'workforce',
    label: 'Auto-Checkout Inactivity Timeout (Hours)',
    description: 'Elapsed hours after which an unclosed employee shift is automatically flagged for review',
    type: 'number',
    defaultValue: '12',
  },
  {
    key: 'hardware_button_press_interval_ms',
    category: 'workforce',
    label: 'Hardware Debounce Threshold (ms)',
    description: 'Minimum duration between successive operator physical button triggers',
    type: 'number',
    defaultValue: '500',
  },
  {
    key: 'enable_live_monitoring',
    category: 'workforce',
    label: 'Stream Live Operator Activity',
    description: 'Broadcast real-time operator work transactions to the live monitor and full-screen view',
    type: 'boolean',
    defaultValue: 'true',
  },

  // 8. Supplier Settings
  {
    key: 'supplier_link_expiry_hours',
    category: 'supplier',
    label: 'Portal Access Link Expiry (Hours)',
    description: 'Validity duration for secure supplier reorder negotiation invitation tokens',
    type: 'number',
    envKey: 'SUPPLIER_LINK_EXPIRY_HOURS',
    defaultValue: '72',
  },
  {
    key: 'default_payment_terms_days',
    category: 'supplier',
    label: 'Standard Invoicing & Payment Terms (Days)',
    description: 'Default net payment terms applied to new supplier contracts (e.g. Net 30)',
    type: 'number',
    defaultValue: '30',
  },
  {
    key: 'quotation_approval_threshold',
    category: 'supplier',
    label: 'Purchase Order Approval Threshold Amount (₹)',
    description: 'Order value exceeding which requires formal executive counter-signing',
    type: 'number',
    defaultValue: '50000',
  },
  {
    key: 'allow_counter_offers',
    category: 'supplier',
    label: 'Allow Suppliers to Propose Counter-Offers',
    description: 'Permit invited suppliers to submit counter unit prices and revised delivery dates',
    type: 'boolean',
    defaultValue: 'true',
  },
  {
    key: 'auto_notify_supplier_updates',
    category: 'supplier',
    label: 'Auto-Notify Procurement on Negotiation Updates',
    description: 'Dispatch immediate email alert when a supplier accepts or submits a counter-offer',
    type: 'boolean',
    defaultValue: 'true',
  },

  // 9. Security Settings
  {
    key: 'min_password_length',
    category: 'security',
    label: 'Minimum Password Length',
    description: 'Minimum number of characters required for all user and admin passwords',
    type: 'number',
    defaultValue: '8',
  },
  {
    key: 'require_uppercase',
    category: 'security',
    label: 'Require Uppercase Letter',
    description: 'Enforce presence of at least one uppercase letter (A-Z) in passwords',
    type: 'boolean',
    defaultValue: 'true',
  },
  {
    key: 'require_numbers',
    category: 'security',
    label: 'Require Numeric Digit',
    description: 'Enforce presence of at least one number (0-9) in passwords',
    type: 'boolean',
    defaultValue: 'true',
  },
  {
    key: 'require_symbols',
    category: 'security',
    label: 'Require Special Symbol',
    description: 'Enforce presence of special characters (@, $, !, %, *, ?, &, #) in passwords',
    type: 'boolean',
    defaultValue: 'true',
  },
  {
    key: 'session_timeout_minutes',
    category: 'security',
    label: 'Inactive Session Auto-Logout (Minutes)',
    description: 'Idle time before an inactive user token is expired and redirected to login',
    type: 'number',
    defaultValue: '15',
  },
  {
    key: 'max_login_attempts',
    category: 'security',
    label: 'Max Failed Login Attempts Before Lockout',
    description: 'Number of consecutive incorrect passwords before temporarily locking account',
    type: 'number',
    defaultValue: '5',
  },
  {
    key: 'lockout_duration_minutes',
    category: 'security',
    label: 'Account Lockout Duration (Minutes)',
    description: 'Cooldown minutes an account remains locked after repeated failed logins',
    type: 'number',
    defaultValue: '15',
  },
  {
    key: 'reset_token_expiry_minutes',
    category: 'security',
    label: 'Password Reset Token Expiration (Minutes)',
    description: 'Duration before a generated forgot-password email token becomes invalid',
    type: 'number',
    envKey: 'PASSWORD_RESET_EXPIRES_MINUTES',
    defaultValue: '15',
  },
  {
    key: 'auto_backup_schedule',
    category: 'security',
    label: 'Automated Database Snapshot Frequency',
    description: 'Scheduled recurrence for automatic persistent database backups',
    type: 'select',
    options: [
      { value: 'disabled', label: 'Disabled (Manual only)' },
      { value: 'daily_midnight', label: 'Daily at 00:00 Midnight' },
      { value: 'every_12_hours', label: 'Every 12 Hours' },
      { value: 'weekly_sunday', label: 'Weekly on Sunday' },
    ],
    defaultValue: 'daily_midnight',
  },
];

export interface UserSessionEntity {
  id: number;
  user_id: number;
  username?: string;
  employee_name?: string;
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
  contact_person?: string;
  payment_terms?: string;
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
  manager_name?: string;
  manager_email?: string;
  manager_phone?: string;
  warehouse_type?: 'Distribution Center' | 'Regional Hub' | 'Transit Depot' | 'Quarantine';
  capacity?: number;
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
  item_type?: 'raw_material' | 'component' | 'finished_good' | 'consumable';
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
  status: 'draft' | 'pending_supplier_response' | 'counteroffer_received' | 'accepted' | 'rejected' | 'revised_offer' | 'cancelled' | 'partially_received' | 'received' | 'closed';
  supplier_token_hash: string;
  token_expires_at: string;
  responded_at: string | null;
  supplier_response_notes: string | null;
  counter_unit_price: number | null;
  counter_quantity: number | null;
  counter_delivery_date: string | null;
  rejection_reason: string | null;
  received_quantity?: number;
  destination_warehouse_id?: number | null;
  created_by?: number | null;
  created_at: string;
  updated_at: string;
}

export interface StockTransferEntity {
  id: number;
  transfer_no: string;
  source_warehouse_id: number;
  destination_warehouse_id: number;
  item_id: number;
  requested_quantity: number;
  dispatched_quantity?: number;
  received_quantity?: number;
  status: 'draft' | 'pending_approval' | 'approved' | 'in_transit' | 'partially_received' | 'received' | 'rejected' | 'cancelled';
  rejection_reason?: string | null;
  notes?: string;
  dispatched_at?: string | null;
  received_at?: string | null;
  created_by?: number | null;
  created_by_name?: string;
  created_at: string;
  updated_at: string;
}

export interface StockVerificationItem {
  item_id: number;
  item_code: string;
  item_name: string;
  system_quantity: number;
  counted_quantity: number;
  variance: number;
  cost_price: number;
  variance_value: number;
  reason?: string;
}

export interface StockVerificationEntity {
  id: number;
  verification_no: string;
  warehouse_id: number;
  status: 'draft' | 'pending_approval' | 'approved' | 'rejected';
  items: StockVerificationItem[];
  total_items: number;
  total_variance_units: number;
  total_variance_value: number;
  notes?: string;
  created_by?: number | null;
  created_by_name?: string;
  approved_by?: number | null;
  approved_by_name?: string;
  approved_at?: string | null;
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

export interface PasswordResetTokenEntity {
  id: number;
  user_id: number;
  token_hash: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

export interface DatabaseBackupEntity {
  id: string;
  filename: string;
  backup_type: 'MANUAL' | 'SCHEDULED';
  size_bytes: number;
  table_count: number;
  status: 'COMPLETED' | 'VERIFIED' | 'FAILED';
  sha256?: string;
  created_by: string;
  notes?: string;
  created_at: string;
  completed_at?: string;
}

export interface PendingEmailChangeEntity {
  id: number;
  user_id: number;
  current_email: string;
  new_email: string;
  token_hash: string;
  verification_code: string;
  expires_at: string;
  created_at: string;
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
  password_reset_tokens: PasswordResetTokenEntity[];
  departments: DepartmentEntity[];
  suppliers: SupplierEntity[];
  inventory_categories: InventoryCategoryEntity[];
  units_of_measure: UnitOfMeasureEntity[];
  warehouses: WarehouseEntity[];
  inventory_items: InventoryItemEntity[];
  stock_balances: StockBalanceEntity[];
  stock_transactions: StockTransactionEntity[];
  reorder_requests: ReorderRequestEntity[];
  reorder_negotiations: ReorderNegotiationEntity[];
  database_backups: DatabaseBackupEntity[];
  pending_email_changes: PendingEmailChangeEntity[];
  stock_transfers?: StockTransferEntity[];
  stock_verifications?: StockVerificationEntity[];
}

class Store {
  private pgHydrated = false;
  private pgLastSavedBytes = 0;
  private pgWriteQueue: Promise<void> = Promise.resolve();
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
    password_reset_tokens: [],
    departments: [],
    suppliers: [],
    inventory_categories: [],
    units_of_measure: [],
    warehouses: [],
    inventory_items: [],
    stock_balances: [],
    stock_transactions: [],
    reorder_requests: [],
    reorder_negotiations: [],
    database_backups: [],
    pending_email_changes: [],
    stock_transfers: [],
    stock_verifications: [],
  };

  constructor() {
    this.normalizeData();
    this.initSeed();
  }

  /**
   * Hydrates the store directly from PostgreSQL (`nexora_app_state`).
   * Zero JSON or file-based storage is ever read or written.
   */
  public async hydrateFromPostgres(): Promise<boolean> {
    if (!process.env.DATABASE_URL || process.env.DISABLE_PG_FOR_TESTS === 'true') {
      return false;
    }
    try {
      const pool = getPool();
      const res = await pool.query<{ state_data: any }>(
        `SELECT state_data FROM nexora_app_state WHERE state_key = 'primary' LIMIT 1`
      );
      if (res.rows[0]?.state_data && typeof res.rows[0].state_data === 'object') {
        const parsed = res.rows[0].state_data;
        for (const key of Object.keys(parsed)) {
          (this.data as any)[key] = parsed[key];
        }
        this.pgLastSavedBytes = Buffer.byteLength(JSON.stringify(parsed), 'utf-8');
      }
      this.normalizeData();
      this.initSeed();
      this.pgHydrated = true;
      await this.persistSnapshotToPostgres(JSON.stringify(this.data));
      return true;
    } catch (err: any) {
      console.warn('[PostgreSQL Store Hydrate Note]:', err?.message || err);
      return false;
    }
  }

  private async persistSnapshotToPostgres(payload: string): Promise<void> {
    if (!process.env.DATABASE_URL || process.env.DISABLE_PG_FOR_TESTS === 'true') {
      return;
    }
    try {
      const pool = getPool();
      await pool.query(
        `INSERT INTO nexora_app_state (state_key, state_data, updated_at)
         VALUES ('primary', $1::jsonb, NOW())
         ON CONFLICT (state_key)
         DO UPDATE SET state_data = EXCLUDED.state_data, updated_at = NOW()`,
        [payload]
      );
      this.pgHydrated = true;
      this.pgLastSavedBytes = Buffer.byteLength(payload, 'utf-8');
    } catch (err: any) {
      console.warn('[PostgreSQL Store Persist Warning]:', err?.message || err);
    }
  }

  /**
   * Persists state atomically to PostgreSQL (`nexora_app_state`).
   * No JSON, CSV, XML, TXT, or local data files are written to disk.
   */
  public save() {
    const payload = JSON.stringify(this.data);
    this.pgLastSavedBytes = Buffer.byteLength(payload, 'utf-8');
    if (!process.env.DATABASE_URL || process.env.DISABLE_PG_FOR_TESTS === 'true') {
      return;
    }
    this.pgWriteQueue = this.pgWriteQueue
      .then(() => this.persistSnapshotToPostgres(payload))
      .catch(() => {});
  }

  public async flushPendingWrites(): Promise<void> {
    await this.pgWriteQueue.catch(() => {});
  }

  public reloadFromDisk() {
    void this.hydrateFromPostgres();
  }

  public getStorePath(): string {
    return 'postgresql://nexora_app_state';
  }

  public checkHealth(): { available: boolean; writable: boolean; size_bytes: number; engine: string } {
    if (process.env.DISABLE_PG_FOR_TESTS === 'true') {
      return {
        available: true,
        writable: true,
        size_bytes: this.pgLastSavedBytes || Buffer.byteLength(JSON.stringify(this.data), 'utf-8'),
        engine: 'postgresql-test-memory',
      };
    }
    const configured = Boolean(process.env.DATABASE_URL);
    return {
      available: configured && (this.pgHydrated || this.data.users.length > 0),
      writable: configured,
      size_bytes: this.pgLastSavedBytes,
      engine: 'postgresql',
    };
  }

  private normalizeData() {
    if (!this.data.departments) this.data.departments = [];
    if (!this.data.suppliers) this.data.suppliers = [];
    if (!this.data.inventory_categories) this.data.inventory_categories = [];
    if (!this.data.units_of_measure) this.data.units_of_measure = [];
    if (!this.data.warehouses) this.data.warehouses = [];
    if (!this.data.inventory_items) this.data.inventory_items = [];
    if (!this.data.stock_balances) this.data.stock_balances = [];
    if (!this.data.stock_transactions) this.data.stock_transactions = [];
    if (!this.data.reorder_requests) this.data.reorder_requests = [];

    // Ensure all existing user records have separated first_name, last_name, and profile_picture
    if (this.data.users && Array.isArray(this.data.users)) {
      for (const u of this.data.users) {
        if (!u.first_name || !u.last_name) {
          if (u.name && u.name.trim()) {
            const parts = u.name.trim().split(/\s+/);
            if (!u.first_name) u.first_name = parts[0] || 'User';
            if (!u.last_name) u.last_name = parts.slice(1).join(' ') || '-';
          } else if (u.first_name && !u.last_name) {
            u.last_name = '-';
          } else if (!u.first_name && u.last_name) {
            u.first_name = 'User';
          } else {
            u.first_name = 'User';
            u.last_name = '-';
          }
        }
        u.name = `${u.first_name} ${u.last_name}`.trim();
        if (u.profile_picture === undefined) {
          u.profile_picture = '';
        }
      }
    }
    if (!this.data.reorder_negotiations) this.data.reorder_negotiations = [];
    if (!this.data.database_backups) this.data.database_backups = [];
    if (!this.data.pending_email_changes) this.data.pending_email_changes = [];
    if (!this.data.stock_transfers) this.data.stock_transfers = [];
    if (!this.data.stock_verifications) this.data.stock_verifications = [];
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

    // 2b. Initialize Departments collection (zero seed data; departments are created via database CRUD)
    if (!Array.isArray(this.data.departments)) {
      this.data.departments = [];
      hasChanged = true;
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

      // Department Module Permissions (View, Create, Edit, Delete, Disable)
      { code: 'departments.view', name: 'View Department Directory', module: 'Departments', category: 'action' },
      { code: 'departments.create', name: 'Create Department', module: 'Departments', category: 'action' },
      { code: 'departments.edit', name: 'Edit Department Information', module: 'Departments', category: 'action' },
      { code: 'departments.delete', name: 'Delete Department', module: 'Departments', category: 'action' },
      { code: 'departments.disable', name: 'Enable / Disable Department', module: 'Departments', category: 'action' },

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

      // Performance & Operation-Based Manufacturing Engine Permissions
      { code: 'performance.view', name: 'View Live Performance & Work Events', module: 'Performance', category: 'action' },
      { code: 'performance.manage', name: 'Register and Manage Performance Employees', module: 'Performance', category: 'action' },
      { code: 'performance.simulate', name: 'Simulate Hardware Work Events', module: 'Performance', category: 'action' },
      { code: 'performance.export', name: 'Export Performance Reports to CSV/Excel/PDF', module: 'Performance', category: 'action' },
      { code: 'operations.view', name: 'View Operation Master & Product Operation Structures', module: 'Operations Performance', category: 'action' },
      { code: 'operations.manage', name: 'Create and Edit Manufacturing Operations & Shifts', module: 'Operations Performance', category: 'action' },
      { code: 'operations.standard_time.manage', name: 'Manage Operation Standard Times & Version History', module: 'Operations Performance', category: 'action' },
      { code: 'operations.assignments.manage', name: 'Assign & Transfer Employees Across Operations', module: 'Operations Performance', category: 'action' },
      { code: 'operations.quality.approve', name: 'Record & Approve Operation Quality Inspections & Rework', module: 'Operations Performance', category: 'action' },
      { code: 'operations.production.correct', name: 'Resolve Hardware Exceptions & Correct Production Quantities', module: 'Operations Performance', category: 'action' },
      { code: 'operations.readiness.view', name: 'View Group Production & Finished Product Readiness', module: 'Operations Performance', category: 'action' },
      { code: 'operations.readiness.manage', name: 'Record WIP Transfers, Assembly Consumption & Final QC', module: 'Operations Performance', category: 'action' },
      { code: 'operations.forecasts.view', name: 'View Production Forecasting & Bottleneck Reports', module: 'Operations Performance', category: 'action' },
      { code: 'operations.rewards.manage', name: 'Manage Scoring Policies, Reward Rules & Nominations', module: 'Operations Performance', category: 'action' },
      { code: 'operations.rewards.approve', name: 'Approve & Finalise Best Employee Rewards', module: 'Operations Performance', category: 'action' },
      { code: 'operations.reports.export', name: 'Export Operation Performance & Production Reports (Excel/PDF)', module: 'Operations Performance', category: 'action' },

      // Granular Role-Based Dashboard & Reporting Permissions
      { code: 'dashboard.employee_summary.view', name: 'View Dashboard Employee Summary KPIs', module: 'Dashboard', category: 'action' },
      { code: 'dashboard.production_summary.view', name: 'View Dashboard Production Summary KPIs', module: 'Dashboard', category: 'action' },
      { code: 'dashboard.employee_performance.view', name: 'View Dashboard Employee Performance Analytics & Leaderboard', module: 'Dashboard', category: 'action' },
      { code: 'dashboard.production_forecast.view', name: 'View Dashboard Production Forecasts & Bottlenecks', module: 'Dashboard', category: 'action' },
      { code: 'dashboard.product_readiness.view', name: 'View Dashboard Finished Product Readiness & WIP', module: 'Dashboard', category: 'action' },
      { code: 'dashboard.quality_reports.view', name: 'View Dashboard Quality Inspection & Defect Analytics', module: 'Dashboard', category: 'action' },
      { code: 'dashboard.rewards.view', name: 'View Dashboard Best Employee Rankings & Rewards', module: 'Dashboard', category: 'action' },
      { code: 'dashboard.notifications.view', name: 'View Dashboard Operational Notification Centre', module: 'Dashboard', category: 'action' },
      { code: 'dashboard.recent_activity.view', name: 'View Dashboard Recent Operational Activity', module: 'Dashboard', category: 'action' },
      { code: 'reports.employee_performance.view', name: 'View Detailed Employee Performance Reports', module: 'Reports', category: 'action' },
      { code: 'reports.production.view', name: 'View Detailed Production Analytics Reports', module: 'Reports', category: 'action' },
      { code: 'reports.quality.view', name: 'View Detailed Quality & Rework Reports', module: 'Reports', category: 'action' },
      { code: 'reports.forecast.view', name: 'View Detailed Production Forecasting Reports', module: 'Reports', category: 'action' },
      { code: 'reports.export.excel', name: 'Export Dashboard & Operational Reports to Excel (.xlsx)', module: 'Reports', category: 'action' },
      { code: 'reports.export.pdf', name: 'Export Dashboard & Operational Reports to PDF', module: 'Reports', category: 'action' },

      // Settings Granular Permissions
      { code: 'settings.general.view', name: 'View General Settings', module: 'Settings', category: 'action' },
      { code: 'settings.general.edit', name: 'Edit General Settings', module: 'Settings', category: 'action' },
      { code: 'settings.general.reset', name: 'Reset General Settings to .env Defaults', module: 'Settings', category: 'action' },

      { code: 'settings.regional.view', name: 'View Regional Settings', module: 'Settings', category: 'action' },
      { code: 'settings.regional.edit', name: 'Edit Regional Settings', module: 'Settings', category: 'action' },
      { code: 'settings.regional.reset', name: 'Reset Regional Settings to .env Defaults', module: 'Settings', category: 'action' },

      { code: 'settings.email.view', name: 'View Email & SMTP Settings', module: 'Settings', category: 'action' },
      { code: 'settings.email.edit', name: 'Edit Email & SMTP Settings', module: 'Settings', category: 'action' },
      { code: 'settings.email.test', name: 'Test SMTP Connectivity with Email Dispatch', module: 'Settings', category: 'action' },
      { code: 'settings.email.reset', name: 'Reset Email & SMTP Settings', module: 'Settings', category: 'action' },

      { code: 'settings.notifications.view', name: 'View Notification Settings', module: 'Settings', category: 'action' },
      { code: 'settings.notifications.edit', name: 'Edit Notification Settings', module: 'Settings', category: 'action' },
      { code: 'settings.notifications.reset', name: 'Reset Notification Settings', module: 'Settings', category: 'action' },

      { code: 'settings.branding.view', name: 'View Branding Settings', module: 'Settings', category: 'action' },
      { code: 'settings.branding.edit', name: 'Edit Branding Settings', module: 'Settings', category: 'action' },
      { code: 'settings.branding.reset', name: 'Reset Branding Settings', module: 'Settings', category: 'action' },

      { code: 'settings.preferences.view', name: 'View Application Preferences', module: 'Settings', category: 'action' },
      { code: 'settings.preferences.edit', name: 'Edit Application Preferences', module: 'Settings', category: 'action' },
      { code: 'settings.preferences.reset', name: 'Reset Application Preferences', module: 'Settings', category: 'action' },

      { code: 'settings.workforce.view', name: 'View Workforce Governance Settings', module: 'Settings', category: 'action' },
      { code: 'settings.workforce.edit', name: 'Edit Workforce Governance Settings', module: 'Settings', category: 'action' },
      { code: 'settings.workforce.reset', name: 'Reset Workforce Governance Settings', module: 'Settings', category: 'action' },

      { code: 'settings.supplier.view', name: 'View Supplier Collaboration Settings', module: 'Settings', category: 'action' },
      { code: 'settings.supplier.edit', name: 'Edit Supplier Collaboration Settings', module: 'Settings', category: 'action' },
      { code: 'settings.supplier.reset', name: 'Reset Supplier Collaboration Settings', module: 'Settings', category: 'action' },

      { code: 'settings.security.view', name: 'View Security Governance Settings', module: 'Settings', category: 'action' },
      { code: 'settings.security.edit', name: 'Edit Security Governance Settings', module: 'Settings', category: 'action' },
      { code: 'settings.security.reset', name: 'Reset Security Governance Settings', module: 'Settings', category: 'action' },

      { code: 'settings.audit.view', name: 'View Audit Trail Ledger', module: 'Settings', category: 'action' },
      { code: 'settings.audit.export', name: 'Export Audit Trail Logs to CSV/JSON', module: 'Settings', category: 'action' },

      { code: 'settings.sessions.view', name: 'View Active User Sessions', module: 'Settings', category: 'action' },
      { code: 'settings.sessions.terminate_own', name: 'Terminate Own Active Sessions', module: 'Settings', category: 'action' },
      { code: 'settings.sessions.terminate_all', name: 'Terminate Other Users Active Sessions', module: 'Settings', category: 'action' },

      { code: 'settings.backups.view', name: 'View Database Backups History', module: 'Settings', category: 'action' },
      { code: 'settings.backups.manage', name: 'Manage Backup Schedulers & Run Backups', module: 'Settings', category: 'action' },
      { code: 'settings.backups.create', name: 'Create Manual Database Backup Snapshot', module: 'Settings', category: 'action' },
      { code: 'settings.backups.download', name: 'Download Database Backup File', module: 'Settings', category: 'action' },
      { code: 'settings.backups.restore', name: 'Restore System State from Database Backup', module: 'Settings', category: 'action' },
      { code: 'settings.backups.restore.isolated', name: 'Restore Backup to Isolated Verification Database', module: 'Settings', category: 'action' },
      { code: 'settings.backups.restore.production', name: 'Restore Live Production PostgreSQL Database (Super Admin)', module: 'Settings', category: 'action' },
      { code: 'settings.backups.restore.history', name: 'View Database Restore Execution History', module: 'Settings', category: 'action' },
      { code: 'settings.backups.delete', name: 'Delete Database Backup Snapshot', module: 'Settings', category: 'action' },

      { code: 'settings.reset.all', name: 'Reset All System Settings to .env Defaults', module: 'Settings', category: 'action' },
      { code: 'settings.reset.category', name: 'Reset Individual Category to .env Defaults', module: 'Settings', category: 'action' },
      { code: 'settings.reset.item', name: 'Reset Individual Setting Key to .env Default', module: 'Settings', category: 'action' },

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
    } else {
      for (const p of permissions) {
        if (!this.data.permissions.some(ep => ep.code === p.code)) {
          this.data.permissions.push(p);
          hasChanged = true;
        }
      }
    }

    // 4. Role Permissions Mapping
    const existingRolePerms = new Set(this.data.role_permissions.map(rp => `${rp.role}:${rp.permission_code}`));

    const defaultRoleGrants: Record<string, string[]> = {
      super_admin: permissions.map(p => p.code),
      admin: [
        'users.view', 'users.create', 'users.update', 'users.delete',
        'roles.view', 'roles.create', 'roles.update',
        'permissions.view', 'permissions.assign',
        'departments.view', 'departments.create', 'departments.edit', 'departments.delete', 'departments.disable',
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
        'operations.view', 'operations.manage', 'operations.standard_time.manage',
        'operations.assignments.manage', 'operations.quality.approve', 'operations.production.correct',
        'operations.readiness.view', 'operations.readiness.manage', 'operations.forecasts.view',
        'operations.rewards.manage', 'operations.rewards.approve', 'operations.reports.export',
        'dashboard.employee_summary.view', 'dashboard.production_summary.view', 'dashboard.employee_performance.view',
        'dashboard.production_forecast.view', 'dashboard.product_readiness.view', 'dashboard.quality_reports.view',
        'dashboard.rewards.view', 'dashboard.notifications.view', 'dashboard.recent_activity.view',
        'reports.employee_performance.view', 'reports.production.view', 'reports.quality.view', 'reports.forecast.view',
        'reports.export.excel', 'reports.export.pdf',
      ],
      user: [
        'profile.view', 'profile.update', 'security.password.change',
        'dashboard.view', 'menu.dashboard', 'menu.profile', 'menu.change_password',
        'dashboard.employee_performance.view', 'dashboard.rewards.view', 'dashboard.notifications.view',
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
        'operations.view', 'operations.readiness.view', 'operations.forecasts.view', 'operations.reports.export',
        'dashboard.employee_summary.view', 'dashboard.production_summary.view', 'dashboard.employee_performance.view',
        'dashboard.production_forecast.view', 'dashboard.product_readiness.view', 'dashboard.quality_reports.view',
        'dashboard.rewards.view', 'dashboard.notifications.view', 'dashboard.recent_activity.view',
        'reports.employee_performance.view', 'reports.production.view', 'reports.quality.view', 'reports.forecast.view',
        'reports.export.excel', 'reports.export.pdf',
      ],
      performance_user: [
        'menu.dashboard',
        'dashboard.view',
        'menu.workforce',
        'performance.view',
        'performance.manage',
        'performance.simulate',
        'performance.export',
        'operations.view',
        'operations.assignments.manage',
        'operations.quality.approve',
        'operations.readiness.view',
        'operations.readiness.manage',
        'operations.forecasts.view',
        'operations.reports.export',
        'dashboard.employee_summary.view',
        'dashboard.production_summary.view',
        'dashboard.employee_performance.view',
        'dashboard.product_readiness.view',
        'dashboard.quality_reports.view',
        'dashboard.production_forecast.view',
        'dashboard.notifications.view',
        'dashboard.recent_activity.view',
        'reports.employee_performance.view',
        'reports.production.view',
        'reports.quality.view',
        'reports.export.excel',
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
      { id: 21, label: 'Departments', icon: 'Building', route: '/administration/departments', parent_id: 2, display_order: 4, is_active: true, required_permission: 'departments.view', module_tag: 'module3', is_implemented: true },

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

    // Ensure Departments submenu is active under Administration
    const deptMenu = this.data.navigation_menus.find(m => m.id === 21 || m.route === '/administration/departments');
    if (!deptMenu) {
      this.data.navigation_menus.push({
        id: 21,
        label: 'Departments',
        icon: 'Building',
        route: '/administration/departments',
        parent_id: 2,
        display_order: 4,
        is_active: true,
        required_permission: 'departments.view',
        module_tag: 'module3',
        is_implemented: true,
      });
      hasChanged = true;
    } else {
      deptMenu.id = 21;
      deptMenu.label = 'Departments';
      deptMenu.icon = 'Building';
      deptMenu.route = '/administration/departments';
      deptMenu.parent_id = 2;
      deptMenu.display_order = 4;
      deptMenu.is_active = true;
      deptMenu.required_permission = 'departments.view';
      deptMenu.is_implemented = true;
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

    // Subitem 4: Operation Performance & Production Readiness Engine
    const opsSubmenus: NavigationMenuEntity[] = [
      { id: 63, label: 'Operations & Productivity Engine', icon: 'Sliders', route: '/workforce/operations-engine', parent_id: 60, display_order: 4, is_active: true, required_permission: 'operations.view', module_tag: 'module5', is_implemented: true },
      { id: 64, label: 'Production Readiness & WIP', icon: 'CheckSquare', route: '/workforce/operations-engine/readiness', parent_id: 60, display_order: 5, is_active: true, required_permission: 'operations.readiness.view', module_tag: 'module5', is_implemented: true },
      { id: 65, label: 'Forecasting & Bottlenecks', icon: 'TrendingUp', route: '/workforce/operations-engine/forecasting', parent_id: 60, display_order: 6, is_active: true, required_permission: 'operations.forecasts.view', module_tag: 'module5', is_implemented: true },
      { id: 66, label: 'Best Employee & Rewards', icon: 'Sparkles', route: '/workforce/operations-engine/rewards', parent_id: 60, display_order: 7, is_active: true, required_permission: 'operations.view', module_tag: 'module5', is_implemented: true },
    ];
    for (const sub of opsSubmenus) {
      if (!this.data.navigation_menus.some(m => m.id === sub.id)) {
        this.data.navigation_menus.push(sub);
        hasChanged = true;
      }
    }

    // Ensure Parent Settings route is /settings/general
    const m12 = this.data.navigation_menus.find(m => m.id === 12);
    if (m12) {
      m12.route = '/settings/general';
      m12.label = 'Settings';
      m12.icon = 'Settings';
      m12.required_permission = 'settings.view';
      hasChanged = true;
    }

    // Required 12 Settings Categories in Exact Specified Order
    const requiredSettingsSubmenus: NavigationMenuEntity[] = [
      { id: 13, label: 'General Settings', icon: 'SlidersHorizontal', route: '/settings/general', parent_id: 12, display_order: 1, is_active: true, required_permission: 'settings.general.view', module_tag: 'core', is_implemented: true },
      { id: 121, label: 'Regional Settings', icon: 'Globe', route: '/settings/regional', parent_id: 12, display_order: 2, is_active: true, required_permission: 'settings.regional.view', module_tag: 'core', is_implemented: true },
      { id: 122, label: 'Email & SMTP Settings', icon: 'Mail', route: '/settings/email-smtp', parent_id: 12, display_order: 3, is_active: true, required_permission: 'settings.email.view', module_tag: 'core', is_implemented: true },
      { id: 124, label: 'Notification Settings', icon: 'Bell', route: '/settings/notifications', parent_id: 12, display_order: 4, is_active: true, required_permission: 'settings.notifications.view', module_tag: 'core', is_implemented: true },
      { id: 125, label: 'Branding Settings', icon: 'Sparkles', route: '/settings/branding', parent_id: 12, display_order: 5, is_active: true, required_permission: 'settings.branding.view', module_tag: 'core', is_implemented: true },
      { id: 126, label: 'Application Preferences', icon: 'Sliders', route: '/settings/application-preferences', parent_id: 12, display_order: 6, is_active: true, required_permission: 'settings.preferences.view', module_tag: 'core', is_implemented: true },
      { id: 127, label: 'Workforce Settings', icon: 'Briefcase', route: '/settings/workforce', parent_id: 12, display_order: 7, is_active: true, required_permission: 'settings.workforce.view', module_tag: 'core', is_implemented: true },
      { id: 128, label: 'Supplier Settings', icon: 'Truck', route: '/settings/supplier', parent_id: 12, display_order: 8, is_active: true, required_permission: 'settings.supplier.view', module_tag: 'core', is_implemented: true },
      { id: 123, label: 'Security Settings', icon: 'KeyRound', route: '/settings/security', parent_id: 12, display_order: 9, is_active: true, required_permission: 'settings.security.view', module_tag: 'core', is_implemented: true },
      { id: 129, label: 'Security Center', icon: 'ShieldAlert', route: '/security-center', parent_id: 12, display_order: 10, is_active: true, required_permission: 'settings.security.view', module_tag: 'core', is_implemented: true },
      { id: 14, label: 'Audit Trail', icon: 'ShieldCheck', route: '/settings/audit-trail', parent_id: 12, display_order: 11, is_active: true, required_permission: 'settings.audit.view', module_tag: 'core', is_implemented: true },
      { id: 15, label: 'Active Sessions', icon: 'Smartphone', route: '/settings/active-sessions', parent_id: 12, display_order: 12, is_active: true, required_permission: 'settings.sessions.view', module_tag: 'core', is_implemented: true },
      { id: 16, label: 'Database Backups', icon: 'Database', route: '/settings/database-backups', parent_id: 12, display_order: 13, is_active: true, required_permission: 'settings.backups.view', module_tag: 'core', is_implemented: true },
    ];

    for (const sub of requiredSettingsSubmenus) {
      const existing = this.data.navigation_menus.find(m => m.id === sub.id || (m.parent_id === 12 && m.route === sub.route));
      if (existing) {
        existing.id = sub.id;
        existing.label = sub.label;
        existing.icon = sub.icon;
        existing.route = sub.route;
        existing.parent_id = 12;
        existing.display_order = sub.display_order;
        existing.is_active = true;
        existing.required_permission = sub.required_permission;
        existing.is_implemented = true;
        hasChanged = true;
      } else {
        this.data.navigation_menus.push(sub);
        hasChanged = true;
      }
    }

    // 6. Ensure Supplier Management submenus (Section 9)
    const m8 = this.data.navigation_menus.find(m => m.id === 8);
    if (m8) {
      m8.label = 'Supplier Management';
      m8.route = '/suppliers/directory';
      m8.icon = 'Truck';
      m8.required_permission = 'suppliers.view';
      m8.is_implemented = true;
      hasChanged = true;
    }

    const supplierSubmenus: NavigationMenuEntity[] = [
      { id: 81, label: 'Supplier Directory', icon: 'Building2', route: '/suppliers/directory', parent_id: 8, display_order: 1, is_active: true, required_permission: 'suppliers.view', module_tag: 'module7', is_implemented: true },
      { id: 82, label: 'Purchase Requests', icon: 'ShoppingCart', route: '/suppliers/purchase-requests', parent_id: 8, display_order: 2, is_active: true, required_permission: 'menu.purchasing', module_tag: 'module7', is_implemented: true },
      { id: 83, label: 'Supplier Approvals', icon: 'CheckSquare', route: '/suppliers/approvals', parent_id: 8, display_order: 3, is_active: true, required_permission: 'suppliers.view', module_tag: 'module7', is_implemented: true },
      { id: 84, label: 'Email Conversations', icon: 'MessageSquare', route: '/suppliers/conversations', parent_id: 8, display_order: 4, is_active: true, required_permission: 'suppliers.view', module_tag: 'module7', is_implemented: true },
    ];

    for (const sub of supplierSubmenus) {
      const existing = this.data.navigation_menus.find(m => m.id === sub.id || (m.parent_id === 8 && m.route === sub.route));
      if (existing) {
        existing.id = sub.id;
        existing.label = sub.label;
        existing.icon = sub.icon;
        existing.route = sub.route;
        existing.parent_id = 8;
        existing.display_order = sub.display_order;
        existing.is_active = true;
        existing.required_permission = sub.required_permission;
        existing.is_implemented = true;
        hasChanged = true;
      } else {
        this.data.navigation_menus.push(sub);
        hasChanged = true;
      }
    }

    // 7. Ensure Warehouse Management menu & submenus (Section 9)
    let m90 = this.data.navigation_menus.find(m => m.id === 90);
    if (!m90) {
      m90 = {
        id: 90,
        label: 'Warehouse Management',
        icon: 'Building2',
        route: '/warehouses/dashboard',
        parent_id: null,
        display_order: 6,
        is_active: true,
        required_permission: 'inventory.view',
        module_tag: 'module8',
        is_implemented: true,
      };
      this.data.navigation_menus.push(m90);
      hasChanged = true;
    } else {
      m90.label = 'Warehouse Management';
      m90.route = '/warehouses/dashboard';
      m90.icon = 'Building2';
      m90.required_permission = 'inventory.view';
      m90.is_implemented = true;
      hasChanged = true;
    }

    const warehouseSubmenus: NavigationMenuEntity[] = [
      { id: 91, label: 'Warehouse Dashboard', icon: 'LayoutDashboard', route: '/warehouses/dashboard', parent_id: 90, display_order: 1, is_active: true, required_permission: 'inventory.view', module_tag: 'module8', is_implemented: true },
      { id: 92, label: 'Warehouse Directory', icon: 'Building2', route: '/warehouses/directory', parent_id: 90, display_order: 2, is_active: true, required_permission: 'inventory.view', module_tag: 'module8', is_implemented: true },
      { id: 93, label: 'Warehouse Stock', icon: 'Package', route: '/warehouses/stock', parent_id: 90, display_order: 3, is_active: true, required_permission: 'inventory.view', module_tag: 'module8', is_implemented: true },
      { id: 94, label: 'Transfers', icon: 'ArrowLeftRight', route: '/warehouses/transfers', parent_id: 90, display_order: 4, is_active: true, required_permission: 'inventory.transfer', module_tag: 'module8', is_implemented: true },
      { id: 95, label: 'Stock Verification', icon: 'ClipboardCheck', route: '/warehouses/stock-verification', parent_id: 90, display_order: 5, is_active: true, required_permission: 'inventory.adjust', module_tag: 'module8', is_implemented: true },
    ];

    for (const sub of warehouseSubmenus) {
      const existing = this.data.navigation_menus.find(m => m.id === sub.id || (m.parent_id === 90 && m.route === sub.route));
      if (existing) {
        existing.id = sub.id;
        existing.label = sub.label;
        existing.icon = sub.icon;
        existing.route = sub.route;
        existing.parent_id = 90;
        existing.display_order = sub.display_order;
        existing.is_active = true;
        existing.required_permission = sub.required_permission;
        existing.is_implemented = true;
        hasChanged = true;
      } else {
        this.data.navigation_menus.push(sub);
        hasChanged = true;
      }
    }

    // 8. Activate Complete NEXORA ERP Modules (Purchase, Goods Receiving, Product/BOM, Production, Readiness, Reporting & Analytics)
    const m9 = this.data.navigation_menus.find(m => m.id === 9);
    if (m9) {
      m9.label = 'Purchase Management';
      m9.route = '/purchasing';
      m9.icon = 'ShoppingCart';
      m9.display_order = 7;
      m9.is_active = true;
      m9.is_implemented = true;
      hasChanged = true;
    }
    const m10 = this.data.navigation_menus.find(m => m.id === 10);
    if (m10) {
      m10.label = 'Goods Receiving';
      m10.route = '/goods-receipt';
      m10.icon = 'ClipboardCheck';
      m10.display_order = 8;
      m10.is_active = true;
      m10.is_implemented = true;
      hasChanged = true;
    }
    const m11 = this.data.navigation_menus.find(m => m.id === 11);
    if (m11) {
      m11.label = 'Reporting & Analytics';
      m11.route = '/reports';
      m11.icon = 'PieChart';
      m11.display_order = 11;
      m11.is_active = true;
      m11.is_implemented = true;
      hasChanged = true;
    }

    const erpExtendedMenus: NavigationMenuEntity[] = [
      { id: 100, label: 'Product Management', icon: 'Layers', route: '/products', parent_id: null, display_order: 9, is_active: true, required_permission: 'inventory.view', module_tag: 'module_products', is_implemented: true },
      { id: 105, label: 'Production Management', icon: 'Sliders', route: '/production', parent_id: null, display_order: 10, is_active: true, required_permission: 'inventory.view', module_tag: 'module_production', is_implemented: true },
      { id: 106, label: 'Work Orders & Progress', icon: 'CheckSquare', route: '/production', parent_id: 105, display_order: 1, is_active: true, required_permission: 'inventory.view', module_tag: 'module_production', is_implemented: true },
      { id: 107, label: 'Product Readiness', icon: 'TrendingUp', route: '/production/readiness', parent_id: 105, display_order: 2, is_active: true, required_permission: 'inventory.view', module_tag: 'module_readiness', is_implemented: true },
    ];

    for (const item of erpExtendedMenus) {
      const existing = this.data.navigation_menus.find(m => m.id === item.id);
      if (existing) {
        Object.assign(existing, item);
        hasChanged = true;
      } else {
        this.data.navigation_menus.push(item);
        hasChanged = true;
      }
    }

    if (hasChanged) {
      this.save();
    }
  }

  public findUserByEmail(email: string): UserEntity | undefined {
    return this.data.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  }

  public findUserByUsernameOrEmail(identifier: string): UserEntity | undefined {
    const clean = identifier.trim().toLowerCase();
    return this.data.users.find(
      u => u.email.toLowerCase() === clean || (u.username && u.username.toLowerCase() === clean)
    );
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
        const first = (u.first_name || '').toLowerCase();
        const last = (u.last_name || '').toLowerCase();
        const fullName = `${first} ${last}`.trim();
        const legacyName = (u.name || '').toLowerCase();
        const matchesName = fullName.includes(q) || first.includes(q) || last.includes(q) || legacyName.includes(q);
        const matchesEmail = u.email.toLowerCase().includes(q);
        const matchesUsername = (u.username || '').toLowerCase().includes(q);
        const matchesDept = (u.department || '').toLowerCase().includes(q);
        const matchesRole = (u.role || '').toLowerCase().includes(q);
        if (!matchesName && !matchesEmail && !matchesUsername && !matchesDept && !matchesRole) {
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

  // --- Department Queries & CRUD ---
  public getDepartments(options?: { search?: string; status?: string }): (DepartmentEntity & { employee_count: number })[] {
    if (!this.data.departments) this.data.departments = [];
    let list = [...this.data.departments];

    if (options?.status && options.status !== 'all') {
      list = list.filter(d => d.status === options.status);
    }

    if (options?.search && options.search.trim()) {
      const q = options.search.trim().toLowerCase();
      list = list.filter(d =>
        d.name.toLowerCase().includes(q) ||
        d.code.toLowerCase().includes(q) ||
        (d.description && d.description.toLowerCase().includes(q))
      );
    }

    return list.map(dept => {
      const employee_count = this.data.users.filter(u =>
        u.department && (u.department.toLowerCase() === dept.name.toLowerCase() || u.department.toLowerCase() === dept.code.toLowerCase())
      ).length;
      return {
        ...dept,
        employee_count,
      };
    });
  }

  public getDepartmentById(id: number): DepartmentEntity | undefined {
    return (this.data.departments || []).find(d => d.id === id);
  }

  public getDepartmentByCode(code: string): DepartmentEntity | undefined {
    const clean = code.trim().toLowerCase();
    return (this.data.departments || []).find(d => d.code.trim().toLowerCase() === clean);
  }

  public getDepartmentByName(name: string): DepartmentEntity | undefined {
    const clean = name.trim().toLowerCase();
    return (this.data.departments || []).find(d => d.name.trim().toLowerCase() === clean);
  }

  public getDepartmentEmployeeCount(deptNameOrCode: string): number {
    const clean = deptNameOrCode.trim().toLowerCase();
    return (this.data.users || []).filter(u =>
      u.department && (u.department.trim().toLowerCase() === clean || (this.getDepartmentByCode(clean)?.name.toLowerCase() === u.department.trim().toLowerCase()))
    ).length;
  }

  public createDepartment(dept: { code: string; name: string; description?: string; status?: 'active' | 'disabled' }): DepartmentEntity {
    if (!this.data.departments) this.data.departments = [];
    const cleanCode = dept.code.trim().toUpperCase();
    const cleanName = dept.name.trim();

    if (this.getDepartmentByCode(cleanCode)) {
      throw new Error(`A department with code '${cleanCode}' already exists.`);
    }
    if (this.getDepartmentByName(cleanName)) {
      throw new Error(`A department with name '${cleanName}' already exists.`);
    }

    const nextId = (this.data.departments.length > 0 ? Math.max(...this.data.departments.map(d => d.id)) : 0) + 1;
    const now = new Date().toISOString();
    const newDept: DepartmentEntity = {
      id: nextId,
      code: cleanCode,
      name: cleanName,
      description: (dept.description || '').trim(),
      status: dept.status || 'active',
      created_at: now,
      updated_at: now,
    };

    this.data.departments.push(newDept);
    this.save();
    return newDept;
  }

  public updateDepartment(id: number, data: Partial<DepartmentEntity>): DepartmentEntity | undefined {
    const dept = this.getDepartmentById(id);
    if (!dept) return undefined;

    if (data.code && data.code.trim().toUpperCase() !== dept.code) {
      const existing = this.getDepartmentByCode(data.code);
      if (existing && existing.id !== id) {
        throw new Error(`A department with code '${data.code.trim().toUpperCase()}' already exists.`);
      }
      dept.code = data.code.trim().toUpperCase();
    }

    if (data.name && data.name.trim() !== dept.name) {
      const existing = this.getDepartmentByName(data.name);
      if (existing && existing.id !== id) {
        throw new Error(`A department with name '${data.name.trim()}' already exists.`);
      }
      const oldName = dept.name;
      dept.name = data.name.trim();
      // Update assigned users department string if name changed
      for (const u of this.data.users) {
        if (u.department === oldName) {
          u.department = dept.name;
        }
      }
    }

    if (data.description !== undefined) {
      dept.description = data.description.trim();
    }

    if (data.status !== undefined) {
      dept.status = data.status;
    }

    dept.updated_at = new Date().toISOString();
    this.save();
    return dept;
  }

  public toggleDepartmentStatus(id: number, status: 'active' | 'disabled'): DepartmentEntity | undefined {
    return this.updateDepartment(id, { status });
  }

  public deleteDepartment(id: number): { success: boolean; message: string } {
    const dept = this.getDepartmentById(id);
    if (!dept) {
      return { success: false, message: 'Department not found.' };
    }

    const employeeCount = this.data.users.filter(u =>
      u.department && (u.department.toLowerCase() === dept.name.toLowerCase() || u.department.toLowerCase() === dept.code.toLowerCase())
    ).length;

    if (employeeCount > 0) {
      return {
        success: false,
        message: `Cannot delete department '${dept.name}': currently assigned to ${employeeCount} employee(s). Please reassign employees first.`,
      };
    }

    this.data.departments = this.data.departments.filter(d => d.id !== id);
    this.save();
    return { success: true, message: `Department '${dept.name}' deleted successfully.` };
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

    // Sensitive data protection: redact passwords, tokens, hashes, and secrets
    const redact = (val?: string | null): string | undefined => {
      if (!val) return val ?? undefined;
      return val
        .replace(/(password|password_hash|token|secret|pin|jwt|key)=([^\s,&]+)/gi, '$1=[REDACTED]')
        .replace(/(["']?(password|password_hash|token|secret|token_hash)["']?\s*:\s*["'])([^"']+)(["'])/gi, '$1[REDACTED]$4');
    };

    let username = log.username;
    if (!username && log.user_id) {
      const u = this.findUserById(log.user_id);
      if (u) username = u.username;
    }

    const entry: AuditTrailEntity = {
      id,
      ...log,
      username,
      details: redact(log.details) || '',
      previous_value: redact(log.previous_value),
      updated_value: redact(log.updated_value),
      timestamp: new Date().toISOString(),
    };
    this.data.audit_trail.unshift(entry);
    if (this.data.audit_trail.length > 500) {
      this.data.audit_trail = this.data.audit_trail.slice(0, 500);
    }
    this.save();
  }

  public getAuditTrail(filter: { module?: string; user_email?: string; action?: string; search?: string } = {}): AuditTrailEntity[] {
    return this.data.audit_trail.filter(a => {
      if (filter.module && a.module !== filter.module) return false;
      if (filter.user_email && !a.user_email.toLowerCase().includes(filter.user_email.toLowerCase())) return false;
      if (filter.action && a.action !== filter.action) return false;
      if (filter.search) {
        const q = filter.search.toLowerCase();
        const match =
          a.action.toLowerCase().includes(q) ||
          a.module.toLowerCase().includes(q) ||
          a.user_email.toLowerCase().includes(q) ||
          (a.username && a.username.toLowerCase().includes(q)) ||
          a.details.toLowerCase().includes(q) ||
          a.ip_address.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }

  // --- Settings & Configuration Management ---
  public getSettings(): Record<string, string> {
    const res: Record<string, string> = {};
    // Seed with .env defaults
    for (const def of SYSTEM_SETTING_DEFINITIONS) {
      const envVal = def.envKey && process.env[def.envKey] ? process.env[def.envKey]! : def.defaultValue;
      res[def.key] = envVal;
    }
    // Layer database overrides
    for (const [k, v] of Object.entries(this.data.system_settings)) {
      res[k] = v.value;
    }
    return res;
  }

  public getAppCompany(): { company_name: string; source: 'database' | 'env' } {
    const dbOverride = this.data.system_settings?.company_name?.value;
    if (dbOverride && dbOverride.trim()) {
      return { company_name: dbOverride.trim(), source: 'database' };
    }
    const envCompany = (process.env.App_Company || process.env.APP_COMPANY || '').trim();
    return { company_name: envCompany, source: 'env' };
  }

  public getBrandingConfig(): {
    app_name: string;
    company_name: string;
    brand_tagline: string;
    reset_token_expiry_minutes: number;
  } {
    const settings = this.getSettings();
    const { company_name } = this.getAppCompany();
    const expiryRaw =
      this.data.system_settings?.reset_token_expiry_minutes?.value ||
      process.env.PASSWORD_RESET_EXPIRES_MINUTES ||
      settings.reset_token_expiry_minutes ||
      '15';
    return {
      app_name: (settings.app_name || process.env.APP_NAME || 'Nexora').trim(),
      company_name,
      brand_tagline: (settings.brand_tagline || process.env.APP_TAGLINE || 'Enterprise Platform').trim(),
      reset_token_expiry_minutes: parseInt(expiryRaw, 10) || 15,
    };
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

  public getSettingDefinitions(category?: string): SettingDefinition[] {
    if (!category) return SYSTEM_SETTING_DEFINITIONS;
    return SYSTEM_SETTING_DEFINITIONS.filter(d => d.category === category);
  }

  public isSettingOverridden(key: string): boolean {
    return Boolean(this.data.system_settings && this.data.system_settings[key]);
  }

  public getCategorySummaries(): CategorySummary[] {
    const categoriesMeta = [
      {
        id: 'general',
        slug: 'general',
        name: 'General Settings',
        description: 'Application branding, company profile, support email, and deployment environment mode.',
        icon: 'SlidersHorizontal',
        route: '/settings/general',
        is_operational: false,
      },
      {
        id: 'regional',
        slug: 'regional',
        name: 'Regional & Localization',
        description: 'System timezone, currency formatting, date/time display standard, and language locale.',
        icon: 'Globe',
        route: '/settings/regional',
        is_operational: false,
      },
      {
        id: 'email_smtp',
        slug: 'email-smtp',
        name: 'Email & SMTP Gateway',
        description: 'Outgoing mail server credentials, SSL/TLS security encryption, and test email verification.',
        icon: 'Mail',
        route: '/settings/email-smtp',
        is_operational: false,
      },
      {
        id: 'notifications',
        slug: 'notifications',
        name: 'Notifications & Alerts',
        description: 'Outgoing email dispatch rules, in-app banner toasts, and executive digest frequencies.',
        icon: 'Bell',
        route: '/settings/notifications',
        is_operational: false,
      },
      {
        id: 'branding',
        slug: 'branding',
        name: 'Identity & Visual Branding',
        description: 'Organization identity labels, theme palette accents, brand tagline, and application footer.',
        icon: 'Sparkles',
        route: '/settings/branding',
        is_operational: false,
      },
      {
        id: 'application_preferences',
        slug: 'application-preferences',
        name: 'Application Preferences',
        description: 'Default landing route, pagination density, telemetry polling intervals, and table layouts.',
        icon: 'Sliders',
        route: '/settings/application-preferences',
        is_operational: false,
      },
      {
        id: 'workforce',
        slug: 'workforce',
        name: 'Workforce Governance',
        description: 'RFID scan cooldown guard, shift overtime thresholds, auto-checkout limits, and live telemetry.',
        icon: 'Briefcase',
        route: '/settings/workforce',
        is_operational: false,
      },
      {
        id: 'supplier',
        slug: 'supplier',
        name: 'Supplier Collaboration',
        description: 'Secure invitation link expiry, standard payment terms, order approval thresholds, and counter-offers.',
        icon: 'Truck',
        route: '/settings/supplier',
        is_operational: false,
      },
      {
        id: 'security',
        slug: 'security',
        name: 'Security & Governance',
        description: 'Password complexity policies, session idle logout timeouts, failed login lockout, and backup schedules.',
        icon: 'KeyRound',
        route: '/settings/security',
        is_operational: false,
      },
      {
        id: 'audit_trail',
        slug: 'audit-trail',
        name: 'Audit Trail',
        description: 'Comprehensive immutable event ledger with user actions, timestamps, and IP addresses.',
        icon: 'ShieldCheck',
        route: '/settings/audit-trail',
        is_operational: true,
      },
      {
        id: 'active_sessions',
        slug: 'active-sessions',
        name: 'Active Sessions',
        description: 'Real-time multi-device session monitor with remote termination and token revocation.',
        icon: 'Smartphone',
        route: '/settings/active-sessions',
        is_operational: true,
      },
      {
        id: 'database_backups',
        slug: 'database-backups',
        name: 'Database Backups',
        description: 'Create verified manual snapshots, inspect cryptographic checksums, and restore application state.',
        icon: 'Database',
        route: '/settings/database-backups',
        is_operational: true,
      },
    ];

    return categoriesMeta.map(cat => {
      if (cat.is_operational) {
        let count = 0;
        if (cat.id === 'audit_trail') count = this.data.audit_trail.length;
        if (cat.id === 'active_sessions') count = this.data.user_sessions.filter(s => !s.is_revoked).length;
        if (cat.id === 'database_backups') count = this.data.database_backups.length;
        return {
          id: cat.id,
          slug: cat.slug,
          name: cat.name,
          description: cat.description,
          icon: cat.icon,
          route: cat.route,
          total_settings: count,
          overridden_count: 0,
          is_operational: true,
        };
      }

      const defs = SYSTEM_SETTING_DEFINITIONS.filter(d => d.category === cat.id);
      const overrides = defs.filter(d => Boolean(this.data.system_settings && this.data.system_settings[d.key])).length;
      return {
        id: cat.id,
        slug: cat.slug,
        name: cat.name,
        description: cat.description,
        icon: cat.icon,
        route: cat.route,
        total_settings: defs.length,
        overridden_count: overrides,
        is_operational: false,
      };
    });
  }

  public getEffectiveSettings(categoryFilter?: string): { settings: EffectiveSettingItem[]; summaries: CategorySummary[] } {
    const definitions = this.getSettingDefinitions(categoryFilter);
    const settings: EffectiveSettingItem[] = definitions.map(def => {
      const envDefault = (def.envKey && process.env[def.envKey]) ? process.env[def.envKey]! : def.defaultValue;
      const isOverridden = Boolean(this.data.system_settings && this.data.system_settings[def.key]);
      const stored = isOverridden ? this.data.system_settings[def.key] : null;
      let effectiveValue = stored ? stored.value : envDefault;

      // Mask sensitive values (like SMTP password)
      if (def.isSensitive) {
        effectiveValue = '••••••••••••';
      }

      return {
        ...def,
        value: effectiveValue,
        env_default: def.isSensitive ? '••••••••••••' : envDefault,
        is_overridden: isOverridden,
        updated_at: stored?.updated_at,
        updated_by: stored?.updated_by,
      };
    });

    return {
      settings,
      summaries: this.getCategorySummaries(),
    };
  }

  public getEffectiveSetting(key: string): { key: string; value: string; is_overridden: boolean } | undefined {
    const def = SYSTEM_SETTING_DEFINITIONS.find(d => d.key === key);
    if (!def) return undefined;
    const isOverridden = Boolean(this.data.system_settings && this.data.system_settings[key]);
    const stored = isOverridden ? this.data.system_settings[key] : null;
    const envDefault = (def.envKey && process.env[def.envKey]) ? process.env[def.envKey]! : def.defaultValue;
    return {
      key,
      value: stored ? stored.value : envDefault,
      is_overridden: isOverridden,
    };
  }

  public updateCategorySettings(category: string, updates: Record<string, any>, updatedBy: string): { success: boolean; updated: string[] } {
    const defs = SYSTEM_SETTING_DEFINITIONS.filter(d => d.category === category);
    const updatedKeys: string[] = [];
    const now = new Date().toISOString();

    for (const def of defs) {
      if (updates[def.key] !== undefined) {
        const rawVal = updates[def.key];
        // If sensitive and sent as masked dots or empty string, skip updating to preserve existing password
        if (def.isSensitive && (rawVal === '••••••••••••' || rawVal === '')) {
          continue;
        }

        const stringVal = typeof rawVal === 'boolean' ? String(rawVal) : String(rawVal).trim();
        this.data.system_settings[def.key] = {
          key: def.key,
          value: stringVal,
          category,
          updated_at: now,
          updated_by: updatedBy,
        };
        updatedKeys.push(def.key);
      }
    }

    if (updatedKeys.length > 0) {
      this.save();
    }
    return { success: true, updated: updatedKeys };
  }

  public resetSettingKey(key: string): boolean {
    if (this.data.system_settings && this.data.system_settings[key]) {
      delete this.data.system_settings[key];
      this.save();
      return true;
    }
    return false;
  }

  public resetSettingCategory(category: string): { count: number } {
    const defs = SYSTEM_SETTING_DEFINITIONS.filter(d => d.category === category);
    let count = 0;
    for (const def of defs) {
      if (this.data.system_settings && this.data.system_settings[def.key]) {
        delete this.data.system_settings[def.key];
        count++;
      }
    }
    if (count > 0) {
      this.save();
    }
    return { count };
  }

  public resetAllSettings(): { count: number } {
    const count = Object.keys(this.data.system_settings || {}).length;
    this.data.system_settings = {};
    this.save();
    return { count };
  }

  // --- Sessions & Token Revocation ---
  public createSession(session: Omit<UserSessionEntity, 'id' | 'created_at' | 'last_active_at' | 'is_revoked'>): UserSessionEntity {
    const id = (this.data.user_sessions.length > 0 ? Math.max(...this.data.user_sessions.map(s => s.id)) : 0) + 1;
    const now = new Date().toISOString();
    let username = session.username;
    let employeeName = session.employee_name;
    if ((!username || !employeeName) && session.user_id) {
      const u = this.findUserById(session.user_id);
      if (u) {
        if (!username) username = u.username;
        if (!employeeName) employeeName = `${u.first_name} ${u.last_name}`.trim();
      }
    }

    const entry: UserSessionEntity = {
      id,
      ...session,
      username,
      employee_name: employeeName,
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

  public getAllSessions(filter?: { search?: string; status?: string; user_id?: number }): UserSessionEntity[] {
    let list = [...this.data.user_sessions];
    if (filter?.user_id) {
      list = list.filter(s => s.user_id === filter.user_id);
    }
    if (filter?.status === 'active') {
      list = list.filter(s => !s.is_revoked);
    } else if (filter?.status === 'revoked') {
      list = list.filter(s => s.is_revoked);
    }
    if (filter?.search) {
      const q = filter.search.toLowerCase();
      list = list.filter(s =>
        (s.username && s.username.toLowerCase().includes(q)) ||
        (s.employee_name && s.employee_name.toLowerCase().includes(q)) ||
        s.ip_address.toLowerCase().includes(q) ||
        s.user_agent.toLowerCase().includes(q)
      );
    }
    return list;
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

  public revokeOtherUserSessions(userId: number, currentJti: string): number {
    let count = 0;
    for (const s of this.data.user_sessions) {
      if (s.user_id === userId && s.jti !== currentJti && !s.is_revoked) {
        s.is_revoked = true;
        this.revokeToken(s.jti);
        count++;
      }
    }
    if (count > 0) this.save();
    return count;
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

  // --- Database Backups Management ---
  public getDatabaseBackups(): DatabaseBackupEntity[] {
    return this.data.database_backups || [];
  }

  public createDatabaseBackup(type: 'MANUAL' | 'SCHEDULED', createdBy: string, notes?: string): DatabaseBackupEntity {
    if (!this.data.database_backups) this.data.database_backups = [];
    const now = new Date();
    const timestampStr = now.toISOString().replace(/[-:T.]/g, '').slice(0, 14);
    const filename = `nexora_pg_backup_${type.toLowerCase()}_${timestampStr}.pgenc`;
    const serialized = JSON.stringify(this.data);
    const sizeBytes = Buffer.byteLength(serialized, 'utf-8');
    const sha256 = crypto.createHash('sha256').update(serialized).digest('hex');

    const backupRecord: DatabaseBackupEntity = {
      id: `bk_${Date.now()}`,
      filename,
      backup_type: type,
      size_bytes: sizeBytes,
      table_count: Object.keys(this.data).length,
      status: 'VERIFIED',
      sha256,
      created_by: createdBy,
      notes: notes || `${type} PostgreSQL backup record logged (use /api/security/backups for encrypted pg_dump archives).`,
      created_at: now.toISOString(),
      completed_at: new Date().toISOString(),
    };

    this.data.database_backups.unshift(backupRecord);
    this.save();
    return backupRecord;
  }

  public restoreDatabaseBackup(backupId: string, actorEmail: string): { success: boolean; message: string; table_count?: number } {
    const record = (this.data.database_backups || []).find(b => b.id === backupId);
    if (!record) {
      throw new Error(`Backup record ${backupId} not found.`);
    }

    this.logAudit({
      user_id: null,
      user_email: actorEmail,
      action: 'DATABASE_RESTORE_REQUESTED',
      module: 'Settings',
      details: `PostgreSQL restoration requested for ${record.filename} (${record.id}) via controlled backup service.`,
      ip_address: '127.0.0.1',
    });

    return {
      success: true,
      message: `Use the encrypted PostgreSQL Security Backup Center to run two-step verified restoration for ${record.filename}.`,
      table_count: record.table_count,
    };
  }

  public deleteDatabaseBackup(backupId: string): boolean {
    const idx = (this.data.database_backups || []).findIndex(b => b.id === backupId);
    if (idx === -1) return false;
    this.data.database_backups.splice(idx, 1);
    this.save();
    return true;
  }

  // --- Email Change Verification Management ---
  public createEmailChangeRequest(userId: number, newEmail: string): { request: PendingEmailChangeEntity; rawToken: string; token: string; code: string; expires_at: string } {
    if (!this.data.pending_email_changes) this.data.pending_email_changes = [];
    const user = this.findUserById(userId);
    if (!user) throw new Error('User not found.');

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString();

    const id = (this.data.pending_email_changes.length > 0 ? Math.max(...this.data.pending_email_changes.map(p => p.id)) : 0) + 1;
    const req: PendingEmailChangeEntity = {
      id,
      user_id: userId,
      current_email: user.email,
      new_email: newEmail.trim().toLowerCase(),
      token_hash: tokenHash,
      verification_code: code,
      expires_at: expiresAt,
      created_at: new Date().toISOString(),
    };

    // Remove existing pending changes for this user
    this.data.pending_email_changes = this.data.pending_email_changes.filter(p => p.user_id !== userId);
    this.data.pending_email_changes.push(req);
    this.save();

    return { request: req, rawToken, token: rawToken, code, expires_at: expiresAt };
  }

  public verifyEmailChange(tokenOrCode: string): { success: boolean; user?: UserEntity; newEmail?: string; message: string } {
    if (!this.data.pending_email_changes) this.data.pending_email_changes = [];
    const clean = tokenOrCode.trim();
    const tokenHash = crypto.createHash('sha256').update(clean).digest('hex');

    const pending = this.data.pending_email_changes.find(
      p => p.verification_code === clean || p.token_hash === tokenHash
    );

    if (!pending) {
      return { success: false, message: 'Invalid email verification code or link.' };
    }

    if (new Date(pending.expires_at) < new Date()) {
      return { success: false, message: 'Verification link or code has expired. Please request a new email change.' };
    }

    const user = this.findUserById(pending.user_id);
    if (!user) {
      return { success: false, message: 'User account not found.' };
    }

    const oldEmail = user.email;
    user.email = pending.new_email;
    user.is_verified = true;

    // Remove pending change
    this.data.pending_email_changes = this.data.pending_email_changes.filter(p => p.id !== pending.id);
    this.save();

    this.logAudit({
      user_id: user.id,
      user_email: user.email,
      username: user.username,
      action: 'EMAIL_CHANGED_VERIFIED',
      module: 'Profile',
      details: `Email updated from ${oldEmail} to verified ${user.email}`,
      previous_value: oldEmail,
      updated_value: user.email,
      ip_address: '127.0.0.1',
    });

    return {
      success: true,
      user,
      newEmail: user.email,
      message: 'Email address successfully verified and updated.',
    };
  }

  // --- Password Reset Tokens (Security & Recovery) ---
  public createPasswordResetToken(userId: number, tokenHash: string, expiresAt: Date): PasswordResetTokenEntity {
    if (!this.data.password_reset_tokens) {
      this.data.password_reset_tokens = [];
    }
    const nowIso = new Date().toISOString();
    // Invalidate prior unused tokens for this user
    for (const t of this.data.password_reset_tokens) {
      if (t.user_id === userId && !t.used_at) {
        t.used_at = nowIso;
      }
    }

    const nextId = (this.data.password_reset_tokens.length > 0 ? Math.max(...this.data.password_reset_tokens.map(t => t.id)) : 0) + 1;
    const tokenRecord: PasswordResetTokenEntity = {
      id: nextId,
      user_id: userId,
      token_hash: tokenHash,
      expires_at: expiresAt.toISOString(),
      used_at: null,
      created_at: nowIso,
    };
    this.data.password_reset_tokens.push(tokenRecord);
    this.save();
    return tokenRecord;
  }

  public findPasswordResetToken(tokenHash: string): PasswordResetTokenEntity | undefined {
    let match = this.data.password_reset_tokens?.find(t => t.token_hash === tokenHash);
    if (!match) {
      this.reloadFromDisk();
      match = this.data.password_reset_tokens?.find(t => t.token_hash === tokenHash);
    }
    return match;
  }

  public consumePasswordResetToken(id: number): boolean {
    if (!this.data.password_reset_tokens) return false;
    const t = this.data.password_reset_tokens.find(item => item.id === id);
    if (!t) return false;
    t.used_at = new Date().toISOString();
    this.save();
    return true;
  }

  public revokeAllUserSessions(userId: number): void {
    const sessions = this.getUserSessions(userId);
    for (const s of sessions) {
      s.is_revoked = true;
      if (s.jti) {
        this.revokeToken(s.jti);
      }
    }
    this.save();
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
      contact_person: data.contact_person?.trim() || `${data.contact_first_name?.trim() || ''} ${data.contact_last_name?.trim() || ''}`.trim(),
      payment_terms: data.payment_terms?.trim() || 'Net 30',
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
    if (data.contact_person !== undefined) s.contact_person = data.contact_person.trim();
    if (data.payment_terms !== undefined) s.payment_terms = data.payment_terms.trim();
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

  public deleteSupplier(id: number, forceDisable: boolean = false): { success: boolean; action: 'deleted' | 'disabled'; supplier?: SupplierEntity; message?: string } {
    const s = this.getSupplierById(id);
    if (!s) return { success: false, action: 'deleted' };

    // Check if supplier has historical orders or transactions
    const hasHistory = (this.data.reorder_requests || []).some(r => r.supplier_id === id) ||
                       (this.data.stock_transactions || []).some(t => t.supplier_id === id);

    if (hasHistory && !forceDisable) {
      s.status = 'disabled';
      s.updated_at = new Date().toISOString();
      this.save();
      return {
        success: true,
        action: 'disabled',
        supplier: s,
        message: `Supplier '${s.name}' cannot be permanently deleted because historical transactions/orders exist. The supplier has been disabled instead.`,
      };
    }

    if (forceDisable) {
      s.status = 'disabled';
      s.updated_at = new Date().toISOString();
      this.save();
      return { success: true, action: 'disabled', supplier: s, message: `Supplier '${s.name}' disabled.` };
    }

    const idx = (this.data.suppliers || []).findIndex(item => item.id === id);
    if (idx !== -1) {
      this.data.suppliers.splice(idx, 1);
      this.save();
      return { success: true, action: 'deleted', supplier: s, message: `Supplier '${s.name}' permanently deleted.` };
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

  public createWarehouse(data: {
    code: string;
    name: string;
    address?: string;
    manager_name?: string;
    manager_email?: string;
    manager_phone?: string;
    warehouse_type?: 'Distribution Center' | 'Regional Hub' | 'Transit Depot' | 'Quarantine';
    capacity?: number;
  }): WarehouseEntity {
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
      manager_name: data.manager_name ? data.manager_name.trim() : '',
      manager_email: data.manager_email ? data.manager_email.trim() : '',
      manager_phone: data.manager_phone ? data.manager_phone.trim() : '',
      warehouse_type: data.warehouse_type || 'Distribution Center',
      capacity: data.capacity !== undefined ? Number(data.capacity) : 0,
      is_active: true,
      created_at: now,
      updated_at: now,
    };
    if (!this.data.warehouses) this.data.warehouses = [];
    this.data.warehouses.push(wh);
    this.save();
    return wh;
  }

  public updateWarehouse(id: number, data: {
    code?: string;
    name?: string;
    address?: string;
    manager_name?: string;
    manager_email?: string;
    manager_phone?: string;
    warehouse_type?: 'Distribution Center' | 'Regional Hub' | 'Transit Depot' | 'Quarantine';
    capacity?: number;
    is_active?: boolean;
  }): WarehouseEntity | null {
    const wh = this.getWarehouseById(id);
    if (!wh) return null;

    if (data.code !== undefined && data.code.trim()) {
      const cleanCode = data.code.trim().toUpperCase();
      if (cleanCode !== wh.code) {
        const existing = this.getWarehouseByCode(cleanCode);
        if (existing && existing.id !== id) {
          throw new Error(`Warehouse code '${cleanCode}' is already registered to another facility.`);
        }
        wh.code = cleanCode;
      }
    }

    if (data.is_active === false && wh.is_active) {
      // Check if warehouse has stock before disabling
      const check = this.canDeleteWarehouse(id);
      if (!check.canDelete) {
        throw new Error(check.message);
      }
    }

    if (data.name !== undefined) wh.name = data.name.trim();
    if (data.address !== undefined) wh.address = data.address.trim();
    if (data.manager_name !== undefined) wh.manager_name = data.manager_name.trim();
    if (data.manager_email !== undefined) wh.manager_email = data.manager_email.trim();
    if (data.manager_phone !== undefined) wh.manager_phone = data.manager_phone.trim();
    if (data.warehouse_type !== undefined) wh.warehouse_type = data.warehouse_type;
    if (data.capacity !== undefined) wh.capacity = Number(data.capacity);
    if (data.is_active !== undefined) wh.is_active = data.is_active;

    wh.updated_at = new Date().toISOString();
    this.save();
    return wh;
  }

  public canDeleteWarehouse(id: number): { canDelete: boolean; totalUnits: number; distinctItems: number; message: string } {
    const balances = (this.data.stock_balances || []).filter(b => b.warehouse_id === id && Number(b.quantity || 0) > 0);
    const totalUnits = balances.reduce((sum, b) => sum + Number(b.quantity || 0), 0);

    if (totalUnits > 0) {
      return {
        canDelete: false,
        totalUnits,
        distinctItems: balances.length,
        message: `A warehouse containing stock cannot be deleted or disabled until its stock has been safely transferred or otherwise resolved. Currently holding ${totalUnits} units across ${balances.length} item(s).`,
      };
    }
    return { canDelete: true, totalUnits: 0, distinctItems: 0, message: 'Warehouse has zero inventory balances and is eligible for deletion or deactivation.' };
  }

  public deleteWarehouse(id: number, forceDisable: boolean = false): { success: boolean; action: 'deleted' | 'disabled'; warehouse?: WarehouseEntity; message?: string } {
    const wh = this.getWarehouseById(id);
    if (!wh) return { success: false, action: 'deleted', message: 'Warehouse not found.' };

    const check = this.canDeleteWarehouse(id);
    if (!check.canDelete) {
      throw new Error(check.message);
    }

    if (forceDisable) {
      wh.is_active = false;
      wh.updated_at = new Date().toISOString();
      this.save();
      return { success: true, action: 'disabled', warehouse: wh, message: `Warehouse '${wh.name}' (${wh.code}) disabled.` };
    }

    const idx = (this.data.warehouses || []).findIndex(w => w.id === id);
    if (idx !== -1) {
      this.data.warehouses.splice(idx, 1);
      this.save();
      return { success: true, action: 'deleted', warehouse: wh, message: `Warehouse '${wh.name}' (${wh.code}) permanently deleted.` };
    }
    return { success: false, action: 'deleted' };
  }

  // Warehouse-wise Stock Details
  public getWarehouseStockDetails(warehouseId?: number): Array<{
    item_id: number;
    item_code: string;
    item_name: string;
    category_id?: number | null;
    category_name?: string;
    uom_symbol?: string;
    warehouse_id: number;
    warehouse_name: string;
    warehouse_code: string;
    available_quantity: number;
    reserved_quantity: number;
    min_stock_level: number;
    cost_price: number;
    total_valuation: number;
    stock_status: 'in_stock' | 'low_stock' | 'out_of_stock';
  }> {
    const items = (this.data.inventory_items || []).filter(i => i.status === 'active');
    const warehouses = warehouseId ? (this.data.warehouses || []).filter(w => w.id === warehouseId) : (this.data.warehouses || []);
    const balances = this.data.stock_balances || [];
    const transfers = (this.data.stock_transfers || []).filter(t => t.status === 'approved' || t.status === 'in_transit');

    const result: any[] = [];

    for (const wh of warehouses) {
      for (const it of items) {
        const bal = balances.find(b => b.warehouse_id === wh.id && b.item_id === it.id);
        const qty = bal ? Number(bal.quantity || 0) : 0;

        // Reserved quantity for pending transfers out of this warehouse
        const reserved = transfers
          .filter(t => t.source_warehouse_id === wh.id && t.item_id === it.id && t.status === 'approved')
          .reduce((sum, t) => sum + Number(t.requested_quantity || 0), 0);

        let stock_status: 'in_stock' | 'low_stock' | 'out_of_stock' = 'in_stock';
        if (qty === 0) {
          stock_status = 'out_of_stock';
        } else if (qty <= it.min_stock_level) {
          stock_status = 'low_stock';
        }

        const cat = it.category_id ? this.getCategoryById(it.category_id) : undefined;
        const uom = it.uom_id ? this.getUOMById(it.uom_id) : undefined;

        result.push({
          item_id: it.id,
          item_code: it.code,
          item_name: it.name,
          category_id: it.category_id,
          category_name: cat?.name || 'Uncategorized',
          uom_symbol: uom?.symbol || 'Units',
          warehouse_id: wh.id,
          warehouse_name: wh.name,
          warehouse_code: wh.code,
          available_quantity: qty,
          reserved_quantity: reserved,
          min_stock_level: it.min_stock_level,
          cost_price: it.cost_price,
          total_valuation: qty * it.cost_price,
          stock_status,
        });
      }
    }

    return result;
  }

  // Warehouse Dashboard Stats
  public getWarehouseDashboardStats(): {
    total_warehouses: number;
    active_warehouses: number;
    disabled_warehouses: number;
    total_stock_units: number;
    total_valuation: number;
    active_transfers_count: number;
    in_transit_count: number;
    pending_verifications_count: number;
    facilities: Array<{
      id: number;
      code: string;
      name: string;
      type: string;
      manager_name: string;
      capacity: number;
      is_active: boolean;
      items_count: number;
      total_units: number;
      total_valuation: number;
    }>;
  } {
    const warehouses = this.getWarehouses();
    const balances = this.data.stock_balances || [];
    const items = this.data.inventory_items || [];
    const transfers = this.data.stock_transfers || [];
    const verifications = this.data.stock_verifications || [];

    let overallUnits = 0;
    let overallValuation = 0;

    const facilities = warehouses.map(wh => {
      const whBalances = balances.filter(b => b.warehouse_id === wh.id && Number(b.quantity || 0) > 0);
      const totalUnits = whBalances.reduce((sum, b) => sum + Number(b.quantity || 0), 0);
      let whValuation = 0;
      for (const b of whBalances) {
        const item = items.find(i => i.id === b.item_id);
        if (item && item.cost_price) {
          whValuation += Number(b.quantity || 0) * item.cost_price;
        }
      }

      overallUnits += totalUnits;
      overallValuation += whValuation;

      return {
        id: wh.id,
        code: wh.code,
        name: wh.name,
        type: wh.warehouse_type || 'Distribution Center',
        manager_name: wh.manager_name || 'Unassigned',
        capacity: wh.capacity || 0,
        is_active: wh.is_active,
        items_count: whBalances.length,
        total_units: totalUnits,
        total_valuation: whValuation,
      };
    });

    return {
      total_warehouses: warehouses.length,
      active_warehouses: warehouses.filter(w => w.is_active).length,
      disabled_warehouses: warehouses.filter(w => !w.is_active).length,
      total_stock_units: overallUnits,
      total_valuation: overallValuation,
      active_transfers_count: transfers.filter(t => t.status === 'pending_approval' || t.status === 'approved' || t.status === 'in_transit').length,
      in_transit_count: transfers.filter(t => t.status === 'in_transit').length,
      pending_verifications_count: verifications.filter(v => v.status === 'pending_approval' || v.status === 'draft').length,
      facilities,
    };
  }

  // ==========================================
  // WAREHOUSE TRANSFERS (Section 5.3)
  // ==========================================

  public getNextTransferNo(): string {
    const list = this.data.stock_transfers || [];
    let max = list.length;
    for (const t of list) {
      const m = t.transfer_no.match(/TR-(\d+)/i);
      if (m) {
        const n = parseInt(m[1], 10);
        if (n > max) max = n;
      }
    }
    let next = max + 1;
    let no = `TR-${String(next).padStart(5, '0')}`;
    while (list.some(t => t.transfer_no.toUpperCase() === no.toUpperCase())) {
      next++;
      no = `TR-${String(next).padStart(5, '0')}`;
    }
    return no;
  }

  public getStockTransfers(options?: {
    status?: string;
    source_warehouse_id?: number;
    destination_warehouse_id?: number;
    search?: string;
  }): Array<StockTransferEntity & {
    source_warehouse_name: string;
    destination_warehouse_name: string;
    item_code: string;
    item_name: string;
    uom_symbol: string;
  }> {
    let list = [...(this.data.stock_transfers || [])];

    if (options?.status && options.status !== 'all') {
      list = list.filter(t => t.status === options.status);
    }
    if (options?.source_warehouse_id) {
      list = list.filter(t => t.source_warehouse_id === Number(options.source_warehouse_id));
    }
    if (options?.destination_warehouse_id) {
      list = list.filter(t => t.destination_warehouse_id === Number(options.destination_warehouse_id));
    }
    if (options?.search && options.search.trim()) {
      const s = options.search.trim().toLowerCase();
      list = list.filter(t => {
        const item = this.getItemById(t.item_id);
        return (
          t.transfer_no.toLowerCase().includes(s) ||
          (t.notes && t.notes.toLowerCase().includes(s)) ||
          (item && item.name.toLowerCase().includes(s)) ||
          (item && item.code.toLowerCase().includes(s))
        );
      });
    }

    list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return list.map(t => {
      const srcWh = this.getWarehouseById(t.source_warehouse_id);
      const destWh = this.getWarehouseById(t.destination_warehouse_id);
      const item = this.getItemById(t.item_id);
      const uom = item?.uom_id ? this.getUOMById(item.uom_id) : undefined;

      return {
        ...t,
        source_warehouse_name: srcWh?.name || 'Unknown Warehouse',
        destination_warehouse_name: destWh?.name || 'Unknown Warehouse',
        item_code: item?.code || 'N/A',
        item_name: item?.name || 'Unknown Item',
        uom_symbol: uom?.symbol || 'Units',
      };
    });
  }

  public getTransferById(id: number): (StockTransferEntity & {
    source_warehouse_name: string;
    destination_warehouse_name: string;
    item_code: string;
    item_name: string;
    uom_symbol: string;
  }) | null {
    const t = (this.data.stock_transfers || []).find(item => item.id === id);
    if (!t) return null;
    const srcWh = this.getWarehouseById(t.source_warehouse_id);
    const destWh = this.getWarehouseById(t.destination_warehouse_id);
    const item = this.getItemById(t.item_id);
    const uom = item?.uom_id ? this.getUOMById(item.uom_id) : undefined;

    return {
      ...t,
      source_warehouse_name: srcWh?.name || 'Unknown',
      destination_warehouse_name: destWh?.name || 'Unknown',
      item_code: item?.code || 'N/A',
      item_name: item?.name || 'Unknown',
      uom_symbol: uom?.symbol || 'Units',
    };
  }

  public createStockTransfer(data: {
    source_warehouse_id: number;
    destination_warehouse_id: number;
    item_id: number;
    requested_quantity: number;
    notes?: string;
    submit_for_approval?: boolean;
    user_id?: number | null;
    user_name?: string;
  }): StockTransferEntity {
    if (data.source_warehouse_id === data.destination_warehouse_id) {
      throw new Error("Source and destination warehouses must be different facilities.");
    }

    const item = this.getItemById(data.item_id);
    if (!item) throw new Error("Inventory item not found.");

    const srcWh = this.getWarehouseById(data.source_warehouse_id);
    if (!srcWh || !srcWh.is_active) throw new Error("Source warehouse is invalid or inactive.");

    const destWh = this.getWarehouseById(data.destination_warehouse_id);
    if (!destWh || !destWh.is_active) throw new Error("Destination warehouse is invalid or inactive.");

    const qty = Number(data.requested_quantity);
    if (qty <= 0) throw new Error("Transfer quantity must be greater than zero.");

    // Validate source warehouse available stock
    const srcBalance = (this.data.stock_balances || []).find(b => b.warehouse_id === data.source_warehouse_id && b.item_id === data.item_id);
    const available = srcBalance ? Number(srcBalance.quantity || 0) : 0;
    if (available < qty) {
      throw new Error(`Insufficient stock in source warehouse '${srcWh.name}'. Available: ${available} ${item.name}, Requested: ${qty}. Normal transfers cannot exceed available on-hand stock.`);
    }

    const now = new Date().toISOString();
    const id = (this.data.stock_transfers || []).length > 0 ? Math.max(...this.data.stock_transfers!.map(t => t.id)) + 1 : 1;
    const transferNo = this.getNextTransferNo();

    const transfer: StockTransferEntity = {
      id,
      transfer_no: transferNo,
      source_warehouse_id: data.source_warehouse_id,
      destination_warehouse_id: data.destination_warehouse_id,
      item_id: data.item_id,
      requested_quantity: qty,
      dispatched_quantity: 0,
      received_quantity: 0,
      status: data.submit_for_approval ? 'pending_approval' : 'draft',
      rejection_reason: null,
      notes: data.notes ? data.notes.trim() : '',
      dispatched_at: null,
      received_at: null,
      created_by: data.user_id || null,
      created_by_name: data.user_name || 'Authorized Staff',
      created_at: now,
      updated_at: now,
    };

    if (!this.data.stock_transfers) this.data.stock_transfers = [];
    this.data.stock_transfers.push(transfer);
    this.save();
    return transfer;
  }

  public approveStockTransfer(id: number, user_id?: number, user_name?: string): StockTransferEntity {
    const t = (this.data.stock_transfers || []).find(item => item.id === id);
    if (!t) throw new Error("Transfer record not found.");

    if (t.status !== 'pending_approval' && t.status !== 'draft') {
      throw new Error(`Cannot approve transfer in status '${t.status}'.`);
    }

    // Re-verify source warehouse stock
    const srcBalance = (this.data.stock_balances || []).find(b => b.warehouse_id === t.source_warehouse_id && b.item_id === t.item_id);
    const available = srcBalance ? Number(srcBalance.quantity || 0) : 0;
    if (available < t.requested_quantity) {
      throw new Error(`Cannot approve: Available stock in source facility has dropped below required quantity (Available: ${available}, Needed: ${t.requested_quantity}).`);
    }

    t.status = 'approved';
    t.updated_at = new Date().toISOString();
    this.save();
    return t;
  }

  public dispatchStockTransfer(id: number, user_id?: number, user_name?: string): StockTransferEntity {
    const t = (this.data.stock_transfers || []).find(item => item.id === id);
    if (!t) throw new Error("Transfer record not found.");

    if (t.status !== 'approved') {
      throw new Error(`Transfer must be in 'approved' status prior to recording physical dispatch. Current status: '${t.status}'.`);
    }

    // STRICT STOCK CONTROL RULE:
    // Deduct source stock upon dispatch.
    // Destination stock DOES NOT increase yet; it is marked 'in_transit'.
    const item = this.getItemById(t.item_id);
    if (!item) throw new Error("Item not found.");

    const srcBalance = (this.data.stock_balances || []).find(b => b.warehouse_id === t.source_warehouse_id && b.item_id === t.item_id);
    const available = srcBalance ? Number(srcBalance.quantity || 0) : 0;
    if (available < t.requested_quantity) {
      throw new Error(`Insufficient stock in source facility for physical dispatch (Available: ${available}, Required: ${t.requested_quantity}).`);
    }

    const now = new Date().toISOString();
    srcBalance!.quantity = available - t.requested_quantity;
    srcBalance!.updated_at = now;

    // Record source dispatch transaction in ledger
    if (!this.data.stock_transactions) this.data.stock_transactions = [];
    const txId = (this.data.stock_transactions.length > 0 ? Math.max(...this.data.stock_transactions.map(x => x.id)) : 0) + 1;
    this.data.stock_transactions.push({
      id: txId,
      transaction_type: 'issue',
      reference_no: t.transfer_no,
      item_id: t.item_id,
      quantity: t.requested_quantity,
      source_warehouse_id: t.source_warehouse_id,
      reason: `Transfer Dispatch to ${this.getWarehouseById(t.destination_warehouse_id)?.name || 'Destination'}`,
      notes: t.notes || 'In-transit stock dispatch',
      transaction_date: now,
      user_id: user_id || null,
      created_at: now,
    });

    t.status = 'in_transit';
    t.dispatched_quantity = t.requested_quantity;
    t.dispatched_at = now;
    t.updated_at = now;
    this.save();
    return t;
  }

  public receiveStockTransfer(id: number, received_quantity: number, notes?: string, user_id?: number, user_name?: string): StockTransferEntity {
    const t = (this.data.stock_transfers || []).find(item => item.id === id);
    if (!t) throw new Error("Transfer record not found.");

    if (t.status !== 'in_transit' && t.status !== 'partially_received') {
      throw new Error(`Transfer must be 'in_transit' to confirm physical intake. Current status: '${t.status}'.`);
    }

    const recQty = Number(received_quantity);
    if (recQty <= 0) throw new Error("Received quantity must be positive.");

    const remainingExpected = t.requested_quantity - (t.received_quantity || 0);
    if (recQty > remainingExpected) {
      throw new Error(`Received quantity (${recQty}) exceeds outstanding in-transit quantity (${remainingExpected}).`);
    }

    // STRICT STOCK CONTROL RULE:
    // Destination stock increases ONLY upon actual confirmed receipt!
    const now = new Date().toISOString();
    let destBalance = (this.data.stock_balances || []).find(b => b.warehouse_id === t.destination_warehouse_id && b.item_id === t.item_id);
    if (destBalance) {
      destBalance.quantity = Number(destBalance.quantity || 0) + recQty;
      destBalance.updated_at = now;
    } else {
      const bId = (this.data.stock_balances || []).length > 0 ? Math.max(...this.data.stock_balances!.map(b => b.id)) + 1 : 1;
      destBalance = {
        id: bId,
        item_id: t.item_id,
        warehouse_id: t.destination_warehouse_id,
        quantity: recQty,
        updated_at: now,
      };
      this.data.stock_balances!.push(destBalance);
    }

    // Record receipt transaction in ledger
    if (!this.data.stock_transactions) this.data.stock_transactions = [];
    const txId = (this.data.stock_transactions.length > 0 ? Math.max(...this.data.stock_transactions.map(x => x.id)) : 0) + 1;
    this.data.stock_transactions.push({
      id: txId,
      transaction_type: 'receipt',
      reference_no: t.transfer_no,
      item_id: t.item_id,
      quantity: recQty,
      destination_warehouse_id: t.destination_warehouse_id,
      notes: notes || `Transfer receipt intake from ${this.getWarehouseById(t.source_warehouse_id)?.name || 'Source'}`,
      transaction_date: now,
      user_id: user_id || null,
      created_at: now,
    });

    const totalReceived = (t.received_quantity || 0) + recQty;
    t.received_quantity = totalReceived;
    t.received_at = now;
    t.updated_at = now;

    if (totalReceived >= t.requested_quantity) {
      t.status = 'received';
    } else {
      t.status = 'partially_received';
    }

    if (notes) {
      t.notes = t.notes ? `${t.notes} | Intake: ${notes}` : notes;
    }

    this.save();
    return t;
  }

  public cancelStockTransfer(id: number, reason: string, user_id?: number, user_name?: string): StockTransferEntity {
    const t = (this.data.stock_transfers || []).find(item => item.id === id);
    if (!t) throw new Error("Transfer record not found.");

    if (t.status === 'received' || t.status === 'partially_received') {
      throw new Error(`Cannot cancel a transfer that has already been received at destination.`);
    }

    // If dispatched (in transit), restore source stock
    if (t.status === 'in_transit' && t.dispatched_quantity) {
      const srcBalance = (this.data.stock_balances || []).find(b => b.warehouse_id === t.source_warehouse_id && b.item_id === t.item_id);
      if (srcBalance) {
        srcBalance.quantity = Number(srcBalance.quantity || 0) + t.dispatched_quantity;
        srcBalance.updated_at = new Date().toISOString();
      }
    }

    t.status = 'cancelled';
    t.rejection_reason = reason;
    t.updated_at = new Date().toISOString();
    this.save();
    return t;
  }

  // ==========================================
  // PHYSICAL STOCK VERIFICATION (Section 5.4)
  // ==========================================

  public getNextVerificationNo(): string {
    const list = this.data.stock_verifications || [];
    let max = list.length;
    for (const v of list) {
      const m = v.verification_no.match(/AUD-(\d+)/i);
      if (m) {
        const n = parseInt(m[1], 10);
        if (n > max) max = n;
      }
    }
    let next = max + 1;
    let no = `AUD-${String(next).padStart(5, '0')}`;
    while (list.some(v => v.verification_no.toUpperCase() === no.toUpperCase())) {
      next++;
      no = `AUD-${String(next).padStart(5, '0')}`;
    }
    return no;
  }

  public getStockVerifications(options?: {
    status?: string;
    warehouse_id?: number;
  }): Array<StockVerificationEntity & { warehouse_name: string; warehouse_code: string }> {
    let list = [...(this.data.stock_verifications || [])];

    if (options?.status && options.status !== 'all') {
      list = list.filter(v => v.status === options.status);
    }
    if (options?.warehouse_id) {
      list = list.filter(v => v.warehouse_id === Number(options.warehouse_id));
    }

    list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return list.map(v => {
      const wh = this.getWarehouseById(v.warehouse_id);
      return {
        ...v,
        warehouse_name: wh?.name || 'Unknown Warehouse',
        warehouse_code: wh?.code || 'N/A',
      };
    });
  }

  public getVerificationById(id: number): (StockVerificationEntity & { warehouse_name: string; warehouse_code: string }) | null {
    const v = (this.data.stock_verifications || []).find(item => item.id === id);
    if (!v) return null;
    const wh = this.getWarehouseById(v.warehouse_id);
    return {
      ...v,
      warehouse_name: wh?.name || 'Unknown Warehouse',
      warehouse_code: wh?.code || 'N/A',
    };
  }

  public createStockVerification(data: {
    warehouse_id: number;
    items: Array<{
      item_id: number;
      counted_quantity: number;
      reason?: string;
    }>;
    notes?: string;
    submit_for_approval?: boolean;
    user_id?: number | null;
    user_name?: string;
  }): StockVerificationEntity {
    const wh = this.getWarehouseById(data.warehouse_id);
    if (!wh) throw new Error("Warehouse not found.");

    if (!Array.isArray(data.items) || data.items.length === 0) {
      throw new Error("At least one item must be verified.");
    }

    const now = new Date().toISOString();
    const id = (this.data.stock_verifications || []).length > 0 ? Math.max(...this.data.stock_verifications!.map(v => v.id)) + 1 : 1;
    const verificationNo = this.getNextVerificationNo();

    let totalVarianceUnits = 0;
    let totalVarianceValue = 0;

    const auditedItems: StockVerificationItem[] = [];

    for (const row of data.items) {
      const item = this.getItemById(row.item_id);
      if (!item) continue;

      const bal = (this.data.stock_balances || []).find(b => b.warehouse_id === data.warehouse_id && b.item_id === item.id);
      const systemQty = bal ? Number(bal.quantity || 0) : 0;
      const countedQty = Number(row.counted_quantity);
      if (countedQty < 0) throw new Error(`Physical count for '${item.name}' cannot be negative.`);

      const diff = countedQty - systemQty;
      const varVal = diff * item.cost_price;

      totalVarianceUnits += Math.abs(diff);
      totalVarianceValue += Math.abs(varVal);

      auditedItems.push({
        item_id: item.id,
        item_code: item.code,
        item_name: item.name,
        system_quantity: systemQty,
        counted_quantity: countedQty,
        variance: diff,
        cost_price: item.cost_price,
        variance_value: varVal,
        reason: row.reason ? row.reason.trim() : (diff !== 0 ? 'Physical audit discrepancy' : 'Count verified consistent'),
      });
    }

    const entry: StockVerificationEntity = {
      id,
      verification_no: verificationNo,
      warehouse_id: data.warehouse_id,
      status: data.submit_for_approval ? 'pending_approval' : 'draft',
      items: auditedItems,
      total_items: auditedItems.length,
      total_variance_units: totalVarianceUnits,
      total_variance_value: totalVarianceValue,
      notes: data.notes ? data.notes.trim() : '',
      created_by: data.user_id || null,
      created_by_name: data.user_name || 'Stock Auditor',
      approved_by: null,
      approved_by_name: undefined,
      approved_at: null,
      created_at: now,
      updated_at: now,
    };

    if (!this.data.stock_verifications) this.data.stock_verifications = [];
    this.data.stock_verifications.push(entry);
    this.save();
    return entry;
  }

  public approveStockVerification(id: number, user_id?: number, user_name?: string): StockVerificationEntity {
    const v = (this.data.stock_verifications || []).find(item => item.id === id);
    if (!v) throw new Error("Stock verification record not found.");

    if (v.status !== 'pending_approval' && v.status !== 'draft') {
      throw new Error(`Cannot approve verification in status '${v.status}'.`);
    }

    // STRICT STOCK CONTROL:
    // Apply inventory adjustments ONLY now, creating traceable adjustment records.
    for (const itemRow of v.items) {
      if (itemRow.variance !== 0) {
        this.adjustStock({
          reference_no: v.verification_no,
          item_id: itemRow.item_id,
          warehouse_id: v.warehouse_id,
          actual_quantity: itemRow.counted_quantity,
          reason: itemRow.reason || `Audited discrepancy in ${v.verification_no}`,
          notes: `Stock verification approved by ${user_name || 'Supervisor'}`,
          user_id,
        });
      }
    }

    const now = new Date().toISOString();
    v.status = 'approved';
    v.approved_by = user_id || null;
    v.approved_by_name = user_name || 'Inventory Supervisor';
    v.approved_at = now;
    v.updated_at = now;
    this.save();
    return v;
  }

  // ==========================================
  // GOODS RECEIPT FROM PURCHASE ORDERS (Section 6.3, 6.4)
  // ==========================================

  public receiveGoodsForReorder(reorderId: number, data: {
    destination_warehouse_id: number;
    received_quantity: number;
    invoice_ref?: string;
    notes?: string;
    user_id?: number;
    user_name?: string;
  }): {
    reorder: ReorderRequestEntity;
    transaction: StockTransactionEntity;
    new_balance: number;
  } {
    const reo = this.getReorderById(reorderId);
    if (!reo) throw new Error("Purchase request / order not found.");

    if (reo.status !== 'accepted' && reo.status !== 'partially_received') {
      throw new Error(`Only approved/accepted purchase orders can be received into inventory. Current status: '${reo.status}'.`);
    }

    const destWh = this.getWarehouseById(data.destination_warehouse_id);
    if (!destWh || !destWh.is_active) throw new Error("Destination warehouse is invalid or inactive.");

    const qty = Number(data.received_quantity);
    if (qty <= 0) throw new Error("Received quantity must be positive.");

    const agreedQty = reo.counter_quantity || reo.quantity;
    const currentReceived = reo.received_quantity || 0;
    const remainingExpected = agreedQty - currentReceived;

    if (qty > remainingExpected) {
      throw new Error(`Intake quantity (${qty}) exceeds remaining outstanding order balance (${remainingExpected}).`);
    }

    // Execute authoritative stock receipt into destination warehouse
    const referenceNo = data.invoice_ref?.trim() || `GR-${reo.reorder_no}`;
    const result = this.receiveStock({
      reference_no: referenceNo,
      item_id: reo.item_id,
      warehouse_id: data.destination_warehouse_id,
      quantity: qty,
      supplier_id: reo.supplier_id,
      unit_cost: reo.counter_unit_price || reo.unit_price,
      notes: data.notes ? `${data.notes} (PO: ${reo.reorder_no})` : `Goods intake for order ${reo.reorder_no}`,
      user_id: data.user_id,
    });

    const newTotalReceived = currentReceived + qty;
    reo.received_quantity = newTotalReceived;
    reo.destination_warehouse_id = data.destination_warehouse_id;
    reo.updated_at = new Date().toISOString();

    if (newTotalReceived >= agreedQty) {
      reo.status = 'closed';
    } else {
      reo.status = 'partially_received';
    }

    this.save();

    return {
      reorder: reo,
      transaction: result.transaction,
      new_balance: result.new_balance,
    };
  }

  // ==========================================
  // EMAIL CONVERSATIONS & NEGOTIATION TIMELINE (Section 4.5)
  // ==========================================

  public getEmailConversations(options?: {
    reorder_id?: number;
    search?: string;
  }): Array<{
    id: number;
    reorder_id: number;
    reorder_no: string;
    item_name: string;
    supplier_name: string;
    supplier_email: string;
    sender: string;
    recipient: string;
    action: string;
    proposed_unit_price: number | null;
    proposed_quantity: number | null;
    proposed_delivery_date: string | null;
    notes: string;
    timestamp: string;
  }> {
    const negotiations = [...(this.data.reorder_negotiations || [])];
    const reorders = this.data.reorder_requests || [];

    let list = negotiations.map(n => {
      const reo = reorders.find(r => r.id === n.reorder_id);
      const supplier = reo ? this.getSupplierById(reo.supplier_id) : undefined;
      const item = reo ? this.getItemById(reo.item_id) : undefined;

      const isBuyer = n.actor === 'buyer';
      const sender = isBuyer ? 'Nexora Procurement (Buyer)' : (supplier?.name || 'Supplier Portal');
      const recipient = isBuyer ? (supplier?.email || 'supplier@partner.com') : 'procurement@nexora.local';

      return {
        id: n.id,
        reorder_id: n.reorder_id,
        reorder_no: reo?.reorder_no || `RO-${n.reorder_id}`,
        item_name: item?.name || 'Unknown SKU',
        supplier_name: supplier?.name || 'Supplier Partner',
        supplier_email: supplier?.email || '',
        sender,
        recipient,
        action: n.action,
        proposed_unit_price: n.unit_price,
        proposed_quantity: n.quantity,
        proposed_delivery_date: n.delivery_date,
        notes: n.notes,
        timestamp: n.timestamp,
      };
    });

    if (options?.reorder_id) {
      list = list.filter(c => c.reorder_id === Number(options.reorder_id));
    }
    if (options?.search && options.search.trim()) {
      const q = options.search.trim().toLowerCase();
      list = list.filter(c =>
        c.reorder_no.toLowerCase().includes(q) ||
        c.supplier_name.toLowerCase().includes(q) ||
        c.item_name.toLowerCase().includes(q) ||
        c.notes.toLowerCase().includes(q)
      );
    }

    list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return list;
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
    item_type?: 'raw_material' | 'component' | 'finished_good' | 'consumable';
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

    const validTypes = ['raw_material', 'component', 'finished_good', 'consumable'] as const;
    const itemType = validTypes.includes(data.item_type as any) ? data.item_type : 'raw_material';

    const item: InventoryItemEntity = {
      id,
      code: cleanCode,
      name: data.name.trim(),
      description: data.description ? data.description.trim() : '',
      category_id: data.category_id || null,
      uom_id: data.uom_id || null,
      item_type: itemType,
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
