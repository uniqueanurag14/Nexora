import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
  Warehouse,
  WarehouseStockItem,
  WarehouseDashboardStats,
  StockTransfer,
  StockVerification,
  StockVerificationItem,
  InventoryItem,
} from '../types';
import {
  Warehouse as WarehouseIcon,
  Plus,
  Search,
  Filter,
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
  MapPin,
  ArrowRightLeft,
  ClipboardCheck,
  Package,
  Layers,
  TrendingUp,
  AlertTriangle,
  Clock,
  Check,
  Send,
  Boxes,
  ShieldCheck,
  FileText,
} from 'lucide-react';

interface WarehouseManagementPageProps {
  initialTab?: 'dashboard' | 'directory' | 'stock' | 'transfers' | 'stock-verification';
  onNavigate?: (route: string) => void;
}

export const WarehouseManagementPage: React.FC<WarehouseManagementPageProps> = ({
  initialTab = 'dashboard',
  onNavigate,
}) => {
  const { hasPermission } = useAuth();
  const [activeTab, setActiveTab] = useState<'dashboard' | 'directory' | 'stock' | 'transfers' | 'stock-verification'>(initialTab);

  // Synchronize initialTab prop if it changes
  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  // Global status/feedback
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');

  // Common Lookups
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);

  // Tab 1: Dashboard Stats
  const [dashboardStats, setDashboardStats] = useState<WarehouseDashboardStats | null>(null);

  // Tab 2: Directory State
  const [directorySearch, setDirectorySearch] = useState<string>('');
  const [isWarehouseModalOpen, setIsWarehouseModalOpen] = useState<boolean>(false);
  const [editWarehouse, setEditWarehouse] = useState<Warehouse | null>(null);
  const [warehouseFormData, setWarehouseFormData] = useState({
    code: '',
    name: '',
    address: '',
    contact_details: '',
    manager_name: '',
    manager_email: '',
    manager_phone: '',
    warehouse_type: 'Distribution Center' as 'Distribution Center' | 'Regional Hub' | 'Transit Depot' | 'Quarantine',
    capacity: 10000,
    is_active: true,
  });
  const [warehouseFormErrors, setWarehouseFormErrors] = useState<Record<string, string>>({});
  const [deleteWarehouseTarget, setDeleteWarehouseTarget] = useState<Warehouse | null>(null);
  const [viewWarehouseDetails, setViewWarehouseDetails] = useState<(Warehouse & { stock_items?: WarehouseStockItem[] }) | null>(null);

  // Tab 3: Stock State
  const [selectedStockWarehouseId, setSelectedStockWarehouseId] = useState<number | undefined>(undefined);
  const [stockSearch, setStockSearch] = useState<string>('');
  const [stockItems, setStockItems] = useState<WarehouseStockItem[]>([]);

  // Tab 4: Transfers State
  const [transfers, setTransfers] = useState<StockTransfer[]>([]);
  const [transferStatusFilter, setTransferStatusFilter] = useState<string>('all');
  const [transferSearch, setTransferSearch] = useState<string>('');
  const [isCreateTransferOpen, setIsCreateTransferOpen] = useState<boolean>(false);
  const [transferFormData, setTransferFormData] = useState({
    source_warehouse_id: 0,
    destination_warehouse_id: 0,
    item_id: 0,
    requested_quantity: 1,
    remarks: '',
  });
  const [transferFormErrors, setTransferFormErrors] = useState<Record<string, string>>({});
  const [receiveTransferModal, setReceiveTransferModal] = useState<StockTransfer | null>(null);
  const [receiveQuantity, setReceiveQuantity] = useState<number>(0);
  const [receiveRemarks, setReceiveRemarks] = useState<string>('');
  const [receiveDiscrepancyReason, setReceiveDiscrepancyReason] = useState<string>('');

  // Tab 5: Stock Verification State
  const [verifications, setVerifications] = useState<StockVerification[]>([]);
  const [verificationWarehouseFilter, setVerificationWarehouseFilter] = useState<number | undefined>(undefined);
  const [isCreateVerificationOpen, setIsCreateVerificationOpen] = useState<boolean>(false);
  const [selectedAuditWarehouseId, setSelectedAuditWarehouseId] = useState<number>(0);
  const [auditItemsList, setAuditItemsList] = useState<Array<{
    item_id: number;
    item_code: string;
    item_name: string;
    uom_symbol: string;
    system_quantity: number;
    physical_quantity: number;
    variance: number;
    discrepancy_reason: string;
  }>>([]);
  const [auditRemarks, setAuditRemarks] = useState<string>('');
  const [viewVerificationModal, setViewVerificationModal] = useState<StockVerification | null>(null);

  // Fetch Lookups
  const loadLookups = async () => {
    try {
      const [whRes, itemsRes] = await Promise.all([
        api.getWarehouses(),
        api.getItems({ page_size: 100 }),
      ]);
      if (whRes.success && whRes.data) {
        setWarehouses(whRes.data);
      }
      if (itemsRes.success && itemsRes.data) {
        setInventoryItems(itemsRes.data.items);
      }
    } catch (err: any) {
      console.warn('Lookup load note:', err);
    }
  };

  // Fetch Dashboard Stats
  const loadDashboard = async () => {
    setIsLoading(true);
    try {
      const res = await api.getWarehouseDashboardStats();
      if (res.success && res.data) {
        setDashboardStats(res.data);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to load dashboard metrics.');
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch Stock Balances
  const loadStock = async () => {
    setIsLoading(true);
    try {
      const res = await api.getWarehouseStock(selectedStockWarehouseId);
      if (res.success && res.data) {
        setStockItems(res.data);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to load warehouse stock balances.');
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch Transfers
  const loadTransfers = async () => {
    setIsLoading(true);
    try {
      const res = await api.getStockTransfers({
        status: transferStatusFilter !== 'all' ? transferStatusFilter : undefined,
        search: transferSearch.trim() || undefined,
      });
      if (res.success && res.data) {
        setTransfers(res.data);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to load stock transfers.');
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch Verifications
  const loadVerifications = async () => {
    setIsLoading(true);
    try {
      const res = await api.getStockVerifications({
        warehouse_id: verificationWarehouseFilter,
      });
      if (res.success && res.data) {
        setVerifications(res.data);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to load stock audit records.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadLookups();
  }, []);

  useEffect(() => {
    if (activeTab === 'dashboard') loadDashboard();
    if (activeTab === 'stock') loadStock();
    if (activeTab === 'transfers') loadTransfers();
    if (activeTab === 'stock-verification') loadVerifications();
  }, [activeTab, selectedStockWarehouseId, transferStatusFilter, verificationWarehouseFilter]);

  // Tab 2: Warehouse CRUD Handlers
  const handleOpenWarehouseModal = (wh?: Warehouse) => {
    setWarehouseFormErrors({});
    if (wh) {
      setEditWarehouse(wh);
      setWarehouseFormData({
        code: wh.code,
        name: wh.name,
        address: wh.address || '',
        contact_details: wh.contact_details || '',
        manager_name: wh.manager_name || '',
        manager_email: wh.manager_email || '',
        manager_phone: wh.manager_phone || '',
        warehouse_type: wh.warehouse_type || 'Distribution Center',
        capacity: wh.capacity || 10000,
        is_active: wh.is_active,
      });
    } else {
      setEditWarehouse(null);
      setWarehouseFormData({
        code: `WH-${String(warehouses.length + 1).padStart(2, '0')}`,
        name: '',
        address: '',
        contact_details: '',
        manager_name: '',
        manager_email: '',
        manager_phone: '',
        warehouse_type: 'Distribution Center',
        capacity: 10000,
        is_active: true,
      });
    }
    setIsWarehouseModalOpen(true);
  };

  const handleSaveWarehouse = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string> = {};
    if (!warehouseFormData.name.trim()) errors.name = 'Warehouse name is required.';
    if (!warehouseFormData.code.trim()) errors.code = 'Warehouse code is required.';
    if (warehouseFormData.manager_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(warehouseFormData.manager_email)) {
      errors.manager_email = 'Valid email address format required.';
    }
    if (Object.keys(errors).length > 0) {
      setWarehouseFormErrors(errors);
      return;
    }

    setIsLoading(true);
    try {
      if (editWarehouse) {
        const res = await api.updateWarehouse(editWarehouse.id, warehouseFormData);
        if (res.success) {
          setSuccessMsg(`Warehouse '${warehouseFormData.name}' updated successfully.`);
          setIsWarehouseModalOpen(false);
          loadLookups();
        } else {
          setErrorMsg(res.message || 'Failed to update warehouse.');
        }
      } else {
        const res = await api.createWarehouse(warehouseFormData);
        if (res.success) {
          setSuccessMsg(`Warehouse '${warehouseFormData.name}' created successfully.`);
          setIsWarehouseModalOpen(false);
          loadLookups();
        } else {
          setErrorMsg(res.message || 'Failed to create warehouse.');
        }
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Server error.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteWarehouse = async (forceDisable = false) => {
    if (!deleteWarehouseTarget) return;
    setIsLoading(true);
    try {
      const res = await api.deleteWarehouse(deleteWarehouseTarget.id, forceDisable);
      if (res.success) {
        setSuccessMsg(res.message);
        setDeleteWarehouseTarget(null);
        loadLookups();
      } else {
        setErrorMsg(res.message);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to delete warehouse.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleViewWarehouseStock = async (wh: Warehouse) => {
    try {
      const res = await api.getWarehouse(wh.id);
      if (res.success && res.data) {
        setViewWarehouseDetails(res.data);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to load warehouse stock details.');
    }
  };

  // Tab 4: Transfers Handlers
  const handleOpenCreateTransfer = () => {
    setTransferFormErrors({});
    setTransferFormData({
      source_warehouse_id: warehouses[0]?.id || 0,
      destination_warehouse_id: warehouses[1]?.id || (warehouses[0]?.id || 0),
      item_id: inventoryItems[0]?.id || 0,
      requested_quantity: 1,
      remarks: '',
    });
    setIsCreateTransferOpen(true);
  };

  const handleSaveTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string> = {};
    if (!transferFormData.source_warehouse_id) errors.source_warehouse_id = 'Source warehouse is required.';
    if (!transferFormData.destination_warehouse_id) errors.destination_warehouse_id = 'Destination warehouse is required.';
    if (transferFormData.source_warehouse_id === transferFormData.destination_warehouse_id) {
      errors.destination_warehouse_id = 'Destination must be different from source warehouse.';
    }
    if (!transferFormData.item_id) errors.item_id = 'Item to transfer is required.';
    if (!transferFormData.requested_quantity || transferFormData.requested_quantity <= 0) {
      errors.requested_quantity = 'Quantity must be greater than 0.';
    }
    if (Object.keys(errors).length > 0) {
      setTransferFormErrors(errors);
      return;
    }

    setIsLoading(true);
    try {
      const res = await api.createStockTransfer(transferFormData);
      if (res.success) {
        setSuccessMsg(`Transfer request ${res.data?.transfer_no} submitted for authorization.`);
        setIsCreateTransferOpen(false);
        loadTransfers();
      } else {
        setErrorMsg(res.message || 'Failed to create transfer request.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Transfer creation error.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleApproveTransfer = async (id: number) => {
    setIsLoading(true);
    try {
      const res = await api.approveStockTransfer(id);
      if (res.success) {
        setSuccessMsg(`Transfer approved.`);
        loadTransfers();
      } else {
        setErrorMsg(res.message || 'Approval failed.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Approval failed.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDispatchTransfer = async (id: number) => {
    setIsLoading(true);
    try {
      const res = await api.dispatchStockTransfer(id);
      if (res.success) {
        setSuccessMsg(`Transfer dispatched in-transit. Source stock reduced. Destination stock will update only upon confirmed physical receipt.`);
        loadTransfers();
      } else {
        setErrorMsg(res.message || 'Dispatch failed.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Dispatch failed.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenReceiveModal = (tr: StockTransfer) => {
    setReceiveTransferModal(tr);
    setReceiveQuantity(tr.requested_quantity);
    setReceiveRemarks('');
    setReceiveDiscrepancyReason('');
  };

  const handleConfirmReceiveTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!receiveTransferModal) return;
    if (receiveQuantity <= 0) {
      setErrorMsg('Received quantity must be greater than 0.');
      return;
    }
    if (receiveQuantity < receiveTransferModal.requested_quantity && !receiveDiscrepancyReason.trim()) {
      setErrorMsg('A discrepancy reason is required when received quantity is less than requested quantity.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await api.receiveStockTransfer(receiveTransferModal.id, {
        received_quantity: receiveQuantity,
        remarks: receiveRemarks,
        discrepancy_reason: receiveDiscrepancyReason,
      });
      if (res.success) {
        setSuccessMsg(`Transfer ${res.data?.transfer_no} confirmed. Destination warehouse inventory increased by ${receiveQuantity} units.`);
        setReceiveTransferModal(null);
        loadTransfers();
      } else {
        setErrorMsg(res.message || 'Receive confirmation failed.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Receive confirmation error.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelTransfer = async (id: number) => {
    if (!window.confirm('Are you sure you want to cancel this transfer?')) return;
    setIsLoading(true);
    try {
      const res = await api.cancelStockTransfer(id);
      if (res.success) {
        setSuccessMsg('Transfer cancelled.');
        loadTransfers();
      } else {
        setErrorMsg(res.message || 'Cancel failed.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Cancel failed.');
    } finally {
      setIsLoading(false);
    }
  };

  // Tab 5: Stock Verification Handlers
  const handleOpenCreateVerification = async () => {
    const targetWhId = warehouses[0]?.id || 0;
    setSelectedAuditWarehouseId(targetWhId);
    setAuditRemarks('');
    await prepareAuditItems(targetWhId);
    setIsCreateVerificationOpen(true);
  };

  const prepareAuditItems = async (whId: number) => {
    try {
      const res = await api.getWarehouseStock(whId);
      const stockMap = new Map<number, number>();
      if (res.success && res.data) {
        res.data.forEach(s => stockMap.set(s.item_id, s.available_quantity));
      }
      const list = inventoryItems.map(item => {
        const sysQty = stockMap.get(item.id) || 0;
        return {
          item_id: item.id,
          item_code: item.code,
          item_name: item.name,
          uom_symbol: item.uom_symbol || 'Units',
          system_quantity: sysQty,
          physical_quantity: sysQty,
          variance: 0,
          discrepancy_reason: '',
        };
      });
      setAuditItemsList(list);
    } catch (err) {
      console.warn('Error fetching audit items', err);
    }
  };

  const handleAuditQuantityChange = (idx: number, physicalQty: number) => {
    setAuditItemsList(prev => {
      const copy = [...prev];
      const item = { ...copy[idx] };
      item.physical_quantity = physicalQty;
      item.variance = physicalQty - item.system_quantity;
      copy[idx] = item;
      return copy;
    });
  };

  const handleAuditDiscrepancyReasonChange = (idx: number, reason: string) => {
    setAuditItemsList(prev => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], discrepancy_reason: reason };
      return copy;
    });
  };

  const handleSaveVerification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAuditWarehouseId) {
      setErrorMsg('Warehouse selection required.');
      return;
    }
    const hasUnexplainedVariance = auditItemsList.some(i => i.variance !== 0 && !i.discrepancy_reason.trim());
    if (hasUnexplainedVariance) {
      setErrorMsg('Please specify a discrepancy reason for any item where physical count differs from system count.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await api.createStockVerification({
        warehouse_id: selectedAuditWarehouseId,
        items: auditItemsList.map(i => ({
          item_id: i.item_id,
          physical_quantity: i.physical_quantity,
          discrepancy_reason: i.discrepancy_reason || undefined,
        })),
        remarks: auditRemarks,
      });
      if (res.success) {
        setSuccessMsg(`Physical verification audit ${res.data?.verification_no} submitted for supervisor approval.`);
        setIsCreateVerificationOpen(false);
        loadVerifications();
      } else {
        setErrorMsg(res.message || 'Failed to submit verification session.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Audit submission failed.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleApproveVerification = async (id: number) => {
    if (!window.confirm('Authorizing this audit will permanently adjust system inventory balances to the verified physical counts. Proceed?')) return;
    setIsLoading(true);
    try {
      const res = await api.approveStockVerification(id);
      if (res.success) {
        setSuccessMsg(`Verification ${res.data?.verification_no} approved. Inventory adjusted with traceable transactions.`);
        loadVerifications();
      } else {
        setErrorMsg(res.message || 'Authorization failed.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Authorization failed.');
    } finally {
      setIsLoading(false);
    }
  };

  // Filtered views
  const filteredWarehouses = warehouses.filter(wh =>
    wh.name.toLowerCase().includes(directorySearch.toLowerCase()) ||
    wh.code.toLowerCase().includes(directorySearch.toLowerCase()) ||
    (wh.manager_name && wh.manager_name.toLowerCase().includes(directorySearch.toLowerCase()))
  );

  const filteredStock = stockItems.filter(s =>
    s.item_name.toLowerCase().includes(stockSearch.toLowerCase()) ||
    s.item_code.toLowerCase().includes(stockSearch.toLowerCase()) ||
    s.warehouse_name.toLowerCase().includes(stockSearch.toLowerCase())
  );

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Header & Navigation Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Warehouse Management
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Storage facilities, stock levels, controlled inter-warehouse transfers, and physical stock audits
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200 flex-wrap">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              activeTab === 'dashboard'
                ? 'bg-white text-sky-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Dashboard
          </button>
          <button
            onClick={() => setActiveTab('directory')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              activeTab === 'directory'
                ? 'bg-white text-sky-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Directory
          </button>
          <button
            onClick={() => setActiveTab('stock')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              activeTab === 'stock'
                ? 'bg-white text-sky-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Warehouse Stock
          </button>
          <button
            onClick={() => setActiveTab('transfers')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              activeTab === 'transfers'
                ? 'bg-white text-sky-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Transfers
          </button>
          <button
            onClick={() => setActiveTab('stock-verification')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              activeTab === 'stock-verification'
                ? 'bg-white text-sky-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Stock Verification
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
      {/* TAB 1: DASHBOARD OVERVIEW */}
      {/* ======================================================== */}
      {activeTab === 'dashboard' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Facilities</span>
                <div className="p-2 bg-sky-50 rounded-lg">
                  <WarehouseIcon className="w-4 h-4 text-sky-600" />
                </div>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-slate-900">{dashboardStats?.total_warehouses ?? warehouses.length}</span>
                <span className="text-xs text-emerald-600 font-medium">({dashboardStats?.active_warehouses ?? warehouses.filter(w=>w.is_active).length} Active)</span>
              </div>
              <p className="mt-1 text-xs text-slate-400">Total registered warehouse depots</p>
            </div>

            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Inventory Valuation</span>
                <div className="p-2 bg-emerald-50 rounded-lg">
                  <TrendingUp className="w-4 h-4 text-emerald-600" />
                </div>
              </div>
              <div className="mt-3">
                <span className="text-2xl font-bold text-slate-900">₹{(dashboardStats?.total_valuation || 0).toLocaleString()}</span>
              </div>
              <p className="mt-1 text-xs text-slate-400">{dashboardStats?.total_stock_units || 0} total units held across depots</p>
            </div>

            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Active Transfers</span>
                <div className="p-2 bg-amber-50 rounded-lg">
                  <ArrowRightLeft className="w-4 h-4 text-amber-600" />
                </div>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-slate-900">{dashboardStats?.active_transfers || 0}</span>
                <span className="text-xs text-amber-600 font-medium">({dashboardStats?.in_transit_transfers || 0} In-Transit)</span>
              </div>
              <p className="mt-1 text-xs text-slate-400">Controlled inter-facility stock movements</p>
            </div>

            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Stock Audits</span>
                <div className="p-2 bg-indigo-50 rounded-lg">
                  <ClipboardCheck className="w-4 h-4 text-indigo-600" />
                </div>
              </div>
              <div className="mt-3">
                <span className="text-2xl font-bold text-slate-900">{dashboardStats?.pending_verifications || 0}</span>
              </div>
              <p className="mt-1 text-xs text-slate-400">Pending supervisor verification & approval</p>
            </div>
          </div>

          {/* Quick Actions Panel */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
            <h2 className="text-sm font-semibold text-slate-900 mb-3">Warehouse Operations Direct Access</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                onClick={() => setActiveTab('directory')}
                className="p-3.5 rounded-lg border border-slate-200 hover:border-sky-300 hover:bg-sky-50/40 text-left transition-all"
              >
                <div className="font-semibold text-xs text-slate-900 flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-sky-600" />
                  Facility Directory
                </div>
                <p className="text-xs text-slate-500 mt-1">Manage locations, storage types, capacity & manager assignments</p>
              </button>

              <button
                onClick={() => setActiveTab('transfers')}
                className="p-3.5 rounded-lg border border-slate-200 hover:border-sky-300 hover:bg-sky-50/40 text-left transition-all"
              >
                <div className="font-semibold text-xs text-slate-900 flex items-center gap-2">
                  <ArrowRightLeft className="w-4 h-4 text-amber-600" />
                  Stock Transfers
                </div>
                <p className="text-xs text-slate-500 mt-1">Request, authorize, dispatch, and confirm physical transfer receipts</p>
              </button>

              <button
                onClick={() => setActiveTab('stock-verification')}
                className="p-3.5 rounded-lg border border-slate-200 hover:border-sky-300 hover:bg-sky-50/40 text-left transition-all"
              >
                <div className="font-semibold text-xs text-slate-900 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-indigo-600" />
                  Physical Stock Audit
                </div>
                <p className="text-xs text-slate-500 mt-1">Record physical counts, compute live variance, adjust system ledger</p>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 2: WAREHOUSE DIRECTORY */}
      {/* ======================================================== */}
      {activeTab === 'directory' && (
        <div className="space-y-4">
          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
            <div className="relative w-full md:w-80">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search warehouse code, name, manager..."
                value={directorySearch}
                onChange={e => setDirectorySearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </div>

            <button
              onClick={() => handleOpenWarehouseModal()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-sky-600 text-white hover:bg-sky-700 transition-colors shadow-xs whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Warehouse
            </button>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Warehouse Code</th>
                    <th className="py-3 px-4">Name & Address</th>
                    <th className="py-3 px-4">Facility Type</th>
                    <th className="py-3 px-4">Manager Contact</th>
                    <th className="py-3 px-4">Storage Capacity</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredWarehouses.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400">
                        No warehouses found.
                      </td>
                    </tr>
                  ) : (
                    filteredWarehouses.map(wh => (
                      <tr key={wh.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-sky-700">{wh.code}</td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-900">{wh.name}</div>
                          <div className="text-slate-400 text-[11px] flex items-center gap-1 mt-0.5">
                            <MapPin className="w-3 h-3 shrink-0" />
                            {wh.address || 'Address unassigned'}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
                            {wh.warehouse_type || 'Distribution Center'}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="text-slate-900 font-medium">{wh.manager_name || 'Unassigned'}</div>
                          {wh.manager_email && (
                            <div className="text-slate-400 text-[11px] flex items-center gap-1">
                              <Mail className="w-3 h-3" />
                              {wh.manager_email}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 font-medium text-slate-700">
                          {wh.capacity ? `${wh.capacity.toLocaleString()} units` : 'Unspecified'}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${
                            wh.is_active
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-rose-50 text-rose-700 border border-rose-200'
                          }`}>
                            {wh.is_active ? 'Active' : 'Disabled'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              onClick={() => handleViewWarehouseStock(wh)}
                              title="View Facility Stock"
                              className="p-1 text-slate-400 hover:text-sky-600 rounded"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleOpenWarehouseModal(wh)}
                              title="Edit Warehouse"
                              className="p-1 text-slate-400 hover:text-slate-700 rounded"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setDeleteWarehouseTarget(wh)}
                              title="Delete/Disable Warehouse"
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
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 3: WAREHOUSE STOCK BALANCES */}
      {/* ======================================================== */}
      {activeTab === 'stock' && (
        <div className="space-y-4">
          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-3 w-full md:w-auto">
              <label className="text-xs font-semibold text-slate-700 whitespace-nowrap">Filter Warehouse:</label>
              <select
                value={selectedStockWarehouseId || ''}
                onChange={e => setSelectedStockWarehouseId(e.target.value ? parseInt(e.target.value, 10) : undefined)}
                className="py-1.5 px-3 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-sky-500"
              >
                <option value="">All Warehouses</option>
                {warehouses.map(w => (
                  <option key={w.id} value={w.id}>{w.code} - {w.name}</option>
                ))}
              </select>
            </div>

            <div className="relative w-full md:w-72">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search item SKU, item name..."
                value={stockSearch}
                onChange={e => setStockSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Warehouse</th>
                    <th className="py-3 px-4">Item Code</th>
                    <th className="py-3 px-4">Item Name</th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4 text-right">Available Qty</th>
                    <th className="py-3 px-4 text-right">Min Stock</th>
                    <th className="py-3 px-4 text-right">Unit Cost</th>
                    <th className="py-3 px-4 text-right">Valuation</th>
                    <th className="py-3 px-4">Stock Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredStock.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-slate-400">
                        No stock records found for this selection.
                      </td>
                    </tr>
                  ) : (
                    filteredStock.map((s, idx) => (
                      <tr key={`${s.warehouse_id}-${s.item_id}-${idx}`} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-4 font-semibold text-slate-900">
                          {s.warehouse_name} <span className="text-slate-400 text-[11px]">({s.warehouse_code})</span>
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-sky-700">{s.item_code}</td>
                        <td className="py-3 px-4 text-slate-800 font-medium">{s.item_name}</td>
                        <td className="py-3 px-4 text-slate-500">{s.category_name}</td>
                        <td className="py-3 px-4 text-right font-bold text-slate-900">
                          {s.available_quantity} <span className="text-[11px] font-normal text-slate-500">{s.uom_symbol}</span>
                        </td>
                        <td className="py-3 px-4 text-right text-slate-500">{s.min_stock_level}</td>
                        <td className="py-3 px-4 text-right text-slate-600">₹{s.unit_cost.toLocaleString()}</td>
                        <td className="py-3 px-4 text-right font-semibold text-slate-900">₹{s.valuation.toLocaleString()}</td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${
                            s.stock_status === 'Adequate'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : s.stock_status === 'Low Stock'
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : 'bg-rose-50 text-rose-700 border border-rose-200'
                          }`}>
                            {s.stock_status}
                          </span>
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
      {/* TAB 4: WAREHOUSE STOCK TRANSFERS */}
      {/* ======================================================== */}
      {activeTab === 'transfers' && (
        <div className="space-y-4">
          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-3 w-full md:w-auto">
              <label className="text-xs font-semibold text-slate-700 whitespace-nowrap">Filter Status:</label>
              <select
                value={transferStatusFilter}
                onChange={e => setTransferStatusFilter(e.target.value)}
                className="py-1.5 px-3 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-sky-500"
              >
                <option value="all">All Statuses</option>
                <option value="pending_approval">Pending Approval</option>
                <option value="approved">Approved (Awaiting Dispatch)</option>
                <option value="in_transit">In-Transit</option>
                <option value="received">Received</option>
                <option value="partially_received">Partially Received</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>

            <div className="flex items-center gap-2.5 w-full md:w-auto">
              <div className="relative w-full md:w-64">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search transfer #, SKU..."
                  value={transferSearch}
                  onChange={e => setTransferSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
              </div>

              <button
                onClick={handleOpenCreateTransfer}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-sky-600 text-white hover:bg-sky-700 transition-colors shadow-xs whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                New Transfer
              </button>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Transfer #</th>
                    <th className="py-3 px-4">Source Depot</th>
                    <th className="py-3 px-4">Destination Depot</th>
                    <th className="py-3 px-4">Item Transferred</th>
                    <th className="py-3 px-4 text-right">Requested Qty</th>
                    <th className="py-3 px-4 text-right">Received Qty</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Workflow Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {transfers.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400">
                        No stock transfers recorded.
                      </td>
                    </tr>
                  ) : (
                    transfers.map(tr => (
                      <tr key={tr.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-sky-700">{tr.transfer_no}</td>
                        <td className="py-3 px-4 text-slate-800 font-medium">
                          {tr.source_warehouse_name}
                          <div className="text-slate-400 text-[11px] font-mono">{tr.source_warehouse_code}</div>
                        </td>
                        <td className="py-3 px-4 text-slate-800 font-medium">
                          {tr.destination_warehouse_name}
                          <div className="text-slate-400 text-[11px] font-mono">{tr.destination_warehouse_code}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-900">{tr.item_name}</div>
                          <div className="text-slate-400 text-[11px] font-mono">{tr.item_code}</div>
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-slate-900">{tr.requested_quantity}</td>
                        <td className="py-3 px-4 text-right font-medium text-slate-700">{tr.received_quantity || 0}</td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${
                            tr.status === 'received'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : tr.status === 'in_transit'
                              ? 'bg-sky-50 text-sky-700 border border-sky-200'
                              : tr.status === 'approved'
                              ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                              : tr.status === 'partially_received'
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : tr.status === 'cancelled'
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : 'bg-slate-100 text-slate-700 border border-slate-200'
                          }`}>
                            {tr.status.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="inline-flex items-center gap-1.5 justify-end">
                            {tr.status === 'pending_approval' && (
                              <>
                                <button
                                  onClick={() => handleApproveTransfer(tr.id)}
                                  className="px-2.5 py-1 text-[11px] font-semibold rounded bg-sky-600 text-white hover:bg-sky-700"
                                >
                                  Authorize
                                </button>
                                <button
                                  onClick={() => handleCancelTransfer(tr.id)}
                                  className="px-2.5 py-1 text-[11px] font-semibold rounded border border-rose-300 text-rose-700 hover:bg-rose-50"
                                >
                                  Cancel
                                </button>
                              </>
                            )}

                            {tr.status === 'approved' && (
                              <button
                                onClick={() => handleDispatchTransfer(tr.id)}
                                className="px-2.5 py-1 text-[11px] font-semibold rounded bg-amber-600 text-white hover:bg-amber-700"
                              >
                                Dispatch
                              </button>
                            )}

                            {tr.status === 'in_transit' && (
                              <button
                                onClick={() => handleOpenReceiveModal(tr)}
                                className="px-2.5 py-1 text-[11px] font-semibold rounded bg-emerald-600 text-white hover:bg-emerald-700"
                              >
                                Confirm Receipt
                              </button>
                            )}
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
      {/* TAB 5: PHYSICAL STOCK VERIFICATION */}
      {/* ======================================================== */}
      {activeTab === 'stock-verification' && (
        <div className="space-y-4">
          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-3 w-full md:w-auto">
              <label className="text-xs font-semibold text-slate-700 whitespace-nowrap">Filter Audit Facility:</label>
              <select
                value={verificationWarehouseFilter || ''}
                onChange={e => setVerificationWarehouseFilter(e.target.value ? parseInt(e.target.value, 10) : undefined)}
                className="py-1.5 px-3 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-sky-500"
              >
                <option value="">All Warehouses</option>
                {warehouses.map(w => (
                  <option key={w.id} value={w.id}>{w.code} - {w.name}</option>
                ))}
              </select>
            </div>

            <button
              onClick={handleOpenCreateVerification}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-sky-600 text-white hover:bg-sky-700 transition-colors shadow-xs whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              New Physical Audit Session
            </button>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Audit Session #</th>
                    <th className="py-3 px-4">Audited Facility</th>
                    <th className="py-3 px-4">Audit Date</th>
                    <th className="py-3 px-4 text-center">Items Audited</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Auditor / Approver</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {verifications.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400">
                        No physical stock verification sessions recorded.
                      </td>
                    </tr>
                  ) : (
                    verifications.map(v => (
                      <tr key={v.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-sky-700">{v.verification_no}</td>
                        <td className="py-3 px-4 font-semibold text-slate-900">
                          {v.warehouse_name} <span className="text-slate-400 text-[11px]">({v.warehouse_code})</span>
                        </td>
                        <td className="py-3 px-4 text-slate-600">
                          {v.verified_date ? v.verified_date.split('T')[0] : 'N/A'}
                        </td>
                        <td className="py-3 px-4 text-center font-bold text-slate-800">
                          {v.items?.length || 0}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${
                            v.status === 'approved'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : v.status === 'submitted'
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : 'bg-slate-100 text-slate-700 border border-slate-200'
                          }`}>
                            {v.status.toUpperCase()}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-500">
                          <div>Auditor: {v.created_by_name || `User #${v.created_by}`}</div>
                          {v.approved_by && (
                            <div className="text-emerald-700 font-medium text-[11px]">Approved: User #{v.approved_by}</div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              onClick={() => setViewVerificationModal(v)}
                              className="px-2.5 py-1 text-[11px] font-semibold rounded border border-slate-300 text-slate-700 hover:bg-slate-50"
                            >
                              Inspect Details
                            </button>
                            {v.status === 'submitted' && (
                              <button
                                onClick={() => handleApproveVerification(v.id)}
                                className="px-2.5 py-1 text-[11px] font-semibold rounded bg-emerald-600 text-white hover:bg-emerald-700"
                              >
                                Authorize & Adjust
                              </button>
                            )}
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
      {/* MODAL: CREATE / EDIT WAREHOUSE */}
      {/* ======================================================== */}
      {isWarehouseModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">
                {editWarehouse ? 'Edit Warehouse Depot' : 'Register New Storage Warehouse'}
              </h3>
              <button onClick={() => setIsWarehouseModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveWarehouse} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Facility Code *</label>
                  <input
                    type="text"
                    required
                    value={warehouseFormData.code}
                    onChange={e => setWarehouseFormData({ ...warehouseFormData, code: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-sky-500 font-mono"
                  />
                  {warehouseFormErrors.code && <p className="text-[11px] text-rose-500 mt-0.5">{warehouseFormErrors.code}</p>}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Facility Name *</label>
                  <input
                    type="text"
                    required
                    value={warehouseFormData.name}
                    onChange={e => setWarehouseFormData({ ...warehouseFormData, name: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                  {warehouseFormErrors.name && <p className="text-[11px] text-rose-500 mt-0.5">{warehouseFormErrors.name}</p>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Facility Type</label>
                  <select
                    value={warehouseFormData.warehouse_type}
                    onChange={e => setWarehouseFormData({ ...warehouseFormData, warehouse_type: e.target.value as any })}
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  >
                    <option value="Distribution Center">Distribution Center</option>
                    <option value="Regional Hub">Regional Hub</option>
                    <option value="Transit Depot">Transit Depot</option>
                    <option value="Quarantine">Quarantine Facility</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Max Capacity (Units)</label>
                  <input
                    type="number"
                    min="1"
                    value={warehouseFormData.capacity}
                    onChange={e => setWarehouseFormData({ ...warehouseFormData, capacity: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Physical Address</label>
                <input
                  type="text"
                  placeholder="Street address, city, state, postal code"
                  value={warehouseFormData.address}
                  onChange={e => setWarehouseFormData({ ...warehouseFormData, address: e.target.value })}
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
              </div>

              <div className="border-t border-slate-100 pt-2 grid grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Manager Name</label>
                  <input
                    type="text"
                    value={warehouseFormData.manager_name}
                    onChange={e => setWarehouseFormData({ ...warehouseFormData, manager_name: e.target.value })}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Manager Email</label>
                  <input
                    type="email"
                    value={warehouseFormData.manager_email}
                    onChange={e => setWarehouseFormData({ ...warehouseFormData, manager_email: e.target.value })}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Manager Phone</label>
                  <input
                    type="text"
                    value={warehouseFormData.manager_phone}
                    onChange={e => setWarehouseFormData({ ...warehouseFormData, manager_phone: e.target.value })}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="wh_is_active"
                  checked={warehouseFormData.is_active}
                  onChange={e => setWarehouseFormData({ ...warehouseFormData, is_active: e.target.checked })}
                  className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                />
                <label htmlFor="wh_is_active" className="text-xs text-slate-700 font-medium">Facility is Active</label>
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsWarehouseModalOpen(false)}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-50"
                >
                  {isLoading ? 'Saving...' : 'Save Warehouse'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: DELETE / DISABLE WAREHOUSE NOTICE */}
      {/* ======================================================== */}
      {deleteWarehouseTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-3 text-amber-600">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h3 className="text-base font-bold text-slate-900">Decommission Warehouse</h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to remove or disable warehouse <strong className="text-slate-900">{deleteWarehouseTarget.name}</strong> ({deleteWarehouseTarget.code})?
            </p>
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-800 space-y-1">
              <p className="font-semibold">Enterprise Protection Rule:</p>
              <p>A warehouse holding inventory cannot be permanently deleted. If stock balances exist, you must first transfer out or issue all remaining units, or disable the facility instead.</p>
            </div>
            <div className="flex justify-end gap-2.5 pt-3">
              <button
                type="button"
                onClick={() => setDeleteWarehouseTarget(null)}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
              >
                Abort
              </button>
              <button
                type="button"
                onClick={() => handleDeleteWarehouse(true)}
                className="px-3.5 py-1.5 text-xs font-semibold rounded-lg border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
              >
                Disable Facility
              </button>
              <button
                type="button"
                onClick={() => handleDeleteWarehouse(false)}
                className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-rose-600 text-white hover:bg-rose-700"
              >
                Permanently Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: VIEW FACILITY STOCK BREAKDOWN */}
      {/* ======================================================== */}
      {viewWarehouseDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full p-6 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">{viewWarehouseDetails.name}</h3>
                <p className="text-xs text-slate-400 font-mono mt-0.5">{viewWarehouseDetails.code} • {viewWarehouseDetails.warehouse_type || 'Depot'}</p>
              </div>
              <button onClick={() => setViewWarehouseDetails(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold uppercase">
                  <tr>
                    <th className="py-2.5 px-3">SKU</th>
                    <th className="py-2.5 px-3">Item Name</th>
                    <th className="py-2.5 px-3 text-right">Available Qty</th>
                    <th className="py-2.5 px-3 text-right">Valuation</th>
                    <th className="py-2.5 px-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(!viewWarehouseDetails.stock_items || viewWarehouseDetails.stock_items.length === 0) ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-400">
                        Zero stock units held in this facility.
                      </td>
                    </tr>
                  ) : (
                    viewWarehouseDetails.stock_items.map((it, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/70">
                        <td className="py-2 px-3 font-mono font-bold text-sky-700">{it.item_code}</td>
                        <td className="py-2 px-3 text-slate-900 font-medium">{it.item_name}</td>
                        <td className="py-2 px-3 text-right font-bold text-slate-900">{it.available_quantity} {it.uom_symbol}</td>
                        <td className="py-2 px-3 text-right text-slate-700">₹{it.valuation.toLocaleString()}</td>
                        <td className="py-2 px-3">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium ${
                            it.stock_status === 'Adequate' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                          }`}>
                            {it.stock_status}
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
                onClick={() => setViewWarehouseDetails(null)}
                className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: CREATE STOCK TRANSFER REQUEST */}
      {/* ======================================================== */}
      {isCreateTransferOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">Initiate Inter-Warehouse Transfer</h3>
              <button onClick={() => setIsCreateTransferOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveTransfer} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Source Facility *</label>
                  <select
                    value={transferFormData.source_warehouse_id}
                    onChange={e => setTransferFormData({ ...transferFormData, source_warehouse_id: parseInt(e.target.value, 10) })}
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  >
                    {warehouses.map(w => (
                      <option key={w.id} value={w.id}>{w.code} - {w.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Destination Facility *</label>
                  <select
                    value={transferFormData.destination_warehouse_id}
                    onChange={e => setTransferFormData({ ...transferFormData, destination_warehouse_id: parseInt(e.target.value, 10) })}
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  >
                    {warehouses.map(w => (
                      <option key={w.id} value={w.id}>{w.code} - {w.name}</option>
                    ))}
                  </select>
                  {transferFormErrors.destination_warehouse_id && (
                    <p className="text-[11px] text-rose-500 mt-0.5">{transferFormErrors.destination_warehouse_id}</p>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Item to Transfer *</label>
                <select
                  value={transferFormData.item_id}
                  onChange={e => setTransferFormData({ ...transferFormData, item_id: parseInt(e.target.value, 10) })}
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-sky-500"
                >
                  {inventoryItems.map(it => (
                    <option key={it.id} value={it.id}>{it.code} - {it.name} (On-hand: {it.total_on_hand})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Requested Transfer Quantity *</label>
                <input
                  type="number"
                  min="1"
                  required
                  value={transferFormData.requested_quantity}
                  onChange={e => setTransferFormData({ ...transferFormData, requested_quantity: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Transfer Remarks / Justification</label>
                <textarea
                  rows={2}
                  value={transferFormData.remarks}
                  onChange={e => setTransferFormData({ ...transferFormData, remarks: e.target.value })}
                  placeholder="Reason for movement, vehicle reference, consignment notes..."
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
              </div>

              <div className="p-3 bg-sky-50 border border-sky-100 rounded-lg text-[11px] text-sky-800">
                <strong>Lifecycle Notice:</strong> Submitting creates a pending transfer request. When dispatched, stock is deducted from the source depot. Stock is only incremented at the destination upon verified receipt.
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCreateTransferOpen(false)}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-50"
                >
                  {isLoading ? 'Submitting...' : 'Submit Transfer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: CONFIRM RECEIPT OF TRANSFER */}
      {/* ======================================================== */}
      {receiveTransferModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Confirm Physical Goods Receipt</h3>
                <p className="text-xs text-slate-400 font-mono mt-0.5">{receiveTransferModal.transfer_no}</p>
              </div>
              <button onClick={() => setReceiveTransferModal(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmReceiveTransfer} className="space-y-3.5">
              <div className="p-3 bg-slate-50 rounded-lg text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">Destination Facility:</span>
                  <span className="font-semibold text-slate-900">{receiveTransferModal.destination_warehouse_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Item:</span>
                  <span className="font-semibold text-slate-900">{receiveTransferModal.item_name} ({receiveTransferModal.item_code})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Dispatched Quantity:</span>
                  <span className="font-bold text-sky-700">{receiveTransferModal.requested_quantity}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Confirmed Received Quantity *</label>
                <input
                  type="number"
                  min="0.1"
                  step="any"
                  required
                  value={receiveQuantity}
                  onChange={e => setReceiveQuantity(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-sky-500 font-bold"
                />
              </div>

              {receiveQuantity < receiveTransferModal.requested_quantity && (
                <div>
                  <label className="block text-xs font-semibold text-rose-700 mb-1">Discrepancy / Shortage Reason *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. In-transit breakage, 2 units missing from pallet..."
                    value={receiveDiscrepancyReason}
                    onChange={e => setReceiveDiscrepancyReason(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-rose-300 focus:outline-none focus:ring-1 focus:ring-rose-500 text-rose-900"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Receipt Remarks</label>
                <textarea
                  rows={2}
                  value={receiveRemarks}
                  onChange={e => setReceiveRemarks(e.target.value)}
                  placeholder="Gate pass number, delivery note confirmation..."
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setReceiveTransferModal(null)}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {isLoading ? 'Processing...' : 'Accept Receipt & Credit Stock'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: CREATE PHYSICAL STOCK VERIFICATION SESSION */}
      {/* ======================================================== */}
      {isCreateVerificationOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full p-6 space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Controlled Physical Stock Audit</h3>
                <p className="text-xs text-slate-400 mt-0.5">Enter counted stock to compute live ledger variance before supervisor approval</p>
              </div>
              <button onClick={() => setIsCreateVerificationOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex items-center gap-3">
              <label className="text-xs font-semibold text-slate-700">Audit Depot Facility:</label>
              <select
                value={selectedAuditWarehouseId}
                onChange={async e => {
                  const val = parseInt(e.target.value, 10);
                  setSelectedAuditWarehouseId(val);
                  await prepareAuditItems(val);
                }}
                className="py-1.5 px-3 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-sky-500 font-semibold text-slate-900"
              >
                {warehouses.map(w => (
                  <option key={w.id} value={w.id}>{w.code} - {w.name}</option>
                ))}
              </select>
            </div>

            <div className="overflow-y-auto flex-1 border border-slate-200 rounded-lg">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold uppercase sticky top-0">
                  <tr>
                    <th className="py-2.5 px-3">SKU</th>
                    <th className="py-2.5 px-3">Item Name</th>
                    <th className="py-2.5 px-3 text-right">System Qty</th>
                    <th className="py-2.5 px-3 text-right">Physical Count</th>
                    <th className="py-2.5 px-3 text-right">Variance</th>
                    <th className="py-2.5 px-3">Discrepancy Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {auditItemsList.map((item, idx) => (
                    <tr key={item.item_id} className="hover:bg-slate-50/70">
                      <td className="py-2 px-3 font-mono font-bold text-sky-700">{item.item_code}</td>
                      <td className="py-2 px-3 text-slate-900 font-medium">{item.item_name}</td>
                      <td className="py-2 px-3 text-right font-medium text-slate-700">{item.system_quantity}</td>
                      <td className="py-2 px-3 text-right">
                        <input
                          type="number"
                          min="0"
                          value={item.physical_quantity}
                          onChange={e => handleAuditQuantityChange(idx, parseFloat(e.target.value) || 0)}
                          className="w-20 px-2 py-1 text-xs text-right font-bold rounded border border-slate-300 focus:ring-1 focus:ring-sky-500"
                        />
                      </td>
                      <td className="py-2 px-3 text-right font-bold">
                        <span className={item.variance === 0 ? 'text-emerald-600' : item.variance > 0 ? 'text-sky-600' : 'text-rose-600'}>
                          {item.variance > 0 ? `+${item.variance}` : item.variance}
                        </span>
                      </td>
                      <td className="py-2 px-3">
                        {item.variance !== 0 ? (
                          <input
                            type="text"
                            required
                            placeholder="Reason for variance..."
                            value={item.discrepancy_reason}
                            onChange={e => handleAuditDiscrepancyReasonChange(idx, e.target.value)}
                            className="w-full px-2 py-1 text-xs rounded border border-rose-300 focus:ring-1 focus:ring-rose-500 text-rose-900"
                          />
                        ) : (
                          <span className="text-[11px] text-slate-400">Balanced</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Audit Notes / Executive Summary</label>
              <textarea
                rows={2}
                value={auditRemarks}
                onChange={e => setAuditRemarks(e.target.value)}
                placeholder="Audit conducted by internal inspection team, stock reconciliation session remarks..."
                className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </div>

            <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsCreateVerificationOpen(false)}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveVerification}
                disabled={isLoading}
                className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-50"
              >
                {isLoading ? 'Submitting...' : 'Submit Audit for Authorization'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: VIEW VERIFICATION DETAILS */}
      {/* ======================================================== */}
      {viewVerificationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full p-6 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Audit Session {viewVerificationModal.verification_no}</h3>
                <p className="text-xs text-slate-400 mt-0.5">Facility: {viewVerificationModal.warehouse_name} ({viewVerificationModal.warehouse_code})</p>
              </div>
              <button onClick={() => setViewVerificationModal(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold uppercase">
                  <tr>
                    <th className="py-2.5 px-3">SKU</th>
                    <th className="py-2.5 px-3">Item Name</th>
                    <th className="py-2.5 px-3 text-right">System Qty</th>
                    <th className="py-2.5 px-3 text-right">Physical Count</th>
                    <th className="py-2.5 px-3 text-right">Variance</th>
                    <th className="py-2.5 px-3">Discrepancy Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {viewVerificationModal.items?.map((it, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/70">
                      <td className="py-2 px-3 font-mono font-bold text-sky-700">{it.item_code}</td>
                      <td className="py-2 px-3 text-slate-900 font-medium">{it.item_name}</td>
                      <td className="py-2 px-3 text-right font-medium text-slate-700">{it.system_quantity}</td>
                      <td className="py-2 px-3 text-right font-bold text-slate-900">{it.physical_quantity}</td>
                      <td className={`py-2 px-3 text-right font-bold ${
                        it.variance === 0 ? 'text-emerald-600' : 'text-rose-600'
                      }`}>
                        {it.variance > 0 ? `+${it.variance}` : it.variance}
                      </td>
                      <td className="py-2 px-3 text-slate-600">{it.discrepancy_reason || 'Balanced'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-100">
              <button
                onClick={() => setViewVerificationModal(null)}
                className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default WarehouseManagementPage;
