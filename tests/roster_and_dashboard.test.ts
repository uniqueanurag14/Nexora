/**
 * NEXORA ERP — Automated Verification Suite (Tests A–F)
 * Covers:
 *  - Test A: Performance Roster API (POST/GET/PUT, validation, duplicate hardware, savepoint safety, RBAC, dept scope, pagination)
 *  - Test B: Role-Based Dashboard across 6 Personas (Super Admin, Admin/Mgmt, Production Mgr, Dept Supervisor, QC Inspector, Employee)
 *  - Test C: Charts, Filters, Empty States, Separate Excel & PDF Export Permissions
 *  - Test D: Dynamic Notifications Centre (real operational triggers, read/unread, mark-all-read, permission & scope isolation)
 *  - Test E: Fair Standard-Time Productivity, Zero-Double-Count Quality, Component vs Finished Readiness, Bottleneck Forecast
 *  - Test F: Scalability (500 employees, server-side pagination, concurrent requests, zero cross-department leakage)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import express, { Request, Response, NextFunction } from 'express';
import http from 'node:http';
import performanceRouter, { setPerformanceDbProvider } from '../server/performanceRoutes';
import { createDashboardRouter } from '../server/dashboardRoutes';
import { store } from '../server/store';
import type { DbPoolHandle, DbClientLike } from '../server/db';

interface MockDbState {
  departments: Array<{ id: number; code: string; name: string; is_active: boolean; status: string }>;
  roles: Array<{ id: number; code: string; name: string; is_active: boolean }>;
  performance_employees: Array<any>;
  employee_performance_events: Array<any>;
  manufacturing_operations: Array<any>;
  products: Array<any>;
  production_orders: Array<any>;
  product_operation_mappings: Array<any>;
  production_order_operation_wip: Array<any>;
  finished_product_assemblies: Array<any>;
  employee_operation_assignments: Array<any>;
  manufacturing_shifts: Array<any>;
  employee_operation_work_logs: Array<any>;
  employee_reward_nominations: Array<any>;
  performance_scoring_policies: Array<any>;
  dashboard_notifications: Array<any>;
  dashboard_notification_reads: Array<{ notification_id: number; user_id: number; read_at: string }>;
  manufacturing_audit_logs: Array<any>;
  simulateMissingUsersEmpIdColumn?: boolean;
  simulateDbFailure?: boolean;
}

function createEmptyDbState(): MockDbState {
  return {
    departments: [],
    roles: [],
    performance_employees: [],
    employee_performance_events: [],
    manufacturing_operations: [],
    products: [],
    production_orders: [],
    product_operation_mappings: [],
    production_order_operation_wip: [],
    finished_product_assemblies: [],
    employee_operation_assignments: [],
    manufacturing_shifts: [],
    employee_operation_work_logs: [],
    employee_reward_nominations: [],
    performance_scoring_policies: [],
    dashboard_notifications: [],
    dashboard_notification_reads: [],
    manufacturing_audit_logs: [],
  };
}

function createMockPgPool(state: MockDbState): DbPoolHandle {
  let nextEmpId = 100;
  let nextNotifId = 1;

  const execQuery = async (rawSql: string, params: any[] = []): Promise<{ rows: any[]; rowCount: number }> => {
    const sql = rawSql.replace(/\s+/g, ' ').trim();
    const upper = sql.toUpperCase();

    if (state.simulateDbFailure && !upper.startsWith('ROLLBACK')) {
      const err: any = new Error('connect ECONNREFUSED 127.0.0.1:5432 secret_password_never_leak');
      err.code = 'ECONNREFUSED';
      throw err;
    }

    if (
      upper === 'BEGIN' ||
      upper === 'COMMIT' ||
      upper === 'ROLLBACK' ||
      upper.startsWith('SAVEPOINT ') ||
      upper.startsWith('RELEASE SAVEPOINT ') ||
      upper.startsWith('ROLLBACK TO SAVEPOINT ') ||
      upper.startsWith('SELECT PG_ADVISORY_XACT_LOCK')
    ) {
      return { rows: [], rowCount: 0 };
    }

    // Simulate missing users.employee_id column (tests SAVEPOINT resilience)
    if (upper.includes('FROM USERS') && upper.includes('EMPLOYEE_ID')) {
      if (state.simulateMissingUsersEmpIdColumn) {
        const err: any = new Error('column "employee_id" does not exist');
        err.code = '42703';
        throw err;
      }
      return { rows: [], rowCount: 0 };
    }

    // Departments
    if (upper.includes('FROM DEPARTMENTS')) {
      let rows = [...state.departments];
      if (upper.includes('IS_ACTIVE = TRUE') || upper.includes("COALESCE(IS_ACTIVE, TRUE) = TRUE")) {
        rows = rows.filter((d) => d.is_active);
      }
      if (upper.includes('WHERE ID = $1') || upper.includes('ID = $1 AND')) {
        rows = rows.filter((d) => d.id === Number(params[0]));
      } else if (upper.includes('LOWER(TRIM(NAME)) = LOWER(TRIM($1))')) {
        rows = rows.filter((d) => d.name.trim().toLowerCase() === String(params[0]).trim().toLowerCase());
      } else if (upper.includes('UPPER(CODE) = UPPER($1)')) {
        rows = rows.filter(
          (d) =>
            d.code.toUpperCase() === String(params[0]).toUpperCase() ||
            d.name.trim().toLowerCase() === String(params[1] || '').trim().toLowerCase()
        );
      }
      return { rows, rowCount: rows.length };
    }

    if (upper.startsWith('INSERT INTO DEPARTMENTS')) {
      const id = Number(params[0]);
      const existing = state.departments.find((d) => d.id === id);
      if (!existing) {
        state.departments.push({
          id,
          code: String(params[1]),
          name: String(params[2]),
          is_active: true,
          status: 'active',
        });
      }
      return { rows: [], rowCount: 1 };
    }

    // Roles
    if (upper.includes('FROM ROLES')) {
      let rows = [...state.roles];
      if (upper.includes('IS_ACTIVE = TRUE')) rows = rows.filter((r) => r.is_active);
      if (upper.includes('WHERE ID = $1')) rows = rows.filter((r) => r.id === Number(params[0]));
      if (upper.includes('LOWER(CODE) = LOWER($1)')) {
        rows = rows.filter(
          (r) =>
            r.code.toLowerCase() === String(params[0]).toLowerCase() ||
            r.name.trim().toLowerCase() === String(params[1] || '').trim().toLowerCase()
        );
      }
      return { rows, rowCount: rows.length };
    }

    if (upper.startsWith('INSERT INTO ROLES')) {
      const id = Number(params[0]);
      if (!state.roles.find((r) => r.id === id)) {
        state.roles.push({ id, code: String(params[1]), name: String(params[2]), is_active: true });
      }
      return { rows: [], rowCount: 1 };
    }

    // Performance employees
    if (upper.startsWith('INSERT INTO PERFORMANCE_EMPLOYEES')) {
      const rec = {
        id: ++nextEmpId,
        emp_id: params[0],
        first_name: params[1],
        last_name: params[2],
        hardware_id: params[3],
        employee_type: params[4],
        department_id: params[5],
        department: params[6],
        role_id: params[7],
        designation: params[8],
        created_by: params[9],
        login_enabled: false,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      state.performance_employees.push(rec);
      return { rows: [rec], rowCount: 1 };
    }

    if (upper.startsWith('UPDATE PERFORMANCE_EMPLOYEES')) {
      const targetId = Number(params[9]);
      const rec = state.performance_employees.find((e) => e.id === targetId);
      if (!rec) return { rows: [], rowCount: 0 };
      rec.first_name = params[0];
      rec.last_name = params[1];
      rec.hardware_id = params[2];
      rec.employee_type = params[3];
      rec.department_id = params[4];
      rec.department = params[5];
      rec.role_id = params[6];
      rec.designation = params[7];
      rec.is_active = params[8];
      rec.updated_at = new Date().toISOString();
      return { rows: [rec], rowCount: 1 };
    }

    if (upper.includes('FROM PERFORMANCE_EMPLOYEES')) {
      let rows = [...state.performance_employees];
      if (upper.includes('COUNT(*)::INT AS CNT')) {
        if (upper.includes('WHERE ID = $1')) rows = rows.filter((e) => e.id === Number(params[0]) && e.is_active);
        else if (upper.includes('DEPARTMENT_ID = $1'))
          rows = rows.filter((e) => e.department_id === Number(params[0]) && e.is_active);
        else if (upper.includes('IS_ACTIVE = TRUE')) rows = rows.filter((e) => e.is_active);
        return { rows: [{ cnt: rows.length }], rowCount: 1 };
      }
      if (upper.includes('UPPER(TRIM(HARDWARE_ID)) = UPPER($1)')) {
        rows = rows.filter(
          (e) =>
            e.is_active &&
            String(e.hardware_id || '').trim().toUpperCase() === String(params[0]).trim().toUpperCase() &&
            (params[1] ? e.id !== Number(params[1]) : true)
        );
        return { rows, rowCount: rows.length };
      }
      if (upper.includes('WHERE ID = $1 OR EMP_ID = $2')) {
        rows = rows.filter((e) => e.id === Number(params[0]) || e.emp_id === String(params[1]));
        return { rows, rowCount: rows.length };
      }
      if (upper.includes('UPPER(TRIM(EMP_ID)) = UPPER(TRIM($1))')) {
        rows = rows.filter((e) => String(e.emp_id || '').trim().toUpperCase() === String(params[0]).trim().toUpperCase());
        return { rows, rowCount: rows.length };
      }
      if (upper.includes('WHERE ID = $1')) {
        rows = rows.filter((e) => e.id === Number(params[0]));
        return { rows, rowCount: rows.length };
      }
      if (upper.includes('DEPARTMENT_ID = $1') && !upper.includes('WHERE 1=1')) {
        rows = rows.filter((e) => e.department_id === Number(params[0]) && e.is_active);
        return { rows, rowCount: rows.length };
      }
      // Roster list query with dynamic WHERE 1=1 filters
      let pIdx = 0;
      if (upper.includes("LOWER(COALESCE(D.NAME, P.DEPARTMENT, '')) = LOWER($")) {
        const deptName = String(params[pIdx++]).toLowerCase();
        rows = rows.filter((e) => String(e.department || '').toLowerCase() === deptName);
      } else if (upper.includes('P.DEPARTMENT_ID = $')) {
        const deptId = Number(params[pIdx++]);
        rows = rows.filter((e) => Number(e.department_id) === deptId);
      }
      if (upper.includes('P.IS_ACTIVE = $')) {
        const act = Boolean(params[pIdx++]);
        rows = rows.filter((e) => Boolean(e.is_active) === act);
      }
      const enriched = rows.map((e) => {
        const d = state.departments.find((x) => x.id === e.department_id);
        const r = state.roles.find((x) => x.id === e.role_id);
        return {
          ...e,
          department_name: d?.name || e.department,
          department_code: d?.code || '',
          role_name: r?.name || e.designation,
          role_code: r?.code || '',
        };
      });
      return { rows: enriched, rowCount: enriched.length };
    }

    if (upper.includes('FROM EMPLOYEE_PERFORMANCE_EVENTS')) {
      return { rows: [], rowCount: 0 };
    }

    if (upper.includes('FROM PERFORMANCE_SCORING_POLICIES')) {
      return { rows: state.performance_scoring_policies, rowCount: state.performance_scoring_policies.length };
    }

    if (upper.includes('FROM MANUFACTURING_OPERATIONS')) {
      return { rows: state.manufacturing_operations, rowCount: state.manufacturing_operations.length };
    }

    if (upper.includes('FROM PRODUCTS')) {
      return { rows: state.products, rowCount: state.products.length };
    }

    if (upper.includes('FROM MANUFACTURING_SHIFTS')) {
      return { rows: state.manufacturing_shifts, rowCount: state.manufacturing_shifts.length };
    }

    // Work logs (supports employee performance, production, quality, and notification sync queries)
    if (upper.includes('FROM EMPLOYEE_OPERATION_WORK_LOGS')) {
      // Pending QC notification query
      if (upper.includes('HAVING SUM(COALESCE(L.PENDING_INSPECTION_QTY, 0)) > 0')) {
        const byDept = new Map<number, { department_id: number; department_name: string; pending_qty: number }>();
        for (const l of state.employee_operation_work_logs) {
          if (Number(l.pending_inspection_qty || 0) > 0) {
            const did = Number(l.department_id || 0);
            const deptName = state.departments.find((d) => d.id === did)?.name || 'General';
            const cur = byDept.get(did) || { department_id: did, department_name: deptName, pending_qty: 0 };
            cur.pending_qty += Number(l.pending_inspection_qty || 0);
            byDept.set(did, cur);
          }
        }
        const rows = Array.from(byDept.values());
        return { rows, rowCount: rows.length };
      }

      // High defect rate notification query
      if (upper.includes('> 0.10')) {
        const byOp = new Map<string, any>();
        for (const l of state.employee_operation_work_logs) {
          const key = `${l.operation_id}:${l.department_id || 0}`;
          const opName = state.manufacturing_operations.find((o) => o.id === l.operation_id)?.operation_name || `Op #${l.operation_id}`;
          const cur = byOp.get(key) || {
            operation_id: l.operation_id,
            operation_name: opName,
            department_id: l.department_id || null,
            defect_qty: 0,
            inspected_qty: 0,
          };
          cur.defect_qty += Number(l.rejected_qty || 0) + Number(l.rework_qty || 0);
          cur.inspected_qty += Number(l.first_pass_accepted_qty || 0) + Number(l.rejected_qty || 0) + Number(l.rework_qty || 0);
          byOp.set(key, cur);
        }
        const rows = Array.from(byOp.values()).filter((x) => x.inspected_qty > 0 && x.defect_qty / x.inspected_qty > 0.1);
        return { rows, rowCount: rows.length };
      }

      // Historical forecast efficiency query
      if (upper.includes('WHERE PRODUCT_ID = $1') && upper.includes('GROUP BY OPERATION_ID')) {
        const prodId = Number(params[0]);
        const filtered = state.employee_operation_work_logs.filter((l) => l.product_id === prodId);
        const byOp = new Map<number, any>();
        for (const l of filtered) {
          const cur = byOp.get(l.operation_id) || { operation_id: l.operation_id, acc_qty: 0, sub_qty: 0, insp_qty: 0, avail_min: 0, earned_min: 0 };
          const acc = Number(l.first_pass_accepted_qty || 0) + Number(l.accepted_after_rework_qty || 0);
          cur.acc_qty += acc;
          cur.sub_qty += Number(l.submitted_qty || 0);
          cur.insp_qty += Number(l.first_pass_accepted_qty || 0) + Number(l.rejected_qty || 0) + Number(l.rework_qty || 0);
          cur.avail_min += Number(l.available_productive_minutes || 0) - Number(l.approved_downtime_minutes || 0);
          cur.earned_min += acc * Number(l.standard_time_minutes_snapshot || 1);
          byOp.set(l.operation_id, cur);
        }
        const rows = Array.from(byOp.values());
        return { rows, rowCount: rows.length };
      }

      // Filter work logs by date range + dynamic clauses
      let rows = state.employee_operation_work_logs.map((l) => {
        const pe = state.performance_employees.find((e) => e.id === l.employee_id) || {};
        const d = state.departments.find((x) => x.id === (l.department_id || pe.department_id));
        const op = state.manufacturing_operations.find((x) => x.id === l.operation_id);
        const pr = state.products.find((x) => x.id === l.product_id);
        const sh = state.manufacturing_shifts.find((x) => x.id === l.shift_id);
        return {
          ...l,
          emp_id: pe.emp_id,
          first_name: pe.first_name,
          last_name: pe.last_name,
          employee_name: `${pe.first_name || ''} ${pe.last_name || ''}`.trim(),
          department_id: l.department_id || pe.department_id || null,
          department_name: d?.name || pe.department || '',
          role_name: pe.designation || '',
          operation_code: op?.operation_code || `OP-${l.operation_id}`,
          operation_name: op?.operation_name || `Op #${l.operation_id}`,
          uom: op?.uom || 'pcs',
          product_name: pr?.name || 'Unassigned Product',
          shift_name: sh?.shift_name || 'Day Shift',
        };
      });

      const startDate = String(params[0] || '1970-01-01');
      const endDate = String(params[1] || '2999-12-31');
      rows = rows.filter((r) => r.work_date >= startDate && r.work_date <= endDate);

      let pIdx = 2;
      if (upper.includes('L.EMPLOYEE_ID = $')) {
        const eid = Number(params[pIdx++]);
        rows = rows.filter((r) => r.employee_id === eid);
      }
      if (upper.includes('COALESCE(L.DEPARTMENT_ID, PE.DEPARTMENT_ID) = $')) {
        const did = Number(params[pIdx++]);
        rows = rows.filter((r) => Number(r.department_id) === did);
      } else if (upper.includes("LOWER(COALESCE(PE.DEPARTMENT, '')) = LOWER($")) {
        const dname = String(params[pIdx++]).toLowerCase();
        rows = rows.filter((r) => String(r.department_name || '').toLowerCase() === dname);
      }
      if (upper.includes('L.OPERATION_ID = $')) {
        const oid = Number(params[pIdx++]);
        rows = rows.filter((r) => r.operation_id === oid);
      }
      if (upper.includes('L.PRODUCT_ID = $')) {
        const pid = Number(params[pIdx++]);
        rows = rows.filter((r) => r.product_id === pid);
      }
      if (upper.includes('L.PRODUCTION_ORDER_ID = $')) {
        const poid = Number(params[pIdx++]);
        rows = rows.filter((r) => r.production_order_id === poid);
      }
      if (upper.includes('L.SHIFT_ID = $')) {
        const sid = Number(params[pIdx++]);
        rows = rows.filter((r) => r.shift_id === sid);
      }

      // Grouped aggregations for production & quality endpoints
      if (upper.includes('GROUP BY L.WORK_DATE') && upper.includes('FP_ACCEPTED_QTY')) {
        const m = new Map<string, any>();
        for (const r of rows) {
          const cur = m.get(r.work_date) || { work_date: r.work_date, fp_accepted_qty: 0, rejected_qty: 0, rework_qty: 0, acc_after_rework_qty: 0 };
          cur.fp_accepted_qty += Number(r.first_pass_accepted_qty || 0);
          cur.rejected_qty += Number(r.rejected_qty || 0);
          cur.rework_qty += Number(r.rework_qty || 0);
          cur.acc_after_rework_qty += Number(r.accepted_after_rework_qty || 0);
          m.set(r.work_date, cur);
        }
        const out = Array.from(m.values());
        return { rows: out, rowCount: out.length };
      }

      if (upper.includes('GROUP BY L.WORK_DATE')) {
        const m = new Map<string, any>();
        for (const r of rows) {
          const cur = m.get(r.work_date) || { work_date: r.work_date, submitted_qty: 0, accepted_qty: 0, rejected_qty: 0, rework_qty: 0, pending_qty: 0 };
          cur.submitted_qty += Number(r.submitted_qty || 0);
          cur.accepted_qty += Number(r.first_pass_accepted_qty || 0) + Number(r.accepted_after_rework_qty || 0);
          cur.rejected_qty += Number(r.rejected_qty || 0);
          cur.rework_qty += Number(r.rework_qty || 0);
          cur.pending_qty += Number(r.pending_inspection_qty || 0);
          m.set(r.work_date, cur);
        }
        const out = Array.from(m.values());
        return { rows: out, rowCount: out.length };
      }

      if (upper.includes('GROUP BY L.PRODUCT_ID')) {
        const m = new Map<number, any>();
        for (const r of rows) {
          const k = Number(r.product_id || 0);
          const cur = m.get(k) || { product_id: k, product_name: r.product_name, submitted_qty: 0, accepted_qty: 0, rejected_qty: 0, rework_qty: 0 };
          cur.submitted_qty += Number(r.submitted_qty || 0);
          cur.accepted_qty += Number(r.first_pass_accepted_qty || 0) + Number(r.accepted_after_rework_qty || 0);
          cur.rejected_qty += Number(r.rejected_qty || 0);
          cur.rework_qty += Number(r.rework_qty || 0);
          m.set(k, cur);
        }
        const out = Array.from(m.values());
        return { rows: out, rowCount: out.length };
      }

      if (upper.includes('GROUP BY L.OPERATION_ID') && upper.includes('ASSIGNED_EMPLOYEES')) {
        const m = new Map<number, any>();
        for (const r of rows) {
          const cur = m.get(r.operation_id) || {
            operation_id: r.operation_id,
            operation_code: r.operation_code,
            operation_name: r.operation_name,
            emps: new Set<number>(),
            target_qty: 0,
            submitted_qty: 0,
            approved_qty: 0,
            rejected_qty: 0,
            pending_qty: 0,
            rework_qty: 0,
          };
          cur.emps.add(r.employee_id);
          cur.target_qty += (Number(r.available_productive_minutes || 480) - Number(r.approved_downtime_minutes || 0)) / Math.max(0.01, Number(r.standard_time_minutes_snapshot || 1));
          cur.submitted_qty += Number(r.submitted_qty || 0);
          cur.approved_qty += Number(r.first_pass_accepted_qty || 0) + Number(r.accepted_after_rework_qty || 0);
          cur.rejected_qty += Number(r.rejected_qty || 0);
          cur.pending_qty += Number(r.pending_inspection_qty || 0);
          cur.rework_qty += Number(r.rework_qty || 0);
          m.set(r.operation_id, cur);
        }
        const out = Array.from(m.values()).map((x) => ({ ...x, assigned_employees: x.emps.size }));
        return { rows: out, rowCount: out.length };
      }

      if (upper.includes('GROUP BY L.OPERATION_ID') && upper.includes('FP_ACCEPTED_QTY')) {
        const m = new Map<number, any>();
        for (const r of rows) {
          const cur = m.get(r.operation_id) || { operation_id: r.operation_id, operation_name: r.operation_name, fp_accepted_qty: 0, rejected_qty: 0, rework_qty: 0, acc_after_rework_qty: 0 };
          cur.fp_accepted_qty += Number(r.first_pass_accepted_qty || 0);
          cur.rejected_qty += Number(r.rejected_qty || 0);
          cur.rework_qty += Number(r.rework_qty || 0);
          cur.acc_after_rework_qty += Number(r.accepted_after_rework_qty || 0);
          m.set(r.operation_id, cur);
        }
        const out = Array.from(m.values());
        return { rows: out, rowCount: out.length };
      }

      if (upper.includes('GROUP BY L.EMPLOYEE_ID')) {
        const m = new Map<number, any>();
        for (const r of rows) {
          const cur = m.get(r.employee_id) || { employee_id: r.employee_id, emp_id: r.emp_id, employee_name: r.employee_name, submitted_qty: 0, fp_accepted_qty: 0, rejected_qty: 0, rework_qty: 0, acc_after_rework_qty: 0 };
          cur.submitted_qty += Number(r.submitted_qty || 0);
          cur.fp_accepted_qty += Number(r.first_pass_accepted_qty || 0);
          cur.rejected_qty += Number(r.rejected_qty || 0);
          cur.rework_qty += Number(r.rework_qty || 0);
          cur.acc_after_rework_qty += Number(r.accepted_after_rework_qty || 0);
          m.set(r.employee_id, cur);
        }
        const out = Array.from(m.values());
        return { rows: out, rowCount: out.length };
      }

      if (upper.includes('GROUP BY L.SHIFT_ID')) {
        const m = new Map<number, any>();
        for (const r of rows) {
          const k = Number(r.shift_id || 0);
          const cur = m.get(k) || { shift_id: k, shift_name: r.shift_name, submitted_qty: 0, accepted_qty: 0, rejected_qty: 0 };
          cur.submitted_qty += Number(r.submitted_qty || 0);
          cur.accepted_qty += Number(r.first_pass_accepted_qty || 0) + Number(r.accepted_after_rework_qty || 0);
          cur.rejected_qty += Number(r.rejected_qty || 0);
          m.set(k, cur);
        }
        const out = Array.from(m.values());
        return { rows: out, rowCount: out.length };
      }

      // Quality summary totals (no GROUP BY)
      if (upper.includes('SUM(COALESCE(L.FIRST_PASS_ACCEPTED_QTY, 0)) AS FP_ACCEPTED_QTY')) {
        const agg = {
          submitted_qty: rows.reduce((s, r) => s + Number(r.submitted_qty || 0), 0),
          fp_accepted_qty: rows.reduce((s, r) => s + Number(r.first_pass_accepted_qty || 0), 0),
          rejected_qty: rows.reduce((s, r) => s + Number(r.rejected_qty || 0), 0),
          rework_qty: rows.reduce((s, r) => s + Number(r.rework_qty || 0), 0),
          acc_after_rework_qty: rows.reduce((s, r) => s + Number(r.accepted_after_rework_qty || 0), 0),
          pending_qty: rows.reduce((s, r) => s + Number(r.pending_inspection_qty || 0), 0),
        };
        return { rows: [agg], rowCount: 1 };
      }

      return { rows, rowCount: rows.length };
    }

    // Production Orders, Mappings, WIP, Assemblies, Assignments
    if (upper.includes('FROM PRODUCTION_ORDERS')) {
      if (upper.includes('COUNT(*)::INT AS CNT')) {
        const cnt = state.production_orders.filter((o) => !['completed', 'cancelled', 'archived'].includes(o.status)).length;
        return { rows: [{ cnt }], rowCount: 1 };
      }
      if (upper.includes('DUE_DATE < CURRENT_DATE')) {
        const today = new Date().toISOString().slice(0, 10);
        const rows = state.production_orders.filter((o) => o.due_date && o.due_date < today && o.status !== 'completed');
        return { rows, rowCount: rows.length };
      }
      const rows = state.production_orders.map((o) => {
        const pr = state.products.find((p) => p.id === o.product_id);
        const completed = state.finished_product_assemblies
          .filter((a) => a.production_order_id === o.id)
          .reduce((s, a) => s + Number(a.final_approved_qty || 0), 0);
        return { ...o, product_name: pr?.name || `Product #${o.product_id}`, completed_qty: completed };
      });
      return { rows, rowCount: rows.length };
    }

    if (upper.includes('FROM PRODUCT_OPERATION_MAPPINGS')) {
      const pid = Number(params[0]);
      const rows = state.product_operation_mappings
        .filter((m) => m.product_id === pid)
        .map((m) => {
          const op = state.manufacturing_operations.find((o) => o.id === m.operation_id);
          return { ...m, operation_code: op?.operation_code || `OP-${m.operation_id}`, operation_name: op?.operation_name || `Op #${m.operation_id}` };
        });
      return { rows, rowCount: rows.length };
    }

    if (upper.includes('FROM PRODUCTION_ORDER_OPERATION_WIP')) {
      const oid = Number(params[0]);
      const rows = state.production_order_operation_wip.filter((w) => w.production_order_id === oid);
      return { rows, rowCount: rows.length };
    }

    if (upper.includes('FROM FINISHED_PRODUCT_ASSEMBLIES')) {
      const oid = Number(params[0]);
      const list = state.finished_product_assemblies.filter((a) => a.production_order_id === oid);
      return {
        rows: [
          {
            assembled_qty: list.reduce((s, a) => s + Number(a.assembled_qty || 0), 0),
            final_approved_qty: list.reduce((s, a) => s + Number(a.final_approved_qty || 0), 0),
            final_rejected_qty: list.reduce((s, a) => s + Number(a.final_rejected_qty || 0), 0),
            rework_required_qty: list.reduce((s, a) => s + Number(a.rework_required_qty || 0), 0),
          },
        ],
        rowCount: 1,
      };
    }

    if (upper.includes('FROM EMPLOYEE_OPERATION_ASSIGNMENTS')) {
      const pid = Number(params[0]);
      const byOp = new Map<number, Set<number>>();
      for (const a of state.employee_operation_assignments) {
        if (a.is_active !== false && (a.product_id === pid || a.product_id === null)) {
          if (!byOp.has(a.operation_id)) byOp.set(a.operation_id, new Set());
          byOp.get(a.operation_id)!.add(a.employee_id);
        }
      }
      const rows = Array.from(byOp.entries()).map(([operation_id, set]) => ({ operation_id, assigned_count: set.size }));
      return { rows, rowCount: rows.length };
    }

    if (upper.includes('FROM EMPLOYEE_REWARD_NOMINATIONS')) {
      const cnt = state.employee_reward_nominations.filter((r) => r.status === 'pending').length;
      return { rows: [{ cnt }], rowCount: 1 };
    }

    // Notifications & Reads
    if (upper.startsWith('INSERT INTO DASHBOARD_NOTIFICATIONS')) {
      const sourceKey = String(params[0]);
      const existing = state.dashboard_notifications.find((n) => n.source_key === sourceKey);
      if (existing) {
        existing.severity = params[2];
        existing.title = params[3];
        existing.message = params[4];
        existing.is_active = true;
      } else {
        state.dashboard_notifications.push({
          id: nextNotifId++,
          source_key: sourceKey,
          event_type: params[1],
          severity: params[2],
          title: params[3],
          message: params[4],
          required_permission: params[5],
          department_id: params[6],
          employee_id: params[7],
          target_route: params[8],
          is_active: true,
          created_at: new Date().toISOString(),
        });
      }
      return { rows: [], rowCount: 1 };
    }

    if (upper.startsWith('INSERT INTO DASHBOARD_NOTIFICATION_READS')) {
      const nid = Number(params[0]);
      const uid = Number(params[1]);
      if (!state.dashboard_notification_reads.some((r) => r.notification_id === nid && r.user_id === uid)) {
        state.dashboard_notification_reads.push({ notification_id: nid, user_id: uid, read_at: new Date().toISOString() });
      }
      return { rows: [], rowCount: 1 };
    }

    if (upper.includes('FROM DASHBOARD_NOTIFICATIONS')) {
      if (upper.includes('WHERE ID = $1')) {
        const rows = state.dashboard_notifications.filter((n) => n.id === Number(params[0]));
        return { rows, rowCount: rows.length };
      }
      if (upper.includes('SELECT ID FROM DASHBOARD_NOTIFICATIONS')) {
        const rows = state.dashboard_notifications.filter((n) => n.is_active);
        return { rows, rowCount: rows.length };
      }
      const userId = Number(params[0]);
      const rows = state.dashboard_notifications
        .filter((n) => n.is_active)
        .map((n) => {
          const rd = state.dashboard_notification_reads.find((r) => r.notification_id === n.id && r.user_id === userId);
          return { ...n, is_read: Boolean(rd), read_at: rd?.read_at || null };
        });
      return { rows, rowCount: rows.length };
    }

    if (upper.includes('FROM MANUFACTURING_AUDIT_LOGS')) {
      return { rows: state.manufacturing_audit_logs, rowCount: state.manufacturing_audit_logs.length };
    }

    return { rows: [], rowCount: 0 };
  };

  const client: DbClientLike = {
    query: execQuery as any,
    release: () => {},
  };

  return {
    query: execQuery as any,
    connect: async () => client,
  };
}

interface TestUserProfile {
  id: number;
  email: string;
  role: string;
  roles: string[];
  department?: string;
  employee_id?: string;
  permissions: string[];
}

function buildTestServer(dbState: MockDbState, usersByToken: Record<string, TestUserProfile>) {
  const pool = createMockPgPool(dbState);
  setPerformanceDbProvider(async () => pool);

  // Patch store lookups for our test user profiles cleanly
  const origFindUserById = store.findUserById.bind(store);
  const origGetEffPerms = store.getUserEffectivePermissions.bind(store);
  const origGetRolePerms = store.getRolePermissions.bind(store);

  const byId = new Map<number, TestUserProfile>();
  for (const u of Object.values(usersByToken)) byId.set(u.id, u);

  (store as any).findUserById = (id: number) => {
    const tu = byId.get(id);
    if (tu) {
      return {
        id: tu.id,
        email: tu.email,
        username: tu.email,
        first_name: tu.role,
        last_name: 'User',
        role: tu.role,
        roles: tu.roles,
        department: tu.department || '',
        employee_id: tu.employee_id || '',
        is_active: true,
      };
    }
    return origFindUserById(id);
  };

  (store as any).getUserEffectivePermissions = (user: any) => {
    const tu = byId.get(user?.id);
    if (tu) return tu.permissions;
    return origGetEffPerms(user);
  };

  (store as any).getRolePermissions = (role: string) => {
    const tu = Object.values(usersByToken).find((u) => u.role === role);
    if (tu) return tu.permissions;
    return origGetRolePerms(role);
  };

  const authenticateToken = (req: any, res: Response, next: NextFunction) => {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    const u = usersByToken[token];
    if (!u) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    req.user = { id: u.id, email: u.email, username: u.email, role: u.role };
    next();
  };

  const requirePermission = (perm: string) => (req: any, res: Response, next: NextFunction) => {
    const u = byId.get(req.user?.id);
    if (!u) return res.status(401).json({ success: false, message: 'Unauthorized' });
    if (u.permissions.includes('*') || u.permissions.includes(perm)) return next();
    return res.status(403).json({ success: false, message: `Forbidden: Missing [${perm}]` });
  };

  const app = express();
  app.use(express.json());

  // Mirror tightened server.ts /api/performance RBAC middleware
  app.use(
    '/api/performance',
    (req: any, res: Response, next: NextFunction) =>
      authenticateToken(req, res, () => {
        const isRead = req.method === 'GET' || req.method === 'HEAD';
        const needed = isRead ? 'performance.view' : 'performance.manage';
        const u = byId.get(req.user.id)!;
        if (u.role === 'super_admin' || u.permissions.includes('*')) return next();
        const allowed = isRead
          ? u.permissions.includes('performance.view') || u.permissions.includes('performance.manage')
          : u.permissions.includes('performance.manage');
        if (!allowed) return res.status(403).json({ success: false, message: `Forbidden: Missing [${needed}]` });
        next();
      }),
    performanceRouter
  );

  app.use(
    '/api/dashboard',
    createDashboardRouter({
      authenticateToken,
      requirePermission,
      dbProvider: async () => pool,
    })
  );

  const server = http.createServer(app);
  const cleanup = () => {
    setPerformanceDbProvider(null);
    (store as any).findUserById = origFindUserById;
    (store as any).getUserEffectivePermissions = origGetEffPerms;
    (store as any).getRolePermissions = origGetRolePerms;
    server.close();
  };

  return new Promise<{ baseUrl: string; cleanup: () => void }>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as any;
      resolve({ baseUrl: `http://127.0.0.1:${addr.port}`, cleanup });
    });
  });
}

async function apiCall(baseUrl: string, path: string, opts: { method?: string; token?: string; body?: any } = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: opts.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  });
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return { status: res.status, json: await res.json(), contentType };
  }
  const buf = Buffer.from(await res.arrayBuffer());
  return { status: res.status, buffer: buf, contentType };
}

// ============================================================================
// TEST A: PERFORMANCE ROSTER API (Fix for POST /api/performance/roster 500)
// ============================================================================
test('Test A: Performance Roster API handles valid creation, validation, duplicates, savepoints, RBAC, dept restriction & DB failures without 500 leakage', async () => {
  const state = createEmptyDbState();
  state.departments = [
    { id: 1, code: 'STITCH', name: 'Stitching', is_active: true, status: 'active' },
    { id: 2, code: 'ASSEM', name: 'Assembly', is_active: true, status: 'active' },
  ];
  state.roles = [{ id: 10, code: 'operator', name: 'Machine Operator', is_active: true }];
  state.simulateMissingUsersEmpIdColumn = true; // Must NOT abort transaction (protected by SAVEPOINT)

  const users: Record<string, TestUserProfile> = {
    super: { id: 1, email: 'super@nexora.test', role: 'super_admin', roles: ['super_admin'], permissions: ['*'] },
    readonly: { id: 2, email: 'view@nexora.test', role: 'viewer', roles: ['viewer'], permissions: ['performance.view', 'dashboard.view'] },
    deptSup: {
      id: 3,
      email: 'sup@nexora.test',
      role: 'performance_user',
      roles: ['performance_user'],
      department: 'Stitching',
      permissions: ['performance.view', 'performance.manage'],
    },
  };

  const { baseUrl, cleanup } = await buildTestServer(state, users);
  try {
    // 1. Unauthenticated -> 401
    const unauth = await apiCall(baseUrl, '/api/performance/roster', { method: 'POST', body: {} });
    assert.equal(unauth.status, 401);

    // 2. Read-only user trying POST -> 403 Forbidden (no dashboard.view bypass!)
    const forbidden = await apiCall(baseUrl, '/api/performance/roster', {
      method: 'POST',
      token: 'readonly',
      body: { first_name: 'A', last_name: 'B', hardware_id: 'HW-01', employee_type: 'full_time', department_id: 1, role_id: 10 },
    });
    assert.equal(forbidden.status, 403);

    // 3. Missing required fields -> 400 with field errors
    const missing = await apiCall(baseUrl, '/api/performance/roster', {
      method: 'POST',
      token: 'super',
      body: { first_name: '' },
    });
    assert.equal(missing.status, 400);
    assert.ok(Array.isArray(missing.json.errors) && missing.json.errors.length >= 4);

    // 4. Invalid department/role references -> 400
    const badRef = await apiCall(baseUrl, '/api/performance/roster', {
      method: 'POST',
      token: 'super',
      body: { first_name: 'Jane', last_name: 'Doe', hardware_id: 'HW-999', employee_type: 'full_time', department_id: 999, role_id: 10 },
    });
    assert.equal(badRef.status, 400);

    // 5. Valid creation even when users.employee_id column does not exist -> 201 Created
    const created = await apiCall(baseUrl, '/api/performance/roster', {
      method: 'POST',
      token: 'super',
      body: { first_name: 'Asha', last_name: 'Patel', hardware_id: 'BTN-101', employee_type: 'full_time', department_id: 1, role_id: 10 },
    });
    assert.equal(created.status, 201);
    assert.equal(created.json.success, true);
    assert.ok(created.json.data.emp_id);
    assert.equal(created.json.data.hardware_id, 'BTN-101');

    // 6. Duplicate active Hardware ID -> 409 Conflict
    const dup = await apiCall(baseUrl, '/api/performance/roster', {
      method: 'POST',
      token: 'super',
      body: { first_name: 'Ravi', last_name: 'Kumar', hardware_id: 'BTN-101', employee_type: 'full_time', department_id: 1, role_id: 10 },
    });
    assert.equal(dup.status, 409);

    // 7. Department-restricted supervisor blocked from registering in another department -> 403
    const crossDept = await apiCall(baseUrl, '/api/performance/roster', {
      method: 'POST',
      token: 'deptSup',
      body: { first_name: 'Meera', last_name: 'Shah', hardware_id: 'BTN-102', employee_type: 'full_time', department_id: 2, role_id: 10 },
    });
    assert.equal(crossDept.status, 403);

    // 8. Department-restricted supervisor allowed in own department -> 201
    const ownDept = await apiCall(baseUrl, '/api/performance/roster', {
      method: 'POST',
      token: 'deptSup',
      body: { first_name: 'Meera', last_name: 'Shah', hardware_id: 'BTN-102', employee_type: 'training', department_id: 1, role_id: 10 },
    });
    assert.equal(ownDept.status, 201);

    // 9. Paginated GET /api/performance/roster
    const paged = await apiCall(baseUrl, '/api/performance/roster?page=1&limit=1', { token: 'super' });
    assert.equal(paged.status, 200);
    assert.equal(paged.json.data.length, 1);
    assert.equal(paged.json.pagination.total, 2);
    assert.equal(paged.json.pagination.total_pages, 2);

    // 10. Database failure returns clean 503 with ZERO leaked credentials/stack
    state.simulateDbFailure = true;
    const dbFail = await apiCall(baseUrl, '/api/performance/roster', {
      method: 'POST',
      token: 'super',
      body: { first_name: 'Test', last_name: 'Fail', hardware_id: 'BTN-500', employee_type: 'full_time', department_id: 1, role_id: 10 },
    });
    assert.equal(dbFail.status, 503);
    assert.equal(JSON.stringify(dbFail.json).includes('secret_password_never_leak'), false);
  } finally {
    cleanup();
  }
});

// ============================================================================
// TEST B & C & D & E: ROLE-BASED DASHBOARD, EXPORTS, NOTIFICATIONS & ACCURACY
// ============================================================================
test('Tests B, C, D, E: Role-based dashboard across 6 personas, separate Excel/PDF permissions, notifications & accurate analytics', async () => {
  const state = createEmptyDbState();
  const today = new Date().toISOString().slice(0, 10);

  state.departments = [
    { id: 1, code: 'STITCH', name: 'Stitching', is_active: true, status: 'active' },
    { id: 2, code: 'ASSEM', name: 'Assembly', is_active: true, status: 'active' },
  ];
  state.manufacturing_operations = [
    { id: 1, operation_code: 'OP-STITCH', operation_name: 'Body Stitching', uom: 'pcs', standard_time_minutes: 6, is_active: true },
    { id: 2, operation_code: 'OP-EYE', operation_name: 'Eye Attachment', uom: 'pcs', standard_time_minutes: 3, is_active: true },
    { id: 3, operation_code: 'OP-ASM', operation_name: 'Final Toy Assembly', uom: 'toy', standard_time_minutes: 10, is_active: true },
  ];
  state.products = [{ id: 1, sku: 'TOY-BEAR', name: 'Plush Teddy Bear' }];
  state.manufacturing_shifts = [{ id: 1, shift_code: 'DAY', shift_name: 'Day Shift', is_active: true }];
  state.performance_employees = [
    { id: 11, emp_id: 'EMP-0011', first_name: 'Asha', last_name: 'Stitcher', department_id: 1, department: 'Stitching', designation: 'Stitcher', is_active: true },
    { id: 12, emp_id: 'EMP-0012', first_name: 'Ravi', last_name: 'Assembler', department_id: 2, department: 'Assembly', designation: 'Assembler', is_active: true },
  ];

  // Test C: Empty DB state verification first (ZERO dummy data)
  const users: Record<string, TestUserProfile> = {
    super_admin: { id: 1, email: 'sa@nexora.test', role: 'super_admin', roles: ['super_admin'], permissions: ['*'] },
    management: {
      id: 2,
      email: 'mgmt@nexora.test',
      role: 'admin',
      roles: ['admin'],
      permissions: [
        'dashboard.view',
        'dashboard.employee_summary.view',
        'dashboard.production_summary.view',
        'dashboard.employee_performance.view',
        'dashboard.production_forecast.view',
        'dashboard.product_readiness.view',
        'dashboard.quality_reports.view',
        'dashboard.rewards.view',
        'dashboard.notifications.view',
        'dashboard.recent_activity.view',
        'reports.export.excel',
        'reports.export.pdf',
      ],
    },
    prod_mgr: {
      id: 3,
      email: 'pm@nexora.test',
      role: 'production_manager',
      roles: ['production_manager'],
      permissions: [
        'dashboard.view',
        'dashboard.production_summary.view',
        'dashboard.product_readiness.view',
        'dashboard.production_forecast.view',
        'reports.export.excel', // Excel ONLY — NO PDF!
      ],
    },
    dept_sup: {
      id: 4,
      email: 'sup@nexora.test',
      role: 'department_supervisor',
      roles: ['department_supervisor'],
      department: 'Stitching',
      permissions: [
        'dashboard.view',
        'dashboard.employee_summary.view',
        'dashboard.employee_performance.view',
        'dashboard.quality_reports.view',
        'dashboard.notifications.view',
        'reports.export.pdf', // PDF ONLY — NO Excel!
      ],
    },
    qc_inspector: {
      id: 5,
      email: 'qc@nexora.test',
      role: 'quality_inspector',
      roles: ['quality_inspector'],
      department: 'Stitching',
      permissions: ['dashboard.view', 'dashboard.quality_reports.view', 'dashboard.notifications.view'],
    },
    employee: {
      id: 6,
      email: 'asha@nexora.test',
      role: 'user',
      roles: ['user'],
      department: 'Stitching',
      employee_id: 'EMP-0011',
      permissions: ['dashboard.view', 'dashboard.employee_summary.view', 'dashboard.employee_performance.view'],
    },
  };

  const { baseUrl, cleanup } = await buildTestServer(state, users);
  try {
    // Empty DB check: zero fabricated records
    const emptyPerf = await apiCall(baseUrl, '/api/dashboard/employee-performance', { token: 'super_admin' });
    assert.equal(emptyPerf.status, 200);
    assert.equal(emptyPerf.json.data.leaderboard.length, 0);
    const emptyNotif = await apiCall(baseUrl, '/api/dashboard/notifications', { token: 'super_admin' });
    assert.equal(emptyNotif.status, 200);
    assert.equal(emptyNotif.json.data.notifications.length, 0);

    // Populate REAL transactional records for Tests B, D, E
    // Asha (Op 1, std=6m, avail=480m => target 80): 80 first-pass accepted => 100% productivity, 100% quality
    // Ravi (Op 2, std=3m, avail=480m => target 160): 120 submitted, 80 fp accepted, 20 rejected, 20 rework (10 accepted after rework), 10 pending
    // Notice Ravi has higher raw submitted (120 vs 80), yet LOWER standard-time productivity (90*3/480 = 56.25% vs Asha's 100%)!
    state.employee_operation_work_logs = [
      {
        id: 1,
        employee_id: 11,
        department_id: 1,
        operation_id: 1,
        product_id: 1,
        production_order_id: 1,
        shift_id: 1,
        work_date: today,
        standard_time_minutes_snapshot: 6,
        available_productive_minutes: 480,
        approved_downtime_minutes: 0,
        submitted_qty: 80,
        first_pass_accepted_qty: 80,
        rejected_qty: 0,
        rework_qty: 0,
        accepted_after_rework_qty: 0,
        pending_inspection_qty: 5, // triggers real pending QC alert for Dept 1
      },
      {
        id: 2,
        employee_id: 12,
        department_id: 2,
        operation_id: 2,
        product_id: 1,
        production_order_id: 1,
        shift_id: 1,
        work_date: today,
        standard_time_minutes_snapshot: 3,
        available_productive_minutes: 480,
        approved_downtime_minutes: 0,
        submitted_qty: 120,
        first_pass_accepted_qty: 80,
        rejected_qty: 20,
        rework_qty: 20,
        accepted_after_rework_qty: 10,
        pending_inspection_qty: 0,
      },
    ];

    state.production_orders = [{ id: 1, order_number: 'PO-2026-001', product_id: 1, target_qty: 100, status: 'in_progress', due_date: '2020-01-01' }];
    state.product_operation_mappings = [
      { id: 1, product_id: 1, operation_id: 1, component_name: 'Teddy Body', required_qty_per_unit: 1, standard_time_minutes: 6, sequence_order: 1, is_mandatory: true, is_assembly_stage: false },
      { id: 2, product_id: 1, operation_id: 2, component_name: 'Safety Eyes', required_qty_per_unit: 2, standard_time_minutes: 3, sequence_order: 2, is_mandatory: true, is_assembly_stage: false },
      { id: 3, product_id: 1, operation_id: 3, component_name: 'Assembled Bear', required_qty_per_unit: 1, standard_time_minutes: 10, sequence_order: 3, is_mandatory: true, is_assembly_stage: true },
    ];
    state.production_order_operation_wip = [
      { production_order_id: 1, operation_id: 1, completed_qty: 80, quality_approved_qty: 80, pending_inspection_qty: 5, rejected_qty: 0, rework_qty: 0, transferred_qty: 80, consumed_in_assembly_qty: 20 },
      { production_order_id: 1, operation_id: 2, completed_qty: 90, quality_approved_qty: 90, pending_inspection_qty: 0, rejected_qty: 20, rework_qty: 20, transferred_qty: 90, consumed_in_assembly_qty: 40 },
    ];
    state.finished_product_assemblies = [
      { production_order_id: 1, assembled_qty: 20, final_approved_qty: 15, final_rejected_qty: 2, rework_required_qty: 1 },
    ];
    state.employee_operation_assignments = [
      { employee_id: 11, operation_id: 1, product_id: 1, is_active: true },
      { employee_id: 12, operation_id: 2, product_id: 1, is_active: true },
      { employee_id: 12, operation_id: 3, product_id: 1, is_active: true },
    ];

    // --- Test B: Role-Based Access across all 6 personas ---
    // 1. Super Admin sees everything
    const saCfg = await apiCall(baseUrl, '/api/dashboard/config', { token: 'super_admin' });
    assert.equal(saCfg.status, 200);
    assert.equal(saCfg.json.data.scope, 'company');
    assert.equal(saCfg.json.data.widget_access.production_forecast, true);

    // 2. Production Manager: can view forecast/readiness, CANNOT view quality_reports -> 403
    const pmForecast = await apiCall(baseUrl, '/api/dashboard/forecast', { token: 'prod_mgr' });
    assert.equal(pmForecast.status, 200);
    const pmQuality = await apiCall(baseUrl, '/api/dashboard/quality', { token: 'prod_mgr' });
    assert.equal(pmQuality.status, 403);

    // 3. Department Supervisor (Stitching): sees ONLY Stitching (emp 11), blocked from Assembly (dept 2) -> 403
    const supPerf = await apiCall(baseUrl, '/api/dashboard/employee-performance', { token: 'dept_sup' });
    assert.equal(supPerf.status, 200);
    assert.equal(supPerf.json.data.scope, 'department');
    assert.equal(supPerf.json.data.leaderboard.length, 1);
    assert.equal(supPerf.json.data.leaderboard[0].emp_id, 'EMP-0011');
    const supCrossDept = await apiCall(baseUrl, '/api/dashboard/employee-performance?department_id=2', { token: 'dept_sup' });
    assert.equal(supCrossDept.status, 403);

    // 4. Quality Inspector: can view quality, CANNOT view forecast or employee_performance -> 403
    const qcQual = await apiCall(baseUrl, '/api/dashboard/quality', { token: 'qc_inspector' });
    assert.equal(qcQual.status, 200);
    const qcForecast = await apiCall(baseUrl, '/api/dashboard/forecast', { token: 'qc_inspector' });
    assert.equal(qcForecast.status, 403);

    // 5. Employee (Self): sees ONLY self (EMP-0011), blocked from viewing EMP-0012 -> 403
    const empSelf = await apiCall(baseUrl, '/api/dashboard/employee-performance', { token: 'employee' });
    assert.equal(empSelf.status, 200);
    assert.equal(empSelf.json.data.scope, 'self');
    assert.equal(empSelf.json.data.leaderboard.length, 1);
    assert.equal(empSelf.json.data.leaderboard[0].emp_id, 'EMP-0011');
    const empOther = await apiCall(baseUrl, '/api/dashboard/employee-performance?employee_id=12', { token: 'employee' });
    assert.equal(empOther.status, 403);

    // --- Test C: Separate Excel & PDF Export Permissions ---
    const pmExcel = await apiCall(baseUrl, '/api/dashboard/export?format=xlsx', { token: 'prod_mgr' });
    assert.equal(pmExcel.status, 200);
    assert.ok(pmExcel.contentType.includes('spreadsheetml'));
    const pmPdf = await apiCall(baseUrl, '/api/dashboard/export?format=pdf', { token: 'prod_mgr' });
    assert.equal(pmPdf.status, 403);

    const supPdf = await apiCall(baseUrl, '/api/dashboard/export?format=pdf', { token: 'dept_sup' });
    assert.equal(supPdf.status, 200);
    assert.ok(supPdf.contentType.includes('application/pdf'));
    const supExcel = await apiCall(baseUrl, '/api/dashboard/export?format=xlsx', { token: 'dept_sup' });
    assert.equal(supExcel.status, 403);

    // --- Test D: Notifications Centre (real events, read/unread, mark-all-read, permission filtering) ---
    const saNotifs = await apiCall(baseUrl, '/api/dashboard/notifications', { token: 'super_admin' });
    assert.equal(saNotifs.status, 200);
    assert.ok(saNotifs.json.data.notifications.length >= 2);
    assert.equal(saNotifs.json.data.unread_count, saNotifs.json.data.notifications.length);

    // QC Inspector in Stitching sees pending QC for Dept 1, NOT overdue order (lacks production_summary.view) or Dept 2 defect alert
    const qcNotifs = await apiCall(baseUrl, '/api/dashboard/notifications', { token: 'qc_inspector' });
    assert.equal(qcNotifs.status, 200);
    assert.equal(qcNotifs.json.data.notifications.some((n: any) => n.event_type === 'production_order_behind_target'), false);
    assert.equal(qcNotifs.json.data.notifications.some((n: any) => n.event_type === 'pending_quality_inspection'), true);

    // Mark single notification read
    const firstId = saNotifs.json.data.notifications[0].id;
    const markOne = await apiCall(baseUrl, `/api/dashboard/notifications/${firstId}/read`, { method: 'POST', token: 'super_admin' });
    assert.equal(markOne.status, 200);
    const afterOne = await apiCall(baseUrl, '/api/dashboard/notifications', { token: 'super_admin' });
    assert.equal(afterOne.json.data.unread_count, saNotifs.json.data.unread_count - 1);

    // Mark all read
    const markAll = await apiCall(baseUrl, '/api/dashboard/notifications/read-all', { method: 'POST', token: 'super_admin' });
    assert.equal(markAll.status, 200);
    const afterAll = await apiCall(baseUrl, '/api/dashboard/notifications', { token: 'super_admin' });
    assert.equal(afterAll.json.data.unread_count, 0);

    // --- Test E: Accuracy Checks ---
    // 1. Fair standard-time productivity: Asha (80 pcs @ 6m = 100%) MUST outrank Ravi (120 pcs @ 3m, 90 acc = 56.25%)
    const fairPerf = await apiCall(baseUrl, '/api/dashboard/employee-performance', { token: 'management' });
    assert.equal(fairPerf.json.data.leaderboard[0].emp_id, 'EMP-0011');
    assert.equal(fairPerf.json.data.leaderboard[0].standard_time_productivity_pct, 100);
    assert.equal(fairPerf.json.data.leaderboard[1].emp_id, 'EMP-0012');
    assert.equal(fairPerf.json.data.leaderboard[1].standard_time_productivity_pct, 56.25);

    // 2. Quality zero double-counting: total fp=160, rej=20, rw=20 => inspected=200; accAfterRework=10 => finalAccepted=170 (NOT 180)
    const qual = await apiCall(baseUrl, '/api/dashboard/quality', { token: 'management' });
    assert.equal(qual.json.data.summary.first_pass_quality_pct, 80); // 160/200
    assert.equal(qual.json.data.summary.final_acceptance_pct, 85); // 170/200

    // 3. Product Readiness: Body avail=60 (80-20), Eyes avail=50 (90-40, 2/toy => 25 sets). Assembly-ready sets = 25, Final approved = 15 (NOT 80 or 90!)
    const readiness = await apiCall(baseUrl, '/api/dashboard/product-readiness', { token: 'management' });
    const ordReadiness = readiness.json.data.orders[0];
    assert.equal(ordReadiness.potential_assembly_ready_qty, 25);
    assert.equal(ordReadiness.final_approved_finished_qty, 15);
    assert.equal(ordReadiness.awaiting_final_inspection_qty, 2); // 20 assembled - 15 approved - 2 rejected - 1 rework
    assert.equal(ordReadiness.finished_product_readiness_pct, 15);

    // 4. Forecast is clearly labeled Estimate & identifies bottleneck
    const fc = await apiCall(baseUrl, '/api/dashboard/forecast', { token: 'management' });
    assert.equal(fc.json.data.is_estimate, true);
    assert.equal(fc.json.data.forecasts[0].forecast.is_estimate, true);
    assert.ok(fc.json.data.forecasts[0].forecast.bottleneck_operation);
  } finally {
    cleanup();
  }
});

// ============================================================================
// TEST F: SCALABILITY (500 Employees, Server-Side Pagination, Concurrent Requests)
// ============================================================================
test('Test F: Scalability with 500 employees, server-side pagination, and concurrent department-isolated requests', async () => {
  const state = createEmptyDbState();
  const today = new Date().toISOString().slice(0, 10);

  state.departments = [
    { id: 1, code: 'D1', name: 'Stitching', is_active: true, status: 'active' },
    { id: 2, code: 'D2', name: 'Stuffing', is_active: true, status: 'active' },
  ];
  state.manufacturing_operations = [
    { id: 1, operation_code: 'OP-1', operation_name: 'Stitching Op', uom: 'pcs', standard_time_minutes: 5, is_active: true },
  ];
  state.products = [{ id: 1, sku: 'T-1', name: 'Bear' }];

  for (let i = 1; i <= 500; i++) {
    const deptId = i <= 250 ? 1 : 2;
    state.performance_employees.push({
      id: i,
      emp_id: `EMP-${String(i).padStart(4, '0')}`,
      first_name: `Worker`,
      last_name: `#${i}`,
      department_id: deptId,
      department: deptId === 1 ? 'Stitching' : 'Stuffing',
      designation: 'Operator',
      is_active: true,
    });
    state.employee_operation_work_logs.push({
      id: i,
      employee_id: i,
      department_id: deptId,
      operation_id: 1,
      product_id: 1,
      work_date: today,
      standard_time_minutes_snapshot: 5,
      available_productive_minutes: 480,
      approved_downtime_minutes: 0,
      submitted_qty: 80 + (i % 25),
      first_pass_accepted_qty: 75 + (i % 25),
      rejected_qty: 3,
      rework_qty: 2,
      accepted_after_rework_qty: 1,
      pending_inspection_qty: 0,
    });
  }

  const users: Record<string, TestUserProfile> = {
    admin: { id: 1, email: 'admin@nexora.test', role: 'super_admin', roles: ['super_admin'], permissions: ['*'] },
    sup1: {
      id: 2,
      email: 'sup1@nexora.test',
      role: 'department_supervisor',
      roles: ['department_supervisor'],
      department: 'Stitching',
      permissions: ['dashboard.view', 'dashboard.employee_performance.view'],
    },
    sup2: {
      id: 3,
      email: 'sup2@nexora.test',
      role: 'department_supervisor',
      roles: ['department_supervisor'],
      department: 'Stuffing',
      permissions: ['dashboard.view', 'dashboard.employee_performance.view'],
    },
  };

  const { baseUrl, cleanup } = await buildTestServer(state, users);
  try {
    const startMs = Date.now();
    const responses = await Promise.all([
      apiCall(baseUrl, '/api/dashboard/employee-performance?page=1&limit=25', { token: 'admin' }),
      apiCall(baseUrl, '/api/dashboard/employee-performance?page=20&limit=25', { token: 'admin' }),
      apiCall(baseUrl, '/api/dashboard/employee-performance?page=1&limit=20', { token: 'sup1' }),
      apiCall(baseUrl, '/api/dashboard/employee-performance?page=1&limit=20', { token: 'sup2' }),
      apiCall(baseUrl, '/api/dashboard/summary', { token: 'admin' }),
      apiCall(baseUrl, '/api/dashboard/production', { token: 'admin' }),
      apiCall(baseUrl, '/api/dashboard/quality', { token: 'admin' }),
      apiCall(baseUrl, '/api/performance/roster?page=1&limit=50', { token: 'admin' }),
    ]);
    const elapsedMs = Date.now() - startMs;

    for (const r of responses) assert.equal(r.status, 200);
    assert.equal(responses[0].json.data.pagination.total, 500);
    assert.equal(responses[0].json.data.pagination.total_pages, 20);
    assert.equal(responses[0].json.data.leaderboard.length, 25);
    assert.equal(responses[1].json.data.leaderboard.length, 25);

    // Zero cross-department leakage under concurrent execution
    assert.equal(responses[2].json.data.pagination.total, 250);
    assert.ok(responses[2].json.data.leaderboard.every((r: any) => r.department === 'Stitching'));
    assert.equal(responses[3].json.data.pagination.total, 250);
    assert.ok(responses[3].json.data.leaderboard.every((r: any) => r.department === 'Stuffing'));
    assert.ok(elapsedMs < 5000, `Expected 8 concurrent 500-employee requests under 5s, took ${elapsedMs}ms`);
  } finally {
    cleanup();
  }
});
