import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { UserAvatar } from '../components/UserAvatar';
import { getDisplayName } from '../utils/userUtils';
import {
  DashboardFilterBar,
  DashboardFilterOptions,
  DashboardFilterState,
} from '../components/dashboard/DashboardFilterBar';
import { DashboardKpiGrid } from '../components/dashboard/DashboardKpiGrid';
import { EmployeePerformanceCharts } from '../components/dashboard/EmployeePerformanceCharts';
import { ProductionQualityCharts } from '../components/dashboard/ProductionQualityCharts';
import { ReadinessForecastWidgets } from '../components/dashboard/ReadinessForecastWidgets';
import { LeaderboardNotificationsPanel } from '../components/dashboard/LeaderboardNotificationsPanel';
import { AlertCircle, RefreshCw, Shield, User } from 'lucide-react';

interface DashboardPageProps {
  onNavigate: (route: string) => void;
}

const DEFAULT_FILTERS: DashboardFilterState = {
  period: 'this_month',
  start_date: '',
  end_date: '',
  department_id: '',
  employee_id: '',
  operation_id: '',
  product_id: '',
  production_order_id: '',
  shift_id: '',
  quality_status: '',
};

const EMPTY_OPTIONS: DashboardFilterOptions = {
  departments: [],
  employees: [],
  operations: [],
  products: [],
  production_orders: [],
  shifts: [],
  quality_statuses: ['approved', 'rejected', 'rework', 'pending'],
};

