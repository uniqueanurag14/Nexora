import React from 'react';
import { ChevronRight, Home } from 'lucide-react';

interface BreadcrumbsProps {
  currentRoute: string;
  onNavigate: (route: string) => void;
}

export const Breadcrumbs: React.FC<BreadcrumbsProps> = ({ currentRoute, onNavigate }) => {
  const parts = currentRoute.split('/').filter(Boolean);

  const getLabel = (part: string) => {
    return part
      .split('-')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  };

  return (
    <nav aria-label="Breadcrumbs" className="flex items-center gap-1.5 text-xs text-slate-500 py-1">
      <button
        onClick={() => onNavigate('/dashboard')}
        className="flex items-center gap-1 hover:text-slate-900 transition-colors"
      >
        <Home className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Home</span>
      </button>

      {parts.length === 0 || (parts.length === 1 && parts[0] === 'dashboard') ? null : (
        parts.map((part, index) => {
          const route = '/' + parts.slice(0, index + 1).join('/');
          const isLast = index === parts.length - 1;

          return (
            <React.Fragment key={route}>
              <ChevronRight className="w-3 h-3 text-slate-400" />
              {isLast ? (
                <span className="font-semibold text-slate-800">{getLabel(part)}</span>
              ) : (
                <button
                  onClick={() => onNavigate(route)}
                  className="hover:text-slate-900 transition-colors"
                >
                  {getLabel(part)}
                </button>
              )}
            </React.Fragment>
          );
        })
      )}
    </nav>
  );
};
