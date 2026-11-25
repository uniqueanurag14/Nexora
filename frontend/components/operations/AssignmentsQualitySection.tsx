import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import {
  UserCheck,
  ArrowRightLeft,
  AlertTriangle,
  ShieldCheck,
  PauseCircle,
  PlayCircle,
  CheckSquare,
  Clock,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';

interface AssignmentsQualitySectionProps {
  options: {
    employees: any[];
    operations: any[];
    products: any[];
    work_orders: any[];
    shifts: any[];
  };
  canAssign: boolean;
  canApproveQc: boolean;
  canCorrectProduction: boolean;
}

export const AssignmentsQualitySection: React.FC<AssignmentsQualitySectionProps> = ({
  options,
  canAssign,
  canApproveQc,
  canCorrectProduction,
}) => {
  const [subView, setSubView] = useState<'assignments' | 'quality' | 'exceptions' | 'downtime_tasks'>('assignments');
  const [assignments, setAssignments] = useState<any[]>([]);
  const [inspections, setInspections] = useState<any[]>([]);
  const [hwEvents, setHwEvents] = useState<any[]>([]);
  const [downtimeLogs, setDowntimeLogs] = useState<any[]>([]);
  const [taskSessions, setTaskSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [assignForm, setAssignForm] = useState({
    employee_id: '',
    product_id: '',
    operation_id: '',
    production_order_id: '',
    shift_id: '',
    workstation: '',
  });

  const [transferTarget, setTransferTarget] = useState<any | null>(null);
  const [transferOpId, setTransferOpId] = useState('');
  const [transferNotes, setTransferNotes] = useState('');

  const [qcForm, setQcForm] = useState({
    employee_id: '',
    product_id: '',
    operation_id: '',
    production_order_id: '',
    submitted_qty: '',
    inspected_qty: '',
    first_pass_accepted_qty: '',
    rejected_qty: '0',
    rework_qty: '0',
    accepted_after_rework_qty: '0',
    defect_reason: '',
  });

  const [resolvingEvt, setResolvingEvt] = useState<any | null>(null);
  const [resolveOpId, setResolveOpId] = useState('');
  const [resolveProductId, setResolveProductId] = useState('');
  const [resolveOrderId, setResolveOrderId] = useState('');
  const [resolveNotes, setResolveNotes] = useState('');

  const [dtForm, setDtForm] = useState({
    employee_id: '',
    operation_id: '',
    reason_category: 'machine_breakdown',
    duration_minutes: '30',
    approved_exclusion: true,
    notes: '',
  });

  const [taskForm, setTaskForm] = useState({
    employee_id: '',
    operation_id: '',
    product_id: '',
  });

  const loadAll = async () => {
    setLoading(true);
    setError(null);
    const [aRes, qRes, hRes, dRes, tRes] = await Promise.all([
      api.operationsEngine.listAssignments({}),
      api.operationsEngine.listQualityInspections({}),
      api.operationsEngine.listHardwareEvents({ limit: 80 }),
      api.operationsEngine.listDowntime(),
      api.operationsEngine.listTaskSessions(),
    ]);
    if (aRes.success && Array.isArray(aRes.data)) setAssignments(aRes.data);
    if (qRes.success && Array.isArray(qRes.data)) setInspections(qRes.data);
    if (hRes.success && Array.isArray(hRes.data)) setHwEvents(hRes.data);
    if (dRes.success && Array.isArray(dRes.data)) setDowntimeLogs(dRes.data);
    if (tRes.success && Array.isArray(tRes.data)) setTaskSessions(tRes.data);
    setLoading(false);
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleCreateAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!assignForm.employee_id || !assignForm.product_id || !assignForm.operation_id) {
      setError('Employee, Product, and Operation are required.');
      return;
    }
    const res = await api.operationsEngine.createAssignment({
      employee_id: Number(assignForm.employee_id),
      product_id: Number(assignForm.product_id),
      operation_id: Number(assignForm.operation_id),
      production_order_id: assignForm.production_order_id ? Number(assignForm.production_order_id) : null,
      shift_id: assignForm.shift_id ? Number(assignForm.shift_id) : null,
      workstation: assignForm.workstation.trim() || undefined,
    });
    if (!res.success) {
      setError(res.message || 'Failed to create assignment.');
      return;
    }
    setNotice(`Assignment ${res.data?.assignment_code || ''} activated.`);
    setAssignForm({ employee_id: '', product_id: '', operation_id: '', production_order_id: '', shift_id: '', workstation: '' });
    await loadAll();
  };

  const handleTransferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferTarget || !transferOpId) return;
    setError(null);
    setNotice(null);
    const res = await api.operationsEngine.transferAssignment(transferTarget.id, {
      operation_id: Number(transferOpId),
      notes: transferNotes.trim() || 'Mid-shift operation reassignment',
    });
    if (!res.success) {
      setError(res.message || 'Transfer failed.');
      return;
    }
    setNotice('Employee transferred mid-shift. Prior operation credit remains intact.');
    setTransferTarget(null);
    setTransferOpId('');
    setTransferNotes('');
    await loadAll();
  };

  const handleRecordQc = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    const submitted = Number(qcForm.submitted_qty);
    const inspected = qcForm.inspected_qty ? Number(qcForm.inspected_qty) : submitted;
    const firstPass = Number(qcForm.first_pass_accepted_qty);
    const rejected = Number(qcForm.rejected_qty);
    const rework = Number(qcForm.rework_qty);
    const afterRework = Number(qcForm.accepted_after_rework_qty);
    if (firstPass + rejected + rework > inspected) {
      setError('First-Pass Accepted + Rejected + Rework cannot exceed Inspected Quantity.');
      return;
    }
    if (afterRework > rework) {
      setError('Accepted After Rework cannot exceed Rework Quantity (no double-counting allowed).');
      return;
    }
    const res = await api.operationsEngine.createQualityInspection({
      employee_id: Number(qcForm.employee_id),
      product_id: Number(qcForm.product_id),
      operation_id: Number(qcForm.operation_id),
      production_order_id: qcForm.production_order_id ? Number(qcForm.production_order_id) : null,
      submitted_qty: submitted,
      inspected_qty: inspected,
      first_pass_accepted_qty: firstPass,
      rejected_qty: rejected,
      rework_qty: rework,
      accepted_after_rework_qty: afterRework,
      defect_reason: qcForm.defect_reason.trim() || undefined,
    });
    if (!res.success) {
      setError(res.message || 'Failed to record quality inspection.');
      return;
    }
    setNotice(`Quality inspection ${res.data?.inspection_code || ''} recorded.`);
    setQcForm({
      ...qcForm,
      submitted_qty: '',
      inspected_qty: '',
      first_pass_accepted_qty: '',
      rejected_qty: '0',
      rework_qty: '0',
      accepted_after_rework_qty: '0',
      defect_reason: '',
    });
    await loadAll();
  };

  const handleResolveException = async (action: 'resolve_accept' | 'reject') => {
    if (!resolvingEvt) return;
    setError(null);
    setNotice(null);
    if (!resolveNotes.trim()) {
      setError('Resolution notes are mandatory for audit compliance.');
      return;
    }
    if (action === 'resolve_accept' && (!resolveOpId || !resolveProductId)) {
      setError('Select both Operation and Product to accept this hardware event.');
      return;
    }
    const res = await api.operationsEngine.resolveHardwareException(resolvingEvt.id, {
      action,
      operation_id: action === 'resolve_accept' ? Number(resolveOpId) : undefined,
      product_id: action === 'resolve_accept' ? Number(resolveProductId) : undefined,
      production_order_id: resolveOrderId ? Number(resolveOrderId) : null,
      resolution_notes: resolveNotes.trim(),
    });
    if (!res.success) {
      setError(res.message || 'Failed to resolve exception.');
      return;
    }
    setNotice(`Hardware event ${resolvingEvt.event_uid} resolved.`);
    setResolvingEvt(null);
    setResolveOpId('');
    setResolveProductId('');
    setResolveOrderId('');
    setResolveNotes('');
    await loadAll();
  };

  const handleCreateDowntime = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    const res = await api.operationsEngine.createDowntime({
      employee_id: dtForm.employee_id ? Number(dtForm.employee_id) : null,
      operation_id: dtForm.operation_id ? Number(dtForm.operation_id) : null,
      reason_category: dtForm.reason_category,
      duration_minutes: Number(dtForm.duration_minutes),
      approved_exclusion: dtForm.approved_exclusion,
      notes: dtForm.notes.trim(),
    });
    if (!res.success) {
      setError(res.message || 'Failed to log downtime.');
      return;
    }
    setNotice(`Downtime ${res.data?.downtime_code || ''} logged.`);
    setDtForm({ ...dtForm, notes: '' });
    await loadAll();
  };

  const handleStartTask = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    const res = await api.operationsEngine.startTaskSession({
      employee_id: Number(taskForm.employee_id),
      operation_id: Number(taskForm.operation_id),
      product_id: taskForm.product_id ? Number(taskForm.product_id) : null,
    });
    if (!res.success) {
      setError(res.message || 'Failed to start task session.');
      return;
    }
    setNotice(`Task timer ${res.data?.session_code || ''} started.`);
    await loadAll();
  };

  const pendingExceptions = hwEvents.filter(
    (e) => e.processing_status === 'exception_unassigned' || e.processing_status === 'exception_ambiguous'
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-3">
        <div className="flex flex-wrap items-center gap-6">
          {[
            { id: 'assignments', label: 'Employee Assignments & Transfers' },
            { id: 'quality', label: 'Quality Control & Rework' },
            { id: 'exceptions', label: `Hardware Feed & Exceptions (${pendingExceptions.length})` },
            { id: 'downtime_tasks', label: 'Downtime & Task Timers' },
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
          onClick={loadAll}
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

      {subView === 'assignments' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          {canAssign && (
            <form onSubmit={handleCreateAssignment} className="xl:col-span-4 bg-white border border-slate-200 rounded-lg p-5 space-y-3 h-fit">
              <div className="border-b border-slate-100 pb-2">
                <h3 className="text-sm font-bold text-slate-900">Assign Employee to Operation</h3>
                <p className="text-xs text-slate-500">Links active Hardware ID to Product & Operation.</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Employee *</label>
                <select
                  required
                  value={assignForm.employee_id}
                  onChange={(e) => setAssignForm({ ...assignForm, employee_id: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md bg-white"
                >
                  <option value="">Select active employee...</option>
                  {options.employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.emp_id} — {emp.first_name} {emp.last_name} {emp.hardware_id ? `[HW: ${emp.hardware_id}]` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Product *</label>
                <select
                  required
                  value={assignForm.product_id}
                  onChange={(e) => setAssignForm({ ...assignForm, product_id: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md bg-white"
                >
                  <option value="">Select product...</option>
                  {options.products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.sku} — {p.product_name || p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Operation *</label>
                <select
                  required
                  value={assignForm.operation_id}
                  onChange={(e) => setAssignForm({ ...assignForm, operation_id: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md bg-white"
                >
                  <option value="">Select operation...</option>
                  {options.operations.map((op) => (
                    <option key={op.id} value={op.id}>
                      {op.operation_code} — {op.name} ({Number(op.standard_time_minutes).toFixed(2)}m)
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Work Order</label>
                  <select
                    value={assignForm.production_order_id}
                    onChange={(e) => setAssignForm({ ...assignForm, production_order_id: e.target.value })}
                    className="w-full px-2.5 py-2 text-sm border border-slate-300 rounded-md bg-white"
                  >
                    <option value="">Optional</option>
                    {options.work_orders.map((wo) => (
                      <option key={wo.id} value={wo.id}>
                        {wo.order_number || wo.wo_number || wo.work_order_number}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Shift</label>
                  <select
                    value={assignForm.shift_id}
                    onChange={(e) => setAssignForm({ ...assignForm, shift_id: e.target.value })}
                    className="w-full px-2.5 py-2 text-sm border border-slate-300 rounded-md bg-white"
                  >
                    <option value="">Default 480m</option>
                    {options.shifts.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.available_productive_minutes}m)
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Workstation</label>
                <input
                  type="text"
                  placeholder="e.g., LINE-1-STN-04"
                  value={assignForm.workstation}
                  onChange={(e) => setAssignForm({ ...assignForm, workstation: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
                />
              </div>
              <button
                type="submit"
                className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-[#0084CC] hover:bg-[#006FA8] rounded-md"
              >
                <UserCheck className="w-4 h-4" />
                Activate Assignment
              </button>
            </form>
          )}

          <div className={`${canAssign ? 'xl:col-span-8' : 'xl:col-span-12'} space-y-4`}>
            {transferTarget && (
              <form onSubmit={handleTransferSubmit} className="bg-amber-50/70 border border-amber-300 rounded-lg p-4 flex flex-wrap items-end gap-3">
                <div className="flex-1 min-w-[200px]">
                  <p className="text-xs font-bold text-amber-900 mb-1">
                    Mid-Shift Transfer: {transferTarget.first_name} {transferTarget.last_name} (from {transferTarget.operation_name})
                  </p>
                  <select
                    required
                    value={transferOpId}
                    onChange={(e) => setTransferOpId(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-sm border border-amber-300 rounded bg-white"
                  >
                    <option value="">Select new operation...</option>
                    {options.operations
                      .filter((o) => o.id !== transferTarget.operation_id)
                      .map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.operation_code} — {o.name}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="flex-1 min-w-[160px]">
                  <label className="block text-xs font-semibold text-amber-900 mb-1">Notes</label>
                  <input
                    type="text"
                    value={transferNotes}
                    onChange={(e) => setTransferNotes(e.target.value)}
                    placeholder="Line balancing"
                    className="w-full px-2.5 py-1.5 text-sm border border-amber-300 rounded bg-white"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <button type="submit" className="px-3 py-1.5 text-xs font-semibold text-white bg-amber-700 hover:bg-amber-800 rounded">
                    Confirm Transfer
                  </button>
                  <button type="button" onClick={() => setTransferTarget(null)} className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded">
                    Cancel
                  </button>
                </div>
              </form>
            )}

            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900">Operation Assignments Ledger</h3>
                <span className="text-xs font-mono text-slate-500">{assignments.length} records</span>
              </div>
              {assignments.length === 0 ? (
                <div className="p-10 text-center text-sm text-slate-500">No employee operation assignments recorded yet.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase">
                        <th className="py-2.5 px-4">Code</th>
                        <th className="py-2.5 px-4">Employee</th>
                        <th className="py-2.5 px-4">Operation</th>
                        <th className="py-2.5 px-4">Product / Order</th>
                        <th className="py-2.5 px-4">Status</th>
                        {canAssign && <th className="py-2.5 px-4 text-right">Action</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {assignments.map((a) => (
                        <tr key={a.id} className="hover:bg-slate-50/70">
                          <td className="py-2.5 px-4 font-mono text-xs text-slate-600">{a.assignment_code}</td>
                          <td className="py-2.5 px-4">
                            <div className="font-semibold text-slate-900">
                              {a.first_name} {a.last_name}
                            </div>
                            <div className="text-xs font-mono text-slate-500">
                              {a.emp_id} · HW {a.hardware_id}
                            </div>
                          </td>
                          <td className="py-2.5 px-4">
                            <div className="font-medium text-slate-900">{a.operation_name}</div>
                            <div className="text-xs font-mono text-slate-500">
                              {a.operation_code} · {Number(a.standard_time_minutes || 0).toFixed(2)}m
                            </div>
                          </td>
                          <td className="py-2.5 px-4 text-xs text-slate-600">
                            <div>{a.product_name}</div>
                            <div className="font-mono text-slate-400">{a.production_order_number || 'General'}</div>
                          </td>
                          <td className="py-2.5 px-4 text-xs font-semibold uppercase text-slate-700">{a.status}</td>
                          {canAssign && (
                            <td className="py-2.5 px-4 text-right">
                              {a.status === 'active' && (
                                <button
                                  onClick={() => setTransferTarget(a)}
                                  className="inline-flex items-center gap-1 text-xs font-semibold text-[#0084CC] hover:underline"
                                >
                                  <ArrowRightLeft className="w-3.5 h-3.5" />
                                  Transfer
                                </button>
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
          </div>
        </div>
      )}

      {subView === 'quality' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          {canApproveQc && (
            <form onSubmit={handleRecordQc} className="xl:col-span-4 bg-white border border-slate-200 rounded-lg p-5 space-y-3 h-fit">
              <div className="border-b border-slate-100 pb-2">
                <h3 className="text-sm font-bold text-slate-900">Record Quality Inspection & Rework</h3>
                <p className="text-xs text-slate-500">Final Accepted = First-Pass + Accepted After Rework (no double-counting).</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Employee *</label>
                <select
                  required
                  value={qcForm.employee_id}
                  onChange={(e) => setQcForm({ ...qcForm, employee_id: e.target.value })}
                  className="w-full px-2.5 py-2 text-sm border border-slate-300 rounded-md bg-white"
                >
                  <option value="">Select employee...</option>
                  {options.employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.emp_id} — {e.first_name} {e.last_name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Product *</label>
                  <select
                    required
                    value={qcForm.product_id}
                    onChange={(e) => setQcForm({ ...qcForm, product_id: e.target.value })}
                    className="w-full px-2.5 py-2 text-sm border border-slate-300 rounded-md bg-white"
                  >
                    <option value="">Select...</option>
                    {options.products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.product_name || p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Operation *</label>
                  <select
                    required
                    value={qcForm.operation_id}
                    onChange={(e) => setQcForm({ ...qcForm, operation_id: e.target.value })}
                    className="w-full px-2.5 py-2 text-sm border border-slate-300 rounded-md bg-white"
                  >
                    <option value="">Select...</option>
                    {options.operations.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Work Order (Optional)</label>
                <select
                  value={qcForm.production_order_id}
                  onChange={(e) => setQcForm({ ...qcForm, production_order_id: e.target.value })}
                  className="w-full px-2.5 py-2 text-sm border border-slate-300 rounded-md bg-white"
                >
                  <option value="">None</option>
                  {options.work_orders.map((wo) => (
                    <option key={wo.id} value={wo.id}>
                      {wo.order_number || wo.wo_number || wo.work_order_number}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Submitted Qty *</label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={qcForm.submitted_qty}
                    onChange={(e) => setQcForm({ ...qcForm, submitted_qty: e.target.value, inspected_qty: e.target.value })}
                    className="w-full px-2.5 py-2 text-sm font-mono border border-slate-300 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">First-Pass Accepted *</label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={qcForm.first_pass_accepted_qty}
                    onChange={(e) => setQcForm({ ...qcForm, first_pass_accepted_qty: e.target.value })}
                    className="w-full px-2.5 py-2 text-sm font-mono border border-slate-300 rounded-md"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Rejected</label>
                  <input
                    type="number"
                    min={0}
                    value={qcForm.rejected_qty}
                    onChange={(e) => setQcForm({ ...qcForm, rejected_qty: e.target.value })}
                    className="w-full px-2 py-2 text-sm font-mono border border-slate-300 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Rework</label>
                  <input
                    type="number"
                    min={0}
                    value={qcForm.rework_qty}
                    onChange={(e) => setQcForm({ ...qcForm, rework_qty: e.target.value })}
                    className="w-full px-2 py-2 text-sm font-mono border border-slate-300 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">After Rework</label>
                  <input
                    type="number"
                    min={0}
                    value={qcForm.accepted_after_rework_qty}
                    onChange={(e) => setQcForm({ ...qcForm, accepted_after_rework_qty: e.target.value })}
                    className="w-full px-2 py-2 text-sm font-mono border border-slate-300 rounded-md"
                  />
                </div>
              </div>
              <input
                type="text"
                placeholder="Defect reason (optional)"
                value={qcForm.defect_reason}
                onChange={(e) => setQcForm({ ...qcForm, defect_reason: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
              />
              <button
                type="submit"
                className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-[#0084CC] hover:bg-[#006FA8] rounded-md"
              >
                <ShieldCheck className="w-4 h-4" />
                Submit QC Inspection
              </button>
            </form>
          )}

          <div className={`${canApproveQc ? 'xl:col-span-8' : 'xl:col-span-12'} bg-white border border-slate-200 rounded-lg overflow-hidden`}>
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">Quality Inspection Ledger</h3>
              <span className="text-xs font-mono text-slate-500">{inspections.length} inspections</span>
            </div>
            {inspections.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-500">No quality inspections recorded yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase">
                      <th className="py-2.5 px-3">Code</th>
                      <th className="py-2.5 px-3">Employee / Operation</th>
                      <th className="py-2.5 px-3 text-right">Submitted</th>
                      <th className="py-2.5 px-3 text-right">1st Pass</th>
                      <th className="py-2.5 px-3 text-right">Rejected</th>
                      <th className="py-2.5 px-3 text-right">Rework / Recov.</th>
                      <th className="py-2.5 px-3 text-right">Final Acc.</th>
                      <th className="py-2.5 px-3 text-right">Quality %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {inspections.map((q) => (
                      <tr key={q.id} className="hover:bg-slate-50/70">
                        <td className="py-2.5 px-3 font-mono text-xs text-slate-600">{q.inspection_code}</td>
                        <td className="py-2.5 px-3">
                          <div className="font-semibold text-slate-900">
                            {q.first_name} {q.last_name}
                          </div>
                          <div className="text-xs text-slate-500">{q.operation_name}</div>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums">{q.submitted_qty}</td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums">{q.first_pass_accepted_qty}</td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-rose-700">{q.rejected_qty}</td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-amber-700">
                          {q.rework_qty} / {q.accepted_after_rework_qty}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-slate-900">
                          {q.final_accepted_qty}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-emerald-700">
                          {Number(q.final_acceptance_pct || 0).toFixed(2)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {subView === 'exceptions' && (
        <div className="space-y-4">
          {resolvingEvt && canCorrectProduction && (
            <div className="bg-amber-50 border border-amber-300 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-amber-950">
                  Resolve Hardware Exception: {resolvingEvt.event_uid} (HW {resolvingEvt.hardware_id})
                </h4>
                <button onClick={() => setResolvingEvt(null)} className="text-xs font-semibold text-slate-600">
                  Close
                </button>
              </div>
              <p className="text-xs text-amber-900">{resolvingEvt.exception_reason}</p>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <select value={resolveProductId} onChange={(e) => setResolveProductId(e.target.value)} className="px-2.5 py-1.5 text-sm border border-amber-300 rounded bg-white">
                  <option value="">Select Product...</option>
                  {options.products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.product_name || p.name}
                    </option>
                  ))}
                </select>
                <select value={resolveOpId} onChange={(e) => setResolveOpId(e.target.value)} className="px-2.5 py-1.5 text-sm border border-amber-300 rounded bg-white">
                  <option value="">Select Operation...</option>
                  {options.operations.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.operation_code} — {o.name}
                    </option>
                  ))}
                </select>
                <select value={resolveOrderId} onChange={(e) => setResolveOrderId(e.target.value)} className="px-2.5 py-1.5 text-sm border border-amber-300 rounded bg-white">
                  <option value="">Work Order (Optional)</option>
                  {options.work_orders.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.order_number || w.wo_number || w.work_order_number}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="Audit resolution notes *"
                  value={resolveNotes}
                  onChange={(e) => setResolveNotes(e.target.value)}
                  className="px-2.5 py-1.5 text-sm border border-amber-300 rounded bg-white"
                />
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => handleResolveException('resolve_accept')} className="px-3.5 py-1.5 text-xs font-semibold text-white bg-[#0084CC] hover:bg-[#006FA8] rounded">
                  Assign & Credit Production
                </button>
                <button onClick={() => handleResolveException('reject')} className="px-3.5 py-1.5 text-xs font-semibold text-rose-700 bg-white border border-rose-300 hover:bg-rose-50 rounded">
                  Reject Invalid Trigger
                </button>
              </div>
            </div>
          )}

          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">Hardware Ingestion Feed & Supervisor Exception Queue</h3>
              <span className="text-xs font-mono text-slate-500">{hwEvents.length} recent events</span>
            </div>
            {hwEvents.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-500">No hardware events recorded yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase">
                      <th className="py-2.5 px-3">Timestamp</th>
                      <th className="py-2.5 px-3">Hardware / Employee</th>
                      <th className="py-2.5 px-3">Operation</th>
                      <th className="py-2.5 px-3 text-right">Qty</th>
                      <th className="py-2.5 px-3 text-right">Snap. Std</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {hwEvents.map((ev) => {
                      const isExc =
                        ev.processing_status === 'exception_unassigned' ||
                        ev.processing_status === 'exception_ambiguous';
                      return (
                        <tr key={ev.id} className={isExc ? 'bg-amber-50/40' : ''}>
                          <td className="py-2.5 px-3 font-mono text-xs text-slate-600">
                            {new Date(ev.event_timestamp).toLocaleString()}
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="font-mono text-xs font-semibold text-slate-800">{ev.hardware_id}</div>
                            <div className="text-xs text-slate-500">
                              {ev.first_name ? `${ev.first_name} ${ev.last_name}` : ev.emp_id || 'Unmapped'}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-xs text-slate-700">
                            {ev.operation_name || <span className="text-amber-700 font-semibold">Pending Review</span>}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums">{ev.quantity}</td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-600">
                            {ev.standard_time_snapshot ? `${Number(ev.standard_time_snapshot).toFixed(2)}m` : '—'}
                          </td>
                          <td className="py-2.5 px-3 text-xs font-semibold uppercase text-slate-700">
                            {ev.processing_status}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            {isExc && canCorrectProduction && (
                              <button onClick={() => setResolvingEvt(ev)} className="inline-flex items-center gap-1 text-xs font-semibold text-amber-800 hover:underline">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                Resolve
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {subView === 'downtime_tasks' && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
            <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">Approved Downtime Logs</h3>
            {canAssign && (
              <form onSubmit={handleCreateDowntime} className="grid grid-cols-2 gap-3">
                <select value={dtForm.employee_id} onChange={(e) => setDtForm({ ...dtForm, employee_id: e.target.value })} className="px-2.5 py-2 text-sm border border-slate-300 rounded bg-white">
                  <option value="">Employee (Optional)</option>
                  {options.employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.emp_id} — {e.first_name} {e.last_name}
                    </option>
                  ))}
                </select>
                <select value={dtForm.reason_category} onChange={(e) => setDtForm({ ...dtForm, reason_category: e.target.value })} className="px-2.5 py-2 text-sm border border-slate-300 rounded bg-white">
                  <option value="machine_breakdown">Machine Breakdown</option>
                  <option value="material_shortage">Material Shortage</option>
                  <option value="power_outage">Power Outage</option>
                  <option value="quality_hold">Quality Hold</option>
                  <option value="changeover">Changeover</option>
                </select>
                <input
                  type="number"
                  min={1}
                  required
                  value={dtForm.duration_minutes}
                  onChange={(e) => setDtForm({ ...dtForm, duration_minutes: e.target.value })}
                  className="px-2.5 py-2 text-sm font-mono border border-slate-300 rounded"
                />
                <input
                  type="text"
                  required
                  placeholder="Downtime notes *"
                  value={dtForm.notes}
                  onChange={(e) => setDtForm({ ...dtForm, notes: e.target.value })}
                  className="px-2.5 py-2 text-sm border border-slate-300 rounded"
                />
                <button type="submit" className="col-span-2 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-[#0084CC] hover:bg-[#006FA8] rounded">
                  <Clock className="w-3.5 h-3.5" />
                  Log Downtime
                </button>
              </form>
            )}
            <div className="divide-y divide-slate-100 text-xs">
              {downtimeLogs.length === 0 ? (
                <p className="py-6 text-center text-slate-500">No downtime logs recorded.</p>
              ) : (
                downtimeLogs.slice(0, 12).map((d) => (
                  <div key={d.id} className="py-2.5 flex items-center justify-between gap-2">
                    <div>
                      <span className="font-mono font-semibold text-slate-800">{d.downtime_code}</span>{' '}
                      <span className="text-slate-700">{d.reason_category}</span>
                      <div className="text-slate-500">{d.notes}</div>
                    </div>
                    <div className="font-mono font-semibold text-slate-900">{Number(d.duration_minutes).toFixed(0)} min</div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
            <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">Optional Task Timers</h3>
            {canAssign && (
              <form onSubmit={handleStartTask} className="grid grid-cols-2 gap-3">
                <select required value={taskForm.employee_id} onChange={(e) => setTaskForm({ ...taskForm, employee_id: e.target.value })} className="px-2.5 py-2 text-sm border border-slate-300 rounded bg-white">
                  <option value="">Employee *</option>
                  {options.employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.emp_id} — {e.first_name} {e.last_name}
                    </option>
                  ))}
                </select>
                <select required value={taskForm.operation_id} onChange={(e) => setTaskForm({ ...taskForm, operation_id: e.target.value })} className="px-2.5 py-2 text-sm border border-slate-300 rounded bg-white">
                  <option value="">Operation *</option>
                  {options.operations.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
                <button type="submit" className="col-span-2 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-slate-800 hover:bg-slate-900 rounded">
                  <PlayCircle className="w-3.5 h-3.5" />
                  Start Tracked Task
                </button>
              </form>
            )}
            <div className="divide-y divide-slate-100 text-xs">
              {taskSessions.length === 0 ? (
                <p className="py-6 text-center text-slate-500">No tracked task sessions yet.</p>
              ) : (
                taskSessions.slice(0, 12).map((ts) => (
                  <div key={ts.id} className="py-2.5 flex items-center justify-between gap-2">
                    <div>
                      <div className="font-semibold text-slate-900">
                        {ts.session_code} · {ts.first_name} {ts.last_name} ({ts.operation_name})
                      </div>
                      <div className="text-slate-500 font-mono">
                        Status: {ts.status} · Qty: {ts.completed_qty}
                      </div>
                    </div>
                    {canAssign && ts.status !== 'completed' && (
                      <div className="flex items-center gap-2">
                        {ts.status === 'running' ? (
                          <button onClick={async () => { await api.operationsEngine.actionTaskSession(ts.id, 'pause'); await loadAll(); }} className="inline-flex items-center gap-1 text-amber-700 font-semibold hover:underline">
                            <PauseCircle className="w-3.5 h-3.5" />
                            Pause
                          </button>
                        ) : (
                          <button onClick={async () => { await api.operationsEngine.actionTaskSession(ts.id, 'resume'); await loadAll(); }} className="inline-flex items-center gap-1 text-emerald-700 font-semibold hover:underline">
                            <PlayCircle className="w-3.5 h-3.5" />
                            Resume
                          </button>
                        )}
                        <button onClick={async () => { await api.operationsEngine.actionTaskSession(ts.id, 'complete', { completed_qty: 1 }); await loadAll(); }} className="inline-flex items-center gap-1 text-[#0084CC] font-semibold hover:underline">
                          <CheckSquare className="w-3.5 h-3.5" />
                          Complete (+1)
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
