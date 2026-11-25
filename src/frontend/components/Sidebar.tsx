import React, { useState, useEffect } from 'react';
import { MenuItem } from '../types';
import { api } from '../services/api';
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
} from 'lucide-react';

const ICON_MAP: Record<string, React.ElementType> = {
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
  Database,
  Smartphone,
  User,
  KeyRound,
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
  const [menus, setMenus] = useState<MenuItem[]>([]);
  const [openAccordions, setOpenAccordions] = useState<Record<number, boolean>>({});
  const [openSubAccordions, setOpenSubAccordions] = useState<Record<number, boolean>>({});
  const [isLoading, setIsLoading] = useState(true);

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
                if (c.route === currentRoute) {
                  initialOpen[parent.id] = true;
                }
                if (c.children && c.children.some(gc => gc.route === currentRoute)) {
                  initialOpen[parent.id] = true;
                  initialSubOpen[c.id] = true;
                }
              });
            }
          });
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
      {/* Mobile Backdrop Overlay */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-xs lg:hidden transition-opacity"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 flex flex-col bg-slate-900 text-slate-200 border-r border-slate-800 transition-all duration-300 ease-in-out ${
          isMobileOpen ? 'translate-x-0 w-72' : '-translate-x-full lg:translate-x-0'
        } ${isCollapsed ? 'lg:w-20' : 'lg:w-72'}`}
        aria-label="Sidebar Navigation"
      >
        {/* Brand Header & Toggle */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-slate-800/80 shrink-0">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-9 h-9 rounded-xl bg-linear-to-br from-sky-500 to-sky-700 flex items-center justify-center text-white shadow-md shrink-0">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            {(!isCollapsed || isMobileOpen) && (
              <div className="flex flex-col truncate">
                <div className="flex items-center gap-1.5">
                  <span className="text-base font-extrabold tracking-tight text-white leading-tight">
                    NEX<span className="text-sky-400">ORA</span>
                  </span>
                  <span className="text-[9px] font-semibold px-1 py-0.2 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30">
                    Toy BiZ ltd
                  </span>
                </div>
                <span className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
                  Enterprise Platform
                </span>
              </div>
            )}
          </div>

          {/* Desktop Toggle Button */}
          <button
            onClick={onToggleCollapse}
            className="hidden lg:flex p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500"
            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isCollapsed ? <PanelLeft className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
          </button>

          {/* Mobile Close Button */}
          <button
            onClick={onCloseMobile}
            className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            aria-label="Close sidebar drawer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Navigation Tree */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1.5 custom-scrollbar">
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
                c.route === currentRoute || (c.children && c.children.some(gc => gc.route === currentRoute))
              );
              const isActive = item.route === currentRoute || isChildActive;
              const isOpen = !!openAccordions[item.id];

              return (
                <div key={item.id} className="relative group">
                  {/* Parent Menu Item */}
                  <button
                    onClick={() => handleItemClick(item)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all duration-150 text-left ${
                      isActive
                        ? 'bg-sky-500/15 text-sky-400 border border-sky-500/30 font-bold'
                        : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
                    } ${isCollapsed && !isMobileOpen ? 'justify-center px-0' : ''}`}
                    title={isCollapsed && !isMobileOpen ? item.label : undefined}
                    aria-expanded={hasChildren ? isOpen : undefined}
                  >
                    <div className={`shrink-0 ${isActive ? 'text-sky-400' : 'text-slate-400 group-hover:text-slate-200'}`}>
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
                          <span className="text-slate-500 group-hover:text-slate-300">
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
                    <div className="mt-1 ml-4 pl-3 border-l border-slate-800 space-y-1 animate-in slide-in-from-top-1 duration-150">
                      {item.children!.map(child => {
                        const hasGrandChildren = child.children && child.children.length > 0;
                        const isSubActive = child.route === currentRoute;
                        const isGrandChildActive = hasGrandChildren && child.children!.some(gc => gc.route === currentRoute);
                        const isSubGroupOpen = openSubAccordions[child.id] !== false;

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
                                className={`w-full flex items-center justify-between px-2 py-1.5 rounded-md text-[11px] font-semibold transition-colors text-left ${
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
                                <div className="mt-1 ml-3 pl-2.5 border-l border-slate-800/80 space-y-1">
                                  {child.children!.map(gc => {
                                    const isGcActive = gc.route === currentRoute;
                                    return (
                                      <button
                                        key={gc.id}
                                        onClick={() => {
                                          onNavigate(gc.route);
                                          onCloseMobile();
                                        }}
                                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors text-left ${
                                          isGcActive
                                            ? 'bg-sky-500/20 text-sky-300 font-semibold border-l-2 border-sky-400'
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
                            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-[11px] font-medium transition-colors text-left ${
                              isSubActive
                                ? 'bg-sky-500/20 text-sky-300 font-semibold border-l-2 border-sky-400'
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
        </div>

        {/* Sidebar Footer Info */}
        {(!isCollapsed || isMobileOpen) && (
          <div className="p-3 border-t border-slate-800/80 bg-slate-950/40 text-[10px] text-slate-500 flex items-center justify-between">
            <span>Toy BiZ ltd • Granular RBAC</span>
            <span className="font-mono text-emerald-400">● Live DB</span>
          </div>
        )}
      </aside>
    </>
  );
};
