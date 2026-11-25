/**
 * Nexora Frontend Shared Type Definitions
 */

export interface User {
  id: number;
  first_name: string;
  last_name: string;
  name: string;
  email: string;
  username: string;
  phone?: string;
  department?: string;
  theme_preference?: string;
  role: string;
  roles?: string[];
  is_active: boolean;
  is_verified: boolean;
  last_login_at: string | null;
  created_at: string;
  permissions?: string[];
}

export interface Role {
  id: number;
  name: string;
  code: string;
  description: string;
  is_system: boolean;
  is_active: boolean;
  permissions: string[];
  user_count?: number;
  created_at?: string;
  updated_at?: string;
}

export interface Permission {
  id?: number;
  code: string;
  name: string;
  module: string;
  category: string;
  description?: string;
}

export interface UserCreateDTO {
  first_name: string;
  last_name: string;
  email: string;
  password?: string;
  role: string;
  roles?: string[];
  phone?: string;
  department?: string;
  is_active?: boolean;
}

export interface UserUpdateDTO {
  first_name: string;
  last_name: string;
  email?: string;
  role: string;
  roles?: string[];
  phone?: string;
  department?: string;
  is_active?: boolean;
}

export interface RoleCreateDTO {
  name: string;
  code: string;
  description?: string;
  is_active?: boolean;
  permissions?: string[];
}

export interface RoleUpdateDTO {
  name: string;
  description?: string;
  is_active?: boolean;
  permissions?: string[];
}

export interface MenuItem {
  id: number;
  label: string;
  icon: string;
  route: string;
  code?: string;
  module_badge?: string;
  is_implemented: boolean;
  module_tag?: string;
  children?: MenuItem[];
}

export type MenuItemDTO = MenuItem;

export interface APIResponse<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
  errors?: Array<{ field: string; message: string }>;
}

export interface LoginResponseData {
  user: User;
  access_token: string;
  token_type: string;
  expires_in_seconds: number;
}

export interface AuthStatusData {
  authenticated: boolean;
  user: User | null;
}

export interface SystemHealthData {
  status: 'healthy' | 'unhealthy' | 'degraded';
  database: 'connected' | 'unavailable';
  app: string;
  env: string;
}

export interface OperationalStatus {
  app_name: string;
  environment: string;
  database_connected: boolean;
  smtp_configured: boolean;
  timezone: string;
}

export interface AppNotification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  timestamp: number;
}

export interface SummaryCardData {
  id: string;
  title: string;
  value: string | number;
  status: 'normal' | 'success' | 'warning' | 'error';
  description: string;
  permission?: string;
}

export interface AuditLogItem {
  id: number;
  user_id: number | null;
  user_email: string;
  action: string;
  module: string;
  details: string;
  ip_address: string;
  timestamp: string;
}

export interface UserSessionItem {
  id: number;
  ip_address: string;
  user_agent: string;
  created_at: string;
  last_active_at: string;
  is_current: boolean;
  is_revoked: boolean;
}

export interface DatabaseBackupItem {
  id: string;
  filename: string;
  size_bytes: number;
  created_at: string;
  status: string;
}

