import React, { useState, useEffect, useCallback } from 'react';
import { BarChart3, Package, ShoppingCart, Factory, Users, RefreshCw } from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';

interface ReportsAnalyticsPageProps {
  onNavigate?: (route: string) => void;
}

type ReportTab = 'stock' | 'purchasing' | 'production' | 'employees';

export const ReportsAnalyticsPage: React.FC<ReportsAnalyticsPageProps> = () => {
  const { notify } = useAuth();
  const [activeTab, setActiveTab] = useState<ReportTab>('stock');
  const [loading, setLoading] = useState(true);
  const [stockData, setStockData] = useState<any>(null);
  const [purchasingData, setPurchasingData] = useState<any>(null);
  const [productionData, setProductionData] = useState<any>(null);
  const [employeeData, setEmployeeData] = useState<any>(null);

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    try {
      const [sRes, pRes, prRes, eRes] = await Promise.all([
        api.erp.getStockAnalytics(),
        api.erp.getPurchasingAnalytics(),
        api.erp.getProductionAnalytics(),
        api.erp.getEmployeeAnalytics(),
      ]);
      setStockData(sRes.success ? sRes.data : null);
      setPurchasingData(pRes.success ? pRes.data : null);
      setProductionData(prRes.success ? prRes.data : null);
      setEmployeeData(eRes.success ? eRes.data : null);
    } catch {
      notify('error', 'Failed to fetch PostgreSQL analytics reports.');
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  const tabs: Array<{ id: ReportTab; label: string; icon: any }> = [
    { id: 'stock', label: 'Stock Analytics', icon: Package },
    { id: 'purchasing', label: 'Purchasing Analytics', icon: ShoppingCart },
    { id: 'production', label: 'Production Analytics', icon: Factory },
    { id: 'employees', label: 'Employee Performance', icon: Users },
  ];

  return (
    <div className="space-y-6 pb-8">
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center">
            <BarChart3 className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-bold text-sky-600 uppercase tracking-wider">Enterprise Intelligence</span>
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900">Reporting &amp; Analytics</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Live PostgreSQL aggregations across Stock, Purchasing, Production, and Employee Performance.
            </p>
          </div>
        </div>
        <button
          onClick={loadAnalytics}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Live Data</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold border transition-all ${
                activeTab === t.id
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {activeTab === 'stock' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <div className="text-[11px] font-bold text-slate-500 uppercase">Total Inventory Items</div>
              <div className="text-2xl font-black text-slate-900 mt-1">{stockData?.summary?.total_items ?? 0}</div>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <div className="text-[11px] font-bold text-slate-500 uppercase">Total Valuation (INR)</div>
              <div className="text-2xl font-black text-emerald-700 mt-1">
                ₹{Number(stockData?.summary?.total_valuation || 0).toLocaleString('en-IN')}
              </div>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <div className="text-[11px] font-bold text-slate-500 uppercase">Low-Stock Alerts</div>
              <div className="text-2xl font-black text-amber-600 mt-1">{stockData?.summary?.low_stock_items ?? 0}</div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <h3 className="text-sm font-bold text-slate-900 mb-3">Stock Breakdown by Item Type</h3>
            {!stockData?.by_type?.length ? (
              <p className="text-xs text-slate-400 py-6 text-center">No inventory stock data available.</p>
            ) : (
              <div className="space-y-2">
                {stockData.by_type.map((row: any, idx: number) => (
                  <div key={idx} className="flex items-center justify-between py-2 border-b border-slate-100 text-xs">
                    <span className="font-bold text-slate-800 uppercase">{row.item_type}</span>
                    <span className="font-mono text-slate-600">
                      {row.item_count} items | Qty: {Number(row.total_qty || 0)} | ₹{Number(row.total_value || 0).toLocaleString('en-IN')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'purchasing' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <div className="text-[11px] font-bold text-slate-500 uppercase">Total Purchase Orders</div>
              <div className="text-2xl font-black text-slate-900 mt-1">{purchasingData?.summary?.total_pos ?? 0}</div>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <div className="text-[11px] font-bold text-slate-500 uppercase">Total Spend (INR)</div>
              <div className="text-2xl font-black text-sky-700 mt-1">
                ₹{Number(purchasingData?.summary?.total_po_amount || 0).toLocaleString('en-IN')}
              </div>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <div className="text-[11px] font-bold text-slate-500 uppercase">GRNs Received</div>
              <div className="text-2xl font-black text-emerald-700 mt-1">{purchasingData?.summary?.total_grns ?? 0}</div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <h3 className="text-sm font-bold text-slate-900 mb-3">Top Suppliers by Purchase Value</h3>
            {!purchasingData?.by_supplier?.length ? (
              <p className="text-xs text-slate-400 py-6 text-center">No purchasing records available.</p>
            ) : (
              <div className="space-y-2">
                {purchasingData.by_supplier.map((s: any, i: number) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b border-slate-100 text-xs">
                    <span className="font-bold text-slate-800">{s.supplier_name}</span>
                    <span className="font-mono text-slate-600">
                      {s.po_count} POs | ₹{Number(s.total_spend || 0).toLocaleString('en-IN')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'production' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <div className="text-[11px] font-bold text-slate-500 uppercase">Total Work Orders</div>
              <div className="text-2xl font-black text-slate-900 mt-1">{productionData?.summary?.total_work_orders ?? 0}</div>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <div className="text-[11px] font-bold text-slate-500 uppercase">Completed Units</div>
              <div className="text-2xl font-black text-emerald-700 mt-1">
                {Number(productionData?.summary?.total_completed_qty || 0)}
              </div>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <div className="text-[11px] font-bold text-slate-500 uppercase">Rejected Units</div>
              <div className="text-2xl font-black text-rose-600 mt-1">
                {Number(productionData?.summary?.total_rejected_qty || 0)}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'employees' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <div className="text-[11px] font-bold text-slate-500 uppercase">Active Registered Employees</div>
              <div className="text-2xl font-black text-slate-900 mt-1">{employeeData?.summary?.active_employees ?? 0}</div>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <div className="text-[11px] font-bold text-slate-500 uppercase">Total Work Events</div>
              <div className="text-2xl font-black text-sky-700 mt-1">{employeeData?.summary?.total_events ?? 0}</div>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <div className="text-[11px] font-bold text-slate-500 uppercase">Today&apos;s Events</div>
              <div className="text-2xl font-black text-emerald-700 mt-1">{employeeData?.summary?.today_events ?? 0}</div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <h3 className="text-sm font-bold text-slate-900 mb-3">Department Performance Summary</h3>
            {!employeeData?.by_department?.length ? (
              <p className="text-xs text-slate-400 py-6 text-center">No employee performance data available.</p>
            ) : (
              <div className="space-y-2">
                {employeeData.by_department.map((d: any, i: number) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b border-slate-100 text-xs">
                    <span className="font-bold text-slate-800">{d.department || 'Unassigned'}</span>
                    <span className="font-mono text-slate-600">
                      {d.employee_count} employees | {d.total_events} events
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
