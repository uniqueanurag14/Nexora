import React from 'react';
import { PageHeader } from '../components/PageHeader';
import { Layers, Lock, ShieldCheck, ArrowRight } from 'lucide-react';

interface PlannedModulePageProps {
  moduleTitle: string;
  moduleCode: string;
  description: string;
  plannedFeatures: string[];
  onNavigate: (route: string) => void;
}

export const PlannedModulePage: React.FC<PlannedModulePageProps> = ({
  moduleTitle,
  moduleCode,
  description,
  plannedFeatures,
  onNavigate,
}) => {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <PageHeader
        title={moduleTitle}
        description={`Standard enterprise interface for ${moduleTitle}. Integrated with RBAC and database schema.`}
        icon={<Layers className="w-5 h-5 text-sky-600" />}
      />

      {/* Planned Module Information Banner */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-amber-50 text-amber-600 border border-amber-200/60">
              <Lock className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">{moduleTitle}</h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 uppercase tracking-wider">
                  {moduleCode}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Architecture ready: navigation, database model hooks, and permissions defined
              </p>
            </div>
          </div>

          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-sky-50 text-sky-700 border border-sky-200">
            <ShieldCheck className="w-3.5 h-3.5" />
            RBAC Guard Active
          </div>
        </div>

        <div className="py-6 space-y-4">
          <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider text-slate-500">
            Planned Business Capabilities
          </h4>
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed max-w-3xl">
            {description}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            {plannedFeatures.map((feat, idx) => (
              <div
                key={idx}
                className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-100 bg-slate-50/50 text-xs font-medium text-slate-700"
              >
                <div className="w-1.5 h-1.5 rounded-full bg-sky-500 shrink-0" />
                <span>{feat}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="pt-6 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <span>In compliance with Module 4 architecture standards: Business logic unavailable until activated.</span>
          <button
            onClick={() => onNavigate('/dashboard')}
            className="inline-flex items-center gap-1.5 font-semibold text-sky-600 hover:text-sky-800 transition-colors"
          >
            Return to Dashboard
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
