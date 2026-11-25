import React from 'react';
import { useAuth } from '../context/AuthContext';
import { Breadcrumbs } from './Breadcrumbs';
import { UserAvatar } from './UserAvatar';
import { getDisplayName } from '../utils/userUtils';
import {
  Menu,
  ShieldCheck,
  User as UserIcon,
  LogOut,
  Activity,
  KeyRound,
  Settings,
} from 'lucide-react';

interface HeaderProps {
  currentRoute: string;
  onNavigate: (route: string) => void;
  onOpenMobileSidebar: () => void;
  onToggleSidebarCollapse: () => void;
  isSidebarCollapsed: boolean;
  isMobileSidebarOpen?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  currentRoute,
  onNavigate,
  onOpenMobileSidebar,
  isMobileSidebarOpen = false,
}) => {
  const { user, isAuthenticated, logout } = useAuth();

  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Left Side: Mobile Menu Button & Breadcrumbs */}
        <div className="flex items-center gap-3">
          {isAuthenticated && (
            <button
              id="mobile-menu-trigger"
              onClick={onOpenMobileSidebar}
              className="md:hidden min-w-[44px] min-h-[44px] flex items-center justify-center p-2 rounded-xl text-slate-700 hover:text-slate-900 hover:bg-slate-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0084CC]"
              aria-label={isMobileSidebarOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={isMobileSidebarOpen}
              aria-controls="sidebar-drawer"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}

          {/* Brand for unauthenticated or mobile */}
          {!isAuthenticated ? (
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center text-white shadow-xs">
                <ShieldCheck className="w-4 h-4 text-sky-400" />
              </div>
              <span className="text-base font-bold tracking-tight text-slate-900">
                NEX<span className="text-sky-600">ORA</span>
              </span>
            </div>
          ) : (
            <Breadcrumbs currentRoute={currentRoute} onNavigate={onNavigate} />
          )}
        </div>

        {/* Right Action Area */}
        <div className="flex items-center gap-3">
          {isAuthenticated && user ? (
            <div className="flex items-center gap-2 sm:gap-3">
              {/* Profile Avatar Pill */}
              <button
                onClick={() => onNavigate('/profile')}
                className="flex items-center gap-2 p-1.5 sm:px-3 sm:py-1.5 rounded-xl border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-colors text-left"
                title="View your profile"
              >
                <UserAvatar user={user} size="sm" shape="rounded" className="w-8 h-8 rounded-lg" />
                <div className="hidden sm:block text-xs">
                  <div className="font-bold text-slate-800 leading-tight">
                    {getDisplayName(user)}
                  </div>
                  <div className="text-[10px] text-slate-500 capitalize">
                    {user.role.replace('_', ' ')}
                  </div>
                </div>
              </button>

              {/* Quick Settings Shortcut */}
              <button
                onClick={() => onNavigate('/settings/general')}
                className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors hidden sm:flex focus-visible:ring-2 focus-visible:ring-[#0084CC]"
                title="General Settings"
                aria-label="General Settings"
              >
                <Settings className="w-4 h-4" />
              </button>

              {/* System Diagnostics */}
              <button
                onClick={() => onNavigate('/status')}
                className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors hidden sm:flex"
                title="System Health"
                aria-label="System Health"
              >
                <Activity className="w-4 h-4 text-emerald-600" />
              </button>

              {/* Logout Button */}
              <button
                onClick={logout}
                className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-rose-600 p-2 sm:px-3 sm:py-2 rounded-xl hover:bg-rose-50 border border-transparent hover:border-rose-100 transition-colors"
                title="Log out"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={() => onNavigate('/status')}
                className="flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-900"
              >
                <Activity className="w-4 h-4 text-emerald-600" />
                Diagnostics
              </button>
              <button
                onClick={() => onNavigate('/login')}
                className="text-xs font-semibold px-4 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800 transition-colors shadow-xs"
              >
                Sign In
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
