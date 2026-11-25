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
  StockTransfer,
  StockVerification,
  WarehouseStockItem,
  WarehouseDashboardStats,
  SupplierConversation,
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
  EffectiveSettingItem,
  CategorySummary,
  EffectiveSettingsResponse,
  Department,
  DepartmentCreateDTO,
  DepartmentUpdateDTO,
} from '../types';

import { getClientDeviceId } from '../utils/deviceId';
import { buildApiUrl } from '../config/apiConfig';

let inMemoryToken: string | null = null;
let refreshInFlight: Promise<string | null> | null = null;

export const setAuthToken = (token: string | null) => {
  inMemoryToken = token;
  if (token) {
    try {
      localStorage.setItem('nexora_token', token);
    } catch {}
    try {
      sessionStorage.setItem('nexora_token', token);
    } catch {}
  } else {
    try {
      localStorage.removeItem('nexora_token');
    } catch {}
    try {
      sessionStorage.removeItem('nexora_token');
    } catch {}
  }
};

export const getAuthToken = (): string | null => {
  if (!inMemoryToken) {
    try {
      inMemoryToken = localStorage.getItem('nexora_token');
    } catch {}
  }
  if (!inMemoryToken) {
    try {
      inMemoryToken = sessionStorage.getItem('nexora_token');
    } catch {}
  }
  return inMemoryToken;
};

