/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from '../frontend/context/AuthContext';
import { Sidebar } from '../frontend/components/Sidebar';
import { Header } from '../frontend/components/Header';
import { NotificationBanner } from '../frontend/components/NotificationBanner';
import { LoginPage } from '../frontend/pages/LoginPage';
import { ForgotPasswordPage } from '../frontend/pages/ForgotPasswordPage';
import { ResetPasswordPage } from '../frontend/pages/ResetPasswordPage';
import { DashboardPage } from '../frontend/pages/DashboardPage';
import { ProfilePage } from '../frontend/pages/ProfilePage';
import { ChangePasswordPage } from '../frontend/pages/ChangePasswordPage';
import { SettingsPage } from '../frontend/pages/SettingsPage';
import { UsersDirectoryPage } from '../frontend/pages/UsersDirectoryPage';
import { RolesManagementPage } from '../frontend/pages/RolesManagementPage';
import { PermissionsCatalogPage } from '../frontend/pages/PermissionsCatalogPage';
import { SystemStatusPage } from '../frontend/pages/SystemStatusPage';
import { PlannedModulePage } from '../frontend/pages/PlannedModulePage';
import { SuppliersPage } from '../frontend/pages/SuppliersPage';
import { InventoryPage } from '../frontend/pages/InventoryPage';
import { SupplierPortalPage } from '../frontend/pages/SupplierPortalPage';
import { LivePerformancePage } from '../frontend/pages/LivePerformancePage';
import { PerformanceReportsPage } from '../frontend/pages/PerformanceReportsPage';
import { EmployeeRegistrationPage } from '../frontend/pages/EmployeeRegistrationPage';

