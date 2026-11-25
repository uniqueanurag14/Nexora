import React, { useState, useEffect } from 'react';
import {
  Building2,
  Plus,
  Search,
  Filter,
  Users,
  Edit2,
  Trash2,
  Power,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  X,
  ShieldCheck,
  Building,
  RefreshCw,
} from 'lucide-react';
import { Department, DepartmentCreateDTO, DepartmentUpdateDTO } from '../types';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';

export const DepartmentsManagementPage: React.FC = () => {
  const { notify } = useAuth();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // Modal states
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [activeDept, setActiveDept] = useState<Department | null>(null);

  // Form states
  const [formData, setFormData] = useState<{
    code: string;
    name: string;
    description: string;
    is_active: boolean;
  }>({
    code: '',
    name: '',
    description: '',
    is_active: true,
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadDepartments = async () => {
    setIsLoading(true);
    try {
      const res = await api.listDepartments();
      if (res.success && res.data) {
        setDepartments(res.data);
      } else {
        notify('error', res.message || 'Failed to load departments');
      }
    } catch {
      notify('error', 'Network error while loading departments');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDepartments();
  }, []);

  const openCreateModal = () => {
    setFormData({
      code: '',
      name: '',
      description: '',
      is_active: true,
    });
    setFormErrors({});
    setIsCreateModalOpen(true);
  };

  const isDeptActive = (d: Department) => d.status === 'active' || d.is_active === true;

  const openEditModal = (dept: Department) => {
    setActiveDept(dept);
    setFormData({
      code: dept.code,
      name: dept.name,
      description: dept.description || '',
      is_active: isDeptActive(dept),
    });
    setFormErrors({});
    setIsEditModalOpen(true);
  };

  const openDeleteModal = (dept: Department) => {
    setActiveDept(dept);
    setIsDeleteModalOpen(true);
  };

  const validateForm = () => {
    const errors: Record<string, string> = {};
    if (!formData.name.trim()) {
      errors.name = 'Department name is required';
    }
    if (!formData.code.trim()) {
      errors.code = 'Department code is required';
    } else if (!/^[A-Za-z0-9_-]{2,20}$/.test(formData.code.trim())) {
      errors.code = 'Code must be 2-20 alphanumeric characters, underscores or hyphens';
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsSubmitting(true);
    try {
      const payload: DepartmentCreateDTO = {
        name: formData.name.trim(),
        code: formData.code.trim().toUpperCase(),
        description: formData.description.trim() || undefined,
        status: formData.is_active ? 'active' : 'disabled',
        is_active: formData.is_active,
      };

      const res = await api.createDepartment(payload);
      if (res.success) {
        notify('success', `Department "${payload.name}" created successfully`);
        setIsCreateModalOpen(false);
        loadDepartments();
      } else {
        notify('error', res.message || 'Failed to create department');
      }
    } catch (err: any) {
      notify('error', err.message || 'Error occurred while creating department');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeDept || !validateForm()) return;

    setIsSubmitting(true);
    try {
      const payload: DepartmentUpdateDTO = {
        name: formData.name.trim(),
        code: formData.code.trim().toUpperCase(),
        description: formData.description.trim() || undefined,
        status: formData.is_active ? 'active' : 'disabled',
        is_active: formData.is_active,
      };

      const res = await api.updateDepartment(activeDept.id, payload);
      if (res.success) {
        notify('success', `Department "${payload.name}" updated successfully`);
        setIsEditModalOpen(false);
        loadDepartments();
      } else {
        notify('error', res.message || 'Failed to update department');
      }
    } catch (err: any) {
      notify('error', err.message || 'Error occurred while updating department');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleStatus = async (dept: Department) => {
    try {
      const nextActive = !isDeptActive(dept);
      const res = await api.toggleDepartmentStatus(dept.id, nextActive ? 'active' : 'disabled');
      if (res.success) {
        notify(
          'success',
          `Department "${dept.name}" ${nextActive ? 'enabled' : 'disabled'} successfully`
        );
        loadDepartments();
      } else {
        notify('error', res.message || 'Failed to update department status');
      }
    } catch {
      notify('error', 'Error toggling department status');
    }
  };

  const handleDelete = async () => {
    if (!activeDept) return;
    setIsSubmitting(true);
    try {
      const res = await api.deleteDepartment(activeDept.id);
      if (res.success) {
        notify('success', `Department "${activeDept.name}" deleted successfully`);
        setIsDeleteModalOpen(false);
        loadDepartments();
      } else {
        notify('error', res.message || 'Cannot delete department');
      }
    } catch (err: any) {
      notify('error', err.message || 'Error deleting department');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filtered department list
  const filtered = departments.filter(d => {
    const matchesSearch =
      d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (d.description && d.description.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesStatus =
      statusFilter === 'all'
        ? true
        : statusFilter === 'active'
        ? isDeptActive(d)
        : !isDeptActive(d);

    return matchesSearch && matchesStatus;
  });

  const totalEmployees = departments.reduce((acc, d) => acc + (d.employee_count || 0), 0);
  const activeCount = departments.filter(isDeptActive).length;
  const inactiveCount = departments.length - activeCount;

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#0084CC] mb-1">
            <span>Administration</span>
            <span>/</span>
            <span>Departments</span>
          </div>
          <h1 className="text-2xl font-bold text-[#101B32] tracking-tight">
            Department Management
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Organize departments, codes, operational domains, and workforce governance.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadDepartments}
            disabled={isLoading}
            className="p-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 shadow-xs transition-colors"
            title="Refresh list"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-[#0084CC]' : ''}`} />
          </button>
          <button
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0084CC] hover:bg-[#0074b4] text-white text-xs font-bold shadow-xs transition-colors shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Create Department</span>
          </button>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Total Departments
            </span>
            <div className="w-8 h-8 rounded-lg bg-sky-50 text-[#0084CC] flex items-center justify-center">
              <Building2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-[#101B32]">{departments.length}</span>
            <span className="text-xs text-slate-400">units defined</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Active Units
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-emerald-600">{activeCount}</span>
            <span className="text-xs text-slate-400">operational</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Inactive Units
            </span>
            <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center">
              <XCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-700">{inactiveCount}</span>
            <span className="text-xs text-slate-400">disabled</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Allocated Personnel
            </span>
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-indigo-600">{totalEmployees}</span>
            <span className="text-xs text-slate-400">active members</span>
          </div>
        </div>
      </div>

      {/* Action and Filter Toolbar */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by code, department name, or scope..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0084CC]/20 focus:border-[#0084CC]"
          />
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                statusFilter === 'all'
                  ? 'bg-white text-[#101B32] shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              All ({departments.length})
            </button>
            <button
              onClick={() => setStatusFilter('active')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                statusFilter === 'active'
                  ? 'bg-white text-emerald-700 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Active ({activeCount})
            </button>
            <button
              onClick={() => setStatusFilter('inactive')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                statusFilter === 'inactive'
                  ? 'bg-white text-rose-700 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Inactive ({inactiveCount})
            </button>
          </div>
        </div>
      </div>

      {/* Departments Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200/80 bg-slate-50/75 text-slate-500 font-bold uppercase tracking-wider">
                <th className="py-3.5 px-4">Code</th>
                <th className="py-3.5 px-4">Department Name</th>
                <th className="py-3.5 px-4">Description / Scope</th>
                <th className="py-3.5 px-4">Personnel</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-[#101B32]">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="w-6 h-6 border-2 border-[#0084CC] border-t-transparent rounded-full animate-spin" />
                      <span>Loading organizational departments...</span>
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Building className="w-8 h-8 text-slate-300" />
                      <span className="font-semibold text-slate-600">No departments found</span>
                      <span className="text-xs text-slate-400">
                        Try clearing search query or add a new department.
                      </span>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map(dept => (
                  <tr key={dept.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-md font-mono text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
                        {dept.code}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-xs text-[#101B32]">{dept.name}</div>
                      <div className="text-[11px] text-slate-400 font-mono">ID: #{dept.id}</div>
                    </td>
                    <td className="py-3.5 px-4 max-w-xs">
                      <p className="text-xs text-slate-600 truncate">
                        {dept.description || <span className="text-slate-300 italic">No description provided</span>}
                      </p>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-sky-50 text-[#0084CC] font-semibold text-xs border border-sky-100">
                        <Users className="w-3.5 h-3.5" />
                        <span>{dept.employee_count ?? 0}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      {isDeptActive(dept) ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                          Disabled
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleToggleStatus(dept)}
                          className={`p-1.5 rounded-lg border transition-colors ${
                            isDeptActive(dept)
                              ? 'border-slate-200 text-slate-500 hover:text-amber-600 hover:bg-amber-50'
                              : 'border-slate-200 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50'
                          }`}
                          title={isDeptActive(dept) ? 'Disable department' : 'Enable department'}
                        >
                          <Power className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => openEditModal(dept)}
                          className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-[#0084CC] hover:bg-sky-50 transition-colors"
                          title="Edit department"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => openDeleteModal(dept)}
                          className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                          title="Delete department"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CREATE MODAL */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-sky-50 text-[#0084CC] flex items-center justify-center font-bold">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-[#101B32]">Create Department</h3>
                  <p className="text-[11px] text-slate-400">Add an organizational business unit</p>
                </div>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Department Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Operations & Logistics"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0084CC]/20 focus:border-[#0084CC]"
                />
                {formErrors.name && (
                  <p className="text-[11px] text-rose-500 mt-1">{formErrors.name}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Department Code <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. OPS or LOG_OPS"
                  value={formData.code}
                  onChange={e => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                  className="w-full px-3.5 py-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0084CC]/20 focus:border-[#0084CC]"
                />
                {formErrors.code && (
                  <p className="text-[11px] text-rose-500 mt-1">{formErrors.code}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Description / Operational Scope
                </label>
                <textarea
                  rows={3}
                  placeholder="Outline responsibilities and organizational mandate..."
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0084CC]/20 focus:border-[#0084CC]"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="create_is_active"
                  checked={formData.is_active}
                  onChange={e => setFormData({ ...formData, is_active: e.target.checked })}
                  className="w-4 h-4 rounded text-[#0084CC] focus:ring-[#0084CC] border-slate-300"
                />
                <label htmlFor="create_is_active" className="text-xs font-semibold text-slate-700 cursor-pointer">
                  Activate department immediately for user assignment
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-[#0084CC] hover:bg-[#0074b4] rounded-xl shadow-xs transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? 'Creating...' : 'Create Department'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT MODAL */}
      {isEditModalOpen && activeDept && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-sky-50 text-[#0084CC] flex items-center justify-center font-bold">
                  <Edit2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-[#101B32]">Edit Department</h3>
                  <p className="text-[11px] text-slate-400">Modify {activeDept.name} attributes</p>
                </div>
              </div>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Department Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0084CC]/20 focus:border-[#0084CC]"
                />
                {formErrors.name && (
                  <p className="text-[11px] text-rose-500 mt-1">{formErrors.name}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Department Code <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.code}
                  onChange={e => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                  className="w-full px-3.5 py-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0084CC]/20 focus:border-[#0084CC]"
                />
                {formErrors.code && (
                  <p className="text-[11px] text-rose-500 mt-1">{formErrors.code}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Description / Operational Scope
                </label>
                <textarea
                  rows={3}
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0084CC]/20 focus:border-[#0084CC]"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="edit_is_active"
                  checked={formData.is_active}
                  onChange={e => setFormData({ ...formData, is_active: e.target.checked })}
                  className="w-4 h-4 rounded text-[#0084CC] focus:ring-[#0084CC] border-slate-300"
                />
                <label htmlFor="edit_is_active" className="text-xs font-semibold text-slate-700 cursor-pointer">
                  Active Department Status
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-[#0084CC] hover:bg-[#0074b4] rounded-xl shadow-xs transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE SAFEGUARD MODAL */}
      {isDeleteModalOpen && activeDept && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6">
              <div className="flex items-start gap-4">
                <div
                  className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
                    (activeDept.employee_count || 0) > 0
                      ? 'bg-amber-50 text-amber-600'
                      : 'bg-rose-50 text-rose-600'
                  }`}
                >
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#101B32]">
                    {(activeDept.employee_count || 0) > 0
                      ? 'Deletion Blocked: Assigned Personnel'
                      : `Delete Department "${activeDept.name}"?`}
                  </h3>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    {(activeDept.employee_count || 0) > 0 ? (
                      <>
                        Cannot delete <strong className="text-slate-800">{activeDept.name}</strong> ({activeDept.code}) because{' '}
                        <strong className="text-[#0084CC]">{activeDept.employee_count} active user(s)</strong> are currently assigned to this department. Please reassign those users in User Management before deleting this department.
                      </>
                    ) : (
                      <>
                        Are you sure you want to permanently delete <strong className="text-slate-800">{activeDept.name}</strong> ({activeDept.code})? This action cannot be undone.
                      </>
                    )}
                  </p>
                </div>
              </div>

              {(activeDept.employee_count || 0) > 0 ? (
                <div className="mt-5 p-3 rounded-xl bg-amber-50 border border-amber-200/80 text-xs text-amber-800 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Enterprise safeguard protects relational integrity.</span>
                </div>
              ) : null}

              <div className="mt-6 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsDeleteModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  {(activeDept.employee_count || 0) > 0 ? 'Close' : 'Cancel'}
                </button>
                {(activeDept.employee_count || 0) === 0 && (
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={isSubmitting}
                    className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-xs transition-colors disabled:opacity-50"
                  >
                    {isSubmitting ? 'Deleting...' : 'Delete Department'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
