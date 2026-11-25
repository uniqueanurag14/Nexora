import React from 'react';
import { Calendar, Download, FileSpreadsheet, FileText, Filter, RefreshCw, RotateCcw } from 'lucide-react';

export interface DashboardFilterState {
  period: string;
  start_date: string;
  end_date: string;
  department_id: string;
  employee_id: string;
  operation_id: string;
  product_id: string;
  production_order_id: string;
  shift_id: string;
  quality_status: string;
}

export interface DashboardFilterOptions {
  departments: Array<{ id: number; code: string; name: string }>;
  employees: Array<{ id: number; emp_id: string; name: string; department_id: number | null; department: string }>;
  operations: Array<{ id: number; code: string; name: string }>;
  products: Array<{ id: number; sku: string; name: string }>;
  production_orders: Array<{ id: number; order_number: string; product_id: number; status: string }>;
  shifts: Array<{ id: number; code: string; name: string }>;
  quality_statuses: string[];
}

interface DashboardFilterBarProps {
  filters: DashboardFilterState;
  options: DashboardFilterOptions;
  scope: 'company' | 'department' | 'self';
  canExportExcel: boolean;
  canExportPdf: boolean;
  isLoading: boolean;
  isExporting: boolean;
  onChange: (next: DashboardFilterState) => void;
  onReset: () => void;
  onRefresh: () => void;
  onExport: (format: 'xlsx' | 'pdf') => void;
}

const DATE_PRESETS = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'this_week', label: 'This Week' },
  { value: 'last_week', label: 'Last Week' },
  { value: 'this_month', label: 'This Month' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'this_quarter', label: 'This Quarter' },
  { value: 'this_year', label: 'This Year' },
  { value: 'custom', label: 'Custom Range' },
];

