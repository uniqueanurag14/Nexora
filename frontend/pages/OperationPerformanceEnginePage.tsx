import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { OperationsMasterSection } from '../components/operations/OperationsMasterSection';
import { AssignmentsQualitySection } from '../components/operations/AssignmentsQualitySection';
import { PerformanceRewardsSection } from '../components/operations/PerformanceRewardsSection';
import { ReadinessForecastSection } from '../components/operations/ReadinessForecastSection';
import {
  Activity,
  Cog,
  ClipboardCheck,
  PackageCheck,
  TrendingUp,
  Trophy,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';

export type OperationsEngineTab =
  | 'performance'
  | 'operations'
  | 'assignments'
  | 'readiness'
  | 'forecasting'
  | 'rewards';

interface OperationPerformanceEnginePageProps {
  initialTab?: OperationsEngineTab;
  onNavigate?: (route: string) => void;
}

export const OperationPerformanceEnginePage: React.FC<OperationPerformanceEnginePageProps> = ({
  initialTab = 'performance',
  onNavigate,
}) => {
  const { user, hasPermission } = useAuth();
  const [activeTab, setActiveTab] = useState<OperationsEngineTab>(initialTab);
  const [options, setOptions] = useState<{
    departments: any[];
    employees: any[];
    operations: any[];
    products: any[];
    work_orders: any[];
    shifts: any[];
  }>({
    departments: [],
    employees: [],
    operations: [],
    products: [],
    work_orders: [],
    shifts: [],
  });
  const [summary, setSummary] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const isSuper = user?.role === 'super_admin' || user?.role === 'admin';
  const canManageOps = isSuper || hasPermission('operations.manage');
  const canManageStandards = isSuper || hasPermission('operations.standard_time.manage');
  const canAssign = isSuper || hasPermission('operations.assignments.manage');
  const canApproveQc = isSuper || hasPermission('operations.quality.approve');
  const canCorrectProduction = isSuper || hasPermission('operations.production.correct');
  const canManageReadiness = isSuper || hasPermission('operations.readiness.manage');
  const canExport = isSuper || hasPermission('operations.reports.export');
  const canManageRewards = isSuper || hasPermission('operations.rewards.manage');
  const canApproveRewards = isSuper || hasPermission('operations.rewards.approve');

  const loadHeaderData = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [optRes, sumRes] = await Promise.all([
      api.operationsEngine.getOptions(),
      api.operationsEngine.getDashboardSummary(),
    ]);
    if (optRes.success && optRes.data) {
      setOptions({
        departments: optRes.data.departments || [],
        employees: optRes.data.employees || [],
        operations: optRes.data.operations || [],
        products: optRes.data.products || [],
        work_orders: optRes.data.work_orders || [],
        shifts: optRes.data.shifts || [],
      });
    } else if (!optRes.success) {
      setError(optRes.message || 'Unable to load operations engine master data from PostgreSQL.');
    }
    if (sumRes.success && sumRes.data) {
      setSummary(sumRes.data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadHeaderData();
  }, [loadHeaderData]);

  const switchTab = (tab: OperationsEngineTab) => {
    setActiveTab(tab);
    if (onNavigate) {
      if (tab === 'readiness') onNavigate('/workforce/operations-engine/readiness');
      else if (tab === 'forecasting') onNavigate('/workforce/operations-engine/forecasting');
      else if (tab === 'rewards') onNavigate('/workforce/operations-engine/rewards');
      else onNavigate('/workforce/operations-engine');
    }
  };

  const tabs: Array<{ id: OperationsEngineTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'performance', label: 'Fair Performance & Reports', icon: Activity },
    { id: 'operations', label: 'Operations & Product BOM', icon: Cog },
    { id: 'assignments', label: 'Assignments, QC & Exceptions', icon: ClipboardCheck },
    { id: 'readiness', label: 'Production Readiness & WIP', icon: PackageCheck },
    { id: 'forecasting', label: 'Forecasting & Bottlenecks', icon: TrendingUp },
    { id: 'rewards', label: 'Best Employee & Rewards', icon: Trophy },
  ];

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Operation Performance, Quality & Production Readiness
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Standard-time-earned productivity, quality inspection, atomic WIP assembly consumption, forecasting, and fair employee recognition.
          </p>
        </div>
        <button
          onClick={loadHeaderData}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-md"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Sync Live Data
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2.5 p-3.5 border border-rose-200 bg-rose-50 text-rose-800 text-sm rounded-lg">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">Database Synchronization Notice</p>
            <p className="text-xs mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* Executive KPI Strip (100% live PostgreSQL counters) */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs font-semibold text-slate-500">Active Roster / Today</div>
          <div className="mt-1.5 font-mono text-2xl font-bold text-slate-900 tabular-nums">
            {summary?.employees_recorded_today ?? 0} / {summary?.active_employees ?? 0}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs font-semibold text-slate-500">Today Components</div>
          <div className="mt-1.5 font-mono text-2xl font-bold text-slate-900 tabular-nums">
            {summary?.daily_component_production ?? 0}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs font-semibold text-slate-500">Assembly Ready Sets</div>
          <div className="mt-1.5 font-mono text-2xl font-bold text-sky-700 tabular-nums">
            {summary?.assembly_ready_toys ?? 0}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs font-semibold text-slate-500">Finished Readiness</div>
          <div className="mt-1.5 font-mono text-2xl font-bold text-[#0084CC] tabular-nums">
            {Number(summary?.finished_toy_readiness_pct ?? 0).toFixed(1)}%
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs font-semibold text-slate-500">Quality Acceptance</div>
          <div className="mt-1.5 font-mono text-2xl font-bold text-emerald-700 tabular-nums">
            {summary?.quality_acceptance_rate_pct != null
              ? `${Number(summary.quality_acceptance_rate_pct).toFixed(1)}%`
              : '—'}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs font-semibold text-slate-500">HW Exceptions Open</div>
          <div className="mt-1.5 font-mono text-2xl font-bold text-amber-700 tabular-nums">
            {summary?.open_hardware_exceptions ?? 0}
          </div>
        </div>
      </div>

      {/* Primary Workspace Navigation Tabs */}
      <div className="border-b border-slate-200 overflow-x-auto">
        <nav className="flex items-center gap-6 min-w-max">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => switchTab(tab.id)}
                className={`inline-flex items-center gap-2 pb-3 text-sm font-semibold border-b-2 transition-colors ${
                  active
                    ? 'border-[#0084CC] text-slate-900'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Icon className={`w-4 h-4 ${active ? 'text-[#0084CC]' : 'text-slate-400'}`} />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Active Workspace Section */}
      <div>
        {activeTab === 'performance' && (
          <PerformanceRewardsSection
            mode="performance"
            options={options}
            canExport={canExport}
            canManagePolicy={canManageOps}
            canManageRewards={canManageRewards}
            canApproveRewards={canApproveRewards}
          />
        )}
        {activeTab === 'operations' && (
          <OperationsMasterSection
            options={options}
            canManage={canManageOps}
            canManageStandards={canManageStandards}
            onRefreshOptions={loadHeaderData}
          />
        )}
        {activeTab === 'assignments' && (
          <AssignmentsQualitySection
            options={options}
            canAssign={canAssign}
            canApproveQc={canApproveQc}
            canCorrectProduction={canCorrectProduction}
          />
        )}
        {activeTab === 'readiness' && (
          <ReadinessForecastSection
            mode="readiness"
            options={options}
            canManageReadiness={canManageReadiness}
            canApproveQc={canApproveQc}
          />
        )}
        {activeTab === 'forecasting' && (
          <ReadinessForecastSection
            mode="forecasting"
            options={options}
            canManageReadiness={canManageReadiness}
            canApproveQc={canApproveQc}
          />
        )}
        {activeTab === 'rewards' && (
          <PerformanceRewardsSection
            mode="rewards"
            options={options}
            canExport={canExport}
            canManagePolicy={canManageOps}
            canManageRewards={canManageRewards}
            canApproveRewards={canApproveRewards}
          />
        )}
      </div>
    </div>
  );
};
