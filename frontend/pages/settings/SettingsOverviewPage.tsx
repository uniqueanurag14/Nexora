import React, { useState } from 'react';
import {
  SlidersHorizontal,
  Globe,
  Mail,
  Bell,
  Sparkles,
  Sliders,
  Briefcase,
  Truck,
  KeyRound,
  ShieldCheck,
  Smartphone,
  Database,
  ArrowRight,
  Search,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Layers,
  Settings as SettingsIcon,
  ShieldAlert,
  Server,
} from 'lucide-react';
import { CategorySummary } from '../../types';

interface SettingsOverviewPageProps {
  categories: CategorySummary[];
  onNavigateCategory: (route: string) => void;
  onResetAll?: () => void;
}

const ICON_MAP: Record<string, React.ElementType> = {
  SlidersHorizontal,
  Globe,
  Mail,
  Bell,
  Sparkles,
  Sliders,
  Briefcase,
  Truck,
  KeyRound,
  ShieldCheck,
  Smartphone,
  Database,
};

export const SettingsOverviewPage: React.FC<SettingsOverviewPageProps> = ({
  categories,
  onNavigateCategory,
  onResetAll,
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredCategories = categories.filter(cat => {
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase();
    return cat.name.toLowerCase().includes(q) || cat.description.toLowerCase().includes(q);
  });

  const totalOverrides = categories.reduce((sum, c) => sum + (c.overridden_count || 0), 0);
  const totalConfigurable = categories.filter(c => !c.is_operational).reduce((sum, c) => sum + c.total_settings, 0);

  return (
    <div className="space-y-6">
      {/* Overview Hero Header */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 sm:p-8 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-sky-50 border border-sky-100 text-sky-700 text-xs font-semibold">
              <SettingsIcon className="w-3.5 h-3.5 text-[#0084CC]" />
              <span>Enterprise Governance & Configuration</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#101B32] tracking-tight">
              Settings & Governance
            </h1>
            <p className="text-sm text-slate-600 leading-relaxed">
              Manage system configuration parameters, regional localization standards, email gateways,
              workforce rules, and security policies. Configurations fallback to <code className="bg-slate-100 px-1 py-0.5 rounded text-xs font-mono font-bold text-slate-800">.env</code> defaults unless explicitly customized in the database.
            </p>
          </div>

          {/* Quick Metrics Bar */}
          <div className="flex flex-wrap sm:flex-nowrap items-center gap-3 shrink-0">
            <div className="bg-[#F6F9FC] border border-slate-200/80 rounded-xl p-3.5 min-w-[130px]">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                Total Modules
              </span>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span className="text-2xl font-black text-[#101B32]">{categories.length}</span>
                <span className="text-xs text-slate-400 font-medium">Categories</span>
              </div>
            </div>

            <div className="bg-[#F6F9FC] border border-slate-200/80 rounded-xl p-3.5 min-w-[130px]">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                Custom Overrides
              </span>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span className="text-2xl font-black text-amber-600">{totalOverrides}</span>
                <span className="text-xs text-slate-400 font-medium">/ {totalConfigurable}</span>
              </div>
            </div>

            <div className="bg-[#F6F9FC] border border-slate-200/80 rounded-xl p-3.5 min-w-[130px]">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                Fallback Source
              </span>
              <div className="flex items-center gap-1.5 mt-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span className="text-xs font-bold text-slate-700 font-mono">.env ACTIVE</span>
              </div>
            </div>
          </div>
        </div>

        {/* Search Bar & Reset Trigger */}
        <div className="mt-6 pt-6 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="relative w-full sm:w-96">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Filter settings categories (e.g. SMTP, Timezone, Security)..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0084CC]/20 focus:border-[#0084CC] transition-all"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            {onResetAll && totalOverrides > 0 && (
              <button
                onClick={onResetAll}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 text-xs font-semibold transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Revert All ({totalOverrides}) to Defaults</span>
              </button>
            )}
            <span className="text-xs font-medium text-slate-500">
              Showing {filteredCategories.length} of {categories.length} sections
            </span>
          </div>
        </div>
      </div>

      {/* 12-Card Grid Layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredCategories.map(cat => {
          const IconComponent = ICON_MAP[cat.icon] || SlidersHorizontal;
          const isOperational = cat.is_operational;

          return (
            <div
              key={cat.id}
              className="bg-white rounded-2xl border border-slate-200/80 p-6 flex flex-col justify-between hover:shadow-md hover:border-sky-300 transition-all duration-200 group"
            >
              <div>
                {/* Header: Icon & Override Status Badge */}
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div
                    className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${
                      isOperational
                        ? 'bg-slate-100 text-slate-700 group-hover:bg-[#101B32] group-hover:text-white'
                        : 'bg-sky-50 text-[#0084CC] group-hover:bg-[#0084CC] group-hover:text-white'
                    }`}
                  >
                    <IconComponent className="w-6 h-6 transition-transform duration-200 group-hover:scale-110" />
                  </div>

                  <div>
                    {isOperational ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 font-semibold text-[10px] uppercase tracking-wider">
                        <span>Ledger</span>
                        <span className="font-mono font-bold">({cat.total_settings})</span>
                      </span>
                    ) : cat.overridden_count > 0 ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 font-semibold text-[10px] uppercase tracking-wider">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                        <span>{cat.overridden_count} Overridden</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-100 text-emerald-700 font-semibold text-[10px] uppercase tracking-wider">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        <span>.env Defaults</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Title & Description */}
                <h3 className="text-base font-bold text-[#101B32] mb-1.5 group-hover:text-[#0084CC] transition-colors">
                  {cat.name}
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed line-clamp-2 mb-4">
                  {cat.description}
                </p>
              </div>

              {/* Action Bar */}
              <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[11px] font-medium text-slate-400">
                  {isOperational ? `${cat.total_settings} entries available` : `${cat.total_settings} configurable fields`}
                </span>

                <button
                  onClick={() => onNavigateCategory(cat.route)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 text-[#101B32] group-hover:bg-[#0084CC] group-hover:text-white text-xs font-bold transition-all shadow-2xs"
                >
                  <span>{isOperational ? 'Manage' : 'Configure'}</span>
                  <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {filteredCategories.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <Search className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <h4 className="text-sm font-bold text-slate-800 mb-1">No settings matching "{searchTerm}"</h4>
          <p className="text-xs text-slate-500 mb-4">Try searching for keywords like "SMTP", "Password", "Timezone", or "Audit".</p>
          <button
            onClick={() => setSearchTerm('')}
            className="px-4 py-2 rounded-lg bg-[#0084CC] text-white text-xs font-semibold hover:bg-sky-700"
          >
            Clear Search
          </button>
        </div>
      )}
    </div>
  );
};
