import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Users,
  UserCheck,
  Network,
  Monitor,
  CheckSquare,
  TrendingUp,
  Boxes,
  FolderTree,
  Package,
  BarChart3,
  ArrowLeftRight,
  AlertTriangle,
  Truck,
  Building2,
  Contact,
  MessageSquare,
  FileCheck,
  FileText,
  ReplyAll,
  ShieldAlert,
  ClipboardCheck,
  FilePlus,
  Layers,
  FileWarning,
  SlidersHorizontal,
  PieChart,
  Users2,
  BadgePercent,
  Shield,
  History,
  MailCheck,
  Bell,
  Settings2,
  Settings,
  Sliders,
  BellRing,
  FileSpreadsheet,
  HardDriveDownload,
  Laptop,
  User as UserIcon,
  KeyRound,
  LogOut,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  X,
  LucideIcon,
  Circle,
  HelpCircle,
} from 'lucide-react';
import { MenuItemDTO } from '../../types';
import { useAuth } from '../../context/AuthContext';

// Icon resolver dictionary
const iconMap: Record<string, LucideIcon> = {
  LayoutDashboard,
  Users,
  UserCheck,
  Network,
  Monitor,
  CheckSquare,
  TrendingUp,
  Boxes,
  FolderTree,
  Package,
  BarChart3,
  ArrowLeftRight,
  AlertTriangle,
  Truck,
  Building2,
  Contact,
  MessageSquare,
  FileCheck,
  FileText,
  ReplyAll,
  ShieldAlert,
  ClipboardCheck,
  FilePlus,
  Layers,
  FileWarning,
  SlidersHorizontal,
  PieChart,
  Users2,
  BadgePercent,
  Shield,
  History,
  MailCheck,
  Bell,
  Settings2,
  Settings,
  Sliders,
  BellRing,
  FileSpreadsheet,
  HardDriveDownload,
  Laptop,
  User: UserIcon,
  KeyRound,
  LogOut,
};

export const getMenuIcon = (name: string): LucideIcon => {
  return iconMap[name] || Circle;
};

