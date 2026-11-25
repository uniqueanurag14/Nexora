import React, { useState, useEffect, useCallback } from 'react';
import { CheckSquare, Plus, RefreshCw, Users, Trash2, X } from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';

interface ProductReadinessPageProps {
  onNavigate?: (route: string) => void;
}

export const ProductReadinessPage: React.FC<ProductReadinessPageProps> = () => {
  const { notify } = useAuth();
  const [teams, setTeams] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [workOrders, setWorkOrders] = useState<any[]>([]);
  const [entries, setEntries] = useState<any[]>([]);
  const [teamSummary, setTeamSummary] = useState<any[]>([]);
  const [productSummary, setProductSummary] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [showTeamModal, setShowTeamModal] = useState(false);
  const [teamCode, setTeamCode] = useState('');
  const [teamName, setTeamName] = useState('');
  const [teamDept, setTeamDept] = useState('');
  const [teamLead, setTeamLead] = useState('');

  const [showEntryModal, setShowEntryModal] = useState(false);
  const [entryProductId, setEntryProductId] = useState<number | ''>('');
  const [entryTeamId, setEntryTeamId] = useState<number | ''>('');
  const [entryWoId, setEntryWoId] = useState<number | ''>('');
  const [entryStage, setEntryStage] = useState('');
  const [entryTarget, setEntryTarget] = useState('100');
  const [entryCompleted, setEntryCompleted] = useState('0');
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [teamRes, prodRes, woRes, readRes] = await Promise.all([
        api.erp.getProductionTeams(),
        api.erp.getProducts(),
        api.erp.getWorkOrders('all'),
        api.erp.getProductReadiness(),
      ]);
      setTeams(teamRes.success && Array.isArray(teamRes.data) ? teamRes.data : []);
      setProducts(prodRes.success && Array.isArray(prodRes.data) ? prodRes.data : []);
      setWorkOrders(woRes.success && Array.isArray(woRes.data) ? woRes.data : []);
      if (readRes.success && readRes.data) {
        setEntries(Array.isArray(readRes.data.entries) ? readRes.data.entries : []);
        setTeamSummary(Array.isArray(readRes.data.team_summary) ? readRes.data.team_summary : []);
        setProductSummary(Array.isArray(readRes.data.product_summary) ? readRes.data.product_summary : []);
      }
    } catch {
      notify('error', 'Failed to load product readiness tracking from PostgreSQL.');
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api.erp.createProductionTeam({
        team_code: teamCode.trim(),
        team_name: teamName.trim(),
        department: teamDept.trim() || undefined,
        lead_name: teamLead.trim() || undefined,
      });
      if (res.success) {
        notify('success', 'Production team created.');
        setShowTeamModal(false);
        setTeamCode('');
        setTeamName('');
        setTeamDept('');
        setTeamLead('');
        loadData();
      } else {
        notify('error', res.message || 'Failed to create team.');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleCreateEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!entryProductId || !entryTeamId || !entryStage.trim()) return;
    setSaving(true);
    try {
      const res = await api.erp.createReadinessEntry({
        product_id: Number(entryProductId),
        team_id: Number(entryTeamId),
        work_order_id: entryWoId ? Number(entryWoId) : undefined,
        stage_name: entryStage.trim(),
        target_qty: Number(entryTarget) || 0,
        completed_qty: Number(entryCompleted) || 0,
      });
      if (res.success) {
        notify('success', 'Readiness stage entry created.');
        setShowEntryModal(false);
        setEntryStage('');
        loadData();
      } else {
        notify('error', res.message || 'Failed to create readiness entry.');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleQuickComplete = async (entry: any) => {
    const res = await api.erp.updateReadinessEntry(entry.id, {
      completed_qty: Number(entry.target_qty || 100),
      status: 'Ready',
    });
    if (res.success) {
      notify('success', 'Stage marked Ready (100%).');
      loadData();
    }
  };

  const handleDeleteEntry = async (id: number) => {
    const res = await api.erp.deleteReadinessEntry(id);
    if (res.success) {
      notify('success', 'Readiness record removed.');
      loadData();
    }
  };

  return (
    <div className="space-y-6 pb-8">
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <CheckSquare className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider">Completion Tracking</span>
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900">Product Readiness &amp; Team Completion</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Track team-wise and product-wise completion milestones directly from PostgreSQL.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowTeamModal(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold"
          >
            <Users className="w-3.5 h-3.5" /> Add Team
          </button>
          <button
            onClick={() => setShowEntryModal(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold"
          >
            <Plus className="w-3.5 h-3.5" /> Track Readiness Stage
          </button>
          <button
            onClick={loadData}
            className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Team-Wise & Product-Wise Completion Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
          <h2 className="text-sm font-bold text-slate-900 mb-3">Team-Wise Completion</h2>
          {teamSummary.length === 0 ? (
            <p className="text-xs text-slate-400 py-6 text-center">No team completion data available.</p>
          ) : (
            <div className="space-y-3">
              {teamSummary.map((t) => (
                <div key={t.team_id} className="space-y-1">
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-slate-800">{t.team_name}</span>
                    <span className="font-mono text-emerald-700">{Number(t.avg_completion_percent || 0).toFixed(1)}%</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full"
                      style={{ width: `${Math.min(100, Number(t.avg_completion_percent || 0))}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
          <h2 className="text-sm font-bold text-slate-900 mb-3">Product-Wise Readiness</h2>
          {productSummary.length === 0 ? (
            <p className="text-xs text-slate-400 py-6 text-center">No product readiness data available.</p>
          ) : (
            <div className="space-y-3">
              {productSummary.map((p) => (
                <div key={p.product_id} className="space-y-1">
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-slate-800">{p.product_name}</span>
                    <span className="font-mono text-sky-700">{Number(p.avg_completion_percent || 0).toFixed(1)}%</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-sky-500 rounded-full"
                      style={{ width: `${Math.min(100, Number(p.avg_completion_percent || 0))}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Readiness Matrix Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="py-3 px-4">Product</th>
                <th className="py-3 px-4">Team</th>
                <th className="py-3 px-4">Stage</th>
                <th className="py-3 px-4">Completion</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    No readiness tracking entries yet. Add a team and readiness stage to begin tracking.
                  </td>
                </tr>
              ) : (
                entries.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50/60">
                    <td className="py-3 px-4 font-bold text-slate-900">{e.product_name}</td>
                    <td className="py-3 px-4 font-medium text-slate-700">{e.team_name}</td>
                    <td className="py-3 px-4">{e.stage_name}</td>
                    <td className="py-3 px-4 font-mono font-bold text-slate-800">
                      {Number(e.completed_qty)} / {Number(e.target_qty)} ({Number(e.completion_percent || 0).toFixed(0)}%)
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[10px] font-bold">
                        {e.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        {e.status !== 'Ready' && (
                          <button
                            onClick={() => handleQuickComplete(e)}
                            className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold"
                          >
                            Mark Ready
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteEntry(e.id)}
                          className="p-1.5 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Team Modal */}
      {showTeamModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="text-sm font-bold text-slate-900">Create Production Team</h3>
              <button onClick={() => setShowTeamModal(false)} className="p-1 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateTeam} className="space-y-3">
              <input
                type="text"
                required
                placeholder="Team Code (e.g. TEAM-ASM)"
                value={teamCode}
                onChange={(e) => setTeamCode(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
              />
              <input
                type="text"
                required
                placeholder="Team Name (e.g. Assembly Line A)"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
              />
              <input
                type="text"
                placeholder="Department (Optional)"
                value={teamDept}
                onChange={(e) => setTeamDept(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
              />
              <input
                type="text"
                placeholder="Team Lead (Optional)"
                value={teamLead}
                onChange={(e) => setTeamLead(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
              />
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowTeamModal(false)} className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold">Cancel</button>
                <button type="submit" disabled={saving} className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold">Save Team</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Readiness Stage Modal */}
      {showEntryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="text-sm font-bold text-slate-900">Track Product Readiness Stage</h3>
              <button onClick={() => setShowEntryModal(false)} className="p-1 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateEntry} className="space-y-3">
              <select
                required
                value={entryProductId}
                onChange={(e) => setEntryProductId(e.target.value ? Number(e.target.value) : '')}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
              >
                <option value="">Select Product *</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{p.product_name}</option>
                ))}
              </select>
              <select
                required
                value={entryTeamId}
                onChange={(e) => setEntryTeamId(e.target.value ? Number(e.target.value) : '')}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
              >
                <option value="">Select Team *</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>{t.team_name}</option>
                ))}
              </select>
              <select
                value={entryWoId}
                onChange={(e) => setEntryWoId(e.target.value ? Number(e.target.value) : '')}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
              >
                <option value="">Work Order (Optional)</option>
                {workOrders.map((w) => (
                  <option key={w.id} value={w.id}>{w.work_order_number}</option>
                ))}
              </select>
              <input
                type="text"
                required
                placeholder="Stage Name (e.g. Cutting, Stitching, QC, Packing)"
                value={entryStage}
                onChange={(e) => setEntryStage(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="number"
                  min="1"
                  required
                  placeholder="Target Qty"
                  value={entryTarget}
                  onChange={(e) => setEntryTarget(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
                />
                <input
                  type="number"
                  min="0"
                  placeholder="Completed Qty"
                  value={entryCompleted}
                  onChange={(e) => setEntryCompleted(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowEntryModal(false)} className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold">Cancel</button>
                <button type="submit" disabled={saving} className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold">Save Stage</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