async function attemptTokenRefresh(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      const res = await fetch(buildApiUrl('/auth/refresh'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Nexora-Device-Id': getClientDeviceId(),
        },
        credentials: 'include',
        body: JSON.stringify({}),
      });
      if (!res.ok) return null;
      const data = await res.json();
      const newToken = data?.data?.access_token;
      if (data?.success && typeof newToken === 'string' && newToken.length > 0) {
        setAuthToken(newToken);
        return newToken;
      }
      return null;
    } catch {
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

interface RequestMeta {
  skipAuthExpiredEvent?: boolean;
  _retriedAfterRefresh?: boolean;
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
  meta: RequestMeta = {}
): Promise<APIResponse<T>> {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  headers.set('X-Nexora-Device-Id', getClientDeviceId());

  const token = getAuthToken();
  const hadToken = Boolean(token);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const config: RequestInit = {
    ...options,
    headers,
    credentials: 'include',
  };

  try {
    const res = await fetch(buildApiUrl(endpoint), config);
    const data = await res.json();

    if (!res.ok) {
      const isPublicAuthRoute =
        endpoint.includes('/auth/login') ||
        endpoint.includes('/auth/refresh') ||
        endpoint.includes('/auth/forgot-password') ||
        endpoint.includes('/auth/reset-password') ||
        endpoint.includes('/auth/verify-reset-token');

      // On 401 for an authenticated request, try one silent refresh token rotation before logging out
      if (res.status === 401 && hadToken && !isPublicAuthRoute && !meta._retriedAfterRefresh) {
        const refreshedToken = await attemptTokenRefresh();
        if (refreshedToken) {
          return request<T>(endpoint, options, { ...meta, _retriedAfterRefresh: true });
        }
      }

      // Auto-Logout and Notification ONLY when an actually authenticated session expires
      if (
        res.status === 401 &&
        hadToken &&
        !isPublicAuthRoute &&
        !meta.skipAuthExpiredEvent
      ) {
        setAuthToken(null);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('auth:expired', {
              detail: { message: data.message || 'Your session has expired. Please log in again.' },
            })
          );
        }
      }

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
  // Public Branding (Database-driven)
  getBranding: () =>
    request<{ app_name: string; company_name: string; brand_tagline: string }>(
      '/branding',
      { method: 'GET' },
      { skipAuthExpiredEvent: true }
    ),

  // Authentication
  login: (identifier: string, password: string, mfaCode?: string) =>
    request<LoginResponseData>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: identifier,
        username: identifier,
        email_or_username: identifier,
        password,
        device_id: getClientDeviceId(),
        ...(mfaCode ? { mfa_code: mfaCode } : {}),
      }),
    }),

  refreshAccessToken: () => attemptTokenRefresh(),

  logout: () =>
    request<null>(
      '/auth/logout',
      {
        method: 'POST',
      },
      { skipAuthExpiredEvent: true }
    ),

  getCurrentSession: (opts?: { skipAuthExpiredEvent?: boolean }) =>
    request<AuthStatusData>(
      '/auth/me',
      {
        method: 'GET',
      },
      { skipAuthExpiredEvent: opts?.skipAuthExpiredEvent ?? false }
    ),

  forgotPassword: (email: string) =>
    request<null>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  verifyResetToken: (token: string) =>
    request<{ email?: string; expires_at?: string }>(`/auth/verify-reset-token?token=${encodeURIComponent(token)}`, {
      method: 'GET',
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
    first_name?: string;
    last_name?: string;
    phone?: string;
    department?: string;
    profile_picture?: string;
    theme_preference?: string;
  }) =>
    request<User>('/users/profile', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  uploadProfilePicture: (data: {
    image_data?: string;
    image_url?: string;
    file_name?: string;
  }) =>
    request<{ profile_picture: string; user: User }>('/users/profile/picture', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  requestEmailChange: (new_email: string) =>
    request<{ pending_email: string; expires_at: string }>('/profile/email/request-change', {
      method: 'POST',
      body: JSON.stringify({ new_email }),
    }),

  verifyEmailChange: (code: string) =>
    request<{ new_email: string }>('/profile/email/verify', {
      method: 'POST',
      body: JSON.stringify({ code }),
    }),

  getMySessions: () =>
    request<UserSessionItem[]>('/profile/sessions', {
      method: 'GET',
    }),

  revokeOtherSessions: () =>
    request<{ revoked_count: number }>('/profile/sessions/other', {
      method: 'DELETE',
    }),

  revokeMySession: (id: number) =>
    request<null>(`/profile/sessions/${id}`, {
      method: 'DELETE',
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

  adminResetUserPassword: (id: number) =>
    request<null>(`/users/${id}/reset-password`, {
      method: 'POST',
    }),

  resendUserActivation: (id: number) =>
    request<null>(`/users/${id}/resend-activation`, {
      method: 'POST',
    }),

  // Department Management
  listDepartments: (params?: { search?: string; status?: string }) => {
    const qs = new URLSearchParams();
    if (params?.search) qs.set('search', params.search);
    if (params?.status && params.status !== 'all') qs.set('status', params.status);
    const q = qs.toString();
    return request<Department[]>(`/departments${q ? `?${q}` : ''}`, {
      method: 'GET',
    });
  },

  getDepartment: (id: number) =>
    request<Department>(`/departments/${id}`, {
      method: 'GET',
    }),

  createDepartment: (data: DepartmentCreateDTO) =>
    request<Department>('/departments', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateDepartment: (id: number, data: DepartmentUpdateDTO) =>
    request<Department>(`/departments/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  toggleDepartmentStatus: (id: number, status: 'active' | 'disabled' | boolean) =>
    request<Department>(`/departments/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status: typeof status === 'boolean' ? (status ? 'active' : 'disabled') : status }),
    }),

  deleteDepartment: (id: number) =>
    request<null>(`/departments/${id}`, {
      method: 'DELETE',
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

  getSecuritySettings: () =>
    request<Record<string, any>>('/settings/security', {
      method: 'GET',
    }),

  updateSecuritySettings: (settings: Record<string, any>) =>
    request<null>('/settings/security', {
      method: 'PUT',
      body: JSON.stringify(settings),
    }),

  // Unified Configuration Governance APIs
  getEffectiveSettings: (category?: string) =>
    request<EffectiveSettingsResponse>(`/settings/effective${category ? `?category=${encodeURIComponent(category)}` : ''}`, {
      method: 'GET',
    }),

  getCategorySettings: (category: string) =>
    request<EffectiveSettingsResponse>(`/settings/category/${encodeURIComponent(category)}`, {
      method: 'GET',
    }),

  updateCategorySettings: (category: string, updates: Record<string, any>) =>
    request<EffectiveSettingsResponse>(`/settings/category/${encodeURIComponent(category)}`, {
      method: 'POST',
      body: JSON.stringify(updates),
    }),

  resetCategorySettings: (category: string) =>
    request<EffectiveSettingsResponse>(`/settings/category/${encodeURIComponent(category)}/reset`, {
      method: 'POST',
    }),

  resetSettingKey: (key: string) =>
    request<{ removed: boolean }>(`/settings/key/${encodeURIComponent(key)}/reset`, {
      method: 'POST',
    }),

  resetAllSettings: () =>
    request<EffectiveSettingsResponse>('/settings/reset-all', {
      method: 'POST',
    }),

  sendTestEmail: (recipientEmail: string) =>
    request<{ messageId?: string }>('/settings/email-smtp/test', {
      method: 'POST',
      body: JSON.stringify({ recipient_email: recipientEmail }),
    }),

  testSmtpConnection: () =>
    request<null>('/settings/email-smtp/verify-connection', {
      method: 'POST',
    }),

  getAuditTrail: (filters: { module?: string; user_email?: string; action?: string; search?: string } = {}) => {
    const params = new URLSearchParams();
    if (filters.module) params.set('module', filters.module);
    if (filters.user_email) params.set('user_email', filters.user_email);
    if (filters.action) params.set('action', filters.action);
    if (filters.search) params.set('search', filters.search);
    return request<AuditLogItem[]>(`/settings/audit-trail?${params.toString()}`, {
      method: 'GET',
    });
  },

  getActiveSessions: (params?: { search?: string; status?: string; user_id?: number }) => {
    const qs = new URLSearchParams();
    if (params?.search) qs.set('search', params.search);
    if (params?.status && params.status !== 'all') qs.set('status', params.status);
    if (params?.user_id) qs.set('user_id', String(params.user_id));
    const query = qs.toString();
    return request<UserSessionItem[]>(`/settings/sessions${query ? `?${query}` : ''}`, {
      method: 'GET',
    });
  },

  revokeSession: (id: number) =>
    request<null>(`/settings/sessions/${id}`, {
      method: 'DELETE',
    }),

  terminateBatchSessions: (data: { session_ids?: number[]; user_id?: number; all?: boolean }) =>
    request<{ terminated_count: number }>('/settings/sessions/terminate-batch', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getBackups: () =>
    request<DatabaseBackupItem[]>('/settings/backups', {
      method: 'GET',
    }),

  createBackup: (notes?: string) =>
    request<DatabaseBackupItem>('/settings/backups', {
      method: 'POST',
      body: JSON.stringify({ notes }),
    }),

  restoreBackup: (backup_id: string, admin_password: string) =>
    request<{ backup_id: string; restored_at: string; table_count?: number }>('/settings/backups/restore', {
      method: 'POST',
      body: JSON.stringify({ backup_id, admin_password }),
    }),

  deleteBackup: (id: string) =>
    request<null>(`/settings/backups/${id}`, {
      method: 'DELETE',
    }),

  downloadBackupUrl: (id: string) => `/api/settings/backups/${id}/download`,

  exportAuditTrailUrl: (format: 'csv' | 'json' = 'csv') => `/api/settings/audit-trail/export?format=${format}`,

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
    const res = await fetch(buildApiUrl(`/suppliers/export/excel?${qs.toString()}`), {
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
    const res = await fetch(buildApiUrl('/suppliers/import/template'), {
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
    request<Warehouse[]>('/warehouses', { method: 'GET' }),

  getWarehouse: (id: number) =>
    request<Warehouse & { stock_items: WarehouseStockItem[] }>(`/warehouses/${id}`, { method: 'GET' }),

  createWarehouse: (data: {
    code: string;
    name: string;
    address?: string;
    contact_details?: string;
    manager_name?: string;
    manager_email?: string;
    manager_phone?: string;
    warehouse_type?: 'Distribution Center' | 'Regional Hub' | 'Transit Depot' | 'Quarantine';
    capacity?: number;
    is_active?: boolean;
  }) =>
    request<Warehouse>('/warehouses', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateWarehouse: (id: number, data: Partial<Warehouse>) =>
    request<Warehouse>(`/warehouses/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteWarehouse: (id: number, forceDisable = false) =>
    request<{ success: boolean; message: string }>(`/warehouses/${id}${forceDisable ? '?force_disable=true' : ''}`, {
      method: 'DELETE',
    }),

  getWarehouseDashboardStats: () =>
    request<WarehouseDashboardStats>('/warehouses/dashboard-stats', { method: 'GET' }),

  getWarehouseStock: (warehouseId?: number) =>
    request<WarehouseStockItem[]>(`/warehouses/stock${warehouseId ? `?warehouse_id=${warehouseId}` : ''}`, {
      method: 'GET',
    }),

  // Stock Transfers
  getStockTransfers: (params?: {
    status?: string;
    source_warehouse_id?: number;
    destination_warehouse_id?: number;
    search?: string;
  }) => {
    const qs = new URLSearchParams();
    if (params?.status && params.status !== 'all') qs.set('status', params.status);
    if (params?.source_warehouse_id) qs.set('source_warehouse_id', params.source_warehouse_id.toString());
    if (params?.destination_warehouse_id) qs.set('destination_warehouse_id', params.destination_warehouse_id.toString());
    if (params?.search) qs.set('search', params.search);
    return request<StockTransfer[]>(`/warehouses/transfers?${qs.toString()}`, { method: 'GET' });
  },

  getStockTransfer: (id: number) =>
    request<StockTransfer>(`/warehouses/transfers/${id}`, { method: 'GET' }),

  createStockTransfer: (data: {
    source_warehouse_id: number;
    destination_warehouse_id: number;
    item_id: number;
    requested_quantity: number;
    remarks?: string;
  }) =>
    request<StockTransfer>('/warehouses/transfers', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  approveStockTransfer: (id: number, remarks?: string) =>
    request<StockTransfer>(`/warehouses/transfers/${id}/approve`, {
      method: 'PUT',
      body: JSON.stringify({ remarks }),
    }),

  dispatchStockTransfer: (id: number, remarks?: string) =>
    request<StockTransfer>(`/warehouses/transfers/${id}/dispatch`, {
      method: 'PUT',
      body: JSON.stringify({ remarks }),
    }),

  receiveStockTransfer: (id: number, data: { received_quantity: number; remarks?: string; discrepancy_reason?: string }) =>
    request<StockTransfer>(`/warehouses/transfers/${id}/receive`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  cancelStockTransfer: (id: number, remarks?: string) =>
    request<StockTransfer>(`/warehouses/transfers/${id}/cancel`, {
      method: 'PUT',
      body: JSON.stringify({ remarks }),
    }),

  // Physical Stock Verifications
  getStockVerifications: (params?: { warehouse_id?: number; status?: string }) => {
    const qs = new URLSearchParams();
    if (params?.warehouse_id) qs.set('warehouse_id', params.warehouse_id.toString());
    if (params?.status && params.status !== 'all') qs.set('status', params.status);
    return request<StockVerification[]>(`/warehouses/verifications?${qs.toString()}`, { method: 'GET' });
  },

  getStockVerification: (id: number) =>
    request<StockVerification>(`/warehouses/verifications/${id}`, { method: 'GET' }),

  createStockVerification: (data: {
    warehouse_id: number;
    items: Array<{ item_id: number; physical_quantity: number; discrepancy_reason?: string }>;
    remarks?: string;
  }) =>
    request<StockVerification>('/warehouses/verifications', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  approveStockVerification: (id: number, remarks?: string) =>
    request<StockVerification>(`/warehouses/verifications/${id}/approve`, {
      method: 'PUT',
      body: JSON.stringify({ remarks }),
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
    const res = await fetch(buildApiUrl(`/inventory/export/excel?${qs.toString()}`), {
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
    const res = await fetch(buildApiUrl('/inventory/import/template'), {
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
    const res = await fetch(buildApiUrl(`/inventory/categories/export/excel?${qs.toString()}`), {
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
    const res = await fetch(buildApiUrl('/inventory/categories/import/template'), {
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

  receiveGoodsForReorder: (id: number, data: {
    warehouse_id: number;
    received_quantity: number;
    challan_no?: string;
    notes?: string;
  }) =>
    request<{ reorder: ReorderRequest; transaction: StockTransaction }>(`/inventory/reorders/${id}/goods-receipt`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getSupplierConversations: (params?: { reorder_id?: number; supplier_id?: number }) => {
    const qs = new URLSearchParams();
    if (params?.reorder_id) qs.set('reorder_id', params.reorder_id.toString());
    if (params?.supplier_id) qs.set('supplier_id', params.supplier_id.toString());
    return request<SupplierConversation[]>(`/suppliers/conversations?${qs.toString()}`, { method: 'GET' });
  },

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
  getPerformanceRegistrationOptions: () =>
    request<{
      departments: Array<{ id: number; code: string; name: string }>;
      roles: Array<{ id: number; code: string; name: string }>;
      employee_types: Array<{ value: 'full_time' | 'training' | 'third_party'; label: string }>;
    }>('/performance/options', { method: 'GET' }),

  getNextPerformanceEmployeeId: () =>
    request<{
      company_name: string;
      prefix: string;
      sequence: number;
      next_emp_id: string;
    }>('/performance/roster/next-id', { method: 'GET' }),

  getPerformanceRoster: (params?: {
    search?: string;
    status?: string;
    department?: string;
    department_id?: number;
    role_id?: number;
    employee_type?: string;
  }) => {
    const q = new URLSearchParams();
    if (params?.search) q.set('search', params.search);
    if (params?.status) q.set('status', params.status);
    if (params?.department) q.set('department', params.department);
    if (params?.department_id) q.set('department_id', String(params.department_id));
    if (params?.role_id) q.set('role_id', String(params.role_id));
    if (params?.employee_type) q.set('employee_type', params.employee_type);
    const qs = q.toString();
    return request<any[]>(`/performance/roster${qs ? `?${qs}` : ''}`, { method: 'GET' });
  },

  registerPerformanceEmployee: (data: {
    first_name: string;
    last_name: string;
    hardware_id: string;
    employee_type: 'full_time' | 'training' | 'third_party';
    department_id: number;
    role_id: number;
  }) =>
    request<any>('/performance/roster', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updatePerformanceEmployee: (
    id: number | string,
    data: {
      first_name?: string;
      last_name?: string;
      hardware_id?: string;
      employee_type?: 'full_time' | 'training' | 'third_party';
      department_id?: number;
      role_id?: number;
      is_active?: boolean;
    }
  ) =>
    request<any>(`/performance/roster/${id}`, {
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

  // ==========================================
  // ENTERPRISE SECURITY CENTER & BACKUP MANAGER
  // ==========================================
  security: {
    getOverview: () => request<any>('/security/overview', { method: 'GET' }),

    getLogins: (params: Record<string, string | number | undefined> = {}) => {
      const q = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== '') q.set(k, String(v)); });
      return request<any>(`/security/logins?${q.toString()}`, { method: 'GET' });
    },

    getDevices: (params: Record<string, string | number | undefined> = {}) => {
      const q = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== '') q.set(k, String(v)); });
      return request<any>(`/security/devices?${q.toString()}`, { method: 'GET' });
    },

    setDeviceStatus: (deviceId: number, status: 'trusted' | 'blocked' | 'revoked', reason?: string) =>
      request<any>(`/security/devices/${deviceId}/status`, {
        method: 'POST',
        body: JSON.stringify({ status, reason }),
      }),

    getSessions: (params: Record<string, string | number | undefined> = {}) => {
      const q = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== '') q.set(k, String(v)); });
      return request<any>(`/security/sessions?${q.toString()}`, { method: 'GET' });
    },

    revokeSession: (sessionId: string, reason?: string) =>
      request<any>(`/security/sessions/${encodeURIComponent(sessionId)}`, {
        method: 'DELETE',
        body: JSON.stringify({ reason }),
      }),

    revokeAllUserSessions: (userId: number, reason?: string) =>
      request<any>(`/security/sessions/revoke-user/${userId}`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }),

    getActivityLogs: (params: Record<string, string | number | undefined> = {}) => {
      const q = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== '') q.set(k, String(v)); });
      return request<any>(`/security/activity-logs?${q.toString()}`, { method: 'GET' });
    },

    verifyAuditChain: () =>
      request<any>('/security/activity-logs/verify', { method: 'GET' }),

    downloadAuditExport: async (params: Record<string, string | undefined> = {}) => {
      const q = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => { if (v) q.set(k, v); });
      const token = getAuthToken();
      const res = await fetch(buildApiUrl(`/security/activity-logs/export?${q.toString()}`), {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          'X-Nexora-Device-Id': getClientDeviceId(),
        },
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to export audit trail.');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `nexora_audit_logs_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    },

    getSecurityEvents: (params: Record<string, string | number | undefined> = {}) => {
      const q = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== '') q.set(k, String(v)); });
      return request<any>(`/security/events?${q.toString()}`, { method: 'GET' });
    },

    resolveSecurityEvent: (eventId: number, notes: string) =>
      request<any>(`/security/events/${eventId}/resolve`, {
        method: 'POST',
        body: JSON.stringify({ notes }),
      }),

    getBackups: (params: Record<string, string | number | undefined> = {}) => {
      const q = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== '') q.set(k, String(v)); });
      return request<any>(`/security/backups?${q.toString()}`, { method: 'GET' });
    },

    triggerBackup: (sync = false) =>
      request<any>('/security/backups/run', {
        method: 'POST',
        body: JSON.stringify({ sync }),
      }),

    getBackupJob: (jobId: string) =>
      request<any>(`/security/backups/jobs/${encodeURIComponent(jobId)}`, { method: 'GET' }),

    verifyBackup: (uid: string) =>
      request<any>(`/security/backups/${encodeURIComponent(uid)}/verify`, { method: 'POST' }),

    downloadBackup: async (uid: string, fileName: string) => {
      const token = getAuthToken();
      const res = await fetch(buildApiUrl(`/security/backups/${encodeURIComponent(uid)}/download`), {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          'X-Nexora-Device-Id': getClientDeviceId(),
        },
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Unauthorized or missing backup file.');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    },

    prepareRestore: (uid: string) =>
      request<any>(`/security/backups/${encodeURIComponent(uid)}/restore/prepare`, { method: 'POST' }),

    executeRestore: (uid: string, confirmToken: string, confirmPhrase: string) =>
      request<any>(`/security/backups/${encodeURIComponent(uid)}/restore/execute`, {
        method: 'POST',
        body: JSON.stringify({ confirm_token: confirmToken, confirm_phrase: confirmPhrase }),
      }),

    cleanupBackups: () =>
      request<any>('/security/backups/cleanup', { method: 'POST' }),

    getMfaStatus: () => request<any>('/security/mfa/status', { method: 'GET' }),
    setupMfa: () => request<any>('/security/mfa/setup', { method: 'POST' }),
    enableMfa: (code: string) =>
      request<any>('/security/mfa/enable', { method: 'POST', body: JSON.stringify({ code }) }),
    disableMfa: (code: string) =>
      request<any>('/security/mfa/disable', { method: 'POST', body: JSON.stringify({ code }) }),
  },

  // ==========================================================================
  // POSTGRESQL-ONLY ERP MODULES API
  // ==========================================================================
  erp: {
    // Supplier Contacts, Agreements & History
    getSupplierContacts: (supplierId: number) =>
      request<any[]>(`/suppliers/${supplierId}/contacts`, { method: 'GET' }),
    createSupplierContact: (supplierId: number, payload: any) =>
      request<any>(`/suppliers/${supplierId}/contacts`, { method: 'POST', body: JSON.stringify(payload) }),
    deleteSupplierContact: (supplierId: number, id: number) =>
      request<any>(`/suppliers/${supplierId}/contacts/${id}`, { method: 'DELETE' }),

    getSupplierAgreements: (supplierId: number) =>
      request<any[]>(`/suppliers/${supplierId}/agreements`, { method: 'GET' }),
    createSupplierAgreement: (supplierId: number, payload: any) =>
      request<any>(`/suppliers/${supplierId}/agreements`, { method: 'POST', body: JSON.stringify(payload) }),
    deleteSupplierAgreement: (supplierId: number, id: number) =>
      request<any>(`/suppliers/${supplierId}/agreements/${id}`, { method: 'DELETE' }),

    getSupplierHistory: (supplierId: number) =>
      request<any[]>(`/suppliers/${supplierId}/history`, { method: 'GET' }),
    addSupplierHistory: (supplierId: number, payload: any) =>
      request<any>(`/suppliers/${supplierId}/history`, { method: 'POST', body: JSON.stringify(payload) }),

    // Warehouse Locations
    getWarehouseLocations: (warehouseId?: number) =>
      request<any[]>(`/warehouse-locations${warehouseId ? `?warehouse_id=${warehouseId}` : ''}`, { method: 'GET' }),
    createWarehouseLocation: (warehouseId: number, payload: any) =>
      request<any>(`/warehouses/${warehouseId}/locations`, { method: 'POST', body: JSON.stringify(payload) }),
    deleteWarehouseLocation: (warehouseId: number, id: number) =>
      request<any>(`/warehouses/${warehouseId}/locations/${id}`, { method: 'DELETE' }),

    // Purchase Requests & Purchase Orders
    getPurchaseRequests: (status?: string) =>
      request<any[]>(`/erp/purchase-requests${status && status !== 'all' ? `?status=${encodeURIComponent(status)}` : ''}`, { method: 'GET' }),
    createPurchaseRequest: (payload: any) =>
      request<any>('/erp/purchase-requests', { method: 'POST', body: JSON.stringify(payload) }),
    updatePurchaseRequestStatus: (id: number, status: string, comments?: string) =>
      request<any>(`/erp/purchase-requests/${id}/status`, { method: 'PUT', body: JSON.stringify({ status, comments }) }),

    getPurchaseOrders: (status?: string) =>
      request<any[]>(`/purchase-orders${status && status !== 'all' ? `?status=${encodeURIComponent(status)}` : ''}`, { method: 'GET' }),
    createPurchaseOrder: (payload: any) =>
      request<any>('/purchase-orders', { method: 'POST', body: JSON.stringify(payload) }),
    updatePurchaseOrderStatus: (id: number, status: string) =>
      request<any>(`/purchase-orders/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) }),

    // Goods Receiving (GRN & Quality Checks)
    getGrns: () =>
      request<any[]>('/grn', { method: 'GET' }),
    createGrn: (payload: any) =>
      request<any>('/grn', { method: 'POST', body: JSON.stringify(payload) }),
    recordGrnQualityCheck: (grnId: number, payload: any) =>
      request<any>(`/grn/${grnId}/quality-checks`, { method: 'POST', body: JSON.stringify(payload) }),
    postGrnStock: (grnId: number) =>
      request<any>(`/grn/${grnId}/post-stock`, { method: 'POST' }),

    // Product Management (Products, Components & BOM)
    getProducts: (search?: string) =>
      request<any[]>(`/products${search ? `?search=${encodeURIComponent(search)}` : ''}`, { method: 'GET' }),
    getProductDetail: (id: number) =>
      request<any>(`/products/${id}`, { method: 'GET' }),
    createProduct: (payload: any) =>
      request<any>('/products', { method: 'POST', body: JSON.stringify(payload) }),
    updateProduct: (id: number, payload: any) =>
      request<any>(`/products/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
    deleteProduct: (id: number) =>
      request<any>(`/products/${id}`, { method: 'DELETE' }),
    addProductComponent: (productId: number, payload: any) =>
      request<any>(`/products/${productId}/components`, { method: 'POST', body: JSON.stringify(payload) }),
    deleteProductComponent: (productId: number, componentId: number) =>
      request<any>(`/products/${productId}/components/${componentId}`, { method: 'DELETE' }),
    createProductBom: (productId: number, payload: any) =>
      request<any>(`/products/${productId}/bom`, { method: 'POST', body: JSON.stringify(payload) }),
    deleteBom: (bomId: number) =>
      request<any>(`/bom/${bomId}`, { method: 'DELETE' }),

    // Production Management (Work Orders & Progress)
    getWorkOrders: (status?: string) =>
      request<any[]>(`/production/work-orders${status && status !== 'all' ? `?status=${encodeURIComponent(status)}` : ''}`, { method: 'GET' }),
    createWorkOrder: (payload: any) =>
      request<any>('/production/work-orders', { method: 'POST', body: JSON.stringify(payload) }),
    updateWorkOrderStatus: (id: number, status: string) =>
      request<any>(`/production/work-orders/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) }),
    logWorkOrderProgress: (id: number, payload: any) =>
      request<any>(`/production/work-orders/${id}/progress`, { method: 'POST', body: JSON.stringify(payload) }),

    // Product Readiness (Teams & Tracking)
    getProductionTeams: () =>
      request<any[]>('/production/teams', { method: 'GET' }),
    createProductionTeam: (payload: any) =>
      request<any>('/production/teams', { method: 'POST', body: JSON.stringify(payload) }),
    deleteProductionTeam: (id: number) =>
      request<any>(`/production/teams/${id}`, { method: 'DELETE' }),
    getProductReadiness: () =>
      request<any>('/production/readiness', { method: 'GET' }),
    createReadinessEntry: (payload: any) =>
      request<any>('/production/readiness', { method: 'POST', body: JSON.stringify(payload) }),
    updateReadinessEntry: (id: number, payload: any) =>
      request<any>(`/production/readiness/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
    deleteReadinessEntry: (id: number) =>
      request<any>(`/production/readiness/${id}`, { method: 'DELETE' }),

    // Reporting & Analytics (PostgreSQL Aggregations)
    getStockAnalytics: () => request<any>('/reports/analytics/stock', { method: 'GET' }),
    getPurchasingAnalytics: () => request<any>('/reports/analytics/purchasing', { method: 'GET' }),
    getProductionAnalytics: () => request<any>('/reports/analytics/production', { method: 'GET' }),
    getEmployeeAnalytics: () => request<any>('/reports/analytics/employees', { method: 'GET' }),
  },

  // ==========================================
  // BACK OFFICE POSTGRESQL BACKUP SCHEDULER & RESTORE MANAGEMENT
  // ==========================================
  backupAdmin: {
    getStats: () => request<any>('/security/backup-schedulers/stats', { method: 'GET' }),

    listSchedulers: (params?: {
      search?: string;
      frequency?: string;
      status?: string;
      last_status?: string;
    }) => {
      const q = new URLSearchParams();
      if (params?.search) q.set('search', params.search);
      if (params?.frequency && params.frequency !== 'all') q.set('frequency', params.frequency);
      if (params?.status && params.status !== 'all') q.set('status', params.status);
      if (params?.last_status && params.last_status !== 'all') q.set('last_status', params.last_status);
      const qs = q.toString();
      return request<any[]>(`/security/backup-schedulers${qs ? `?${qs}` : ''}`, { method: 'GET' });
    },

    createScheduler: (payload: any) =>
      request<any>('/security/backup-schedulers', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),

    updateScheduler: (id: number, payload: any) =>
      request<any>(`/security/backup-schedulers/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      }),

    toggleScheduler: (id: number, is_enabled: boolean) =>
      request<any>(`/security/backup-schedulers/${id}/toggle`, {
        method: 'PATCH',
        body: JSON.stringify({ is_enabled }),
      }),

    deleteScheduler: (id: number) =>
      request<any>(`/security/backup-schedulers/${id}`, {
        method: 'DELETE',
      }),

    runSchedulerNow: (id: number) =>
      request<any>(`/security/backup-schedulers/${id}/run-now`, {
        method: 'POST',
      }),

    runManualBackup: (notes?: string) =>
      request<any>('/security/backup-schedulers/manual-backup', {
        method: 'POST',
        body: JSON.stringify({ notes }),
      }),

    listExecutionHistory: (params?: {
      scheduler_id?: number;
      status?: string;
      execution_type?: string;
      search?: string;
      limit?: number;
    }) => {
      const q = new URLSearchParams();
      if (params?.scheduler_id) q.set('scheduler_id', String(params.scheduler_id));
      if (params?.status && params.status !== 'all') q.set('status', params.status);
      if (params?.execution_type && params.execution_type !== 'all') q.set('execution_type', params.execution_type);
      if (params?.search) q.set('search', params.search);
      if (params?.limit) q.set('limit', String(params.limit));
      const qs = q.toString();
      return request<any[]>(`/security/backup-schedulers/history${qs ? `?${qs}` : ''}`, { method: 'GET' });
    },

    listAuditHistory: (limit = 100) =>
      request<any[]>(`/security/backup-schedulers/audit?limit=${limit}`, { method: 'GET' }),

    getRestoreStatus: () =>
      request<any>('/security/database-restore/status', { method: 'GET' }),

    listAvailableBackups: (params?: {
      search?: string;
      execution_type?: string;
      verification_status?: string;
    }) => {
      const q = new URLSearchParams();
      if (params?.search) q.set('search', params.search);
      if (params?.execution_type && params.execution_type !== 'all') q.set('execution_type', params.execution_type);
      if (params?.verification_status && params.verification_status !== 'all') {
        q.set('verification_status', params.verification_status);
      }
      const qs = q.toString();
      return request<any[]>(`/security/database-restore/available${qs ? `?${qs}` : ''}`, { method: 'GET' });
    },

    getRestorePreview: (backupUid: string) =>
      request<any>(`/security/database-restore/preview/${encodeURIComponent(backupUid)}`, { method: 'GET' }),

    restoreIsolated: (payload: { backup_uid: string; target_database_name?: string }) =>
      request<any>('/security/database-restore/isolated', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),

    restoreProduction: (payload: {
      backup_uid: string;
      password: string;
      confirmation_phrase: string;
    }) =>
      request<any>('/security/database-restore/production', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),

    listRestoreHistory: (limit = 100) =>
      request<any[]>(`/security/database-restore/history?limit=${limit}`, { method: 'GET' }),
  },

  // ==========================================
  // OPERATION-BASED EMPLOYEE PERFORMANCE, QUALITY, READINESS, FORECASTING & REWARDS
  // ==========================================
  operationsEngine: {
    getOptions: () => request<any>('/operations-engine/options', { method: 'GET' }),

    getDashboardSummary: () =>
      request<any>('/operations-engine/dashboard/summary', { method: 'GET' }),

    // Operations Master & Standard Time History
    listOperations: (params?: { status?: string; department_id?: number; search?: string }) => {
      const q = new URLSearchParams();
      if (params?.status && params.status !== 'all') q.set('status', params.status);
      if (params?.department_id) q.set('department_id', String(params.department_id));
      if (params?.search) q.set('search', params.search);
      const qs = q.toString();
      return request<any[]>(`/operations-engine/operations${qs ? `?${qs}` : ''}`, { method: 'GET' });
    },

    createOperation: (payload: {
      name: string;
      department_id?: number | null;
      standard_time_minutes: number;
      uom?: string;
      quality_requirements?: string;
      is_assembly_operation?: boolean;
      description?: string;
    }) =>
      request<any>('/operations-engine/operations', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),

    updateOperation: (id: number, payload: Record<string, any>) =>
      request<any>(`/operations-engine/operations/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      }),

    updateOperationStandardTime: (
      id: number,
      payload: {
        standard_time_minutes: number;
        uom?: string;
        effective_from?: string;
        change_reason: string;
      }
    ) =>
      request<any>(`/operations-engine/operations/${id}/standard-time`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      }),

    getOperationStandardHistory: (id: number) =>
      request<any[]>(`/operations-engine/operations/${id}/standard-history`, { method: 'GET' }),

    // Product Operation Structure
    getProductStructure: (productId: number) =>
      request<any[]>(`/operations-engine/products/${productId}/structure`, { method: 'GET' }),

    addProductStructureStage: (
      productId: number,
      payload: {
        operation_id: number;
        component_name: string;
        required_qty_per_unit: number;
        standard_time_override_minutes?: number | null;
        sequence_order?: number;
        is_mandatory?: boolean;
        is_assembly_stage?: boolean;
        notes?: string;
      }
    ) =>
      request<any>(`/operations-engine/products/${productId}/structure`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),

    deleteProductStructureStage: (stageId: number) =>
      request<any>(`/operations-engine/structure/${stageId}`, { method: 'DELETE' }),

    // Shifts
    listShifts: () => request<any[]>('/operations-engine/shifts', { method: 'GET' }),

    createShift: (payload: {
      name: string;
      start_time: string;
      end_time: string;
      gross_minutes: number;
      break_minutes?: number;
      working_days?: number[];
    }) =>
      request<any>('/operations-engine/shifts', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),

    // Employee Operation Assignments
    listAssignments: (params?: {
      status?: string;
      employee_id?: number;
      operation_id?: number;
      product_id?: number;
    }) => {
      const q = new URLSearchParams();
      if (params?.status && params.status !== 'all') q.set('status', params.status);
      if (params?.employee_id) q.set('employee_id', String(params.employee_id));
      if (params?.operation_id) q.set('operation_id', String(params.operation_id));
      if (params?.product_id) q.set('product_id', String(params.product_id));
      const qs = q.toString();
      return request<any[]>(`/operations-engine/assignments${qs ? `?${qs}` : ''}`, { method: 'GET' });
    },

    createAssignment: (payload: {
      employee_id: number;
      product_id: number;
      operation_id: number;
      production_order_id?: number | null;
      shift_id?: number | null;
      workstation?: string;
      daily_target?: number | null;
      start_at?: string;
      notes?: string;
    }) =>
      request<any>('/operations-engine/assignments', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),

    transferAssignment: (
      id: number,
      payload: {
        operation_id: number;
        product_id?: number | null;
        production_order_id?: number | null;
        workstation?: string;
        transfer_at?: string;
        notes?: string;
      }
    ) =>
      request<any>(`/operations-engine/assignments/${id}/transfer`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),

    // Hardware Production Events & Supervisor Exception Queue
    listHardwareEvents: (params?: { status?: string; limit?: number }) => {
      const q = new URLSearchParams();
      if (params?.status && params.status !== 'all') q.set('status', params.status);
      if (params?.limit) q.set('limit', String(params.limit));
      const qs = q.toString();
      return request<any[]>(`/operations-engine/hardware/events${qs ? `?${qs}` : ''}`, { method: 'GET' });
    },

    resolveHardwareException: (
      id: number,
      payload: {
        action: 'resolve_accept' | 'reject';
        operation_id?: number;
        product_id?: number | null;
        production_order_id?: number | null;
        resolution_notes: string;
      }
    ) =>
      request<any>(`/operations-engine/hardware/exceptions/${id}/resolve`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),

    // Optional Task Start/Pause/Resume/Complete Sessions
    listTaskSessions: () => request<any[]>('/operations-engine/task-sessions', { method: 'GET' }),

    startTaskSession: (payload: {
      employee_id: number;
      operation_id: number;
      product_id?: number | null;
      production_order_id?: number | null;
      notes?: string;
    }) =>
      request<any>('/operations-engine/task-sessions/start', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),

    actionTaskSession: (id: number, action: 'pause' | 'resume' | 'complete', payload?: { completed_qty?: number; notes?: string }) =>
      request<any>(`/operations-engine/task-sessions/${id}/${action}`, {
        method: 'POST',
        body: JSON.stringify(payload || {}),
      }),

    // Downtime Logs
    listDowntime: () => request<any[]>('/operations-engine/downtime', { method: 'GET' }),

    createDowntime: (payload: {
      employee_id?: number | null;
      operation_id?: number | null;
      production_order_id?: number | null;
      workstation?: string;
      reason_category: string;
      started_at?: string;
      ended_at?: string | null;
      duration_minutes: number;
      approved_exclusion?: boolean;
      notes?: string;
    }) =>
      request<any>('/operations-engine/downtime', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),

    // Quality Inspection & Rework
    listQualityInspections: (params?: {
      employee_id?: number;
      operation_id?: number;
      product_id?: number;
      production_order_id?: number;
    }) => {
      const q = new URLSearchParams();
      if (params?.employee_id) q.set('employee_id', String(params.employee_id));
      if (params?.operation_id) q.set('operation_id', String(params.operation_id));
      if (params?.product_id) q.set('product_id', String(params.product_id));
      if (params?.production_order_id) q.set('production_order_id', String(params.production_order_id));
      const qs = q.toString();
      return request<any[]>(`/operations-engine/quality-inspections${qs ? `?${qs}` : ''}`, { method: 'GET' });
    },

    createQualityInspection: (payload: {
      employee_id: number;
      product_id: number;
      operation_id: number;
      production_order_id?: number | null;
      submitted_qty: number;
      inspected_qty: number;
      first_pass_accepted_qty: number;
      rejected_qty: number;
      rework_qty: number;
      accepted_after_rework_qty?: number;
      defect_reason?: string;
      remarks?: string;
    }) =>
      request<any>('/operations-engine/quality-inspections', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),

    updateInspectionRework: (id: number, payload: { accepted_after_rework_qty: number; remarks?: string }) =>
      request<any>(`/operations-engine/quality-inspections/${id}/rework`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      }),

    // Scoring Policy & Fair Performance Reports
    getScoringPolicy: () => request<any>('/operations-engine/scoring-policy', { method: 'GET' }),

    saveScoringPolicy: (payload: {
      policy_name?: string;
      productivity_weight: number;
      quality_weight: number;
      consistency_weight: number;
      max_productivity_score_cap: number;
      consistency_min_productivity_pct?: number;
      consistency_min_quality_pct?: number;
      min_reward_productivity_pct?: number;
      min_reward_quality_pct?: number;
      hardware_debounce_seconds: number;
    }) =>
      request<any>('/operations-engine/scoring-policy', {
        method: 'PUT',
        body: JSON.stringify(payload),
      }),

    getPerformanceReport: (params?: {
      period?: string;
      start_date?: string;
      end_date?: string;
      department_id?: number;
      operation_id?: number;
      product_id?: number;
      production_order_id?: number;
      employee_id?: number;
      sort_by?: string;
      sort_dir?: 'asc' | 'desc';
      page?: number;
      limit?: number;
    }) => {
      const q = new URLSearchParams();
      if (params?.period) q.set('period', params.period);
      if (params?.start_date) q.set('start_date', params.start_date);
      if (params?.end_date) q.set('end_date', params.end_date);
      if (params?.department_id) q.set('department_id', String(params.department_id));
      if (params?.operation_id) q.set('operation_id', String(params.operation_id));
      if (params?.product_id) q.set('product_id', String(params.product_id));
      if (params?.production_order_id) q.set('production_order_id', String(params.production_order_id));
      if (params?.employee_id) q.set('employee_id', String(params.employee_id));
      if (params?.sort_by) q.set('sort_by', params.sort_by);
      if (params?.sort_dir) q.set('sort_dir', params.sort_dir);
      if (params?.page) q.set('page', String(params.page));
      if (params?.limit) q.set('limit', String(params.limit));
      const qs = q.toString();
      return request<any>(`/operations-engine/performance/reports${qs ? `?${qs}` : ''}`, { method: 'GET' });
    },

    exportPerformanceReport: async (
      format: 'xlsx' | 'pdf',
      params?: {
        period?: string;
        start_date?: string;
        end_date?: string;
        department_id?: number;
        operation_id?: number;
        product_id?: number;
        production_order_id?: number;
      }
    ) => {
      const q = new URLSearchParams({ format });
      if (params?.period) q.set('period', params.period);
      if (params?.start_date) q.set('start_date', params.start_date);
      if (params?.end_date) q.set('end_date', params.end_date);
      if (params?.department_id) q.set('department_id', String(params.department_id));
      if (params?.operation_id) q.set('operation_id', String(params.operation_id));
      if (params?.product_id) q.set('product_id', String(params.product_id));
      if (params?.production_order_id) q.set('production_order_id', String(params.production_order_id));
      const token = getAuthToken();
      const res = await fetch(buildApiUrl(`/operations-engine/performance/reports/export?${q.toString()}`), {
        headers: {
          'X-Nexora-Device-Id': getClientDeviceId(),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'include',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Report export failed' }));
        throw new Error(err.message || 'Report export failed');
      }
      const blob = await res.blob();
      const dateStr = new Date().toISOString().split('T')[0];
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Nexora_Operation_Performance_${dateStr}.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    },

    // Group Production Readiness, WIP Transfers & Atomic Assembly
    listOrderReadiness: () => request<any[]>('/operations-engine/readiness/orders', { method: 'GET' }),

    recordAssembly: (orderId: number, payload: { assembled_qty: number; notes?: string }) =>
      request<any>(`/operations-engine/readiness/orders/${orderId}/assemble`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),

    recordFinalQc: (
      assemblyId: number,
      payload: {
        final_approved_qty: number;
        final_rejected_qty: number;
        rework_required_qty: number;
        notes?: string;
      }
    ) =>
      request<any>(`/operations-engine/readiness/assembly/${assemblyId}/final-qc`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),

    // Forecasting & Bottlenecks
    getForecastSummary: () => request<any[]>('/operations-engine/forecasting/summary', { method: 'GET' }),

    getOrderForecast: (orderId: number) =>
      request<any>(`/operations-engine/forecasting/orders/${orderId}`, { method: 'GET' }),

    // Best Employee & Reward Management
    listRewardRules: () => request<any[]>('/operations-engine/rewards/rules', { method: 'GET' }),

    saveRewardRule: (payload: {
      rule_name: string;
      category: string;
      frequency: 'daily' | 'weekly' | 'monthly' | 'custom';
      min_productivity_pct: number;
      min_quality_pct: number;
      min_working_days: number;
      reward_type: string;
      reward_amount: number;
    }) =>
      request<any>('/operations-engine/rewards/rules', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),

    getRewardCandidates: (params?: { period?: string; start_date?: string; end_date?: string; category?: string; operation_id?: number }) => {
      const q = new URLSearchParams();
      if (params?.period) q.set('period', params.period);
      if (params?.start_date) q.set('start_date', params.start_date);
      if (params?.end_date) q.set('end_date', params.end_date);
      if (params?.category) q.set('category', params.category);
      if (params?.operation_id) q.set('operation_id', String(params.operation_id));
      const qs = q.toString();
      return request<any>(`/operations-engine/rewards/candidates${qs ? `?${qs}` : ''}`, { method: 'GET' });
    },

    nominateReward: (payload: {
      employee_id: number;
      category: string;
      period_type?: string;
      period_start: string;
      period_end: string;
      operation_id?: number | null;
      reward_type?: string;
      reward_amount?: number;
      review_notes?: string;
    }) =>
      request<any>('/operations-engine/rewards/nominate', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),

    listRewardHistory: () => request<any[]>('/operations-engine/rewards/history', { method: 'GET' }),

    decideReward: (id: number, payload: { decision: 'approved' | 'rejected' | 'disbursed'; review_notes: string }) =>
      request<any>(`/operations-engine/rewards/${id}/decision`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),

    listAuditLogs: () => request<any[]>('/operations-engine/audit-logs', { method: 'GET' }),
  },

  // ==========================================================================
  // DYNAMIC ROLE-BASED & PERMISSION-BASED VISUAL DASHBOARD API
  // ==========================================================================
  dashboard: {
    getConfig: () => request<any>('/dashboard/config', { method: 'GET' }),

    getSummary: (params?: Record<string, string | number | undefined>) => {
      const q = new URLSearchParams();
      Object.entries(params || {}).forEach(([k, v]) => {
        if (v !== undefined && v !== '' && v !== 'all') q.set(k, String(v));
      });
      const qs = q.toString();
      return request<any>(`/dashboard/summary${qs ? `?${qs}` : ''}`, { method: 'GET' });
    },

    getEmployeePerformance: (params?: Record<string, string | number | undefined>) => {
      const q = new URLSearchParams();
      Object.entries(params || {}).forEach(([k, v]) => {
        if (v !== undefined && v !== '' && v !== 'all') q.set(k, String(v));
      });
      const qs = q.toString();
      return request<any>(`/dashboard/employee-performance${qs ? `?${qs}` : ''}`, { method: 'GET' });
    },

    getProduction: (params?: Record<string, string | number | undefined>) => {
      const q = new URLSearchParams();
      Object.entries(params || {}).forEach(([k, v]) => {
        if (v !== undefined && v !== '' && v !== 'all') q.set(k, String(v));
      });
      const qs = q.toString();
      return request<any>(`/dashboard/production${qs ? `?${qs}` : ''}`, { method: 'GET' });
    },

    getQuality: (params?: Record<string, string | number | undefined>) => {
      const q = new URLSearchParams();
      Object.entries(params || {}).forEach(([k, v]) => {
        if (v !== undefined && v !== '' && v !== 'all') q.set(k, String(v));
      });
      const qs = q.toString();
      return request<any>(`/dashboard/quality${qs ? `?${qs}` : ''}`, { method: 'GET' });
    },

    getProductReadiness: (params?: Record<string, string | number | undefined>) => {
      const q = new URLSearchParams();
      Object.entries(params || {}).forEach(([k, v]) => {
        if (v !== undefined && v !== '' && v !== 'all') q.set(k, String(v));
      });
      const qs = q.toString();
      return request<any>(`/dashboard/product-readiness${qs ? `?${qs}` : ''}`, { method: 'GET' });
    },

    getForecast: (params?: Record<string, string | number | undefined>) => {
      const q = new URLSearchParams();
      Object.entries(params || {}).forEach(([k, v]) => {
        if (v !== undefined && v !== '' && v !== 'all') q.set(k, String(v));
      });
      const qs = q.toString();
      return request<any>(`/dashboard/forecast${qs ? `?${qs}` : ''}`, { method: 'GET' });
    },

    getNotifications: () => request<any>('/dashboard/notifications', { method: 'GET' }),

    markNotificationRead: (id: number) =>
      request<any>(`/dashboard/notifications/${id}/read`, { method: 'POST' }),

    markAllNotificationsRead: () =>
      request<any>('/dashboard/notifications/read-all', { method: 'POST' }),

    getRecentActivity: () => request<any[]>('/dashboard/recent-activity', { method: 'GET' }),

    exportReport: async (format: 'xlsx' | 'pdf', params?: Record<string, string | number | undefined>) => {
      const q = new URLSearchParams({ format });
      Object.entries(params || {}).forEach(([k, v]) => {
        if (v !== undefined && v !== '' && v !== 'all') q.set(k, String(v));
      });
      const token = getAuthToken();
      const res = await fetch(buildApiUrl(`/dashboard/export?${q.toString()}`), {
        headers: {
          'X-Nexora-Device-Id': getClientDeviceId(),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
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
      a.download = `Nexora_Dashboard_${dateStr}.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    },
  },
};