export const DashboardFilterBar: React.FC<DashboardFilterBarProps> = ({
  filters,
  options,
  scope,
  canExportExcel,
  canExportPdf,
  isLoading,
  isExporting,
  onChange,
  onReset,
  onRefresh,
  onExport,
}) => {
  const update = (key: keyof DashboardFilterState, value: string) => {
    onChange({ ...filters, [key]: value });
  };

  return (
    <section
      aria-label="Dashboard Filters"
      className="bg-white border border-slate-200 rounded-xl p-4 space-y-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
          <Filter className="w-3.5 h-3.5 text-sky-700" />
          <span>Interactive Analytics Filters</span>
          <span className="text-slate-400 font-normal">
            • Scope: <strong className="text-slate-700 uppercase">{scope}</strong>
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset
          </button>

          <button
            type="button"
            onClick={onRefresh}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>

          {canExportExcel && (
            <button
              type="button"
              onClick={() => onExport('xlsx')}
              disabled={isExporting}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold disabled:opacity-50 transition-colors"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Export Excel
            </button>
          )}

          {canExportPdf && (
            <button
              type="button"
              onClick={() => onExport('pdf')}
              disabled={isExporting}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold disabled:opacity-50 transition-colors"
            >
              <FileText className="w-3.5 h-3.5" />
              Export PDF
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-2.5">
        {/* Date Preset */}
        <label className="block">
          <span className="block text-[11px] font-medium text-slate-500 mb-1">
            <Calendar className="w-3 h-3 inline mr-1" />
            Date Period
          </span>
          <select
            value={filters.period}
            onChange={(e) => update('period', e.target.value)}
            className="w-full h-9 px-2.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-800 focus:outline-none focus:border-sky-600"
          >
            {DATE_PRESETS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>

        {/* Custom Dates when Custom selected */}
        {filters.period === 'custom' && (
          <>
            <label className="block">
              <span className="block text-[11px] font-medium text-slate-500 mb-1">Start Date</span>
              <input
                type="date"
                value={filters.start_date}
                onChange={(e) => update('start_date', e.target.value)}
                className="w-full h-9 px-2.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-800 focus:outline-none focus:border-sky-600"
              />
            </label>
            <label className="block">
              <span className="block text-[11px] font-medium text-slate-500 mb-1">End Date</span>
              <input
                type="date"
                value={filters.end_date}
                onChange={(e) => update('end_date', e.target.value)}
                className="w-full h-9 px-2.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-800 focus:outline-none focus:border-sky-600"
              />
            </label>
          </>
        )}

        {/* Department (hidden for self scope) */}
        {scope !== 'self' && (
          <label className="block">
            <span className="block text-[11px] font-medium text-slate-500 mb-1">Department</span>
            <select
              value={filters.department_id}
              onChange={(e) => update('department_id', e.target.value)}
              disabled={scope === 'department' && options.departments.length <= 1}
              className="w-full h-9 px-2.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-800 focus:outline-none focus:border-sky-600 disabled:bg-slate-50"
            >
              {scope === 'company' && <option value="">All Departments</option>}
              {options.departments.map((d) => (
                <option key={d.id} value={String(d.id)}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
        )}

        {/* Employee (hidden for self scope) */}
        {scope !== 'self' && (
          <label className="block">
            <span className="block text-[11px] font-medium text-slate-500 mb-1">Employee</span>
            <select
              value={filters.employee_id}
              onChange={(e) => update('employee_id', e.target.value)}
              className="w-full h-9 px-2.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-800 focus:outline-none focus:border-sky-600"
            >
              <option value="">All Employees</option>
              {options.employees.map((e) => (
                <option key={e.id} value={String(e.id)}>
                  {e.emp_id} — {e.name}
                </option>
              ))}
            </select>
          </label>
        )}

        {/* Operation */}
        <label className="block">
          <span className="block text-[11px] font-medium text-slate-500 mb-1">Operation</span>
          <select
            value={filters.operation_id}
            onChange={(e) => update('operation_id', e.target.value)}
            className="w-full h-9 px-2.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-800 focus:outline-none focus:border-sky-600"
          >
            <option value="">All Operations</option>
            {options.operations.map((o) => (
              <option key={o.id} value={String(o.id)}>
                {o.code} — {o.name}
              </option>
            ))}
          </select>
        </label>

        {/* Product */}
        <label className="block">
          <span className="block text-[11px] font-medium text-slate-500 mb-1">Product</span>
          <select
            value={filters.product_id}
            onChange={(e) => update('product_id', e.target.value)}
            className="w-full h-9 px-2.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-800 focus:outline-none focus:border-sky-600"
          >
            <option value="">All Products</option>
            {options.products.map((p) => (
              <option key={p.id} value={String(p.id)}>
                {p.name}
              </option>
            ))}
          </select>
        </label>

        {/* Production Order */}
        <label className="block">
          <span className="block text-[11px] font-medium text-slate-500 mb-1">Production Order</span>
          <select
            value={filters.production_order_id}
            onChange={(e) => update('production_order_id', e.target.value)}
            className="w-full h-9 px-2.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-800 focus:outline-none focus:border-sky-600"
          >
            <option value="">All Orders</option>
            {options.production_orders.map((o) => (
              <option key={o.id} value={String(o.id)}>
                {o.order_number}
              </option>
            ))}
          </select>
        </label>

        {/* Shift */}
        <label className="block">
          <span className="block text-[11px] font-medium text-slate-500 mb-1">Shift</span>
          <select
            value={filters.shift_id}
            onChange={(e) => update('shift_id', e.target.value)}
            className="w-full h-9 px-2.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-800 focus:outline-none focus:border-sky-600"
          >
            <option value="">All Shifts</option>
            {options.shifts.map((s) => (
              <option key={s.id} value={String(s.id)}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        {/* Quality Status */}
        <label className="block">
          <span className="block text-[11px] font-medium text-slate-500 mb-1">Quality Status</span>
          <select
            value={filters.quality_status}
            onChange={(e) => update('quality_status', e.target.value)}
            className="w-full h-9 px-2.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-800 focus:outline-none focus:border-sky-600"
          >
            <option value="">All Statuses</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="rework">Rework</option>
            <option value="pending">Pending Inspection</option>
          </select>
        </label>
      </div>
    </section>
  );
};
