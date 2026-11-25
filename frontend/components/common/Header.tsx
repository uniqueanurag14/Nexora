import React, { useState, useRef, useEffect } from 'react';
import {
  Menu,
  Bell,
  Search,
  User as UserIcon,
  KeyRound,
  Settings,
  LogOut,
  ChevronDown,
  Shield,
  Laptop,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface HeaderProps {
  currentView: string;
  onNavigate: (view: string) => void;
  onToggleMobileMenu: () => void;
  breadcrumbs?: string[];
}

export const Header: React.FC<HeaderProps> = ({
  currentView,
  onNavigate,
  onToggleMobileMenu,
  breadcrumbs,
}) => {
  const { user, logout } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const formatViewTitle = (view: string) => {
    if (view === 'dashboard') return 'Dashboard';
    if (view === 'profile') return 'My Profile';
    if (view === 'change-password') return 'Change Password';
    if (view.startsWith('settings')) return 'Settings';
    if (view.startsWith('workforce')) return 'Workforce Management';
    if (view.startsWith('inventory')) return 'Inventory Management';
    if (view.startsWith('suppliers')) return 'Supplier Management';
    if (view.startsWith('purchases')) return 'Purchase Requests';
    if (view.startsWith('goods-receipt')) return 'Goods Receipt';
    if (view.startsWith('reports')) return 'Reports & Analytics';
    if (view.startsWith('admin-suite')) return 'System Administration';
    return view.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  };

  const isSuperAdmin = user?.role === 'super_admin';
  const isAdmin = isSuperAdmin || user?.role === 'admin';

  return (
    <header className="sticky top-0 z-20 h-16 bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-4 sm:px-6 lg:px-8 flex items-center justify-between">
      {/* Left: Mobile Toggle & Page Title / Breadcrumbs */}
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleMobileMenu}
          className="lg:hidden p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
          aria-label="Open navigation menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 text-xs">
          <span className="font-extrabold text-sm sm:text-base text-slate-900 tracking-tight">
            {formatViewTitle(currentView)}
          </span>
          {breadcrumbs && breadcrumbs.length > 0 && (
            <span className="hidden md:inline-flex items-center gap-1.5 text-slate-400">
              <span>/</span>
              {breadcrumbs.map((b, i) => (
                <span key={i} className="text-slate-500 font-medium capitalize">
                  {b}
                </span>
              ))}
            </span>
          )}
        </div>
      </div>

      {/* Right: Search, Notifications & User Dropdown */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Quick Navigation / Settings Shortcut */}
        {isAdmin && (
          <button
            onClick={() => onNavigate('settings/general')}
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors"
          >
            <Settings className="w-3.5 h-3.5 text-slate-400" />
            <span>Settings</span>
          </button>
        )}

        {/* User Account Dropdown */}
        {user && (
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setDropdownOpen((prev) => !prev)}
              className="flex items-center gap-2.5 p-1.5 sm:px-3 sm:py-1.5 rounded-xl hover:bg-slate-100 transition-colors border border-transparent hover:border-slate-200"
              aria-expanded={dropdownOpen}
              aria-haspopup="true"
            >
              <div className="w-8 h-8 rounded-lg bg-sky-600 text-white font-extrabold flex items-center justify-center text-xs shadow-xs">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div className="hidden sm:block text-left">
                <span className="block text-xs font-bold text-slate-900 truncate max-w-[120px]">
                  {user.name}
                </span>
                <span className="block text-[10px] text-slate-500 capitalize">
                  {user.role.replace('_', ' ')}
                </span>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {/* Dropdown Menu */}
            {dropdownOpen && (
              <div className="absolute right-0 mt-2 w-64 rounded-2xl bg-white border border-slate-200 shadow-xl py-2 z-50 divide-y divide-slate-100 animate-fadeIn">
                {/* User Header Info */}
                <div className="px-4 py-3">
                  <p className="text-xs font-bold text-slate-900 truncate">{user.name}</p>
                  <p className="text-xs text-slate-500 truncate">{user.email}</p>
                  <div className="mt-2 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-50 text-sky-700 border border-sky-200 capitalize">
                    <Shield className="w-3 h-3" />
                    Role: {user.role.replace('_', ' ')}
                  </div>
                </div>

                {/* Navigation Links */}
                <div className="py-1">
                  <button
                    onClick={() => {
                      onNavigate('profile');
                      setDropdownOpen(false);
                    }}
                    className="w-full px-4 py-2 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2.5 font-medium transition-colors"
                  >
                    <UserIcon className="w-3.5 h-3.5 text-slate-400" />
                    My Profile
                  </button>

                  <button
                    onClick={() => {
                      onNavigate('change-password');
                      setDropdownOpen(false);
                    }}
                    className="w-full px-4 py-2 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2.5 font-medium transition-colors"
                  >
                    <KeyRound className="w-3.5 h-3.5 text-slate-400" />
                    Change Password
                  </button>

                  <button
                    onClick={() => {
                      onNavigate('settings/sessions');
                      setDropdownOpen(false);
                    }}
                    className="w-full px-4 py-2 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2.5 font-medium transition-colors"
                  >
                    <Laptop className="w-3.5 h-3.5 text-slate-400" />
                    Active Sessions
                  </button>

                  {isAdmin && (
                    <button
                      onClick={() => {
                        onNavigate('settings/general');
                        setDropdownOpen(false);
                      }}
                      className="w-full px-4 py-2 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2.5 font-medium transition-colors"
                    >
                      <Settings className="w-3.5 h-3.5 text-slate-400" />
                      System Settings
                    </button>
                  )}
                </div>

                {/* Logout */}
                <div className="py-1">
                  <button
                    onClick={() => {
                      setDropdownOpen(false);
                      logout();
                    }}
                    className="w-full px-4 py-2 text-xs text-rose-600 hover:bg-rose-50 flex items-center gap-2.5 font-semibold transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5 text-rose-500" />
                    Sign Out
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
};
