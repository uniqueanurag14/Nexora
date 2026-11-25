import React from 'react';
import { LogOut, ShieldCheck, Database, Bell, AlertTriangle } from 'lucide-react';
import { User } from '../types';

interface NavbarProps {
  user: User | null;
  onLogout: () => void;
  lowStockCount?: number;
  onNavigateToLowStock?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  user,
  onLogout,
  lowStockCount = 0,
  onNavigateToLowStock,
}) => {
  return (
    <header className="h-16 border-b border-slate-800 bg-slate-900/90 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-30">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-indigo-600 to-cyan-500 flex items-center justify-center shadow-lg shadow-indigo-500/20 font-bold text-white text-lg">
          N
        </div>
        <div>
          <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
            NEXORA
          </span>
          <span className="ml-2 text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            Enterprise
          </span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        {/* PostgreSQL Database Status Badge */}
        <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-xs font-medium text-emerald-400">
          <Database className="w-3.5 h-3.5 animate-pulse" />
          <span>PostgreSQL Live Persistence</span>
        </div>

        {/* Low Stock Warning Badge */}
        {lowStockCount > 0 && (
          <button
            onClick={onNavigateToLowStock}
            className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-xs font-semibold text-amber-300 hover:bg-amber-500/20 transition-all cursor-pointer animate-pulse"
            title={`${lowStockCount} items below minimum stock threshold`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>{lowStockCount} Low Stock</span>
          </button>
        )}

        {/* User Info & Role */}
        {user && (
          <div className="flex items-center gap-3 pl-2 border-l border-slate-800">
            <div className="text-right hidden md:block">
              <div className="text-sm font-semibold text-slate-200">
                {user.display_name || user.name || `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'User'}
              </div>
              <div className="text-xs text-slate-400 flex items-center justify-end gap-1">
                <ShieldCheck className="w-3 h-3 text-indigo-400" />
                <span>{user.role.replace('_', ' ').toUpperCase()}</span>
              </div>
            </div>

            <button
              onClick={onLogout}
              className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
