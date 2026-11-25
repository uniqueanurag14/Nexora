import React, { useState, useEffect, useCallback } from 'react';
import {
  Database,
  Plus,
  RefreshCw,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Lock,
  ShieldCheck,
  Calendar,
  Clock,
  Play,
  Edit3,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Search,
  History,
  FileText,
  X,
  HardDrive,
  Server,
  ShieldAlert,
} from 'lucide-react';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

interface DatabaseBackupsPageProps {
  onNavigateOverview?: () => void;
}

type BackupTab = 'schedulers' | 'restore' | 'history';
type Frequency = 'daily' | 'weekly' | 'monthly';

const WEEKDAYS = [
  { value: 0, short: 'Sun' },
  { value: 1, short: 'Mon' },
  { value: 2, short: 'Tue' },
  { value: 3, short: 'Wed' },
  { value: 4, short: 'Thu' },
  { value: 5, short: 'Fri' },
  { value: 6, short: 'Sat' },
];

const TIMEZONES = [
  'Asia/Kolkata',
  'UTC',
  'Asia/Dubai',
  'Asia/Singapore',
  'Europe/London',
  'America/New_York',
];

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatScheduleSummary(s: any): string {
  const timeStr = s.scheduled_time || '02:00';
  if (s.frequency === 'daily') return `Every day at ${timeStr}`;
  if (s.frequency === 'weekly') {
    const days = Array.isArray(s.selected_days)
      ? s.selected_days.map((d: number) => WEEKDAYS.find((w) => w.value === d)?.short || d).join(', ')
      : 'Weekly';
    return `${days} at ${timeStr}`;
  }
  return `Day ${s.monthly_day || 1} of month at ${timeStr}`;
}

