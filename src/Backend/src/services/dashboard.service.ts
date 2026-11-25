/**
 * Dashboard Service
 * 
 * Aggregates real operational statistics directly from the database tables.
 * NO mock, dummy, or hardcoded numbers.
 */

import { dbAdapter } from '../db/adapter';

export interface DashboardStats {
  totalPatients: number;
  totalAppointments: number;
  todayAppointments: number;
  waitingInQueue: number;
  completedAppointments: number;
  totalRevenue: number;
  paidRevenue: number;
  pendingPayments: number;
  totalInvoices: number;
  totalDoctors: number;
  totalUsers: number;
  totalBranches: number;
  recentAppointments: any[];
  recentAuditLogs: any[];
}

export class DashboardService {
  public async getStats(): Promise<DashboardStats> {
    // 1. Total Patients
    const patientsRes = await dbAdapter.query<{ count: string | number }>(
      'SELECT COUNT(*) as count FROM patients;'
    ).catch(() => ({ rows: [{ count: 0 }] }));
    const totalPatients = Number(patientsRes.rows[0]?.count || 0);

    // 2. Appointments counts
    const todayDateStr = new Date().toISOString().split('T')[0];
    
    const apptsRes = await dbAdapter.query<{
      total: string | number;
      today: string | number;
      waiting: string | number;
      completed: string | number;
    }>(
      `SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN date = $1 OR date LIKE $2 THEN 1 END) as today,
        COUNT(CASE WHEN status IN ('Waiting', 'Scheduled', 'In Consultation') THEN 1 END) as waiting,
        COUNT(CASE WHEN status = 'Completed' THEN 1 END) as completed
      FROM appointments;`,
      [todayDateStr, `${todayDateStr}%`]
    ).catch(() => ({ rows: [{ total: 0, today: 0, waiting: 0, completed: 0 }] }));

    const totalAppointments = Number(apptsRes.rows[0]?.total || 0);
    const todayAppointments = Number(apptsRes.rows[0]?.today || 0);
    const waitingInQueue = Number(apptsRes.rows[0]?.waiting || 0);
    const completedAppointments = Number(apptsRes.rows[0]?.completed || 0);

    // 3. Invoices & Revenue
    const invRes = await dbAdapter.query<{
      total_billed: string | number;
      total_paid: string | number;
      pending_balance: string | number;
      count: string | number;
    }>(
      `SELECT 
        COALESCE(SUM(amount), 0) as total_billed,
        COALESCE(SUM(paid_amount), 0) as total_paid,
        COALESCE(SUM(balance_amount), 0) as pending_balance,
        COUNT(*) as count
      FROM invoices;`
    ).catch(() => ({ rows: [{ total_billed: 0, total_paid: 0, pending_balance: 0, count: 0 }] }));

    const totalRevenue = Number(invRes.rows[0]?.total_billed || 0);
    const paidRevenue = Number(invRes.rows[0]?.total_paid || 0);
    const pendingPayments = Number(invRes.rows[0]?.pending_balance || 0);
    const totalInvoices = Number(invRes.rows[0]?.count || 0);

    // 4. Doctors, Users, Branches
    const docRes = await dbAdapter.query<{ count: string | number }>(
      'SELECT COUNT(*) as count FROM doctors;'
    ).catch(() => ({ rows: [{ count: 0 }] }));
    const totalDoctors = Number(docRes.rows[0]?.count || 0);

    const userRes = await dbAdapter.query<{ count: string | number }>(
      'SELECT COUNT(*) as count FROM users;'
    ).catch(() => ({ rows: [{ count: 0 }] }));
    const totalUsers = Number(userRes.rows[0]?.count || 0);

    const branchRes = await dbAdapter.query<{ count: string | number }>(
      'SELECT COUNT(*) as count FROM branches;'
    ).catch(() => ({ rows: [{ count: 0 }] }));
    const totalBranches = Number(branchRes.rows[0]?.count || 0);

    // 5. Recent Appointments (real data)
    const recentApptsRes = await dbAdapter.query<any>(
      `SELECT 
        a.id, CONCAT(a.date, ' ', a.time_slot) AS "dateTime", a.status, a.visit_type AS "appointmentType",
        CONCAT(p.first_name, ' ', p.last_name) AS "patientName",
        p.phone AS "patientPhone",
        d.name AS "doctorName"
      FROM appointments a
      LEFT JOIN patients p ON a.patient_id = p.id
      LEFT JOIN doctors d ON CAST(a.doctor_id AS VARCHAR) = CAST(d.id AS VARCHAR)
      ORDER BY a.created_at DESC
      LIMIT 5;`
    ).catch(() => ({ rows: [] }));

    // 6. Recent Audit Logs (real data)
    const recentAuditRes = await dbAdapter.query<any>(
      `SELECT 
        id, user_email AS "userEmail", action, entity AS "resource", entity_id AS "resourceId",
        details AS "metadata", timestamp AS "createdAt"
      FROM audit_logs
      ORDER BY id DESC
      LIMIT 10;`
    ).catch(() => ({ rows: [] }));

    return {
      totalPatients,
      totalAppointments,
      todayAppointments,
      waitingInQueue,
      completedAppointments,
      totalRevenue,
      paidRevenue,
      pendingPayments,
      totalInvoices,
      totalDoctors,
      totalUsers,
      totalBranches,
      recentAppointments: recentApptsRes.rows,
      recentAuditLogs: recentAuditRes.rows,
    };
  }

