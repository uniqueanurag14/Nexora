import React from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { AlertCircle, ArrowRight, PackageCheck, TrendingUp } from 'lucide-react';

interface ReadinessForecastWidgetsProps {
  readinessData: any;
  forecastData: any;
  showReadiness: boolean;
  showForecast: boolean;
  isLoading: boolean;
  onNavigate: (route: string) => void;
}

export const ReadinessForecastWidgets: React.FC<ReadinessForecastWidgetsProps> = ({
  readinessData,
  forecastData,
  showReadiness,
  showForecast,
  isLoading,
  onNavigate,
}) => {
  if (!showReadiness && !showForecast) return null;

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {showReadiness && <div className="h-80 rounded-xl border border-slate-200 bg-slate-50 animate-pulse" />}
        {showForecast && <div className="h-80 rounded-xl border border-slate-200 bg-slate-50 animate-pulse" />}
      </div>
    );
  }

  const orders: any[] = readinessData?.orders || [];
  const forecasts: any[] = forecastData?.forecasts || [];

  const primaryForecast = forecasts[0]?.forecast || null;
  const capacityChartRows = primaryForecast
    ? (primaryForecast.stages || []).map((s: any) => ({
        stage: s.operation_name,
        available_daily_toys: s.available_daily_toy_capacity,
        required_daily_units: s.required_daily_units,
        is_bottleneck: s.is_bottleneck,
      }))
    : [];

  return (
    <div className={`grid grid-cols-1 ${showReadiness && showForecast ? 'lg:grid-cols-2' : ''} gap-6`}>
      {/* Product Readiness Visualization */}
      {showReadiness && (
        <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <PackageCheck className="w-4 h-4 text-teal-700" />
                Product Readiness (Component Sets vs Finished Toys)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Component output is never counted as finished products until assembled and final QC approved.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('/operations-performance?tab=readiness')}
              className="text-xs font-semibold text-sky-700 hover:text-sky-900 inline-flex items-center gap-1 shrink-0"
            >
              Details <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {orders.length === 0 ? (
            <div className="h-56 flex items-center justify-center border border-dashed border-slate-200 rounded-lg bg-slate-50/50 text-xs text-slate-500">
              No active production orders available.
            </div>
          ) : (
            <div className="space-y-4 max-h-96 overflow-y-auto pr-1">
              {orders.slice(0, 4).map((ord) => (
                <div key={ord.production_order_id} className="border border-slate-200 rounded-lg p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="text-xs font-bold text-slate-900">
                        {ord.order_number} — {ord.product_name}
                      </span>
                      <span className="block text-[11px] text-slate-500">
                        Status: <strong className="text-slate-700">{ord.finished_product_status}</strong>
                        {ord.limiting_component_operation ? ` • Limiting stage: ${ord.limiting_component_operation}` : ''}
                      </span>
                    </div>
                    <span className="text-xs font-bold font-mono tabular-nums text-teal-700">
                      {ord.finished_product_readiness_pct}% Finished
                    </span>
                  </div>

                  {/* Distinct stage metrics — never conflating components with finished toys */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono tabular-nums">
                    <div className="p-2 rounded bg-slate-50 border border-slate-100">
                      <span className="block text-slate-500 font-sans">Assembly-Ready Sets</span>
                      <strong className="text-sm text-slate-900">{ord.potential_assembly_ready_qty}</strong>
                    </div>
                    <div className="p-2 rounded bg-slate-50 border border-slate-100">
                      <span className="block text-slate-500 font-sans">Assembled</span>
                      <strong className="text-sm text-slate-900">{ord.assembled_qty}</strong>
                    </div>
                    <div className="p-2 rounded bg-slate-50 border border-slate-100">
                      <span className="block text-slate-500 font-sans">Awaiting Final QC</span>
                      <strong className="text-sm text-amber-700">{ord.awaiting_final_inspection_qty}</strong>
                    </div>
                    <div className="p-2 rounded bg-slate-50 border border-slate-100">
                      <span className="block text-slate-500 font-sans">Final Approved</span>
                      <strong className="text-sm text-emerald-700">
                        {ord.final_approved_finished_qty} / {ord.target_qty}
                      </strong>
                    </div>
                  </div>

                  {/* Component breakdown bars */}
                  {ord.components && ord.components.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      {ord.components.map((c: any) => {
                        const pct =
                          c.total_required_for_order > 0
                            ? Math.min(100, Math.round((c.quality_approved_qty / c.total_required_for_order) * 100))
                            : 0;
                        return (
                          <div key={c.operation_id} className="space-y-0.5">
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="text-slate-700 font-medium">
                                {c.component_name} ({c.operation_name})
                                {c.is_bottleneck && (
                                  <span className="ml-1.5 text-rose-700 font-semibold">[Limiting]</span>
                                )}
                              </span>
                              <span className="font-mono tabular-nums text-slate-600">
                                {c.quality_approved_qty} / {c.total_required_for_order} ({c.potential_toy_sets_available} sets)
                              </span>
                            </div>
                            <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${c.is_bottleneck ? 'bg-amber-600' : 'bg-sky-600'}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Production Forecast & Bottleneck Analysis */}
      {showForecast && (
        <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-indigo-700" />
                Production Forecast & Bottlenecks (Estimate)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Constrained by slowest mandatory component and final assembly stage — never summed across stages.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('/operations-performance?tab=forecasting')}
              className="text-xs font-semibold text-sky-700 hover:text-sky-900 inline-flex items-center gap-1 shrink-0"
            >
              Full Forecast <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {!primaryForecast ? (
            <div className="h-56 flex items-center justify-center border border-dashed border-slate-200 rounded-lg bg-slate-50/50 text-xs text-slate-500">
              No active production orders with mapped operations available for forecasting.
            </div>
          ) : (
            <div className="space-y-4">
              {/* Transparent Forecast Basis Disclosure */}
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-indigo-700 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-slate-900">
                    Estimate ({forecasts[0].order_number} — {forecasts[0].product_name}):
                  </strong>{' '}
                  {primaryForecast.basis_note}
                </div>
              </div>

              {/* Daily / Weekly / Monthly Forecast Summary */}
              <div className="grid grid-cols-3 gap-3 text-xs font-mono tabular-nums">
                <div className="border border-slate-200 rounded-lg p-3">
                  <span className="block text-[11px] font-sans text-slate-500">Est. Daily Finished</span>
                  <strong className="text-lg text-slate-900">{primaryForecast.expected_daily_finished_toys}</strong>
                </div>
                <div className="border border-slate-200 rounded-lg p-3">
                  <span className="block text-[11px] font-sans text-slate-500">Est. Weekly Finished</span>
                  <strong className="text-lg text-slate-900">{primaryForecast.expected_weekly_finished_toys}</strong>
                </div>
                <div className="border border-slate-200 rounded-lg p-3">
                  <span className="block text-[11px] font-sans text-slate-500">Est. Monthly Finished</span>
                  <strong className="text-lg text-slate-900">{primaryForecast.expected_monthly_finished_toys}</strong>
                </div>
              </div>

              {/* Stage Capacity Chart */}
              {capacityChartRows.length > 0 && (
                <div className="h-52 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={capacityChartRows} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="stage" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="available_daily_toys" name="Daily Finished Toy Capacity (Est.)" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Bottleneck Guidance */}
              <div className="text-xs border-t border-slate-100 pt-3 flex flex-wrap items-center justify-between gap-2">
                <span className="text-slate-600">
                  Primary Bottleneck:{' '}
                  <strong className="text-rose-700">{primaryForecast.bottleneck_operation || 'None'}</strong>
                </span>
                <span className="font-mono tabular-nums text-slate-600">
                  Est. Completion: <strong>{primaryForecast.estimated_completion_date || 'N/A'}</strong>
                </span>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
};
