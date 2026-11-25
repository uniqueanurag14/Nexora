import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  LayoutDashboard,
  Users,
  UserCheck,
  Building2,
  Layers,
  Boxes,
  Package,
  FolderOpen,
  Activity,
  AlertTriangle,
  Send,
  CheckCircle2,
  PackageCheck,
  BarChart3,
  TrendingUp,
  Receipt,
  ShieldCheck,
  History,
  Bell,
  Settings,
  SlidersHorizontal,
  Database,
  KeyRound,
  User,
  Lock,
  LogOut,
  ChevronDown,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  X,
  Stethoscope,
  Calendar,
  Contact2,
  FileText,
  AlertCircle,
  Clock,
  HeartPulse,
  Pill,
  FlaskConical,
} from 'lucide-react';

interface MenuItemNode {
  id: string;
  parentId: string | null;
  label: string;
  route: string;
  icon: string;
  badge?: string | null;
  displayOrder: number;
  requiredPermission?: string | null;
  moduleCode: string;
  isImplemented: boolean;
  isActive: boolean;
  children?: MenuItemNode[];
}

interface CrmSidebarProps {
  currentView: string;
  onNavigate: (view: string) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

// Icon mapping helper
const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard,
  Users,
  UserCheck,
  Building2,
  Layers,
  Boxes,
  Package,
  FolderOpen,
  Activity,
  AlertTriangle,
  Send,
  CheckCircle2,
  PackageCheck,
  BarChart3,
  TrendingUp,
  Receipt,
  ShieldCheck,
  History,
  Bell,
  Settings,
  SlidersHorizontal,
  Database,
  KeyRound,
  User,
  Lock,
  Calendar,
  Contact2,
  FileText,
  AlertCircle,
  Clock,
  HeartPulse,
  Pill,
  FlaskConical,
  Stethoscope,
};

function getIconComponent(name: string): React.ComponentType<{ className?: string }> {
  return ICON_MAP[name] || LayoutDashboard;
}

