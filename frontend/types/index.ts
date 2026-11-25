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
  profile_picture?: string;
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
  profile_picture?: string;
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
  profile_picture?: string;
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
  username?: string;
  action: string;
  module: string;
  details: string;
  previous_value?: string | null;
  updated_value?: string | null;
  ip_address: string;
  timestamp: string;
}

export interface UserSessionItem {
  id: number;
  user_id?: number;
  username?: string;
  employee_name?: string;
  ip_address: string;
  user_agent: string;
  created_at: string;
  last_active_at: string;
  is_current: boolean;
  is_revoked: boolean;
  status?: 'active' | 'revoked';
}

export interface DatabaseBackupItem {
  id: string;
  filename: string;
  backup_type?: 'MANUAL' | 'SCHEDULED';
  size_bytes: number;
  table_count?: number;
  status: string;
  sha256?: string;
  created_by?: string;
  notes?: string;
  created_at: string;
  completed_at?: string;
}

export interface EffectiveSettingItem {
  key: string;
  category: string;
  label: string;
  description: string;
  type: 'text' | 'number' | 'boolean' | 'password' | 'select';
  options?: { value: string; label: string }[];
  envKey?: string;
  value: string;
  env_default: string;
  is_overridden: boolean;
  updated_at?: string;
  updated_by?: string;
  isSensitive?: boolean;
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

export interface EffectiveSettingsResponse {
  settings: EffectiveSettingItem[];
  summaries: CategorySummary[];
}

export interface SecuritySettings {
  password_min_length: number;
  password_require_uppercase: boolean;
  password_require_number: boolean;
  password_require_special: boolean;
  session_timeout_minutes: number;
  max_login_attempts: number;
  lockout_duration_minutes: number;
  password_reset_expiry_minutes: number;
  backup_schedule_enabled: boolean;
  backup_schedule_frequency: 'daily' | 'weekly' | 'monthly';
  backup_retention_count: number;
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
  contact_details?: string;
  manager_name?: string;
  manager_email?: string;
  manager_phone?: string;
  warehouse_type?: 'Distribution Center' | 'Regional Hub' | 'Transit Depot' | 'Quarantine';
  capacity?: number;
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
  item_type?: 'raw_material' | 'component' | 'finished_good' | 'consumable';
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
  status: 'draft' | 'pending_supplier_response' | 'counteroffer_received' | 'accepted' | 'rejected' | 'revised_offer' | 'cancelled' | 'partially_received' | 'received' | 'closed';
  received_quantity?: number;
  destination_warehouse_id?: number | null;
  destination_warehouse_name?: string;
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

export interface StockTransfer {
  id: number;
  transfer_no: string;
  source_warehouse_id: number;
  source_warehouse_name: string;
  source_warehouse_code: string;
  destination_warehouse_id: number;
  destination_warehouse_name: string;
  destination_warehouse_code: string;
  item_id: number;
  item_code: string;
  item_name: string;
  uom_symbol?: string;
  requested_quantity: number;
  received_quantity: number;
  status: 'pending_approval' | 'approved' | 'in_transit' | 'received' | 'partially_received' | 'cancelled';
  dispatched_at: string | null;
  received_at: string | null;
  created_by: number;
  created_by_name?: string;
  approved_by?: number | null;
  dispatched_by?: number | null;
  received_by?: number | null;
  remarks?: string;
  discrepancy_reason?: string;
  created_at: string;
  updated_at: string;
}

export interface StockVerificationItem {
  item_id: number;
  item_code: string;
  item_name: string;
  uom_symbol?: string;
  system_quantity: number;
  physical_quantity: number;
  variance: number;
  unit_cost?: number;
  discrepancy_reason?: string;
}

export interface StockVerification {
  id: number;
  verification_no: string;
  warehouse_id: number;
  warehouse_name: string;
  warehouse_code: string;
  verified_date: string;
  status: 'draft' | 'submitted' | 'approved' | 'rejected';
  items: StockVerificationItem[];
  remarks?: string;
  created_by: number;
  created_by_name?: string;
  approved_by?: number | null;
  approved_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface WarehouseStockItem {
  warehouse_id: number;
  warehouse_name: string;
  warehouse_code: string;
  item_id: number;
  item_code: string;
  item_name: string;
  category_name: string;
  uom_symbol: string;
  available_quantity: number;
  reserved_quantity: number;
  min_stock_level: number;
  unit_cost: number;
  valuation: number;
  stock_status: 'Out of Stock' | 'Low Stock' | 'Adequate';
}

export interface WarehouseDashboardStats {
  total_warehouses: number;
  active_warehouses: number;
  total_items_held: number;
  total_stock_units: number;
  total_valuation: number;
  active_transfers: number;
  in_transit_transfers: number;
  pending_verifications: number;
}

export interface SupplierConversation {
  id: string;
  reorder_id: number;
  reorder_no: string;
  supplier_id: number;
  supplier_name: string;
  supplier_email: string;
  type: 'email_dispatched' | 'counteroffer' | 'acceptance' | 'rejection' | 'revised_offer';
  sender: string;
  recipient: string;
  subject: string;
  message: string;
  timestamp: string;
  status_before?: string;
  status_after?: string;
  token_preview?: string;
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
  total_registered_employees: number;
  stats: {
    total_events: number;
    active_employees: number;
    hardware_events: number;
    simulated_events: number;
  };
  comparison?: {
    current_label: string;
    prev_label: string;
    current_total: number;
    prev_total: number;
    percent_change: number | null;
  };
  top_performers: Array<{
    emp_id: string;
    first_name: string;
    last_name: string;
    name: string;
    department?: string;
    completed_count: number;
  }>;
  hourly_distribution: Array<{
    hour: number;
    label: string;
    event_count: number;
    hardware_count: number;
    simulated_count: number;
  }>;
  trend: Array<{
    time_bucket: string;
    event_count: number;
    hardware_count: number;
    simulated_count: number;
  }>;
  employees: Array<{
    emp_id: string;
    employee_id: string;
    raw_id: number;
    first_name: string;
    last_name: string;
    name: string;
    email?: string;
    department: string;
    designation?: string;
    completed_count: number;
    hardware_count: number;
    simulated_count: number;
    first_event: string | null;
    last_event: string | null;
    last_source: string | null;
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

export interface Department {
  id: number;
  code: string;
  name: string;
  description: string;
  status: 'active' | 'disabled';
  is_active?: boolean;
  employee_count?: number;
  created_at: string;
  updated_at: string;
}

export interface DepartmentCreateDTO {
  code: string;
  name: string;
  description?: string;
  status?: 'active' | 'disabled';
  is_active?: boolean;
}

export interface DepartmentUpdateDTO {
  code?: string;
  name?: string;
  description?: string;
  status?: 'active' | 'disabled';
  is_active?: boolean;
}

// ============================================================================
// POSTGRESQL-ONLY ERP MODULE TYPES
// ============================================================================

export interface SupplierContact {
  id: number;
  supplier_id: number;
  full_name: string;
  designation?: string | null;
  department?: string | null;
  email?: string | null;
  phone?: string | null;
  is_primary: boolean;
  notes?: string | null;
  created_at: string;
}

export interface SupplierAgreement {
  id: number;
  supplier_id: number;
  agreement_number: string;
  title: string;
  agreement_type: string;
  start_date: string;
  end_date?: string | null;
  payment_terms?: string | null;
  credit_limit: number;
  currency: string;
  status: string;
  terms_summary?: string | null;
  created_by?: string | null;
  created_at: string;
}

export interface SupplierHistoryEntry {
  id: number;
  supplier_id: number;
  event_type: string;
  reference_no?: string | null;
  summary: string;
  details?: string | null;
  actor_name?: string | null;
  created_at: string;
}

export interface WarehouseLocation {
  id: number;
  warehouse_id: number;
  location_code: string;
  zone: string;
  aisle?: string | null;
  rack?: string | null;
  bin?: string | null;
  location_type: string;
  capacity: number;
  is_active: boolean;
  notes?: string | null;
  created_at: string;
}

export interface PurchaseRequestRecord {
  id: number;
  pr_number: string;
  requester_name: string;
  department?: string | null;
  request_date: string;
  required_date?: string | null;
  preferred_supplier_id?: number | null;
  preferred_supplier_name?: string | null;
  status: string;
  priority: string;
  total_amount: number;
  notes?: string | null;
  items: Array<{
    id: number;
    item_id?: number | null;
    item_code: string;
    item_name: string;
    uom?: string;
    quantity: number;
    estimated_unit_price: number;
    total_price: number;
  }>;
  created_at: string;
}

export interface PurchaseOrderRecord {
  id: number;
  po_number: string;
  pr_id?: number | null;
  supplier_id: number;
  supplier_name: string;
  warehouse_id?: number | null;
  warehouse_name?: string | null;
  order_date: string;
  expected_delivery_date?: string | null;
  status: string;
  payment_terms?: string | null;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  notes?: string | null;
  created_by?: string | null;
  items: Array<{
    id: number;
    item_id?: number | null;
    item_code: string;
    item_name: string;
    uom: string;
    ordered_quantity: number;
    received_quantity: number;
    unit_price: number;
    tax_rate: number;
    total_price: number;
  }>;
  created_at: string;
}

export interface GrnRecord {
  id: number;
  grn_number: string;
  po_id?: number | null;
  po_number?: string | null;
  supplier_id: number;
  supplier_name: string;
  warehouse_id?: number | null;
  warehouse_name: string;
  receipt_date: string;
  delivery_challan_no?: string | null;
  vehicle_no?: string | null;
  status: string;
  qc_status: string;
  received_by?: string | null;
  notes?: string | null;
  stock_posted: boolean;
  stock_posted_at?: string | null;
  items: Array<{
    id: number;
    po_item_id?: number | null;
    item_id?: number | null;
    item_code: string;
    item_name: string;
    uom: string;
    expected_quantity: number;
    received_quantity: number;
    accepted_quantity: number;
    rejected_quantity: number;
    unit_price: number;
    batch_number?: string | null;
    location_code?: string | null;
    qc_status: string;
  }>;
  quality_checks: Array<{
    id: number;
    grn_item_id?: number | null;
    inspector_name: string;
    inspection_date: string;
    parameter_name: string;
    expected_spec?: string | null;
    observed_value?: string | null;
    sample_size: number;
    passed_qty: number;
    failed_qty: number;
    result: string;
    remarks?: string | null;
  }>;
  created_at: string;
}

export interface ProductRecord {
  id: number;
  product_code: string;
  name: string;
  category: string;
  sku?: string | null;
  uom: string;
  selling_price: number;
  standard_cost: number;
  status: string;
  description?: string | null;
  component_count?: number;
  bom_count?: number;
  components?: Array<{
    id: number;
    component_code: string;
    component_name: string;
    component_type: string;
    uom: string;
    quantity_per_unit: number;
    unit_cost: number;
    scrap_percent: number;
  }>;
  boms?: Array<{
    id: number;
    bom_code: string;
    version: string;
    status: string;
    effective_date: string;
    batch_size: number;
    total_material_cost: number;
    notes?: string | null;
    items: Array<{
      id: number;
      item_code: string;
      item_name: string;
      item_type: string;
      quantity: number;
      uom: string;
      unit_cost: number;
      scrap_percent: number;
      line_cost: number;
    }>;
  }>;
  created_at: string;
}

export interface WorkOrderRecord {
  id: number;
  wo_number: string;
  product_id: number;
  product_code: string;
  product_name: string;
  bom_id?: number | null;
  warehouse_name?: string | null;
  planned_quantity: number;
  produced_quantity: number;
  scrap_quantity: number;
  unit_of_measure: string;
  priority: string;
  status: string;
  planned_start_date?: string | null;
  planned_end_date?: string | null;
  assigned_team?: string | null;
  supervisor_name?: string | null;
  notes?: string | null;
  completion_percent: number;
  progress_logs: Array<{
    id: number;
    log_date: string;
    shift?: string | null;
    team_name?: string | null;
    operator_name?: string | null;
    quantity_produced: number;
    quantity_scrapped: number;
    downtime_minutes: number;
    remarks?: string | null;
    created_at: string;
  }>;
  created_at: string;
}

export interface ProductionTeamRecord {
  id: number;
  team_code: string;
  team_name: string;
  department?: string | null;
  lead_name?: string | null;
  member_count: number;
  status: string;
}

export interface ProductReadinessPayload {
  entries: Array<{
    id: number;
    product_id: number;
    product_code: string;
    product_name: string;
    work_order_id?: number | null;
    wo_number?: string | null;
    team_id?: number | null;
    team_name: string;
    stage_name: string;
    target_units: number;
    completed_units: number;
    readiness_percent: number;
    status: string;
    blocker_notes?: string | null;
    updated_by?: string | null;
    last_updated_at: string;
  }>;
  product_summary: Array<{
    product_id: number;
    product_code: string;
    product_name: string;
    stage_count: number;
    total_target: number;
    total_completed: number;
    avg_readiness_percent: number;
  }>;
  team_summary: Array<{
    team_name: string;
    assigned_stages: number;
    products_count: number;
    total_target: number;
    total_completed: number;
    avg_readiness_percent: number;
  }>;
}