interface SidebarProps {
  currentView: string;
  onNavigate: (view: string) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  isMobileOpen: boolean;
  onCloseMobile: () => void;
  menuItems: MenuItemDTO[];
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  onNavigate,
  isCollapsed,
  onToggleCollapse,
  isMobileOpen,
  onCloseMobile,
  menuItems,
}) => {
  const { user, logout } = useAuth();
  const [openAccordions, setOpenAccordions] = useState<Record<string, boolean>>({});

  // Automatically expand parent of the active item
  useEffect(() => {
    for (const parent of menuItems) {
      if (parent.children && parent.children.length > 0) {
        const matchesChild = parent.children.some(
          (c: any) => c.route?.replace('/', '') === currentView || (c as any).code === currentView
        );
        if (matchesChild) {
          setOpenAccordions((prev) => ({ ...prev, [(parent as any).code || parent.id]: true }));
        }
      }
    }
  }, [currentView, menuItems]);

  const toggleAccordion = (code: string) => {
    setOpenAccordions((prev) => ({
      ...prev,
      [code]: !prev[code],
    }));
  };

  const handleItemClick = (item: MenuItemDTO) => {
    const itemCode = item.code || String(item.id);
    if (item.code === 'logout' || itemCode === 'logout') {
      logout();
      return;
    }

    if (item.children && item.children.length > 0) {
      toggleAccordion(itemCode);
      return;
    }

    if (item.route) {
      const viewCode = item.route.replace('/', '');
      onNavigate(viewCode);
      onCloseMobile();
    } else {
      onNavigate(itemCode);
      onCloseMobile();
    }
  };

  const isItemActive = (item: any): boolean => {
    const itemRoute = item.route ? item.route.replace('/', '') : item.code || String(item.id);
    if (itemRoute === currentView) return true;
    if (item.children && item.children.length > 0) {
      return item.children.some(
        (c: any) => (c.route ? c.route.replace('/', '') : c.code || String(c.id)) === currentView
      );
    }
    return false;
  };

  const renderMenuItem = (item: MenuItemDTO, depth: number = 0) => {
    const Icon = getMenuIcon(item.icon);
    const hasChildren = !!(item.children && item.children.length > 0);
    const itemCode = item.code || String(item.id);
    const isExpanded = !!openAccordions[itemCode];
    const active = isItemActive(item);

    return (
      <div key={item.id || itemCode} className="space-y-1">
        <button
          onClick={() => handleItemClick(item)}
          title={isCollapsed ? item.label : undefined}
          aria-expanded={hasChildren ? isExpanded : undefined}
          className={`w-full group relative flex items-center justify-between text-left rounded-xl transition-all duration-150 select-none ${
            isCollapsed
              ? 'px-2.5 py-2.5 justify-center'
              : 'px-3 py-2.5 text-xs'
          } ${
            active && !hasChildren
              ? 'bg-sky-50 text-sky-700 font-bold border border-sky-100 shadow-2xs'
              : active && hasChildren
              ? 'bg-slate-100/80 text-slate-900 font-semibold'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/60 font-medium'
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <Icon
              className={`shrink-0 transition-colors ${
                isCollapsed ? 'w-5 h-5' : 'w-4 h-4'
              } ${
                active ? 'text-sky-600' : 'text-slate-400 group-hover:text-slate-600'
              }`}
            />

            {!isCollapsed && (
              <span className="truncate leading-tight">
                {item.label}
              </span>
            )}
          </div>

          {!isCollapsed && (
            <div className="flex items-center gap-1.5 shrink-0 ml-2">
              {item.module_badge && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-200/80 text-slate-600">
                  {item.module_badge}
                </span>
              )}
              {hasChildren && (
                <span className="text-slate-400 group-hover:text-slate-600">
                  {isExpanded ? (
                    <ChevronDown className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5" />
                  )}
                </span>
              )}
            </div>
          )}

          {/* Accessible Tooltip on Collapsed Mode */}
          {isCollapsed && (
            <div
              role="tooltip"
              className="absolute left-full ml-3 px-2.5 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50 shadow-lg"
            >
              {item.label}
              {item.module_badge && (
                <span className="ml-1.5 text-[10px] text-sky-300 font-normal">
                  ({item.module_badge})
                </span>
              )}
            </div>
          )}
        </button>

        {/* Accordion Nested Child Items */}
        {hasChildren && !isCollapsed && isExpanded && item.children && (
          <div className="pl-6 pr-1 py-1 space-y-1 border-l-2 border-slate-200/80 ml-4 animate-fadeIn">
            {item.children.map((child: any) => renderMenuItem(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const sidebarContent = (
    <div className="h-full flex flex-col justify-between bg-white border-r border-slate-200 select-none">
      {/* Brand Header */}
      <div className="p-4 border-b border-slate-200/80 flex items-center justify-between">
        {!isCollapsed ? (
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-sky-600 text-white font-extrabold flex items-center justify-center text-sm shadow-xs">
              N
            </div>
            <div>
              <span className="font-extrabold text-sm tracking-tight text-slate-900">
                Nexora
              </span>
              <span className="block text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
                Enterprise
              </span>
            </div>
          </div>
        ) : (
          <div className="w-8 h-8 rounded-xl bg-sky-600 text-white font-extrabold flex items-center justify-center text-sm shadow-xs mx-auto">
            N
          </div>
        )}

        {/* Mobile close button */}
        <button
          onClick={onCloseMobile}
          className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
          aria-label="Close sidebar"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Navigation Menu List */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1.5 custom-scrollbar">
        {menuItems.map((item) => renderMenuItem(item))}
      </div>

      {/* Footer User Info & Collapse Toggle */}
      <div className="p-3 border-t border-slate-200/80 bg-slate-50/50 space-y-2">
        {!isCollapsed && user && (
          <div className="p-2 rounded-xl bg-white border border-slate-200/80 flex items-center gap-3 shadow-2xs">
            <div className="w-8 h-8 rounded-lg bg-sky-100 text-sky-700 font-bold flex items-center justify-center text-xs shrink-0">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <span className="block text-xs font-bold text-slate-900 truncate">
                {user.name}
              </span>
              <span className="block text-[10px] text-slate-500 capitalize">
                {user.role.replace('_', ' ')}
              </span>
            </div>
          </div>
        )}

        {/* Desktop Expand / Collapse Toggle Button */}
        <button
          onClick={onToggleCollapse}
          className={`hidden lg:flex w-full items-center justify-center gap-2 py-2 px-3 rounded-xl border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors text-xs font-semibold ${
            isCollapsed ? 'justify-center' : ''
          }`}
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <>
              <ChevronLeft className="w-4 h-4" />
              <span>Collapse Sidebar</span>
            </>
          )}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sticky Sidebar */}
      <aside
        className={`hidden lg:block shrink-0 transition-all duration-200 sticky top-0 h-screen z-30 ${
          isCollapsed ? 'w-18' : 'w-68'
        }`}
      >
        {sidebarContent}
      </aside>

      {/* Mobile Drawer Overlay */}
      {isMobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
            onClick={onCloseMobile}
            aria-hidden="true"
          />

          {/* Drawer Body */}
          <div className="relative w-72 max-w-[85vw] h-full shadow-2xl z-10 animate-slideRight">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
};
