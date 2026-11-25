import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { buildSseUrl } from '../config/apiConfig';
import {
  ArrowLeft,
  Calendar,
  Filter,
  Users,
  CheckCircle2,
  Cpu,
  Zap,
  Building,
  AlertTriangle,
  RefreshCw,
  BarChart2,
  TrendingUp,
  TrendingDown,
  FileSpreadsheet,
  Search,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  Clock,
  Radio,
  UserCheck,
  Award,
  ExternalLink,
} from 'lucide-react';
import { PerformanceReportData, PerformanceEmployee } from '../types';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';

interface PerformanceReportsPageProps {
  onNavigate: (route: string) => void;
}

export const PerformanceReportsPage: React.FC<PerformanceReportsPageProps> = ({ onNavigate }) => {
  const { branding } = useAuth();
  // Period & Filter States
  const [period, setPeriod] = useState<string>('daily');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [dateValidationError, setDateValidationError] = useState<string | null>(null);

  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('all');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('all');
  const [includeSimulated, setIncludeSimulated] = useState<boolean>(false);
  const [onlyActiveInPeriod, setOnlyActiveInPeriod] = useState<boolean>(false);

  // Search & Pagination & Sorting States for Ledger
  const [ledgerSearch, setLedgerSearch] = useState<string>('');
  const [sortField, setSortField] = useState<'latest_activity' | 'event_count' | 'emp_id' | 'name'>('latest_activity');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  // Compare previous period toggle
  const [showComparison, setShowComparison] = useState<boolean>(true);

  // Data & Async States
  const [reportData, setReportData] = useState<PerformanceReportData | null>(null);
  const [employeesList, setEmployeesList] = useState<PerformanceEmployee[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(new Date());
  const [sseConnected, setSseConnected] = useState<boolean>(false);

  // Load employee directory for dropdown filter
  useEffect(() => {
    api.getPerformanceEmployees('all')
      .then(res => {
        if (res.success && res.data) {
          setEmployeesList(res.data);
        }
      })
      .catch(() => {});
  }, []);

  // Validate custom date range
  useEffect(() => {
    if (period === 'custom') {
      if (startDate && endDate && startDate > endDate) {
        setDateValidationError('Start date cannot be after end date.');
      } else {
        setDateValidationError(null);
      }
    } else {
      setDateValidationError(null);
    }
  }, [period, startDate, endDate]);

  // Main Fetch Callback
  const fetchReports = useCallback(async (isSilent = false) => {
    if (period === 'custom' && startDate && endDate && startDate > endDate) {
      return;
    }

    if (!isSilent) setIsLoading(true);
    setFetchError(null);

    try {
      const res = await api.getPerformanceReports({
        period,
        start_date: period === 'custom' ? startDate || undefined : undefined,
        end_date: period === 'custom' ? endDate || undefined : undefined,
        employee_id: selectedEmployeeId !== 'all' ? selectedEmployeeId : undefined,
        department: selectedDepartment !== 'all' ? selectedDepartment : undefined,
        include_simulated: includeSimulated,
      });

      if (res.success && res.data) {
        setReportData(res.data);
        setLastRefreshedAt(new Date());
      } else {
        setFetchError(res.message || 'Failed to load report data from server.');
      }
    } catch (err: any) {
      console.error('Failed to load performance reports:', err);
      setFetchError(err.message || 'Unable to connect to performance report service.');
    } finally {
      if (!isSilent) setIsLoading(false);
    }
  }, [period, startDate, endDate, selectedEmployeeId, selectedDepartment, includeSimulated]);

  // Trigger on filter changes
  useEffect(() => {
    fetchReports();
    setCurrentPage(1);
  }, [fetchReports]);

  // Real-time SSE Connection: auto-refresh on new work event
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    let es: EventSource | null = null;
    try {
      const token = typeof window !== 'undefined' ? window.localStorage.getItem('nexora_token') : null;
      const sseUrl = buildSseUrl('/events', token);
      es = new EventSource(sseUrl);
      es.onopen = () => {
        setSseConnected(true);
      };
      es.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.type === 'WORK_EVENT_RECORDED') {
            // Debounce refresh by 400ms to allow database commits
            if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
            refreshTimerRef.current = setTimeout(() => {
              fetchReports(true);
            }, 400);
          }
        } catch {}
      };
      es.onerror = () => {
        setSseConnected(false);
      };
    } catch {
      setSseConnected(false);
    }

    return () => {
      if (es) es.close();
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, [fetchReports]);

  // Extract unique departments for dropdown
  const departments = useMemo(() => {
    const set = new Set<string>();
    employeesList.forEach(e => {
      if (e.department) set.add(e.department);
    });
    return Array.from(set);
  }, [employeesList]);

  // CSV Export handler
  const handleExportCSV = () => {
    const url = api.getPerformanceExportUrl({
      period,
      start_date: period === 'custom' ? startDate || undefined : undefined,
      end_date: period === 'custom' ? endDate || undefined : undefined,
      include_simulated: includeSimulated,
    });
    window.location.href = url;
  };

  // Filter & Sort Ledger Employees
  const processedLedgerEmployees = useMemo(() => {
    if (!reportData?.employees) return [];
    let list = [...reportData.employees];

    // Filter by "only active in period" if toggled
    if (onlyActiveInPeriod) {
      list = list.filter(e => e.completed_count > 0);
    }

    // Filter by search text
    if (ledgerSearch.trim()) {
      const q = ledgerSearch.toLowerCase().trim();
      list = list.filter(e => {
        const empId = (e.emp_id || e.employee_id || '').toLowerCase();
        const name = (e.name || `${e.first_name || ''} ${e.last_name || ''}`).toLowerCase();
        const dept = (e.department || '').toLowerCase();
        const desig = (e.designation || '').toLowerCase();
        return empId.includes(q) || name.includes(q) || dept.includes(q) || desig.includes(q);
      });
    }

    // Sort
    list.sort((a, b) => {
      let comp = 0;
      if (sortField === 'latest_activity') {
        const timeA = a.last_event ? new Date(a.last_event).getTime() : 0;
        const timeB = b.last_event ? new Date(b.last_event).getTime() : 0;
        comp = timeB - timeA;
        if (comp === 0) comp = b.completed_count - a.completed_count;
      } else if (sortField === 'event_count') {
        comp = b.completed_count - a.completed_count;
      } else if (sortField === 'emp_id') {
        comp = (a.emp_id || '').localeCompare(b.emp_id || '');
      } else if (sortField === 'name') {
        comp = (a.name || '').localeCompare(b.name || '');
      }

      return sortOrder === 'asc' ? -comp : comp;
    });

    return list;
  }, [reportData?.employees, onlyActiveInPeriod, ledgerSearch, sortField, sortOrder]);

  // Pagination for Ledger
  const totalLedgerItems = processedLedgerEmployees.length;
  const totalPages = Math.max(1, Math.ceil(totalLedgerItems / pageSize));
  const paginatedEmployees = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return processedLedgerEmployees.slice(start, start + pageSize);
  }, [processedLedgerEmployees, currentPage, pageSize]);

  // Top Performing Personnel
  const topPerformer = reportData?.top_performers && reportData.top_performers.length > 0
    ? reportData.top_performers[0]
    : null;

  // Distinct active personnel in period
  const activeCountInPeriod = reportData?.stats?.active_employees ?? 0;
  const totalRegisteredCount = reportData?.total_registered_employees ?? employeesList.length;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* 1. Header & Breadcrumb */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => onNavigate('/dashboard')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-300 text-slate-700 bg-white hover:bg-slate-100 hover:text-slate-900 font-semibold text-xs transition-colors shadow-2xs focus:outline-none focus:ring-2 focus:ring-sky-500 cursor-pointer"
              title="Return to main dashboard"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Dashboard</span>
            </button>

            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-800 border border-indigo-200">
                Workforce Performance
              </span>
              {branding.companyName && (
                <>
                  <span className="text-slate-300">•</span>
                  <span className="text-xs font-semibold text-slate-500">
                    {branding.companyName}
                  </span>
                </>
              )}
            </div>
          </div>

          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight mt-2 flex items-center gap-2.5">
            <BarChart2 className="w-6 h-6 text-indigo-600" />
            <span>Workforce Performance Reports Dashboard</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Real-time PostgreSQL analytics for workforce shift completions, IoT hardware validation, and personnel productivity.
          </p>
        </div>

        {/* Live SSE status, Refresh & CSV Export */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold border ${
              sseConnected
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-slate-50 text-slate-500 border-slate-200'
            }`}
            title={sseConnected ? 'Real-Time SSE Connected' : 'Polling fallback active'}
          >
            <Radio className={`w-3 h-3 ${sseConnected ? 'text-emerald-500 animate-pulse' : 'text-slate-400'}`} />
            <span>{sseConnected ? 'Real-Time Live Stream' : 'Live Sync'}</span>
          </div>

          <button
            onClick={() => fetchReports()}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 transition-colors shadow-2xs cursor-pointer"
            title={`Last refreshed at ${lastRefreshedAt.toLocaleTimeString()}`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-indigo-600' : 'text-slate-500'}`} />
            <span>Refresh</span>
          </button>

          <button
            onClick={handleExportCSV}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-xs bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs hover:shadow-md transition-all cursor-pointer active:scale-95"
            title="Download formatted CSV report of current data"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* 2. Troubleshooting Mode Notice (when simulated events included) */}
      {includeSimulated && (
        <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-xl flex items-center justify-between gap-3 text-amber-900 text-xs animate-in slide-in-from-top-1 duration-200 shadow-2xs">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
            <div>
              <strong>Troubleshooting Mode Active:</strong> Simulated test events are currently included in calculations. Official production reports exclude simulated events by default to maintain audit compliance.
            </div>
          </div>
          <button
            onClick={() => setIncludeSimulated(false)}
            className="px-2.5 py-1 rounded-lg bg-amber-200/80 hover:bg-amber-300 text-amber-950 font-bold text-[11px] transition-colors shrink-0 cursor-pointer"
          >
            Exclude Simulated
          </button>
        </div>
      )}

      {/* 3. Reporting Period Selector & Filters Panel */}
      <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Prominent Period Tabs */}
          <div className="flex items-center rounded-xl bg-slate-100 p-1 border border-slate-200 text-xs font-semibold">
            {[
              { id: 'daily', label: 'Daily (Today)' },
              { id: 'weekly', label: 'Weekly (This Week)' },
              { id: 'monthly', label: 'Monthly (This Month)' },
              { id: 'custom', label: 'Custom Range' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setPeriod(tab.id)}
                className={`px-3.5 py-1.5 rounded-lg transition-all cursor-pointer ${
                  period === tab.id
                    ? 'bg-white text-indigo-700 shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Simulated Events Toggle */}
          <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeSimulated}
              onChange={e => setIncludeSimulated(e.target.checked)}
              className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
            />
            <span>Include Simulated Events (Troubleshooting)</span>
          </label>
        </div>

        {/* Secondary Filter Controls: Custom Range, Personnel, Department */}
        <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center gap-3 text-xs">
          {period === 'custom' && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-slate-500 font-medium flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span>Date Range:</span>
              </span>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className={`py-1.5 px-2.5 rounded-lg border bg-white text-slate-800 text-xs focus:outline-none focus:ring-2 ${
                  dateValidationError ? 'border-rose-400 focus:ring-rose-400' : 'border-slate-300 focus:ring-indigo-500'
                }`}
                placeholder="Start Date"
              />
              <span className="text-slate-400 text-xs font-medium">to</span>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className={`py-1.5 px-2.5 rounded-lg border bg-white text-slate-800 text-xs focus:outline-none focus:ring-2 ${
                  dateValidationError ? 'border-rose-400 focus:ring-rose-400' : 'border-slate-300 focus:ring-indigo-500'
                }`}
                placeholder="End Date"
              />
              {dateValidationError && (
                <span className="text-xs text-rose-600 font-semibold flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {dateValidationError}
                </span>
              )}
            </div>
          )}

          {/* Personnel Filter */}
          <div className="flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={selectedEmployeeId}
              onChange={e => setSelectedEmployeeId(e.target.value)}
              className="py-1.5 px-2.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
            >
              <option value="all">All Personnel</option>
              {employeesList.map(emp => (
                <option key={emp.id} value={emp.emp_id || emp.employee_id || String(emp.id)}>
                  {emp.name || `${emp.first_name || ''} ${emp.last_name || ''}`} ({emp.emp_id || emp.employee_id})
                </option>
              ))}
            </select>
          </div>

          {/* Department Filter */}
          <div className="flex items-center gap-1.5">
            <Building className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={selectedDepartment}
              onChange={e => setSelectedDepartment(e.target.value)}
              className="py-1.5 px-2.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
            >
              <option value="all">All Departments</option>
              {departments.map(dept => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
          </div>

          {/* Reset Filters */}
          {(selectedEmployeeId !== 'all' || selectedDepartment !== 'all' || (period === 'custom' && (startDate || endDate))) && (
            <button
              onClick={() => {
                setSelectedEmployeeId('all');
                setSelectedDepartment('all');
                setStartDate('');
                setEndDate('');
              }}
              className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 underline underline-offset-2 ml-auto cursor-pointer"
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* Fetch Error Display */}
      {fetchError && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-center justify-between gap-3 text-rose-900 text-xs shadow-2xs">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
            <div>
              <p className="font-bold">Error loading performance reports</p>
              <p className="text-rose-700 mt-0.5">{fetchError}</p>
            </div>
          </div>
          <button
            onClick={() => fetchReports()}
            className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs transition-colors shrink-0 cursor-pointer"
          >
            Retry Query
          </button>
        </div>
      )}

      {/* Empty State: If No Registered Performance Employees exist at all */}
      {!isLoading && totalRegisteredCount === 0 && (
        <div className="p-8 text-center bg-white rounded-2xl border border-dashed border-slate-300 shadow-xs space-y-3">
          <Users className="w-10 h-10 text-slate-300 mx-auto" />
          <h3 className="text-base font-bold text-slate-800">No Performance Employees Registered</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            To start recording work-completion events and generating performance reports, you must first register active personnel.
          </p>
          <div className="pt-2">
            <button
              onClick={() => onNavigate('/workforce/performance/registration')}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs hover:shadow-md transition-all cursor-pointer"
            >
              <UserCheck className="w-4 h-4" />
              <span>Go to Employee Registration</span>
            </button>
          </div>
        </div>
      )}

      {/* 4. Performance Summary Cards (backed by PostgreSQL) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Work Events */}
        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs flex items-center gap-3.5 hover:border-slate-300 transition-colors">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-slate-500 truncate">Total Work Events</div>
            <div className="text-2xl font-extrabold text-slate-900 tracking-tight">
              {reportData?.stats.total_events ?? 0}
            </div>
            <div className="text-[11px] text-slate-400 capitalize truncate flex items-center gap-1.5 mt-0.5">
              <span>{period} aggregate</span>
              {reportData?.comparison && showComparison && reportData.comparison.percent_change !== null && (
                <span className={`inline-flex items-center text-[10px] font-bold ${
                  reportData.comparison.percent_change >= 0 ? 'text-emerald-600' : 'text-rose-600'
                }`}>
                  {reportData.comparison.percent_change >= 0 ? (
                    <TrendingUp className="w-3 h-3 mr-0.5" />
                  ) : (
                    <TrendingDown className="w-3 h-3 mr-0.5" />
                  )}
                  {reportData.comparison.percent_change >= 0 ? '+' : ''}{reportData.comparison.percent_change}%
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Active Personnel */}
        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs flex items-center gap-3.5 hover:border-slate-300 transition-colors">
          <div className="w-12 h-12 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center shrink-0">
            <Users className="w-6 h-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-slate-500 truncate">Active Personnel</div>
            <div className="text-2xl font-extrabold text-sky-600 tracking-tight">
              {activeCountInPeriod}
            </div>
            <div className="text-[11px] text-slate-400 truncate mt-0.5">
              <span>Active in period (of {totalRegisteredCount} registered)</span>
            </div>
          </div>
        </div>

        {/* Hardware Verified */}
        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs flex items-center gap-3.5 hover:border-slate-300 transition-colors">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <Cpu className="w-6 h-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-slate-500 truncate">Hardware Verified</div>
            <div className="text-2xl font-extrabold text-emerald-600 tracking-tight">
              {reportData?.stats.hardware_events ?? 0}
            </div>
            <div className="text-[11px] text-slate-400 truncate mt-0.5">
              {includeSimulated
                ? `${reportData?.stats.simulated_events ?? 0} simulated test events`
                : 'Genuine IoT terminal events'}
            </div>
          </div>
        </div>

        {/* Top Performing Personnel */}
        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs flex items-center gap-3.5 hover:border-slate-300 transition-colors">
          <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <Award className="w-6 h-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-slate-500 truncate">Top Performing Personnel</div>
            {topPerformer ? (
              <>
                <div className="text-sm font-bold text-slate-900 truncate">
                  {topPerformer.name || `${topPerformer.first_name} ${topPerformer.last_name}`}
                </div>
                <div className="text-[11px] text-slate-500 truncate font-medium">
                  {topPerformer.emp_id} • <strong className="text-indigo-600 font-bold">{topPerformer.completed_count}</strong> completions
                </div>
              </>
            ) : (
              <>
                <div className="text-sm font-semibold text-slate-400 truncate">No qualifying activity</div>
                <div className="text-[11px] text-slate-400 truncate">0 events in period</div>
              </>
            )}
            <div className="text-[9px] text-slate-400 italic truncate mt-0.5">
              Activity-based ranking only
            </div>
          </div>
        </div>
      </div>

      {/* 5. Period Comparison Banner (if enabled and historical data exists) */}
      {reportData?.comparison && (
        <div className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl flex flex-wrap items-center justify-between text-xs text-slate-600 gap-2">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-800">Historical Comparison:</span>
            <span>Current ({reportData.comparison.current_label}): <strong>{reportData.comparison.current_total}</strong> events</span>
            <span className="text-slate-300">vs</span>
            <span>Previous ({reportData.comparison.prev_label}): <strong>{reportData.comparison.prev_total}</strong> events</span>
          </div>
          <div className="flex items-center gap-2">
            {reportData.comparison.percent_change !== null && (
              <span className={`px-2 py-0.5 rounded-md font-bold text-[11px] ${
                reportData.comparison.percent_change >= 0
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                  : 'bg-rose-100 text-rose-800 border border-rose-200'
              }`}>
                {reportData.comparison.percent_change >= 0 ? '+' : ''}{reportData.comparison.percent_change}% change
              </span>
            )}
          </div>
        </div>
      )}

      {/* 6. Dual Visual Analytics Grid: Activity Trend Over Time & Hourly Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart 1: Activity Trend Over Time */}
        <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-indigo-600" />
              <h2 className="text-sm font-bold text-slate-900">
                Activity Trend Over Time
              </h2>
            </div>
            <span className="text-xs text-slate-400 font-medium capitalize">
              {period === 'daily' ? 'Hourly Intervals' : 'Daily Output Breakdown'}
            </span>
          </div>

          {reportData?.trend && reportData.trend.length > 0 ? (
            <div className="pt-2">
              <div className="h-44 flex items-end gap-2 border-b border-slate-200 pb-2 overflow-x-auto">
                {(() => {
                  const maxVal = Math.max(...reportData.trend.map(t => t.event_count), 1);
                  return reportData.trend.map((point, idx) => {
                    const heightPercent = Math.max((point.event_count / maxVal) * 100, 6);
                    return (
                      <div
                        key={idx}
                        className="flex-1 min-w-[32px] flex flex-col items-center gap-1 group relative"
                      >
                        {/* Tooltip on hover */}
                        <div className="absolute bottom-full mb-2 hidden group-hover:flex flex-col items-center z-20 pointer-events-none">
                          <div className="bg-slate-900 text-white text-[10px] font-semibold py-1 px-2 rounded shadow-lg whitespace-nowrap">
                            <div>Interval: {point.time_bucket}</div>
                            <div>Total: {point.event_count} events</div>
                            <div>Hardware: {point.hardware_count}</div>
                            {includeSimulated && <div>Simulated: {point.simulated_count}</div>}
                          </div>
                        </div>

                        <span className="text-[10px] font-bold text-slate-600">
                          {point.event_count}
                        </span>
                        <div
                          style={{ height: `${heightPercent}%` }}
                          className="w-full rounded-t-md bg-linear-to-t from-indigo-600 to-indigo-400 group-hover:from-indigo-500 group-hover:to-indigo-300 transition-all shadow-xs"
                        />
                        <span className="text-[10px] text-slate-400 font-mono truncate w-full text-center">
                          {point.time_bucket.slice(-5)}
                        </span>
                      </div>
                    );
                  });
                })()}
              </div>
              <div className="flex items-center justify-between pt-2 text-[11px] text-slate-400">
                <span>Start of interval</span>
                <span>End of interval</span>
              </div>
            </div>
          ) : (
            <div className="py-12 text-center text-slate-400 text-xs italic space-y-1">
              <BarChart2 className="w-8 h-8 text-slate-300 mx-auto" />
              <p>No activity points recorded in this timeframe.</p>
              <p className="text-[11px] text-slate-400">Recorded events will populate this timeline automatically.</p>
            </div>
          )}
        </div>

        {/* Chart 2: Hourly Activity Distribution (00:00 to 23:00) */}
        <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-sky-600" />
              <h2 className="text-sm font-bold text-slate-900">
                Hourly Activity Distribution
              </h2>
            </div>
            <span className="text-xs text-slate-400 font-medium">
              24-Hour Intraday Profile
            </span>
          </div>

          {reportData?.hourly_distribution && reportData.hourly_distribution.some(h => h.event_count > 0) ? (
            <div className="pt-2">
              <div className="h-44 flex items-end gap-1 sm:gap-1.5 border-b border-slate-200 pb-2 overflow-x-auto">
                {(() => {
                  const maxHourlyVal = Math.max(...reportData.hourly_distribution.map(h => h.event_count), 1);
                  return reportData.hourly_distribution.map((bucket, idx) => {
                    const heightPercent = bucket.event_count > 0
                      ? Math.max((bucket.event_count / maxHourlyVal) * 100, 8)
                      : 2;

                    return (
                      <div
                        key={idx}
                        className="flex-1 min-w-[20px] flex flex-col items-center gap-1 group relative"
                      >
                        {/* Tooltip on hover */}
                        <div className="absolute bottom-full mb-2 hidden group-hover:flex flex-col items-center z-20 pointer-events-none">
                          <div className="bg-slate-900 text-white text-[10px] font-semibold py-1 px-2 rounded shadow-lg whitespace-nowrap">
                            <div>Hour: {bucket.label}</div>
                            <div>Total Events: {bucket.event_count}</div>
                            <div>Hardware: {bucket.hardware_count}</div>
                            {includeSimulated && <div>Simulated: {bucket.simulated_count}</div>}
                          </div>
                        </div>

                        <span className={`text-[9px] font-bold ${bucket.event_count > 0 ? 'text-sky-700' : 'text-slate-300'}`}>
                          {bucket.event_count > 0 ? bucket.event_count : ''}
                        </span>
                        <div
                          style={{ height: `${heightPercent}%` }}
                          className={`w-full rounded-t-sm transition-all shadow-2xs ${
                            bucket.event_count > 0
                              ? 'bg-linear-to-t from-sky-600 to-sky-400 group-hover:from-sky-500 group-hover:to-sky-300'
                              : 'bg-slate-100'
                          }`}
                        />
                        {/* Label every 4 hours for readability */}
                        <span className="text-[8px] text-slate-400 font-mono truncate w-full text-center">
                          {idx % 4 === 0 ? bucket.label.slice(0, 2) : ''}
                        </span>
                      </div>
                    );
                  });
                })()}
              </div>
              <div className="flex items-center justify-between pt-2 text-[11px] text-slate-400 font-mono">
                <span>00:00 (Midnight)</span>
                <span>12:00 (Noon)</span>
                <span>23:00</span>
              </div>
            </div>
          ) : (
            <div className="py-12 text-center text-slate-400 text-xs italic space-y-1">
              <Clock className="w-8 h-8 text-slate-300 mx-auto" />
              <p>No hourly events recorded in this period.</p>
              <p className="text-[11px] text-slate-400">Intraday completions will appear across the 24-hour spectrum.</p>
            </div>
          )}
        </div>
      </div>

      {/* 7. Personnel Performance Ledger Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Ledger Header & Exact Section Label */}
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/70 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900">
                Personnel Performance Ledger
              </h2>
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-200/80 text-slate-700">
                ({activeCountInPeriod} active in period)
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Comprehensive personnel activity log. Registered employees remain visible with zero-activity status unless explicitly filtered.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs font-bold px-2.5 py-1 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200 tracking-wide">
              PostgreSQL Real-Time Aggregate
            </span>
          </div>
        </div>

        {/* Ledger Toolbar: Search, Active Only Toggle, Page Size */}
        <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-white text-xs">
          <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[260px]">
            {/* Search Input */}
            <div className="relative flex-1 max-w-sm">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={ledgerSearch}
                onChange={e => {
                  setLedgerSearch(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Search by ID, name, or department..."
                className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Filter: Only show active in period */}
            <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={onlyActiveInPeriod}
                onChange={e => {
                  setOnlyActiveInPeriod(e.target.checked);
                  setCurrentPage(1);
                }}
                className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
              />
              <span>Only Show Active in Period</span>
            </label>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-500 text-xs font-medium">Rows per page:</span>
            <select
              value={pageSize}
              onChange={e => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="py-1 px-2 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
          </div>
        </div>

        {/* Ledger Table Content */}
        {isLoading ? (
          <div className="py-20 text-center">
            <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-xs font-semibold text-slate-600">Compiling real-time PostgreSQL performance aggregate...</p>
          </div>
        ) : paginatedEmployees.length === 0 ? (
          <div className="py-16 text-center text-slate-500 space-y-2">
            <AlertTriangle className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="text-sm font-semibold text-slate-700">No personnel records match the current filters</p>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              {onlyActiveInPeriod
                ? 'No personnel recorded qualifying work events in this timeframe. Uncheck "Only Show Active in Period" to see registered staff.'
                : 'No performance employees registered or found.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100/90 text-slate-600 font-semibold border-b border-slate-200 uppercase tracking-wider text-[10px]">
                <tr>
                  <th
                    className="py-3 px-4 cursor-pointer hover:text-slate-900 select-none"
                    onClick={() => {
                      if (sortField === 'emp_id') {
                        setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                      } else {
                        setSortField('emp_id');
                        setSortOrder('asc');
                      }
                    }}
                  >
                    <div className="flex items-center gap-1">
                      <span>Employee ID</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th
                    className="py-3 px-4 cursor-pointer hover:text-slate-900 select-none"
                    onClick={() => {
                      if (sortField === 'name') {
                        setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                      } else {
                        setSortField('name');
                        setSortOrder('asc');
                      }
                    }}
                  >
                    <div className="flex items-center gap-1">
                      <span>Personnel Name</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th className="py-3 px-4">Department / Designation</th>
                  <th
                    className="py-3 px-4 text-center cursor-pointer hover:text-slate-900 select-none"
                    onClick={() => {
                      if (sortField === 'event_count') {
                        setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                      } else {
                        setSortField('event_count');
                        setSortOrder('desc');
                      }
                    }}
                  >
                    <div className="flex items-center justify-center gap-1">
                      <span>Qualifying Events</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th className="py-3 px-4">Source Breakdown</th>
                  <th className="py-3 px-4">First Activity</th>
                  <th
                    className="py-3 px-4 cursor-pointer hover:text-slate-900 select-none"
                    onClick={() => {
                      if (sortField === 'latest_activity') {
                        setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                      } else {
                        setSortField('latest_activity');
                        setSortOrder('desc');
                      }
                    }}
                  >
                    <div className="flex items-center gap-1">
                      <span>Latest Activity</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th className="py-3 px-4 text-center">Last Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {paginatedEmployees.map(emp => {
                  const hasActivity = emp.completed_count > 0;
                  return (
                    <tr
                      key={emp.emp_id || emp.raw_id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        !hasActivity ? 'bg-slate-50/40 text-slate-400' : ''
                      }`}
                    >
                      {/* Employee ID */}
                      <td className="py-3 px-4 font-mono font-bold text-slate-700">
                        {emp.emp_id || emp.employee_id}
                      </td>

                      {/* Personnel Name */}
                      <td className="py-3 px-4 font-semibold text-slate-900">
                        <div className={!hasActivity ? 'text-slate-600' : ''}>
                          {emp.name || `${emp.first_name || ''} ${emp.last_name || ''}`.trim() || `Employee #${emp.emp_id}`}
                        </div>
                      </td>

                      {/* Department & Designation */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200 text-[11px] font-medium">
                            {emp.department || '—'}
                          </span>
                          {emp.designation && (
                            <span className="text-[11px] text-slate-400">
                              {emp.designation}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Qualifying Event Count */}
                      <td className="py-3 px-4 text-center">
                        <span className={`inline-block px-2.5 py-1 rounded-lg font-bold text-xs ${
                          hasActivity
                            ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                            : 'bg-slate-100 text-slate-400'
                        }`}>
                          {emp.completed_count}
                        </span>
                      </td>

                      {/* Source Breakdown (HW vs Test) */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2 text-[11px]">
                          <span className="inline-flex items-center gap-1 text-sky-700 font-medium">
                            <Cpu className="w-3 h-3 text-sky-500" />
                            <span>{emp.hardware_count} HW</span>
                          </span>
                          {includeSimulated && (
                            <>
                              <span className="text-slate-300">•</span>
                              <span className="inline-flex items-center gap-1 text-purple-700 font-medium">
                                <Zap className="w-3 h-3 text-purple-500" />
                                <span>{emp.simulated_count} Test</span>
                              </span>
                            </>
                          )}
                        </div>
                      </td>

                      {/* First Activity Timestamp */}
                      <td className="py-3 px-4 text-slate-600 text-[11px]">
                        {emp.first_event ? new Date(emp.first_event).toLocaleString() : '—'}
                      </td>

                      {/* Latest Activity Timestamp */}
                      <td className="py-3 px-4 text-slate-800 font-semibold text-[11px]">
                        {emp.last_event ? new Date(emp.last_event).toLocaleString() : '—'}
                      </td>

                      {/* Last Event Source Badge */}
                      <td className="py-3 px-4 text-center">
                        {emp.last_source === 'HARDWARE' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            <Cpu className="w-3 h-3" />
                            <span>HARDWARE</span>
                          </span>
                        ) : emp.last_source === 'SIMULATED' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                            <Zap className="w-3 h-3" />
                            <span>SIMULATED</span>
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs font-mono">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Ledger Pagination Footer */}
        <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50/70 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
          <div>
            Showing <strong className="font-semibold text-slate-900">{totalLedgerItems === 0 ? 0 : (currentPage - 1) * pageSize + 1}</strong> to{' '}
            <strong className="font-semibold text-slate-900">{Math.min(currentPage * pageSize, totalLedgerItems)}</strong> of{' '}
            <strong className="font-semibold text-slate-900">{totalLedgerItems}</strong> personnel
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="p-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:pointer-events-none transition-colors cursor-pointer"
              title="Previous page"
            >
              <ChevronLeft className="w-4 h-4 text-slate-600" />
            </button>
            <span className="font-semibold text-slate-700 px-2">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="p-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:pointer-events-none transition-colors cursor-pointer"
              title="Next page"
            >
              <ChevronRight className="w-4 h-4 text-slate-600" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
