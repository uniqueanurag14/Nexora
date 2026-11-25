import React, { useState, useEffect, useRef } from 'react';
import { MenuItem } from '../types';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard,
  Users,
  UserCheck,
  Network,
  Monitor,
  CheckSquare,
  BarChart2,
  Package,
  FolderTree,
  Layers,
  TrendingUp,
  ArrowLeftRight,
  AlertTriangle,
  Truck,
  Building2,
  Contact,
  MessageSquare,
  ShoppingCart,
  FileText,
  Reply,
  CheckCircle,
  ClipboardCheck,
  Inbox,
  Hash,
  AlertCircle,
  Sliders,
  PieChart,
  FileSpreadsheet,
  Settings,
  SlidersHorizontal,
  Bell,
  ShieldCheck,
  ShieldAlert,
  Shield,
  Key,
  Briefcase,
  Database,
  Smartphone,
  User,
  KeyRound,
  ChevronDown,
  ChevronRight,
  PanelLeftClose,
  PanelLeft,
  X,
  Circle,
  Lock,
  Globe,
  Mail,
  Sparkles,
  Warehouse,
} from 'lucide-react';

const ICON_MAP: Record<string, React.ElementType> = {
  Warehouse,
  LayoutDashboard,
  Users,
  UserCheck,
  Shield,
  Key,
  Briefcase,
  Network,
  Monitor,
  CheckSquare,
  BarChart2,
  Package,
  FolderTree,
  Layers,
  TrendingUp,
  ArrowLeftRight,
  AlertTriangle,
  Truck,
  Building2,
  Contact,
  MessageSquare,
  ShoppingCart,
  FileText,
  Reply,
  CheckCircle,
  ClipboardCheck,
  Inbox,
  Hash,
  AlertCircle,
  Sliders,
  PieChart,
  FileSpreadsheet,
  Settings,
  SlidersHorizontal,
  Bell,
  ShieldCheck,
  ShieldAlert,
  Database,
  Smartphone,
  User,
  KeyRound,
  Globe,
  Mail,
  Sparkles,
};

