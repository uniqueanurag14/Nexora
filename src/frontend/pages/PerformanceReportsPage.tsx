import React, { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft,
  Download,
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
  FileSpreadsheet,
} from 'lucide-react';
import { PerformanceReportData, PerformanceEmployee } from '../types';
import { api } from '../services/api';

interface PerformanceReportsPageProps {
  onNavigate: (route: string) => void;
}

export const PerformanceReportsPage: React.FC<PerformanceReportsPageProps> = ({
  onNavigate,
}) => {
  const [period, setPeriod] = useState<string>('daily');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('all');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('all');
  const [includeSimulated, setIncludeSimulated] = useState<boolean>(false);
  const [reportData, setReportData] = useState<PerformanceReportData | null>(
    null,
  );
  const [employeesList, setEmployeesList] = useState<PerformanceEmployee[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Load employee directory for filter dropdown
  useEffect(() => {
    api
      .getPerformanceEmployees('all')
      .then((res) => {
        if (res.success && res.data) {
          setEmployeesList(res.data);
        }
      })
      .catch(() => {});
  }, []);

  const fetchReports = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await api.getPerformanceReports({
        period,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
        employee_id:
          selectedEmployeeId !== 'all' ? selectedEmployeeId : undefined,
        department:
          selectedDepartment !== 'all' ? selectedDepartment : undefined,
        include_simulated: includeSimulated,
      });

      if (res.success && res.data) {
        setReportData(res.data);
      }
    } catch (err) {
      console.error('Failed to load performance reports:', err);
    } finally {
      setIsLoading(false);
    }
  }, [
    period,
    startDate,
    endDate,
    selectedEmployeeId,
    selectedDepartment,
    includeSimulated,
  ]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  // Extract unique departments
  const departments = Array.from(
    new Set(employeesList.map((e) => e.department).filter(Boolean)),
  );

  const handleExportCSV = () => {
    const url = api.getPerformanceExportUrl({
      period,
      start_date: startDate || undefined,
      end_date: endDate || undefined,
      include_simulated: includeSimulated,
    });
    window.location.href = url;
  };

  // Find top performer
  const topPerformer =
    reportData?.employees && reportData.employees.length > 0
      ? reportData.employees[0]
      : null;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header & Breadcrumb */}
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
              <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-800 border border-indigo-200">
                Performance Analytics
              </span>
              <span className="text-slate-300">•</span>
              <span className="text-xs font-semibold text-slate-500">
                Toy BiZ ltd
              </span>
            </div>
          </div>

          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight mt-2 flex items-center gap-2.5">
            <BarChart2 className="w-6 h-6 text-indigo-600" />
            <span>Workforce Performance Reports</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Aggregated audit reporting across daily, weekly, and monthly
            periods. Track shift completions, hardware terminals, and personnel
            output.
          </p>
        </div>

        {/* Action Button: Export to CSV */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={handleExportCSV}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs hover:shadow-md transition-all cursor-pointer active:scale-95"
            title="Download formatted CSV report of current data"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Export to CSV</span>
          </button>
        </div>
      </div>

      {/* Troubleshooting Warning Banner when Simulated events are included */}
      {includeSimulated && (
        <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-xl flex items-center gap-3 text-amber-900 text-xs animate-in slide-in-from-top-1 duration-200">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
          <div className="flex-1">
            <strong>Troubleshooting Mode Active:</strong> Simulated test events
            are currently included in calculations. Official production reports
            exclude simulated events by default to maintain audit compliance.
          </div>
          <button
            onClick={() => setIncludeSimulated(false)}
            className="px-2.5 py-1 rounded-lg bg-amber-200/80 hover:bg-amber-300 text-amber-950 font-bold text-[11px] transition-colors"
          >
            Exclude Simulated
          </button>
        </div>
      )}

      {/* Filter Controls Panel */}
      <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Period selector */}
          <div className="flex items-center rounded-xl bg-slate-100 p-0.5 border border-slate-200 text-xs font-semibold">
            {[
              { id: 'daily', label: 'Daily (Today)' },
              { id: 'weekly', label: 'Weekly (This Week)' },
              { id: 'monthly', label: 'Monthly (This Month)' },
              { id: 'custom', label: 'Custom Range' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setPeriod(tab.id)}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  period === tab.id
                    ? 'bg-white text-indigo-700 shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
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
              onChange={(e) => setIncludeSimulated(e.target.checked)}
              className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
            />
            <span>Include Simulated Events (Troubleshooting)</span>
          </label>
        </div>

        {/* Custom date range & filters */}
        <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center gap-3 text-xs">
          {period === 'custom' && (
            <div className="flex items-center gap-2">
              <span className="text-slate-500 font-medium">Date Range:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="py-1.5 px-2.5 rounded-lg border border-slate-300 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <span className="text-slate-400">to</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="py-1.5 px-2.5 rounded-lg border border-slate-300 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          )}

          {/* Employee Filter */}
          <div className="flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={selectedEmployeeId}
              onChange={(e) => setSelectedEmployeeId(e.target.value)}
              className="py-1.5 px-2.5 rounded-lg border border-slate-300 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">All Employees</option>
              {employeesList.map((emp) => (
                <option
                  key={emp.id}
                  value={emp.emp_id || emp.employee_id || String(emp.id)}
                >
                  {emp.name} ({emp.emp_id || emp.employee_id})
                </option>
              ))}
            </select>
          </div>

          {/* Department Filter */}
          <div className="flex items-center gap-1.5">
            <Building className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={selectedDepartment}
              onChange={(e) => setSelectedDepartment(e.target.value)}
              className="py-1.5 px-2.5 rounded-lg border border-slate-300 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">All Departments</option>
              {departments.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => fetchReports()}
            className="p-1.5 rounded-lg border border-slate-300 text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors ml-auto"
            title="Refresh reports"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Events */}
        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold text-slate-500 truncate">
              Total Work Events
            </div>
            <div className="text-2xl font-extrabold text-slate-900">
              {reportData?.stats.total_events ?? 0}
            </div>
            <div className="text-[11px] text-slate-400 capitalize">
              {period} aggregate
            </div>
          </div>
        </div>

        {/* Active Personnel */}
        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center shrink-0">
            <Users className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold text-slate-500 truncate">
              Active Personnel
            </div>
            <div className="text-2xl font-extrabold text-sky-600">
              {reportData?.stats.active_employees ?? 0}
            </div>
            <div className="text-[11px] text-slate-400">Recorded output</div>
          </div>
        </div>

        {/* Hardware vs Simulated breakdown */}
        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <Cpu className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold text-slate-500 truncate">
              Hardware Verified
            </div>
            <div className="text-2xl font-extrabold text-emerald-600">
              {reportData?.stats.hardware_events ?? 0}
            </div>
            <div className="text-[11px] text-slate-400">
              {includeSimulated
                ? `${reportData?.stats.simulated_events ?? 0} simulated test`
                : 'Production mode'}
            </div>
          </div>
        </div>

        {/* Top Performer */}
        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-slate-500 truncate">
              Top Performing Personnel
            </div>
            <div className="text-sm font-bold text-slate-900 truncate">
              {topPerformer ? topPerformer.name : 'No data'}
            </div>
            <div className="text-[11px] text-slate-400 truncate">
              {topPerformer
                ? `${topPerformer.completed_count} completions`
                : 'No events in period'}
            </div>
          </div>
        </div>
      </div>

      {/* Visual Activity Trend Chart */}
      <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-indigo-600" />
            <h2 className="text-sm font-bold text-slate-900">
              Activity Trend Over Time
            </h2>
          </div>
          <span className="text-xs text-slate-400 font-medium capitalize">
            {period === 'daily'
              ? 'Hourly Activity Distribution'
              : 'Daily Output Breakdown'}
          </span>
        </div>

        {reportData?.trend && reportData.trend.length > 0 ? (
          <div className="pt-2">
            <div className="h-44 flex items-end gap-2 sm:gap-3 border-b border-slate-200 pb-2 overflow-x-auto">
              {(() => {
                const maxVal = Math.max(
                  ...reportData.trend.map((t) => t.event_count),
                  1,
                );
                return reportData.trend.map((point, idx) => {
                  const heightPercent = Math.max(
                    (point.event_count / maxVal) * 100,
                    8,
                  );
                  return (
                    <div
                      key={idx}
                      className="flex-1 min-w-[36px] flex flex-col items-center gap-1.5 group relative"
                    >
                      {/* Tooltip on hover */}
                      <div className="absolute bottom-full mb-2 hidden group-hover:flex flex-col items-center z-20 pointer-events-none">
                        <div className="bg-slate-900 text-white text-[10px] font-semibold py-1 px-2 rounded shadow-lg whitespace-nowrap">
                          <div>Bucket: {point.time_bucket}</div>
                          <div>Total: {point.event_count} events</div>
                          <div>Hardware: {point.hardware_count}</div>
                          {includeSimulated && (
                            <div>Simulated: {point.simulated_count}</div>
                          )}
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
          </div>
        ) : (
          <div className="py-8 text-center text-slate-400 text-xs italic">
            No activity points recorded in this timeframe. Trigger a test event
            or choose a different date range.
          </div>
        )}
      </div>

      {/* Detailed Employee Breakdown Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-slate-900">
              Personnel Performance Ledger
            </h2>
            <span className="text-xs text-slate-500">
              ({reportData?.employees.length || 0} active in period)
            </span>
          </div>

          <div className="text-[11px] text-slate-500 font-medium">
            Real-Time Aggregate
          </div>
        </div>

        {isLoading ? (
          <div className="py-16 text-center">
            <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-xs font-semibold text-slate-500">
              Compiling performance audit metrics...
            </p>
          </div>
        ) : !reportData || reportData.employees.length === 0 ? (
          <div className="py-16 text-center text-slate-500">
            <AlertTriangle className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-700">
              No performance records for selected filters
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {includeSimulated
                ? 'No completions found for this date range.'
                : 'No hardware-verified events. Toggle "Include Simulated Events" if you want to inspect test records.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100/90 text-slate-600 font-semibold border-b border-slate-200 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-4">Employee ID</th>
                  <th className="py-3 px-4">Personnel Name</th>
                  <th className="py-3 px-4">Department</th>
                  <th className="py-3 px-4 text-center">Completions Count</th>
                  <th className="py-3 px-4">Source Breakdown</th>
                  <th className="py-3 px-4">First Activity</th>
                  <th className="py-3 px-4">Latest Activity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {reportData.employees.map((row) => (
                  <tr
                    key={row.raw_id}
                    className="hover:bg-slate-50/80 transition-colors"
                  >
                    <td className="py-3 px-4 font-mono font-bold text-slate-700">
                      {row.employee_id}
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-900">
                      <div>{row.name}</div>
                      {row.email ? (
                        <div className="text-[11px] text-slate-400 font-normal">
                          {row.email}
                        </div>
                      ) : null}
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200 text-[11px] font-medium">
                        {row.department}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center font-bold text-indigo-600 text-sm">
                      {row.completed_count}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5 text-[11px]">
                        <span className="inline-flex items-center gap-1 text-sky-700 font-medium">
                          <Cpu className="w-3 h-3" />
                          <span>{row.hardware_count} HW</span>
                        </span>
                        {includeSimulated && (
                          <>
                            <span className="text-slate-300">•</span>
                            <span className="inline-flex items-center gap-1 text-purple-700 font-medium">
                              <Zap className="w-3 h-3" />
                              <span>{row.simulated_count} Test</span>
                            </span>
                          </>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      {row.first_event
                        ? new Date(row.first_event).toLocaleString()
                        : '—'}
                    </td>
                    <td className="py-3 px-4 text-slate-600 font-semibold">
                      {row.last_event
                        ? new Date(row.last_event).toLocaleString()
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
