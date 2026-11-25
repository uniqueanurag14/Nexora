import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { ProductRecord, InventoryItem } from '../types';
import {
  Layers,
  Plus,
  RefreshCw,
  Trash2,
  AlertCircle,
  CheckCircle,
  Search,
  X,
  FileSpreadsheet,
} from 'lucide-react';

const formatInr = (val: number | string) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(val) || 0);

export const ProductManagementPage: React.FC = () => {
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<ProductRecord | null>(null);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isBomModalOpen, setIsBomModalOpen] = useState(false);

  const [productForm, setProductForm] = useState({
    product_code: '',
    name: '',
    category: 'Finished Goods',
    sku: '',
    uom: 'PCS',
    selling_price: '0',
    standard_cost: '0',
    description: '',
  });

  const [componentForm, setComponentForm] = useState({
    component_code: '',
    component_name: '',
    component_type: 'raw_material',
    uom: 'PCS',
    quantity_per_unit: '1',
    unit_cost: '0',
    scrap_percent: '0',
  });

  const [bomForm, setBomForm] = useState({
    version: '1.0',
    batch_size: '1',
    notes: '',
    items: [{ inventory_item_id: '', item_code: '', item_name: '', item_type: 'raw_material', quantity: '1', uom: 'PCS', unit_cost: '0', scrap_percent: '0' }],
  });

  const loadProducts = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const [prodRes, invRes] = await Promise.all([
        api.erp.getProducts(search),
        api.getItems({ page_size: 200 }).catch(() => ({ data: { items: [] } })),
      ]);
      setProducts(prodRes.data || []);
      setInventoryItems((invRes as any).data?.items || []);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to load products from PostgreSQL.');
    } finally {
      setLoading(false);
    }
  };

  const loadProductDetail = async (id: number) => {
    try {
      const res = await api.erp.getProductDetail(id);
      setSelectedProduct(res.data || null);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to load product details.');
    }
  };

  useEffect(() => {
    void loadProducts();
  }, []);

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await api.erp.createProduct({
        ...productForm,
        selling_price: Number(productForm.selling_price || 0),
        standard_cost: Number(productForm.standard_cost || 0),
      });
      setSuccessMsg('Product saved to PostgreSQL.');
      setIsProductModalOpen(false);
      setProductForm({
        product_code: '',
        name: '',
        category: 'Finished Goods',
        sku: '',
        uom: 'PCS',
        selling_price: '0',
        standard_cost: '0',
        description: '',
      });
      await loadProducts();
      if (res.data?.id) await loadProductDetail(res.data.id);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to create product.');
    }
  };

  const handleAddComponent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) return;
    setErrorMsg('');
    setSuccessMsg('');
    try {
      await api.erp.addProductComponent(selectedProduct.id, {
        ...componentForm,
        quantity_per_unit: Number(componentForm.quantity_per_unit || 1),
        unit_cost: Number(componentForm.unit_cost || 0),
        scrap_percent: Number(componentForm.scrap_percent || 0),
      });
      setSuccessMsg('Component added to product.');
      setComponentForm({
        component_code: '',
        component_name: '',
        component_type: 'raw_material',
        uom: 'PCS',
        quantity_per_unit: '1',
        unit_cost: '0',
        scrap_percent: '0',
      });
      await loadProductDetail(selectedProduct.id);
      await loadProducts();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to add component.');
    }
  };

  const handleDeleteComponent = async (componentId: number) => {
    if (!selectedProduct) return;
    try {
      await api.erp.deleteProductComponent(selectedProduct.id, componentId);
      await loadProductDetail(selectedProduct.id);
      await loadProducts();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to remove component.');
    }
  };

  const handleCreateBom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) return;
    setErrorMsg('');
    setSuccessMsg('');
    try {
      await api.erp.createProductBom(selectedProduct.id, {
        version: bomForm.version,
        batch_size: Number(bomForm.batch_size || 1),
        notes: bomForm.notes,
        items: bomForm.items.map(it => ({
          inventory_item_id: it.inventory_item_id ? Number(it.inventory_item_id) : null,
          item_code: it.item_code || 'MAT',
          item_name: it.item_name,
          item_type: it.item_type,
          quantity: Number(it.quantity || 1),
          uom: it.uom || 'PCS',
          unit_cost: Number(it.unit_cost || 0),
          scrap_percent: Number(it.scrap_percent || 0),
        })),
      });
      setSuccessMsg('Bill of Materials (BOM) saved to PostgreSQL.');
      setIsBomModalOpen(false);
      await loadProductDetail(selectedProduct.id);
      await loadProducts();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to create BOM.');
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2.5">
            <Layers className="w-6 h-6 text-[#0084CC]" />
            Product Management &amp; BOM
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Define manufactured products, register sub-components, and build versioned Bills of Materials (BOM) in PostgreSQL.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void loadProducts()}
            className="px-3 py-2 text-sm font-medium bg-white border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 flex items-center gap-1.5"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={() => setIsProductModalOpen(true)}
            className="px-3.5 py-2 text-sm font-semibold bg-[#0084CC] text-white rounded-lg hover:bg-[#0073b3] flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            New Product
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

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Products Catalog */}
        <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200 p-4 space-y-4">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && void loadProducts()}
                placeholder="Search products by code or name..."
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg"
              />
            </div>
            <button onClick={() => void loadProducts()} className="px-3 py-2 text-xs font-semibold bg-slate-100 rounded-lg">
              Find
            </button>
          </div>

          {loading ? (
            <p className="text-center text-sm text-slate-500 py-8">Loading products...</p>
          ) : products.length === 0 ? (
            <div className="text-center py-10 space-y-1">
              <Layers className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-sm font-semibold text-slate-700">No products available</p>
              <p className="text-xs text-slate-500">Create your first product to configure components and BOMs.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
              {products.map(p => (
                <button
                  key={p.id}
                  onClick={() => void loadProductDetail(p.id)}
                  className={`w-full text-left p-3 rounded-lg transition-colors ${
                    selectedProduct?.id === p.id ? 'bg-sky-50 border border-sky-200' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm text-slate-900">{p.name}</span>
                    <span className="text-xs font-mono text-slate-500">{p.product_code}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-500 mt-1">
                    <span>{p.category} • {p.uom}</span>
                    <span>Std Cost: {formatInr(p.standard_cost)}</span>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-1.5">
                    <span>Components: {p.component_count ?? 0}</span>
                    <span>BOMs: {p.bom_count ?? 0}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right: Selected Product Components & BOM */}
        <div className="lg:col-span-7 space-y-5">
          {!selectedProduct ? (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center space-y-2">
              <FileSpreadsheet className="w-10 h-10 text-slate-300 mx-auto" />
              <p className="text-sm font-semibold text-slate-700">Select a product to manage components &amp; BOM</p>
              <p className="text-xs text-slate-500">All product specifications, component trees, and BOM costs are stored in PostgreSQL.</p>
            </div>
          ) : (
            <>
              <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">
                    {selectedProduct.name} <span className="text-sm font-mono text-slate-500">({selectedProduct.product_code})</span>
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Category: {selectedProduct.category} • Selling Price: {formatInr(selectedProduct.selling_price)} • Standard Cost:{' '}
                    {formatInr(selectedProduct.standard_cost)}
                  </p>
                </div>
                <button
                  onClick={() => setIsBomModalOpen(true)}
                  className="px-3.5 py-2 text-xs font-semibold bg-[#0084CC] text-white rounded-lg hover:bg-[#0073b3] flex items-center gap-1.5 self-start"
                >
                  <Plus className="w-4 h-4" />
                  Build New BOM
                </button>
              </div>

              {/* Components Panel */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
                <h3 className="text-sm font-bold text-slate-800">Product Components ({selectedProduct.components?.length || 0})</h3>
                <form onSubmit={handleAddComponent} className="grid grid-cols-12 gap-2">
                  <input
                    required
                    value={componentForm.component_name}
                    onChange={e => setComponentForm({ ...componentForm, component_name: e.target.value })}
                    placeholder="Component Name *"
                    className="col-span-4 px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg"
                  />
                  <select
                    value={componentForm.component_type}
                    onChange={e => setComponentForm({ ...componentForm, component_type: e.target.value })}
                    className="col-span-3 px-2 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="raw_material">Raw Material</option>
                    <option value="component">Sub-Component</option>
                    <option value="packaging">Packaging</option>
                  </select>
                  <input
                    type="number"
                    min="0.001"
                    step="0.01"
                    value={componentForm.quantity_per_unit}
                    onChange={e => setComponentForm({ ...componentForm, quantity_per_unit: e.target.value })}
                    placeholder="Qty/Unit"
                    className="col-span-2 px-2 py-1.5 text-xs border border-slate-300 rounded-lg"
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={componentForm.unit_cost}
                    onChange={e => setComponentForm({ ...componentForm, unit_cost: e.target.value })}
                    placeholder="Cost"
                    className="col-span-2 px-2 py-1.5 text-xs border border-slate-300 rounded-lg"
                  />
                  <button type="submit" className="col-span-1 bg-[#0084CC] text-white rounded-lg text-xs font-semibold hover:bg-[#0073b3]">
                    Add
                  </button>
                </form>

                {!selectedProduct.components || selectedProduct.components.length === 0 ? (
                  <p className="text-xs text-slate-500">No components registered for this product yet.</p>
                ) : (
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="text-slate-500 border-b border-slate-100">
                        <th className="py-2">Component</th>
                        <th className="py-2">Type</th>
                        <th className="py-2 text-right">Qty/Unit</th>
                        <th className="py-2 text-right">Unit Cost</th>
                        <th className="py-2 text-right"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedProduct.components.map(c => (
                        <tr key={c.id}>
                          <td className="py-2 font-medium text-slate-800">{c.component_name}</td>
                          <td className="py-2 text-slate-600">{c.component_type.replace(/_/g, ' ')}</td>
                          <td className="py-2 text-right">{c.quantity_per_unit} {c.uom}</td>
                          <td className="py-2 text-right">{formatInr(c.unit_cost)}</td>
                          <td className="py-2 text-right">
                            <button onClick={() => void handleDeleteComponent(c.id)} className="text-red-500 hover:text-red-700">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* BOMs Panel */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
                <h3 className="text-sm font-bold text-slate-800">Bills of Materials ({selectedProduct.boms?.length || 0})</h3>
                {!selectedProduct.boms || selectedProduct.boms.length === 0 ? (
                  <p className="text-xs text-slate-500">No BOM versions defined yet. Click "Build New BOM" to define material quantities and cost rollup.</p>
                ) : (
                  <div className="space-y-3">
                    {selectedProduct.boms.map(bom => (
                      <div key={bom.id} className="border border-slate-200 rounded-lg p-3.5 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-900">
                            {bom.bom_code} (v{bom.version}) • Batch Size: {bom.batch_size}
                          </span>
                          <span className="text-xs font-bold text-[#0084CC]">
                            Material Cost: {formatInr(bom.total_material_cost)}
                          </span>
                        </div>
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="text-slate-500 border-b border-slate-100">
                              <th className="py-1">Material</th>
                              <th className="py-1 text-right">Qty</th>
                              <th className="py-1 text-right">Scrap %</th>
                              <th className="py-1 text-right">Line Cost</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {bom.items.map(bi => (
                              <tr key={bi.id}>
                                <td className="py-1 font-medium text-slate-800">{bi.item_code} — {bi.item_name}</td>
                                <td className="py-1 text-right">{bi.quantity} {bi.uom}</td>
                                <td className="py-1 text-right">{bi.scrap_percent}%</td>
                                <td className="py-1 text-right font-semibold">{formatInr(bi.line_cost)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Create Product Modal */}
      {isProductModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h2 className="text-lg font-bold text-slate-900">Register New Product</h2>
              <button onClick={() => setIsProductModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateProduct} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Product Code</label>
                  <input
                    value={productForm.product_code}
                    onChange={e => setProductForm({ ...productForm, product_code: e.target.value })}
                    placeholder="Auto if blank"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">SKU</label>
                  <input
                    value={productForm.sku}
                    onChange={e => setProductForm({ ...productForm, sku: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Product Name *</label>
                <input
                  required
                  value={productForm.name}
                  onChange={e => setProductForm({ ...productForm, name: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Category</label>
                  <input
                    value={productForm.category}
                    onChange={e => setProductForm({ ...productForm, category: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Selling Price</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={productForm.selling_price}
                    onChange={e => setProductForm({ ...productForm, selling_price: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Standard Cost</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={productForm.standard_cost}
                    onChange={e => setProductForm({ ...productForm, standard_cost: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setIsProductModalOpen(false)} className="px-4 py-2 text-sm border border-slate-200 rounded-lg">
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 text-sm font-semibold bg-[#0084CC] text-white rounded-lg">
                  Save Product
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Build BOM Modal */}
      {isBomModalOpen && selectedProduct && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h2 className="text-lg font-bold text-slate-900">Build BOM — {selectedProduct.name}</h2>
              <button onClick={() => setIsBomModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateBom} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">BOM Version</label>
                  <input
                    value={bomForm.version}
                    onChange={e => setBomForm({ ...bomForm, version: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Batch Size</label>
                  <input
                    type="number"
                    min="1"
                    value={bomForm.batch_size}
                    onChange={e => setBomForm({ ...bomForm, batch_size: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase text-slate-600">BOM Materials</span>
                  <button
                    type="button"
                    onClick={() =>
                      setBomForm(prev => ({
                        ...prev,
                        items: [
                          ...prev.items,
                          { inventory_item_id: '', item_code: '', item_name: '', item_type: 'raw_material', quantity: '1', uom: 'PCS', unit_cost: '0', scrap_percent: '0' },
                        ],
                      }))
                    }
                    className="text-xs font-semibold text-[#0084CC] hover:underline"
                  >
                    + Add Material
                  </button>
                </div>
                {bomForm.items.map((it, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 bg-slate-50 p-2 rounded-lg">
                    <select
                      value={it.inventory_item_id}
                      onChange={e => {
                        const found = inventoryItems.find(x => String(x.id) === e.target.value);
                        const next = [...bomForm.items];
                        next[idx].inventory_item_id = e.target.value;
                        if (found) {
                          next[idx].item_code = found.code;
                          next[idx].item_name = found.name;
                          next[idx].unit_cost = String(found.cost_price || 0);
                          next[idx].uom = found.uom_symbol || 'PCS';
                        }
                        setBomForm({ ...bomForm, items: next });
                      }}
                      className="col-span-3 px-2 py-1.5 text-xs border border-slate-300 rounded bg-white"
                    >
                      <option value="">Custom Material</option>
                      {inventoryItems.map(inv => (
                        <option key={inv.id} value={inv.id}>{inv.code} - {inv.name}</option>
                      ))}
                    </select>
                    <input
                      required
                      value={it.item_name}
                      onChange={e => {
                        const next = [...bomForm.items];
                        next[idx].item_name = e.target.value;
                        setBomForm({ ...bomForm, items: next });
                      }}
                      placeholder="Material Name"
                      className="col-span-3 px-2 py-1.5 text-xs border border-slate-300 rounded"
                    />
                    <input
                      type="number"
                      min="0.001"
                      step="0.01"
                      value={it.quantity}
                      onChange={e => {
                        const next = [...bomForm.items];
                        next[idx].quantity = e.target.value;
                        setBomForm({ ...bomForm, items: next });
                      }}
                      placeholder="Qty"
                      className="col-span-2 px-2 py-1.5 text-xs border border-slate-300 rounded"
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={it.unit_cost}
                      onChange={e => {
                        const next = [...bomForm.items];
                        next[idx].unit_cost = e.target.value;
                        setBomForm({ ...bomForm, items: next });
                      }}
                      placeholder="Unit Cost"
                      className="col-span-2 px-2 py-1.5 text-xs border border-slate-300 rounded"
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={it.scrap_percent}
                      onChange={e => {
                        const next = [...bomForm.items];
                        next[idx].scrap_percent = e.target.value;
                        setBomForm({ ...bomForm, items: next });
                      }}
                      placeholder="Scrap %"
                      className="col-span-2 px-2 py-1.5 text-xs border border-slate-300 rounded"
                    />
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setIsBomModalOpen(false)} className="px-4 py-2 text-sm border border-slate-200 rounded-lg">
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 text-sm font-semibold bg-[#0084CC] text-white rounded-lg">
                  Save BOM
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
