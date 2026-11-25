import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { CategorySummary } from '../types';
import { SettingsLayout } from './settings/SettingsLayout';
import { CategoryConfigPage } from './settings/CategoryConfigPage';
import { AuditTrailPage } from './settings/AuditTrailPage';
import { ActiveSessionsPage } from './settings/ActiveSessionsPage';
import { DatabaseBackupsPage } from './settings/DatabaseBackupsPage';
import { ShieldAlert, ArrowRight } from 'lucide-react';

interface SettingsPageProps {
  currentRoute?: string;
  onNavigate?: (route: string) => void;
  user?: any;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({
  currentRoute = '/settings/general',
  onNavigate,
}) => {
  const { notify, user } = useAuth();
  const [categories, setCategories] = useState<CategorySummary[]>([]);
  const [isLoadingSummaries, setIsLoadingSummaries] = useState(true);

  // Fallback internal navigation if not provided by AppContent
  const handleNavigate = (targetRoute: string) => {
    if (onNavigate) {
      onNavigate(targetRoute);
    } else {
      window.history.pushState({}, '', targetRoute);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  };

  const loadCategorySummaries = async () => {
    try {
      const res = await api.getEffectiveSettings();
      if (res.success && res.data) {
        setCategories(res.data.summaries);
      }
    } catch (e) {
      console.error('Failed to load settings summaries:', e);
    } finally {
      setIsLoadingSummaries(false);
    }
  };

  useEffect(() => {
    loadCategorySummaries();
  }, [currentRoute]);

  const handleResetAllSettings = async () => {
    try {
      const res = await api.resetAllSettings();
      if (res.success) {
        notify('success', 'All system settings have been restored to original .env defaults.');
        await loadCategorySummaries();
      } else {
        notify('error', res.message || 'Failed to reset settings.');
      }
    } catch {
      notify('error', 'Network error while resetting settings.');
    }
  };

  // Determine current active category slug from currentRoute
  // Per Section 4 & 5: When clicking Settings parent or /settings, open General Settings by default.
  const normalizedRoute = currentRoute.replace(/\/+$/, '');
  let activeSlug = 'general';

  if (normalizedRoute === '/settings' || normalizedRoute === '/settings/overview' || normalizedRoute === '/settings/general') {
    activeSlug = 'general';
  } else if (normalizedRoute === '/settings/regional') {
    activeSlug = 'regional';
  } else if (normalizedRoute === '/settings/email-smtp' || normalizedRoute === '/settings/email') {
    activeSlug = 'email-smtp';
  } else if (normalizedRoute === '/settings/notifications') {
    activeSlug = 'notifications';
  } else if (normalizedRoute === '/settings/branding') {
    activeSlug = 'branding';
  } else if (normalizedRoute === '/settings/application-preferences' || normalizedRoute === '/settings/preferences') {
    activeSlug = 'application-preferences';
  } else if (normalizedRoute === '/settings/workforce') {
    activeSlug = 'workforce';
  } else if (normalizedRoute === '/settings/supplier') {
    activeSlug = 'supplier';
  } else if (normalizedRoute === '/settings/security') {
    activeSlug = 'security';
  } else if (normalizedRoute === '/settings/audit-trail' || normalizedRoute === '/settings/audit') {
    activeSlug = 'audit_trail';
  } else if (normalizedRoute === '/settings/active-sessions' || normalizedRoute === '/settings/sessions') {
    activeSlug = 'active_sessions';
  } else if (normalizedRoute === '/settings/database-backups' || normalizedRoute === '/settings/backups') {
    activeSlug = 'database_backups';
  } else if (normalizedRoute.startsWith('/settings/')) {
    activeSlug = normalizedRoute.replace('/settings/', '');
  }

  // Permission Verification
  const userPerms = user?.permissions || [];
  const isSuper = user?.role === 'super_admin' || userPerms.includes('*');

  const requiredPermMap: Record<string, string[]> = {
    general: ['settings.general.view', 'settings.view'],
    regional: ['settings.regional.view', 'settings.view'],
    'email-smtp': ['settings.email.view', 'settings.view'],
    notifications: ['settings.notifications.view', 'settings.view'],
    branding: ['settings.branding.view', 'settings.view'],
    'application-preferences': ['settings.preferences.view', 'settings.view'],
    workforce: ['settings.workforce.view', 'settings.view'],
    supplier: ['settings.supplier.view', 'settings.view'],
    security: ['settings.security.view', 'settings.view'],
    audit_trail: ['settings.audit.view', 'settings.view'],
    active_sessions: ['settings.sessions.view', 'settings.view'],
    database_backups: ['settings.backups.view', 'settings.backup', 'settings.view'],
  };

  const requiredPerms = requiredPermMap[activeSlug] || ['settings.view'];
  const hasAccess = isSuper || requiredPerms.some(p => userPerms.includes(p));

  const activeCategorySummary = categories.find(
    c => c.slug === activeSlug || c.id === activeSlug || c.route === normalizedRoute
  );

  return (
    <SettingsLayout
      currentCategorySlug={activeSlug}
      categorySummaries={categories}
      onSelectCategory={handleNavigate}
      onResetAll={isSuper || userPerms.includes('settings.reset.all') || userPerms.includes('settings.edit') ? handleResetAllSettings : undefined}
      showCategorySidebar={false}
    >
      {!hasAccess ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center max-w-lg mx-auto shadow-sm my-12">
          <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-4 border border-amber-200">
            <ShieldAlert className="w-7 h-7" />
          </div>
          <h2 className="text-base font-bold text-slate-900 mb-2">Access Restricted</h2>
          <p className="text-xs text-slate-600 leading-relaxed mb-6">
            Your user account does not have authorization to view this settings category ({activeSlug}).
            Please contact your system administrator to request access.
          </p>
          <button
            type="button"
            onClick={() => handleNavigate('/dashboard')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition-colors"
          >
            <span>Return to Dashboard</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <>
          {activeSlug === 'audit_trail' && (
            <AuditTrailPage />
          )}

          {activeSlug === 'active_sessions' && (
            <ActiveSessionsPage />
          )}

          {activeSlug === 'database_backups' && (
            <DatabaseBackupsPage />
          )}

          {![
            'audit_trail',
            'active_sessions',
            'database_backups',
          ].includes(activeSlug) && (
            <CategoryConfigPage
              key={activeSlug}
              categorySlug={activeSlug}
              categorySummary={activeCategorySummary}
              onReloadMenu={loadCategorySummaries}
            />
          )}
        </>
      )}
    </SettingsLayout>
  );
};

export default SettingsPage;
