import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { SummaryCard } from '../../components/common/SummaryCard';
import { PageHeader } from '../../components/common/PageHeader';
import { ErrorState } from '../../components/common/ErrorState';
import { EmptyState } from '../../components/common/EmptyState';
import { LoadingSkeleton } from '../../components/common/LoadingSkeleton';
import { StatusBadge } from '../../components/common/StatusBadge';
import {
  Users,
  Calendar,
  DollarSign,
  TrendingUp,
  Building2,
  Clock,
  ShieldCheck,
  Activity,
  Boxes,
  AlertTriangle,
  History,
  Stethoscope,
  Plus,
  ArrowRight,
  CheckCircle2,
  Receipt,
} from 'lucide-react';

interface RoleDashboardProps {
  onNavigate: (view: string) => void;
  onOpenBookingModal?: () => void;
  onOpenNewPatientModal?: () => void;
}

export const RoleDashboardPage: React.FC<RoleDashboardProps> = ({
  onNavigate,
  onOpenBookingModal,
  onOpenNewPatientModal,
}) => {
  const { currentUser, currentRole, isSuperAdmin } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dashboardData, setDashboardData] = useState<any>(null);

  const fetchDashboardData = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('mediera_auth_token') || localStorage.getItem('clinic_crm_auth_token');
      const res = await fetch('/api/v1/dashboard/role', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          setError('Unauthorized: You do not have permission to view dashboard statistics.');
          setLoading(false);
          return;
        }
        throw new Error(`Server returned HTTP ${res.status}`);
      }

      const json = await res.json();
      if (json.success && json.data) {
        setDashboardData(json.data);
      } else {
        throw new Error(json.error || 'Failed to load dashboard metrics');
      }
    } catch (err: any) {
      setError(err.message || 'Unable to connect to dashboard service.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [currentUser]);

  // Fallback name calculation
  const firstName = dashboardData?.user?.firstName || currentUser.firstName || currentUser.name?.split(' ')[0] || 'User';
  const lastName = dashboardData?.user?.lastName || currentUser.lastName || currentUser.name?.split(' ').slice(1).join(' ') || '';
  const welcomeMessage = dashboardData?.welcomeMessage || `Welcome back, ${firstName} ${lastName}`;

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Dashboard"
          subtitle={`Personalized workspace for ${firstName} ${lastName}`}
        />
        <ErrorState
          title="Failed to Load Dashboard"
          message={error}
          onRetry={fetchDashboardData}
        />
      </div>
    );
  }

  const metrics = dashboardData?.metrics || {};
  const activity = dashboardData?.activity || [];
  const widgets = dashboardData?.widgets || [];

  return (
    <div className="space-y-6">
      {/* Personalized Welcome Header */}
      <PageHeader
        title={welcomeMessage}
        subtitle={`Role: ${dashboardData?.user?.roleName || currentRole} • Real database metrics`}
        actions={
          <div className="flex items-center gap-2">
            {onOpenNewPatientModal && (isSuperAdmin || currentRole === 'ADMIN' || currentRole === 'RECEPTIONIST') && (
              <button
                type="button"
                onClick={onOpenNewPatientModal}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-semibold text-xs shadow-xs transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Patient</span>
              </button>
            )}
            {onOpenBookingModal && (
              <button
                type="button"
                onClick={onOpenBookingModal}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/60 transition-colors cursor-pointer"
              >
                <Calendar className="w-3.5 h-3.5 text-teal-600" />
                <span>Book Appointment</span>
              </button>
            )}
          </div>
        }
      />

      {/* Role-Specific Metric Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <SummaryCard
              key={i}
              title="Loading"
              value="---"
              icon={Activity}
              loading={true}
            />
          ))
        ) : (
          <>
            {/* Super Admin & Admin Widgets */}
            {(isSuperAdmin || currentRole === 'ADMIN') && (
              <>
                <SummaryCard
                  title="Total Registered Patients"
                  value={metrics.totalPatients ?? 0}
                  subtitle="Active electronic health records"
                  icon={Users}
                  color="teal"
                  onClick={() => onNavigate('/admin/patients')}
                />
                <SummaryCard
                  title="Appointments Today"
                  value={metrics.todayAppointments ?? 0}
                  subtitle={`${metrics.waitingInQueue ?? 0} currently in queue`}
                  icon={Calendar}
                  color="blue"
                  onClick={() => onNavigate('/admin/appointments')}
                />
                <SummaryCard
                  title="System Staff & Users"
                  value={metrics.totalUsers ?? 0}
                  subtitle="Across all branch networks"
                  icon={ShieldCheck}
                  color="indigo"
                  onClick={() => onNavigate('/admin/employees')}
                />
                <SummaryCard
                  title="Revenue Collected"
                  value={`₹${(metrics.totalRevenue ?? 0).toLocaleString('en-IN')}`}
                  subtitle="Total invoiced billing receipts"
                  icon={DollarSign}
                  color="emerald"
                  onClick={() => onNavigate('/admin/billing')}
                />
              </>
            )}

            {/* Doctor Widgets */}
            {currentRole === 'DOCTOR' && (
              <>
                <SummaryCard
                  title="Today's Patient Queue"
                  value={metrics.waitingInQueue ?? 0}
                  subtitle="Patients currently waiting"
                  icon={Clock}
                  color="teal"
                  onClick={() => onNavigate('/doctor-queue')}
                />
                <SummaryCard
                  title="Appointments Today"
                  value={metrics.todayAppointments ?? 0}
                  subtitle="Scheduled consultations"
                  icon={Calendar}
                  color="blue"
                  onClick={() => onNavigate('/admin/appointments')}
                />
                <SummaryCard
                  title="Completed Consultations"
                  value={metrics.completedAppointments ?? 0}
                  subtitle="Diagnoses and SOAP e-Rx issued"
                  icon={Stethoscope}
                  color="emerald"
                />
                <SummaryCard
                  title="Total Branch Patients"
                  value={metrics.totalPatients ?? 0}
                  subtitle="Registered directory records"
                  icon={Users}
                  color="indigo"
                  onClick={() => onNavigate('/admin/patients')}
                />
              </>
            )}

            {/* Receptionist Widgets */}
            {currentRole === 'RECEPTIONIST' && (
              <>
                <SummaryCard
                  title="Live OPD Queue"
                  value={metrics.waitingInQueue ?? 0}
                  subtitle="Active waiting tokens"
                  icon={Activity}
                  color="teal"
                  onClick={() => onNavigate('/admin/appointments')}
                />
                <SummaryCard
                  title="Today's Bookings"
                  value={metrics.todayAppointments ?? 0}
                  subtitle="Total check-in schedule"
                  icon={Calendar}
                  color="blue"
                  onClick={() => onNavigate('/admin/appointments')}
                />
                <SummaryCard
                  title="Completed Checkouts"
                  value={metrics.completedAppointments ?? 0}
                  subtitle="Visits concluded today"
                  icon={CheckCircle2}
                  color="emerald"
                />
                <SummaryCard
                  title="Total Registered Patients"
                  value={metrics.totalPatients ?? 0}
                  subtitle="Patient master index"
                  icon={Users}
                  color="indigo"
                  onClick={() => onNavigate('/admin/patients')}
                />
              </>
            )}

            {/* Accountant Widgets */}
            {currentRole === 'ACCOUNTANT' && (
              <>
                <SummaryCard
                  title="Total Invoiced"
                  value={`₹${(metrics.totalRevenue ?? 0).toLocaleString('en-IN')}`}
                  subtitle="Gross clinical billing"
                  icon={DollarSign}
                  color="teal"
                  onClick={() => onNavigate('/admin/billing')}
                />
                <SummaryCard
                  title="Paid Collections"
                  value={`₹${(metrics.paidRevenue ?? 0).toLocaleString('en-IN')}`}
                  subtitle="Cash, UPI & Card realized"
                  icon={TrendingUp}
                  color="emerald"
                  onClick={() => onNavigate('/admin/billing')}
                />
                <SummaryCard
                  title="Pending Receivables"
                  value={`₹${(metrics.pendingPayments ?? 0).toLocaleString('en-IN')}`}
                  subtitle="Unpaid / insurance balances"
                  icon={Clock}
                  color="amber"
                  onClick={() => onNavigate('/admin/billing')}
                />
                <SummaryCard
                  title="Invoices Generated"
                  value={metrics.totalInvoices ?? 0}
                  subtitle="Total billing transactions"
                  icon={Receipt}
                  color="indigo"
                  onClick={() => onNavigate('/admin/billing')}
                />
              </>
            )}

            {/* Pharmacist & Inventory Widgets */}
            {(currentRole === 'PHARMACIST' || currentRole === 'INVENTORY_MANAGER') && (
              <>
                <SummaryCard
                  title="Formulary Catalog"
                  value={metrics.totalInventoryItems ?? 0}
                  subtitle="Active medicines and SKUs"
                  icon={Boxes}
                  color="teal"
                  onClick={() => onNavigate('/inventory/items')}
                />
                <SummaryCard
                  title="Low-Stock Alerts"
                  value={metrics.lowStockItems ?? 0}
                  subtitle="Items below reorder threshold"
                  icon={AlertTriangle}
                  color={metrics.lowStockItems > 0 ? 'rose' : 'emerald'}
                  onClick={() => onNavigate('/inventory/low-stock')}
                />
                <SummaryCard
                  title="Today's Prescriptions"
                  value={metrics.todayAppointments ?? 0}
                  subtitle="Outpatient orders"
                  icon={Activity}
                  color="blue"
                />
                <SummaryCard
                  title="Waiting OPD Queue"
                  value={metrics.waitingInQueue ?? 0}
                  subtitle="Patients in facility"
                  icon={Clock}
                  color="indigo"
                />
              </>
            )}
          </>
        )}
      </div>

      {/* Recent Operational Activity Section */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400 flex items-center justify-center">
              <History className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {isSuperAdmin ? 'Recent System Audit Trail' : 'Recent Appointments & Clinic Activity'}
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Authorized real-time database transactions
              </p>
            </div>
          </div>

          {isSuperAdmin && (
            <button
              type="button"
              onClick={() => onNavigate('/admin/audit-logs')}
              className="text-xs font-semibold text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 flex items-center gap-1 cursor-pointer"
            >
              <span>View Full Audit Trail</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {loading ? (
          <LoadingSkeleton rows={4} />
        ) : activity.length === 0 ? (
          <EmptyState
            title="No recent activity logged"
            description="Operational events and appointment activities will appear here in real-time."
          />
        ) : isSuperAdmin ? (
          <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
            {activity.map((log: any, idx: number) => (
              <div key={log.id || idx} className="py-3 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-800 dark:text-slate-200 font-mono">
                      {log.action}
                    </span>
                    <span className="text-slate-400 dark:text-slate-500">•</span>
                    <span className="text-slate-600 dark:text-slate-400 truncate">
                      {log.userEmail || log.resource}
                    </span>
                  </div>
                  {log.metadata && (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                      {typeof log.metadata === 'string' ? log.metadata : JSON.stringify(log.metadata)}
                    </p>
                  )}
                </div>
                <span className="text-[11px] text-slate-400 shrink-0">
                  {log.createdAt ? new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Recent'}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
            {activity.map((appt: any, idx: number) => (
              <div key={appt.id || idx} className="py-3 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center font-bold text-xs shrink-0">
                    {appt.patientName?.[0] || 'P'}
                  </div>
                  <div className="truncate">
                    <p className="font-bold text-slate-800 dark:text-slate-200 truncate">
                      {appt.patientName || 'Walk-in Patient'}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {appt.doctorName ? `Dr. ${appt.doctorName}` : 'General Consultation'} • {appt.dateTime || 'Today'}
                    </p>
                  </div>
                </div>

                <div className="shrink-0">
                  <StatusBadge status={appt.status || 'Scheduled'} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
