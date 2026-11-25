import React, { useEffect, useState, useMemo } from 'react';
import { api } from '../services/api';
import { User, Role } from '../types';
import {
  Users,
  Shield,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Plus,
  Search,
  Filter,
  Edit2,
  Trash2,
  Eye,
  AlertTriangle,
  Lock,
  Mail,
  UserCheck,
  Building,
  Phone,
  KeyRound,
  X,
  Info,
  Check,
} from 'lucide-react';

interface UsersDirectoryPageProps {
  onNavigate?: (route: string) => void;
}

export const UsersDirectoryPage: React.FC<UsersDirectoryPageProps> = ({
  onNavigate,
}) => {
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Search and filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRoleFilter, setSelectedRoleFilter] = useState('all');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('all');

  // Modal states
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [activeUser, setActiveUser] = useState<User | null>(null);

  // Form states for Create User
  const [createForm, setCreateForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    password: '',
    phone: '',
    department: 'Operations',
    roles: [] as string[],
    is_active: true,
  });
  const [createErrors, setCreateErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form states for Edit User
  const [editForm, setEditForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    department: '',
    roles: [] as string[],
    is_active: true,
  });
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});

  const fetchData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [usersRes, rolesRes] = await Promise.all([
        api.listUsers(),
        api.listRoles(),
      ]);

      if (usersRes.success && usersRes.data) {
        setUsers(usersRes.data);
      } else {
        setError(usersRes.message || 'Failed to fetch users');
      }

      if (rolesRes.success && rolesRes.data) {
        setRoles(rolesRes.data);
      }
    } catch {
      setError('Failed to fetch data from the server.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Filtered users calculation
  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      // Role filter
      if (selectedRoleFilter !== 'all') {
        const userRoles =
          user.roles && user.roles.length > 0 ? user.roles : [user.role];
        if (!userRoles.includes(selectedRoleFilter)) return false;
      }

      // Status filter
      if (selectedStatusFilter !== 'all') {
        const isActive = selectedStatusFilter === 'active';
        if (user.is_active !== isActive) return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const fullName =
          `${user.first_name || ''} ${user.last_name || ''}`.toLowerCase();
        const email = (user.email || '').toLowerCase();
        const dept = (user.department || '').toLowerCase();
        const role = (user.role || '').toLowerCase();

        return (
          fullName.includes(q) ||
          email.includes(q) ||
          dept.includes(q) ||
          role.includes(q)
        );
      }

      return true;
    });
  }, [users, searchQuery, selectedRoleFilter, selectedStatusFilter]);

  // Handle open create modal
  const handleOpenCreateModal = () => {
    setCreateForm({
      first_name: '',
      last_name: '',
      email: '',
      password: '',
      phone: '',
      department: 'Operations',
      roles:
        roles.length > 0
          ? [roles.find((r) => r.code === 'user')?.code || roles[0].code]
          : [],
      is_active: true,
    });
    setCreateErrors({});
    setIsCreateModalOpen(true);
  };

  // Handle open edit modal
  const handleOpenEditModal = (user: User) => {
    setActiveUser(user);
    setEditForm({
      first_name: user.first_name || '',
      last_name: user.last_name || '',
      email: user.email || '',
      phone: user.phone || '',
      department: user.department || 'Operations',
      roles:
        user.roles && user.roles.length > 0
          ? [...user.roles]
          : [user.role || 'user'],
      is_active: user.is_active,
    });
    setEditErrors({});
    setIsEditModalOpen(true);
  };

  // Handle open view modal
  const handleOpenViewModal = (user: User) => {
    setActiveUser(user);
    setIsViewModalOpen(true);
  };

  // Handle open delete modal
  const handleOpenDeleteModal = (user: User) => {
    setActiveUser(user);
    setIsDeleteModalOpen(true);
  };

  // Validation helper
  const validateUserData = (
    data: {
      first_name: string;
      last_name: string;
      email: string;
      roles: string[];
      password?: string;
    },
    isCreate = false,
  ) => {
    const errors: Record<string, string> = {};

    if (!data.first_name.trim()) {
      errors.first_name = 'First name is required.';
    } else if (data.first_name.trim().length < 2) {
      errors.first_name = 'First name must be at least 2 characters.';
    }

    if (!data.last_name.trim()) {
      errors.last_name = 'Last name is required.';
    } else if (data.last_name.trim().length < 2) {
      errors.last_name = 'Last name must be at least 2 characters.';
    }

    if (!data.email.trim()) {
      errors.email = 'Email address is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim())) {
      errors.email =
        'Please provide a valid email format (e.g. employee@company.com).';
    }

    if (!data.roles || data.roles.length === 0) {
      errors.roles = 'Please assign at least one active role.';
    }

    if (isCreate) {
      if (data.password && data.password.length < 8) {
        errors.password = 'Password must be at least 8 characters long.';
      }
    }

    return errors;
  };

  // Submit Create User
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors = validateUserData(createForm, true);
    if (Object.keys(errors).length > 0) {
      setCreateErrors(errors);
      return;
    }

    setIsSubmitting(true);
    setCreateErrors({});
    try {
      const res = await api.createUser({
        first_name: createForm.first_name.trim(),
        last_name: createForm.last_name.trim(),
        email: createForm.email.trim().toLowerCase(),
        password: createForm.password || undefined,
        role: createForm.roles[0] || 'user',
        roles: createForm.roles,
        phone: createForm.phone.trim(),
        department: createForm.department.trim(),
        is_active: createForm.is_active,
      });

      if (res.success && res.data) {
        setSuccessMsg(
          `User ${res.data.first_name} ${res.data.last_name} created successfully.`,
        );
        setIsCreateModalOpen(false);
        fetchData();
        setTimeout(() => setSuccessMsg(null), 4000);
      } else {
        if (res.errors) {
          const errMap: Record<string, string> = {};
          res.errors.forEach((err) => {
            errMap[err.field] = err.message;
          });
          setCreateErrors(errMap);
        } else {
          setCreateErrors({ general: res.message || 'Failed to create user.' });
        }
      }
    } catch {
      setCreateErrors({ general: 'Server connection failed.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit Edit User
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeUser) return;

    const errors = validateUserData(editForm, false);
    if (Object.keys(errors).length > 0) {
      setEditErrors(errors);
      return;
    }

    setIsSubmitting(true);
    setEditErrors({});
    try {
      const res = await api.updateUser(activeUser.id, {
        first_name: editForm.first_name.trim(),
        last_name: editForm.last_name.trim(),
        email: editForm.email.trim().toLowerCase(),
        role: editForm.roles[0] || 'user',
        roles: editForm.roles,
        phone: editForm.phone.trim(),
        department: editForm.department.trim(),
        is_active: editForm.is_active,
      });

      if (res.success && res.data) {
        setSuccessMsg(
          `User ${res.data.first_name} ${res.data.last_name} updated successfully.`,
        );
        setIsEditModalOpen(false);
        fetchData();
        setTimeout(() => setSuccessMsg(null), 4000);
      } else {
        if (res.errors) {
          const errMap: Record<string, string> = {};
          res.errors.forEach((err) => {
            errMap[err.field] = err.message;
          });
          setEditErrors(errMap);
        } else {
          setEditErrors({ general: res.message || 'Failed to update user.' });
        }
      }
    } catch {
      setEditErrors({ general: 'Server connection failed.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Toggle User Status
  const handleToggleStatus = async (user: User) => {
    const nextStatus = !user.is_active;
    try {
      const res = await api.toggleUserStatus(user.id, nextStatus);
      if (res.success) {
        setSuccessMsg(
          `User ${user.first_name} ${user.last_name} ${nextStatus ? 'activated' : 'disabled'}.`,
        );
        fetchData();
        setTimeout(() => setSuccessMsg(null), 4000);
      } else {
        setError(res.message);
        setTimeout(() => setError(null), 5000);
      }
    } catch {
      setError('Failed to update user status.');
      setTimeout(() => setError(null), 5000);
    }
  };

  // Delete User
  const handleDeleteUser = async () => {
    if (!activeUser) return;
    setIsSubmitting(true);
    try {
      const res = await api.deleteUser(activeUser.id);
      if (res.success) {
        setSuccessMsg(
          `User ${activeUser.first_name} ${activeUser.last_name} deleted successfully.`,
        );
        setIsDeleteModalOpen(false);
        fetchData();
        setTimeout(() => setSuccessMsg(null), 4000);
      } else {
        setError(res.message);
        setIsDeleteModalOpen(false);
        setTimeout(() => setError(null), 5000);
      }
    } catch {
      setError('Failed to delete user.');
      setIsDeleteModalOpen(false);
      setTimeout(() => setError(null), 5000);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isLastSuperAdmin = (user: User) => {
    if (
      user.role !== 'super_admin' &&
      (!user.roles || !user.roles.includes('super_admin'))
    ) {
      return false;
    }
    const activeSupers = users.filter(
      (u) =>
        u.is_active &&
        (u.role === 'super_admin' ||
          (u.roles && u.roles.includes('super_admin'))),
    );
    return activeSupers.length <= 1;
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2.5">
              <Users className="w-7 h-7 text-sky-600" />
              User & Employee Management
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-100 text-sky-800">
              {filteredUsers.length} Account
              {filteredUsers.length !== 1 ? 's' : ''}
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Enterprise identity management with database persistence and strict
            separate First & Last Name representation.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchData}
            disabled={isLoading}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-xl bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 shadow-xs transition-colors disabled:opacity-50"
            title="Refresh database records"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`}
            />
            Refresh
          </button>

          <button
            onClick={handleOpenCreateModal}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl bg-sky-600 hover:bg-sky-700 text-white shadow-sm transition-all shadow-sky-600/20 hover:shadow-sky-600/30"
          >
            <Plus className="w-4 h-4" />
            Create User
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
          <button
            onClick={() => setSuccessMsg(null)}
            className="text-emerald-600 hover:text-emerald-800"
          >
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
          <button
            onClick={() => setError(null)}
            className="text-rose-600 hover:text-rose-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Search and Filters Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by First Name, Last Name, email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9.5 pr-4 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <span>Role:</span>
            <select
              value={selectedRoleFilter}
              onChange={(e) => setSelectedRoleFilter(e.target.value)}
              className="py-1.5 px-2.5 text-xs rounded-lg border border-slate-300 bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-sky-500"
            >
              <option value="all">All Roles</option>
              {roles.map((r) => (
                <option key={r.id} value={r.code}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
            <span>Status:</span>
            <select
              value={selectedStatusFilter}
              onChange={(e) => setSelectedStatusFilter(e.target.value)}
              className="py-1.5 px-2.5 text-xs rounded-lg border border-slate-300 bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-sky-500"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active Accounts</option>
              <option value="disabled">Disabled Accounts</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Table */}
      {isLoading ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-sm text-slate-500 flex flex-col items-center justify-center gap-3 shadow-xs">
          <div className="w-7 h-7 border-2 border-sky-600 border-t-transparent rounded-full animate-spin" />
          <span className="font-medium text-slate-600">
            Querying database database...
          </span>
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-xs space-y-4">
          <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-800">
              No User Accounts Found
            </h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              {searchQuery ||
              selectedRoleFilter !== 'all' ||
              selectedStatusFilter !== 'all'
                ? 'No users match the currently applied filter or search criteria.'
                : 'No users have been created yet. Create a user to get started.'}
            </p>
          </div>
          {(searchQuery ||
            selectedRoleFilter !== 'all' ||
            selectedStatusFilter !== 'all') && (
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedRoleFilter('all');
                setSelectedStatusFilter('all');
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
            >
              Clear Filters
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/90 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-semibold">
                  <th className="px-4 py-3.5">User / Person</th>
                  <th className="px-3.5 py-3.5">Email Address</th>
                  <th className="px-3.5 py-3.5">Assigned Roles</th>
                  <th className="px-3 py-3.5">Department</th>
                  <th className="px-3 py-3.5">Account Status</th>
                  <th className="px-3 py-3.5">Last Login</th>
                  <th className="px-4 py-3.5 text-right sticky right-0 bg-slate-50/95 backdrop-blur-xs shadow-[-6px_0_10px_-4px_rgba(0,0,0,0.08)]">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {filteredUsers.map((u) => {
                  const userRoles =
                    u.roles && u.roles.length > 0 ? u.roles : [u.role];
                  const isProtectedSuper = isLastSuperAdmin(u);

                  return (
                    <tr
                      key={u.id}
                      className="hover:bg-slate-50/60 transition-colors"
                    >
                      {/* Name with separate First and Last Name badges */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-linear-to-br from-sky-100 to-sky-200 text-sky-800 flex items-center justify-center font-bold text-xs shrink-0 shadow-xs">
                            {(u.first_name?.[0] || 'U') +
                              (u.last_name?.[0] || '')}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900 flex items-center gap-1.5">
                              <span>
                                {u.first_name} {u.last_name}
                              </span>
                              {userRoles.includes('super_admin') && (
                                <span
                                  className="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-purple-100 text-purple-700 border border-purple-200 tracking-wide"
                                  title="System Super Administrator"
                                >
                                  SUPER
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-400 font-normal">
                              First:{' '}
                              <span className="font-semibold text-slate-600">
                                {u.first_name}
                              </span>{' '}
                              | Last:{' '}
                              <span className="font-semibold text-slate-600">
                                {u.last_name}
                              </span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Email */}
                      <td className="px-3.5 py-3.5 text-slate-600 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="font-mono text-slate-700 text-[11px]">
                            {u.email}
                          </span>
                        </div>
                      </td>

                      {/* Assigned Roles */}
                      <td className="px-3.5 py-3.5">
                        <div className="flex flex-wrap gap-1">
                          {userRoles.map((rCode) => {
                            const roleObj = roles.find((r) => r.code === rCode);
                            const roleName = roleObj
                              ? roleObj.name
                              : rCode.replace('_', ' ');
                            return (
                              <span
                                key={rCode}
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold tracking-tight uppercase whitespace-nowrap ${
                                  rCode === 'super_admin'
                                    ? 'bg-purple-100 text-purple-800 border border-purple-200'
                                    : rCode === 'admin'
                                      ? 'bg-sky-100 text-sky-800 border border-sky-200'
                                      : 'bg-slate-100 text-slate-700 border border-slate-200'
                                }`}
                              >
                                <Shield className="w-2.5 h-2.5" />
                                {roleName}
                              </span>
                            );
                          })}
                        </div>
                      </td>

                      {/* Department */}
                      <td className="px-3 py-3.5 text-slate-600 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <Building className="w-3 h-3 text-slate-400 shrink-0" />
                          <span>{u.department || 'Operations'}</span>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-3 py-3.5 whitespace-nowrap">
                        {u.is_active ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full font-bold text-[10px]">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-slate-500 bg-slate-100 border border-slate-200 px-2.5 py-0.5 rounded-full font-bold text-[10px]">
                            <XCircle className="w-3 h-3 text-slate-400" />
                            Disabled
                          </span>
                        )}
                      </td>

                      {/* Last Login */}
                      <td className="px-3 py-3.5 text-slate-500 text-[11px] whitespace-nowrap">
                        {u.last_login_at ? (
                          new Date(u.last_login_at).toLocaleString([], {
                            dateStyle: 'short',
                            timeStyle: 'short',
                          })
                        ) : (
                          <span className="italic text-slate-400">Never</span>
                        )}
                      </td>

                      {/* Sticky Actions */}
                      <td className="px-4 py-3.5 text-right whitespace-nowrap sticky right-0 bg-white/95 backdrop-blur-xs shadow-[-6px_0_10px_-4px_rgba(0,0,0,0.08)]">
                        <div className="inline-flex items-center gap-1 justify-end">
                          <button
                            onClick={() => handleOpenViewModal(u)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
                            title="View User Details"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => handleOpenEditModal(u)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200 transition-colors"
                            title="Edit User Details & Roles"
                          >
                            <Edit2 className="w-3 h-3" />
                            <span>Edit</span>
                          </button>

                          <button
                            onClick={() => handleToggleStatus(u)}
                            disabled={isProtectedSuper && u.is_active}
                            className={`p-1.5 rounded-lg transition-colors ${
                              isProtectedSuper && u.is_active
                                ? 'opacity-25 cursor-not-allowed text-slate-300'
                                : u.is_active
                                  ? 'text-amber-500 hover:text-amber-700 hover:bg-amber-50'
                                  : 'text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50'
                            }`}
                            title={
                              isProtectedSuper && u.is_active
                                ? 'Cannot disable the last active Super Admin'
                                : u.is_active
                                  ? 'Disable Account'
                                  : 'Activate Account'
                            }
                          >
                            {u.is_active ? (
                              <XCircle className="w-3.5 h-3.5" />
                            ) : (
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            )}
                          </button>

                          <button
                            onClick={() => handleOpenDeleteModal(u)}
                            disabled={isProtectedSuper}
                            className={`p-1.5 rounded-lg transition-colors ${
                              isProtectedSuper
                                ? 'opacity-25 cursor-not-allowed text-slate-300'
                                : 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'
                            }`}
                            title={
                              isProtectedSuper
                                ? 'Cannot delete the last active Super Admin'
                                : 'Delete User'
                            }
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-100 text-xs text-slate-500 flex justify-between items-center">
            <span>Direct relational persistence in database database</span>
            <span className="font-bold text-slate-700">
              Displaying {filteredUsers.length} of {users.length} Records
            </span>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* CREATE USER MODAL (Section 4) */}
      {/* ==================================================== */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-xl w-full shadow-2xl border border-slate-200 overflow-hidden max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-sky-100 text-sky-700 flex items-center justify-center font-bold">
                  <Plus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Create New User Account
                  </h3>
                  <p className="text-xs text-slate-500">
                    Add an employee or administrator to Nexora
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={handleCreateSubmit}
              className="p-6 space-y-4 overflow-y-auto flex-1"
            >
              {createErrors.general && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
                  {createErrors.general}
                </div>
              )}

              {/* Notice regarding separate First and Last Name */}
              <div className="p-3 rounded-xl bg-sky-50/70 border border-sky-100 flex items-start gap-2.5 text-xs text-sky-800">
                <Info className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Strict Name Standard:</strong> First Name and Last
                  Name are canonical, distinct fields saved directly to
                  database.
                </span>
              </div>

              {/* Name Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    First Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Rahul"
                    value={createForm.first_name}
                    onChange={(e) =>
                      setCreateForm({
                        ...createForm,
                        first_name: e.target.value,
                      })
                    }
                    className={`w-full px-3 py-2 text-xs rounded-xl border ${
                      createErrors.first_name
                        ? 'border-rose-300 ring-1 ring-rose-200'
                        : 'border-slate-300'
                    } focus:outline-none focus:ring-2 focus:ring-sky-500/20`}
                  />
                  {createErrors.first_name && (
                    <p className="text-[11px] text-rose-600 mt-1">
                      {createErrors.first_name}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Last Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Verma"
                    value={createForm.last_name}
                    onChange={(e) =>
                      setCreateForm({
                        ...createForm,
                        last_name: e.target.value,
                      })
                    }
                    className={`w-full px-3 py-2 text-xs rounded-xl border ${
                      createErrors.last_name
                        ? 'border-rose-300 ring-1 ring-rose-200'
                        : 'border-slate-300'
                    } focus:outline-none focus:ring-2 focus:ring-sky-500/20`}
                  />
                  {createErrors.last_name && (
                    <p className="text-[11px] text-rose-600 mt-1">
                      {createErrors.last_name}
                    </p>
                  )}
                </div>
              </div>

              {/* Email & Initial Password */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Email Address <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="employee@company.com"
                    value={createForm.email}
                    onChange={(e) =>
                      setCreateForm({ ...createForm, email: e.target.value })
                    }
                    className={`w-full px-3 py-2 text-xs rounded-xl border ${
                      createErrors.email
                        ? 'border-rose-300 ring-1 ring-rose-200'
                        : 'border-slate-300'
                    } focus:outline-none focus:ring-2 focus:ring-sky-500/20`}
                  />
                  {createErrors.email && (
                    <p className="text-[11px] text-rose-600 mt-1">
                      {createErrors.email}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Initial Password (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="Min 8 characters (or default)"
                    value={createForm.password}
                    onChange={(e) =>
                      setCreateForm({ ...createForm, password: e.target.value })
                    }
                    className={`w-full px-3 py-2 text-xs rounded-xl border ${
                      createErrors.password
                        ? 'border-rose-300 ring-1 ring-rose-200'
                        : 'border-slate-300'
                    } focus:outline-none focus:ring-2 focus:ring-sky-500/20`}
                  />
                  {createErrors.password && (
                    <p className="text-[11px] text-rose-600 mt-1">
                      {createErrors.password}
                    </p>
                  )}
                </div>
              </div>

              {/* Department & Phone */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Department
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Operations, IT, Finance"
                    value={createForm.department}
                    onChange={(e) =>
                      setCreateForm({
                        ...createForm,
                        department: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    placeholder="+91 98765 43210"
                    value={createForm.phone}
                    onChange={(e) =>
                      setCreateForm({ ...createForm, phone: e.target.value })
                    }
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                  />
                </div>
              </div>

              {/* Roles Selection (Section 4 & 9) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Assign Roles <span className="text-rose-500">*</span>
                </label>
                {roles.length === 0 ? (
                  <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center justify-between">
                    <span>
                      No roles currently exist in the database. You must create
                      a role first.
                    </span>
                    {onNavigate && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsCreateModalOpen(false);
                          onNavigate('/roles');
                        }}
                        className="px-2.5 py-1 text-xs font-bold rounded-lg bg-amber-600 text-white"
                      >
                        Create Role
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2 max-h-40 overflow-y-auto p-2 border border-slate-200 rounded-xl bg-slate-50/50">
                    {roles.map((r) => {
                      const isSelected = createForm.roles.includes(r.code);
                      return (
                        <label
                          key={r.id}
                          className={`flex items-start gap-3 p-2.5 rounded-lg border transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-sky-50/80 border-sky-300 shadow-xs'
                              : 'bg-white border-slate-200 hover:bg-slate-50'
                          } ${!r.is_active ? 'opacity-50' : ''}`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            disabled={!r.is_active}
                            onChange={() => {
                              if (isSelected) {
                                setCreateForm({
                                  ...createForm,
                                  roles: createForm.roles.filter(
                                    (code) => code !== r.code,
                                  ),
                                });
                              } else {
                                setCreateForm({
                                  ...createForm,
                                  roles: [...createForm.roles, r.code],
                                });
                              }
                            }}
                            className="mt-0.5 rounded text-sky-600 focus:ring-sky-500"
                          />
                          <div className="flex-1 text-xs">
                            <div className="font-bold text-slate-800 flex items-center gap-1.5">
                              <span>{r.name}</span>
                              <span className="font-mono text-[10px] text-slate-400">
                                [{r.code}]
                              </span>
                              {!r.is_active && (
                                <span className="text-[10px] text-rose-500 font-semibold">
                                  (Disabled)
                                </span>
                              )}
                            </div>
                            <p className="text-slate-500 text-[11px] mt-0.5 leading-snug">
                              {r.description}
                            </p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
                {createErrors.roles && (
                  <p className="text-[11px] text-rose-600 mt-1">
                    {createErrors.roles}
                  </p>
                )}
              </div>

              {/* Account Status Toggle */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div>
                  <span className="text-xs font-bold text-slate-800">
                    Account Status
                  </span>
                  <p className="text-[11px] text-slate-500">
                    Active users can sign into Nexora immediately
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setCreateForm({
                      ...createForm,
                      is_active: !createForm.is_active,
                    })
                  }
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
                  disabled={isSubmitting || roles.length === 0}
                  className="px-5 py-2 text-xs font-bold rounded-xl bg-sky-600 hover:bg-sky-700 text-white shadow-sm transition-all disabled:opacity-50"
                >
                  {isSubmitting
                    ? 'Creating in database...'
                    : 'Save & Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* EDIT USER MODAL (Section 4 & 9) */}
      {/* ==================================================== */}
      {isEditModalOpen && activeUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-xl w-full shadow-2xl border border-slate-200 overflow-hidden max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-sky-100 text-sky-700 flex items-center justify-center font-bold">
                  <Edit2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Edit User Details & Roles
                  </h3>
                  <p className="text-xs text-slate-500">
                    Updating record #{activeUser.id}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={handleEditSubmit}
              className="p-6 space-y-4 overflow-y-auto flex-1"
            >
              {editErrors.general && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
                  {editErrors.general}
                </div>
              )}

              {isLastSuperAdmin(activeUser) && (
                <div className="p-3 rounded-xl bg-purple-50 border border-purple-200 text-purple-900 text-xs flex items-start gap-2.5">
                  <Shield className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">
                      Protected Super Administrator:
                    </span>
                    <p className="mt-0.5 text-purple-700">
                      This user is the last active Super Admin. By system
                      data-integrity rules, Super Admin role assignment and
                      active status cannot be revoked.
                    </p>
                  </div>
                </div>
              )}

              {/* Name Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    First Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={editForm.first_name}
                    onChange={(e) =>
                      setEditForm({ ...editForm, first_name: e.target.value })
                    }
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                  />
                  {editErrors.first_name && (
                    <p className="text-[11px] text-rose-600 mt-1">
                      {editErrors.first_name}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Last Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={editForm.last_name}
                    onChange={(e) =>
                      setEditForm({ ...editForm, last_name: e.target.value })
                    }
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                  />
                  {editErrors.last_name && (
                    <p className="text-[11px] text-rose-600 mt-1">
                      {editErrors.last_name}
                    </p>
                  )}
                </div>
              </div>

              {/* Email & Phone */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Email Address <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    value={editForm.email}
                    onChange={(e) =>
                      setEditForm({ ...editForm, email: e.target.value })
                    }
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                  />
                  {editErrors.email && (
                    <p className="text-[11px] text-rose-600 mt-1">
                      {editErrors.email}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    value={editForm.phone}
                    onChange={(e) =>
                      setEditForm({ ...editForm, phone: e.target.value })
                    }
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                  />
                </div>
              </div>

              {/* Department */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Department
                </label>
                <input
                  type="text"
                  value={editForm.department}
                  onChange={(e) =>
                    setEditForm({ ...editForm, department: e.target.value })
                  }
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                />
              </div>

              {/* Role Assignments */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Assigned Roles <span className="text-rose-500">*</span>
                </label>
                <div className="space-y-2 max-h-40 overflow-y-auto p-2 border border-slate-200 rounded-xl bg-slate-50/50">
                  {roles.map((r) => {
                    const isSelected = editForm.roles.includes(r.code);
                    const isSuperProtected =
                      isLastSuperAdmin(activeUser) && r.code === 'super_admin';

                    return (
                      <label
                        key={r.id}
                        className={`flex items-start gap-3 p-2.5 rounded-lg border transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-sky-50/80 border-sky-300 shadow-xs'
                            : 'bg-white border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={isSuperProtected}
                          onChange={() => {
                            if (isSelected) {
                              if (isSuperProtected) return;
                              setEditForm({
                                ...editForm,
                                roles: editForm.roles.filter(
                                  (code) => code !== r.code,
                                ),
                              });
                            } else {
                              setEditForm({
                                ...editForm,
                                roles: [...editForm.roles, r.code],
                              });
                            }
                          }}
                          className="mt-0.5 rounded text-sky-600 focus:ring-sky-500"
                        />
                        <div className="flex-1 text-xs">
                          <div className="font-bold text-slate-800 flex items-center gap-1.5">
                            <span>{r.name}</span>
                            <span className="font-mono text-[10px] text-slate-400">
                              [{r.code}]
                            </span>
                            {isSuperProtected && (
                              <span className="text-[10px] text-purple-600 font-semibold">
                                (Protected)
                              </span>
                            )}
                          </div>
                          <p className="text-slate-500 text-[11px] mt-0.5 leading-snug">
                            {r.description}
                          </p>
                        </div>
                      </label>
                    );
                  })}
                </div>
                {editErrors.roles && (
                  <p className="text-[11px] text-rose-600 mt-1">
                    {editErrors.roles}
                  </p>
                )}
              </div>

              {/* Status */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div>
                  <span className="text-xs font-bold text-slate-800">
                    Account Status
                  </span>
                  <p className="text-[11px] text-slate-500">
                    {isLastSuperAdmin(activeUser)
                      ? 'The last active Super Admin cannot be disabled'
                      : 'Toggle between Active or Disabled status'}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={isLastSuperAdmin(activeUser)}
                  onClick={() =>
                    setEditForm({ ...editForm, is_active: !editForm.is_active })
                  }
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    isLastSuperAdmin(activeUser)
                      ? 'opacity-50 cursor-not-allowed'
                      : ''
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
                  disabled={isSubmitting}
                  className="px-5 py-2 text-xs font-bold rounded-xl bg-sky-600 hover:bg-sky-700 text-white shadow-sm transition-all disabled:opacity-50"
                >
                  {isSubmitting ? 'Saving to Database...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* VIEW USER DETAILS MODAL */}
      {/* ==================================================== */}
      {isViewModalOpen && activeUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-sky-100 text-sky-700 flex items-center justify-center font-bold">
                  <UserCheck className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    User Details
                  </h3>
                  <p className="text-xs text-slate-500">
                    Record ID #{activeUser.id}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsViewModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="flex items-center gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200">
                <div className="w-12 h-12 rounded-full bg-sky-600 text-white flex items-center justify-center font-bold text-base shrink-0 shadow-sm">
                  {(activeUser.first_name?.[0] || 'U') +
                    (activeUser.last_name?.[0] || '')}
                </div>
                <div>
                  <h4 className="text-base font-bold text-slate-900">
                    {activeUser.first_name} {activeUser.last_name}
                  </h4>
                  <p className="text-xs text-slate-500 font-mono mt-0.5">
                    {activeUser.email}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-slate-50/70 border border-slate-100">
                  <span className="text-slate-400 font-semibold block text-[10px] uppercase">
                    First Name
                  </span>
                  <span className="text-slate-800 font-bold text-sm">
                    {activeUser.first_name}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-slate-50/70 border border-slate-100">
                  <span className="text-slate-400 font-semibold block text-[10px] uppercase">
                    Last Name
                  </span>
                  <span className="text-slate-800 font-bold text-sm">
                    {activeUser.last_name}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-slate-50/70 border border-slate-100">
                  <span className="text-slate-400 font-semibold block text-[10px] uppercase">
                    Department
                  </span>
                  <span className="text-slate-800 font-semibold">
                    {activeUser.department || 'Operations'}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-slate-50/70 border border-slate-100">
                  <span className="text-slate-400 font-semibold block text-[10px] uppercase">
                    Account Status
                  </span>
                  <span
                    className={
                      activeUser.is_active
                        ? 'text-emerald-700 font-bold'
                        : 'text-slate-500 font-bold'
                    }
                  >
                    {activeUser.is_active ? 'Active' : 'Disabled'}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-slate-50/70 border border-slate-100">
                  <span className="text-slate-400 font-semibold block text-[10px] uppercase">
                    Created At
                  </span>
                  <span className="text-slate-700">
                    {new Date(activeUser.created_at).toLocaleDateString()}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-slate-50/70 border border-slate-100">
                  <span className="text-slate-400 font-semibold block text-[10px] uppercase">
                    Last Login
                  </span>
                  <span className="text-slate-700">
                    {activeUser.last_login_at
                      ? new Date(activeUser.last_login_at).toLocaleString()
                      : 'Never'}
                  </span>
                </div>
              </div>

              <div>
                <span className="text-xs font-bold text-slate-700 block mb-1.5">
                  Assigned Roles
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {(activeUser.roles && activeUser.roles.length > 0
                    ? activeUser.roles
                    : [activeUser.role]
                  ).map((rCode) => {
                    const rObj = roles.find((r) => r.code === rCode);
                    return (
                      <span
                        key={rCode}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-sky-50 text-sky-800 border border-sky-200"
                      >
                        <Shield className="w-3 h-3 text-sky-600" />
                        {rObj ? rObj.name : rCode}
                      </span>
                    );
                  })}
                </div>
              </div>

              <div className="pt-2 flex justify-end border-t border-slate-100">
                <button
                  onClick={() => setIsViewModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* DELETE CONFIRMATION MODAL */}
      {/* ==================================================== */}
      {isDeleteModalOpen && activeUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden p-6 space-y-4">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="text-center">
              <h3 className="text-base font-bold text-slate-900">
                Delete User Account
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Are you sure you want to permanently delete{' '}
                <strong className="text-slate-800">
                  {activeUser.first_name} {activeUser.last_name}
                </strong>{' '}
                ({activeUser.email})?
              </p>
              <p className="text-[11px] text-rose-600 mt-2 font-medium">
                This will remove the account from the database and
                revoke all active sessions. This action cannot be undone.
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
                disabled={isSubmitting}
                onClick={handleDeleteUser}
                className="px-5 py-2 text-xs font-bold rounded-xl bg-rose-600 hover:bg-rose-700 text-white shadow-sm transition-all disabled:opacity-50"
              >
                {isSubmitting ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
