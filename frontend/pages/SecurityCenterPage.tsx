import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
  ShieldCheck,
  ShieldAlert,
  Laptop,
  Activity,
  Database,
  LogIn,
  AlertTriangle,
  RefreshCw,
  Search,
  Download,
  CheckCircle2,
  XCircle,
  Lock,
  Trash2,
  RotateCcw,
  KeyRound,
  Eye,
  X,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileCheck2,
  Ban,
} from 'lucide-react';

type SecurityTab =
  | 'overview'
  | 'logins'
  | 'devices'
  | 'sessions'
  | 'activity'
  | 'events'
  | 'backups';

interface SecurityCenterPageProps {
  initialTab?: SecurityTab;
  onNavigate?: (route: string) => void;
}

function formatIst(iso?: string | null): string {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function formatBytes(bytes?: number | null): string {
  const b = Number(bytes || 0);
  if (b <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(b) / Math.log(1024)));
  return `${(b / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
}

function severityColor(sev: string): string {
  switch (sev) {
    case 'CRITICAL':
      return 'text-red-700 font-semibold';
    case 'HIGH':
      return 'text-rose-700 font-semibold';
    case 'MEDIUM':
      return 'text-amber-700 font-semibold';
    case 'LOW':
      return 'text-sky-700 font-medium';
    default:
      return 'text-slate-600 font-medium';
  }
}

function statusTextColor(status: string): string {
  const s = (status || '').toUpperCase();
  if (['SUCCESS', 'ACTIVE', 'TRUSTED', 'COMPLETED', 'VERIFIED', 'PASSED'].includes(s)) {
    return 'text-emerald-700 font-semibold';
  }
  if (['FAILED', 'BLOCKED', 'BLOCKED_DEVICE', 'COMPROMISED', 'CRITICAL', 'DENIED'].includes(s)) {
    return 'text-rose-700 font-semibold';
  }
  if (['LOCKED', 'NEW', 'WARNING', 'IN_PROGRESS', 'RESTORED'].includes(s)) {
    return 'text-amber-700 font-semibold';
  }
  return 'text-slate-600 font-medium';
}

export const SecurityCenterPage: React.FC<SecurityCenterPageProps> = ({
  initialTab = 'overview',
}) => {
  const { notify, user, branding } = useAuth();
  const [activeTab, setActiveTab] = useState<SecurityTab>(initialTab);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Overview state
  const [overview, setOverview] = useState<any>(null);
  const [verifyingChain, setVerifyingChain] = useState(false);

  // MFA enrollment state
  const [mfaSetup, setMfaSetup] = useState<{ manual_secret: string; otpauth_uri: string } | null>(null);
  const [mfaCodeInput, setMfaCodeInput] = useState('');
  const [mfaRecoveryCodes, setMfaRecoveryCodes] = useState<string[] | null>(null);
  const [mfaBusy, setMfaBusy] = useState(false);

  // Shared table filters & pagination
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [moduleFilter, setModuleFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);

  // Tab datasets
  const [loginsData, setLoginsData] = useState<any>({ items: [], total: 0, page: 1, total_pages: 1 });
  const [devicesData, setDevicesData] = useState<any>({ items: [], total: 0, page: 1, total_pages: 1 });
  const [sessionsData, setSessionsData] = useState<any>({ items: [], total: 0, page: 1, total_pages: 1 });
  const [activityData, setActivityData] = useState<any>({ items: [], total: 0, page: 1, total_pages: 1 });
  const [eventsData, setEventsData] = useState<any>({ items: [], total: 0, page: 1, total_pages: 1 });
  const [backupsData, setBackupsData] = useState<any>({ items: [], total: 0, page: 1, total_pages: 1, capabilities: null });

  // Active backup job polling
  const [activeBackupJob, setActiveBackupJob] = useState<any>(null);
  const [backupBusy, setBackupBusy] = useState(false);

  // Modals
  const [inspectLog, setInspectLog] = useState<any>(null);
  const [confirmAction, setConfirmAction] = useState<{
    title: string;
    description: string;
    confirmLabel: string;
    danger?: boolean;
    onConfirm: () => Promise<void>;
  } | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  // Controlled Restore two-step modal
  const [restoreModal, setRestoreModal] = useState<{
    backupUid: string;
    fileName: string;
    step: 'preparing' | 'ready' | 'executing';
    confirmToken?: string;
    confirmPhrase?: string;
    typedPhrase: string;
    validation?: any;
    error?: string;
  } | null>(null);

  const loadActiveTab = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      if (activeTab === 'overview') {
        const res = await api.security.getOverview();
        if (res.success) setOverview(res.data);
        else setErrorMsg(res.message || 'Unable to load security overview.');
      } else if (activeTab === 'logins') {
        const res = await api.security.getLogins({
          search,
          status: statusFilter,
          date_from: dateFrom,
          date_to: dateTo,
          page,
          limit: 20,
        });
        if (res.success) setLoginsData(res.data);
        else setErrorMsg(res.message || 'Unable to load login history.');
      } else if (activeTab === 'devices') {
        const res = await api.security.getDevices({
          search,
          status: statusFilter,
          page,
          limit: 20,
        });
        if (res.success) setDevicesData(res.data);
        else setErrorMsg(res.message || 'Unable to load device registry.');
      } else if (activeTab === 'sessions') {
        const res = await api.security.getSessions({
          search,
          status: statusFilter,
          page,
          limit: 20,
        });
        if (res.success) setSessionsData(res.data);
        else setErrorMsg(res.message || 'Unable to load active sessions.');
      } else if (activeTab === 'activity') {
        const res = await api.security.getActivityLogs({
          search,
          module: moduleFilter,
          status: statusFilter,
          date_from: dateFrom,
          date_to: dateTo,
          page,
          limit: 25,
        });
        if (res.success) setActivityData(res.data);
        else setErrorMsg(res.message || 'Unable to load activity audit logs.');
      } else if (activeTab === 'events') {
        const res = await api.security.getSecurityEvents({
          search,
          severity: statusFilter,
          date_from: dateFrom,
          date_to: dateTo,
          page,
          limit: 20,
        });
        if (res.success) setEventsData(res.data);
        else setErrorMsg(res.message || 'Unable to load security events.');
      } else if (activeTab === 'backups') {
        const res = await api.security.getBackups({
          status: statusFilter,
          page,
          limit: 20,
        });
        if (res.success) setBackupsData(res.data);
        else setErrorMsg(res.message || 'Unable to load backup history.');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unexpected error communicating with Security Center API.');
    } finally {
      setLoading(false);
    }
  }, [activeTab, search, statusFilter, moduleFilter, dateFrom, dateTo, page]);

  useEffect(() => {
    loadActiveTab();
  }, [loadActiveTab]);

  // Poll active backup job progress
  useEffect(() => {
    if (!activeBackupJob || activeBackupJob.status === 'completed' || activeBackupJob.status === 'failed') {
      return;
    }
    const timer = setInterval(async () => {
      const res = await api.security.getBackupJob(activeBackupJob.job_id);
      if (res.success && res.data) {
        setActiveBackupJob(res.data);
        if (res.data.status === 'completed' || res.data.status === 'failed') {
          clearInterval(timer);
          setBackupBusy(false);
          if (res.data.status === 'completed') {
            notify('success', `Encrypted backup ${res.data.backup_uid} completed.`);
          } else {
            notify('error', res.data.error || 'Backup job failed.');
          }
          loadActiveTab();
        }
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [activeBackupJob, loadActiveTab, notify]);

  const switchTab = (tab: SecurityTab) => {
    setActiveTab(tab);
    setSearch('');
    setStatusFilter('all');
    setModuleFilter('all');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  };

  const handleVerifyAuditChain = async () => {
    setVerifyingChain(true);
    try {
      const res = await api.security.verifyAuditChain();
      if (res.success && res.data) {
        if (res.data.valid) {
          notify('success', res.data.reason);
        } else {
          notify('error', res.data.reason);
        }
        if (activeTab === 'overview') loadActiveTab();
      }
    } finally {
      setVerifyingChain(false);
    }
  };

  const handleTriggerManualBackup = async () => {
    setBackupBusy(true);
    try {
      const res = await api.security.triggerBackup(false);
      if (res.success && res.data?.job) {
        setActiveBackupJob(res.data.job);
        notify('info', 'Encrypted dual-storage backup started.');
      } else {
        setBackupBusy(false);
        notify('error', res.message || 'Could not start backup.');
      }
    } catch (err: any) {
      setBackupBusy(false);
      notify('error', err?.message || 'Backup request failed.');
    }
  };

  const handleVerifyBackup = async (uid: string) => {
    const res = await api.security.verifyBackup(uid);
    if (res.success) {
      notify('success', res.message || 'Backup integrity verified.');
    } else {
      notify('error', res.message || 'Backup integrity verification failed.');
    }
    loadActiveTab();
  };

  const handleStartRestoreFlow = async (uid: string, fileName: string) => {
    setRestoreModal({
      backupUid: uid,
      fileName,
      step: 'preparing',
      typedPhrase: '',
    });
    const res = await api.security.prepareRestore(uid);
    if (res.success && res.data?.ok) {
      setRestoreModal({
        backupUid: uid,
        fileName,
        step: 'ready',
        confirmToken: res.data.confirm_token,
        confirmPhrase: res.data.confirm_phrase,
        typedPhrase: '',
        validation: res.data.validation,
      });
    } else {
      setRestoreModal({
        backupUid: uid,
        fileName,
        step: 'ready',
        typedPhrase: '',
        error: res.message || 'Pre-restore verification failed. This backup cannot be restored safely.',
      });
    }
  };

  const handleExecuteRestore = async () => {
    if (!restoreModal?.confirmToken || !restoreModal.confirmPhrase) return;
    setRestoreModal(prev => (prev ? { ...prev, step: 'executing', error: undefined } : null));
    const res = await api.security.executeRestore(
      restoreModal.backupUid,
      restoreModal.confirmToken,
      restoreModal.typedPhrase
    );
    if (res.success) {
      notify('success', res.message || 'Controlled restoration completed.');
      setRestoreModal(null);
      loadActiveTab();
    } else {
      setRestoreModal(prev =>
        prev ? { ...prev, step: 'ready', error: res.message || 'Restoration failed.' } : null
      );
    }
  };

  const handleCleanupBackups = async () => {
    const res = await api.security.cleanupBackups();
    if (res.success) {
      notify('success', res.message || 'Retention cleanup complete.');
      loadActiveTab();
    } else {
      notify('error', res.message || 'Cleanup failed.');
    }
  };

  // Admin MFA actions
  const handleStartMfaSetup = async () => {
    setMfaBusy(true);
    try {
      const res = await api.security.setupMfa();
      if (res.success && res.data) {
        setMfaSetup(res.data);
        setMfaRecoveryCodes(null);
        setMfaCodeInput('');
      } else {
        notify('error', res.message || 'Could not initialize MFA setup.');
      }
    } finally {
      setMfaBusy(false);
    }
  };

  const handleConfirmMfaEnable = async () => {
    if (!mfaCodeInput.trim()) return;
    setMfaBusy(true);
    try {
      const res = await api.security.enableMfa(mfaCodeInput.trim());
      if (res.success) {
        setMfaRecoveryCodes(res.data?.recovery_codes || []);
        setMfaSetup(null);
        setMfaCodeInput('');
        notify('success', 'Two-factor authentication enabled.');
        loadActiveTab();
      } else {
        notify('error', res.message || 'Invalid authenticator code.');
      }
    } finally {
      setMfaBusy(false);
    }
  };

  const handleDisableMfa = async () => {
    if (!mfaCodeInput.trim()) {
      notify('error', 'Enter your current 6-digit authenticator code to disable MFA.');
      return;
    }
    setMfaBusy(true);
    try {
      const res = await api.security.disableMfa(mfaCodeInput.trim());
      if (res.success) {
        setMfaCodeInput('');
        notify('success', 'Two-factor authentication disabled.');
        loadActiveTab();
      } else {
        notify('error', res.message || 'Could not disable MFA.');
      }
    } finally {
      setMfaBusy(false);
    }
  };

  const tabs: Array<{ id: SecurityTab; label: string; icon: React.ElementType }> = [
    { id: 'overview', label: 'Overview', icon: ShieldCheck },
    { id: 'logins', label: 'Login History', icon: LogIn },
    { id: 'devices', label: 'Devices', icon: Laptop },
    { id: 'sessions', label: 'Active Sessions', icon: KeyRound },
    { id: 'activity', label: 'Activity Logs', icon: Activity },
    { id: 'events', label: 'Security Events', icon: ShieldAlert },
    { id: 'backups', label: 'Backups & Restore', icon: Database },
  ];

  // Access check
  const userPerms = user?.permissions || [];
  const isAdmin =
    user?.role === 'super_admin' ||
    userPerms.includes('*') ||
    userPerms.some(p =>
      ['settings.security.view', 'settings.audit.view', 'settings.sessions.view', 'settings.backups.view', 'settings.view'].includes(p)
    );

  if (!isAdmin) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-16 text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-rose-50 text-rose-600 mb-4">
          <Lock className="w-6 h-6" />
        </div>
        <h1 className="text-xl font-bold text-slate-900">Restricted Security Administration Area</h1>
        <p className="text-sm text-slate-600 mt-2">
          You need security administration permissions to access Nexora Security Center, audit logs, and encrypted database backups.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Nexora Security Center</h1>
          <p className="text-sm text-slate-600 mt-1">
            {branding.companyName ? `${branding.companyName} · ` : ''}Login & device telemetry, active session control, tamper-evident audit trail, and AES-256-GCM dual-storage backups (IST)
          </p>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handleVerifyAuditChain}
            disabled={verifyingChain}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
          >
            <FileCheck2 className="w-4 h-4 text-[#0084CC]" />
            {verifyingChain ? 'Verifying Chain...' : 'Verify Audit Chain'}
          </button>
          <button
            type="button"
            onClick={loadActiveTab}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#0084CC] rounded-lg hover:bg-[#0071B0] transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="border-b border-slate-200 overflow-x-auto">
        <nav className="flex items-center gap-1 -mb-px" aria-label="Security Center Sections">
          {tabs.map(t => {
            const Icon = t.icon;
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => switchTab(t.id)}
                className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'border-[#0084CC] text-[#0084CC]'
                    : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
                }`}
              >
                <Icon className="w-4 h-4" />
                {t.label}
              </button>
            );
          })}
        </nav>
      </div>

      {errorMsg && (
        <div className="p-4 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button type="button" onClick={loadActiveTab} className="text-xs font-semibold underline shrink-0">
            Retry
          </button>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 1: OVERVIEW                                                       */}
      {/* ===================================================================== */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {loading && !overview ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 9 }).map((_, idx) => (
                <div key={idx} className="h-24 rounded-lg bg-white border border-slate-200 animate-pulse p-5" />
              ))}
            </div>
          ) : overview ? (
            <>
              {/* 9 Primary KPI Tiles (3x3 clean tabular grid, zero pill clutter) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <MetricTile
                  label="Active Users"
                  value={overview.metrics.active_users_count}
                  meta={`${overview.metrics.active_sessions_count} active session(s)`}
                  onClick={() => switchTab('sessions')}
                />
                <MetricTile
                  label="Today's Logins"
                  value={overview.metrics.today_logins_count}
                  meta="Timezone: Asia/Kolkata"
                  onClick={() => switchTab('logins')}
                />
                <MetricTile
                  label="Today's Activities"
                  value={overview.metrics.today_activities_count}
                  meta={`${overview.metrics.total_audit_logs} total audit entries`}
                  onClick={() => switchTab('activity')}
                />
                <MetricTile
                  label="Failed Logins"
                  value={overview.metrics.failed_logins_today}
                  meta={`${overview.metrics.failed_logins_24h} in last 24h · Lockout at ${overview.security_policy.max_login_attempts} fails`}
                  accent={overview.metrics.failed_logins_today > 0 ? 'warn' : 'default'}
                  onClick={() => switchTab('logins')}
                />
                <MetricTile
                  label="New Devices (7d)"
                  value={overview.metrics.new_devices_count}
                  meta={`${overview.metrics.total_registered_devices} registered · ${overview.metrics.blocked_devices_count} blocked`}
                  onClick={() => switchTab('devices')}
                />
                <MetricTile
                  label="Suspicious Events"
                  value={overview.metrics.suspicious_events_unresolved}
                  meta={`${overview.metrics.high_critical_events_24h} High/Critical in 24h`}
                  accent={overview.metrics.suspicious_events_unresolved > 0 ? 'danger' : 'default'}
                  onClick={() => switchTab('events')}
                />
                <MetricTile
                  label="Latest Backup Status"
                  value={overview.metrics.latest_backup ? overview.metrics.latest_backup.status.toUpperCase() : 'NONE'}
                  meta={
                    overview.metrics.latest_backup
                      ? `${formatIst(overview.metrics.latest_backup.completed_at)} · AES-256-GCM`
                      : 'No backup executed yet'
                  }
                  accent={
                    overview.metrics.latest_backup?.status === 'failed'
                      ? 'danger'
                      : overview.metrics.latest_backup
                        ? 'ok'
                        : 'warn'
                  }
                  onClick={() => switchTab('backups')}
                />
                <MetricTile
                  label="Backup Failures (30d)"
                  value={overview.metrics.backup_failures_30d}
                  meta={`Schedule: ${overview.metrics.backup_schedule} IST`}
                  accent={overview.metrics.backup_failures_30d > 0 ? 'danger' : 'default'}
                  onClick={() => switchTab('backups')}
                />
                <MetricTile
                  label="Backup Storage Used"
                  value={formatBytes(overview.metrics.backup_storage_bytes)}
                  meta={`${overview.metrics.backup_count} archive(s) · ${overview.metrics.backup_retention_days}d retention`}
                  onClick={() => switchTab('backups')}
                />
              </div>

              {/* Audit Integrity + Dual-Storage Posture + Admin MFA */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Audit Chain & Policy Card */}
                <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-slate-900">Audit Chain & Storage Protection</h2>
                    <span className={overview.audit_integrity?.valid ? 'text-xs font-semibold text-emerald-700' : 'text-xs font-semibold text-rose-700'}>
                      {overview.audit_integrity?.valid ? 'Hash Chain Verified' : 'Integrity Warning'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    {overview.audit_integrity?.reason}
                  </p>
                  <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100 text-xs">
                    <div>
                      <div className="text-slate-500">PostgreSQL Dump Engine</div>
                      <div className="font-mono text-slate-900 mt-0.5">
                        {overview.backup_capabilities?.pg_dump_available
                          ? 'Native pg_dump (-Fc)'
                          : 'Pure-Node Logical Fallback'}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500">JSON Store Snapshot</div>
                      <div className="font-mono text-slate-900 mt-0.5">
                        {overview.backup_capabilities?.json_store_exists
                          ? `Active (${formatBytes(overview.backup_capabilities.json_store_size_bytes)})`
                          : 'Not found'}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500">Encryption Key Source</div>
                      <div className="font-mono text-slate-900 mt-0.5">
                        {overview.backup_capabilities?.encryption_key_configured
                          ? 'External .env (AES-256-GCM)'
                          : 'Dev Ephemeral (Set .env for Prod)'}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500">Latest Audit Hash</div>
                      <div className="font-mono text-slate-900 mt-0.5 truncate" title={overview.audit_integrity?.latest_hash}>
                        {String(overview.audit_integrity?.latest_hash || '').slice(0, 18)}…
                      </div>
                    </div>
                  </div>
                </div>

                {/* Optional Administrator TOTP MFA Card */}
                <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-slate-900">Administrator Two-Factor Authentication (TOTP)</h2>
                    <span className={overview.current_user_mfa_enabled ? 'text-xs font-semibold text-emerald-700' : 'text-xs font-medium text-slate-500'}>
                      {overview.current_user_mfa_enabled ? 'Enabled' : 'Optional · Not Enrolled'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Protect your administrator account with standard RFC 6238 6-digit TOTP codes (Google Authenticator, Microsoft Authenticator, or Authy) plus single-use recovery codes.
                  </p>

                  {!overview.current_user_mfa_enabled && !mfaSetup && (
                    <button
                      type="button"
                      onClick={handleStartMfaSetup}
                      disabled={mfaBusy}
                      className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-white bg-[#101B32] rounded-lg hover:bg-slate-800 transition-colors"
                    >
                      <KeyRound className="w-3.5 h-3.5" />
                      Enroll Authenticator App
                    </button>
                  )}

                  {mfaSetup && (
                    <div className="space-y-3 pt-2 border-t border-slate-100">
                      <div className="text-xs text-slate-700">
                        Enter this manual key into your authenticator app:
                      </div>
                      <div className="p-2.5 bg-slate-50 border border-slate-200 rounded font-mono text-xs text-slate-900 break-all select-all">
                        {mfaSetup.manual_secret}
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={mfaCodeInput}
                          onChange={e => setMfaCodeInput(e.target.value)}
                          placeholder="Enter 6-digit code"
                          maxLength={6}
                          className="w-40 px-3 py-1.5 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0084CC]"
                        />
                        <button
                          type="button"
                          onClick={handleConfirmMfaEnable}
                          disabled={mfaBusy}
                          className="px-3.5 py-1.5 text-xs font-semibold text-white bg-[#0084CC] rounded-lg hover:bg-[#0071B0]"
                        >
                          Verify & Enable
                        </button>
                        <button
                          type="button"
                          onClick={() => setMfaSetup(null)}
                          className="px-2.5 py-1.5 text-xs text-slate-600 hover:text-slate-900"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {mfaRecoveryCodes && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-2">
                      <div className="text-xs font-semibold text-amber-900">
                        Save Your Single-Use Recovery Codes Now (Shown Once)
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 font-mono text-xs text-amber-950">
                        {mfaRecoveryCodes.map(c => (
                          <span key={c} className="bg-white px-2 py-1 rounded border border-amber-200 text-center">
                            {c}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {overview.current_user_mfa_enabled && (
                    <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                      <input
                        type="text"
                        value={mfaCodeInput}
                        onChange={e => setMfaCodeInput(e.target.value)}
                        placeholder="6-digit code to disable"
                        maxLength={6}
                        className="w-44 px-3 py-1.5 text-xs font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0084CC]"
                      />
                      <button
                        type="button"
                        onClick={handleDisableMfa}
                        disabled={mfaBusy}
                        className="px-3 py-1.5 text-xs font-semibold text-rose-700 border border-rose-300 rounded-lg hover:bg-rose-50"
                      >
                        Disable MFA
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {Array.isArray(overview.config_warnings) && overview.config_warnings.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-1">
                  <div className="text-xs font-semibold text-amber-900">Environment Configuration Notices</div>
                  <ul className="list-disc pl-5 text-xs text-amber-800 space-y-0.5">
                    {overview.config_warnings.map((w: string, i: number) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : null}
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 2: LOGIN HISTORY                                                  */}
      {/* ===================================================================== */}
      {activeTab === 'logins' && (
        <div className="space-y-4">
          <FilterToolbar
            search={search}
            onSearchChange={v => { setSearch(v); setPage(1); }}
            searchPlaceholder="Search email, username, IP, browser, OS..."
            dateFrom={dateFrom}
            dateTo={dateTo}
            onDateFromChange={v => { setDateFrom(v); setPage(1); }}
            onDateToChange={v => { setDateTo(v); setPage(1); }}
            statusFilter={statusFilter}
            onStatusFilterChange={v => { setStatusFilter(v); setPage(1); }}
            statusOptions={[
              { value: 'all', label: 'All Statuses' },
              { value: 'SUCCESS', label: 'Success' },
              { value: 'FAILED', label: 'Failed' },
              { value: 'LOCKED', label: 'Locked Out' },
              { value: 'BLOCKED_DEVICE', label: 'Blocked Device' },
              { value: 'LOGGED_OUT', label: 'Logged Out' },
            ]}
          />

          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="py-3 px-4 font-semibold">Timestamp (IST)</th>
                    <th className="py-3 px-4 font-semibold">User</th>
                    <th className="py-3 px-4 font-semibold">Event · Status</th>
                    <th className="py-3 px-4 font-semibold">IP Address</th>
                    <th className="py-3 px-4 font-semibold">Device & Provenance</th>
                    <th className="py-3 px-4 font-semibold">Logout</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <TableSkeletonRows cols={6} />
                  ) : loginsData.items.length === 0 ? (
                    <TableEmptyRow cols={6} message="No login events match the current filter criteria." />
                  ) : (
                    loginsData.items.map((item: any) => (
                      <tr key={item.id} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4 font-mono tabular-nums text-slate-700 whitespace-nowrap">
                          {formatIst(item.login_at)}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium text-slate-900">{item.email || item.username || 'Unknown'}</div>
                          <div className="text-[11px] text-slate-500">{item.user_role || 'unauthenticated'}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div className={statusTextColor(item.login_status)}>
                            {item.event_type} · {item.login_status}
                          </div>
                          {item.failure_reason && (
                            <div className="text-[11px] text-slate-500 mt-0.5">{item.failure_reason}</div>
                          )}
                        </td>
                        <td className="py-3 px-4 font-mono tabular-nums text-slate-700">{item.ip_address}</td>
                        <td className="py-3 px-4">
                          <div className="text-slate-900">{item.device_name || 'Unknown client'}</div>
                          <div className="text-[11px] text-slate-500">
                            {item.device_type || 'Client'} ·{' '}
                            {item.client_source === 'verified_agent'
                              ? `Verified Agent (${item.verified_machine_name})`
                              : 'Browser Telemetry'}
                            {item.is_new_device ? ' · New Device' : ''}
                          </div>
                        </td>
                        <td className="py-3 px-4 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                          {formatIst(item.logout_at)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <PaginationBar
              page={loginsData.page}
              totalPages={loginsData.total_pages}
              total={loginsData.total}
              onPageChange={setPage}
            />
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 3: DEVICE MONITORING                                              */}
      {/* ===================================================================== */}
      {activeTab === 'devices' && (
        <div className="space-y-4">
          <FilterToolbar
            search={search}
            onSearchChange={v => { setSearch(v); setPage(1); }}
            searchPlaceholder="Search device name, user, IP, OS, browser..."
            statusFilter={statusFilter}
            onStatusFilterChange={v => { setStatusFilter(v); setPage(1); }}
            statusOptions={[
              { value: 'all', label: 'All Trust States' },
              { value: 'trusted', label: 'Trusted' },
              { value: 'new', label: 'New' },
              { value: 'blocked', label: 'Blocked' },
              { value: 'revoked', label: 'Revoked' },
            ]}
          />

          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="py-3 px-4 font-semibold">User</th>
                    <th className="py-3 px-4 font-semibold">Device · OS / Browser</th>
                    <th className="py-3 px-4 font-semibold">Source</th>
                    <th className="py-3 px-4 font-semibold">Last IP · Logins</th>
                    <th className="py-3 px-4 font-semibold">First / Last Seen (IST)</th>
                    <th className="py-3 px-4 font-semibold">Status</th>
                    <th className="py-3 px-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <TableSkeletonRows cols={7} />
                  ) : devicesData.items.length === 0 ? (
                    <TableEmptyRow cols={7} message="No client devices have been recorded yet." />
                  ) : (
                    devicesData.items.map((dev: any) => (
                      <tr key={dev.id} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4">
                          <div className="font-medium text-slate-900">{dev.user_email || `User #${dev.user_id}`}</div>
                          <div className="text-[11px] font-mono text-slate-500">{String(dev.device_id).slice(0, 18)}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium text-slate-900">{dev.device_name}</div>
                          <div className="text-[11px] text-slate-500">
                            {dev.device_type} · {dev.os_name || 'Unknown OS'} · {dev.browser_name || 'Unknown Browser'}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-slate-600">
                          {dev.client_source === 'verified_agent' ? 'Verified Agent' : 'Browser Telemetry'}
                        </td>
                        <td className="py-3 px-4 font-mono tabular-nums text-slate-700">
                          <div>{dev.last_ip_address || '—'}</div>
                          <div className="text-[11px] text-slate-500">{dev.login_count} sign-in(s)</div>
                        </td>
                        <td className="py-3 px-4 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                          <div>{formatIst(dev.first_login_at)}</div>
                          <div className="text-[11px] text-slate-500">{formatIst(dev.last_login_at)}</div>
                        </td>
                        <td className="py-3 px-4">
                          <span className={statusTextColor(dev.trust_status)}>{dev.trust_status.toUpperCase()}</span>
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          {dev.trust_status === 'blocked' || dev.trust_status === 'revoked' ? (
                            <button
                              type="button"
                              onClick={() =>
                                setConfirmAction({
                                  title: 'Restore Device Trust',
                                  description: `Allow ${dev.user_email || 'this user'} to sign in again from "${dev.device_name}"?`,
                                  confirmLabel: 'Trust Device',
                                  onConfirm: async () => {
                                    const res = await api.security.setDeviceStatus(dev.id, 'trusted', 'Restored by administrator');
                                    if (res.success) notify('success', 'Device trust restored.');
                                    else notify('error', res.message || 'Action failed.');
                                    loadActiveTab();
                                  },
                                })
                              }
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-emerald-700 border border-emerald-300 rounded hover:bg-emerald-50"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" /> Unblock
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                setConfirmAction({
                                  title: 'Block Suspicious Device',
                                  description: `Blocking "${dev.device_name}" will immediately revoke all active sessions on this device and prevent future sign-ins until unblocked.`,
                                  confirmLabel: 'Block & Revoke Sessions',
                                  danger: true,
                                  onConfirm: async () => {
                                    const res = await api.security.setDeviceStatus(dev.id, 'blocked', 'Blocked from Security Center');
                                    if (res.success) notify('success', 'Device blocked and bound sessions revoked.');
                                    else notify('error', res.message || 'Action failed.');
                                    loadActiveTab();
                                  },
                                })
                              }
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-rose-700 border border-rose-300 rounded hover:bg-rose-50"
                            >
                              <Ban className="w-3.5 h-3.5" /> Block
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <PaginationBar
              page={devicesData.page}
              totalPages={devicesData.total_pages}
              total={devicesData.total}
              onPageChange={setPage}
            />
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 4: ACTIVE SESSIONS                                                */}
      {/* ===================================================================== */}
      {activeTab === 'sessions' && (
        <div className="space-y-4">
          <FilterToolbar
            search={search}
            onSearchChange={v => { setSearch(v); setPage(1); }}
            searchPlaceholder="Search user, IP, device..."
            statusFilter={statusFilter}
            onStatusFilterChange={v => { setStatusFilter(v); setPage(1); }}
            statusOptions={[
              { value: 'all', label: 'All Sessions' },
              { value: 'active', label: 'Active' },
              { value: 'logged_out', label: 'Logged Out' },
              { value: 'revoked', label: 'Revoked' },
              { value: 'expired', label: 'Expired' },
            ]}
          />

          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="py-3 px-4 font-semibold">User</th>
                    <th className="py-3 px-4 font-semibold">Device · IP</th>
                    <th className="py-3 px-4 font-semibold">Last Activity (IST)</th>
                    <th className="py-3 px-4 font-semibold">Expires (IST)</th>
                    <th className="py-3 px-4 font-semibold">Status</th>
                    <th className="py-3 px-4 font-semibold text-right">Control</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <TableSkeletonRows cols={6} />
                  ) : sessionsData.items.length === 0 ? (
                    <TableEmptyRow cols={6} message="No sessions found matching your filter." />
                  ) : (
                    sessionsData.items.map((sess: any) => (
                      <tr key={sess.session_id} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4">
                          <div className="font-medium text-slate-900">{sess.user_email || sess.username}</div>
                          <div className="text-[11px] text-slate-500 font-mono">{sess.user_role} · {sess.session_id.slice(0, 14)}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="text-slate-900">{sess.device_name || 'Unknown'}</div>
                          <div className="text-[11px] font-mono text-slate-500">{sess.ip_address}</div>
                        </td>
                        <td className="py-3 px-4 font-mono tabular-nums text-slate-700 whitespace-nowrap">
                          {formatIst(sess.last_activity_at)}
                        </td>
                        <td className="py-3 px-4 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                          {formatIst(sess.expires_at)}
                        </td>
                        <td className="py-3 px-4">
                          <div className={statusTextColor(sess.status)}>{sess.status.toUpperCase()}</div>
                          {sess.revoke_reason && (
                            <div className="text-[11px] text-slate-500">{sess.revoke_reason}</div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap space-x-2">
                          {sess.status === 'active' && (
                            <>
                              <button
                                type="button"
                                onClick={() =>
                                  setConfirmAction({
                                    title: 'Revoke Active Session',
                                    description: `Immediately terminate session for ${sess.user_email} on "${sess.device_name}"?`,
                                    confirmLabel: 'Revoke Session',
                                    danger: true,
                                    onConfirm: async () => {
                                      const res = await api.security.revokeSession(sess.session_id, 'Revoked via Security Center');
                                      if (res.success) notify('success', 'Session revoked immediately.');
                                      else notify('error', res.message || 'Revocation failed.');
                                      loadActiveTab();
                                    },
                                  })
                                }
                                className="px-2.5 py-1 text-xs font-medium text-rose-700 border border-rose-300 rounded hover:bg-rose-50"
                              >
                                Revoke
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setConfirmAction({
                                    title: 'Terminate All User Sessions',
                                    description: `Force sign-out ALL active sessions across all devices for ${sess.user_email}?`,
                                    confirmLabel: 'Terminate All',
                                    danger: true,
                                    onConfirm: async () => {
                                      const res = await api.security.revokeAllUserSessions(sess.user_id, 'All sessions terminated by admin');
                                      if (res.success) notify('success', res.message || 'All sessions terminated.');
                                      else notify('error', res.message || 'Operation failed.');
                                      loadActiveTab();
                                    },
                                  })
                                }
                                className="px-2.5 py-1 text-xs font-medium text-slate-700 border border-slate-300 rounded hover:bg-slate-100"
                              >
                                Revoke All
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <PaginationBar
              page={sessionsData.page}
              totalPages={sessionsData.total_pages}
              total={sessionsData.total}
              onPageChange={setPage}
            />
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 5: USER ACTIVITY AUDIT LOGS                                       */}
      {/* ===================================================================== */}
      {activeTab === 'activity' && (
        <div className="space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div className="flex-1">
              <FilterToolbar
                search={search}
                onSearchChange={v => { setSearch(v); setPage(1); }}
                searchPlaceholder="Search user, action, endpoint, entity ID, IP..."
                dateFrom={dateFrom}
                dateTo={dateTo}
                onDateFromChange={v => { setDateFrom(v); setPage(1); }}
                onDateToChange={v => { setDateTo(v); setPage(1); }}
                statusFilter={statusFilter}
                onStatusFilterChange={v => { setStatusFilter(v); setPage(1); }}
                statusOptions={[
                  { value: 'all', label: 'All Outcomes' },
                  { value: 'SUCCESS', label: 'Success' },
                  { value: 'FAILED', label: 'Failed' },
                  { value: 'DENIED', label: 'Denied' },
                  { value: 'WARNING', label: 'Warning' },
                ]}
                extraSelect={{
                  value: moduleFilter,
                  onChange: v => { setModuleFilter(v); setPage(1); },
                  options: [
                    { value: 'all', label: 'All Modules' },
                    { value: 'Authentication', label: 'Authentication' },
                    { value: 'Authorization', label: 'Authorization' },
                    { value: 'Security Center', label: 'Security Center' },
                    { value: 'Database Backups', label: 'Database Backups' },
                    { value: 'User Management', label: 'User Management' },
                    { value: 'Inventory', label: 'Inventory' },
                    { value: 'Warehouse', label: 'Warehouse' },
                    { value: 'Suppliers', label: 'Suppliers' },
                    { value: 'Procurement', label: 'Procurement' },
                    { value: 'Performance', label: 'Performance' },
                    { value: 'Settings', label: 'Settings' },
                  ],
                }}
              />
            </div>
            <button
              type="button"
              onClick={() =>
                api.security
                  .downloadAuditExport({
                    search,
                    module: moduleFilter === 'all' ? undefined : moduleFilter,
                    status: statusFilter === 'all' ? undefined : statusFilter,
                    date_from: dateFrom || undefined,
                    date_to: dateTo || undefined,
                  })
                  .catch(e => notify('error', e.message))
              }
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap shrink-0 self-start lg:self-auto"
            >
              <Download className="w-4 h-4" /> Export XLSX
            </button>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="py-3 px-4 font-semibold">Timestamp (IST)</th>
                    <th className="py-3 px-4 font-semibold">Actor</th>
                    <th className="py-3 px-4 font-semibold">Module · Action</th>
                    <th className="py-3 px-4 font-semibold">Endpoint · IP</th>
                    <th className="py-3 px-4 font-semibold">Status</th>
                    <th className="py-3 px-4 font-semibold text-right">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <TableSkeletonRows cols={6} />
                  ) : activityData.items.length === 0 ? (
                    <TableEmptyRow cols={6} message="No audit log entries match the selected filters." />
                  ) : (
                    activityData.items.map((log: any) => (
                      <tr key={log.id} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4 font-mono tabular-nums text-slate-700 whitespace-nowrap">
                          {formatIst(log.created_at)}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium text-slate-900">{log.user_email || log.username || 'System'}</div>
                          <div className="text-[11px] text-slate-500">{log.user_role || 'system'}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium text-slate-900">
                            {log.module_name} · <span className="font-mono text-[11px]">{log.action_type}</span>
                          </div>
                          {log.description && (
                            <div className="text-[11px] text-slate-600 line-clamp-1 max-w-md">{log.description}</div>
                          )}
                        </td>
                        <td className="py-3 px-4 font-mono text-[11px] text-slate-600">
                          <div className="truncate max-w-xs">{log.http_method ? `${log.http_method} ` : ''}{log.api_endpoint || '—'}</div>
                          <div className="text-slate-500">{log.ip_address}</div>
                        </td>
                        <td className="py-3 px-4">
                          <span className={statusTextColor(log.status)}>{log.status}</span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => setInspectLog(log)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-[#0084CC] hover:bg-sky-50 rounded"
                          >
                            <Eye className="w-3.5 h-3.5" /> Inspect
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <PaginationBar
              page={activityData.page}
              totalPages={activityData.total_pages}
              total={activityData.total}
              onPageChange={setPage}
            />
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 6: SECURITY EVENTS                                                */}
      {/* ===================================================================== */}
      {activeTab === 'events' && (
        <div className="space-y-4">
          <FilterToolbar
            search={search}
            onSearchChange={v => { setSearch(v); setPage(1); }}
            searchPlaceholder="Search event code, title, IP, user..."
            dateFrom={dateFrom}
            dateTo={dateTo}
            onDateFromChange={v => { setDateFrom(v); setPage(1); }}
            onDateToChange={v => { setDateTo(v); setPage(1); }}
            statusFilter={statusFilter}
            onStatusFilterChange={v => { setStatusFilter(v); setPage(1); }}
            statusOptions={[
              { value: 'all', label: 'All Severities' },
              { value: 'CRITICAL', label: 'Critical' },
              { value: 'HIGH', label: 'High' },
              { value: 'MEDIUM', label: 'Medium' },
              { value: 'LOW', label: 'Low' },
              { value: 'INFO', label: 'Info' },
            ]}
          />

          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="py-3 px-4 font-semibold">Timestamp (IST)</th>
                    <th className="py-3 px-4 font-semibold">Severity</th>
                    <th className="py-3 px-4 font-semibold">Event & Description</th>
                    <th className="py-3 px-4 font-semibold">User · IP</th>
                    <th className="py-3 px-4 font-semibold">Alert · State</th>
                    <th className="py-3 px-4 font-semibold text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <TableSkeletonRows cols={6} />
                  ) : eventsData.items.length === 0 ? (
                    <TableEmptyRow cols={6} message="No security events recorded for this period." />
                  ) : (
                    eventsData.items.map((ev: any) => (
                      <tr key={ev.id} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4 font-mono tabular-nums text-slate-700 whitespace-nowrap">
                          {formatIst(ev.created_at)}
                        </td>
                        <td className="py-3 px-4">
                          <span className={severityColor(ev.severity)}>{ev.severity}</span>
                        </td>
                        <td className="py-3 px-4 max-w-md">
                          <div className="font-semibold text-slate-900">{ev.title}</div>
                          <div className="text-[11px] text-slate-600 mt-0.5">{ev.description}</div>
                        </td>
                        <td className="py-3 px-4 font-mono text-[11px] text-slate-700">
                          <div>{ev.user_email || ev.username || 'Anonymous'}</div>
                          <div className="text-slate-500">{ev.ip_address}</div>
                        </td>
                        <td className="py-3 px-4 text-slate-600">
                          <div>{ev.is_resolved ? 'Resolved' : 'Open'}</div>
                          <div className="text-[11px] text-slate-500">
                            {ev.alert_email_sent ? 'Email Alert Sent' : 'Logged'}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          {!ev.is_resolved && (
                            <button
                              type="button"
                              onClick={() =>
                                setConfirmAction({
                                  title: 'Resolve Security Event',
                                  description: `Mark "${ev.title}" as reviewed and resolved?`,
                                  confirmLabel: 'Mark Resolved',
                                  onConfirm: async () => {
                                    const res = await api.security.resolveSecurityEvent(ev.id, 'Investigated and cleared via Security Center');
                                    if (res.success) notify('success', 'Security event resolved.');
                                    else notify('error', res.message || 'Could not resolve event.');
                                    loadActiveTab();
                                  },
                                })
                              }
                              className="px-2.5 py-1 text-xs font-medium text-[#0084CC] border border-sky-300 rounded hover:bg-sky-50"
                            >
                              Resolve
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <PaginationBar
              page={eventsData.page}
              totalPages={eventsData.total_pages}
              total={eventsData.total}
              onPageChange={setPage}
            />
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 7: DATABASE BACKUP & CONTROLLED RESTORE MANAGER                   */}
      {/* ===================================================================== */}
      {activeTab === 'backups' && (
        <div className="space-y-5">
          {/* Backup Action & Schedule Strip */}
          <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="space-y-1">
              <h2 className="text-sm font-semibold text-slate-900">Dual-Storage Encrypted Backup Engine (PostgreSQL + JSON Store)</h2>
              <p className="text-xs text-slate-600">
                Schedule: <span className="font-mono text-slate-900">{backupsData.capabilities?.schedule || '0 2 * * *'}</span> (Asia/Kolkata) ·
                Retention: <span className="font-mono text-slate-900">{backupsData.capabilities?.retention_days || 30} days</span> ·
                Encryption: <span className="font-mono text-slate-900">AES-256-GCM + SHA-256</span> ·
                PG Engine: <span className="font-mono text-slate-900">{backupsData.capabilities?.pg_dump_available ? 'pg_dump' : 'node_pg_logical'}</span>
              </p>
            </div>
            <div className="flex items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={handleCleanupBackups}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap"
              >
                <Trash2 className="w-3.5 h-3.5" /> Enforce Retention
              </button>
              <button
                type="button"
                onClick={handleTriggerManualBackup}
                disabled={backupBusy || backupsData.backup_in_progress}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0084CC] rounded-lg hover:bg-[#0071B0] disabled:opacity-50 whitespace-nowrap"
              >
                <Database className="w-3.5 h-3.5" />
                {backupBusy || backupsData.backup_in_progress ? 'Backup Running...' : 'Run Encrypted Backup Now'}
              </button>
            </div>
          </div>

          {/* Live Job Progress Bar */}
          {activeBackupJob && activeBackupJob.status !== 'completed' && (
            <div className="bg-sky-50 border border-sky-200 rounded-lg p-4 space-y-2">
              <div className="flex items-center justify-between text-xs font-medium text-sky-900">
                <span className="flex items-center gap-2">
                  <Clock className="w-4 h-4 animate-spin" />
                  {activeBackupJob.stage}
                </span>
                <span className="font-mono tabular-nums">{activeBackupJob.progress_pct}%</span>
              </div>
              <div className="w-full h-1.5 bg-sky-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#0084CC] transition-all duration-300"
                  style={{ width: `${activeBackupJob.progress_pct}%` }}
                />
              </div>
            </div>
          )}

          {/* Backups History Table */}
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="py-3 px-4 font-semibold">Timestamp (IST)</th>
                    <th className="py-3 px-4 font-semibold">Archive · Checksum</th>
                    <th className="py-3 px-4 font-semibold">Storage Coverage</th>
                    <th className="py-3 px-4 font-semibold">Size · Duration</th>
                    <th className="py-3 px-4 font-semibold">Status</th>
                    <th className="py-3 px-4 font-semibold text-right">Operations</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <TableSkeletonRows cols={6} />
                  ) : backupsData.items.length === 0 ? (
                    <TableEmptyRow cols={6} message="No encrypted backups recorded yet. Click 'Run Encrypted Backup Now' to create your first dual-storage snapshot." />
                  ) : (
                    backupsData.items.map((b: any) => (
                      <tr key={b.backup_uid} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4 font-mono tabular-nums text-slate-700 whitespace-nowrap">
                          <div>{formatIst(b.completed_at || b.started_at)}</div>
                          <div className="text-[11px] text-slate-500">{b.trigger_type} · {b.initiated_by_email || 'system'}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-mono text-slate-900">{b.file_name}</div>
                          <div className="text-[11px] font-mono text-slate-500">
                            {b.encrypted ? 'AES-256-GCM' : 'Plain'} · SHA-256: {b.checksum_sha256 ? `${b.checksum_sha256.slice(0, 14)}…` : '—'}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-slate-700">
                          <div>PG: <span className="font-mono">{b.pg_status}</span>{b.pg_engine ? ` (${b.pg_engine})` : ''}</div>
                          <div>JSON Store: <span className="font-mono">{b.json_store_status}</span></div>
                        </td>
                        <td className="py-3 px-4 font-mono tabular-nums text-slate-700 whitespace-nowrap">
                          <div>{formatBytes(b.file_size_bytes)}</div>
                          <div className="text-[11px] text-slate-500">{b.duration_ms ? `${b.duration_ms} ms` : '—'}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div className={statusTextColor(b.status)}>{b.status.toUpperCase()}</div>
                          {b.verification_status && (
                            <div className="text-[11px] text-slate-500">Verify: {b.verification_status}</div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap space-x-1.5">
                          {b.status !== 'deleted' && b.status !== 'failed' && b.status !== 'in_progress' && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleVerifyBackup(b.backup_uid)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 border border-slate-300 rounded hover:bg-slate-100"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Verify
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  api.security.downloadBackup(b.backup_uid, b.file_name).catch(e => notify('error', e.message))
                                }
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 border border-slate-300 rounded hover:bg-slate-100"
                              >
                                <Download className="w-3.5 h-3.5" /> Download
                              </button>
                              <button
                                type="button"
                                onClick={() => handleStartRestoreFlow(b.backup_uid, b.file_name)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-amber-800 border border-amber-300 rounded hover:bg-amber-50"
                              >
                                <RotateCcw className="w-3.5 h-3.5" /> Restore
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <PaginationBar
              page={backupsData.page}
              totalPages={backupsData.total_pages}
              total={backupsData.total}
              onPageChange={setPage}
            />
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 1: INSPECT AUDIT LOG BEFORE/AFTER REDACTED DIFF                 */}
      {/* ===================================================================== */}
      {inspectLog && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 max-w-2xl w-full max-h-[85vh] flex flex-col shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Audit Entry #{inspectLog.id} · {inspectLog.module_name} / {inspectLog.action_type}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5 font-mono">
                  {formatIst(inspectLog.created_at)} IST · {inspectLog.ip_address}
                </p>
              </div>
              <button type="button" onClick={() => setInspectLog(null)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
                <div><span className="text-slate-500">User:</span> <span className="font-medium text-slate-900">{inspectLog.user_email || 'System'}</span></div>
                <div><span className="text-slate-500">Status:</span> <span className={statusTextColor(inspectLog.status)}>{inspectLog.status}</span></div>
                <div><span className="text-slate-500">Device:</span> <span className="text-slate-900">{inspectLog.device_name || '—'}</span></div>
                <div><span className="text-slate-500">Endpoint:</span> <span className="font-mono text-slate-900">{inspectLog.http_method} {inspectLog.api_endpoint || '—'}</span></div>
              </div>
              {inspectLog.description && (
                <div>
                  <div className="font-semibold text-slate-700 mb-1">Summary</div>
                  <p className="text-slate-800 bg-slate-50 p-3 rounded border border-slate-200">{inspectLog.description}</p>
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <div className="font-semibold text-slate-700 mb-1">Before Values (Redacted)</div>
                  <pre className="p-3 bg-slate-900 text-slate-100 rounded-lg overflow-x-auto text-[11px] font-mono max-h-56">
                    {inspectLog.before_values ? JSON.stringify(inspectLog.before_values, null, 2) : 'None'}
                  </pre>
                </div>
                <div>
                  <div className="font-semibold text-slate-700 mb-1">After Values (Redacted)</div>
                  <pre className="p-3 bg-slate-900 text-slate-100 rounded-lg overflow-x-auto text-[11px] font-mono max-h-56">
                    {inspectLog.after_values ? JSON.stringify(inspectLog.after_values, null, 2) : 'None'}
                  </pre>
                </div>
              </div>
              <div className="pt-2 border-t border-slate-200 font-mono text-[11px] text-slate-500 space-y-1 break-all">
                <div>Prev Hash: {inspectLog.prev_hash}</div>
                <div>Entry Hash: {inspectLog.entry_hash}</div>
                <div>HMAC Sig: {inspectLog.hmac_signature}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 2: GENERIC DESTRUCTIVE ACTION CONFIRMATION                      */}
      {/* ===================================================================== */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 max-w-md w-full p-5 space-y-4 shadow-xl">
            <h3 className="text-base font-bold text-slate-900">{confirmAction.title}</h3>
            <p className="text-sm text-slate-600">{confirmAction.description}</p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmAction(null)}
                disabled={confirmBusy}
                className="px-3.5 py-2 text-xs font-semibold text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={confirmBusy}
                onClick={async () => {
                  setConfirmBusy(true);
                  try {
                    await confirmAction.onConfirm();
                    setConfirmAction(null);
                  } finally {
                    setConfirmBusy(false);
                  }
                }}
                className={`px-3.5 py-2 text-xs font-semibold text-white rounded-lg ${
                  confirmAction.danger ? 'bg-rose-600 hover:bg-rose-700' : 'bg-[#0084CC] hover:bg-[#0071B0]'
                }`}
              >
                {confirmBusy ? 'Processing...' : confirmAction.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 3: CONTROLLED TWO-STEP BACKUP RESTORATION                       */}
      {/* ===================================================================== */}
      {restoreModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 max-w-lg w-full p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Controlled Production Restoration</h3>
              <button type="button" onClick={() => setRestoreModal(null)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            {restoreModal.step === 'preparing' ? (
              <div className="py-6 text-center text-sm text-slate-600">
                Verifying SHA-256 checksum, AES-256-GCM authentication tag, and archive integrity...
              </div>
            ) : (
              <div className="space-y-4 text-xs">
                {restoreModal.error && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 flex items-center gap-2">
                    <XCircle className="w-4 h-4 shrink-0" />
                    <span>{restoreModal.error}</span>
                  </div>
                )}

                {restoreModal.validation && (
                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5">
                    <div className="font-semibold text-emerald-700 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4" /> Pre-Restore Integrity Verification Passed
                    </div>
                    <div className="text-slate-700">Archive: <span className="font-mono">{restoreModal.fileName}</span></div>
                    <div className="text-slate-700">
                      Captured (IST): <span className="font-mono">{restoreModal.validation.created_at_ist || '—'}</span>
                    </div>
                    <div className="text-slate-700">
                      PostgreSQL Included: <span className="font-mono">{restoreModal.validation.pg_included ? `Yes (${restoreModal.validation.pg_engine})` : 'No'}</span> ·
                      JSON Store Included: <span className="font-mono">{restoreModal.validation.json_store_included ? 'Yes' : 'No'}</span>
                    </div>
                  </div>
                )}

                {restoreModal.confirmPhrase && (
                  <div className="space-y-2">
                    <p className="text-slate-700 leading-relaxed">
                      A fresh <strong>pre-restore safety backup</strong> of your current live data will be created automatically before restoring. To proceed, type the exact confirmation phrase below:
                    </p>
                    <div className="p-2 bg-amber-50 border border-amber-200 rounded font-mono text-amber-950 select-all">
                      {restoreModal.confirmPhrase}
                    </div>
                    <input
                      type="text"
                      value={restoreModal.typedPhrase}
                      onChange={e => setRestoreModal(prev => (prev ? { ...prev, typedPhrase: e.target.value } : null))}
                      placeholder="Type confirmation phrase exactly"
                      className="w-full px-3 py-2 font-mono text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setRestoreModal(null)}
                    disabled={restoreModal.step === 'executing'}
                    className="px-3.5 py-2 text-xs font-semibold text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  {restoreModal.confirmToken && (
                    <button
                      type="button"
                      disabled={
                        restoreModal.step === 'executing' ||
                        restoreModal.typedPhrase.trim() !== restoreModal.confirmPhrase
                      }
                      onClick={handleExecuteRestore}
                      className="px-4 py-2 text-xs font-semibold text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:opacity-40"
                    >
                      {restoreModal.step === 'executing' ? 'Restoring...' : 'Create Safety Backup & Restore'}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// SUB-COMPONENTS (Clean, unboxed, zero decorative noise)
// ============================================================================

const MetricTile: React.FC<{
  label: string;
  value: string | number;
  meta: string;
  accent?: 'default' | 'ok' | 'warn' | 'danger';
  onClick?: () => void;
}> = ({ label, value, meta, accent = 'default', onClick }) => {
  const valClass =
    accent === 'danger'
      ? 'text-rose-700'
      : accent === 'warn'
        ? 'text-amber-700'
        : accent === 'ok'
          ? 'text-emerald-700'
          : 'text-slate-900';

  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left bg-white border border-slate-200 rounded-lg p-5 hover:border-slate-300 transition-colors focus:outline-none focus:ring-2 focus:ring-[#0084CC]"
    >
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className={`text-2xl font-bold font-mono tabular-nums mt-1.5 ${valClass}`}>{value}</div>
      <div className="text-xs text-slate-500 mt-1.5 truncate">{meta}</div>
    </button>
  );
};

const FilterToolbar: React.FC<{
  search: string;
  onSearchChange: (v: string) => void;
  searchPlaceholder: string;
  statusFilter: string;
  onStatusFilterChange: (v: string) => void;
  statusOptions: Array<{ value: string; label: string }>;
  dateFrom?: string;
  dateTo?: string;
  onDateFromChange?: (v: string) => void;
  onDateToChange?: (v: string) => void;
  extraSelect?: {
    value: string;
    onChange: (v: string) => void;
    options: Array<{ value: string; label: string }>;
  };
}> = ({
  search,
  onSearchChange,
  searchPlaceholder,
  statusFilter,
  onStatusFilterChange,
  statusOptions,
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  extraSelect,
}) => (
  <div className="flex flex-wrap items-center gap-2.5">
    <div className="relative flex-1 min-w-[220px]">
      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
      <input
        type="text"
        value={search}
        onChange={e => onSearchChange(e.target.value)}
        placeholder={searchPlaceholder}
        className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0084CC]"
      />
    </div>
    <select
      value={statusFilter}
      onChange={e => onStatusFilterChange(e.target.value)}
      className="px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0084CC]"
    >
      {statusOptions.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
    {extraSelect && (
      <select
        value={extraSelect.value}
        onChange={e => extraSelect.onChange(e.target.value)}
        className="px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0084CC]"
      >
        {extraSelect.options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    )}
    {onDateFromChange && (
      <input
        type="date"
        value={dateFrom || ''}
        onChange={e => onDateFromChange(e.target.value)}
        aria-label="From date"
        className="px-2.5 py-2 text-xs bg-white border border-slate-300 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-[#0084CC]"
      />
    )}
    {onDateToChange && (
      <input
        type="date"
        value={dateTo || ''}
        onChange={e => onDateToChange(e.target.value)}
        aria-label="To date"
        className="px-2.5 py-2 text-xs bg-white border border-slate-300 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-[#0084CC]"
      />
    )}
  </div>
);

const TableSkeletonRows: React.FC<{ cols: number }> = ({ cols }) => (
  <>
    {Array.from({ length: 5 }).map((_, r) => (
      <tr key={r}>
        {Array.from({ length: cols }).map((__, c) => (
          <td key={c} className="py-3.5 px-4">
            <div className="h-3.5 bg-slate-100 rounded animate-pulse w-3/4" />
          </td>
        ))}
      </tr>
    ))}
  </>
);

const TableEmptyRow: React.FC<{ cols: number; message: string }> = ({ cols, message }) => (
  <tr>
    <td colSpan={cols} className="py-12 px-4 text-center text-sm text-slate-500">
      {message}
    </td>
  </tr>
);

const PaginationBar: React.FC<{
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (p: number) => void;
}> = ({ page, totalPages, total, onPageChange }) => (
  <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50/50 text-xs text-slate-600">
    <span className="font-mono tabular-nums">
      {total} record(s) · Page {page} of {Math.max(1, totalPages)}
    </span>
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-40"
      >
        <ChevronLeft className="w-3.5 h-3.5" /> Prev
      </button>
      <button
        type="button"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
        className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-40"
      >
        Next <ChevronRight className="w-3.5 h-3.5" />
      </button>
    </div>
  </div>
);
