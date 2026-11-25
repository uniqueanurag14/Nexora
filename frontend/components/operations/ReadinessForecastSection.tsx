import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { TrendingUp, AlertTriangle, RefreshCw, Wrench, CheckCircle2, AlertCircle, ArrowRight } from 'lucide-react';

interface ReadinessForecastSectionProps {
  mode: 'readiness' | 'forecasting';
  options: {
    employees: any[];
    operations: any[];
  };
  canManageReadiness: boolean;
  canApproveQc: boolean;
}

export const ReadinessForecastSection: React.FC<ReadinessForecastSectionProps> = ({
  mode,
  canManageReadiness,
}) => {
  const [orders, setOrders] = useState<any[]>([]);
  const [forecasts, setForecasts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [assembleOrder, setAssembleOrder] = useState<any | null>(null);
  const [assembleQty, setAssembleQty] = useState('1');
  const [assembleNotes, setAssembleNotes] = useState('');

  const loadReadiness = async () => {
    setLoading(true);
    setError(null);
    const res = await api.operationsEngine.listOrderReadiness();
    if (res.success && Array.isArray(res.data)) setOrders(res.data);
    else setError(res.message || 'Unable to load production order readiness.');
    setLoading(false);
  };

  const loadForecasts = async () => {
    setLoading(true);
    setError(null);
    const res = await api.operationsEngine.getForecastSummary();
    if (res.success && Array.isArray(res.data)) setForecasts(res.data);
    else setError(res.message || 'Unable to compute production forecasts.');
    setLoading(false);
  };

  useEffect(() => {
    if (mode === 'readiness') loadReadiness();
    else loadForecasts();
  }, [mode]);

  const handleRecordAssembly = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assembleOrder) return;
    setError(null);
    setNotice(null);
    const qty = Number(assembleQty);
    if (!Number.isFinite(qty) || qty <= 0) {
      setError('Assembled quantity must be greater than zero.');
      return;
    }
    const res = await api.operationsEngine.recordAssembly(assembleOrder.production_order_id, {
      assembled_qty: qty,
      notes: assembleNotes.trim(),
    });
    if (!res.success) {
      setError(res.message || 'Assembly consumption failed.');
      return;
    }
    setNotice(`Assembly ${res.data?.assembly_code || ''} recorded and required WIP components atomically consumed.`);
    setAssembleOrder(null);
    setAssembleQty('1');
    setAssembleNotes('');
    await loadReadiness();
  };

  if (mode === 'readiness') {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-900">Group Production & Finished Product Readiness</h3>
            <p className="text-xs text-slate-500">
              Component WIP is tracked separately from finished assembled toys. Assembly atomically consumes component sets.
            </p>
          </div>
          <button onClick={loadReadiness} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 border border-rose-200 bg-rose-50 text-rose-800 text-sm rounded-md">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {notice && (
          <div className="flex items-start gap-2 p-3 border border-emerald-200 bg-emerald-50 text-emerald-800 text-sm rounded-md">
            <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{notice}</span>
          </div>
        )}

        {assembleOrder && canManageReadiness && (
          <form onSubmit={handleRecordAssembly} className="bg-sky-50/70 border border-sky-300 rounded-lg p-4 flex flex-wrap items-end gap-3">
            <div className="min-w-[220px]">
              <p className="text-xs font-bold text-sky-950 mb-1">
                Assemble Units — {assembleOrder.order_number} ({assembleOrder.product_name})
              </p>
              <p className="text-xs text-sky-800">
                Available Assembly-Ready Sets: <strong className="font-mono">{assembleOrder.potential_assembly_ready_qty}</strong>
              </p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-sky-900 mb-1">Assembled Qty *</label>
              <input
                type="number"
                min={1}
                max={Math.max(1, assembleOrder.potential_assembly_ready_qty)}
                required
                value={assembleQty}
                onChange={(e) => setAssembleQty(e.target.value)}
                className="w-28 px-2.5 py-1.5 text-sm font-mono border border-sky-300 rounded bg-white"
              />
            </div>
            <div className="flex-1 min-w-[180px]">
              <label className="block text-xs font-semibold text-sky-900 mb-1">Batch Notes</label>
              <input
                type="text"
                value={assembleNotes}
                onChange={(e) => setAssembleNotes(e.target.value)}
                placeholder="Assembly batch reference"
                className="w-full px-2.5 py-1.5 text-sm border border-sky-300 rounded bg-white"
              />
            </div>
            <div className="flex items-center gap-2">
              <button type="submit" className="px-3.5 py-1.5 text-xs font-semibold text-white bg-[#0084CC] hover:bg-[#006FA8] rounded">
                Consume WIP & Assemble
              </button>
              <button type="button" onClick={() => setAssembleOrder(null)} className="px-3 py-1.5 text-xs font-semibold text-slate-600 bg-white border border-slate-300 rounded">
                Cancel
              </button>
            </div>
          </form>
        )}

        {orders.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-lg p-12 text-center text-sm text-slate-500">
            No production work orders found in PostgreSQL. Create a Work Order and configure its Product Operation Structure to track readiness.
          </div>
        ) : (
          <div className="space-y-4">
            {orders.map((ord) => (
              <div key={ord.production_order_id} className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-sm font-bold text-slate-900">{ord.order_number}</span>
                      <span className="text-sm font-semibold text-slate-700">{ord.product_name}</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Status: <strong className="text-slate-800">{ord.finished_product_status}</strong>
                      {ord.limiting_component_operation && (
                        <>
                          {' · '}Limiting Stage: <strong className="text-amber-700">{ord.limiting_component_operation}</strong>
                        </>
                      )}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-6 text-right">
                    <div>
                      <div className="text-[11px] uppercase font-semibold text-slate-500">Target</div>
                      <div className="font-mono text-base font-bold text-slate-900 tabular-nums">{ord.target_qty}</div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase font-semibold text-slate-500">Assembly Ready Sets</div>
                      <div className="font-mono text-base font-bold text-sky-700 tabular-nums">{ord.potential_assembly_ready_qty}</div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase font-semibold text-slate-500">Assembled</div>
                      <div className="font-mono text-base font-bold text-slate-900 tabular-nums">{ord.assembled_qty}</div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase font-semibold text-slate-500">Final Approved</div>
                      <div className="font-mono text-base font-bold text-emerald-700 tabular-nums">{ord.final_approved_finished_qty}</div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase font-semibold text-slate-500">Finished Readiness</div>
                      <div className="font-mono text-base font-bold text-[#0084CC] tabular-nums">
                        {Number(ord.finished_product_readiness_pct).toFixed(2)}%
                      </div>
                    </div>
                    {canManageReadiness && ord.potential_assembly_ready_qty > 0 && (
                      <button
                        onClick={() => {
                          setAssembleOrder(ord);
                          setAssembleQty(String(Math.min(10, ord.potential_assembly_ready_qty)));
                        }}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-[#0084CC] hover:bg-[#006FA8] rounded"
                      >
                        <Wrench className="w-3.5 h-3.5" />
                        Assemble
                      </button>
                    )}
                  </div>
                </div>

                {ord.components && ord.components.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase">
                          <th className="py-2 px-4">Component Operation</th>
                          <th className="py-2 px-4 text-right">Qty / Toy</th>
                          <th className="py-2 px-4 text-right">Required Total</th>
                          <th className="py-2 px-4 text-right">Available Accepted</th>
                          <th className="py-2 px-4 text-right">Consumed</th>
                          <th className="py-2 px-4 text-right">Can Make Sets</th>
                          <th className="py-2 px-4 text-right">Remaining</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {ord.components.map((c: any) => (
                          <tr key={c.operation_id} className={c.is_bottleneck ? 'bg-amber-50/40' : ''}>
                            <td className="py-2 px-4 font-semibold text-slate-900">
                              {c.operation_name} ({c.component_name})
                              {c.is_bottleneck && <span className="ml-2 text-amber-700 font-bold">(Bottleneck)</span>}
                            </td>
                            <td className="py-2 px-4 text-right font-mono tabular-nums">{c.required_qty_per_unit}</td>
                            <td className="py-2 px-4 text-right font-mono tabular-nums">{c.total_required_for_order}</td>
                            <td className="py-2 px-4 text-right font-mono tabular-nums font-semibold">{c.available_accepted_qty}</td>
                            <td className="py-2 px-4 text-right font-mono tabular-nums text-slate-500">{c.consumed_in_assembly_qty}</td>
                            <td className="py-2 px-4 text-right font-mono tabular-nums font-semibold text-sky-700">
                              {c.potential_toy_sets_available}
                            </td>
                            <td className="py-2 px-4 text-right font-mono tabular-nums">{c.remaining_required_qty}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // FORECASTING & BOTTLENECKS MODE
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-slate-900">Production Forecasting & Bottleneck Report (Estimates)</h3>
          <p className="text-xs text-slate-500">
            Daily, Weekly, and Monthly forecasts are capacity estimates constrained by the slowest mandatory stage and assembly throughput.
          </p>
        </div>
        <button onClick={loadForecasts} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded hover:bg-slate-50">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Recalculate
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 border border-rose-200 bg-rose-50 text-rose-800 text-sm rounded-md">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {forecasts.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-lg p-12 text-center text-sm text-slate-500">
          No open production work orders with configured product operation structures available to forecast.
        </div>
      ) : (
        <div className="space-y-5">
          {forecasts.map((item: any) => {
            const ord = item.order;
            const f = item.forecast;
            return (
              <div key={ord.id} className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-[#0084CC]" />
                      <span className="font-mono text-sm font-bold text-slate-900">{ord.order_number}</span>
                      <span className="text-sm font-semibold text-slate-700">{ord.product_name}</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Estimate Basis: <strong className="text-slate-800">{f.basis}</strong> — {f.basis_note}
                    </p>
                  </div>

                  <div className="grid grid-cols-3 gap-6 text-right">
                    <div>
                      <div className="text-[11px] uppercase font-semibold text-slate-500">Est. Daily</div>
                      <div className="font-mono text-lg font-bold text-slate-900 tabular-nums">{f.expected_daily_finished_toys}</div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase font-semibold text-slate-500">Est. Weekly</div>
                      <div className="font-mono text-lg font-bold text-[#0084CC] tabular-nums">{f.expected_weekly_finished_toys}</div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase font-semibold text-slate-500">Est. Monthly</div>
                      <div className="font-mono text-lg font-bold text-slate-900 tabular-nums">{f.expected_monthly_finished_toys}</div>
                    </div>
                  </div>
                </div>

                {f.stages && f.stages.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase">
                          <th className="py-2 px-4">Operation Stage</th>
                          <th className="py-2 px-4 text-right">Assigned Staff</th>
                          <th className="py-2 px-4 text-right">Daily Op Cap.</th>
                          <th className="py-2 px-4 text-right">Toy Sets / Day</th>
                          <th className="py-2 px-4 text-right">WIP Buffer</th>
                          <th className="py-2 px-4">Constraint / Recommendation</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {f.stages.map((s: any) => (
                          <tr key={s.operation_id} className={s.is_bottleneck ? 'bg-amber-50/50' : ''}>
                            <td className="py-2.5 px-4 font-semibold text-slate-900">
                              {s.operation_name}
                              {s.is_bottleneck && (
                                <span className="ml-2 inline-flex items-center gap-1 text-amber-800 font-bold">
                                  <AlertTriangle className="w-3 h-3" />
                                  Bottleneck
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono tabular-nums">{s.assigned_employees}</td>
                            <td className="py-2.5 px-4 text-right font-mono tabular-nums">{Number(s.available_daily_units).toFixed(1)}</td>
                            <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                              {Number(s.available_daily_toy_capacity).toFixed(1)}
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-600">{s.available_wip_qty}</td>
                            <td className="py-2.5 px-4 text-slate-700">
                              {s.additional_employees_needed > 0 ? (
                                <span className="inline-flex items-center gap-1 font-semibold text-amber-900">
                                  <ArrowRight className="w-3 h-3" />
                                  {s.recommendation}
                                </span>
                              ) : (
                                <span className="text-slate-500">{s.recommendation}</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
