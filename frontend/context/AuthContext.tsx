/**
 * Nexora Authentication Context
 * Manages authenticated session state, user identity, and notifications.
 */

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { api, getAuthToken, setAuthToken } from '../services/api';
import { AppNotification, User } from '../types';

export interface AppBranding {
  appName: string;
  companyName: string;
  tagline: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  branding: AppBranding;
  refreshBranding: () => Promise<void>;
  login: (email: string, password: string) => Promise<{ success: boolean; message: string }>;
  logout: () => Promise<void>;
  updateUser: (user: User) => void;
  refreshSession: () => Promise<void>;
  notifications: AppNotification[];
  notify: (type: AppNotification['type'], message: string) => void;
  dismissNotification: (id: string) => void;
  hasPermission: (permissionCode: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [branding, setBranding] = useState<AppBranding>({
    appName: 'Nexora',
    companyName: '',
    tagline: 'Enterprise Platform',
  });
  const hadAuthenticatedUserRef = useRef<boolean>(false);
  const bootstrapInFlightRef = useRef<Promise<void> | null>(null);

  const refreshBranding = async () => {
    try {
      const res = await api.getBranding();
      if (res.success && res.data) {
        setBranding({
          appName: res.data.app_name || 'Nexora',
          companyName: res.data.company_name || '',
          tagline: res.data.brand_tagline || 'Enterprise Platform',
        });
      }
    } catch {
      // Retain current branding state if request fails transiently
    }
  };

  const notify = (type: AppNotification['type'], message: string) => {
    const id = Math.random().toString(36).substring(2, 9);
    const newNote: AppNotification = { id, type, message, timestamp: Date.now() };
    setNotifications((prev) => [...prev, newNote]);

    // Auto dismiss after 6 seconds
    setTimeout(() => {
      dismissNotification(id);
    }, 6000);
  };

  const dismissNotification = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const refreshSession = async () => {
    if (bootstrapInFlightRef.current) {
      return bootstrapInFlightRef.current;
    }

    const run = (async () => {
      const existingToken = getAuthToken();
      if (!existingToken) {
        hadAuthenticatedUserRef.current = false;
        setUser(null);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        const res = await api.getCurrentSession({ skipAuthExpiredEvent: true });
        if (res.success && res.data?.authenticated && res.data.user) {
          hadAuthenticatedUserRef.current = true;
          setUser(res.data.user);
        } else {
          hadAuthenticatedUserRef.current = false;
          setUser(null);
          setAuthToken(null);
        }
      } catch {
        hadAuthenticatedUserRef.current = false;
        setUser(null);
        setAuthToken(null);
      } finally {
        setIsLoading(false);
      }
    })();

    bootstrapInFlightRef.current = run;
    try {
      await run;
    } finally {
      bootstrapInFlightRef.current = null;
    }
  };

  useEffect(() => {
    refreshSession();
    refreshBranding();

    const handleBrandingUpdated = () => {
      refreshBranding();
    };

    // Central listener for mid-session token expiry (never hard-reloads the SPA)
    const handleExpired = (e: any) => {
      const wasAuthenticated = hadAuthenticatedUserRef.current;
      hadAuthenticatedUserRef.current = false;
      setUser(null);
      setAuthToken(null);

      if (wasAuthenticated) {
        const msg = e?.detail?.message || 'Your session has expired. Please log in again.';
        notify('warning', msg);
      }

      if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
        try {
          const url = new URL(window.location.href);
          url.pathname = '/login';
          url.searchParams.set('route', '/login');
          window.history.replaceState(
            {},
            '',
            url.pathname + (url.searchParams.toString() ? `?${url.searchParams.toString()}` : '')
          );
        } catch {
          // React state (user = null) already renders LoginPage without reloading the page
        }
      }
    };

    window.addEventListener('auth:expired', handleExpired);
    window.addEventListener('branding:updated', handleBrandingUpdated);
    return () => {
      window.removeEventListener('auth:expired', handleExpired);
      window.removeEventListener('branding:updated', handleBrandingUpdated);
    };
  }, []);

  const login = async (email: string, password: string) => {
    const res = await api.login(email, password);
    if (res.success && res.data) {
      setAuthToken(res.data.access_token);
      hadAuthenticatedUserRef.current = true;
      setUser(res.data.user);
      notify('success', `Welcome back, ${res.data.user.name}!`);
      return { success: true, message: res.message };
    }
    return { success: false, message: res.message || 'Login failed.' };
  };

  const logout = async () => {
    try {
      await api.logout();
    } finally {
      hadAuthenticatedUserRef.current = false;
      setUser(null);
      setAuthToken(null);
      notify('info', 'You have been safely signed out.');
    }
  };

  const updateUser = (updatedUser: User) => {
    setUser(updatedUser);
  };

  const hasPermission = (permissionCode: string): boolean => {
    if (!user) return false;
    if (user.role === 'super_admin' || (user.roles && user.roles.includes('super_admin'))) return true;
    if (!user.permissions || !Array.isArray(user.permissions)) return false;
    return user.permissions.includes(permissionCode);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        branding,
        refreshBranding,
        login,
        logout,
        updateUser,
        refreshSession,
        notifications,
        notify,
        dismissNotification,
        hasPermission,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
