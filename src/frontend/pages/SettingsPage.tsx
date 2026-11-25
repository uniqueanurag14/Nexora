import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { PageHeader } from '../components/PageHeader';
import { FormField } from '../components/FormField';
import { DataTable, Column } from '../components/DataTable';
import { ConfirmationDialog } from '../components/ConfirmationDialog';
import {
  AuditLogItem,
  DatabaseBackupItem,
  UserSessionItem,
} from '../types';
import {
  Settings as SettingsIcon,
  SlidersHorizontal,
  Bell,
  ShieldCheck,
  Database,
  Smartphone,
  CheckCircle2,
  Download,
  Trash2,
  RefreshCw,
  Plus,
} from 'lucide-react';

export const SettingsPage: React.FC = () => {
  const { user, notify } = useAuth();
  const [activeTab, setActiveTab] = useState<'general' | 'notifications' | 'audit' | 'backups' | 'sessions'>('general');

  // General Settings State
  const [appName, setAppName] = useState('Nexora');
  const [timezone, setTimezone] = useState('Asia/Kolkata');
  const [dateFormat, setDateFormat] = useState('YYYY-MM-DD');
  const [sessionTimeout, setSessionTimeout] = useState('15');
  const [isSavingGeneral, setIsSavingGeneral] = useState(false);

  // Audit Trail State
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [isLoadingAudit, setIsLoadingAudit] = useState(false);

  // Active Sessions State
  const [sessions, setSessions] = useState<UserSessionItem[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [sessionToRevoke, setSessionToRevoke] = useState<number | null>(null);

  // Database Backups State
  const [backups, setBackups] = useState<DatabaseBackupItem[]>([]);
  const [isLoadingBackups, setIsLoadingBackups] = useState(false);
  const [isCreatingBackup, setIsCreatingBackup] = useState(false);

  // Load General Settings
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await api.getGeneralSettings();
        if (res.success && res.data) {
          if (res.data.app_name) setAppName(res.data.app_name);
          if (res.data.timezone) setTimezone(res.data.timezone);
          if (res.data.date_format) setDateFormat(res.data.date_format);
          if (res.data.session_timeout_minutes) setSessionTimeout(res.data.session_timeout_minutes);
        }
      } catch (e) {
        console.error('Failed to load settings', e);
      }
    };
    fetchSettings();
  }, []);

  // Tab switching data loader
  useEffect(() => {
    if (activeTab === 'audit') {
      loadAudit();
    } else if (activeTab === 'sessions') {
      loadSessions();
    } else if (activeTab === 'backups') {
      loadBackups();
    }
  }, [activeTab]);

  const loadAudit = async () => {
    setIsLoadingAudit(true);
    try {
      const res = await api.getAuditTrail();
      if (res.success && res.data) setAuditLogs(res.data);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingAudit(false);
    }
  };

  const loadSessions = async () => {
    setIsLoadingSessions(true);
    try {
      const res = await api.getActiveSessions();
      if (res.success && res.data) setSessions(res.data);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingSessions(false);
    }
  };

  const loadBackups = async () => {
    setIsLoadingBackups(true);
    try {
      const res = await api.getBackups();
      if (res.success && res.data) setBackups(res.data);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingBackups(false);
    }
  };

  const handleSaveGeneral = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingGeneral(true);
    try {
      const res = await api.updateGeneralSettings({
        app_name: appName,
        timezone,
        date_format: dateFormat,
        session_timeout_minutes: sessionTimeout,
      });
      if (res.success) {
        notify('success', 'General system settings saved successfully.');
      } else {
        notify('error', res.message);
      }
    } catch {
      notify('error', 'Failed to save general settings.');
    } finally {
      setIsSavingGeneral(false);
    }
  };

  const handleRevokeSession = async () => {
    if (!sessionToRevoke) return;
    try {
      const res = await api.revokeSession(sessionToRevoke);
      if (res.success) {
        notify('success', 'Session token was successfully revoked.');
        loadSessions();
      } else {
        notify('error', res.message);
      }
    } catch {
      notify('error', 'Failed to revoke session.');
    } finally {
      setSessionToRevoke(null);
    }
  };

  const handleCreateBackup = async () => {
    setIsCreatingBackup(true);
    try {
      const res = await api.createBackup();
      if (res.success) {
        notify('success', res.message);
        loadBackups();
      } else {
        notify('error', res.message);
      }
    } catch {
      notify('error', 'Failed to create backup.');
    } finally {
      setIsCreatingBackup(false);
    }
  };

  // Table Columns for Audit Trail
  const auditColumns: Column<AuditLogItem>[] = [
    { key: 'id', header: 'ID', sortable: true },
    {
      key: 'action',
      header: 'Event Action',
      sortable: true,
      render: row => (
        <span className="font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-800 text-[11px]">
          {row.action}
        </span>
      ),
    },
    { key: 'module', header: 'Module', sortable: true },
    { key: 'user_email', header: 'Actor Email', sortable: true },
    { key: 'details', header: 'Details' },
    {
      key: 'timestamp',
      header: 'Timestamp',
      sortable: true,
      render: row => new Date(row.timestamp).toLocaleString(),
    },
  ];

  // Table Columns for Active Sessions
  const sessionColumns: Column<UserSessionItem>[] = [
    { key: 'id', header: 'Session ID' },
    { key: 'ip_address', header: 'IP Address' },
    {
      key: 'user_agent',
      header: 'Client Agent',
      render: row => <span className="truncate max-w-xs block">{row.user_agent}</span>,
    },
    {
      key: 'is_current',
      header: 'Current Session',
      render: row =>
        row.is_current ? (
          <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold text-[10px]">
            THIS DEVICE
          </span>
        ) : (
          <span className="text-slate-400 text-[10px]">OTHER</span>
        ),
    },
    {
      key: 'last_active_at',
      header: 'Last Active',
      render: row => new Date(row.last_active_at).toLocaleString(),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: row =>
        !row.is_revoked && !row.is_current ? (
          <button
            onClick={() => setSessionToRevoke(row.id)}
            className="text-xs font-semibold text-rose-600 hover:text-rose-800 hover:underline"
          >
            Revoke
          </button>
        ) : row.is_revoked ? (
          <span className="text-rose-400 text-[11px]">Revoked</span>
        ) : (
          <span className="text-slate-400 text-[11px]">—</span>
        ),
    },
  ];

  // Table Columns for Backups
  const backupColumns: Column<DatabaseBackupItem>[] = [
    { key: 'id', header: 'ID' },
    { key: 'filename', header: 'Archive Filename', sortable: true },
    {
      key: 'size_bytes',
      header: 'File Size',
      render: row => `${(row.size_bytes / 1024).toFixed(1)} KB`,
    },
    {
      key: 'created_at',
      header: 'Backup Date',
      render: row => new Date(row.created_at).toLocaleString(),
    },
    {
      key: 'status',
      header: 'Integrity',
      render: row => (
        <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold text-[10px]">
          {row.status}
        </span>
      ),
    },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <PageHeader
        title="Settings & Governance"
        description="Centralized administration, user preferences, security audit trail, and database maintenance."
        icon={<SettingsIcon className="w-5 h-5 text-sky-600" />}
      />

      {/* Settings Navigation Tabs */}
      <div className="flex border-b border-slate-200 overflow-x-auto gap-2">
        <button
          onClick={() => setActiveTab('general')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'general'
              ? 'border-sky-600 text-sky-600'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <SlidersHorizontal className="w-4 h-4" />
          General Settings
        </button>

        <button
          onClick={() => setActiveTab('notifications')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'notifications'
              ? 'border-sky-600 text-sky-600'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <Bell className="w-4 h-4" />
          Notifications
        </button>

        <button
          onClick={() => setActiveTab('audit')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'audit'
              ? 'border-sky-600 text-sky-600'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          Audit Trail
        </button>

        <button
          onClick={() => setActiveTab('sessions')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'sessions'
              ? 'border-sky-600 text-sky-600'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <Smartphone className="w-4 h-4" />
          Active Sessions
        </button>

        {user?.role === 'super_admin' && (
          <button
            onClick={() => setActiveTab('backups')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'backups'
                ? 'border-sky-600 text-sky-600'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <Database className="w-4 h-4" />
            Database Backups
          </button>
        )}
      </div>

      {/* Tab Panels */}
      {activeTab === 'general' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs">
          <form onSubmit={handleSaveGeneral} className="space-y-6 max-w-2xl">
            <h3 className="text-base font-bold text-slate-900">Application Configuration</h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <FormField id="app-name" label="Platform Display Name">
                <input
                  id="app-name"
                  type="text"
                  value={appName}
                  onChange={e => setAppName(e.target.value)}
                  className="block w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-slate-300 focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                />
              </FormField>

              <FormField id="timezone" label="Server Timezone">
                <select
                  id="timezone"
                  value={timezone}
                  onChange={e => setTimezone(e.target.value)}
                  className="block w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-slate-300 focus:border-sky-500 focus:ring-2 focus:ring-sky-100 bg-white"
                >
                  <option value="Asia/Kolkata">Asia/Kolkata (IST +05:30)</option>
                  <option value="UTC">UTC (Universal Time)</option>
                  <option value="America/New_York">America/New_York (EST/EDT)</option>
                  <option value="Europe/London">Europe/London (GMT/BST)</option>
                </select>
              </FormField>

              <FormField id="date-format" label="Date Format">
                <select
                  id="date-format"
                  value={dateFormat}
                  onChange={e => setDateFormat(e.target.value)}
                  className="block w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-slate-300 focus:border-sky-500 focus:ring-2 focus:ring-sky-100 bg-white"
                >
                  <option value="YYYY-MM-DD">YYYY-MM-DD (ISO 8601)</option>
                  <option value="DD/MM/YYYY">DD/MM/YYYY (British / Indian)</option>
                  <option value="MM/DD/YYYY">MM/DD/YYYY (US)</option>
                </select>
              </FormField>

              <FormField id="session-timeout" label="Session Inactivity Timeout (Minutes)">
                <input
                  id="session-timeout"
                  type="number"
                  min="5"
                  max="120"
                  value={sessionTimeout}
                  onChange={e => setSessionTimeout(e.target.value)}
                  className="block w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-slate-300 focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                />
              </FormField>
            </div>

            <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
              <span className="text-xs text-slate-400">
                Environment secrets and database credentials remain secured in .env
              </span>
              <button
                type="submit"
                disabled={isSavingGeneral}
                className="px-5 py-2 rounded-xl text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 transition-colors disabled:opacity-50"
              >
                {isSavingGeneral ? 'Saving Settings...' : 'Save Settings'}
              </button>
            </div>
          </form>
        </div>
      )}

      {activeTab === 'notifications' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-6">
          <h3 className="text-base font-bold text-slate-900">Notification Preferences</h3>
          <p className="text-xs text-slate-500">
            Control which automated notifications and system alerts are delivered to your account.
          </p>

          <div className="space-y-4 max-w-xl">
            <label className="flex items-start gap-3 p-3.5 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors">
              <input type="checkbox" defaultChecked className="mt-1 rounded text-sky-600 focus:ring-sky-500" />
              <div>
                <span className="text-xs font-semibold text-slate-800 block">Security Alert Notifications</span>
                <span className="text-[11px] text-slate-500 block">
                  Notify on password changes, new logins, or session invalidation events.
                </span>
              </div>
            </label>

            <label className="flex items-start gap-3 p-3.5 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors">
              <input type="checkbox" className="mt-1 rounded text-sky-600 focus:ring-sky-500" />
              <div>
                <span className="text-xs font-semibold text-slate-800 block">Administrative System Updates</span>
                <span className="text-[11px] text-slate-500 block">
                  Receive maintenance notifications and database backup summaries.
                </span>
              </div>
            </label>
          </div>
        </div>
      )}

      {activeTab === 'audit' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-900">Security Audit Trail</h3>
            <button
              onClick={loadAudit}
              disabled={isLoadingAudit}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingAudit ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          <DataTable
            columns={auditColumns}
            data={auditLogs}
            searchKey={item => `${item.action} ${item.user_email} ${item.module} ${item.details}`}
            searchPlaceholder="Filter audit events..."
            emptyTitle="No audit records"
            emptyDescription="No security events recorded in the audit trail yet."
          />
        </div>
      )}

      {activeTab === 'sessions' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900">Active Device Sessions</h3>
              <p className="text-xs text-slate-500">
                Manage your authenticated sessions. Revoking a session will immediately reject its token on the server.
              </p>
            </div>
            <button
              onClick={loadSessions}
              disabled={isLoadingSessions}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingSessions ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          <DataTable
            columns={sessionColumns}
            data={sessions}
            emptyTitle="No active sessions"
            emptyDescription="No session records found."
          />
        </div>
      )}

      {activeTab === 'backups' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900">Database Snapshots & Backups</h3>
              <p className="text-xs text-slate-500">
                Generate and audit persistent relational backups. Restricted to Super Admin.
              </p>
            </div>

            <button
              onClick={handleCreateBackup}
              disabled={isCreatingBackup}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-slate-900 text-white hover:bg-slate-800 transition-colors shadow-xs disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              {isCreatingBackup ? 'Generating...' : 'Create Snapshot'}
            </button>
          </div>

          <DataTable
            columns={backupColumns}
            data={backups}
            emptyTitle="No backups found"
            emptyDescription="No database backup archives exist."
          />
        </div>
      )}

      {/* Confirmation Dialog for Revoking Session */}
      <ConfirmationDialog
        isOpen={sessionToRevoke !== null}
        onClose={() => setSessionToRevoke(null)}
        onConfirm={handleRevokeSession}
        title="Revoke Session"
        message="Are you sure you want to invalidate this session token? The associated client device will be immediately disconnected."
        confirmLabel="Revoke Session"
        isDestructive
      />
    </div>
  );
};
