/**
 * Nexora Frontend API Client
 * Centralized HTTP service communicating with the backend.
 * Uses credentials: 'include' for HttpOnly cookies and Bearer tokens.
 */

import {
  APIResponse,
  AuditLogItem,
  AuthStatusData,
  DatabaseBackupItem,
  LoginResponseData,
  MenuItem,
  OperationalStatus,
  Permission,
  Role,
  RoleCreateDTO,
  RoleUpdateDTO,
  SummaryCardData,
  SystemHealthData,
  User,
  UserCreateDTO,
  UserSessionItem,
  UserUpdateDTO,
  Supplier,
  SupplierListResult,
  ImportPreviewData,
  CategoryImportPreviewData,
  ImportCommitResult,
  InventoryCategory,
  UnitOfMeasure,
  Warehouse,
  InventoryItem,
  StockTransaction,
  LowStockAlertItem,
  ReorderRequest,
  ReorderNegotiation,
  InventoryDashboardData,
  PerformanceEmployee,
  PerformanceRosterEmployee,
  PerformanceSummary,
  PerformanceReportData,
  WorkCompletionEvent,
} from '../types';

let inMemoryToken: string | null = null;

export const setAuthToken = (token: string | null) => {
  inMemoryToken = token;
  if (token) {
    try {
      localStorage.setItem('nexora_token', token);
    } catch {}
  } else {
    try {
      localStorage.removeItem('nexora_token');
    } catch {}
  }
};

export const getAuthToken = (): string | null => {
  if (!inMemoryToken) {
    try {
      inMemoryToken = localStorage.getItem('nexora_token');
    } catch {}
  }
  return inMemoryToken;
};

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<APIResponse<T>> {
  const headers = new Headers(options.headers || {});
  headers.set('Content-Type', 'application/json');

  const token = getAuthToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const config: RequestInit = {
    ...options,
    headers,
    credentials: 'include',
  };

  try {
    const res = await fetch(`/api${endpoint}`, config);
    const data = await res.json();

    if (!res.ok) {
      return {
        success: false,
        message: data.message || `HTTP ${res.status}: Request failed`,
        errors: data.errors,
      };
    }
    return data;
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Network error';
    return {
      success: false,
      message: `Connection error: ${errorMsg}. Please verify backend status.`,
    };
  }
}

