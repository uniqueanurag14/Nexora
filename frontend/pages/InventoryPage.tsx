import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
  InventoryItem,
  InventoryCategory,
  UnitOfMeasure,
  Warehouse,
  StockTransaction,
  LowStockAlertItem,
  ReorderRequest,
  InventoryDashboardData,
  Supplier,
  CategoryImportPreviewData,
} from '../types';
import {
  Package,
  LayoutDashboard,
  FolderTree,
  Building2,
  ArrowLeftRight,
  TrendingUp,
  AlertTriangle,
  ShoppingCart,
  Plus,
  Search,
  Download,
  Upload,
  RefreshCw,
  Eye,
  Edit2,
  Trash2,
  X,
  AlertCircle,
  CheckCircle,
  Copy,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Send,
  Calendar,
  Layers,
  Check,
  FileSpreadsheet,
  Tag,
} from 'lucide-react';

interface InventoryPageProps {
  initialTab?: string;
  onNavigate?: (route: string) => void;
}

export const InventoryPage: React.FC<InventoryPageProps> = ({ initialTab = 'dashboard', onNavigate }) => {
  const { hasPermission } = useAuth();
  const [activeTab, setActiveTab] = useState<string>(initialTab);

  // Core Datasets
  const [dashboardData, setDashboardData] = useState<InventoryDashboardData | null>(null);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [totalItems, setTotalItems] = useState<number>(0);
  const [itemPage, setItemPage] = useState<number>(1);
  const [itemTotalPages, setItemTotalPages] = useState<number>(1);
  const [categories, setCategories] = useState<InventoryCategory[]>([]);
  const [uoms, setUoms] = useState<UnitOfMeasure[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [movements, setMovements] = useState<StockTransaction[]>([]);
  const [alerts, setAlerts] = useState<LowStockAlertItem[]>([]);
  const [reorders, setReorders] = useState<ReorderRequest[]>([]);
  const [reorderTotal, setReorderTotal] = useState<number>(0);

  // Loading & Messages
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');
  const [copiedLink, setCopiedLink] = useState<string>('');

  // Search & Filter States
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [reorderStatusFilter, setReorderStatusFilter] = useState<string>('all');
  const [movementTypeFilter, setMovementTypeFilter] = useState<string>('all');

  // Modals
  const [isAddItemOpen, setIsAddItemOpen] = useState<boolean>(false);
  const [editItem, setEditItem] = useState<InventoryItem | null>(null);
  const [viewItem, setViewItem] = useState<InventoryItem | null>(null);
  const [deleteItemTarget, setDeleteItemTarget] = useState<InventoryItem | null>(null);
  const [isImportOpen, setIsImportOpen] = useState<boolean>(false);

  // Online Reorder Modal
  const [reorderModalItem, setReorderModalItem] = useState<InventoryItem | null>(null);
  const [reorderSupplierId, setReorderSupplierId] = useState<string>('');
  const [reorderQty, setReorderQty] = useState<string>('');
  const [reorderUnitPrice, setReorderUnitPrice] = useState<string>('');
  const [reorderDate, setReorderDate] = useState<string>('');
  const [reorderNotes, setReorderNotes] = useState<string>('');
  const [isDispatchingReorder, setIsDispatchingReorder] = useState<boolean>(false);
  const [generatedReorderResult, setGeneratedReorderResult] = useState<any | null>(null);

  // Counteroffer Review Modal
  const [reviewReorder, setReviewReorder] = useState<ReorderRequest | null>(null);
  const [revisePrice, setRevisePrice] = useState<string>('');
  const [reviseQty, setReviseQty] = useState<string>('');
  const [reviseDate, setReviseDate] = useState<string>('');
  const [reviseNotes, setReviseNotes] = useState<string>('');
  const [cancelReason, setCancelReason] = useState<string>('');
  const [isActingOnReorder, setIsActingOnReorder] = useState<boolean>(false);

  // Stock Operations Form State
  const [operationType, setOperationType] = useState<'receive' | 'issue' | 'adjust' | 'transfer'>('receive');
  const [opReference, setOpReference] = useState<string>('');
  const [opItemId, setOpItemId] = useState<string>('');
  const [opWarehouseId, setOpWarehouseId] = useState<string>('');
  const [opDestWarehouseId, setOpDestWarehouseId] = useState<string>('');
  const [opSupplierId, setOpSupplierId] = useState<string>('');
  const [opQuantity, setOpQuantity] = useState<string>('');
  const [opUnitCost, setOpUnitCost] = useState<string>('');
  const [opReason, setOpReason] = useState<string>('');
  const [opNotes, setOpNotes] = useState<string>('');
  const [isSubmittingOp, setIsSubmittingOp] = useState<boolean>(false);

  // Category & Warehouse Modal Forms
  const [newCatCode, setNewCatCode] = useState<string>('');
  const [newCatName, setNewCatName] = useState<string>('');
  const [newCatDesc, setNewCatDesc] = useState<string>('');
  const [newWhCode, setNewWhCode] = useState<string>('');
  const [newWhName, setNewWhName] = useState<string>('');
  const [newWhAddress, setNewWhAddress] = useState<string>('');

  // Item Form State
  const initialItemForm = {
    code: '',
    name: '',
    description: '',
    category_id: '',
    uom_id: '',
    barcode: '',
    min_stock_level: '10',
    reorder_quantity: '50',
    cost_price: '0',
    selling_price: '0',
    status: 'active',
    initial_warehouse_id: '',
    initial_quantity: '0',
  };
  const [itemForm, setItemForm] = useState(initialItemForm);

  // Import State (Items)
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<any | null>(null);
  const [duplicatePolicy, setDuplicatePolicy] = useState<'skip' | 'update'>('skip');
  const [isImporting, setIsImporting] = useState<boolean>(false);

  // Category Search, Filter & CRUD States
  const [categorySearchQuery, setCategorySearchQuery] = useState<string>('');
  const [categoryStatusFilter, setCategoryStatusFilter] = useState<string>('all');
  const [editCategoryTarget, setEditCategoryTarget] = useState<InventoryCategory | null>(null);
  const [editCatCode, setEditCatCode] = useState<string>('');
  const [editCatName, setEditCatName] = useState<string>('');
  const [editCatDesc, setEditCatDesc] = useState<string>('');
  const [editCatActive, setEditCatActive] = useState<boolean>(true);
  const [deleteCatTarget, setDeleteCatTarget] = useState<InventoryCategory | null>(null);
  const [isDeletingCat, setIsDeletingCat] = useState<boolean>(false);

  // Category Excel Import State
  const [isCatImportOpen, setIsCatImportOpen] = useState<boolean>(false);
  const [catImportFile, setCatImportFile] = useState<File | null>(null);
  const [catImportPreview, setCatImportPreview] = useState<CategoryImportPreviewData | null>(null);
  const [catDuplicatePolicy, setCatDuplicatePolicy] = useState<'skip' | 'update'>('skip');
  const [isCatImporting, setIsCatImporting] = useState<boolean>(false);

  // Import / Export Hub Section Switcher
  const [hubSection, setHubSection] = useState<'items' | 'categories'>('items');

  // Sync route param with activeTab
  useEffect(() => {
    if (initialTab) {
      const clean = initialTab.replace('/inventory/', '').replace('/inventory', '') || 'dashboard';
      setActiveTab(clean);
    }
  }, [initialTab]);

  // Load auxiliary data: Categories, UOMs, Warehouses, Suppliers
  const loadAuxData = async () => {
    try {
      const [catRes, uomRes, whRes, supRes] = await Promise.all([
        api.getCategories(),
        api.getUOMs(),
        api.getWarehouses(),
        api.getSuppliers({ page_size: 100 }),
      ]);
      if (catRes.success && catRes.data) setCategories(catRes.data);
      if (uomRes.success && uomRes.data) setUoms(uomRes.data);
      if (whRes.success && whRes.data) setWarehouses(whRes.data);
      if (supRes.success && supRes.data) setSuppliers(supRes.data.items || []);
    } catch (e) {
      console.warn('Auxiliary inventory data loading note:', e);
    }
  };

  useEffect(() => {
    loadAuxData();
  }, []);

  // Fetch data per tab
  const fetchDataForTab = async () => {
    setIsLoading(true);
    setErrorMsg('');
    try {
      if (activeTab === 'dashboard') {
        const res = await api.getInventoryDashboard();
        if (res.success && res.data) setDashboardData(res.data);
      } else if (activeTab === 'items') {
        const res = await api.getItems({
          search: searchQuery.trim() || undefined,
          category_id: categoryFilter ? parseInt(categoryFilter, 10) : undefined,
          status: statusFilter !== 'all' ? statusFilter : undefined,
          page: itemPage,
          page_size: 10,
        });
        if (res.success && res.data) {
          setItems(res.data.items);
          setTotalItems(res.data.total);
          setItemTotalPages(res.data.totalPages);
        }
      } else if (activeTab === 'alerts') {
        const res = await api.getLowStockAlerts();
        if (res.success && res.data) setAlerts(res.data);
      } else if (activeTab === 'reorders') {
        const res = await api.getReorders({
          status: reorderStatusFilter !== 'all' ? reorderStatusFilter : undefined,
          search: searchQuery.trim() || undefined,
          page: 1,
          page_size: 20,
        });
        if (res.success && res.data) {
          setReorders(res.data.reorders);
          setReorderTotal(res.data.total);
        }
      } else if (activeTab === 'movements') {
        const res = await api.getStockMovements({
          transaction_type: movementTypeFilter !== 'all' ? movementTypeFilter : undefined,
          page: 1,
          page_size: 25,
        });
        if (res.success && res.data) setMovements(res.data.transactions);
      } else if (activeTab === 'categories') {
        const catRes = await api.getCategories({
          search: categorySearchQuery.trim() || undefined,
          status: categoryStatusFilter !== 'all' ? categoryStatusFilter : undefined,
        });
        if (catRes.success && catRes.data) setCategories(catRes.data);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to fetch inventory data.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDataForTab();
  }, [activeTab, itemPage, categoryFilter, statusFilter, reorderStatusFilter, movementTypeFilter, categorySearchQuery, categoryStatusFilter]);

  // Open Reorder Popup
  const openReorderModal = (item: InventoryItem) => {
    setReorderModalItem(item);
    setGeneratedReorderResult(null);

    // Calculate default suggested reorder quantity
    const deficit = Math.max(0, item.min_stock_level - item.total_on_hand);
    const suggestedQty = item.reorder_quantity > 0 ? item.reorder_quantity : Math.max(10, deficit + 10);

    setReorderQty(suggestedQty.toString());
    setReorderUnitPrice(item.cost_price > 0 ? item.cost_price.toString() : '0.00');

    // Default supplier if any
    if (suppliers.length > 0) {
      setReorderSupplierId(suppliers[0].id.toString());
    } else {
      setReorderSupplierId('');
    }

    const nextWeek = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().split('T')[0];
    setReorderDate(nextWeek);
    setReorderNotes(`Automated reorder triggered due to available stock (${item.total_on_hand}) falling below minimum threshold (${item.min_stock_level}).`);
  };

  const handleDispatchReorder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reorderModalItem || !reorderSupplierId) {
      setErrorMsg('Please select an active supplier.');
      return;
    }
    const qty = parseFloat(reorderQty);
    const price = parseFloat(reorderUnitPrice);
    if (!qty || qty <= 0 || price < 0) {
      setErrorMsg('Please enter valid positive quantity and unit price.');
      return;
    }

    setIsDispatchingReorder(true);
    setErrorMsg('');
    try {
      const res = await api.createReorder({
        item_id: reorderModalItem.id,
        supplier_id: parseInt(reorderSupplierId, 10),
        quantity: qty,
        unit_price: price,
        expected_delivery_date: reorderDate || undefined,
        notes: reorderNotes,
      });

      if (res.success && res.data) {
        setSuccessMsg(`Online reorder ${res.data.reorder_no} created and link generated.`);
        setGeneratedReorderResult(res.data);
        fetchDataForTab();
      } else {
        setErrorMsg(res.message || 'Failed to dispatch reorder.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error creating reorder.');
    } finally {
      setIsDispatchingReorder(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedLink(text);
    setTimeout(() => setCopiedLink(''), 3000);
  };

  // Open Add Item modal
  const handleOpenAddItem = async () => {
    setItemForm(initialItemForm);
    setIsAddItemOpen(true);
    try {
      const codeRes = await api.getNextItemCode();
      if (codeRes.success && codeRes.data) {
        setItemForm(prev => ({ ...prev, code: codeRes.data?.next_code || '' }));
      }
      if (warehouses.length > 0) {
        setItemForm(prev => ({ ...prev, initial_warehouse_id: warehouses[0].id.toString() }));
      }
    } catch {}
  };

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemForm.name.trim() || !itemForm.code.trim()) {
      setErrorMsg('Item code and name are required.');
      return;
    }

    setIsLoading(true);
    try {
      if (editItem) {
        const res = await api.updateItem(editItem.id, {
          name: itemForm.name,
          description: itemForm.description,
          category_id: itemForm.category_id ? parseInt(itemForm.category_id, 10) : null,
          uom_id: itemForm.uom_id ? parseInt(itemForm.uom_id, 10) : null,
          barcode: itemForm.barcode,
          min_stock_level: parseFloat(itemForm.min_stock_level || '0'),
          reorder_quantity: parseFloat(itemForm.reorder_quantity || '0'),
          cost_price: parseFloat(itemForm.cost_price || '0'),
          selling_price: parseFloat(itemForm.selling_price || '0'),
          status: itemForm.status as 'active' | 'disabled',
        });
        if (res.success) {
          setSuccessMsg(`Item '${itemForm.name}' updated successfully.`);
          setEditItem(null);
          fetchDataForTab();
        } else {
          setErrorMsg(res.message || 'Failed to update item.');
        }
      } else {
        const res = await api.createItem({
          code: itemForm.code,
          name: itemForm.name,
          description: itemForm.description,
          category_id: itemForm.category_id ? parseInt(itemForm.category_id, 10) : null,
          uom_id: itemForm.uom_id ? parseInt(itemForm.uom_id, 10) : null,
          barcode: itemForm.barcode,
          min_stock_level: parseFloat(itemForm.min_stock_level || '0'),
          reorder_quantity: parseFloat(itemForm.reorder_quantity || '0'),
          cost_price: parseFloat(itemForm.cost_price || '0'),
          selling_price: parseFloat(itemForm.selling_price || '0'),
          status: itemForm.status as 'active' | 'disabled',
          initial_warehouse_id: itemForm.initial_warehouse_id ? parseInt(itemForm.initial_warehouse_id, 10) : undefined,
          initial_quantity: parseFloat(itemForm.initial_quantity || '0'),
        });
        if (res.success) {
          setSuccessMsg(`Item '${itemForm.name}' registered successfully.`);
          setIsAddItemOpen(false);
          fetchDataForTab();
        } else {
          setErrorMsg(res.message || 'Failed to register item.');
        }
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error saving item.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteItemConfirm = async (forceDisable = false) => {
    if (!deleteItemTarget) return;
    try {
      const res = await api.deleteItem(deleteItemTarget.id, forceDisable);
      if (res.success) {
        setSuccessMsg(`Item '${deleteItemTarget.name}' has been ${res.data?.status === 'disabled' ? 'disabled' : 'deleted'}.`);
        setDeleteItemTarget(null);
        fetchDataForTab();
      } else {
        setErrorMsg(res.message || 'Failed to delete item.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error processing deletion.');
    }
  };

  // Stock Operations Handler
  const handleStockOperationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!opReference.trim() || !opItemId || !opWarehouseId || !opQuantity) {
      setErrorMsg('Reference number, item, warehouse, and quantity are required.');
      return;
    }

    setIsSubmittingOp(true);
    setErrorMsg('');
    try {
      if (operationType === 'receive') {
        const res = await api.receiveStock({
          reference_no: opReference,
          item_id: parseInt(opItemId, 10),
          warehouse_id: parseInt(opWarehouseId, 10),
          quantity: parseFloat(opQuantity),
          supplier_id: opSupplierId ? parseInt(opSupplierId, 10) : undefined,
          unit_cost: opUnitCost ? parseFloat(opUnitCost) : undefined,
          notes: opNotes,
        });
        if (res.success) {
          setSuccessMsg(`Stock received successfully. Updated balance: ${res.data?.new_balance} units.`);
          setOpReference('');
          setOpQuantity('');
          setOpNotes('');
        } else {
          setErrorMsg(res.message || 'Failed to receive stock.');
        }
      } else if (operationType === 'issue') {
        if (!opReason.trim()) {
          setErrorMsg('An issue reason is required.');
          setIsSubmittingOp(false);
          return;
        }
        const res = await api.issueStock({
          reference_no: opReference,
          item_id: parseInt(opItemId, 10),
          warehouse_id: parseInt(opWarehouseId, 10),
          quantity: parseFloat(opQuantity),
          reason: opReason,
          notes: opNotes,
        });
        if (res.success) {
          setSuccessMsg(`Stock issued successfully. Remaining balance: ${res.data?.remaining_balance} units.`);
          setOpReference('');
          setOpQuantity('');
          setOpReason('');
          setOpNotes('');
        } else {
          setErrorMsg(res.message || 'Failed to issue stock.');
        }
      } else if (operationType === 'adjust') {
        if (!opReason.trim()) {
          setErrorMsg('An adjustment reason is required.');
          setIsSubmittingOp(false);
          return;
        }
        const res = await api.adjustStock({
          reference_no: opReference,
          item_id: parseInt(opItemId, 10),
          warehouse_id: parseInt(opWarehouseId, 10),
          actual_quantity: parseFloat(opQuantity),
          reason: opReason,
          notes: opNotes,
        });
        if (res.success) {
          setSuccessMsg(`Stock adjusted successfully. Discrepancy logged: ${res.data?.difference} units.`);
          setOpReference('');
          setOpQuantity('');
          setOpReason('');
          setOpNotes('');
        } else {
          setErrorMsg(res.message || 'Failed to adjust stock.');
        }
      } else if (operationType === 'transfer') {
        if (!opDestWarehouseId || opDestWarehouseId === opWarehouseId) {
          setErrorMsg('Destination warehouse must be different from source warehouse.');
          setIsSubmittingOp(false);
          return;
        }
        const res = await api.transferStock({
          reference_no: opReference,
          item_id: parseInt(opItemId, 10),
          source_warehouse_id: parseInt(opWarehouseId, 10),
          destination_warehouse_id: parseInt(opDestWarehouseId, 10),
          quantity: parseFloat(opQuantity),
          notes: opNotes,
        });
        if (res.success) {
          setSuccessMsg('Stock transferred across warehouses atomically.');
          setOpReference('');
          setOpQuantity('');
          setOpNotes('');
        } else {
          setErrorMsg(res.message || 'Failed to transfer stock.');
        }
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Operation failed.');
    } finally {
      setIsSubmittingOp(false);
    }
  };

  // Reorder Actions (Accept Counteroffer, Revise, Cancel, Resend)
  const handleAcceptCounteroffer = async (reorderId: number) => {
    setIsActingOnReorder(true);
    try {
      const res = await api.acceptCounteroffer(reorderId);
      if (res.success) {
        setSuccessMsg('Counteroffer accepted. Order terms updated.');
        setReviewReorder(null);
        fetchDataForTab();
      } else {
        setErrorMsg(res.message || 'Failed to accept counteroffer.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error accepting counteroffer.');
    } finally {
      setIsActingOnReorder(false);
    }
  };

  const handleReviseOffer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewReorder) return;
    setIsActingOnReorder(true);
    try {
      const res = await api.reviseProposal(reviewReorder.id, {
        unit_price: parseFloat(revisePrice),
        quantity: parseFloat(reviseQty),
        expected_delivery_date: reviseDate || undefined,
        notes: reviseNotes,
      });
      if (res.success) {
        setSuccessMsg('Revised offer dispatched to supplier.');
        setReviewReorder(null);
        fetchDataForTab();
      } else {
        setErrorMsg(res.message || 'Failed to submit revised proposal.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error revising offer.');
    } finally {
      setIsActingOnReorder(false);
    }
  };

  const handleCancelReorder = async (reorderId: number) => {
    if (!cancelReason.trim()) {
      setErrorMsg('Please specify a cancellation reason.');
      return;
    }
    setIsActingOnReorder(true);
    try {
      const res = await api.cancelReorder(reorderId, cancelReason);
      if (res.success) {
        setSuccessMsg('Reorder cancelled.');
        setReviewReorder(null);
        setCancelReason('');
        fetchDataForTab();
      } else {
        setErrorMsg(res.message || 'Failed to cancel reorder.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error cancelling reorder.');
    } finally {
      setIsActingOnReorder(false);
    }
  };

  const handleResendLink = async (reorderId: number) => {
    try {
      const res = await api.resendReorderEmail(reorderId);
      if (res.success && res.data?.supplier_link) {
        setSuccessMsg(`Supplier link refreshed. Link: ${res.data.supplier_link}`);
        copyToClipboard(res.data.supplier_link);
        fetchDataForTab();
      } else {
        setErrorMsg(res.message || 'Failed to refresh link.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error refreshing link.');
    }
  };

  // Excel Handlers
  const handleExportItems = async () => {
    try {
      await api.downloadInventoryExcel({
        search: searchQuery.trim() || undefined,
        category_id: categoryFilter ? parseInt(categoryFilter, 10) : undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
      });
      setSuccessMsg('Inventory items exported to Excel.');
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to export items.');
    }
  };

  const handleExcelFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImportFile(file);
      const reader = new FileReader();
      reader.onload = async (evt) => {
        const base64Data = evt.target?.result as string;
        try {
          const res = await api.previewInventoryImport({ file_data: base64Data });
          if (res.success && res.data) {
            setImportPreview(res.data);
          } else {
            setErrorMsg(res.message || 'Failed to parse inventory spreadsheet.');
          }
        } catch (err: any) {
          setErrorMsg(err.message || 'Spreadsheet processing error.');
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCommitItemImport = async () => {
    if (!importPreview || !importPreview.preview_items) return;
    setIsImporting(true);
    try {
      const res = await api.commitInventoryImport({
        duplicate_policy: duplicatePolicy,
        rows: importPreview.preview_items.filter((i: any) => i.is_valid),
      });
      if (res.success) {
        setSuccessMsg(res.message || 'Import completed.');
        setIsImportOpen(false);
        setImportPreview(null);
        setImportFile(null);
        fetchDataForTab();
      } else {
        setErrorMsg(res.message || 'Import commit failed.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error committing import.');
    } finally {
      setIsImporting(false);
    }
  };

  // Category Excel Handlers
  const handleExportCategories = async () => {
    try {
      await api.downloadCategoryExcel({
        search: categorySearchQuery.trim() || undefined,
        status: categoryStatusFilter !== 'all' ? categoryStatusFilter : undefined,
      });
      setSuccessMsg('Category list exported to Excel successfully.');
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to export categories.');
    }
  };

  const handleCatExcelFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setCatImportFile(file);
      const reader = new FileReader();
      reader.onload = async (evt) => {
        const base64Data = evt.target?.result as string;
        try {
          const res = await api.previewCategoryImport({ file_data: base64Data });
          if (res.success && res.data) {
            setCatImportPreview(res.data);
          } else {
            setErrorMsg(res.message || 'Failed to parse category spreadsheet.');
          }
        } catch (err: any) {
          setErrorMsg(err.message || 'Spreadsheet processing error.');
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCommitCatImport = async () => {
    if (!catImportPreview || !catImportPreview.preview_categories) return;
    setIsCatImporting(true);
    try {
      const res = await api.commitCategoryImport({
        duplicate_policy: catDuplicatePolicy,
        rows: catImportPreview.preview_categories.filter((c: any) => c.is_valid),
      });
      if (res.success) {
        setSuccessMsg(res.message || 'Category import committed successfully.');
        setIsCatImportOpen(false);
        setCatImportPreview(null);
        setCatImportFile(null);
        loadAuxData();
        fetchDataForTab();
      } else {
        setErrorMsg(res.message || 'Category import failed.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error committing category import.');
    } finally {
      setIsCatImporting(false);
    }
  };

  // Category Edit, Toggle Status & Delete Handlers
  const handleOpenEditCategory = (cat: InventoryCategory) => {
    setEditCategoryTarget(cat);
    setEditCatCode(cat.code);
    setEditCatName(cat.name);
    setEditCatDesc(cat.description || '');
    setEditCatActive(cat.is_active);
  };

  const handleSaveEditCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editCategoryTarget) return;
    if (!editCatCode.trim() || !editCatName.trim()) {
      setErrorMsg('Category Code and Name are required.');
      return;
    }
    try {
      const res = await api.updateCategory(editCategoryTarget.id, {
        code: editCatCode.trim().toUpperCase(),
        name: editCatName.trim(),
        description: editCatDesc.trim(),
        is_active: editCatActive,
      });
      if (res.success) {
        setSuccessMsg(`Category '${editCatName}' updated successfully.`);
        setEditCategoryTarget(null);
        loadAuxData();
        fetchDataForTab();
      } else {
        setErrorMsg(res.message || 'Failed to update category.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error updating category.');
    }
  };

  const handleToggleCategoryActive = async (cat: InventoryCategory) => {
    try {
      const res = await api.updateCategory(cat.id, { is_active: !cat.is_active });
      if (res.success) {
        setSuccessMsg(`Category '${cat.name}' is now ${!cat.is_active ? 'Active' : 'Disabled'}.`);
        loadAuxData();
        fetchDataForTab();
      } else {
        setErrorMsg(res.message || 'Failed to toggle category status.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error toggling category status.');
    }
  };

  const handleDeleteCategoryConfirm = async () => {
    if (!deleteCatTarget) return;
    setIsDeletingCat(true);
    try {
      const res = await api.deleteCategory(deleteCatTarget.id);
      if (res.success) {
        setSuccessMsg(`Category '${deleteCatTarget.name}' deleted successfully.`);
        setDeleteCatTarget(null);
        loadAuxData();
        fetchDataForTab();
      } else {
        setErrorMsg(res.message || 'Failed to delete category.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Cannot delete category referenced by active items.');
    } finally {
      setIsDeletingCat(false);
    }
  };

  // Category Add
  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatCode.trim() || !newCatName.trim()) return;
    try {
      const res = await api.createCategory({
        code: newCatCode.trim().toUpperCase(),
        name: newCatName.trim(),
        description: newCatDesc.trim(),
      });
      if (res.success) {
        setSuccessMsg(`Category '${res.data?.name}' created.`);
        setNewCatCode('');
        setNewCatName('');
        setNewCatDesc('');
        loadAuxData();
      } else {
        setErrorMsg(res.message || 'Failed to create category.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error creating category.');
    }
  };

  // Warehouse Add
  const handleCreateWarehouse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWhCode.trim() || !newWhName.trim()) return;
    try {
      const res = await api.createWarehouse({
        code: newWhCode.trim().toUpperCase(),
        name: newWhName.trim(),
        address: newWhAddress.trim(),
      });
      if (res.success) {
        setSuccessMsg(`Warehouse '${res.data?.name}' created.`);
        setNewWhCode('');
        setNewWhName('');
        setNewWhAddress('');
        loadAuxData();
      } else {
        setErrorMsg(res.message || 'Failed to create warehouse.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error creating warehouse.');
    }
  };

  const selectedSupplier = suppliers.find(s => s.id.toString() === reorderSupplierId);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Module Title & Tab Navigation */}
      <div className="border-b border-slate-200 pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Inventory Management
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Multi-warehouse tracking, atomic ledger movements, low-stock threshold triggers, and online supplier reordering
            </p>
          </div>

          <div className="flex items-center gap-2">
            {activeTab === 'items' && hasPermission('inventory.create') && (
              <button
                onClick={handleOpenAddItem}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-sky-600 text-white hover:bg-sky-700 transition-colors shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Item
              </button>
            )}

            <button
              onClick={() => fetchDataForTab()}
              className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors"
              title="Refresh Current View"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Existing Child Navigation Tabs (Module 6) */}
        <div className="flex items-center gap-1 overflow-x-auto custom-scrollbar pt-1">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`px-3 py-2 text-xs font-semibold rounded-lg whitespace-nowrap transition-colors inline-flex items-center gap-2 ${
              activeTab === 'dashboard'
                ? 'bg-sky-50 text-sky-700 border border-sky-200'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <LayoutDashboard className="w-3.5 h-3.5" />
            Dashboard
          </button>

          <button
            onClick={() => setActiveTab('items')}
            className={`px-3 py-2 text-xs font-semibold rounded-lg whitespace-nowrap transition-colors inline-flex items-center gap-2 ${
              activeTab === 'items'
                ? 'bg-sky-50 text-sky-700 border border-sky-200'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Package className="w-3.5 h-3.5" />
            Items Master
          </button>

          <button
            onClick={() => setActiveTab('operations')}
            className={`px-3 py-2 text-xs font-semibold rounded-lg whitespace-nowrap transition-colors inline-flex items-center gap-2 ${
              activeTab === 'operations'
                ? 'bg-sky-50 text-sky-700 border border-sky-200'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <ArrowLeftRight className="w-3.5 h-3.5" />
            Stock Operations
          </button>

          <button
            onClick={() => setActiveTab('movements')}
            className={`px-3 py-2 text-xs font-semibold rounded-lg whitespace-nowrap transition-colors inline-flex items-center gap-2 ${
              activeTab === 'movements'
                ? 'bg-sky-50 text-sky-700 border border-sky-200'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            Stock Ledger
          </button>

          <button
            onClick={() => setActiveTab('alerts')}
            className={`px-3 py-2 text-xs font-semibold rounded-lg whitespace-nowrap transition-colors inline-flex items-center gap-2 ${
              activeTab === 'alerts'
                ? 'bg-sky-50 text-sky-700 border border-sky-200'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            Low Stock Alerts
          </button>

          <button
            onClick={() => setActiveTab('reorders')}
            className={`px-3 py-2 text-xs font-semibold rounded-lg whitespace-nowrap transition-colors inline-flex items-center gap-2 ${
              activeTab === 'reorders'
                ? 'bg-sky-50 text-sky-700 border border-sky-200'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <ShoppingCart className="w-3.5 h-3.5" />
            Reorders & Negotiations
          </button>

          <button
            onClick={() => setActiveTab('categories')}
            className={`px-3 py-2 text-xs font-semibold rounded-lg whitespace-nowrap transition-colors inline-flex items-center gap-2 ${
              activeTab === 'categories'
                ? 'bg-sky-50 text-sky-700 border border-sky-200'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <FolderTree className="w-3.5 h-3.5" />
            Taxonomies & Locations
          </button>

          <button
            onClick={() => setActiveTab('import-export')}
            className={`px-3 py-2 text-xs font-semibold rounded-lg whitespace-nowrap transition-colors inline-flex items-center gap-2 ${
              activeTab === 'import-export'
                ? 'bg-sky-50 text-sky-700 border border-sky-200'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Excel Import / Export Hub
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

      {/* ========================================================== */}
      {/* TAB 1: INVENTORY DASHBOARD */}
      {/* ========================================================== */}
      {activeTab === 'dashboard' && (
        <div className="space-y-6">
          {/* Key Metric Strips */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-xs font-medium text-slate-500">Active Items</span>
              <p className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">
                {dashboardData?.total_active_items || 0}
              </p>
              <span className="text-[11px] text-slate-400 mt-1 block">Catalog active records</span>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-xs font-medium text-amber-600">Low Stock Items</span>
              <p className="text-2xl font-bold text-amber-700 mt-1 tabular-nums">
                {dashboardData?.low_stock_items_count || 0}
              </p>
              <button
                onClick={() => setActiveTab('alerts')}
                className="text-[11px] text-sky-600 hover:underline mt-1 block"
              >
                Review reorder alerts →
              </button>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-xs font-medium text-rose-600">Out of Stock</span>
              <p className="text-2xl font-bold text-rose-700 mt-1 tabular-nums">
                {dashboardData?.out_of_stock_items_count || 0}
              </p>
              <span className="text-[11px] text-slate-400 mt-1 block">Zero inventory on hand</span>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-xs font-medium text-slate-500">Inventory Valuation</span>
              <p className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">
                ₹{(dashboardData?.inventory_valuation || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </p>
              <span className="text-[11px] text-slate-400 mt-1 block">Aggregated cost basis</span>
            </div>
          </div>

          {/* Reorders & Stock Operations Summary */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Supplier Reorder Pipelines
                </h3>
                <button
                  onClick={() => setActiveTab('reorders')}
                  className="text-xs text-sky-600 font-semibold hover:underline"
                >
                  View All
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="p-3.5 rounded-lg bg-sky-50/70 border border-sky-100">
                  <span className="text-xs text-sky-700 block">Pending Response</span>
                  <p className="text-xl font-extrabold text-sky-900 mt-1 tabular-nums">
                    {dashboardData?.pending_reorders_count || 0}
                  </p>
                  <span className="text-[10px] text-sky-600 mt-0.5 block">Dispatched to suppliers</span>
                </div>

                <div className="p-3.5 rounded-lg bg-amber-50/70 border border-amber-100">
                  <span className="text-xs text-amber-700 block">Counteroffers Awaiting Review</span>
                  <p className="text-xl font-extrabold text-amber-900 mt-1 tabular-nums">
                    {dashboardData?.counteroffers_count || 0}
                  </p>
                  <span className="text-[10px] text-amber-600 mt-0.5 block">Supplier price / qty adjustments</span>
                </div>
              </div>
            </div>

            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Recent Movement Volumes
                </h3>
                <button
                  onClick={() => setActiveTab('movements')}
                  className="text-xs text-sky-600 font-semibold hover:underline"
                >
                  Ledger History
                </button>
              </div>

              <div className="grid grid-cols-4 gap-2 pt-2 text-center text-xs">
                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                  <span className="text-[10px] text-slate-500 block">Receipts</span>
                  <p className="font-bold text-slate-800 mt-1 tabular-nums">{dashboardData?.recent_receipts_count || 0}</p>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                  <span className="text-[10px] text-slate-500 block">Issues</span>
                  <p className="font-bold text-slate-800 mt-1 tabular-nums">{dashboardData?.recent_issues_count || 0}</p>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                  <span className="text-[10px] text-slate-500 block">Adjustments</span>
                  <p className="font-bold text-slate-800 mt-1 tabular-nums">{dashboardData?.recent_adjustments_count || 0}</p>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                  <span className="text-[10px] text-slate-500 block">Transfers</span>
                  <p className="font-bold text-slate-800 mt-1 tabular-nums">{dashboardData?.recent_transfers_count || 0}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Warehouse Location Breakdown */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Current Stock by Location
              </h3>
              <button
                onClick={() => setActiveTab('operations')}
                className="text-xs text-sky-600 font-semibold hover:underline inline-flex items-center gap-1"
              >
                <ArrowLeftRight className="w-3.5 h-3.5" />
                Transfer Stock
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-4">Warehouse Code</th>
                    <th className="py-2.5 px-4">Facility / Location Name</th>
                    <th className="py-2.5 px-4 text-right">Items Stocked</th>
                    <th className="py-2.5 px-4 text-right">Total Units on Hand</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(!dashboardData?.stock_by_location || dashboardData.stock_by_location.length === 0) ? (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-slate-400">
                        No warehouse locations configured yet.
                      </td>
                    </tr>
                  ) : (
                    dashboardData.stock_by_location.map((loc) => (
                      <tr key={loc.warehouse_id} className="hover:bg-slate-50/50">
                        <td className="py-2.5 px-4 font-mono font-medium text-slate-800">{loc.warehouse_code}</td>
                        <td className="py-2.5 px-4 font-semibold text-slate-900">{loc.warehouse_name}</td>
                        <td className="py-2.5 px-4 text-right tabular-nums text-slate-700">{loc.items_count}</td>
                        <td className="py-2.5 px-4 text-right font-bold text-slate-900 tabular-nums">
                          {loc.total_quantity.toLocaleString()}
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

      {/* ========================================================== */}
      {/* TAB 2: ITEMS MASTER */}
      {/* ========================================================== */}
      {activeTab === 'items' && (
        <div className="space-y-4">
          {/* Controls Bar */}
          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setItemPage(1);
                fetchDataForTab();
              }}
              className="flex-1 w-full md:w-auto relative"
            >
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search items by SKU, name, or barcode..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 focus:bg-white"
              />
            </form>

            <div className="flex items-center gap-2 w-full md:w-auto shrink-0 flex-wrap">
              <select
                value={categoryFilter}
                onChange={(e) => {
                  setCategoryFilter(e.target.value);
                  setItemPage(1);
                }}
                className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-sky-500"
              >
                <option value="">All Categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>

              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setItemPage(1);
                }}
                className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-sky-500"
              >
                <option value="all">All Statuses</option>
                <option value="active">Active</option>
                <option value="disabled">Disabled</option>
              </select>

              <button
                onClick={handleExportItems}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-colors"
                title="Export items to Excel"
              >
                <Download className="w-3.5 h-3.5" />
                Export
              </button>

              <button
                onClick={() => setIsImportOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-colors"
                title="Import items from Excel"
              >
                <Upload className="w-3.5 h-3.5" />
                Import
              </button>
            </div>
          </div>

          {/* Items Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">Item Code / SKU</th>
                    <th className="py-3 px-4">Item Name</th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4 text-right">Available Stock</th>
                    <th className="py-3 px-4 text-right">Min Stock</th>
                    <th className="py-3 px-4 text-right">Reorder Qty</th>
                    <th className="py-3 px-4 text-right">Cost Price</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {isLoading ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-slate-400">
                        Loading inventory items...
                      </td>
                    </tr>
                  ) : items.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-16 text-center text-slate-400">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <Package className="w-10 h-10 text-slate-300 stroke-1" />
                          <p className="text-sm font-medium text-slate-600">No inventory items found</p>
                          <p className="text-xs text-slate-400 max-w-sm">
                            Add products to your catalog or import from Excel to track balances and configure reorder rules.
                          </p>
                          {hasPermission('inventory.create') && (
                            <button
                              onClick={handleOpenAddItem}
                              className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-sky-600 text-white hover:bg-sky-700"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              Add First Item
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    items.map((it) => {
                      const isLowStock = it.total_on_hand <= it.min_stock_level;
                      const isOut = it.total_on_hand === 0;

                      return (
                        <tr key={it.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="py-3 px-4 font-mono font-medium text-slate-800">
                            {it.code}
                          </td>
                          <td className="py-3 px-4">
                            <span className="font-semibold text-slate-900 block">{it.name}</span>
                            {it.description && (
                              <span className="text-[11px] text-slate-400 truncate max-w-xs block">
                                {it.description}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-slate-600">
                            {it.category_name || 'Uncategorized'}
                          </td>
                          <td className="py-3 px-4 text-right font-bold tabular-nums">
                            <span className={isOut ? 'text-rose-600' : isLowStock ? 'text-amber-600' : 'text-slate-900'}>
                              {it.total_on_hand} {it.uom_symbol || ''}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right tabular-nums text-slate-600">
                            {it.min_stock_level}
                          </td>
                          <td className="py-3 px-4 text-right tabular-nums text-slate-600">
                            {it.reorder_quantity}
                          </td>
                          <td className="py-3 px-4 text-right tabular-nums text-slate-700">
                            ₹{it.cost_price?.toFixed(2)}
                          </td>
                          <td className="py-3 px-4">
                            <span className={`text-xs font-medium ${it.status === 'active' ? 'text-emerald-700' : 'text-slate-400'}`}>
                              {it.status === 'active' ? 'Active' : 'Disabled'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Distinctive Reorder button enabled when Available <= Minimum Stock */}
                              {isLowStock && (
                                <button
                                  onClick={() => openReorderModal(it)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold bg-amber-500 text-white hover:bg-amber-600 transition-colors shadow-xs"
                                  title="Dispatch Supplier Reorder Request"
                                >
                                  <ShoppingCart className="w-3 h-3" />
                                  Reorder
                                </button>
                              )}

                              <button
                                onClick={() => setViewItem(it)}
                                className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100"
                                title="View Details & Warehouse Stock"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>

                              {hasPermission('inventory.edit') && (
                                <button
                                  onClick={() => {
                                    setEditItem(it);
                                    setItemForm({
                                      code: it.code,
                                      name: it.name,
                                      description: it.description || '',
                                      category_id: it.category_id?.toString() || '',
                                      uom_id: it.uom_id?.toString() || '',
                                      barcode: it.barcode || '',
                                      min_stock_level: it.min_stock_level.toString(),
                                      reorder_quantity: it.reorder_quantity.toString(),
                                      cost_price: it.cost_price.toString(),
                                      selling_price: it.selling_price.toString(),
                                      status: it.status,
                                      initial_warehouse_id: '',
                                      initial_quantity: '0',
                                    });
                                  }}
                                  className="p-1.5 rounded-md text-slate-500 hover:text-sky-600 hover:bg-sky-50"
                                  title="Edit Item Master"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                              )}

                              {hasPermission('inventory.delete') && (
                                <button
                                  onClick={() => setDeleteItemTarget(it)}
                                  className="p-1.5 rounded-md text-slate-500 hover:text-rose-600 hover:bg-rose-50"
                                  title="Delete or Disable"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="border-t border-slate-200 px-4 py-3 bg-white flex items-center justify-between text-xs text-slate-500">
              <div>
                Showing <span className="font-semibold text-slate-800 tabular-nums">{items.length > 0 ? (itemPage - 1) * 10 + 1 : 0}</span> to{' '}
                <span className="font-semibold text-slate-800 tabular-nums">{Math.min(itemPage * 10, totalItems)}</span> of{' '}
                <span className="font-semibold text-slate-800 tabular-nums">{totalItems}</span> items
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setItemPage(p => Math.max(1, p - 1))}
                  disabled={itemPage <= 1}
                  className="p-1.5 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="px-2 font-medium text-slate-700 tabular-nums">
                  Page {itemPage} of {itemTotalPages}
                </span>
                <button
                  onClick={() => setItemPage(p => Math.min(itemTotalPages, p + 1))}
                  disabled={itemPage >= itemTotalPages}
                  className="p-1.5 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================== */}
      {/* TAB 3: STOCK OPERATIONS (Receive, Issue, Adjust, Transfer) */}
      {/* ========================================================== */}
      {activeTab === 'operations' && (
        <div className="max-w-3xl mx-auto space-y-6">
          <div className="bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden">
            {/* Operation Type Selector */}
            <div className="grid grid-cols-4 border-b border-slate-200 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setOperationType('receive')}
                className={`py-3 text-center border-b-2 transition-colors ${
                  operationType === 'receive'
                    ? 'border-sky-600 text-sky-700 bg-sky-50/50'
                    : 'border-transparent text-slate-600 hover:bg-slate-50'
                }`}
              >
                Receive Stock (+)
              </button>

              <button
                type="button"
                onClick={() => setOperationType('issue')}
                className={`py-3 text-center border-b-2 transition-colors ${
                  operationType === 'issue'
                    ? 'border-rose-600 text-rose-700 bg-rose-50/50'
                    : 'border-transparent text-slate-600 hover:bg-slate-50'
                }`}
              >
                Issue Stock (-)
              </button>

              <button
                type="button"
                onClick={() => setOperationType('adjust')}
                className={`py-3 text-center border-b-2 transition-colors ${
                  operationType === 'adjust'
                    ? 'border-amber-600 text-amber-700 bg-amber-50/50'
                    : 'border-transparent text-slate-600 hover:bg-slate-50'
                }`}
              >
                Stock Adjustment (±)
              </button>

              <button
                type="button"
                onClick={() => setOperationType('transfer')}
                className={`py-3 text-center border-b-2 transition-colors ${
                  operationType === 'transfer'
                    ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50'
                    : 'border-transparent text-slate-600 hover:bg-slate-50'
                }`}
              >
                Warehouse Transfer (⇄)
              </button>
            </div>

            <form onSubmit={handleStockOperationSubmit} className="p-6 space-y-4 text-xs">
              <div className="p-3 bg-slate-50 rounded-lg text-slate-600 border border-slate-200">
                {operationType === 'receive' && (
                  <p>Inbound intake: increases warehouse stock balance upon recording verified delivery.</p>
                )}
                {operationType === 'issue' && (
                  <p>Outbound deduction: decreases inventory balance. Accidental negative balances are prevented.</p>
                )}
                {operationType === 'adjust' && (
                  <p>Physical inventory audit: replaces balance with counted physical quantity and logs the discrepancy ledger.</p>
                )}
                {operationType === 'transfer' && (
                  <p>Inter-warehouse transfer: atomically updates source and destination balances in a single transaction.</p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Reference Document / PO Number <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={opReference}
                    onChange={(e) => setOpReference(e.target.value)}
                    placeholder="e.g. REC-2026-001 or ISS-883"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-mono focus:bg-white focus:ring-2 focus:ring-sky-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Select Inventory Item <span className="text-rose-500">*</span>
                  </label>
                  <select
                    required
                    value={opItemId}
                    onChange={(e) => setOpItemId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-sky-500"
                  >
                    <option value="">-- Choose Item --</option>
                    {items.map((it) => (
                      <option key={it.id} value={it.id}>
                        {it.name} ({it.code}) - Avail: {it.total_on_hand}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    {operationType === 'transfer' ? 'Source Warehouse' : 'Warehouse Location'}{' '}
                    <span className="text-rose-500">*</span>
                  </label>
                  <select
                    required
                    value={opWarehouseId}
                    onChange={(e) => setOpWarehouseId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-sky-500"
                  >
                    <option value="">-- Choose Warehouse --</option>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name} ({w.code})
                      </option>
                    ))}
                  </select>
                </div>

                {operationType === 'transfer' && (
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Destination Warehouse <span className="text-rose-500">*</span>
                    </label>
                    <select
                      required
                      value={opDestWarehouseId}
                      onChange={(e) => setOpDestWarehouseId(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">-- Choose Destination --</option>
                      {warehouses.filter(w => w.id.toString() !== opWarehouseId).map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name} ({w.code})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {operationType === 'receive' && (
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Supplier</label>
                    <select
                      value={opSupplierId}
                      onChange={(e) => setOpSupplierId(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-sky-500"
                    >
                      <option value="">-- Optional Supplier --</option>
                      {suppliers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.code})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    {operationType === 'adjust' ? 'Counted Actual Quantity' : 'Quantity'}{' '}
                    <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={opQuantity}
                    onChange={(e) => setOpQuantity(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-mono focus:bg-white focus:ring-2 focus:ring-sky-500"
                  />
                </div>

                {operationType === 'receive' && (
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Unit Cost (₹)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={opUnitCost}
                      onChange={(e) => setOpUnitCost(e.target.value)}
                      placeholder="0.00"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-mono focus:bg-white focus:ring-2 focus:ring-sky-500"
                    />
                  </div>
                )}

                {(operationType === 'issue' || operationType === 'adjust') && (
                  <div className="sm:col-span-2">
                    <label className="block font-semibold text-slate-700 mb-1">
                      Reason / Authorization <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={opReason}
                      onChange={(e) => setOpReason(e.target.value)}
                      placeholder={operationType === 'issue' ? 'Production dispatch, damaged scrap, warranty return' : 'Quarterly stock count variance, write-off'}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-sky-500"
                    />
                  </div>
                )}

                <div className="sm:col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">Audit Notes</label>
                  <textarea
                    rows={2}
                    value={opNotes}
                    onChange={(e) => setOpNotes(e.target.value)}
                    placeholder="Optional logistics notes or handling instructions"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-3 border-t border-slate-200">
                <button
                  type="submit"
                  disabled={isSubmittingOp}
                  className="px-5 py-2.5 bg-sky-600 text-white font-semibold rounded-lg hover:bg-sky-700 disabled:opacity-50 text-xs shadow-xs"
                >
                  {isSubmittingOp ? 'Persisting to Ledger...' : 'Commit Stock Transaction'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================== */}
      {/* TAB 4: STOCK MOVEMENTS / LEDGER */}
      {/* ========================================================== */}
      {activeTab === 'movements' && (
        <div className="space-y-4">
          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-500 font-semibold">Filter Type:</span>
              <select
                value={movementTypeFilter}
                onChange={(e) => setMovementTypeFilter(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-sky-500 text-xs"
              >
                <option value="all">All Movements</option>
                <option value="receipt">Receipts (+)</option>
                <option value="issue">Issues (-)</option>
                <option value="adjustment">Adjustments (±)</option>
                <option value="transfer">Transfers (⇄)</option>
              </select>
            </div>

            <button
              onClick={() => fetchDataForTab()}
              className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-slate-900"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-4">Ref No</th>
                    <th className="py-2.5 px-4">Type</th>
                    <th className="py-2.5 px-4">Item</th>
                    <th className="py-2.5 px-4 text-right">Quantity</th>
                    <th className="py-2.5 px-4">Location(s)</th>
                    <th className="py-2.5 px-4">Reason / Notes</th>
                    <th className="py-2.5 px-4">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {movements.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400">
                        No stock movement ledger records recorded yet.
                      </td>
                    </tr>
                  ) : (
                    movements.map((tx) => (
                      <tr key={tx.id} className="hover:bg-slate-50/50">
                        <td className="py-2.5 px-4 font-mono font-medium text-slate-800">{tx.reference_no}</td>
                        <td className="py-2.5 px-4">
                          <span className={`font-semibold capitalize text-xs ${
                            tx.transaction_type === 'receipt'
                              ? 'text-emerald-700'
                              : tx.transaction_type === 'issue'
                              ? 'text-rose-700'
                              : tx.transaction_type === 'adjustment'
                              ? 'text-amber-700'
                              : 'text-indigo-700'
                          }`}>
                            {tx.transaction_type}
                          </span>
                        </td>
                        <td className="py-2.5 px-4">
                          <span className="font-semibold text-slate-900">{tx.item_name}</span>
                          <span className="text-[10px] text-slate-400 font-mono block">{tx.item_code}</span>
                        </td>
                        <td className="py-2.5 px-4 text-right font-bold tabular-nums">
                          {tx.transaction_type === 'receipt' && `+${tx.quantity}`}
                          {tx.transaction_type === 'issue' && `-${tx.quantity}`}
                          {tx.transaction_type === 'adjustment' && (tx.quantity > 0 ? `+${tx.quantity}` : tx.quantity)}
                          {tx.transaction_type === 'transfer' && tx.quantity}
                        </td>
                        <td className="py-2.5 px-4 text-slate-600">
                          {tx.transaction_type === 'transfer'
                            ? `${tx.source_warehouse_name || 'Src'} → ${tx.destination_warehouse_name || 'Dest'}`
                            : tx.destination_warehouse_name || tx.source_warehouse_name || '—'}
                        </td>
                        <td className="py-2.5 px-4 text-slate-600 max-w-xs truncate">
                          {tx.reason ? `${tx.reason} ${tx.notes ? `(${tx.notes})` : ''}` : tx.notes || '—'}
                        </td>
                        <td className="py-2.5 px-4 text-slate-400 tabular-nums">
                          {new Date(tx.created_at).toLocaleDateString()} {new Date(tx.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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

      {/* ========================================================== */}
      {/* TAB 5: LOW STOCK ALERTS */}
      {/* ========================================================== */}
      {activeTab === 'alerts' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Automated Low Stock & Out-of-Stock Alert Triggers
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Items where Available Stock ≤ Configured Minimum Threshold
                </p>
              </div>
              <button
                onClick={() => fetchDataForTab()}
                className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-slate-900"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">Item Code</th>
                    <th className="py-3 px-4">Item Name</th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4 text-right">Available Stock</th>
                    <th className="py-3 px-4 text-right">Min Stock Threshold</th>
                    <th className="py-3 px-4 text-right">Reorder Qty</th>
                    <th className="py-3 px-4">Alert Severity</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {alerts.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-16 text-center text-slate-400">
                        <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                        <p className="font-semibold text-slate-800 text-sm">All Stock Thresholds Nominal</p>
                        <p className="text-xs text-slate-400 mt-1">No items currently below configured minimum levels.</p>
                      </td>
                    </tr>
                  ) : (
                    alerts.map((al) => {
                      const fullItem = items.find(i => i.id === al.item_id);
                      return (
                        <tr key={al.item_id} className="hover:bg-slate-50/60">
                          <td className="py-3 px-4 font-mono font-medium text-slate-800">{al.item_code}</td>
                          <td className="py-3 px-4 font-semibold text-slate-900">{al.item_name}</td>
                          <td className="py-3 px-4 text-slate-600">{al.category_name || 'General'}</td>
                          <td className="py-3 px-4 text-right font-extrabold tabular-nums text-rose-700">
                            {al.quantity_on_hand} {al.uom_symbol || ''}
                          </td>
                          <td className="py-3 px-4 text-right tabular-nums text-slate-600">{al.min_stock_level}</td>
                          <td className="py-3 px-4 text-right tabular-nums text-slate-600">{al.reorder_quantity}</td>
                          <td className="py-3 px-4">
                            <span className={`text-xs font-bold ${al.status === 'out_of_stock' ? 'text-rose-600' : 'text-amber-600'}`}>
                              {al.status === 'out_of_stock' ? 'Out of Stock' : 'Low Stock'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <button
                              onClick={() => {
                                if (fullItem) {
                                  openReorderModal(fullItem);
                                } else {
                                  // Fetch genuine item record from backend
                                  api.getItem(al.item_id).then(res => {
                                    if (res.data) {
                                      openReorderModal(res.data);
                                    }
                                  }).catch(() => {
                                    setErrorMsg(`Failed to load details for item ${al.item_code}`);
                                  });
                                }
                              }}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500 text-white hover:bg-amber-600 shadow-xs"
                            >
                              <ShoppingCart className="w-3.5 h-3.5" />
                              Reorder
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================== */}
      {/* TAB 6: ONLINE REORDERS & NEGOTIATIONS */}
      {/* ========================================================== */}
      {activeTab === 'reorders' && (
        <div className="space-y-4">
          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-500 font-semibold">Filter Status:</span>
              <select
                value={reorderStatusFilter}
                onChange={(e) => setReorderStatusFilter(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-sky-500"
              >
                <option value="all">All Statuses</option>
                <option value="pending_supplier_response">Pending Supplier Response</option>
                <option value="counteroffer_received">Counteroffer Awaiting Review</option>
                <option value="accepted">Accepted</option>
                <option value="rejected">Rejected</option>
                <option value="revised_offer">Revised Offer</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>

            <button
              onClick={() => fetchDataForTab()}
              className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-slate-900"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">Reorder No</th>
                    <th className="py-3 px-4">Item / Product</th>
                    <th className="py-3 px-4">Supplier</th>
                    <th className="py-3 px-4 text-right">Quantity</th>
                    <th className="py-3 px-4 text-right">Unit Price</th>
                    <th className="py-3 px-4 text-right">Total Amount</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Negotiation / Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {reorders.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-16 text-center text-slate-400">
                        <ShoppingCart className="w-10 h-10 text-slate-300 stroke-1 mx-auto mb-2" />
                        <p className="font-semibold text-slate-700 text-sm">No reorder requests found</p>
                        <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                          When inventory items reach low-stock thresholds, click "Reorder" from Items Master or Low Stock Alerts to initiate online supplier negotiations.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    reorders.map((r) => {
                      const hasCounter = r.status === 'counteroffer_received';

                      return (
                        <tr key={r.id} className="hover:bg-slate-50/60">
                          <td className="py-3 px-4 font-mono font-bold text-slate-900">{r.reorder_no}</td>
                          <td className="py-3 px-4">
                            <span className="font-semibold text-slate-900 block">{r.item_name}</span>
                            <span className="text-[10px] text-slate-400 font-mono">{r.item_code}</span>
                          </td>
                          <td className="py-3 px-4">
                            <span className="font-medium text-slate-800 block">{r.supplier_name}</span>
                            <span className="text-[10px] text-slate-400">{r.supplier_email}</span>
                          </td>
                          <td className="py-3 px-4 text-right font-semibold tabular-nums text-slate-800">
                            {r.quantity}
                          </td>
                          <td className="py-3 px-4 text-right tabular-nums text-slate-700">
                            ₹{r.unit_price?.toFixed(2)}
                          </td>
                          <td className="py-3 px-4 text-right font-bold tabular-nums text-slate-900">
                            ₹{r.total_amount?.toFixed(2)}
                          </td>
                          <td className="py-3 px-4">
                            <span className={`text-xs font-semibold ${
                              r.status === 'accepted'
                                ? 'text-emerald-700'
                                : r.status === 'counteroffer_received'
                                ? 'text-amber-700 font-bold'
                                : r.status === 'rejected' || r.status === 'cancelled'
                                ? 'text-rose-700'
                                : 'text-sky-700'
                            }`}>
                              {r.status.replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              {hasCounter && (
                                <button
                                  onClick={() => {
                                    setReviewReorder(r);
                                    setRevisePrice(r.counter_unit_price?.toString() || r.unit_price.toString());
                                    setReviseQty(r.counter_quantity?.toString() || r.quantity.toString());
                                    setReviseDate(r.counter_delivery_date || r.expected_delivery_date || '');
                                  }}
                                  className="px-2.5 py-1 rounded-md text-[11px] font-bold bg-amber-500 text-white hover:bg-amber-600 shadow-xs"
                                >
                                  Review Counteroffer
                                </button>
                              )}

                              <button
                                onClick={() => handleResendLink(r.id)}
                                className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100"
                                title="Resend Notification / Copy Link"
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </button>

                              {r.status !== 'accepted' && r.status !== 'cancelled' && (
                                <button
                                  onClick={() => {
                                    setReviewReorder(r);
                                  }}
                                  className="p-1.5 rounded-md text-slate-500 hover:text-sky-600 hover:bg-sky-50"
                                  title="View Negotiations / Actions"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================== */}
      {/* TAB 7: TAXONOMIES & LOCATIONS */}
      {/* ========================================================== */}
      {activeTab === 'categories' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Categories Card */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  <FolderTree className="w-4 h-4 text-sky-600" />
                  Item Categories ({categories.length})
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">Manage hierarchical product taxonomies</p>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={handleExportCategories}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors"
                  title="Export categories to Excel"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-600" />
                  Export Excel
                </button>
                <button
                  type="button"
                  onClick={() => setIsCatImportOpen(true)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors"
                  title="Import categories from Excel"
                >
                  <Upload className="w-3.5 h-3.5 text-sky-600" />
                  Import Excel
                </button>
              </div>
            </div>

            {/* Search and Status Filters */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search code, name, description..."
                  value={categorySearchQuery}
                  onChange={(e) => setCategorySearchQuery(e.target.value)}
                  className="w-full pl-8 pr-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:bg-white focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <select
                value={categoryStatusFilter}
                onChange={(e) => setCategoryStatusFilter(e.target.value)}
                className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:bg-white focus:ring-2 focus:ring-sky-500"
              >
                <option value="all">All Statuses</option>
                <option value="active">Active Only</option>
                <option value="disabled">Disabled Only</option>
              </select>
            </div>

            {/* Quick Add Form */}
            <form onSubmit={handleCreateCategory} className="space-y-2 bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs">
              <span className="font-semibold text-slate-700 block text-[11px] uppercase tracking-wider">Add New Category</span>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  required
                  placeholder="Code (e.g. ELEC)"
                  value={newCatCode}
                  onChange={(e) => setNewCatCode(e.target.value)}
                  className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-md font-mono"
                />
                <input
                  type="text"
                  required
                  placeholder="Category Name"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-md"
                />
              </div>
              <input
                type="text"
                placeholder="Optional description"
                value={newCatDesc}
                onChange={(e) => setNewCatDesc(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-md"
              />
              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  className="px-3 py-1.5 bg-sky-600 text-white font-semibold rounded-md hover:bg-sky-700 text-xs shadow-xs"
                >
                  Create Category
                </button>
              </div>
            </form>

            {/* Category Items List */}
            <div className="divide-y divide-slate-100 text-xs max-h-[380px] overflow-y-auto pr-1">
              {categories.length === 0 ? (
                <div className="py-8 text-center text-slate-400">
                  No categories match your search or filter criteria.
                </div>
              ) : (
                categories.map((c) => (
                  <div key={c.id} className="py-2.5 flex items-center justify-between gap-2 hover:bg-slate-50/60 px-1 rounded-md transition-colors">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-800 truncate">{c.name}</span>
                        <span className="font-mono text-slate-500 text-[10px] bg-slate-100 px-1.5 py-0.5 rounded">
                          {c.code}
                        </span>
                        <span
                          className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${
                            c.is_active
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-slate-100 text-slate-600 border border-slate-200'
                          }`}
                        >
                          {c.is_active ? 'Active' : 'Disabled'}
                        </span>
                      </div>
                      {c.description && <p className="text-[11px] text-slate-500 mt-0.5 truncate">{c.description}</p>}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleToggleCategoryActive(c)}
                        className={`px-2 py-1 text-[10px] font-semibold rounded-md border transition-colors ${
                          c.is_active
                            ? 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'
                            : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                        }`}
                        title={c.is_active ? 'Disable category' : 'Activate category'}
                      >
                        {c.is_active ? 'Disable' : 'Activate'}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleOpenEditCategory(c)}
                        className="p-1.5 rounded-md text-slate-500 hover:text-sky-600 hover:bg-sky-50 transition-colors"
                        title="Edit Category"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => setDeleteCatTarget(c)}
                        className="p-1.5 rounded-md text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                        title="Delete Category"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Warehouses / Locations Card */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Building2 className="w-4 h-4 text-sky-600" />
              Warehouse Locations
            </h3>

            <form onSubmit={handleCreateWarehouse} className="space-y-3 bg-slate-50 p-3.5 rounded-lg border border-slate-200 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  required
                  placeholder="Code (e.g. WH-MAIN)"
                  value={newWhCode}
                  onChange={(e) => setNewWhCode(e.target.value)}
                  className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-md font-mono"
                />
                <input
                  type="text"
                  required
                  placeholder="Warehouse Name"
                  value={newWhName}
                  onChange={(e) => setNewWhName(e.target.value)}
                  className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-md"
                />
              </div>
              <input
                type="text"
                placeholder="Address / Facility Location"
                value={newWhAddress}
                onChange={(e) => setNewWhAddress(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-md"
              />
              <div className="flex justify-end">
                <button
                  type="submit"
                  className="px-3 py-1.5 bg-sky-600 text-white font-semibold rounded-md hover:bg-sky-700"
                >
                  Add Warehouse
                </button>
              </div>
            </form>

            <div className="divide-y divide-slate-100 text-xs">
              {warehouses.map((w) => (
                <div key={w.id} className="py-2.5 flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-slate-800">{w.name}</span>
                    <span className="font-mono text-slate-400 text-[10px] ml-2">({w.code})</span>
                    {w.address && <p className="text-[11px] text-slate-500 mt-0.5">{w.address}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================== */}
      {/* TAB 8: EXCEL IMPORT / EXPORT HUB */}
      {/* ========================================================== */}
      {activeTab === 'import-export' && (
        <div className="space-y-6">
          {/* Hub Header & Segmented Switcher */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-sky-600" />
                Excel Import & Export Hub
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Bi-directional catalog synchronisation, formula-sanitized exports, and atomic spreadsheet imports
              </p>
            </div>

            {/* Segmented Controls */}
            <div className="inline-flex p-1 bg-slate-100 rounded-lg border border-slate-200 self-start md:self-auto">
              <button
                type="button"
                onClick={() => setHubSection('items')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5 ${
                  hubSection === 'items'
                    ? 'bg-white text-sky-700 shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Package className="w-3.5 h-3.5" />
                Items Catalog
              </button>
              <button
                type="button"
                onClick={() => setHubSection('categories')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5 ${
                  hubSection === 'categories'
                    ? 'bg-white text-sky-700 shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <FolderTree className="w-3.5 h-3.5" />
                Categories Catalog
              </button>
            </div>
          </div>

          {/* ========================================================== */}
          {/* SECTION 1: ITEMS CATALOG WORKSPACE */}
          {/* ========================================================== */}
          {hubSection === 'items' && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Item Template Card */}
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between space-y-4">
                  <div className="space-y-2">
                    <div className="inline-flex p-2 rounded-lg bg-sky-50 text-sky-600">
                      <Download className="w-5 h-5" />
                    </div>
                    <h3 className="text-sm font-bold text-slate-900">Official Items Spreadsheet Template</h3>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      Download the official blank template with verified schema headers: <span className="font-mono text-[11px]">Item Code, Item Name, Category, Unit of Measure, Min Stock Level, Reorder Quantity, Cost Price, Selling Price, Barcode, Status, Description</span>. Zero dummy records.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => api.downloadInventoryTemplate()}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800 transition-colors shadow-xs"
                  >
                    <Download className="w-4 h-4" />
                    Download Items Template (.xlsx)
                  </button>
                </div>

                {/* Item Export Card */}
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between space-y-4">
                  <div className="space-y-2">
                    <div className="inline-flex p-2 rounded-lg bg-emerald-50 text-emerald-600">
                      <FileSpreadsheet className="w-5 h-5" />
                    </div>
                    <h3 className="text-sm font-bold text-slate-900">Export Items Master to Excel</h3>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      Generates an Excel spreadsheet containing active and disabled catalog items, aggregated warehouse balances, and unit prices. All text cells are formula-injection sanitized.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleExportItems}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 transition-colors shadow-xs"
                  >
                    <Download className="w-4 h-4" />
                    Export Full Items Catalog (.xlsx)
                  </button>
                </div>
              </div>

              {/* Items Import Workspace */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <Upload className="w-4 h-4 text-sky-600" />
                      Import Items from Spreadsheet
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Upload .xlsx file. Stock balances are preserved and never modified by item master imports.
                    </p>
                  </div>
                  {importPreview && (
                    <button
                      type="button"
                      onClick={() => {
                        setImportPreview(null);
                        setImportFile(null);
                      }}
                      className="text-xs text-slate-500 hover:text-slate-800 underline"
                    >
                      Clear & Choose Another File
                    </button>
                  )}
                </div>

                <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center hover:border-sky-400 transition-colors bg-slate-50/50">
                  <input
                    type="file"
                    accept=".xlsx, .xls"
                    onChange={handleExcelFileChange}
                    className="hidden"
                    id="hub-item-excel-input"
                  />
                  <label htmlFor="hub-item-excel-input" className="cursor-pointer flex flex-col items-center gap-2">
                    <Upload className="w-10 h-10 text-slate-400" />
                    <span className="font-bold text-sm text-slate-700">
                      {importFile ? importFile.name : 'Select or drop items spreadsheet (.xlsx)'}
                    </span>
                    <span className="text-xs text-slate-400">
                      Standard columns: Item Code, Item Name, Category, Unit of Measure, etc.
                    </span>
                  </label>
                </div>

                {importPreview && (
                  <div className="space-y-4 pt-2">
                    {/* Summary Counters */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-center">
                        <span className="text-[10px] text-slate-500 font-semibold uppercase">Total Rows</span>
                        <p className="text-lg font-bold text-slate-800 tabular-nums mt-0.5">{importPreview.total_rows}</p>
                      </div>
                      <div className="bg-emerald-50 p-3 rounded-lg border border-emerald-200 text-center">
                        <span className="text-[10px] text-emerald-700 font-semibold uppercase">Valid Records</span>
                        <p className="text-lg font-bold text-emerald-700 tabular-nums mt-0.5">{importPreview.valid_rows}</p>
                      </div>
                      <div className="bg-amber-50 p-3 rounded-lg border border-amber-200 text-center">
                        <span className="text-[10px] text-amber-700 font-semibold uppercase">Existing SKU Duplicates</span>
                        <p className="text-lg font-bold text-amber-700 tabular-nums mt-0.5">{importPreview.duplicate_rows}</p>
                      </div>
                      <div className="bg-rose-50 p-3 rounded-lg border border-rose-200 text-center">
                        <span className="text-[10px] text-rose-700 font-semibold uppercase">Invalid Rows</span>
                        <p className="text-lg font-bold text-rose-700 tabular-nums mt-0.5">{importPreview.invalid_rows}</p>
                      </div>
                    </div>

                    {/* Duplicate Strategy & Commit Row */}
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-800 block">
                          Handling for Existing Item Codes (Duplicates)
                        </label>
                        <select
                          value={duplicatePolicy}
                          onChange={(e) => setDuplicatePolicy(e.target.value as 'skip' | 'update')}
                          className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-medium focus:ring-2 focus:ring-sky-500"
                        >
                          <option value="skip">Skip duplicates (preserve existing records)</option>
                          <option value="update">Update existing records with new spreadsheet values</option>
                        </select>
                      </div>

                      <button
                        type="button"
                        onClick={handleCommitItemImport}
                        disabled={importPreview.valid_rows === 0 || isImporting}
                        className="px-5 py-2.5 bg-sky-600 text-white rounded-lg text-xs font-bold hover:bg-sky-700 disabled:opacity-40 transition-colors shadow-xs"
                      >
                        {isImporting ? 'Processing Import...' : `Commit ${importPreview.valid_rows} Valid Item(s)`}
                      </button>
                    </div>

                    {/* Preview Table */}
                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                      <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-700 flex items-center justify-between">
                        <span>Spreadsheet Rows Validation Preview</span>
                        <span className="text-slate-400 font-normal text-[11px]">Showing parsed rows</span>
                      </div>
                      <div className="max-h-72 overflow-y-auto overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 sticky top-0">
                            <tr>
                              <th className="py-2 px-3">Row</th>
                              <th className="py-2 px-3">Code</th>
                              <th className="py-2 px-3">Name</th>
                              <th className="py-2 px-3">Category</th>
                              <th className="py-2 px-3">UOM</th>
                              <th className="py-2 px-3 text-right">Cost</th>
                              <th className="py-2 px-3 text-right">Price</th>
                              <th className="py-2 px-3">Status</th>
                              <th className="py-2 px-3">Validation Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {importPreview.preview_items?.map((it: any) => (
                              <tr key={it.row_number} className={`hover:bg-slate-50/50 ${!it.is_valid ? 'bg-rose-50/30' : ''}`}>
                                <td className="py-2 px-3 font-mono text-slate-400">#{it.row_number}</td>
                                <td className="py-2 px-3 font-mono font-bold text-slate-900">{it.code || '—'}</td>
                                <td className="py-2 px-3 font-medium text-slate-800">{it.name || '—'}</td>
                                <td className="py-2 px-3 text-slate-600">{it.category || '—'}</td>
                                <td className="py-2 px-3 text-slate-600">{it.uom || '—'}</td>
                                <td className="py-2 px-3 text-right tabular-nums">₹{it.cost_price || 0}</td>
                                <td className="py-2 px-3 text-right tabular-nums">₹{it.selling_price || 0}</td>
                                <td className="py-2 px-3 capitalize">{it.status}</td>
                                <td className="py-2 px-3">
                                  {it.is_valid ? (
                                    it.is_duplicate ? (
                                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                        Existing SKU ({duplicatePolicy === 'update' ? 'Will Update' : 'Will Skip'})
                                      </span>
                                    ) : (
                                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                        Ready to Create
                                      </span>
                                    )
                                  ) : (
                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200" title={it.errors?.join(', ')}>
                                      Invalid: {it.errors?.join('; ')}
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ========================================================== */}
          {/* SECTION 2: CATEGORIES CATALOG WORKSPACE */}
          {/* ========================================================== */}
          {hubSection === 'categories' && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Category Template Card */}
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between space-y-4">
                  <div className="space-y-2">
                    <div className="inline-flex p-2 rounded-lg bg-sky-50 text-sky-600">
                      <Download className="w-5 h-5" />
                    </div>
                    <h3 className="text-sm font-bold text-slate-900">Official Categories Spreadsheet Template</h3>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      Download the official blank template with verified schema headers: <span className="font-mono text-[11px]">Category Code, Category Name, Description, Status</span>. Free of demo or fake categories.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => api.downloadCategoryTemplate()}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800 transition-colors shadow-xs"
                  >
                    <Download className="w-4 h-4" />
                    Download Categories Template (.xlsx)
                  </button>
                </div>

                {/* Category Export Card */}
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between space-y-4">
                  <div className="space-y-2">
                    <div className="inline-flex p-2 rounded-lg bg-emerald-50 text-emerald-600">
                      <FolderTree className="w-5 h-5" />
                    </div>
                    <h3 className="text-sm font-bold text-slate-900">Export Categories to Excel</h3>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      Export all item categories with active status, code identifiers, and descriptions. Output files are sanitized against formula injection.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleExportCategories}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 transition-colors shadow-xs"
                  >
                    <Download className="w-4 h-4" />
                    Export Categories Catalog (.xlsx)
                  </button>
                </div>
              </div>

              {/* Categories Import Workspace */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <Upload className="w-4 h-4 text-sky-600" />
                      Import Categories from Spreadsheet
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Upload category hierarchy spreadsheet. Supports duplicate code detection and update policies.
                    </p>
                  </div>
                  {catImportPreview && (
                    <button
                      type="button"
                      onClick={() => {
                        setCatImportPreview(null);
                        setCatImportFile(null);
                      }}
                      className="text-xs text-slate-500 hover:text-slate-800 underline"
                    >
                      Clear & Choose Another File
                    </button>
                  )}
                </div>

                <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center hover:border-sky-400 transition-colors bg-slate-50/50">
                  <input
                    type="file"
                    accept=".xlsx, .xls"
                    onChange={handleCatExcelFileChange}
                    className="hidden"
                    id="hub-cat-excel-input"
                  />
                  <label htmlFor="hub-cat-excel-input" className="cursor-pointer flex flex-col items-center gap-2">
                    <Upload className="w-10 h-10 text-slate-400" />
                    <span className="font-bold text-sm text-slate-700">
                      {catImportFile ? catImportFile.name : 'Select or drop categories spreadsheet (.xlsx)'}
                    </span>
                    <span className="text-xs text-slate-400">
                      Standard columns: Category Code, Category Name, Description, Status
                    </span>
                  </label>
                </div>

                {catImportPreview && (
                  <div className="space-y-4 pt-2">
                    {/* Summary Counters */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-center">
                        <span className="text-[10px] text-slate-500 font-semibold uppercase">Total Rows</span>
                        <p className="text-lg font-bold text-slate-800 tabular-nums mt-0.5">{catImportPreview.total_rows}</p>
                      </div>
                      <div className="bg-emerald-50 p-3 rounded-lg border border-emerald-200 text-center">
                        <span className="text-[10px] text-emerald-700 font-semibold uppercase">Valid Categories</span>
                        <p className="text-lg font-bold text-emerald-700 tabular-nums mt-0.5">{catImportPreview.valid_rows}</p>
                      </div>
                      <div className="bg-amber-50 p-3 rounded-lg border border-amber-200 text-center">
                        <span className="text-[10px] text-amber-700 font-semibold uppercase">Existing Duplicates</span>
                        <p className="text-lg font-bold text-amber-700 tabular-nums mt-0.5">{catImportPreview.duplicate_rows}</p>
                      </div>
                      <div className="bg-rose-50 p-3 rounded-lg border border-rose-200 text-center">
                        <span className="text-[10px] text-rose-700 font-semibold uppercase">Invalid Rows</span>
                        <p className="text-lg font-bold text-rose-700 tabular-nums mt-0.5">{catImportPreview.invalid_rows}</p>
                      </div>
                    </div>

                    {/* Duplicate Strategy & Commit Row */}
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-800 block">
                          Handling for Existing Category Codes (Duplicates)
                        </label>
                        <select
                          value={catDuplicatePolicy}
                          onChange={(e) => setCatDuplicatePolicy(e.target.value as 'skip' | 'update')}
                          className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-medium focus:ring-2 focus:ring-sky-500"
                        >
                          <option value="skip">Skip duplicates (preserve existing records)</option>
                          <option value="update">Update existing records with new spreadsheet values</option>
                        </select>
                      </div>

                      <button
                        type="button"
                        onClick={handleCommitCatImport}
                        disabled={catImportPreview.valid_rows === 0 || isCatImporting}
                        className="px-5 py-2.5 bg-sky-600 text-white rounded-lg text-xs font-bold hover:bg-sky-700 disabled:opacity-40 transition-colors shadow-xs"
                      >
                        {isCatImporting ? 'Processing Import...' : `Commit ${catImportPreview.valid_rows} Valid Category(s)`}
                      </button>
                    </div>

                    {/* Preview Table */}
                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                      <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-700 flex items-center justify-between">
                        <span>Spreadsheet Categories Validation Preview</span>
                        <span className="text-slate-400 font-normal text-[11px]">Showing parsed rows</span>
                      </div>
                      <div className="max-h-72 overflow-y-auto overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 sticky top-0">
                            <tr>
                              <th className="py-2 px-3">Row</th>
                              <th className="py-2 px-3">Category Code</th>
                              <th className="py-2 px-3">Category Name</th>
                              <th className="py-2 px-3">Description</th>
                              <th className="py-2 px-3">Status</th>
                              <th className="py-2 px-3">Validation Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {catImportPreview.preview_categories?.map((c: any) => (
                              <tr key={c.row_number} className={`hover:bg-slate-50/50 ${!c.is_valid ? 'bg-rose-50/30' : ''}`}>
                                <td className="py-2 px-3 font-mono text-slate-400">#{c.row_number}</td>
                                <td className="py-2 px-3 font-mono font-bold text-slate-900">{c.code || '—'}</td>
                                <td className="py-2 px-3 font-medium text-slate-800">{c.name || '—'}</td>
                                <td className="py-2 px-3 text-slate-600 max-w-xs truncate">{c.description || '—'}</td>
                                <td className="py-2 px-3 capitalize">{c.status}</td>
                                <td className="py-2 px-3">
                                  {c.is_valid ? (
                                    c.is_duplicate ? (
                                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                        Existing Code ({catDuplicatePolicy === 'update' ? 'Will Update' : 'Will Skip'})
                                      </span>
                                    ) : (
                                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                        Ready to Create
                                      </span>
                                    )
                                  ) : (
                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200" title={c.errors?.join(', ')}>
                                      Invalid: {c.errors?.join('; ')}
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================== */}
      {/* MANDATORY POPUP: REORDER POPUP MODAL */}
      {/* ========================================================== */}
      {reorderModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Online Supplier Reorder Request
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Automated reorder dispatch with protected supplier negotiation link
                </p>
              </div>
              <button
                onClick={() => {
                  setReorderModalItem(null);
                  setGeneratedReorderResult(null);
                }}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* If Already Generated in this turn */}
            {generatedReorderResult ? (
              <div className="p-6 space-y-4 text-xs">
                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 space-y-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
                    <span className="font-bold text-sm">
                      Reorder {generatedReorderResult.reorder_no} Dispatched
                    </span>
                  </div>
                  <p className="text-xs">
                    An email notification with the secure link was queued for{' '}
                    <strong>{generatedReorderResult.supplier_email || 'the vendor'}</strong>.
                  </p>
                </div>

                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                  <span className="font-semibold text-slate-700 block">
                    Protected Supplier Confirmation Link:
                  </span>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={generatedReorderResult.supplier_link || ''}
                      className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-lg font-mono text-[11px]"
                    />
                    <button
                      type="button"
                      onClick={() => copyToClipboard(generatedReorderResult.supplier_link || '')}
                      className="px-3 py-2 bg-slate-800 text-white rounded-lg font-semibold hover:bg-slate-700 shrink-0"
                    >
                      {copiedLink === generatedReorderResult.supplier_link ? 'Copied!' : 'Copy Link'}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    You can open this link in a new tab to test the supplier response immediately without external email.
                  </p>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <a
                    href={generatedReorderResult.supplier_link}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-sky-600 text-white rounded-lg font-semibold hover:bg-sky-700"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Open Supplier Portal View
                  </a>
                  <button
                    onClick={() => {
                      setReorderModalItem(null);
                      setGeneratedReorderResult(null);
                      setActiveTab('reorders');
                    }}
                    className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-semibold"
                  >
                    View in Reorders Tab
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleDispatchReorder} className="p-6 space-y-4 text-xs">
                {/* Item Summary Grid */}
                <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                  <div>
                    <span className="text-slate-400 text-[10px]">Item Code / SKU</span>
                    <p className="font-mono font-bold text-slate-800 mt-0.5">{reorderModalItem.code}</p>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px]">Item Name</span>
                    <p className="font-semibold text-slate-800 mt-0.5 truncate">{reorderModalItem.name}</p>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px]">Available Stock</span>
                    <p className="font-bold text-rose-600 mt-0.5 tabular-nums">
                      {reorderModalItem.total_on_hand} {reorderModalItem.uom_symbol || ''}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px]">Min Threshold</span>
                    <p className="font-bold text-slate-800 mt-0.5 tabular-nums">
                      {reorderModalItem.min_stock_level}
                    </p>
                  </div>
                </div>

                {/* Supplier Selection */}
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Select Registered Supplier <span className="text-rose-500">*</span>
                  </label>
                  <select
                    required
                    value={reorderSupplierId}
                    onChange={(e) => setReorderSupplierId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-sky-500"
                  >
                    <option value="">-- Choose Supplier from Directory --</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.code}) - {s.email}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Supplier Email from PostgreSQL */}
                {selectedSupplier && (
                  <div className="p-3 rounded-lg bg-sky-50/60 border border-sky-100 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-sky-700 font-semibold uppercase tracking-wider block">
                        Verified Supplier Email (from Database)
                      </span>
                      <p className="font-mono font-medium text-slate-900 mt-0.5">
                        {selectedSupplier.email || 'No email recorded'}
                      </p>
                    </div>
                    <span className="text-[10px] text-slate-400">
                      Contact: {selectedSupplier.contact_first_name} {selectedSupplier.contact_last_name}
                    </span>
                  </div>
                )}

                {/* Reorder Details Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Reorder Quantity <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="number"
                      step="1"
                      required
                      value={reorderQty}
                      onChange={(e) => setReorderQty(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-mono focus:bg-white focus:ring-2 focus:ring-sky-500"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Proposed Unit Price (₹) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={reorderUnitPrice}
                      onChange={(e) => setReorderUnitPrice(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-mono focus:bg-white focus:ring-2 focus:ring-sky-500"
                    />
                  </div>
                </div>

                {/* Calculated Order Total */}
                <div className="p-3 bg-slate-900 text-white rounded-lg flex items-center justify-between">
                  <span className="text-slate-300 font-medium">Calculated Order Total:</span>
                  <span className="text-base font-extrabold font-mono text-sky-400">
                    ₹{((parseFloat(reorderQty) || 0) * (parseFloat(reorderUnitPrice) || 0)).toFixed(2)}
                  </span>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Expected Delivery Date
                  </label>
                  <input
                    type="date"
                    value={reorderDate}
                    onChange={(e) => setReorderDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-sky-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Buyer Notes & Special Instructions
                  </label>
                  <textarea
                    rows={2}
                    value={reorderNotes}
                    onChange={(e) => setReorderNotes(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-sky-500"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => setReorderModalItem(null)}
                    className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isDispatchingReorder}
                    className="px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 font-semibold disabled:opacity-50 inline-flex items-center gap-1.5"
                  >
                    <Send className="w-3.5 h-3.5" />
                    {isDispatchingReorder ? 'Dispatching...' : 'Dispatch Online Reorder'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ========================================================== */}
      {/* REVIEW COUNTEROFFER / REORDER DETAILS MODAL */}
      {/* ========================================================== */}
      {reviewReorder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Reorder Negotiation: {reviewReorder.reorder_no}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Item: {reviewReorder.item_name} ({reviewReorder.item_code}) · Supplier: {reviewReorder.supplier_name}
                </p>
              </div>
              <button onClick={() => setReviewReorder(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5 text-xs">
              {/* Side-by-Side Comparison if Counteroffer */}
              {reviewReorder.status === 'counteroffer_received' ? (
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                      Original Buyer Proposal
                    </span>
                    <div className="space-y-1 font-mono text-xs">
                      <div>Quantity: <strong>{reviewReorder.quantity}</strong></div>
                      <div>Unit Price: <strong>₹{reviewReorder.unit_price.toFixed(2)}</strong></div>
                      <div>Total: <strong>₹{reviewReorder.total_amount.toFixed(2)}</strong></div>
                      <div>Delivery: {reviewReorder.expected_delivery_date || 'Standard'}</div>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 space-y-2">
                    <span className="text-[11px] font-bold text-amber-700 uppercase tracking-wider block">
                      Supplier Counteroffer
                    </span>
                    <div className="space-y-1 font-mono text-xs">
                      <div>Quantity: <strong>{reviewReorder.counter_quantity}</strong></div>
                      <div>Unit Price: <strong>₹{reviewReorder.counter_unit_price?.toFixed(2)}</strong></div>
                      <div>Total: <strong>₹{((reviewReorder.counter_quantity || 0) * (reviewReorder.counter_unit_price || 0)).toFixed(2)}</strong></div>
                      <div>Delivery: {reviewReorder.counter_delivery_date || 'Standard'}</div>
                    </div>
                    {reviewReorder.supplier_response_notes && (
                      <p className="text-[11px] italic mt-2 text-amber-800">
                        "{reviewReorder.supplier_response_notes}"
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <span className="text-slate-400 text-[10px]">Status</span>
                      <p className="font-bold text-slate-800 capitalize mt-0.5">{reviewReorder.status.replace(/_/g, ' ')}</p>
                    </div>
                    <div>
                      <span className="text-slate-400 text-[10px]">Quantity</span>
                      <p className="font-bold text-slate-800 mt-0.5">{reviewReorder.quantity}</p>
                    </div>
                    <div>
                      <span className="text-slate-400 text-[10px]">Total Amount</span>
                      <p className="font-bold text-sky-700 mt-0.5">₹{reviewReorder.total_amount?.toFixed(2)}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Actions Available for Counteroffer */}
              {reviewReorder.status === 'counteroffer_received' && (
                <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-4">
                  <h4 className="font-bold text-slate-800">Buyer Decision</h4>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={isActingOnReorder}
                      onClick={() => handleAcceptCounteroffer(reviewReorder.id)}
                      className="px-4 py-2 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700 text-xs shadow-xs"
                    >
                      Accept Counteroffer Terms
                    </button>
                  </div>

                  <form onSubmit={handleReviseOffer} className="pt-3 border-t border-slate-200 space-y-3">
                    <h5 className="font-semibold text-slate-700">Or Counter-Propose (Revise Offer):</h5>
                    <div className="grid grid-cols-3 gap-2">
                      <input
                        type="number"
                        step="0.01"
                        required
                        placeholder="New Unit Price"
                        value={revisePrice}
                        onChange={(e) => setRevisePrice(e.target.value)}
                        className="px-2.5 py-1.5 border border-slate-200 rounded-md font-mono text-xs"
                      />
                      <input
                        type="number"
                        step="1"
                        required
                        placeholder="New Quantity"
                        value={reviseQty}
                        onChange={(e) => setReviseQty(e.target.value)}
                        className="px-2.5 py-1.5 border border-slate-200 rounded-md font-mono text-xs"
                      />
                      <input
                        type="date"
                        value={reviseDate}
                        onChange={(e) => setReviseDate(e.target.value)}
                        className="px-2.5 py-1.5 border border-slate-200 rounded-md text-xs"
                      />
                    </div>
                    <textarea
                      rows={2}
                      placeholder="Notes explaining your revised proposal"
                      value={reviseNotes}
                      onChange={(e) => setReviseNotes(e.target.value)}
                      className="w-full px-2.5 py-1.5 border border-slate-200 rounded-md text-xs"
                    />
                    <button
                      type="submit"
                      disabled={isActingOnReorder}
                      className="px-3 py-1.5 bg-amber-600 text-white font-semibold rounded-md text-xs hover:bg-amber-700"
                    >
                      Send Revised Proposal
                    </button>
                  </form>
                </div>
              )}

              {/* Cancellation */}
              {reviewReorder.status !== 'accepted' && reviewReorder.status !== 'cancelled' && (
                <div className="pt-2 border-t border-slate-100 flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Cancellation reason..."
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  />
                  <button
                    type="button"
                    disabled={isActingOnReorder}
                    onClick={() => handleCancelReorder(reviewReorder.id)}
                    className="px-3 py-1.5 bg-rose-600 text-white rounded-lg font-semibold hover:bg-rose-700 text-xs shrink-0"
                  >
                    Cancel Reorder
                  </button>
                </div>
              )}
            </div>

            <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setReviewReorder(null)}
                className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-100 text-xs font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================== */}
      {/* VIEW ITEM DETAILS MODAL */}
      {/* ========================================================== */}
      {viewItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">{viewItem.name}</h3>
                <p className="text-xs font-mono text-slate-500 mt-0.5">{viewItem.code}</p>
              </div>
              <button onClick={() => setViewItem(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                  <span className="text-slate-400 text-[10px]">On Hand</span>
                  <p className="text-base font-bold text-slate-900 tabular-nums">{viewItem.total_on_hand}</p>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                  <span className="text-slate-400 text-[10px]">Min Stock</span>
                  <p className="text-base font-bold text-slate-900 tabular-nums">{viewItem.min_stock_level}</p>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                  <span className="text-slate-400 text-[10px]">Cost Price</span>
                  <p className="text-base font-bold text-slate-900 tabular-nums">₹{viewItem.cost_price?.toFixed(2)}</p>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                  <span className="text-slate-400 text-[10px]">Selling Price</span>
                  <p className="text-base font-bold text-slate-900 tabular-nums">₹{viewItem.selling_price?.toFixed(2)}</p>
                </div>
              </div>

              {/* Warehouse Balances */}
              <div>
                <h4 className="font-bold text-slate-800 mb-2">Warehouse Stock Balances</h4>
                {(!viewItem.balances || viewItem.balances.length === 0) ? (
                  <p className="text-slate-400 italic">No inventory currently held in any warehouse.</p>
                ) : (
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
                    {viewItem.balances.map((b) => (
                      <div key={b.warehouse_id} className="p-2.5 flex items-center justify-between">
                        <div>
                          <span className="font-medium text-slate-800">{b.warehouse_name}</span>
                          <span className="text-[10px] font-mono text-slate-400 ml-2">({b.warehouse_code})</span>
                        </div>
                        <span className="font-bold text-slate-900 tabular-nums">{b.quantity}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {viewItem.description && (
                <div>
                  <span className="font-semibold text-slate-600 block mb-1">Description</span>
                  <p className="text-slate-700 bg-slate-50 p-2.5 rounded-lg border border-slate-100">{viewItem.description}</p>
                </div>
              )}
            </div>

            <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setViewItem(null)}
                className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-100 text-xs font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================== */}
      {/* ADD / EDIT ITEM MASTER MODAL */}
      {/* ========================================================== */}
      {(isAddItemOpen || editItem) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-900">
                {editItem ? `Edit Item: ${editItem.name}` : 'Register New Inventory Item'}
              </h3>
              <button
                onClick={() => {
                  setIsAddItemOpen(false);
                  setEditItem(null);
                }}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveItem} className="p-6 space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Item Code / SKU <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={itemForm.code}
                    onChange={(e) => setItemForm({ ...itemForm, code: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-mono focus:bg-white focus:ring-2 focus:ring-sky-500"
                    placeholder="SKU-00001"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Item Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={itemForm.name}
                    onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-sky-500"
                    placeholder="e.g. Hex Bolt M8x20mm"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Category</label>
                  <select
                    value={itemForm.category_id}
                    onChange={(e) => setItemForm({ ...itemForm, category_id: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-sky-500"
                  >
                    <option value="">-- No Category --</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Unit of Measure</label>
                  <select
                    value={itemForm.uom_id}
                    onChange={(e) => setItemForm({ ...itemForm, uom_id: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-sky-500"
                  >
                    <option value="">-- No UOM --</option>
                    {uoms.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.symbol})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Barcode / UPC</label>
                  <input
                    type="text"
                    value={itemForm.barcode}
                    onChange={(e) => setItemForm({ ...itemForm, barcode: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-mono focus:bg-white focus:ring-2 focus:ring-sky-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Status</label>
                  <select
                    value={itemForm.status}
                    onChange={(e) => setItemForm({ ...itemForm, status: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-sky-500"
                  >
                    <option value="active">Active</option>
                    <option value="disabled">Disabled</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Min Stock Threshold</label>
                  <input
                    type="number"
                    step="1"
                    value={itemForm.min_stock_level}
                    onChange={(e) => setItemForm({ ...itemForm, min_stock_level: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-mono focus:bg-white focus:ring-2 focus:ring-sky-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Reorder Quantity</label>
                  <input
                    type="number"
                    step="1"
                    value={itemForm.reorder_quantity}
                    onChange={(e) => setItemForm({ ...itemForm, reorder_quantity: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-mono focus:bg-white focus:ring-2 focus:ring-sky-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Cost Price (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={itemForm.cost_price}
                    onChange={(e) => setItemForm({ ...itemForm, cost_price: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-mono focus:bg-white focus:ring-2 focus:ring-sky-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Selling Price (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={itemForm.selling_price}
                    onChange={(e) => setItemForm({ ...itemForm, selling_price: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-mono focus:bg-white focus:ring-2 focus:ring-sky-500"
                  />
                </div>

                {/* Opening stock when creating new item */}
                {!editItem && (
                  <>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Initial Warehouse</label>
                      <select
                        value={itemForm.initial_warehouse_id}
                        onChange={(e) => setItemForm({ ...itemForm, initial_warehouse_id: e.target.value })}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-sky-500"
                      >
                        <option value="">-- No Opening Stock --</option>
                        {warehouses.map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.name} ({w.code})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Opening Quantity</label>
                      <input
                        type="number"
                        step="1"
                        value={itemForm.initial_quantity}
                        onChange={(e) => setItemForm({ ...itemForm, initial_quantity: e.target.value })}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-mono focus:bg-white focus:ring-2 focus:ring-sky-500"
                      />
                    </div>
                  </>
                )}

                <div className="sm:col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">Description</label>
                  <textarea
                    rows={2}
                    value={itemForm.description}
                    onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddItemOpen(false);
                    setEditItem(null);
                  }}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 font-semibold"
                >
                  {editItem ? 'Update Item' : 'Save Item Master'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================== */}
      {/* DELETE / DISABLE ITEM CONFIRMATION */}
      {/* ========================================================== */}
      {deleteItemTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-md p-6 space-y-4 text-xs">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-full bg-rose-50 text-rose-600">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Confirm Item Removal</h3>
                <p className="text-slate-500 mt-1">
                  Are you sure you want to delete <span className="font-semibold text-slate-800">{deleteItemTarget.name}</span> ({deleteItemTarget.code})?
                </p>
              </div>
            </div>

            <p className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-slate-500">
              Items with recorded stock transactions cannot be permanently erased to maintain ledger audit integrity. You may disable the item instead.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setDeleteItemTarget(null)}
                className="px-3 py-1.5 border border-slate-300 text-slate-700 rounded-lg font-semibold hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteItemConfirm(true)}
                className="px-3 py-1.5 border border-amber-300 bg-amber-50 text-amber-800 rounded-lg font-semibold hover:bg-amber-100"
              >
                Disable Item
              </button>
              <button
                onClick={() => handleDeleteItemConfirm(false)}
                className="px-3 py-1.5 bg-rose-600 text-white rounded-lg font-semibold hover:bg-rose-700"
              >
                Permanent Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================== */}
      {/* IMPORT EXCEL MODAL */}
      {/* ========================================================== */}
      {isImportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-slate-900">Import Inventory Items from Excel</h3>
              <button onClick={() => setIsImportOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <p className="text-slate-600">
                Upload your item catalog spreadsheet in <span className="font-mono">.xlsx</span> format.
              </p>
              <button
                type="button"
                onClick={() => api.downloadInventoryTemplate()}
                className="inline-flex items-center gap-1.5 text-xs text-sky-600 font-semibold hover:underline"
              >
                <Download className="w-3.5 h-3.5" />
                Download Spreadsheet Template
              </button>

              <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center hover:border-sky-400 transition-colors">
                <input
                  type="file"
                  accept=".xlsx, .xls"
                  onChange={handleExcelFileChange}
                  className="hidden"
                  id="item-excel-input"
                />
                <label htmlFor="item-excel-input" className="cursor-pointer flex flex-col items-center gap-2">
                  <Upload className="w-8 h-8 text-slate-400" />
                  <span className="font-semibold text-slate-700">
                    {importFile ? importFile.name : 'Choose Excel spreadsheet'}
                  </span>
                  <span className="text-[11px] text-slate-400">Click to browse file from your computer</span>
                </label>
              </div>

              {importPreview && (
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                  <h4 className="font-bold text-slate-800">Preview Summary</h4>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-white p-2 rounded-lg border border-slate-200">
                      <span className="text-slate-400 text-[10px]">Total Rows</span>
                      <p className="text-sm font-bold text-slate-800 tabular-nums">{importPreview.total_rows}</p>
                    </div>
                    <div className="bg-white p-2 rounded-lg border border-slate-200">
                      <span className="text-slate-400 text-[10px]">Valid</span>
                      <p className="text-sm font-bold text-emerald-600 tabular-nums">{importPreview.valid_rows}</p>
                    </div>
                    <div className="bg-white p-2 rounded-lg border border-slate-200">
                      <span className="text-slate-400 text-[10px]">Duplicates</span>
                      <p className="text-sm font-bold text-amber-600 tabular-nums">{importPreview.duplicate_rows}</p>
                    </div>
                  </div>

                  <div className="pt-2">
                    <label className="block font-semibold text-slate-700 mb-1">Duplicate SKU Policy</label>
                    <select
                      value={duplicatePolicy}
                      onChange={(e) => setDuplicatePolicy(e.target.value as 'skip' | 'update')}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                    >
                      <option value="skip">Skip duplicates (preserve existing records)</option>
                      <option value="update">Update existing records with new spreadsheet values</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setIsImportOpen(false)}
                className="px-3.5 py-1.5 border border-slate-300 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCommitItemImport}
                disabled={!importPreview || importPreview.valid_rows === 0 || isImporting}
                className="px-4 py-1.5 bg-sky-600 text-white rounded-lg text-xs font-semibold hover:bg-sky-700 disabled:opacity-40"
              >
                {isImporting ? 'Importing...' : 'Commit Import'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================== */}
      {/* EDIT CATEGORY MODAL */}
      {/* ========================================================== */}
      {editCategoryTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-md p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-sky-600" />
                Edit Category: {editCategoryTarget.name}
              </h3>
              <button onClick={() => setEditCategoryTarget(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditCategory} className="space-y-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Category Code <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={editCatCode}
                  onChange={(e) => setEditCatCode(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-mono focus:bg-white focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Category Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={editCatName}
                  onChange={(e) => setEditCatName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Description</label>
                <textarea
                  rows={2}
                  value={editCatDesc}
                  onChange={(e) => setEditCatDesc(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="cat-edit-active"
                  checked={editCatActive}
                  onChange={(e) => setEditCatActive(e.target.checked)}
                  className="rounded border-slate-300 text-sky-600 focus:ring-sky-500 h-4 w-4"
                />
                <label htmlFor="cat-edit-active" className="text-slate-700 font-semibold cursor-pointer">
                  Active in Item Catalog
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setEditCategoryTarget(null)}
                  className="px-3.5 py-1.5 border border-slate-300 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-sky-600 text-white rounded-lg text-xs font-semibold hover:bg-sky-700"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================== */}
      {/* DELETE CATEGORY CONFIRMATION MODAL */}
      {/* ========================================================== */}
      {deleteCatTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-md p-6 space-y-4 text-xs">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-full bg-rose-50 text-rose-600 shrink-0">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Confirm Category Deletion</h3>
                <p className="text-slate-500 mt-1">
                  Are you sure you want to permanently delete category <span className="font-semibold text-slate-800">{deleteCatTarget.name}</span> ({deleteCatTarget.code})?
                </p>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 space-y-1">
              <p className="font-semibold text-[11px] uppercase tracking-wider text-amber-800">Data Integrity Notice</p>
              <p className="text-[11px] leading-relaxed">
                Categories referenced by active inventory items cannot be deleted to prevent orphaned SKU records. If items exist, this action will be safely rejected by the database.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDeleteCatTarget(null)}
                className="px-3 py-1.5 border border-slate-300 text-slate-700 rounded-lg font-semibold hover:bg-slate-50 text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeletingCat}
                onClick={handleDeleteCategoryConfirm}
                className="px-4 py-1.5 bg-rose-600 text-white rounded-lg font-semibold hover:bg-rose-700 text-xs disabled:opacity-50"
              >
                {isDeletingCat ? 'Deleting...' : 'Delete Category'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================== */}
      {/* IMPORT CATEGORIES MODAL (Opened from Categories Tab) */}
      {/* ========================================================== */}
      {isCatImportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <FolderTree className="w-5 h-5 text-sky-600" />
                Import Categories from Excel
              </h3>
              <button onClick={() => setIsCatImportOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <p className="text-slate-600">
                Upload your product category list in <span className="font-mono">.xlsx</span> or <span className="font-mono">.xls</span> format.
              </p>
              <button
                type="button"
                onClick={() => api.downloadCategoryTemplate()}
                className="inline-flex items-center gap-1.5 text-xs text-sky-600 font-semibold hover:underline"
              >
                <Download className="w-3.5 h-3.5" />
                Download Blank Category Spreadsheet Template
              </button>

              <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center hover:border-sky-400 transition-colors">
                <input
                  type="file"
                  accept=".xlsx, .xls"
                  onChange={handleCatExcelFileChange}
                  className="hidden"
                  id="cat-modal-excel-input"
                />
                <label htmlFor="cat-modal-excel-input" className="cursor-pointer flex flex-col items-center gap-2">
                  <Upload className="w-8 h-8 text-slate-400" />
                  <span className="font-semibold text-slate-700">
                    {catImportFile ? catImportFile.name : 'Choose Category Excel spreadsheet'}
                  </span>
                  <span className="text-[11px] text-slate-400">Click to browse file from your computer</span>
                </label>
              </div>

              {catImportPreview && (
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                  <h4 className="font-bold text-slate-800">Preview Summary</h4>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-white p-2 rounded-lg border border-slate-200">
                      <span className="text-slate-400 text-[10px]">Total Rows</span>
                      <p className="text-sm font-bold text-slate-800 tabular-nums">{catImportPreview.total_rows}</p>
                    </div>
                    <div className="bg-white p-2 rounded-lg border border-slate-200">
                      <span className="text-slate-400 text-[10px]">Valid</span>
                      <p className="text-sm font-bold text-emerald-600 tabular-nums">{catImportPreview.valid_rows}</p>
                    </div>
                    <div className="bg-white p-2 rounded-lg border border-slate-200">
                      <span className="text-slate-400 text-[10px]">Duplicates</span>
                      <p className="text-sm font-bold text-amber-600 tabular-nums">{catImportPreview.duplicate_rows}</p>
                    </div>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Duplicate Code Policy</label>
                    <select
                      value={catDuplicatePolicy}
                      onChange={(e) => setCatDuplicatePolicy(e.target.value as 'skip' | 'update')}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                    >
                      <option value="skip">Skip duplicates (preserve existing records)</option>
                      <option value="update">Update existing records with new spreadsheet values</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setIsCatImportOpen(false)}
                className="px-3.5 py-1.5 border border-slate-300 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCommitCatImport}
                disabled={!catImportPreview || catImportPreview.valid_rows === 0 || isCatImporting}
                className="px-4 py-1.5 bg-sky-600 text-white rounded-lg text-xs font-semibold hover:bg-sky-700 disabled:opacity-40"
              >
                {isCatImporting ? 'Importing...' : 'Commit Category Import'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
