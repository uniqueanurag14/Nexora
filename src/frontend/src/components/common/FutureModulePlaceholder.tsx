import React from 'react';
import { PageHeader } from './PageHeader';
import { ShieldCheck, Calendar, Clock, Layers, ArrowLeft } from 'lucide-react';

interface FutureModulePlaceholderProps {
  moduleNumber: number | string;
  moduleTitle: string;
  subfeatureName: string;
  plannedCapabilities: string[];
  requiredPermission?: string;
  onNavigate?: (path: string) => void;
}

export const FutureModulePlaceholder: React.FC<FutureModulePlaceholderProps> = ({
  moduleNumber,
  moduleTitle,
  subfeatureName,
  plannedCapabilities,
  requiredPermission,
  onNavigate,
}) => {
  return (
    <div className="space-y-6">
      <PageHeader
        title={`${subfeatureName}`}
        subtitle={`Module ${moduleNumber} — ${moduleTitle}`}
        breadcrumbs={[
          { label: 'Workspace', href: '/erp/dashboard' },
          { label: moduleTitle },
          { label: subfeatureName, active: true },
        ]}
        actions={
          onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate('/erp/dashboard')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/60 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Dashboard</span>
            </button>
          )
        }
        onNavigate={onNavigate}
      />

      {/* Structured Planning Banner */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xs">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200/80 dark:border-amber-900/60 mb-4">
            <Clock className="w-3.5 h-3.5" />
            <span>Architecture Ready • Scheduled for Module {moduleNumber}</span>
          </div>

          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mb-2">
            {subfeatureName}
          </h2>

          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-6">
            This module navigation entry is registered in the database-driven menu hierarchy and RBAC security matrix. In accordance with architectural boundaries, business operations for this feature remain locked until Module {moduleNumber} implementation.
          </p>

          <div className="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-5 border border-slate-200/60 dark:border-slate-700/60 mb-6">
            <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Layers className="w-4 h-4 text-teal-600 dark:text-teal-400" />
              <span>Planned Capabilities for Module {moduleNumber}</span>
            </h4>
            <ul className="grid sm:grid-cols-2 gap-2 text-xs text-slate-600 dark:text-slate-300">
              {plannedCapabilities.map((cap, i) => (
                <li key={i} className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-teal-500 shrink-0" />
                  <span>{cap}</span>
                </li>
              ))}
            </ul>
          </div>

          {requiredPermission && (
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <ShieldCheck className="w-4 h-4 text-teal-600 dark:text-teal-400" />
              <span>RBAC Permission Scope: <code className="font-mono font-semibold text-slate-800 dark:text-slate-200">{requiredPermission}</code></span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
