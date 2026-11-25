import React, { useState, useEffect, useRef } from 'react';
import { api, getAuthToken } from '../services/api';
import { buildSseUrl } from '../config/apiConfig';
import {
  PerformanceLiveSummary,
  PerformanceReportResult,
  WorkCompletionEvent,
  PerformanceEmployee,
} from '../types';
import { TestHardwareButtonModal } from '../components/TestHardwareButtonModal';
import {
  Activity,
  BarChart2,
  Cpu,
  RefreshCw,
  Search,
  Filter,
  Download,
  Calendar,
  Building2,
  Users,
  CheckCircle2,
  AlertCircle,
  Radio,
  Clock,
  Layers,
  ArrowUpRight,
  TrendingUp,
  FileSpreadsheet,
  ChevronLeft,
  ChevronRight,
  Zap,
  ArrowLeft,
} from 'lucide-react';

interface PerformanceManagementPageProps {
  initialTab?: string;
  onNavigate?: (route: string) => void;
}

export const PerformanceManagementPage: React.FC<PerformanceManagementPageProps> = ({
  initialTab = '/workforce/performance/live',
  onNavigate,
}) => {
  const [activeTab, setActiveTab] = useState<'live' | 'reports'>(
    initialTab.includes('reports') ? 'reports' : 'live'
  );

  // Sync with initialTab changes
  useEffect(() => {
    setActiveTab(initialTab.includes('reports') ? 'reports' : 'live');
  }, [initialTab]);

  const handleTabChange = (tab: 'live' | 'reports') => {
    setActiveTab(tab);
    if (onNavigate) {
      onNavigate(tab === 'live' ? '/workforce/performance/live' : '/workforce/performance/reports');
    }
  };

  // ==========================================
  // LIVE PERFORMANCE STATE
  // ==========================================
  const [liveData, setLiveData] = useState<PerformanceLiveSummary | null>(null);
  const [isLiveLoading, setIsLiveLoading] = useState(true);
  const [liveSearch, setLiveSearch] = useState('');
  const [liveDept, setLiveDept] = useState('all');
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);
  const [sseConnected, setSseConnected] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(new Date());
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);

  // Quick simulate state for table row
  const [quickSimulatingId, setQuickSimulatingId] = useState<number | null>(null);

  // ==========================================
  // PERFORMANCE REPORTS STATE
  // ==========================================
  const [reportData, setReportData] = useState<PerformanceReportResult | null>(null);
  const [isReportLoading, setIsReportLoading] = useState(false);
  const [reportPeriod, setReportPeriod] = useState<'daily' | 'weekly' | 'monthly' | 'custom'>('daily');
  const [reportStartDate, setReportStartDate] = useState(
    new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)
  );
  const [reportEndDate, setReportEndDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [reportDept, setReportDept] = useState('all');
  const [reportEmployeeId, setReportEmployeeId] = useState<number | undefined>(undefined);
  // CRITICAL REQUIREMENT: Simulated test events MUST be excluded from official report totals by default
  const [includeSimulated, setIncludeSimulated] = useState<boolean>(false);
  const [reportPage, setReportPage] = useState(1);
  const [allEmployees, setAllEmployees] = useState<PerformanceEmployee[]>([]);

  // ==========================================
  // LOAD LIVE DATA
  // ==========================================
  const fetchLiveData = async (silent = false) => {
    if (!silent) setIsLiveLoading(true);
    try {
      const res = await api.getPerformanceLive({
        department: liveDept !== 'all' ? liveDept : undefined,
        search: liveSearch || undefined,
      });
      if (res.success && res.data) {
        setLiveData(res.data);
        setLastRefreshedAt(new Date());
      }
    } catch (err) {
      console.error('Failed to fetch live performance data:', err);
    } finally {
      if (!silent) setIsLiveLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'live') {
      fetchLiveData();
    }
  }, [activeTab, liveDept]);

  // Handle Live Search with debounce
  useEffect(() => {
    if (activeTab !== 'live') return;
    const timer = setTimeout(() => {
      fetchLiveData(true);
    }, 300);
    return () => clearTimeout(timer);
  }, [liveSearch]);

  // ==========================================
  // REAL-TIME SSE STREAM & POLLING FALLBACK
  // ==========================================
  useEffect(() => {
    let eventSource: EventSource | null = null;
    let pollInterval: NodeJS.Timeout | null = null;

    if (activeTab === 'live') {
      const token = getAuthToken();
      if (token) {
        try {
          const sseUrl = buildSseUrl('/events', token);
          eventSource = new EventSource(sseUrl);

          eventSource.onopen = () => {
            setSseConnected(true);
          };

          eventSource.onmessage = (e) => {
            try {
              const data = JSON.parse(e.data);
              if (data.type === 'WORK_COMPLETION' && data.event) {
                // Instantly update live activity
                fetchLiveData(true);
              }
            } catch (err) {
              console.error('SSE Message parse error:', err);
            }
          };

          eventSource.onerror = () => {
            setSseConnected(false);
            if (eventSource) {
              eventSource.close();
            }
          };
        } catch (err) {
          console.error('Failed to initialize SSE stream:', err);
          setSseConnected(false);
        }
      }

      // Polling fallback every 6 seconds to ensure fresh data
      pollInterval = setInterval(() => {
        fetchLiveData(true);
      }, 6000);
    }

    return () => {
      if (eventSource) eventSource.close();
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [activeTab, liveDept, liveSearch]);

  // ==========================================
  // LOAD REPORTS DATA
  // ==========================================
  const fetchReportData = async () => {
    setIsReportLoading(true);
    try {
      const res = await api.getPerformanceReports({
        period: reportPeriod,
        startDate: reportPeriod === 'custom' ? reportStartDate : undefined,
        endDate: reportPeriod === 'custom' ? reportEndDate : undefined,
        department: reportDept !== 'all' ? reportDept : undefined,
        employeeId: reportEmployeeId,
        includeSimulated: includeSimulated,
        page: reportPage,
        limit: 15,
      });

      if (res.success && res.data) {
        setReportData(res.data);
      }
    } catch (err) {
      console.error('Failed to fetch performance report:', err);
    } finally {
      setIsReportLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'reports') {
      fetchReportData();
    }
  }, [activeTab, reportPeriod, reportStartDate, reportEndDate, reportDept, reportEmployeeId, includeSimulated, reportPage]);

  // Load employee directory for dropdown filters
  useEffect(() => {
    const loadEmployees = async () => {
      try {
        const res = await api.getPerformanceEmployees();
        if (res.success && res.data) {
          setAllEmployees(res.data);
        }
      } catch (err) {
        console.error('Failed to load employee list:', err);
      }
    };
    loadEmployees();
  }, []);

  // Quick simulate helper
  const handleQuickSimulate = async (employeeId: number, employeeName: string) => {
    setQuickSimulatingId(employeeId);
    setActionSuccessMsg(null);
    try {
      const res = await api.simulateWorkCompletion({
        employee_id: employeeId,
        units_completed: 1,
        notes: 'Simulated from live employee table quick-action',
      });
      if (res.success && res.data) {
        setActionSuccessMsg(`Recorded 1 work event for ${employeeName}!`);
        setTimeout(() => setActionSuccessMsg(null), 4000);
        fetchLiveData(true);
      }
    } catch (err: any) {
      console.error('Quick simulate failed:', err);
    } finally {
      setQuickSimulatingId(null);
    }
  };

  // CSV Export trigger
  const handleExportCsv = () => {
    const token = getAuthToken();
    const sp = new URLSearchParams();
    sp.append('period', reportPeriod);
    if (reportPeriod === 'custom') {
      sp.append('startDate', reportStartDate);
      sp.append('endDate', reportEndDate);
    }
    if (reportDept !== 'all') sp.append('department', reportDept);
    if (reportEmployeeId) sp.append('employeeId', String(reportEmployeeId));
    sp.append('includeSimulated', String(includeSimulated));
    if (token) sp.append('token', token);

    window.location.href = `/api/performance/reports/export?${sp.toString()}`;
  };

  // Extract distinct departments
  const availableDepartments = Array.from(
    new Set(allEmployees.map(e => e.department).filter(Boolean))
  );

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Page Header with Prominent Back to Dashboard Button (Requirement 2 & 8) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div className="flex items-start sm:items-center gap-3">
          <button
            type="button"
            onClick={() => onNavigate ? onNavigate('/dashboard') : (window.location.href = '/dashboard')}
            className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 hover:text-slate-900 shadow-xs transition-colors flex items-center gap-2 cursor-pointer shrink-0"
            title="Navigate back to executive dashboard"
          >
            <ArrowLeft className="w-4 h-4 text-slate-500" />
            <span>Back to Dashboard</span>
          </button>

          <div className="h-6 w-px bg-slate-200 hidden sm:block"></div>

          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                {activeTab === 'live' ? 'Live Performance' : 'Performance Reports'}
              </h1>
              {activeTab === 'live' ? (
                <span className="px-2 py-0.5 text-[11px] font-semibold bg-emerald-100 text-emerald-800 rounded-full border border-emerald-200 flex items-center gap-1.5">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  <span>Live Stream</span>
                </span>
              ) : (
                <span className="px-2 py-0.5 text-[11px] font-semibold bg-sky-100 text-sky-800 rounded-full border border-sky-200">
                  Audit & Analytics
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {activeTab === 'live'
                ? 'Workstation button-press monitoring and real-time employee work completion stream'
                : 'Verified employee metrics, department aggregates, and exportable audit records'}
            </p>
          </div>
        </div>

        {/* Global Action Bar */}
        <div className="flex items-center gap-2.5">
          {activeTab === 'reports' && (
            <button
              type="button"
              onClick={handleExportCsv}
              className="px-3.5 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 shadow-xs transition-colors flex items-center gap-2 cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <span>Export CSV</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsTestModalOpen(true)}
            className="px-4 py-2 text-xs font-bold text-white bg-sky-600 rounded-lg hover:bg-sky-700 shadow-xs transition-colors flex items-center gap-2 cursor-pointer"
          >
            <Cpu className="w-4 h-4" />
            <span>Test Hardware Button</span>
          </button>
        </div>
      </div>

      {/* Global Quick Alert Message */}
      {actionSuccessMsg && (
        <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2 animate-in fade-in duration-150">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="font-semibold">{actionSuccessMsg}</span>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 1: LIVE PERFORMANCE VIEW                             */}
      {/* ======================================================== */}
      {activeTab === 'live' && (
        <div className="space-y-6">
          {/* LATEST RECORDED ACTIVITY PROMINENT BANNER (SPEC SECTION 3 & 4) */}
          <div className="p-5 rounded-xl border border-sky-200 bg-linear-to-r from-sky-50/90 via-white to-sky-50/50 shadow-xs relative overflow-hidden">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-sky-100 text-sky-900 text-[10px] font-bold uppercase tracking-wider">
                    <Radio className="w-3 h-3 text-sky-600 animate-pulse" />
                    <span>Latest Workstation Event</span>
                  </div>
                  <span className="text-[11px] text-slate-400">
                    Auto-refreshed {lastRefreshedAt.toLocaleTimeString()}
                  </span>
                </div>

                {liveData?.latest_event ? (
                  <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                    <span className="text-xl font-bold text-slate-900">
                      {liveData.latest_event.employee_name}
                    </span>
                    <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                      {liveData.latest_event.employee_code}
                    </span>
                    <span className="text-xs text-slate-500">
                      Dept: <strong className="text-slate-800">{liveData.latest_event.employee_department}</strong>
                    </span>
                    <span className="text-xs text-slate-500">
                      Time: <strong className="text-slate-800 font-mono">{new Date(liveData.latest_event.event_timestamp).toLocaleTimeString()}</strong>
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                      liveData.latest_event.event_source === 'HARDWARE'
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : 'bg-amber-50 text-amber-800 border-amber-200'
                    }`}>
                      {liveData.latest_event.event_source}
                    </span>
                  </div>
                ) : (
                  <div className="text-sm text-slate-500 italic">
                    No work completion events recorded yet. Press "Test Hardware Button" to simulate an employee workstation trigger.
                  </div>
                )}
              </div>

              {/* Status Indicator */}
              <div className="flex items-center gap-3">
                <div className="text-right text-xs">
                  <div className="font-semibold text-slate-700">
                    {sseConnected ? 'Real-Time Stream Active' : 'Polling Sync Mode'}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {liveData?.metrics.total_today_events || 0} events recorded today
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => fetchLiveData()}
                  disabled={isLiveLoading}
                  className="p-2 rounded-lg bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors"
                  title="Force Refresh Data"
                >
                  <RefreshCw className={`w-4 h-4 ${isLiveLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>
          </div>

          {/* Metric KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs space-y-1">
              <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
                <span>Today's Total Units</span>
                <TrendingUp className="w-4 h-4 text-sky-600" />
              </div>
              <div className="text-2xl font-bold text-slate-900">
                {liveData?.metrics.total_today_units || 0}
              </div>
              <div className="text-[11px] text-slate-500">
                Across {liveData?.metrics.total_today_events || 0} recorded button presses
              </div>
            </div>

            <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs space-y-1">
              <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
                <span>Active Employees Today</span>
                <Users className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="text-2xl font-bold text-slate-900">
                {liveData?.metrics.active_employees_today || 0}
              </div>
              <div className="text-[11px] text-slate-500">
                Out of {allEmployees.length} registered staff members
              </div>
            </div>

            <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs space-y-1">
              <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
                <span>Hardware Events</span>
                <Cpu className="w-4 h-4 text-indigo-600" />
              </div>
              <div className="text-2xl font-bold text-slate-900">
                {liveData?.metrics.hardware_events_today || 0}
              </div>
              <div className="text-[11px] text-slate-500">
                Triggered from physical workstation buttons
              </div>
            </div>

            <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs space-y-1">
              <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
                <span>Simulated Events</span>
                <Radio className="w-4 h-4 text-amber-600" />
              </div>
              <div className="text-2xl font-bold text-slate-900">
                {liveData?.metrics.simulated_events_today || 0}
              </div>
              <div className="text-[11px] text-slate-500">
                Software test verification clicks
              </div>
            </div>
          </div>

          {/* Live Employee Performance Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            {/* Filter Bar */}
            <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-50/50">
              <div className="flex items-center gap-2 flex-1 max-w-md">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={liveSearch}
                    onChange={e => setLiveSearch(e.target.value)}
                    placeholder="Search by employee name or ID (EMP-XXXX)..."
                    className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 text-xs">
                  <Filter className="w-3.5 h-3.5 text-slate-500" />
                  <span className="text-slate-600 font-medium">Department:</span>
                  <select
                    value={liveDept}
                    onChange={e => setLiveDept(e.target.value)}
                    className="px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                  >
                    <option value="all">All Departments</option>
                    {availableDepartments.map(d => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase font-bold tracking-wider text-[10px]">
                  <tr>
                    <th className="py-3 px-4">Employee ID</th>
                    <th className="py-3 px-4">Employee Name</th>
                    <th className="py-3 px-4">Department / Team</th>
                    <th className="py-3 px-4 text-right">Events Today</th>
                    <th className="py-3 px-4">Most Recent Activity</th>
                    <th className="py-3 px-4 text-center">Event Source</th>
                    <th className="py-3 px-4 text-right">Test Button</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {isLiveLoading ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400">
                        Loading employee performance records...
                      </td>
                    </tr>
                  ) : !liveData?.employee_stats || liveData.employee_stats.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-500">
                        <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                        <div className="font-semibold text-slate-700">No employees found</div>
                        <p className="text-xs text-slate-400 mt-1">
                          No matching active employee records found in the database.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    liveData.employee_stats.map((emp) => (
                      <tr key={emp.employee_id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4 font-mono font-semibold text-slate-700 text-xs">
                          {emp.employee_code}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-900">{emp.name}</div>
                          <div className="text-[11px] text-slate-400 truncate max-w-[160px]">
                            {emp.email}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-slate-700 font-medium">
                          {emp.department}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 text-sm">
                          {emp.today_units > 0 ? (
                            <span className="text-emerald-700 font-bold">+{emp.today_units}</span>
                          ) : (
                            <span className="text-slate-400">0</span>
                          )}
                          <div className="text-[10px] font-normal text-slate-400 font-sans">
                            {emp.today_hardware_units > 0 && <span className="text-indigo-600">HW:{emp.today_hardware_units} </span>}
                            {emp.today_simulated_units > 0 && <span className="text-amber-600">SIM:{emp.today_simulated_units}</span>}
                          </div>
                        </td>
                        <td className="py-3 px-4 font-mono text-xs">
                          {emp.last_activity_at ? (
                            <div>
                              <div className="text-slate-800 font-semibold">
                                {new Date(emp.last_activity_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                              </div>
                              <div className="text-[10px] text-slate-400">
                                {new Date(emp.last_activity_at).toLocaleDateString()}
                              </div>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic">No events recorded</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {emp.last_activity_source ? (
                            <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold border ${
                              emp.last_activity_source === 'HARDWARE'
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                : 'bg-amber-50 text-amber-800 border-amber-200'
                            }`}>
                              {emp.last_activity_source}
                            </span>
                          ) : (
                            <span className="text-slate-300 font-mono">-</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => handleQuickSimulate(emp.employee_id, emp.name)}
                            disabled={quickSimulatingId === emp.employee_id}
                            className="px-2.5 py-1 text-[11px] font-semibold text-sky-700 bg-sky-50 border border-sky-200 rounded-md hover:bg-sky-100 hover:text-sky-900 disabled:opacity-50 transition-colors inline-flex items-center gap-1 cursor-pointer"
                            title="Simulate 1 work completion button press for this employee"
                          >
                            <Zap className="w-3 h-3 text-sky-600" />
                            <span>Test</span>
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 2: PERFORMANCE REPORTS VIEW                          */}
      {/* ======================================================== */}
      {activeTab === 'reports' && (
        <div className="space-y-6">
          {/* Filter & Period Controls Bar */}
          <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              {/* Period Selectors */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider mr-1">
                  Period:
                </span>
                {(['daily', 'weekly', 'monthly', 'custom'] as const).map(p => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => {
                      setReportPeriod(p);
                      setReportPage(1);
                    }}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg capitalize transition-colors ${
                      reportPeriod === p
                        ? 'bg-sky-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {p === 'weekly' ? 'Weekly (Mon-Sun)' : p}
                  </button>
                ))}
              </div>

              {/* Export Button */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleExportCsv}
                  className="px-4 py-1.5 text-xs font-bold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors flex items-center gap-2 shadow-xs"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                  <span>Export CSV Report</span>
                </button>
              </div>
            </div>

            {/* Custom Range & Filter Dropdowns */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-slate-100">
              {reportPeriod === 'custom' && (
                <>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                      Start Date
                    </label>
                    <input
                      type="date"
                      value={reportStartDate}
                      onChange={e => {
                        setReportStartDate(e.target.value);
                        setReportPage(1);
                      }}
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                      End Date
                    </label>
                    <input
                      type="date"
                      value={reportEndDate}
                      onChange={e => {
                        setReportEndDate(e.target.value);
                        setReportPage(1);
                      }}
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  Department
                </label>
                <select
                  value={reportDept}
                  onChange={e => {
                    setReportDept(e.target.value);
                    setReportPage(1);
                  }}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                >
                  <option value="all">All Departments</option>
                  {availableDepartments.map(d => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  Filter by Specific Employee
                </label>
                <select
                  value={reportEmployeeId || ''}
                  onChange={e => {
                    setReportEmployeeId(e.target.value ? Number(e.target.value) : undefined);
                    setReportPage(1);
                  }}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                >
                  <option value="">All Employees</option>
                  {allEmployees.map(e => (
                    <option key={e.id} value={e.id}>
                      {e.name} ({e.employee_code})
                    </option>
                  ))}
                </select>
              </div>

              {/* MANDATORY FILTER CONSTRAINT: Simulated test events checkbox */}
              <div className="flex items-center sm:col-span-2 lg:col-span-2 pt-4">
                <label className="flex items-center gap-2.5 text-xs cursor-pointer select-none p-2 rounded-lg hover:bg-slate-50 transition-colors">
                  <input
                    type="checkbox"
                    checked={includeSimulated}
                    onChange={e => {
                      setIncludeSimulated(e.target.checked);
                      setReportPage(1);
                    }}
                    className="w-4 h-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                  />
                  <div>
                    <span className="font-semibold text-slate-800">
                      Include Simulated Test Events
                    </span>
                    <span className="block text-[11px] text-slate-500">
                      (Excluded by default for official audit totals; enable for test verification)
                    </span>
                  </div>
                </label>
              </div>
            </div>
          </div>

          {/* Report KPI Aggregates */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs space-y-1">
              <div className="text-xs font-medium text-slate-500">Period Total Units Completed</div>
              <div className="text-2xl font-bold text-slate-900">
                {reportData?.metrics.total_units || 0}
              </div>
              <div className="text-[11px] text-slate-500">
                Across {reportData?.metrics.total_events || 0} total work events
              </div>
            </div>

            <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs space-y-1">
              <div className="text-xs font-medium text-slate-500">Active Contributors</div>
              <div className="text-2xl font-bold text-slate-900">
                {reportData?.metrics.active_employees || 0}
              </div>
              <div className="text-[11px] text-slate-500">
                Employees logging work in this range
              </div>
            </div>

            <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs space-y-1">
              <div className="text-xs font-medium text-slate-500">Avg Units / Active Employee</div>
              <div className="text-2xl font-bold text-slate-900">
                {reportData?.metrics.average_units_per_active_employee || 0}
              </div>
              <div className="text-[11px] text-slate-500">
                Production velocity benchmark
              </div>
            </div>

            <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs space-y-1">
              <div className="text-xs font-medium text-slate-500">Event Source Breakdown</div>
              <div className="flex items-baseline gap-2">
                <span className="text-lg font-bold text-indigo-700">
                  {reportData?.metrics.hardware_units || 0} HW
                </span>
                <span className="text-slate-300">•</span>
                <span className="text-lg font-bold text-amber-700">
                  {reportData?.metrics.simulated_units || 0} SIM
                </span>
              </div>
              <div className="text-[11px] text-slate-500">
                {includeSimulated ? 'Both sources included in report' : 'Official hardware units only'}
              </div>
            </div>
          </div>

          {/* Activity Distribution Over Time (Visual Bar Trend) */}
          {reportData && reportData.time_series.length > 0 && (
            <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Activity Distribution Over Time
                  </h3>
                  <p className="text-xs text-slate-500">
                    Units completed across intervals ({reportPeriod.toUpperCase()})
                  </p>
                </div>
                <span className="text-xs font-mono text-slate-400">
                  {reportData.time_series.length} buckets
                </span>
              </div>

              {/* Time Series Bar Representation */}
              <div className="pt-2">
                <div className="flex items-end gap-1.5 h-32 w-full overflow-x-auto pb-2">
                  {(() => {
                    const maxUnits = Math.max(1, ...reportData.time_series.map(t => t.total_units));
                    return reportData.time_series.map((point, idx) => {
                      const heightPercent = Math.round((point.total_units / maxUnits) * 100);
                      return (
                        <div key={idx} className="flex-1 min-w-[28px] flex flex-col items-center h-full justify-end group relative">
                          {/* Tooltip */}
                          <div className="absolute -top-8 hidden group-hover:flex flex-col items-center z-20">
                            <span className="px-2 py-1 bg-slate-900 text-white text-[10px] rounded font-mono whitespace-nowrap shadow-md">
                              {point.label}: {point.total_units} units
                            </span>
                          </div>

                          {/* Bar */}
                          <div
                            style={{ height: `${Math.max(4, heightPercent)}%` }}
                            className={`w-full rounded-t transition-all ${
                              point.total_units > 0
                                ? 'bg-sky-500 hover:bg-sky-600'
                                : 'bg-slate-100'
                            }`}
                          />
                          <span className="text-[9px] font-mono text-slate-400 mt-1 truncate max-w-full">
                            {point.label.slice(0, 5)}
                          </span>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            </div>
          )}

          {/* Employee Performance Rankings Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Employee Performance Rankings</h3>
                <p className="text-xs text-slate-500">Aggregated output by employee for selected period</p>
              </div>
              <span className="text-xs font-semibold px-2 py-1 rounded bg-slate-100 text-slate-700">
                {reportData?.employee_rankings.length || 0} Ranked
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase font-bold tracking-wider text-[10px]">
                  <tr>
                    <th className="py-3 px-4 w-12 text-center">Rank</th>
                    <th className="py-3 px-4">Employee</th>
                    <th className="py-3 px-4">Department</th>
                    <th className="py-3 px-4 text-right">Total Units</th>
                    <th className="py-3 px-4 text-right">Hardware</th>
                    <th className="py-3 px-4 text-right">Simulated</th>
                    <th className="py-3 px-4 text-right">Share of Total</th>
                    <th className="py-3 px-4">Last Activity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {isReportLoading ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-400">
                        Generating performance audit report...
                      </td>
                    </tr>
                  ) : !reportData?.employee_rankings || reportData.employee_rankings.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-500">
                        <BarChart2 className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                        <div className="font-semibold text-slate-700">No report events found</div>
                        <p className="text-xs text-slate-400 mt-1">
                          No work completion events recorded during this period matching your filter criteria.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    reportData.employee_rankings.map((emp, index) => (
                      <tr key={emp.employee_id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4 text-center font-bold text-slate-500">
                          #{index + 1}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-900">{emp.name}</div>
                          <div className="font-mono text-[10px] text-slate-500">{emp.employee_code}</div>
                        </td>
                        <td className="py-3 px-4 font-medium text-slate-700">
                          {emp.department}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 text-sm">
                          {emp.total_units}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-indigo-700">
                          {emp.hardware_units}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-amber-700">
                          {emp.simulated_units}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <span className="font-mono font-semibold text-slate-700">{emp.share_percentage}%</span>
                            <div className="w-16 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                              <div
                                className="bg-sky-600 h-full rounded-full"
                                style={{ width: `${Math.min(100, emp.share_percentage)}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-slate-500 font-mono text-[11px]">
                          {emp.last_activity_at
                            ? new Date(emp.last_activity_at).toLocaleString()
                            : 'N/A'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Department Breakdown Section */}
          {reportData && reportData.department_breakdown.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 space-y-4">
              <h3 className="text-sm font-bold text-slate-900">Department Performance Breakdown</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {reportData.department_breakdown.map((dept, idx) => (
                  <div key={idx} className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/50 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900 text-xs">{dept.department}</span>
                      <span className="text-xs font-mono font-semibold text-sky-700">{dept.percentage}% of total</span>
                    </div>
                    <div className="flex items-baseline justify-between text-xs text-slate-600">
                      <span>Total Units: <strong>{dept.total_units}</strong></span>
                      <span>{dept.employee_count} Active Staff</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Detailed Event Log Table with Pagination */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Detailed Event Log</h3>
                <p className="text-xs text-slate-500">Raw work completion records and workstation audits</p>
              </div>
              <span className="text-xs text-slate-500 font-mono">
                Page {reportData?.pagination.page || 1} of {reportData?.pagination.total_pages || 1}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase font-bold tracking-wider text-[10px]">
                  <tr>
                    <th className="py-3 px-4">Event ID / UUID</th>
                    <th className="py-3 px-4">Timestamp</th>
                    <th className="py-3 px-4">Employee</th>
                    <th className="py-3 px-4">Department</th>
                    <th className="py-3 px-4">Source</th>
                    <th className="py-3 px-4">Workstation</th>
                    <th className="py-3 px-4 text-right">Units</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700 font-mono text-[11px]">
                  {!reportData?.events || reportData.events.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400 font-sans">
                        No events to display.
                      </td>
                    </tr>
                  ) : (
                    reportData.events.map(ev => (
                      <tr key={ev.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4">
                          <span className="font-bold text-slate-900">#{ev.id}</span>
                          <span className="text-slate-400 text-[10px] block truncate max-w-[120px] font-mono">
                            {ev.event_uuid}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-600">
                          {new Date(ev.event_timestamp).toLocaleString()}
                        </td>
                        <td className="py-3 px-4 font-sans font-semibold text-slate-900">
                          {ev.employee_name}
                          <span className="block font-mono text-[10px] text-slate-500 font-normal">
                            {ev.employee_code}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-sans text-slate-700">
                          {ev.employee_department}
                        </td>
                        <td className="py-3 px-4 font-sans">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            ev.event_source === 'HARDWARE'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}>
                            {ev.event_source}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-sans text-slate-600">
                          {ev.workstation_name || 'Terminal'}
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-slate-900 font-sans">
                          +{ev.units_completed}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {reportData && reportData.pagination.total_pages > 1 && (
              <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
                <span className="text-xs text-slate-500">
                  Showing records {(reportData.pagination.page - 1) * reportData.pagination.limit + 1} to{' '}
                  {Math.min(
                    reportData.pagination.page * reportData.pagination.limit,
                    reportData.pagination.total_records
                  )}{' '}
                  of {reportData.pagination.total_records}
                </span>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setReportPage(prev => Math.max(1, prev - 1))}
                    disabled={reportData.pagination.page <= 1}
                    className="p-1.5 rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-xs font-semibold px-2 text-slate-700">
                    {reportData.pagination.page} / {reportData.pagination.total_pages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setReportPage(prev => Math.min(reportData.pagination.total_pages, prev + 1))}
                    disabled={reportData.pagination.page >= reportData.pagination.total_pages}
                    className="p-1.5 rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Software Test Hardware Button Popup Modal */}
      <TestHardwareButtonModal
        isOpen={isTestModalOpen}
        onClose={() => setIsTestModalOpen(false)}
        onEventSimulated={(_event) => {
          fetchLiveData(true);
        }}
      />
    </div>
  );
};
