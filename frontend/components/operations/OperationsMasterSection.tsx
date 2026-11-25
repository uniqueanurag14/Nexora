import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { Plus, Clock, History, Layers, Trash2, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';

interface OperationsMasterSectionProps {
  options: {
    departments: any[];
    products: any[];
    operations: any[];
    shifts: any[];
  };
  canManage: boolean;
  canManageStandards: boolean;
  onRefreshOptions: () => Promise<void>;
}

export const OperationsMasterSection: React.FC<OperationsMasterSectionProps> = ({
  options,
  canManage,
  canManageStandards,
  onRefreshOptions,
}) => {
  const [subView, setSubView] = useState<'operations' | 'structure' | 'shifts'>('operations');
  const [operations, setOperations] = useState<any[]>([]);
  const [shifts, setShifts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [opForm, setOpForm] = useState({
    name: '',
    department_id: '',
    standard_time_minutes: '',
    uom: 'Piece',
    is_assembly_operation: false,
    quality_requirements: '',
    description: '',
  });

  const [selectedOpForStd, setSelectedOpForStd] = useState<any | null>(null);
  const [stdHistory, setStdHistory] = useState<any[]>([]);
  const [stdUpdateForm, setStdUpdateForm] = useState({
    standard_time_minutes: '',
    effective_from: '',
    change_reason: '',
  });

  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [stages, setStages] = useState<any[]>([]);
  const [stageForm, setStageForm] = useState({
    operation_id: '',
    component_name: '',
    required_qty_per_unit: '1',
    standard_time_override_minutes: '',
    sequence_order: '1',
    is_mandatory: true,
    is_assembly_stage: false,
  });

  const [shiftForm, setShiftForm] = useState({
    name: '',
    start_time: '09:00',
    end_time: '18:00',
    gross_minutes: '540',
    break_minutes: '60',
  });

  const loadData = async () => {
    setLoading(true);
    setError(null);
    const [opRes, shRes] = await Promise.all([
      api.operationsEngine.listOperations(),
      api.operationsEngine.listShifts(),
    ]);
    if (opRes.success && Array.isArray(opRes.data)) setOperations(opRes.data);
    else if (!opRes.success) setError(opRes.message || 'Unable to load operations from PostgreSQL.');
    if (shRes.success && Array.isArray(shRes.data)) setShifts(shRes.data);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const loadStructure = async (pid: string) => {
    if (!pid) {
      setStages([]);
      return;
    }
    const res = await api.operationsEngine.getProductStructure(Number(pid));
    if (res.success && Array.isArray(res.data)) setStages(res.data);
    else setStages([]);
  };

  useEffect(() => {
    loadStructure(selectedProductId);
  }, [selectedProductId]);

  const handleCreateOperation = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    const stdMins = Number(opForm.standard_time_minutes);
    if (!opForm.name.trim() || !Number.isFinite(stdMins) || stdMins <= 0) {
      setError('Operation name and a positive standard time in minutes are required.');
      return;
    }
    const res = await api.operationsEngine.createOperation({
      name: opForm.name.trim(),
      department_id: opForm.department_id ? Number(opForm.department_id) : null,
      standard_time_minutes: stdMins,
      uom: opForm.uom.trim() || 'Piece',
      is_assembly_operation: opForm.is_assembly_operation,
      quality_requirements: opForm.quality_requirements.trim(),
      description: opForm.description.trim(),
    });
    if (!res.success) {
      setError(res.message || 'Failed to create operation.');
      return;
    }
    setNotice(`Operation ${res.data?.operation_code || ''} saved with Version 1 standard time.`);
    setOpForm({
      name: '',
      department_id: '',
      standard_time_minutes: '',
      uom: 'Piece',
      is_assembly_operation: false,
      quality_requirements: '',
      description: '',
    });
    await loadData();
    await onRefreshOptions();
  };

  const openStandardHistory = async (op: any) => {
    setSelectedOpForStd(op);
    setStdUpdateForm({
      standard_time_minutes: String(op.standard_time_minutes || ''),
      effective_from: '',
      change_reason: '',
    });
    const res = await api.operationsEngine.getOperationStandardHistory(op.id);
    if (res.success && Array.isArray(res.data)) setStdHistory(res.data);
    else setStdHistory([]);
  };

  const handleUpdateStandardTime = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOpForStd) return;
    setError(null);
    setNotice(null);
    const stdMins = Number(stdUpdateForm.standard_time_minutes);
    if (!Number.isFinite(stdMins) || stdMins <= 0 || !stdUpdateForm.change_reason.trim()) {
      setError('Enter a positive standard time and documented change reason.');
      return;
    }
    const res = await api.operationsEngine.updateOperationStandardTime(selectedOpForStd.id, {
      standard_time_minutes: stdMins,
      effective_from: stdUpdateForm.effective_from ? new Date(stdUpdateForm.effective_from).toISOString() : undefined,
      change_reason: stdUpdateForm.change_reason.trim(),
    });
    if (!res.success) {
      setError(res.message || 'Failed to update standard time.');
      return;
    }
    setNotice('Standard time updated. Previously recorded production retains its historical standard.');
    await openStandardHistory(selectedOpForStd);
    await loadData();
    await onRefreshOptions();
  };

  const handleAddStage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductId || !stageForm.operation_id || !stageForm.component_name.trim()) {
      setError('Select an operation and enter the component name.');
      return;
    }
    setError(null);
    setNotice(null);
    const res = await api.operationsEngine.addProductStructureStage(Number(selectedProductId), {
      operation_id: Number(stageForm.operation_id),
      component_name: stageForm.component_name.trim(),
      required_qty_per_unit: Number(stageForm.required_qty_per_unit) || 1,
      standard_time_override_minutes: stageForm.standard_time_override_minutes
        ? Number(stageForm.standard_time_override_minutes)
        : null,
      sequence_order: Number(stageForm.sequence_order) || stages.length + 1,
      is_mandatory: stageForm.is_mandatory,
      is_assembly_stage: stageForm.is_assembly_stage,
    });
    if (!res.success) {
      setError(res.message || 'Failed to add product operation stage.');
      return;
    }
    setNotice('Product operation stage added.');
    setStageForm({
      operation_id: '',
      component_name: '',
      required_qty_per_unit: '1',
      standard_time_override_minutes: '',
      sequence_order: String(stages.length + 2),
      is_mandatory: true,
      is_assembly_stage: false,
    });
    await loadStructure(selectedProductId);
  };

  const handleDeleteStage = async (id: number) => {
    setError(null);
    const res = await api.operationsEngine.deleteProductStructureStage(id);
    if (!res.success) {
      setError(res.message || 'Failed to remove stage.');
      return;
    }
    await loadStructure(selectedProductId);
  };

  const handleCreateShift = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    const res = await api.operationsEngine.createShift({
      name: shiftForm.name.trim(),
      start_time: shiftForm.start_time,
      end_time: shiftForm.end_time,
      gross_minutes: Number(shiftForm.gross_minutes),
      break_minutes: Number(shiftForm.break_minutes) || 0,
      working_days: [1, 2, 3, 4, 5, 6],
    });
    if (!res.success) {
      setError(res.message || 'Failed to create shift.');
      return;
    }
    setNotice(`Shift ${res.data?.shift_code || ''} saved.`);
    setShiftForm({ name: '', start_time: '09:00', end_time: '18:00', gross_minutes: '540', break_minutes: '60' });
    await loadData();
    await onRefreshOptions();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-3">
        <div className="flex items-center gap-6">
          {[
            { id: 'operations', label: 'Operation Master & Standards' },
            { id: 'structure', label: 'Product Operation Structure' },
            { id: 'shifts', label: 'Shifts & Working Time' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSubView(tab.id as any)}
              className={`pb-2 text-sm font-semibold border-b-2 transition-colors ${
                subView === tab.id
                  ? 'border-[#0084CC] text-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <button
          onClick={loadData}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 px-3 py-1.5 border border-slate-200 rounded-md bg-white"
        >
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

      {subView === 'operations' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          {canManage && (
            <form
              onSubmit={handleCreateOperation}
              className="xl:col-span-4 bg-white border border-slate-200 rounded-lg p-5 space-y-4 h-fit"
            >
              <div className="border-b border-slate-100 pb-3">
                <h3 className="text-sm font-bold text-slate-900">Register Manufacturing Operation</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Auto-generates OP-XXXX code and Version 1 effective standard time.
                </p>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Operation Name *</label>
                  <input
                    type="text"
                    required
                    value={opForm.name}
                    onChange={(e) => setOpForm({ ...opForm, name: e.target.value })}
                    placeholder="e.g., Head Making"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Standard Time (min) *</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      value={opForm.standard_time_minutes}
                      onChange={(e) => setOpForm({ ...opForm, standard_time_minutes: e.target.value })}
                      placeholder="e.g., 2.00"
                      className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-md"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Unit of Measure</label>
                    <input
                      type="text"
                      value={opForm.uom}
                      onChange={(e) => setOpForm({ ...opForm, uom: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Department</label>
                  <select
                    value={opForm.department_id}
                    onChange={(e) => setOpForm({ ...opForm, department_id: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md bg-white"
                  >
                    <option value="">Shared / Any Department</option>
                    {options.departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({d.code})
                      </option>
                    ))}
                  </select>
                </div>
                <label className="flex items-center gap-2 text-xs text-slate-700 pt-1">
                  <input
                    type="checkbox"
                    checked={opForm.is_assembly_operation}
                    onChange={(e) => setOpForm({ ...opForm, is_assembly_operation: e.target.checked })}
                  />
                  Mark as Final Assembly Operation
                </label>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Quality Requirements</label>
                  <input
                    type="text"
                    value={opForm.quality_requirements}
                    onChange={(e) => setOpForm({ ...opForm, quality_requirements: e.target.value })}
                    placeholder="Stitching integrity, symmetry check"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
                  />
                </div>
              </div>
              <button
                type="submit"
                className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-[#0084CC] hover:bg-[#006FA8] rounded-md"
              >
                <Plus className="w-4 h-4" />
                Save Operation
              </button>
            </form>
          )}

          <div className={`${canManage ? 'xl:col-span-8' : 'xl:col-span-12'} space-y-6`}>
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900">Configured Manufacturing Operations</h3>
                <span className="text-xs font-mono text-slate-500">{operations.length} records</span>
              </div>
              {operations.length === 0 ? (
                <div className="p-10 text-center text-sm text-slate-500">
                  No manufacturing operations configured in PostgreSQL yet.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase">
                        <th className="py-2.5 px-4">Code</th>
                        <th className="py-2.5 px-4">Operation</th>
                        <th className="py-2.5 px-4">Department</th>
                        <th className="py-2.5 px-4 text-right">Std Time</th>
                        <th className="py-2.5 px-4 text-right">8h Expected</th>
                        <th className="py-2.5 px-4 text-right">History</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                      {operations.map((op) => {
                        const std = Number(op.standard_time_minutes || 0);
                        const expected8h = std > 0 ? (480 / std).toFixed(2) : '0.00';
                        return (
                          <tr key={op.id} className="hover:bg-slate-50/70">
                            <td className="py-3 px-4 font-mono text-xs font-semibold text-slate-700">{op.operation_code}</td>
                            <td className="py-3 px-4 font-semibold text-slate-900">
                              {op.name}
                              {op.is_assembly_operation && (
                                <span className="ml-2 text-[11px] font-semibold text-[#0084CC]">Assembly</span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-slate-600">{op.department_name || 'Shared'}</td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-900">
                              {std.toFixed(2)} min / {op.uom || 'Piece'}
                            </td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">{expected8h}</td>
                            <td className="py-3 px-4 text-right">
                              <button
                                onClick={() => openStandardHistory(op)}
                                className="inline-flex items-center gap-1 text-xs font-semibold text-[#0084CC] hover:underline"
                              >
                                <History className="w-3.5 h-3.5" />
                                Versions
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {selectedOpForStd && (
              <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">
                      Standard Time Versions — {selectedOpForStd.operation_code} ({selectedOpForStd.name})
                    </h4>
                    <p className="text-xs text-slate-500">
                      Revisions apply prospectively from the effective timestamp; historical output retains its prior standard.
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedOpForStd(null)}
                    className="text-xs font-semibold text-slate-500 hover:text-slate-900"
                  >
                    Close
                  </button>
                </div>

                {canManageStandards && (
                  <form onSubmit={handleUpdateStandardTime} className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-slate-50 p-3.5 rounded-md border border-slate-200">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">New Std Time (min) *</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        required
                        value={stdUpdateForm.standard_time_minutes}
                        onChange={(e) => setStdUpdateForm({ ...stdUpdateForm, standard_time_minutes: e.target.value })}
                        className="w-full px-2.5 py-1.5 text-sm font-mono border border-slate-300 rounded bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Effective From (Optional)</label>
                      <input
                        type="datetime-local"
                        value={stdUpdateForm.effective_from}
                        onChange={(e) => setStdUpdateForm({ ...stdUpdateForm, effective_from: e.target.value })}
                        className="w-full px-2.5 py-1.5 text-sm border border-slate-300 rounded bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Change Reason *</label>
                      <input
                        type="text"
                        required
                        placeholder="Approved time-study revision"
                        value={stdUpdateForm.change_reason}
                        onChange={(e) => setStdUpdateForm({ ...stdUpdateForm, change_reason: e.target.value })}
                        className="w-full px-2.5 py-1.5 text-sm border border-slate-300 rounded bg-white"
                      />
                    </div>
                    <div className="md:col-span-3 flex justify-end">
                      <button
                        type="submit"
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-[#0084CC] hover:bg-[#006FA8] rounded"
                      >
                        <Clock className="w-3.5 h-3.5" />
                        Publish New Effective Standard
                      </button>
                    </div>
                  </form>
                )}

                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500 uppercase">
                      <th className="py-2 pr-3">Ver</th>
                      <th className="py-2 pr-3">Effective From</th>
                      <th className="py-2 pr-3">Effective To</th>
                      <th className="py-2 pr-3 text-right">Std Minutes</th>
                      <th className="py-2 pr-3">Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {stdHistory.map((h) => (
                      <tr key={h.id}>
                        <td className="py-2 pr-3 font-mono font-semibold">v{h.version_number}</td>
                        <td className="py-2 pr-3 font-mono">{new Date(h.effective_from).toLocaleString()}</td>
                        <td className="py-2 pr-3 font-mono text-slate-500">
                          {h.effective_to ? new Date(h.effective_to).toLocaleString() : 'Active'}
                        </td>
                        <td className="py-2 pr-3 text-right font-mono font-semibold">{Number(h.standard_time_minutes).toFixed(2)} min</td>
                        <td className="py-2 pr-3 text-slate-600">{h.change_reason || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {subView === 'structure' && (
        <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-5">
          <div className="min-w-[280px] max-w-md">
            <label className="block text-xs font-semibold text-slate-700 mb-1">Select Toy / Product</label>
            <select
              value={selectedProductId}
              onChange={(e) => setSelectedProductId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md bg-white"
            >
              <option value="">Choose a registered product...</option>
              {options.products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.sku} — {p.product_name || p.name}
                </option>
              ))}
            </select>
          </div>

          {selectedProductId && canManage && (
            <form onSubmit={handleAddStage} className="grid grid-cols-1 md:grid-cols-6 gap-3 bg-slate-50 p-4 rounded-md border border-slate-200 text-xs">
              <div className="md:col-span-2">
                <label className="block font-semibold text-slate-700 mb-1">Operation *</label>
                <select
                  required
                  value={stageForm.operation_id}
                  onChange={(e) => setStageForm({ ...stageForm, operation_id: e.target.value })}
                  className="w-full px-2.5 py-1.5 text-sm border border-slate-300 rounded bg-white"
                >
                  <option value="">Select operation...</option>
                  {operations.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.operation_code} — {o.name} ({Number(o.standard_time_minutes).toFixed(2)}m)
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Component Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Hands"
                  value={stageForm.component_name}
                  onChange={(e) => setStageForm({ ...stageForm, component_name: e.target.value })}
                  className="w-full px-2.5 py-1.5 text-sm border border-slate-300 rounded bg-white"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Qty / Finished Toy *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={stageForm.required_qty_per_unit}
                  onChange={(e) => setStageForm({ ...stageForm, required_qty_per_unit: e.target.value })}
                  className="w-full px-2.5 py-1.5 text-sm font-mono border border-slate-300 rounded bg-white"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Override Std (min)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="Default"
                  value={stageForm.standard_time_override_minutes}
                  onChange={(e) => setStageForm({ ...stageForm, standard_time_override_minutes: e.target.value })}
                  className="w-full px-2.5 py-1.5 text-sm font-mono border border-slate-300 rounded bg-white"
                />
              </div>
              <div className="flex flex-col justify-end">
                <button
                  type="submit"
                  className="px-3 py-2 text-xs font-semibold text-white bg-[#0084CC] hover:bg-[#006FA8] rounded"
                >
                  Add Requirement
                </button>
              </div>
              <div className="md:col-span-6 flex items-center gap-5 text-slate-700">
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={stageForm.is_mandatory}
                    onChange={(e) => setStageForm({ ...stageForm, is_mandatory: e.target.checked })}
                  />
                  Mandatory for Assembly
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={stageForm.is_assembly_stage}
                    onChange={(e) => setStageForm({ ...stageForm, is_assembly_stage: e.target.checked })}
                  />
                  Assembly Stage (not a component part)
                </label>
              </div>
            </form>
          )}

          {!selectedProductId ? (
            <div className="py-8 text-center text-sm text-slate-500">
              Select a product above to view or configure its component requirements per finished toy.
            </div>
          ) : stages.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-500">
              No operation stages configured for this product yet.
            </div>
          ) : (
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase">
                  <th className="py-2.5 px-4">Seq</th>
                  <th className="py-2.5 px-4">Operation</th>
                  <th className="py-2.5 px-4">Component</th>
                  <th className="py-2.5 px-4 text-right">Qty / Toy</th>
                  <th className="py-2.5 px-4 text-right">Effective Std</th>
                  <th className="py-2.5 px-4">Role</th>
                  {canManage && <th className="py-2.5 px-4 text-right">Remove</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stages.map((st) => (
                  <tr key={st.id}>
                    <td className="py-2.5 px-4 font-mono text-xs">{st.sequence_order}</td>
                    <td className="py-2.5 px-4 font-semibold text-slate-900">
                      {st.operation_code} — {st.operation_name}
                    </td>
                    <td className="py-2.5 px-4 text-slate-700">{st.component_name}</td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums">{st.required_qty_per_unit}</td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                      {Number(st.effective_standard_time_minutes || 0).toFixed(2)} min
                    </td>
                    <td className="py-2.5 px-4 text-xs text-slate-600">
                      {st.is_assembly_stage ? 'Assembly Stage' : st.is_mandatory ? 'Mandatory Component' : 'Optional'}
                    </td>
                    {canManage && (
                      <td className="py-2.5 px-4 text-right">
                        <button onClick={() => handleDeleteStage(st.id)} className="text-slate-400 hover:text-rose-600">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {subView === 'shifts' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          {canManage && (
            <form onSubmit={handleCreateShift} className="xl:col-span-4 bg-white border border-slate-200 rounded-lg p-5 space-y-3 h-fit">
              <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">Add Shift Schedule</h3>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Shift Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Day Shift A"
                  value={shiftForm.name}
                  onChange={(e) => setShiftForm({ ...shiftForm, name: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Start Time</label>
                  <input
                    type="time"
                    value={shiftForm.start_time}
                    onChange={(e) => setShiftForm({ ...shiftForm, start_time: e.target.value })}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">End Time</label>
                  <input
                    type="time"
                    value={shiftForm.end_time}
                    onChange={(e) => setShiftForm({ ...shiftForm, end_time: e.target.value })}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-md"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Gross Minutes</label>
                  <input
                    type="number"
                    min={1}
                    value={shiftForm.gross_minutes}
                    onChange={(e) => setShiftForm({ ...shiftForm, gross_minutes: e.target.value })}
                    className="w-full px-2.5 py-2 text-sm font-mono border border-slate-300 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Break Minutes</label>
                  <input
                    type="number"
                    min={0}
                    value={shiftForm.break_minutes}
                    onChange={(e) => setShiftForm({ ...shiftForm, break_minutes: e.target.value })}
                    className="w-full px-2.5 py-2 text-sm font-mono border border-slate-300 rounded-md"
                  />
                </div>
              </div>
              <button
                type="submit"
                className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-[#0084CC] hover:bg-[#006FA8] rounded-md"
              >
                <Layers className="w-4 h-4" />
                Save Shift
              </button>
            </form>
          )}
          <div className={`${canManage ? 'xl:col-span-8' : 'xl:col-span-12'} bg-white border border-slate-200 rounded-lg overflow-hidden`}>
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">Active Manufacturing Shifts</h3>
              <span className="text-xs font-mono text-slate-500">{shifts.length} shifts</span>
            </div>
            {shifts.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-500">No shifts configured yet.</div>
            ) : (
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase">
                    <th className="py-2.5 px-4">Code</th>
                    <th className="py-2.5 px-4">Shift Name</th>
                    <th className="py-2.5 px-4">Window</th>
                    <th className="py-2.5 px-4 text-right">Productive Mins</th>
                    <th className="py-2.5 px-4 text-right">Break</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {shifts.map((s) => (
                    <tr key={s.id}>
                      <td className="py-3 px-4 font-mono text-xs font-semibold text-slate-700">{s.shift_code}</td>
                      <td className="py-3 px-4 font-semibold text-slate-900">{s.name}</td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-600">
                        {s.start_time} – {s.end_time}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold">
                        {s.available_productive_minutes} min
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-600">{s.break_minutes} min</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
