import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  UserPlus,
  Search,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ArrowLeft,
  Users,
  Activity,
  ToggleLeft,
  ToggleRight,
  Building2,
  Briefcase,
  BadgeCheck,
  Cpu,
  Edit3,
  Lock,
  X,
} from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { SearchableSelect, type SearchableOption } from '../components/SearchableSelect';

interface PerformanceRosterEmployee {
  id: number;
  emp_id: string;
  employee_id: string;
  first_name: string;
  last_name: string;
  name: string;
  display_name: string;
  hardware_id: string;
  employee_type: 'full_time' | 'training' | 'third_party';
  employee_type_label: string;
  department_id: number | null;
  department: string;
  department_code?: string;
  role_id: number | null;
  role_name: string;
  role_code?: string;
  designation: string;
  is_active: boolean;
  total_events: number;
  last_event_timestamp: string | null;
  created_at: string;
}

interface EmployeeRegistrationPageProps {
  onNavigate?: (route: string) => void;
}

const EMPLOYEE_TYPE_OPTIONS: Array<{ value: 'full_time' | 'training' | 'third_party'; label: string }> = [
  { value: 'full_time', label: 'Full-time' },
  { value: 'training', label: 'Training' },
  { value: 'third_party', label: 'Third-party' },
];

const EMPLOYEE_TYPE_BADGE: Record<string, string> = {
  full_time: 'bg-sky-50 text-sky-700 border-sky-200',
  training: 'bg-amber-50 text-amber-700 border-amber-200',
  third_party: 'bg-violet-50 text-violet-700 border-violet-200',
};

