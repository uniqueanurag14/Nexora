import React, { useState, useEffect, useCallback, useRef } from 'react';
import { buildSseUrl } from '../config/apiConfig';
import {
  ArrowLeft,
  Zap,
  Radio,
  Users,
  CheckCircle2,
  Clock,
  TrendingUp,
  Cpu,
  Search,
  Filter,
  RefreshCw,
  Building,
  AlertCircle,
  Sparkles,
  UserPlus,
  Maximize2,
  SlidersHorizontal,
} from 'lucide-react';
import { PerformanceEmployee, PerformanceSummary } from '../types';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { TestHardwareModal } from '../components/TestHardwareModal';
import {
  getPerformanceTier,
  getTierStyle,
  DEFAULT_TIER_CONFIGS,
} from '../utils/performanceThresholds';

interface LivePerformancePageProps {
  onNavigate: (route: string) => void;
}

export const LivePerformancePage: React.FC<LivePerformancePageProps> = ({ onNavigate }) => {
  const { branding } = useAuth();
  const [employees, setEmployees] = useState<PerformanceEmployee[]>([]);
  const [summary, setSummary] = useState<PerformanceSummary | null>(null);
  const [period, setPeriod] = useState<string>('today');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isTestModalOpen, setIsTestModalOpen] = useState<boolean>(false);
  const [isLiveConnected, setIsLiveConnected] = useState<boolean>(false);
  const [highlightedEmpId, setHighlightedEmpId] = useState<number | null>(null);
  const [lastNotification, setLastNotification] = useState<{
    text: string;
    timestamp: string;
  } | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);

  // Load initial employees & summary from database
  const fetchData = useCallback(async (selectedPeriod: string = period) => {
    try {
      const [empRes, sumRes] = await Promise.all([
        api.getPerformanceEmployees(selectedPeriod),
        api.getPerformanceSummary(),
      ]);

      if (empRes.success && empRes.data) {
        setEmployees(empRes.data);
      }
      if (sumRes.success && sumRes.data) {
        setSummary(sumRes.data);
      }
    } catch (err) {
      console.error('Failed to fetch live performance data:', err);
    } finally {
      setIsLoading(false);
    }
  }, [period]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle SSE real-time stream
  useEffect(() => {
    const token = typeof window !== 'undefined' ? window.localStorage.getItem('nexora_token') : null;
    const sseUrl = buildSseUrl('/events', token);
    const sse = new EventSource(sseUrl);
    eventSourceRef.current = sse;

    sse.onopen = () => {
      setIsLiveConnected(true);
    };

    sse.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'WORK_EVENT_RECORDED' && payload.event) {
          const recordedEvent = payload.event;
          const empId = Number(recordedEvent.employee_id);

          // Update highlighted state for smooth visual transition
          setHighlightedEmpId(empId);
          setTimeout(() => setHighlightedEmpId(null), 3000);

          setLastNotification({
            text: `Work completion recorded for ${payload.employee?.name || `Employee #${empId}`}`,
            timestamp: new Date().toLocaleTimeString(),
          });

          // Server-authoritative state: immediately re-fetch or re-order
          setEmployees((prevEmployees) => {
            const index = prevEmployees.findIndex(e => e.id === empId);
            if (index === -1) {
              // Fetch full list to incorporate new record
              fetchData();
              return prevEmployees;
            }

            const current = prevEmployees[index];
            const updated: PerformanceEmployee = {
              ...current,
              today_count: current.today_count + 1,
              period_count: current.period_count + 1,
              total_count: current.total_count + 1,
              last_event_timestamp: recordedEvent.event_timestamp,
              last_event_source: recordedEvent.source,
              last_device_id: recordedEvent.device_id,
            };

            const nextList = [...prevEmployees];
            nextList[index] = updated;

            // Re-sort immediately: newest timestamp at the top
            nextList.sort((a, b) => {
              if (a.last_event_timestamp && b.last_event_timestamp) {
                const diff = new Date(b.last_event_timestamp).getTime() - new Date(a.last_event_timestamp).getTime();
                if (diff !== 0) return diff;
                return a.id - b.id;
              }
              if (a.last_event_timestamp && !b.last_event_timestamp) return -1;
              if (!a.last_event_timestamp && b.last_event_timestamp) return 1;
              return a.id - b.id;
            });

            return nextList;
          });

          // Refresh summary stats
          api.getPerformanceSummary().then(res => {
            if (res.success && res.data) setSummary(res.data);
          }).catch(() => {});
        }
      } catch {
        // ping or non-JSON message
      }
    };

    sse.onerror = () => {
      setIsLiveConnected(false);
    };

    return () => {
      sse.close();
      eventSourceRef.current = null;
    };
  }, [fetchData]);

  const handlePeriodChange = (newPeriod: string) => {
    setPeriod(newPeriod);
    setIsLoading(true);
    fetchData(newPeriod);
  };

  // Extract unique departments for filtering
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

  const formatRelativeTime = (isoString: string | null) => {
    if (!isoString) return 'No activity yet';
    const now = Date.now();
    const eventTime = new Date(isoString).getTime();
    const diffSecs = Math.floor((now - eventTime) / 1000);

    if (diffSecs < 5) return 'Just now';
    if (diffSecs < 60) return `${diffSecs}s ago`;
    const diffMins = Math.floor(diffSecs / 60);
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return new Date(isoString).toLocaleDateString();
  };

  const handleOpenFullScreen = () => {
    const fullScreenUrl = `${window.location.origin}/?route=/workforce/performance/live/fullscreen`;
    let popup: Window | null = null;
    try {
      popup = window.open(
        fullScreenUrl,
        'NexoraWorkforceRoster',
        'width=1440,height=900,menubar=no,toolbar=no,location=no,status=no'
      );
      if (popup) {
        popup.focus();
        try {
          popup.document?.documentElement?.requestFullscreen?.();
        } catch {}
      }
    } catch {
      popup = null;
    }

    if (!popup || popup.closed || typeof popup.closed === 'undefined') {
      onNavigate('/workforce/performance/live/fullscreen');
      try {
        document.documentElement.requestFullscreen?.().catch(() => {});
      } catch {}
    }
  };

  const currentTierConfig = DEFAULT_TIER_CONFIGS[period] || DEFAULT_TIER_CONFIGS.today;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Top Header & Action Controls */}
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
            <span>Live Workforce Performance</span>
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                isLiveConnected
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-amber-50 text-amber-700 border border-amber-200'
              }`}
              title={isLiveConnected ? 'Real-time Server-Sent Events sync active' : 'Connecting to live events...'}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  isLiveConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
                }`}
              />
              <span>{isLiveConnected ? 'Live Realtime Sync' : 'Reconnecting'}</span>
            </span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Real-time shop floor work-completion tracking across all registered personnel. Employees are dynamically sorted by their latest activity.
          </p>
        </div>

        {/* Action Buttons: Open Full Screen & Test Hardware Button */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={handleOpenFullScreen}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs bg-slate-900 hover:bg-slate-800 text-white shadow-md hover:shadow-lg transition-all cursor-pointer active:scale-95 border border-slate-700"
            title="Open Workforce Roster & Activity Stream in dedicated full-screen view (or separate window)"
          >
            <Maximize2 className="w-4 h-4 text-sky-400" />
            <span>Open Full Screen</span>
          </button>

          <button
            onClick={() => setIsTestModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs bg-linear-to-r from-indigo-600 via-indigo-700 to-purple-700 text-white shadow-md hover:from-indigo-500 hover:to-purple-600 hover:shadow-lg transition-all cursor-pointer active:scale-95"
            title="Open test hardware simulation terminal popup"
          >
            <Zap className="w-4 h-4 text-amber-300" />
            <span>Test Hardware Button</span>
          </button>
        </div>
      </div>

      {/* Live Event Notification Banner */}
      {lastNotification && (
        <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl flex items-center justify-between gap-3 text-indigo-950 text-xs animate-in slide-in-from-top-1 duration-200">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-600 shrink-0" />
            <span>
              <strong>Real-Time Update:</strong> {lastNotification.text} at {lastNotification.timestamp}
            </span>
          </div>
          <span className="text-[10px] uppercase font-bold text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded">
            Live Event
          </span>
        </div>
      )}

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Eligible Employees */}
        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center shrink-0">
            <Users className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold text-slate-500 truncate">Total Eligible Employees</div>
            <div className="text-2xl font-extrabold text-slate-900">
              {summary ? summary.total_eligible_employees : employees.length}
            </div>
            <div className="text-[11px] text-slate-400">Nexora Active Directory</div>
          </div>
        </div>

        {/* Today's Work Completion Events */}
        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold text-slate-500 truncate">Today's Work Completions</div>
            <div className="text-2xl font-extrabold text-indigo-600">
              {summary ? summary.today_work_events : 0}
            </div>
            <div className="text-[11px] text-slate-400">
              {summary?.today_hardware_events || 0} Hardware • {summary?.today_simulated_events || 0} Test
            </div>
          </div>
        </div>

        {/* Active Contributing Personnel */}
        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold text-slate-500 truncate">Active Today</div>
            <div className="text-2xl font-extrabold text-emerald-600">
              {summary ? summary.active_today_employees : 0}
            </div>
            <div className="text-[11px] text-slate-400">With recorded output</div>
          </div>
        </div>

        {/* Most Recent Event Activity */}
        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
            <Clock className="w-6 h-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-slate-500 truncate">Latest Recorded Event</div>
            <div className="text-sm font-bold text-slate-900 truncate">
              {summary?.latest_event?.employee_name || 'No activity yet'}
            </div>
            <div className="text-[11px] text-slate-400 truncate">
              {summary?.latest_event ? (
                <>
                  {formatRelativeTime(summary.latest_event.timestamp)} •{' '}
                  <span className="uppercase font-semibold text-purple-600">
                    {summary.latest_event.source}
                  </span>
                </>
              ) : (
                'Awaiting first event'
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Filter and Period Selection Bar */}
      <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Left: Search input */}
        <div className="flex-1 relative max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search by employee name, ID, or email..."
            className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-300 bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
        </div>

        {/* Right: Department & Period Filters */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Department Filter */}
          <div className="flex items-center gap-1.5">
            <Building className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={departmentFilter}
              onChange={e => setDepartmentFilter(e.target.value)}
              className="text-xs py-1.5 px-2.5 rounded-xl border border-slate-300 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500"
            >
              <option value="all">All Departments</option>
              {departments.map(dept => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
          </div>

          {/* Period Tabs */}
          <div className="flex items-center rounded-xl bg-slate-100 p-0.5 border border-slate-200 text-xs font-semibold">
            {[
              { id: 'today', label: 'Today' },
              { id: 'week', label: 'This Week' },
              { id: 'month', label: 'This Month' },
              { id: 'all', label: 'All Time' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => handlePeriodChange(tab.id)}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  period === tab.id
                    ? 'bg-white text-slate-900 shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <button
            onClick={() => fetchData()}
            className="p-2 rounded-xl border border-slate-300 text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors"
            title="Refresh employee data"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Employee Performance Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-slate-900">
              Workforce Roster & Activity Stream
            </h2>
            <span className="text-xs text-slate-500">
              ({filteredEmployees.length} {filteredEmployees.length === 1 ? 'employee' : 'employees'})
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-[11px] text-slate-500 font-medium hidden md:block">
              Sorted by <strong className="text-slate-700">Most Recent Activity (Newest First)</strong>
            </div>

            <button
              onClick={handleOpenFullScreen}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs bg-slate-900 hover:bg-slate-800 text-white shadow-2xs transition-all cursor-pointer active:scale-95 border border-slate-700"
              title="Open Workforce Roster in full-screen view (or separate window)"
            >
              <Maximize2 className="w-3.5 h-3.5 text-sky-400" />
              <span>Open Full Screen</span>
            </button>
          </div>
        </div>

        {/* Compact Performance Tier Legend */}
        <div className="px-6 py-2 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-4">
            <span className="text-slate-500 font-semibold flex items-center gap-1">
              <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400" />
              <span>Performance Legend:</span>
            </span>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500" />
              <span className="font-bold text-emerald-800">High Output</span>
              <span className="text-slate-400 text-[11px]">(≥ {currentTierConfig.highThreshold} units)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-amber-500" />
              <span className="font-bold text-amber-800">Medium Output</span>
              <span className="text-slate-400 text-[11px]">({currentTierConfig.mediumThreshold}-{currentTierConfig.highThreshold - 1} units)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-rose-500" />
              <span className="font-bold text-rose-800">Low Output</span>
              <span className="text-slate-400 text-[11px]">(1 unit)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-slate-400" />
              <span className="font-bold text-slate-600">No Activity</span>
              <span className="text-slate-400 text-[11px]">(0 units)</span>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="py-16 text-center">
            <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-xs font-semibold text-slate-500">Loading workforce performance records from PostgreSQL...</p>
          </div>
        ) : employees.length === 0 ? (
          <div className="py-16 text-center text-slate-500">
            <Users className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-bold text-slate-800">No Performance Employees Registered</p>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              No personnel are currently in the performance roster. Register employees to start tracking floor activities.
            </p>
            <button
              onClick={() => onNavigate('/workforce/performance/registration')}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-sky-600 hover:bg-sky-700 text-white shadow-xs transition-colors cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Go to Employee Registration</span>
            </button>
          </div>
        ) : filteredEmployees.length === 0 ? (
          <div className="py-16 text-center text-slate-500">
            <AlertCircle className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-700">No matching employees found</p>
            <p className="text-xs text-slate-400 mt-1">Adjust your search parameters or filter criteria.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100/90 text-slate-600 font-semibold border-b border-slate-200 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-4 w-12 text-center">#</th>
                  <th className="py-3 px-4">Employee</th>
                  <th className="py-3 px-4">Department</th>
                  <th className="py-3 px-4 text-center">Performance Status</th>
                  <th className="py-3 px-4 text-center">
                    {period === 'today' ? "Today's Output" : period === 'week' ? "This Week" : period === 'month' ? "This Month" : "All Time"}
                  </th>
                  <th className="py-3 px-4">Most Recent Activity</th>
                  <th className="py-3 px-4">Event Source</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredEmployees.map((emp, index) => {
                  const hasActivity = !!emp.last_event_timestamp;
                  const isHighlighted = highlightedEmpId === emp.id;
                  const count =
                    period === 'today'
                      ? emp.today_count
                      : period === 'week'
                      ? emp.week_count
                      : period === 'month'
                      ? emp.month_count
                      : emp.period_count || emp.total_count || 0;
                  const tier = getPerformanceTier(count, period, currentTierConfig);
                  const style = getTierStyle(tier);

                  return (
                    <tr
                      key={emp.id}
                      className={`transition-all duration-300 ${style.borderLeftClass} ${
                        isHighlighted
                          ? 'bg-indigo-100/90 font-semibold ring-2 ring-indigo-400 ring-inset'
                          : `${style.rowClass} ${style.rowHoverClass}`
                      }`}
                    >
                      {/* Rank Index */}
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold ${
                            index === 0 && hasActivity
                              ? 'bg-amber-100 text-amber-800 border border-amber-300'
                              : index < 3 && hasActivity
                              ? 'bg-slate-200 text-slate-800'
                              : 'text-slate-400'
                          }`}
                        >
                          {index + 1}
                        </span>
                      </td>

                      {/* Employee Info */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-xs shrink-0">
                            {(emp.first_name || emp.name || 'E').charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900 flex items-center gap-1.5">
                              <span>{emp.name || emp.display_name}</span>
                              <span className="font-mono text-[10px] text-slate-400 font-normal">
                                ({emp.emp_id || emp.employee_id})
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-400">{emp.department || '—'}</div>
                          </div>
                        </div>
                      </td>

                      {/* Department */}
                      <td className="py-3 px-4 font-medium text-slate-700">
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200 text-[11px]">
                          {emp.department || '—'}
                        </span>
                      </td>

                      {/* Performance Status Badge */}
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${style.badgeClass}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${style.dotColorClass}`} />
                          <span>{style.label}</span>
                        </span>
                      </td>

                      {/* Work Count for Period */}
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`inline-flex items-center justify-center px-3 py-1 rounded-full text-xs font-bold ${
                            emp.period_count > 0
                              ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                              : 'bg-slate-100 text-slate-400'
                          }`}
                        >
                          {emp.period_count} completions
                        </span>
                      </td>

                      {/* Most Recent Activity */}
                      <td className="py-3 px-4">
                        {hasActivity ? (
                          <div>
                            <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                              <Clock className="w-3.5 h-3.5 text-indigo-500" />
                              <span>{formatRelativeTime(emp.last_event_timestamp)}</span>
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                              {new Date(emp.last_event_timestamp!).toLocaleString()}
                            </div>
                          </div>
                        ) : (
                          <div className="text-slate-400 italic text-[11px]">
                            No activity recorded yet
                          </div>
                        )}
                      </td>

                      {/* Event Source */}
                      <td className="py-3 px-4">
                        {hasActivity ? (
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                              emp.last_event_source === 'HARDWARE'
                                ? 'bg-sky-50 text-sky-700 border border-sky-300'
                                : 'bg-purple-50 text-purple-700 border border-purple-300'
                            }`}
                          >
                            {emp.last_event_source === 'HARDWARE' ? (
                              <Cpu className="w-3 h-3 text-sky-600" />
                            ) : (
                              <Zap className="w-3 h-3 text-purple-600" />
                            )}
                            <span>{emp.last_event_source || 'SIMULATED'}</span>
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>

                      {/* Action: Quick Test Trigger */}
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => setIsTestModalOpen(true)}
                          className="px-2.5 py-1 rounded-lg text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 border border-indigo-200 font-bold text-xs transition-colors"
                          title="Open hardware test popup"
                        >
                          Trigger Event
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

      {/* Hardware Test Terminal Modal */}
      <TestHardwareModal
        isOpen={isTestModalOpen}
        onClose={() => setIsTestModalOpen(false)}
        employees={employees}
        onEventSuccess={() => {
          fetchData();
        }}
      />
    </div>
  );
};