// Fallback hierarchical menu structure as defined in Section 8
const DEFAULT_MENU_HIERARCHY: MenuItemNode[] = [
  {
    id: 'menu-dashboard',
    parentId: null,
    label: 'Dashboard',
    route: '/erp/dashboard',
    icon: 'LayoutDashboard',
    displayOrder: 1,
    requiredPermission: 'dashboard.view',
    moduleCode: 'MODULE_4',
    isImplemented: true,
    isActive: true,
  },
  {
    id: 'menu-workforce',
    parentId: null,
    label: 'Workforce & Performance Monitoring',
    route: '/workforce',
    icon: 'Users',
    badge: 'Module 5',
    displayOrder: 2,
    requiredPermission: 'workforce.view',
    moduleCode: 'MODULE_5',
    isImplemented: false,
    isActive: true,
    children: [
      { id: 'menu-wf-employees', parentId: 'menu-workforce', label: 'Employee Management', route: '/workforce/employees', icon: 'UserCheck', displayOrder: 1, moduleCode: 'MODULE_5', isImplemented: false, isActive: true },
      { id: 'menu-wf-teams', parentId: 'menu-workforce', label: 'Team Management', route: '/workforce/teams', icon: 'Building2', displayOrder: 2, moduleCode: 'MODULE_5', isImplemented: false, isActive: true },
      { id: 'menu-wf-workstations', parentId: 'menu-workforce', label: 'Workstation Assignments', route: '/workforce/workstations', icon: 'Layers', displayOrder: 3, moduleCode: 'MODULE_5', isImplemented: false, isActive: true },
      { id: 'menu-wf-completion', parentId: 'menu-workforce', label: 'Work Completion', route: '/workforce/completion', icon: 'CheckCircle2', displayOrder: 4, moduleCode: 'MODULE_5', isImplemented: false, isActive: true },
      { id: 'menu-wf-reports', parentId: 'menu-workforce', label: 'Performance Reports', route: '/workforce/reports', icon: 'TrendingUp', displayOrder: 5, moduleCode: 'MODULE_5', isImplemented: false, isActive: true },
    ],
  },
  {
    id: 'menu-inventory',
    parentId: null,
    label: 'Inventory Management',
    route: '/inventory',
    icon: 'Boxes',
    badge: 'Module 6',
    displayOrder: 3,
    requiredPermission: 'inventory.view',
    moduleCode: 'MODULE_6',
    isImplemented: true,
    isActive: true,
    children: [
      { id: 'menu-inv-categories', parentId: 'menu-inventory', label: 'Categories', route: '/inventory/categories', icon: 'FolderOpen', displayOrder: 1, moduleCode: 'MODULE_6', isImplemented: true, isActive: true },
      { id: 'menu-inv-items', parentId: 'menu-inventory', label: 'Items', route: '/inventory/items', icon: 'Package', displayOrder: 2, moduleCode: 'MODULE_6', isImplemented: true, isActive: true },
      { id: 'menu-inv-stock-levels', parentId: 'menu-inventory', label: 'Stock Levels', route: '/inventory/stock-levels', icon: 'Layers', displayOrder: 3, moduleCode: 'MODULE_6', isImplemented: true, isActive: true },
      { id: 'menu-inv-movements', parentId: 'menu-inventory', label: 'Stock Movements', route: '/inventory/movements', icon: 'Activity', displayOrder: 4, moduleCode: 'MODULE_6', isImplemented: true, isActive: true },
      { id: 'menu-inv-low-stock', parentId: 'menu-inventory', label: 'Low-Stock Alerts', route: '/inventory/low-stock', icon: 'AlertTriangle', displayOrder: 5, moduleCode: 'MODULE_6', isImplemented: true, isActive: true },
    ],
  },
  {
    id: 'menu-suppliers',
    parentId: null,
    label: 'Supplier Management',
    route: '/suppliers',
    icon: 'Building2',
    badge: 'Module 7',
    displayOrder: 4,
    requiredPermission: 'suppliers.view',
    moduleCode: 'MODULE_7',
    isImplemented: false,
    isActive: true,
    children: [
      { id: 'menu-sup-list', parentId: 'menu-suppliers', label: 'Suppliers', route: '/suppliers/list', icon: 'Building2', displayOrder: 1, moduleCode: 'MODULE_7', isImplemented: false, isActive: true },
      { id: 'menu-sup-contacts', parentId: 'menu-suppliers', label: 'Supplier Contacts', route: '/suppliers/contacts', icon: 'Contact2', displayOrder: 2, moduleCode: 'MODULE_7', isImplemented: false, isActive: true },
      { id: 'menu-sup-history', parentId: 'menu-suppliers', label: 'Communication History', route: '/suppliers/history', icon: 'History', displayOrder: 3, moduleCode: 'MODULE_7', isImplemented: false, isActive: true },
    ],
  },
  {
    id: 'menu-purchasing',
    parentId: null,
    label: 'Purchase Requests & Supplier Approval',
    route: '/purchasing',
    icon: 'FileText',
    badge: 'Module 8',
    displayOrder: 5,
    requiredPermission: 'purchasing.view',
    moduleCode: 'MODULE_8',
    isImplemented: false,
    isActive: true,
    children: [
      { id: 'menu-pr-requests', parentId: 'menu-purchasing', label: 'Purchase Requests', route: '/purchasing/requests', icon: 'FileText', displayOrder: 1, moduleCode: 'MODULE_8', isImplemented: false, isActive: true },
      { id: 'menu-pr-responses', parentId: 'menu-purchasing', label: 'Supplier Responses', route: '/purchasing/responses', icon: 'Send', displayOrder: 2, moduleCode: 'MODULE_8', isImplemented: false, isActive: true },
      { id: 'menu-pr-approvals', parentId: 'menu-purchasing', label: 'Approval Status', route: '/purchasing/approvals', icon: 'CheckCircle2', displayOrder: 3, moduleCode: 'MODULE_8', isImplemented: false, isActive: true },
    ],
  },
  {
    id: 'menu-goods-receipt',
    parentId: null,
    label: 'Goods Receipt & Stock Updates',
    route: '/goods-receipt',
    icon: 'PackageCheck',
    badge: 'Module 9',
    displayOrder: 6,
    requiredPermission: 'goods_receipt.view',
    moduleCode: 'MODULE_9',
    isImplemented: false,
    isActive: true,
    children: [
      { id: 'menu-gr-receipts', parentId: 'menu-goods-receipt', label: 'Goods Receipts', route: '/goods-receipt/list', icon: 'PackageCheck', displayOrder: 1, moduleCode: 'MODULE_9', isImplemented: false, isActive: true },
      { id: 'menu-gr-quantities', parentId: 'menu-goods-receipt', label: 'Received Quantities', route: '/goods-receipt/quantities', icon: 'Boxes', displayOrder: 2, moduleCode: 'MODULE_9', isImplemented: false, isActive: true },
      { id: 'menu-gr-discrepancies', parentId: 'menu-goods-receipt', label: 'Discrepancies', route: '/goods-receipt/discrepancies', icon: 'AlertCircle', displayOrder: 3, moduleCode: 'MODULE_9', isImplemented: false, isActive: true },
      { id: 'menu-gr-adjustments', parentId: 'menu-goods-receipt', label: 'Stock Adjustments', route: '/goods-receipt/adjustments', icon: 'SlidersHorizontal', displayOrder: 4, moduleCode: 'MODULE_9', isImplemented: false, isActive: true },
    ],
  },
  {
    id: 'menu-reports',
    parentId: null,
    label: 'Reports & Analytics',
    route: '/reports',
    icon: 'BarChart3',
    badge: 'Module 10',
    displayOrder: 7,
    requiredPermission: 'reports.view',
    moduleCode: 'MODULE_10',
    isImplemented: false,
    isActive: true,
    children: [
      { id: 'menu-rep-workforce', parentId: 'menu-reports', label: 'Workforce Reports', route: '/reports/workforce', icon: 'Users', displayOrder: 1, moduleCode: 'MODULE_10', isImplemented: false, isActive: true },
      { id: 'menu-rep-inventory', parentId: 'menu-reports', label: 'Inventory Reports', route: '/reports/inventory', icon: 'Boxes', displayOrder: 2, moduleCode: 'MODULE_10', isImplemented: false, isActive: true },
      { id: 'menu-rep-purchasing', parentId: 'menu-reports', label: 'Purchasing Reports', route: '/reports/purchasing', icon: 'Receipt', displayOrder: 3, moduleCode: 'MODULE_10', isImplemented: false, isActive: true },
    ],
  },
  {
    id: 'menu-audit-module',
    parentId: null,
    label: 'Audit, Notifications & System Settings',
    route: '/audit-system',
    icon: 'ShieldCheck',
    badge: 'Module 11',
    displayOrder: 8,
    requiredPermission: 'audit.view',
    moduleCode: 'MODULE_11',
    isImplemented: false,
    isActive: true,
    children: [
      { id: 'menu-am-audit-logs', parentId: 'menu-audit-module', label: 'Audit Logs', route: '/admin/audit-logs', icon: 'History', displayOrder: 1, moduleCode: 'MODULE_11', isImplemented: true, isActive: true },
      { id: 'menu-am-email-logs', parentId: 'menu-audit-module', label: 'Email Delivery Logs', route: '/audit-system/email-logs', icon: 'Send', displayOrder: 2, moduleCode: 'MODULE_11', isImplemented: false, isActive: true },
      { id: 'menu-am-notifications', parentId: 'menu-audit-module', label: 'Notifications', route: '/audit-system/notifications', icon: 'Bell', displayOrder: 3, moduleCode: 'MODULE_11', isImplemented: false, isActive: true },
      { id: 'menu-am-app-settings', parentId: 'menu-audit-module', label: 'Application Settings', route: '/audit-system/settings', icon: 'Settings', displayOrder: 4, moduleCode: 'MODULE_11', isImplemented: false, isActive: true },
    ],
  },
  {
    id: 'menu-settings',
    parentId: null,
    label: 'Settings',
    route: '/settings',
    icon: 'Settings',
    displayOrder: 9,
    requiredPermission: 'settings.view',
    moduleCode: 'MODULE_4',
    isImplemented: true,
    isActive: true,
    children: [
      { id: 'menu-set-general', parentId: 'menu-settings', label: 'General Settings', route: '/settings/general', icon: 'SlidersHorizontal', displayOrder: 1, moduleCode: 'MODULE_4', isImplemented: true, isActive: true },
      { id: 'menu-set-notifications', parentId: 'menu-settings', label: 'Notifications', route: '/settings/notifications', icon: 'Bell', displayOrder: 2, moduleCode: 'MODULE_4', isImplemented: true, isActive: true },
      { id: 'menu-set-audit', parentId: 'menu-settings', label: 'Audit Trail', route: '/settings/audit', icon: 'History', displayOrder: 3, moduleCode: 'MODULE_4', isImplemented: true, isActive: true },
      { id: 'menu-set-backups', parentId: 'menu-settings', label: 'Database Backups', route: '/settings/backups', icon: 'Database', displayOrder: 4, moduleCode: 'MODULE_4', isImplemented: true, isActive: true },
      { id: 'menu-set-sessions', parentId: 'menu-settings', label: 'Active Sessions', route: '/settings/sessions', icon: 'KeyRound', displayOrder: 5, moduleCode: 'MODULE_4', isImplemented: true, isActive: true },
    ],
  },
  {
    id: 'menu-my-profile',
    parentId: null,
    label: 'My Profile',
    route: '/profile',
    icon: 'User',
    displayOrder: 10,
    requiredPermission: 'profile.view',
    moduleCode: 'MODULE_4',
    isImplemented: true,
    isActive: true,
  },
  {
    id: 'menu-change-password',
    parentId: null,
    label: 'Change Password',
    route: '/change-password',
    icon: 'Lock',
    displayOrder: 11,
    requiredPermission: 'password.change',
    moduleCode: 'MODULE_4',
    isImplemented: true,
    isActive: true,
  },
];

