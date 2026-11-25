/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from '../frontend/context/AuthContext';
import { apiConfig } from '../frontend/config/apiConfig';
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
import { DepartmentsManagementPage } from '../frontend/pages/DepartmentsManagementPage';
import { SystemStatusPage } from '../frontend/pages/SystemStatusPage';
import { PlannedModulePage } from '../frontend/pages/PlannedModulePage';
import { SuppliersPage } from '../frontend/pages/SuppliersPage';
import { InventoryPage } from '../frontend/pages/InventoryPage';
import { SupplierPortalPage } from '../frontend/pages/SupplierPortalPage';
import { LivePerformancePage } from '../frontend/pages/LivePerformancePage';
import { PerformanceReportsPage } from '../frontend/pages/PerformanceReportsPage';
import { EmployeeRegistrationPage } from '../frontend/pages/EmployeeRegistrationPage';
import { WorkforceRosterFullScreenPage } from '../frontend/pages/WorkforceRosterFullScreenPage';
import { WarehouseManagementPage } from '../frontend/pages/WarehouseManagementPage';
import { SecurityCenterPage } from '../frontend/pages/SecurityCenterPage';
import { PurchasingPage } from '../frontend/pages/PurchasingPage';
import { GoodsReceivingPage } from '../frontend/pages/GoodsReceivingPage';
import { ProductManagementPage } from '../frontend/pages/ProductManagementPage';
import { ProductionManagementPage } from '../frontend/pages/ProductionManagementPage';
import { ProductReadinessPage } from '../frontend/pages/ProductReadinessPage';
import { ReportsAnalyticsPage } from '../frontend/pages/ReportsAnalyticsPage';
import { OperationPerformanceEnginePage } from '../frontend/pages/OperationPerformanceEnginePage';