export interface Supplier {
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

export interface SupplierListResult {
  items: Supplier[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface SupplierFormData {
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
}

export interface ImportPreviewItem {
  row_number: number;
  code: string;
  name: string;
  category: string;
  tax_id: string;
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
  status: 'active' | 'disabled';
  is_valid: boolean;
  is_duplicate: boolean;
  errors: string[];
}

export interface ImportPreviewData {
  total_rows: number;
  valid_rows: number;
  invalid_rows: number;
  duplicate_rows: number;
  preview_items?: ImportPreviewItem[];
  preview_categories?: CategoryImportPreviewItem[];
}

export interface CategoryImportPreviewItem {
  row_number: number;
  code: string;
  name: string;
  description: string;
  status: 'active' | 'disabled';
  is_valid: boolean;
  is_duplicate: boolean;
  errors: string[];
}

export interface CategoryImportPreviewData {
  total_rows: number;
  valid_rows: number;
  invalid_rows: number;
  duplicate_rows: number;
  preview_categories: CategoryImportPreviewItem[];
}

export interface ImportCommitResult {
  total_processed: number;
  created_count: number;
  updated_count: number;
  skipped_count: number;
  failed_count: number;
  errors: string[];
}

export interface InventoryCategory {
  id: number;
  code: string;
  name: string;
  description: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface UnitOfMeasure {
  id: number;
  code: string;
  name: string;
  symbol: string;
  is_active: boolean;
  created_at: string;
}

export interface Warehouse {
  id: number;
  code: string;
  name: string;
  address: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface StockBalance {
  warehouse_id: number;
  warehouse_name: string;
  warehouse_code: string;
  quantity: number;
  updated_at: string;
}

export interface InventoryItem {
  id: number;
  code: string;
  name: string;
  description: string;
  category_id?: number | null;
  category_name?: string;
  uom_id?: number | null;
  uom_symbol?: string;
  barcode?: string;
  min_stock_level: number;
  reorder_quantity: number;
  cost_price: number;
  selling_price: number;
  status: 'active' | 'disabled';
  total_on_hand: number;
  balances?: StockBalance[];
  created_by?: number | null;
  created_at: string;
  updated_at: string;
}

export interface StockTransaction {
  id: number;
  transaction_type: 'receipt' | 'issue' | 'adjustment' | 'transfer';
  reference_no: string;
  item_id: number;
  item_code?: string;
  item_name?: string;
  quantity: number;
  source_warehouse_id?: number | null;
  source_warehouse_name?: string;
  destination_warehouse_id?: number | null;
  destination_warehouse_name?: string;
  supplier_id?: number | null;
  supplier_name?: string;
  unit_cost?: number | null;
  reason?: string;
  notes?: string;
  transaction_date: string;
  user_id?: number | null;
  user_name?: string;
  created_at: string;
}

export interface LowStockAlertItem {
  item_id: number;
  item_code: string;
  item_name: string;
  category_name?: string;
  uom_symbol?: string;
  quantity_on_hand: number;
  min_stock_level: number;
  reorder_quantity: number;
  status: 'out_of_stock' | 'low_stock';
}

export interface ReorderNegotiation {
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

export interface ReorderRequest {
  id: number;
  reorder_no: string;
  item_id: number;
  item_code: string;
  item_name: string;
  category_name?: string;
  uom_symbol?: string;
  min_stock_level?: number;
  current_available_stock?: number;
  supplier_id: number;
  supplier_name: string;
  supplier_code: string;
  supplier_email: string;
  supplier_phone?: string;
  supplier_contact_name?: string;
  quantity: number;
  unit_price: number;
  total_amount: number;
  expected_delivery_date: string | null;
  notes: string;
  status: 'pending_supplier_response' | 'counteroffer_received' | 'accepted' | 'rejected' | 'revised_offer' | 'cancelled';
  token_expires_at: string;
  responded_at: string | null;
  supplier_response_notes: string | null;
  counter_unit_price: number | null;
  counter_quantity: number | null;
  counter_delivery_date: string | null;
  rejection_reason: string | null;
  supplier_link?: string;
  token?: string;
  created_by?: number | null;
  created_by_name?: string;
  created_at: string;
  updated_at: string;
  negotiations?: ReorderNegotiation[];
}

export interface InventoryDashboardData {
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
  stock_by_location: Array<{
    warehouse_id: number;
    warehouse_name: string;
    warehouse_code: string;
    total_quantity: number;
    items_count: number;
  }>;
}

export interface CategoryImportPreviewItem {
  row_number: number;
  code: string;
  name: string;
  description: string;
  status: 'active' | 'disabled';
  is_valid: boolean;
  is_duplicate: boolean;
  errors: string[];
}

export interface CategoryImportPreviewData {
  total_rows: number;
  valid_rows: number;
  invalid_rows: number;
  duplicate_rows: number;
  preview_categories: CategoryImportPreviewItem[];
}

export interface PerformanceRosterEmployee {
  id: number;
  emp_id: string;
  employee_id: string;
  first_name: string;
  last_name: string;
  name: string;
  display_name: string;
  department: string;
  designation: string;
  login_enabled: boolean;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
  created_by?: string;
  total_events: number;
  last_event_timestamp: string | null;
}

export interface PerformanceEmployee {
  id: number;
  emp_id?: string;
  employee_id: string;
  first_name: string;
  last_name: string;
  display_name?: string;
  name: string;
  email?: string;
  department: string;
  role: string;
  is_active: boolean;
  today_count: number;
  week_count: number;
  month_count: number;
  total_count: number;
  period_count: number;
  last_event_timestamp: string | null;
  last_event_source: string | null;
  last_device_id: string | null;
}

export interface PerformanceSummary {
  total_eligible_employees: number;
  today_work_events: number;
  today_hardware_events: number;
  today_simulated_events: number;
  active_today_employees: number;
  latest_event: {
    id: number;
    employee_id: number;
    employee_name: string;
    timestamp: string;
    source: string;
    device_id: string | null;
  } | null;
}

export interface PerformanceReportData {
  period: string;
  include_simulated: boolean;
  stats: {
    total_events: number;
    active_employees: number;
    hardware_events: number;
    simulated_events: number;
  };
  trend: Array<{
    time_bucket: string;
    event_count: number;
    hardware_count: number;
    simulated_count: number;
  }>;
  employees: Array<{
    employee_id: string;
    raw_id: number;
    name: string;
    email: string;
    department: string;
    completed_count: number;
    hardware_count: number;
    simulated_count: number;
    first_event: string | null;
    last_event: string | null;
  }>;
}

export interface WorkCompletionEvent {
  id: number;
  employee_id: number;
  event_timestamp: string;
  created_at: string;
  source: 'SIMULATED' | 'HARDWARE';
  device_id: string | null;
  idempotency_key: string | null;
  recorded_by_user_id: number | null;
  notes: string | null;
}