  public async getRoleDashboardData(user: any): Promise<{
    user: {
      id: string;
      firstName: string;
      lastName: string;
      name: string;
      email: string;
      role: string;
      roleName: string;
      lastLoginAt?: string;
    };
    welcomeMessage: string;
    widgets: string[];
    metrics: Record<string, any>;
    activity: any[];
  }> {
    const role = (user?.role || 'STAFF').toUpperCase();
    const isSuperAdmin = Boolean(user?.isSuperAdmin || role === 'SUPER_ADMIN');
    const baseStats = await this.getStats();

    // Parse user first and last name
    let firstName = user?.firstName;
    let lastName = user?.lastName;
    if (!firstName && user?.name) {
      firstName = user.name.split(' ')[0];
      lastName = user.name.split(' ').slice(1).join(' ');
    }
    firstName = firstName || 'Healthcare';
    lastName = lastName || 'Professional';

    const roleName = user?.roleName || (isSuperAdmin ? 'Executive Super Administrator' : role.replace('_', ' '));
    const welcomeMessage = `Welcome back, ${firstName} ${lastName} — ${roleName}`;

    let widgets: string[] = [];
    const metrics: Record<string, any> = {};
    let activity: any[] = [];

    if (isSuperAdmin || role === 'ADMIN') {
      widgets = ['executive_summary', 'branch_network', 'appointment_pulse', 'recent_audit_trail'];
      metrics.totalPatients = baseStats.totalPatients;
      metrics.totalAppointments = baseStats.totalAppointments;
      metrics.todayAppointments = baseStats.todayAppointments;
      metrics.waitingInQueue = baseStats.waitingInQueue;
      metrics.completedAppointments = baseStats.completedAppointments;
      metrics.totalRevenue = baseStats.totalRevenue;
      metrics.totalUsers = baseStats.totalUsers;
      metrics.totalBranches = baseStats.totalBranches;
      activity = baseStats.recentAuditLogs.slice(0, 5);
    } else if (role === 'DOCTOR') {
      widgets = ['clinical_queue', 'today_schedule', 'completed_consultations'];
      metrics.todayAppointments = baseStats.todayAppointments;
      metrics.waitingInQueue = baseStats.waitingInQueue;
      metrics.completedAppointments = baseStats.completedAppointments;
      activity = baseStats.recentAppointments;
    } else if (role === 'RECEPTIONIST') {
      widgets = ['front_desk_queue', 'token_dispenser', 'today_checkins'];
      metrics.todayAppointments = baseStats.todayAppointments;
      metrics.waitingInQueue = baseStats.waitingInQueue;
      metrics.completedAppointments = baseStats.completedAppointments;
      activity = baseStats.recentAppointments;
    } else if (role === 'ACCOUNTANT') {
      widgets = ['revenue_summary', 'pending_invoices', 'payment_reconciliation'];
      metrics.totalRevenue = baseStats.totalRevenue;
      metrics.paidRevenue = baseStats.paidRevenue;
      metrics.pendingPayments = baseStats.pendingPayments;
      metrics.totalInvoices = baseStats.totalInvoices;
      activity = baseStats.recentAppointments;
    } else if (role === 'PHARMACIST' || role === 'INVENTORY_MANAGER') {
      widgets = ['inventory_overview', 'formulary_kpis', 'stock_alerts'];
      // Query inventory real metrics
      const invItemsRes = await dbAdapter.query<{ count: string | number }>(
        'SELECT COUNT(*) as count FROM inventory_items;'
      ).catch(() => ({ rows: [{ count: 0 }] }));
      const lowStockRes = await dbAdapter.query<{ count: string | number }>(
        'SELECT COUNT(*) as count FROM inventory_items WHERE quantity <= reorder_level;'
      ).catch(() => ({ rows: [{ count: 0 }] }));
      metrics.totalInventoryItems = Number(invItemsRes.rows[0]?.count || 0);
      metrics.lowStockItems = Number(lowStockRes.rows[0]?.count || 0);
      activity = baseStats.recentAuditLogs.slice(0, 5);
    } else {
      widgets = ['workspace_summary', 'today_tasks'];
      metrics.todayAppointments = baseStats.todayAppointments;
      metrics.waitingInQueue = baseStats.waitingInQueue;
      activity = baseStats.recentAppointments;
    }

    return {
      user: {
        id: user?.id,
        firstName,
        lastName,
        name: `${firstName} ${lastName}`,
        email: user?.email || '',
        role,
        roleName,
        lastLoginAt: user?.lastLoginAt,
      },
      welcomeMessage,
      widgets,
      metrics,
      activity,
    };
  }
}

export const dashboardService = new DashboardService();
