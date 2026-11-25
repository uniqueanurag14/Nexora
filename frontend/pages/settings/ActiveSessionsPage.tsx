import React, { useState, useEffect } from 'react';
import {
  Smartphone,
  Search,
  Filter,
  RefreshCw,
  LogOut,
  ShieldAlert,
  Laptop,
  CheckCircle2,
  XCircle,
  ArrowLeft,
  AlertTriangle,
} from 'lucide-react';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { UserSessionItem } from '../../types';

interface ActiveSessionsPageProps {
  onNavigateOverview?: () => void;
}

export const ActiveSessionsPage: React.FC<ActiveSessionsPageProps> = ({ onNavigateOverview }) => {
  const { notify } = useAuth();
  const [sessions, setSessions] = useState<UserSessionItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'revoked'>('active');
  const [sessionToRevoke, setSessionToRevoke] = useState<UserSessionItem | null>(null);
  const [isTerminatingBatch, setIsTerminatingBatch] = useState(false);

  const fetchSessions = async () => {
    setIsLoading(true);
    try {
      const res = await api.getActiveSessions({
        status: statusFilter === 'all' ? undefined : statusFilter,
        search: search.trim() || undefined,
      });
      if (res.success && res.data) {
        setSessions(res.data);
      }
    } catch {
      notify('error', 'Failed to retrieve active sessions.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, [statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchSessions();
  };

  const handleRevokeSingle = async () => {
    if (!sessionToRevoke) return;
    try {
      const res = await api.revokeSession(sessionToRevoke.id);
      if (res.success) {
        notify('success', `Session #${sessionToRevoke.id} for '${sessionToRevoke.username}' terminated.`);
        setSessionToRevoke(null);
        fetchSessions();
      } else {
        notify('error', res.message || 'Failed to revoke session.');
      }
    } catch {
      notify('error', 'Network error.');
    }
  };

  const handleBatchTerminateOtherSessions = async () => {
    if (!window.confirm('Terminate all other active user sessions across the system? Affected users will be logged out and required to sign in again.')) {
      return;
    }

    setIsTerminatingBatch(true);
    try {
      const res = await api.terminateBatchSessions({ all: true });
      if (res.success) {
        notify('success', res.message || 'All other active sessions have been terminated.');
        fetchSessions();
      } else {
        notify('error', res.message || 'Failed to terminate other sessions.');
      }
    } catch {
      notify('error', 'Network error while terminating sessions.');
    } finally {
      setIsTerminatingBatch(false);
    }
  };

  const activeCount = sessions.filter(s => !s.is_revoked).length;

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-sky-50 text-[#0084CC] flex items-center justify-center shrink-0">
              <Smartphone className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-bold text-[#0084CC] uppercase tracking-wider">
                  Session Governance
                </span>
                <span className="text-slate-300">•</span>
                <span className="text-xs text-slate-500 font-mono">
                  {activeCount} Active Tokens
                </span>
              </div>
              <h1 className="text-xl sm:text-2xl font-extrabold text-[#101B32]">
                Active User Sessions & Token Monitor
              </h1>
              <p className="text-xs text-slate-500 mt-1 max-w-2xl leading-relaxed">
                Inspect authenticated access tokens across browsers and mobile clients. Terminate suspicious or stale sessions remotely to enforce zero-trust identity policies.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleBatchTerminateOtherSessions}
              disabled={isTerminatingBatch || activeCount <= 1}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 text-xs font-semibold transition-colors disabled:opacity-40"
            >
              <LogOut className="w-3.5 h-3.5 text-rose-600" />
              <span>Terminate All Others</span>
            </button>
            <button
              onClick={fetchSessions}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#0084CC] text-white hover:bg-sky-700 text-xs font-bold transition-all shadow-xs disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="mt-6 pt-6 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
          <form onSubmit={handleSearchSubmit} className="relative flex-1 w-full sm:max-w-md">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by username, employee name, IP, or browser..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0084CC]/20 focus:border-[#0084CC]"
            />
          </form>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <span className="text-xs font-medium text-slate-400">Status:</span>
            <div className="inline-flex rounded-xl bg-slate-100 p-0.5 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setStatusFilter('active')}
                className={`px-3 py-1.5 rounded-lg transition-colors ${
                  statusFilter === 'active' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                Active
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('revoked')}
                className={`px-3 py-1.5 rounded-lg transition-colors ${
                  statusFilter === 'revoked' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                Revoked
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className={`px-3 py-1.5 rounded-lg transition-colors ${
                  statusFilter === 'all' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                All
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Sessions Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="py-3 px-4">Session ID</th>
                <th className="py-3 px-4">User Account</th>
                <th className="py-3 px-4">IP Address</th>
                <th className="py-3 px-4">Client / User Agent</th>
                <th className="py-3 px-4">Login Time</th>
                <th className="py-3 px-4">Last Activity</th>
                <th className="py-3 px-4">State</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-normal text-slate-700">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-6 h-6 border-2 border-[#0084CC] border-t-transparent rounded-full animate-spin" />
                      <span>Loading active sessions...</span>
                    </div>
                  </td>
                </tr>
              ) : sessions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    No session records found.
                  </td>
                </tr>
              ) : (
                sessions.map(s => (
                  <tr key={s.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-slate-500">#{s.id}</td>
                    <td className="py-3 px-4">
                      <div className="flex flex-col">
                        <span className="font-bold text-slate-900">{s.username || 'user'}</span>
                        <span className="text-[10px] text-slate-400">{s.employee_name || 'Staff User'}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-600">{s.ip_address}</td>
                    <td className="py-3 px-4 max-w-xs truncate text-slate-600 font-mono text-[11px]" title={s.user_agent}>
                      {s.user_agent}
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-500 whitespace-nowrap">
                      {new Date(s.created_at).toLocaleString()}
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-500 whitespace-nowrap">
                      {new Date(s.last_active_at).toLocaleString()}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {s.is_revoked ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                          <XCircle className="w-3 h-3 text-rose-500" />
                          <span>REVOKED</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                          <span>ACTIVE {s.is_current ? '(YOU)' : ''}</span>
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {!s.is_revoked && !s.is_current ? (
                        <button
                          onClick={() => setSessionToRevoke(s)}
                          className="px-2.5 py-1 text-xs font-semibold rounded-lg text-rose-600 hover:bg-rose-50 border border-rose-200 transition-colors"
                        >
                          Terminate
                        </button>
                      ) : (
                        <span className="text-slate-400 text-xs">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Revoke Single Session Confirmation Modal */}
      {sessionToRevoke && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center mb-4">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900 mb-2">
              Terminate User Session #{sessionToRevoke.id}?
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed mb-4">
              Revoking this session will invalidate the authentication token for user{' '}
              <strong className="text-slate-900">{sessionToRevoke.username}</strong> on IP{' '}
              <span className="font-mono text-slate-800">{sessionToRevoke.ip_address}</span>. The client will be immediately signed out.
            </p>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setSessionToRevoke(null)}
                className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRevokeSingle}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-colors shadow-xs"
              >
                Terminate Session
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
