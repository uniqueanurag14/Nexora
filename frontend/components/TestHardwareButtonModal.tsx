import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { PerformanceEmployee, WorkCompletionEvent } from '../types';
import {
  X,
  Cpu,
  Search,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ShieldCheck,
  Zap,
  Building2,
  Radio,
} from 'lucide-react';

interface EmployeeWithCount extends PerformanceEmployee {
  current_count: number;
}

interface TestHardwareButtonModalProps {
  isOpen: boolean;
  onClose: () => void;
  onEventSimulated?: (event: WorkCompletionEvent) => void;
}

export const TestHardwareButtonModal: React.FC<TestHardwareButtonModalProps> = ({
  isOpen,
  onClose,
  onEventSimulated,
}) => {
  const [employees, setEmployees] = useState<EmployeeWithCount[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [simulatingId, setSimulatingId] = useState<number | null>(null);
  const [successEvent, setSuccessEvent] = useState<WorkCompletionEvent | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmPendingId, setConfirmPendingId] = useState<number | null>(null);
  const [requireConfirm, setRequireConfirm] = useState(true);

  // Close on Escape key press (Requirement 4.7)
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    },
    [isOpen, onClose]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Load real employees and their current counts from the database
  const loadEmployeesAndCounts = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      // 1. Fetch real employees
      const empRes = await api.getPerformanceEmployees();
      if (!empRes.success || !empRes.data) {
        setErrorMessage(empRes.message || 'Failed to load employee directory.');
        setIsLoading(false);
        return;
      }

      // 2. Fetch live counts to display current event count for each employee
      const liveRes = await api.getPerformanceLive();
      const countMap: Record<number, number> = {};
      if (liveRes.success && liveRes.data?.employee_stats) {
        liveRes.data.employee_stats.forEach(stat => {
          countMap[stat.employee_id] = stat.today_units;
        });
      }

      const merged: EmployeeWithCount[] = empRes.data.map(emp => ({
        ...emp,
        current_count: countMap[emp.id] || 0,
      }));

      setEmployees(merged);
    } catch (err: any) {
      setErrorMessage(err.message || 'Network error connecting to backend.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadEmployeesAndCounts();
      setSuccessEvent(null);
      setErrorMessage(null);
      setConfirmPendingId(null);
    }
  }, [isOpen, loadEmployeesAndCounts]);

  if (!isOpen) return null;

  const filteredEmployees = employees.filter(emp => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      emp.name.toLowerCase().includes(q) ||
      emp.employee_code.toLowerCase().includes(q) ||
      emp.department.toLowerCase().includes(q) ||
      emp.email.toLowerCase().includes(q)
    );
  });

  // Execute hardware button press simulation for a specific employee
  const executeSimulation = async (emp: EmployeeWithCount) => {
    setSimulatingId(emp.id);
    setErrorMessage(null);
    setSuccessEvent(null);
    setConfirmPendingId(null);

    try {
      const res = await api.simulateWorkCompletion({
        employee_id: emp.id,
        units_completed: 1,
        notes: `Simulated workstation button press for ${emp.name}`,
        workstation_name: `Virtual Test Terminal (${emp.department || 'Workstation'})`,
      });

      if (res.success && res.data) {
        setSuccessEvent(res.data);

        // Increment count locally for instantaneous feedback
        setEmployees(prev =>
          prev.map(e => (e.id === emp.id ? { ...e, current_count: e.current_count + 1 } : e))
        );

        if (onEventSimulated) {
          onEventSimulated(res.data);
        }
      } else {
        setErrorMessage(res.message || 'Failed to record work-completion event.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Server error recording simulated event.');
    } finally {
      setSimulatingId(null);
    }
  };

  const handleTestButtonClick = (emp: EmployeeWithCount) => {
    if (requireConfirm) {
      setConfirmPendingId(emp.id);
    } else {
      executeSimulation(emp);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="test-button-title"
    >
      <div className="w-full max-w-3xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/90">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-100 border border-sky-200 flex items-center justify-center text-sky-700 shadow-2xs shrink-0">
              <Cpu className="w-5 h-5 text-sky-700" />
            </div>
            <div>
              <h2 id="test-button-title" className="text-base font-bold text-slate-900">
                Test Hardware Button
              </h2>
              <p className="text-xs text-slate-500">
                Simulate workstation button-press event per employee (Recorded as{' '}
                <span className="font-semibold text-amber-700">SIMULATED</span>)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500"
            title="Close dialog (Escape)"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Notice & Controls Bar */}
        <div className="px-6 py-3 bg-amber-50/70 border-b border-amber-200/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-900">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              <strong>Hardware Simulation Mode:</strong> Each test click records exactly 1 completed unit for the selected employee.
            </span>
          </div>

          <label className="inline-flex items-center gap-2 cursor-pointer select-none text-[11px] font-medium text-slate-600">
            <input
              type="checkbox"
              checked={requireConfirm}
              onChange={e => setRequireConfirm(e.target.checked)}
              className="rounded border-slate-300 text-sky-600 focus:ring-sky-500 w-3.5 h-3.5"
            />
            <span>Safeguard confirmation</span>
          </label>
        </div>

        {/* Notifications Area */}
        <div className="px-6 pt-4 space-y-3">
          {successEvent && (
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-950 text-xs flex items-start gap-3 animate-in fade-in duration-150">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div className="space-y-1 flex-1">
                <div className="font-bold text-emerald-900 text-sm">
                  Work-Completion Event Recorded!
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-slate-700 text-[11px]">
                  <div>
                    <span className="text-slate-400">Employee:</span>{' '}
                    <span className="font-semibold text-slate-900">{successEvent.employee_name}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">ID:</span>{' '}
                    <span className="font-mono font-medium text-slate-900">{successEvent.employee_code}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Units:</span>{' '}
                    <span className="font-bold text-emerald-700">+{successEvent.units_completed} unit</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Source:</span>{' '}
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                      {successEvent.event_source}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {errorMessage && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2 animate-in fade-in duration-150">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Search Input */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search employee by name, ID (e.g. EMP-0001), department, or email..."
              className="w-full pl-10 pr-4 py-2.5 text-xs bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition-colors shadow-2xs"
            />
          </div>
        </div>

        {/* Scrollable Employee Table (Requirement 4 display format: Employee ID | Employee Name | Current Count | Test Button) */}
        <div className="px-6 py-4 flex-1 overflow-y-auto min-h-[220px]">
          {isLoading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3 text-slate-500 text-xs">
              <Loader2 className="w-6 h-6 animate-spin text-sky-600" />
              <span>Loading registered employees from database...</span>
            </div>
          ) : filteredEmployees.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-xs border border-dashed border-slate-200 rounded-xl">
              {searchQuery ? (
                <span>No employees matching "{searchQuery}".</span>
              ) : (
                <span>No employees available in the database.</span>
              )}
            </div>
          ) : (
            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-4">Employee ID</th>
                    <th className="py-3 px-4">Employee Name</th>
                    <th className="py-3 px-4 text-center">Current Count</th>
                    <th className="py-3 px-4 text-right">Test Button</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {filteredEmployees.map(emp => {
                    const isSimulating = simulatingId === emp.id;
                    const isPendingConfirm = confirmPendingId === emp.id;

                    return (
                      <tr
                        key={emp.id}
                        className={`transition-colors ${
                          isPendingConfirm
                            ? 'bg-amber-50/60'
                            : isSimulating
                            ? 'bg-sky-50/60'
                            : 'hover:bg-slate-50/70'
                        }`}
                      >
                        {/* Employee ID */}
                        <td className="py-3 px-4 font-mono font-medium text-slate-700 whitespace-nowrap">
                          {emp.employee_code}
                        </td>

                        {/* Employee Name & Dept */}
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-900">{emp.name}</div>
                          <div className="text-[10px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                            <Building2 className="w-3 h-3 text-slate-400" />
                            <span>{emp.department || '—'}</span>
                          </div>
                        </td>

                        {/* Current Work Completion Count */}
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-800 border border-slate-200">
                            {emp.current_count}
                          </span>
                        </td>

                        {/* Separate Test Button for each employee */}
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          {isPendingConfirm ? (
                            <div className="inline-flex items-center gap-2 animate-in fade-in duration-100">
                              <span className="text-[10px] font-semibold text-amber-800">
                                Confirm 1 unit?
                              </span>
                              <button
                                type="button"
                                disabled={isSimulating}
                                onClick={() => executeSimulation(emp)}
                                className="px-2.5 py-1 text-[11px] font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-md shadow-2xs transition-colors"
                              >
                                {isSimulating ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  'Confirm'
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmPendingId(null)}
                                className="px-2 py-1 text-[11px] font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-md"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              disabled={isSimulating || simulatingId !== null}
                              onClick={() => handleTestButtonClick(emp)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 active:bg-sky-800 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-2xs transition-all focus:outline-none focus:ring-2 focus:ring-sky-500"
                              title={`Simulate workstation button press for ${emp.name}`}
                            >
                              {isSimulating ? (
                                <>
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  <span>Recording...</span>
                                </>
                              ) : (
                                <>
                                  <Zap className="w-3.5 h-3.5 text-sky-200 fill-sky-200" />
                                  <span>Test Button</span>
                                </>
                              )}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
          <div>
            Showing <span className="font-semibold text-slate-800">{filteredEmployees.length}</span> of{' '}
            <span className="font-semibold text-slate-800">{employees.length}</span> active employees
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 hover:text-slate-900 transition-colors shadow-2xs"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
