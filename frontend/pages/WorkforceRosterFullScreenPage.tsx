import React, { useState, useEffect, useCallback, useRef } from 'react';
import { buildSseUrl } from '../config/apiConfig';
import {
  Maximize2,
  Minimize2,
  X,
  Search,
  Building,
  RefreshCw,
  Clock,
  Cpu,
  Zap,
  Radio,
  ArrowLeft,
  Sparkles,
  Info,
  SlidersHorizontal,
} from 'lucide-react';
import { PerformanceEmployee } from '../types';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
  getPerformanceTier,
  getTierStyle,
  DEFAULT_TIER_CONFIGS,
  PerformanceTier,
} from '../utils/performanceThresholds';

interface WorkforceRosterFullScreenPageProps {
  onNavigate: (route: string) => void;
}

export const WorkforceRosterFullScreenPage: React.FC<WorkforceRosterFullScreenPageProps> = ({
  onNavigate,
}) => {
  const { branding } = useAuth();
  const [employees, setEmployees] = useState<PerformanceEmployee[]>([]);
  const [period, setPeriod] = useState<string>('today');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isLiveConnected, setIsLiveConnected] = useState<boolean>(false);
  const [isBrowserFullscreen, setIsBrowserFullscreen] = useState<boolean>(false);
  const [highlightedEmpId, setHighlightedEmpId] = useState<number | null>(null);
  const [lastNotification, setLastNotification] = useState<{
    text: string;
    timestamp: string;
  } | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);

  // Load live employees from API
  const fetchData = useCallback(async (selectedPeriod: string = period) => {
    try {
      const empRes = await api.getPerformanceEmployees(selectedPeriod);
      if (empRes.success && empRes.data) {
        setEmployees(empRes.data);
      }
    } catch (err) {
      console.error('Failed to load full-screen roster data:', err);
    } finally {
      setIsLoading(false);
    }
  }, [period]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Request browser full-screen on mount if allowed
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsBrowserFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    setIsBrowserFullscreen(!!document.fullscreenElement);

    // Keyboard Escape listener to exit fullscreen view
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        } else {
          handleExit();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const toggleBrowserFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.warn('Fullscreen request blocked or not permitted:', err.message);
      });
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const handleExit = () => {
    // If opened in separate window/popup, try closing it
    if (window.opener && window.opener !== window) {
      window.close();
    } else {
      onNavigate('/workforce/performance/live');
    }
  };

  // SSE real-time work-completion subscription
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
          const empId = Number(recordedEvent.employee_id) || Number(payload.employee?.id);
          const targetEmpIdStr = recordedEvent.emp_id || payload.employee?.emp_id;

          setHighlightedEmpId(empId);
          setTimeout(() => setHighlightedEmpId(null), 3000);

          setLastNotification({
            text: `Work completion recorded for ${payload.employee?.name || `Employee #${targetEmpIdStr || empId}`}`,
            timestamp: new Date().toLocaleTimeString(),
          });

          setEmployees((prevList) => {
            const index = prevList.findIndex(
              (e) => e.id === empId || (targetEmpIdStr && (e.emp_id === targetEmpIdStr || e.employee_id === targetEmpIdStr))
            );

            if (index === -1) {
              fetchData();
              return prevList;
            }

            const current = prevList[index];
            const updated: PerformanceEmployee = {
              ...current,
              today_count: (current.today_count || 0) + 1,
              period_count: (current.period_count || 0) + 1,
              total_count: (current.total_count || 0) + 1,
              last_event_timestamp: recordedEvent.event_timestamp || new Date().toISOString(),
              last_event_source: recordedEvent.source || 'HARDWARE',
              last_device_id: recordedEvent.device_id || null,
            };

            const nextList = [...prevList];
            nextList[index] = updated;

            // Sort immediately: newest timestamp at the top
            nextList.sort((a, b) => {
              if (a.last_event_timestamp && b.last_event_timestamp) {
                const diff =
                  new Date(b.last_event_timestamp).getTime() - new Date(a.last_event_timestamp).getTime();
                if (diff !== 0) return diff;
                return a.id - b.id;
              }
              if (a.last_event_timestamp && !b.last_event_timestamp) return -1;
              if (!a.last_event_timestamp && b.last_event_timestamp) return 1;
              return a.id - b.id;
            });

            return nextList;
          });
        }
      } catch {
        // Ping or heartbeats
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

  // Filter employees
  const departments = Array.from(new Set(employees.map((e) => e.department).filter(Boolean)));

  const filteredEmployees = employees.filter((emp) => {
    const displayName =
      emp.display_name || emp.name || `${emp.first_name || ''} ${emp.last_name || ''}`.trim();
    const empIdStr = emp.emp_id || emp.employee_id || `EMP-${emp.id}`;
    const q = searchQuery.toLowerCase();

    const matchesSearch =
      displayName.toLowerCase().includes(q) || empIdStr.toLowerCase().includes(q);
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

  const currentTierConfig = DEFAULT_TIER_CONFIGS[period] || DEFAULT_TIER_CONFIGS.today;

  // Counts per tier
  const tierCounts: Record<PerformanceTier, number> = {
    high: 0,
    medium: 0,
    low: 0,
    inactive: 0,
  };

  filteredEmployees.forEach((emp) => {
    const count =
      period === 'today'
        ? emp.today_count
        : period === 'week'
        ? emp.week_count
        : period === 'month'
        ? emp.month_count
        : emp.period_count || emp.total_count || 0;
    const tier = getPerformanceTier(count, period, currentTierConfig);
    tierCounts[tier]++;
  });

  return (
    <div className="h-screen w-screen bg-slate-900 text-slate-100 flex flex-col overflow-hidden select-none font-sans">
      {/* Top Banner & Control Strip */}
      <header className="bg-slate-950/90 border-b border-slate-800 px-4 py-2.5 shrink-0 flex flex-wrap items-center justify-between gap-3 shadow-md z-20">
        {/* Left: Branding & Status */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleExit}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-colors cursor-pointer border border-slate-700 active:scale-95"
            title="Exit full-screen view (Esc)"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Exit Full Screen</span>
          </button>

          <div className="h-4 w-px bg-slate-800 hidden sm:block" />

          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-sm text-white tracking-tight">{branding.appName || 'Nexora'}</span>
              {branding.companyName && (
                <>
                  <span className="text-slate-500">•</span>
                  <span className="text-xs text-slate-300 font-semibold">{branding.companyName}</span>
                </>
              )}
              <span className="text-xs font-bold px-2 py-0.5 rounded bg-sky-950 text-sky-300 border border-sky-800">
                Workforce Roster & Activity Stream [Full Screen]
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-900 border border-slate-800">
            <span
              className={`w-2 h-2 rounded-full ${
                isLiveConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
              }`}
            />
            <span className={isLiveConnected ? 'text-emerald-300' : 'text-amber-300'}>
              {isLiveConnected ? 'Live Real-Time Stream' : 'Connecting'}
            </span>
          </div>
        </div>

        {/* Center: Period Tabs */}
        <div className="flex items-center rounded-lg bg-slate-850 p-0.5 border border-slate-800 text-xs font-semibold">
          {[
            { id: 'today', label: 'Today' },
            { id: 'week', label: 'This Week' },
            { id: 'month', label: 'This Month' },
            { id: 'all', label: 'All Time' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => handlePeriodChange(tab.id)}
              className={`px-3 py-1 rounded-md transition-all ${
                period === tab.id
                  ? 'bg-sky-600 text-white font-bold shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Right: Search, Filter, Fullscreen Toggle */}
        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search roster..."
              className="pl-8 pr-3 py-1 text-xs rounded-lg bg-slate-900 border border-slate-800 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500 w-36 sm:w-48"
            />
          </div>

          {/* Department Filter */}
          <select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            className="text-xs py-1 px-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 focus:outline-none focus:border-sky-500"
          >
            <option value="all">All Departments</option>
            {departments.map((dept) => (
              <option key={dept} value={dept}>
                {dept}
              </option>
            ))}
          </select>

          {/* Browser Fullscreen toggle button */}
          <button
            onClick={toggleBrowserFullscreen}
            className="p-1.5 rounded-lg bg-slate-850 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
            title={isBrowserFullscreen ? 'Exit browser fullscreen (Esc)' : 'Enter browser fullscreen'}
          >
            {isBrowserFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          <button
            onClick={() => fetchData()}
            className="p-1.5 rounded-lg bg-slate-850 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white transition-colors"
            title="Refresh records"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Realtime Notification Banner */}
      {lastNotification && (
        <div className="px-4 py-1.5 bg-indigo-950/80 border-b border-indigo-800/60 flex items-center justify-between text-xs text-indigo-200">
          <div className="flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <span>
              <strong>Real-Time Update:</strong> {lastNotification.text} at {lastNotification.timestamp}
            </span>
          </div>
          <span className="text-[10px] font-bold text-indigo-300 bg-indigo-900/60 px-2 py-0.5 rounded">
            Live Event
          </span>
        </div>
      )}

      {/* Performance Tier Color Legend */}
      <div className="bg-slate-950 px-4 py-2 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-4">
          <span className="text-slate-400 font-semibold flex items-center gap-1.5">
            <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400" />
            <span>Performance Legend:</span>
          </span>

          {/* High Tier */}
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-emerald-500 border border-emerald-400" />
            <span className="font-bold text-emerald-400">High Output</span>
            <span className="text-slate-400 text-[11px]">
              (≥ {currentTierConfig.highThreshold} completions) •{' '}
              <strong className="text-emerald-300">{tierCounts.high}</strong>
            </span>
          </div>

          {/* Medium Tier */}
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-amber-500 border border-amber-400" />
            <span className="font-bold text-amber-400">Medium Output</span>
            <span className="text-slate-400 text-[11px]">
              ({currentTierConfig.mediumThreshold}-{currentTierConfig.highThreshold - 1} completions) •{' '}
              <strong className="text-amber-300">{tierCounts.medium}</strong>
            </span>
          </div>

          {/* Low Tier */}
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-rose-500 border border-rose-400" />
            <span className="font-bold text-rose-400">Low Output</span>
            <span className="text-slate-400 text-[11px]">
              (1 completion) • <strong className="text-rose-300">{tierCounts.low}</strong>
            </span>
          </div>

          {/* No Activity */}
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-slate-600 border border-slate-500" />
            <span className="font-bold text-slate-300">No Activity</span>
            <span className="text-slate-400 text-[11px]">
              (0 completions) • <strong className="text-slate-300">{tierCounts.inactive}</strong>
            </span>
          </div>
        </div>

        <div className="text-[11px] text-slate-400 font-medium">
          Total in view: <strong className="text-slate-200">{filteredEmployees.length}</strong> • Press{' '}
          <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-200 font-mono text-[10px]">
            Esc
          </kbd>{' '}
          to exit
        </div>
      </div>

      {/* Main Table Area (Fills entire available viewport height) */}
      <main className="flex-1 overflow-auto bg-slate-900">
        {isLoading ? (
          <div className="h-full flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <div className="w-10 h-10 border-3 border-sky-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs font-semibold text-slate-400">
                Loading live workforce roster from PostgreSQL...
              </p>
            </div>
          </div>
        ) : filteredEmployees.length === 0 ? (
          <div className="h-full flex items-center justify-center text-center p-8 text-slate-400">
            <div>
              <p className="text-base font-bold text-slate-200">No Active Employees in Roster</p>
              <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                No employees are registered or match the selected filters. Register employees in Employee Registration to monitor floor output.
              </p>
            </div>
          </div>
        ) : (
          <table className="w-full text-left text-xs border-collapse">
            <thead className="sticky top-0 bg-slate-950 text-slate-300 font-bold uppercase tracking-wider text-[11px] border-b border-slate-800 shadow-xs z-10">
              <tr>
                <th className="py-3 px-4 w-14 text-center">Rank</th>
                <th className="py-3 px-4">Employee Identifier & Name</th>
                <th className="py-3 px-4">Department & Role</th>
                <th className="py-3 px-4 text-center">Performance Status</th>
                <th className="py-3 px-4 text-center">
                  {period === 'today'
                    ? "Today's Completions"
                    : period === 'week'
                    ? "This Week's Units"
                    : period === 'month'
                    ? "This Month's Units"
                    : 'Total Completions'}
                </th>
                <th className="py-3 px-4">Latest Recorded Activity</th>
                <th className="py-3 px-4">Event Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {filteredEmployees.map((emp, index) => {
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
                const isHighlighted = highlightedEmpId === emp.id;
                const hasActivity = !!emp.last_event_timestamp;

                // Full-screen dark theme row styling corresponding to performance level
                let rowBgClass = '';
                let rowBorderClass = '';

                if (tier === 'high') {
                  rowBgClass = 'bg-emerald-950/40 hover:bg-emerald-950/60 text-emerald-100';
                  rowBorderClass = 'border-l-6 border-l-emerald-500';
                } else if (tier === 'medium') {
                  rowBgClass = 'bg-amber-950/40 hover:bg-amber-950/60 text-amber-100';
                  rowBorderClass = 'border-l-6 border-l-amber-500';
                } else if (tier === 'low') {
                  rowBgClass = 'bg-rose-950/40 hover:bg-rose-950/60 text-rose-100';
                  rowBorderClass = 'border-l-6 border-l-rose-500';
                } else {
                  rowBgClass = 'bg-slate-900/60 hover:bg-slate-850/80 text-slate-300';
                  rowBorderClass = 'border-l-6 border-l-slate-700';
                }

                return (
                  <tr
                    key={emp.id}
                    className={`transition-all duration-200 ${rowBgClass} ${rowBorderClass} ${
                      isHighlighted ? 'ring-2 ring-indigo-400 ring-inset font-bold' : ''
                    }`}
                  >
                    {/* Rank Index */}
                    <td className="py-3.5 px-4 text-center">
                      <span
                        className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-extrabold ${
                          index === 0 && hasActivity
                            ? 'bg-amber-400 text-slate-950 shadow-sm'
                            : index < 3 && hasActivity
                            ? 'bg-slate-700 text-slate-100'
                            : 'text-slate-500'
                        }`}
                      >
                        {index + 1}
                      </span>
                    </td>

                    {/* Employee Identity */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-slate-800 text-white flex items-center justify-center font-extrabold text-xs shrink-0 border border-slate-700">
                          {(emp.first_name || emp.name || 'E').charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-bold text-sm text-white flex items-center gap-2">
                            <span>{emp.name || emp.display_name}</span>
                            <span className="font-mono text-xs text-sky-400 font-semibold">
                              ({emp.emp_id || emp.employee_id})
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400">{emp.department || '—'}</div>
                        </div>
                      </div>
                    </td>

                    {/* Department & Designation */}
                    <td className="py-3.5 px-4">
                      <div className="font-medium text-slate-200">{emp.department || '—'}</div>
                      <div className="text-[11px] text-slate-400 font-normal">{emp.role || '—'}</div>
                    </td>

                    {/* Performance Status Badge (Accessible text + Color) */}
                    <td className="py-3.5 px-4 text-center">
                      <span
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold tracking-wide ${style.badgeClass}`}
                      >
                        <span className={`w-2 h-2 rounded-full ${style.dotColorClass}`} />
                        <span>{style.label}</span>
                      </span>
                    </td>

                    {/* Completion Count */}
                    <td className="py-3.5 px-4 text-center">
                      <div className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-slate-950/70 border border-slate-800">
                        <span className="text-base font-extrabold text-white">{count}</span>
                        <span className="text-[10px] text-slate-400 uppercase font-semibold">units</span>
                      </div>
                    </td>

                    {/* Most Recent Activity */}
                    <td className="py-3.5 px-4">
                      {hasActivity ? (
                        <div>
                          <div className="font-bold text-slate-100 flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-sky-400" />
                            <span>{formatRelativeTime(emp.last_event_timestamp)}</span>
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                            {new Date(emp.last_event_timestamp!).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit',
                            })}
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-500 italic text-xs">No activity recorded</span>
                      )}
                    </td>

                    {/* Event Source */}
                    <td className="py-3.5 px-4">
                      {hasActivity ? (
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-bold uppercase tracking-wider ${
                            emp.last_event_source === 'HARDWARE'
                              ? 'bg-sky-950 text-sky-300 border border-sky-800'
                              : 'bg-purple-950 text-purple-300 border border-purple-800'
                          }`}
                        >
                          {emp.last_event_source === 'HARDWARE' ? (
                            <Cpu className="w-3.5 h-3.5 text-sky-400" />
                          ) : (
                            <Zap className="w-3.5 h-3.5 text-purple-400" />
                          )}
                          <span>{emp.last_event_source || 'SIMULATED'}</span>
                        </span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </main>
    </div>
  );
};
