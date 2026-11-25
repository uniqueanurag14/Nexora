import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { PageHeader } from '../components/PageHeader';
import { SummaryCard } from '../components/SummaryCard';
import { SummaryCardData, AuditLogItem } from '../types';
import {
  ShieldCheck,
  Database,
  Lock,
  Activity,
  ArrowRight,
  Server,
  Layers,
  Key,
  Users,
  CheckCircle2,
  Clock,
  Sparkles,
} from 'lucide-react';

interface DashboardPageProps {
  onNavigate: (route: string) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({ onNavigate }) => {
  const { user } = useAuth();
  const [summaryCards, setSummaryCards] = useState<SummaryCardData[]>([]);
  const [recentActivity, setRecentActivity] = useState<AuditLogItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const fetchDashboard = async () => {
      try {
        const res = await api.getDashboardWidgets();
        if (mounted && res.success && res.data) {
          setSummaryCards(res.data.summaryCards || []);
          setRecentActivity(res.data.recentActivity || []);
        } else if (mounted) {
          setError(res.message || 'Unable to load dashboard widgets');
        }
      } catch (e) {
        if (mounted) setError('Failed to retrieve dashboard metrics');
      } finally {
        if (mounted) setIsLoading(false);
      }
    };
    fetchDashboard();
    return () => {
      mounted = false;
    };
  }, []);

  const fullName = user
    ? user.first_name && user.last_name
      ? `${user.first_name} ${user.last_name}`
      : user.name
    : 'User';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Personalized Welcome Banner (Section 2) */}
      <div className="relative overflow-hidden rounded-3xl bg-linear-to-br from-slate-900 via-slate-800 to-slate-950 p-6 sm:p-10 text-white shadow-xl">
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-500/10 border border-sky-400/20 text-sky-400 text-xs font-semibold uppercase tracking-wider mb-4">
            <Sparkles className="w-4 h-4 text-sky-400" />
            Nexora Enterprise Platform
          </div>

          <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight">
            Welcome, {fullName}
          </h1>

          <p className="mt-3 text-xs sm:text-sm text-slate-300 leading-relaxed">
            Your role is assigned as{' '}
            <span className="font-bold text-sky-400 capitalize">
              {user?.role.replace('_', ' ')}
            </span>
            . Navigation menus and dashboard widgets have been filtered according to your granular RBAC permissions.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              onClick={() => onNavigate('/profile')}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs sm:text-sm font-semibold transition-all shadow-md"
            >
              My Profile
            </button>
            <button
              onClick={() => onNavigate('/settings')}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs sm:text-sm font-semibold transition-all"
            >
              Settings & Governance
            </button>
          </div>
        </div>

        {/* Decorative Grid Pattern */}
        <div className="absolute right-0 top-0 bottom-0 w-1/3 opacity-10 bg-[radial-gradient(#38bdf8_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none" />
      </div>

      {/* Role-Specific Summary Cards (Section 2 & 6) */}
      <div>
        <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider text-slate-500 mb-4">
          Operational Metrics & Status
        </h2>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-32 rounded-2xl bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
            {error}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {summaryCards.map(card => (
              <SummaryCard
                key={card.id}
                title={card.title}
                value={card.value}
                description={card.description}
                status={card.status}
                icon={<Layers className="w-4 h-4 text-sky-600" />}
              />
            ))}
          </div>
        )}
      </div>

      {/* Two Column Grid: User Identity & Recent Audit Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* User Identity & Granular Permissions */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Key className="w-4 h-4 text-sky-600" />
                Active Privilege Profile
              </h3>
              <span className="text-xs font-mono bg-slate-100 text-slate-700 px-2.5 py-0.5 rounded-md font-semibold">
                ID #{user?.id}
              </span>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between py-2 border-b border-slate-100 text-xs">
                <span className="text-slate-500">First Name:</span>
                <span className="font-semibold text-slate-900">{user?.first_name || 'System'}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-100 text-xs">
                <span className="text-slate-500">Last Name:</span>
                <span className="font-semibold text-slate-900">{user?.last_name || 'Administrator'}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-100 text-xs">
                <span className="text-slate-500">Email Address:</span>
                <span className="font-semibold text-slate-900">{user?.email}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-100 text-xs">
                <span className="text-slate-500">Department:</span>
                <span className="font-semibold text-slate-800">{user?.department || 'Executive'}</span>
              </div>
              <div className="flex justify-between py-2 text-xs">
                <span className="text-slate-500">Account Role:</span>
                <span className="font-bold capitalize text-sky-700">
                  {user?.role.replace('_', ' ')}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-slate-400">Security Policy: Fail-Closed RBAC</span>
            <button
              onClick={() => onNavigate('/profile')}
              className="text-sky-600 hover:text-sky-800 font-semibold inline-flex items-center gap-1"
            >
              Manage Profile <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Recent Activity (Authorized Data Only) */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex flex-col justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2 mb-4">
              <Clock className="w-4 h-4 text-slate-700" />
              Recent System Activity
            </h3>

            {recentActivity.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">
                No recent activity records found.
              </p>
            ) : (
              <div className="space-y-3">
                {recentActivity.slice(0, 4).map(act => (
                  <div
                    key={act.id}
                    className="flex items-start gap-3 p-3 rounded-xl border border-slate-100 bg-slate-50/40 text-xs"
                  >
                    <div className="w-2 h-2 rounded-full bg-sky-500 shrink-0 mt-1.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-900 truncate">
                          {act.action}
                        </span>
                        <span className="text-[10px] text-slate-400 shrink-0">
                          {new Date(act.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 truncate mt-0.5">{act.details}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-slate-400">Tamper-evident Audit Trail</span>
            <button
              onClick={() => onNavigate('/settings')}
              className="text-sky-600 hover:text-sky-800 font-semibold inline-flex items-center gap-1"
            >
              Full Audit Trail <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
