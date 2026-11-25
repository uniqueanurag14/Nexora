import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
  Supplier,
  SupplierFormData,
  ReorderRequest,
  ReorderNegotiation,
  SupplierConversation,
  Warehouse,
  InventoryItem,
} from '../types';
import {
  Truck,
  Plus,
  Search,
  Filter,
  Download,
  Upload,
  RefreshCw,
  Eye,
  Edit2,
  Trash2,
  X,
  AlertCircle,
  CheckCircle,
  Building2,
  Mail,
  Phone,
  Globe,
  MapPin,
  ChevronLeft,
  ChevronRight,
  FileText,
  DollarSign,
  Calendar,
  Send,
  MessageSquare,
  Clock,
  ArrowRight,
  PackageCheck,
  Check,
  ExternalLink,
  Copy,
  AlertTriangle,
  Layers,
} from 'lucide-react';

interface SuppliersPageProps {
  initialTab?: 'directory' | 'purchase-requests' | 'approvals' | 'conversations';
  onNavigate?: (route: string) => void;
}

export const SuppliersPage: React.FC<SuppliersPageProps> = ({
  initialTab = 'directory',
  onNavigate,
}) => {
  const { hasPermission } = useAuth();
  const [activeTab, setActiveTab] = useState<'directory' | 'purchase-requests' | 'approvals' | 'conversations'>(initialTab);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  // Global Alerts & Loading
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');

  // Lookups
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);

  // ==========================================
  // TAB 1: SUPPLIER DIRECTORY STATE
  // ==========================================
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [totalSuppliers, setTotalSuppliers] = useState<number>(0);
  const [supplierPage, setSupplierPage] = useState<number>(1);
  const [supplierPageSize] = useState<number>(10);
  const [supplierTotalPages, setSupplierTotalPages] = useState<number>(1);
  const [supplierSearch, setSupplierSearch] = useState<string>('');
  const [supplierCategoryFilter, setSupplierCategoryFilter] = useState<string>('');
  const [supplierStatusFilter, setSupplierStatusFilter] = useState<string>('all');

  const [isCreateSupplierOpen, setIsCreateSupplierOpen] = useState<boolean>(false);
  const [viewSupplier, setViewSupplier] = useState<Supplier | null>(null);
  const [editSupplier, setEditSupplier] = useState<Supplier | null>(null);
  const [deleteSupplierTarget, setDeleteSupplierTarget] = useState<Supplier | null>(null);
  const [isImportOpen, setIsImportOpen] = useState<boolean>(false);
  const [supplierHistoryTarget, setSupplierHistoryTarget] = useState<Supplier | null>(null);
  const [supplierHistoryReorders, setSupplierHistoryReorders] = useState<ReorderRequest[]>([]);

  const initialSupplierForm: SupplierFormData = {
    code: '',
    name: '',
    category: '',
    tax_id: '',
    status: 'active',
    contact_first_name: '',
    contact_last_name: '',
    contact_person: '',
    payment_terms: 'Net 30 Days',
    email: '',
    phone: '',
    alternate_phone: '',
    address_line1: '',
    address_line2: '',
    city: '',
    state: '',
    postal_code: '',
    country: 'India',
    website: '',
    notes: '',
  };
  const [supplierFormData, setSupplierFormData] = useState<SupplierFormData>(initialSupplierForm);
  const [supplierFormErrors, setSupplierFormErrors] = useState<Record<string, string>>({});

  // Import State
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<any | null>(null);
  const [duplicatePolicy, setDuplicatePolicy] = useState<'skip' | 'update'>('skip');
  const [isImporting, setIsImporting] = useState<boolean>(false);

  // ==========================================
  // TAB 2: PURCHASE REQUESTS STATE
  // ==========================================
  const [reorders, setReorders] = useState<ReorderRequest[]>([]);
  const [reorderSearch, setReorderSearch] = useState<string>('');
  const [reorderStatusFilter, setReorderStatusFilter] = useState<string>('all');
  const [isCreatePROpen, setIsCreatePROpen] = useState<boolean>(false);
  const [prFormData, setPRFormData] = useState({
    item_id: 0,
    supplier_id: 0,
    destination_warehouse_id: 0,
    quantity: 1,
    unit_price: 0,
    expected_delivery_date: '',
    notes: '',
  });
  const [viewPRDetails, setViewPRDetails] = useState<ReorderRequest | null>(null);

  // Counteroffer / Negotiation Modal
  const [negotiatePRTarget, setNegotiatePRTarget] = useState<ReorderRequest | null>(null);
  const [reviseFormData, setReviseFormData] = useState({
    unit_price: 0,
    quantity: 0,
    expected_delivery_date: '',
    notes: '',
  });

  // ==========================================
  // GOODS RECEIPT MODAL STATE (Cross-Module)
  // ==========================================
  const [goodsReceiptTarget, setGoodsReceiptTarget] = useState<ReorderRequest | null>(null);
  const [goodsReceiptWarehouseId, setGoodsReceiptWarehouseId] = useState<number>(0);
  const [goodsReceiptQuantity, setGoodsReceiptQuantity] = useState<number>(0);
  const [goodsReceiptChallan, setGoodsReceiptChallan] = useState<string>('');
  const [goodsReceiptNotes, setGoodsReceiptNotes] = useState<string>('');

  // ==========================================
  // TAB 4: CONVERSATIONS STATE
  // ==========================================
  const [conversations, setConversations] = useState<SupplierConversation[]>([]);
  const [conversationFilter, setConversationFilter] = useState<string>('');

  // Load Common Lookups
  const loadLookups = async () => {
    try {
      const [whRes, itemsRes] = await Promise.all([
        api.getWarehouses(),
        api.getItems({ page_size: 100 }),
      ]);
      if (whRes.success && whRes.data) setWarehouses(whRes.data);
      if (itemsRes.success && itemsRes.data) setInventoryItems(itemsRes.data.items);
    } catch (err) {
      console.warn('Lookup note:', err);
    }
  };

  // Fetch Suppliers
  const fetchSuppliers = async () => {
    setIsLoading(true);
    try {
      const res = await api.getSuppliers({
        search: supplierSearch.trim() || undefined,
        category: supplierCategoryFilter || undefined,
        status: supplierStatusFilter !== 'all' ? supplierStatusFilter : undefined,
        page: supplierPage,
        page_size: supplierPageSize,
      });
      if (res.success && res.data) {
        setSuppliers(res.data.items || []);
        setTotalSuppliers(res.data.total || 0);
        setSupplierTotalPages(res.data.totalPages || 1);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to fetch suppliers.');
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch Purchase Requests
  const fetchReorders = async () => {
    setIsLoading(true);
    try {
      const res = await api.getReorders({
        status: reorderStatusFilter !== 'all' ? reorderStatusFilter : undefined,
        search: reorderSearch.trim() || undefined,
        page_size: 100,
      });
      if (res.success && res.data) {
        setReorders(res.data.reorders || []);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to fetch purchase requests.');
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch Conversations
  const fetchConversations = async () => {
    setIsLoading(true);
    try {
      const res = await api.getSupplierConversations();
      if (res.success && res.data) {
        setConversations(res.data);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to fetch supplier communication trail.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadLookups();
  }, []);

  useEffect(() => {
    if (activeTab === 'directory') fetchSuppliers();
    if (activeTab === 'purchase-requests' || activeTab === 'approvals') fetchReorders();
    if (activeTab === 'conversations') fetchConversations();
  }, [activeTab, supplierPage, supplierCategoryFilter, supplierStatusFilter, reorderStatusFilter]);

  // Tab 1: Supplier Directory Handlers
  const handleOpenCreateSupplier = async () => {
    setSupplierFormData(initialSupplierForm);
    setSupplierFormErrors({});
    setIsCreateSupplierOpen(true);
    try {
      const res = await api.getNextSupplierCode();
      if (res.success && res.data?.next_code) {
        setSupplierFormData(prev => ({ ...prev, code: res.data!.next_code }));
      }
    } catch {}
  };

  const handleOpenEditSupplier = (s: Supplier) => {
    setEditSupplier(s);
    setSupplierFormData({
      code: s.code,
      name: s.name,
      category: s.category || '',
      tax_id: s.tax_id || '',
      status: s.status,
      contact_first_name: s.contact_first_name || '',
      contact_last_name: s.contact_last_name || '',
      contact_person: s.contact_person || (s.contact_first_name ? `${s.contact_first_name} ${s.contact_last_name || ''}`.trim() : ''),
      payment_terms: s.payment_terms || 'Net 30 Days',
      email: s.email || '',
      phone: s.phone || '',
      alternate_phone: s.alternate_phone || '',
      address_line1: s.address_line1 || '',
      address_line2: s.address_line2 || '',
      city: s.city || '',
      state: s.state || '',
      postal_code: s.postal_code || '',
      country: s.country || 'India',
      website: s.website || '',
      notes: s.notes || '',
    });
    setSupplierFormErrors({});
  };

  const handleSaveSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string> = {};
    if (!supplierFormData.name.trim()) errors.name = 'Supplier name is required.';
    if (!supplierFormData.code.trim()) errors.code = 'Supplier code is required.';
    if (supplierFormData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supplierFormData.email.trim())) {
      errors.email = 'Valid email address format required.';
    }
    if (Object.keys(errors).length > 0) {
      setSupplierFormErrors(errors);
      return;
    }

    setIsLoading(true);
    try {
      if (editSupplier) {
        const res = await api.updateSupplier(editSupplier.id, supplierFormData);
        if (res.success) {
          setSuccessMsg(`Supplier '${supplierFormData.name}' updated successfully.`);
          setEditSupplier(null);
          fetchSuppliers();
        } else {
          setErrorMsg(res.message || 'Failed to update supplier.');
        }
      } else {
        const res = await api.createSupplier(supplierFormData);
        if (res.success) {
          setSuccessMsg(`Supplier '${supplierFormData.name}' created successfully.`);
          setIsCreateSupplierOpen(false);
          fetchSuppliers();
        } else {
          setErrorMsg(res.message || 'Failed to create supplier.');
        }
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Network error.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteSupplierConfirm = async (forceDisable = false) => {
    if (!deleteSupplierTarget) return;
    setIsLoading(true);
    try {
      const res = await api.deleteSupplier(deleteSupplierTarget.id, forceDisable);
      if (res.success) {
        setSuccessMsg(`Supplier '${deleteSupplierTarget.name}' has been ${res.data?.action === 'disabled' ? 'disabled' : 'deleted'}.`);
        setDeleteSupplierTarget(null);
        fetchSuppliers();
      } else {
        setErrorMsg(res.message || 'Deletion error.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Network error.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenSupplierHistory = async (s: Supplier) => {
    setSupplierHistoryTarget(s);
    try {
      const res = await api.getReorders({ supplier_id: s.id, page_size: 50 });
      if (res.success && res.data) {
        setSupplierHistoryReorders(res.data.reorders || []);
      }
    } catch (err) {
      console.warn('History fetch error', err);
    }
  };

  // Tab 2: Purchase Request Handlers
  const handleOpenCreatePR = () => {
    const defaultItem = inventoryItems[0];
    setPRFormData({
      item_id: defaultItem?.id || 0,
      supplier_id: suppliers[0]?.id || 0,
      destination_warehouse_id: warehouses[0]?.id || 0,
      quantity: defaultItem?.reorder_quantity || 10,
      unit_price: defaultItem?.cost_price || 100,
      expected_delivery_date: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
      notes: '',
    });
    setIsCreatePROpen(true);
  };

  const handleItemSelectInPR = (itemId: number) => {
    const it = inventoryItems.find(i => i.id === itemId);
    if (it) {
      setPRFormData(prev => ({
        ...prev,
        item_id: itemId,
        quantity: it.reorder_quantity || prev.quantity,
        unit_price: it.cost_price || prev.unit_price,
      }));
    }
  };

  const handleSavePurchaseRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prFormData.item_id || !prFormData.supplier_id || !prFormData.quantity || !prFormData.unit_price) {
      setErrorMsg('Please specify Item, Supplier, Quantity and Unit Price.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await api.createReorder({
        item_id: prFormData.item_id,
        supplier_id: prFormData.supplier_id,
        quantity: prFormData.quantity,
        unit_price: prFormData.unit_price,
        expected_delivery_date: prFormData.expected_delivery_date || undefined,
        notes: prFormData.notes,
      });
      if (res.success) {
        setSuccessMsg(`Purchase Request ${res.data?.reorder_no} created and dispatched to supplier email with cryptographic response link.`);
        setIsCreatePROpen(false);
        fetchReorders();
      } else {
        setErrorMsg(res.message || 'Failed to create purchase request.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error creating purchase request.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopySupplierLink = (token?: string, link?: string) => {
    const targetLink = link || (token ? `${window.location.origin}/supplier-portal/${token}` : '');
    if (!targetLink) return;
    navigator.clipboard.writeText(targetLink);
    setSuccessMsg('Cryptographic supplier portal link copied to clipboard.');
  };

  const handleResendNotification = async (reorderId: number) => {
    setIsLoading(true);
    try {
      const res = await api.resendReorderEmail(reorderId);
      if (res.success) {
        setSuccessMsg('Notification re-sent with refreshed secure cryptographic token.');
        fetchReorders();
      } else {
        setErrorMsg(res.message || 'Resend failed.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Resend failed.');
    } finally {
      setIsLoading(false);
    }
  };

  // Tab 3: Approvals & Negotiations Handlers
  const handleBuyerAcceptCounteroffer = async (id: number) => {
    setIsLoading(true);
    try {
      const res = await api.acceptCounteroffer(id, 'Buyer accepted supplier counter-proposal.');
      if (res.success) {
        setSuccessMsg(`Counteroffer for ${res.data?.reorder_no} accepted. Agreed terms locked. Ready for Goods Receipt.`);
        fetchReorders();
      } else {
        setErrorMsg(res.message || 'Acceptance failed.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Acceptance failed.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenReviseOffer = (ro: ReorderRequest) => {
    setNegotiatePRTarget(ro);
    setReviseFormData({
      unit_price: ro.counter_unit_price || ro.unit_price,
      quantity: ro.counter_quantity || ro.quantity,
      expected_delivery_date: ro.counter_delivery_date || ro.expected_delivery_date || '',
      notes: '',
    });
  };

  const handleSubmitRevisedOffer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!negotiatePRTarget) return;

    setIsLoading(true);
    try {
      const res = await api.reviseProposal(negotiatePRTarget.id, reviseFormData);
      if (res.success) {
        setSuccessMsg(`Revised offer for ${negotiatePRTarget.reorder_no} dispatched to supplier.`);
        setNegotiatePRTarget(null);
        fetchReorders();
      } else {
        setErrorMsg(res.message || 'Revision failed.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Revision failed.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelReorder = async (id: number) => {
    const reason = window.prompt('Specify reason for cancelling this purchase request:');
    if (reason === null) return;

    setIsLoading(true);
    try {
      const res = await api.cancelReorder(id, reason || 'Cancelled by procurement');
      if (res.success) {
        setSuccessMsg('Purchase request cancelled.');
        fetchReorders();
      } else {
        setErrorMsg(res.message || 'Cancellation failed.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Cancellation failed.');
    } finally {
      setIsLoading(false);
    }
  };

  // Cross-Module Goods Receipt Handlers
  const handleOpenGoodsReceipt = (ro: ReorderRequest) => {
    setGoodsReceiptTarget(ro);
    setGoodsReceiptWarehouseId(ro.destination_warehouse_id || warehouses[0]?.id || 0);
    const remainingQty = ro.quantity - (ro.received_quantity || 0);
    setGoodsReceiptQuantity(remainingQty > 0 ? remainingQty : ro.quantity);
    setGoodsReceiptChallan(`CH-${Date.now().toString().slice(-6)}`);
    setGoodsReceiptNotes('');
  };

  const handleSubmitGoodsReceipt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!goodsReceiptTarget || !goodsReceiptWarehouseId || goodsReceiptQuantity <= 0) {
      setErrorMsg('Valid destination warehouse and received quantity are required.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await api.receiveGoodsForReorder(goodsReceiptTarget.id, {
        warehouse_id: goodsReceiptWarehouseId,
        received_quantity: goodsReceiptQuantity,
        challan_no: goodsReceiptChallan,
        notes: goodsReceiptNotes,
      });
      if (res.success) {
        setSuccessMsg(`Goods received! Inventory for ${goodsReceiptTarget.item_name} incremented by ${goodsReceiptQuantity} units in destination warehouse.`);
        setGoodsReceiptTarget(null);
        fetchReorders();
      } else {
        setErrorMsg(res.message || 'Goods receipt intake failed.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Goods receipt failed.');
    } finally {
      setIsLoading(false);
    }
  };

  // Filtered Lists
  const approvalItems = reorders.filter(r =>
    r.status === 'accepted' ||
    r.status === 'counteroffer_received' ||
    r.status === 'partially_received'
  );

  const filteredConversations = conversations.filter(c =>
    !conversationFilter ||
    c.reorder_no.toLowerCase().includes(conversationFilter.toLowerCase()) ||
    c.supplier_name.toLowerCase().includes(conversationFilter.toLowerCase()) ||
    c.subject.toLowerCase().includes(conversationFilter.toLowerCase())
  );

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Header & Tab Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Supplier & Procurement Management
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Vendor records, digital purchase requests, supplier negotiations, and warehouse goods intake
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200 flex-wrap">
          <button
            onClick={() => setActiveTab('directory')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              activeTab === 'directory'
                ? 'bg-white text-sky-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Supplier Directory
          </button>
          <button
            onClick={() => setActiveTab('purchase-requests')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              activeTab === 'purchase-requests'
                ? 'bg-white text-sky-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Purchase Requests
          </button>
          <button
            onClick={() => setActiveTab('approvals')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              activeTab === 'approvals'
                ? 'bg-white text-sky-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Supplier Approvals {approvalItems.length > 0 && `(${approvalItems.length})`}
          </button>
          <button
            onClick={() => setActiveTab('conversations')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              activeTab === 'conversations'
                ? 'bg-white text-sky-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Email Conversations
          </button>
        </div>
      </div>

      {/* Global Alerts */}
      {errorMsg && (
        <div className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg('')} className="text-rose-500 hover:text-rose-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {successMsg && (
        <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg('')} className="text-emerald-500 hover:text-emerald-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 1: SUPPLIER DIRECTORY */}
      {/* ======================================================== */}
      {activeTab === 'directory' && (
        <div className="space-y-4">
          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-3 w-full md:w-auto">
              <div className="relative w-full md:w-72">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search code, supplier name, city..."
                  value={supplierSearch}
                  onChange={e => setSupplierSearch(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && fetchSuppliers()}
                  className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
              </div>

              <select
                value={supplierStatusFilter}
                onChange={e => setSupplierStatusFilter(e.target.value)}
                className="py-1.5 px-3 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-sky-500"
              >
                <option value="all">All Statuses</option>
                <option value="active">Active Only</option>
                <option value="disabled">Disabled</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              {hasPermission('suppliers.create') && (
                <button
                  onClick={handleOpenCreateSupplier}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-sky-600 text-white hover:bg-sky-700 transition-colors shadow-xs whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Supplier
                </button>
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Supplier Code</th>
                    <th className="py-3 px-4">Supplier Name</th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4">Contact Person</th>
                    <th className="py-3 px-4">Payment Terms</th>
                    <th className="py-3 px-4">Tax / GSTIN</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {suppliers.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400">
                        No registered suppliers found.
                      </td>
                    </tr>
                  ) : (
                    suppliers.map(s => (
                      <tr key={s.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-sky-700">{s.code}</td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-900">{s.name}</div>
                          <div className="text-slate-400 text-[11px] flex items-center gap-1 mt-0.5">
                            <Mail className="w-3 h-3" />
                            {s.email || 'No email registered'}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-slate-700">{s.category || 'General'}</td>
                        <td className="py-3 px-4">
                          <div className="text-slate-900 font-medium">
                            {s.contact_person || (s.contact_first_name ? `${s.contact_first_name} ${s.contact_last_name || ''}`.trim() : 'N/A')}
                          </div>
                          {s.phone && <div className="text-slate-400 text-[11px]">{s.phone}</div>}
                        </td>
                        <td className="py-3 px-4 font-medium text-slate-700">{s.payment_terms || 'Net 30 Days'}</td>
                        <td className="py-3 px-4 font-mono text-slate-600">{s.tax_id || 'Not Provided'}</td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${
                            s.status === 'active'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-rose-50 text-rose-700 border border-rose-200'
                          }`}>
                            {s.status.toUpperCase()}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              onClick={() => handleOpenSupplierHistory(s)}
                              title="View Transaction History"
                              className="p-1 text-slate-400 hover:text-sky-600 rounded"
                            >
                              <Layers className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleOpenEditSupplier(s)}
                              title="Edit Supplier"
                              className="p-1 text-slate-400 hover:text-slate-700 rounded"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setDeleteSupplierTarget(s)}
                              title="Delete or Disable"
                              className="p-1 text-slate-400 hover:text-rose-600 rounded"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="p-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
              <div>Total {totalSuppliers} registered suppliers</div>
              <div className="flex items-center gap-2">
                <button
                  disabled={supplierPage <= 1}
                  onClick={() => setSupplierPage(p => Math.max(1, p - 1))}
                  className="p-1 border border-slate-300 rounded hover:bg-white disabled:opacity-40"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span>Page {supplierPage} of {supplierTotalPages}</span>
                <button
                  disabled={supplierPage >= supplierTotalPages}
                  onClick={() => setSupplierPage(p => Math.min(supplierTotalPages, p + 1))}
                  className="p-1 border border-slate-300 rounded hover:bg-white disabled:opacity-40"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 2: PURCHASE REQUESTS */}
      {/* ======================================================== */}
      {activeTab === 'purchase-requests' && (
        <div className="space-y-4">
          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-3 w-full md:w-auto">
              <div className="relative w-full md:w-72">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search PR #, item, supplier..."
                  value={reorderSearch}
                  onChange={e => setReorderSearch(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && fetchReorders()}
                  className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
              </div>

              <select
                value={reorderStatusFilter}
                onChange={e => setReorderStatusFilter(e.target.value)}
                className="py-1.5 px-3 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-sky-500"
              >
                <option value="all">All Request Statuses</option>
                <option value="pending_supplier_response">Awaiting Supplier Response</option>
                <option value="counteroffer_received">Counteroffer Received</option>
                <option value="accepted">Approved / Accepted</option>
                <option value="partially_received">Partially Received</option>
                <option value="received">Received / Closed</option>
                <option value="rejected">Rejected by Vendor</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>

            <button
              onClick={handleOpenCreatePR}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-sky-600 text-white hover:bg-sky-700 transition-colors shadow-xs whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              New Purchase Request
            </button>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Request #</th>
                    <th className="py-3 px-4">Item Details</th>
                    <th className="py-3 px-4">Vendor</th>
                    <th className="py-3 px-4 text-right">Order Qty</th>
                    <th className="py-3 px-4 text-right">Unit Price</th>
                    <th className="py-3 px-4 text-right">Total Amount</th>
                    <th className="py-3 px-4">Expected Date</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {reorders.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-slate-400">
                        No purchase requests found.
                      </td>
                    </tr>
                  ) : (
                    reorders.map(ro => (
                      <tr key={ro.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-sky-700">{ro.reorder_no}</td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-900">{ro.item_name}</div>
                          <div className="text-slate-400 text-[11px] font-mono">{ro.item_code}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium text-slate-900">{ro.supplier_name}</div>
                          <div className="text-slate-400 text-[11px]">{ro.supplier_email}</div>
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-slate-900">
                          {ro.quantity} <span className="text-[11px] font-normal text-slate-500">{ro.uom_symbol}</span>
                          {ro.received_quantity !== undefined && ro.received_quantity > 0 && (
                            <div className="text-emerald-600 text-[10px]">Recv: {ro.received_quantity}</div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right text-slate-700">₹{ro.unit_price}</td>
                        <td className="py-3 px-4 text-right font-bold text-slate-900">₹{ro.total_amount?.toLocaleString()}</td>
                        <td className="py-3 px-4 text-slate-600">
                          {ro.expected_delivery_date || 'Not specified'}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${
                            ro.status === 'accepted' || ro.status === 'received'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : ro.status === 'counteroffer_received'
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : ro.status === 'partially_received'
                              ? 'bg-sky-50 text-sky-700 border border-sky-200'
                              : ro.status === 'rejected' || ro.status === 'cancelled'
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : 'bg-slate-100 text-slate-700 border border-slate-200'
                          }`}>
                            {ro.status.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="inline-flex items-center gap-1.5 justify-end">
                            {ro.token && (
                              <button
                                onClick={() => handleCopySupplierLink(ro.token, ro.supplier_link)}
                                title="Copy Supplier Response Link"
                                className="p-1 text-slate-400 hover:text-sky-600 rounded"
                              >
                                <Copy className="w-4 h-4" />
                              </button>
                            )}

                            {ro.status === 'accepted' && (
                              <button
                                onClick={() => handleOpenGoodsReceipt(ro)}
                                className="px-2.5 py-1 text-[11px] font-semibold rounded bg-emerald-600 text-white hover:bg-emerald-700 flex items-center gap-1"
                              >
                                <PackageCheck className="w-3.5 h-3.5" />
                                Goods Receipt
                              </button>
                            )}

                            <button
                              onClick={() => setViewPRDetails(ro)}
                              title="View Details"
                              className="p-1 text-slate-400 hover:text-slate-700 rounded"
                            >
                              <Eye className="w-4 h-4" />
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
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 3: SUPPLIER APPROVALS */}
      {/* ======================================================== */}
      {activeTab === 'approvals' && (
        <div className="space-y-4">
          <div className="p-4 bg-sky-50 border border-sky-200 rounded-xl text-xs text-sky-900 flex items-start gap-3">
            <Building2 className="w-5 h-5 text-sky-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Strict Term Locking & Inventory Segregation Rule</p>
              <p className="text-sky-800 mt-0.5 leading-relaxed">
                When a supplier accepts an order via email or public link, the terms and unit prices are securely locked.
                <strong> Supplier approval alone DOES NOT increment warehouse stock.</strong> Physical stock balances are only updated upon official Goods Receipt intake into the designated warehouse facility.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {approvalItems.length === 0 ? (
              <div className="bg-white p-12 text-center text-slate-400 rounded-xl border border-slate-200 shadow-xs">
                No supplier approvals or counteroffers currently require action.
              </div>
            ) : (
              approvalItems.map(ro => (
                <div key={ro.id} className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="font-mono font-bold text-sky-700 text-sm">{ro.reorder_no}</span>
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                        ro.status === 'accepted'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : ro.status === 'counteroffer_received'
                          ? 'bg-amber-50 text-amber-700 border border-amber-200'
                          : 'bg-sky-50 text-sky-700 border border-sky-200'
                      }`}>
                        {ro.status.replace(/_/g, ' ').toUpperCase()}
                      </span>
                      <span className="text-xs text-slate-400">• Vendor: <strong className="text-slate-800">{ro.supplier_name}</strong></span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                      <div>
                        <span className="text-slate-400 block">Item SKU:</span>
                        <span className="font-semibold text-slate-900">{ro.item_name} ({ro.item_code})</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Agreed Quantity:</span>
                        <span className="font-bold text-slate-900">{ro.quantity} {ro.uom_symbol}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Unit Price:</span>
                        <span className="font-semibold text-slate-900">₹{ro.unit_price}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Total Contract:</span>
                        <span className="font-bold text-sky-700">₹{ro.total_amount?.toLocaleString()}</span>
                      </div>
                    </div>

                    {ro.status === 'counteroffer_received' && (
                      <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs space-y-1">
                        <div className="font-bold text-amber-900 flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                          Supplier Proposed Counteroffer:
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-amber-800 font-medium pt-1">
                          <div>Counter Price: <strong>₹{ro.counter_unit_price}</strong></div>
                          <div>Counter Qty: <strong>{ro.counter_quantity}</strong></div>
                          <div>Delivery: <strong>{ro.counter_delivery_date || 'N/A'}</strong></div>
                        </div>
                        {ro.supplier_response_notes && (
                          <div className="text-[11px] text-amber-700 italic mt-1">
                            "{ro.supplier_response_notes}"
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {ro.status === 'accepted' && (
                      <button
                        onClick={() => handleOpenGoodsReceipt(ro)}
                        className="px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs flex items-center gap-1.5"
                      >
                        <PackageCheck className="w-4 h-4" />
                        Intake Goods Receipt
                      </button>
                    )}

                    {ro.status === 'counteroffer_received' && (
                      <>
                        <button
                          onClick={() => handleBuyerAcceptCounteroffer(ro.id)}
                          className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs"
                        >
                          Accept Counteroffer
                        </button>
                        <button
                          onClick={() => handleOpenReviseOffer(ro)}
                          className="px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
                        >
                          Revise Proposal
                        </button>
                        <button
                          onClick={() => handleCancelReorder(ro.id)}
                          className="px-3 py-2 text-xs font-semibold rounded-lg border border-rose-300 text-rose-700 hover:bg-rose-50"
                        >
                          Reject
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 4: EMAIL CONVERSATIONS */}
      {/* ======================================================== */}
      {activeTab === 'conversations' && (
        <div className="space-y-4">
          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between gap-3">
            <div className="relative w-full md:w-80">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Filter by Request #, vendor name, subject..."
                value={conversationFilter}
                onChange={e => setConversationFilter(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </div>
            <button
              onClick={fetchConversations}
              className="p-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-600"
              title="Refresh Thread"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-xs divide-y divide-slate-100">
            {filteredConversations.length === 0 ? (
              <div className="p-12 text-center text-slate-400 text-xs">
                No email conversation or negotiation records found.
              </div>
            ) : (
              filteredConversations.map(c => (
                <div key={c.id} className="p-4 hover:bg-slate-50/70 transition-colors space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-sky-700">{c.reorder_no}</span>
                      <span className="text-slate-300">•</span>
                      <span className="font-semibold text-slate-900">{c.supplier_name}</span>
                      <span className="text-slate-400 text-[11px]">({c.supplier_email})</span>
                    </div>
                    <div className="text-slate-400 text-[11px] flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(c.timestamp).toLocaleString()}
                    </div>
                  </div>

                  <div className="text-xs font-semibold text-slate-800">
                    Subject: {c.subject}
                  </div>

                  <div className="p-3 bg-slate-50 rounded-lg text-xs text-slate-600 leading-relaxed font-mono whitespace-pre-wrap border border-slate-100">
                    {c.message}
                  </div>

                  {c.status_after && (
                    <div className="text-[11px] text-slate-500 flex items-center gap-2">
                      <span>Status transition:</span>
                      <span className="font-medium text-slate-700">{c.status_before || 'init'}</span>
                      <ArrowRight className="w-3 h-3 text-slate-400" />
                      <span className="font-semibold text-sky-700">{c.status_after}</span>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: CREATE / EDIT SUPPLIER */}
      {/* ======================================================== */}
      {isCreateSupplierOpen || editSupplier ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full p-6 space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">
                {editSupplier ? 'Edit Supplier Record' : 'Register New Vendor'}
              </h3>
              <button
                onClick={() => { setIsCreateSupplierOpen(false); setEditSupplier(null); }}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSupplier} className="space-y-3.5 overflow-y-auto flex-1 pr-1">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Supplier Code *</label>
                  <input
                    type="text"
                    required
                    value={supplierFormData.code}
                    onChange={e => setSupplierFormData({ ...supplierFormData, code: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:ring-1 focus:ring-sky-500 font-mono"
                  />
                  {supplierFormErrors.code && <p className="text-[11px] text-rose-500 mt-0.5">{supplierFormErrors.code}</p>}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Company / Supplier Name *</label>
                  <input
                    type="text"
                    required
                    value={supplierFormData.name}
                    onChange={e => setSupplierFormData({ ...supplierFormData, name: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:ring-1 focus:ring-sky-500"
                  />
                  {supplierFormErrors.name && <p className="text-[11px] text-rose-500 mt-0.5">{supplierFormErrors.name}</p>}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Category</label>
                  <input
                    type="text"
                    placeholder="e.g. Electronics, Raw Materials"
                    value={supplierFormData.category}
                    onChange={e => setSupplierFormData({ ...supplierFormData, category: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:ring-1 focus:ring-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Tax ID / GSTIN</label>
                  <input
                    type="text"
                    placeholder="27AADCB2230M1ZT"
                    value={supplierFormData.tax_id}
                    onChange={e => setSupplierFormData({ ...supplierFormData, tax_id: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:ring-1 focus:ring-sky-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Payment Terms</label>
                  <select
                    value={supplierFormData.payment_terms}
                    onChange={e => setSupplierFormData({ ...supplierFormData, payment_terms: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:ring-1 focus:ring-sky-500"
                  >
                    <option value="Immediate / Advance">Immediate / Advance</option>
                    <option value="Net 15 Days">Net 15 Days</option>
                    <option value="Net 30 Days">Net 30 Days</option>
                    <option value="Net 60 Days">Net 60 Days</option>
                  </select>
                </div>
              </div>

              <div className="border-t border-slate-100 pt-3 grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Contact Person</label>
                  <input
                    type="text"
                    value={supplierFormData.contact_person}
                    onChange={e => setSupplierFormData({ ...supplierFormData, contact_person: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:ring-1 focus:ring-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address</label>
                  <input
                    type="email"
                    value={supplierFormData.email}
                    onChange={e => setSupplierFormData({ ...supplierFormData, email: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:ring-1 focus:ring-sky-500"
                  />
                  {supplierFormErrors.email && <p className="text-[11px] text-rose-500 mt-0.5">{supplierFormErrors.email}</p>}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Phone Number</label>
                  <input
                    type="text"
                    value={supplierFormData.phone}
                    onChange={e => setSupplierFormData({ ...supplierFormData, phone: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:ring-1 focus:ring-sky-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Address Line 1</label>
                  <input
                    type="text"
                    value={supplierFormData.address_line1}
                    onChange={e => setSupplierFormData({ ...supplierFormData, address_line1: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:ring-1 focus:ring-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">City, State</label>
                  <input
                    type="text"
                    placeholder="e.g. Pune, Maharashtra"
                    value={supplierFormData.city}
                    onChange={e => setSupplierFormData({ ...supplierFormData, city: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:ring-1 focus:ring-sky-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Vendor Notes / Agreement Particulars</label>
                <textarea
                  rows={2}
                  value={supplierFormData.notes}
                  onChange={e => setSupplierFormData({ ...supplierFormData, notes: e.target.value })}
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:ring-1 focus:ring-sky-500"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="sup_is_active"
                  checked={supplierFormData.status === 'active'}
                  onChange={e => setSupplierFormData({ ...supplierFormData, status: e.target.checked ? 'active' : 'disabled' })}
                  className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                />
                <label htmlFor="sup_is_active" className="text-xs text-slate-700 font-medium">Supplier is Active</label>
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => { setIsCreateSupplierOpen(false); setEditSupplier(null); }}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-50"
                >
                  {isLoading ? 'Saving...' : 'Save Supplier'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* ======================================================== */}
      {/* MODAL: DELETE / DISABLE SUPPLIER TARGET */}
      {/* ======================================================== */}
      {deleteSupplierTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-3 text-amber-600">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h3 className="text-base font-bold text-slate-900">Decommission Supplier</h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to remove or disable <strong className="text-slate-900">{deleteSupplierTarget.name}</strong> ({deleteSupplierTarget.code})?
            </p>
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-800 space-y-1">
              <p className="font-semibold">Transaction Integrity Rule:</p>
              <p>If purchase requests, orders, or stock transactions exist for this vendor, the system will prevent permanent deletion and disable the vendor profile instead.</p>
            </div>
            <div className="flex justify-end gap-2.5 pt-3">
              <button
                type="button"
                onClick={() => setDeleteSupplierTarget(null)}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
              >
                Abort
              </button>
              <button
                type="button"
                onClick={() => handleDeleteSupplierConfirm(true)}
                className="px-3.5 py-1.5 text-xs font-semibold rounded-lg border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
              >
                Disable Supplier
              </button>
              <button
                type="button"
                onClick={() => handleDeleteSupplierConfirm(false)}
                className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-rose-600 text-white hover:bg-rose-700"
              >
                Permanently Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: SUPPLIER TRANSACTION HISTORY DRAWER */}
      {/* ======================================================== */}
      {supplierHistoryTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full p-6 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">{supplierHistoryTarget.name}</h3>
                <p className="text-xs text-slate-400 font-mono mt-0.5">{supplierHistoryTarget.code} • Transaction History</p>
              </div>
              <button onClick={() => setSupplierHistoryTarget(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold uppercase">
                  <tr>
                    <th className="py-2.5 px-3">Request #</th>
                    <th className="py-2.5 px-3">Item Name</th>
                    <th className="py-2.5 px-3 text-right">Qty</th>
                    <th className="py-2.5 px-3 text-right">Amount</th>
                    <th className="py-2.5 px-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {supplierHistoryReorders.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-400">
                        No purchase requests or historical orders for this vendor.
                      </td>
                    </tr>
                  ) : (
                    supplierHistoryReorders.map(ro => (
                      <tr key={ro.id} className="hover:bg-slate-50/70">
                        <td className="py-2 px-3 font-mono font-bold text-sky-700">{ro.reorder_no}</td>
                        <td className="py-2 px-3 text-slate-900 font-medium">{ro.item_name}</td>
                        <td className="py-2 px-3 text-right font-bold text-slate-900">{ro.quantity}</td>
                        <td className="py-2 px-3 text-right text-slate-700">₹{ro.total_amount?.toLocaleString()}</td>
                        <td className="py-2 px-3">
                          <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-700">
                            {ro.status.replace(/_/g, ' ')}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-100">
              <button
                onClick={() => setSupplierHistoryTarget(null)}
                className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: CREATE PURCHASE REQUEST */}
      {/* ======================================================== */}
      {isCreatePROpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">Initiate Purchase Request</h3>
              <button onClick={() => setIsCreatePROpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePurchaseRequest} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Select Item SKU *</label>
                <select
                  value={prFormData.item_id}
                  onChange={e => handleItemSelectInPR(parseInt(e.target.value, 10))}
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:ring-1 focus:ring-sky-500"
                >
                  {inventoryItems.map(it => (
                    <option key={it.id} value={it.id}>
                      {it.code} - {it.name} (On hand: {it.total_on_hand})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Target Vendor *</label>
                <select
                  value={prFormData.supplier_id}
                  onChange={e => setPRFormData({ ...prFormData, supplier_id: parseInt(e.target.value, 10) })}
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:ring-1 focus:ring-sky-500"
                >
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Order Quantity *</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={prFormData.quantity}
                    onChange={e => setPRFormData({ ...prFormData, quantity: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:ring-1 focus:ring-sky-500 font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Expected Unit Price (₹) *</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    required
                    value={prFormData.unit_price}
                    onChange={e => setPRFormData({ ...prFormData, unit_price: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:ring-1 focus:ring-sky-500 font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Target Destination Warehouse</label>
                  <select
                    value={prFormData.destination_warehouse_id}
                    onChange={e => setPRFormData({ ...prFormData, destination_warehouse_id: parseInt(e.target.value, 10) })}
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:ring-1 focus:ring-sky-500"
                  >
                    {warehouses.map(w => (
                      <option key={w.id} value={w.id}>{w.code} - {w.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Expected Delivery Date</label>
                  <input
                    type="date"
                    value={prFormData.expected_delivery_date}
                    onChange={e => setPRFormData({ ...prFormData, expected_delivery_date: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:ring-1 focus:ring-sky-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Remarks & Instructions for Supplier</label>
                <textarea
                  rows={2}
                  value={prFormData.notes}
                  onChange={e => setPRFormData({ ...prFormData, notes: e.target.value })}
                  placeholder="Payment term references, delivery timings, batch requirements..."
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:ring-1 focus:ring-sky-500"
                />
              </div>

              <div className="p-3 bg-slate-50 rounded-lg text-xs flex justify-between font-bold text-slate-900 border border-slate-100">
                <span>Calculated Total:</span>
                <span className="text-sky-700">₹{(prFormData.quantity * prFormData.unit_price).toLocaleString()}</span>
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCreatePROpen(false)}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-50"
                >
                  {isLoading ? 'Dispatching...' : 'Dispatch to Vendor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: GOODS RECEIPT INTAKE (Cross-Module) */}
      {/* ======================================================== */}
      {goodsReceiptTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Goods Receipt Intake</h3>
                <p className="text-xs text-slate-400 font-mono mt-0.5">{goodsReceiptTarget.reorder_no} • {goodsReceiptTarget.supplier_name}</p>
              </div>
              <button onClick={() => setGoodsReceiptTarget(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitGoodsReceipt} className="space-y-3.5">
              <div className="p-3 bg-slate-50 rounded-lg text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">Ordered Item:</span>
                  <span className="font-semibold text-slate-900">{goodsReceiptTarget.item_name} ({goodsReceiptTarget.item_code})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Contract Quantity:</span>
                  <span className="font-bold text-slate-900">{goodsReceiptTarget.quantity} {goodsReceiptTarget.uom_symbol}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Previously Received:</span>
                  <span className="font-medium text-emerald-700">{goodsReceiptTarget.received_quantity || 0}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Destination Warehouse Facility *</label>
                <select
                  value={goodsReceiptWarehouseId}
                  onChange={e => setGoodsReceiptWarehouseId(parseInt(e.target.value, 10))}
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:ring-1 focus:ring-sky-500"
                >
                  {warehouses.map(w => (
                    <option key={w.id} value={w.id}>{w.code} - {w.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Physical Intake Qty *</label>
                  <input
                    type="number"
                    min="1"
                    step="any"
                    required
                    value={goodsReceiptQuantity}
                    onChange={e => setGoodsReceiptQuantity(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:ring-1 focus:ring-sky-500 font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Delivery Challan / Invoice #</label>
                  <input
                    type="text"
                    value={goodsReceiptChallan}
                    onChange={e => setGoodsReceiptChallan(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:ring-1 focus:ring-sky-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Intake Remarks / Quality Inspection Notes</label>
                <textarea
                  rows={2}
                  value={goodsReceiptNotes}
                  onChange={e => setGoodsReceiptNotes(e.target.value)}
                  placeholder="Verified packaging condition, seal intact..."
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:ring-1 focus:ring-sky-500"
                />
              </div>

              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-[11px] text-emerald-800">
                <strong>Inventory Ledger Effect:</strong> Submitting will instantly credit {goodsReceiptQuantity} units to the destination warehouse ledger, update request status, and create an auditable stock receipt record.
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setGoodsReceiptTarget(null)}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {isLoading ? 'Crediting Stock...' : 'Confirm Goods Intake'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: VIEW PURCHASE REQUEST DETAILS & AUDIT */}
      {/* ======================================================== */}
      {viewPRDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full p-6 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">{viewPRDetails.reorder_no}</h3>
                <p className="text-xs text-slate-400 mt-0.5">Status: <strong className="text-slate-800">{viewPRDetails.status.toUpperCase()}</strong></p>
              </div>
              <button onClick={() => setViewPRDetails(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 overflow-y-auto flex-1 text-xs">
              <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-lg">
                <div>
                  <span className="text-slate-500 block">Item:</span>
                  <span className="font-semibold text-slate-900">{viewPRDetails.item_name} ({viewPRDetails.item_code})</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Supplier:</span>
                  <span className="font-semibold text-slate-900">{viewPRDetails.supplier_name} ({viewPRDetails.supplier_email})</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Ordered Quantity:</span>
                  <span className="font-bold text-slate-900">{viewPRDetails.quantity} {viewPRDetails.uom_symbol}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Agreed Unit Price:</span>
                  <span className="font-bold text-slate-900">₹{viewPRDetails.unit_price} (Total: ₹{viewPRDetails.total_amount?.toLocaleString()})</span>
                </div>
              </div>

              {viewPRDetails.token && (
                <div className="p-3 bg-sky-50 rounded-lg border border-sky-100 flex items-center justify-between">
                  <div className="truncate mr-2">
                    <span className="text-sky-800 font-semibold block text-[11px]">Cryptographic Supplier Link:</span>
                    <span className="text-sky-600 font-mono text-[10px] truncate block">
                      {viewPRDetails.supplier_link || `${window.location.origin}/supplier-portal/${viewPRDetails.token}`}
                    </span>
                  </div>
                  <button
                    onClick={() => handleCopySupplierLink(viewPRDetails.token, viewPRDetails.supplier_link)}
                    className="p-1.5 bg-white text-sky-700 border border-sky-200 rounded hover:bg-sky-50 shrink-0"
                    title="Copy Link"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {viewPRDetails.negotiations && viewPRDetails.negotiations.length > 0 && (
                <div>
                  <h4 className="font-bold text-slate-800 mb-2">Negotiation & Status Audit Trail:</h4>
                  <div className="space-y-2 border border-slate-200 rounded-lg p-3 divide-y divide-slate-100">
                    {viewPRDetails.negotiations.map(n => (
                      <div key={n.id} className="pt-2 first:pt-0">
                        <div className="flex justify-between text-[11px]">
                          <span className="font-semibold text-slate-900 capitalize">{n.actor} - {n.action}</span>
                          <span className="text-slate-400">{new Date(n.timestamp).toLocaleString()}</span>
                        </div>
                        {n.notes && <p className="text-slate-600 text-[11px] mt-0.5">{n.notes}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-100">
              <button
                onClick={() => setViewPRDetails(null)}
                className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: REVISE PROPOSAL / COUNTER-PROPOSE */}
      {/* ======================================================== */}
      {negotiatePRTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">Revise Offer to Supplier</h3>
              <button onClick={() => setNegotiatePRTarget(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitRevisedOffer} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Revised Unit Price (₹) *</label>
                  <input
                    type="number"
                    min="1"
                    step="any"
                    required
                    value={reviseFormData.unit_price}
                    onChange={e => setReviseFormData({ ...reviseFormData, unit_price: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:ring-1 focus:ring-sky-500 font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Revised Quantity *</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={reviseFormData.quantity}
                    onChange={e => setReviseFormData({ ...reviseFormData, quantity: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:ring-1 focus:ring-sky-500 font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Target Delivery Date</label>
                <input
                  type="date"
                  value={reviseFormData.expected_delivery_date}
                  onChange={e => setReviseFormData({ ...reviseFormData, expected_delivery_date: e.target.value })}
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:ring-1 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Counter-Proposal Justification</label>
                <textarea
                  rows={2}
                  value={reviseFormData.notes}
                  onChange={e => setReviseFormData({ ...reviseFormData, notes: e.target.value })}
                  placeholder="Explain revised pricing or delivery timeline request..."
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:ring-1 focus:ring-sky-500"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setNegotiatePRTarget(null)}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-50"
                >
                  {isLoading ? 'Dispatching...' : 'Dispatch Revised Offer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
export default SuppliersPage;
