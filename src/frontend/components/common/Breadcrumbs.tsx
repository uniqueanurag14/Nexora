import React from 'react';
import { ChevronRight, Home } from 'lucide-react';

export interface BreadcrumbObj {
  label: string;
  onClick?: () => void;
  active?: boolean;
}

export type BreadcrumbItem = string | BreadcrumbObj;

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  onHomeClick?: () => void;
}

export const Breadcrumbs: React.FC<BreadcrumbsProps> = ({ items, onHomeClick }) => {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center text-xs text-slate-500">
      <ol className="flex items-center space-x-1 sm:space-x-2">
        <li>
          <button
            onClick={onHomeClick}
            className="hover:text-sky-600 transition-colors flex items-center gap-1 font-medium"
          >
            <Home className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Home</span>
          </button>
        </li>

        {items.map((rawItem, index) => {
          const item = typeof rawItem === 'string' ? { label: rawItem } : rawItem;
          const isLast = index === items.length - 1;
          return (
            <li key={index} className="flex items-center space-x-1 sm:space-x-2">
              <ChevronRight className="w-3 h-3 text-slate-300 shrink-0" />
              {isLast || !item.onClick ? (
                <span
                  className={`font-semibold capitalize ${
                    isLast ? 'text-slate-900' : 'text-slate-600'
                  }`}
                  aria-current={isLast ? 'page' : undefined}
                >
                  {item.label}
                </span>
              ) : (
                <button
                  onClick={item.onClick}
                  className="hover:text-sky-600 transition-colors font-medium text-slate-600 capitalize"
                >
                  {item.label}
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
};
