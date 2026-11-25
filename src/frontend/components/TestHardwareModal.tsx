import React, { useState } from 'react';
import {
  X,
  Search,
  Zap,
  CheckCircle2,
  AlertCircle,
  Cpu,
  Clock,
  Building,
  User,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';
import { PerformanceEmployee } from '../types';
import { api } from '../services/api';

interface TestHardwareModalProps {
  isOpen: boolean;
  onClose: () => void;
  employees: PerformanceEmployee[];
  onEventSuccess?: (employeeId: number) => void;
}

export const TestHardwareModal: React.FC<TestHardwareModalProps> = ({
  isOpen,
  onClose,
  employees,
  onEventSuccess,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [submittingId, setSubmittingId] = useState<number | null>(null);
  const [successAlert, setSuccessAlert] = useState<{
    employeeName: string;
    employeeId: string;
    timestamp: string;
    id: number;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  // Extract unique departments from existing real employees
  const departments = Array.from(new Set(employees.map(e => e.department).filter(Boolean)));

  const filteredEmployees = employees.filter(emp => {
    const displayName = emp.display_name || emp.name || `${emp.first_name || ''} ${emp.last_name || ''}`.trim();
    const empIdStr = emp.emp_id || emp.employee_id || `EMP-${emp.id}`;
    const emailStr = emp.email || '';
    const q = searchQuery.toLowerCase();

    const matchesSearch =
      displayName.toLowerCase().includes(q) ||
      empIdStr.toLowerCase().includes(q) ||
      emailStr.toLowerCase().includes(q);
    const matchesDept = departmentFilter === 'all' || emp.department === departmentFilter;
    return matchesSearch && matchesDept;
  });

  const handleSimulateEvent = async (emp: PerformanceEmployee) => {
    setSubmittingId(emp.id);
    setErrorMessage(null);

    // Unique idempotency key to prevent accidental duplicate clicks
    const idempotencyKey = `sim_${emp.id}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    try {
      const res = await api.simulatePerformanceEvent({
        employee_id: emp.id,
        emp_id: emp.emp_id || emp.employee_id,
        idempotency_key: idempotencyKey,
        notes: `Simulated event triggered from Test Hardware Modal for ${emp.name}`,
      });

      if (res.success && res.data) {
        setSuccessAlert({
          employeeName: emp.name,
          employeeId: emp.employee_id,
          timestamp: new Date(res.data.event_timestamp).toLocaleTimeString(),
          id: res.data.id,
        });

        if (onEventSuccess) {
          onEventSuccess(emp.id);
        }
      } else {
        setErrorMessage(res.message || 'Failed to record simulated work event.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Communication error during event recording.');
    } finally {
      setSubmittingId(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4"
      aria-modal="true"
      role="dialog"
      aria-labelledby="test-modal-title"
    >
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-4xl w-full border border-slate-200 overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in-50 zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-linear-to-r from-slate-900 via-slate-800 to-indigo-950 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300">
              <Cpu className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 id="test-modal-title" className="text-base font-bold text-white">
                  Hardware Test Terminal Simulation
                </h3>
                <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                  Simulation Only
                </span>
              </div>
              <p className="text-xs text-slate-300">
                Trigger work-completion events for actual database employees to test real-time monitoring and reordering.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-400"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Success Alert Banner */}
        {successAlert && (
          <div className="mx-6 mt-4 p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between gap-3 text-emerald-900 text-xs animate-in slide-in-from-top-2 duration-150">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <div>
                <span className="font-bold text-emerald-950">
                  Work Completion Recorded:
                </span>{' '}
                <span className="font-semibold">{successAlert.employeeName}</span> ({successAlert.employeeId}) at {successAlert.timestamp}. Event saved with status <span className="font-mono font-bold text-emerald-700">SIMULATED</span> in PostgreSQL.
              </div>
            </div>
            <button
              onClick={() => setSuccessAlert(null)}
              className="text-emerald-700 hover:text-emerald-900 text-xs font-semibold px-2 py-1 rounded hover:bg-emerald-100 transition-colors"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Error Alert Banner */}
        {errorMessage && (
          <div className="mx-6 mt-4 p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-center justify-between gap-3 text-rose-900 text-xs">
            <div className="flex items-center gap-2.5">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              className="text-rose-700 hover:text-rose-900 text-xs font-semibold px-2 py-1"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Search & Filter Bar */}
        <div className="p-4 sm:px-6 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shrink-0">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by employee name, employee ID, or email..."
              className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-300 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <Building className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={departmentFilter}
              onChange={e => setDepartmentFilter(e.target.value)}
              className="text-xs py-2 px-3 rounded-xl border border-slate-300 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">All Departments ({employees.length})</option>
              {departments.map(dept => (
                <option key={dept} value={dept}>
                  {dept} ({employees.filter(e => e.department === dept).length})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Employee List Table */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar">
          {filteredEmployees.length === 0 ? (
            <div className="py-12 text-center text-slate-500">
              <User className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-medium text-slate-700">No matching employees found</p>
              <p className="text-xs text-slate-400 mt-1">Try adjusting your search query or department filter.</p>
            </div>
          ) : (
            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100/90 text-slate-600 font-semibold border-b border-slate-200 uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="py-3 px-4">Employee ID</th>
                    <th className="py-3 px-4">Name & Department</th>
                    <th className="py-3 px-4 text-center">Today's Count</th>
                    <th className="py-3 px-4">Last Activity</th>
                    <th className="py-3 px-4 text-right">Test Trigger</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {filteredEmployees.map(emp => {
                    const isSubmitting = submittingId === emp.id;
                    const hasActivity = !!emp.last_event_timestamp;

                    return (
                      <tr
                        key={emp.id}
                        className="hover:bg-slate-50/80 transition-colors"
                      >
                        <td className="py-3 px-4 font-mono font-bold text-slate-700">
                          {emp.employee_id}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-900">{emp.name}</div>
                          <div className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-slate-400" />
                            <span>{emp.department}</span>
                            <span>•</span>
                            <span className="text-slate-400">{emp.email}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span
                            className={`inline-flex items-center justify-center px-2.5 py-1 rounded-full text-xs font-bold ${
                              emp.today_count > 0
                                ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                                : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {emp.today_count}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-600">
                          {hasActivity ? (
                            <div className="flex items-center gap-1.5">
                              <Clock className="w-3.5 h-3.5 text-slate-400" />
                              <span className="text-[11px]">
                                {new Date(emp.last_event_timestamp!).toLocaleTimeString()}
                              </span>
                              <span className="text-[9px] uppercase font-bold px-1.5 py-0.2 rounded bg-purple-50 text-purple-700 border border-purple-200">
                                {emp.last_event_source || 'SIMULATED'}
                              </span>
                            </div>
                          ) : (
                            <span className="text-[11px] text-slate-400 italic">No activity yet</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => handleSimulateEvent(emp)}
                            disabled={isSubmitting}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs shadow-xs transition-all ${
                              isSubmitting
                                ? 'bg-indigo-300 text-white cursor-wait'
                                : 'bg-linear-to-r from-indigo-600 to-indigo-700 text-white hover:from-indigo-500 hover:to-indigo-600 hover:shadow-md cursor-pointer active:scale-95'
                            }`}
                            title={`Simulate hardware work-completion event for ${emp.name}`}
                          >
                            {isSubmitting ? (
                              <>
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                <span>Recording...</span>
                              </>
                            ) : (
                              <>
                                <Zap className="w-3.5 h-3.5 text-amber-300" />
                                <span>Test Button</span>
                              </>
                            )}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Modal Footer Note */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-1.5 text-slate-600">
            <ShieldCheck className="w-4 h-4 text-indigo-500 shrink-0" />
            <span>
              All simulated events are flagged as <strong className="text-slate-800">SIMULATED</strong> and excluded from official audit reports by default.
            </span>
          </div>

          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 font-semibold text-xs transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
