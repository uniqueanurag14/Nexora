import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import {
  FileSpreadsheet,
  FileText,
  Trophy,
  Sliders,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Award,
} from 'lucide-react';

interface PerformanceRewardsSectionProps {
  mode: 'performance' | 'rewards';
  options: {
    departments: any[];
    operations: any[];
    products: any[];
    work_orders: any[];
  };
  canExport: boolean;
  canManagePolicy: boolean;
  canManageRewards: boolean;
  canApproveRewards: boolean;
}

const REWARD_CATEGORIES = [
  { value: 'best_employee_day', label: 'Best Employee of the Day' },
  { value: 'best_employee_week', label: 'Best Employee of the Week' },
  { value: 'best_employee_month', label: 'Best Employee of the Month' },
  { value: 'best_performer_operation', label: 'Best Performer by Operation' },
  { value: 'best_quality_performer', label: 'Best Quality Performer' },
  { value: 'most_consistent_employee', label: 'Most Consistent Employee' },
  { value: 'overall_best_employee', label: 'Overall Best Employee' },
];

export const PerformanceRewardsSection: React.FC<PerformanceRewardsSectionProps> = ({
  mode,
  options,
  canExport,
  canManagePolicy,
  canManageRewards,
  canApproveRewards,
}) => {
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);

  const [filters, setFilters] = useState({
    period: 'custom',
    start_date: weekAgo,
    end_date: today,
    department_id: '',
    operation_id: '',
    product_id: '',
    sort_by: 'final_score',
    sort_dir: 'desc' as 'asc' | 'desc',
    page: 1,
    limit: 25,
  });

  const [report, setReport] = useState<any | null>(null);
  const [policy, setPolicy] = useState<any | null>(null);
  const [showPolicyEditor, setShowPolicyEditor] = useState(false);

  const [rewardCategory, setRewardCategory] = useState('best_employee_week');
  const [rewardOpId, setRewardOpId] = useState('');
  const [candidates, setCandidates] = useState<any[]>([]);
  const [rewardHistory, setRewardHistory] = useState<any[]>([]);
  const [rewardRules, setRewardRules] = useState<any[]>([]);
  const [ruleForm, setRuleForm] = useState({
    rule_name: '',
    category: 'best_employee_month',
    frequency: 'monthly' as 'daily' | 'weekly' | 'monthly',
    min_productivity_pct: '90',
    min_quality_pct: '95',
    min_working_days: '5',
    reward_type: 'Monetary Bonus',
    reward_amount: '1000',
  });

  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState<'xlsx' | 'pdf' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadPerformance = async () => {
    setLoading(true);
    setError(null);
    const [repRes, polRes] = await Promise.all([
      api.operationsEngine.getPerformanceReport({
        period: filters.period,
        start_date: filters.start_date,
        end_date: filters.end_date,
        department_id: filters.department_id ? Number(filters.department_id) : undefined,
        operation_id: filters.operation_id ? Number(filters.operation_id) : undefined,
        product_id: filters.product_id ? Number(filters.product_id) : undefined,
        sort_by: filters.sort_by,
        sort_dir: filters.sort_dir,
        page: filters.page,
        limit: filters.limit,
      }),
      api.operationsEngine.getScoringPolicy(),
    ]);
    if (repRes.success) setReport(repRes.data);
    else setError(repRes.message || 'Unable to compute performance report.');
    if (polRes.success && polRes.data) setPolicy(polRes.data);
    setLoading(false);
  };

  const loadRewards = async () => {
    setLoading(true);
    setError(null);
    const [candRes, histRes, rulesRes] = await Promise.all([
      api.operationsEngine.getRewardCandidates({
        period: 'custom',
        start_date: filters.start_date,
        end_date: filters.end_date,
        category: rewardCategory,
        operation_id: rewardOpId ? Number(rewardOpId) : undefined,
      }),
      api.operationsEngine.listRewardHistory(),
      api.operationsEngine.listRewardRules(),
    ]);
    if (candRes.success && candRes.data?.candidates) setCandidates(candRes.data.candidates);
    else setCandidates([]);
    if (histRes.success && Array.isArray(histRes.data)) setRewardHistory(histRes.data);
    if (rulesRes.success && Array.isArray(rulesRes.data)) setRewardRules(rulesRes.data);
    setLoading(false);
  };

  useEffect(() => {
    if (mode === 'performance') loadPerformance();
    else loadRewards();
  }, [mode, filters.page, filters.sort_by, filters.sort_dir, rewardCategory, rewardOpId]);

  const handleSavePolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!policy) return;
    setError(null);
    setNotice(null);
    const sum = Number(policy.productivity_weight) + Number(policy.quality_weight) + Number(policy.consistency_weight);
    if (Math.abs(sum - 100) > 0.01) {
      setError(`Weights must total 100.00%. Current sum is ${sum.toFixed(2)}%.`);
      return;
    }
    const res = await api.operationsEngine.saveScoringPolicy({
      policy_name: policy.policy_name || 'Active Manufacturing Evaluation Policy',
      productivity_weight: Number(policy.productivity_weight),
      quality_weight: Number(policy.quality_weight),
      consistency_weight: Number(policy.consistency_weight),
      max_productivity_score_cap: Number(policy.max_productivity_score_cap ?? 120),
      consistency_min_productivity_pct: Number(policy.consistency_min_productivity_pct ?? 85),
      consistency_min_quality_pct: Number(policy.consistency_min_quality_pct ?? 95),
      min_reward_productivity_pct: Number(policy.min_reward_productivity_pct ?? 90),
      min_reward_quality_pct: Number(policy.min_reward_quality_pct ?? 95),
      hardware_debounce_seconds: Number(policy.hardware_debounce_seconds ?? 2),
    });
    if (!res.success) {
      setError(res.message || 'Failed to save scoring policy.');
      return;
    }
    setNotice('Scoring policy updated.');
    setShowPolicyEditor(false);
    await loadPerformance();
  };

  const handleExport = async (format: 'xlsx' | 'pdf') => {
    setExporting(format);
    setError(null);
    try {
      await api.operationsEngine.exportPerformanceReport(format, {
        period: filters.period,
        start_date: filters.start_date,
        end_date: filters.end_date,
        department_id: filters.department_id ? Number(filters.department_id) : undefined,
        operation_id: filters.operation_id ? Number(filters.operation_id) : undefined,
        product_id: filters.product_id ? Number(filters.product_id) : undefined,
      });
    } catch (e: any) {
      setError(e?.message || 'Report export failed.');
    } finally {
      setExporting(null);
    }
  };

  const handleNominate = async (cand: any) => {
    setError(null);
    setNotice(null);
    const res = await api.operationsEngine.nominateReward({
      employee_id: cand.employee_id,
      category: rewardCategory,
      period_type: 'custom',
      period_start: filters.start_date,
      period_end: filters.end_date,
      operation_id: rewardOpId ? Number(rewardOpId) : null,
      reward_type: 'Performance Recognition',
      review_notes: `Nominated via fair operation-weighted ranking (${cand.scoring_band}).`,
    });
    if (!res.success) {
      setError(res.message || 'Failed to nominate employee.');
      return;
    }
    setNotice(`Nomination ${res.data?.award_code || ''} submitted for management approval.`);
    await loadRewards();
  };

  const handleRewardDecision = async (id: number, decision: 'approved' | 'rejected') => {
    setError(null);
    setNotice(null);
    const res = await api.operationsEngine.decideReward(id, {
      decision,
      review_notes: decision === 'approved' ? 'Approved by management after fair score review.' : 'Rejected during review.',
    });
    if (!res.success) {
      setError(res.message || 'Unable to record approval decision.');
      return;
    }
    setNotice(`Reward status updated to ${decision.toUpperCase()}.`);
    await loadRewards();
  };

  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    const res = await api.operationsEngine.saveRewardRule({
      rule_name: ruleForm.rule_name.trim(),
      category: ruleForm.category,
      frequency: ruleForm.frequency,
      min_productivity_pct: Number(ruleForm.min_productivity_pct),
      min_quality_pct: Number(ruleForm.min_quality_pct),
      min_working_days: Number(ruleForm.min_working_days),
      reward_type: ruleForm.reward_type.trim() || 'Monetary Bonus',
      reward_amount: Number(ruleForm.reward_amount) || 0,
    });
    if (!res.success) {
      setError(res.message || 'Failed to save reward rule.');
      return;
    }
    setNotice(`Reward rule ${res.data?.rule_code || ''} created.`);
    setRuleForm({ ...ruleForm, rule_name: '' });
    await loadRewards();
  };

  if (mode === 'performance') {
    const rows = report?.records || [];
    const activePolicy = report?.policy || policy;

    return (
      <div className="space-y-5">
        <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">From Date</label>
              <input
                type="date"
                value={filters.start_date}
                onChange={(e) => setFilters({ ...filters, start_date: e.target.value, page: 1 })}
                className="px-2.5 py-1.5 text-sm font-mono border border-slate-300 rounded"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">To Date</label>
              <input
                type="date"
                value={filters.end_date}
                onChange={(e) => setFilters({ ...filters, end_date: e.target.value, page: 1 })}
                className="px-2.5 py-1.5 text-sm font-mono border border-slate-300 rounded"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Department</label>
              <select
                value={filters.department_id}
                onChange={(e) => setFilters({ ...filters, department_id: e.target.value, page: 1 })}
                className="px-2.5 py-1.5 text-sm border border-slate-300 rounded bg-white"
              >
                <option value="">All Departments</option>
                {options.departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Operation</label>
              <select
                value={filters.operation_id}
                onChange={(e) => setFilters({ ...filters, operation_id: e.target.value, page: 1 })}
                className="px-2.5 py-1.5 text-sm border border-slate-300 rounded bg-white"
              >
                <option value="">All Operations</option>
                {options.operations.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Product</label>
              <select
                value={filters.product_id}
                onChange={(e) => setFilters({ ...filters, product_id: e.target.value, page: 1 })}
                className="px-2.5 py-1.5 text-sm border border-slate-300 rounded bg-white"
              >
                <option value="">All Products</option>
                {options.products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.product_name || p.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={loadPerformance}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-semibold text-white bg-[#0084CC] hover:bg-[#006FA8] rounded"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Apply
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 text-xs text-slate-600">
            <div>
              {activePolicy && (
                <span>
                  Active Weights: <strong className="font-mono">Productivity {activePolicy.productivity_weight}%</strong> ·{' '}
                  <strong className="font-mono">Quality {activePolicy.quality_weight}%</strong> ·{' '}
                  <strong className="font-mono">Consistency {activePolicy.consistency_weight}%</strong> (Cap:{' '}
                  <span className="font-mono">{activePolicy.max_productivity_score_cap}%</span>)
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {canManagePolicy && (
                <button
                  onClick={() => setShowPolicyEditor((p) => !p)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded"
                >
                  <Sliders className="w-3.5 h-3.5" />
                  Scoring Weights
                </button>
              )}
              {canExport && (
                <>
                  <button
                    onClick={() => handleExport('xlsx')}
                    disabled={exporting !== null}
                    className="inline-flex items-center gap-1 px-2.5 py-1 font-semibold text-emerald-800 bg-white border border-emerald-300 hover:bg-emerald-50 rounded disabled:opacity-50"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    {exporting === 'xlsx' ? 'Exporting...' : 'Excel (.xlsx)'}
                  </button>
                  <button
                    onClick={() => handleExport('pdf')}
                    disabled={exporting !== null}
                    className="inline-flex items-center gap-1 px-2.5 py-1 font-semibold text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded disabled:opacity-50"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    {exporting === 'pdf' ? 'Exporting...' : 'PDF'}
                  </button>
                </>
              )}
            </div>
          </div>
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

        {showPolicyEditor && policy && (
          <form onSubmit={handleSavePolicy} className="bg-slate-50 border border-slate-300 rounded-lg p-4 space-y-3">
            <h4 className="text-sm font-bold text-slate-900">Configurable Fair Performance Scoring Policy</h4>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Productivity Weight %</label>
                <input
                  type="number"
                  step="0.5"
                  value={policy.productivity_weight}
                  onChange={(e) => setPolicy({ ...policy, productivity_weight: Number(e.target.value) })}
                  className="w-full px-2.5 py-1.5 font-mono border border-slate-300 rounded bg-white"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Quality Weight %</label>
                <input
                  type="number"
                  step="0.5"
                  value={policy.quality_weight}
                  onChange={(e) => setPolicy({ ...policy, quality_weight: Number(e.target.value) })}
                  className="w-full px-2.5 py-1.5 font-mono border border-slate-300 rounded bg-white"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Consistency Weight %</label>
                <input
                  type="number"
                  step="0.5"
                  value={policy.consistency_weight}
                  onChange={(e) => setPolicy({ ...policy, consistency_weight: Number(e.target.value) })}
                  className="w-full px-2.5 py-1.5 font-mono border border-slate-300 rounded bg-white"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Max Prod Cap %</label>
                <input
                  type="number"
                  value={policy.max_productivity_score_cap}
                  onChange={(e) => setPolicy({ ...policy, max_productivity_score_cap: Number(e.target.value) })}
                  className="w-full px-2.5 py-1.5 font-mono border border-slate-300 rounded bg-white"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Debounce (sec)</label>
                <input
                  type="number"
                  min={0}
                  value={policy.hardware_debounce_seconds}
                  onChange={(e) => setPolicy({ ...policy, hardware_debounce_seconds: Number(e.target.value) })}
                  className="w-full px-2.5 py-1.5 font-mono border border-slate-300 rounded bg-white"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowPolicyEditor(false)} className="px-3 py-1.5 text-xs font-semibold text-slate-600 bg-white border border-slate-300 rounded">
                Cancel
              </button>
              <button type="submit" className="px-4 py-1.5 text-xs font-semibold text-white bg-[#0084CC] hover:bg-[#006FA8] rounded">
                Save Policy
              </button>
            </div>
          </form>
        )}

        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Fair Operation-Weighted Employee Performance Ranking</h3>
              <p className="text-xs text-slate-500">
                Earned standard minutes normalize speed fairly across operations with different standard completion times.
              </p>
            </div>
            <span className="text-xs font-mono text-slate-500">{report?.pagination?.total ?? 0} employees</span>
          </div>
          {rows.length === 0 ? (
            <div className="p-12 text-center text-sm text-slate-500">
              No operation performance records match the selected period and filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase">
                    <th className="py-2.5 px-3">Rank</th>
                    <th className="py-2.5 px-3">Employee</th>
                    <th className="py-2.5 px-3">Operations</th>
                    <th className="py-2.5 px-3 text-right">Sub / Acc</th>
                    <th className="py-2.5 px-3 text-right">Gross Prod %</th>
                    <th className="py-2.5 px-3 text-right">Accepted Prod %</th>
                    <th className="py-2.5 px-3 text-right">Quality %</th>
                    <th className="py-2.5 px-3 text-right">Consistency %</th>
                    <th className="py-2.5 px-3 text-right">Final Score</th>
                    <th className="py-2.5 px-3">Band</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r: any) => (
                    <tr key={r.employee_id} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-3 font-mono text-xs font-bold text-slate-700">#{r.rank}</td>
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-slate-900">{r.employee_name}</div>
                        <div className="text-xs font-mono text-slate-500">
                          {r.emp_id} · {r.department || 'Unassigned'}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-xs text-slate-700">
                        {(r.segments || []).map((s: any) => s.operation_name).join(', ') || '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-xs">
                        {r.total_submitted_qty} / <span className="font-semibold text-slate-900">{r.total_final_accepted_qty}</span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-600">
                        {Number(r.gross_productivity_pct).toFixed(2)}%
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-slate-900">
                        {Number(r.accepted_productivity_pct).toFixed(2)}%
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-emerald-700">
                        {Number(r.effective_quality_score).toFixed(2)}%
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700">
                        {Number(r.consistency_pct).toFixed(2)}%
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-[#0084CC]">
                        {Number(r.final_score).toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 text-xs font-semibold text-slate-700">{r.scoring_band}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  // REWARDS MODE
  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Reward Category</label>
          <select value={rewardCategory} onChange={(e) => setRewardCategory(e.target.value)} className="px-3 py-1.5 text-sm border border-slate-300 rounded bg-white">
            {REWARD_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        {rewardCategory === 'best_performer_operation' && (
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Operation</label>
            <select value={rewardOpId} onChange={(e) => setRewardOpId(e.target.value)} className="px-3 py-1.5 text-sm border border-slate-300 rounded bg-white">
              <option value="">All Operations</option>
              {options.operations.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Period Start</label>
          <input type="date" value={filters.start_date} onChange={(e) => setFilters({ ...filters, start_date: e.target.value })} className="px-2.5 py-1.5 text-sm font-mono border border-slate-300 rounded" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Period End</label>
          <input type="date" value={filters.end_date} onChange={(e) => setFilters({ ...filters, end_date: e.target.value })} className="px-2.5 py-1.5 text-sm font-mono border border-slate-300 rounded" />
        </div>
        <button onClick={loadRewards} className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-semibold text-white bg-[#0084CC] hover:bg-[#006FA8] rounded">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Evaluate Candidates
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

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-600" />
            <h3 className="text-sm font-bold text-slate-900">Ranked Reward Candidates</h3>
          </div>
          <span className="text-xs font-mono text-slate-500">{candidates.length} ranked</span>
        </div>
        {candidates.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">No candidates with recorded work in this period.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase">
                  <th className="py-2.5 px-4">Rank</th>
                  <th className="py-2.5 px-4">Employee</th>
                  <th className="py-2.5 px-4 text-right">Accepted Prod %</th>
                  <th className="py-2.5 px-4 text-right">Quality %</th>
                  <th className="py-2.5 px-4 text-right">Consistency %</th>
                  <th className="py-2.5 px-4 text-right">Final Score</th>
                  <th className="py-2.5 px-4">Eligibility</th>
                  {canManageRewards && <th className="py-2.5 px-4 text-right">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {candidates.slice(0, 20).map((c) => (
                  <tr key={c.employee_id}>
                    <td className="py-2.5 px-4 font-mono font-bold text-slate-700">#{c.rank}</td>
                    <td className="py-2.5 px-4">
                      <div className="font-semibold text-slate-900">{c.employee_name}</div>
                      <div className="text-xs font-mono text-slate-500">{c.emp_id}</div>
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums">{Number(c.accepted_productivity_pct).toFixed(2)}%</td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums">{Number(c.effective_quality_score).toFixed(2)}%</td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums">{Number(c.consistency_pct).toFixed(2)}%</td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums font-bold text-[#0084CC]">
                      {Number(c.final_score).toFixed(2)}
                    </td>
                    <td className="py-2.5 px-4 text-xs">
                      {c.reward_eligible ? (
                        <span className="font-semibold text-emerald-700">Eligible</span>
                      ) : (
                        <span className="text-slate-500">{(c.eligibility_reasons || []).join('; ') || 'Below policy threshold'}</span>
                      )}
                    </td>
                    {canManageRewards && (
                      <td className="py-2.5 px-4 text-right">
                        <button
                          onClick={() => handleNominate(c)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-white bg-[#0084CC] hover:bg-[#006FA8] rounded"
                        >
                          <Award className="w-3.5 h-3.5" />
                          Nominate
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-8 bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">Reward Nominations & Management Approval Ledger</h3>
            <span className="text-xs font-mono text-slate-500">{rewardHistory.length} records</span>
          </div>
          {rewardHistory.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">No reward nominations recorded yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase">
                    <th className="py-2.5 px-3">Award</th>
                    <th className="py-2.5 px-3">Employee</th>
                    <th className="py-2.5 px-3">Category / Period</th>
                    <th className="py-2.5 px-3 text-right">Score</th>
                    <th className="py-2.5 px-3">Status</th>
                    {canApproveRewards && <th className="py-2.5 px-3 text-right">Decision</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rewardHistory.map((r) => (
                    <tr key={r.id}>
                      <td className="py-2.5 px-3 font-mono text-xs text-slate-700">{r.award_code}</td>
                      <td className="py-2.5 px-3 font-semibold text-slate-900">
                        {r.first_name} {r.last_name}
                      </td>
                      <td className="py-2.5 px-3 text-xs text-slate-600">
                        <div>{REWARD_CATEGORIES.find((c) => c.value === r.category)?.label || r.category}</div>
                        <div className="font-mono text-slate-400">
                          {String(r.period_start).slice(0, 10)} – {String(r.period_end).slice(0, 10)}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                        {Number(r.final_score).toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 text-xs font-semibold uppercase text-slate-700">{r.approval_status}</td>
                      {canApproveRewards && (
                        <td className="py-2.5 px-3 text-right space-x-2">
                          {r.approval_status === 'pending_approval' && (
                            <>
                              <button onClick={() => handleRewardDecision(r.id, 'approved')} className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:underline">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Approve
                              </button>
                              <button onClick={() => handleRewardDecision(r.id, 'rejected')} className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700 hover:underline">
                                <XCircle className="w-3.5 h-3.5" />
                                Reject
                              </button>
                            </>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="xl:col-span-4 bg-white border border-slate-200 rounded-lg p-5 space-y-4 h-fit">
          <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">Reward Policy Rules</h3>
          {canManageRewards && (
            <form onSubmit={handleSaveRule} className="space-y-2.5 text-xs">
              <input type="text" required placeholder="Rule name" value={ruleForm.rule_name} onChange={(e) => setRuleForm({ ...ruleForm, rule_name: e.target.value })} className="w-full px-2.5 py-1.5 border border-slate-300 rounded" />
              <select value={ruleForm.category} onChange={(e) => setRuleForm({ ...ruleForm, category: e.target.value })} className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white">
                {REWARD_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
              <div className="grid grid-cols-3 gap-2">
                <input type="number" value={ruleForm.min_productivity_pct} onChange={(e) => setRuleForm({ ...ruleForm, min_productivity_pct: e.target.value })} placeholder="Min Prod %" className="px-2 py-1.5 font-mono border border-slate-300 rounded" />
                <input type="number" value={ruleForm.min_quality_pct} onChange={(e) => setRuleForm({ ...ruleForm, min_quality_pct: e.target.value })} placeholder="Min QC %" className="px-2 py-1.5 font-mono border border-slate-300 rounded" />
                <input type="number" value={ruleForm.min_working_days} onChange={(e) => setRuleForm({ ...ruleForm, min_working_days: e.target.value })} placeholder="Min Days" className="px-2 py-1.5 font-mono border border-slate-300 rounded" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input type="text" value={ruleForm.reward_type} onChange={(e) => setRuleForm({ ...ruleForm, reward_type: e.target.value })} placeholder="Reward type" className="px-2 py-1.5 border border-slate-300 rounded" />
                <input type="number" value={ruleForm.reward_amount} onChange={(e) => setRuleForm({ ...ruleForm, reward_amount: e.target.value })} placeholder="Amount INR" className="px-2 py-1.5 font-mono border border-slate-300 rounded" />
              </div>
              <button type="submit" className="w-full py-1.5 font-semibold text-white bg-slate-800 hover:bg-slate-900 rounded">
                Save Reward Rule
              </button>
            </form>
          )}
          <div className="divide-y divide-slate-100 text-xs">
            {rewardRules.length === 0 ? (
              <p className="py-4 text-center text-slate-500">No reward rules configured yet.</p>
            ) : (
              rewardRules.map((rr) => (
                <div key={rr.id} className="py-2">
                  <div className="font-semibold text-slate-900">
                    {rr.rule_code} — {rr.rule_name}
                  </div>
                  <div className="text-slate-500 font-mono">
                    Prod {rr.min_productivity_pct}% · QC {rr.min_quality_pct}% · {rr.reward_type}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
