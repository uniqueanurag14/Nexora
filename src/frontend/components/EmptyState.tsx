import React from 'react';
import { Database, ShieldAlert } from 'lucide-react';

interface EmptyStateProps {
  title: string;
  description?: string;
  message?: string;
  actionText?: string;
  onAction?: () => void;
  icon?: 'database' | 'security';
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  message,
  actionText,
  onAction,
  icon = 'database',
}) => {
  const displayDescription = description || message || 'No records found in PostgreSQL.';
  return (
    <div className="flex flex-col items-center justify-center p-8 sm:p-12 text-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50">
      <div className="w-12 h-12 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-center text-slate-500 mb-4">
        {icon === 'database' ? (
          <Database className="w-6 h-6 text-sky-600" />
        ) : (
          <ShieldAlert className="w-6 h-6 text-slate-600" />
        )}
      </div>
      <h3 className="text-base font-semibold text-slate-900 mb-1">{title}</h3>
      <p className="text-sm text-slate-500 max-w-sm mb-6 leading-relaxed">
        {displayDescription}
      </p>
      {actionText && onAction && (
        <button
          onClick={onAction}
          className="inline-flex items-center px-4 py-2 text-xs font-semibold rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 shadow-sm transition-colors"
        >
          {actionText}
        </button>
      )}
    </div>
  );
};
