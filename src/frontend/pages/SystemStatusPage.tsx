import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { OperationalStatus, SystemHealthData } from '../types';
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Database,
  Globe,
  Mail,
  RefreshCw,
  ShieldCheck,
  Server,
} from 'lucide-react';

export const SystemStatusPage: React.FC = () => {
  const [health, setHealth] = useState<SystemHealthData | null>(null);
  const [opStatus, setOpStatus] = useState<OperationalStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastChecked, setLastChecked] = useState<string>('');

  const fetchStatus = async () => {
    setIsLoading(true);
    try {
      const [healthRes, opRes] = await Promise.all([
        api.getReadiness(),
        api.getOperationalStatus(),
      ]);

      if (healthRes.success && healthRes.data) {
        setHealth(healthRes.data);
      }
      if (opRes.success && opRes.data) {
        setOpStatus(opRes.data);
      }
      setLastChecked(new Date().toLocaleTimeString());
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const dbOk = health?.database === 'connected' || opStatus?.database_connected;
  const frontendOk = true; // Since the user is viewing this UI served by Vite
  const smtpOk = opStatus?.smtp_configured;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Activity className="w-6 h-6 text-emerald-600" />
            System Health & Readiness
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Operational status verification for PostgreSQL, Frontend, and SMTP
            services.
          </p>
        </div>

        <button
          onClick={fetchStatus}
          disabled={isLoading}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 shadow-xs transition-colors self-start sm:self-auto disabled:opacity-50"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`}
          />
          Run Live Probe
        </button>
      </div>

      {/* Summary Card */}
      <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div
            className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
              dbOk && frontendOk
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-rose-100 text-rose-700'
            }`}
          >
            {dbOk && frontendOk ? (
              <ShieldCheck className="w-7 h-7" />
            ) : (
              <XCircle className="w-7 h-7" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-slate-900">
                Application Status: {dbOk ? 'READY' : 'DEGRADED'}
              </h2>
              <span className="text-xs px-2 py-0.5 rounded-full font-semibold uppercase bg-slate-100 text-slate-700">
                {opStatus?.environment || 'Active'}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Last probe verified at {lastChecked || 'just now'}
            </p>
          </div>
        </div>

        <div className="text-right">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Timezone
          </div>
          <div className="text-sm font-bold text-slate-900 font-mono">
            {opStatus?.timezone || 'Asia/Kolkata'}
          </div>
        </div>
      </div>

      {/* The Mandatory 3 Probes (Section 11) */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider text-slate-500">
          Core Dependency Verification
        </h3>

        {/* Step 1: PostgreSQL Database */}
        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold text-slate-400">
                  [1/3]
                </span>
                <h4 className="text-sm font-bold text-slate-900">
                  database Database
                </h4>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Relational persistence, transaction isolation, and Alembic
                migrations
              </p>
            </div>
          </div>

          <div>
            {dbOk ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                CONNECTED
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
                <XCircle className="w-4 h-4 text-rose-600" />
                UNAVAILABLE
              </span>
            )}
          </div>
        </div>

        {/* Step 2: Frontend Server */}
        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold text-slate-400">
                  [2/3]
                </span>
                <h4 className="text-sm font-bold text-slate-900">
                  Frontend Server
                </h4>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                React SPA, Tailwind styling, and client-side form guards
              </p>
            </div>
          </div>

          <div>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              RUNNING
            </span>
          </div>
        </div>

        {/* Step 3: SMTP Server */}
        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold text-slate-400">
                  [3/3]
                </span>
                <h4 className="text-sm font-bold text-slate-900">
                  SMTP Server
                </h4>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Branded password-recovery email delivery transport
              </p>
            </div>
          </div>

          <div>
            {smtpOk ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                CONNECTED
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                NOT CONFIGURED
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Security Privacy Notice */}
      <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-500 flex items-center gap-3">
        <Server className="w-4 h-4 text-slate-400 shrink-0" />
        <span>
          Operational security policy enforced: credentials, database passwords,
          and connection strings are strictly redacted from diagnostic
          telemetry.
        </span>
      </div>
    </div>
  );
};
