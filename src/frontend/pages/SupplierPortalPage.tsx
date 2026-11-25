import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { ReorderRequest, ReorderNegotiation } from '../types';
import {
  Package,
  CheckCircle,
  XCircle,
  ArrowLeftRight,
  Clock,
  Building2,
  Calendar,
  AlertCircle,
  FileText,
  DollarSign,
  Send,
} from 'lucide-react';

interface SupplierPortalPageProps {
  token: string;
  onNavigateHome?: () => void;
}

export const SupplierPortalPage: React.FC<SupplierPortalPageProps> = ({ token, onNavigateHome }) => {
  const [reorder, setReorder] = useState<ReorderRequest | null>(null);
  const [negotiations, setNegotiations] = useState<ReorderNegotiation[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');
  const [isExpired, setIsExpired] = useState<boolean>(false);

  // Supplier action tabs: 'view' | 'accept' | 'negotiate' | 'reject'
  const [activeAction, setActiveAction] = useState<'view' | 'accept' | 'negotiate' | 'reject'>('view');

  // Form states
  const [acceptNotes, setAcceptNotes] = useState<string>('');
  const [counterPrice, setCounterPrice] = useState<string>('');
  const [counterQty, setCounterQty] = useState<string>('');
  const [counterDate, setCounterDate] = useState<string>('');
  const [counterNotes, setCounterNotes] = useState<string>('');
  const [rejectReason, setRejectReason] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const fetchReorder = async () => {
    setIsLoading(true);
    setErrorMsg('');
    try {
      const res = await api.getPublicSupplierReorder(token);
      if (res.success && res.data) {
        setReorder(res.data);
        setIsExpired(!!res.data.is_expired);
        if (res.data.negotiations) {
          setNegotiations(res.data.negotiations);
        }
        // Pre-fill counter inputs
        setCounterPrice(res.data.unit_price?.toString() || '');
        setCounterQty(res.data.quantity?.toString() || '');
        setCounterDate(res.data.expected_delivery_date || '');
      } else {
        setErrorMsg(res.message || 'Invalid or expired reorder link.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to connect to Nexora supplier portal.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (token) fetchReorder();
  }, [token]);

  const handleAccept = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMsg('');
    try {
      const res = await api.supplierAcceptReorder(token, acceptNotes);
      if (res.success && res.data) {
        setSuccessMsg('Reorder accepted successfully! The buyer has been notified.');
        setActiveAction('view');
        fetchReorder();
      } else {
        setErrorMsg(res.message || 'Failed to accept reorder.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to submit acceptance.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNegotiate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!counterPrice || parseFloat(counterPrice) <= 0) {
      setErrorMsg('Please specify a valid counter unit price.');
      return;
    }
    if (!counterQty || parseFloat(counterQty) <= 0) {
      setErrorMsg('Please specify a valid counter quantity.');
      return;
    }
    if (!counterNotes.trim()) {
      setErrorMsg('Please explain your counteroffer proposal.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');
    try {
      const res = await api.supplierNegotiateReorder(token, {
        unit_price: parseFloat(counterPrice),
        quantity: parseFloat(counterQty),
        delivery_date: counterDate || undefined,
        notes: counterNotes,
      });
      if (res.success && res.data) {
        setSuccessMsg('Counteroffer submitted to the buyer for review.');
        setActiveAction('view');
        fetchReorder();
      } else {
        setErrorMsg(res.message || 'Failed to submit counteroffer.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to submit counteroffer.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectReason.trim()) {
      setErrorMsg('A rejection reason is mandatory.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');
    try {
      const res = await api.supplierRejectReorder(token, rejectReason);
      if (res.success && res.data) {
        setSuccessMsg('Reorder request declined. The procurement team has been notified.');
        setActiveAction('view');
        fetchReorder();
      } else {
        setErrorMsg(res.message || 'Failed to decline reorder.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to submit rejection.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-3 border-sky-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Loading Supplier Reorder Portal...
          </p>
        </div>
      </div>
    );
  }

  if (errorMsg && !reorder) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-lg border border-slate-200 p-8 text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-slate-900">Link Inaccessible or Expired</h2>
          <p className="text-xs text-slate-500">{errorMsg}</p>
          <div className="pt-2">
            <a
              href="/"
              className="inline-flex items-center text-xs font-semibold text-sky-600 hover:text-sky-700"
            >
              Return to Nexora Home
            </a>
          </div>
        </div>
      </div>
    );
  }

  const isClosed = reorder?.status === 'accepted' || reorder?.status === 'rejected' || reorder?.status === 'cancelled';

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Brand Header */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center text-white font-black tracking-tight">
              NX
            </div>
            <div>
              <span className="text-lg font-extrabold tracking-tight text-slate-900">
                NEX<span className="text-sky-600">ORA</span>
              </span>
              <span className="block text-[11px] font-medium text-slate-500">
                Supplier Order Confirmation & Negotiation Portal
              </span>
            </div>
          </div>
          <span className="text-xs font-mono text-slate-500 bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200">
            {reorder?.reorder_no}
          </span>
        </div>

        {/* Notices */}
        {successMsg && (
          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {isExpired && (
          <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center gap-2">
            <Clock className="w-5 h-5 text-amber-600 shrink-0" />
            <span>This link has expired. The order terms below are shown for historic reference only.</span>
          </div>
        )}

        {errorMsg && (
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Order Details Card */}
        <div className="bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden">
          <div className="p-6 border-b border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Reorder Proposal for
              </span>
              <h2 className="text-xl font-bold text-slate-900 mt-0.5">
                {reorder?.item_name}
              </h2>
              <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
                <span>SKU: {reorder?.item_code}</span>
                <span>·</span>
                <span>Supplier: {reorder?.supplier_name}</span>
              </div>
            </div>

            <div className="text-right">
              <span className="text-xs text-slate-500">Current Status</span>
              <div className="mt-1">
                <span className={`inline-block px-2.5 py-1 rounded-md text-xs font-semibold uppercase tracking-wider ${
                  reorder?.status === 'accepted'
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : reorder?.status === 'counteroffer_received'
                    ? 'bg-amber-50 text-amber-700 border border-amber-200'
                    : reorder?.status === 'rejected' || reorder?.status === 'cancelled'
                    ? 'bg-rose-50 text-rose-700 border border-rose-200'
                    : 'bg-sky-50 text-sky-700 border border-sky-200'
                }`}>
                  {reorder?.status?.replace(/_/g, ' ')}
                </span>
              </div>
            </div>
          </div>

          {/* Pricing & Terms Grid */}
          <div className="p-6 grid grid-cols-2 sm:grid-cols-4 gap-4 border-b border-slate-200 text-xs">
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
              <span className="text-slate-500 block">Requested Quantity</span>
              <p className="text-base font-bold text-slate-900 mt-1 tabular-nums">
                {reorder?.quantity} {reorder?.uom_symbol || 'units'}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
              <span className="text-slate-500 block">Proposed Unit Price</span>
              <p className="text-base font-bold text-slate-900 mt-1 tabular-nums">
                ₹{reorder?.unit_price?.toFixed(2)}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-sky-50 border border-sky-100">
              <span className="text-sky-700 block font-medium">Total Order Value</span>
              <p className="text-base font-extrabold text-sky-900 mt-1 tabular-nums">
                ₹{reorder?.total_amount?.toFixed(2)}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
              <span className="text-slate-500 block">Expected Delivery</span>
              <p className="text-base font-bold text-slate-900 mt-1">
                {reorder?.expected_delivery_date || 'Standard'}
              </p>
            </div>
          </div>

          {/* Notes & Context */}
          <div className="p-6 text-xs space-y-3">
            {reorder?.notes && (
              <div>
                <span className="font-semibold text-slate-700">Buyer Instructions & Notes:</span>
                <p className="mt-1 text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-100 whitespace-pre-wrap">
                  {reorder.notes}
                </p>
              </div>
            )}

            {reorder?.counter_unit_price !== null && reorder?.counter_unit_price !== undefined && (
              <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900">
                <span className="font-bold block">Current Supplier Counteroffer Pending Review:</span>
                <div className="grid grid-cols-3 gap-2 mt-2 font-mono text-[11px]">
                  <div>Qty: {reorder.counter_quantity}</div>
                  <div>Price: ₹{reorder.counter_unit_price?.toFixed(2)}</div>
                  <div>Delivery: {reorder.counter_delivery_date || 'N/A'}</div>
                </div>
                {reorder.supplier_response_notes && (
                  <p className="mt-2 text-xs italic">"{reorder.supplier_response_notes}"</p>
                )}
              </div>
            )}

            {reorder?.rejection_reason && (
              <div className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-900">
                <span className="font-bold block">Declined Reason:</span>
                <p className="mt-1 text-xs">{reorder.rejection_reason}</p>
              </div>
            )}
          </div>
        </div>

        {/* Action Controls (If Not Closed & Not Expired) */}
        {!isClosed && !isExpired && (
          <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-6 space-y-5">
            <h3 className="text-sm font-bold text-slate-900">Choose Response Action</h3>

            <div className="flex items-center gap-2 border-b border-slate-200 pb-4">
              <button
                onClick={() => setActiveAction('accept')}
                className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors inline-flex items-center gap-1.5 ${
                  activeAction === 'accept'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <CheckCircle className="w-4 h-4" />
                Accept Proposed Terms
              </button>

              <button
                onClick={() => setActiveAction('negotiate')}
                className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors inline-flex items-center gap-1.5 ${
                  activeAction === 'negotiate'
                    ? 'bg-amber-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <ArrowLeftRight className="w-4 h-4" />
                Submit Counteroffer (Negotiate)
              </button>

              <button
                onClick={() => setActiveAction('reject')}
                className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors inline-flex items-center gap-1.5 ${
                  activeAction === 'reject'
                    ? 'bg-rose-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <XCircle className="w-4 h-4" />
                Decline / Reject Order
              </button>
            </div>

            {/* Accept Panel */}
            {activeAction === 'accept' && (
              <form onSubmit={handleAccept} className="space-y-4 text-xs animate-in fade-in duration-150">
                <p className="text-slate-600">
                  By accepting, you confirm fulfillment of <strong>{reorder?.quantity} units</strong> at{' '}
                  <strong>₹{reorder?.unit_price?.toFixed(2)} / unit</strong> for a total of{' '}
                  <strong>₹{reorder?.total_amount?.toFixed(2)}</strong>.
                </p>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Confirmation Notes (Optional)</label>
                  <textarea
                    rows={2}
                    value={acceptNotes}
                    onChange={(e) => setAcceptNotes(e.target.value)}
                    placeholder="e.g., Confirmed for dispatch on schedule. Tracking details will follow."
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:bg-white focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50"
                >
                  {isSubmitting ? 'Confirming...' : 'Confirm & Accept Order'}
                </button>
              </form>
            )}

            {/* Negotiate Panel */}
            {activeAction === 'negotiate' && (
              <form onSubmit={handleNegotiate} className="space-y-4 text-xs animate-in fade-in duration-150">
                <p className="text-slate-600">
                  Propose adjusted pricing, available quantity, or delivery schedule for the buyer's review.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Counter Unit Price (₹) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={counterPrice}
                      onChange={(e) => setCounterPrice(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-mono text-xs focus:bg-white focus:ring-2 focus:ring-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Counter Quantity <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="number"
                      step="1"
                      value={counterQty}
                      onChange={(e) => setCounterQty(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-mono text-xs focus:bg-white focus:ring-2 focus:ring-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Proposed Delivery Date</label>
                    <input
                      type="date"
                      value={counterDate}
                      onChange={(e) => setCounterDate(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:bg-white focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Explanation & Rationale <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    rows={2}
                    value={counterNotes}
                    onChange={(e) => setCounterNotes(e.target.value)}
                    placeholder="e.g., Raw material rate fluctuation requires ₹X adjustment. Can supply Y units immediately."
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:bg-white focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 bg-amber-600 text-white rounded-lg text-xs font-semibold hover:bg-amber-700 disabled:opacity-50"
                >
                  {isSubmitting ? 'Submitting...' : 'Submit Counteroffer to Buyer'}
                </button>
              </form>
            )}

            {/* Reject Panel */}
            {activeAction === 'reject' && (
              <form onSubmit={handleReject} className="space-y-4 text-xs animate-in fade-in duration-150">
                <p className="text-slate-600">
                  Please provide a clear explanation for why you cannot fulfill this order at this time.
                </p>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Rejection Reason <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    rows={3}
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="e.g., Product temporarily out of stock / factory maintenance shutdown until next month."
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:bg-white focus:ring-2 focus:ring-rose-500"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 bg-rose-600 text-white rounded-lg text-xs font-semibold hover:bg-rose-700 disabled:opacity-50"
                >
                  {isSubmitting ? 'Declining...' : 'Decline Reorder Request'}
                </button>
              </form>
            )}
          </div>
        )}

        {/* Negotiation Timeline History */}
        {negotiations.length > 0 && (
          <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-6 space-y-4">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Negotiation & Action History
            </h3>
            <div className="divide-y divide-slate-100 text-xs">
              {negotiations.map((n) => (
                <div key={n.id} className="py-2.5 flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className={`font-semibold capitalize ${
                        n.actor === 'supplier' ? 'text-amber-700' : 'text-sky-700'
                      }`}>
                        {n.actor}
                      </span>
                      <span className="text-slate-300">·</span>
                      <span className="font-mono text-slate-700">{n.action.replace(/_/g, ' ')}</span>
                    </div>
                    {n.notes && <p className="text-slate-600 text-[11px]">{n.notes}</p>}
                  </div>
                  <div className="text-right shrink-0">
                    {n.unit_price !== null && (
                      <span className="block font-mono text-[11px] text-slate-700">
                        ₹{n.unit_price?.toFixed(2)} × {n.quantity}
                      </span>
                    )}
                    <span className="text-[10px] text-slate-400">
                      {new Date(n.timestamp).toLocaleDateString()} {new Date(n.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="text-center text-xs text-slate-400 pt-4">
          Nexora Automated Procurement Module • Protected Link valid for 72 hours
        </div>
      </div>
    </div>
  );
};