export const EmployeeRegistrationPage: React.FC<EmployeeRegistrationPageProps> = ({ onNavigate }) => {
  const { notify } = useAuth();
  const [roster, setRoster] = useState<PerformanceRosterEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [departments, setDepartments] = useState<Array<{ id: number; code: string; name: string }>>([]);
  const [roles, setRoles] = useState<Array<{ id: number; code: string; name: string }>>([]);
  const [nextEmpIdPreview, setNextEmpIdPreview] = useState<string>('');

  // Search & filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'disabled'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'full_time' | 'training' | 'third_party'>('all');

  // Create / Edit Form State
  const [editingEmployee, setEditingEmployee] = useState<PerformanceRosterEmployee | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [hardwareId, setHardwareId] = useState('');
  const [employeeType, setEmployeeType] = useState<'full_time' | 'training' | 'third_party'>('full_time');
  const [departmentId, setDepartmentId] = useState<number | null>(null);
  const [roleId, setRoleId] = useState<number | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [togglingId, setTogglingId] = useState<number | null>(null);

  const departmentOptions: SearchableOption[] = useMemo(
    () => departments.map((d) => ({ value: d.id, label: d.name, sublabel: d.code })),
    [departments]
  );

  const roleOptions: SearchableOption[] = useMemo(
    () => roles.map((r) => ({ value: r.id, label: r.name, sublabel: r.code })),
    [roles]
  );

  const fetchRegistrationOptions = useCallback(async () => {
    setOptionsLoading(true);
    try {
      const [optRes, nextIdRes] = await Promise.all([
        api.getPerformanceRegistrationOptions(),
        api.getNextPerformanceEmployeeId(),
      ]);
      if (optRes.success && optRes.data) {
        setDepartments(optRes.data.departments || []);
        setRoles(optRes.data.roles || []);
      }
      if (nextIdRes.success && nextIdRes.data?.next_emp_id) {
        setNextEmpIdPreview(nextIdRes.data.next_emp_id);
      }
    } catch {
      notify('error', 'Failed to load active departments and roles from database.');
    } finally {
      setOptionsLoading(false);
    }
  }, [notify]);

  const fetchRoster = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getPerformanceRoster({
        search: searchQuery || undefined,
        status: statusFilter,
        employee_type: typeFilter === 'all' ? undefined : typeFilter,
      });
      if (res.success && Array.isArray(res.data)) {
        setRoster(res.data);
      } else {
        setRoster([]);
      }
    } catch {
      notify('error', 'Failed to load performance employee roster from PostgreSQL.');
      setRoster([]);
    } finally {
      setLoading(false);
    }
  }, [searchQuery, statusFilter, typeFilter, notify]);

  useEffect(() => {
    fetchRegistrationOptions();
  }, [fetchRegistrationOptions]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchRoster();
    }, 180);
    return () => clearTimeout(timer);
  }, [fetchRoster]);

  const resetForm = () => {
    setEditingEmployee(null);
    setFirstName('');
    setLastName('');
    setHardwareId('');
    setEmployeeType('full_time');
    setDepartmentId(null);
    setRoleId(null);
    setFieldErrors({});
  };

  const handleStartEdit = (emp: PerformanceRosterEmployee) => {
    setEditingEmployee(emp);
    setFirstName(emp.first_name || '');
    setLastName(emp.last_name || '');
    setHardwareId(emp.hardware_id || '');
    setEmployeeType(emp.employee_type || 'full_time');
    setDepartmentId(emp.department_id || null);
    setRoleId(emp.role_id || null);
    setFieldErrors({});
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    const errs: Record<string, string> = {};
    if (!firstName.trim()) errs.first_name = 'First name is required.';
    if (!lastName.trim()) errs.last_name = 'Last name is required.';
    if (!hardwareId.trim()) {
      errs.hardware_id = 'Hardware ID is required.';
    } else if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(hardwareId.trim())) {
      errs.hardware_id = 'Use letters, numbers, hyphens, underscores, dots, or colons only.';
    }
    if (!employeeType) errs.employee_type = 'Employee Type is required.';
    if (!departmentId) errs.department_id = 'Please select an active Department.';
    if (!roleId) errs.role_id = 'Please select an active Role.';

    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      return;
    }

    setFieldErrors({});
    setIsSubmitting(true);

    try {
      const payload = {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        hardware_id: hardwareId.trim().toUpperCase(),
        employee_type: employeeType,
        department_id: departmentId!,
        role_id: roleId!,
      };

      const res = editingEmployee
        ? await api.updatePerformanceEmployee(editingEmployee.id, payload)
        : await api.registerPerformanceEmployee(payload);

      if (res.success) {
        notify('success', res.message || (editingEmployee ? 'Employee updated.' : 'Employee registered.'));
        resetForm();
        await Promise.all([fetchRoster(), fetchRegistrationOptions()]);
      } else {
        if (Array.isArray(res.errors)) {
          const map: Record<string, string> = {};
          res.errors.forEach((er: any) => {
            if (er?.field) map[er.field] = er.message;
          });
          setFieldErrors(map);
        }
        notify('error', res.message || 'Operation failed. Please check the form.');
      }
    } catch (err: any) {
      notify('error', err?.message || 'Failed to save employee record.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleStatus = async (emp: PerformanceRosterEmployee) => {
    setTogglingId(emp.id);
    try {
      const res = await api.updatePerformanceEmployee(emp.id, { is_active: !emp.is_active });
      if (res.success) {
        notify(
          'success',
          `Employee ${emp.display_name} (${emp.emp_id}) ${!emp.is_active ? 'activated' : 'deactivated'}.`
        );
        fetchRoster();
      } else {
        notify('error', res.message || 'Failed to update employee status.');
      }
    } catch {
      notify('error', 'Error updating employee status.');
    } finally {
      setTogglingId(null);
    }
  };

  const activeCount = roster.filter((r) => r.is_active).length;
  const inactiveCount = roster.filter((r) => !r.is_active).length;

  return (
    <div className="space-y-6 pb-10">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center shrink-0">
              <UserPlus className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-sky-600 uppercase tracking-wider">
                  Performance Management
                </span>
                <span className="text-slate-300">•</span>
                <span className="text-xs text-slate-500 font-medium">
                  Hardware-Linked Workforce Registration
                </span>
              </div>
              <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 mt-0.5">
                Performance Employee Registration
              </h1>
              <p className="text-xs text-slate-500 mt-1">
                Register factory and production personnel with system-generated Employee IDs, unique Hardware IDs, Employee Types, and live Department &amp; Role bindings.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onNavigate && (
              <button
                onClick={() => onNavigate('/workforce/performance/live')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Live Monitor</span>
              </button>
            )}
            <button
              onClick={() => {
                fetchRoster();
                fetchRegistrationOptions();
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-slate-900 text-white hover:bg-slate-800 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Left: Registration / Edit Form */}
        <div className="xl:col-span-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs sticky top-6">
            <div className="flex items-center justify-between gap-2 pb-4 border-b border-slate-100 mb-5">
              <div className="flex items-center gap-2">
                {editingEmployee ? (
                  <Edit3 className="w-4 h-4 text-amber-600" />
                ) : (
                  <BadgeCheck className="w-4 h-4 text-sky-600" />
                )}
                <h2 className="text-sm font-bold text-slate-900">
                  {editingEmployee ? `Edit Employee (${editingEmployee.emp_id})` : 'Register Performance Employee'}
                </h2>
              </div>
              {editingEmployee && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-slate-800 px-2 py-1 rounded-lg hover:bg-slate-100"
                >
                  <X className="w-3 h-3" />
                  Cancel Edit
                </button>
              )}
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Auto-Generated Read-Only Employee ID */}
              <div>
                <label className="text-xs font-bold text-slate-700 flex items-center justify-between mb-1.5">
                  <span>Employee ID</span>
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-sky-700 bg-sky-50 border border-sky-200 px-1.5 py-0.5 rounded">
                    <Lock className="w-2.5 h-2.5" />
                    {editingEmployee ? 'Locked (Immutable)' : 'System Auto-Generated'}
                  </span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    readOnly
                    disabled
                    value={
                      editingEmployee
                        ? editingEmployee.emp_id
                        : nextEmpIdPreview
                        ? `${nextEmpIdPreview} (Auto-generated on save)`
                        : 'Auto-generated on save'
                    }
                    className="w-full px-3 py-2 text-xs font-mono font-bold bg-slate-100 text-slate-600 border border-slate-200 rounded-xl cursor-not-allowed select-none"
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  {editingEmployee
                    ? 'Employee ID cannot be edited after registration to preserve performance history.'
                    : 'Assigned automatically by PostgreSQL upon saving to guarantee uniqueness.'}
                </p>
              </div>

              {/* First & Last Name */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1.5">
                    First Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => {
                      setFirstName(e.target.value);
                      if (fieldErrors.first_name) setFieldErrors((prev) => ({ ...prev, first_name: '' }));
                    }}
                    placeholder="First name"
                    className={`w-full px-3 py-2 text-xs bg-slate-50/70 border rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20 ${
                      fieldErrors.first_name ? 'border-rose-400' : 'border-slate-200 focus:border-sky-500'
                    }`}
                  />
                  {fieldErrors.first_name && (
                    <p className="text-[11px] text-rose-600 mt-1">{fieldErrors.first_name}</p>
                  )}
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1.5">
                    Last Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => {
                      setLastName(e.target.value);
                      if (fieldErrors.last_name) setFieldErrors((prev) => ({ ...prev, last_name: '' }));
                    }}
                    placeholder="Last name"
                    className={`w-full px-3 py-2 text-xs bg-slate-50/70 border rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20 ${
                      fieldErrors.last_name ? 'border-rose-400' : 'border-slate-200 focus:border-sky-500'
                    }`}
                  />
                  {fieldErrors.last_name && (
                    <p className="text-[11px] text-rose-600 mt-1">{fieldErrors.last_name}</p>
                  )}
                </div>
              </div>

              {/* Hardware ID */}
              <div>
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5 mb-1.5">
                  <Cpu className="w-3.5 h-3.5 text-slate-400" />
                  <span>Hardware ID</span>
                  <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={hardwareId}
                  onChange={(e) => {
                    setHardwareId(e.target.value.toUpperCase());
                    if (fieldErrors.hardware_id) setFieldErrors((prev) => ({ ...prev, hardware_id: '' }));
                  }}
                  placeholder="e.g. HW-LINE1-001 or RFID-A4B2"
                  className={`w-full px-3 py-2 text-xs font-mono bg-slate-50/70 border rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20 ${
                    fieldErrors.hardware_id ? 'border-rose-400 bg-rose-50/30' : 'border-slate-200 focus:border-sky-500'
                  }`}
                />
                {fieldErrors.hardware_id ? (
                  <p className="text-[11px] text-rose-600 mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3 shrink-0" />
                    <span>{fieldErrors.hardware_id}</span>
                  </p>
                ) : (
                  <p className="text-[11px] text-slate-400 mt-1">
                    Unique identifier linking this employee to their hardware performance device.
                  </p>
                )}
              </div>

              {/* Employee Type */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">
                  Employee Type <span className="text-rose-500">*</span>
                </label>
                <select
                  value={employeeType}
                  onChange={(e) => {
                    setEmployeeType(e.target.value as 'full_time' | 'training' | 'third_party');
                    if (fieldErrors.employee_type) setFieldErrors((prev) => ({ ...prev, employee_type: '' }));
                  }}
                  className={`w-full px-3 py-2 text-xs bg-slate-50/70 border rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20 ${
                    fieldErrors.employee_type ? 'border-rose-400' : 'border-slate-200 focus:border-sky-500'
                  }`}
                >
                  {EMPLOYEE_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                {fieldErrors.employee_type && (
                  <p className="text-[11px] text-rose-600 mt-1">{fieldErrors.employee_type}</p>
                )}
              </div>

              {/* Department Searchable Dropdown */}
              <div>
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5 mb-1.5">
                  <Building2 className="w-3.5 h-3.5 text-slate-400" />
                  <span>Department</span>
                  <span className="text-rose-500">*</span>
                </label>
                <SearchableSelect
                  value={departmentId}
                  onChange={(val) => {
                    setDepartmentId(val ? Number(val) : null);
                    if (fieldErrors.department_id) setFieldErrors((prev) => ({ ...prev, department_id: '' }));
                  }}
                  options={departmentOptions}
                  loading={optionsLoading}
                  placeholder="Select active department..."
                  searchPlaceholder="Search departments..."
                  emptyMessage="No active departments available. Create one in Department Management."
                  error={fieldErrors.department_id}
                />
              </div>

              {/* Role Searchable Dropdown */}
              <div>
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5 mb-1.5">
                  <Briefcase className="w-3.5 h-3.5 text-slate-400" />
                  <span>Role</span>
                  <span className="text-rose-500">*</span>
                </label>
                <SearchableSelect
                  value={roleId}
                  onChange={(val) => {
                    setRoleId(val ? Number(val) : null);
                    if (fieldErrors.role_id) setFieldErrors((prev) => ({ ...prev, role_id: '' }));
                  }}
                  options={roleOptions}
                  loading={optionsLoading}
                  placeholder="Select active role..."
                  searchPlaceholder="Search roles..."
                  emptyMessage="No active roles available. Create one in Role Management."
                  error={fieldErrors.role_id}
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold text-white shadow-xs transition-all flex items-center justify-center gap-2 disabled:opacity-60 ${
                  editingEmployee
                    ? 'bg-amber-600 hover:bg-amber-700'
                    : 'bg-sky-600 hover:bg-sky-700'
                }`}
              >
                {isSubmitting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>{editingEmployee ? 'Saving Changes...' : 'Registering Employee...'}</span>
                  </>
                ) : (
                  <>
                    {editingEmployee ? <Edit3 className="w-3.5 h-3.5" /> : <UserPlus className="w-3.5 h-3.5" />}
                    <span>{editingEmployee ? 'Save Employee Changes' : 'Register Performance Employee'}</span>
                  </>
                )}
              </button>
            </form>
          </div>
        </div>

        {/* Right: Roster Table */}
        <div className="xl:col-span-8 space-y-4">
          {/* KPI Summary Strip */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
              <div className="flex items-center justify-between text-slate-400 mb-1">
                <span className="text-[11px] font-bold uppercase tracking-wider">Registered</span>
                <Users className="w-4 h-4 text-sky-600" />
              </div>
              <div className="text-2xl font-black text-slate-900">{roster.length}</div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
              <div className="flex items-center justify-between text-slate-400 mb-1">
                <span className="text-[11px] font-bold uppercase tracking-wider">Active</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="text-2xl font-black text-emerald-700">{activeCount}</div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
              <div className="flex items-center justify-between text-slate-400 mb-1">
                <span className="text-[11px] font-bold uppercase tracking-wider">Inactive</span>
                <XCircle className="w-4 h-4 text-slate-400" />
              </div>
              <div className="text-2xl font-black text-slate-600">{inactiveCount}</div>
            </div>
          </div>

          {/* Search & Filter Bar */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by Employee ID, name, Hardware ID, department, or role..."
                className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:border-sky-500"
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as any)}
                className="px-3 py-2 text-xs font-medium bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none"
              >
                <option value="all">All Types</option>
                {EMPLOYEE_TYPE_OPTIONS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="px-3 py-2 text-xs font-medium bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none"
              >
                <option value="all">All Status</option>
                <option value="active">Active Only</option>
                <option value="disabled">Inactive Only</option>
              </select>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="py-3 px-4">Employee</th>
                    <th className="py-3 px-4">Hardware ID</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4">Department &amp; Role</th>
                    <th className="py-3 px-4 text-center">Events</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400">
                        <div className="flex flex-col items-center gap-2">
                          <div className="w-6 h-6 border-2 border-sky-600 border-t-transparent rounded-full animate-spin" />
                          <span>Loading registered employees...</span>
                        </div>
                      </td>
                    </tr>
                  ) : roster.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-14 text-center text-slate-400">
                        <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                        <p className="font-semibold text-slate-600">No performance employees registered yet</p>
                        <p className="text-[11px] text-slate-400 mt-1">
                          Use the registration form to add an employee with an auto-generated Employee ID.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    roster.map((emp) => (
                      <tr
                        key={emp.id}
                        className={`hover:bg-slate-50/70 transition-colors ${
                          editingEmployee?.id === emp.id ? 'bg-amber-50/50' : ''
                        }`}
                      >
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900">{emp.display_name}</div>
                          <div className="text-[11px] font-mono text-sky-700 font-semibold">{emp.emp_id}</div>
                        </td>
                        <td className="py-3 px-4">
                          {emp.hardware_id ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 border border-slate-200 font-mono text-[11px] font-semibold text-slate-800">
                              <Cpu className="w-3 h-3 text-slate-500" />
                              {emp.hardware_id}
                            </span>
                          ) : (
                            <span className="text-slate-400 italic">Unassigned</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex px-2 py-0.5 rounded-md border text-[10px] font-bold ${
                              EMPLOYEE_TYPE_BADGE[emp.employee_type] || 'bg-slate-100 text-slate-700 border-slate-200'
                            }`}
                          >
                            {emp.employee_type_label || 'Full-time'}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium text-slate-800">{emp.department || '—'}</div>
                          <div className="text-[11px] text-slate-500">{emp.role_name || emp.designation || '—'}</div>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className="inline-flex items-center gap-1 font-mono font-bold text-slate-700">
                            <Activity className="w-3 h-3 text-sky-500" />
                            {emp.total_events || 0}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          {emp.is_active ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                              Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                              Inactive
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleStartEdit(emp)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 text-[11px] font-semibold transition-colors"
                            >
                              <Edit3 className="w-3 h-3" />
                              Edit
                            </button>
                            <button
                              type="button"
                              disabled={togglingId === emp.id}
                              onClick={() => handleToggleStatus(emp)}
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-colors ${
                                emp.is_active
                                  ? 'border-rose-200 text-rose-700 hover:bg-rose-50'
                                  : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                              }`}
                            >
                              {emp.is_active ? (
                                <>
                                  <ToggleRight className="w-3.5 h-3.5" />
                                  Deactivate
                                </>
                              ) : (
                                <>
                                  <ToggleLeft className="w-3.5 h-3.5" />
                                  Activate
                                </>
                              )}
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
        </div>
      </div>
    </div>
  );
};
