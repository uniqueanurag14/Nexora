/**
 * NEXORA ERP — Dynamic Role-Based & Permission-Based Visual Manufacturing Dashboard API Router
 *
 * Strict Architecture & Security Guarantees:
 * - PostgreSQL ONLY: 100% real database data, zero dummy/mock/seed data, zero fabricated metrics.
 * - Default-deny server-side permission verification on every endpoint & widget.
 * - Strict data scope enforcement: company | department | self (never leaks cross-dept or other-employee data).
 * - Separate export permissions: reports.export.excel (Excel) and reports.export.pdf (PDF).
 * - All SQL queries are strictly parameterized ($1, $2, ...).
 * - Reuses server/services/manufacturingEngine.ts for fair standard-time productivity, quality
 *   (zero double-counting), component vs finished readiness, and bottleneck-constrained forecasting.
 */

import express, { Request, Response, NextFunction } from 'express';
import * as XLSX from 'xlsx';
import { getDb, DbPoolHandle } from './db';
import { store } from './store';
import { isValidIsoDate } from './security/redaction';
import {
  DEFAULT_SCORING_POLICY,
  ScoringPolicyConfig,
  OperationWorkSegment,
  DailyDaySummary,
  ProductOperationRequirement,
  OperationWipSnapshot,
  ForecastOperationInput,
  calculateQualityMetrics,
  calculateFairEmployeeScore,
  calculateProductionOrderReadiness,
  calculateForecastAndBottlenecks,
  round2,
} from './services/manufacturingEngine';
import type { AuthenticatedRequest } from '../server';

export type DashboardDataScope = 'company' | 'department' | 'self';

export interface DashboardAccessContext {
  userId: number;
  email: string;
  role: string;
  roles: string[];
  department: string | null;
  employeeId: string | null;
  isSuperAdmin: boolean;
  permissions: Set<string>;
  scope: DashboardDataScope;
}

export interface DashboardRouterDeps {
  authenticateToken: (req: AuthenticatedRequest, res: Response, next: NextFunction) => void;
  requirePermission: (permissionCode: string) => (req: AuthenticatedRequest, res: Response, next: NextFunction) => void;
  dbProvider?: () => Promise<DbPoolHandle>;
}

const VALID_DATE_PRESETS = [
  'today',
  'yesterday',
  'this_week',
  'last_week',
  'this_month',
  'last_month',
  'this_quarter',
  'this_year',
  'custom',
] as const;

export type DatePreset = (typeof VALID_DATE_PRESETS)[number];

const REWARD_CATEGORIES = [
  'best_employee_day',
  'best_employee_week',
  'best_employee_month',
  'best_performer_operation',
  'best_quality_performer',
  'most_consistent_employee',
  'overall_best_employee',
] as const;

export function hasAnyPerm(perms: Set<string>, candidates: string[]): boolean {
  if (perms.has('*')) return true;
  return candidates.some((c) => perms.has(c));
}

