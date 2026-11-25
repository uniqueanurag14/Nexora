/**
 * Nexora Authentication Context
 * Manages authenticated session state, user identity, and notifications.
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import { api, setAuthToken } from '../services/api';
import { AppNotification, User } from '../types';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
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
    setIsLoading(true);
    try {
      const res = await api.getCurrentSession();
      if (res.success && res.data?.authenticated && res.data.user) {
        setUser(res.data.user);
      } else {
        setUser(null);
        setAuthToken(null);
      }
    } catch {
      setUser(null);
      setAuthToken(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshSession();
  }, []);

  const login = async (email: string, password: string) => {
    const res = await api.login(email, password);
    if (res.success && res.data) {
      setAuthToken(res.data.access_token);
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
