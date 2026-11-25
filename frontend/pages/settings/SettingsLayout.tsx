import React, { useState } from 'react';
import {
  RotateCcw,
  ChevronRight,
  Home,
  AlertTriangle,
  Settings as SettingsIcon,
} from 'lucide-react';
import { CategorySummary } from '../../types';

interface SettingsLayoutProps {
  currentCategorySlug: string;
  categorySummaries: CategorySummary[];
  onSelectCategory: (route: string) => void;
  onResetAll?: () => void;
  children: React.ReactNode;
  title?: string;
  description?: string;
  showCategorySidebar?: boolean; // Maintained for interface compatibility, but inner sidebar is removed per requirement
}

export const SettingsLayout: React.FC<SettingsLayoutProps> = ({
  currentCategorySlug,
  categorySummaries,
  onSelectCategory,
  onResetAll,
  children,
}) => {
  const [showResetAllModal, setShowResetAllModal] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const handleConfirmResetAll = async () => {
    if (onResetAll) {
      setIsResetting(true);
      try {
        await onResetAll();
      } finally {
        setIsResetting(false);
        setShowResetAllModal(false);
      }
    }
  };

  const currentCategory = categorySummaries.find(
    c => c.slug === currentCategorySlug || c.id === currentCategorySlug
  );

  return (
    <div className="min-h-screen bg-[#F6F9FC] text-[#101B32]">
      {/* Top Breadcrumb & Action Bar */}
      <div className="bg-white border-b border-slate-200/90 px-4 sm:px-6 lg:px-8 py-3.5 shadow-2xs">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs">
            <button
              onClick={() => onSelectCategory('/dashboard')}
              className="text-slate-500 hover:text-[#0084CC] flex items-center gap-1 font-medium transition-colors focus-visible:ring-2 focus-visible:ring-[#0084CC] rounded-sm"
            >
              <Home className="w-3.5 h-3.5" />
              <span>Dashboard</span>
            </button>
            <ChevronRight className="w-3 h-3 text-slate-400" />
            <button
              onClick={() => onSelectCategory('/settings/general')}
              className="text-slate-500 hover:text-[#0084CC] flex items-center gap-1 font-medium transition-colors focus-visible:ring-2 focus-visible:ring-[#0084CC] rounded-sm"
            >
              <SettingsIcon className="w-3.5 h-3.5" />
              <span>Settings</span>
            </button>
            {currentCategory && (
              <>
                <ChevronRight className="w-3 h-3 text-slate-400" />
                <span className="text-slate-900 font-bold truncate max-w-xs" aria-current="page">
                  {currentCategory.name}
                </span>
              </>
            )}
          </nav>

          <div className="flex items-center gap-2">
            {onResetAll && (
              <button
                type="button"
                onClick={() => setShowResetAllModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-rose-600 hover:bg-rose-50 border border-rose-200 text-xs font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:outline-none"
                title="Restore all configurable system settings to .env defaults by deleting database overrides"
              >
                <RotateCcw className="w-3.5 h-3.5 text-rose-500" />
                <span className="hidden sm:inline">Reset All to .env</span>
                <span className="sm:hidden">Reset</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Container - Direct Content Rendering (No duplicate tabs or sub-nav) */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <main className="min-w-0" id="settings-content">
          {children}
        </main>
      </div>

      {/* Confirmation Modal: Reset All Settings to .env Defaults */}
      {showResetAllModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reset-modal-title"
        >
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center mb-4">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 id="reset-modal-title" className="text-base font-bold text-slate-900 mb-2">
              Restore All Settings to .env Defaults?
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed mb-4">
              This action will remove all custom database overrides across all configurable categories.
              The system will immediately fallback to the default values defined in your{' '}
              <code className="bg-slate-100 px-1 py-0.5 rounded text-[11px] font-mono text-slate-800">.env</code>{' '}
              file. The <code className="bg-slate-100 px-1 py-0.5 rounded text-[11px] font-mono text-slate-800">.env</code> file itself will never be touched.
            </p>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 mb-6 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>
                All active overrides (including branding, timeouts, and thresholds) will be reverted.
              </span>
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowResetAllModal(false)}
                disabled={isResetting}
                className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors focus-visible:ring-2 focus-visible:ring-slate-400"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmResetAll}
                disabled={isResetting}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold transition-colors shadow-xs flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-rose-500"
              >
                {isResetting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Resetting...</span>
                  </>
                ) : (
                  <>
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Confirm Reset to .env</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
