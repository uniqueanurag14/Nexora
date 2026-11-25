import React, { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft,
  UserCheck,
  UserPlus,
  Users,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  Building,
  Briefcase,
  ShieldAlert,
  Clock,
  Sparkles,
  ToggleLeft,
  ToggleRight,
  RefreshCw,
  Info,
} from 'lucide-react';
import { PerformanceRosterEmployee } from '../types';
import { api } from '../services/api';

interface EmployeeRegistrationPageProps {
  onNavigate: (route: string) => void;
}

const DEFAULT_DEPARTMENTS = [
  'Operations',
  'Assembly',
  'Packaging',
  'Quality Control',
  'Logistics',
  'Maintenance',
  'Engineering',
];

export const EmployeeRegistrationPage: React.FC<EmployeeRegistrationPageProps> = ({ onNavigate }) => {
  const [employees, setEmployees] = useState<PerformanceRosterEmployee[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [deptFilter, setDeptFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Form State
  const [empId, setEmpId] = useState<string>('');
  const [firstName, setFirstName] = useState<string>('');
  const [lastName, setLastName] = useState<string>('');
  const [department, setDepartment] = useState<string>('Operations');
  const [customDept, setCustomDept] = useState<string>('');
  const [designation, setDesignation] = useState<string>('Machine Operator');
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Load roster
  const fetchRoster = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await api.getPerformanceRoster();
      if (res.success && res.data) {
        setEmployees(res.data);
      }
    } catch (err: any) {
      console.error('Failed to load performance roster:', err);
      setFeedback({ type: 'error', message: 'Unable to connect to database to load roster.' });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRoster();
  }, [fetchRoster]);

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};
    if (!empId.trim()) {
      errors.emp_id = 'Employee ID is required (e.g. EMP-001).';
    } else if (employees.some(e => e.emp_id.toLowerCase() === empId.trim().toLowerCase())) {
      errors.emp_id = `Employee ID "${empId.trim().toUpperCase()}" is already registered.`;
    }

    if (!firstName.trim()) {
      errors.first_name = 'First name is required.';
    }
    if (!lastName.trim()) {
      errors.last_name = 'Last name is required.';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    if (!validateForm()) return;

    setIsSubmitting(true);
    const finalDept = department === 'Other' ? customDept.trim() || 'Operations' : department;

    try {
      const res = await api.registerPerformanceEmployee({
        emp_id: empId.trim().toUpperCase(),
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        department: finalDept,
        designation: designation.trim() || 'Staff',
      });

      if (res.success && res.data) {
        setFeedback({
          type: 'success',
          message: `Employee "${res.data.name}" (${res.data.emp_id}) registered successfully in Performance Roster.`,
        });
        // Reset form
        setEmpId('');
        setFirstName('');
        setLastName('');
        setDesignation('Machine Operator');
        setDepartment('Operations');
        setCustomDept('');
        setFormErrors({});

        // Refresh list
        fetchRoster();
      } else {
        setFeedback({
          type: 'error',
          message: res.message || 'Failed to register employee in roster.',
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Network error during registration.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleStatus = async (employee: PerformanceRosterEmployee) => {
    const nextStatus = !employee.is_active;
    try {
      const res = await api.updatePerformanceEmployee(employee.id, {
        is_active: nextStatus,
      });

      if (res.success) {
        setEmployees(prev =>
          prev.map(e => (e.id === employee.id ? { ...e, is_active: nextStatus } : e))
        );
        setFeedback({
          type: 'success',
          message: `${employee.name} (${employee.emp_id}) is now ${nextStatus ? 'Active' : 'Deactivated'}. Performance history preserved.`,
        });
      } else {
        setFeedback({ type: 'error', message: res.message || 'Status update failed.' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to update status.' });
    }
  };

  // Filtered employees
  const filteredEmployees = employees.filter(emp => {
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      emp.name.toLowerCase().includes(q) ||
      emp.emp_id.toLowerCase().includes(q) ||
      (emp.department && emp.department.toLowerCase().includes(q)) ||
      (emp.designation && emp.designation.toLowerCase().includes(q));

    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && emp.is_active) ||
      (statusFilter === 'inactive' && !emp.is_active);

    const matchesDept =
      deptFilter === 'all' ||
      (emp.department && emp.department.toLowerCase() === deptFilter.toLowerCase());

    return matchesSearch && matchesStatus && matchesDept;
  });

  const uniqueDepartments = Array.from(new Set(employees.map(e => e.department).filter(Boolean)));

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Top Header & Breadcrumbs */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => onNavigate('/dashboard')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-300 text-slate-700 bg-white hover:bg-slate-100 hover:text-slate-900 font-semibold text-xs transition-colors shadow-2xs focus:outline-none focus:ring-2 focus:ring-sky-500"
              title="Return to main dashboard"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Dashboard</span>
            </button>

            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-sky-100 text-sky-800 border border-sky-200">
                Workforce & Monitoring
              </span>
              <span className="text-slate-300">•</span>
              <span className="text-xs font-semibold text-slate-500">
                Toy BiZ ltd
              </span>
            </div>
          </div>

          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight mt-2 flex items-center gap-2.5">
            <UserCheck className="w-6 h-6 text-sky-600" />
            <span>Performance Employee Registration</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Maintain the dedicated shop-floor performance roster. Register personnel, manage operational status, and monitor workforce readiness.
          </p>
        </div>

        {/* Quick Nav to Live Performance */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => onNavigate('/workforce/performance/live')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs shadow-2xs transition-colors cursor-pointer"
          >
            <span>View Live Performance</span>
          </button>
        </div>
      </div>

      {/* Global Feedback Banner */}
      {feedback && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between gap-3 text-xs animate-in slide-in-from-top-2 duration-150 ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span className="font-semibold">{feedback.message}</span>
          </div>
          <button
            onClick={() => setFeedback(null)}
            className="text-xs font-bold px-2 py-0.5 rounded hover:bg-black/5 transition-colors"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Two Column Layout: Registration Form & Roster Table */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Registration Card (5 Cols) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="px-6 py-4 bg-linear-to-r from-slate-900 via-slate-800 to-sky-950 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-sky-500/20 border border-sky-400/30 flex items-center justify-center text-sky-300">
                  <UserPlus className="w-4 h-4 text-sky-400" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-white">Register Performance Employee</h2>
                  <p className="text-[11px] text-slate-300">Add personnel to shop floor tracking roster</p>
                </div>
              </div>
            </div>

            <form onSubmit={handleRegister} className="p-6 space-y-4">
              {/* Employee ID */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Employee ID <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={empId}
                  onChange={e => setEmpId(e.target.value.toUpperCase())}
                  placeholder="e.g. EMP-001, OP-104"
                  className={`w-full px-3 py-2 rounded-xl border text-xs font-mono font-medium focus:outline-none focus:ring-2 focus:ring-sky-500 transition-colors uppercase ${
                    formErrors.emp_id ? 'border-rose-300 bg-rose-50/50' : 'border-slate-300 bg-slate-50/50'
                  }`}
                />
                {formErrors.emp_id && (
                  <p className="text-[11px] text-rose-600 mt-1 font-semibold">{formErrors.emp_id}</p>
                )}
                <p className="text-[10px] text-slate-500 mt-1">
                  Unique identifier used by hardware terminals and simulators.
                </p>
              </div>

              {/* First Name & Last Name */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    First Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={e => setFirstName(e.target.value)}
                    placeholder="e.g. Alex"
                    className={`w-full px-3 py-2 rounded-xl border text-xs font-medium focus:outline-none focus:ring-2 focus:ring-sky-500 transition-colors ${
                      formErrors.first_name ? 'border-rose-300 bg-rose-50/50' : 'border-slate-300 bg-slate-50/50'
                    }`}
                  />
                  {formErrors.first_name && (
                    <p className="text-[11px] text-rose-600 mt-1 font-semibold">{formErrors.first_name}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Last Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={e => setLastName(e.target.value)}
                    placeholder="e.g. Patel"
                    className={`w-full px-3 py-2 rounded-xl border text-xs font-medium focus:outline-none focus:ring-2 focus:ring-sky-500 transition-colors ${
                      formErrors.last_name ? 'border-rose-300 bg-rose-50/50' : 'border-slate-300 bg-slate-50/50'
                    }`}
                  />
                  {formErrors.last_name && (
                    <p className="text-[11px] text-rose-600 mt-1 font-semibold">{formErrors.last_name}</p>
                  )}
                </div>
              </div>

              {/* Department */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Department
                </label>
                <select
                  value={department}
                  onChange={e => setDepartment(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-slate-50/50 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500"
                >
                  {DEFAULT_DEPARTMENTS.map(d => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                  <option value="Other">Other (Custom Department)</option>
                </select>

                {department === 'Other' && (
                  <input
                    type="text"
                    value={customDept}
                    onChange={e => setCustomDept(e.target.value)}
                    placeholder="Enter department name"
                    className="mt-2 w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                )}
              </div>

              {/* Designation */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Designation / Role
                </label>
                <input
                  type="text"
                  value={designation}
                  onChange={e => setDesignation(e.target.value)}
                  placeholder="e.g. Machine Operator, Assembly Specialist"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-slate-50/50 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              {/* Architecture & Login Readiness Notice */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1 text-slate-600">
                <div className="flex items-center gap-1.5 font-bold text-[11px] text-slate-800">
                  <Info className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                  <span>Employee Login Readiness</span>
                </div>
                <p className="text-[11px] leading-relaxed">
                  Employee records are registered with <code className="text-slate-800 font-mono bg-slate-200/60 px-1 py-0.5 rounded">login_enabled: false</code> and null password hash. Floor workers do not require login credentials to record hardware work completion events.
                </p>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-2.5 px-4 rounded-xl font-bold text-xs bg-sky-600 hover:bg-sky-700 text-white shadow-xs hover:shadow-md transition-all cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2 active:scale-98"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Registering Employee...</span>
                  </>
                ) : (
                  <>
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>Register Employee to Roster</span>
                  </>
                )}
              </button>
            </form>
          </div>
        </div>

        {/* Right Column: Roster Directory & Management Table (7 Cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            {/* Header & Filter Controls */}
            <div className="p-4 border-b border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <span>Performance Roster Directory</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-mono font-bold">
                      {employees.length}
                    </span>
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    Personnel registered for work output tracking
                  </p>
                </div>

                <button
                  onClick={fetchRoster}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                  title="Refresh Roster"
                >
                  <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-sky-600' : ''}`} />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                {/* Search */}
                <div className="sm:col-span-6 relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search by name, ID, or role..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>

                {/* Status Filter */}
                <div className="sm:col-span-3">
                  <select
                    value={statusFilter}
                    onChange={e => setStatusFilter(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500 font-medium text-slate-700"
                  >
                    <option value="all">All Statuses</option>
                    <option value="active">Active Only</option>
                    <option value="inactive">Deactivated Only</option>
                  </select>
                </div>

                {/* Dept Filter */}
                <div className="sm:col-span-3">
                  <select
                    value={deptFilter}
                    onChange={e => setDeptFilter(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500 font-medium text-slate-700"
                  >
                    <option value="all">All Depts</option>
                    {uniqueDepartments.map(d => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Roster Table Content */}
            {isLoading ? (
              <div className="p-8 text-center text-slate-400 text-xs flex flex-col items-center gap-2">
                <RefreshCw className="w-5 h-5 animate-spin text-sky-600" />
                <span>Loading performance roster...</span>
              </div>
            ) : filteredEmployees.length === 0 ? (
              <div className="p-12 text-center">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 mx-auto mb-3">
                  <Users className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-bold text-slate-800">
                  {employees.length === 0 ? 'No Performance Employees Registered' : 'No Matching Employees Found'}
                </h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                  {employees.length === 0
                    ? 'Register your first workforce member using the form on the left to start recording shop floor performance events.'
                    : 'Adjust your search terms or filters to find personnel in the roster.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200 text-[11px] uppercase tracking-wider">
                      <th className="py-2.5 px-3">Emp ID</th>
                      <th className="py-2.5 px-3">Name & Role</th>
                      <th className="py-2.5 px-3">Department</th>
                      <th className="py-2.5 px-3 text-center">Events</th>
                      <th className="py-2.5 px-3 text-center">Status</th>
                      <th className="py-2.5 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredEmployees.map(emp => (
                      <tr key={emp.id} className="hover:bg-slate-50/80 transition-colors">
                        {/* ID */}
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                          <span className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-800 text-[11px]">
                            {emp.emp_id}
                          </span>
                        </td>

                        {/* Name & Designation */}
                        <td className="py-2.5 px-3">
                          <div className="font-bold text-slate-900">{emp.name}</div>
                          <div className="text-[11px] text-slate-500">{emp.designation || 'Staff'}</div>
                        </td>

                        {/* Dept */}
                        <td className="py-2.5 px-3 text-slate-700 font-medium">
                          {emp.department || 'Operations'}
                        </td>

                        {/* Event count */}
                        <td className="py-2.5 px-3 text-center">
                          <span className="font-mono font-bold text-slate-800">
                            {emp.total_events || 0}
                          </span>
                        </td>

                        {/* Status */}
                        <td className="py-2.5 px-3 text-center">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              emp.is_active
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-slate-100 text-slate-600 border border-slate-200'
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                emp.is_active ? 'bg-emerald-500' : 'bg-slate-400'
                              }`}
                            />
                            <span>{emp.is_active ? 'Active' : 'Inactive'}</span>
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="py-2.5 px-3 text-right">
                          <button
                            onClick={() => handleToggleStatus(emp)}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                              emp.is_active
                                ? 'bg-slate-100 hover:bg-rose-50 text-slate-700 hover:text-rose-700 border border-slate-200'
                                : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200'
                            }`}
                            title={
                              emp.is_active
                                ? 'Deactivate employee (preserves all historical work events)'
                                : 'Reactivate employee for work recording'
                            }
                          >
                            {emp.is_active ? 'Deactivate' : 'Activate'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
