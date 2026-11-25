import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Supplier, SupplierFormData } from '../types';
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
} from 'lucide-react';

interface SuppliersPageProps {
  onNavigate?: (route: string) => void;
}

export const SuppliersPage: React.FC<SuppliersPageProps> = () => {
  const { hasPermission } = useAuth();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [pageSize] = useState<number>(10);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [search, setSearch] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState<boolean>(false);
  const [viewSupplier, setViewSupplier] = useState<Supplier | null>(null);
  const [editSupplier, setEditSupplier] = useState<Supplier | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Supplier | null>(null);
  const [isImportOpen, setIsImportOpen] = useState<boolean>(false);

  // Form State
  const initialForm: SupplierFormData = {
    code: '',
    name: '',
    category: '',
    tax_id: '',
    status: 'active',
    contact_first_name: '',
    contact_last_name: '',
    email: '',
    phone: '',
    alternate_phone: '',
    address_line1: '',
    address_line2: '',
    city: '',
    state: '',
    postal_code: '',
    country: '',
    website: '',
    notes: '',
  };
  const [formData, setFormData] = useState<SupplierFormData>(initialForm);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Import State
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<any | null>(null);
  const [duplicatePolicy, setDuplicatePolicy] = useState<'skip' | 'update'>('skip');
  const [isImporting, setIsImporting] = useState<boolean>(false);

  const fetchSuppliers = async () => {
    setIsLoading(true);
    setErrorMsg('');
    try {
      const res = await api.getSuppliers({
        search: search.trim() || undefined,
        category: categoryFilter || undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        page,
        page_size: pageSize,
      });
      if (res.success && res.data) {
        setSuppliers(res.data.items || []);
        setTotal(res.data.total || 0);
        setTotalPages(res.data.totalPages || 1);
      } else {
        setErrorMsg(res.message || 'Failed to load suppliers.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error communicating with server.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSuppliers();
  }, [page, categoryFilter, statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchSuppliers();
  };

  const openCreateModal = async () => {
    setFormData(initialForm);
    setFormErrors({});
    setIsCreateOpen(true);
    try {
      const res = await api.getNextSupplierCode();
      if (res.success && res.data?.next_code) {
        setFormData(prev => ({ ...prev, code: res.data!.next_code }));
      }
    } catch {}
  };

  const openEditModal = (s: Supplier) => {
    setEditSupplier(s);
    setFormData({
      code: s.code,
      name: s.name,
      category: s.category || '',
      tax_id: s.tax_id || '',
      status: s.status,
      contact_first_name: s.contact_first_name || '',
      contact_last_name: s.contact_last_name || '',
      email: s.email || '',
      phone: s.phone || '',
      alternate_phone: s.alternate_phone || '',
      address_line1: s.address_line1 || '',
      address_line2: s.address_line2 || '',
      city: s.city || '',
      state: s.state || '',
      postal_code: s.postal_code || '',
      country: s.country || '',
      website: s.website || '',
      notes: s.notes || '',
    });
    setFormErrors({});
  };

  const validateForm = () => {
    const errors: Record<string, string> = {};
    if (!formData.name.trim()) errors.name = 'Supplier name is required.';
    if (!formData.code.trim()) errors.code = 'Supplier code is required.';
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) {
      errors.email = 'Valid email address format required.';
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSaveSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsSubmitting(true);
    setErrorMsg('');
    try {
      if (editSupplier) {
        const res = await api.updateSupplier(editSupplier.id, formData);
        if (res.success) {
          setSuccessMsg(`Supplier '${res.data?.name || formData.name}' updated successfully.`);
          setEditSupplier(null);
          fetchSuppliers();
        } else {
          setErrorMsg(res.message || 'Failed to update supplier.');
        }
      } else {
        const res = await api.createSupplier(formData);
        if (res.success) {
          setSuccessMsg(`Supplier '${res.data?.name || formData.name}' created successfully.`);
          setIsCreateOpen(false);
          fetchSuppliers();
        } else {
          setErrorMsg(res.message || 'Failed to create supplier.');
        }
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Network error.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteConfirm = async (forceDisable = false) => {
    if (!deleteTarget) return;
    setIsSubmitting(true);
    setErrorMsg('');
    try {
      const res = await api.deleteSupplier(deleteTarget.id, forceDisable);
      if (res.success) {
        setSuccessMsg(`Supplier '${deleteTarget.name}' has been ${res.data?.action === 'disabled' ? 'disabled' : 'deleted'}.`);
        setDeleteTarget(null);
        fetchSuppliers();
      } else {
        setErrorMsg(res.message || 'Failed to delete supplier.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Network error.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExportExcel = async () => {
    try {
      await api.downloadSuppliersExcel({
        search: search.trim() || undefined,
        category: categoryFilter || undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
      });
      setSuccessMsg('Supplier directory exported successfully.');
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to export suppliers.');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImportFile(file);
      const reader = new FileReader();
      reader.onload = async (evt) => {
        const base64Data = evt.target?.result as string;
        try {
          const res = await api.previewSupplierImport({ file_data: base64Data });
          if (res.success && res.data) {
            setImportPreview(res.data);
          } else {
            setErrorMsg(res.message || 'Failed to preview spreadsheet.');
          }
        } catch (err: any) {
          setErrorMsg(err.message || 'Error processing Excel file.');
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCommitImport = async () => {
    if (!importPreview || !importPreview.preview_items) return;
    setIsImporting(true);
    setErrorMsg('');
    try {
      const res = await api.commitSupplierImport({
        duplicate_policy: duplicatePolicy,
        rows: importPreview.preview_items.filter((i: any) => i.is_valid),
      });
      if (res.success) {
        setSuccessMsg(res.message || 'Import processed.');
        setIsImportOpen(false);
        setImportPreview(null);
        setImportFile(null);
        fetchSuppliers();
      } else {
        setErrorMsg(res.message || 'Import failed.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error committing import.');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Header & Actions Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Supplier Management
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Maintain registered vendor directory, contact profiles, tax data, and reordering terms
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={handleExportExcel}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            Export Excel
          </button>

          {hasPermission('suppliers.import') && (
            <button
              onClick={() => setIsImportOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
            >
              <Upload className="w-3.5 h-3.5" />
              Import Excel
            </button>
          )}

          {hasPermission('suppliers.create') && (
            <button
              onClick={openCreateModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-sky-600 text-white hover:bg-sky-700 transition-colors shadow-xs whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Supplier
            </button>
          )}
        </div>
      </div>

      {/* Alert Notices */}
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

      {/* Filter and Search Bar */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
        <form onSubmit={handleSearchSubmit} className="flex-1 w-full md:w-auto relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by code, supplier name, or tax ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 focus:bg-white"
          />
        </form>

        <div className="flex items-center gap-2 w-full md:w-auto shrink-0">
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-sky-500"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="disabled">Disabled</option>
          </select>

          <button
            onClick={() => fetchSuppliers()}
            className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors"
            title="Refresh list"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Suppliers Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-semibold">
              <tr>
                <th className="py-3 px-4">Supplier Code</th>
                <th className="py-3 px-4">Supplier Name</th>
                <th className="py-3 px-4">Contact Person</th>
                <th className="py-3 px-4">Email</th>
                <th className="py-3 px-4">Phone</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="w-6 h-6 border-2 border-sky-600 border-t-transparent rounded-full animate-spin" />
                      <span>Loading suppliers from database...</span>
                    </div>
                  </td>
                </tr>
              ) : suppliers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <Building2 className="w-10 h-10 text-slate-300 stroke-1" />
                      <p className="text-sm font-medium text-slate-600">No suppliers found</p>
                      <p className="text-xs text-slate-400 max-w-sm">
                        {search ? 'Try clearing your search query or filters.' : 'Click "Add Supplier" or "Import Excel" to register your first vendor.'}
                      </p>
                      {hasPermission('suppliers.create') && !search && (
                        <button
                          onClick={openCreateModal}
                          className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-sky-600 text-white hover:bg-sky-700 transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Add First Supplier
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                suppliers.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3 px-4 font-mono font-medium text-slate-800">
                      {s.code}
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-900">
                      {s.name}
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      {s.contact_first_name || s.contact_last_name
                        ? `${s.contact_first_name || ''} ${s.contact_last_name || ''}`.trim()
                        : '—'}
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      {s.email || '—'}
                    </td>
                    <td className="py-3 px-4 text-slate-600 tabular-nums">
                      {s.phone || '—'}
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      {s.category || 'General'}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center text-xs font-medium ${s.status === 'active' ? 'text-emerald-700' : 'text-slate-500'}`}>
                        {s.status === 'active' ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setViewSupplier(s)}
                          className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                          title="View Details"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        {hasPermission('suppliers.edit') && (
                          <button
                            onClick={() => openEditModal(s)}
                            className="p-1.5 rounded-md text-slate-500 hover:text-sky-600 hover:bg-sky-50 transition-colors"
                            title="Edit Supplier"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {hasPermission('suppliers.delete') && (
                          <button
                            onClick={() => setDeleteTarget(s)}
                            className="p-1.5 rounded-md text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                            title="Delete or Disable"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
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

        {/* Pagination Bar */}
        <div className="border-t border-slate-200 px-4 py-3 bg-white flex items-center justify-between text-xs text-slate-500">
          <div>
            Showing <span className="font-semibold text-slate-800 tabular-nums">{suppliers.length > 0 ? (page - 1) * pageSize + 1 : 0}</span> to{' '}
            <span className="font-semibold text-slate-800 tabular-nums">{Math.min(page * pageSize, total)}</span> of{' '}
            <span className="font-semibold text-slate-800 tabular-nums">{total}</span> suppliers
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setPage(prev => Math.max(1, prev - 1))}
              disabled={page <= 1}
              className="p-1.5 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-2 font-medium text-slate-700 tabular-nums">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage(prev => Math.min(totalPages, prev + 1))}
              disabled={page >= totalPages}
              className="p-1.5 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* CREATE & EDIT MODAL */}
      {(isCreateOpen || editSupplier) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h2 className="text-base font-bold text-slate-900">
                {editSupplier ? `Edit Supplier: ${editSupplier.name}` : 'Register New Supplier'}
              </h2>
              <button
                onClick={() => {
                  setIsCreateOpen(false);
                  setEditSupplier(null);
                }}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSupplier} className="p-6 space-y-5 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Supplier Code <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-mono focus:bg-white focus:ring-2 focus:ring-sky-500"
                    placeholder="SUP-00001"
                  />
                  {formErrors.code && <p className="text-rose-600 mt-1">{formErrors.code}</p>}
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Supplier / Company Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-sky-500"
                    placeholder="Acme Industrial Supplies Ltd."
                  />
                  {formErrors.name && <p className="text-rose-600 mt-1">{formErrors.name}</p>}
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Category</label>
                  <input
                    type="text"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-sky-500"
                    placeholder="Raw Materials, Fasteners, Tools"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Tax / Registration ID</label>
                  <input
                    type="text"
                    value={formData.tax_id}
                    onChange={(e) => setFormData({ ...formData, tax_id: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-sky-500"
                    placeholder="GSTIN / EIN / VAT"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as 'active' | 'disabled' })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-sky-500"
                  >
                    <option value="active">Active</option>
                    <option value="disabled">Disabled</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Website</label>
                  <input
                    type="text"
                    value={formData.website}
                    onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-sky-500"
                    placeholder="https://example.com"
                  />
                </div>
              </div>

              {/* Contact Information */}
              <div className="pt-3 border-t border-slate-200">
                <h3 className="font-bold text-slate-800 text-xs mb-3">Contact Person</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block font-medium text-slate-600 mb-1">First Name</label>
                    <input
                      type="text"
                      value={formData.contact_first_name}
                      onChange={(e) => setFormData({ ...formData, contact_first_name: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-sky-500"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-600 mb-1">Last Name</label>
                    <input
                      type="text"
                      value={formData.contact_last_name}
                      onChange={(e) => setFormData({ ...formData, contact_last_name: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-sky-500"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-600 mb-1">Email</label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-sky-500"
                    />
                    {formErrors.email && <p className="text-rose-600 mt-1">{formErrors.email}</p>}
                  </div>
                  <div>
                    <label className="block font-medium text-slate-600 mb-1">Phone</label>
                    <input
                      type="text"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-sky-500"
                    />
                  </div>
                </div>
              </div>

              {/* Address Information */}
              <div className="pt-3 border-t border-slate-200">
                <h3 className="font-bold text-slate-800 text-xs mb-3">Address & Location</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block font-medium text-slate-600 mb-1">Address Line 1</label>
                    <input
                      type="text"
                      value={formData.address_line1}
                      onChange={(e) => setFormData({ ...formData, address_line1: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-sky-500"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-600 mb-1">City</label>
                    <input
                      type="text"
                      value={formData.city}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-sky-500"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-600 mb-1">State / Province</label>
                    <input
                      type="text"
                      value={formData.state}
                      onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-sky-500"
                    />
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div className="pt-3 border-t border-slate-200">
                <label className="block font-medium text-slate-600 mb-1">Notes & Contract Terms</label>
                <textarea
                  rows={2}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-sky-500"
                  placeholder="Payment terms, delivery windows, preferred logistics..."
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => {
                    setIsCreateOpen(false);
                    setEditSupplier(null);
                  }}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 font-semibold disabled:opacity-50"
                >
                  {isSubmitting ? 'Saving...' : editSupplier ? 'Update Supplier' : 'Save Supplier'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* VIEW DETAILS MODAL */}
      {viewSupplier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900">{viewSupplier.name}</h2>
                <p className="text-xs font-mono text-slate-500 mt-0.5">{viewSupplier.code}</p>
              </div>
              <button onClick={() => setViewSupplier(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-slate-400 font-medium">Category</span>
                  <p className="font-semibold text-slate-800 mt-0.5">{viewSupplier.category || 'General'}</p>
                </div>
                <div>
                  <span className="text-slate-400 font-medium">Status</span>
                  <p className="font-semibold text-slate-800 mt-0.5 capitalize">{viewSupplier.status}</p>
                </div>
                <div>
                  <span className="text-slate-400 font-medium">Contact Person</span>
                  <p className="font-semibold text-slate-800 mt-0.5">
                    {viewSupplier.contact_first_name || viewSupplier.contact_last_name
                      ? `${viewSupplier.contact_first_name || ''} ${viewSupplier.contact_last_name || ''}`.trim()
                      : '—'}
                  </p>
                </div>
                <div>
                  <span className="text-slate-400 font-medium">Email</span>
                  <p className="font-semibold text-slate-800 mt-0.5">{viewSupplier.email || '—'}</p>
                </div>
                <div>
                  <span className="text-slate-400 font-medium">Phone</span>
                  <p className="font-semibold text-slate-800 mt-0.5 tabular-nums">{viewSupplier.phone || '—'}</p>
                </div>
                <div>
                  <span className="text-slate-400 font-medium">Tax Identifier</span>
                  <p className="font-semibold text-slate-800 mt-0.5">{viewSupplier.tax_id || '—'}</p>
                </div>
              </div>

              {viewSupplier.address_line1 && (
                <div className="pt-3 border-t border-slate-100">
                  <span className="text-slate-400 font-medium">Address</span>
                  <p className="text-slate-700 mt-0.5">
                    {[viewSupplier.address_line1, viewSupplier.city, viewSupplier.state, viewSupplier.country]
                      .filter(Boolean)
                      .join(', ')}
                  </p>
                </div>
              )}

              {viewSupplier.notes && (
                <div className="pt-3 border-t border-slate-100">
                  <span className="text-slate-400 font-medium">Notes & Terms</span>
                  <p className="text-slate-700 mt-0.5 whitespace-pre-wrap">{viewSupplier.notes}</p>
                </div>
              )}
            </div>

            <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setViewSupplier(null)}
                className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-100 text-xs font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-md p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-full bg-rose-50 text-rose-600">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Confirm Supplier Deletion</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Are you sure you want to delete <span className="font-semibold text-slate-800">{deleteTarget.name}</span> ({deleteTarget.code})?
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-500 bg-slate-50 p-3 rounded-lg border border-slate-200">
              If this supplier has associated purchase records or transactions, you can choose to disable their profile to preserve historic audit data.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-3 py-1.5 border border-slate-300 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteConfirm(true)}
                className="px-3 py-1.5 border border-amber-300 bg-amber-50 text-amber-800 rounded-lg text-xs font-semibold hover:bg-amber-100"
              >
                Disable Supplier
              </button>
              <button
                onClick={() => handleDeleteConfirm(false)}
                className="px-3 py-1.5 bg-rose-600 text-white rounded-lg text-xs font-semibold hover:bg-rose-700"
              >
                Permanent Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* IMPORT EXCEL MODAL */}
      {isImportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-slate-900">Import Suppliers from Excel</h3>
              <button onClick={() => setIsImportOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <p className="text-slate-600">
                Upload a standard <span className="font-mono">.xlsx</span> spreadsheet. Download our sample template if you need the required column structure.
              </p>
              <button
                type="button"
                onClick={() => api.downloadSupplierTemplate()}
                className="inline-flex items-center gap-1.5 text-xs text-sky-600 font-semibold hover:underline"
              >
                <Download className="w-3.5 h-3.5" />
                Download Spreadsheet Template
              </button>

              <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center hover:border-sky-400 transition-colors">
                <input
                  type="file"
                  accept=".xlsx, .xls"
                  onChange={handleFileChange}
                  className="hidden"
                  id="supplier-excel-input"
                />
                <label htmlFor="supplier-excel-input" className="cursor-pointer flex flex-col items-center gap-2">
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
                    <label className="block font-semibold text-slate-700 mb-1">Duplicate Policy</label>
                    <select
                      value={duplicatePolicy}
                      onChange={(e) => setDuplicatePolicy(e.target.value as 'skip' | 'update')}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                    >
                      <option value="skip">Skip duplicates (keep existing database records)</option>
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
                onClick={handleCommitImport}
                disabled={!importPreview || importPreview.valid_rows === 0 || isImporting}
                className="px-4 py-1.5 bg-sky-600 text-white rounded-lg text-xs font-semibold hover:bg-sky-700 disabled:opacity-40"
              >
                {isImporting ? 'Importing...' : 'Commit Import'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
