import React from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Factory,
  Gauge,
  PackageCheck,
  TrendingUp,
  Users,
} from 'lucide-react';

interface DashboardKpiGridProps {
  summary: any;
  isLoading: boolean;
  onNavigate: (route: string) => void;
}

interface KpiCardItem {
  id: string;
  group: string;
  label: string;
  value: string;
  subtext: string;
  delta?: number | null;
  inverseDelta?: boolean;
  status?: 'good' | 'warn' | 'critical' | 'neutral';
  route: string;
  icon: React.ReactNode;
}

const DeltaIndicator: React.FC<{ delta?: number | null; inverse?: boolean }> = ({ delta, inverse }) => {
  if (delta === null || delta === undefined) {
    return <span className="text-[11px] text-slate-400 font-mono tabular-nums">No prior baseline</span>;
  }
  const isPositive = delta > 0;
  const isNeutral = delta === 0;
  const good = inverse ? !isPositive : isPositive;
  const tone = isNeutral ? 'text-slate-500' : good ? 'text-emerald-700' : 'text-rose-700';

  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold font-mono tabular-nums ${tone}`}>
      {!isNeutral &&
        (isPositive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />)}
      {isPositive ? '+' : ''}
      {delta}% vs prev
    </span>
  );
};

export const DashboardKpiGrid: React.FC<DashboardKpiGridProps> = ({ summary, isLoading, onNavigate }) => {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-32 rounded-xl border border-slate-200 bg-slate-50 animate-pulse" />
        ))}
      </div>
    );
  }

  if (!summary) return null;

  const cards: KpiCardItem[] = [];
  const emp = summary.employee_kpis;
  const prod = summary.production_kpis;
  const fin = summary.finished_product_kpis;
  const fc = summary.forecast_kpis;

  if (emp) {
    cards.push(
      {
        id: 'emp-active',
        group: 'Workforce',
        label: 'Active Roster / Working',
        value: `${emp.active_working_employees} / ${emp.total_active_employees}`,
        subtext: `${emp.period_label} • ${emp.employees_below_target} below 85% target`,
        status: emp.employees_below_target > 0 ? 'warn' : 'good',
        route: emp.drilldown_route || '/operations-performance?tab=reports',
        icon: <Users className="w-4 h-4 text-sky-700" />,
      },
      {
        id: 'emp-prod',
        group: 'Workforce',
        label: 'Avg Standard-Time Productivity',
        value: `${emp.avg_productivity_pct}%`,
        subtext: emp.top_performer
          ? `Top: ${emp.top_performer.name} (${emp.top_performer.final_score})`
          : `${emp.period_label} • No logged output`,
        delta: emp.avg_productivity_delta_pct,
        status: emp.avg_productivity_pct >= 95 ? 'good' : emp.avg_productivity_pct >= 80 ? 'warn' : 'neutral',
        route: emp.drilldown_route || '/operations-performance?tab=reports',
        icon: <Gauge className="w-4 h-4 text-sky-700" />,
      },
      {
        id: 'emp-qual',
        group: 'Workforce',
        label: 'First-Pass Quality Rate',
        value: emp.avg_quality_pct !== null ? `${emp.avg_quality_pct}%` : 'N/A',
        subtext: `${emp.period_label} • Verified QC records only`,
        delta: emp.avg_quality_delta_pct,
        status:
          emp.avg_quality_pct === null
            ? 'neutral'
            : emp.avg_quality_pct >= 95
            ? 'good'
            : emp.avg_quality_pct >= 88
            ? 'warn'
            : 'critical',
        route: '/operations-performance?tab=quality',
        icon: <CheckCircle2 className="w-4 h-4 text-emerald-700" />,
      }
    );
  }

  if (prod) {
    cards.push(
      {
        id: 'prod-accepted',
        group: 'Production',
        label: 'Accepted / Submitted Output',
        value: `${prod.accepted_output_qty} / ${prod.submitted_output_qty}`,
        subtext: `${prod.active_production_orders} active order(s) • ${prod.pending_quality_inspection_qty} pending QC`,
        delta: prod.accepted_output_delta_pct,
        status: prod.pending_quality_inspection_qty > 0 ? 'warn' : 'good',
        route: prod.drilldown_route || '/operations-performance?tab=quality',
        icon: <Factory className="w-4 h-4 text-sky-700" />,
      },
      {
        id: 'prod-rejection',
        group: 'Quality',
        label: 'Rejection & Rework Load',
        value: prod.rejection_rate_pct !== null ? `${prod.rejection_rate_pct}%` : '0%',
        subtext: `${prod.rejected_qty} rejected • ${prod.rework_qty} rework units`,
        delta: prod.rejection_rate_delta_pct,
        inverseDelta: true,
        status:
          prod.rejection_rate_pct !== null && prod.rejection_rate_pct > 10
            ? 'critical'
            : prod.rework_qty > 0
            ? 'warn'
            : 'good',
        route: '/operations-performance?tab=quality',
        icon: <AlertTriangle className="w-4 h-4 text-amber-600" />,
      }
    );
  }

  if (fin) {
    cards.push({
      id: 'fin-readiness',
      group: 'Finished Products',
      label: 'Final Approved Finished Products',
      value: `${fin.final_approved_finished_qty} / ${fin.target_finished_qty}`,
      subtext: `${fin.finished_product_readiness_pct}% ready • ${fin.assembly_ready_sets_qty} assembly-ready sets • ${fin.awaiting_final_inspection_qty} awaiting final QC`,
      status: fin.finished_product_readiness_pct >= 90 ? 'good' : fin.assembly_ready_sets_qty > 0 ? 'warn' : 'neutral',
      route: fin.drilldown_route || '/operations-performance?tab=readiness',
      icon: <PackageCheck className="w-4 h-4 text-teal-700" />,
    });
  }

  if (fc) {
    cards.push(
      {
        id: 'fc-daily',
        group: 'Forecast (Estimate)',
        label: 'Expected Daily / Weekly Finished',
        value: `${fc.expected_daily_finished_qty} / ${fc.expected_weekly_finished_qty}`,
        subtext: `Monthly est: ${fc.expected_monthly_finished_qty} • ${
          fc.basis === 'historical_and_standards' ? 'History + Standards' : 'Standards-only Estimate'
        }`,
        status: fc.bottleneck_count > 0 ? 'warn' : 'good',
        route: fc.drilldown_route || '/operations-performance?tab=forecasting',
        icon: <TrendingUp className="w-4 h-4 text-indigo-700" />,
      },
      {
        id: 'fc-bottleneck',
        group: 'Forecast (Estimate)',
        label: 'Primary Bottleneck Stage',
        value: fc.primary_bottleneck || 'None Detected',
        subtext:
          fc.additional_staff_recommended > 0
            ? `Capacity gain available: +${fc.additional_staff_recommended} operator(s) recommended`
            : 'Current capacity balanced or no active orders',
        status: fc.additional_staff_recommended > 0 ? 'critical' : 'neutral',
        route: fc.drilldown_route || '/operations-performance?tab=forecasting',
        icon: <Activity className="w-4 h-4 text-rose-700" />,
      }
    );
  }

  if (cards.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-6 text-center text-xs text-slate-500">
        No KPI widgets are enabled for your current role permissions.
      </div>
    );
  }

  return (
    <section aria-label="Key Performance Indicators" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <button
          key={card.id}
          type="button"
          onClick={() => onNavigate(card.route)}
          className="text-left bg-white border border-slate-200 hover:border-sky-400 rounded-xl p-4 transition-colors flex flex-col justify-between gap-3 group"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                {card.group}
              </span>
              <h3 className="text-xs font-semibold text-slate-700 mt-0.5">{card.label}</h3>
            </div>
            <div className="p-2 rounded-lg bg-slate-50 border border-slate-100 shrink-0">{card.icon}</div>
          </div>

          <div>
            <div className="text-xl font-bold text-slate-900 font-mono tabular-nums truncate" title={card.value}>
              {card.value}
            </div>
            <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">{card.subtext}</p>
          </div>

          <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
            <DeltaIndicator delta={card.delta} inverse={card.inverseDelta} />
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-700 group-hover:translate-x-0.5 transition-transform">
              Drill down <ArrowRight className="w-3 h-3" />
            </span>
          </div>
        </button>
      ))}
    </section>
  );
};