export function resolveDashboardAccess(req: AuthenticatedRequest): DashboardAccessContext {
  const reqUser = req.user!;
  const storeUser = store.findUserById(reqUser.id);
  const roles = storeUser?.roles?.length ? storeUser.roles : [reqUser.role];
  const isSuperAdmin = reqUser.role === 'super_admin' || roles.includes('super_admin');
  const rawPerms = isSuperAdmin
    ? ['*']
    : storeUser
    ? store.getUserEffectivePermissions(storeUser)
    : store.getRolePermissions(reqUser.role);
  const permissions = new Set<string>(rawPerms);

  // Determine strict data scope from role & permissions
  // Company-wide scope: super_admin, admin, auditor, or explicit company-wide management/reports permissions
  const hasCompanyScope =
    isSuperAdmin ||
    roles.includes('admin') ||
    roles.includes('auditor') ||
    roles.includes('production_manager') ||
    roles.includes('management') ||
    permissions.has('*') ||
    permissions.has('operations.forecasting.view') ||
    permissions.has('operations.rewards.manage') ||
    permissions.has('reports.production.view');

  // Department-level scope: supervisor / quality inspector / department-bound manager
  const hasDepartmentScope =
    !hasCompanyScope &&
    (roles.includes('department_supervisor') ||
      roles.includes('supervisor') ||
      roles.includes('quality_inspector') ||
      roles.includes('performance_user') ||
      permissions.has('operations.quality.inspect') ||
      permissions.has('operations.assignments.manage') ||
      permissions.has('performance.manage'));

  const scope: DashboardDataScope = hasCompanyScope
    ? 'company'
    : hasDepartmentScope
    ? 'department'
    : 'self';

  return {
    userId: reqUser.id,
    email: reqUser.email,
    role: reqUser.role,
    roles,
    department: storeUser?.department?.trim() || null,
    employeeId: String((storeUser as any)?.employee_id || '').trim() || null,
    isSuperAdmin,
    permissions,
    scope,
  };
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function resolveDateRange(
  presetRaw: unknown,
  customStartRaw?: unknown,
  customEndRaw?: unknown,
  nowRef?: Date
): {
  preset: DatePreset;
  startDate: string;
  endDate: string;
  prevStartDate: string;
  prevEndDate: string;
  label: string;
} {
  const now = nowRef ? new Date(nowRef) : new Date();
  const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const presetCandidate = String(presetRaw || 'this_month').toLowerCase().trim() as DatePreset;
  const preset: DatePreset = VALID_DATE_PRESETS.includes(presetCandidate) ? presetCandidate : 'this_month';

  let start = new Date(todayUtc);
  let end = new Date(todayUtc);
  let label = 'This Month';

  if (preset === 'today') {
    label = 'Today';
  } else if (preset === 'yesterday') {
    start.setUTCDate(start.getUTCDate() - 1);
    end = new Date(start);
    label = 'Yesterday';
  } else if (preset === 'this_week') {
    const dow = (todayUtc.getUTCDay() + 6) % 7; // Monday = 0
    start.setUTCDate(todayUtc.getUTCDate() - dow);
    label = 'This Week';
  } else if (preset === 'last_week') {
    const dow = (todayUtc.getUTCDay() + 6) % 7;
    end.setUTCDate(todayUtc.getUTCDate() - dow - 1);
    start = new Date(end);
    start.setUTCDate(end.getUTCDate() - 6);
    label = 'Last Week';
  } else if (preset === 'this_month') {
    start = new Date(Date.UTC(todayUtc.getUTCFullYear(), todayUtc.getUTCMonth(), 1));
    label = 'This Month';
  } else if (preset === 'last_month') {
    start = new Date(Date.UTC(todayUtc.getUTCFullYear(), todayUtc.getUTCMonth() - 1, 1));
    end = new Date(Date.UTC(todayUtc.getUTCFullYear(), todayUtc.getUTCMonth(), 0));
    label = 'Last Month';
  } else if (preset === 'this_quarter') {
    const qMonth = Math.floor(todayUtc.getUTCMonth() / 3) * 3;
    start = new Date(Date.UTC(todayUtc.getUTCFullYear(), qMonth, 1));
    label = 'This Quarter';
  } else if (preset === 'this_year') {
    start = new Date(Date.UTC(todayUtc.getUTCFullYear(), 0, 1));
    label = 'This Year';
  } else if (preset === 'custom') {
    const cs = typeof customStartRaw === 'string' && isValidIsoDate(customStartRaw) ? customStartRaw : toIsoDate(start);
    const ce = typeof customEndRaw === 'string' && isValidIsoDate(customEndRaw) ? customEndRaw : cs;
    start = new Date(`${cs}T00:00:00.000Z`);
    end = new Date(`${ce}T00:00:00.000Z`);
    if (end < start) {
      const tmp = start;
      start = end;
      end = tmp;
    }
    label = `${toIsoDate(start)} to ${toIsoDate(end)}`;
  }

  const spanDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
  const prevEnd = new Date(start.getTime() - 86400000);
  const prevStart = new Date(prevEnd.getTime() - (spanDays - 1) * 86400000);

  return {
    preset,
    startDate: toIsoDate(start),
    endDate: toIsoDate(end),
    prevStartDate: toIsoDate(prevStart),
    prevEndDate: toIsoDate(prevEnd),
    label,
  };
}

interface ParsedDashboardFilters {
  dateRange: ReturnType<typeof resolveDateRange>;
  department_id: number | null;
  employee_id: number | null;
  operation_id: number | null;
  product_id: number | null;
  production_order_id: number | null;
  shift_id: number | null;
  workstation: string | null;
  quality_status: string | null;
  page: number;
  limit: number;
}

function parsePositiveInt(val: unknown): number | null {
  if (val === undefined || val === null || val === '' || val === 'all') return null;
  const n = Number(val);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function parseDashboardFilters(req: Request): ParsedDashboardFilters {
  const q = req.query || {};
  const page = Math.max(1, parsePositiveInt(q.page) || 1);
  const limit = Math.min(100, Math.max(1, parsePositiveInt(q.limit) || 20));
  const workstation =
    typeof q.workstation === 'string' && q.workstation.trim() && q.workstation !== 'all'
      ? q.workstation.trim().slice(0, 120)
      : null;
  const qualityStatusRaw = typeof q.quality_status === 'string' ? q.quality_status.trim().toLowerCase() : '';
  const validQualityStatuses = ['approved', 'rejected', 'rework', 'pending'];
  const quality_status = validQualityStatuses.includes(qualityStatusRaw) ? qualityStatusRaw : null;

  return {
    dateRange: resolveDateRange(q.period || q.date_preset, q.start_date, q.end_date),
    department_id: parsePositiveInt(q.department_id),
    employee_id: parsePositiveInt(q.employee_id),
    operation_id: parsePositiveInt(q.operation_id),
    product_id: parsePositiveInt(q.product_id),
    production_order_id: parsePositiveInt(q.production_order_id),
    shift_id: parsePositiveInt(q.shift_id),
    workstation,
    quality_status,
    page,
    limit,
  };
}

async function resolveScopeEntities(
  db: DbPoolHandle,
  access: DashboardAccessContext,
  filters: ParsedDashboardFilters
): Promise<{
  allowed: boolean;
  denyMessage?: string;
  scopedDepartmentId: number | null;
  scopedEmployeeId: number | null;
}> {
  if (access.scope === 'company') {
    return {
      allowed: true,
      scopedDepartmentId: filters.department_id,
      scopedEmployeeId: filters.employee_id,
    };
  }

  if (access.scope === 'department') {
    let userDeptId: number | null = null;
    if (access.department) {
      const deptRes = await safeQuery(
        db,
        `SELECT id, name FROM departments WHERE LOWER(TRIM(name)) = LOWER(TRIM($1)) LIMIT 1`,
        [access.department]
      );
      if (deptRes.rows[0]?.id) {
        userDeptId = Number(deptRes.rows[0].id);
      }
    }
    if (filters.department_id && userDeptId && filters.department_id !== userDeptId) {
      return {
        allowed: false,
        denyMessage: 'Forbidden: Requested department is outside your authorized department scope.',
        scopedDepartmentId: userDeptId,
        scopedEmployeeId: null,
      };
    }
    if (filters.employee_id && userDeptId) {
      const empCheck = await safeQuery(
        db,
        `SELECT id, department_id, department FROM performance_employees WHERE id = $1 LIMIT 1`,
        [filters.employee_id]
      );
      const emp = empCheck.rows[0];
      if (
        emp &&
        Number(emp.department_id || 0) !== userDeptId &&
        String(emp.department || '').trim().toLowerCase() !== String(access.department || '').trim().toLowerCase()
      ) {
        return {
          allowed: false,
          denyMessage: 'Forbidden: Requested employee belongs to another department.',
          scopedDepartmentId: userDeptId,
          scopedEmployeeId: null,
        };
      }
    }
    return {
      allowed: true,
      scopedDepartmentId: userDeptId ?? filters.department_id,
      scopedEmployeeId: filters.employee_id,
    };
  }

  // Self scope: employee may ONLY view their own records
  let selfEmpId: number | null = null;
  if (access.employeeId) {
    const empRes = await safeQuery(
      db,
      `SELECT id FROM performance_employees WHERE UPPER(TRIM(emp_id)) = UPPER(TRIM($1)) LIMIT 1`,
      [access.employeeId]
    );
    if (empRes.rows[0]?.id) selfEmpId = Number(empRes.rows[0].id);
  }
  if (!selfEmpId) {
    const empRes = await safeQuery(
      db,
      `SELECT id FROM performance_employees WHERE id = $1 LIMIT 1`,
      [access.userId]
    );
    if (empRes.rows[0]?.id) selfEmpId = Number(empRes.rows[0].id);
  }

  if (filters.employee_id && selfEmpId && filters.employee_id !== selfEmpId) {
    return {
      allowed: false,
      denyMessage: 'Forbidden: You are only authorized to view your own performance data.',
      scopedDepartmentId: null,
      scopedEmployeeId: selfEmpId,
    };
  }
  if (filters.employee_id && !selfEmpId) {
    return {
      allowed: false,
      denyMessage: 'Forbidden: You are only authorized to view your own performance data.',
      scopedDepartmentId: null,
      scopedEmployeeId: -1,
    };
  }

  return {
    allowed: true,
    scopedDepartmentId: null,
    scopedEmployeeId: selfEmpId ?? -1,
  };
}

async function safeQuery<T = any>(
  db: DbPoolHandle,
  sql: string,
  params: any[] = []
): Promise<{ rows: T[]; missingTable?: boolean }> {
  try {
    const result = await db.query<T>(sql, params);
    return { rows: result.rows || [] };
  } catch (err: any) {
    if (err?.code === '42P01' || err?.code === '42703') {
      return { rows: [], missingTable: true };
    }
    throw err;
  }
}

function sendDashboardError(res: Response, err: any, fallbackMessage: string) {
  const code = err?.code;
  if (code === 'DB_UNAVAILABLE' || err?.statusCode === 503 || code === 'ECONNREFUSED') {
    return res.status(503).json({
      success: false,
      message: 'PostgreSQL database is currently unavailable. Please verify database connectivity.',
    });
  }
  if (code === '42P01') {
    return res.status(503).json({
      success: false,
      message: 'Required dashboard database tables are not initialized. Please run "npm run db:update".',
    });
  }
  console.error('[Dashboard API Error]', { code, message: err?.message });
  return res.status(500).json({
    success: false,
    message: fallbackMessage,
  });
}

async function loadActiveScoringPolicy(db: DbPoolHandle): Promise<ScoringPolicyConfig> {
  const res = await safeQuery(
    db,
    `SELECT * FROM performance_scoring_policies WHERE is_active = TRUE ORDER BY id DESC LIMIT 1`
  );
  const row = res.rows[0];
  if (!row) return { ...DEFAULT_SCORING_POLICY };
  return {
    policy_name: row.policy_name || DEFAULT_SCORING_POLICY.policy_name,
    productivity_weight: Number(row.productivity_weight ?? DEFAULT_SCORING_POLICY.productivity_weight),
    quality_weight: Number(row.quality_weight ?? DEFAULT_SCORING_POLICY.quality_weight),
    consistency_weight: Number(row.consistency_weight ?? DEFAULT_SCORING_POLICY.consistency_weight),
    productivity_metric_mode:
      row.productivity_metric_mode === 'gross_output' ? 'gross_output' : 'accepted_output',
    quality_metric_mode: row.quality_metric_mode === 'final_acceptance' ? 'final_acceptance' : 'first_pass',
    max_productivity_score_cap: Number(row.max_productivity_score_cap ?? DEFAULT_SCORING_POLICY.max_productivity_score_cap),
    consistency_min_productivity_pct: Number(
      row.consistency_min_productivity_pct ?? DEFAULT_SCORING_POLICY.consistency_min_productivity_pct
    ),
    consistency_min_quality_pct: Number(
      row.consistency_min_quality_pct ?? DEFAULT_SCORING_POLICY.consistency_min_quality_pct
    ),
    min_eligible_workdays_weekly: Number(
      row.min_eligible_workdays_weekly ?? DEFAULT_SCORING_POLICY.min_eligible_workdays_weekly
    ),
    min_eligible_workdays_monthly: Number(
      row.min_eligible_workdays_monthly ?? DEFAULT_SCORING_POLICY.min_eligible_workdays_monthly
    ),
    min_reward_productivity_pct: Number(
      row.min_reward_productivity_pct ?? DEFAULT_SCORING_POLICY.min_reward_productivity_pct
    ),
    min_reward_quality_pct: Number(row.min_reward_quality_pct ?? DEFAULT_SCORING_POLICY.min_reward_quality_pct),
    hardware_debounce_seconds: Number(row.hardware_debounce_seconds ?? DEFAULT_SCORING_POLICY.hardware_debounce_seconds),
    scoring_bands: Array.isArray(row.scoring_bands) ? row.scoring_bands : DEFAULT_SCORING_POLICY.scoring_bands,
  };
}

function buildWorkLogFilterSql(
  startDate: string,
  endDate: string,
  scopedDepartmentId: number | null,
  scopedEmployeeId: number | null,
  filters: ParsedDashboardFilters,
  accessDepartmentName: string | null,
  tableAlias = 'l'
): { whereSql: string; params: any[] } {
  const params: any[] = [startDate, endDate];
  const clauses: string[] = [`${tableAlias}.work_date >= $1`, `${tableAlias}.work_date <= $2`];

  if (scopedEmployeeId !== null) {
    params.push(scopedEmployeeId);
    clauses.push(`${tableAlias}.employee_id = $${params.length}`);
  }
  if (scopedDepartmentId !== null) {
    params.push(scopedDepartmentId);
    clauses.push(`COALESCE(${tableAlias}.department_id, pe.department_id) = $${params.length}`);
  } else if (accessDepartmentName) {
    params.push(accessDepartmentName);
    clauses.push(`LOWER(COALESCE(pe.department, '')) = LOWER($${params.length})`);
  }
  if (filters.operation_id !== null) {
    params.push(filters.operation_id);
    clauses.push(`${tableAlias}.operation_id = $${params.length}`);
  }
  if (filters.product_id !== null) {
    params.push(filters.product_id);
    clauses.push(`${tableAlias}.product_id = $${params.length}`);
  }
  if (filters.production_order_id !== null) {
    params.push(filters.production_order_id);
    clauses.push(`${tableAlias}.production_order_id = $${params.length}`);
  }
  if (filters.shift_id !== null) {
    params.push(filters.shift_id);
    clauses.push(`${tableAlias}.shift_id = $${params.length}`);
  }
  if (filters.workstation) {
    params.push(filters.workstation);
    clauses.push(`LOWER(COALESCE(${tableAlias}.workstation, '')) = LOWER($${params.length})`);
  }

  return { whereSql: clauses.join(' AND '), params };
}

interface ComputedEmployeeAnalytics {
  employees: Array<ReturnType<typeof calculateFairEmployeeScore> & { department_id: number | null; role_name: string }>;
  dailyTrends: Array<{
    work_date: string;
    gross_productivity_pct: number;
    accepted_productivity_pct: number;
    first_pass_quality_pct: number | null;
    submitted_qty: number;
    accepted_qty: number;
    rejected_qty: number;
    rework_qty: number;
    expected_output: number;
  }>;
  operationRankings: Array<{
    operation_id: number;
    operation_code: string;
    operation_name: string;
    employees_count: number;
    submitted_qty: number;
    accepted_qty: number;
    rejected_qty: number;
    rework_qty: number;
    pending_qty: number;
    expected_output: number;
    productivity_pct: number;
    quality_pct: number | null;
  }>;
  totals: {
    active_employees: number;
    submitted_qty: number;
    final_accepted_qty: number;
    first_pass_accepted_qty: number;
    rejected_qty: number;
    rework_qty: number;
    pending_inspection_qty: number;
    expected_output: number;
    avg_productivity_pct: number;
    avg_quality_pct: number | null;
    avg_final_score: number;
  };
}

async function computeEmployeePerformanceAnalytics(
  db: DbPoolHandle,
  policy: ScoringPolicyConfig,
  startDate: string,
  endDate: string,
  scopedDepartmentId: number | null,
  scopedEmployeeId: number | null,
  filters: ParsedDashboardFilters,
  accessDepartmentName: string | null
): Promise<ComputedEmployeeAnalytics> {
  const { whereSql, params } = buildWorkLogFilterSql(
    startDate,
    endDate,
    scopedDepartmentId,
    scopedEmployeeId,
    filters,
    scopedDepartmentId ? null : accessDepartmentName,
    'l'
  );

  const logsRes = await safeQuery(
    db,
    `SELECT
       l.id,
       l.employee_id,
       pe.emp_id,
       pe.first_name,
       pe.last_name,
       pe.department_id,
       COALESCE(d.name, pe.department, '') AS department_name,
       COALESCE(r.name, pe.designation, '') AS role_name,
       l.operation_id,
       COALESCE(op.operation_code, 'OP-' || l.operation_id) AS operation_code,
       COALESCE(op.operation_name, 'Operation #' || l.operation_id) AS operation_name,
       COALESCE(op.uom, 'pcs') AS uom,
       l.product_id,
       COALESCE(pr.name, '') AS product_name,
       l.work_date::text AS work_date,
       l.standard_time_minutes_snapshot,
       COALESCE(l.available_productive_minutes, 480) AS available_productive_minutes,
       COALESCE(l.submitted_qty, 0) AS submitted_qty,
       COALESCE(l.first_pass_accepted_qty, 0) AS first_pass_accepted_qty,
       COALESCE(l.rejected_qty, 0) AS rejected_qty,
       COALESCE(l.rework_qty, 0) AS rework_qty,
       COALESCE(l.accepted_after_rework_qty, 0) AS accepted_after_rework_qty,
       COALESCE(l.pending_inspection_qty, 0) AS pending_inspection_qty,
       COALESCE(l.approved_downtime_minutes, 0) AS approved_downtime_minutes
     FROM employee_operation_work_logs l
     INNER JOIN performance_employees pe ON pe.id = l.employee_id
     LEFT JOIN departments d ON d.id = COALESCE(l.department_id, pe.department_id)
     LEFT JOIN roles r ON r.id = pe.role_id
     LEFT JOIN manufacturing_operations op ON op.id = l.operation_id
     LEFT JOIN products pr ON pr.id = l.product_id
     WHERE ${whereSql}
     ORDER BY l.work_date ASC, l.employee_id ASC`,
    params
  );

  const rows = logsRes.rows;
  if (rows.length === 0) {
    return {
      employees: [],
      dailyTrends: [],
      operationRankings: [],
      totals: {
        active_employees: 0,
        submitted_qty: 0,
        final_accepted_qty: 0,
        first_pass_accepted_qty: 0,
        rejected_qty: 0,
        rework_qty: 0,
        pending_inspection_qty: 0,
        expected_output: 0,
        avg_productivity_pct: 0,
        avg_quality_pct: null,
        avg_final_score: 0,
      },
    };
  }

  // Filter by quality_status if requested
  const filteredRows = rows.filter((row: any) => {
    if (!filters.quality_status) return true;
    if (filters.quality_status === 'approved') {
      return Number(row.first_pass_accepted_qty || 0) + Number(row.accepted_after_rework_qty || 0) > 0;
    }
    if (filters.quality_status === 'rejected') return Number(row.rejected_qty || 0) > 0;
    if (filters.quality_status === 'rework') return Number(row.rework_qty || 0) > 0;
    if (filters.quality_status === 'pending') return Number(row.pending_inspection_qty || 0) > 0;
    return true;
  });

  // Group by employee -> operation segments & daily summaries
  const empMap = new Map<
    number,
    {
      employee_id: number;
      emp_id: string;
      employee_name: string;
      department: string;
      department_id: number | null;
      role_name: string;
      segMap: Map<string, OperationWorkSegment>;
      dayMap: Map<string, { earnedMin: number; availMin: number; fpAcc: number; inspected: number; finalAcc: number }>;
    }
  >();

  const dailyAgg = new Map<
    string,
    {
      earnedGrossMin: number;
      earnedAccMin: number;
      availMin: number;
      submitted: number;
      fpAcc: number;
      finalAcc: number;
      rejected: number;
      rework: number;
      inspected: number;
      expected: number;
    }
  >();

  const opAgg = new Map<
    number,
    {
      operation_id: number;
      operation_code: string;
      operation_name: string;
      employeeIds: Set<number>;
      earnedAccMin: number;
      availMin: number;
      submitted: number;
      fpAcc: number;
      finalAcc: number;
      rejected: number;
      rework: number;
      pending: number;
      inspected: number;
      expected: number;
    }
  >();

  for (const row of filteredRows) {
    const empId = Number(row.employee_id);
    const stdMin = Math.max(0.01, Number(row.standard_time_minutes_snapshot || 1));
    const netAvailMin = Math.max(
      1,
      Number(row.available_productive_minutes || 480) - Number(row.approved_downtime_minutes || 0)
    );
    const submitted = Number(row.submitted_qty || 0);
    const fpAcc = Number(row.first_pass_accepted_qty || 0);
    const rejected = Number(row.rejected_qty || 0);
    const rework = Number(row.rework_qty || 0);
    const accAfterRework = Number(row.accepted_after_rework_qty || 0);
    const pending = Number(row.pending_inspection_qty || 0);
    const finalAcc = fpAcc + accAfterRework;
    const inspected = fpAcc + rejected + rework;
    const expectedOut = netAvailMin / stdMin;
    const workDate = String(row.work_date || '').slice(0, 10);

    if (!empMap.has(empId)) {
      empMap.set(empId, {
        employee_id: empId,
        emp_id: String(row.emp_id || `EMP-${empId}`),
        employee_name: `${row.first_name || ''} ${row.last_name || ''}`.trim() || `Employee #${empId}`,
        department: String(row.department_name || 'Unassigned'),
        department_id: row.department_id ? Number(row.department_id) : null,
        role_name: String(row.role_name || ''),
        segMap: new Map(),
        dayMap: new Map(),
      });
    }
    const empEntry = empMap.get(empId)!;
    const segKey = `${row.operation_id}:${row.product_id || 0}`;
    if (!empEntry.segMap.has(segKey)) {
      empEntry.segMap.set(segKey, {
        operation_id: Number(row.operation_id),
        operation_code: String(row.operation_code),
        operation_name: String(row.operation_name),
        product_id: row.product_id ? Number(row.product_id) : null,
        product_name: row.product_name || null,
        uom: String(row.uom || 'pcs'),
        standard_time_minutes: stdMin,
        available_productive_minutes: 0,
        submitted_qty: 0,
        first_pass_accepted_qty: 0,
        rejected_qty: 0,
        rework_qty: 0,
        accepted_after_rework_qty: 0,
        pending_inspection_qty: 0,
      });
    }
    const seg = empEntry.segMap.get(segKey)!;
    seg.available_productive_minutes += netAvailMin;
    seg.submitted_qty += submitted;
    seg.first_pass_accepted_qty += fpAcc;
    seg.rejected_qty += rejected;
    seg.rework_qty += rework;
    seg.accepted_after_rework_qty += accAfterRework;
    seg.pending_inspection_qty += pending;

    const earnedForPolicy = (policy.productivity_metric_mode === 'gross_output' ? submitted : finalAcc) * stdMin;
    const dayBucket = empEntry.dayMap.get(workDate) || {
      earnedMin: 0,
      availMin: 0,
      fpAcc: 0,
      inspected: 0,
      finalAcc: 0,
    };
    dayBucket.earnedMin += earnedForPolicy;
    dayBucket.availMin += netAvailMin;
    dayBucket.fpAcc += fpAcc;
    dayBucket.inspected += inspected;
    dayBucket.finalAcc += finalAcc;
    empEntry.dayMap.set(workDate, dayBucket);

    // Daily trend aggregation
    const dAgg = dailyAgg.get(workDate) || {
      earnedGrossMin: 0,
      earnedAccMin: 0,
      availMin: 0,
      submitted: 0,
      fpAcc: 0,
      finalAcc: 0,
      rejected: 0,
      rework: 0,
      inspected: 0,
      expected: 0,
    };
    dAgg.earnedGrossMin += submitted * stdMin;
    dAgg.earnedAccMin += finalAcc * stdMin;
    dAgg.availMin += netAvailMin;
    dAgg.submitted += submitted;
    dAgg.fpAcc += fpAcc;
    dAgg.finalAcc += finalAcc;
    dAgg.rejected += rejected;
    dAgg.rework += rework;
    dAgg.inspected += inspected;
    dAgg.expected += expectedOut;
    dailyAgg.set(workDate, dAgg);

    // Operation aggregation
    const opId = Number(row.operation_id);
    const oAgg = opAgg.get(opId) || {
      operation_id: opId,
      operation_code: String(row.operation_code),
      operation_name: String(row.operation_name),
      employeeIds: new Set<number>(),
      earnedAccMin: 0,
      availMin: 0,
      submitted: 0,
      fpAcc: 0,
      finalAcc: 0,
      rejected: 0,
      rework: 0,
      pending: 0,
      inspected: 0,
      expected: 0,
    };
    oAgg.employeeIds.add(empId);
    oAgg.earnedAccMin += finalAcc * stdMin;
    oAgg.availMin += netAvailMin;
    oAgg.submitted += submitted;
    oAgg.fpAcc += fpAcc;
    oAgg.finalAcc += finalAcc;
    oAgg.rejected += rejected;
    oAgg.rework += rework;
    oAgg.pending += pending;
    oAgg.inspected += inspected;
    oAgg.expected += expectedOut;
    opAgg.set(opId, oAgg);
  }

  const periodDays = Math.max(
    1,
    Math.round((new Date(`${endDate}T00:00:00Z`).getTime() - new Date(`${startDate}T00:00:00Z`).getTime()) / 86400000) + 1
  );
  const periodType: 'daily' | 'weekly' | 'monthly' | 'custom' =
    periodDays <= 1 ? 'daily' : periodDays <= 7 ? 'weekly' : periodDays <= 31 ? 'monthly' : 'custom';

  const employees = Array.from(empMap.values()).map((entry) => {
    const dailySummaries: DailyDaySummary[] = Array.from(entry.dayMap.entries()).map(([work_date, d]) => ({
      work_date,
      eligible_working_day: d.availMin > 0,
      productivity_pct: d.availMin > 0 ? round2((d.earnedMin / d.availMin) * 100) : 0,
      quality_pct:
        d.inspected > 0
          ? round2(((policy.quality_metric_mode === 'final_acceptance' ? d.finalAcc : d.fpAcc) / d.inspected) * 100)
          : null,
    }));

    const score = calculateFairEmployeeScore({
      employee_id: entry.employee_id,
      emp_id: entry.emp_id,
      employee_name: entry.employee_name,
      department: entry.department,
      segments: Array.from(entry.segMap.values()),
      daily_summaries: dailySummaries,
      policy,
      period_type: periodType,
    });

    return {
      ...score,
      department_id: entry.department_id,
      role_name: entry.role_name,
    };
  });

  employees.sort((a, b) => b.final_score - a.final_score || b.actual_productivity_pct - a.actual_productivity_pct);

  const dailyTrends = Array.from(dailyAgg.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([work_date, d]) => ({
      work_date,
      gross_productivity_pct: d.availMin > 0 ? round2((d.earnedGrossMin / d.availMin) * 100) : 0,
      accepted_productivity_pct: d.availMin > 0 ? round2((d.earnedAccMin / d.availMin) * 100) : 0,
      first_pass_quality_pct: d.inspected > 0 ? round2((d.fpAcc / d.inspected) * 100) : null,
      submitted_qty: round2(d.submitted),
      accepted_qty: round2(d.finalAcc),
      rejected_qty: round2(d.rejected),
      rework_qty: round2(d.rework),
      expected_output: round2(d.expected),
    }));

  const operationRankings = Array.from(opAgg.values())
    .map((o) => ({
      operation_id: o.operation_id,
      operation_code: o.operation_code,
      operation_name: o.operation_name,
      employees_count: o.employeeIds.size,
      submitted_qty: round2(o.submitted),
      accepted_qty: round2(o.finalAcc),
      rejected_qty: round2(o.rejected),
      rework_qty: round2(o.rework),
      pending_qty: round2(o.pending),
      expected_output: round2(o.expected),
      productivity_pct: o.availMin > 0 ? round2((o.earnedAccMin / o.availMin) * 100) : 0,
      quality_pct: o.inspected > 0 ? round2((o.fpAcc / o.inspected) * 100) : null,
    }))
    .sort((a, b) => b.productivity_pct - a.productivity_pct);

  const sumSubmitted = employees.reduce((s, e) => s + e.total_submitted_qty, 0);
  const sumFinalAcc = employees.reduce((s, e) => s + e.total_final_accepted_qty, 0);
  const sumFpAcc = employees.reduce((s, e) => s + e.total_first_pass_accepted_qty, 0);
  const sumRejected = employees.reduce((s, e) => s + e.total_rejected_qty, 0);
  const sumRework = employees.reduce((s, e) => s + e.total_rework_qty, 0);
  const sumPending = employees.reduce((s, e) => s + e.total_pending_inspection_qty, 0);
  const sumExpected = employees.reduce((s, e) => s + e.total_expected_output, 0);
  const totalInspected = sumFpAcc + sumRejected + sumRework;

  const avgProd =
    employees.length > 0
      ? round2(employees.reduce((s, e) => s + e.actual_productivity_pct, 0) / employees.length)
      : 0;
  const avgFinalScore =
    employees.length > 0 ? round2(employees.reduce((s, e) => s + e.final_score, 0) / employees.length) : 0;

  return {
    employees,
    dailyTrends,
    operationRankings,
    totals: {
      active_employees: employees.length,
      submitted_qty: round2(sumSubmitted),
      final_accepted_qty: round2(sumFinalAcc),
      first_pass_accepted_qty: round2(sumFpAcc),
      rejected_qty: round2(sumRejected),
      rework_qty: round2(sumRework),
      pending_inspection_qty: round2(sumPending),
      expected_output: round2(sumExpected),
      avg_productivity_pct: avgProd,
      avg_quality_pct: totalInspected > 0 ? round2((sumFpAcc / totalInspected) * 100) : null,
      avg_final_score: avgFinalScore,
    },
  };
}

async function computeOrdersReadinessAndForecast(
  db: DbPoolHandle,
  filters: ParsedDashboardFilters
): Promise<{
  readinessOrders: Array<ReturnType<typeof calculateProductionOrderReadiness>>;
  forecasts: Array<{
    production_order_id: number;
    order_number: string;
    product_id: number;
    product_name: string;
    forecast: ReturnType<typeof calculateForecastAndBottlenecks>;
  }>;
}> {
  const orderParams: any[] = [];
  const orderClauses: string[] = [`po.status NOT IN ('cancelled', 'archived')`];
  if (filters.product_id) {
    orderParams.push(filters.product_id);
    orderClauses.push(`po.product_id = $${orderParams.length}`);
  }
  if (filters.production_order_id) {
    orderParams.push(filters.production_order_id);
    orderClauses.push(`po.id = $${orderParams.length}`);
  }

  const ordersRes = await safeQuery(
    db,
    `SELECT po.id, po.order_number, po.product_id, COALESCE(p.name, 'Product #' || po.product_id) AS product_name,
            COALESCE(po.target_qty, po.planned_quantity, 0) AS target_qty,
            po.status, po.due_date
     FROM production_orders po
     LEFT JOIN products p ON p.id = po.product_id
     WHERE ${orderClauses.join(' AND ')}
     ORDER BY po.id DESC
     LIMIT 25`,
    orderParams
  );

  if (ordersRes.rows.length === 0) {
    return { readinessOrders: [], forecasts: [] };
  }

  const readinessOrders: Array<ReturnType<typeof calculateProductionOrderReadiness>> = [];
  const forecasts: Array<{
    production_order_id: number;
    order_number: string;
    product_id: number;
    product_name: string;
    forecast: ReturnType<typeof calculateForecastAndBottlenecks>;
  }> = [];

  for (const order of ordersRes.rows) {
    const productId = Number(order.product_id);
    const orderId = Number(order.id);
    const targetQty = Number(order.target_qty || 0);

    const reqRes = await safeQuery(
      db,
      `SELECT pom.operation_id,
              COALESCE(op.operation_code, 'OP-' || pom.operation_id) AS operation_code,
              COALESCE(op.operation_name, 'Operation #' || pom.operation_id) AS operation_name,
              COALESCE(pom.component_name, op.operation_name, 'Component') AS component_name,
              COALESCE(pom.required_qty_per_unit, 1) AS required_qty_per_unit,
              COALESCE(pom.standard_time_minutes, op.standard_time_minutes, 1) AS standard_time_minutes,
              COALESCE(pom.sequence_order, 1) AS sequence_order,
              COALESCE(pom.is_mandatory, TRUE) AS is_mandatory,
              COALESCE(pom.is_assembly_stage, FALSE) AS is_assembly_stage
       FROM product_operation_mappings pom
       LEFT JOIN manufacturing_operations op ON op.id = pom.operation_id
       WHERE pom.product_id = $1 AND COALESCE(pom.is_active, TRUE) = TRUE
       ORDER BY pom.sequence_order ASC, pom.id ASC`,
      [productId]
    );

    const requirements: ProductOperationRequirement[] = reqRes.rows.map((r: any) => ({
      operation_id: Number(r.operation_id),
      operation_code: String(r.operation_code),
      operation_name: String(r.operation_name),
      component_name: String(r.component_name),
      required_qty_per_unit: Number(r.required_qty_per_unit || 1),
      standard_time_minutes: Number(r.standard_time_minutes || 1),
      sequence_order: Number(r.sequence_order || 1),
      is_mandatory: r.is_mandatory !== false,
      is_assembly_stage: Boolean(r.is_assembly_stage),
    }));

    const wipRes = await safeQuery(
      db,
      `SELECT operation_id,
              COALESCE(completed_qty, 0) AS completed_qty,
              COALESCE(quality_approved_qty, 0) AS quality_approved_qty,
              COALESCE(pending_inspection_qty, 0) AS pending_inspection_qty,
              COALESCE(rejected_qty, 0) AS rejected_qty,
              COALESCE(rework_qty, 0) AS rework_qty,
              COALESCE(transferred_qty, 0) AS transferred_qty,
              COALESCE(consumed_in_assembly_qty, 0) AS consumed_in_assembly_qty
       FROM production_order_operation_wip
       WHERE production_order_id = $1`,
      [orderId]
    );

    const wipSnapshots: OperationWipSnapshot[] = wipRes.rows.map((w: any) => ({
      operation_id: Number(w.operation_id),
      completed_qty: Number(w.completed_qty || 0),
      quality_approved_qty: Number(w.quality_approved_qty || 0),
      pending_inspection_qty: Number(w.pending_inspection_qty || 0),
      rejected_qty: Number(w.rejected_qty || 0),
      rework_qty: Number(w.rework_qty || 0),
      transferred_qty: Number(w.transferred_qty || 0),
      consumed_in_assembly_qty: Number(w.consumed_in_assembly_qty || 0),
    }));

    const asmRes = await safeQuery(
      db,
      `SELECT
         COALESCE(SUM(assembled_qty), 0) AS assembled_qty,
         COALESCE(SUM(final_approved_qty), 0) AS final_approved_qty,
         COALESCE(SUM(final_rejected_qty), 0) AS final_rejected_qty,
         COALESCE(SUM(rework_required_qty), 0) AS rework_required_qty
       FROM finished_product_assemblies
       WHERE production_order_id = $1`,
      [orderId]
    );
    const asmRow = asmRes.rows[0] || {};

    const wipMap = new Map<number, OperationWipSnapshot>();
    for (const w of wipSnapshots) wipMap.set(w.operation_id, w);

    const readiness = calculateProductionOrderReadiness({
      production_order_id: orderId,
      order_number: String(order.order_number || `ORD-${orderId}`),
      product_id: productId,
      product_name: String(order.product_name),
      target_qty: targetQty,
      requirements,
      wip_by_operation: wipMap,
      assembled_qty: Number(asmRow.assembled_qty || 0),
      final_approved_finished_qty: Number(asmRow.final_approved_qty || 0),
      final_rejected_qty: Number(asmRow.final_rejected_qty || 0),
      rework_required_qty: Number(asmRow.rework_required_qty || 0),
    });
    readinessOrders.push(readiness);

    // Forecast stage inputs from active assignments + historical logs
    const assignRes = await safeQuery(
      db,
      `SELECT operation_id, COUNT(DISTINCT employee_id)::int AS assigned_count
       FROM employee_operation_assignments
       WHERE is_active = TRUE
         AND (product_id = $1 OR product_id IS NULL)
         AND (production_order_id = $2 OR production_order_id IS NULL)
       GROUP BY operation_id`,
      [productId, orderId]
    );
    const assignMap = new Map<number, number>();
    for (const a of assignRes.rows) {
      assignMap.set(Number(a.operation_id), Number(a.assigned_count || 0));
    }

    const histRes = await safeQuery(
      db,
      `SELECT operation_id,
              SUM(COALESCE(first_pass_accepted_qty, 0) + COALESCE(accepted_after_rework_qty, 0)) AS acc_qty,
              SUM(COALESCE(submitted_qty, 0)) AS sub_qty,
              SUM(COALESCE(first_pass_accepted_qty, 0) + COALESCE(rejected_qty, 0) + COALESCE(rework_qty, 0)) AS insp_qty,
              SUM(COALESCE(available_productive_minutes, 0) - COALESCE(approved_downtime_minutes, 0)) AS avail_min,
              SUM((COALESCE(first_pass_accepted_qty, 0) + COALESCE(accepted_after_rework_qty, 0)) * COALESCE(standard_time_minutes_snapshot, 1)) AS earned_min
       FROM employee_operation_work_logs
       WHERE product_id = $1
       GROUP BY operation_id`,
      [productId]
    );
    const histMap = new Map<number, { eff: number | null; yieldRatio: number | null }>();
    for (const h of histRes.rows) {
      const avail = Number(h.avail_min || 0);
      const earned = Number(h.earned_min || 0);
      const insp = Number(h.insp_qty || 0);
      const acc = Number(h.acc_qty || 0);
      histMap.set(Number(h.operation_id), {
        eff: avail > 0 && earned > 0 ? earned / avail : null,
        yieldRatio: insp > 0 ? Math.min(1, acc / insp) : null,
      });
    }

    const stages: ForecastOperationInput[] = requirements.map((r) => {
      const w = wipMap.get(r.operation_id);
      const hist = histMap.get(r.operation_id);
      const availWip = w ? Math.max(0, w.quality_approved_qty - w.consumed_in_assembly_qty) : 0;
      return {
        operation_id: r.operation_id,
        operation_code: r.operation_code,
        operation_name: r.operation_name,
        component_name: r.component_name,
        required_qty_per_unit: r.required_qty_per_unit,
        standard_time_minutes: r.standard_time_minutes,
        is_mandatory: r.is_mandatory,
        is_assembly_stage: r.is_assembly_stage,
        assigned_employees_count: assignMap.get(r.operation_id) || 0,
        shift_available_productive_minutes: 480,
        approved_downtime_minutes_per_shift: 0,
        historical_efficiency_ratio: hist?.eff ?? null,
        historical_quality_yield_ratio: hist?.yieldRatio ?? null,
        available_wip_qty: availWip,
        waiting_between_ops_qty: w?.pending_inspection_qty || 0,
      };
    });

    if (stages.length > 0) {
      const forecast = calculateForecastAndBottlenecks({
        target_qty: targetQty,
        already_finished_approved_qty: readiness.final_approved_finished_qty,
        working_days_per_week: 6,
        working_days_per_month: 26,
        stages,
      });
      forecasts.push({
        production_order_id: orderId,
        order_number: readiness.order_number,
        product_id: productId,
        product_name: readiness.product_name,
        forecast,
      });
    }
  }

  return { readinessOrders, forecasts };
}

/**
 * Synchronize real operational events into dashboard_notifications (idempotent via source_key).
 * Never generates fake/dummy notifications — only emits when real operational conditions exist in PG.
 */
async function syncOperationalNotifications(db: DbPoolHandle): Promise<void> {
  const candidates: Array<{
    source_key: string;
    event_type: string;
    severity: 'info' | 'warning' | 'critical' | 'success';
    title: string;
    message: string;
    required_permission: string;
    department_id: number | null;
    employee_id: number | null;
    target_route: string;
  }> = [];

  // 1. Pending quality inspections
  const pendingQcRes = await safeQuery(
    db,
    `SELECT l.department_id,
            COALESCE(d.name, 'General') AS department_name,
            SUM(COALESCE(l.pending_inspection_qty, 0))::numeric AS pending_qty
     FROM employee_operation_work_logs l
     LEFT JOIN departments d ON d.id = l.department_id
     WHERE COALESCE(l.pending_inspection_qty, 0) > 0
     GROUP BY l.department_id, d.name
     HAVING SUM(COALESCE(l.pending_inspection_qty, 0)) > 0`
  );
  for (const row of pendingQcRes.rows) {
    const qty = round2(Number(row.pending_qty || 0));
    candidates.push({
      source_key: `pending_qc_dept_${row.department_id || 0}`,
      event_type: 'pending_quality_inspection',
      severity: 'warning',
      title: `Pending Quality Inspection (${row.department_name})`,
      message: `${qty} unit(s) awaiting quality inspection in ${row.department_name}.`,
      required_permission: 'dashboard.quality_reports.view',
      department_id: row.department_id ? Number(row.department_id) : null,
      employee_id: null,
      target_route: '/operations-performance?tab=quality',
    });
  }

  // 2. High rejection / rework alerts (> 10% defect rate on recent logs)
  const highDefectRes = await safeQuery(
    db,
    `SELECT l.operation_id,
            COALESCE(op.operation_name, 'Operation #' || l.operation_id) AS operation_name,
            l.department_id,
            SUM(COALESCE(l.rejected_qty, 0) + COALESCE(l.rework_qty, 0)) AS defect_qty,
            SUM(COALESCE(l.first_pass_accepted_qty, 0) + COALESCE(l.rejected_qty, 0) + COALESCE(l.rework_qty, 0)) AS inspected_qty
     FROM employee_operation_work_logs l
     LEFT JOIN manufacturing_operations op ON op.id = l.operation_id
     WHERE l.work_date >= CURRENT_DATE - INTERVAL '7 days'
     GROUP BY l.operation_id, op.operation_name, l.department_id
     HAVING SUM(COALESCE(l.first_pass_accepted_qty, 0) + COALESCE(l.rejected_qty, 0) + COALESCE(l.rework_qty, 0)) > 0
        AND (SUM(COALESCE(l.rejected_qty, 0) + COALESCE(l.rework_qty, 0))::numeric /
             NULLIF(SUM(COALESCE(l.first_pass_accepted_qty, 0) + COALESCE(l.rejected_qty, 0) + COALESCE(l.rework_qty, 0)), 0)) > 0.10`
  );
  for (const row of highDefectRes.rows) {
    const rate = round2((Number(row.defect_qty) / Number(row.inspected_qty)) * 100);
    candidates.push({
      source_key: `high_defect_op_${row.operation_id}_${row.department_id || 0}`,
      event_type: 'high_rejection_alert',
      severity: 'critical',
      title: `High Defect Rate on ${row.operation_name}`,
      message: `${rate}% rejection/rework rate detected across ${round2(Number(row.inspected_qty))} inspected unit(s).`,
      required_permission: 'dashboard.quality_reports.view',
      department_id: row.department_id ? Number(row.department_id) : null,
      employee_id: null,
      target_route: '/operations-performance?tab=quality',
    });
  }

  // 3. Pending reward approvals
  const rewardRes = await safeQuery(
    db,
    `SELECT COUNT(*)::int AS cnt FROM employee_reward_nominations WHERE status = 'pending'`
  );
  const pendingRewards = Number(rewardRes.rows[0]?.cnt || 0);
  if (pendingRewards > 0) {
    candidates.push({
      source_key: `pending_reward_approvals`,
      event_type: 'reward_approval_pending',
      severity: 'info',
      title: 'Reward Nominations Awaiting Approval',
      message: `${pendingRewards} employee reward nomination(s) pending management review.`,
      required_permission: 'dashboard.rewards.view',
      department_id: null,
      employee_id: null,
      target_route: '/operations-performance?tab=rewards',
    });
  }

  // 4. Production orders behind target / assembly ready
  const orderRes = await safeQuery(
    db,
    `SELECT id, order_number, status, due_date
     FROM production_orders
     WHERE status NOT IN ('completed', 'cancelled', 'archived')
       AND due_date IS NOT NULL
       AND due_date < CURRENT_DATE
     LIMIT 5`
  );
  for (const ord of orderRes.rows) {
    candidates.push({
      source_key: `order_overdue_${ord.id}`,
      event_type: 'production_order_behind_target',
      severity: 'critical',
      title: `Order ${ord.order_number} Behind Schedule`,
      message: `Production order ${ord.order_number} passed due date ${String(ord.due_date).slice(0, 10)} (status: ${ord.status}).`,
      required_permission: 'dashboard.production_summary.view',
      department_id: null,
      employee_id: null,
      target_route: '/operations-performance?tab=readiness',
    });
  }

  for (const c of candidates) {
    await safeQuery(
      db,
      `INSERT INTO dashboard_notifications
       (source_key, event_type, severity, title, message, required_permission, department_id, employee_id, target_route, is_active, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE, NOW())
       ON CONFLICT (source_key) DO UPDATE SET
         severity = EXCLUDED.severity,
         title = EXCLUDED.title,
         message = EXCLUDED.message,
         is_active = TRUE`,
      [
        c.source_key,
        c.event_type,
        c.severity,
        c.title,
        c.message,
        c.required_permission,
        c.department_id,
        c.employee_id,
        c.target_route,
      ]
    );
  }
}

function buildSimplePdfBuffer(title: string, subtitle: string, headers: string[], rows: string[][]): Buffer {
  const esc = (s: string) =>
    String(s || '')
      .replace(/[^\x20-\x7E]/g, ' ')
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)');

  const lines: string[] = [
    title,
    subtitle,
    '='.repeat(92),
    headers.join(' | '),
    '-'.repeat(92),
    ...rows.slice(0, 48).map((r) => r.join(' | ')),
  ];

  const textOps = lines
    .map((line, idx) => `BT /F1 ${idx === 0 ? 13 : idx === 1 ? 9 : 8} Tf 36 ${760 - idx * 14} Td (${esc(line.slice(0, 118))}) Tj ET`)
    .join('\n');

  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj',
    '4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Courier >> endobj',
    `5 0 obj << /Length ${Buffer.byteLength(textOps, 'utf8')} >> stream\n${textOps}\nendstream endobj`,
  ];

  let body = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(body, 'utf8'));
    body += `${obj}\n`;
  }
  const xrefOffset = Buffer.byteLength(body, 'utf8');
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    body += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  body += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(body, 'utf8');
}

