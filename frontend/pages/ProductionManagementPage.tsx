import React, { useState, useEffect, useCallback } from 'react';
import { Factory, Plus, RefreshCw, PlayCircle, CheckCircle2, ClipboardList, X } from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';

interface ProductionManagementPageProps {
  onNavigate?: (route: string) => void;
}

const STATUS_BADGE: Record<string, string> = {
  Planned: 'bg-slate-100 text-slate-700 border-slate-200',
  'In Progress': 'bg-sky-50 text-sky-700 border-sky-200',
  'On Hold': 'bg-amber-50 text-amber-700 border-amber-200',
  Completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Cancelled: 'bg-rose-50 text-rose-700 border-rose-200',
};

export const ProductionManagementPage: React.FC<ProductionManagementPageProps> = () => {
  const { notify } = useAuth();
  const [workOrders, setWorkOrders] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [boms, setBoms] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  // Create Work Order modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [woProductId, setWoProductId] = useState<number | ''>('');
  const [woBomId, setWoBomId] = useState<number | ''>('');
  const [woPlannedQty, setWoPlannedQty] = useState('100');
  const [woPriority, setWoPriority] = useState('Medium');
  const [woTeam, setWoTeam] = useState('');
  const [woStartDate, setWoStartDate] = useState('');
  const [woEndDate, setWoEndDate] = useState('');
  const [woNotes, setWoNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Progress log modal
  const [progressTarget, setProgressTarget] = useState<any | null>(null);
  const [stageName, setStageName] = useState('');
  const [stageTeam, setStageTeam] = useState('');
  const [producedQty, setProducedQty] = useState('');
  const [rejectedQty, setRejectedQty] = useState('0');
  const [progressNotes, setProgressNotes] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [woRes, prodRes, teamRes] = await Promise.all([
        api.erp.getWorkOrders(statusFilter),
        api.erp.getProducts(),
        api.erp.getProductionTeams(),
      ]);
      setWorkOrders(woRes.success && Array.isArray(woRes.data) ? woRes.data : []);
      setProducts(prodRes.success && Array.isArray(prodRes.data) ? prodRes.data : []);
      setTeams(teamRes.success && Array.isArray(teamRes.data) ? teamRes.data : []);
    } catch {
      notify('error', 'Failed to load production work orders from PostgreSQL.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, notify]);

  useEffect(() => {
    if (!woProductId) {
      setBoms([]);
      return;
    }
    api.erp
      .getProductDetail(Number(woProductId))
      .then((res) => {
        if (res.success && Array.isArray(res.data?.boms)) {
          setBoms(res.data.boms);
        } else {
          setBoms([]);
        }
      })
      .catch(() => setBoms([]));
  }, [woProductId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreateWorkOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!woProductId || Number(woPlannedQty) <= 0) {
      notify('error', 'Select a product and enter a valid planned quantity.');
      return;
    }
    setSaving(true);
    try {
      const res = await api.erp.createWorkOrder({
        product_id: Number(woProductId),
        bom_id: woBomId ? Number(woBomId) : undefined,
        planned_qty: Number(woPlannedQty),
        priority: woPriority,
        assigned_team: woTeam || undefined,
        scheduled_start_date: woStartDate || undefined,
        scheduled_end_date: woEndDate || undefined,
        notes: woNotes || undefined,
      });
      if (res.success) {
        notify('success', res.message || 'Work order created.');
        setShowCreateModal(false);
        setWoProductId('');
        setWoBomId('');
        setWoNotes('');
        loadData();
      } else {
        notify('error', res.message || 'Failed to create work order.');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (id: number, status: string) => {
    const res = await api.erp.updateWorkOrderStatus(id, status);
    if (res.success) {
      notify('success', `Work order status updated to ${status}.`);
      loadData();
    } else {
      notify('error', res.message || 'Failed to update status.');
    }
  };

  const handleLogProgress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!progressTarget || !stageName.trim()) return;
    setSaving(true);
    try {
      const res = await api.erp.logWorkOrderProgress(progressTarget.id, {
        stage_name: stageName.trim(),
        team_name: stageTeam || undefined,
        produced_qty: Number(producedQty) || 0,
        rejected_qty: Number(rejectedQty) || 0,
        notes: progressNotes || undefined,
      });
      if (res.success) {
        notify('success', 'Production progress logged.');
        setProgressTarget(null);
        setStageName('');
        setProducedQty('');
        setRejectedQty('0');
        setProgressNotes('');
        loadData();
      } else {
        notify('error', res.message || 'Failed to log progress.');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 pb-8">
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center">
            <Factory className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-bold text-sky-600 uppercase tracking-wider">Manufacturing Execution</span>
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900">Production Management &amp; Work Orders</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Plan work orders against BOMs, track real-time floor output, and record production stage progress in PostgreSQL.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Work Order</span>
          </button>
          <button
            onClick={loadData}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex items-center gap-2 flex-wrap">
        {['all', 'Planned', 'In Progress', 'On Hold', 'Completed'].map((st) => (
          <button
            key={st}
            onClick={() => setStatusFilter(st)}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
              statusFilter === st
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {st === 'all' ? 'All Work Orders' : st}
          </button>
        ))}
      </div>

      {/* Work Orders Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="py-3 px-4">Work Order</th>
                <th className="py-3 px-4">Product</th>
                <th className="py-3 px-4">Team &amp; Priority</th>
                <th className="py-3 px-4">Progress</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">Loading work orders...</td>
                </tr>
              ) : workOrders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-14 text-center text-slate-400">
                    No work orders found. Click &ldquo;New Work Order&rdquo; to schedule production.
                  </td>
                </tr>
              ) : (
                workOrders.map((wo) => {
                  const pct =
                    Number(wo.planned_qty) > 0
                      ? Math.min(100, Math.round((Number(wo.completed_qty || 0) / Number(wo.planned_qty)) * 100))
                      : 0;
                  return (
                    <tr key={wo.id} className="hover:bg-slate-50/60">
                      <td className="py-3 px-4">
                        <div className="font-mono font-bold text-slate-900">{wo.work_order_number}</div>
                        <div className="text-[11px] text-slate-500">
                          {wo.scheduled_start_date ? `Start: ${String(wo.scheduled_start_date).slice(0, 10)}` : 'Unscheduled'}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">{wo.product_name || `Product #${wo.product_id}`}</div>
                        <div className="text-[11px] font-mono text-slate-500">{wo.product_code || ''}</div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-800">{wo.assigned_team || 'Unassigned'}</div>
                        <div className="text-[10px] font-bold text-slate-500 uppercase">{wo.priority} Priority</div>
                      </td>
                      <td className="py-3 px-4 min-w-[180px]">
                        <div className="flex justify-between text-[11px] font-semibold mb-1">
                          <span>
                            {Number(wo.completed_qty || 0)} / {Number(wo.planned_qty || 0)}
                          </span>
                          <span>{pct}%</span>
                        </div>
                        <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-sky-600 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            STATUS_BADGE[wo.status] || 'bg-slate-100 text-slate-700 border-slate-200'
                          }`}
                        >
                          {wo.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          {wo.status === 'Planned' && (
                            <button
                              onClick={() => handleStatusChange(wo.id, 'In Progress')}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-50 text-sky-700 border border-sky-200 hover:bg-sky-100 text-[11px] font-bold"
                            >
                              <PlayCircle className="w-3 h-3" /> Start
                            </button>
                          )}
                          {wo.status !== 'Completed' && wo.status !== 'Cancelled' && (
                            <>
                              <button
                                onClick={() => {
                                  setProgressTarget(wo);
                                  setStageTeam(wo.assigned_team || '');
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 text-[11px] font-semibold"
                              >
                                <ClipboardList className="w-3 h-3" /> Log Progress
                              </button>
                              <button
                                onClick={() => handleStatusChange(wo.id, 'Completed')}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 text-[11px] font-bold"
                              >
                                <CheckCircle2 className="w-3 h-3" /> Complete
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Work Order Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="text-sm font-bold text-slate-900">Create Production Work Order</h3>
              <button onClick={() => setShowCreateModal(false)} className="p-1 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateWorkOrder} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Product *</label>
                <select
                  required
                  value={woProductId}
                  onChange={(e) => setWoProductId(e.target.value ? Number(e.target.value) : '')}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
                >
                  <option value="">Select product...</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.product_name} ({p.product_code})
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">BOM (Optional)</label>
                  <select
                    value={woBomId}
                    onChange={(e) => setWoBomId(e.target.value ? Number(e.target.value) : '')}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
                  >
                    <option value="">None</option>
                    {boms.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.bom_code} ({b.version})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Planned Quantity *</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={woPlannedQty}
                    onChange={(e) => setWoPlannedQty(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Priority</label>
                  <select
                    value={woPriority}
                    onChange={(e) => setWoPriority(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                    <option value="Urgent">Urgent</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Assigned Team</label>
                  <select
                    value={woTeam}
                    onChange={(e) => setWoTeam(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
                  >
                    <option value="">Select team...</option>
                    {teams.map((t) => (
                      <option key={t.id} value={t.team_name}>
                        {t.team_name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Scheduled Start</label>
                  <input
                    type="date"
                    value={woStartDate}
                    onChange={(e) => setWoStartDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Scheduled End</label>
                  <input
                    type="date"
                    value={woEndDate}
                    onChange={(e) => setWoEndDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Notes</label>
                <textarea
                  rows={2}
                  value={woNotes}
                  onChange={(e) => setWoNotes(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-xl bg-sky-600 text-white text-xs font-bold disabled:opacity-50"
                >
                  {saving ? 'Creating...' : 'Create Work Order'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Log Progress Modal */}
      {progressTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="text-sm font-bold text-slate-900">
                Log Progress — {progressTarget.work_order_number}
              </h3>
              <button onClick={() => setProgressTarget(null)} className="p-1 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleLogProgress} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Production Stage *</label>
                <input
                  type="text"
                  required
                  value={stageName}
                  onChange={(e) => setStageName(e.target.value)}
                  placeholder="e.g. Assembly, Stitching, Packaging"
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Produced Qty *</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={producedQty}
                    onChange={(e) => setProducedQty(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Rejected Qty</label>
                  <input
                    type="number"
                    min="0"
                    value={rejectedQty}
                    onChange={(e) => setRejectedQty(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Notes</label>
                <textarea
                  rows={2}
                  value={progressNotes}
                  onChange={(e) => setProgressNotes(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setProgressTarget(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-xl bg-sky-600 text-white text-xs font-bold disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Progress'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