export const CrmSidebar: React.FC<CrmSidebarProps> = ({
  currentView,
  onNavigate,
  collapsed = false,
  onToggleCollapse,
  isMobileOpen = false,
  onCloseMobile,
}) => {
  const { currentUser, currentRole, isSuperAdmin, hasPermission, logout } = useAuth();
  const [menuItems, setMenuItems] = useState<MenuItemNode[]>(DEFAULT_MENU_HIERARCHY);
  const [expandedParents, setExpandedParents] = useState<Record<string, boolean>>({});
  const [hoveredTooltip, setHoveredTooltip] = useState<{ label: string; y: number } | null>(null);

  // Load database-driven menu tree
  useEffect(() => {
    let isMounted = true;
    const fetchMenu = async () => {
      try {
        const token = localStorage.getItem('mediera_auth_token') || localStorage.getItem('clinic_crm_auth_token');
        const res = await fetch('/api/v1/navigation/menu', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.ok) {
          const json = await res.json();
          if (json && json.success && Array.isArray(json.data) && json.data.length > 0) {
            if (isMounted) setMenuItems(json.data);
          }
        }
      } catch {
        // Keep default hierarchy
      }
    };
    fetchMenu();
    return () => { isMounted = false; };
  }, [currentUser]);

  // Determine which parent should be open based on active route
  useEffect(() => {
    for (const item of menuItems) {
      if (item.children && item.children.length > 0) {
        const hasActiveChild = item.children.some((c) => {
          return c.route === currentView || currentView.startsWith(c.route) || c.id === currentView;
        });
        if (hasActiveChild) {
          setExpandedParents((prev) => ({ ...prev, [item.id]: true }));
        }
      }
    }
  }, [currentView, menuItems]);

  const toggleAccordion = (parentId: string) => {
    setExpandedParents((prev) => ({
      ...prev,
      [parentId]: !prev[parentId],
    }));
  };

  const handleItemClick = (route: string) => {
    onNavigate(route);
    if (onCloseMobile) onCloseMobile();
  };

  // Filter items based on client-side permissions as secondary protection
  const visibleMenuItems = useMemo(() => {
    return menuItems.filter((item) => {
      if (isSuperAdmin) return true;
      if (!item.requiredPermission) return true;
      return hasPermission(item.requiredPermission);
    });
  }, [menuItems, isSuperAdmin, hasPermission]);

  const renderNavContent = () => (
    <div className="flex flex-col h-full select-none">
      {/* Brand & Organization Header */}
      <div className="h-16 px-4 flex items-center justify-between border-b border-slate-200/80 dark:border-slate-800 shrink-0">
        <div className="flex items-center gap-2.5 overflow-hidden">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-teal-600 to-emerald-500 text-white flex items-center justify-center font-black text-lg shadow-sm shrink-0">
            M
          </div>
          {!collapsed && (
            <div className="truncate">
              <span className="font-extrabold text-sm tracking-tight text-slate-900 dark:text-white block leading-none">
                MediEra
              </span>
              <span className="text-[10px] font-semibold text-teal-600 dark:text-teal-400 tracking-wider uppercase block mt-0.5">
                Hospital ERP & CRM
              </span>
            </div>
          )}
        </div>

        {/* Desktop Collapse Toggle */}
        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            className="hidden md:flex p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
          </button>
        )}

        {/* Mobile Close Button */}
        {onCloseMobile && (
          <button
            type="button"
            onClick={onCloseMobile}
            className="md:hidden p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
            aria-label="Close navigation"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Nav List with Accordion Groups */}
      <nav className="flex-1 overflow-y-auto px-2.5 py-4 space-y-1.5 scrollbar-thin">
        {visibleMenuItems.map((item) => {
          const Icon = getIconComponent(item.icon);
          const hasChildren = item.children && item.children.length > 0;
          const isExpanded = Boolean(expandedParents[item.id]);
          const isDirectActive = currentView === item.route || currentView === item.id;
          const isChildActive = Boolean(
            hasChildren &&
            item.children?.some(
              (c) => currentView === c.route || currentView.startsWith(c.route) || currentView === c.id
            )
          );
          const isActive = isDirectActive || isChildActive;

          if (hasChildren) {
            return (
              <div key={item.id} className="space-y-1">
                {/* Accordion Header */}
                <button
                  type="button"
                  onClick={() => toggleAccordion(item.id)}
                  onMouseEnter={(e) => {
                    if (collapsed) {
                      const rect = e.currentTarget.getBoundingClientRect();
                      setHoveredTooltip({ label: item.label, y: rect.top });
                    }
                  }}
                  onMouseLeave={() => setHoveredTooltip(null)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                    isActive
                      ? 'bg-teal-50 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300 font-bold'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                  }`}
                  aria-expanded={isExpanded}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-teal-600 dark:text-teal-400' : 'text-slate-400 dark:text-slate-500'}`} />
                    {!collapsed && (
                      <span className="truncate text-left">{item.label}</span>
                    )}
                  </div>

                  {!collapsed && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      {item.badge && (
                        <span className="px-1.5 py-0.5 text-[9px] font-bold rounded-md bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300">
                          {item.badge}
                        </span>
                      )}
                      {isExpanded ? (
                        <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                      )}
                    </div>
                  )}
                </button>

                {/* Submenu Accordion Body */}
                {!collapsed && isExpanded && (
                  <div className="pl-6 pr-1 space-y-1 py-0.5 border-l-2 border-teal-500/20 ml-4 animate-in slide-in-from-top-1 duration-150">
                    {item.children?.map((child) => {
                      const ChildIcon = getIconComponent(child.icon);
                      const isChildItemActive = currentView === child.route || currentView === child.id;

                      return (
                        <button
                          key={child.id}
                          type="button"
                          onClick={() => handleItemClick(child.route)}
                          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                            isChildItemActive
                              ? 'bg-teal-600 text-white font-bold shadow-xs'
                              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 truncate">
                            <ChildIcon className={`w-3.5 h-3.5 shrink-0 ${isChildItemActive ? 'text-white' : 'text-slate-400'}`} />
                            <span className="truncate">{child.label}</span>
                          </div>
                          {!child.isImplemented && (
                            <span className={`text-[9px] px-1.5 py-0.2 rounded-md ${isChildItemActive ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}>
                              Planned
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }

          // Single Leaf Menu Item
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleItemClick(item.route)}
              onMouseEnter={(e) => {
                if (collapsed) {
                  const rect = e.currentTarget.getBoundingClientRect();
                  setHoveredTooltip({ label: item.label, y: rect.top });
                }
              }}
              onMouseLeave={() => setHoveredTooltip(null)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                isDirectActive
                  ? 'bg-teal-600 text-white font-bold shadow-xs'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <Icon className={`w-4 h-4 shrink-0 ${isDirectActive ? 'text-white' : 'text-slate-400 dark:text-slate-500'}`} />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </div>

              {!collapsed && item.badge && (
                <span className={`px-1.5 py-0.5 text-[9px] font-bold rounded-md ${
                  isDirectActive ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                }`}>
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* User Session Profile & Logout Footer */}
      <div className="p-3 border-t border-slate-200/80 dark:border-slate-800 shrink-0">
        <div className={`flex items-center ${collapsed ? 'justify-center' : 'justify-between'} gap-2`}>
          <button
            type="button"
            onClick={() => handleItemClick('/profile')}
            className="flex items-center gap-2.5 min-w-0 text-left hover:opacity-80 transition-opacity cursor-pointer"
            title="My Profile"
          >
            <div className="w-8 h-8 rounded-full bg-teal-100 dark:bg-teal-950/80 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800 flex items-center justify-center text-xs font-bold shrink-0">
              {currentUser.firstName?.[0] || currentUser.name?.[0] || 'U'}
            </div>
            {!collapsed && (
              <div className="truncate min-w-0">
                <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                  {currentUser.firstName} {currentUser.lastName || ''}
                </p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                  {currentUser.roleName || currentRole}
                </p>
              </div>
            )}
          </button>

          {!collapsed && (
            <button
              type="button"
              onClick={() => {
                logout();
                onNavigate('/admin/login');
              }}
              className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Collapsed Mode Floating Tooltip */}
      {collapsed && hoveredTooltip && (
        <div
          style={{ top: hoveredTooltip.y + 4 }}
          className="fixed left-18 z-50 px-2.5 py-1 bg-slate-900 text-white text-xs font-semibold rounded-lg shadow-xl pointer-events-none whitespace-nowrap animate-in fade-in duration-100 border border-slate-700"
        >
          {hoveredTooltip.label}
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside
        className={`hidden md:flex flex-col bg-white dark:bg-slate-900 border-r border-slate-200/80 dark:border-slate-800 transition-all duration-200 ease-in-out shrink-0 ${
          collapsed ? 'w-16' : 'w-64'
        }`}
      >
        {renderNavContent()}
      </aside>

      {/* Mobile Drawer Overlay */}
      {isMobileOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="md:hidden fixed inset-0 z-50 flex"
        >
          <div
            onClick={onCloseMobile}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
            aria-hidden="true"
          />
          <aside className="relative flex flex-col w-72 max-w-[85vw] bg-white dark:bg-slate-900 shadow-2xl z-10">
            {renderNavContent()}
          </aside>
        </div>
      )}
    </>
  );
};
