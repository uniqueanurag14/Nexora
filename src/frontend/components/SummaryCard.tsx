import React from 'react';

interface SummaryCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon?: React.ReactNode;
  status?: 'normal' | 'success' | 'warning' | 'error';
  trend?: string;
}

export const SummaryCard: React.FC<SummaryCardProps> = ({
  title,
  value,
  description,
  icon,
  status = 'normal',
  trend,
}) => {
  const getStatusColor = () => {
    switch (status) {
      case 'success':
        return 'text-emerald-600 bg-emerald-50 border-emerald-200';
      case 'warning':
        return 'text-amber-600 bg-amber-50 border-amber-200';
      case 'error':
        return 'text-rose-600 bg-rose-50 border-rose-200';
      default:
        return 'text-slate-700 bg-slate-50 border-slate-200';
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between hover:border-slate-300 transition-all">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
          {title}
        </span>
        {icon && <div className="p-2 rounded-xl bg-slate-50 text-slate-600">{icon}</div>}
      </div>

      <div className="mt-3">
        <div className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
          {value}
        </div>
        {description && (
          <p className="mt-1 text-xs text-slate-500 line-clamp-1">{description}</p>
        )}
      </div>

      {(trend || status !== 'normal') && (
        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px]">
          <span className={`px-2 py-0.5 rounded-full font-semibold border ${getStatusColor()}`}>
            {status.toUpperCase()}
          </span>
          {trend && <span className="text-slate-400 font-medium">{trend}</span>}
        </div>
      )}
    </div>
  );
};
