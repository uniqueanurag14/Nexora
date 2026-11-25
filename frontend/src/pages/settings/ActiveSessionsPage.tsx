import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { PageHeader } from '../../components/common/PageHeader';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { EmptyState } from '../../components/common/EmptyState';
import { LoadingSkeleton } from '../../components/common/LoadingSkeleton';
import { useToast } from '../../components/common/Toast';
import {
  KeyRound,
  Laptop,
  Smartphone,
  Globe,
  Trash2,
  ShieldAlert,
  Clock,
  ShieldCheck,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';

interface SessionItem {
  id: string;
  userId: string;
  ipAddress: string;
  userAgent: string;
  deviceInfo: string;
  browser: string;
  os: string;
  isRevoked: boolean;
  lastActiveAt: string;
  createdAt: string;
  expiresAt: string;
  userName?: string;
  userEmail?: string;
  isCurrent?: boolean;
}

interface ActiveSessionsProps {
  onNavigate?: (path: string) => void;
}

export const ActiveSessionsPage: React.FC<ActiveSessionsProps> = ({ onNavigate }) => {
  const { currentUser, isSuperAdmin } = useAuth();
  const toast = useToast();

  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [isRevokeAllOpen, setIsRevokeAllOpen] = useState(false);
  const [revokingAll, setRevokingAll] = useState(false);

  const fetchSessions = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('mediera_auth_token') || localStorage.getItem('clinic_crm_auth_token');
      const res = await fetch('/api/v1/settings/sessions', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          setSessions(json.data);
        }
      }
    } catch {
      toast.error('Failed to load active login sessions.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  const handleRevokeSingle = async (sessionId: string) => {
    try {
      const token = localStorage.getItem('mediera_auth_token') || localStorage.getItem('clinic_crm_auth_token');
      const res = await fetch(`/api/v1/settings/sessions/${sessionId}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const json = await res.json().catch(() => null);

      if (res.ok && json?.success) {
        toast.success('Session has been revoked on the server.');
        setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      } else {
        throw new Error(json?.error || 'Failed to revoke session');
      }
    } catch (err: any) {
      toast.error(err.message || 'Unable to revoke session.');
    } finally {
      setRevokingId(null);
    }
  };

  const handleRevokeAllOther = async () => {
    setRevokingAll(true);
    try {
      const token = localStorage.getItem('mediera_auth_token') || localStorage.getItem('clinic_crm_auth_token');
      const res = await fetch('/api/v1/settings/sessions/revoke-others', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const json = await res.json().catch(() => null);

      if (res.ok && json?.success) {
        toast.success(json.message || 'All other active sessions have been revoked.');
        await fetchSessions();
      } else {
        throw new Error(json?.error || 'Failed to revoke sessions');
      }
    } catch (err: any) {
      toast.error(err.message || 'Unable to revoke other sessions.');
    } finally {
      setRevokingAll(false);
      setIsRevokeAllOpen(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader
        title="Active Sessions"
        subtitle="Review authorized login devices, browser locations, and terminate active credentials"
        breadcrumbs={[
          { label: 'Workspace', href: '/erp/dashboard' },
          { label: 'Settings', href: '/settings' },
          { label: 'Active Sessions', active: true },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchSessions}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/60 transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh</span>
            </button>
            {sessions.filter((s) => !s.isCurrent).length > 0 && (
              <button
                type="button"
                onClick={() => setIsRevokeAllOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Revoke All Other Sessions</span>
              </button>
            )}
          </div>
        }
        onNavigate={onNavigate}
      />

      {/* Security Guidance Card */}
      <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 flex items-start gap-3 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
        <ShieldCheck className="w-5 h-5 text-teal-600 shrink-0 mt-0.5" />
        <div>
          <span className="font-bold text-slate-900 dark:text-white">Server-Enforced Token Revocation: </span>
          Terminating a session invalidates the authentication token on the backend immediately. Any further API requests originating from that device will be rejected with HTTP 401 Unauthorized.
        </div>
      </div>

      {/* Sessions List */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 shadow-xs space-y-4">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-2">
          {isSuperAdmin ? 'All System Active Sessions' : 'Your Signed-In Devices'} ({sessions.length})
        </h3>

        {loading ? (
          <LoadingSkeleton rows={3} />
        ) : sessions.length === 0 ? (
          <EmptyState
            title="No active sessions detected"
            description="Your authenticated sessions will appear here as you log in across different browsers."
            icon={KeyRound}
          />
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
            {sessions.map((s) => {
              const isMobile = s.deviceInfo?.toLowerCase().includes('mobile');
              const Icon = isMobile ? Smartphone : Laptop;

              return (
                <div key={s.id} className="py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="flex items-start gap-3.5 min-w-0">
                    <div className="w-10 h-10 rounded-2xl bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400 border border-teal-100 dark:border-teal-900/60 flex items-center justify-center shrink-0">
                      <Icon className="w-5 h-5" />
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-slate-900 dark:text-white">
                          {s.browser} on {s.os}
                        </span>
                        {s.isCurrent && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                            Current Session
                          </span>
                        )}
                        {isSuperAdmin && s.userEmail && (
                          <span className="text-[11px] text-slate-500 dark:text-slate-400">
                            ({s.userName || s.userEmail})
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400 mt-1 flex-wrap">
                        <span className="flex items-center gap-1">
                          <Globe className="w-3 h-3 text-slate-400" />
                          <span>IP: {s.ipAddress}</span>
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-400" />
                          <span>Last Active: {new Date(s.lastActiveAt).toLocaleString()}</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  {!s.isCurrent && (
                    <div className="shrink-0">
                      <button
                        type="button"
                        disabled={revokingId === s.id}
                        onClick={() => handleRevokeSingle(s.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-rose-200 dark:border-rose-900/50 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 font-semibold text-xs transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>{revokingId === s.id ? 'Revoking...' : 'Revoke Session'}</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Confirmation modal for revoking all other sessions */}
      <ConfirmDialog
        isOpen={isRevokeAllOpen}
        onClose={() => setIsRevokeAllOpen(false)}
        onConfirm={handleRevokeAllOther}
        title="Revoke All Other Sessions?"
        message="This will immediately terminate all active login sessions on other computers, phones, and tablets. Those devices will be forced to log in again."
        confirmLabel="Revoke All Other Devices"
        loading={revokingAll}
        variant="danger"
      />
    </div>
  );
};