const AppContent: React.FC = () => {
  const { isAuthenticated, isLoading, logout } = useAuth();
  const [currentRoute, setCurrentRoute] = useState<string>('/dashboard');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] =
    useState<boolean>(false);
  const [resetToken, setResetToken] = useState<string>('');
  const [supplierToken, setSupplierToken] = useState<string>('');

  // Handle URL parameters or initial route
  useEffect(() => {
    const pathname = window.location.pathname;
    const params = new URLSearchParams(window.location.search);
    const tokenParam = params.get('token');
    const supplierParam =
      params.get('supplier_token') || params.get('portal_token');
    const routeParam = params.get('route') || params.get('view');

    if (pathname.includes('/supplier-portal')) {
      const match = pathname.match(/\/supplier-portal\/([^\/\?]+)/);
      const token = (match && match[1]) || supplierParam || tokenParam || '';
      setSupplierToken(token);
      setCurrentRoute('/supplier-portal');
    } else if (supplierParam) {
      setSupplierToken(supplierParam);
      setCurrentRoute('/supplier-portal');
    } else if (
      tokenParam &&
      (!routeParam || routeParam === '/reset-password')
    ) {
      setResetToken(tokenParam);
      setCurrentRoute('/reset-password');
    } else if (tokenParam && routeParam === '/supplier-portal') {
      setSupplierToken(tokenParam);
      setCurrentRoute('/supplier-portal');
    } else if (routeParam) {
      setCurrentRoute(
        routeParam.startsWith('/') ? routeParam : `/${routeParam}`,
      );
    }
  }, []);

  // Sync route with URL query param without hard reload
  const navigate = (route: string) => {
    if (route === 'logout') {
      logout();
      return;
    }
    const target = route.startsWith('/') ? route : `/${route}`;
    setCurrentRoute(target);
    const url = new URL(window.location.href);
    url.searchParams.set('route', target);
    window.history.replaceState({}, '', url.toString());
  };

  // Auth routing protection
  useEffect(() => {
    if (!isLoading) {
      const publicRoutes = [
        '/login',
        '/forgot-password',
        '/reset-password',
        '/status',
        '/supplier-portal',
      ];
      const isPublic = publicRoutes.some((p) => currentRoute.startsWith(p));
      if (!isAuthenticated && !isPublic) {
        setCurrentRoute('/login');
      } else if (isAuthenticated && currentRoute === '/login') {
        setCurrentRoute('/dashboard');
      }
    }
  }, [isAuthenticated, isLoading, currentRoute]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-sky-600 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-semibold text-slate-500 tracking-wider uppercase">
            Loading Nexora Platform...
          </span>
        </div>
      </div>
    );
  }

  // Standalone Supplier Portal View (Public, Token-authenticated, Clean dedicated UI)
  if (currentRoute.startsWith('/supplier-portal')) {
    return (
      <SupplierPortalPage
        token={supplierToken}
        onNavigateHome={() => navigate('/login')}
      />
    );
  }

  // Render view based on active route
  const renderView = () => {
    if (!isAuthenticated) {
      if (currentRoute === '/forgot-password')
        return <ForgotPasswordPage onNavigate={navigate} />;
      if (currentRoute === '/reset-password')
        return (
          <ResetPasswordPage onNavigate={navigate} initialToken={resetToken} />
        );
      if (currentRoute === '/status') return <SystemStatusPage />;
      return <LoginPage onNavigate={navigate} />;
    }

    // Authenticated Views
    if (currentRoute === '/dashboard') {
      return <DashboardPage onNavigate={navigate} />;
    }
    if (currentRoute === '/profile') {
      return <ProfilePage onNavigate={navigate} />;
    }
    if (currentRoute === '/change-password') {
      return <ChangePasswordPage />;
    }
    if (currentRoute.startsWith('/settings')) {
      return <SettingsPage />;
    }
    if (currentRoute === '/users') {
      return <UsersDirectoryPage onNavigate={navigate} />;
    }
    if (currentRoute === '/roles') {
      return <RolesManagementPage onNavigate={navigate} />;
    }
    if (currentRoute === '/permissions') {
      return <PermissionsCatalogPage onNavigate={navigate} />;
    }
    if (currentRoute === '/status') {
      return <SystemStatusPage />;
    }

    // Workforce & Performance Monitoring (Module 5)
    if (
      currentRoute === '/workforce/performance/registration' ||
      currentRoute.startsWith('/workforce/performance/registration') ||
      currentRoute === '/workforce/performance/roster' ||
      currentRoute === '/workforce/performance/employees'
    ) {
      return <EmployeeRegistrationPage onNavigate={navigate} />;
    }
    if (
      currentRoute === '/workforce/performance/reports' ||
      currentRoute.startsWith('/workforce/performance/reports') ||
      currentRoute === '/workforce/reports'
    ) {
      return <PerformanceReportsPage onNavigate={navigate} />;
    }
    if (
      currentRoute === '/workforce/performance/live' ||
      currentRoute.startsWith('/workforce/performance/live') ||
      currentRoute === '/workforce/live' ||
      currentRoute === '/workforce/performance' ||
      currentRoute === '/workforce'
    ) {
      return <LivePerformancePage onNavigate={navigate} />;
    }

    // Module 6: Inventory Management (Fully Implemented)
    if (currentRoute.startsWith('/inventory')) {
      return <InventoryPage initialTab={currentRoute} onNavigate={navigate} />;
    }

    if (currentRoute.startsWith('/suppliers')) {
      return <SuppliersPage onNavigate={navigate} />;
    }

    if (currentRoute.startsWith('/purchasing')) {
      return (
        <PlannedModulePage
          moduleTitle="Purchase Requests & Supplier Approval"
          moduleCode="MODULE 8"
          description="Internal procurement requisition workflows, supplier price quote responses, and multi-tier approval governance."
          plannedFeatures={[
            'Requisition Authoring & Item Re-orders',
            'Supplier Response & Bid Comparison',
            'Multi-Tier Financial Approval Routing',
            'Procurement PO Generation',
          ]}
          onNavigate={navigate}
        />
      );
    }

    if (currentRoute.startsWith('/goods-receipt')) {
      return (
        <PlannedModulePage
          moduleTitle="Goods Receipt & Stock Updates"
          moduleCode="MODULE 9"
          description="Dock intake verification, quantity discrepancies, return-to-vendor processing, and inventory balance sync."
          plannedFeatures={[
            'Dock Delivery Intake Logging',
            'Physical Count vs PO Discrepancy Auditing',
            'Automated Stock Balance Top-Up',
            'Defective Item Quarantine & Return Slips',
          ]}
          onNavigate={navigate}
        />
      );
    }

    if (currentRoute.startsWith('/reports')) {
      return (
        <PlannedModulePage
          moduleTitle="Reports & Analytics"
          moduleCode="MODULE 10"
          description="Cross-module data analytics, workforce utilization dashboards, inventory turnover rates, and exportable financial summaries."
          plannedFeatures={[
            'Workforce Utilization Analytics',
            'Inventory Valuation & Aging Summaries',
            'Purchasing Spend Trends',
            'Automated Excel & PDF Data Export',
          ]}
          onNavigate={navigate}
        />
      );
    }

    // Default Fallback
    return <DashboardPage onNavigate={navigate} />;
  };

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900 font-sans antialiased">
      {/* Sidebar Navigation (When Authenticated) */}
      {isAuthenticated && (
        <Sidebar
          currentRoute={currentRoute}
          onNavigate={navigate}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
          isMobileOpen={isMobileSidebarOpen}
          onCloseMobile={() => setIsMobileSidebarOpen(false)}
        />
      )}

      {/* Main Layout Area */}
      <div
        className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ease-in-out ${
          isAuthenticated ? (isSidebarCollapsed ? 'lg:ml-20' : 'lg:ml-72') : ''
        }`}
      >
        <Header
          currentRoute={currentRoute}
          onNavigate={navigate}
          onOpenMobileSidebar={() => setIsMobileSidebarOpen(true)}
          onToggleSidebarCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
          isSidebarCollapsed={isSidebarCollapsed}
        />

        <main className="flex-1 overflow-x-hidden">{renderView()}</main>

        <footer className="border-t border-slate-200/80 bg-white py-4 px-6 text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-900">Nexora</span>
            <span>•</span>
            <span className="font-semibold text-slate-700">Toy BiZ ltd</span>
            <span>•</span>
            <span>Performance & Workforce Monitoring</span>
          </div>
          <div>Granular RBAC Enforced • Database Live Persistence</div>
        </footer>
      </div>

      <NotificationBanner />
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
