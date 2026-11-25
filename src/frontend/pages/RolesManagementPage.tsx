import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Role, Permission, MenuItem } from '../types';
import {
  UserCheck,
  Shield,
  Plus,
  RefreshCw,
  Edit2,
  Trash2,
  CheckCircle2,
  XCircle,
  Key,
  X,
  AlertTriangle,
  Save,
  Check,
  Info,
  Layers,
  Search,
  Lock,
} from 'lucide-react';

interface RolesManagementPageProps {
  onNavigate?: (route: string) => void;
}

interface ActionMatrixRow {
  menuId: number;
  label: string;
  moduleTag: string;
  viewPerm: string;
  createPerm: string;
  editPerm: string;
  deletePerm: string;
  disablePerm: string;
}

export const RolesManagementPage: React.FC<RolesManagementPageProps> = ({ onNavigate }) => {
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Selected role for permissions matrix
  const [selectedRoleForMatrix, setSelectedRoleForMatrix] = useState<Role | null>(null);
  const [matrixPermissions, setMatrixPermissions] = useState<Set<string>>(new Set());
  const [isSavingMatrix, setIsSavingMatrix] = useState(false);

  // Create Role Modal
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    code: '',
    description: '',
    is_active: true,
  });
  const [createErrors, setCreateErrors] = useState<Record<string, string>>({});
  const [isSubmittingRole, setIsSubmittingRole] = useState(false);

  // Edit Role Modal
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [activeRoleForEdit, setActiveRoleForEdit] = useState<Role | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    description: '',
    is_active: true,
  });
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});

  // Delete Role Modal
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [activeRoleForDelete, setActiveRoleForDelete] = useState<Role | null>(null);

  // Fetch roles, permissions, menus
  const fetchAllData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [rolesRes, permsRes, menusRes] = await Promise.all([
        api.listRoles(),
        api.listPermissions(),
        api.getNavigationMenu(),
      ]);

      if (rolesRes.success && rolesRes.data) {
        setRoles(rolesRes.data);
        // Default selected role for matrix
        if (!selectedRoleForMatrix && rolesRes.data.length > 0) {
          const defaultRole = rolesRes.data.find(r => r.code === 'admin') || rolesRes.data[0];
          setSelectedRoleForMatrix(defaultRole);
          setMatrixPermissions(new Set(defaultRole.permissions || []));
        } else if (selectedRoleForMatrix) {
          const fresh = rolesRes.data.find(r => r.id === selectedRoleForMatrix.id);
          if (fresh) {
            setSelectedRoleForMatrix(fresh);
            setMatrixPermissions(new Set(fresh.permissions || []));
          }
        }
      } else {
        setError(rolesRes.message || 'Failed to load roles');
      }

      if (permsRes.success && permsRes.data) {
        setPermissions(permsRes.data);
      }

      if (menusRes.success && menusRes.data) {
        setMenuItems(menusRes.data);
      }
    } catch {
      setError('Failed to connect to the server.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  // Standard Action Matrix Items (Section 8: View, Create, Edit, Delete, Disable per Menu Item)
  const matrixItems: ActionMatrixRow[] = [
    {
      menuId: 3,
      label: 'Users & Employees',
      moduleTag: 'Administration',
      viewPerm: 'users.view',
      createPerm: 'users.create',
      editPerm: 'users.edit',
      deletePerm: 'users.delete',
      disablePerm: 'users.disable',
    },
    {
      menuId: 4,
      label: 'Roles & Access Control',
      moduleTag: 'Administration',
      viewPerm: 'roles.view',
      createPerm: 'roles.create',
      editPerm: 'roles.edit',
      deletePerm: 'roles.delete',
      disablePerm: 'roles.disable',
    },
    {
      menuId: 5,
      label: 'Permissions Catalog',
      moduleTag: 'Administration',
      viewPerm: 'permissions.view',
      createPerm: 'permissions.create',
      editPerm: 'permissions.edit',
      deletePerm: 'permissions.delete',
      disablePerm: 'permissions.assign',
    },
    {
      menuId: 1,
      label: 'Analytics Dashboard',
      moduleTag: 'Core',
      viewPerm: 'dashboard.view',
      createPerm: 'menu.dashboard',
      editPerm: 'menu.dashboard',
      deletePerm: 'menu.dashboard',
      disablePerm: 'menu.dashboard',
    },
    {
      menuId: 12,
      label: 'System & Security Settings',
      moduleTag: 'Core Settings',
      viewPerm: 'settings.view',
      createPerm: 'settings.backup',
      editPerm: 'settings.edit',
      deletePerm: 'action.session_revoke',
      disablePerm: 'settings.sessions',
    },
    {
      menuId: 17,
      label: 'User Profile & Security',
      moduleTag: 'Account',
      viewPerm: 'profile.view',
      createPerm: 'security.password.reset',
      editPerm: 'profile.edit',
      deletePerm: 'action.profile_update',
      disablePerm: 'profile.password',
    },
    {
      menuId: 6,
      label: 'Workforce & Monitoring (Planned)',
      moduleTag: 'Module 5',
      viewPerm: 'menu.workforce',
      createPerm: 'menu.workforce',
      editPerm: 'menu.workforce',
      deletePerm: 'menu.workforce',
      disablePerm: 'menu.workforce',
    },
    {
      menuId: 7,
      label: 'Inventory Management (Planned)',
      moduleTag: 'Module 6',
      viewPerm: 'menu.inventory',
      createPerm: 'menu.inventory',
      editPerm: 'menu.inventory',
      deletePerm: 'menu.inventory',
      disablePerm: 'menu.inventory',
    },
    {
      menuId: 8,
      label: 'Supplier Management (Planned)',
      moduleTag: 'Module 7',
      viewPerm: 'menu.suppliers',
      createPerm: 'menu.suppliers',
      editPerm: 'menu.suppliers',
      deletePerm: 'menu.suppliers',
      disablePerm: 'menu.suppliers',
    },
  ];

  // Selecting a role for matrix editing
  const handleSelectRole = (role: Role) => {
    setSelectedRoleForMatrix(role);
    setMatrixPermissions(new Set(role.permissions || []));
  };

  // Toggle individual matrix permission
  const handleToggleMatrixPerm = (permCode: string) => {
    if (!selectedRoleForMatrix || selectedRoleForMatrix.code === 'super_admin') return;

    setMatrixPermissions(prev => {
      const next = new Set(prev);
      if (next.has(permCode)) {
        next.delete(permCode);
      } else {
        next.add(permCode);
      }
      return next;
    });
  };

  // Toggle row all
  const handleToggleRow = (row: ActionMatrixRow) => {
    if (!selectedRoleForMatrix || selectedRoleForMatrix.code === 'super_admin') return;
    const codes = [row.viewPerm, row.createPerm, row.editPerm, row.deletePerm, row.disablePerm];
    const allActive = codes.every(c => matrixPermissions.has(c));

    setMatrixPermissions(prev => {
      const next = new Set(prev);
      if (allActive) {
        codes.forEach(c => next.delete(c));
      } else {
        codes.forEach(c => next.add(c));
      }
      return next;
    });
  };

  // Save Permissions Matrix to PostgreSQL
  const handleSaveMatrix = async () => {
    if (!selectedRoleForMatrix) return;
    if (selectedRoleForMatrix.code === 'super_admin') {
      setSuccessMsg('Super Administrator permanently retains complete unrestricted authorization.');
      return;
    }

    setIsSavingMatrix(true);
    setError(null);
    try {
      const permsArray = Array.from(matrixPermissions);
      const res = await api.updateRolePermissions(selectedRoleForMatrix.code, permsArray);

      if (res.success) {
        setSuccessMsg(`Permissions saved successfully to PostgreSQL for role '${selectedRoleForMatrix.name}'.`);
        // Update local state
        setRoles(prev =>
          prev.map(r => (r.id === selectedRoleForMatrix.id ? { ...r, permissions: permsArray } : r))
        );
        setTimeout(() => setSuccessMsg(null), 4000);
      } else {
        setError(res.message || 'Failed to save permissions.');
      }
    } catch {
      setError('Connection failed while saving permissions.');
    } finally {
      setIsSavingMatrix(false);
    }
  };

  // Submit Create Role
  const handleCreateRoleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string> = {};

    if (!createForm.name.trim()) {
      errors.name = 'Role name is required.';
    }
    if (!createForm.code.trim()) {
      errors.code = 'Role code or slug is required.';
    } else {
      const slug = createForm.code.trim().toLowerCase().replace(/\s+/g, '_');
      if (roles.some(r => r.code === slug)) {
        errors.code = `Role code '${slug}' already exists.`;
      }
    }

    if (Object.keys(errors).length > 0) {
      setCreateErrors(errors);
      return;
    }

    setIsSubmittingRole(true);
    setCreateErrors({});
    try {
      const slug = createForm.code.trim().toLowerCase().replace(/\s+/g, '_');
      const res = await api.createRole({
        name: createForm.name.trim(),
        code: slug,
        description: createForm.description.trim(),
        is_active: createForm.is_active,
        permissions: [], // Clean empty default per requirement
      });

      if (res.success && res.data) {
        setSuccessMsg(`Role '${res.data.name}' created successfully.`);
        setIsCreateModalOpen(false);
        fetchAllData();
        setSelectedRoleForMatrix(res.data);
        setMatrixPermissions(new Set());
        setTimeout(() => setSuccessMsg(null), 4000);
      } else {
        setCreateErrors({ general: res.message || 'Failed to create role.' });
      }
    } catch {
      setCreateErrors({ general: 'Server connection failed.' });
    } finally {
      setIsSubmittingRole(false);
    }
  };

  // Submit Edit Role
  const handleEditRoleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRoleForEdit) return;

    if (!editForm.name.trim()) {
      setEditErrors({ name: 'Role name cannot be blank.' });
      return;
    }

    setIsSubmittingRole(true);
    setEditErrors({});
    try {
      const res = await api.updateRole(activeRoleForEdit.id, {
        name: editForm.name.trim(),
        description: editForm.description.trim(),
        is_active: editForm.is_active,
      });

      if (res.success && res.data) {
        setSuccessMsg(`Role '${res.data.name}' updated successfully.`);
        setIsEditModalOpen(false);
        fetchAllData();
        setTimeout(() => setSuccessMsg(null), 4000);
      } else {
        setEditErrors({ general: res.message || 'Failed to update role.' });
      }
    } catch {
      setEditErrors({ general: 'Server connection failed.' });
    } finally {
      setIsSubmittingRole(false);
    }
  };

  // Toggle Role Status
  const handleToggleRoleStatus = async (role: Role) => {
    if (role.is_system) {
      setError(`System role '${role.name}' cannot be disabled.`);
      setTimeout(() => setError(null), 4000);
      return;
    }

    const nextStatus = !role.is_active;
    try {
      const res = await api.toggleRoleStatus(role.id, nextStatus);
      if (res.success) {
        setSuccessMsg(`Role '${role.name}' ${nextStatus ? 'activated' : 'disabled'}.`);
        fetchAllData();
        setTimeout(() => setSuccessMsg(null), 4000);
      } else {
        setError(res.message);
        setTimeout(() => setError(null), 4000);
      }
    } catch {
      setError('Failed to update role status.');
      setTimeout(() => setError(null), 4000);
    }
  };

  // Delete Role
  const handleDeleteRole = async () => {
    if (!activeRoleForDelete) return;
    setIsSubmittingRole(true);
    try {
      const res = await api.deleteRole(activeRoleForDelete.id);
      if (res.success) {
        setSuccessMsg(`Role '${activeRoleForDelete.name}' deleted successfully.`);
        setIsDeleteModalOpen(false);
        fetchAllData();
        setTimeout(() => setSuccessMsg(null), 4000);
      } else {
        setError(res.message);
        setIsDeleteModalOpen(false);
        setTimeout(() => setError(null), 5000);
      }
    } catch {
      setError('Failed to delete role.');
      setIsDeleteModalOpen(false);
      setTimeout(() => setError(null), 5000);
    } finally {
      setIsSubmittingRole(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2.5">
              <UserCheck className="w-7 h-7 text-sky-600" />
              Role & Menu Permission Management
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-100 text-sky-800">
              {roles.length} Role{roles.length !== 1 ? 's' : ''}
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Create roles, assign users, and configure granular View, Create, Edit, Delete, and Disable permissions per menu item.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchAllData}
            disabled={isLoading}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-xl bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 shadow-xs transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>

          <button
            onClick={() => {
              setCreateForm({ name: '', code: '', description: '', is_active: true });
              setCreateErrors({});
              setIsCreateModalOpen(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl bg-sky-600 hover:bg-sky-700 text-white shadow-sm transition-all shadow-sky-600/20"
          >
            <Plus className="w-4 h-4" />
            Create Role
          </button>
        </div>
      </div>

      {/* Notifications */}
      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex items-center justify-between shadow-xs animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span className="font-medium">{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-600 hover:text-emerald-800">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-center justify-between shadow-xs animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
            <span className="font-medium">{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-rose-600 hover:text-rose-800">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* SECTION 1: ROLES DIRECTORY (List, View, Edit, Status, Delete) */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Shield className="w-5 h-5 text-sky-600" />
            Configured System Roles
          </h2>
          <span className="text-xs text-slate-500">
            Click on any role to configure its menu & action permissions matrix below.
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {roles.map(r => {
            const isSelected = selectedRoleForMatrix?.id === r.id;
            const isSuper = r.code === 'super_admin';

            return (
              <div
                key={r.id}
                onClick={() => handleSelectRole(r)}
                className={`p-5 rounded-2xl border transition-all cursor-pointer relative flex flex-col justify-between ${
                  isSelected
                    ? 'bg-sky-50/60 border-sky-400 ring-2 ring-sky-400/20 shadow-md'
                    : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-xs'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 ${
                          isSuper
                            ? 'bg-purple-100 text-purple-700'
                            : r.is_system
                            ? 'bg-sky-100 text-sky-700'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        <Shield className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-bold text-slate-900 text-xs sm:text-sm leading-tight truncate">{r.name}</h3>
                        <span className="font-mono text-[10px] text-slate-400 block mt-0.5 truncate">[{r.code}]</span>
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center">
                      {isSuper ? (
                        <span className="px-1.5 py-0.5 rounded-full text-[9px] font-extrabold bg-purple-100 text-purple-700 border border-purple-200 tracking-wide uppercase whitespace-nowrap">
                          PROTECTED
                        </span>
                      ) : r.is_system ? (
                        <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-slate-100 text-slate-600 tracking-wide uppercase whitespace-nowrap">
                          SYSTEM
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-emerald-100 text-emerald-700 tracking-wide uppercase whitespace-nowrap">
                          CUSTOM
                        </span>
                      )}
                    </div>
                  </div>

                  <p className="text-xs text-slate-500 mt-3 line-clamp-2 leading-relaxed">
                    {r.description || 'No description provided.'}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100/80 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 text-[11px] text-slate-500">
                    <span className="font-semibold text-slate-700">{r.user_count ?? 0}</span> User(s)
                    <span>•</span>
                    <span className="font-semibold text-slate-700">
                      {isSuper ? 'Full Access' : `${r.permissions?.length || 0} Perms`}
                    </span>
                  </div>

                  <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                    {!isSuper && (
                      <button
                        onClick={() => {
                          setActiveRoleForEdit(r);
                          setEditForm({
                            name: r.name,
                            description: r.description,
                            is_active: r.is_active,
                          });
                          setIsEditModalOpen(true);
                        }}
                        className="p-1 rounded-md text-slate-400 hover:text-sky-600 hover:bg-slate-100 transition-colors"
                        title="Edit Role"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {!r.is_system && (
                      <>
                        <button
                          onClick={() => handleToggleRoleStatus(r)}
                          className={`p-1 rounded-md transition-colors ${
                            r.is_active ? 'text-slate-400 hover:text-amber-600' : 'text-slate-400 hover:text-emerald-600'
                          }`}
                          title={r.is_active ? 'Deactivate Role' : 'Activate Role'}
                        >
                          {r.is_active ? <XCircle className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                        </button>

                        <button
                          onClick={() => {
                            setActiveRoleForDelete(r);
                            setIsDeleteModalOpen(true);
                          }}
                          disabled={(r.user_count ?? 0) > 0}
                          className={`p-1 rounded-md transition-colors ${
                            (r.user_count ?? 0) > 0
                              ? 'opacity-30 cursor-not-allowed text-slate-300'
                              : 'text-slate-400 hover:text-rose-600'
                          }`}
                          title={
                            (r.user_count ?? 0) > 0
                              ? 'Cannot delete role with assigned users'
                              : 'Delete Role'
                          }
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ==================================================== */}
      {/* SECTION 2: MENU ITEMS & ACTION PERMISSIONS MATRIX (Section 8) */}
      {/* ==================================================== */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Matrix Header */}
        <div className="p-6 border-b border-slate-100 bg-linear-to-r from-slate-50 to-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Key className="w-5 h-5 text-sky-600" />
              <h2 className="text-base font-bold text-slate-900">
                Menu Items & Action Permissions Matrix
              </h2>
              {selectedRoleForMatrix && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-sky-100 text-sky-800">
                  Target Role: {selectedRoleForMatrix.name}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Select allowed menu items and distinct actions (View, Create, Edit, Delete, Disable) for this role.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {selectedRoleForMatrix?.code === 'super_admin' ? (
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-50 text-purple-800 border border-purple-200 text-xs font-bold">
                <Lock className="w-3.5 h-3.5 text-purple-600" />
                Super Admin Has Complete Unrestricted Access
              </div>
            ) : (
              <button
                onClick={handleSaveMatrix}
                disabled={isSavingMatrix || !selectedRoleForMatrix}
                className="inline-flex items-center gap-2 px-5 py-2 text-xs font-bold rounded-xl bg-sky-600 hover:bg-sky-700 text-white shadow-sm transition-all shadow-sky-600/20 disabled:opacity-50"
              >
                <Save className={`w-3.5 h-3.5 ${isSavingMatrix ? 'animate-spin' : ''}`} />
                {isSavingMatrix ? 'Saving to Database...' : 'Save Permission Matrix'}
              </button>
            )}
          </div>
        </div>

        {/* Matrix Guidelines Banner */}
        <div className="px-6 py-3 bg-amber-50/60 border-b border-amber-100 text-xs text-amber-900 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              <strong>Granular RBAC Rules:</strong> View, Create, Edit, Delete, and Disable are independent permissions. Selecting View does not automatically grant Create, Edit, or Delete.
            </span>
          </div>
          {selectedRoleForMatrix && selectedRoleForMatrix.code !== 'super_admin' && (
            <span className="font-semibold text-slate-600">
              Active Toggles: {matrixPermissions.size}
            </span>
          )}
        </div>

        {/* Matrix Table */}
        <div className="overflow-x-auto max-h-[460px] overflow-y-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="sticky top-0 z-10 bg-slate-100/95 backdrop-blur-xs shadow-xs">
              <tr className="border-b border-slate-200 text-slate-500 uppercase tracking-wider font-semibold">
                <th className="px-6 py-3.5">Eligible Menu Item</th>
                <th className="px-4 py-3.5 text-center">View</th>
                <th className="px-4 py-3.5 text-center">Create</th>
                <th className="px-4 py-3.5 text-center">Edit</th>
                <th className="px-4 py-3.5 text-center">Delete</th>
                <th className="px-4 py-3.5 text-center">Disable</th>
                <th className="px-4 py-3.5 text-right">Quick Select</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {matrixItems.map(row => {
                const isSuper = selectedRoleForMatrix?.code === 'super_admin';
                const hasView = isSuper || matrixPermissions.has(row.viewPerm);
                const hasCreate = isSuper || matrixPermissions.has(row.createPerm);
                const hasEdit = isSuper || matrixPermissions.has(row.editPerm) || matrixPermissions.has(row.editPerm.replace('.edit', '.update'));
                const hasDelete = isSuper || matrixPermissions.has(row.deletePerm);
                const hasDisable = isSuper || matrixPermissions.has(row.disablePerm);

                return (
                  <tr key={row.menuId} className="hover:bg-slate-50/60 transition-colors">
                    {/* Menu Item Name */}
                    <td className="px-6 py-4">
                      <div>
                        <div className="font-bold text-slate-900 flex items-center gap-2">
                          <span>{row.label}</span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600">
                            {row.moduleTag}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                          Base code: {row.viewPerm}
                        </div>
                      </div>
                    </td>

                    {/* View Toggle */}
                    <td className="px-4 py-4 text-center">
                      <button
                        type="button"
                        disabled={isSuper}
                        onClick={() => handleToggleMatrixPerm(row.viewPerm)}
                        className={`inline-flex items-center justify-center w-8 h-8 rounded-lg border transition-all ${
                          hasView
                            ? 'bg-sky-600 border-sky-600 text-white shadow-xs'
                            : 'bg-white border-slate-300 text-slate-300 hover:border-slate-400'
                        } ${isSuper ? 'cursor-not-allowed opacity-90' : 'cursor-pointer'}`}
                        title={`Toggle View for ${row.label}`}
                      >
                        <Check className="w-4 h-4 stroke-[2.5]" />
                      </button>
                    </td>

                    {/* Create Toggle */}
                    <td className="px-4 py-4 text-center">
                      <button
                        type="button"
                        disabled={isSuper}
                        onClick={() => handleToggleMatrixPerm(row.createPerm)}
                        className={`inline-flex items-center justify-center w-8 h-8 rounded-lg border transition-all ${
                          hasCreate
                            ? 'bg-emerald-600 border-emerald-600 text-white shadow-xs'
                            : 'bg-white border-slate-300 text-slate-300 hover:border-slate-400'
                        } ${isSuper ? 'cursor-not-allowed opacity-90' : 'cursor-pointer'}`}
                        title={`Toggle Create for ${row.label}`}
                      >
                        <Check className="w-4 h-4 stroke-[2.5]" />
                      </button>
                    </td>

                    {/* Edit Toggle */}
                    <td className="px-4 py-4 text-center">
                      <button
                        type="button"
                        disabled={isSuper}
                        onClick={() => handleToggleMatrixPerm(row.editPerm)}
                        className={`inline-flex items-center justify-center w-8 h-8 rounded-lg border transition-all ${
                          hasEdit
                            ? 'bg-amber-600 border-amber-600 text-white shadow-xs'
                            : 'bg-white border-slate-300 text-slate-300 hover:border-slate-400'
                        } ${isSuper ? 'cursor-not-allowed opacity-90' : 'cursor-pointer'}`}
                        title={`Toggle Edit for ${row.label}`}
                      >
                        <Check className="w-4 h-4 stroke-[2.5]" />
                      </button>
                    </td>

                    {/* Delete Toggle */}
                    <td className="px-4 py-4 text-center">
                      <button
                        type="button"
                        disabled={isSuper}
                        onClick={() => handleToggleMatrixPerm(row.deletePerm)}
                        className={`inline-flex items-center justify-center w-8 h-8 rounded-lg border transition-all ${
                          hasDelete
                            ? 'bg-rose-600 border-rose-600 text-white shadow-xs'
                            : 'bg-white border-slate-300 text-slate-300 hover:border-slate-400'
                        } ${isSuper ? 'cursor-not-allowed opacity-90' : 'cursor-pointer'}`}
                        title={`Toggle Delete for ${row.label}`}
                      >
                        <Check className="w-4 h-4 stroke-[2.5]" />
                      </button>
                    </td>

                    {/* Disable Toggle */}
                    <td className="px-4 py-4 text-center">
                      <button
                        type="button"
                        disabled={isSuper}
                        onClick={() => handleToggleMatrixPerm(row.disablePerm)}
                        className={`inline-flex items-center justify-center w-8 h-8 rounded-lg border transition-all ${
                          hasDisable
                            ? 'bg-purple-600 border-purple-600 text-white shadow-xs'
                            : 'bg-white border-slate-300 text-slate-300 hover:border-slate-400'
                        } ${isSuper ? 'cursor-not-allowed opacity-90' : 'cursor-pointer'}`}
                        title={`Toggle Disable for ${row.label}`}
                      >
                        <Check className="w-4 h-4 stroke-[2.5]" />
                      </button>
                    </td>

                    {/* Quick Row Action */}
                    <td className="px-4 py-4 text-right">
                      {!isSuper && (
                        <button
                          type="button"
                          onClick={() => handleToggleRow(row)}
                          className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                        >
                          Toggle All
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="p-4 bg-slate-50 border-t border-slate-100 text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-sky-600" /> View</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-600" /> Create</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-amber-600" /> Edit</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-rose-600" /> Delete</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-purple-600" /> Disable</span>
          </div>

          {selectedRoleForMatrix?.code !== 'super_admin' && (
            <button
              onClick={handleSaveMatrix}
              disabled={isSavingMatrix}
              className="px-4 py-1.5 text-xs font-bold rounded-lg bg-sky-600 hover:bg-sky-700 text-white shadow-xs transition-colors disabled:opacity-50"
            >
              Save Changes
            </button>
          )}
        </div>
      </div>

      {/* ==================================================== */}
      {/* CREATE ROLE MODAL (Section 5) */}
      {/* ==================================================== */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-sky-100 text-sky-700 flex items-center justify-center font-bold">
                  <Plus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Create New System Role</h3>
                  <p className="text-xs text-slate-500">Define a custom organizational role and code</p>
                </div>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateRoleSubmit} className="p-6 space-y-4">
              {createErrors.general && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
                  {createErrors.general}
                </div>
              )}

              <div className="p-3 rounded-xl bg-sky-50 border border-sky-100 text-xs text-sky-800 flex items-start gap-2">
                <Info className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
                <span>
                  Creating a role does not automatically grant permissions. You will configure its menu and action matrix on the main screen.
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Role Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Inventory Supervisor"
                  value={createForm.name}
                  onChange={e => {
                    const name = e.target.value;
                    const autoSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
                    setCreateForm({
                      ...createForm,
                      name,
                      code: createForm.code ? createForm.code : autoSlug,
                    });
                  }}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                />
                {createErrors.name && (
                  <p className="text-[11px] text-rose-600 mt-1">{createErrors.name}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Role Code / Slug <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. inventory_supervisor"
                  value={createForm.code}
                  onChange={e => setCreateForm({ ...createForm, code: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 font-mono focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                />
                {createErrors.code && (
                  <p className="text-[11px] text-rose-600 mt-1">{createErrors.code}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Description
                </label>
                <textarea
                  rows={2}
                  placeholder="Describe the functional responsibilities of this role..."
                  value={createForm.description}
                  onChange={e => setCreateForm({ ...createForm, description: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div>
                  <span className="text-xs font-bold text-slate-800">Active Role Status</span>
                  <p className="text-[11px] text-slate-500">Can be assigned to users immediately</p>
                </div>
                <button
                  type="button"
                  onClick={() => setCreateForm({ ...createForm, is_active: !createForm.is_active })}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    createForm.is_active ? 'bg-sky-600' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                      createForm.is_active ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingRole}
                  className="px-5 py-2 text-xs font-bold rounded-xl bg-sky-600 hover:bg-sky-700 text-white shadow-sm transition-all disabled:opacity-50"
                >
                  {isSubmittingRole ? 'Saving...' : 'Create Role'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* EDIT ROLE MODAL */}
      {/* ==================================================== */}
      {isEditModalOpen && activeRoleForEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-sky-100 text-sky-700 flex items-center justify-center font-bold">
                  <Edit2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Edit Role Details</h3>
                  <p className="text-xs text-slate-500">Role ID #{activeRoleForEdit.id} [{activeRoleForEdit.code}]</p>
                </div>
              </div>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditRoleSubmit} className="p-6 space-y-4">
              {editErrors.general && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
                  {editErrors.general}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Role Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={editForm.name}
                  onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                />
                {editErrors.name && (
                  <p className="text-[11px] text-rose-600 mt-1">{editErrors.name}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Description
                </label>
                <textarea
                  rows={3}
                  value={editForm.description}
                  onChange={e => setEditForm({ ...editForm, description: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div>
                  <span className="text-xs font-bold text-slate-800">Role Status</span>
                  <p className="text-[11px] text-slate-500">
                    {activeRoleForEdit.is_system
                      ? 'System roles must remain active'
                      : 'Toggle between Active or Disabled status'}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={activeRoleForEdit.is_system}
                  onClick={() => setEditForm({ ...editForm, is_active: !editForm.is_active })}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    activeRoleForEdit.is_system ? 'opacity-50 cursor-not-allowed' : ''
                  } ${editForm.is_active ? 'bg-sky-600' : 'bg-slate-300'}`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                      editForm.is_active ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingRole}
                  className="px-5 py-2 text-xs font-bold rounded-xl bg-sky-600 hover:bg-sky-700 text-white shadow-sm transition-all disabled:opacity-50"
                >
                  {isSubmittingRole ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* DELETE ROLE MODAL */}
      {/* ==================================================== */}
      {isDeleteModalOpen && activeRoleForDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden p-6 space-y-4">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="text-center">
              <h3 className="text-base font-bold text-slate-900">Delete Role</h3>
              <p className="text-xs text-slate-500 mt-1">
                Are you sure you want to delete role{' '}
                <strong className="text-slate-800">{activeRoleForDelete.name}</strong> [{activeRoleForDelete.code}]?
              </p>
              <p className="text-[11px] text-rose-600 mt-2 font-medium">
                All associated role permissions will be permanently purged from PostgreSQL.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsDeleteModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-600 hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSubmittingRole}
                onClick={handleDeleteRole}
                className="px-5 py-2 text-xs font-bold rounded-xl bg-rose-600 hover:bg-rose-700 text-white shadow-sm transition-all disabled:opacity-50"
              >
                {isSubmittingRole ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
