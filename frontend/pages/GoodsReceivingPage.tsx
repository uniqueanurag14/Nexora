import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { GrnRecord, PurchaseOrderRecord, Supplier, Warehouse } from '../types';
import {
  ClipboardCheck,
  Plus,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  ShieldCheck,
  PackageCheck,
  X,
} from 'lucide-react';

interface GoodsReceivingPageProps {
  onNavigate?: (route: string) => void;
}

export const GoodsReceivingPage: React.FC<GoodsReceivingPageProps> = () => {
  const [grns, setGrns] = useState<GrnRecord[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrderRecord[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const [isGrnModalOpen, setIsGrnModalOpen] = useState(false);
  const [qcTargetGrn, setQcTargetGrn] = useState<GrnRecord | null>(null);

  const [grnForm, setGrnForm] = useState({
    po_id: '',
    supplier_id: '',
    warehouse_id: '',
    delivery_challan_no: '',
    vehicle_no: '',
    notes: '',
    items: [
      {
        po_item_id: '',
        item_id: '',
        item_code: '',
        item_name: '',
        uom: 'PCS',
        expected_quantity: '0',
        received_quantity: '1',
        accepted_quantity: '1',
        rejected_quantity: '0',
        unit_price: '0',
        batch_number: '',
      },
    ],
  });

  const [qcForm, setQcForm] = useState({
    grn_item_id: '',
    parameter_name: 'Visual & Dimensional Check',
    expected_spec: '',
    observed_value: '',
    sample_size: '5',
    passed_qty: '0',
    failed_qty: '0',
    result: 'pass',
    remarks: '',
  });

  const loadData = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const [grnRes, poRes, supRes, whRes] = await Promise.all([
        api.erp.getGrns(),
        api.erp.getPurchaseOrders().catch(() => ({ data: [] })),
        api.getSuppliers({ page_size: 200 }).catch(() => ({ data: { suppliers: [] } })),
        api.getWarehouses().catch(() => ({ data: [] })),
      ]);
      setGrns(grnRes.data || []);
      setPurchaseOrders(poRes.data || []);
      setSuppliers((supRes as any).data?.suppliers || []);
      setWarehouses((whRes as any).data || []);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to load Goods Receipt Notes from PostgreSQL.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const handleSelectPo = (poIdStr: string) => {
    const po = purchaseOrders.find(p => String(p.id) === poIdStr);
    if (!po) {
      setGrnForm(prev => ({ ...prev, po_id: '' }));
      return;
    }
    setGrnForm(prev => ({
      ...prev,
      po_id: String(po.id),
      supplier_id: String(po.supplier_id),
      warehouse_id: po.warehouse_id ? String(po.warehouse_id) : prev.warehouse_id,
      items: (po.items || []).map(it => {
        const remaining = Math.max(0, Number(it.ordered_quantity) - Number(it.received_quantity || 0));
        return {
          po_item_id: String(it.id),
          item_id: it.item_id ? String(it.item_id) : '',
          item_code: it.item_code,
          item_name: it.item_name,
          uom: it.uom || 'PCS',
          expected_quantity: String(remaining),
          received_quantity: String(remaining),
          accepted_quantity: String(remaining),
          rejected_quantity: '0',
          unit_price: String(it.unit_price || 0),
          batch_number: '',
        };
      }),
    }));
  };

  const handleCreateGrn = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    const po = purchaseOrders.find(p => String(p.id) === grnForm.po_id);
    const sup = suppliers.find(s => String(s.id) === grnForm.supplier_id);
    const wh = warehouses.find(w => String(w.id) === grnForm.warehouse_id);

    const supplierId = po?.supplier_id || sup?.id;
    const supplierName = po?.supplier_name || sup?.name;
    if (!supplierId || !supplierName) {
      setErrorMsg('Please select a Purchase Order or Supplier.');
      return;
    }

    try {
      await api.erp.createGrn({
        po_id: po ? po.id : null,
        po_number: po ? po.po_number : null,
        supplier_id: supplierId,
        supplier_name: supplierName,
        warehouse_id: wh ? wh.id : null,
        warehouse_name: wh ? wh.name : 'Main Warehouse',
        delivery_challan_no: grnForm.delivery_challan_no,
        vehicle_no: grnForm.vehicle_no,
        notes: grnForm.notes,
        items: grnForm.items.map(it => ({
          po_item_id: it.po_item_id ? Number(it.po_item_id) : null,
          item_id: it.item_id ? Number(it.item_id) : null,
          item_code: it.item_code || 'ITEM',
          item_name: it.item_name,
          uom: it.uom || 'PCS',
          expected_quantity: Number(it.expected_quantity || 0),
          received_quantity: Number(it.received_quantity || 0),
          accepted_quantity: Number(it.accepted_quantity || 0),
          rejected_quantity: Number(it.rejected_quantity || 0),
          unit_price: Number(it.unit_price || 0),
          batch_number: it.batch_number || null,
        })),
      });
      setSuccessMsg('Goods Receipt Note (GRN) recorded in PostgreSQL.');
      setIsGrnModalOpen(false);
      await loadData();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to create GRN.');
    }
  };

  const handleRecordQc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!qcTargetGrn) return;
    setErrorMsg('');
    setSuccessMsg('');
    try {
      await api.erp.recordGrnQualityCheck(qcTargetGrn.id, {
        grn_item_id: qcForm.grn_item_id ? Number(qcForm.grn_item_id) : null,
        parameter_name: qcForm.parameter_name,
        expected_spec: qcForm.expected_spec,
        observed_value: qcForm.observed_value,
        sample_size: Number(qcForm.sample_size || 1),
        passed_qty: Number(qcForm.passed_qty || 0),
        failed_qty: Number(qcForm.failed_qty || 0),
        result: qcForm.result,
        remarks: qcForm.remarks,
      });
      setSuccessMsg(`Quality inspection recorded for ${qcTargetGrn.grn_number}.`);
      setQcTargetGrn(null);
      await loadData();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to record quality inspection.');
    }
  };

  const handlePostStock = async (grn: GrnRecord) => {
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await api.erp.postGrnStock(grn.id);
      setSuccessMsg(res.message || `GRN ${grn.grn_number} posted to stock.`);
      await loadData();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to post GRN quantities to stock.');
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2.5">
            <ClipboardCheck className="w-6 h-6 text-[#0084CC]" />
            Goods Receiving (GRN &amp; Quality Checks)
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Record incoming deliveries, verify received quantities, log quality inspections, and post accepted stock into PostgreSQL.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void loadData()}
            className="px-3 py-2 text-sm font-medium bg-white border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 flex items-center gap-1.5"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={() => setIsGrnModalOpen(true)}
            className="px-3.5 py-2 text-sm font-semibold bg-[#0084CC] text-white rounded-lg hover:bg-[#0073b3] flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            Create GRN
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="p-3.5 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}
      {successMsg && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2 text-sm text-emerald-700">
          <CheckCircle className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-sm text-slate-500">
          Loading Goods Receipt Notes from PostgreSQL...
        </div>
      ) : grns.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center space-y-2">
          <ClipboardCheck className="w-10 h-10 text-slate-300 mx-auto" />
          <p className="text-sm font-semibold text-slate-700">No goods receipt notes available</p>
          <p className="text-xs text-slate-500">Create a GRN when supplier shipments arrive to run quality checks and update stock.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {grns.map(grn => (
            <div key={grn.id} className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 border-b border-slate-100 pb-3">
                <div>
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="font-bold text-slate-900">{grn.grn_number}</span>
                    {grn.po_number && (
                      <span className="text-xs font-medium px-2 py-0.5 rounded bg-sky-50 text-[#0084CC]">
                        PO: {grn.po_number}
                      </span>
                    )}
                    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700 uppercase">
                      QC: {grn.qc_status}
                    </span>
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded uppercase ${
                        grn.stock_posted ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {grn.stock_posted ? 'Stock Posted' : 'Pending Stock Post'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Supplier: <span className="font-medium text-slate-700">{grn.supplier_name}</span> • Warehouse:{' '}
                    <span className="font-medium text-slate-700">{grn.warehouse_name}</span> • Receipt Date:{' '}
                    {String(grn.receipt_date).slice(0, 10)}
                    {grn.delivery_challan_no ? ` • Challan: ${grn.delivery_challan_no}` : ''}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setQcTargetGrn(grn);
                      setQcForm({
                        grn_item_id: grn.items[0] ? String(grn.items[0].id) : '',
                        parameter_name: 'Visual & Quantity Verification',
                        expected_spec: '',
                        observed_value: '',
                        sample_size: '5',
                        passed_qty: grn.items[0] ? String(grn.items[0].received_quantity) : '0',
                        failed_qty: '0',
                        result: 'pass',
                        remarks: '',
                      });
                    }}
                    className="px-3 py-1.5 text-xs font-semibold border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 flex items-center gap-1.5"
                  >
                    <ShieldCheck className="w-4 h-4 text-[#0084CC]" />
                    Add Quality Check
                  </button>
                  {!grn.stock_posted && (
                    <button
                      onClick={() => void handlePostStock(grn)}
                      className="px-3 py-1.5 text-xs font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 flex items-center gap-1.5"
                    >
                      <PackageCheck className="w-4 h-4" />
                      Post Accepted Stock
                    </button>
                  )}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="text-slate-500 border-b border-slate-100">
                      <th className="py-2 pr-3">Item</th>
                      <th className="py-2 px-3 text-right">Expected</th>
                      <th className="py-2 px-3 text-right">Received</th>
                      <th className="py-2 px-3 text-right">Accepted</th>
                      <th className="py-2 px-3 text-right">Rejected</th>
                      <th className="py-2 px-3">Batch</th>
                      <th className="py-2 pl-3">QC Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {grn.items.map(it => (
                      <tr key={it.id}>
                        <td className="py-2 pr-3 font-medium text-slate-800">
                          {it.item_code} — {it.item_name}
                        </td>
                        <td className="py-2 px-3 text-right text-slate-600">{it.expected_quantity} {it.uom}</td>
                        <td className="py-2 px-3 text-right font-semibold text-slate-800">{it.received_quantity}</td>
                        <td className="py-2 px-3 text-right font-semibold text-emerald-700">{it.accepted_quantity}</td>
                        <td className="py-2 px-3 text-right font-semibold text-red-600">{it.rejected_quantity}</td>
                        <td className="py-2 px-3 text-slate-600">{it.batch_number || '-'}</td>
                        <td className="py-2 pl-3 uppercase font-semibold text-slate-700">{it.qc_status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {grn.quality_checks && grn.quality_checks.length > 0 && (
                <div className="bg-slate-50 rounded-lg p-3 space-y-1.5">
                  <p className="text-xs font-semibold text-slate-700">Quality Check Log ({grn.quality_checks.length})</p>
                  {grn.quality_checks.map(qc => (
                    <div key={qc.id} className="text-xs text-slate-600 flex flex-wrap items-center justify-between gap-2">
                      <span>
                        <strong>{qc.parameter_name}</strong> ({qc.result.toUpperCase()}) — Passed: {qc.passed_qty}, Failed: {qc.failed_qty}
                        {qc.remarks ? ` • ${qc.remarks}` : ''}
                      </span>
                      <span className="text-slate-400">Inspector: {qc.inspector_name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create GRN Modal */}
      {isGrnModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h2 className="text-lg font-bold text-slate-900">Record Goods Receipt Note (GRN)</h2>
              <button onClick={() => setIsGrnModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateGrn} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Link Purchase Order (Optional)</label>
                  <select
                    value={grnForm.po_id}
                    onChange={e => handleSelectPo(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="">-- Direct Receipt --</option>
                    {purchaseOrders
                      .filter(p => p.status !== 'cancelled' && p.status !== 'received')
                      .map(po => (
                        <option key={po.id} value={po.id}>
                          {po.po_number} ({po.supplier_name})
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Supplier *</label>
                  <select
                    required
                    value={grnForm.supplier_id}
                    onChange={e => setGrnForm({ ...grnForm, supplier_id: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="">-- Select Supplier --</option>
                    {suppliers.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Receiving Warehouse</label>
                  <select
                    value={grnForm.warehouse_id}
                    onChange={e => setGrnForm({ ...grnForm, warehouse_id: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="">Main Warehouse</option>
                    {warehouses.map(w => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Delivery Challan / Invoice No.</label>
                  <input
                    value={grnForm.delivery_challan_no}
                    onChange={e => setGrnForm({ ...grnForm, delivery_challan_no: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Vehicle Number</label>
                  <input
                    value={grnForm.vehicle_no}
                    onChange={e => setGrnForm({ ...grnForm, vehicle_no: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase text-slate-600">Received Line Items</span>
                  <button
                    type="button"
                    onClick={() =>
                      setGrnForm(prev => ({
                        ...prev,
                        items: [
                          ...prev.items,
                          {
                            po_item_id: '',
                            item_id: '',
                            item_code: '',
                            item_name: '',
                            uom: 'PCS',
                            expected_quantity: '0',
                            received_quantity: '1',
                            accepted_quantity: '1',
                            rejected_quantity: '0',
                            unit_price: '0',
                            batch_number: '',
                          },
                        ],
                      }))
                    }
                    className="text-xs font-semibold text-[#0084CC] hover:underline"
                  >
                    + Add Line
                  </button>
                </div>
                {grnForm.items.map((it, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 bg-slate-50 p-2 rounded-lg">
                    <input
                      required
                      value={it.item_name}
                      onChange={e => {
                        const next = [...grnForm.items];
                        next[idx].item_name = e.target.value;
                        setGrnForm({ ...grnForm, items: next });
                      }}
                      placeholder="Item Name"
                      className="col-span-4 px-2 py-1.5 text-xs border border-slate-300 rounded"
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={it.received_quantity}
                      onChange={e => {
                        const next = [...grnForm.items];
                        next[idx].received_quantity = e.target.value;
                        next[idx].accepted_quantity = e.target.value;
                        setGrnForm({ ...grnForm, items: next });
                      }}
                      placeholder="Received"
                      className="col-span-2 px-2 py-1.5 text-xs border border-slate-300 rounded"
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={it.accepted_quantity}
                      onChange={e => {
                        const next = [...grnForm.items];
                        next[idx].accepted_quantity = e.target.value;
                        setGrnForm({ ...grnForm, items: next });
                      }}
                      placeholder="Accepted"
                      className="col-span-2 px-2 py-1.5 text-xs border border-slate-300 rounded"
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={it.rejected_quantity}
                      onChange={e => {
                        const next = [...grnForm.items];
                        next[idx].rejected_quantity = e.target.value;
                        setGrnForm({ ...grnForm, items: next });
                      }}
                      placeholder="Rejected"
                      className="col-span-2 px-2 py-1.5 text-xs border border-slate-300 rounded"
                    />
                    <input
                      value={it.batch_number}
                      onChange={e => {
                        const next = [...grnForm.items];
                        next[idx].batch_number = e.target.value;
                        setGrnForm({ ...grnForm, items: next });
                      }}
                      placeholder="Batch #"
                      className="col-span-2 px-2 py-1.5 text-xs border border-slate-300 rounded"
                    />
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setIsGrnModalOpen(false)} className="px-4 py-2 text-sm border border-slate-200 rounded-lg">
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 text-sm font-semibold bg-[#0084CC] text-white rounded-lg hover:bg-[#0073b3]">
                  Save GRN
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quality Check Modal */}
      {qcTargetGrn && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h2 className="text-lg font-bold text-slate-900">Quality Check — {qcTargetGrn.grn_number}</h2>
              <button onClick={() => setQcTargetGrn(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleRecordQc} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">GRN Item</label>
                <select
                  value={qcForm.grn_item_id}
                  onChange={e => setQcForm({ ...qcForm, grn_item_id: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  {qcTargetGrn.items.map(it => (
                    <option key={it.id} value={it.id}>{it.item_code} — {it.item_name} (Rec: {it.received_quantity})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Inspection Parameter *</label>
                <input
                  required
                  value={qcForm.parameter_name}
                  onChange={e => setQcForm({ ...qcForm, parameter_name: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Passed Qty</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={qcForm.passed_qty}
                    onChange={e => setQcForm({ ...qcForm, passed_qty: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Failed Qty</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={qcForm.failed_qty}
                    onChange={e => setQcForm({ ...qcForm, failed_qty: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Result</label>
                  <select
                    value={qcForm.result}
                    onChange={e => setQcForm({ ...qcForm, result: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="pass">Pass</option>
                    <option value="conditional">Conditional</option>
                    <option value="fail">Fail</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Remarks</label>
                <textarea
                  rows={2}
                  value={qcForm.remarks}
                  onChange={e => setQcForm({ ...qcForm, remarks: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setQcTargetGrn(null)} className="px-4 py-2 text-sm border border-slate-200 rounded-lg">
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 text-sm font-semibold bg-[#0084CC] text-white rounded-lg hover:bg-[#0073b3]">
                  Save Quality Check
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