export const DashboardPage: React.FC<DashboardPageProps> = ({ onNavigate }) => {
  const { user } = useAuth();

  const [config, setConfig] = useState<any>(null);
  const [filters, setFilters] = useState<DashboardFilterState>(DEFAULT_FILTERS);
  const [rewardCategory, setRewardCategory] = useState<string>('overall_best_employee');
  const [leaderboardPage, setLeaderboardPage] = useState<number>(1);

  const [summaryData, setSummaryData] = useState<any>(null);
  const [empPerfData, setEmpPerfData] = useState<any>(null);
  const [productionData, setProductionData] = useState<any>(null);
  const [qualityData, setQualityData] = useState<any>(null);
  const [readinessData, setReadinessData] = useState<any>(null);
  const [forecastData, setForecastData] = useState<any>(null);
  const [notificationsData, setNotificationsData] = useState<any>(null);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);

  const [isConfigLoading, setIsConfigLoading] = useState<boolean>(true);
  const [isDataLoading, setIsDataLoading] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [exportMessage, setExportMessage] = useState<string | null>(null);

  const widgetAccess = config?.widget_access || {};
  const scope: 'company' | 'department' | 'self' = config?.scope || 'self';
  const filterOptions: DashboardFilterOptions = config?.filter_options || EMPTY_OPTIONS;
  const quickActions: Array<{ id: string; label: string; route: string; category: string }> =
    config?.quick_actions || [];

  const queryParams = useMemo(() => {
    const p: Record<string, string | number | undefined> = {
      period: filters.period,
      start_date: filters.period === 'custom' ? filters.start_date : undefined,
      end_date: filters.period === 'custom' ? filters.end_date : undefined,
      department_id: filters.department_id || undefined,
      employee_id: filters.employee_id || undefined,
      operation_id: filters.operation_id || undefined,
      product_id: filters.product_id || undefined,
      production_order_id: filters.production_order_id || undefined,
      shift_id: filters.shift_id || undefined,
      quality_status: filters.quality_status || undefined,
    };
    return p;
  }, [filters]);

  const loadConfig = useCallback(async () => {
    setIsConfigLoading(true);
    setError(null);
    try {
      const res = await api.dashboard.getConfig();
      if (res.success && res.data) {
        setConfig(res.data);
      } else {
        setError(res.message || 'Unable to load dashboard configuration.');
      }
    } catch {
      setError('Failed to connect to dashboard API. Please retry.');
    } finally {
      setIsConfigLoading(false);
    }
  }, []);

  const loadAuthorizedWidgets = useCallback(async () => {
    if (!config?.widget_access) return;
    setIsDataLoading(true);
    setError(null);
    const wa = config.widget_access;

    try {
      const tasks: Promise<void>[] = [];

      // Summary KPIs
      if (wa.employee_summary || wa.production_summary || wa.product_readiness || wa.production_forecast) {
        tasks.push(
          api.dashboard.getSummary(queryParams).then((r) => {
            if (r.success) setSummaryData(r.data);
          })
        );
      } else {
        setSummaryData(null);
      }

      // Employee performance charts & leaderboard
      if (wa.employee_performance || wa.rewards) {
        tasks.push(
          api.dashboard
            .getEmployeePerformance({
              ...queryParams,
              reward_category: rewardCategory,
              page: leaderboardPage,
              limit: 10,
            })
            .then((r) => {
              if (r.success) setEmpPerfData(r.data);
            })
        );
      } else {
        setEmpPerfData(null);
      }

      // Production analytics & pipeline
      if (wa.production_analytics) {
        tasks.push(
          api.dashboard.getProduction(queryParams).then((r) => {
            if (r.success) setProductionData(r.data);
          })
        );
      } else {
        setProductionData(null);
      }

      // Quality analytics
      if (wa.quality_reports) {
        tasks.push(
          api.dashboard.getQuality(queryParams).then((r) => {
            if (r.success) setQualityData(r.data);
          })
        );
      } else {
        setQualityData(null);
      }

      // Product readiness
      if (wa.product_readiness) {
        tasks.push(
          api.dashboard.getProductReadiness(queryParams).then((r) => {
            if (r.success) setReadinessData(r.data);
          })
        );
      } else {
        setReadinessData(null);
      }

      // Forecast & bottlenecks
      if (wa.production_forecast) {
        tasks.push(
          api.dashboard.getForecast(queryParams).then((r) => {
            if (r.success) setForecastData(r.data);
          })
        );
      } else {
        setForecastData(null);
      }

      // Notifications
      if (wa.notifications) {
        tasks.push(
          api.dashboard.getNotifications().then((r) => {
            if (r.success) setNotificationsData(r.data);
          })
        );
      } else {
        setNotificationsData(null);
      }

      // Recent activity
      if (wa.recent_activity) {
        tasks.push(
          api.dashboard.getRecentActivity().then((r) => {
            if (r.success && Array.isArray(r.data)) setRecentActivity(r.data);
          })
        );
      } else {
        setRecentActivity([]);
      }

      await Promise.all(tasks);
    } catch {
      setError('Failed to refresh one or more dashboard widgets.');
    } finally {
      setIsDataLoading(false);
    }
  }, [config, queryParams, rewardCategory, leaderboardPage]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    if (config) {
      loadAuthorizedWidgets();
    }
  }, [config, loadAuthorizedWidgets]);

  const handleMarkNotificationRead = async (id: number) => {
    const res = await api.dashboard.markNotificationRead(id);
    if (res.success) {
      const updated = await api.dashboard.getNotifications();
      if (updated.success) setNotificationsData(updated.data);
    }
  };

  const handleMarkAllRead = async () => {
    const res = await api.dashboard.markAllNotificationsRead();
    if (res.success) {
      const updated = await api.dashboard.getNotifications();
      if (updated.success) setNotificationsData(updated.data);
    }
  };

  const handleExport = async (format: 'xlsx' | 'pdf') => {
    setIsExporting(true);
    setExportMessage(null);
    try {
      await api.dashboard.exportReport(format, queryParams);
      setExportMessage(`Dashboard ${format.toUpperCase()} report downloaded.`);
    } catch (err: any) {
      setExportMessage(err?.message || `Failed to export ${format.toUpperCase()} report.`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleFilterChange = (next: DashboardFilterState) => {
    setLeaderboardPage(1);
    setFilters(next);
  };

  const handleResetFilters = () => {
    setLeaderboardPage(1);
    setFilters(DEFAULT_FILTERS);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Compact Enterprise Header */}
      <header className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <UserAvatar user={user} size="lg" shape="rounded" className="w-12 h-12 rounded-xl border border-slate-200 shrink-0" />
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight truncate">
              Operations Command Dashboard — {getDisplayName(user)}
            </h1>
            <p className="text-xs text-slate-500 mt-0.5 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 font-semibold text-slate-700 capitalize">
                <Shield className="w-3.5 h-3.5 text-sky-700" />
                {user?.role?.replace(/_/g, ' ') || 'User'}
              </span>
              <span>•</span>
              <span>Department: {user?.department || 'Company-Wide'}</span>
              <span>•</span>
              <span>Data Scope: <strong className="uppercase text-slate-700">{scope}</strong></span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onNavigate('/profile')}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700"
          >
            <User className="w-3.5 h-3.5" />
            My Profile
          </button>
          <button
            type="button"
            onClick={() => onNavigate('/operations-performance')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-sky-700 hover:bg-sky-800 text-white text-xs font-semibold"
          >
            Operation Engine
          </button>
        </div>
      </header>

      {/* Error Banner with Retry */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => (config ? loadAuthorizedWidgets() : loadConfig())}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-rose-300 font-semibold hover:bg-rose-50"
          >
            <RefreshCw className="w-3 h-3" /> Retry
          </button>
        </div>
      )}

      {exportMessage && (
        <div className="px-4 py-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700 flex items-center justify-between">
          <span>{exportMessage}</span>
          <button
            type="button"
            onClick={() => setExportMessage(null)}
            className="text-slate-400 hover:text-slate-700 font-semibold"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Common Interactive Filter Bar */}
      <DashboardFilterBar
        filters={filters}
        options={filterOptions}
        scope={scope}
        canExportExcel={Boolean(widgetAccess.export_excel)}
        canExportPdf={Boolean(widgetAccess.export_pdf)}
        isLoading={isConfigLoading || isDataLoading}
        isExporting={isExporting}
        onChange={handleFilterChange}
        onReset={handleResetFilters}
        onRefresh={loadAuthorizedWidgets}
        onExport={handleExport}
      />

      {/* Permission-Gated KPI Summary Cards */}
      <DashboardKpiGrid
        summary={summaryData}
        isLoading={isConfigLoading || (isDataLoading && !summaryData)}
        onNavigate={onNavigate}
      />

      {/* Permission-Gated Employee Performance Charts */}
      {widgetAccess.employee_performance && (
        <EmployeePerformanceCharts
          data={empPerfData}
          isLoading={isDataLoading && !empPerfData}
          onSelectEmployee={(empId) => {
            if (scope !== 'self') {
              handleFilterChange({ ...filters, employee_id: String(empId) });
            }
          }}
        />
      )}

      {/* Permission-Gated Production Analytics, Pipeline & Quality Analytics */}
      <ProductionQualityCharts
        productionData={productionData}
        qualityData={qualityData}
        showProduction={Boolean(widgetAccess.production_analytics)}
        showQuality={Boolean(widgetAccess.quality_reports)}
        isLoading={isDataLoading && !productionData && !qualityData}
        onFilterOperation={(opId) => handleFilterChange({ ...filters, operation_id: String(opId) })}
      />

      {/* Permission-Gated Product Readiness & Forecast Estimates */}
      <ReadinessForecastWidgets
        readinessData={readinessData}
        forecastData={forecastData}
        showReadiness={Boolean(widgetAccess.product_readiness)}
        showForecast={Boolean(widgetAccess.production_forecast)}
        isLoading={isDataLoading && !readinessData && !forecastData}
        onNavigate={onNavigate}
      />

      {/* Permission-Gated Leaderboard, Notifications, Recent Activity & Quick Actions */}
      <LeaderboardNotificationsPanel
        empPerfData={empPerfData}
        notificationsData={notificationsData}
        recentActivity={recentActivity}
        quickActions={quickActions}
        showLeaderboard={Boolean(widgetAccess.employee_performance || widgetAccess.rewards)}
        showNotifications={Boolean(widgetAccess.notifications)}
        showRecentActivity={Boolean(widgetAccess.recent_activity)}
        rewardCategory={rewardCategory}
        onRewardCategoryChange={(cat) => {
          setLeaderboardPage(1);
          setRewardCategory(cat);
        }}
        page={leaderboardPage}
        onPageChange={(p) => setLeaderboardPage(p)}
        onMarkRead={handleMarkNotificationRead}
        onMarkAllRead={handleMarkAllRead}
        onNavigate={onNavigate}
      />
    </div>
  );
};