export const api = {
  // Authentication
  login: (email: string, password: string) =>
    request<LoginResponseData>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  logout: () =>
    request<null>('/auth/logout', {
      method: 'POST',
    }),

  getCurrentSession: () =>
    request<AuthStatusData>('/auth/me', {
      method: 'GET',
    }),

  forgotPassword: (email: string) =>
    request<null>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  resetPassword: (token: string, new_password: string) =>
    request<null>('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, new_password }),
    }),

  changePassword: (current_password: string, new_password: string) =>
    request<null>('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ current_password, new_password }),
    }),

  // Navigation Menus (Database-driven per Section 3 & 8)
  getNavigationMenu: () =>
    request<MenuItem[]>('/navigation/menu', {
      method: 'GET',
    }),

  // User Profile (Section 4)
  getProfile: () =>
    request<User>('/users/profile', {
      method: 'GET',
    }),

  updateProfile: (data: {
    first_name: string;
    last_name: string;
    name?: string;
    username?: string;
    phone?: string;
    department?: string;
    theme_preference?: string;
  }) =>
    request<User>('/users/profile', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  listUsers: () =>
    request<User[]>('/users', {
      method: 'GET',
    }),

  getUser: (id: number) =>
    request<User>(`/users/${id}`, {
      method: 'GET',
    }),

  createUser: (data: UserCreateDTO) =>
    request<User>('/users', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateUser: (id: number, data: UserUpdateDTO) =>
    request<User>(`/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteUser: (id: number) =>
    request<null>(`/users/${id}`, {
      method: 'DELETE',
    }),

  toggleUserStatus: (id: number, is_active: boolean) =>
    request<User>(`/users/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ is_active }),
    }),

  // Roles & Permissions Management (Module 3)
  listRoles: () =>
    request<Role[]>('/roles', {
      method: 'GET',
    }),

  getRole: (id: number) =>
    request<Role>(`/roles/${id}`, {
      method: 'GET',
    }),

  createRole: (data: RoleCreateDTO) =>
    request<Role>('/roles', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateRole: (id: number, data: RoleUpdateDTO) =>
    request<Role>(`/roles/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteRole: (id: number) =>
    request<null>(`/roles/${id}`, {
      method: 'DELETE',
    }),

  toggleRoleStatus: (id: number, is_active: boolean) =>
    request<Role>(`/roles/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ is_active }),
    }),

  listPermissions: () =>
    request<Permission[]>('/permissions', {
      method: 'GET',
    }),

  updateRolePermissions: (roleCode: string, permissions: string[]) =>
    request<Role>(`/roles/${roleCode}/permissions`, {
      method: 'PUT',
      body: JSON.stringify({ permissions }),
    }),

  // Role-Specific Dashboard (Section 2)
  getDashboardWidgets: () =>
    request<{
      summaryCards: SummaryCardData[];
      recentActivity: AuditLogItem[];
      systemReadiness: Record<string, string>;
    }>('/dashboard/widgets', {
      method: 'GET',
    }),

  // Settings & Audit Trail (Section 9)
  getGeneralSettings: () =>
    request<Record<string, string>>('/settings/general', {
      method: 'GET',
    }),

  updateGeneralSettings: (settings: Record<string, any>) =>
    request<null>('/settings/general', {
      method: 'PUT',
      body: JSON.stringify(settings),
    }),

  getAuditTrail: (filters: { module?: string; user_email?: string; action?: string } = {}) => {
    const params = new URLSearchParams();
    if (filters.module) params.set('module', filters.module);
    if (filters.user_email) params.set('user_email', filters.user_email);
    if (filters.action) params.set('action', filters.action);
    return request<AuditLogItem[]>(`/settings/audit-trail?${params.toString()}`, {
      method: 'GET',
    });
  },

  getActiveSessions: () =>
    request<UserSessionItem[]>('/settings/sessions', {
      method: 'GET',
    }),

  revokeSession: (id: number) =>
    request<null>(`/settings/sessions/${id}`, {
      method: 'DELETE',
    }),

  getBackups: () =>
    request<DatabaseBackupItem[]>('/settings/backups', {
      method: 'GET',
    }),

  createBackup: () =>
    request<DatabaseBackupItem>('/settings/backups', {
      method: 'POST',
    }),

  // Health & Operational Readiness
  getLiveness: () =>
    request<{ status: string; app: string }>('/health/liveness', {
      method: 'GET',
    }),

  getReadiness: () =>
    request<SystemHealthData>('/health/readiness', {
      method: 'GET',
    }),

  getOperationalStatus: () =>
    request<OperationalStatus>('/health/status', {
      method: 'GET',
    }),

  // Supplier Management Module
  getSuppliers: (params?: {
    search?: string;
    category?: string;
    status?: string;
    page?: number;
    page_size?: number;
    sort_by?: string;
    sort_order?: 'asc' | 'desc';
  }) => {
    const qs = new URLSearchParams();
    if (params?.search) qs.set('search', params.search);
    if (params?.category) qs.set('category', params.category);
    if (params?.status && params.status !== 'all') qs.set('status', params.status);
    if (params?.page) qs.set('page', params.page.toString());
    if (params?.page_size) qs.set('page_size', params.page_size.toString());
    if (params?.sort_by) qs.set('sort_by', params.sort_by);
    if (params?.sort_order) qs.set('sort_order', params.sort_order);
    return request<SupplierListResult>(`/suppliers?${qs.toString()}`, { method: 'GET' });
  },

  getSupplier: (id: number) =>
    request<Supplier>(`/suppliers/${id}`, { method: 'GET' }),

  getNextSupplierCode: () =>
    request<{ next_code: string }>('/suppliers/next-code', { method: 'GET' }),

  createSupplier: (data: Partial<Supplier>) =>
    request<Supplier>('/suppliers', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateSupplier: (id: number, data: Partial<Supplier>) =>
    request<Supplier>(`/suppliers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteSupplier: (id: number, forceDisable = false) =>
    request<{ action: 'deleted' | 'disabled' }>(`/suppliers/${id}${forceDisable ? '?force_disable=true' : ''}`, {
      method: 'DELETE',
    }),

  downloadSuppliersExcel: async (params?: { search?: string; category?: string; status?: string; sort_by?: string; sort_order?: string }) => {
    const qs = new URLSearchParams();
    if (params?.search) qs.set('search', params.search);
    if (params?.category) qs.set('category', params.category);
    if (params?.status && params.status !== 'all') qs.set('status', params.status);
    if (params?.sort_by) qs.set('sort_by', params.sort_by);
    if (params?.sort_order) qs.set('sort_order', params.sort_order);
    const token = getAuthToken();
    const res = await fetch(`/api/suppliers/export/excel?${qs.toString()}`, {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      credentials: 'include',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'Export failed' }));
      throw new Error(err.message || 'Export failed');
    }
    const blob = await res.blob();
    const dateStr = new Date().toISOString().split('T')[0];
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Nexora_Suppliers_${dateStr}.xlsx`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  },

  downloadSupplierTemplate: async () => {
    const token = getAuthToken();
    const res = await fetch('/api/suppliers/import/template', {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      credentials: 'include',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'Download failed' }));
      throw new Error(err.message || 'Download failed');
    }
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Nexora_Supplier_Import_Template.xlsx';
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  },

  previewSupplierImport: (data: { file_data?: string; rows?: any[] }) =>
    request<ImportPreviewData>('/suppliers/import/preview', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  commitSupplierImport: (data: { duplicate_policy: 'skip' | 'update'; rows: any[] }) =>
    request<ImportCommitResult>('/suppliers/import/commit', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Inventory Management Module
  getInventoryDashboard: () =>
    request<InventoryDashboardData>('/inventory/dashboard', { method: 'GET' }),

  getLowStockAlerts: () =>
    request<LowStockAlertItem[]>('/inventory/alerts/low-stock', { method: 'GET' }),

  getCategories: (params?: { search?: string; status?: string }) => {
    const qs = new URLSearchParams();
    if (params?.search) qs.set('search', params.search);
    if (params?.status && params.status !== 'all') qs.set('status', params.status);
    const query = qs.toString();
    return request<InventoryCategory[]>(`/inventory/categories${query ? `?${query}` : ''}`, { method: 'GET' });
  },

  createCategory: (data: { code: string; name: string; description?: string }) =>
    request<InventoryCategory>('/inventory/categories', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateCategory: (id: number, data: { code?: string; name?: string; description?: string; is_active?: boolean }) =>
    request<InventoryCategory>(`/inventory/categories/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteCategory: (id: number) =>
    request<null>(`/inventory/categories/${id}`, { method: 'DELETE' }),

  getUOMs: () =>
    request<UnitOfMeasure[]>('/inventory/uom', { method: 'GET' }),

  createUOM: (data: { code: string; name: string; symbol: string }) =>
    request<UnitOfMeasure>('/inventory/uom', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getWarehouses: () =>
    request<Warehouse[]>('/inventory/warehouses', { method: 'GET' }),

  createWarehouse: (data: { code: string; name: string; address?: string }) =>
    request<Warehouse>('/inventory/warehouses', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateWarehouse: (id: number, data: { name?: string; address?: string; is_active?: boolean }) =>
    request<Warehouse>(`/inventory/warehouses/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  getNextItemCode: () =>
    request<{ next_code: string }>('/inventory/items/next-code', { method: 'GET' }),

  getItems: (params?: {
    search?: string;
    category_id?: number;
    status?: string;
    page?: number;
    page_size?: number;
    sort_by?: string;
    sort_order?: 'asc' | 'desc';
  }) => {
    const qs = new URLSearchParams();
    if (params?.search) qs.set('search', params.search);
    if (params?.category_id) qs.set('category_id', params.category_id.toString());
    if (params?.status && params.status !== 'all') qs.set('status', params.status);
    if (params?.page) qs.set('page', params.page.toString());
    if (params?.page_size) qs.set('page_size', params.page_size.toString());
    if (params?.sort_by) qs.set('sort_by', params.sort_by);
    if (params?.sort_order) qs.set('sort_order', params.sort_order);
    return request<{ items: InventoryItem[]; total: number; page: number; pageSize: number; totalPages: number }>(`/inventory/items?${qs.toString()}`, { method: 'GET' });
  },

  getItem: (id: number) =>
    request<InventoryItem>(`/inventory/items/${id}`, { method: 'GET' }),

  createItem: (data: Partial<InventoryItem> & { initial_warehouse_id?: number; initial_quantity?: number }) =>
    request<InventoryItem>('/inventory/items', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateItem: (id: number, data: Partial<InventoryItem>) =>
    request<InventoryItem>(`/inventory/items/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteItem: (id: number, forceDisable = false) =>
    request<{ id: number; status: 'deleted' | 'disabled' }>(`/inventory/items/${id}${forceDisable ? '?force_disable=true' : ''}`, {
      method: 'DELETE',
    }),

  // Stock Operations
  receiveStock: (data: {
    reference_no: string;
    item_id: number;
    warehouse_id: number;
    quantity: number;
    supplier_id?: number;
    unit_cost?: number;
    notes?: string;
    transaction_date?: string;
  }) =>
    request<{ transaction: StockTransaction; new_balance: number }>('/inventory/operations/receive', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  issueStock: (data: {
    reference_no: string;
    item_id: number;
    warehouse_id: number;
    quantity: number;
    reason: string;
    notes?: string;
    transaction_date?: string;
  }) =>
    request<{ transaction: StockTransaction; remaining_balance: number }>('/inventory/operations/issue', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  adjustStock: (data: {
    reference_no: string;
    item_id: number;
    warehouse_id: number;
    actual_quantity: number;
    reason: string;
    notes?: string;
  }) =>
    request<{ transaction: StockTransaction; difference: number; new_balance: number }>('/inventory/operations/adjust', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  transferStock: (data: {
    reference_no: string;
    item_id: number;
    source_warehouse_id: number;
    destination_warehouse_id: number;
    quantity: number;
    notes?: string;
  }) =>
    request<{ transaction: StockTransaction }>('/inventory/operations/transfer', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getStockMovements: (params?: {
    item_id?: number;
    transaction_type?: string;
    warehouse_id?: number;
    page?: number;
    page_size?: number;
  }) => {
    const qs = new URLSearchParams();
    if (params?.item_id) qs.set('item_id', params.item_id.toString());
    if (params?.transaction_type && params.transaction_type !== 'all') qs.set('transaction_type', params.transaction_type);
    if (params?.warehouse_id) qs.set('warehouse_id', params.warehouse_id.toString());
    if (params?.page) qs.set('page', params.page.toString());
    if (params?.page_size) qs.set('page_size', params.page_size.toString());
    return request<{ transactions: StockTransaction[]; total: number; page: number; pageSize: number; totalPages: number }>(`/inventory/movements?${qs.toString()}`, { method: 'GET' });
  },

  downloadInventoryExcel: async (params?: { search?: string; category_id?: number; status?: string }) => {
    const qs = new URLSearchParams();
    if (params?.search) qs.set('search', params.search);
    if (params?.category_id) qs.set('category_id', params.category_id.toString());
    if (params?.status && params.status !== 'all') qs.set('status', params.status);
    const token = getAuthToken();
    const res = await fetch(`/api/inventory/export/excel?${qs.toString()}`, {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      credentials: 'include',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'Export failed' }));
      throw new Error(err.message || 'Export failed');
    }
    const blob = await res.blob();
    const dateStr = new Date().toISOString().split('T')[0];
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Nexora_Inventory_${dateStr}.xlsx`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  },

  downloadInventoryTemplate: async () => {
    const token = getAuthToken();
    const res = await fetch('/api/inventory/import/template', {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      credentials: 'include',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'Download failed' }));
      throw new Error(err.message || 'Download failed');
    }
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Nexora_Inventory_Import_Template.xlsx';
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  },

  previewInventoryImport: (data: { file_data?: string; rows?: any[] }) =>
    request<ImportPreviewData>('/inventory/import/preview', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  commitInventoryImport: (data: { duplicate_policy: 'skip' | 'update'; rows: any[] }) =>
    request<ImportCommitResult>('/inventory/import/commit', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  downloadCategoryExcel: async (params?: { search?: string; status?: string }) => {
    const qs = new URLSearchParams();
    if (params?.search) qs.set('search', params.search);
    if (params?.status && params.status !== 'all') qs.set('status', params.status);
    const token = getAuthToken();
    const res = await fetch(`/api/inventory/categories/export/excel?${qs.toString()}`, {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      credentials: 'include',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'Export failed' }));
      throw new Error(err.message || 'Export failed');
    }
    const blob = await res.blob();
    const dateStr = new Date().toISOString().split('T')[0];
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Nexora_Categories_${dateStr}.xlsx`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  },

  downloadCategoryTemplate: async () => {
    const token = getAuthToken();
    const res = await fetch('/api/inventory/categories/import/template', {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      credentials: 'include',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'Download failed' }));
      throw new Error(err.message || 'Download failed');
    }
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Nexora_Category_Import_Template.xlsx';
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  },

  previewCategoryImport: (data: { file_data?: string; rows?: any[] }) =>
    request<CategoryImportPreviewData>('/inventory/categories/import/preview', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  commitCategoryImport: (data: { duplicate_policy: 'skip' | 'update'; rows: any[] }) =>
    request<ImportCommitResult>('/inventory/categories/import/commit', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Online Supplier Reordering & Negotiations
  getReorders: (params?: {
    status?: string;
    item_id?: number;
    supplier_id?: number;
    search?: string;
    page?: number;
    page_size?: number;
  }) => {
    const qs = new URLSearchParams();
    if (params?.status && params.status !== 'all') qs.set('status', params.status);
    if (params?.item_id) qs.set('item_id', params.item_id.toString());
    if (params?.supplier_id) qs.set('supplier_id', params.supplier_id.toString());
    if (params?.search) qs.set('search', params.search);
    if (params?.page) qs.set('page', params.page.toString());
    if (params?.page_size) qs.set('page_size', params.page_size.toString());
    return request<{ reorders: ReorderRequest[]; total: number; page: number; pageSize: number; totalPages: number }>(`/inventory/reorders?${qs.toString()}`, { method: 'GET' });
  },

  getReorder: (id: number) =>
    request<ReorderRequest>(`/inventory/reorders/${id}`, { method: 'GET' }),

  createReorder: (data: {
    item_id: number;
    supplier_id: number;
    quantity: number;
    unit_price: number;
    expected_delivery_date?: string;
    notes?: string;
  }) =>
    request<ReorderRequest>('/inventory/reorders', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  acceptCounteroffer: (id: number, notes?: string) =>
    request<ReorderRequest>(`/inventory/reorders/${id}/accept-counteroffer`, {
      method: 'POST',
      body: JSON.stringify({ notes }),
    }),

  reviseProposal: (id: number, data: {
    unit_price: number;
    quantity: number;
    expected_delivery_date?: string;
    notes?: string;
  }) =>
    request<ReorderRequest>(`/inventory/reorders/${id}/revise`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  cancelReorder: (id: number, reason?: string) =>
    request<ReorderRequest>(`/inventory/reorders/${id}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),

  resendReorderEmail: (id: number) =>
    request<ReorderRequest>(`/inventory/reorders/${id}/resend-email`, {
      method: 'POST',
    }),

  getNegotiationHistory: (id: number) =>
    request<ReorderNegotiation[]>(`/inventory/reorders/${id}/negotiations`, { method: 'GET' }),

  // Public Supplier Portal APIs (No login required)
  getPublicSupplierReorder: (token: string) =>
    request<ReorderRequest & { is_expired?: boolean }>(`/public/supplier-reorders/${token}`, { method: 'GET' }),

  supplierAcceptReorder: (token: string, notes?: string) =>
    request<ReorderRequest>(`/public/supplier-reorders/${token}/accept`, {
      method: 'POST',
      body: JSON.stringify({ notes }),
    }),

  supplierNegotiateReorder: (token: string, data: {
    unit_price: number;
    quantity: number;
    delivery_date?: string;
    notes: string;
  }) =>
    request<ReorderRequest>(`/public/supplier-reorders/${token}/negotiate`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  supplierRejectReorder: (token: string, reason: string) =>
    request<ReorderRequest>(`/public/supplier-reorders/${token}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),

  // Performance Management APIs (Workforce Module)
  getPerformanceRoster: (params?: { search?: string; status?: string; department?: string }) => {
    const q = new URLSearchParams();
    if (params?.search) q.set('search', params.search);
    if (params?.status) q.set('status', params.status);
    if (params?.department) q.set('department', params.department);
    const qs = q.toString();
    return request<PerformanceRosterEmployee[]>(`/performance/roster${qs ? `?${qs}` : ''}`, { method: 'GET' });
  },

  registerPerformanceEmployee: (data: {
    emp_id: string;
    first_name: string;
    last_name: string;
    department?: string;
    designation?: string;
  }) =>
    request<PerformanceRosterEmployee>('/performance/roster', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updatePerformanceEmployee: (
    id: number | string,
    data: { department?: string; designation?: string; is_active?: boolean }
  ) =>
    request<PerformanceRosterEmployee>(`/performance/roster/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  getPerformanceEmployees: (period: string = 'today') =>
    request<PerformanceEmployee[]>(`/performance/employees?period=${encodeURIComponent(period)}`, { method: 'GET' }),

  getPerformanceSummary: () =>
    request<PerformanceSummary>('/performance/summary', { method: 'GET' }),

  simulatePerformanceEvent: (data: { employee_id?: number | string; emp_id?: string; idempotency_key?: string; notes?: string }) =>
    request<WorkCompletionEvent>('/performance/events/simulate', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getPerformanceReports: (params: {
    period?: string;
    start_date?: string;
    end_date?: string;
    employee_id?: string;
    department?: string;
    include_simulated?: boolean;
  }) => {
    const q = new URLSearchParams();
    if (params.period) q.set('period', params.period);
    if (params.start_date) q.set('start_date', params.start_date);
    if (params.end_date) q.set('end_date', params.end_date);
    if (params.employee_id) q.set('employee_id', params.employee_id);
    if (params.department) q.set('department', params.department);
    if (params.include_simulated !== undefined) q.set('include_simulated', String(params.include_simulated));
    return request<PerformanceReportData>(`/performance/reports?${q.toString()}`, { method: 'GET' });
  },

  getPerformanceExportUrl: (params: {
    period?: string;
    start_date?: string;
    end_date?: string;
    include_simulated?: boolean;
  }) => {
    const q = new URLSearchParams();
    if (params.period) q.set('period', params.period);
    if (params.start_date) q.set('start_date', params.start_date);
    if (params.end_date) q.set('end_date', params.end_date);
    if (params.include_simulated !== undefined) q.set('include_simulated', String(params.include_simulated));
    return `/api/performance/reports/export?${q.toString()}`;
  },
};