interface SidebarProps {
  currentRoute: string;
  onNavigate: (route: string) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  isMobileOpen: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentRoute,
  onNavigate,
  isCollapsed,
  onToggleCollapse,
  isMobileOpen,
  onCloseMobile,
}) => {
  const { branding } = useAuth();
  const [menus, setMenus] = useState<MenuItem[]>([]);
  const [openAccordions, setOpenAccordions] = useState<Record<number, boolean>>({});
  const [openSubAccordions, setOpenSubAccordions] = useState<Record<number, boolean>>({});
  const [isLoading, setIsLoading] = useState(true);

  const drawerRef = useRef<HTMLElement>(null);
  const lastActiveElementRef = useRef<HTMLElement | null>(null);

  // Prevent background body scroll when mobile drawer is open
  useEffect(() => {
    if (isMobileOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobileOpen]);

  // Handle Escape key to close mobile drawer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isMobileOpen) {
        onCloseMobile();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMobileOpen, onCloseMobile]);

  // Focus trapping in mobile drawer & restore focus on close
  useEffect(() => {
    if (isMobileOpen) {
      lastActiveElementRef.current = document.activeElement as HTMLElement;
      const timer = setTimeout(() => {
        const focusable = drawerRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable && focusable.length > 0) {
          focusable[0].focus();
        }
      }, 50);
      return () => clearTimeout(timer);
    } else if (lastActiveElementRef.current) {
      try {
        lastActiveElementRef.current.focus();
      } catch {}
    }
  }, [isMobileOpen]);

  const handleKeyDownTrap = (e: React.KeyboardEvent) => {
    if (!isMobileOpen || e.key !== 'Tab') return;
    const focusable = drawerRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    if (!focusable || focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  // Fetch database-driven navigation menu
  useEffect(() => {
    let mounted = true;
    const fetchMenu = async () => {
      try {
        const res = await api.getNavigationMenu();
        if (mounted && res.success && res.data) {
          setMenus(res.data);

          // Automatically expand accordion if a child or grandchild is active
          const initialOpen: Record<number, boolean> = {};
          const initialSubOpen: Record<number, boolean> = {};
          res.data.forEach(parent => {
            if (parent.children) {
              parent.children.forEach(c => {
                const isMatch =
                  c.route === currentRoute ||
                  (c.route === '/users' && currentRoute === '/administration/users') ||
                  (c.route === '/roles' && currentRoute === '/administration/roles') ||
                  (c.route === '/permissions' && currentRoute === '/administration/permissions') ||
                  (c.route === '/settings/sessions' && currentRoute === '/settings/active-sessions') ||
                  (c.route === '/settings/active-sessions' && currentRoute === '/settings/sessions') ||
                  (c.route === '/settings/backups' && currentRoute === '/settings/database-backups') ||
                  (c.route === '/settings/database-backups' && currentRoute === '/settings/backups') ||
                  (c.route.startsWith('/settings') && currentRoute.startsWith('/settings'));
                if (isMatch) {
                  initialOpen[parent.id] = true;
                }
                if (c.children && c.children.some(gc => gc.route === currentRoute)) {
                  initialOpen[parent.id] = true;
                  initialSubOpen[c.id] = true;
                }
              });
            }
          });

          // Always keep Settings expanded when navigating in /settings
          if (currentRoute.startsWith('/settings')) {
            const settingsParent = res.data.find(m => m.id === 12 || m.label.toLowerCase() === 'settings');
            if (settingsParent) {
              initialOpen[settingsParent.id] = true;
            }
          }

          setOpenAccordions(prev => ({ ...prev, ...initialOpen }));
          setOpenSubAccordions(prev => ({ ...prev, ...initialSubOpen }));
        }
      } catch (err) {
        console.error('Failed to load navigation menu:', err);
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    fetchMenu();
    return () => {
      mounted = false;
    };
  }, [currentRoute]);

  const toggleAccordion = (id: number) => {
    setOpenAccordions(prev => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const handleItemClick = (item: MenuItem) => {
    if (item.children && item.children.length > 0) {
      if (isCollapsed) {
        onToggleCollapse(); // expand when user clicks parent in collapsed mode
      }
      toggleAccordion(item.id);

      // Section 4 requirement: When clicking parent Settings menu, open General Settings by default
      if (item.id === 12 || item.label.toLowerCase() === 'settings') {
        const firstChild = item.children[0];
        const targetRoute = firstChild ? firstChild.route : '/settings/general';
        onNavigate(targetRoute);
      }
    } else {
      onNavigate(item.route);
      onCloseMobile();
    }
  };

  const renderIcon = (iconName: string, className = 'w-4 h-4') => {
    const Component = ICON_MAP[iconName] || Circle;
    return <Component className={className} />;
  };

  return (
    <>
      {/* Mobile Backdrop Overlay (Sliding drawer < md breakpoint) */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/70 backdrop-blur-xs md:hidden transition-opacity duration-300"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      {/* Sidebar Container */}
      <aside
        ref={drawerRef}
        id="sidebar-drawer"
        onKeyDown={handleKeyDownTrap}
        className={`fixed top-0 bottom-0 left-0 z-50 flex flex-col bg-[#101B32] text-slate-200 border-r border-slate-800 transition-transform duration-300 ease-in-out motion-reduce:transition-none motion-reduce:transform-none ${
          isMobileOpen
            ? 'translate-x-0 w-72 shadow-2xl'
            : '-translate-x-full md:translate-x-0'
        } ${isCollapsed ? 'md:w-20' : 'md:w-72'}`}
        aria-label="Main Navigation"
      >
        {/* Brand Header & Toggle */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-slate-800/80 shrink-0">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-9 h-9 rounded-xl bg-linear-to-br from-[#0084CC] to-sky-700 flex items-center justify-center text-white shadow-md shrink-0">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            {(!isCollapsed || isMobileOpen) && (
              <div className="flex flex-col truncate">
                <div className="flex items-center gap-1.5">
                  <span className="text-base font-extrabold tracking-tight text-white leading-tight">
                    NEX<span className="text-[#00B8E8]">ORA</span>
                  </span>
                  {branding.companyName && (
                    <span className="text-[9px] font-semibold px-1 py-0.2 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30">
                      {branding.companyName}
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
                  {branding.tagline}
                </span>
              </div>
            )}
          </div>

          {/* Desktop Toggle Button */}
          <button
            onClick={onToggleCollapse}
            className="hidden md:flex p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0084CC]"
            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isCollapsed ? <PanelLeft className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
          </button>

          {/* Mobile Close Button (Touch Target >= 44x44px) */}
          <button
            onClick={onCloseMobile}
            className="md:hidden min-w-[44px] min-h-[44px] flex items-center justify-center p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0084CC]"
            aria-label="Close navigation menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Navigation Tree */}
        <nav aria-label="Main Navigation Tree" className="flex-1 overflow-y-auto px-3 py-4 space-y-1.5 custom-scrollbar">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} className="h-9 rounded-xl bg-slate-800/50 animate-pulse" />
              ))}
            </div>
          ) : (
            menus.map(item => {
              const hasChildren = item.children && item.children.length > 0;
              const isChildActive = hasChildren && item.children?.some(c => 
                c.route === currentRoute || 
                (c.route === '/settings/general' && (currentRoute === '/settings' || currentRoute === '/settings/overview')) ||
                (c.children && c.children.some(gc => gc.route === currentRoute))
              );
              const isActive = item.route === currentRoute || isChildActive;
              const isOpen = !!openAccordions[item.id];
              const submenuId = `submenu-${item.id}`;

              return (
                <div key={item.id} className="relative group">
                  {/* Parent Menu Item */}
                  <button
                    onClick={() => handleItemClick(item)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all duration-150 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0084CC] ${
                      isActive
                        ? 'bg-[#0084CC]/20 text-sky-300 border border-[#0084CC]/40 font-bold'
                        : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
                    } ${isCollapsed && !isMobileOpen ? 'justify-center px-0' : ''}`}
                    title={isCollapsed && !isMobileOpen ? item.label : undefined}
                    aria-expanded={hasChildren ? isOpen : undefined}
                    aria-controls={hasChildren ? submenuId : undefined}
                    aria-current={!hasChildren && isActive ? 'page' : undefined}
                  >
                    <div className={`shrink-0 ${isActive ? 'text-[#00B8E8]' : 'text-slate-400 group-hover:text-slate-200'}`}>
                      {renderIcon(item.icon, 'w-5 h-5')}
                    </div>

                    {(!isCollapsed || isMobileOpen) && (
                      <>
                        <span className="flex-1 truncate">{item.label}</span>

                        {/* Status Tag for planned future modules */}
                        {!item.is_implemented && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-slate-800 text-slate-400 uppercase tracking-wider border border-slate-700/60">
                            Planned
                          </span>
                        )}

                        {hasChildren && (
                          <span className="text-slate-500 group-hover:text-slate-300 transition-transform">
                            {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                          </span>
                        )}
                      </>
                    )}
                  </button>

                  {/* Collapsed Tooltip */}
                  {isCollapsed && !isMobileOpen && (
                    <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2.5 py-1.5 rounded-lg bg-slate-800 text-white text-xs font-medium whitespace-nowrap shadow-xl border border-slate-700 opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
                      {item.label}
                      {!item.is_implemented && ' (Planned)'}
                    </div>
                  )}

                  {/* Accordion Children Submenu */}
                  {hasChildren && isOpen && (!isCollapsed || isMobileOpen) && (
                    <div
                      id={submenuId}
                      className="mt-1 ml-4 pl-3 border-l border-slate-800 space-y-1 animate-in slide-in-from-top-1 duration-150 motion-reduce:animate-none"
                    >
                      {item.children!.map(child => {
                        const hasGrandChildren = child.children && child.children.length > 0;
                        const isSubActive =
                          child.route === currentRoute ||
                          (child.route === '/settings/general' && (currentRoute === '/settings' || currentRoute === '/settings/overview')) ||
                          (child.route === '/users' && currentRoute === '/administration/users') ||
                          (child.route === '/roles' && currentRoute === '/administration/roles') ||
                          (child.route === '/permissions' && currentRoute === '/administration/permissions') ||
                          (child.route === '/settings/sessions' && currentRoute === '/settings/active-sessions') ||
                          (child.route === '/settings/active-sessions' && currentRoute === '/settings/sessions') ||
                          (child.route === '/settings/backups' && currentRoute === '/settings/database-backups') ||
                          (child.route === '/settings/database-backups' && currentRoute === '/settings/backups');
                        const isGrandChildActive = hasGrandChildren && child.children!.some(gc => gc.route === currentRoute);
                        const isSubGroupOpen = openSubAccordions[child.id] !== false;
                        const subGroupId = `subgroup-${child.id}`;

                        if (hasGrandChildren) {
                          return (
                            <div key={child.id} className="pt-1 pb-0.5">
                              {/* Subgroup Heading (e.g. Performance Management) */}
                              <button
                                onClick={() => {
                                  setOpenSubAccordions(prev => ({
                                    ...prev,
                                    [child.id]: !isSubGroupOpen,
                                  }));
                                }}
                                aria-expanded={isSubGroupOpen}
                                aria-controls={subGroupId}
                                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-[11px] font-semibold transition-colors text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0084CC] ${
                                  isGrandChildActive
                                    ? 'text-sky-300 bg-slate-800/60 font-bold'
                                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                                }`}
                              >
                                <div className="flex items-center gap-2 truncate">
                                  {renderIcon(child.icon, 'w-3.5 h-3.5 text-sky-400')}
                                  <span className="truncate">{child.label}</span>
                                </div>
                                <span className="text-slate-500">
                                  {isSubGroupOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                                </span>
                              </button>

                              {/* Subgroup children (e.g. Live Performance, Performance Reports) */}
                              {isSubGroupOpen && (
                                <div id={subGroupId} className="mt-1 ml-3 pl-2.5 border-l border-slate-800/80 space-y-1">
                                  {child.children!.map(gc => {
                                    const isGcActive = gc.route === currentRoute;
                                    return (
                                      <button
                                        key={gc.id}
                                        onClick={() => {
                                          onNavigate(gc.route);
                                          onCloseMobile();
                                        }}
                                        aria-current={isGcActive ? 'page' : undefined}
                                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0084CC] ${
                                          isGcActive
                                            ? 'bg-[#0084CC] text-white font-semibold shadow-xs'
                                            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                                        }`}
                                      >
                                        <div className="flex items-center gap-2 truncate">
                                          {renderIcon(gc.icon, 'w-3 h-3')}
                                          <span className="truncate">{gc.label}</span>
                                        </div>
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        }

                        return (
                          <button
                            key={child.id}
                            onClick={() => {
                              onNavigate(child.route);
                              onCloseMobile();
                            }}
                            aria-current={isSubActive ? 'page' : undefined}
                            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-[11px] font-medium transition-colors text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0084CC] ${
                              isSubActive
                                ? 'bg-[#0084CC] text-white font-bold shadow-xs'
                                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                            }`}
                          >
                            <div className="flex items-center gap-2 truncate">
                              {renderIcon(child.icon, 'w-3.5 h-3.5')}
                              <span className="truncate">{child.label}</span>
                            </div>

                            {!child.is_implemented && (
                              <Lock className="w-3 h-3 text-slate-600 shrink-0 ml-1" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </nav>

        {/* Sidebar Footer Info */}
        {(!isCollapsed || isMobileOpen) && (
          <div className="p-3 border-t border-slate-800/80 bg-slate-950/60 text-[10px] text-slate-500 flex items-center justify-between">
            <span>{branding.companyName ? `${branding.companyName} • Granular RBAC` : 'Granular RBAC'}</span>
            <span className="font-mono text-emerald-400">● Live DB</span>
          </div>
        )}
      </aside>
    </>
  );
};
export default Sidebar;
