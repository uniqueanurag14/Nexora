import React, { useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { CheckCircle2, Factory, GitBranch } from 'lucide-react';

interface ProductionQualityChartsProps {
  productionData: any;
  qualityData: any;
  showProduction: boolean;
  showQuality: boolean;
  isLoading: boolean;
  onFilterOperation?: (operationId: number) => void;
}

const EmptyState: React.FC<{ label?: string }> = ({ label = 'No data available for the selected filters.' }) => (
  <div className="h-60 flex items-center justify-center border border-dashed border-slate-200 rounded-lg bg-slate-50/50 text-xs text-slate-500">
    {label}
  </div>
);

export const ProductionQualityCharts: React.FC<ProductionQualityChartsProps> = ({
  productionData,
  qualityData,
  showProduction,
  showQuality,
  isLoading,
  onFilterOperation,
}) => {
  const [prodTab, setProdTab] = useState<'trend' | 'product' | 'shift' | 'orders'>('trend');
  const [qualTab, setQualTab] = useState<'trend' | 'operations' | 'employees'>('trend');

  if (!showProduction && !showQuality) return null;

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {showProduction && <div className="h-80 rounded-xl border border-slate-200 bg-slate-50 animate-pulse" />}
        {showQuality && <div className="h-80 rounded-xl border border-slate-200 bg-slate-50 animate-pulse" />}
      </div>
    );
  }

  const pipeline: any[] = productionData?.process_pipeline || [];

  return (
    <div className="space-y-6">
      {/* Visual Manufacturing Process Pipeline Overview */}
      {showProduction && (
        <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-sky-700" />
                Manufacturing Process Pipeline Overview
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Click any operation stage to filter the dashboard by that stage. Reflects real submitted, approved, pending, rejected, and rework quantities.
              </p>
            </div>
          </div>

          {pipeline.length === 0 ? (
            <div className="p-6 text-center border border-dashed border-slate-200 rounded-lg text-xs text-slate-500">
              No operation work logs recorded in the selected date period.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {pipeline.map((stage) => (
                <button
                  key={stage.operation_id}
                  type="button"
                  onClick={() => onFilterOperation && onFilterOperation(stage.operation_id)}
                  className="text-left border border-slate-200 hover:border-sky-500 rounded-lg p-3.5 transition-colors bg-white space-y-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-[10px] font-mono uppercase text-slate-400">{stage.operation_code}</span>
                      <h3 className="text-xs font-bold text-slate-900 truncate">{stage.operation_name}</h3>
                    </div>
                    <span className="text-xs font-bold font-mono tabular-nums text-sky-700">
                      {stage.completion_pct}%
                    </span>
                  </div>

                  <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-sky-600 rounded-full"
                      style={{ width: `${Math.min(100, Math.max(0, stage.completion_pct))}%` }}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] font-mono tabular-nums">
                    <span className="text-slate-500">Staff: <strong className="text-slate-800">{stage.assigned_employees}</strong></span>
                    <span className="text-slate-500">Target: <strong className="text-slate-800">{stage.target_qty}</strong></span>
                    <span className="text-emerald-700">Approved: <strong>{stage.approved_qty}</strong></span>
                    <span className="text-slate-600">Submitted: <strong>{stage.submitted_qty}</strong></span>
                    <span className="text-amber-700">Pending: <strong>{stage.pending_qty}</strong></span>
                    <span className="text-rose-700">Rej/Rw: <strong>{stage.rejected_qty}/{stage.rework_qty}</strong></span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      <div className={`grid grid-cols-1 ${showProduction && showQuality ? 'lg:grid-cols-2' : ''} gap-6`}>
        {/* Production Analytics Card */}
        {showProduction && (
          <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Factory className="w-4 h-4 text-sky-700" />
                Production Output Analytics
              </h2>
              <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50 text-[11px]">
                {[
                  { id: 'trend', label: 'Daily Trend' },
                  { id: 'product', label: 'By Product' },
                  { id: 'shift', label: 'By Shift' },
                  { id: 'orders', label: 'Order Progress' },
                ].map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setProdTab(t.id as any)}
                    className={`px-2.5 py-1 rounded-md font-medium ${
                      prodTab === t.id ? 'bg-white text-slate-900 border border-slate-200' : 'text-slate-600'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {prodTab === 'trend' && (
              (productionData?.daily_trend || []).length === 0 ? (
                <EmptyState />
              ) : (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={productionData.daily_trend} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="work_date" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Area type="monotone" dataKey="accepted_qty" name="Accepted" stackId="1" stroke="#0f766e" fill="#ccfbf1" />
                      <Area type="monotone" dataKey="rework_qty" name="Rework" stackId="1" stroke="#d97706" fill="#fef3c7" />
                      <Area type="monotone" dataKey="rejected_qty" name="Rejected" stackId="1" stroke="#dc2626" fill="#fee2e2" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )
            )}

            {prodTab === 'product' && (
              (productionData?.product_wise || []).length === 0 ? (
                <EmptyState />
              ) : (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={productionData.product_wise} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="product_name" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="accepted_qty" name="Accepted" stackId="a" fill="#0f766e" />
                      <Bar dataKey="rework_qty" name="Rework" stackId="a" fill="#d97706" />
                      <Bar dataKey="rejected_qty" name="Rejected" stackId="a" fill="#dc2626" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )
            )}

            {prodTab === 'shift' && (
              (productionData?.shift_wise || []).length === 0 ? (
                <EmptyState />
              ) : (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={productionData.shift_wise} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="shift_name" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="accepted_qty" name="Accepted" fill="#0284c7" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="rejected_qty" name="Rejected" fill="#dc2626" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )
            )}

            {prodTab === 'orders' && (
              (productionData?.order_progress || []).length === 0 ? (
                <EmptyState label="No active production orders found." />
              ) : (
                <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                  {productionData.order_progress.map((ord: any) => (
                    <div key={ord.id} className="border border-slate-100 rounded-lg p-3 space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-900">
                          {ord.order_number} — {ord.product_name}
                        </span>
                        <span className="font-mono tabular-nums text-slate-700 font-semibold">
                          {ord.completed_qty} / {ord.target_qty} ({ord.completion_pct}%)
                        </span>
                      </div>
                      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-teal-600 rounded-full"
                          style={{ width: `${Math.min(100, ord.completion_pct)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}
          </section>
        )}

        {/* Quality Analytics Card */}
        {showQuality && (
          <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                  Quality & Defect Analytics
                </h2>
                {qualityData?.summary && (
                  <p className="text-[11px] text-slate-500 font-mono tabular-nums mt-0.5">
                    First-Pass: {qualityData.summary.first_pass_quality_pct ?? 'N/A'}% • Final Acceptance:{' '}
                    {qualityData.summary.final_acceptance_pct ?? 'N/A'}% (Zero Double-Counting)
                  </p>
                )}
              </div>

              <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50 text-[11px]">
                {[
                  { id: 'trend', label: 'Quality Trend' },
                  { id: 'operations', label: 'Operation Defects' },
                  { id: 'employees', label: 'Employee Quality' },
                ].map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setQualTab(t.id as any)}
                    className={`px-2.5 py-1 rounded-md font-medium ${
                      qualTab === t.id ? 'bg-white text-slate-900 border border-slate-200' : 'text-slate-600'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {qualTab === 'trend' && (
              (qualityData?.quality_trend || []).length === 0 ? (
                <EmptyState />
              ) : (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={qualityData.quality_trend} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="work_date" tick={{ fontSize: 11 }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                      <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Line
                        type="monotone"
                        dataKey="first_pass_quality_pct"
                        name="First-Pass Quality %"
                        stroke="#0f766e"
                        strokeWidth={2}
                        connectNulls
                      />
                      <Line
                        type="monotone"
                        dataKey="final_acceptance_pct"
                        name="Final Acceptance %"
                        stroke="#0284c7"
                        strokeWidth={2}
                        connectNulls
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )
            )}

            {qualTab === 'operations' && (
              (qualityData?.operation_defects || []).length === 0 ? (
                <EmptyState />
              ) : (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={qualityData.operation_defects} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="operation_name" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="first_pass_accepted_qty" name="First-Pass Accepted" fill="#0f766e" />
                      <Bar dataKey="rework_qty" name="Rework" fill="#d97706" />
                      <Bar dataKey="rejected_qty" name="Rejected" fill="#dc2626" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )
            )}

            {qualTab === 'employees' && (
              (qualityData?.employee_quality || []).length === 0 ? (
                <EmptyState />
              ) : (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={qualityData.employee_quality.slice(0, 10)} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="employee_name" tick={{ fontSize: 11 }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                      <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="first_pass_quality_pct" name="First-Pass Quality %" fill="#0f766e" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="final_acceptance_pct" name="Final Acceptance %" fill="#0284c7" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )
            )}
          </section>
        )}
      </div>
    </div>
  );
};