export const DatabaseBackupsPage: React.FC<DatabaseBackupsPageProps> = () => {
  const { notify, user, hasPermission } = useAuth();
  const [activeTab, setActiveTab] = useState<BackupTab>('schedulers');

  const canManage = hasPermission('settings.backups.manage') || hasPermission('settings.backup') || user?.role === 'super_admin';
  const canRestoreIsolated = hasPermission('settings.backups.restore.isolated') || user?.role === 'super_admin';
  const canRestoreProduction = user?.role === 'super_admin' && hasPermission('settings.backups.restore.production');

  // Data state (100% from PostgreSQL, zero fake records)
  const [stats, setStats] = useState<any>(null);
  const [schedulers, setSchedulers] = useState<any[]>([]);
  const [availableBackups, setAvailableBackups] = useState<any[]>([]);
  const [executionHistory, setExecutionHistory] = useState<any[]>([]);
  const [auditHistory, setAuditHistory] = useState<any[]>([]);
  const [restoreHistory, setRestoreHistory] = useState<any[]>([]);
  const [maintenanceState, setMaintenanceState] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [schemaWarning, setSchemaWarning] = useState<string | null>(null);

  // Scheduler filters
  const [schedSearch, setSchedSearch] = useState('');
  const [freqFilter, setFreqFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [lastStatusFilter, setLastStatusFilter] = useState('all');

  // Backup search/filter (Restore tab)
  const [restoreSearch, setRestoreSearch] = useState('');
  const [restoreTypeFilter, setRestoreTypeFilter] = useState('all');

  // Create/Edit Scheduler Modal State (Form defaults only — never auto-created)
  const [showSchedModal, setShowSchedModal] = useState(false);
  const [editingSched, setEditingSched] = useState<any | null>(null);
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formFreq, setFormFreq] = useState<Frequency>('daily');
  const [formSelectedDays, setFormSelectedDays] = useState<number[]>([0]);
  const [formMonthlyDay, setFormMonthlyDay] = useState<number>(1);
  const [formTime, setFormTime] = useState('02:00');
  const [formTimezone, setFormTimezone] = useState('Asia/Kolkata');
  const [formDestination, setFormDestination] = useState('local_encrypted_vault');
  const [formRetention, setFormRetention] = useState<number>(30);
  const [formEnabled, setFormEnabled] = useState<boolean>(true);
  const [isSavingSched, setIsSavingSched] = useState(false);

  // Delete Scheduler Modal
  const [schedToDelete, setSchedToDelete] = useState<any | null>(null);
  const [isDeletingSched, setIsDeletingSched] = useState(false);

  // Manual Backup Modal
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualNotes, setManualNotes] = useState('');
  const [isRunningBackup, setIsRunningBackup] = useState(false);
  const [runningSchedId, setRunningSchedId] = useState<number | null>(null);

  // Restore Modal State
  const [restoreBackup, setRestoreBackup] = useState<any | null>(null);
  const [restorePreview, setRestorePreview] = useState<any | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [restoreMode, setRestoreMode] = useState<'isolated' | 'production'>('isolated');
  const [isolatedDbName, setIsolatedDbName] = useState('');
  const [prodPassword, setProdPassword] = useState('');
  const [prodConfirmPhrase, setProdConfirmPhrase] = useState('');
  const [isExecutingRestore, setIsExecutingRestore] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  const loadAllData = useCallback(async () => {
    setIsLoading(true);
    setSchemaWarning(null);
    try {
      const [statsRes, schedRes, availRes, histRes, auditRes, rstHistRes, statusRes] = await Promise.all([
        api.backupAdmin.getStats(),
        api.backupAdmin.listSchedulers({
          search: schedSearch || undefined,
          frequency: freqFilter,
          status: statusFilter,
          last_status: lastStatusFilter,
        }),
        api.backupAdmin.listAvailableBackups({
          search: restoreSearch || undefined,
          execution_type: restoreTypeFilter,
        }),
        api.backupAdmin.listExecutionHistory({ limit: 100 }),
        api.backupAdmin.listAuditHistory(100),
        api.backupAdmin.listRestoreHistory(100),
        api.backupAdmin.getRestoreStatus(),
      ]);

      if (!schedRes.success && schedRes.message?.includes('db:update')) {
        setSchemaWarning(schedRes.message);
      }

      setStats(statsRes.success ? statsRes.data : null);
      setSchedulers(schedRes.success && Array.isArray(schedRes.data) ? schedRes.data : []);
      setAvailableBackups(availRes.success && Array.isArray(availRes.data) ? availRes.data : []);
      setExecutionHistory(histRes.success && Array.isArray(histRes.data) ? histRes.data : []);
      setAuditHistory(auditRes.success && Array.isArray(auditRes.data) ? auditRes.data : []);
      setRestoreHistory(rstHistRes.success && Array.isArray(rstHistRes.data) ? rstHistRes.data : []);
      setMaintenanceState(statusRes.success ? statusRes.data?.maintenance_mode : null);
    } catch (err: any) {
      notify('error', err?.message || 'Failed to load PostgreSQL backup & restore data.');
    } finally {
      setIsLoading(false);
    }
  }, [schedSearch, freqFilter, statusFilter, lastStatusFilter, restoreSearch, restoreTypeFilter, notify]);

  useEffect(() => {
    const t = setTimeout(() => {
      loadAllData();
    }, 150);
    return () => clearTimeout(t);
  }, [loadAllData]);

  const openCreateScheduler = () => {
    setEditingSched(null);
    setFormName('');
    setFormDesc('');
    setFormFreq('daily');
    setFormSelectedDays([0]);
    setFormMonthlyDay(1);
    setFormTime('02:00');
    setFormTimezone('Asia/Kolkata');
    setFormDestination('local_encrypted_vault');
    setFormRetention(30);
    setFormEnabled(true);
    setShowSchedModal(true);
  };

  const openEditScheduler = (s: any) => {
    setEditingSched(s);
    setFormName(s.name || '');
    setFormDesc(s.description || '');
    setFormFreq(s.frequency || 'daily');
    setFormSelectedDays(Array.isArray(s.selected_days) && s.selected_days.length > 0 ? s.selected_days : [0]);
    setFormMonthlyDay(Number(s.monthly_day) || 1);
    setFormTime(s.scheduled_time || '02:00');
    setFormTimezone(s.timezone || 'Asia/Kolkata');
    setFormDestination(s.destination_ref || 'local_encrypted_vault');
    setFormRetention(Number(s.retention_days) || 30);
    setFormEnabled(Boolean(s.is_enabled));
    setShowSchedModal(true);
  };

  const toggleWeekday = (day: number) => {
    setFormSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b)
    );
  };

  const handleSaveScheduler = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingSched) return;
    setIsSavingSched(true);
    try {
      const payload = {
        name: formName.trim(),
        description: formDesc.trim(),
        frequency: formFreq,
        selected_days: formFreq === 'weekly' ? formSelectedDays : null,
        monthly_day: formFreq === 'monthly' ? formMonthlyDay : null,
        scheduled_time: formTime,
        timezone: formTimezone,
        backup_type: 'full',
        destination_ref: formDestination.trim() || 'local_encrypted_vault',
        retention_days: Number(formRetention),
        is_enabled: formEnabled,
      };
      const res = editingSched
        ? await api.backupAdmin.updateScheduler(editingSched.id, payload)
        : await api.backupAdmin.createScheduler(payload);

      if (res.success) {
        notify('success', res.message || 'Backup scheduler saved.');
        setShowSchedModal(false);
        loadAllData();
      } else {
        notify('error', res.message || 'Failed to save backup scheduler.');
      }
    } catch (err: any) {
      notify('error', err?.message || 'Error saving scheduler.');
    } finally {
      setIsSavingSched(false);
    }
  };

  const handleToggleScheduler = async (s: any) => {
    const res = await api.backupAdmin.toggleScheduler(s.id, !s.is_enabled);
    if (res.success) {
      notify('success', res.message || 'Scheduler status updated.');
      loadAllData();
    } else {
      notify('error', res.message || 'Failed to update scheduler status.');
    }
  };

  const handleConfirmDeleteScheduler = async () => {
    if (!schedToDelete) return;
    setIsDeletingSched(true);
    try {
      const res = await api.backupAdmin.deleteScheduler(schedToDelete.id);
      if (res.success) {
        notify('success', res.message || 'Scheduler deleted cleanly.');
        setSchedToDelete(null);
        loadAllData();
      } else {
        notify('error', res.message || 'Failed to delete scheduler.');
      }
    } finally {
      setIsDeletingSched(false);
    }
  };

  const handleRunSchedulerNow = async (s: any) => {
    setRunningSchedId(s.id);
    try {
      const res = await api.backupAdmin.runSchedulerNow(s.id);
      if (res.success) {
        notify('success', res.message || 'Backup completed and verified.');
        loadAllData();
      } else {
        notify('error', res.message || 'Backup execution failed.');
        loadAllData();
      }
    } finally {
      setRunningSchedId(null);
    }
  };

  const handleManualBackup = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsRunningBackup(true);
    try {
      const res = await api.backupAdmin.runManualBackup(manualNotes.trim() || undefined);
      if (res.success) {
        notify('success', res.message || 'PostgreSQL backup completed.');
        setShowManualModal(false);
        setManualNotes('');
        loadAllData();
      } else {
        notify('error', res.message || 'Manual PostgreSQL backup failed.');
        loadAllData();
      }
    } finally {
      setIsRunningBackup(false);
    }
  };

  const openRestoreModal = async (bkp: any) => {
    setRestoreBackup(bkp);
    setRestorePreview(null);
    setRestoreError(null);
    setRestoreMode('isolated');
    setProdPassword('');
    setProdConfirmPhrase('');
    setLoadingPreview(true);

    try {
      const res = await api.backupAdmin.getRestorePreview(bkp.backup_uid);
      if (res.success && res.data) {
        setRestorePreview(res.data);
        setIsolatedDbName(res.data.suggested_isolated_database || '');
      } else {
        setRestoreError(res.message || 'Failed to verify backup archive.');
      }
    } catch (err: any) {
      setRestoreError(err?.message || 'Error loading restore preview.');
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleExecuteRestore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restoreBackup || isExecutingRestore) return;
    setRestoreError(null);

    if (restoreMode === 'production') {
      if (prodConfirmPhrase !== 'RESTORE NEXORA PRODUCTION') {
        setRestoreError('You must type "RESTORE NEXORA PRODUCTION" exactly to proceed.');
        return;
      }
      if (!prodPassword.trim()) {
        setRestoreError('Super Admin password re-authentication is required.');
        return;
      }
    }

    setIsExecutingRestore(true);
    try {
      const res =
        restoreMode === 'isolated'
          ? await api.backupAdmin.restoreIsolated({
              backup_uid: restoreBackup.backup_uid,
              target_database_name: isolatedDbName.trim() || undefined,
            })
          : await api.backupAdmin.restoreProduction({
              backup_uid: restoreBackup.backup_uid,
              password: prodPassword,
              confirmation_phrase: prodConfirmPhrase,
            });

      if (res.success) {
        notify('success', res.message || 'Database restore completed successfully.');
        setRestoreBackup(null);
        setRestorePreview(null);
        setProdPassword('');
        setProdConfirmPhrase('');
        loadAllData();
      } else {
        setRestoreError(res.message || 'Database restore failed.');
        loadAllData();
      }
    } catch (err: any) {
      setRestoreError(err?.message || 'Network or server error during restore.');
    } finally {
      setIsExecutingRestore(false);
    }
  };

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-sky-50 text-[#0084CC] flex items-center justify-center shrink-0">
              <Database className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-bold text-[#0084CC] uppercase tracking-wider">
                  PostgreSQL Disaster Recovery
                </span>
                <span className="text-slate-300">•</span>
                <span className="text-xs text-slate-500 font-medium">
                  AES-256-GCM Streaming Backups &amp; Controlled Restore
                </span>
              </div>
              <h1 className="text-xl sm:text-2xl font-extrabold text-[#101B32]">
                Database Backups, Schedulers &amp; Restore Management
              </h1>
              <p className="text-xs text-slate-500 mt-1 max-w-2xl leading-relaxed">
                Configure independent PostgreSQL backup schedules, trigger verified encrypted dumps, and perform safe isolated or Super Admin production restores.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap shrink-0">
            {canManage && (
              <>
                <button
                  onClick={openCreateScheduler}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0084CC] text-white hover:bg-sky-700 text-xs font-bold transition-all shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Create Scheduler</span>
                </button>
                <button
                  onClick={() => setShowManualModal(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800 text-xs font-bold transition-all shadow-xs"
                >
                  <HardDrive className="w-3.5 h-3.5" />
                  <span>Run Backup Now</span>
                </button>
              </>
            )}
            <button
              onClick={loadAllData}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Maintenance Mode / Schema Migration Notices */}
        {maintenanceState?.active && (
          <div className="mt-4 p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-xs text-amber-900 flex items-center gap-3">
            <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0" />
            <div>
              <div className="font-bold">Controlled Maintenance Mode Active</div>
              <div className="text-[11px]">
                {maintenanceState.reason} (Restore UID: <span className="font-mono">{maintenanceState.restore_uid}</span>)
              </div>
            </div>
          </div>
        )}

        {schemaWarning && (
          <div className="mt-4 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
            <div>
              <span className="font-bold">Migration Required:</span> {schemaWarning}
            </div>
          </div>
        )}

        {/* Real PostgreSQL KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-5 pt-5 border-t border-slate-100">
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/70">
            <div className="text-[10px] font-bold text-slate-500 uppercase">Total Schedulers</div>
            <div className="text-xl font-black text-slate-900 mt-0.5">{stats?.total_schedulers ?? 0}</div>
          </div>
          <div className="p-3 rounded-xl bg-emerald-50/60 border border-emerald-200/70">
            <div className="text-[10px] font-bold text-emerald-700 uppercase">Enabled</div>
            <div className="text-xl font-black text-emerald-800 mt-0.5">{stats?.enabled_schedulers ?? 0}</div>
          </div>
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/70">
            <div className="text-[10px] font-bold text-slate-500 uppercase">Disabled</div>
            <div className="text-xl font-black text-slate-700 mt-0.5">{stats?.disabled_schedulers ?? 0}</div>
          </div>
          <div className="p-3 rounded-xl bg-sky-50/60 border border-sky-200/70">
            <div className="text-[10px] font-bold text-sky-700 uppercase">Verified Backups</div>
            <div className="text-xl font-black text-sky-900 mt-0.5">{stats?.total_verified_backups ?? 0}</div>
          </div>
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/70">
            <div className="text-[10px] font-bold text-slate-500 uppercase">Next Upcoming Run</div>
            <div className="text-xs font-bold text-slate-800 mt-1 truncate">
              {stats?.next_upcoming_backup ? new Date(stats.next_upcoming_backup).toLocaleString() : 'None scheduled'}
            </div>
          </div>
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/70">
            <div className="text-[10px] font-bold text-slate-500 uppercase">Last Execution</div>
            <div className="text-xs font-bold text-slate-800 mt-1 capitalize">
              {stats?.last_backup_status || 'Never run'}
            </div>
          </div>
        </div>
      </div>

      {/* Sub-navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveTab('schedulers')}
          className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'schedulers'
              ? 'bg-[#101B32] text-white shadow-xs'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <Calendar className="w-3.5 h-3.5" />
          <span>Backup Schedulers ({schedulers.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('restore')}
          className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'restore'
              ? 'bg-[#101B32] text-white shadow-xs'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Restore Database ({availableBackups.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'history'
              ? 'bg-[#101B32] text-white shadow-xs'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <History className="w-3.5 h-3.5" />
          <span>Execution History &amp; Audit Log</span>
        </button>
      </div>

      {/* ================================================= */}
      {/* TAB 1: BACKUP SCHEDULERS                          */}
      {/* ================================================= */}
      {activeTab === 'schedulers' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={schedSearch}
                onChange={(e) => setSchedSearch(e.target.value)}
                placeholder="Search schedulers by name, description, or destination..."
                className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:border-sky-500"
              />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={freqFilter}
                onChange={(e) => setFreqFilter(e.target.value)}
                className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
              >
                <option value="all">All Frequencies</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
              >
                <option value="all">All Status</option>
                <option value="enabled">Enabled</option>
                <option value="disabled">Disabled</option>
              </select>
              <select
                value={lastStatusFilter}
                onChange={(e) => setLastStatusFilter(e.target.value)}
                className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
              >
                <option value="all">All Last Results</option>
                <option value="completed">Completed</option>
                <option value="failed">Failed</option>
                <option value="never_run">Never Run</option>
              </select>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="py-3 px-4">Scheduler Name</th>
                    <th className="py-3 px-4">Frequency</th>
                    <th className="py-3 px-4">Schedule Details</th>
                    <th className="py-3 px-4">Timezone</th>
                    <th className="py-3 px-4">Retention</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Next Scheduled Run</th>
                    <th className="py-3 px-4">Last Run &amp; Result</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {isLoading ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-slate-400">
                        Loading backup schedulers...
                      </td>
                    </tr>
                  ) : schedulers.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-14 text-center text-slate-400">
                        <Calendar className="w-8 h-8 mx-auto mb-2 opacity-30" />
                        <p className="font-semibold text-slate-600">No backup schedulers configured</p>
                        <p className="text-[11px] text-slate-400 mt-1">
                          Click &ldquo;Create Scheduler&rdquo; to configure your first automated PostgreSQL backup schedule.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    schedulers.map((s) => (
                      <tr key={s.id} className="hover:bg-slate-50/60">
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900">{s.name}</div>
                          {s.description && (
                            <div className="text-[11px] text-slate-500 max-w-xs truncate">{s.description}</div>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200 text-[10px] font-bold uppercase">
                            {s.frequency}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-medium text-slate-700">{formatScheduleSummary(s)}</td>
                        <td className="py-3 px-4 font-mono text-[11px] text-slate-600">{s.timezone}</td>
                        <td className="py-3 px-4 font-semibold text-slate-700">{s.retention_days} days</td>
                        <td className="py-3 px-4">
                          {s.is_enabled ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              Enabled
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200">
                              Disabled
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                          {s.is_enabled && s.next_run_at ? new Date(s.next_run_at).toLocaleString() : '—'}
                        </td>
                        <td className="py-3 px-4">
                          <div className="text-[11px] text-slate-600">
                            {s.last_run_at ? new Date(s.last_run_at).toLocaleString() : 'Never run'}
                          </div>
                          <span
                            className={`inline-block mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                              s.last_status === 'completed'
                                ? 'bg-emerald-50 text-emerald-700'
                                : s.last_status === 'failed'
                                ? 'bg-rose-50 text-rose-700'
                                : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {s.last_status || 'never_run'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          {canManage ? (
                            <div className="inline-flex items-center gap-1">
                              <button
                                onClick={() => handleRunSchedulerNow(s)}
                                disabled={runningSchedId === s.id}
                                title="Run Backup Now"
                                className="p-1.5 rounded-lg border border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 disabled:opacity-50"
                              >
                                <Play className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => openEditScheduler(s)}
                                title="Edit Scheduler"
                                className="p-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleToggleScheduler(s)}
                                title={s.is_enabled ? 'Disable Scheduler' : 'Enable Scheduler'}
                                className="p-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100"
                              >
                                {s.is_enabled ? (
                                  <ToggleRight className="w-3.5 h-3.5 text-emerald-600" />
                                ) : (
                                  <ToggleLeft className="w-3.5 h-3.5 text-slate-400" />
                                )}
                              </button>
                              <button
                                onClick={() => setSchedToDelete(s)}
                                title="Delete Scheduler"
                                className="p-1.5 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <span className="text-[11px] text-slate-400">Read-only</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ================================================= */}
      {/* TAB 2: RESTORE DATABASE                           */}
      {/* ================================================= */}
      {activeTab === 'restore' && (
        <div className="space-y-6">
          {/* Available Backups Section */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Available Verified PostgreSQL Backups</h2>
                <p className="text-[11px] text-slate-500">
                  Select a backup archive to inspect integrity and restore into an isolated database (Option 1) or production (Option 2, Super Admin only).
                </p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={restoreSearch}
                  onChange={(e) => setRestoreSearch(e.target.value)}
                  placeholder="Search backup ID or filename..."
                  className="px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-sky-500"
                />
                <select
                  value={restoreTypeFilter}
                  onChange={(e) => setRestoreTypeFilter(e.target.value)}
                  className="px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl"
                >
                  <option value="all">All Types</option>
                  <option value="automatic">Automatic</option>
                  <option value="manual">Manual</option>
                  <option value="pre_restore">Pre-Restore Safety</option>
                  <option value="cli">CLI</option>
                </select>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      <th className="py-3 px-4">Backup ID &amp; Archive</th>
                      <th className="py-3 px-4">Source / Type</th>
                      <th className="py-3 px-4">Size</th>
                      <th className="py-3 px-4">Verification</th>
                      <th className="py-3 px-4">Availability</th>
                      <th className="py-3 px-4">Created At</th>
                      <th className="py-3 px-4 text-right">Restore</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {availableBackups.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-slate-400">
                          No completed PostgreSQL backups available yet. Run a backup first.
                        </td>
                      </tr>
                    ) : (
                      availableBackups.map((b) => (
                        <tr key={b.backup_uid} className="hover:bg-slate-50/60">
                          <td className="py-3 px-4">
                            <div className="font-mono font-bold text-slate-900">{b.backup_uid}</div>
                            <div className="font-mono text-[10px] text-slate-500">{b.file_name}</div>
                            <div className="font-mono text-[10px] text-slate-400">
                              SHA-256: {String(b.checksum_sha256 || '').slice(0, 18)}...
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-bold text-[10px] uppercase">
                              {b.execution_type}
                            </span>
                            {b.scheduler_name && (
                              <div className="text-[11px] text-slate-500 mt-0.5">{b.scheduler_name}</div>
                            )}
                            {b.is_protected_recovery && (
                              <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-bold">
                                Protected Recovery Backup
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 font-mono font-semibold text-slate-700">
                            {formatBytes(b.file_size_bytes)}
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                b.verification_status === 'verified'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : 'bg-rose-50 text-rose-700 border border-rose-200'
                              }`}
                            >
                              <CheckCircle2 className="w-3 h-3" />
                              {b.verification_status}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                b.availability_status === 'available'
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : b.availability_status === 'corrupted'
                                  ? 'bg-rose-50 text-rose-700'
                                  : 'bg-slate-100 text-slate-500'
                              }`}
                            >
                              {b.availability_status}
                            </span>
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap text-slate-600">
                            {new Date(b.created_at).toLocaleString()}
                          </td>
                          <td className="py-3 px-4 text-right">
                            {canRestoreIsolated || canRestoreProduction ? (
                              <button
                                onClick={() => openRestoreModal(b)}
                                disabled={b.availability_status !== 'available'}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 text-xs font-bold disabled:opacity-40"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                                <span>Restore</span>
                              </button>
                            ) : (
                              <span className="text-[11px] text-slate-400">No restore permission</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Restore Execution History */}
          <div className="space-y-3">
            <h2 className="text-sm font-bold text-slate-900">Restore Execution History</h2>
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      <th className="py-3 px-4">Restore UID</th>
                      <th className="py-3 px-4">Source Backup</th>
                      <th className="py-3 px-4">Mode</th>
                      <th className="py-3 px-4">Target Database</th>
                      <th className="py-3 px-4">Pre-Restore Backup</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Initiated By</th>
                      <th className="py-3 px-4">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {restoreHistory.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-10 text-center text-slate-400">
                          No database restore operations recorded yet.
                        </td>
                      </tr>
                    ) : (
                      restoreHistory.map((r) => (
                        <tr key={r.restore_uid} className="hover:bg-slate-50/60">
                          <td className="py-3 px-4 font-mono font-bold text-slate-900">{r.restore_uid}</td>
                          <td className="py-3 px-4 font-mono text-slate-700">{r.backup_uid}</td>
                          <td className="py-3 px-4">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                r.restore_mode === 'production'
                                  ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                  : 'bg-sky-50 text-sky-700 border border-sky-200'
                              }`}
                            >
                              {r.restore_mode}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-800">{r.target_database_name}</td>
                          <td className="py-3 px-4 font-mono text-[11px] text-slate-500">
                            {r.pre_restore_backup_uid || '—'}
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                r.restore_status === 'completed'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : r.restore_status === 'failed' || r.restore_status === 'recovery_required'
                                  ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                  : 'bg-amber-50 text-amber-700 border border-amber-200'
                              }`}
                            >
                              {r.restore_status}
                            </span>
                            {r.error_details && (
                              <div className="text-[10px] text-rose-600 mt-0.5 max-w-xs truncate" title={r.error_details}>
                                {r.error_details}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4 text-slate-600">{r.initiated_by_email}</td>
                          <td className="py-3 px-4 whitespace-nowrap text-slate-500">
                            {new Date(r.started_at).toLocaleString()}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================================================= */}
      {/* TAB 3: EXECUTION HISTORY & SCHEDULER AUDIT LOG    */}
      {/* ================================================= */}
      {activeTab === 'history' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-sky-600" />
                <h2 className="text-sm font-bold text-slate-900">Backup Execution History</h2>
              </div>
              <span className="text-[11px] text-slate-500">{executionHistory.length} records</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="py-3 px-4">Backup UID</th>
                    <th className="py-3 px-4">Scheduler / Type</th>
                    <th className="py-3 px-4">Size</th>
                    <th className="py-3 px-4">Duration</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Initiated By</th>
                    <th className="py-3 px-4">Started At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {executionHistory.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-10 text-center text-slate-400">
                        No backup executions recorded yet.
                      </td>
                    </tr>
                  ) : (
                    executionHistory.map((h) => (
                      <tr key={h.backup_uid} className="hover:bg-slate-50/60">
                        <td className="py-3 px-4">
                          <div className="font-mono font-bold text-slate-900">{h.backup_uid}</div>
                          <div className="font-mono text-[10px] text-slate-400">{h.file_name}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-800">{h.scheduler_name || 'On-Demand / CLI'}</div>
                          <span className="text-[10px] uppercase font-bold text-slate-500">{h.execution_type}</span>
                        </td>
                        <td className="py-3 px-4 font-mono">{formatBytes(Number(h.file_size_bytes || 0))}</td>
                        <td className="py-3 px-4 font-mono text-slate-600">{h.duration_ms} ms</td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              h.execution_status === 'completed'
                                ? 'bg-emerald-50 text-emerald-700'
                                : h.execution_status === 'failed'
                                ? 'bg-rose-50 text-rose-700'
                                : 'bg-amber-50 text-amber-700'
                            }`}
                          >
                            {h.execution_status}
                          </span>
                          {h.error_details && (
                            <div className="text-[10px] text-rose-600 mt-0.5 max-w-xs truncate" title={h.error_details}>
                              {h.error_details}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-600">{h.initiated_by_email}</td>
                        <td className="py-3 px-4 whitespace-nowrap text-slate-500">
                          {new Date(h.started_at).toLocaleString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-slate-600" />
                <h2 className="text-sm font-bold text-slate-900">Scheduler Configuration Audit Log</h2>
              </div>
              <span className="text-[11px] text-slate-500">{auditHistory.length} events</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="py-3 px-4">Action</th>
                    <th className="py-3 px-4">Scheduler</th>
                    <th className="py-3 px-4">Performed By</th>
                    <th className="py-3 px-4">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {auditHistory.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-10 text-center text-slate-400">
                        No scheduler audit events recorded yet.
                      </td>
                    </tr>
                  ) : (
                    auditHistory.map((a) => (
                      <tr key={a.id} className="hover:bg-slate-50/60">
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-800 font-mono text-[10px] font-bold">
                            {a.action}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-800">{a.scheduler_name}</td>
                        <td className="py-3 px-4 text-slate-600">{a.performed_by_email}</td>
                        <td className="py-3 px-4 whitespace-nowrap text-slate-500">
                          {new Date(a.performed_at).toLocaleString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ================================================= */}
      {/* CREATE / EDIT SCHEDULER MODAL                     */}
      {/* ================================================= */}
      {showSchedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-[#0084CC]" />
                <h3 className="text-sm font-bold text-slate-900">
                  {editingSched ? `Edit Backup Scheduler: ${editingSched.name}` : 'Create PostgreSQL Backup Scheduler'}
                </h3>
              </div>
              <button onClick={() => setShowSchedModal(false)} className="p-1 rounded text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveScheduler} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Scheduler Name *</label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Nightly Production Backup"
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Description</label>
                <input
                  type="text"
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  placeholder="Optional purpose or retention note"
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:border-sky-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Frequency *</label>
                  <select
                    value={formFreq}
                    onChange={(e) => setFormFreq(e.target.value as Frequency)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Execution Time (24h) *</label>
                  <div className="relative">
                    <Clock className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="time"
                      required
                      value={formTime}
                      onChange={(e) => setFormTime(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
                    />
                  </div>
                </div>
              </div>

              {formFreq === 'weekly' && (
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1.5">Select Days of Week *</label>
                  <div className="flex flex-wrap gap-1.5">
                    {WEEKDAYS.map((w) => {
                      const active = formSelectedDays.includes(w.value);
                      return (
                        <button
                          key={w.value}
                          type="button"
                          onClick={() => toggleWeekday(w.value)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                            active
                              ? 'bg-[#0084CC] text-white border-[#0084CC]'
                              : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {w.short}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {formFreq === 'monthly' && (
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Day of Month (1–31) *</label>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    required
                    value={formMonthlyDay}
                    onChange={(e) => setFormMonthlyDay(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Shorter months (such as February) safely clamp days 29–31 to the last valid day of the month.
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Timezone *</label>
                  <select
                    value={formTimezone}
                    onChange={(e) => setFormTimezone(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
                  >
                    {TIMEZONES.map((tz) => (
                      <option key={tz} value={tz}>
                        {tz}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Retention Policy (Days) *</label>
                  <input
                    type="number"
                    min={1}
                    max={3650}
                    required
                    value={formRetention}
                    onChange={(e) => setFormRetention(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Backup Destination Reference</label>
                <input
                  type="text"
                  value={formDestination}
                  onChange={(e) => setFormDestination(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formEnabled}
                  onChange={(e) => setFormEnabled(e.target.checked)}
                  className="rounded border-slate-300"
                />
                <span>Enable scheduler immediately upon saving</span>
              </label>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowSchedModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingSched}
                  className="px-4 py-2 rounded-xl bg-[#0084CC] hover:bg-sky-700 text-white text-xs font-bold disabled:opacity-50"
                >
                  {isSavingSched ? 'Saving...' : editingSched ? 'Save Schedule Changes' : 'Create Scheduler'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================================================= */}
      {/* DELETE SCHEDULER CONFIRMATION MODAL               */}
      {/* ================================================= */}
      {schedToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <h3 className="text-base font-bold text-slate-900 mb-2">Delete Backup Scheduler?</h3>
            <p className="text-xs text-slate-600 leading-relaxed mb-4">
              Removing scheduler <span className="font-bold text-slate-900">&ldquo;{schedToDelete.name}&rdquo;</span> will stop future scheduled runs. Previously created PostgreSQL backup archives, execution history, and audit logs will remain completely intact.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setSchedToDelete(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeletingSched}
                onClick={handleConfirmDeleteScheduler}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold disabled:opacity-50"
              >
                {isDeletingSched ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================================================= */}
      {/* RUN MANUAL BACKUP MODAL                           */}
      {/* ================================================= */}
      {showManualModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="text-sm font-bold text-slate-900">Run On-Demand PostgreSQL Backup</h3>
              <button onClick={() => setShowManualModal(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleManualBackup} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Backup Notes (Optional)</label>
                <textarea
                  rows={3}
                  value={manualNotes}
                  onChange={(e) => setManualNotes(e.target.value)}
                  placeholder="e.g. Pre-deployment full PostgreSQL backup..."
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                />
              </div>
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-[11px] text-slate-600 flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  Executes streaming <span className="font-mono">pg_dump -Fc</span> with AES-256-GCM encryption and SHA-256 integrity verification.
                </span>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowManualModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isRunningBackup}
                  className="px-4 py-2 rounded-xl bg-[#0084CC] hover:bg-sky-700 text-white text-xs font-bold disabled:opacity-50"
                >
                  {isRunningBackup ? 'Running Backup...' : 'Start Backup'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================================================= */}
      {/* RESTORE DATABASE MODAL (OPTION 1 & OPTION 2)      */}
      {/* ================================================= */}
      {restoreBackup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2">
                <Server className="w-4 h-4 text-amber-600" />
                <h3 className="text-sm font-bold text-slate-900">
                  PostgreSQL Database Restore — {restoreBackup.backup_uid}
                </h3>
              </div>
              <button onClick={() => setRestoreBackup(null)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            {loadingPreview ? (
              <div className="py-10 text-center text-xs text-slate-500">
                Verifying archive checksum &amp; PostgreSQL compatibility...
              </div>
            ) : (
              <form onSubmit={handleExecuteRestore} className="space-y-4">
                {restorePreview && (
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Archive File:</span>
                      <span className="font-mono font-bold text-slate-800">{restorePreview.backup.file_name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Live SHA-256 Checksum:</span>
                      <span
                        className={`font-bold ${
                          restorePreview.archive_checksum_valid ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        {restorePreview.archive_checksum_valid ? 'VERIFIED VALID' : 'CHECKSUM MISMATCH'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Production Database:</span>
                      <span className="font-mono font-semibold text-slate-800">
                        {restorePreview.current_production_database}
                      </span>
                    </div>
                    {restorePreview.compatibility_warning && (
                      <div className="mt-2 p-2 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-800">
                        {restorePreview.compatibility_warning}
                      </div>
                    )}
                  </div>
                )}

                {/* Mode Selector */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {canRestoreIsolated && (
                    <button
                      type="button"
                      onClick={() => {
                        setRestoreMode('isolated');
                        setRestoreError(null);
                      }}
                      className={`p-3.5 rounded-xl border text-left transition-all ${
                        restoreMode === 'isolated'
                          ? 'border-sky-500 bg-sky-50/70 ring-2 ring-sky-500/20'
                          : 'border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <div className="text-xs font-bold text-slate-900">Option 1: Isolated Database</div>
                      <p className="text-[11px] text-slate-500 mt-1">
                        Restores into a brand-new verification database. Zero impact on live production.
                      </p>
                    </button>
                  )}

                  {canRestoreProduction && (
                    <button
                      type="button"
                      onClick={() => {
                        setRestoreMode('production');
                        setRestoreError(null);
                      }}
                      className={`p-3.5 rounded-xl border text-left transition-all ${
                        restoreMode === 'production'
                          ? 'border-rose-500 bg-rose-50/70 ring-2 ring-rose-500/20'
                          : 'border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <div className="text-xs font-bold text-rose-800">Option 2: Production Restore</div>
                      <p className="text-[11px] text-rose-600/90 mt-1">
                        Super Admin only. Creates safety backup, enters maintenance mode, and replaces production DB.
                      </p>
                    </button>
                  )}
                </div>

                {restoreMode === 'isolated' ? (
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      Target Isolated Database Name
                    </label>
                    <input
                      type="text"
                      value={isolatedDbName}
                      onChange={(e) => setIsolatedDbName(e.target.value)}
                      placeholder="nexora_restore_verify"
                      className="w-full px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-xl"
                    />
                    <p className="text-[11px] text-slate-400 mt-1">
                      Lowercase letters, digits, and underscores only. A new PostgreSQL database will be created and verified.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-900 space-y-1">
                      <div className="font-bold flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 text-rose-600" />
                        <span>High-Impact Production Restore Warning</span>
                      </div>
                      <p className="text-[11px] leading-relaxed">
                        {restorePreview?.production_restore_warning}
                      </p>
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1">
                        Type Confirmation Phrase Exactly:{' '}
                        <span className="font-mono text-rose-700">RESTORE NEXORA PRODUCTION</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={prodConfirmPhrase}
                        onChange={(e) => setProdConfirmPhrase(e.target.value)}
                        placeholder="RESTORE NEXORA PRODUCTION"
                        className="w-full px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-xl"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1">
                        Super Admin Password Re-Authentication *
                      </label>
                      <div className="relative">
                        <Lock className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="password"
                          required
                          value={prodPassword}
                          onChange={(e) => setProdPassword(e.target.value)}
                          placeholder="Enter your Super Admin password..."
                          className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {restoreError && (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <span>{restoreError}</span>
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    disabled={isExecutingRestore}
                    onClick={() => setRestoreBackup(null)}
                    className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={
                      isExecutingRestore ||
                      (restorePreview && !restorePreview.archive_checksum_valid)
                    }
                    className={`px-4 py-2 rounded-xl text-white text-xs font-bold disabled:opacity-50 ${
                      restoreMode === 'production'
                        ? 'bg-rose-600 hover:bg-rose-700'
                        : 'bg-[#0084CC] hover:bg-sky-700'
                    }`}
                  >
                    {isExecutingRestore
                      ? restoreMode === 'production'
                        ? 'Creating Safety Backup & Restoring Production...'
                        : 'Restoring to Isolated Database...'
                      : restoreMode === 'production'
                      ? 'Authorize & Restore Production'
                      : 'Restore to Isolated Database'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
