import React, { useState, useEffect } from 'react';
import {
  Receipt,
  Plus,
  Search,
  DollarSign,
  Calendar,
  CheckCircle2,
  Clock,
  XCircle,
  Mail,
  Printer,
  CreditCard,
  Building2,
  FileText,
  AlertCircle,
  Send,
  Trash2,
} from 'lucide-react';
import { Invoice, InventoryItem } from '../types';
import { api } from '../services/api';

export const InvoicesPage: React.FC = () => {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modals
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState<boolean>(false);

  // Create Invoice Form State
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState(
    new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().split('T')[0]
  );
  const [paymentTerms, setPaymentTerms] = useState('Net 30');
  const [taxRate, setTaxRate] = useState<number>(10);
  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [notes, setNotes] = useState('Payment is due within 30 days of invoice date.');
  const [lineItems, setLineItems] = useState<Array<{
    item_id?: number | null;
    description: string;
    quantity: number;
    unit_price: number;
    tax_rate?: number;
  }>>([
    { item_id: null, description: 'Consulting & Enterprise Implementation Services', quantity: 1, unit_price: 1500 },
  ]);

  // Payment Form State
  const [payAmount, setPayAmount] = useState<number>(0);
  const [payDate, setPayDate] = useState(new Date().toISOString().split('T')[0]);
  const [payMethod, setPayMethod] = useState('Bank Transfer');
  const [payNote, setPayNote] = useState('');
  const [submittingPayment, setSubmittingPayment] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [invList, itemsList] = await Promise.all([
        api.getInvoices(statusFilter),
        api.getInventoryItems(),
      ]);
      setInvoices(invList);
      setInventoryItems(itemsList);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch invoices');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [statusFilter]);

  const handleAddLineItem = () => {
    setLineItems([
      ...lineItems,
      { item_id: null, description: '', quantity: 1, unit_price: 0 },
    ]);
  };

  const handleRemoveLineItem = (index: number) => {
    if (lineItems.length === 1) return;
    setLineItems(lineItems.filter((_, i) => i !== index));
  };

  const handleLineItemChange = (index: number, field: string, val: any) => {
    const updated = [...lineItems];
    if (field === 'item_id') {
      const selectedItem = inventoryItems.find((i) => i.id === Number(val));
      if (selectedItem) {
        updated[index] = {
          ...updated[index],
          item_id: selectedItem.id,
          description: `${selectedItem.name} (${selectedItem.code})`,
          unit_price: selectedItem.unit_price || selectedItem.cost_price,
        };
      } else {
        updated[index] = { ...updated[index], item_id: null };
      }
    } else {
      updated[index] = { ...updated[index], [field]: val };
    }
    setLineItems(updated);
  };

  // Calculation for Create Modal
  const calculatedSubtotal = lineItems.reduce(
    (sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unit_price) || 0),
    0
  );
  const calculatedTax = (calculatedSubtotal * (Number(taxRate) || 0)) / 100;
  const calculatedTotal = Math.max(0, calculatedSubtotal + calculatedTax - (Number(discountAmount) || 0));

  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim()) {
      alert('Customer name is required.');
      return;
    }
    if (lineItems.length === 0) {
      alert('Please add at least one line item.');
      return;
    }

    try {
      const newInv = await api.createInvoice({
        customer_name: customerName,
        customer_email: customerEmail,
        customer_phone: customerPhone,
        customer_address: customerAddress,
        issue_date: issueDate,
        due_date: dueDate,
        payment_terms: paymentTerms,
        tax_rate: Number(taxRate),
        discount_amount: Number(discountAmount),
        notes,
        items: lineItems.map((li) => ({
          item_id: li.item_id || null,
          description: li.description,
          quantity: Number(li.quantity),
          unit_price: Number(li.unit_price),
          tax_rate: Number(taxRate),
        })),
      });

      setShowCreateModal(false);
      resetCreateForm();
      await loadData();
      setSelectedInvoice(newInv);
    } catch (err: any) {
      alert(err.message || 'Failed to create invoice');
    }
  };

  const resetCreateForm = () => {
    setCustomerName('');
    setCustomerEmail('');
    setCustomerPhone('');
    setCustomerAddress('');
    setTaxRate(10);
    setDiscountAmount(0);
    setNotes('Payment is due within 30 days of invoice date.');
    setLineItems([
      { item_id: null, description: 'Products / Services', quantity: 1, unit_price: 100 },
    ]);
  };

  const handleOpenPayment = (inv: Invoice) => {
    setSelectedInvoice(inv);
    setPayAmount(inv.balance_due);
    setShowPaymentModal(true);
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvoice) return;
    if (payAmount <= 0) {
      alert('Payment amount must be greater than zero.');
      return;
    }

    try {
      setSubmittingPayment(true);
      const updated = await api.recordPayment(selectedInvoice.id, {
        amount: Number(payAmount),
        payment_date: payDate,
        payment_method: payMethod,
        reference_note: payNote,
      });
      setSelectedInvoice(updated);
      setShowPaymentModal(false);
      setPayNote('');
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to record payment');
    } finally {
      setSubmittingPayment(false);
    }
  };

  const handleSendEmail = async (inv: Invoice) => {
    if (!inv.customer_email) {
      alert('This customer does not have an email address specified.');
      return;
    }
    try {
      const res = await api.sendInvoiceEmail(inv.id);
      if (res.success) {
        alert(`Invoice #${inv.invoice_number} successfully emailed to ${inv.customer_email}!`);
        await loadData();
        if (selectedInvoice && selectedInvoice.id === inv.id) {
          const refreshed = await api.getInvoiceById(inv.id);
          setSelectedInvoice(refreshed);
        }
      } else {
        alert(`Email dispatch error: ${res.error}`);
      }
    } catch (err: any) {
      alert(err.message || 'Failed to send invoice email');
    }
  };

  // Metrics
  const totalInvoiced = invoices.reduce((acc, cur) => acc + cur.total_amount, 0);
  const totalPaid = invoices.reduce((acc, cur) => acc + cur.amount_paid, 0);
  const totalOutstanding = invoices.reduce((acc, cur) => acc + cur.balance_due, 0);

  const filteredInvoices = invoices.filter((inv) => {
    const q = searchQuery.toLowerCase();
    return (
      inv.invoice_number.toLowerCase().includes(q) ||
      inv.customer_name.toLowerCase().includes(q) ||
      (inv.customer_email && inv.customer_email.toLowerCase().includes(q))
    );
  });

  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-black text-white tracking-tight">Invoices & Billing</h1>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-semibold font-mono">
              Module 07
            </span>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Accounts receivable, payment recording, and automated client billing
          </p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold flex items-center gap-2 shadow-lg shadow-indigo-600/30 transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Create New Invoice</span>
        </button>
      </div>

      {/* KPI Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between shadow-lg">
          <div>
            <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider block">
              Total Invoiced
            </span>
            <span className="text-2xl font-extrabold text-white font-mono mt-1 block">
              ${totalInvoiced.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center border border-indigo-500/20">
            <Receipt className="w-5 h-5" />
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between shadow-lg">
          <div>
            <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider block">
              Payments Collected
            </span>
            <span className="text-2xl font-extrabold text-emerald-400 font-mono mt-1 block">
              ${totalPaid.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between shadow-lg">
          <div>
            <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider block">
              Outstanding Receivables
            </span>
            <span className="text-2xl font-extrabold text-amber-300 font-mono mt-1 block">
              ${totalOutstanding.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center border border-amber-500/20">
            <Clock className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3 justify-between items-center bg-slate-900/60 p-4 rounded-xl border border-slate-800">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-500" />
          <input
            type="text"
            placeholder="Search invoice #, customer name, email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm text-white focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <span className="text-xs text-slate-400">Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-sm text-white focus:outline-none focus:border-indigo-500"
          >
            <option value="all">All Invoices</option>
            <option value="draft">Draft</option>
            <option value="sent">Sent</option>
            <option value="partial">Partially Paid</option>
            <option value="paid">Fully Paid</option>
            <option value="overdue">Overdue</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      {/* Invoices Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        {filteredInvoices.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <Receipt className="w-12 h-12 text-slate-600 mx-auto" />
            <h3 className="text-base font-bold text-white">No Invoices on Record</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Create customer invoices linked to inventory items or custom line items to begin billing.
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="mt-2 px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-500"
            >
              Issue First Invoice
            </button>
          </div>
        ) : (
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-800/40 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                <th className="p-4">Invoice #</th>
                <th className="p-4">Customer</th>
                <th className="p-4">Issue / Due Date</th>
                <th className="p-4 text-right">Total Amount</th>
                <th className="p-4 text-right">Paid</th>
                <th className="p-4 text-right">Balance Due</th>
                <th className="p-4 text-center">Status</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-sans">
              {filteredInvoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="p-4 font-mono font-bold text-indigo-400">
                    <button
                      onClick={async () => {
                        const full = await api.getInvoiceById(inv.id);
                        setSelectedInvoice(full);
                      }}
                      className="hover:underline flex items-center gap-1.5 cursor-pointer"
                    >
                      <Receipt className="w-3.5 h-3.5" />
                      <span>{inv.invoice_number}</span>
                    </button>
                  </td>
                  <td className="p-4">
                    <div className="font-semibold text-white">{inv.customer_name}</div>
                    {inv.customer_email && (
                      <div className="text-xs text-slate-500">{inv.customer_email}</div>
                    )}
                  </td>
                  <td className="p-4 text-xs text-slate-300">
                    <div>Issued: {inv.issue_date}</div>
                    <div className="text-slate-500">Due: {inv.due_date}</div>
                  </td>
                  <td className="p-4 text-right font-mono font-bold text-white">
                    ${inv.total_amount.toFixed(2)}
                  </td>
                  <td className="p-4 text-right font-mono text-xs text-emerald-400">
                    ${inv.amount_paid.toFixed(2)}
                  </td>
                  <td className="p-4 text-right font-mono font-bold text-xs">
                    <span className={inv.balance_due > 0 ? 'text-amber-300' : 'text-slate-500'}>
                      ${inv.balance_due.toFixed(2)}
                    </span>
                  </td>
                  <td className="p-4 text-center">
                    {inv.status === 'paid' ? (
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 inline-flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Paid
                      </span>
                    ) : inv.status === 'partial' ? (
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 inline-flex items-center gap-1">
                        <Clock className="w-3 h-3" /> Partial
                      </span>
                    ) : inv.status === 'sent' ? (
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 inline-flex items-center gap-1">
                        <Send className="w-3 h-3" /> Sent
                      </span>
                    ) : inv.status === 'cancelled' ? (
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-800 text-slate-500">
                        Cancelled
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-700 text-slate-300">
                        Draft
                      </span>
                    )}
                  </td>
                  <td className="p-4 text-right space-x-2">
                    {inv.balance_due > 0 && inv.status !== 'cancelled' && (
                      <button
                        onClick={() => handleOpenPayment(inv)}
                        className="px-2.5 py-1 rounded-lg bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-300 border border-emerald-500/40 text-xs font-semibold transition-colors cursor-pointer"
                        title="Record a customer payment against this invoice"
                      >
                        Record Pay
                      </button>
                    )}
                    <button
                      onClick={async () => {
                        const full = await api.getInvoiceById(inv.id);
                        setSelectedInvoice(full);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* CREATE INVOICE MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Receipt className="w-5 h-5 text-indigo-400" />
                Issue New Customer Invoice
              </h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateInvoice} className="space-y-5">
              {/* Customer Info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Customer / Client Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Acme Corporation"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white text-xs focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Customer Email (for Automated Billing)
                  </label>
                  <input
                    type="email"
                    placeholder="billing@acmecorp.com"
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white text-xs focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Issue Date</label>
                  <input
                    type="date"
                    required
                    value={issueDate}
                    onChange={(e) => setIssueDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white text-xs"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Due Date</label>
                  <input
                    type="date"
                    required
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white text-xs"
                  />
                </div>
              </div>

              {/* Line Items */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                    Invoice Line Items
                  </span>
                  <button
                    type="button"
                    onClick={handleAddLineItem}
                    className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Item</span>
                  </button>
                </div>

                <div className="space-y-2">
                  {lineItems.map((item, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-xl bg-slate-950 border border-slate-800 grid grid-cols-12 gap-2 items-center"
                    >
                      <div className="col-span-12 sm:col-span-5">
                        <label className="text-[10px] text-slate-500 block mb-0.5">Inventory Link / Custom</label>
                        <select
                          value={item.item_id || ''}
                          onChange={(e) => handleLineItemChange(idx, 'item_id', e.target.value)}
                          className="w-full px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-white text-xs mb-1"
                        >
                          <option value="">Custom Item Description</option>
                          {inventoryItems.map((inv) => (
                            <option key={inv.id} value={inv.id}>
                              [{inv.code}] {inv.name} - ${inv.unit_price}
                            </option>
                          ))}
                        </select>
                        <input
                          type="text"
                          required
                          placeholder="Description..."
                          value={item.description}
                          onChange={(e) => handleLineItemChange(idx, 'description', e.target.value)}
                          className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-700 text-white text-xs"
                        />
                      </div>

                      <div className="col-span-4 sm:col-span-2">
                        <label className="text-[10px] text-slate-500 block mb-0.5">Qty</label>
                        <input
                          type="number"
                          min="1"
                          required
                          value={item.quantity}
                          onChange={(e) => handleLineItemChange(idx, 'quantity', Number(e.target.value))}
                          className="w-full px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-white text-xs font-mono"
                        />
                      </div>

                      <div className="col-span-4 sm:col-span-2">
                        <label className="text-[10px] text-slate-500 block mb-0.5">Price ($)</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          required
                          value={item.unit_price}
                          onChange={(e) => handleLineItemChange(idx, 'unit_price', Number(e.target.value))}
                          className="w-full px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-white text-xs font-mono"
                        />
                      </div>

                      <div className="col-span-3 sm:col-span-2 text-right">
                        <label className="text-[10px] text-slate-500 block mb-0.5">Subtotal</label>
                        <span className="font-mono text-xs font-bold text-white block mt-1">
                          ${((Number(item.quantity) || 0) * (Number(item.unit_price) || 0)).toFixed(2)}
                        </span>
                      </div>

                      <div className="col-span-1 text-right">
                        <button
                          type="button"
                          onClick={() => handleRemoveLineItem(idx)}
                          className="text-slate-500 hover:text-rose-400 p-1"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Tax & Discount Summary */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Tax Rate (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={taxRate}
                    onChange={(e) => setTaxRate(Number(e.target.value))}
                    className="w-full px-3 py-1.5 rounded bg-slate-900 border border-slate-700 text-white text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Discount ($)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={discountAmount}
                    onChange={(e) => setDiscountAmount(Number(e.target.value))}
                    className="w-full px-3 py-1.5 rounded bg-slate-900 border border-slate-700 text-white text-xs font-mono"
                  />
                </div>
                <div className="text-right flex flex-col justify-end">
                  <span className="text-[11px] text-slate-400">Total Calculation</span>
                  <span className="text-xl font-bold font-mono text-white">
                    ${calculatedTotal.toFixed(2)}
                  </span>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold"
                >
                  Create & Issue Invoice
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* INVOICE DETAIL & PDF PREVIEW MODAL */}
      {selectedInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm print:p-0">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto space-y-6 print:border-none print:shadow-none print:bg-white print:text-black">
            {/* Action Bar (Hidden on print) */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 print:hidden">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-bold text-indigo-400">
                  {selectedInvoice.invoice_number}
                </span>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 uppercase font-semibold">
                  {selectedInvoice.status}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {selectedInvoice.customer_email && (
                  <button
                    onClick={() => handleSendEmail(selectedInvoice)}
                    className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    <span>Email Invoice</span>
                  </button>
                )}
                <button
                  onClick={() => window.print()}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print / PDF</span>
                </button>
                <button
                  onClick={() => setSelectedInvoice(null)}
                  className="text-slate-400 hover:text-white p-1"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Invoice Printable View */}
            <div className="p-6 bg-slate-950 border border-slate-800 rounded-xl space-y-6">
              <div className="flex justify-between items-start">
                <div>
                  <h1 className="text-2xl font-black text-white tracking-tight">NEXORA ENTERPRISE</h1>
                  <p className="text-xs text-slate-400 mt-0.5">Procurement & Financial Operations</p>
                </div>
                <div className="text-right font-mono">
                  <div className="text-lg font-bold text-indigo-400">{selectedInvoice.invoice_number}</div>
                  <div className="text-xs text-slate-400">Issue Date: {selectedInvoice.issue_date}</div>
                  <div className="text-xs text-slate-400">Due Date: {selectedInvoice.due_date}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-xs pt-4 border-t border-slate-800">
                <div>
                  <span className="text-slate-500 uppercase font-semibold block mb-1">Billed To:</span>
                  <div className="font-bold text-white text-sm">{selectedInvoice.customer_name}</div>
                  {selectedInvoice.customer_email && <div>{selectedInvoice.customer_email}</div>}
                  {selectedInvoice.customer_phone && <div>{selectedInvoice.customer_phone}</div>}
                  {selectedInvoice.customer_address && <div className="mt-1 text-slate-400">{selectedInvoice.customer_address}</div>}
                </div>
                <div className="text-right">
                  <span className="text-slate-500 uppercase font-semibold block mb-1">Payment Terms:</span>
                  <div className="font-bold text-white">{selectedInvoice.payment_terms}</div>
                </div>
              </div>

              {/* Items Table */}
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="py-2">Description</th>
                    <th className="py-2 text-right">Qty</th>
                    <th className="py-2 text-right">Unit Price</th>
                    <th className="py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {selectedInvoice.items?.map((item) => (
                    <tr key={item.id}>
                      <td className="py-2.5 font-sans font-medium text-slate-200">{item.description}</td>
                      <td className="py-2.5 text-right text-slate-300">{item.quantity}</td>
                      <td className="py-2.5 text-right text-slate-300">${item.unit_price.toFixed(2)}</td>
                      <td className="py-2.5 text-right font-bold text-white">${item.total_price.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Totals Box */}
              <div className="border-t border-slate-800 pt-3 flex justify-end">
                <div className="w-64 space-y-1.5 text-xs font-mono">
                  <div className="flex justify-between text-slate-400">
                    <span>Subtotal:</span>
                    <span>${selectedInvoice.subtotal.toFixed(2)}</span>
                  </div>
                  {selectedInvoice.tax_amount > 0 && (
                    <div className="flex justify-between text-slate-400">
                      <span>Tax ({selectedInvoice.tax_rate}%):</span>
                      <span>${selectedInvoice.tax_amount.toFixed(2)}</span>
                    </div>
                  )}
                  {selectedInvoice.discount_amount > 0 && (
                    <div className="flex justify-between text-slate-400">
                      <span>Discount:</span>
                      <span>-${selectedInvoice.discount_amount.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm font-bold text-white pt-1 border-t border-slate-800">
                    <span>Total Amount:</span>
                    <span>${selectedInvoice.total_amount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-emerald-400">
                    <span>Amount Paid:</span>
                    <span>${selectedInvoice.amount_paid.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-bold text-amber-300 pt-1 border-t border-slate-800">
                    <span>Balance Due:</span>
                    <span>${selectedInvoice.balance_due.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Payment History */}
              {selectedInvoice.payments && selectedInvoice.payments.length > 0 && (
                <div className="pt-4 border-t border-slate-800 space-y-2">
                  <span className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
                    Recorded Payments:
                  </span>
                  <div className="space-y-1.5">
                    {selectedInvoice.payments.map((p) => (
                      <div
                        key={p.id}
                        className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex justify-between items-center text-xs"
                      >
                        <div>
                          <span className="font-mono text-indigo-400 font-bold">{p.payment_number}</span>
                          <span className="text-slate-400 ml-2">via {p.payment_method} on {p.payment_date}</span>
                          {p.reference_note && <span className="text-slate-500 block text-[11px] mt-0.5">{p.reference_note}</span>}
                        </div>
                        <span className="font-mono font-bold text-emerald-400">+${p.amount.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* RECORD PAYMENT MODAL */}
      {showPaymentModal && selectedInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-emerald-400" />
                Record Customer Payment
              </h2>
              <button
                onClick={() => setShowPaymentModal(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleRecordPayment} className="space-y-4">
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs">
                <span className="text-slate-400 block">Applying payment to:</span>
                <span className="font-bold text-white">{selectedInvoice.customer_name}</span>
                <span className="font-mono text-indigo-400 ml-2">({selectedInvoice.invoice_number})</span>
                <div className="mt-1 text-slate-400">
                  Current Balance Due: <strong className="text-amber-300 font-mono">${selectedInvoice.balance_due.toFixed(2)}</strong>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Payment Amount ($) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={selectedInvoice.balance_due}
                  required
                  value={payAmount}
                  onChange={(e) => setPayAmount(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white text-sm font-mono focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Payment Date *</label>
                <input
                  type="date"
                  required
                  value={payDate}
                  onChange={(e) => setPayDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white text-xs focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Payment Method *</label>
                <select
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white text-xs focus:border-emerald-500"
                >
                  <option value="Bank Transfer">Bank Wire / ACH</option>
                  <option value="Credit Card">Credit Card</option>
                  <option value="Cheque">Corporate Cheque</option>
                  <option value="Cash">Cash</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Reference / Transaction Note
                </label>
                <input
                  type="text"
                  placeholder="e.g. Wire Ref #99281A"
                  value={payNote}
                  onChange={(e) => setPayNote(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white text-xs focus:border-emerald-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowPaymentModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingPayment}
                  className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{submittingPayment ? 'Processing...' : 'Record Payment'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
