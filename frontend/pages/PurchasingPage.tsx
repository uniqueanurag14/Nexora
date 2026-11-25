import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import {
  PurchaseOrderRecord,
  PurchaseRequestRecord,
  Supplier,
  Warehouse,
  InventoryItem,
} from '../types';
import {
  ShoppingCart,
  FileText,
  Plus,
  RefreshCw,
  CheckCircle,
  XCircle,
  ArrowRight,
  AlertCircle,
  Trash2,
  X,
} from 'lucide-react';

interface PurchasingPageProps {
  onNavigate?: (route: string) => void;
}

const formatInr = (value: number | string) => {
  const num = Number(value) || 0;
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(num);
};

export const PurchasingPage: React.FC<PurchasingPageProps> = ({ onNavigate }) => {
  const [activeTab, setActiveTab] = useState<'orders' | 'requests'>('orders');
  const [purchaseRequests, setPurchaseRequests] = useState<PurchaseRequestRecord[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrderRecord[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');

  // Modals
  const [isPrModalOpen, setIsPrModalOpen] = useState(false);
  const [isPoModalOpen, setIsPoModalOpen] = useState(false);

  // PR Form
  const [prForm, setPrForm] = useState({
    department: '',
    required_date: '',
    preferred_supplier_id: '',
    priority: 'medium',
    notes: '',
    items: [{ item_id: '', item_code: '', item_name: '', uom: 'PCS', quantity: '1', estimated_unit_price: '0' }],
  });

  // PO Form
  const [poForm, setPoForm] = useState({
    pr_id: '',
    supplier_id: '',
    warehouse_id: '',
    expected_delivery_date: '',
    payment_terms: 'Net 30',
    notes: '',
    items: [{ item_id: '', item_code: '', item_name: '', uom: 'PCS', ordered_quantity: '1', unit_price: '0', tax_rate: '18' }],
  });

  const loadData = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const [prsRes, posRes, supRes, whRes, invRes] = await Promise.all([
        api.erp.getPurchaseRequests(statusFilter),
        api.erp.getPurchaseOrders(statusFilter),
        api.getSuppliers({ page_size: 200 }).catch(() => ({ data: { suppliers: [] } })),
        api.getWarehouses().catch(() => ({ data: [] })),
        api.getItems({ page_size: 200 }).catch(() => ({ data: { items: [] } })),
      ]);
      setPurchaseRequests(prsRes.data || []);
      setPurchaseOrders(posRes.data || []);
      setSuppliers((supRes as any).data?.suppliers || []);
      setWarehouses((whRes as any).data || []);
      setInventoryItems((invRes as any).data?.items || []);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to load purchasing records from PostgreSQL.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [statusFilter]);

  const handleSelectInventoryItem = (
    target: 'pr' | 'po',
    index: number,
    itemIdStr: string
  ) => {
    const found = inventoryItems.find(i => String(i.id) === itemIdStr);
    if (target === 'pr') {
      setPrForm(prev => {
        const next = [...prev.items];
        next[index] = {
          ...next[index],
          item_id: itemIdStr,
          item_code: found ? found.code : next[index].item_code,
          item_name: found ? found.name : next[index].item_name,
          uom: found?.uom_symbol || next[index].uom || 'PCS',
          estimated_unit_price: found ? String(found.cost_price || 0) : next[index].estimated_unit_price,
        };
        return { ...prev, items: next };
      });
    } else {
      setPoForm(prev => {
        const next = [...prev.items];
        next[index] = {
          ...next[index],
          item_id: itemIdStr,
          item_code: found ? found.code : next[index].item_code,
          item_name: found ? found.name : next[index].item_name,
          uom: found?.uom_symbol || next[index].uom || 'PCS',
          unit_price: found ? String(found.cost_price || 0) : next[index].unit_price,
        };
        return { ...prev, items: next };
      });
    }
  };

  const handleCreatePr = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const sup = suppliers.find(s => String(s.id) === prForm.preferred_supplier_id);
      await api.erp.createPurchaseRequest({
        department: prForm.department,
        required_date: prForm.required_date || null,
        preferred_supplier_id: sup ? sup.id : null,
        preferred_supplier_name: sup ? sup.name : null,
        priority: prForm.priority,
        notes: prForm.notes,
        items: prForm.items.map(it => ({
          item_id: it.item_id ? Number(it.item_id) : null,
          item_code: it.item_code || 'ITEM',
          item_name: it.item_name,
          uom: it.uom || 'PCS',
          quantity: Number(it.quantity),
          estimated_unit_price: Number(it.estimated_unit_price),
        })),
      });
      setSuccessMsg('Purchase Request saved to PostgreSQL.');
      setIsPrModalOpen(false);
      setPrForm({
        department: '',
        required_date: '',
        preferred_supplier_id: '',
        priority: 'medium',
        notes: '',
        items: [{ item_id: '', item_code: '', item_name: '', uom: 'PCS', quantity: '1', estimated_unit_price: '0' }],
      });
      await loadData();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to create Purchase Request.');
    }
  };

  const handlePrStatus = async (id: number, status: string) => {
    setErrorMsg('');
    setSuccessMsg('');
    try {
      await api.erp.updatePurchaseRequestStatus(id, status);
      setSuccessMsg(`Purchase Request marked as ${status}.`);
      await loadData();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to update Purchase Request status.');
    }
  };

  const openConvertPrToPo = (pr: PurchaseRequestRecord) => {
    setPoForm({
      pr_id: String(pr.id),
      supplier_id: pr.preferred_supplier_id ? String(pr.preferred_supplier_id) : '',
      warehouse_id: warehouses[0] ? String(warehouses[0].id) : '',
      expected_delivery_date: pr.required_date || '',
      payment_terms: 'Net 30',
      notes: pr.notes || `Converted from ${pr.pr_number}`,
      items: (pr.items || []).map(it => ({
        item_id: it.item_id ? String(it.item_id) : '',
        item_code: it.item_code,
        item_name: it.item_name,
        uom: it.uom || 'PCS',
        ordered_quantity: String(it.quantity),
        unit_price: String(it.estimated_unit_price || 0),
        tax_rate: '18',
      })),
    });
    setIsPoModalOpen(true);
  };

  const handleCreatePo = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    const sup = suppliers.find(s => String(s.id) === poForm.supplier_id);
    if (!sup) {
      setErrorMsg('Please select a supplier before creating a Purchase Order.');
      return;
    }
    const wh = warehouses.find(w => String(w.id) === poForm.warehouse_id);
    try {
      await api.erp.createPurchaseOrder({
        pr_id: poForm.pr_id ? Number(poForm.pr_id) : null,
        supplier_id: sup.id,
        supplier_name: sup.name,
        warehouse_id: wh ? wh.id : null,
        warehouse_name: wh ? wh.name : null,
        expected_delivery_date: poForm.expected_delivery_date || null,
        payment_terms: poForm.payment_terms,
        notes: poForm.notes,
        items: poForm.items.map(it => ({
          item_id: it.item_id ? Number(it.item_id) : null,
          item_code: it.item_code || 'ITEM',
          item_name: it.item_name,
          uom: it.uom || 'PCS',
          ordered_quantity: Number(it.ordered_quantity),
          unit_price: Number(it.unit_price),
          tax_rate: Number(it.tax_rate || 0),
        })),
      });
      setSuccessMsg('Purchase Order issued and saved to PostgreSQL.');
      setIsPoModalOpen(false);
      setActiveTab('orders');
      await loadData();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to create Purchase Order.');
    }
  };

  const handlePoStatus = async (id: number, status: string) => {
    setErrorMsg('');
    try {
      await api.erp.updatePurchaseOrderStatus(id, status);
      setSuccessMsg(`Purchase Order status updated to ${status}.`);
      await loadData();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to update Purchase Order status.');
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2.5">
            <ShoppingCart className="w-6 h-6 text-[#0084CC]" />
            Purchase Management
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage Purchase Requests (PR) and Purchase Orders (PO) backed directly by PostgreSQL.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => void loadData()}
            className="px-3 py-2 text-sm font-medium bg-white border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 flex items-center gap-1.5"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={() => setIsPrModalOpen(true)}
            className="px-3.5 py-2 text-sm font-semibold bg-white border border-[#0084CC] text-[#0084CC] rounded-lg hover:bg-sky-50 flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            New Purchase Request
          </button>
          <button
            onClick={() => {
              setPoForm({
                pr_id: '',
                supplier_id: suppliers[0] ? String(suppliers[0].id) : '',
                warehouse_id: warehouses[0] ? String(warehouses[0].id) : '',
                expected_delivery_date: '',
                payment_terms: 'Net 30',
                notes: '',
                items: [{ item_id: '', item_code: '', item_name: '', uom: 'PCS', ordered_quantity: '1', unit_price: '0', tax_rate: '18' }],
              });
              setIsPoModalOpen(true);
            }}
            className="px-3.5 py-2 text-sm font-semibold bg-[#0084CC] text-white rounded-lg hover:bg-[#0073b3] flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            New Purchase Order
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

      {/* Tabs & Status Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('orders')}
            className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
              activeTab === 'orders' ? 'bg-[#0084CC] text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            Purchase Orders ({purchaseOrders.length})
          </button>
          <button
            onClick={() => setActiveTab('requests')}
            className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
              activeTab === 'requests' ? 'bg-[#0084CC] text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            Purchase Requests ({purchaseRequests.length})
          </button>
        </div>

        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-700"
        >
          <option value="all">All Statuses</option>
          {activeTab === 'orders' ? (
            <>
              <option value="draft">Draft</option>
              <option value="issued">Issued</option>
              <option value="partially_received">Partially Received</option>
              <option value="received">Received</option>
              <option value="cancelled">Cancelled</option>
            </>
          ) : (
            <>
              <option value="submitted">Submitted</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="converted_to_po">Converted to PO</option>
            </>
          )}
        </select>
      </div>

      {/* Content */}
      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-sm text-slate-500">
          Loading purchasing data from PostgreSQL...
        </div>
      ) : activeTab === 'orders' ? (
        purchaseOrders.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center space-y-2">
            <FileText className="w-10 h-10 text-slate-300 mx-auto" />
            <p className="text-sm font-semibold text-slate-700">No purchase orders available</p>
            <p className="text-xs text-slate-500">Create a new Purchase Order or convert an approved Purchase Request.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500">
                  <th className="py-3 px-4">PO Number</th>
                  <th className="py-3 px-4">Supplier</th>
                  <th className="py-3 px-4">Warehouse</th>
                  <th className="py-3 px-4">Order Date</th>
                  <th className="py-3 px-4 text-right">Items</th>
                  <th className="py-3 px-4 text-right">Total</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {purchaseOrders.map(po => (
                  <tr key={po.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4 font-semibold text-slate-900">{po.po_number}</td>
                    <td className="py-3 px-4 text-slate-700">{po.supplier_name}</td>
                    <td className="py-3 px-4 text-slate-600">{po.warehouse_name || '-'}</td>
                    <td className="py-3 px-4 text-slate-600">{String(po.order_date).slice(0, 10)}</td>
                    <td className="py-3 px-4 text-right text-slate-700">{po.items?.length || 0}</td>
                    <td className="py-3 px-4 text-right font-semibold text-slate-900">{formatInr(po.total_amount)}</td>
                    <td className="py-3 px-4">
                      <span className="inline-flex px-2 py-0.5 text-xs font-semibold rounded bg-slate-100 text-slate-700 uppercase">
                        {po.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right space-x-2">
                      {po.status !== 'received' && po.status !== 'cancelled' && onNavigate && (
                        <button
                          onClick={() => onNavigate('/goods-receipt')}
                          className="text-xs font-semibold text-[#0084CC] hover:underline"
                        >
                          Receive GRN
                        </button>
                      )}
                      {po.status === 'issued' && (
                        <button
                          onClick={() => void handlePoStatus(po.id, 'cancelled')}
                          className="text-xs font-semibold text-red-600 hover:underline"
                        >
                          Cancel
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : purchaseRequests.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center space-y-2">
          <FileText className="w-10 h-10 text-slate-300 mx-auto" />
          <p className="text-sm font-semibold text-slate-700">No purchase requests available</p>
          <p className="text-xs text-slate-500">Submit a Purchase Request to start procurement approval workflows.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500">
                <th className="py-3 px-4">PR Number</th>
                <th className="py-3 px-4">Requester</th>
                <th className="py-3 px-4">Department</th>
                <th className="py-3 px-4">Priority</th>
                <th className="py-3 px-4 text-right">Est. Total</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {purchaseRequests.map(pr => (
                <tr key={pr.id} className="hover:bg-slate-50/70">
                  <td className="py-3 px-4 font-semibold text-slate-900">{pr.pr_number}</td>
                  <td className="py-3 px-4 text-slate-700">{pr.requester_name}</td>
                  <td className="py-3 px-4 text-slate-600">{pr.department || '-'}</td>
                  <td className="py-3 px-4 uppercase text-xs font-semibold text-slate-700">{pr.priority}</td>
                  <td className="py-3 px-4 text-right font-semibold text-slate-900">{formatInr(pr.total_amount)}</td>
                  <td className="py-3 px-4">
                    <span className="inline-flex px-2 py-0.5 text-xs font-semibold rounded bg-slate-100 text-slate-700 uppercase">
                      {pr.status.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right space-x-2">
                    {pr.status === 'submitted' && (
                      <>
                        <button
                          onClick={() => void handlePrStatus(pr.id, 'approved')}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:underline"
                        >
                          <CheckCircle className="w-3.5 h-3.5" /> Approve
                        </button>
                        <button
                          onClick={() => void handlePrStatus(pr.id, 'rejected')}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:underline"
                        >
                          <XCircle className="w-3.5 h-3.5" /> Reject
                        </button>
                      </>
                    )}
                    {pr.status === 'approved' && (
                      <button
                        onClick={() => openConvertPrToPo(pr)}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-[#0084CC] hover:underline"
                      >
                        Convert to PO <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Purchase Request Modal */}
      {isPrModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h2 className="text-lg font-bold text-slate-900">Create Purchase Request</h2>
              <button onClick={() => setIsPrModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreatePr} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Department</label>
                  <input
                    value={prForm.department}
                    onChange={e => setPrForm({ ...prForm, department: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    placeholder="Production / Maintenance"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Required Date</label>
                  <input
                    type="date"
                    value={prForm.required_date}
                    onChange={e => setPrForm({ ...prForm, required_date: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Preferred Supplier</label>
                  <select
                    value={prForm.preferred_supplier_id}
                    onChange={e => setPrForm({ ...prForm, preferred_supplier_id: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="">-- Optional --</option>
                    {suppliers.map(s => (
                      <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Priority</label>
                  <select
                    value={prForm.priority}
                    onChange={e => setPrForm({ ...prForm, priority: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase text-slate-600">Requested Items</span>
                  <button
                    type="button"
                    onClick={() =>
                      setPrForm(prev => ({
                        ...prev,
                        items: [...prev.items, { item_id: '', item_code: '', item_name: '', uom: 'PCS', quantity: '1', estimated_unit_price: '0' }],
                      }))
                    }
                    className="text-xs font-semibold text-[#0084CC] hover:underline"
                  >
                    + Add Line
                  </button>
                </div>
                {prForm.items.map((it, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-slate-50 p-2 rounded-lg">
                    <select
                      value={it.item_id}
                      onChange={e => handleSelectInventoryItem('pr', idx, e.target.value)}
                      className="col-span-4 px-2 py-1.5 text-xs border border-slate-300 rounded bg-white"
                    >
                      <option value="">Custom Item</option>
                      {inventoryItems.map(inv => (
                        <option key={inv.id} value={inv.id}>{inv.code} - {inv.name}</option>
                      ))}
                    </select>
                    <input
                      required
                      value={it.item_name}
                      onChange={e => {
                        const next = [...prForm.items];
                        next[idx].item_name = e.target.value;
                        setPrForm({ ...prForm, items: next });
                      }}
                      placeholder="Item name"
                      className="col-span-3 px-2 py-1.5 text-xs border border-slate-300 rounded"
                    />
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      required
                      value={it.quantity}
                      onChange={e => {
                        const next = [...prForm.items];
                        next[idx].quantity = e.target.value;
                        setPrForm({ ...prForm, items: next });
                      }}
                      placeholder="Qty"
                      className="col-span-2 px-2 py-1.5 text-xs border border-slate-300 rounded"
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={it.estimated_unit_price}
                      onChange={e => {
                        const next = [...prForm.items];
                        next[idx].estimated_unit_price = e.target.value;
                        setPrForm({ ...prForm, items: next });
                      }}
                      placeholder="Est. Price"
                      className="col-span-2 px-2 py-1.5 text-xs border border-slate-300 rounded"
                    />
                    {prForm.items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setPrForm({ ...prForm, items: prForm.items.filter((_, i) => i !== idx) })}
                        className="col-span-1 text-red-500 hover:text-red-700 flex justify-center"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Notes</label>
                <textarea
                  rows={2}
                  value={prForm.notes}
                  onChange={e => setPrForm({ ...prForm, notes: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setIsPrModalOpen(false)} className="px-4 py-2 text-sm border border-slate-200 rounded-lg">
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 text-sm font-semibold bg-[#0084CC] text-white rounded-lg hover:bg-[#0073b3]">
                  Submit Purchase Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Purchase Order Modal */}
      {isPoModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h2 className="text-lg font-bold text-slate-900">Issue Purchase Order</h2>
              <button onClick={() => setIsPoModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreatePo} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Supplier *</label>
                  <select
                    required
                    value={poForm.supplier_id}
                    onChange={e => setPoForm({ ...poForm, supplier_id: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="">-- Select Supplier --</option>
                    {suppliers.map(s => (
                      <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Receiving Warehouse</label>
                  <select
                    value={poForm.warehouse_id}
                    onChange={e => setPoForm({ ...poForm, warehouse_id: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="">-- Select Warehouse --</option>
                    {warehouses.map(w => (
                      <option key={w.id} value={w.id}>{w.name} ({w.code})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Expected Delivery</label>
                  <input
                    type="date"
                    value={poForm.expected_delivery_date}
                    onChange={e => setPoForm({ ...poForm, expected_delivery_date: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Payment Terms</label>
                  <input
                    value={poForm.payment_terms}
                    onChange={e => setPoForm({ ...poForm, payment_terms: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase text-slate-600">PO Line Items</span>
                  <button
                    type="button"
                    onClick={() =>
                      setPoForm(prev => ({
                        ...prev,
                        items: [...prev.items, { item_id: '', item_code: '', item_name: '', uom: 'PCS', ordered_quantity: '1', unit_price: '0', tax_rate: '18' }],
                      }))
                    }
                    className="text-xs font-semibold text-[#0084CC] hover:underline"
                  >
                    + Add Line
                  </button>
                </div>
                {poForm.items.map((it, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-slate-50 p-2 rounded-lg">
                    <select
                      value={it.item_id}
                      onChange={e => handleSelectInventoryItem('po', idx, e.target.value)}
                      className="col-span-3 px-2 py-1.5 text-xs border border-slate-300 rounded bg-white"
                    >
                      <option value="">Custom Item</option>
                      {inventoryItems.map(inv => (
                        <option key={inv.id} value={inv.id}>{inv.code} - {inv.name}</option>
                      ))}
                    </select>
                    <input
                      required
                      value={it.item_name}
                      onChange={e => {
                        const next = [...poForm.items];
                        next[idx].item_name = e.target.value;
                        setPoForm({ ...poForm, items: next });
                      }}
                      placeholder="Item name"
                      className="col-span-3 px-2 py-1.5 text-xs border border-slate-300 rounded"
                    />
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      required
                      value={it.ordered_quantity}
                      onChange={e => {
                        const next = [...poForm.items];
                        next[idx].ordered_quantity = e.target.value;
                        setPoForm({ ...poForm, items: next });
                      }}
                      placeholder="Qty"
                      className="col-span-2 px-2 py-1.5 text-xs border border-slate-300 rounded"
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={it.unit_price}
                      onChange={e => {
                        const next = [...poForm.items];
                        next[idx].unit_price = e.target.value;
                        setPoForm({ ...poForm, items: next });
                      }}
                      placeholder="Unit Price"
                      className="col-span-2 px-2 py-1.5 text-xs border border-slate-300 rounded"
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={it.tax_rate}
                      onChange={e => {
                        const next = [...poForm.items];
                        next[idx].tax_rate = e.target.value;
                        setPoForm({ ...poForm, items: next });
                      }}
                      placeholder="Tax %"
                      className="col-span-1 px-1.5 py-1.5 text-xs border border-slate-300 rounded"
                    />
                    {poForm.items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setPoForm({ ...poForm, items: poForm.items.filter((_, i) => i !== idx) })}
                        className="col-span-1 text-red-500 hover:text-red-700 flex justify-center"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setIsPoModalOpen(false)} className="px-4 py-2 text-sm border border-slate-200 rounded-lg">
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 text-sm font-semibold bg-[#0084CC] text-white rounded-lg hover:bg-[#0073b3]">
                  Issue Purchase Order
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
