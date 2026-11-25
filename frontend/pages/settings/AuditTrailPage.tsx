import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Search,
  Filter,
  RefreshCw,
  FileCheck,
  X,
  Calendar,
  User,
  Activity,
  Layers,
  ArrowLeft,
  CheckCircle2,
} from 'lucide-react';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { AuditLogItem } from '../../types';

interface AuditTrailPageProps {
  onNavigateOverview?: () => void;
}

export const AuditTrailPage: React.FC<AuditTrailPageProps> = ({ onNavigateOverview }) => {
  const { notify } = useAuth();
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [moduleFilter, setModuleFilter] = useState('');
  const [selectedLog, setSelectedLog] = useState<AuditLogItem | null>(null);

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      const res = await api.getAuditTrail({
        module: moduleFilter || undefined,
        search: search.trim() || undefined,
      });
      if (res.success && res.data) {
        setLogs(res.data);
      }
    } catch {
      notify('error', 'Failed to fetch audit trail records.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [moduleFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchLogs();
  };

  const modules = Array.from(new Set(logs.map(l => l.module).filter(Boolean)));

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-sky-50 text-[#0084CC] flex items-center justify-center shrink-0">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-bold text-[#0084CC] uppercase tracking-wider">
                  Compliance & Traceability
                </span>
                <span className="text-slate-300">•</span>
                <span className="text-xs text-slate-500 font-mono">
                  {logs.length} Immutable Logs
                </span>
              </div>
              <h1 className="text-xl sm:text-2xl font-extrabold text-[#101B32]">
                System Audit Trail & Security Ledger
              </h1>
              <p className="text-xs text-slate-500 mt-1 max-w-2xl leading-relaxed">
                Immutable, tamper-evident chronological event log tracking user authentications, administrative configuration edits, role assignments, and workforce transactions.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <a
              href={api.exportAuditTrailUrl('csv')}
              download="nexora_audit_trail.csv"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-xs font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-[#0084CC]"
              title="Export complete immutable audit ledger as CSV"
            >
              <FileCheck className="w-3.5 h-3.5 text-slate-500" />
              <span>Export CSV</span>
            </a>
            <button
              onClick={fetchLogs}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#0084CC] text-white hover:bg-sky-700 text-xs font-bold transition-all shadow-xs disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-sky-400"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Refresh Ledger</span>
            </button>
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div className="mt-6 pt-6 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
          <form onSubmit={handleSearchSubmit} className="relative flex-1 w-full sm:max-w-md">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by action, email, username, details, or IP..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0084CC]/20 focus:border-[#0084CC]"
            />
          </form>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={moduleFilter}
              onChange={e => setModuleFilter(e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0084CC]/20 focus:border-[#0084CC]"
            >
              <option value="">All Functional Modules</option>
              {modules.map(m => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Audit Logs Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="py-3 px-4">Event ID</th>
                <th className="py-3 px-4">Action</th>
                <th className="py-3 px-4">Module</th>
                <th className="py-3 px-4">Actor / Email</th>
                <th className="py-3 px-4">Client IP</th>
                <th className="py-3 px-4">Summary Details</th>
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4 text-right">Inspect</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-normal text-slate-700">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-6 h-6 border-2 border-[#0084CC] border-t-transparent rounded-full animate-spin" />
                      <span>Loading audit trail events...</span>
                    </div>
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    No audit records match the selected filters.
                  </td>
                </tr>
              ) : (
                logs.map(log => (
                  <tr key={log.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-slate-500">#{log.id}</td>
                    <td className="py-3 px-4">
                      <span className="font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-800 text-[11px] font-mono border border-slate-200/60">
                        {log.action}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-800">{log.module}</td>
                    <td className="py-3 px-4">
                      <div className="flex flex-col">
                        <span className="font-bold text-slate-900">{log.username || 'system'}</span>
                        <span className="text-[10px] text-slate-400 font-mono truncate max-w-[140px]">{log.user_email}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-600 text-[11px]">{log.ip_address}</td>
                    <td className="py-3 px-4 max-w-xs truncate text-slate-600" title={log.details}>
                      {log.details}
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-500 whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => setSelectedLog(log)}
                        className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-sky-50 text-[#0084CC] hover:bg-sky-100 transition-colors"
                      >
                        Details
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Inspect Event Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-sky-50 text-[#0084CC] flex items-center justify-center">
                  <FileCheck className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Audit Event #{selectedLog.id}
                  </h3>
                  <span className="text-[11px] text-slate-400 font-mono">{selectedLog.action}</span>
                </div>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200/60">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Actor Username</span>
                  <span className="font-semibold text-slate-800">{selectedLog.username || 'System'}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Actor Email</span>
                  <span className="font-semibold text-slate-800 truncate block">{selectedLog.user_email}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Client IP Address</span>
                  <span className="font-mono font-semibold text-slate-800">{selectedLog.ip_address}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Timestamp</span>
                  <span className="font-semibold text-slate-800">{new Date(selectedLog.timestamp).toLocaleString()}</span>
                </div>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Event Summary</span>
                <p className="p-3 bg-slate-50 rounded-xl border border-slate-200/60 text-slate-700 leading-relaxed font-mono text-[11px]">
                  {selectedLog.details}
                </p>
              </div>

              {selectedLog.previous_value && (
                <div>
                  <span className="text-[10px] uppercase font-bold text-amber-700 block mb-1">Previous Value</span>
                  <pre className="p-3 bg-amber-50/50 rounded-xl border border-amber-200 text-amber-900 font-mono text-[10px] overflow-x-auto max-h-36">
                    {selectedLog.previous_value}
                  </pre>
                </div>
              )}

              {selectedLog.updated_value && (
                <div>
                  <span className="text-[10px] uppercase font-bold text-emerald-700 block mb-1">Updated Value</span>
                  <pre className="p-3 bg-emerald-50/50 rounded-xl border border-emerald-200 text-emerald-900 font-mono text-[10px] overflow-x-auto max-h-36">
                    {selectedLog.updated_value}
                  </pre>
                </div>
              )}
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setSelectedLog(null)}
                className="px-4 py-2 rounded-lg bg-[#101B32] text-white text-xs font-bold hover:bg-slate-800"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
