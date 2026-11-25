import React, { useState, useEffect } from 'react';
import { X, Send, AlertTriangle, ShieldCheck, Mail, Calendar, DollarSign, Package } from 'lucide-react';
import { InventoryItem, Supplier } from '../types';
import { api } from '../services/api';

interface ReorderModalProps {
  item: InventoryItem;
  suppliers: Supplier[];
  onClose: () => void;
  onSuccess: () => void;
}

export const ReorderModal: React.FC<ReorderModalProps> = ({
  item,
  suppliers,
  onClose,
  onSuccess,
}) => {
  const [selectedSupplierId, setSelectedSupplierId] = useState<number>(
    item.preferred_supplier_id || (suppliers[0]?.id || 0)
  );
  const [quantity, setQuantity] = useState<number>(
    Math.max(1, (item.min_stock_level * 2) - item.total_on_hand)
  );
  const [proposedUnitPrice, setProposedUnitPrice] = useState<number>(item.cost_price || item.unit_price || 0);
  const [deliveryDate, setDeliveryDate] = useState<string>(
    new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().split('T')[0]
  );
  const [notes, setNotes] = useState<string>('Urgent inventory replenishment for low-stock condition.');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<{
    reference: string;
    rawToken: string;
    emailResult: any;
  } | null>(null);

  const selectedSupplier = suppliers.find((s) => s.id === Number(selectedSupplierId));
  const totalEstimation = (Number(quantity) || 0) * (Number(proposedUnitPrice) || 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSupplierId) {
      setError('Please select an active supplier.');
      return;
    }
    if (quantity <= 0) {
      setError('Reorder quantity must be greater than zero.');
      return;
    }
    if (proposedUnitPrice <= 0) {
      setError('Proposed unit price must be greater than zero.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const res = await api.createReorderRequest({
        item_id: item.id,
        supplier_id: Number(selectedSupplierId),
        requested_quantity: Number(quantity),
        proposed_unit_price: Number(proposedUnitPrice),
        delivery_date: deliveryDate,
        notes,
      });

      setSuccessInfo({
        reference: res.reorder.reference_no,
        rawToken: res.rawToken,
        emailResult: res.emailResult,
      });
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Failed to generate reorder request.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-800/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                Create Supplier Reorder Proposal
              </h2>
              <p className="text-xs text-slate-400">
                Replenish critical inventory via real-time online supplier negotiation
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6">
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 shrink-0 text-rose-400 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {successInfo ? (
            <div className="space-y-5 text-center py-4">
              <div className="w-14 h-14 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center mx-auto">
                <ShieldCheck className="w-7 h-7" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Reorder Request Dispatched!</h3>
                <p className="text-sm text-slate-400 mt-1">
                  Reference: <span className="font-mono text-indigo-400 font-semibold">{successInfo.reference}</span>
                </p>
              </div>

              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-left text-xs space-y-2 font-mono">
                <div className="flex justify-between">
                  <span className="text-slate-500">Supplier:</span>
                  <span className="text-slate-200">{selectedSupplier?.name} ({selectedSupplier?.email})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">SMTP Notification:</span>
                  <span className={successInfo.emailResult?.success ? 'text-emerald-400' : 'text-amber-400'}>
                    {successInfo.emailResult?.success ? 'Delivered via Gmail SSL' : `Queued: ${successInfo.emailResult?.error || 'Pending'}`}
                  </span>
                </div>
                <div className="pt-2 border-t border-slate-800">
                  <span className="text-slate-500 block mb-1">Direct Secure Supplier Portal Link:</span>
                  <a
                    href={`/supplier/reorder/${successInfo.rawToken}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-indigo-400 hover:text-indigo-300 break-all underline"
                  >
                    {window.location.origin}/supplier/reorder/{successInfo.rawToken}
                  </a>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm transition-all"
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Item Overview Pill */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-bold">
                      {item.code}
                    </span>
                    <span className="font-bold text-white">{item.name}</span>
                    <span className="text-xs text-slate-400">({item.category})</span>
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    Unit: <span className="text-slate-300">{item.unit}</span> &bull; Base Cost:{' '}
                    <span className="text-slate-300">${item.cost_price.toFixed(2)}</span>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-xs text-amber-400 font-semibold flex items-center gap-1 justify-end">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Low Stock Condition
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    Available: <strong className="text-white">{item.total_on_hand}</strong> / Min Threshold:{' '}
                    <strong className="text-amber-300">{item.min_stock_level}</strong>
                  </div>
                </div>
              </div>

              {/* Form Controls */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Supplier Picker */}
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-indigo-400" />
                    Target Supplier & Notification Recipient
                  </label>
                  <select
                    value={selectedSupplierId}
                    onChange={(e) => setSelectedSupplierId(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm focus:outline-none focus:border-indigo-500"
                    required
                  >
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.email}) - {s.payment_terms}
                      </option>
                    ))}
                  </select>
                  {selectedSupplier && (
                    <p className="text-[11px] text-slate-400">
                      Notification will be sent via SMTP to: <strong className="text-slate-300">{selectedSupplier.email}</strong>
                    </p>
                  )}
                </div>

                {/* Quantity */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <Package className="w-3.5 h-3.5 text-indigo-400" />
                    Requested Reorder Quantity ({item.unit})
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={quantity}
                    onChange={(e) => setQuantity(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm focus:outline-none focus:border-indigo-500 font-mono"
                    required
                  />
                </div>

                {/* Proposed Unit Price */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <DollarSign className="w-3.5 h-3.5 text-indigo-400" />
                    Proposed Unit Price ($)
                  </label>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={proposedUnitPrice}
                    onChange={(e) => setProposedUnitPrice(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm focus:outline-none focus:border-indigo-500 font-mono"
                    required
                  />
                </div>

                {/* Target Delivery Date */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                    Target Delivery Date
                  </label>
                  <input
                    type="date"
                    value={deliveryDate}
                    onChange={(e) => setDeliveryDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm focus:outline-none focus:border-indigo-500"
                    required
                  />
                </div>

                {/* Total Estimation Card */}
                <div className="p-3.5 rounded-xl bg-indigo-950/30 border border-indigo-500/20 flex flex-col justify-center">
                  <span className="text-[11px] font-semibold text-indigo-300 uppercase tracking-wider">
                    Estimated Proposal Value
                  </span>
                  <span className="text-2xl font-bold text-white font-mono mt-0.5">
                    ${totalEstimation.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>

                {/* Procurement Notes */}
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-xs font-semibold text-slate-300">
                    Procurement Notes & Instructions for Supplier
                  </label>
                  <textarea
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm focus:outline-none focus:border-indigo-500"
                    placeholder="Provide delivery requirements, batch packaging instructions, or terms..."
                  />
                </div>
              </div>

              {/* Security note */}
              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-[11px] text-slate-400 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>
                  Generates an authorized SHA-256 expiring link (72h expiry). Supplier acceptance will lock terms without altering stock until physical receipt.
                </span>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-semibold transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold flex items-center gap-2 transition-all shadow-lg shadow-indigo-600/30 disabled:opacity-50 cursor-pointer"
                >
                  {loading ? (
                    <span>Dispatching Request...</span>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>Send Reorder Request</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