const AppContent: React.FC = () => {
  const { isAuthenticated, isLoading, logout, branding } = useAuth();
  const [currentRoute, setCurrentRoute] = useState<string>('/dashboard');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState<boolean>(false);
  const [resetToken, setResetToken] = useState<string>('');
  const [supplierToken, setSupplierToken] = useState<string>('');

  // Handle URL parameters or initial route
  useEffect(() => {
    const pathname = window.location.pathname;
    const params = new URLSearchParams(window.location.search);
    const tokenParam = params.get('token');
    const supplierParam = params.get('supplier_token') || params.get('portal_token');
    const routeParam = params.get('route') || params.get('view');

    if (pathname.includes('/supplier-portal')) {
      const match = pathname.match(/\/supplier-portal\/([^\/\?]+)/);
      const token = (match && match[1]) || supplierParam || tokenParam || '';
      setSupplierToken(token);
      setCurrentRoute('/supplier-portal');
    } else if (supplierParam) {
      setSupplierToken(supplierParam);
      setCurrentRoute('/supplier-portal');
    } else if (pathname === '/reset-password' || (tokenParam && (!routeParam || routeParam === '/reset-password'))) {
      if (tokenParam) setResetToken(tokenParam);
      setCurrentRoute('/reset-password');
    } else if (pathname === '/forgot-password' || routeParam === 'forgot-password' || routeParam === '/forgot-password') {
      setCurrentRoute('/forgot-password');
    } else if (pathname === '/login' || routeParam === 'login' || routeParam === '/login') {
      setCurrentRoute('/login');
    } else if (routeParam) {
      setCurrentRoute(routeParam.startsWith('/') ? routeParam : `/${routeParam}`);
    } else if (pathname && pathname !== '/' && pathname !== '/index.html') {
      setCurrentRoute(pathname);
    }
  }, []);

  // Listen to browser Back/Forward navigation
  useEffect(() => {
    const handlePopState = () => {
      const pathname = window.location.pathname;
      const params = new URLSearchParams(window.location.search);
      const routeParam = params.get('route') || params.get('view');
      const target = routeParam || (pathname !== '/' && pathname !== '/index.html' ? pathname : '/dashboard');
      setCurrentRoute(target);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Sync route with URL query param and pushState without hard reload
  const navigate = (route: string) => {
    if (route === 'logout') {
      logout();
      return;
    }
    let target = route.startsWith('/') ? route : `/${route}`;
    if (target === '/settings' || target === '/settings/overview') {
      target = '/settings/general';
    }
    setCurrentRoute(target);
    try {
      const url = new URL(window.location.href);
      url.pathname = target;
      url.searchParams.set('route', target);
      window.history.pushState({}, '', url.pathname + (url.searchParams.toString() ? `?${url.searchParams.toString()}` : ''));
    } catch {
      try {
        window.history.pushState({}, '', target);
      } catch {
        // Sandboxed/opaque origin fallback: rely on React state routing without throwing
      }
    }
  };

  // Auth routing protection
  useEffect(() => {
    if (!isLoading) {
      const publicRoutes = ['/login', '/forgot-password', '/reset-password', '/status', '/supplier-portal'];
      const isPublic = publicRoutes.some(p => currentRoute.startsWith(p));
      if (!isAuthenticated && !isPublic) {
        setCurrentRoute('/login');
      } else if (isAuthenticated && (currentRoute === '/login' || currentRoute === '/' || currentRoute === '')) {
        navigate('/dashboard');
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
      if (currentRoute === '/forgot-password') return <ForgotPasswordPage onNavigate={navigate} />;
      if (currentRoute === '/reset-password') return <ResetPasswordPage onNavigate={navigate} initialToken={resetToken} />;
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
    if (currentRoute.startsWith('/security-center') || currentRoute === '/admin/security') {
      return <SecurityCenterPage onNavigate={navigate} />;
    }
    if (currentRoute.startsWith('/settings') || currentRoute === '/admin/settings') {
      return <SettingsPage currentRoute={currentRoute === '/admin/settings' ? '/settings/general' : currentRoute} onNavigate={navigate} />;
    }
    if (currentRoute === '/users' || currentRoute === '/administration/users' || currentRoute === '/admin/users') {
      return <UsersDirectoryPage onNavigate={navigate} />;
    }
    if (currentRoute === '/roles' || currentRoute === '/administration/roles' || currentRoute === '/admin/roles') {
      return <RolesManagementPage onNavigate={navigate} />;
    }
    if (currentRoute === '/permissions' || currentRoute === '/administration/permissions' || currentRoute === '/admin/permissions') {
      return <PermissionsCatalogPage onNavigate={navigate} />;
    }
    if (currentRoute === '/departments' || currentRoute === '/administration/departments' || currentRoute === '/admin/departments') {
      return <DepartmentsManagementPage />;
    }
    if (currentRoute === '/admin' || currentRoute === '/admin/') {
      return <UsersDirectoryPage onNavigate={navigate} />;
    }
    if (currentRoute === '/status' || currentRoute === '/admin/status') {
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
    if (currentRoute === '/workforce/performance/reports' || currentRoute.startsWith('/workforce/performance/reports') || currentRoute === '/workforce/reports') {
      return <PerformanceReportsPage onNavigate={navigate} />;
    }
    if (
      currentRoute === '/workforce/performance/live/fullscreen' ||
      currentRoute.startsWith('/workforce/performance/live/fullscreen') ||
      currentRoute === '/workforce/performance/fullscreen' ||
      currentRoute === '/workforce/fullscreen'
    ) {
      return <WorkforceRosterFullScreenPage onNavigate={navigate} />;
    }
    if (currentRoute.startsWith('/workforce/operations-engine')) {
      let tab: 'performance' | 'readiness' | 'forecasting' | 'rewards' = 'performance';
      if (currentRoute.startsWith('/workforce/operations-engine/readiness')) tab = 'readiness';
      else if (currentRoute.startsWith('/workforce/operations-engine/forecasting')) tab = 'forecasting';
      else if (currentRoute.startsWith('/workforce/operations-engine/rewards')) tab = 'rewards';
      return <OperationPerformanceEnginePage initialTab={tab} onNavigate={navigate} />;
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

    // Module 7: Supplier & Procurement Management (Fully Implemented)
    if (currentRoute.startsWith('/suppliers')) {
      let tab: 'directory' | 'purchase-requests' | 'approvals' | 'conversations' = 'directory';
      if (currentRoute === '/suppliers/purchase-requests' || currentRoute.startsWith('/suppliers/purchase-requests')) tab = 'purchase-requests';
      else if (currentRoute === '/suppliers/approvals' || currentRoute.startsWith('/suppliers/approvals')) tab = 'approvals';
      else if (currentRoute === '/suppliers/conversations' || currentRoute.startsWith('/suppliers/conversations')) tab = 'conversations';
      return <SuppliersPage initialTab={tab} onNavigate={navigate} />;
    }

    if (currentRoute.startsWith('/purchasing')) {
      return <PurchasingPage onNavigate={navigate} />;
    }

    if (currentRoute.startsWith('/goods-receipt')) {
      return <GoodsReceivingPage onNavigate={navigate} />;
    }

    if (currentRoute.startsWith('/products')) {
      return <ProductManagementPage />;
    }

    if (currentRoute.startsWith('/production/readiness')) {
      return <ProductReadinessPage onNavigate={navigate} />;
    }

    if (currentRoute.startsWith('/production')) {
      return <ProductionManagementPage onNavigate={navigate} />;
    }

    // Module 8: Warehouse Management (Fully Implemented)
    if (currentRoute.startsWith('/warehouses')) {
      let tab: 'dashboard' | 'directory' | 'stock' | 'transfers' | 'stock-verification' = 'dashboard';
      if (currentRoute === '/warehouses/directory' || currentRoute.startsWith('/warehouses/directory')) tab = 'directory';
      else if (currentRoute === '/warehouses/stock' || currentRoute.startsWith('/warehouses/stock')) tab = 'stock';
      else if (currentRoute === '/warehouses/transfers' || currentRoute.startsWith('/warehouses/transfers')) tab = 'transfers';
      else if (currentRoute === '/warehouses/stock-verification' || currentRoute.startsWith('/warehouses/stock-verification')) tab = 'stock-verification';
      return <WarehouseManagementPage initialTab={tab} onNavigate={navigate} />;
    }

    if (currentRoute.startsWith('/reports')) {
      return <ReportsAnalyticsPage onNavigate={navigate} />;
    }

    // Default Fallback
    return <DashboardPage onNavigate={navigate} />;
  };

  const isFullScreenRoute =
    currentRoute === '/workforce/performance/live/fullscreen' ||
    currentRoute.startsWith('/workforce/performance/live/fullscreen') ||
    currentRoute === '/workforce/performance/fullscreen' ||
    currentRoute === '/workforce/fullscreen';

  if (isFullScreenRoute) {
    return (
      <div className="h-screen w-screen bg-slate-900 overflow-hidden">
        <WorkforceRosterFullScreenPage onNavigate={navigate} />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900 font-sans antialiased relative">
      {/* WCAG 2.2 AA: Skip to main content link */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-[#0084CC] focus:text-white focus:rounded-lg focus:font-semibold focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-white"
      >
        Skip to main content
      </a>

      {/* Screen Reader Live Region Announcer */}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only" id="a11y-announcer" />

      {/* Sidebar Navigation (When Authenticated) */}
      {isAuthenticated && (
        <Sidebar
          currentRoute={currentRoute}
          onNavigate={navigate}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed(prev => !prev)}
          isMobileOpen={isMobileSidebarOpen}
          onCloseMobile={() => setIsMobileSidebarOpen(false)}
        />
      )}

      {/* Main Layout Area - responsive margin matching md breakpoint */}
      <div
        className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ease-in-out ${
          isAuthenticated
            ? isSidebarCollapsed
              ? 'md:ml-20'
              : 'md:ml-72'
            : ''
        }`}
      >
        <Header
          currentRoute={currentRoute}
          onNavigate={navigate}
          onOpenMobileSidebar={() => setIsMobileSidebarOpen(true)}
          onToggleSidebarCollapse={() => setIsSidebarCollapsed(prev => !prev)}
          isSidebarCollapsed={isSidebarCollapsed}
          isMobileSidebarOpen={isMobileSidebarOpen}
        />

        <main id="main-content" tabIndex={-1} className="flex-1 overflow-x-hidden focus:outline-none">
          {renderView()}
        </main>

        <footer className="border-t border-slate-200/80 bg-white py-4 px-6 text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-900">{branding.appName || apiConfig.appName}</span>
            {branding.companyName && (
              <>
                <span>•</span>
                <span className="font-semibold text-slate-700">{branding.companyName}</span>
              </>
            )}
            <span>•</span>
            <span>Performance & Workforce Monitoring</span>
          </div>
          <div>Granular RBAC Enforced • PostgreSQL Live Persistence</div>
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