function pctDelta(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return round2(((current - previous) / Math.abs(previous)) * 100);
}

export function createDashboardRouter(deps: DashboardRouterDeps) {
  const router = express.Router();
  const resolveDb = async (): Promise<DbPoolHandle> => (deps.dbProvider ? deps.dbProvider() : getDb());

  // Enforce JWT auth on every dashboard endpoint
  router.use(deps.authenticateToken);

  // =========================================================================
  // 1. GET /api/dashboard/config — Effective permissions, scope, filters & quick actions
  // =========================================================================
  router.get('/config', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const access = resolveDashboardAccess(req);
      const db = await resolveDb();

      const widgetAccess = {
        employee_summary: hasAnyPerm(access.permissions, [
          'dashboard.employee_summary.view',
          'performance.view',
          'operations.performance.view',
        ]),
        production_summary: hasAnyPerm(access.permissions, [
          'dashboard.production_summary.view',
          'production.view',
          'operations.readiness.view',
        ]),
        employee_performance: hasAnyPerm(access.permissions, [
          'dashboard.employee_performance.view',
          'reports.employee_performance.view',
          'operations.performance.view',
          'performance.view',
        ]),
        production_analytics: hasAnyPerm(access.permissions, [
          'dashboard.production_summary.view',
          'reports.production.view',
          'production.view',
        ]),
        quality_reports: hasAnyPerm(access.permissions, [
          'dashboard.quality_reports.view',
          'reports.quality.view',
          'operations.quality.view',
          'operations.quality.inspect',
        ]),
        product_readiness: hasAnyPerm(access.permissions, [
          'dashboard.product_readiness.view',
          'operations.readiness.view',
          'readiness.view',
        ]),
        production_forecast: hasAnyPerm(access.permissions, [
          'dashboard.production_forecast.view',
          'reports.forecast.view',
          'operations.forecasting.view',
        ]),
        rewards: hasAnyPerm(access.permissions, [
          'dashboard.rewards.view',
          'operations.rewards.view',
          'operations.rewards.manage',
        ]),
        notifications: hasAnyPerm(access.permissions, ['dashboard.notifications.view', 'dashboard.view']),
        recent_activity: hasAnyPerm(access.permissions, ['dashboard.recent_activity.view', 'dashboard.view']),
        export_excel: hasAnyPerm(access.permissions, ['reports.export.excel', 'operations.reports.export']),
        export_pdf: hasAnyPerm(access.permissions, ['reports.export.pdf', 'operations.reports.export']),
      };

      const scopeCheck = await resolveScopeEntities(db, access, parseDashboardFilters(req));

      // Fetch real filter dropdown options from PostgreSQL (scoped strictly to user's authorized scope)
      const deptSql = scopeCheck.scopedDepartmentId
        ? `SELECT id, code, name FROM departments WHERE id = $1 AND COALESCE(is_active, TRUE) = TRUE ORDER BY name ASC`
        : `SELECT id, code, name FROM departments WHERE COALESCE(is_active, TRUE) = TRUE ORDER BY name ASC`;
      const deptParams = scopeCheck.scopedDepartmentId ? [scopeCheck.scopedDepartmentId] : [];

      const empSql =
        access.scope === 'self'
          ? `SELECT id, emp_id, first_name, last_name, department_id, department FROM performance_employees WHERE id = $1 AND is_active = TRUE ORDER BY first_name ASC`
          : scopeCheck.scopedDepartmentId
          ? `SELECT id, emp_id, first_name, last_name, department_id, department FROM performance_employees WHERE department_id = $1 AND is_active = TRUE ORDER BY first_name ASC`
          : `SELECT id, emp_id, first_name, last_name, department_id, department FROM performance_employees WHERE is_active = TRUE ORDER BY first_name ASC LIMIT 500`;
      const empParams =
        access.scope === 'self'
          ? [scopeCheck.scopedEmployeeId ?? -1]
          : scopeCheck.scopedDepartmentId
          ? [scopeCheck.scopedDepartmentId]
          : [];

      const [deptsRes, empsRes, opsRes, prodsRes, ordersRes, shiftsRes] = await Promise.all([
        safeQuery(db, deptSql, deptParams),
        safeQuery(db, empSql, empParams),
        safeQuery(
          db,
          `SELECT id, operation_code, operation_name FROM manufacturing_operations WHERE COALESCE(is_active, TRUE) = TRUE ORDER BY operation_name ASC`
        ),
        safeQuery(db, `SELECT id, sku, name FROM products ORDER BY name ASC`),
        safeQuery(
          db,
          `SELECT id, order_number, product_id, status FROM production_orders WHERE status NOT IN ('cancelled', 'archived') ORDER BY id DESC LIMIT 100`
        ),
        safeQuery(db, `SELECT id, shift_code, shift_name FROM manufacturing_shifts WHERE COALESCE(is_active, TRUE) = TRUE ORDER BY id ASC`),
      ]);

      // Build permission-gated Quick Actions (never exposes unauthorized actions)
      const quickActions: Array<{ id: string; label: string; route: string; category: string }> = [];
      if (hasAnyPerm(access.permissions, ['performance.manage'])) {
        quickActions.push({ id: 'register_employee', label: 'Register Employee', route: '/performance/registration', category: 'workforce' });
      }
      if (hasAnyPerm(access.permissions, ['operations.assignments.manage'])) {
        quickActions.push({ id: 'assign_operations', label: 'Assign Operations', route: '/operations-performance?tab=assignments', category: 'operations' });
      }
      if (hasAnyPerm(access.permissions, ['operations.quality.inspect'])) {
        quickActions.push({ id: 'quality_inspection', label: 'Record Quality Inspection', route: '/operations-performance?tab=quality', category: 'quality' });
      }
      if (hasAnyPerm(access.permissions, ['operations.readiness.view', 'production.manage'])) {
        quickActions.push({ id: 'production_readiness', label: 'Production & Readiness', route: '/operations-performance?tab=readiness', category: 'production' });
      }
      if (hasAnyPerm(access.permissions, ['operations.forecasting.view', 'dashboard.production_forecast.view'])) {
        quickActions.push({ id: 'forecasting', label: 'Production Forecast', route: '/operations-performance?tab=forecasting', category: 'forecast' });
      }
      if (hasAnyPerm(access.permissions, ['operations.rewards.manage', 'operations.rewards.view'])) {
        quickActions.push({ id: 'rewards', label: 'Rewards & Nominations', route: '/operations-performance?tab=rewards', category: 'rewards' });
      }
      if (hasAnyPerm(access.permissions, ['roles.manage'])) {
        quickActions.push({ id: 'roles', label: 'Role Permissions', route: '/roles', category: 'governance' });
      }
      if (hasAnyPerm(access.permissions, ['settings.view'])) {
        quickActions.push({ id: 'settings', label: 'System Settings', route: '/settings', category: 'governance' });
      }

      res.json({
        success: true,
        data: {
          scope: access.scope,
          department: access.department,
          role: access.role,
          widget_access: widgetAccess,
          quick_actions: quickActions,
          filter_options: {
            date_presets: VALID_DATE_PRESETS,
            departments: deptsRes.rows.map((d: any) => ({ id: Number(d.id), code: d.code || '', name: d.name })),
            employees: empsRes.rows.map((e: any) => ({
              id: Number(e.id),
              emp_id: e.emp_id,
              name: `${e.first_name || ''} ${e.last_name || ''}`.trim() || e.emp_id,
              department_id: e.department_id ? Number(e.department_id) : null,
              department: e.department || '',
            })),
            operations: opsRes.rows.map((o: any) => ({
              id: Number(o.id),
              code: o.operation_code,
              name: o.operation_name,
            })),
            products: prodsRes.rows.map((p: any) => ({ id: Number(p.id), sku: p.sku || '', name: p.name })),
            production_orders: ordersRes.rows.map((o: any) => ({
              id: Number(o.id),
              order_number: o.order_number,
              product_id: Number(o.product_id),
              status: o.status,
            })),
            shifts: shiftsRes.rows.map((s: any) => ({ id: Number(s.id), code: s.shift_code, name: s.shift_name })),
            quality_statuses: ['approved', 'rejected', 'rework', 'pending'],
          },
        },
      });
    } catch (err: any) {
      sendDashboardError(res, err, 'Failed to load dashboard configuration');
    }
  });

  // =========================================================================
  // 2. GET /api/dashboard/summary — Permission-gated KPI summary cards with deltas
  // =========================================================================
  router.get('/summary', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const access = resolveDashboardAccess(req);
      const canSeeAny = hasAnyPerm(access.permissions, [
        'dashboard.view',
        'dashboard.employee_summary.view',
        'dashboard.production_summary.view',
        'dashboard.product_readiness.view',
        'dashboard.production_forecast.view',
      ]);
      if (!canSeeAny) {
        return res.status(403).json({ success: false, message: 'Forbidden: Missing dashboard summary permission.' });
      }

      const filters = parseDashboardFilters(req);
      const db = await resolveDb();
      const scopeCheck = await resolveScopeEntities(db, access, filters);
      if (!scopeCheck.allowed) {
        return res.status(403).json({ success: false, message: scopeCheck.denyMessage });
      }

      const policy = await loadActiveScoringPolicy(db);
      const canEmployeeSummary = hasAnyPerm(access.permissions, [
        'dashboard.employee_summary.view',
        'performance.view',
        'operations.performance.view',
      ]);
      const canProductionSummary = hasAnyPerm(access.permissions, [
        'dashboard.production_summary.view',
        'production.view',
        'operations.readiness.view',
      ]);
      const canReadiness = hasAnyPerm(access.permissions, [
        'dashboard.product_readiness.view',
        'operations.readiness.view',
      ]);
      const canForecast = hasAnyPerm(access.permissions, [
        'dashboard.production_forecast.view',
        'operations.forecasting.view',
        'reports.forecast.view',
      ]);

      const sections: Record<string, any> = {};

      if (canEmployeeSummary || canProductionSummary) {
        const [currentAnalytics, prevAnalytics] = await Promise.all([
          computeEmployeePerformanceAnalytics(
            db,
            policy,
            filters.dateRange.startDate,
            filters.dateRange.endDate,
            scopeCheck.scopedDepartmentId,
            scopeCheck.scopedEmployeeId,
            filters,
            access.department
          ),
          computeEmployeePerformanceAnalytics(
            db,
            policy,
            filters.dateRange.prevStartDate,
            filters.dateRange.prevEndDate,
            scopeCheck.scopedDepartmentId,
            scopeCheck.scopedEmployeeId,
            filters,
            access.department
          ),
        ]);

        if (canEmployeeSummary) {
          // Total active roster in authorized scope
          const rosterSql =
            access.scope === 'self'
              ? `SELECT COUNT(*)::int AS cnt FROM performance_employees WHERE id = $1 AND is_active = TRUE`
              : scopeCheck.scopedDepartmentId
              ? `SELECT COUNT(*)::int AS cnt FROM performance_employees WHERE department_id = $1 AND is_active = TRUE`
              : `SELECT COUNT(*)::int AS cnt FROM performance_employees WHERE is_active = TRUE`;
          const rosterParams =
            access.scope === 'self'
              ? [scopeCheck.scopedEmployeeId ?? -1]
              : scopeCheck.scopedDepartmentId
              ? [scopeCheck.scopedDepartmentId]
              : [];
          const rosterRes = await safeQuery(db, rosterSql, rosterParams);
          const totalActiveEmployees = Number(rosterRes.rows[0]?.cnt || 0);
          const topPerformer = currentAnalytics.employees[0] || null;
          const belowTargetCount = currentAnalytics.employees.filter((e) => e.actual_productivity_pct < 85).length;

          sections.employee_kpis = {
            period_label: filters.dateRange.label,
            total_active_employees: totalActiveEmployees,
            active_working_employees: currentAnalytics.totals.active_employees,
            avg_productivity_pct: currentAnalytics.totals.avg_productivity_pct,
            avg_productivity_delta_pct: pctDelta(
              currentAnalytics.totals.avg_productivity_pct,
              prevAnalytics.totals.avg_productivity_pct
            ),
            avg_quality_pct: currentAnalytics.totals.avg_quality_pct,
            avg_quality_delta_pct:
              currentAnalytics.totals.avg_quality_pct !== null && prevAnalytics.totals.avg_quality_pct !== null
                ? pctDelta(currentAnalytics.totals.avg_quality_pct, prevAnalytics.totals.avg_quality_pct)
                : null,
            top_performer: topPerformer
              ? {
                  employee_id: topPerformer.employee_id,
                  emp_id: topPerformer.emp_id,
                  name: topPerformer.employee_name,
                  final_score: topPerformer.final_score,
                  productivity_pct: topPerformer.actual_productivity_pct,
                }
              : null,
            employees_below_target: belowTargetCount,
            drilldown_route: '/operations-performance?tab=reports',
          };
        }

        if (canProductionSummary) {
          const t = currentAnalytics.totals;
          const pt = prevAnalytics.totals;
          const activeOrdersRes = await safeQuery(
            db,
            `SELECT COUNT(*)::int AS cnt FROM production_orders WHERE status NOT IN ('completed', 'cancelled', 'archived')`
          );
          const totalInspected = t.first_pass_accepted_qty + t.rejected_qty + t.rework_qty;
          const rejectionRatePct = totalInspected > 0 ? round2((t.rejected_qty / totalInspected) * 100) : null;
          const prevInspected = pt.first_pass_accepted_qty + pt.rejected_qty + pt.rework_qty;
          const prevRejectionRate = prevInspected > 0 ? round2((pt.rejected_qty / prevInspected) * 100) : null;

          sections.production_kpis = {
            period_label: filters.dateRange.label,
            active_production_orders: Number(activeOrdersRes.rows[0]?.cnt || 0),
            submitted_output_qty: t.submitted_qty,
            submitted_output_delta_pct: pctDelta(t.submitted_qty, pt.submitted_qty),
            accepted_output_qty: t.final_accepted_qty,
            accepted_output_delta_pct: pctDelta(t.final_accepted_qty, pt.final_accepted_qty),
            pending_quality_inspection_qty: t.pending_inspection_qty,
            rejected_qty: t.rejected_qty,
            rejection_rate_pct: rejectionRatePct,
            rejection_rate_delta_pct:
              rejectionRatePct !== null && prevRejectionRate !== null
                ? pctDelta(rejectionRatePct, prevRejectionRate)
                : null,
            rework_qty: t.rework_qty,
            drilldown_route: '/operations-performance?tab=quality',
          };
        }
      }

      if (canReadiness || canForecast) {
        const { readinessOrders, forecasts } = await computeOrdersReadinessAndForecast(db, filters);
        if (canReadiness) {
          const totalTarget = readinessOrders.reduce((s, o) => s + o.target_qty, 0);
          const totalReadySets = readinessOrders.reduce((s, o) => s + o.potential_assembly_ready_qty, 0);
          const totalAssembled = readinessOrders.reduce((s, o) => s + o.assembled_qty, 0);
          const totalAwaitingFinal = readinessOrders.reduce((s, o) => s + o.awaiting_final_inspection_qty, 0);
          const totalApprovedFinished = readinessOrders.reduce((s, o) => s + o.final_approved_finished_qty, 0);
          const readinessPct = totalTarget > 0 ? round2(Math.min(100, (totalApprovedFinished / totalTarget) * 100)) : 0;

          sections.finished_product_kpis = {
            period_label: filters.dateRange.label,
            orders_tracked: readinessOrders.length,
            target_finished_qty: round2(totalTarget),
            assembly_ready_sets_qty: round2(totalReadySets),
            assembled_qty: round2(totalAssembled),
            awaiting_final_inspection_qty: round2(totalAwaitingFinal),
            final_approved_finished_qty: round2(totalApprovedFinished),
            finished_product_readiness_pct: readinessPct,
            drilldown_route: '/operations-performance?tab=readiness',
          };
        }

        if (canForecast) {
          const dailyEst = forecasts.reduce((s, f) => s + f.forecast.expected_daily_finished_toys, 0);
          const weeklyEst = forecasts.reduce((s, f) => s + f.forecast.expected_weekly_finished_toys, 0);
          const monthlyEst = forecasts.reduce((s, f) => s + f.forecast.expected_monthly_finished_toys, 0);
          const bottlenecks = forecasts
            .map((f) => f.forecast.bottleneck_operation)
            .filter((b): b is string => Boolean(b));
          const additionalStaff = forecasts.reduce((s, f) => s + f.forecast.additional_employee_capacity_required, 0);
          const basis = forecasts.some((f) => f.forecast.basis === 'historical_and_standards')
            ? 'historical_and_standards'
            : 'standards_only_insufficient_history';

          sections.forecast_kpis = {
            is_estimate: true,
            basis,
            period_label: filters.dateRange.label,
            expected_daily_finished_qty: dailyEst,
            expected_weekly_finished_qty: weeklyEst,
            expected_monthly_finished_qty: monthlyEst,
            primary_bottleneck: bottlenecks[0] || null,
            bottleneck_count: bottlenecks.length,
            additional_staff_recommended: additionalStaff,
            drilldown_route: '/operations-performance?tab=forecasting',
          };
        }
      }

      res.json({
        success: true,
        data: {
          scope: access.scope,
          period: filters.dateRange,
          ...sections,
        },
      });
    } catch (err: any) {
      sendDashboardError(res, err, 'Failed to load dashboard summary metrics');
    }
  });

  // =========================================================================
  // 3. GET /api/dashboard/employee-performance — Fair standard-time charts + leaderboard
  // =========================================================================
  router.get('/employee-performance', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const access = resolveDashboardAccess(req);
      if (
        !hasAnyPerm(access.permissions, [
          'dashboard.employee_performance.view',
          'reports.employee_performance.view',
          'operations.performance.view',
          'performance.view',
        ])
      ) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: Missing permission to view employee performance analytics.',
        });
      }

      const filters = parseDashboardFilters(req);
      const db = await resolveDb();
      const scopeCheck = await resolveScopeEntities(db, access, filters);
      if (!scopeCheck.allowed) {
        return res.status(403).json({ success: false, message: scopeCheck.denyMessage });
      }

      const policy = await loadActiveScoringPolicy(db);
      const analytics = await computeEmployeePerformanceAnalytics(
        db,
        policy,
        filters.dateRange.startDate,
        filters.dateRange.endDate,
        scopeCheck.scopedDepartmentId,
        scopeCheck.scopedEmployeeId,
        filters,
        access.department
      );

      // Leaderboard sorting by reward category
      const rewardCategory = String(req.query.reward_category || 'overall_best_employee').toLowerCase();
      const ranked = [...analytics.employees];
      if (rewardCategory === 'best_quality_performer') {
        ranked.sort((a, b) => b.effective_quality_score - a.effective_quality_score || b.final_score - a.final_score);
      } else if (rewardCategory === 'most_consistent_employee') {
        ranked.sort((a, b) => b.consistency_pct - a.consistency_pct || b.final_score - a.final_score);
      } else if (rewardCategory === 'best_performer_operation') {
        ranked.sort((a, b) => b.actual_productivity_pct - a.actual_productivity_pct || b.effective_quality_score - a.effective_quality_score);
      } else {
        ranked.sort((a, b) => b.final_score - a.final_score || b.actual_productivity_pct - a.actual_productivity_pct);
      }

      const total = ranked.length;
      const offset = (filters.page - 1) * filters.limit;
      const pagedLeaderboard = ranked.slice(offset, offset + filters.limit).map((emp, idx) => ({
        rank: offset + idx + 1,
        employee_id: emp.employee_id,
        emp_id: emp.emp_id,
        employee_name: emp.employee_name,
        department: emp.department,
        role_name: emp.role_name,
        operations: emp.segments.map((s) => s.operation_name),
        standard_time_productivity_pct: emp.actual_productivity_pct,
        gross_productivity_pct: emp.gross_productivity_pct,
        accepted_productivity_pct: emp.accepted_productivity_pct,
        first_pass_quality_pct: emp.first_pass_quality_pct,
        final_acceptance_pct: emp.final_acceptance_pct,
        consistency_pct: emp.consistency_pct,
        final_score: emp.final_score,
        scoring_band: emp.scoring_band,
        submitted_qty: emp.total_submitted_qty,
        accepted_qty: emp.total_final_accepted_qty,
        expected_output: emp.total_expected_output,
        rejected_qty: emp.total_rejected_qty,
        rework_qty: emp.total_rework_qty,
        reward_eligible: emp.reward_eligible,
        eligibility_reasons: emp.eligibility_reasons,
      }));

      res.json({
        success: true,
        data: {
          scope: access.scope,
          period: filters.dateRange,
          fair_comparison_basis: 'standard_time_normalized_productivity_pct',
          scoring_policy: {
            policy_name: policy.policy_name,
            productivity_weight: policy.productivity_weight,
            quality_weight: policy.quality_weight,
            consistency_weight: policy.consistency_weight,
            max_productivity_score_cap: policy.max_productivity_score_cap,
          },
          totals: analytics.totals,
          charts: {
            productivity_comparison: ranked.slice(0, 15).map((e) => ({
              employee_id: e.employee_id,
              emp_id: e.emp_id,
              employee_name: e.employee_name,
              department: e.department,
              productivity_pct: e.actual_productivity_pct,
              quality_pct: e.effective_quality_score,
              final_score: e.final_score,
              target_pct: 100,
            })),
            productivity_trend: analytics.dailyTrends,
            operation_wise_ranking: analytics.operationRankings,
            productivity_vs_quality: ranked.slice(0, 25).map((e) => ({
              employee_id: e.employee_id,
              employee_name: e.employee_name,
              productivity_pct: e.actual_productivity_pct,
              quality_pct: e.effective_quality_score,
              final_score: e.final_score,
            })),
            target_vs_actual: ranked.slice(0, 15).map((e) => ({
              employee_id: e.employee_id,
              employee_name: e.employee_name,
              expected_output: e.total_expected_output,
              actual_accepted: e.total_final_accepted_qty,
              actual_submitted: e.total_submitted_qty,
            })),
          },
          leaderboard: pagedLeaderboard,
          reward_categories: REWARD_CATEGORIES,
          pagination: {
            page: filters.page,
            limit: filters.limit,
            total,
            total_pages: Math.max(1, Math.ceil(total / filters.limit)),
          },
        },
      });
    } catch (err: any) {
      sendDashboardError(res, err, 'Failed to load employee performance analytics');
    }
  });

  // =========================================================================
  // 4. GET /api/dashboard/production — Production analytics + Manufacturing Process Pipeline
  // =========================================================================
  router.get('/production', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const access = resolveDashboardAccess(req);
      if (
        !hasAnyPerm(access.permissions, [
          'dashboard.production_summary.view',
          'reports.production.view',
          'production.view',
          'operations.readiness.view',
        ])
      ) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: Missing permission to view production analytics.',
        });
      }

      const filters = parseDashboardFilters(req);
      const db = await resolveDb();
      const scopeCheck = await resolveScopeEntities(db, access, filters);
      if (!scopeCheck.allowed) {
        return res.status(403).json({ success: false, message: scopeCheck.denyMessage });
      }

      const { whereSql, params } = buildWorkLogFilterSql(
        filters.dateRange.startDate,
        filters.dateRange.endDate,
        scopeCheck.scopedDepartmentId,
        scopeCheck.scopedEmployeeId,
        filters,
        scopedDepartmentIdOrNull(scopeCheck.scopedDepartmentId, access.department),
        'l'
      );

      const [dailyRes, productRes, opRes, shiftRes, orderProgressRes] = await Promise.all([
        safeQuery(
          db,
          `SELECT l.work_date::text AS work_date,
                  SUM(COALESCE(l.submitted_qty, 0)) AS submitted_qty,
                  SUM(COALESCE(l.first_pass_accepted_qty, 0) + COALESCE(l.accepted_after_rework_qty, 0)) AS accepted_qty,
                  SUM(COALESCE(l.rejected_qty, 0)) AS rejected_qty,
                  SUM(COALESCE(l.rework_qty, 0)) AS rework_qty,
                  SUM(COALESCE(l.pending_inspection_qty, 0)) AS pending_qty
           FROM employee_operation_work_logs l
           INNER JOIN performance_employees pe ON pe.id = l.employee_id
           WHERE ${whereSql}
           GROUP BY l.work_date
           ORDER BY l.work_date ASC`,
          params
        ),
        safeQuery(
          db,
          `SELECT COALESCE(l.product_id, 0) AS product_id,
                  COALESCE(pr.name, 'Unassigned Product') AS product_name,
                  SUM(COALESCE(l.submitted_qty, 0)) AS submitted_qty,
                  SUM(COALESCE(l.first_pass_accepted_qty, 0) + COALESCE(l.accepted_after_rework_qty, 0)) AS accepted_qty,
                  SUM(COALESCE(l.rejected_qty, 0)) AS rejected_qty,
                  SUM(COALESCE(l.rework_qty, 0)) AS rework_qty
           FROM employee_operation_work_logs l
           INNER JOIN performance_employees pe ON pe.id = l.employee_id
           LEFT JOIN products pr ON pr.id = l.product_id
           WHERE ${whereSql}
           GROUP BY l.product_id, pr.name
           ORDER BY accepted_qty DESC`,
          params
        ),
        safeQuery(
          db,
          `SELECT l.operation_id,
                  COALESCE(op.operation_code, 'OP-' || l.operation_id) AS operation_code,
                  COALESCE(op.operation_name, 'Operation #' || l.operation_id) AS operation_name,
                  COUNT(DISTINCT l.employee_id)::int AS assigned_employees,
                  SUM(CASE WHEN COALESCE(l.standard_time_minutes_snapshot, 0) > 0
                      THEN (COALESCE(l.available_productive_minutes, 480) - COALESCE(l.approved_downtime_minutes, 0)) / l.standard_time_minutes_snapshot
                      ELSE 0 END) AS target_qty,
                  SUM(COALESCE(l.submitted_qty, 0)) AS submitted_qty,
                  SUM(COALESCE(l.first_pass_accepted_qty, 0) + COALESCE(l.accepted_after_rework_qty, 0)) AS approved_qty,
                  SUM(COALESCE(l.rejected_qty, 0)) AS rejected_qty,
                  SUM(COALESCE(l.pending_inspection_qty, 0)) AS pending_qty,
                  SUM(COALESCE(l.rework_qty, 0)) AS rework_qty
           FROM employee_operation_work_logs l
           INNER JOIN performance_employees pe ON pe.id = l.employee_id
           LEFT JOIN manufacturing_operations op ON op.id = l.operation_id
           WHERE ${whereSql}
           GROUP BY l.operation_id, op.operation_code, op.operation_name
           ORDER BY l.operation_id ASC`,
          params
        ),
        safeQuery(
          db,
          `SELECT COALESCE(l.shift_id, 0) AS shift_id,
                  COALESCE(s.shift_name, 'Unassigned Shift') AS shift_name,
                  SUM(COALESCE(l.submitted_qty, 0)) AS submitted_qty,
                  SUM(COALESCE(l.first_pass_accepted_qty, 0) + COALESCE(l.accepted_after_rework_qty, 0)) AS accepted_qty,
                  SUM(COALESCE(l.rejected_qty, 0)) AS rejected_qty
           FROM employee_operation_work_logs l
           INNER JOIN performance_employees pe ON pe.id = l.employee_id
           LEFT JOIN manufacturing_shifts s ON s.id = l.shift_id
           WHERE ${whereSql}
           GROUP BY l.shift_id, s.shift_name
           ORDER BY accepted_qty DESC`,
          params
        ),
        safeQuery(
          db,
          `SELECT po.id, po.order_number,
                  COALESCE(p.name, 'Product #' || po.product_id) AS product_name,
                  COALESCE(po.target_qty, po.planned_quantity, 0) AS target_qty,
                  po.status,
                  COALESCE((SELECT SUM(final_approved_qty) FROM finished_product_assemblies f WHERE f.production_order_id = po.id), 0) AS completed_qty
           FROM production_orders po
           LEFT JOIN products p ON p.id = po.product_id
           WHERE po.status NOT IN ('cancelled', 'archived')
           ORDER BY po.id DESC
           LIMIT 15`
        ),
      ]);

      const pipelineStages = opRes.rows.map((r: any) => {
        const target = round2(Number(r.target_qty || 0));
        const approved = round2(Number(r.approved_qty || 0));
        const submitted = round2(Number(r.submitted_qty || 0));
        const completionPct = target > 0 ? round2(Math.min(100, (approved / target) * 100)) : 0;
        return {
          operation_id: Number(r.operation_id),
          operation_code: String(r.operation_code),
          operation_name: String(r.operation_name),
          assigned_employees: Number(r.assigned_employees || 0),
          target_qty: target,
          submitted_qty: submitted,
          approved_qty: approved,
          rejected_qty: round2(Number(r.rejected_qty || 0)),
          pending_qty: round2(Number(r.pending_qty || 0)),
          rework_qty: round2(Number(r.rework_qty || 0)),
          completion_pct: completionPct,
        };
      });

      res.json({
        success: true,
        data: {
          scope: access.scope,
          period: filters.dateRange,
          daily_trend: dailyRes.rows.map((r: any) => ({
            work_date: String(r.work_date).slice(0, 10),
            submitted_qty: round2(Number(r.submitted_qty || 0)),
            accepted_qty: round2(Number(r.accepted_qty || 0)),
            rejected_qty: round2(Number(r.rejected_qty || 0)),
            rework_qty: round2(Number(r.rework_qty || 0)),
            pending_qty: round2(Number(r.pending_qty || 0)),
          })),
          product_wise: productRes.rows.map((r: any) => ({
            product_id: Number(r.product_id),
            product_name: String(r.product_name),
            submitted_qty: round2(Number(r.submitted_qty || 0)),
            accepted_qty: round2(Number(r.accepted_qty || 0)),
            rejected_qty: round2(Number(r.rejected_qty || 0)),
            rework_qty: round2(Number(r.rework_qty || 0)),
          })),
          operation_wise: pipelineStages,
          shift_wise: shiftRes.rows.map((r: any) => ({
            shift_id: Number(r.shift_id),
            shift_name: String(r.shift_name),
            submitted_qty: round2(Number(r.submitted_qty || 0)),
            accepted_qty: round2(Number(r.accepted_qty || 0)),
            rejected_qty: round2(Number(r.rejected_qty || 0)),
          })),
          order_progress: orderProgressRes.rows.map((o: any) => {
            const target = Number(o.target_qty || 0);
            const completed = Number(o.completed_qty || 0);
            return {
              id: Number(o.id),
              order_number: String(o.order_number),
              product_name: String(o.product_name),
              status: String(o.status),
              target_qty: round2(target),
              completed_qty: round2(completed),
              completion_pct: target > 0 ? round2(Math.min(100, (completed / target) * 100)) : 0,
            };
          }),
          process_pipeline: pipelineStages,
        },
      });
    } catch (err: any) {
      sendDashboardError(res, err, 'Failed to load production analytics');
    }
  });

  // =========================================================================
  // 5. GET /api/dashboard/quality — Quality analytics (zero double-counting)
  // =========================================================================
  router.get('/quality', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const access = resolveDashboardAccess(req);
      if (
        !hasAnyPerm(access.permissions, [
          'dashboard.quality_reports.view',
          'reports.quality.view',
          'operations.quality.view',
          'operations.quality.inspect',
        ])
      ) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: Missing permission to view quality analytics.',
        });
      }

      const filters = parseDashboardFilters(req);
      const db = await resolveDb();
      const scopeCheck = await resolveScopeEntities(db, access, filters);
      if (!scopeCheck.allowed) {
        return res.status(403).json({ success: false, message: scopeCheck.denyMessage });
      }

      const { whereSql, params } = buildWorkLogFilterSql(
        filters.dateRange.startDate,
        filters.dateRange.endDate,
        scopeCheck.scopedDepartmentId,
        scopeCheck.scopedEmployeeId,
        filters,
        scopedDepartmentIdOrNull(scopeCheck.scopedDepartmentId, access.department),
        'l'
      );

      const [totalsRes, opDefectsRes, empQualityRes, trendRes] = await Promise.all([
        safeQuery(
          db,
          `SELECT
             SUM(COALESCE(l.submitted_qty, 0)) AS submitted_qty,
             SUM(COALESCE(l.first_pass_accepted_qty, 0)) AS fp_accepted_qty,
             SUM(COALESCE(l.rejected_qty, 0)) AS rejected_qty,
             SUM(COALESCE(l.rework_qty, 0)) AS rework_qty,
             SUM(COALESCE(l.accepted_after_rework_qty, 0)) AS acc_after_rework_qty,
             SUM(COALESCE(l.pending_inspection_qty, 0)) AS pending_qty
           FROM employee_operation_work_logs l
           INNER JOIN performance_employees pe ON pe.id = l.employee_id
           WHERE ${whereSql}`,
          params
        ),
        safeQuery(
          db,
          `SELECT l.operation_id,
                  COALESCE(op.operation_name, 'Operation #' || l.operation_id) AS operation_name,
                  SUM(COALESCE(l.first_pass_accepted_qty, 0)) AS fp_accepted_qty,
                  SUM(COALESCE(l.rejected_qty, 0)) AS rejected_qty,
                  SUM(COALESCE(l.rework_qty, 0)) AS rework_qty,
                  SUM(COALESCE(l.accepted_after_rework_qty, 0)) AS acc_after_rework_qty
           FROM employee_operation_work_logs l
           INNER JOIN performance_employees pe ON pe.id = l.employee_id
           LEFT JOIN manufacturing_operations op ON op.id = l.operation_id
           WHERE ${whereSql}
           GROUP BY l.operation_id, op.operation_name
           ORDER BY rejected_qty DESC, rework_qty DESC`,
          params
        ),
        safeQuery(
          db,
          `SELECT l.employee_id,
                  pe.emp_id,
                  TRIM(COALESCE(pe.first_name, '') || ' ' || COALESCE(pe.last_name, '')) AS employee_name,
                  SUM(COALESCE(l.submitted_qty, 0)) AS submitted_qty,
                  SUM(COALESCE(l.first_pass_accepted_qty, 0)) AS fp_accepted_qty,
                  SUM(COALESCE(l.rejected_qty, 0)) AS rejected_qty,
                  SUM(COALESCE(l.rework_qty, 0)) AS rework_qty,
                  SUM(COALESCE(l.accepted_after_rework_qty, 0)) AS acc_after_rework_qty
           FROM employee_operation_work_logs l
           INNER JOIN performance_employees pe ON pe.id = l.employee_id
           WHERE ${whereSql}
           GROUP BY l.employee_id, pe.emp_id, pe.first_name, pe.last_name
           ORDER BY fp_accepted_qty DESC
           LIMIT 20`,
          params
        ),
        safeQuery(
          db,
          `SELECT l.work_date::text AS work_date,
                  SUM(COALESCE(l.first_pass_accepted_qty, 0)) AS fp_accepted_qty,
                  SUM(COALESCE(l.rejected_qty, 0)) AS rejected_qty,
                  SUM(COALESCE(l.rework_qty, 0)) AS rework_qty,
                  SUM(COALESCE(l.accepted_after_rework_qty, 0)) AS acc_after_rework_qty
           FROM employee_operation_work_logs l
           INNER JOIN performance_employees pe ON pe.id = l.employee_id
           WHERE ${whereSql}
           GROUP BY l.work_date
           ORDER BY l.work_date ASC`,
          params
        ),
      ]);

      const t = totalsRes.rows[0] || {};
      const fp = Number(t.fp_accepted_qty || 0);
      const rej = Number(t.rejected_qty || 0);
      const rw = Number(t.rework_qty || 0);
      const aar = Number(t.acc_after_rework_qty || 0);
      const inspected = fp + rej + rw;
      const summaryMetrics = calculateQualityMetrics({
        submitted_qty: Number(t.submitted_qty || 0),
        inspected_qty: inspected,
        first_pass_accepted_qty: fp,
        rejected_qty: rej,
        rework_qty: rw,
        accepted_after_rework_qty: aar,
        pending_inspection_qty: Number(t.pending_qty || 0),
      });

      res.json({
        success: true,
        data: {
          scope: access.scope,
          period: filters.dateRange,
          summary: {
            submitted_qty: summaryMetrics.submitted_qty,
            inspected_qty: summaryMetrics.inspected_qty,
            first_pass_accepted_qty: summaryMetrics.first_pass_accepted_qty,
            accepted_after_rework_qty: summaryMetrics.accepted_after_rework_qty,
            final_accepted_qty: summaryMetrics.final_accepted_qty,
            rejected_qty: summaryMetrics.rejected_qty,
            rework_qty: summaryMetrics.rework_qty,
            pending_inspection_qty: summaryMetrics.pending_inspection_qty,
            first_pass_quality_pct: summaryMetrics.first_pass_quality_pct,
            final_acceptance_pct: summaryMetrics.final_acceptance_pct,
          },
          operation_defects: opDefectsRes.rows.map((r: any) => {
            const rFp = Number(r.fp_accepted_qty || 0);
            const rRej = Number(r.rejected_qty || 0);
            const rRw = Number(r.rework_qty || 0);
            const rInsp = rFp + rRej + rRw;
            return {
              operation_id: Number(r.operation_id),
              operation_name: String(r.operation_name),
              first_pass_accepted_qty: round2(rFp),
              rejected_qty: round2(rRej),
              rework_qty: round2(rRw),
              first_pass_quality_pct: rInsp > 0 ? round2((rFp / rInsp) * 100) : null,
            };
          }),
          employee_quality: empQualityRes.rows.map((r: any) => {
            const rFp = Number(r.fp_accepted_qty || 0);
            const rRej = Number(r.rejected_qty || 0);
            const rRw = Number(r.rework_qty || 0);
            const rAar = Number(r.acc_after_rework_qty || 0);
            const rInsp = rFp + rRej + rRw;
            return {
              employee_id: Number(r.employee_id),
              emp_id: String(r.emp_id),
              employee_name: String(r.employee_name || r.emp_id),
              first_pass_accepted_qty: round2(rFp),
              final_accepted_qty: round2(rFp + rAar),
              rejected_qty: round2(rRej),
              rework_qty: round2(rRw),
              first_pass_quality_pct: rInsp > 0 ? round2((rFp / rInsp) * 100) : null,
              final_acceptance_pct: rInsp > 0 ? round2(((rFp + rAar) / rInsp) * 100) : null,
            };
          }),
          quality_trend: trendRes.rows.map((r: any) => {
            const rFp = Number(r.fp_accepted_qty || 0);
            const rRej = Number(r.rejected_qty || 0);
            const rRw = Number(r.rework_qty || 0);
            const rAar = Number(r.acc_after_rework_qty || 0);
            const rInsp = rFp + rRej + rRw;
            return {
              work_date: String(r.work_date).slice(0, 10),
              first_pass_quality_pct: rInsp > 0 ? round2((rFp / rInsp) * 100) : null,
              final_acceptance_pct: rInsp > 0 ? round2(((rFp + rAar) / rInsp) * 100) : null,
              rework_qty: round2(rRw),
              rejected_qty: round2(rRej),
            };
          }),
        },
      });
    } catch (err: any) {
      sendDashboardError(res, err, 'Failed to load quality analytics');
    }
  });

  // =========================================================================
  // 6. GET /api/dashboard/product-readiness — Component vs Assembly vs Finished Toys
  // =========================================================================
  router.get('/product-readiness', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const access = resolveDashboardAccess(req);
      if (
        !hasAnyPerm(access.permissions, [
          'dashboard.product_readiness.view',
          'operations.readiness.view',
          'readiness.view',
        ])
      ) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: Missing permission to view product readiness.',
        });
      }

      const filters = parseDashboardFilters(req);
      const db = await resolveDb();
      const { readinessOrders } = await computeOrdersReadinessAndForecast(db, filters);

      res.json({
        success: true,
        data: {
          scope: access.scope,
          orders: readinessOrders,
        },
      });
    } catch (err: any) {
      sendDashboardError(res, err, 'Failed to load product readiness data');
    }
  });

  // =========================================================================
  // 7. GET /api/dashboard/forecast — Bottleneck-constrained forecasts (clearly labeled Estimate)
  // =========================================================================
  router.get('/forecast', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const access = resolveDashboardAccess(req);
      if (
        !hasAnyPerm(access.permissions, [
          'dashboard.production_forecast.view',
          'reports.forecast.view',
          'operations.forecasting.view',
        ])
      ) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: Missing permission to view production forecasts.',
        });
      }

      const filters = parseDashboardFilters(req);
      const db = await resolveDb();
      const { forecasts } = await computeOrdersReadinessAndForecast(db, filters);

      res.json({
        success: true,
        data: {
          scope: access.scope,
          is_estimate: true,
          forecasts,
        },
      });
    } catch (err: any) {
      sendDashboardError(res, err, 'Failed to load production forecasts');
    }
  });

  // =========================================================================
  // 8. NOTIFICATIONS CENTRE — Real operational alerts, persisted read/unread per user
  // =========================================================================
  router.get('/notifications', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const access = resolveDashboardAccess(req);
      if (!hasAnyPerm(access.permissions, ['dashboard.notifications.view', 'dashboard.view'])) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: Missing permission to view dashboard notifications.',
        });
      }

      const db = await resolveDb();
      const scopeCheck = await resolveScopeEntities(db, access, parseDashboardFilters(req));

      // Sync live operational conditions into dashboard_notifications (real records only)
      await syncOperationalNotifications(db);

      const notifRes = await safeQuery(
        db,
        `SELECT n.id, n.source_key, n.event_type, n.severity, n.title, n.message,
                n.required_permission, n.department_id, n.employee_id, n.target_route,
                n.created_at,
                (r.read_at IS NOT NULL) AS is_read,
                r.read_at
         FROM dashboard_notifications n
         LEFT JOIN dashboard_notification_reads r
           ON r.notification_id = n.id AND r.user_id = $1
         WHERE n.is_active = TRUE
         ORDER BY n.created_at DESC, n.id DESC
         LIMIT 50`,
        [access.userId]
      );

      // Strict permission & scope filtering
      const authorized = notifRes.rows.filter((n: any) => {
        if (n.required_permission && !hasAnyPerm(access.permissions, [String(n.required_permission)])) {
          return false;
        }
        if (access.scope === 'department' && n.department_id && scopeCheck.scopedDepartmentId) {
          if (Number(n.department_id) !== scopeCheck.scopedDepartmentId) return false;
        }
        if (access.scope === 'self') {
          if (n.employee_id && Number(n.employee_id) !== scopeCheck.scopedEmployeeId) return false;
          if (!n.employee_id && n.department_id) return false;
        }
        return true;
      });

      const unreadCount = authorized.filter((n: any) => !n.is_read).length;

      res.json({
        success: true,
        data: {
          unread_count: unreadCount,
          notifications: authorized.map((n: any) => ({
            id: Number(n.id),
            event_type: n.event_type,
            severity: n.severity,
            title: n.title,
            message: n.message,
            target_route: n.target_route || null,
            created_at: n.created_at,
            is_read: Boolean(n.is_read),
            read_at: n.read_at || null,
          })),
        },
      });
    } catch (err: any) {
      sendDashboardError(res, err, 'Failed to load dashboard notifications');
    }
  });

  router.post('/notifications/:id/read', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const access = resolveDashboardAccess(req);
      if (!hasAnyPerm(access.permissions, ['dashboard.notifications.view', 'dashboard.view'])) {
        return res.status(403).json({ success: false, message: 'Forbidden: Missing notifications permission.' });
      }
      const notifId = parsePositiveInt(req.params.id);
      if (!notifId) {
        return res.status(400).json({ success: false, message: 'Invalid notification ID.' });
      }
      const db = await resolveDb();
      const existsRes = await safeQuery(db, `SELECT id FROM dashboard_notifications WHERE id = $1 LIMIT 1`, [notifId]);
      if (existsRes.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Notification not found.' });
      }
      await safeQuery(
        db,
        `INSERT INTO dashboard_notification_reads (notification_id, user_id, read_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (notification_id, user_id) DO UPDATE SET read_at = NOW()`,
        [notifId, access.userId]
      );
      res.json({ success: true, message: 'Notification marked as read.', data: { id: notifId, is_read: true } });
    } catch (err: any) {
      sendDashboardError(res, err, 'Failed to mark notification as read');
    }
  });

  router.post('/notifications/read-all', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const access = resolveDashboardAccess(req);
      if (!hasAnyPerm(access.permissions, ['dashboard.notifications.view', 'dashboard.view'])) {
        return res.status(403).json({ success: false, message: 'Forbidden: Missing notifications permission.' });
      }
      const db = await resolveDb();
      const activeRes = await safeQuery(db, `SELECT id FROM dashboard_notifications WHERE is_active = TRUE`);
      let marked = 0;
      for (const row of activeRes.rows) {
        await safeQuery(
          db,
          `INSERT INTO dashboard_notification_reads (notification_id, user_id, read_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (notification_id, user_id) DO NOTHING`,
          [Number(row.id), access.userId]
        );
        marked++;
      }
      res.json({ success: true, message: 'All notifications marked as read.', data: { marked_count: marked } });
    } catch (err: any) {
      sendDashboardError(res, err, 'Failed to mark notifications as read');
    }
  });

  // =========================================================================
  // 9. GET /api/dashboard/recent-activity — Scoped authorized operational events
  // =========================================================================
  router.get('/recent-activity', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const access = resolveDashboardAccess(req);
      if (!hasAnyPerm(access.permissions, ['dashboard.recent_activity.view', 'dashboard.view'])) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: Missing permission to view recent activity.',
        });
      }

      const db = await resolveDb();
      const mfgLogsRes = await safeQuery(
        db,
        `SELECT id, entity_type, action, actor_email, details, created_at
         FROM manufacturing_audit_logs
         ORDER BY created_at DESC, id DESC
         LIMIT 20`
      );

      let activities = mfgLogsRes.rows.map((r: any) => ({
        id: `mfg-${r.id}`,
        module: r.entity_type || 'Operations',
        action: r.action,
        actor: r.actor_email || 'System',
        details: typeof r.details === 'string' ? r.details : JSON.stringify(r.details || {}),
        timestamp: r.created_at,
      }));

      // Scope filter for self users
      if (access.scope === 'self') {
        activities = activities.filter((a) => String(a.actor).toLowerCase() === access.email.toLowerCase());
      }

      // Include store audit logs if authorized and no PG mfg logs yet
      if (activities.length === 0) {
        const auditLogs = store.getAuditTrail({});
        const filteredAudit =
          access.scope === 'company'
            ? auditLogs
            : auditLogs.filter((a) => String(a.user_email || '').toLowerCase() === access.email.toLowerCase());
        activities = filteredAudit.slice(0, 12).map((a) => ({
          id: `audit-${a.id}`,
          module: a.module,
          action: a.action,
          actor: a.user_email,
          details: a.details,
          timestamp: a.timestamp,
        }));
      }

      res.json({
        success: true,
        data: activities,
      });
    } catch (err: any) {
      sendDashboardError(res, err, 'Failed to load recent activity');
    }
  });

  // =========================================================================
  // 10. GET /api/dashboard/export — Separate Excel & PDF permission enforcement
  // =========================================================================
  router.get('/export', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const access = resolveDashboardAccess(req);
      const format = String(req.query.format || 'xlsx').toLowerCase();
      if (format !== 'xlsx' && format !== 'pdf') {
        return res.status(400).json({ success: false, message: 'Invalid export format. Supported formats: xlsx, pdf.' });
      }

      // Strictly separate Excel and PDF export permissions
      if (format === 'xlsx') {
        if (!hasAnyPerm(access.permissions, ['reports.export.excel', 'operations.reports.export'])) {
          return res.status(403).json({
            success: false,
            message: 'Forbidden: Missing Excel export permission [reports.export.excel].',
          });
        }
      } else {
        if (!hasAnyPerm(access.permissions, ['reports.export.pdf', 'operations.reports.export'])) {
          return res.status(403).json({
            success: false,
            message: 'Forbidden: Missing PDF export permission [reports.export.pdf].',
          });
        }
      }

      const filters = parseDashboardFilters(req);
      const db = await resolveDb();
      const scopeCheck = await resolveScopeEntities(db, access, filters);
      if (!scopeCheck.allowed) {
        return res.status(403).json({ success: false, message: scopeCheck.denyMessage });
      }

      const policy = await loadActiveScoringPolicy(db);
      const analytics = await computeEmployeePerformanceAnalytics(
        db,
        policy,
        filters.dateRange.startDate,
        filters.dateRange.endDate,
        scopeCheck.scopedDepartmentId,
        scopeCheck.scopedEmployeeId,
        filters,
        access.department
      );

      const dateTag = new Date().toISOString().slice(0, 10);

      if (format === 'xlsx') {
        const sheetRows = analytics.employees.map((e, idx) => ({
          Rank: idx + 1,
          'Employee ID': e.emp_id,
          'Employee Name': e.employee_name,
          Department: e.department,
          'Standard-Time Productivity (%)': e.actual_productivity_pct,
          'First-Pass Quality (%)': e.first_pass_quality_pct ?? 'N/A',
          'Consistency (%)': e.consistency_pct,
          'Final Score': e.final_score,
          Band: e.scoring_band,
          'Submitted Qty': e.total_submitted_qty,
          'Accepted Qty': e.total_final_accepted_qty,
          'Rejected Qty': e.total_rejected_qty,
          'Rework Qty': e.total_rework_qty,
          'Reward Eligible': e.reward_eligible ? 'Yes' : 'No',
        }));

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(
          sheetRows.length > 0
            ? sheetRows
            : [{ Notice: 'No employee performance records available for the selected filters.' }]
        );
        XLSX.utils.book_append_sheet(wb, ws, 'Dashboard Report');
        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="Nexora_Dashboard_${dateTag}.xlsx"`);
        return res.send(buf);
      }

      // PDF Export
      const headers = ['Rank', 'Emp ID', 'Employee', 'Dept', 'Prod%', 'Qual%', 'Score', 'Band'];
      const pdfRows =
        analytics.employees.length > 0
          ? analytics.employees.map((e, idx) => [
              String(idx + 1),
              e.emp_id,
              e.employee_name.slice(0, 18),
              e.department.slice(0, 14),
              `${e.actual_productivity_pct}%`,
              e.first_pass_quality_pct !== null ? `${e.first_pass_quality_pct}%` : 'N/A',
              String(e.final_score),
              e.scoring_band,
            ])
          : [['-', '-', 'No data available for selected period', '-', '-', '-', '-', '-']];

      const pdfBuf = buildSimplePdfBuffer(
        'NEXORA ERP - Role-Based Manufacturing Dashboard Report',
        `Period: ${filters.dateRange.startDate} to ${filters.dateRange.endDate} | Scope: ${access.scope.toUpperCase()} | Generated: ${dateTag}`,
        headers,
        pdfRows
      );
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="Nexora_Dashboard_${dateTag}.pdf"`);
      return res.send(pdfBuf);
    } catch (err: any) {
      sendDashboardError(res, err, 'Failed to export dashboard report');
    }
  });

  return router;
}

function scopedDepartmentIdOrNull(scopedDepartmentId: number | null, accessDepartment: string | null): string | null {
  return scopedDepartmentId ? null : accessDepartment;
}
