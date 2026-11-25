import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
import { DashboardPage } from './pages/DashboardPage';
import { InventoryPage } from './pages/InventoryPage';
import { InvoicesPage } from './pages/InvoicesPage';
import { SupplierManagementPage } from './pages/SupplierManagementPage';
import { SettingsPage } from './pages/SettingsPage';
import { LoginPage } from './pages/LoginPage';
import { SupplierPortalPage } from './pages/SupplierPortalPage';
import { User, InventoryItem } from './types';
import { api } from './services/api';

export const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('nexora_token'));
  const [currentTab, setCurrentTab] = useState<string>('dashboard');
  const [loading, setLoading] = useState<boolean>(true);
  const [lowStockCount, setLowStockCount] = useState<number>(0);

  // Check if current URL is the public supplier reorder portal: /supplier/reorder/:token
  const pathname = window.location.pathname;
  const supplierReorderMatch = pathname.match(/^\/supplier\/reorder\/([a-zA-Z0-9_-]+)/);
  const supplierToken = supplierReorderMatch ? supplierReorderMatch[1] : null;

  useEffect(() => {
    // If supplier token is present, no auth check needed
    if (supplierToken) {
      setLoading(false);
      return;
    }

    const checkAuth = async () => {
      const storedToken = localStorage.getItem('nexora_token');
      if (!storedToken) {
        setLoading(false);
        return;
      }
      try {
        const res = await api.getMe();
        setUser(res.user);
        setToken(storedToken);

        // Fetch low stock count for badge
        const items = await api.getInventoryItems();
        const low = items.filter((i) => i.is_low_stock).length;
        setLowStockCount(low);
      } catch (e) {
        console.error('Session expired or invalid:', e);
        localStorage.removeItem('nexora_token');
        setUser(null);
        setToken(null);
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, [supplierToken]);

  const handleLogout = () => {
    localStorage.removeItem('nexora_token');
    setUser(null);
    setToken(null);
  };

  const handleLoginSuccess = (loggedInUser: User, receivedToken: string) => {
    setUser(loggedInUser);
    setToken(receivedToken);
    api.getInventoryItems().then((items) => {
      const low = items.filter((i) => i.is_low_stock).length;
      setLowStockCount(low);
    }).catch(() => {});
  };

  // If public supplier portal route, render standalone portal
  if (supplierToken) {
    return <SupplierPortalPage token={supplierToken} />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!token || !user) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      <Navbar
        user={user}
        onLogout={handleLogout}
        lowStockCount={lowStockCount}
        onNavigateToLowStock={() => setCurrentTab('inventory')}
      />

      <div className="flex flex-1">
        <Sidebar
          currentTab={currentTab}
          onSelectTab={setCurrentTab}
          lowStockCount={lowStockCount}
        />

        <main className="flex-1 bg-slate-950/60 overflow-y-auto">
          {currentTab === 'dashboard' && <DashboardPage onNavigateTab={setCurrentTab} />}
          {currentTab === 'inventory' && <InventoryPage />}
          {currentTab === 'invoices' && <InvoicesPage />}
          {currentTab === 'suppliers' && <SupplierManagementPage />}
          {currentTab === 'settings' && <SettingsPage user={user} />}
        </main>
      </div>
    </div>
  );
};
export default App;
