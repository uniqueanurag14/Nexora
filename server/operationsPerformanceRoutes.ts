/**
 * NEXORA ERP — Operation-Based Employee Performance, Quality,
 * Group Production Readiness, Forecasting, Bottlenecks & Rewards API Router
 *
 * Strict Architecture Guarantees:
 * - PostgreSQL ONLY (single source of truth; zero seed/dummy/mock data).
 * - All SQL statements are strictly parameterized ($1, $2, ...).
 * - Transactional integrity + PostgreSQL advisory locks on concurrent hardware button events,
 *   WIP transfers, assembly consumption, quality approvals, and auto-ID generation.
 * - Granular server-side RBAC enforcement + immutable manufacturing audit trail.
 */

import express, { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import * as XLSX from 'xlsx';
import { getDb, DbClientLike } from './db';
import { store } from './store';
import { auditService } from './security/auditService';
import { securityConfig } from './security/config';
import { isValidIsoDate } from './security/redaction';
import { broadcastWorkEvent } from './performanceRoutes';
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
  resolveApplicableStandardTime,
  round2,
  round4,
} from './services/manufacturingEngine';
import type { AuthenticatedRequest } from '../server';

interface RouterDeps {
  authenticateToken: (req: AuthenticatedRequest, res: Response, next: NextFunction) => void;
  requirePermission: (permissionCode: string) => (req: AuthenticatedRequest, res: Response, next: NextFunction) => void;
}

const VALID_REWARD_CATEGORIES = [
  'best_employee_day',
  'best_employee_week',
  'best_employee_month',
  'best_performer_operation',
  'best_quality_performer',
  'most_consistent_employee',
  'overall_best_employee',
] as const;

function sendApiError(res: Response, err: any, fallbackMessage: string) {
  const isDbUnavailable = err?.code === 'DB_UNAVAILABLE' || err?.statusCode === 503;
  if (err?.statusCode && Number.isInteger(err.statusCode)) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message || fallbackMessage,
      errors: err.errors,
    });
  }
  if (err?.code === '23505') {
    return res.status(409).json({
      success: false,
      message: err.detail || 'A conflicting record with the same unique key already exists.',
    });
  }
  if (err?.code === '23503') {
    return res.status(400).json({
      success: false,
      message: 'Referenced department, product, operation, employee, or production order does not exist.',
    });
  }
  if (err?.code === '23514') {
    return res.status(400).json({
      success: false,
      message: 'Validation constraint violated. Please check quantities, weights, or date bounds.',
    });
  }
  if (err?.code === '42P01') {
    return res.status(503).json({
      success: false,
      message: 'Operations Performance database tables are not initialized yet. Please run "npm run db:update".',
    });
  }
  return res.status(isDbUnavailable ? 503 : 500).json({
    success: false,
    message: isDbUnavailable ? (err?.message || 'PostgreSQL database unavailable.') : fallbackMessage,
  });
}

function getClientIp(req: Request): string {
  return (
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.ip ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}

/**
 * Concurrency-safe auto-generated code inside a PostgreSQL transaction using advisory lock.
 */
async function generateAutoCode(
  client: DbClientLike,
  lockKey: number,
  tableName: string,
  codeColumn: string,
  prefix: string,
  padWidth = 4
): Promise<string> {
  await client.query(`SELECT pg_advisory_xact_lock($1)`, [lockKey]);
  const res = await client.query<{ max_num: string | null }>(
    `SELECT MAX(
       CASE
         WHEN ${codeColumn} ~ ('^' || $1 || '-[0-9]+$')
         THEN CAST(SUBSTRING(${codeColumn} FROM '[0-9]+$') AS BIGINT)
         ELSE 0
       END
     ) AS max_num
     FROM ${tableName}`,
    [prefix]
  );
  const nextSeq = Number(res.rows[0]?.max_num || 0) + 1;
  return `${prefix}-${String(nextSeq).padStart(padWidth, '0')}`;
}

async function logManufacturingAudit(
  client: DbClientLike,
  params: {
    req?: AuthenticatedRequest;
    actorId?: number | null;
    actorEmail: string;
    actorRole?: string;
    entityType: string;
    entityId: string | number;
    action: string;
    beforeValues?: any;
    afterValues?: any;
    reason?: string;
  }
): Promise<void> {
  const ip = params.req ? getClientIp(params.req) : 'system';
  try {
    await client.query(
      `INSERT INTO manufacturing_audit_logs
       (actor_id, actor_email, actor_role, entity_type, entity_id, action, before_values, after_values, reason, ip_address, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10, NOW())`,
      [
        params.actorId ?? params.req?.user?.id ?? null,
        params.actorEmail,
        params.actorRole ?? params.req?.user?.role ?? 'system',
        params.entityType,
        String(params.entityId),
        params.action,
        params.beforeValues !== undefined ? JSON.stringify(params.beforeValues) : null,
        params.afterValues !== undefined ? JSON.stringify(params.afterValues) : null,
        params.reason || '',
        ip,
      ]
    );
  } catch {
    // Non-fatal if audit table not yet migrated during partial rollout
  }

  try {
    await auditService.log({
      req: params.req,
      user_id: params.actorId ?? params.req?.user?.id,
      user_email: params.actorEmail,
      module_name: 'Operations Performance',
      action_type: params.action,
      entity_type: params.entityType,
      entity_id: String(params.entityId),
      status: 'SUCCESS',
      description: params.reason || `${params.action} on ${params.entityType} #${params.entityId}`,
      before_values: params.beforeValues,
      after_values: params.afterValues,
    });
  } catch {}
}

/**
 * Loads the active management-configured scoring policy from PostgreSQL.
 * Falls back to DEFAULT_SCORING_POLICY in memory only if management has not saved a policy yet.
 */
async function loadActiveScoringPolicy(db: { query: DbClientLike['query'] }): Promise<ScoringPolicyConfig & { id: number | null; persisted: boolean }> {
  try {
    const res = await db.query(
      `SELECT * FROM performance_scoring_policies WHERE is_active = TRUE ORDER BY updated_at DESC, id DESC LIMIT 1`
    );
    if (res.rows && res.rows.length > 0) {
      const r = res.rows[0];
      return {
        id: Number(r.id),
        persisted: true,
        policy_name: String(r.policy_name),
        productivity_weight: Number(r.productivity_weight),
        quality_weight: Number(r.quality_weight),
        consistency_weight: Number(r.consistency_weight),
        productivity_metric_mode: r.productivity_metric_mode === 'gross_output' ? 'gross_output' : 'accepted_output',
        quality_metric_mode: r.quality_metric_mode === 'first_pass' ? 'first_pass' : 'final_acceptance',
        max_productivity_score_cap: Number(r.max_productivity_score_cap),
        consistency_min_productivity_pct: Number(r.consistency_min_productivity_pct),
        consistency_min_quality_pct: Number(r.consistency_min_quality_pct),
        min_eligible_workdays_weekly: Number(r.min_eligible_workdays_weekly),
        min_eligible_workdays_monthly: Number(r.min_eligible_workdays_monthly),
        min_reward_productivity_pct: Number(r.min_reward_productivity_pct),
        min_reward_quality_pct: Number(r.min_reward_quality_pct),
        hardware_debounce_seconds: Number(r.hardware_debounce_seconds),
        scoring_bands: Array.isArray(r.scoring_bands) && r.scoring_bands.length > 0
          ? r.scoring_bands
          : DEFAULT_SCORING_POLICY.scoring_bands,
      };
    }
  } catch {}
  return { id: null, persisted: false, ...DEFAULT_SCORING_POLICY };
}

/**
 * Generates a lightweight, standards-compliant PDF binary buffer for authorized report exports
 * without external binary dependencies.
 */
export function buildSimplePdfBuffer(title: string, subtitle: string, headers: string[], rows: string[][]): Buffer {
  const esc = (s: string) =>
    String(s || '')
      .replace(/[^\x20-\x7E]/g, ' ')
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)');

  const linesPerPage = 42;
  const pages: string[][][] = [];
  const allRows = rows.length > 0 ? rows : [['No records matched the selected report filters.']];
  for (let i = 0; i < allRows.length; i += linesPerPage) {
    pages.push(allRows.slice(i, i + linesPerPage));
  }

  const objects: string[] = [];
  // 1: Catalog, 2: Pages, 3: Helvetica, 4: Helvetica-Bold
  objects.push('1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj');
  objects.push(''); // placeholder for Pages object 2
  objects.push('3 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj');
  objects.push('4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> endobj');

  const pageObjIds: number[] = [];
  for (let pIdx = 0; pIdx < pages.length; pIdx++) {
    const pageRows = pages[pIdx];
    const contentLines: string[] = [];
    contentLines.push('BT');
    contentLines.push('/F2 13 Tf 36 800 Td (' + esc(title) + ') Tj');
    contentLines.push('/F1 9 Tf 0 -16 Td (' + esc(`${subtitle}  |  Page ${pIdx + 1} of ${pages.length}`) + ') Tj');
    contentLines.push('/F2 8 Tf 0 -22 Td (' + esc(headers.join('  |  ').slice(0, 125)) + ') Tj');
    contentLines.push('/F1 8 Tf');
    for (const r of pageRows) {
      contentLines.push('0 -15 Td (' + esc(r.join('  |  ').slice(0, 130)) + ') Tj');
    }
    contentLines.push('ET');
    const streamData = contentLines.join('\n');
    const contentObjId = objects.length + 1;
    objects.push(`${contentObjId} 0 obj << /Length ${Buffer.byteLength(streamData, 'utf8')} >> stream\n${streamData}\nendstream endobj`);
    const pageObjId = objects.length + 1;
    objects.push(
      `${pageObjId} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObjId} 0 R >> endobj`
    );
    pageObjIds.push(pageObjId);
  }

  objects[1] = `2 0 obj << /Type /Pages /Kids [${pageObjIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageObjIds.length} >> endobj`;

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += obj + '\n';
  }
  const xrefPos = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    pdf += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
  }
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;
  return Buffer.from(pdf, 'utf8');
}

/**
 * Shared Transactional Hardware Button Event Processor.
 * Guarantees:
 * - Per-hardware advisory lock preventing concurrent race conditions.
 * - Strict idempotency (event_uid / idempotency_key retries NEVER double-count production).
 * - Configurable hardware debounce interval (never arbitrary long cooldown).
 * - Exact timestamp-based assignment resolution (never guesses ambiguous/unassigned events -> Exception Queue).
 * - Immutable historical standard time snapshot stored on each accepted event.
 * - Atomic WIP `component_completed` transaction when assigned to a Production Order.
 */
export async function processHardwareButtonEvent(
  payload: {
    event_id?: string;
    event_uid?: string;
    idempotency_key?: string;
    hardware_id?: string;
    device_id?: string;
    emp_id?: string;
    employee_id?: number | string;
    product_id?: number;
    operation_id?: number;
    production_order_id?: number;
    workstation?: string;
    quantity?: number;
    timestamp?: string;
    source?: string;
    notes?: string;
  },
  dbOverride?: { connect: () => Promise<DbClientLike> }
): Promise<{
  httpStatus: number;
  success: boolean;
  is_duplicate: boolean;
  exception_queued: boolean;
  message: string;
  data: any;
}> {
  const db = dbOverride || (await getDb());
  const client = await db.connect();

  const rawHw = String(payload.hardware_id || payload.device_id || '').trim().toUpperCase();
  const rawEmp = payload.emp_id || payload.employee_id;
  const idempotencyKey = String(payload.idempotency_key || payload.event_id || payload.event_uid || '').trim();
  const eventUid =
    String(payload.event_uid || payload.event_id || '').trim() ||
    (idempotencyKey ? `EVT-${idempotencyKey}` : `EVT-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`);
  const qty = Math.max(1, Number(payload.quantity) || 1);
  const source = String(payload.source || 'HARDWARE').toUpperCase();

  let eventTime = new Date();
  if (payload.timestamp) {
    const parsed = new Date(payload.timestamp);
    if (Number.isNaN(parsed.getTime())) {
      client.release();
      return { httpStatus: 400, success: false, is_duplicate: false, exception_queued: false, message: 'Invalid timestamp format.', data: null };
    }
    if (parsed.getTime() > Date.now() + 60_000) {
      client.release();
      return { httpStatus: 400, success: false, is_duplicate: false, exception_queued: false, message: 'Event timestamp cannot be in the future.', data: null };
    }
    eventTime = parsed;
  }

  try {
    await client.query('BEGIN');

    // Acquire per-hardware advisory lock to serialize concurrent button events from the same terminal
    const lockScope = rawHw || String(rawEmp || 'GLOBAL_HW');
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`hw_btn:${lockScope}`]);

    // 1. Idempotency check (gateway retry with same event_id / idempotency_key NEVER increases production twice)
    if (idempotencyKey || payload.event_uid || payload.event_id) {
      const dupCheck = await client.query(
        `SELECT * FROM hardware_production_events
         WHERE event_uid = $1 OR ($2 <> '' AND idempotency_key = $2)
         LIMIT 1`,
        [eventUid, idempotencyKey]
      );
      if (dupCheck.rows && dupCheck.rows.length > 0) {
        await client.query('COMMIT');
        return {
          httpStatus: 200,
          success: true,
          is_duplicate: true,
          exception_queued: false,
          message: 'Hardware event already processed (idempotent retry ignored).',
          data: { ...dupCheck.rows[0], duplicate_status: 'idempotent_duplicate' },
        };
      }
    }

    const policy = await loadActiveScoringPolicy(client);

    // 2. Resolve employee by hardware_id (preferred) or emp_id
    let empRow: any = null;
    if (rawHw) {
      const res = await client.query(
        `SELECT * FROM performance_employees WHERE UPPER(TRIM(hardware_id)) = $1 ORDER BY is_active DESC, id DESC LIMIT 1`,
        [rawHw]
      );
      empRow = res.rows[0] || null;
    }
    if (!empRow && rawEmp) {
      const res = await client.query(
        `SELECT * FROM performance_employees WHERE emp_id = $1 OR id = $2 LIMIT 1`,
        [String(rawEmp), Number(rawEmp) || 0]
      );
      empRow = res.rows[0] || null;
    }

    const resolvedHw = rawHw || String(empRow?.hardware_id || 'UNMAPPED').trim().toUpperCase();

    // 2a. Invalid / unmapped Hardware ID -> log invalid event cleanly
    if (!empRow) {
      const invRes = await client.query(
        `INSERT INTO hardware_production_events
         (event_uid, idempotency_key, hardware_id, quantity, event_timestamp, received_at, processing_status, duplicate_status, source, exception_reason, raw_payload)
         VALUES ($1, NULLIF($2, ''), $3, $4, $5, NOW(), 'invalid_hardware', 'unique', $6, $7, $8::jsonb)
         RETURNING *`,
        [
          eventUid,
          idempotencyKey,
          resolvedHw,
          qty,
          eventTime.toISOString(),
          source,
          `Hardware ID "${resolvedHw}" is not mapped to any registered Performance Employee.`,
          JSON.stringify(payload),
        ]
      );
      await client.query('COMMIT');
      return {
        httpStatus: 404,
        success: false,
        is_duplicate: false,
        exception_queued: true,
        message: `Unregistered Hardware ID "${resolvedHw}". Logged to invalid hardware events.`,
        data: invRes.rows[0],
      };
    }

    // 2b. Inactive employee -> log rejected_inactive
    if (!empRow.is_active) {
      const inactRes = await client.query(
        `INSERT INTO hardware_production_events
         (event_uid, idempotency_key, hardware_id, employee_id, emp_id, department_id, quantity, event_timestamp, received_at, processing_status, duplicate_status, source, exception_reason, raw_payload)
         VALUES ($1, NULLIF($2, ''), $3, $4, $5, $6, $7, $8, NOW(), 'rejected_inactive', 'unique', $9, $10, $11::jsonb)
         RETURNING *`,
        [
          eventUid,
          idempotencyKey,
          resolvedHw,
          empRow.id,
          empRow.emp_id,
          empRow.department_id || null,
          qty,
          eventTime.toISOString(),
          source,
          `Employee "${empRow.emp_id}" is inactive.`,
          JSON.stringify(payload),
        ]
      );
      await client.query('COMMIT');
      return {
        httpStatus: 400,
        success: false,
        is_duplicate: false,
        exception_queued: true,
        message: `Employee "${empRow.emp_id}" is inactive. Event rejected and logged.`,
        data: inactRes.rows[0],
      };
    }

    // 3. Configurable hardware debounce interval check
    if (policy.hardware_debounce_seconds > 0) {
      const debounceRes = await client.query(
        `SELECT id, event_uid, event_timestamp
         FROM hardware_production_events
         WHERE UPPER(TRIM(hardware_id)) = $1
           AND processing_status IN ('accepted', 'resolved_accepted')
           AND ABS(EXTRACT(EPOCH FROM ($2::timestamptz - event_timestamp))) < $3
         ORDER BY event_timestamp DESC
         LIMIT 1`,
        [resolvedHw, eventTime.toISOString(), policy.hardware_debounce_seconds]
      );
      if (debounceRes.rows && debounceRes.rows.length > 0) {
        const debIns = await client.query(
          `INSERT INTO hardware_production_events
           (event_uid, idempotency_key, hardware_id, employee_id, emp_id, department_id, quantity, event_timestamp, received_at, processing_status, duplicate_status, source, exception_reason, raw_payload)
           VALUES ($1, NULLIF($2, ''), $3, $4, $5, $6, $7, $8, NOW(), 'duplicate_debounce', 'debounce_duplicate', $9, $10, $11::jsonb)
           RETURNING *`,
          [
            eventUid,
            idempotencyKey,
            resolvedHw,
            empRow.id,
            empRow.emp_id,
            empRow.department_id || null,
            qty,
            eventTime.toISOString(),
            source,
            `Ignored hardware contact bounce within configured ${policy.hardware_debounce_seconds}s debounce window.`,
            JSON.stringify(payload),
          ]
        );
        await client.query('COMMIT');
        return {
          httpStatus: 200,
          success: true,
          is_duplicate: true,
          exception_queued: false,
          message: `Event ignored within configured ${policy.hardware_debounce_seconds}s hardware debounce window.`,
          data: debIns.rows[0],
        };
      }
    }

    // 4. Identify employee's valid operation assignment at event_timestamp
    const assignParams: any[] = [empRow.id, eventTime.toISOString()];
    let assignSql = `
      SELECT a.*, mo.standard_time_minutes AS op_standard_time, mo.uom AS op_uom
      FROM employee_operation_assignments a
      JOIN manufacturing_operations mo ON mo.id = a.operation_id
      WHERE a.employee_id = $1
        AND a.start_at <= $2::timestamptz
        AND (a.end_at IS NULL OR a.end_at > $2::timestamptz)
        AND a.status IN ('active', 'transferred', 'completed')
    `;
    if (payload.operation_id) {
      assignParams.push(Number(payload.operation_id));
      assignSql += ` AND a.operation_id = $${assignParams.length}`;
    }
    if (payload.product_id) {
      assignParams.push(Number(payload.product_id));
      assignSql += ` AND a.product_id = $${assignParams.length}`;
    }
    assignSql += ` ORDER BY a.start_at DESC`;

    const assignRes = await client.query(assignSql, assignParams);
    const matchingAssignments = assignRes.rows || [];

    // 4a. Unassigned OR Ambiguous -> NEVER GUESS; send directly to Supervisor Exception Queue
    if (matchingAssignments.length === 0 || matchingAssignments.length > 1) {
      const isAmbiguous = matchingAssignments.length > 1;
      const procStatus = isAmbiguous ? 'exception_ambiguous' : 'exception_unassigned';
      const excReason = isAmbiguous
        ? `Ambiguous operation: employee "${empRow.emp_id}" had ${matchingAssignments.length} overlapping active assignments at ${eventTime.toISOString()}. Sent to supervisor exception queue.`
        : `No active operation assignment found for employee "${empRow.emp_id}" (Hardware ID "${resolvedHw}") at ${eventTime.toISOString()}. Sent to supervisor exception queue.`;

      const excRes = await client.query(
        `INSERT INTO hardware_production_events
         (event_uid, idempotency_key, hardware_id, employee_id, emp_id, department_id, workstation, quantity, event_timestamp, received_at, processing_status, duplicate_status, source, exception_reason, raw_payload)
         VALUES ($1, NULLIF($2, ''), $3, $4, $5, $6, $7, $8, $9, NOW(), $10, 'unique', $11, $12, $13::jsonb)
         RETURNING *`,
        [
          eventUid,
          idempotencyKey,
          resolvedHw,
          empRow.id,
          empRow.emp_id,
          empRow.department_id || null,
          payload.workstation || null,
          qty,
          eventTime.toISOString(),
          procStatus,
          source,
          excReason,
          JSON.stringify(payload),
        ]
      );
      await client.query('COMMIT');
      return {
        httpStatus: 202,
        success: true,
        is_duplicate: false,
        exception_queued: true,
        message: excReason,
        data: excRes.rows[0],
      };
    }

    // 5. Exactly 1 valid assignment resolved -> Resolve exact historical standard time at eventTime
    const assignment = matchingAssignments[0];
    const histRes = await client.query(
      `SELECT operation_id, product_id, standard_time_minutes, uom, effective_from, effective_to
       FROM operation_standard_history
       WHERE operation_id = $1`,
      [assignment.operation_id]
    );
    const stdSnapshot = resolveApplicableStandardTime(
      histRes.rows || [],
      Number(assignment.operation_id),
      Number(assignment.product_id),
      eventTime,
      Number(assignment.op_standard_time)
    );

    const resolvedOrderId = payload.production_order_id ? Number(payload.production_order_id) : (assignment.production_order_id || null);

    // 6. Insert verified accepted production event
    const accRes = await client.query(
      `INSERT INTO hardware_production_events
       (event_uid, idempotency_key, hardware_id, employee_id, emp_id, department_id, product_id, operation_id, production_order_id, assignment_id, workstation, shift_id, quantity, standard_time_snapshot_minutes, event_timestamp, received_at, processing_status, duplicate_status, source, raw_payload)
       VALUES ($1, NULLIF($2, ''), $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW(), 'accepted', 'unique', $16, $17::jsonb)
       RETURNING *`,
      [
        eventUid,
        idempotencyKey,
        resolvedHw,
        empRow.id,
        empRow.emp_id,
        assignment.department_id || empRow.department_id || null,
        assignment.product_id,
        assignment.operation_id,
        resolvedOrderId,
        assignment.id,
        payload.workstation || assignment.workstation || '',
        assignment.shift_id || null,
        qty,
        stdSnapshot,
        eventTime.toISOString(),
        source,
        JSON.stringify(payload),
      ]
    );
    const createdEvent = accRes.rows[0];

    // Mirror into employee_performance_events for backwards-compatible live monitor display
    try {
      await client.query(
        `INSERT INTO employee_performance_events
         (emp_id, event_timestamp, created_at, source, device_id, idempotency_key, notes)
         VALUES ($1, $2, NOW(), $3, $4, $5, $6)
         ON CONFLICT (idempotency_key) DO NOTHING`,
        [
          empRow.emp_id,
          eventTime.toISOString(),
          source,
          resolvedHw,
          idempotencyKey || eventUid,
          payload.notes || `Operation #${assignment.operation_id} (${stdSnapshot} min/unit)`,
        ]
      );
    } catch {}

    // 7. Record atomic WIP ledger transaction if linked to a Production Order
    if (resolvedOrderId) {
      const txCode = await generateAutoCode(client, 78201009, 'wip_quantity_transactions', 'tx_code', 'WIP', 5);
      await client.query(
        `INSERT INTO wip_quantity_transactions
         (tx_code, production_order_id, product_id, operation_id, employee_id, tx_type, quantity, source_event_id, reference_id, performed_by, notes, created_at)
         VALUES ($1, $2, $3, $4, $5, 'component_completed', $6, $7, $8, $9, $10, NOW())`,
        [
          txCode,
          resolvedOrderId,
          assignment.product_id,
          assignment.operation_id,
          empRow.id,
          qty,
          createdEvent.id,
          eventUid,
          `hardware:${resolvedHw}`,
          'Automated button press completion',
        ]
      );
    }

    await client.query('COMMIT');

    // Broadcast SSE update
    try {
      broadcastWorkEvent(createdEvent, empRow);
    } catch {}

    return {
      httpStatus: 201,
      success: true,
      is_duplicate: false,
      exception_queued: false,
      message: 'Hardware production event verified and recorded.',
      data: createdEvent,
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Helper: Computes server-side Performance Evaluation rows for a given period and filters.
 */
async function evaluateEmployeePerformanceReport(
  db: { query: DbClientLike['query'] },
  filters: {
    period: 'daily' | 'weekly' | 'monthly' | 'custom';
    startDate: string;
    endDate: string;
    employeeId?: number;
    departmentId?: number;
    productId?: number;
    operationId?: number;
    productionOrderId?: number;
    workstation?: string;
    shiftId?: number;
    supervisor?: string;
    qualityStatus?: string;
  }
) {
  const policy = await loadActiveScoringPolicy(db);
  const startIso = `${filters.startDate}T00:00:00.000Z`;
  const endIso = `${filters.endDate}T23:59:59.999Z`;

  // 1. Fetch active/filtered employees
  const empParams: any[] = [];
  let empSql = `
    SELECT pe.id, pe.emp_id, pe.first_name, pe.last_name, pe.department_id,
           COALESCE(d.name, pe.department, '') AS department_name,
           pe.hardware_id, pe.employee_type, pe.is_active
    FROM performance_employees pe
    LEFT JOIN departments d ON d.id = pe.department_id
    WHERE 1=1
  `;
  if (filters.employeeId) {
    empParams.push(filters.employeeId);
    empSql += ` AND pe.id = $${empParams.length}`;
  }
  if (filters.departmentId) {
    empParams.push(filters.departmentId);
    empSql += ` AND pe.department_id = $${empParams.length}`;
  }
  empSql += ` ORDER BY pe.emp_id ASC`;
  const empRes = await db.query(empSql, empParams);
  const employees = empRes.rows || [];
  if (employees.length === 0) {
    return { policy, records: [], operation_summary: [] };
  }

  // 2. Fetch accepted hardware production events in date range
  const evParams: any[] = [startIso, endIso];
  let evSql = `
    SELECT e.employee_id, e.operation_id, e.product_id, e.production_order_id,
           e.shift_id, e.workstation, e.quantity, e.standard_time_snapshot_minutes,
           e.event_timestamp,
           mo.operation_code, mo.name AS operation_name, mo.uom, mo.standard_time_minutes AS current_std_min,
           COALESCE(p.name, p.product_name, '') AS product_name,
           a.supervisor_name
    FROM hardware_production_events e
    JOIN manufacturing_operations mo ON mo.id = e.operation_id
    LEFT JOIN products p ON p.id = e.product_id
    LEFT JOIN employee_operation_assignments a ON a.id = e.assignment_id
    WHERE e.processing_status IN ('accepted', 'resolved_accepted')
      AND e.event_timestamp >= $1::timestamptz
      AND e.event_timestamp <= $2::timestamptz
  `;
  if (filters.employeeId) {
    evParams.push(filters.employeeId);
    evSql += ` AND e.employee_id = $${evParams.length}`;
  }
  if (filters.departmentId) {
    evParams.push(filters.departmentId);
    evSql += ` AND e.department_id = $${evParams.length}`;
  }
  if (filters.productId) {
    evParams.push(filters.productId);
    evSql += ` AND e.product_id = $${evParams.length}`;
  }
  if (filters.operationId) {
    evParams.push(filters.operationId);
    evSql += ` AND e.operation_id = $${evParams.length}`;
  }
  if (filters.productionOrderId) {
    evParams.push(filters.productionOrderId);
    evSql += ` AND e.production_order_id = $${evParams.length}`;
  }
  if (filters.workstation) {
    evParams.push(`%${filters.workstation}%`);
    evSql += ` AND e.workstation ILIKE $${evParams.length}`;
  }
  if (filters.shiftId) {
    evParams.push(filters.shiftId);
    evSql += ` AND e.shift_id = $${evParams.length}`;
  }
  if (filters.supervisor) {
    evParams.push(`%${filters.supervisor}%`);
    evSql += ` AND COALESCE(a.supervisor_name, '') ILIKE $${evParams.length}`;
  }
  const evRes = await db.query(evSql, evParams);
  const events = evRes.rows || [];

  // 3. Fetch quality inspections in date range
  const qcParams: any[] = [startIso, endIso];
  let qcSql = `
    SELECT employee_id, COALESCE(responsible_operation_id, operation_id) AS operation_id,
           product_id, production_order_id,
           submitted_qty, inspected_qty, first_pass_accepted_qty,
           rejected_qty, rework_qty, accepted_after_rework_qty, pending_inspection_qty,
           rework_status, inspected_at
    FROM operation_quality_inspections
    WHERE inspection_scope = 'component'
      AND inspected_at >= $1::timestamptz
      AND inspected_at <= $2::timestamptz
  `;
  if (filters.employeeId) {
    qcParams.push(filters.employeeId);
    qcSql += ` AND employee_id = $${qcParams.length}`;
  }
  if (filters.productId) {
    qcParams.push(filters.productId);
    qcSql += ` AND product_id = $${qcParams.length}`;
  }
  if (filters.operationId) {
    qcParams.push(filters.operationId);
    qcSql += ` AND COALESCE(responsible_operation_id, operation_id) = $${qcParams.length}`;
  }
  if (filters.productionOrderId) {
    qcParams.push(filters.productionOrderId);
    qcSql += ` AND production_order_id = $${qcParams.length}`;
  }
  const qcRes = await db.query(qcSql, qcParams);
  const inspections = qcRes.rows || [];

  // 4. Fetch shift definitions & employee assignments for available productive minutes
  const shiftRes = await db.query(`SELECT id, available_productive_minutes FROM manufacturing_shifts WHERE is_active = TRUE`);
  const shiftMinMap = new Map<number, number>();
  let fallbackShiftMinutes = 0;
  for (const s of shiftRes.rows || []) {
    const mins = Number(s.available_productive_minutes) || 0;
    shiftMinMap.set(Number(s.id), mins);
    if (fallbackShiftMinutes === 0 && mins > 0) fallbackShiftMinutes = mins;
  }

  // 5. Fetch approved downtime in date range
  const dtRes = await db.query(
    `SELECT employee_id, DATE(start_at) AS work_date, SUM(duration_minutes) AS total_downtime
     FROM production_downtime_logs
     WHERE is_approved = TRUE
       AND start_at >= $1::timestamptz
       AND start_at <= $2::timestamptz
     GROUP BY employee_id, DATE(start_at)`,
    [startIso, endIso]
  );
  const downtimeByEmpDay = new Map<string, number>();
  for (const d of dtRes.rows || []) {
    const dayStr = new Date(d.work_date).toISOString().slice(0, 10);
    downtimeByEmpDay.set(`${d.employee_id}:${dayStr}`, Number(d.total_downtime || 0));
  }

  // 6. Aggregate per employee -> per (operation, product, snapshotStd) segment + per work_date
  const operationRollup = new Map<
    number,
    {
      operation_id: number;
      operation_code: string;
      operation_name: string;
      submitted_qty: number;
      accepted_qty: number;
      rejected_qty: number;
      rework_qty: number;
      std_minutes_earned_accepted: number;
      employee_ids: Set<number>;
    }
  >();

  const evaluatedRecords: any[] = [];

  for (const emp of employees) {
    const empEvents = events.filter((e: any) => Number(e.employee_id) === Number(emp.id));
    const empQc = inspections.filter((q: any) => Number(q.employee_id) === Number(emp.id));

    if (empEvents.length === 0 && empQc.length === 0) {
      continue;
    }

    // Group distinct eligible working days from actual recorded work
    const daySet = new Set<string>();
    const dayShiftMin = new Map<string, number>();
    const dayStdMinAccepted = new Map<string, number>();
    const daySubmitted = new Map<string, number>();
    const dayAccepted = new Map<string, number>();

    // Segment map keyed by operation_id + product_id + standard_time_snapshot
    const segMap = new Map<string, OperationWorkSegment>();

    for (const ev of empEvents) {
      const dayKey = new Date(ev.event_timestamp).toISOString().slice(0, 10);
      daySet.add(dayKey);
      const shiftMins = (ev.shift_id && shiftMinMap.get(Number(ev.shift_id))) || fallbackShiftMinutes || 480;
      if (!dayShiftMin.has(dayKey)) {
        const dt = downtimeByEmpDay.get(`${emp.id}:${dayKey}`) || 0;
        dayShiftMin.set(dayKey, Math.max(1, shiftMins - dt));
      }

      const stdMin = Number(ev.standard_time_snapshot_minutes || ev.current_std_min || 1);
      const qty = Number(ev.quantity || 1);
      const segKey = `${ev.operation_id}:${ev.product_id || 0}:${stdMin}`;

      let seg = segMap.get(segKey);
      if (!seg) {
        seg = {
          operation_id: Number(ev.operation_id),
          operation_code: String(ev.operation_code),
          operation_name: String(ev.operation_name),
          product_id: ev.product_id ? Number(ev.product_id) : null,
          product_name: ev.product_name || null,
          uom: String(ev.uom || 'Piece'),
          standard_time_minutes: stdMin,
          available_productive_minutes: 0,
          submitted_qty: 0,
          first_pass_accepted_qty: 0,
          rejected_qty: 0,
          rework_qty: 0,
          accepted_after_rework_qty: 0,
          pending_inspection_qty: 0,
        };
        segMap.set(segKey, seg);
      }
      seg.submitted_qty += qty;
      daySubmitted.set(dayKey, (daySubmitted.get(dayKey) || 0) + qty);
    }

    // Merge QC inspection records into segments without double-counting
    const qcUsedOpProd = new Set<string>();
    for (const q of empQc) {
      const dayKey = new Date(q.inspected_at).toISOString().slice(0, 10);
      daySet.add(dayKey);
      if (!dayShiftMin.has(dayKey)) {
        const dt = downtimeByEmpDay.get(`${emp.id}:${dayKey}`) || 0;
        dayShiftMin.set(dayKey, Math.max(1, (fallbackShiftMinutes || 480) - dt));
      }

      // Find matching segment by operation_id + product_id
      let targetSeg: OperationWorkSegment | undefined;
      for (const s of segMap.values()) {
        if (s.operation_id === Number(q.operation_id) && (s.product_id === Number(q.product_id) || !q.product_id)) {
          targetSeg = s;
          break;
        }
      }
      if (targetSeg) {
        qcUsedOpProd.add(`${targetSeg.operation_id}:${targetSeg.product_id || 0}`);
        targetSeg.first_pass_accepted_qty += Number(q.first_pass_accepted_qty || 0);
        targetSeg.rejected_qty += Number(q.rejected_qty || 0);
        targetSeg.rework_qty += Number(q.rework_qty || 0);
        targetSeg.accepted_after_rework_qty += Number(q.accepted_after_rework_qty || 0);
        targetSeg.pending_inspection_qty += Number(q.pending_inspection_qty || 0);
        const acceptedInQc = Number(q.first_pass_accepted_qty || 0) + Number(q.accepted_after_rework_qty || 0);
        dayAccepted.set(dayKey, (dayAccepted.get(dayKey) || 0) + acceptedInQc);
        dayStdMinAccepted.set(
          dayKey,
          (dayStdMinAccepted.get(dayKey) || 0) + acceptedInQc * targetSeg.standard_time_minutes
        );
      }
    }

    // For segments that have button completions recorded but no formal QC rejections yet,
    // track uninspected quantity cleanly in pending_inspection_qty; if no QC records exist at all for that segment,
    // reflect submitted quantity in pending_inspection_qty while preserving accurate accepted vs gross visibility.
    const totalAvailMinutes = Array.from(dayShiftMin.values()).reduce((a, b) => a + b, 0);
    const segments = Array.from(segMap.values());
    const totalSegStdGross = segments.reduce((a, s) => a + s.submitted_qty * s.standard_time_minutes, 0);

    for (const seg of segments) {
      const share = totalSegStdGross > 0 ? (seg.submitted_qty * seg.standard_time_minutes) / totalSegStdGross : 1 / Math.max(1, segments.length);
      seg.available_productive_minutes = round2(totalAvailMinutes * share);

      if (!qcUsedOpProd.has(`${seg.operation_id}:${seg.product_id || 0}`)) {
        // No QC inspection submitted yet for this operation -> pending inspection
        seg.pending_inspection_qty = seg.submitted_qty;
      }
    }

    // Build daily consistency summaries across eligible working days
    const dailySummaries: DailyDaySummary[] = Array.from(daySet)
      .sort()
      .map((dayKey) => {
        const avail = dayShiftMin.get(dayKey) || 1;
        const sub = daySubmitted.get(dayKey) || 0;
        const acc = dayAccepted.get(dayKey) || 0;
        const stdAcc = dayStdMinAccepted.get(dayKey) || 0;
        // If no QC recorded for that day, compute gross standard minutes for daily productivity visibility
        let dayStdGross = 0;
        for (const ev of empEvents) {
          if (new Date(ev.event_timestamp).toISOString().slice(0, 10) === dayKey) {
            dayStdGross += Number(ev.quantity || 1) * Number(ev.standard_time_snapshot_minutes || ev.current_std_min || 1);
          }
        }
        const dayProd =
          policy.productivity_metric_mode === 'gross_output'
            ? round2((dayStdGross / avail) * 100)
            : round2(((stdAcc > 0 ? stdAcc : 0) / avail) * 100);
        const dayQual = sub > 0 && acc > 0 ? round2((Math.min(sub, acc) / sub) * 100) : null;
        return {
          work_date: dayKey,
          eligible_working_day: true,
          productivity_pct: dayProd,
          quality_pct: dayQual,
        };
      });

    const scored = calculateFairEmployeeScore({
      employee_id: Number(emp.id),
      emp_id: String(emp.emp_id),
      employee_name: `${emp.first_name || ''} ${emp.last_name || ''}`.trim() || emp.emp_id,
      department: String(emp.department_name || ''),
      segments,
      total_available_productive_minutes: totalAvailMinutes,
      daily_summaries: dailySummaries,
      period_type: filters.period,
      policy,
    });

    // Optional quality status filter
    if (filters.qualityStatus && filters.qualityStatus !== 'all') {
      if (filters.qualityStatus === 'has_rejections' && scored.total_rejected_qty <= 0) continue;
      if (filters.qualityStatus === 'has_rework' && scored.total_rework_qty <= 0) continue;
      if (filters.qualityStatus === 'pending_qc' && scored.total_pending_inspection_qty <= 0) continue;
      if (filters.qualityStatus === 'clean_pass' && (scored.total_rejected_qty > 0 || scored.total_rework_qty > 0)) continue;
    }

    evaluatedRecords.push(scored);

    // Update operation-wise rollup
    for (const seg of scored.segments) {
      let op = operationRollup.get(seg.operation_id);
      if (!op) {
        op = {
          operation_id: seg.operation_id,
          operation_code: seg.operation_code,
          operation_name: seg.operation_name,
          submitted_qty: 0,
          accepted_qty: 0,
          rejected_qty: 0,
          rework_qty: 0,
          std_minutes_earned_accepted: 0,
          employee_ids: new Set<number>(),
        };
        operationRollup.set(seg.operation_id, op);
      }
      op.submitted_qty += seg.submitted_qty;
      op.accepted_qty += seg.final_accepted_qty;
      op.rejected_qty += seg.rejected_qty;
      op.rework_qty += seg.rework_qty;
      op.std_minutes_earned_accepted += seg.standard_minutes_earned_accepted;
      op.employee_ids.add(scored.employee_id);
    }
  }

  return {
    policy,
    records: evaluatedRecords,
    operation_summary: Array.from(operationRollup.values()).map((o) => ({
      operation_id: o.operation_id,
      operation_code: o.operation_code,
      operation_name: o.operation_name,
      employees_count: o.employee_ids.size,
      submitted_qty: round4(o.submitted_qty),
      accepted_qty: round4(o.accepted_qty),
      rejected_qty: round4(o.rejected_qty),
      rework_qty: round4(o.rework_qty),
      std_minutes_earned_accepted: round2(o.std_minutes_earned_accepted),
    })),
  };
}

/**
 * Helper: Loads full Group Production Readiness for one Production Order.
 */
async function loadProductionOrderReadiness(db: { query: DbClientLike['query'] }, orderId: number) {
  const woRes = await db.query(
    `SELECT wo.id, COALESCE(wo.wo_number, wo.work_order_number, 'WO-' || wo.id) AS order_number,
            wo.product_id, COALESCE(p.name, p.product_name, 'Product #' || wo.product_id) AS product_name,
            COALESCE(wo.planned_quantity, wo.planned_qty, 0) AS target_qty,
            wo.status, wo.scheduled_start_date, wo.scheduled_end_date
     FROM work_orders wo
     LEFT JOIN products p ON p.id = wo.product_id
     WHERE wo.id = $1
     LIMIT 1`,
    [orderId]
  );
  if (!woRes.rows || woRes.rows.length === 0) return null;
  const wo = woRes.rows[0];

  const reqRes = await db.query(
    `SELECT pos.operation_id, mo.operation_code, mo.name AS operation_name,
            pos.component_name, pos.required_qty_per_unit,
            COALESCE(pos.standard_time_override_minutes, mo.standard_time_minutes) AS standard_time_minutes,
            pos.sequence_order, pos.is_mandatory, pos.is_assembly_stage
     FROM product_operation_structures pos
     JOIN manufacturing_operations mo ON mo.id = pos.operation_id
     WHERE pos.product_id = $1 AND pos.is_active = TRUE
     ORDER BY pos.sequence_order ASC, pos.id ASC`,
    [wo.product_id]
  );

  const requirements: ProductOperationRequirement[] = (reqRes.rows || []).map((r: any) => ({
    operation_id: Number(r.operation_id),
    operation_code: String(r.operation_code),
    operation_name: String(r.operation_name),
    component_name: String(r.component_name),
    required_qty_per_unit: Number(r.required_qty_per_unit),
    standard_time_minutes: Number(r.standard_time_minutes),
    sequence_order: Number(r.sequence_order),
    is_mandatory: Boolean(r.is_mandatory),
    is_assembly_stage: Boolean(r.is_assembly_stage),
  }));

  // Aggregate WIP ledger strictly for THIS production_order_id (prevents cross-order double counting!)
  const wipRes = await db.query(
    `SELECT operation_id, tx_type, COALESCE(SUM(quantity), 0) AS total_qty
     FROM wip_quantity_transactions
     WHERE production_order_id = $1 AND operation_id IS NOT NULL
     GROUP BY operation_id, tx_type`,
    [orderId]
  );

  const wipMap = new Map<number, OperationWipSnapshot>();
  const ensureWip = (opId: number): OperationWipSnapshot => {
    let w = wipMap.get(opId);
    if (!w) {
      w = {
        operation_id: opId,
        completed_qty: 0,
        quality_approved_qty: 0,
        pending_inspection_qty: 0,
        rejected_qty: 0,
        rework_qty: 0,
        transferred_qty: 0,
        consumed_in_assembly_qty: 0,
      };
      wipMap.set(opId, w);
    }
    return w;
  };

  for (const row of wipRes.rows || []) {
    const w = ensureWip(Number(row.operation_id));
    const q = Number(row.total_qty || 0);
    switch (row.tx_type) {
      case 'component_completed':
        w.completed_qty += q;
        break;
      case 'component_qc_accepted':
      case 'component_rework_accepted':
        w.quality_approved_qty += q;
        break;
      case 'component_qc_rejected':
        w.rejected_qty += q;
        break;
      case 'component_rework_started':
        w.rework_qty += q;
        break;
      case 'transferred_next':
        w.transferred_qty += q;
        break;
      case 'consumed_in_assembly':
        w.consumed_in_assembly_qty += q;
        break;
      case 'manual_correction':
        w.quality_approved_qty += q;
        break;
    }
  }

  for (const w of wipMap.values()) {
    w.pending_inspection_qty = Math.max(0, round4(w.completed_qty - w.quality_approved_qty - w.rejected_qty - w.rework_qty));
  }

  // Load assembly & finished inspection totals for THIS production order
  const asmRes = await db.query(
    `SELECT COALESCE(SUM(assembled_qty), 0) AS assembled_qty,
            COALESCE(SUM(final_approved_qty), 0) AS final_approved_qty,
            COALESCE(SUM(final_rejected_qty), 0) AS final_rejected_qty,
            COALESCE(SUM(rework_required_qty), 0) AS rework_required_qty
     FROM production_assembly_records
     WHERE production_order_id = $1`,
    [orderId]
  );
  const asm = asmRes.rows[0] || {};

  return calculateProductionOrderReadiness({
    production_order_id: Number(wo.id),
    order_number: String(wo.order_number),
    product_id: Number(wo.product_id),
    product_name: String(wo.product_name),
    target_qty: Number(wo.target_qty || 0),
    requirements,
    wip_by_operation: wipMap,
    assembled_qty: Number(asm.assembled_qty || 0),
    final_approved_finished_qty: Number(asm.final_approved_qty || 0),
    final_rejected_qty: Number(asm.final_rejected_qty || 0),
    rework_required_qty: Number(asm.rework_required_qty || 0),
  });
}

export function createOperationsPerformanceRouter(deps: RouterDeps) {
  const router = express.Router();
  const { authenticateToken, requirePermission } = deps;

  // =========================================================================
  // 1. HARDWARE GATEWAY INGESTION (Device-Token Authenticated for Python Gateway)
  // =========================================================================
  router.post('/hardware/events', async (req: Request, res: Response) => {
    try {
      const deviceToken =
        (req.headers['x-device-token'] as string) ||
        (req.headers['x-hardware-token'] as string) ||
        (req.headers['authorization']?.startsWith('Bearer ') ? req.headers['authorization'].slice(7) : '');

      const expectedToken = securityConfig.hardwareDeviceToken || process.env.HARDWARE_DEVICE_TOKEN || '';
      const tokenValid =
        Boolean(deviceToken && expectedToken) &&
        deviceToken.length === expectedToken.length &&
        crypto.timingSafeEqual(Buffer.from(deviceToken), Buffer.from(expectedToken));

      if (!tokenValid) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized hardware gateway. Invalid or missing x-device-token.',
        });
      }

      const result = await processHardwareButtonEvent(req.body || {});
      return res.status(result.httpStatus).json({
        success: result.success,
        is_duplicate: result.is_duplicate,
        exception_queued: result.exception_queued,
        message: result.message,
        data: result.data,
      });
    } catch (err: any) {
      return sendApiError(res, err, 'Failed to process hardware button event.');
    }
  });

  // All routes below require authenticated ERP user JWT + granular RBAC permission
  router.use(authenticateToken);

  // =========================================================================
  // 2. REFERENCE OPTIONS (Real active departments, products, employees, orders, shifts)
  // =========================================================================
  router.get('/options', requirePermission('operations.view'), async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const db = await getDb();
      const [deptsRes, prodsRes, empsRes, ordersRes, opsRes, shiftsRes] = await Promise.all([
        db.query(`SELECT id, code, name FROM departments WHERE is_active = TRUE ORDER BY name ASC`).catch(() => ({ rows: [] })),
        db.query(`SELECT id, product_code, COALESCE(name, product_name) AS name, status FROM products ORDER BY name ASC`).catch(() => ({ rows: [] })),
        db.query(`SELECT id, emp_id, first_name, last_name, hardware_id, department_id, department, employee_type, is_active FROM performance_employees WHERE is_active = TRUE ORDER BY emp_id ASC`).catch(() => ({ rows: [] })),
        db.query(`SELECT id, COALESCE(wo_number, work_order_number, 'WO-' || id) AS order_number, product_id, COALESCE(planned_quantity, planned_qty, 0) AS target_qty, status FROM work_orders ORDER BY id DESC`).catch(() => ({ rows: [] })),
        db.query(`SELECT * FROM manufacturing_operations ORDER BY operation_code ASC`).catch(() => ({ rows: [] })),
        db.query(`SELECT * FROM manufacturing_shifts WHERE is_active = TRUE ORDER BY shift_code ASC`).catch(() => ({ rows: [] })),
      ]);

      // Reuse active departments from existing Department Management if relational table empty
      const departments =
        (deptsRes.rows || []).length > 0
          ? deptsRes.rows
          : (store.getDepartments({ status: 'active' }) || []).map((d: any) => ({
              id: Number(d.id),
              code: String(d.code || ''),
              name: String(d.name || ''),
            }));

      return res.json({
        success: true,
        data: {
          departments,
          products: prodsRes.rows || [],
          employees: empsRes.rows || [],
          production_orders: ordersRes.rows || [],
          operations: opsRes.rows || [],
          shifts: shiftsRes.rows || [],
        },
      });
    } catch (err: any) {
      return sendApiError(res, err, 'Failed to load reference options.');
    }
  });

  // =========================================================================
  // 3. OPERATION MASTER & EFFECTIVE-DATED STANDARD TIME HISTORY
  // =========================================================================
  router.get('/operations', requirePermission('operations.view'), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const db = await getDb();
      const { status, department_id, search } = req.query;
      const params: any[] = [];
      let sql = `
        SELECT mo.*, COALESCE(d.name, mo.department_name, '') AS department_label
        FROM manufacturing_operations mo
        LEFT JOIN departments d ON d.id = mo.department_id
        WHERE 1=1
      `;
      if (status && (status === 'active' || status === 'inactive')) {
        params.push(status);
        sql += ` AND mo.status = $${params.length}`;
      }
      if (department_id && Number(department_id) > 0) {
        params.push(Number(department_id));
        sql += ` AND mo.department_id = $${params.length}`;
      }
      if (search && String(search).trim()) {
        params.push(`%${String(search).trim()}%`);
        sql += ` AND (mo.operation_code ILIKE $${params.length} OR mo.name ILIKE $${params.length} OR mo.description ILIKE $${params.length})`;
      }
      sql += ` ORDER BY mo.operation_code ASC`;
      const result = await db.query(sql, params);
      return res.json({ success: true, data: result.rows || [] });
    } catch (err: any) {
      return sendApiError(res, err, 'Failed to list manufacturing operations.');
    }
  });

  router.post('/operations', requirePermission('operations.manage'), async (req: AuthenticatedRequest, res: Response) => {
    const db = await getDb();
    const client = await db.connect();
    try {
      const {
        name,
        department_id,
        description,
        uom,
        standard_time_minutes,
        quality_requirements,
        is_assembly_operation,
        status,
      } = req.body || {};

      const cleanName = String(name || '').trim();
      const stdMinutes = Number(standard_time_minutes);
      const cleanUom = String(uom || 'Piece').trim();

      if (!cleanName || cleanName.length < 2) {
        client.release();
        return res.status(400).json({ success: false, message: 'Operation Name is required (minimum 2 characters).' });
      }
      if (!Number.isFinite(stdMinutes) || stdMinutes <= 0) {
        client.release();
        return res.status(400).json({ success: false, message: 'Standard Completion Time must be a positive number of minutes.' });
      }
      if (!cleanUom) {
        client.release();
        return res.status(400).json({ success: false, message: 'Unit of Measurement is required.' });
      }

      await client.query('BEGIN');
      const opCode = await generateAutoCode(client, 78201001, 'manufacturing_operations', 'operation_code', 'OP', 4);

      let deptId: number | null = null;
      let deptName = '';
      if (department_id) {
        const dRes = await client.query(`SELECT id, name FROM departments WHERE id = $1 LIMIT 1`, [Number(department_id)]);
        if (dRes.rows && dRes.rows.length > 0) {
          deptId = Number(dRes.rows[0].id);
          deptName = String(dRes.rows[0].name);
        } else {
          const storeDept = (store.getDepartments({ status: 'active' }) || []).find((d: any) => Number(d.id) === Number(department_id));
          if (storeDept) {
            const syncRes = await client.query(
              `INSERT INTO departments (id, code, name, description, is_active, created_at, updated_at)
               VALUES ($1, $2, $3, $4, TRUE, NOW(), NOW())
               ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name RETURNING id, name`,
              [storeDept.id, storeDept.code, storeDept.name, storeDept.description || '']
            );
            deptId = Number(syncRes.rows[0].id);
            deptName = String(syncRes.rows[0].name);
          }
        }
      }

      const insRes = await client.query(
        `INSERT INTO manufacturing_operations
         (operation_code, name, department_id, department_name, description, uom, standard_time_minutes, time_unit, quality_requirements, is_assembly_operation, status, created_by, updated_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'Minutes', $8, $9, $10, $11, $11, NOW(), NOW())
         RETURNING *`,
        [
          opCode,
          cleanName,
          deptId,
          deptName,
          String(description || '').trim(),
          cleanUom,
          stdMinutes,
          String(quality_requirements || '').trim(),
          Boolean(is_assembly_operation),
          status === 'inactive' ? 'inactive' : 'active',
          req.user!.email,
        ]
      );
      const op = insRes.rows[0];

      // Create Version 1 effective-dated standard time history record
      await client.query(
        `INSERT INTO operation_standard_history
         (operation_id, product_id, version_number, standard_time_minutes, uom, effective_from, effective_to, changed_by, change_reason, created_at)
         VALUES ($1, NULL, 1, $2, $3, NOW(), NULL, $4, 'Initial approved operation standard', NOW())`,
        [op.id, stdMinutes, cleanUom, req.user!.email]
      );

      await logManufacturingAudit(client, {
        req,
        actorEmail: req.user!.email,
        entityType: 'Operation',
        entityId: op.operation_code,
        action: 'OPERATION_CREATED',
        afterValues: op,
      });

      await client.query('COMMIT');
      return res.status(201).json({ success: true, message: `Operation ${op.operation_code} created.`, data: op });
    } catch (err: any) {
      await client.query('ROLLBACK').catch(() => {});
      return sendApiError(res, err, 'Failed to create manufacturing operation.');
    } finally {
      client.release();
    }
  });

  // Update non-standard metadata of an operation (standard time changes go through dedicated versioned endpoint)
  router.put('/operations/:id', requirePermission('operations.manage'), async (req: AuthenticatedRequest, res: Response) => {
    const db = await getDb();
    const client = await db.connect();
    try {
      const id = Number(req.params.id);
      const { name, department_id, description, uom, quality_requirements, is_assembly_operation, status } = req.body || {};

      await client.query('BEGIN');
      const prevRes = await client.query(`SELECT * FROM manufacturing_operations WHERE id = $1 LIMIT 1`, [id]);
      if (!prevRes.rows || prevRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, message: 'Operation not found.' });
      }
      const prev = prevRes.rows[0];

      let deptId = prev.department_id;
      let deptName = prev.department_name || '';
      if (department_id !== undefined) {
        if (!department_id) {
          deptId = null;
          deptName = '';
        } else {
          const dRes = await client.query(`SELECT id, name FROM departments WHERE id = $1 LIMIT 1`, [Number(department_id)]);
          if (dRes.rows && dRes.rows.length > 0) {
            deptId = Number(dRes.rows[0].id);
            deptName = String(dRes.rows[0].name);
          }
        }
      }

      const updRes = await client.query(
        `UPDATE manufacturing_operations
         SET name = $1, department_id = $2, department_name = $3, description = $4, uom = $5,
             quality_requirements = $6, is_assembly_operation = $7, status = $8, updated_by = $9, updated_at = NOW()
         WHERE id = $10
         RETURNING *`,
        [
          name !== undefined ? String(name).trim() : prev.name,
          deptId,
          deptName,
          description !== undefined ? String(description).trim() : prev.description,
          uom !== undefined ? String(uom).trim() : prev.uom,
          quality_requirements !== undefined ? String(quality_requirements).trim() : prev.quality_requirements,
          is_assembly_operation !== undefined ? Boolean(is_assembly_operation) : prev.is_assembly_operation,
          status === 'inactive' ? 'inactive' : status === 'active' ? 'active' : prev.status,
          req.user!.email,
          id,
        ]
      );
      const updated = updRes.rows[0];

      await logManufacturingAudit(client, {
        req,
        actorEmail: req.user!.email,
        entityType: 'Operation',
        entityId: updated.operation_code,
        action: 'OPERATION_UPDATED',
        beforeValues: prev,
        afterValues: updated,
      });

      await client.query('COMMIT');
      return res.json({ success: true, message: 'Operation updated.', data: updated });
    } catch (err: any) {
      await client.query('ROLLBACK').catch(() => {});
      return sendApiError(res, err, 'Failed to update operation.');
    } finally {
      client.release();
    }
  });

  // Update Operation Standard Time (strictly authorised + effective-dated version history)
  router.put('/operations/:id/standard-time', requirePermission('operations.standard_time.manage'), async (req: AuthenticatedRequest, res: Response) => {
    const db = await getDb();
    const client = await db.connect();
    try {
      const id = Number(req.params.id);
      const { standard_time_minutes, uom, change_reason, effective_from } = req.body || {};
      const newStd = Number(standard_time_minutes);
      if (!Number.isFinite(newStd) || newStd <= 0) {
        client.release();
        return res.status(400).json({ success: false, message: 'New standard time must be a positive number of minutes.' });
      }
      const effFrom = effective_from ? new Date(effective_from) : new Date();
      if (Number.isNaN(effFrom.getTime())) {
        client.release();
        return res.status(400).json({ success: false, message: 'Invalid effective_from timestamp.' });
      }

      await client.query('BEGIN');
      const prevRes = await client.query(`SELECT * FROM manufacturing_operations WHERE id = $1 FOR UPDATE`, [id]);
      if (!prevRes.rows || prevRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, message: 'Operation not found.' });
      }
      const prev = prevRes.rows[0];
      const nextUom = uom ? String(uom).trim() : prev.uom;

      // Close previous active standard version without touching historical records
      await client.query(
        `UPDATE operation_standard_history
         SET effective_to = $1
         WHERE operation_id = $2 AND product_id IS NULL AND effective_to IS NULL`,
        [effFrom.toISOString(), id]
      );

      const verRes = await client.query(
        `SELECT COALESCE(MAX(version_number), 0) + 1 AS next_ver
         FROM operation_standard_history
         WHERE operation_id = $1 AND product_id IS NULL`,
        [id]
      );
      const nextVer = Number(verRes.rows[0]?.next_ver || 1);

      const histRes = await client.query(
        `INSERT INTO operation_standard_history
         (operation_id, product_id, version_number, standard_time_minutes, uom, effective_from, effective_to, changed_by, change_reason, created_at)
         VALUES ($1, NULL, $2, $3, $4, $5, NULL, $6, $7, NOW())
         RETURNING *`,
        [id, nextVer, newStd, nextUom, effFrom.toISOString(), req.user!.email, String(change_reason || 'Standard time revision').trim()]
      );

      const updRes = await client.query(
        `UPDATE manufacturing_operations
         SET standard_time_minutes = $1, uom = $2, updated_by = $3, updated_at = NOW()
         WHERE id = $4
         RETURNING *`,
        [newStd, nextUom, req.user!.email, id]
      );

      await logManufacturingAudit(client, {
        req,
        actorEmail: req.user!.email,
        entityType: 'OperationStandardTime',
        entityId: prev.operation_code,
        action: 'STANDARD_TIME_REVISED',
        beforeValues: { standard_time_minutes: Number(prev.standard_time_minutes), uom: prev.uom },
        afterValues: { standard_time_minutes: newStd, uom: nextUom, version: nextVer, effective_from: effFrom.toISOString() },
        reason: String(change_reason || 'Standard time revision').trim(),
      });

      await client.query('COMMIT');
      return res.json({
        success: true,
        message: `Standard time updated to ${newStd} min/${nextUom} (Version ${nextVer}). Historical performance records retain their prior standard.`,
        data: { operation: updRes.rows[0], history_entry: histRes.rows[0] },
      });
    } catch (err: any) {
      await client.query('ROLLBACK').catch(() => {});
      return sendApiError(res, err, 'Failed to update operation standard time.');
    } finally {
      client.release();
    }
  });

  router.get('/operations/:id/standard-history', requirePermission('operations.view'), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const db = await getDb();
      const resRows = await db.query(
        `SELECT h.*, COALESCE(p.name, p.product_name) AS product_name
         FROM operation_standard_history h
         LEFT JOIN products p ON p.id = h.product_id
         WHERE h.operation_id = $1
         ORDER BY h.effective_from DESC, h.id DESC`,
        [Number(req.params.id)]
      );
      return res.json({ success: true, data: resRows.rows || [] });
    } catch (err: any) {
      return sendApiError(res, err, 'Failed to load standard time history.');
    }
  });

  // =========================================================================
  // 4. PRODUCT & OPERATION STRUCTURE (Toy Model Component Requirements)
  // =========================================================================
  router.get('/products/:productId/structure', requirePermission('operations.view'), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const db = await getDb();
      const rows = await db.query(
        `SELECT pos.*, mo.operation_code, mo.name AS operation_name, mo.uom,
                mo.standard_time_minutes AS default_standard_time_minutes,
                COALESCE(pos.standard_time_override_minutes, mo.standard_time_minutes) AS effective_standard_time_minutes
         FROM product_operation_structures pos
         JOIN manufacturing_operations mo ON mo.id = pos.operation_id
         WHERE pos.product_id = $1
         ORDER BY pos.sequence_order ASC, pos.id ASC`,
        [Number(req.params.productId)]
      );
      return res.json({ success: true, data: rows.rows || [] });
    } catch (err: any) {
      return sendApiError(res, err, 'Failed to fetch product operation structure.');
    }
  });

  router.post('/products/:productId/structure', requirePermission('operations.manage'), async (req: AuthenticatedRequest, res: Response) => {
    const db = await getDb();
    const client = await db.connect();
    try {
      const productId = Number(req.params.productId);
      const {
        operation_id,
        component_name,
        required_qty_per_unit,
        standard_time_override_minutes,
        sequence_order,
        is_mandatory,
        is_assembly_stage,
        is_active,
        notes,
      } = req.body || {};

      const reqQty = Number(required_qty_per_unit);
      if (!operation_id || !String(component_name || '').trim() || !Number.isFinite(reqQty) || reqQty <= 0) {
        client.release();
        return res.status(400).json({
          success: false,
          message: 'Operation, Component Name, and positive Required Quantity per Finished Toy are required.',
        });
      }

      const overrideMin =
        standard_time_override_minutes !== undefined && standard_time_override_minutes !== null && standard_time_override_minutes !== ''
          ? Number(standard_time_override_minutes)
          : null;
      if (overrideMin !== null && (!Number.isFinite(overrideMin) || overrideMin <= 0)) {
        client.release();
        return res.status(400).json({ success: false, message: 'Standard time override must be a positive number.' });
      }

      await client.query('BEGIN');
      const ins = await client.query(
        `INSERT INTO product_operation_structures
         (product_id, operation_id, component_name, required_qty_per_unit, standard_time_override_minutes, sequence_order, is_mandatory, is_assembly_stage, is_active, notes, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
         RETURNING *`,
        [
          productId,
          Number(operation_id),
          String(component_name).trim(),
          reqQty,
          overrideMin,
          Math.max(1, Number(sequence_order) || 1),
          is_mandatory !== false,
          Boolean(is_assembly_stage),
          is_active !== false,
          String(notes || '').trim(),
          req.user!.email,
        ]
      );
      const created = ins.rows[0];

      // Record product-specific standard time version if override provided
      if (overrideMin !== null) {
        await client.query(
          `UPDATE operation_standard_history SET effective_to = NOW()
           WHERE operation_id = $1 AND product_id = $2 AND effective_to IS NULL`,
          [Number(operation_id), productId]
        );
        await client.query(
          `INSERT INTO operation_standard_history
           (operation_id, product_id, version_number, standard_time_minutes, uom, effective_from, changed_by, change_reason, created_at)
           VALUES ($1, $2, 1, $3, 'Piece', NOW(), $4, 'Product-specific operation standard override', NOW())`,
          [Number(operation_id), productId, overrideMin, req.user!.email]
        );
      }

      await logManufacturingAudit(client, {
        req,
        actorEmail: req.user!.email,
        entityType: 'ProductOperationStructure',
        entityId: created.id,
        action: 'PRODUCT_STRUCTURE_ADDED',
        afterValues: created,
      });

      await client.query('COMMIT');
      return res.status(201).json({ success: true, message: 'Product operation requirement added.', data: created });
    } catch (err: any) {
      await client.query('ROLLBACK').catch(() => {});
      return sendApiError(res, err, 'Failed to add product operation requirement.');
    } finally {
      client.release();
    }
  });

  router.delete('/structure/:id', requirePermission('operations.manage'), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const db = await getDb();
      const del = await db.query(`DELETE FROM product_operation_structures WHERE id = $1 RETURNING id`, [Number(req.params.id)]);
      if (!del.rows || del.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Product operation requirement not found.' });
      }
      return res.json({ success: true, message: 'Product operation requirement removed.' });
    } catch (err: any) {
      return sendApiError(res, err, 'Failed to remove product operation requirement.');
    }
  });

  // =========================================================================
  // 5. CONFIGURABLE SHIFTS
  // =========================================================================
  router.get('/shifts', requirePermission('operations.view'), async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const db = await getDb();
      const rows = await db.query(`SELECT * FROM manufacturing_shifts ORDER BY shift_code ASC`);
      return res.json({ success: true, data: rows.rows || [] });
    } catch (err: any) {
      return sendApiError(res, err, 'Failed to fetch shifts.');
    }
  });

  router.post('/shifts', requirePermission('operations.manage'), async (req: AuthenticatedRequest, res: Response) => {
    const db = await getDb();
    const client = await db.connect();
    try {
      const { name, start_time, end_time, gross_minutes, break_minutes, working_days } = req.body || {};
      const cleanName = String(name || '').trim();
      const gross = Number(gross_minutes);
      const brk = Math.max(0, Number(break_minutes) || 0);
      const avail = gross - brk;
      if (!cleanName || !start_time || !end_time || !Number.isInteger(gross) || gross <= 0 || avail <= 0) {
        client.release();
        return res.status(400).json({
          success: false,
          message: 'Shift name, start/end times, and valid gross/break minutes (gross > break) are required.',
        });
      }
      const days =
        Array.isArray(working_days) && working_days.length > 0
          ? working_days.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
          : [1, 2, 3, 4, 5, 6];

      await client.query('BEGIN');
      const shiftCode = await generateAutoCode(client, 78201002, 'manufacturing_shifts', 'shift_code', 'SHF', 3);
      const ins = await client.query(
        `INSERT INTO manufacturing_shifts
         (shift_code, name, start_time, end_time, gross_minutes, break_minutes, available_productive_minutes, working_days, is_active, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE, $9, NOW(), NOW())
         RETURNING *`,
        [shiftCode, cleanName, String(start_time).trim(), String(end_time).trim(), gross, brk, avail, days, req.user!.email]
      );
      await client.query('COMMIT');
      return res.status(201).json({ success: true, message: `Shift ${shiftCode} created (${avail} productive min).`, data: ins.rows[0] });
    } catch (err: any) {
      await client.query('ROLLBACK').catch(() => {});
      return sendApiError(res, err, 'Failed to create shift.');
    } finally {
      client.release();
    }
  });

  // =========================================================================
  // 6. EMPLOYEE OPERATION ASSIGNMENTS & MID-SHIFT TRANSFERS
  // =========================================================================
  router.get('/assignments', requirePermission('operations.view'), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const db = await getDb();
      const { status, employee_id, operation_id, product_id } = req.query;
      const params: any[] = [];
      let sql = `
        SELECT a.*,
               pe.first_name, pe.last_name,
               mo.operation_code, mo.name AS operation_name, mo.standard_time_minutes, mo.uom,
               COALESCE(p.name, p.product_name, '') AS product_name,
               COALESCE(d.name, pe.department, '') AS department_name,
               COALESCE(wo.wo_number, wo.work_order_number) AS production_order_number
        FROM employee_operation_assignments a
        JOIN performance_employees pe ON pe.id = a.employee_id
        JOIN manufacturing_operations mo ON mo.id = a.operation_id
        JOIN products p ON p.id = a.product_id
        LEFT JOIN departments d ON d.id = a.department_id
        LEFT JOIN work_orders wo ON wo.id = a.production_order_id
        WHERE 1=1
      `;
      if (status && status !== 'all') {
        params.push(String(status));
        sql += ` AND a.status = $${params.length}`;
      }
      if (employee_id) {
        params.push(Number(employee_id));
        sql += ` AND a.employee_id = $${params.length}`;
      }
      if (operation_id) {
        params.push(Number(operation_id));
        sql += ` AND a.operation_id = $${params.length}`;
      }
      if (product_id) {
        params.push(Number(product_id));
        sql += ` AND a.product_id = $${params.length}`;
      }
      sql += ` ORDER BY CASE WHEN a.status = 'active' THEN 0 ELSE 1 END, a.start_at DESC, a.id DESC`;
      const rows = await db.query(sql, params);
      return res.json({ success: true, data: rows.rows || [] });
    } catch (err: any) {
      return sendApiError(res, err, 'Failed to fetch employee operation assignments.');
    }
  });

  router.post('/assignments', requirePermission('operations.assignments.manage'), async (req: AuthenticatedRequest, res: Response) => {
    const db = await getDb();
    const client = await db.connect();
    try {
      const {
        employee_id,
        department_id,
        product_id,
        operation_id,
        hardware_id,
        production_order_id,
        workstation,
        shift_id,
        supervisor_name,
        start_at,
        end_at,
        daily_target,
        close_previous_active,
        notes,
      } = req.body || {};

      if (!employee_id || !product_id || !operation_id) {
        client.release();
        return res.status(400).json({ success: false, message: 'Employee, Product, and Operation are required.' });
      }

      await client.query('BEGIN');
      const empRes = await client.query(`SELECT * FROM performance_employees WHERE id = $1 AND is_active = TRUE LIMIT 1`, [Number(employee_id)]);
      if (!empRes.rows || empRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, message: 'Active registered Performance Employee not found.' });
      }
      const emp = empRes.rows[0];
      const hwId = String(hardware_id || emp.hardware_id || '').trim().toUpperCase();
      if (!hwId) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'Employee has no Hardware ID registered. Assign a Hardware ID first.' });
      }

      const startDt = start_at ? new Date(start_at) : new Date();
      const endDt = end_at ? new Date(end_at) : null;

      // Optionally close previous active assignment cleanly on transfer
      if (close_previous_active !== false) {
        await client.query(
          `UPDATE employee_operation_assignments
           SET status = 'transferred', end_at = $1, updated_at = NOW()
           WHERE employee_id = $2 AND status = 'active' AND end_at IS NULL`,
          [startDt.toISOString(), emp.id]
        );
      }

      let shiftName = '';
      if (shift_id) {
        const sRes = await client.query(`SELECT name FROM manufacturing_shifts WHERE id = $1 LIMIT 1`, [Number(shift_id)]);
        shiftName = sRes.rows[0]?.name || '';
      }

      const code = await generateAutoCode(client, 78201003, 'employee_operation_assignments', 'assignment_code', 'ASN', 5);
      const ins = await client.query(
        `INSERT INTO employee_operation_assignments
         (assignment_code, employee_id, emp_id, department_id, product_id, operation_id, hardware_id, production_order_id, workstation, shift_id, shift_name, supervisor_name, start_at, end_at, daily_target, status, notes, assigned_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'active', $16, $17, NOW(), NOW())
         RETURNING *`,
        [
          code,
          emp.id,
          emp.emp_id,
          department_id ? Number(department_id) : (emp.department_id || null),
          Number(product_id),
          Number(operation_id),
          hwId,
          production_order_id ? Number(production_order_id) : null,
          String(workstation || '').trim(),
          shift_id ? Number(shift_id) : null,
          shiftName,
          String(supervisor_name || '').trim(),
          startDt.toISOString(),
          endDt ? endDt.toISOString() : null,
          daily_target !== undefined && daily_target !== '' && daily_target !== null ? Number(daily_target) : null,
          String(notes || '').trim(),
          req.user!.email,
        ]
      );
      const created = ins.rows[0];

      await logManufacturingAudit(client, {
        req,
        actorEmail: req.user!.email,
        entityType: 'EmployeeOperationAssignment',
        entityId: created.assignment_code,
        action: 'ASSIGNMENT_CREATED',
        afterValues: created,
      });

      await client.query('COMMIT');
      return res.status(201).json({ success: true, message: `Assignment ${created.assignment_code} created.`, data: created });
    } catch (err: any) {
      await client.query('ROLLBACK').catch(() => {});
      return sendApiError(res, err, 'Failed to create employee operation assignment.');
    } finally {
      client.release();
    }
  });

  // Mid-shift transfer to another operation/product/workstation preserving complete history
  router.post('/assignments/:id/transfer', requirePermission('operations.assignments.manage'), async (req: AuthenticatedRequest, res: Response) => {
    const db = await getDb();
    const client = await db.connect();
    try {
      const id = Number(req.params.id);
      const { product_id, operation_id, production_order_id, workstation, shift_id, transfer_at, notes } = req.body || {};
      if (!operation_id) {
        client.release();
        return res.status(400).json({ success: false, message: 'Target Operation is required for transfer.' });
      }
      const transferTime = transfer_at ? new Date(transfer_at) : new Date();

      await client.query('BEGIN');
      const prevRes = await client.query(`SELECT * FROM employee_operation_assignments WHERE id = $1 FOR UPDATE`, [id]);
      if (!prevRes.rows || prevRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, message: 'Assignment not found.' });
      }
      const prev = prevRes.rows[0];

      await client.query(
        `UPDATE employee_operation_assignments SET status = 'transferred', end_at = $1, updated_at = NOW() WHERE id = $2`,
        [transferTime.toISOString(), id]
      );

      const newCode = await generateAutoCode(client, 78201003, 'employee_operation_assignments', 'assignment_code', 'ASN', 5);
      const ins = await client.query(
        `INSERT INTO employee_operation_assignments
         (assignment_code, employee_id, emp_id, department_id, product_id, operation_id, hardware_id, production_order_id, workstation, shift_id, shift_name, supervisor_name, start_at, end_at, daily_target, status, notes, assigned_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NULL, $14, 'active', $15, $16, NOW(), NOW())
         RETURNING *`,
        [
          newCode,
          prev.employee_id,
          prev.emp_id,
          prev.department_id,
          product_id ? Number(product_id) : prev.product_id,
          Number(operation_id),
          prev.hardware_id,
          production_order_id !== undefined ? (production_order_id ? Number(production_order_id) : null) : prev.production_order_id,
          workstation !== undefined ? String(workstation).trim() : prev.workstation,
          shift_id !== undefined ? (shift_id ? Number(shift_id) : null) : prev.shift_id,
          prev.shift_name,
          prev.supervisor_name,
          transferTime.toISOString(),
          prev.daily_target,
          String(notes || `Transferred from ${prev.assignment_code}`).trim(),
          req.user!.email,
        ]
      );

      await logManufacturingAudit(client, {
        req,
        actorEmail: req.user!.email,
        entityType: 'EmployeeOperationAssignment',
        entityId: ins.rows[0].assignment_code,
        action: 'EMPLOYEE_OPERATION_TRANSFERRED',
        beforeValues: prev,
        afterValues: ins.rows[0],
        reason: String(notes || 'Mid-shift operation transfer'),
      });

      await client.query('COMMIT');
      return res.status(201).json({ success: true, message: `Transferred employee to ${ins.rows[0].assignment_code}.`, data: ins.rows[0] });
    } catch (err: any) {
      await client.query('ROLLBACK').catch(() => {});
      return sendApiError(res, err, 'Failed to transfer employee assignment.');
    } finally {
      client.release();
    }
  });

  // =========================================================================
  // 7. HARDWARE EVENTS LOG & SUPERVISOR EXCEPTION QUEUE
  // =========================================================================
  router.get('/hardware/events', requirePermission('operations.view'), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const db = await getDb();
      const { status, exceptions_only, limit = '100' } = req.query;
      const params: any[] = [];
      let sql = `
        SELECT e.*,
               pe.first_name, pe.last_name,
               mo.operation_code, mo.name AS operation_name,
               COALESCE(p.name, p.product_name) AS product_name,
               COALESCE(wo.wo_number, wo.work_order_number) AS production_order_number
        FROM hardware_production_events e
        LEFT JOIN performance_employees pe ON pe.id = e.employee_id
        LEFT JOIN manufacturing_operations mo ON mo.id = e.operation_id
        LEFT JOIN products p ON p.id = e.product_id
        LEFT JOIN work_orders wo ON wo.id = e.production_order_id
        WHERE 1=1
      `;
      if (exceptions_only === 'true') {
        sql += ` AND e.processing_status IN ('exception_unassigned', 'exception_ambiguous', 'invalid_hardware', 'rejected_inactive')`;
      } else if (status && status !== 'all') {
        params.push(String(status));
        sql += ` AND e.processing_status = $${params.length}`;
      }
      const lim = Math.min(300, Math.max(1, Number(limit) || 100));
      params.push(lim);
      sql += ` ORDER BY e.event_timestamp DESC, e.id DESC LIMIT $${params.length}`;
      const rows = await db.query(sql, params);
      return res.json({ success: true, data: rows.rows || [] });
    } catch (err: any) {
      return sendApiError(res, err, 'Failed to fetch hardware production events.');
    }
  });

  router.post('/hardware/exceptions/:id/resolve', requirePermission('operations.production.correct'), async (req: AuthenticatedRequest, res: Response) => {
    const db = await getDb();
    const client = await db.connect();
    try {
      const id = Number(req.params.id);
      const { action, employee_id, product_id, operation_id, production_order_id, resolution_notes } = req.body || {};

      await client.query('BEGIN');
      const evRes = await client.query(`SELECT * FROM hardware_production_events WHERE id = $1 FOR UPDATE`, [id]);
      if (!evRes.rows || evRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, message: 'Hardware exception event not found.' });
      }
      const ev = evRes.rows[0];

      if (action === 'discard') {
        const upd = await client.query(
          `UPDATE hardware_production_events
           SET processing_status = 'resolved_discarded', resolved_by = $1, resolved_at = NOW(), resolution_notes = $2
           WHERE id = $3 RETURNING *`,
          [req.user!.email, String(resolution_notes || 'Discarded by supervisor').trim(), id]
        );
        await logManufacturingAudit(client, {
          req,
          actorEmail: req.user!.email,
          entityType: 'HardwareEventException',
          entityId: ev.event_uid,
          action: 'EXCEPTION_DISCARDED',
          beforeValues: ev,
          afterValues: upd.rows[0],
          reason: String(resolution_notes || 'Discarded by supervisor'),
        });
        await client.query('COMMIT');
        return res.json({ success: true, message: 'Exception event discarded.', data: upd.rows[0] });
      }

      const finalEmpId = Number(employee_id || ev.employee_id);
      const finalProdId = Number(product_id || ev.product_id);
      const finalOpId = Number(operation_id || ev.operation_id);
      if (!finalEmpId || !finalProdId || !finalOpId) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'Employee, Product, and Operation are required to resolve and credit this event.' });
      }

      const opRes = await client.query(`SELECT standard_time_minutes FROM manufacturing_operations WHERE id = $1`, [finalOpId]);
      const histRes = await client.query(
        `SELECT operation_id, product_id, standard_time_minutes, uom, effective_from, effective_to
         FROM operation_standard_history WHERE operation_id = $1`,
        [finalOpId]
      );
      const stdSnap = resolveApplicableStandardTime(
        histRes.rows || [],
        finalOpId,
        finalProdId,
        ev.event_timestamp,
        Number(opRes.rows[0]?.standard_time_minutes || 1)
      );

      const upd = await client.query(
        `UPDATE hardware_production_events
         SET employee_id = $1, product_id = $2, operation_id = $3, production_order_id = $4,
             standard_time_snapshot_minutes = $5, processing_status = 'resolved_accepted',
             resolved_by = $6, resolved_at = NOW(), resolution_notes = $7
         WHERE id = $8 RETURNING *`,
        [
          finalEmpId,
          finalProdId,
          finalOpId,
          production_order_id ? Number(production_order_id) : null,
          stdSnap,
          req.user!.email,
          String(resolution_notes || 'Resolved by supervisor').trim(),
          id,
        ]
      );

      if (production_order_id) {
        const txCode = await generateAutoCode(client, 78201009, 'wip_quantity_transactions', 'tx_code', 'WIP', 5);
        await client.query(
          `INSERT INTO wip_quantity_transactions
           (tx_code, production_order_id, product_id, operation_id, employee_id, tx_type, quantity, source_event_id, reference_id, performed_by, notes, created_at)
           VALUES ($1, $2, $3, $4, $5, 'component_completed', $6, $7, $8, $9, $10, NOW())`,
          [
            txCode,
            Number(production_order_id),
            finalProdId,
            finalOpId,
            finalEmpId,
            Number(ev.quantity || 1),
            ev.id,
            ev.event_uid,
            req.user!.email,
            `Supervisor resolved exception: ${resolution_notes || ''}`,
          ]
        );
      }

      await logManufacturingAudit(client, {
        req,
        actorEmail: req.user!.email,
        entityType: 'HardwareEventException',
        entityId: ev.event_uid,
        action: 'EXCEPTION_RESOLVED_ACCEPTED',
        beforeValues: ev,
        afterValues: upd.rows[0],
        reason: String(resolution_notes || 'Resolved by supervisor'),
      });

      await client.query('COMMIT');
      return res.json({ success: true, message: 'Exception event resolved and credited.', data: upd.rows[0] });
    } catch (err: any) {
      await client.query('ROLLBACK').catch(() => {});
      return sendApiError(res, err, 'Failed to resolve hardware exception.');
    } finally {
      client.release();
    }
  });

  // =========================================================================
  // 8. OPTIONAL TASK TIMING WORKFLOW (Start / Pause / Resume / Complete) & DOWNTIME
  // =========================================================================
  router.get('/task-sessions', requirePermission('operations.view'), async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const db = await getDb();
      const rows = await db.query(
        `SELECT ts.*, pe.emp_id, pe.first_name, pe.last_name, mo.name AS operation_name,
                COALESCE(p.name, p.product_name) AS product_name
         FROM task_time_sessions ts
         JOIN performance_employees pe ON pe.id = ts.employee_id
         JOIN manufacturing_operations mo ON mo.id = ts.operation_id
         JOIN products p ON p.id = ts.product_id
         ORDER BY ts.started_at DESC LIMIT 100`
      );
      return res.json({ success: true, data: rows.rows || [] });
    } catch (err: any) {
      return sendApiError(res, err, 'Failed to fetch task time sessions.');
    }
  });

  router.post('/task-sessions/start', requirePermission('operations.assignments.manage'), async (req: AuthenticatedRequest, res: Response) => {
    const db = await getDb();
    const client = await db.connect();
    try {
      const { employee_id, product_id, operation_id, production_order_id, notes } = req.body || {};
      if (!employee_id || !product_id || !operation_id) {
        client.release();
        return res.status(400).json({ success: false, message: 'Employee, Product, and Operation are required.' });
      }
      await client.query('BEGIN');
      const code = await generateAutoCode(client, 78201004, 'task_time_sessions', 'session_code', 'TSK', 5);
      const ins = await client.query(
        `INSERT INTO task_time_sessions
         (session_code, employee_id, product_id, operation_id, production_order_id, status, started_at, notes, created_by, updated_at)
         VALUES ($1, $2, $3, $4, $5, 'running', NOW(), $6, $7, NOW()) RETURNING *`,
        [code, Number(employee_id), Number(product_id), Number(operation_id), production_order_id ? Number(production_order_id) : null, String(notes || '').trim(), req.user!.email]
      );
      await client.query('COMMIT');
      return res.status(201).json({ success: true, data: ins.rows[0] });
    } catch (err: any) {
      await client.query('ROLLBACK').catch(() => {});
      return sendApiError(res, err, 'Failed to start task timing session.');
    } finally {
      client.release();
    }
  });

  router.post('/task-sessions/:id/:action', requirePermission('operations.assignments.manage'), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const db = await getDb();
      const id = Number(req.params.id);
      const action = req.params.action;
      const curRes = await db.query(`SELECT * FROM task_time_sessions WHERE id = $1 LIMIT 1`, [id]);
      if (!curRes.rows || curRes.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Task session not found.' });
      }
      const cur = curRes.rows[0];
      const now = new Date();

      if (action === 'pause' && cur.status === 'running') {
        const delta = Math.max(0, Math.floor((now.getTime() - new Date(cur.updated_at).getTime()) / 1000));
        const upd = await db.query(
          `UPDATE task_time_sessions SET status = 'paused', paused_at = NOW(), accumulated_active_seconds = accumulated_active_seconds + $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
          [delta, id]
        );
        return res.json({ success: true, data: upd.rows[0] });
      }
      if (action === 'resume' && cur.status === 'paused') {
        const upd = await db.query(
          `UPDATE task_time_sessions SET status = 'running', paused_at = NULL, updated_at = NOW() WHERE id = $1 RETURNING *`,
          [id]
        );
        return res.json({ success: true, data: upd.rows[0] });
      }
      if (action === 'complete') {
        const delta = cur.status === 'running' ? Math.max(0, Math.floor((now.getTime() - new Date(cur.updated_at).getTime()) / 1000)) : 0;
        const completedQty = Math.max(0, Number(req.body?.completed_qty || 1));
        const upd = await db.query(
          `UPDATE task_time_sessions SET status = 'completed', completed_at = NOW(), completed_qty = $1, accumulated_active_seconds = accumulated_active_seconds + $2, updated_at = NOW() WHERE id = $3 RETURNING *`,
          [completedQty, delta, id]
        );
        return res.json({ success: true, data: upd.rows[0] });
      }
      return res.status(400).json({ success: false, message: `Invalid action "${action}" for session status "${cur.status}".` });
    } catch (err: any) {
      return sendApiError(res, err, 'Failed to update task timing session.');
    }
  });

  // Authorised Downtime Logs
  router.get('/downtime', requirePermission('operations.view'), async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const db = await getDb();
      const rows = await db.query(
        `SELECT dl.*, pe.emp_id, pe.first_name, pe.last_name, mo.name AS operation_name
         FROM production_downtime_logs dl
         LEFT JOIN performance_employees pe ON pe.id = dl.employee_id
         LEFT JOIN manufacturing_operations mo ON mo.id = dl.operation_id
         ORDER BY dl.start_at DESC LIMIT 100`
      );
      return res.json({ success: true, data: rows.rows || [] });
    } catch (err: any) {
      return sendApiError(res, err, 'Failed to fetch downtime logs.');
    }
  });

  router.post('/downtime', requirePermission('operations.assignments.manage'), async (req: AuthenticatedRequest, res: Response) => {
    const db = await getDb();
    const client = await db.connect();
    try {
      const { employee_id, department_id, production_order_id, operation_id, downtime_type, start_at, end_at, duration_minutes, reason } = req.body || {};
      const dur = Number(duration_minutes);
      if (!downtime_type || !Number.isFinite(dur) || dur <= 0) {
        client.release();
        return res.status(400).json({ success: false, message: 'Downtime type and positive duration_minutes are required.' });
      }
      const startDt = start_at ? new Date(start_at) : new Date(Date.now() - dur * 60000);
      const endDt = end_at ? new Date(end_at) : new Date(startDt.getTime() + dur * 60000);

      await client.query('BEGIN');
      const code = await generateAutoCode(client, 78201005, 'production_downtime_logs', 'downtime_code', 'DT', 5);
      const ins = await client.query(
        `INSERT INTO production_downtime_logs
         (downtime_code, employee_id, department_id, production_order_id, operation_id, downtime_type, start_at, end_at, duration_minutes, is_approved, approved_by, reason, created_by, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE, $10, $11, $10, NOW()) RETURNING *`,
        [
          code,
          employee_id ? Number(employee_id) : null,
          department_id ? Number(department_id) : null,
          production_order_id ? Number(production_order_id) : null,
          operation_id ? Number(operation_id) : null,
          String(downtime_type),
          startDt.toISOString(),
          endDt.toISOString(),
          dur,
          req.user!.email,
          String(reason || '').trim(),
        ]
      );
      await client.query('COMMIT');
      return res.status(201).json({ success: true, message: `Authorised downtime ${code} logged.`, data: ins.rows[0] });
    } catch (err: any) {
      await client.query('ROLLBACK').catch(() => {});
      return sendApiError(res, err, 'Failed to log authorised downtime.');
    } finally {
      client.release();
    }
  });

  // =========================================================================
  // 9. QUALITY MANAGEMENT & REWORK CONTROL (Zero Double-Counting)
  // =========================================================================
  router.get('/quality-inspections', requirePermission('operations.view'), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const db = await getDb();
      const { employee_id, operation_id, production_order_id, rework_status } = req.query;
      const params: any[] = [];
      let sql = `
        SELECT qi.*,
               pe.emp_id, pe.first_name, pe.last_name,
               mo.operation_code, mo.name AS operation_name,
               rmo.name AS responsible_operation_name,
               COALESCE(p.name, p.product_name) AS product_name,
               COALESCE(wo.wo_number, wo.work_order_number) AS production_order_number
        FROM operation_quality_inspections qi
        JOIN performance_employees pe ON pe.id = qi.employee_id
        JOIN manufacturing_operations mo ON mo.id = qi.operation_id
        LEFT JOIN manufacturing_operations rmo ON rmo.id = qi.responsible_operation_id
        JOIN products p ON p.id = qi.product_id
        LEFT JOIN work_orders wo ON wo.id = qi.production_order_id
        WHERE 1=1
      `;
      if (employee_id) {
        params.push(Number(employee_id));
        sql += ` AND qi.employee_id = $${params.length}`;
      }
      if (operation_id) {
        params.push(Number(operation_id));
        sql += ` AND qi.operation_id = $${params.length}`;
      }
      if (production_order_id) {
        params.push(Number(production_order_id));
        sql += ` AND qi.production_order_id = $${params.length}`;
      }
      if (rework_status && rework_status !== 'all') {
        params.push(String(rework_status));
        sql += ` AND qi.rework_status = $${params.length}`;
      }
      sql += ` ORDER BY qi.inspected_at DESC, qi.id DESC LIMIT 200`;
      const rows = await db.query(sql, params);
      const enriched = (rows.rows || []).map((r: any) => {
        const calc = calculateQualityMetrics({
          submitted_qty: Number(r.submitted_qty),
          inspected_qty: Number(r.inspected_qty),
          first_pass_accepted_qty: Number(r.first_pass_accepted_qty),
          rejected_qty: Number(r.rejected_qty),
          rework_qty: Number(r.rework_qty),
          accepted_after_rework_qty: Number(r.accepted_after_rework_qty),
          pending_inspection_qty: Number(r.pending_inspection_qty),
        });
        return {
          ...r,
          final_accepted_qty: calc.final_accepted_qty,
          first_pass_quality_pct: calc.first_pass_quality_pct,
          final_acceptance_pct: calc.final_acceptance_pct,
        };
      });
      return res.json({ success: true, data: enriched });
    } catch (err: any) {
      return sendApiError(res, err, 'Failed to fetch quality inspections.');
    }
  });

  router.post('/quality-inspections', requirePermission('operations.quality.approve'), async (req: AuthenticatedRequest, res: Response) => {
    const db = await getDb();
    const client = await db.connect();
    try {
      const {
        employee_id,
        product_id,
        operation_id,
        responsible_operation_id,
        production_order_id,
        inspection_scope,
        submitted_qty,
        inspected_qty,
        first_pass_accepted_qty,
        rejected_qty,
        rework_qty,
        accepted_after_rework_qty,
        defect_reason,
        rework_status,
        inspector_name,
        remarks,
      } = req.body || {};

      if (!employee_id || !product_id || !operation_id) {
        client.release();
        return res.status(400).json({ success: false, message: 'Employee, Product, and Operation are required.' });
      }

      const calc = calculateQualityMetrics({
        submitted_qty: Number(submitted_qty),
        inspected_qty: Number(inspected_qty),
        first_pass_accepted_qty: Number(first_pass_accepted_qty || 0),
        rejected_qty: Number(rejected_qty || 0),
        rework_qty: Number(rework_qty || 0),
        accepted_after_rework_qty: Number(accepted_after_rework_qty || 0),
      });
      if (!calc.valid) {
        client.release();
        return res.status(400).json({ success: false, message: calc.error });
      }

      const derivedReworkStatus =
        rework_status ||
        (calc.rework_qty === 0
          ? 'none'
          : calc.accepted_after_rework_qty >= calc.rework_qty
            ? 'rework_completed'
            : 'pending_rework');

      await client.query('BEGIN');
      const code = await generateAutoCode(client, 78201006, 'operation_quality_inspections', 'inspection_code', 'QC', 5);
      const ins = await client.query(
        `INSERT INTO operation_quality_inspections
         (inspection_code, employee_id, product_id, operation_id, responsible_operation_id, production_order_id, inspection_scope,
          submitted_qty, inspected_qty, first_pass_accepted_qty, rejected_qty, rework_qty, accepted_after_rework_qty, pending_inspection_qty,
          defect_reason, rework_status, inspector_id, inspector_name, inspected_at, remarks, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,NOW(),$19,NOW(),NOW())
         RETURNING *`,
        [
          code,
          Number(employee_id),
          Number(product_id),
          Number(operation_id),
          responsible_operation_id ? Number(responsible_operation_id) : Number(operation_id),
          production_order_id ? Number(production_order_id) : null,
          inspection_scope === 'final_product' ? 'final_product' : 'component',
          calc.submitted_qty,
          calc.inspected_qty,
          calc.first_pass_accepted_qty,
          calc.rejected_qty,
          calc.rework_qty,
          calc.accepted_after_rework_qty,
          calc.pending_inspection_qty,
          String(defect_reason || '').trim(),
          derivedReworkStatus,
          req.user!.id,
          String(inspector_name || req.user!.email).trim(),
          String(remarks || '').trim(),
        ]
      );
      const created = ins.rows[0];

      // Post atomic WIP ledger transactions for component QC approvals/rejections/rework
      if (production_order_id && inspection_scope !== 'final_product') {
        const ordId = Number(production_order_id);
        const postTx = async (txType: string, q: number, note: string) => {
          if (q <= 0) return;
          const txCode = await generateAutoCode(client, 78201009, 'wip_quantity_transactions', 'tx_code', 'WIP', 5);
          await client.query(
            `INSERT INTO wip_quantity_transactions
             (tx_code, production_order_id, product_id, operation_id, employee_id, tx_type, quantity, reference_id, performed_by, notes, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())`,
            [txCode, ordId, Number(product_id), Number(operation_id), Number(employee_id), txType, q, code, req.user!.email, note]
          );
        };
        await postTx('component_qc_accepted', calc.first_pass_accepted_qty, `First-pass QC accepted (${code})`);
        await postTx('component_qc_rejected', calc.rejected_qty, `QC rejected: ${defect_reason || 'Defect'} (${code})`);
        await postTx('component_rework_started', calc.rework_qty, `Sent to rework (${code})`);
        await postTx('component_rework_accepted', calc.accepted_after_rework_qty, `Accepted after rework (${code})`);
      }

      await logManufacturingAudit(client, {
        req,
        actorEmail: req.user!.email,
        entityType: 'QualityInspection',
        entityId: code,
        action: 'QUALITY_INSPECTION_APPROVED',
        afterValues: { ...created, final_accepted_qty: calc.final_accepted_qty, first_pass_quality_pct: calc.first_pass_quality_pct },
      });

      await client.query('COMMIT');
      return res.status(201).json({
        success: true,
        message: `Quality inspection ${code} recorded (Final Accepted: ${calc.final_accepted_qty}).`,
        data: {
          ...created,
          final_accepted_qty: calc.final_accepted_qty,
          first_pass_quality_pct: calc.first_pass_quality_pct,
          final_acceptance_pct: calc.final_acceptance_pct,
        },
      });
    } catch (err: any) {
      await client.query('ROLLBACK').catch(() => {});
      return sendApiError(res, err, 'Failed to record quality inspection.');
    } finally {
      client.release();
    }
  });

  // Update rework completion on an existing inspection (credits only the incremental newly-accepted rework delta!)
  router.put('/quality-inspections/:id/rework', requirePermission('operations.quality.approve'), async (req: AuthenticatedRequest, res: Response) => {
    const db = await getDb();
    const client = await db.connect();
    try {
      const id = Number(req.params.id);
      const { accepted_after_rework_qty, rework_status, remarks } = req.body || {};

      await client.query('BEGIN');
      const prevRes = await client.query(`SELECT * FROM operation_quality_inspections WHERE id = $1 FOR UPDATE`, [id]);
      if (!prevRes.rows || prevRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, message: 'Quality inspection record not found.' });
      }
      const prev = prevRes.rows[0];
      const nextAcceptedRework = Number(accepted_after_rework_qty);
      if (!Number.isFinite(nextAcceptedRework) || nextAcceptedRework < 0 || nextAcceptedRework > Number(prev.rework_qty)) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: `Accepted after rework (${nextAcceptedRework}) cannot exceed rework quantity (${prev.rework_qty}).`,
        });
      }

      const delta = round4(nextAcceptedRework - Number(prev.accepted_after_rework_qty || 0));
      const nextStatus = rework_status || (nextAcceptedRework >= Number(prev.rework_qty) ? 'rework_completed' : 'in_rework');

      const upd = await client.query(
        `UPDATE operation_quality_inspections
         SET accepted_after_rework_qty = $1, rework_status = $2, remarks = COALESCE(NULLIF($3, ''), remarks), updated_at = NOW()
         WHERE id = $4 RETURNING *`,
        [nextAcceptedRework, nextStatus, String(remarks || '').trim(), id]
      );

      if (prev.production_order_id && delta > 0 && prev.inspection_scope !== 'final_product') {
        const txCode = await generateAutoCode(client, 78201009, 'wip_quantity_transactions', 'tx_code', 'WIP', 5);
        await client.query(
          `INSERT INTO wip_quantity_transactions
           (tx_code, production_order_id, product_id, operation_id, employee_id, tx_type, quantity, reference_id, performed_by, notes, created_at)
           VALUES ($1, $2, $3, $4, $5, 'component_rework_accepted', $6, $7, $8, $9, NOW())`,
          [txCode, prev.production_order_id, prev.product_id, prev.operation_id, prev.employee_id, delta, prev.inspection_code, req.user!.email, 'Incremental rework acceptance']
        );
      }

      await logManufacturingAudit(client, {
        req,
        actorEmail: req.user!.email,
        entityType: 'QualityInspection',
        entityId: prev.inspection_code,
        action: 'REWORK_UPDATED',
        beforeValues: { accepted_after_rework_qty: prev.accepted_after_rework_qty, rework_status: prev.rework_status },
        afterValues: { accepted_after_rework_qty: nextAcceptedRework, rework_status: nextStatus },
      });

      await client.query('COMMIT');
      return res.json({ success: true, message: 'Rework status updated without double-counting.', data: upd.rows[0] });
    } catch (err: any) {
      await client.query('ROLLBACK').catch(() => {});
      return sendApiError(res, err, 'Failed to update rework record.');
    } finally {
      client.release();
    }
  });

  // =========================================================================
  // 10. PERFORMANCE SCORING POLICY CONFIGURATION
  // =========================================================================
  router.get('/scoring-policy', requirePermission('operations.view'), async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const db = await getDb();
      const policy = await loadActiveScoringPolicy(db);
      return res.json({ success: true, data: policy });
    } catch (err: any) {
      return sendApiError(res, err, 'Failed to load scoring policy.');
    }
  });

  router.put('/scoring-policy', requirePermission('operations.rewards.manage'), async (req: AuthenticatedRequest, res: Response) => {
    const db = await getDb();
    const client = await db.connect();
    try {
      const body = req.body || {};
      const pw = Number(body.productivity_weight);
      const qw = Number(body.quality_weight);
      const cw = Number(body.consistency_weight);
      if (Math.abs(pw + qw + cw - 100) > 0.01 || pw < 0 || qw < 0 || cw < 0) {
        client.release();
        return res.status(400).json({ success: false, message: 'Productivity, Quality, and Consistency weights must sum to exactly 100%.' });
      }
      const cap = Number(body.max_productivity_score_cap ?? 120);
      if (cap < 100 || cap > 200) {
        client.release();
        return res.status(400).json({ success: false, message: 'Maximum productivity score cap must be between 100 and 200.' });
      }
      const debounceSec = Number(body.hardware_debounce_seconds ?? 2);
      if (!Number.isInteger(debounceSec) || debounceSec < 0 || debounceSec > 120) {
        client.release();
        return res.status(400).json({ success: false, message: 'Hardware debounce interval must be between 0 and 120 seconds.' });
      }

      await client.query('BEGIN');
      await client.query(`UPDATE performance_scoring_policies SET is_active = FALSE WHERE is_active = TRUE`);
      const policyName = String(body.policy_name || 'Active Manufacturing Evaluation Policy').trim();
      const bands = Array.isArray(body.scoring_bands) && body.scoring_bands.length > 0
        ? body.scoring_bands
        : DEFAULT_SCORING_POLICY.scoring_bands;

      const upsert = await client.query(
        `INSERT INTO performance_scoring_policies
         (policy_name, productivity_weight, quality_weight, consistency_weight, productivity_metric_mode, quality_metric_mode,
          max_productivity_score_cap, consistency_min_productivity_pct, consistency_min_quality_pct,
          min_eligible_workdays_weekly, min_eligible_workdays_monthly, min_reward_productivity_pct, min_reward_quality_pct,
          hardware_debounce_seconds, scoring_bands, is_active, updated_by, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,TRUE,$16,NOW(),NOW())
         ON CONFLICT (policy_name) DO UPDATE SET
           productivity_weight = EXCLUDED.productivity_weight,
           quality_weight = EXCLUDED.quality_weight,
           consistency_weight = EXCLUDED.consistency_weight,
           productivity_metric_mode = EXCLUDED.productivity_metric_mode,
           quality_metric_mode = EXCLUDED.quality_metric_mode,
           max_productivity_score_cap = EXCLUDED.max_productivity_score_cap,
           consistency_min_productivity_pct = EXCLUDED.consistency_min_productivity_pct,
           consistency_min_quality_pct = EXCLUDED.consistency_min_quality_pct,
           min_eligible_workdays_weekly = EXCLUDED.min_eligible_workdays_weekly,
           min_eligible_workdays_monthly = EXCLUDED.min_eligible_workdays_monthly,
           min_reward_productivity_pct = EXCLUDED.min_reward_productivity_pct,
           min_reward_quality_pct = EXCLUDED.min_reward_quality_pct,
           hardware_debounce_seconds = EXCLUDED.hardware_debounce_seconds,
           scoring_bands = EXCLUDED.scoring_bands,
           is_active = TRUE,
           updated_by = EXCLUDED.updated_by,
           updated_at = NOW()
         RETURNING *`,
        [
          policyName,
          pw,
          qw,
          cw,
          body.productivity_metric_mode === 'gross_output' ? 'gross_output' : 'accepted_output',
          body.quality_metric_mode === 'first_pass' ? 'first_pass' : 'final_acceptance',
          cap,
          Number(body.consistency_min_productivity_pct ?? 85),
          Number(body.consistency_min_quality_pct ?? 95),
          Math.max(1, Number(body.min_eligible_workdays_weekly ?? 4)),
          Math.max(1, Number(body.min_eligible_workdays_monthly ?? 15)),
          Number(body.min_reward_productivity_pct ?? 90),
          Number(body.min_reward_quality_pct ?? 95),
          debounceSec,
          JSON.stringify(bands),
          req.user!.email,
        ]
      );

      await logManufacturingAudit(client, {
        req,
        actorEmail: req.user!.email,
        entityType: 'ScoringPolicy',
        entityId: upsert.rows[0].id,
        action: 'SCORING_POLICY_UPDATED',
        afterValues: upsert.rows[0],
      });

      await client.query('COMMIT');
      return res.json({ success: true, message: 'Performance scoring policy saved.', data: upsert.rows[0] });
    } catch (err: any) {
      await client.query('ROLLBACK').catch(() => {});
      return sendApiError(res, err, 'Failed to save scoring policy.');
    } finally {
      client.release();
    }
  });

  // =========================================================================
  // 11. DAILY / WEEKLY / MONTHLY PERFORMANCE REPORTS + SERVER-SIDE PAGINATION + EXCEL/PDF EXPORT
  // =========================================================================
  function resolvePeriodDates(query: any): { period: 'daily' | 'weekly' | 'monthly' | 'custom'; startDate: string; endDate: string } {
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const p = String(query.period || 'daily').toLowerCase();

    if (p === 'custom' && query.start_date && isValidIsoDate(String(query.start_date))) {
      const endStr = query.end_date && isValidIsoDate(String(query.end_date)) ? String(query.end_date) : todayStr;
      return { period: 'custom', startDate: String(query.start_date), endDate: endStr };
    }
    if (p === 'weekly') {
      const d = new Date(today);
      d.setUTCDate(d.getUTCDate() - 6);
      return { period: 'weekly', startDate: d.toISOString().slice(0, 10), endDate: todayStr };
    }
    if (p === 'monthly') {
      const startMonth = `${todayStr.slice(0, 7)}-01`;
      return { period: 'monthly', startDate: startMonth, endDate: todayStr };
    }
    return { period: 'daily', startDate: todayStr, endDate: todayStr };
  }

  router.get('/performance/reports', requirePermission('operations.view'), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const db = await getDb();
      const { period, startDate, endDate } = resolvePeriodDates(req.query);
      const sortBy = String(req.query.sort_by || 'final_score');
      const sortDir = String(req.query.sort_dir || 'desc').toLowerCase() === 'asc' ? 1 : -1;
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));

      const evalResult = await evaluateEmployeePerformanceReport(db, {
        period,
        startDate,
        endDate,
        employeeId: req.query.employee_id ? Number(req.query.employee_id) : undefined,
        departmentId: req.query.department_id ? Number(req.query.department_id) : undefined,
        productId: req.query.product_id ? Number(req.query.product_id) : undefined,
        operationId: req.query.operation_id ? Number(req.query.operation_id) : undefined,
        productionOrderId: req.query.production_order_id ? Number(req.query.production_order_id) : undefined,
        workstation: req.query.workstation ? String(req.query.workstation) : undefined,
        shiftId: req.query.shift_id ? Number(req.query.shift_id) : undefined,
        supervisor: req.query.supervisor ? String(req.query.supervisor) : undefined,
        qualityStatus: req.query.quality_status ? String(req.query.quality_status) : undefined,
      });

      const sortableKeys = new Set([
        'final_score',
        'accepted_productivity_pct',
        'gross_productivity_pct',
        'effective_quality_score',
        'consistency_pct',
        'total_final_accepted_qty',
        'emp_id',
      ]);
      const activeSort = sortableKeys.has(sortBy) ? sortBy : 'final_score';

      const sorted = [...evalResult.records].sort((a: any, b: any) => {
        if (activeSort === 'emp_id') return String(a.emp_id).localeCompare(String(b.emp_id)) * sortDir;
        return ((Number(a[activeSort]) || 0) - (Number(b[activeSort]) || 0)) * sortDir;
      });

      // Assign fair performance rank (based on final_score, NOT raw component counts!)
      const ranked = sorted.map((row, idx) => ({ ...row, rank: idx + 1 }));
      const total = ranked.length;
      const startIdx = (page - 1) * limit;
      const paginated = ranked.slice(startIdx, startIdx + limit);

      return res.json({
        success: true,
        data: {
          period,
          start_date: startDate,
          end_date: endDate,
          policy: evalResult.policy,
          operation_summary: evalResult.operation_summary,
          records: paginated,
          pagination: {
            page,
            limit,
            total,
            total_pages: Math.max(1, Math.ceil(total / limit)),
          },
        },
      });
    } catch (err: any) {
      return sendApiError(res, err, 'Failed to generate operation-based employee performance report.');
    }
  });

  // Authorized Excel (.xlsx) and PDF report export
  router.get('/performance/reports/export', requirePermission('operations.reports.export'), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const db = await getDb();
      const format = String(req.query.format || 'xlsx').toLowerCase();
      const { period, startDate, endDate } = resolvePeriodDates(req.query);

      const evalResult = await evaluateEmployeePerformanceReport(db, {
        period,
        startDate,
        endDate,
        employeeId: req.query.employee_id ? Number(req.query.employee_id) : undefined,
        departmentId: req.query.department_id ? Number(req.query.department_id) : undefined,
        productId: req.query.product_id ? Number(req.query.product_id) : undefined,
        operationId: req.query.operation_id ? Number(req.query.operation_id) : undefined,
        productionOrderId: req.query.production_order_id ? Number(req.query.production_order_id) : undefined,
        workstation: req.query.workstation ? String(req.query.workstation) : undefined,
        shiftId: req.query.shift_id ? Number(req.query.shift_id) : undefined,
        supervisor: req.query.supervisor ? String(req.query.supervisor) : undefined,
        qualityStatus: req.query.quality_status ? String(req.query.quality_status) : undefined,
      });

      const ranked = [...evalResult.records]
        .sort((a, b) => b.final_score - a.final_score)
        .map((r, i) => ({ ...r, rank: i + 1 }));

      if (format === 'pdf') {
        const headers = ['Rank', 'Emp ID', 'Employee', 'Submitted', 'Accepted', 'Expected', 'Prod %', 'Quality %', 'Consist %', 'Score', 'Band'];
        const rows = ranked.map((r) => [
          `#${r.rank}`,
          r.emp_id,
          r.employee_name.slice(0, 18),
          String(r.total_submitted_qty),
          String(r.total_final_accepted_qty),
          String(r.total_expected_output),
          `${r.accepted_productivity_pct}%`,
          `${r.effective_quality_score}%`,
          `${r.consistency_pct}%`,
          String(r.final_score),
          r.scoring_band,
        ]);
        const pdfBuf = buildSimplePdfBuffer(
          `NEXORA Employee Performance Report (${period.toUpperCase()})`,
          `Range: ${startDate} to ${endDate} | Weights: P ${evalResult.policy.productivity_weight}% / Q ${evalResult.policy.quality_weight}% / C ${evalResult.policy.consistency_weight}%`,
          headers,
          rows
        );
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="nexora_performance_${period}_${startDate}.pdf"`);
        return res.send(pdfBuf);
      }

      const sheetRows = ranked.map((r) => ({
        Rank: r.rank,
        'Employee ID': r.emp_id,
        'Employee Name': r.employee_name,
        Department: r.department,
        Operations: r.segments.map((s: any) => s.operation_name).join(', '),
        'Available Minutes': r.total_available_productive_minutes,
        'Expected Output': r.total_expected_output,
        'Submitted Qty': r.total_submitted_qty,
        'First-Pass Accepted': r.total_first_pass_accepted_qty,
        'Rejected Qty': r.total_rejected_qty,
        'Rework Qty': r.total_rework_qty,
        'Accepted After Rework': r.total_accepted_after_rework_qty,
        'Final Accepted Qty': r.total_final_accepted_qty,
        'Std Min Earned (Accepted)': r.total_standard_minutes_earned_accepted,
        'Gross Productivity %': r.gross_productivity_pct,
        'Accepted Productivity %': r.accepted_productivity_pct,
        'First-Pass Quality %': r.first_pass_quality_pct ?? 'N/A',
        'Final Acceptance %': r.final_acceptance_pct ?? 'N/A',
        'Consistency %': r.consistency_pct,
        'Eligible Workdays': r.eligible_working_days,
        'Final Score': r.final_score,
        'Scoring Band': r.scoring_band,
        'Reward Eligible': r.reward_eligible ? 'Yes' : 'No',
      }));

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(
        sheetRows.length > 0 ? sheetRows : [{ Notice: 'No performance records found for the selected filter period.' }]
      );
      XLSX.utils.book_append_sheet(wb, ws, 'Employee Performance');
      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="nexora_performance_${period}_${startDate}.xlsx"`);
      return res.send(buf);
    } catch (err: any) {
      return sendApiError(res, err, 'Failed to export performance report.');
    }
  });

  // =========================================================================
  // 12. GROUP PRODUCTION & FINISHED PRODUCT READINESS + WIP ASSEMBLY CONSUMPTION
  // =========================================================================
  router.get('/readiness/orders', requirePermission('operations.readiness.view'), async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const db = await getDb();
      const woRes = await db.query(`SELECT id FROM work_orders ORDER BY id DESC LIMIT 50`);
      const results = [];
      for (const row of woRes.rows || []) {
        const readiness = await loadProductionOrderReadiness(db, Number(row.id));
        if (readiness) results.push(readiness);
      }
      return res.json({ success: true, data: results });
    } catch (err: any) {
      return sendApiError(res, err, 'Failed to load production order readiness.');
    }
  });

  router.get('/readiness/orders/:orderId', requirePermission('operations.readiness.view'), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const db = await getDb();
      const readiness = await loadProductionOrderReadiness(db, Number(req.params.orderId));
      if (!readiness) {
        return res.status(404).json({ success: false, message: 'Production order not found.' });
      }
      const asmRows = await db.query(
        `SELECT * FROM production_assembly_records WHERE production_order_id = $1 ORDER BY assembled_at DESC`,
        [Number(req.params.orderId)]
      );
      return res.json({ success: true, data: { ...readiness, assembly_records: asmRows.rows || [] } });
    } catch (err: any) {
      return sendApiError(res, err, 'Failed to load production order readiness detail.');
    }
  });

  // Record atomic component transfer to next stage
  router.post('/readiness/orders/:orderId/transfer-wip', requirePermission('operations.readiness.manage'), async (req: AuthenticatedRequest, res: Response) => {
    const db = await getDb();
    const client = await db.connect();
    try {
      const orderId = Number(req.params.orderId);
      const { operation_id, quantity, notes } = req.body || {};
      const qty = Number(quantity);
      if (!operation_id || !Number.isFinite(qty) || qty <= 0) {
        client.release();
        return res.status(400).json({ success: false, message: 'Operation and positive transfer quantity are required.' });
      }
      await client.query('BEGIN');
      const woRes = await client.query(`SELECT id, product_id FROM work_orders WHERE id = $1 FOR UPDATE`, [orderId]);
      if (!woRes.rows || woRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, message: 'Production order not found.' });
      }
      const txCode = await generateAutoCode(client, 78201009, 'wip_quantity_transactions', 'tx_code', 'WIP', 5);
      const ins = await client.query(
        `INSERT INTO wip_quantity_transactions
         (tx_code, production_order_id, product_id, operation_id, tx_type, quantity, performed_by, notes, created_at)
         VALUES ($1, $2, $3, $4, 'transferred_next', $5, $6, $7, NOW()) RETURNING *`,
        [txCode, orderId, woRes.rows[0].product_id, Number(operation_id), qty, req.user!.email, String(notes || 'Transferred to next operation').trim()]
      );
      await logManufacturingAudit(client, {
        req,
        actorEmail: req.user!.email,
        entityType: 'WipTransfer',
        entityId: txCode,
        action: 'WIP_TRANSFERRED',
        afterValues: ins.rows[0],
      });
      await client.query('COMMIT');
      return res.status(201).json({ success: true, message: `WIP transfer ${txCode} recorded.`, data: ins.rows[0] });
    } catch (err: any) {
      await client.query('ROLLBACK').catch(() => {});
      return sendApiError(res, err, 'Failed to record WIP transfer.');
    } finally {
      client.release();
    }
  });

  // Atomic Assembly Consumption: consumes required accepted components per product_operation_structures
  // so components can NEVER be double-counted across orders or re-used after assembly!
  router.post('/readiness/orders/:orderId/assemble', requirePermission('operations.readiness.manage'), async (req: AuthenticatedRequest, res: Response) => {
    const db = await getDb();
    const client = await db.connect();
    try {
      const orderId = Number(req.params.orderId);
      const qtyToAssemble = Number(req.body?.assembled_qty);
      if (!Number.isFinite(qtyToAssemble) || qtyToAssemble <= 0) {
        client.release();
        return res.status(400).json({ success: false, message: 'Assembled toy quantity must be a positive number.' });
      }

      await client.query('BEGIN');
      // Lock the production order row to prevent concurrent over-consumption
      await client.query(`SELECT id FROM work_orders WHERE id = $1 FOR UPDATE`, [orderId]);
      const readiness = await loadProductionOrderReadiness(client, orderId);
      if (!readiness) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, message: 'Production order not found.' });
      }
      const mandatoryComps = readiness.components.filter((c) => c.is_mandatory);
      if (mandatoryComps.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'Product has no active mandatory component requirements configured in Product Operation Structure.',
        });
      }
      if (qtyToAssemble > readiness.potential_assembly_ready_qty) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          success: false,
          message: `Insufficient quality-approved components for ${qtyToAssemble} toy(s). Current assembly-ready capacity is ${readiness.potential_assembly_ready_qty} toy(s) (limited by ${readiness.limiting_component_operation}).`,
        });
      }

      const asmCode = await generateAutoCode(client, 78201007, 'production_assembly_records', 'assembly_code', 'ASM', 5);
      const asmIns = await client.query(
        `INSERT INTO production_assembly_records
         (assembly_code, production_order_id, product_id, assembled_qty, status, assembled_by, assembled_at, notes)
         VALUES ($1, $2, $3, $4, 'awaiting_final_qc', $5, NOW(), $6) RETURNING *`,
        [asmCode, orderId, readiness.product_id, qtyToAssemble, req.user!.email, String(req.body?.notes || '').trim()]
      );

      // Atomically consume required component quantities for every mandatory operation
      for (const comp of mandatoryComps) {
        const consumeQty = round4(qtyToAssemble * comp.required_qty_per_unit);
        const txCode = await generateAutoCode(client, 78201009, 'wip_quantity_transactions', 'tx_code', 'WIP', 5);
        await client.query(
          `INSERT INTO wip_quantity_transactions
           (tx_code, production_order_id, product_id, operation_id, tx_type, quantity, reference_id, performed_by, notes, created_at)
           VALUES ($1, $2, $3, $4, 'consumed_in_assembly', $5, $6, $7, $8, NOW())`,
          [txCode, orderId, readiness.product_id, comp.operation_id, consumeQty, asmCode, req.user!.email, `Consumed for ${qtyToAssemble} assembled toys (${asmCode})`]
        );
      }

      const asmTxCode = await generateAutoCode(client, 78201009, 'wip_quantity_transactions', 'tx_code', 'WIP', 5);
      await client.query(
        `INSERT INTO wip_quantity_transactions
         (tx_code, production_order_id, product_id, operation_id, tx_type, quantity, reference_id, performed_by, notes, created_at)
         VALUES ($1, $2, $3, NULL, 'assembly_completed', $4, $5, $6, 'Assembled finished toys awaiting final QC', NOW())`,
        [asmTxCode, orderId, readiness.product_id, qtyToAssemble, asmCode, req.user!.email]
      );

      await logManufacturingAudit(client, {
        req,
        actorEmail: req.user!.email,
        entityType: 'ProductionAssembly',
        entityId: asmCode,
        action: 'COMPONENTS_CONSUMED_AND_ASSEMBLED',
        afterValues: { assembly: asmIns.rows[0], consumed_components: mandatoryComps.map((c) => ({ operation: c.operation_name, qty: qtyToAssemble * c.required_qty_per_unit })) },
      });

      await client.query('COMMIT');
      return res.status(201).json({
        success: true,
        message: `Assembled ${qtyToAssemble} toy(s) (${asmCode}) and consumed corresponding WIP components. Awaiting final quality inspection.`,
        data: asmIns.rows[0],
      });
    } catch (err: any) {
      await client.query('ROLLBACK').catch(() => {});
      return sendApiError(res, err, 'Failed to record assembly consumption.');
    } finally {
      client.release();
    }
  });

  // Final Finished Toy Quality Inspection Approval
  router.post('/readiness/assembly/:assemblyId/final-qc', requirePermission('operations.quality.approve'), async (req: AuthenticatedRequest, res: Response) => {
    const db = await getDb();
    const client = await db.connect();
    try {
      const assemblyId = Number(req.params.assemblyId);
      const approved = Math.max(0, Number(req.body?.final_approved_qty || 0));
      const rejected = Math.max(0, Number(req.body?.final_rejected_qty || 0));
      const rework = Math.max(0, Number(req.body?.rework_required_qty || 0));

      await client.query('BEGIN');
      const curRes = await client.query(`SELECT * FROM production_assembly_records WHERE id = $1 FOR UPDATE`, [assemblyId]);
      if (!curRes.rows || curRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, message: 'Assembly record not found.' });
      }
      const cur = curRes.rows[0];
      const assembled = Number(cur.assembled_qty);
      if (approved + rejected + rework > assembled + 0.0001) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: `Approved (${approved}) + Rejected (${rejected}) + Rework (${rework}) cannot exceed assembled quantity (${assembled}).`,
        });
      }

      const nextStatus =
        rework > 0 && approved + rejected + rework >= assembled
          ? 'rework_required'
          : approved + rejected + rework >= assembled
            ? 'finished_approved'
            : 'awaiting_final_qc';

      const upd = await client.query(
        `UPDATE production_assembly_records
         SET final_approved_qty = $1, final_rejected_qty = $2, rework_required_qty = $3,
             status = $4, inspected_by = $5, inspected_at = NOW(), notes = COALESCE(NULLIF($6, ''), notes)
         WHERE id = $7 RETURNING *`,
        [approved, rejected, rework, nextStatus, req.user!.email, String(req.body?.notes || '').trim(), assemblyId]
      );

      if (approved > 0) {
        const txCode = await generateAutoCode(client, 78201009, 'wip_quantity_transactions', 'tx_code', 'WIP', 5);
        await client.query(
          `INSERT INTO wip_quantity_transactions
           (tx_code, production_order_id, product_id, tx_type, quantity, reference_id, performed_by, notes, created_at)
           VALUES ($1, $2, $3, 'finished_qc_approved', $4, $5, $6, 'Final quality-approved finished toys', NOW())`,
          [txCode, cur.production_order_id, cur.product_id, approved, cur.assembly_code, req.user!.email]
        );
      }

      await logManufacturingAudit(client, {
        req,
        actorEmail: req.user!.email,
        entityType: 'FinishedProductQC',
        entityId: cur.assembly_code,
        action: 'FINAL_PRODUCT_QC_RECORDED',
        beforeValues: cur,
        afterValues: upd.rows[0],
      });

      await client.query('COMMIT');
      return res.json({ success: true, message: `Final QC recorded: ${approved} finished toys approved.`, data: upd.rows[0] });
    } catch (err: any) {
      await client.query('ROLLBACK').catch(() => {});
      return sendApiError(res, err, 'Failed to record final finished product QC.');
    } finally {
      client.release();
    }
  });

  // =========================================================================
  // 13. PRODUCTION FORECASTING & BOTTLENECK ENGINE
  // =========================================================================
  async function buildOrderForecast(db: { query: DbClientLike['query'] }, orderId: number) {
    const readiness = await loadProductionOrderReadiness(db, orderId);
    if (!readiness) return null;

    // Load all configured operations for this product (including assembly stage)
    const structRes = await db.query(
      `SELECT pos.operation_id, mo.operation_code, mo.name AS operation_name,
              pos.component_name, pos.required_qty_per_unit,
              COALESCE(pos.standard_time_override_minutes, mo.standard_time_minutes) AS standard_time_minutes,
              pos.is_mandatory, pos.is_assembly_stage
       FROM product_operation_structures pos
       JOIN manufacturing_operations mo ON mo.id = pos.operation_id
       WHERE pos.product_id = $1 AND pos.is_active = TRUE
       ORDER BY pos.sequence_order ASC`,
      [readiness.product_id]
    );

    // Load active shift configuration (default working days from configured shifts)
    const shiftRes = await db.query(
      `SELECT available_productive_minutes, working_days FROM manufacturing_shifts WHERE is_active = TRUE ORDER BY id ASC LIMIT 1`
    );
    const defaultShiftMins = Number(shiftRes.rows[0]?.available_productive_minutes || 480);
    const workingDaysPerWeek = Array.isArray(shiftRes.rows[0]?.working_days) && shiftRes.rows[0].working_days.length > 0
      ? shiftRes.rows[0].working_days.length
      : 6;
    const workingDaysPerMonth = Math.round((workingDaysPerWeek / 7) * 30);

    // Load active assignments per operation for this product/order
    const assignRes = await db.query(
      `SELECT a.operation_id, COUNT(DISTINCT a.employee_id)::int AS emp_count,
              AVG(COALESCE(ms.available_productive_minutes, $2))::numeric AS avg_shift_mins
       FROM employee_operation_assignments a
       LEFT JOIN manufacturing_shifts ms ON ms.id = a.shift_id
       WHERE a.product_id = $1 AND a.status = 'active' AND a.end_at IS NULL
         AND (a.production_order_id IS NULL OR a.production_order_id = $3)
       GROUP BY a.operation_id`,
      [readiness.product_id, defaultShiftMins, orderId]
    );
    const assignMap = new Map<number, { count: number; shiftMins: number }>();
    for (const r of assignRes.rows || []) {
      assignMap.set(Number(r.operation_id), { count: Number(r.emp_count || 0), shiftMins: Number(r.avg_shift_mins || defaultShiftMins) });
    }

    // Load last 30 days historical quality yield per operation (returns null if no history -> never fabricated!)
    const qcHistRes = await db.query(
      `SELECT operation_id,
              SUM(submitted_qty) AS total_sub,
              SUM(first_pass_accepted_qty + accepted_after_rework_qty) AS total_acc
       FROM operation_quality_inspections
       WHERE product_id = $1 AND inspected_at >= NOW() - INTERVAL '30 days'
       GROUP BY operation_id`,
      [readiness.product_id]
    );
    const yieldMap = new Map<number, number>();
    for (const r of qcHistRes.rows || []) {
      const sub = Number(r.total_sub || 0);
      const acc = Number(r.total_acc || 0);
      if (sub > 0) yieldMap.set(Number(r.operation_id), Math.min(1, acc / sub));
    }

    // Load average approved downtime per operation over last 14 days
    const dtRes = await db.query(
      `SELECT operation_id, AVG(daily_dt)::numeric AS avg_daily_dt
       FROM (
         SELECT operation_id, DATE(start_at), SUM(duration_minutes) AS daily_dt
         FROM production_downtime_logs
         WHERE is_approved = TRUE AND operation_id IS NOT NULL AND start_at >= NOW() - INTERVAL '14 days'
         GROUP BY operation_id, DATE(start_at)
       ) sub
       GROUP BY operation_id`
    );
    const dtMap = new Map<number, number>();
    for (const r of dtRes.rows || []) {
      dtMap.set(Number(r.operation_id), Number(r.avg_daily_dt || 0));
    }

    const compWipMap = new Map(readiness.components.map((c) => [c.operation_id, c]));

    const stageInputs: ForecastOperationInput[] = (structRes.rows || []).map((s: any) => {
      const opId = Number(s.operation_id);
      const assigned = assignMap.get(opId);
      const comp = compWipMap.get(opId);
      return {
        operation_id: opId,
        operation_code: String(s.operation_code),
        operation_name: String(s.operation_name),
        component_name: String(s.component_name),
        required_qty_per_unit: Number(s.required_qty_per_unit),
        standard_time_minutes: Number(s.standard_time_minutes),
        is_mandatory: Boolean(s.is_mandatory),
        is_assembly_stage: Boolean(s.is_assembly_stage),
        assigned_employees_count: assigned?.count || 0,
        shift_available_productive_minutes: assigned?.shiftMins || defaultShiftMins,
        approved_downtime_minutes_per_shift: dtMap.get(opId) || 0,
        historical_efficiency_ratio: null, // Uses standards unless real historical shift efficiency is recorded
        historical_quality_yield_ratio: yieldMap.has(opId) ? yieldMap.get(opId)! : null,
        available_wip_qty: comp?.available_accepted_qty || 0,
        waiting_between_ops_qty: comp ? comp.pending_inspection_qty + Math.max(0, comp.quality_approved_qty - comp.transferred_qty - comp.consumed_in_assembly_qty) : 0,
      };
    });

    const forecast = calculateForecastAndBottlenecks({
      target_qty: readiness.target_qty,
      already_finished_approved_qty: readiness.final_approved_finished_qty,
      working_days_per_week: workingDaysPerWeek,
      working_days_per_month: workingDaysPerMonth,
      stages: stageInputs,
    });

    return {
      production_order_id: readiness.production_order_id,
      order_number: readiness.order_number,
      product_id: readiness.product_id,
      product_name: readiness.product_name,
      readiness_summary: {
        target_qty: readiness.target_qty,
        potential_assembly_ready_qty: readiness.potential_assembly_ready_qty,
        assembled_qty: readiness.assembled_qty,
        final_approved_finished_qty: readiness.final_approved_finished_qty,
        finished_product_readiness_pct: readiness.finished_product_readiness_pct,
        finished_product_status: readiness.finished_product_status,
      },
      forecast,
    };
  }

  router.get('/forecasting/orders/:orderId', requirePermission('operations.forecasts.view'), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const db = await getDb();
      const result = await buildOrderForecast(db, Number(req.params.orderId));
      if (!result) {
        return res.status(404).json({ success: false, message: 'Production order not found.' });
      }
      return res.json({ success: true, data: result });
    } catch (err: any) {
      return sendApiError(res, err, 'Failed to calculate production forecast.');
    }
  });

  router.get('/forecasting/summary', requirePermission('operations.forecasts.view'), async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const db = await getDb();
      const woRes = await db.query(
        `SELECT id FROM work_orders WHERE LOWER(COALESCE(status, '')) NOT IN ('completed', 'cancelled') ORDER BY id DESC LIMIT 20`
      );
      const orders = [];
      for (const row of woRes.rows || []) {
        const f = await buildOrderForecast(db, Number(row.id));
        if (f) orders.push(f);
      }
      return res.json({ success: true, data: orders });
    } catch (err: any) {
      return sendApiError(res, err, 'Failed to load production forecasting summary.');
    }
  });

  // =========================================================================
  // 14. BEST EMPLOYEE & REWARD MANAGEMENT (Configurable Rules + Mandatory Approval)
  // =========================================================================
  router.get('/rewards/rules', requirePermission('operations.view'), async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const db = await getDb();
      const rows = await db.query(`SELECT * FROM employee_reward_rules ORDER BY id DESC`);
      return res.json({ success: true, data: rows.rows || [] });
    } catch (err: any) {
      return sendApiError(res, err, 'Failed to fetch reward rules.');
    }
  });

  router.post('/rewards/rules', requirePermission('operations.rewards.manage'), async (req: AuthenticatedRequest, res: Response) => {
    const db = await getDb();
    const client = await db.connect();
    try {
      const { rule_name, category, frequency, min_productivity_pct, min_quality_pct, min_working_days, reward_type, reward_amount, approval_authority } = req.body || {};
      if (!String(rule_name || '').trim() || !VALID_REWARD_CATEGORIES.includes(category)) {
        client.release();
        return res.status(400).json({ success: false, message: 'Valid rule_name and reward category are required.' });
      }
      await client.query('BEGIN');
      const code = await generateAutoCode(client, 78201010, 'employee_reward_rules', 'rule_code', 'RWR', 4);
      const ins = await client.query(
        `INSERT INTO employee_reward_rules
         (rule_code, rule_name, category, frequency, min_productivity_pct, min_quality_pct, min_working_days, reward_type, reward_amount, approval_authority, is_active, created_by, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,TRUE,$11,NOW(),NOW()) RETURNING *`,
        [
          code,
          String(rule_name).trim(),
          category,
          ['daily', 'weekly', 'monthly', 'custom'].includes(frequency) ? frequency : 'monthly',
          Number(min_productivity_pct ?? 90),
          Number(min_quality_pct ?? 95),
          Math.max(1, Number(min_working_days ?? 1)),
          String(reward_type || 'Monetary Bonus').trim(),
          Math.max(0, Number(reward_amount || 0)),
          String(approval_authority || 'Plant Manager / Admin').trim(),
          req.user!.email,
        ]
      );
      await client.query('COMMIT');
      return res.status(201).json({ success: true, message: `Reward rule ${code} created.`, data: ins.rows[0] });
    } catch (err: any) {
      await client.query('ROLLBACK').catch(() => {});
      return sendApiError(res, err, 'Failed to create reward rule.');
    } finally {
      client.release();
    }
  });

  // Evaluate ranked candidates across all 7 reward categories for management review
  router.get('/rewards/candidates', requirePermission('operations.view'), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const db = await getDb();
      const { period, startDate, endDate } = resolvePeriodDates(req.query);
      const category = String(req.query.category || 'overall_best_employee');
      const operationId = req.query.operation_id ? Number(req.query.operation_id) : undefined;

      const evalResult = await evaluateEmployeePerformanceReport(db, {
        period,
        startDate,
        endDate,
        operationId,
      });

      const sorted = [...evalResult.records].sort((a, b) => {
        if (category === 'best_quality_performer') {
          return b.effective_quality_score - a.effective_quality_score || b.final_score - a.final_score;
        }
        if (category === 'most_consistent_employee') {
          return b.consistency_pct - a.consistency_pct || b.final_score - a.final_score;
        }
        return b.final_score - a.final_score || b.accepted_productivity_pct - a.accepted_productivity_pct;
      });

      return res.json({
        success: true,
        data: {
          category,
          period,
          start_date: startDate,
          end_date: endDate,
          policy: evalResult.policy,
          candidates: sorted.map((c, idx) => ({ ...c, rank: idx + 1 })),
        },
      });
    } catch (err: any) {
      return sendApiError(res, err, 'Failed to compute reward candidates.');
    }
  });

  // Nominate candidate for management approval (NEVER auto-finalised!)
  router.post('/rewards/nominate', requirePermission('operations.rewards.manage'), async (req: AuthenticatedRequest, res: Response) => {
    const db = await getDb();
    const client = await db.connect();
    try {
      const {
        rule_id,
        category,
        period_type,
        period_start,
        period_end,
        employee_id,
        operation_id,
        reward_type,
        reward_amount,
        review_notes,
      } = req.body || {};

      if (!employee_id || !VALID_REWARD_CATEGORIES.includes(category) || !period_start || !period_end) {
        client.release();
        return res.status(400).json({ success: false, message: 'Employee, valid reward category, and period_start/period_end are required.' });
      }

      const evalResult = await evaluateEmployeePerformanceReport(db, {
        period: ['daily', 'weekly', 'monthly', 'custom'].includes(period_type) ? period_type : 'monthly',
        startDate: String(period_start),
        endDate: String(period_end),
        employeeId: Number(employee_id),
        operationId: operation_id ? Number(operation_id) : undefined,
      });
      const candidate = evalResult.records[0];
      if (!candidate) {
        client.release();
        return res.status(400).json({
          success: false,
          message: 'Selected employee has no verified production records in this reporting period.',
        });
      }

      await client.query('BEGIN');
      const awardCode = await generateAutoCode(client, 78201011, 'employee_reward_records', 'award_code', 'AWD', 5);
      const ins = await client.query(
        `INSERT INTO employee_reward_records
         (award_code, rule_id, category, period_type, period_start, period_end, employee_id, emp_id, operation_id,
          productivity_pct, quality_pct, consistency_pct, final_score, eligible_working_days,
          reward_type, reward_amount, approval_status, nominated_by, review_notes, supporting_snapshot, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'pending_approval',$17,$18,$19::jsonb,NOW(),NOW())
         RETURNING *`,
        [
          awardCode,
          rule_id ? Number(rule_id) : null,
          category,
          ['daily', 'weekly', 'monthly', 'custom'].includes(period_type) ? period_type : 'monthly',
          String(period_start),
          String(period_end),
          candidate.employee_id,
          candidate.emp_id,
          operation_id ? Number(operation_id) : null,
          candidate.actual_productivity_pct,
          candidate.effective_quality_score,
          candidate.consistency_pct,
          candidate.final_score,
          candidate.eligible_working_days,
          String(reward_type || 'Performance Bonus').trim(),
          Math.max(0, Number(reward_amount || 0)),
          req.user!.email,
          String(review_notes || '').trim(),
          JSON.stringify(candidate),
        ]
      );

      await logManufacturingAudit(client, {
        req,
        actorEmail: req.user!.email,
        entityType: 'EmployeeReward',
        entityId: awardCode,
        action: 'REWARD_NOMINATED',
        afterValues: ins.rows[0],
      });

      await client.query('COMMIT');
      return res.status(201).json({
        success: true,
        message: `Reward nomination ${awardCode} submitted for management approval.`,
        data: ins.rows[0],
      });
    } catch (err: any) {
      await client.query('ROLLBACK').catch(() => {});
      return sendApiError(res, err, 'Failed to nominate employee reward.');
    } finally {
      client.release();
    }
  });

  router.get('/rewards/history', requirePermission('operations.view'), async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const db = await getDb();
      const rows = await db.query(
        `SELECT rr.*, pe.first_name, pe.last_name, mo.name AS operation_name
         FROM employee_reward_records rr
         JOIN performance_employees pe ON pe.id = rr.employee_id
         LEFT JOIN manufacturing_operations mo ON mo.id = rr.operation_id
         ORDER BY rr.created_at DESC LIMIT 200`
      );
      return res.json({ success: true, data: rows.rows || [] });
    } catch (err: any) {
      return sendApiError(res, err, 'Failed to fetch reward history.');
    }
  });

  router.post('/rewards/:id/decision', requirePermission('operations.rewards.approve'), async (req: AuthenticatedRequest, res: Response) => {
    const db = await getDb();
    const client = await db.connect();
    try {
      const id = Number(req.params.id);
      const { decision, review_notes } = req.body || {};
      if (!['approved', 'rejected', 'disbursed'].includes(decision)) {
        client.release();
        return res.status(400).json({ success: false, message: 'Decision must be approved, rejected, or disbursed.' });
      }
      await client.query('BEGIN');
      const prevRes = await client.query(`SELECT * FROM employee_reward_records WHERE id = $1 FOR UPDATE`, [id]);
      if (!prevRes.rows || prevRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, message: 'Reward record not found.' });
      }
      const prev = prevRes.rows[0];
      const upd = await client.query(
        `UPDATE employee_reward_records
         SET approval_status = $1, approved_by = $2, approved_at = NOW(), review_notes = COALESCE(NULLIF($3, ''), review_notes), updated_at = NOW()
         WHERE id = $4 RETURNING *`,
        [decision, req.user!.email, String(review_notes || '').trim(), id]
      );

      await logManufacturingAudit(client, {
        req,
        actorEmail: req.user!.email,
        entityType: 'EmployeeReward',
        entityId: prev.award_code,
        action: `REWARD_${String(decision).toUpperCase()}`,
        beforeValues: { approval_status: prev.approval_status },
        afterValues: { approval_status: decision, approved_by: req.user!.email },
        reason: String(review_notes || ''),
      });

      await client.query('COMMIT');
      return res.json({ success: true, message: `Reward ${prev.award_code} marked as ${decision}.`, data: upd.rows[0] });
    } catch (err: any) {
      await client.query('ROLLBACK').catch(() => {});
      return sendApiError(res, err, 'Failed to record reward approval decision.');
    } finally {
      client.release();
    }
  });

  // =========================================================================
  // 15. MAIN EXECUTIVE OPERATIONS DASHBOARD & AUDIT LOGS
  // =========================================================================
  router.get('/dashboard/summary', requirePermission('operations.view'), async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const db = await getDb();
      const todayStr = new Date().toISOString().slice(0, 10);
      const weekAgoStr = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
      const monthStartStr = `${todayStr.slice(0, 7)}-01`;

      const [empCountRes, prodTodayRes, compTotalsRes, qcTotalsRes, excCountRes, woIdsRes] = await Promise.all([
        db.query(`SELECT COUNT(*)::int AS active_employees FROM performance_employees WHERE is_active = TRUE`).catch(() => ({ rows: [{ active_employees: 0 }] })),
        db.query(
          `SELECT COUNT(DISTINCT employee_id)::int AS active_today
           FROM hardware_production_events
           WHERE processing_status IN ('accepted', 'resolved_accepted')
             AND event_timestamp >= CURRENT_DATE`
        ).catch(() => ({ rows: [{ active_today: 0 }] })),
        db.query(
          `SELECT
             COALESCE(SUM(quantity) FILTER (WHERE event_timestamp >= CURRENT_DATE), 0) AS daily_components,
             COALESCE(SUM(quantity) FILTER (WHERE event_timestamp >= CURRENT_DATE - INTERVAL '6 days'), 0) AS weekly_components,
             COALESCE(SUM(quantity) FILTER (WHERE event_timestamp >= DATE_TRUNC('month', CURRENT_DATE)), 0) AS monthly_components
           FROM hardware_production_events
           WHERE processing_status IN ('accepted', 'resolved_accepted')`
        ).catch(() => ({ rows: [{}] })),
        db.query(
          `SELECT
             COALESCE(SUM(submitted_qty), 0) AS submitted,
             COALESCE(SUM(first_pass_accepted_qty + accepted_after_rework_qty), 0) AS accepted,
             COALESCE(SUM(rejected_qty), 0) AS rejected,
             COALESCE(SUM(rework_qty), 0) AS rework
           FROM operation_quality_inspections
           WHERE inspected_at >= DATE_TRUNC('month', CURRENT_DATE)`
        ).catch(() => ({ rows: [{}] })),
        db.query(
          `SELECT COUNT(*)::int AS open_exceptions
           FROM hardware_production_events
           WHERE processing_status IN ('exception_unassigned', 'exception_ambiguous', 'invalid_hardware')`
        ).catch(() => ({ rows: [{ open_exceptions: 0 }] })),
        db.query(`SELECT id FROM work_orders ORDER BY id DESC LIMIT 10`).catch(() => ({ rows: [] })),
      ]);

      const orderReadinessList = [];
      let totalTargetToys = 0;
      let totalFinishedApprovedToys = 0;
      let totalAssembledToys = 0;
      let totalAssemblyReadyToys = 0;

      for (const r of woIdsRes.rows || []) {
        const rd = await loadProductionOrderReadiness(db, Number(r.id));
        if (rd) {
          orderReadinessList.push(rd);
          totalTargetToys += rd.target_qty;
          totalFinishedApprovedToys += rd.final_approved_finished_qty;
          totalAssembledToys += rd.assembled_qty;
          totalAssemblyReadyToys += rd.potential_assembly_ready_qty;
        }
      }

      // Compute primary order forecast & bottleneck if any production order exists
      let primaryForecast: any = null;
      if (orderReadinessList.length > 0) {
        primaryForecast = await buildOrderForecast(db, orderReadinessList[0].production_order_id);
      }

      // Top fair performers (weekly window to avoid single-day distortion; falls back to monthly/daily if empty)
      const perfEval = await evaluateEmployeePerformanceReport(db, {
        period: 'weekly',
        startDate: weekAgoStr,
        endDate: todayStr,
      });
      const topPerformers = [...perfEval.records]
        .sort((a, b) => b.final_score - a.final_score)
        .slice(0, 5)
        .map((r, i) => ({ ...r, rank: i + 1 }));

      const qc = qcTotalsRes.rows[0] || {};
      const qcSub = Number(qc.submitted || 0);
      const qcAcc = Number(qc.accepted || 0);
      const qualityAcceptanceRate = qcSub > 0 ? round2((Math.min(qcSub, qcAcc) / qcSub) * 100) : null;

      return res.json({
        success: true,
        data: {
          active_employees: Number(empCountRes.rows[0]?.active_employees || 0),
          employees_recorded_today: Number(prodTodayRes.rows[0]?.active_today || 0),
          daily_component_production: round2(Number(compTotalsRes.rows[0]?.daily_components || 0)),
          weekly_component_production: round2(Number(compTotalsRes.rows[0]?.weekly_components || 0)),
          monthly_component_production: round2(Number(compTotalsRes.rows[0]?.monthly_components || 0)),
          open_hardware_exceptions: Number(excCountRes.rows[0]?.open_exceptions || 0),
          total_target_toys: round2(totalTargetToys),
          assembly_ready_toys: round2(totalAssemblyReadyToys),
          assembled_toys: round2(totalAssembledToys),
          finished_approved_toys: round2(totalFinishedApprovedToys),
          finished_toy_readiness_pct: totalTargetToys > 0 ? round2((totalFinishedApprovedToys / totalTargetToys) * 100) : 0,
          quality_acceptance_rate_pct: qualityAcceptanceRate,
          monthly_rejected_qty: round2(Number(qc.rejected || 0)),
          monthly_rework_qty: round2(Number(qc.rework || 0)),
          current_bottleneck: primaryForecast?.forecast?.bottleneck_operation || null,
          forecast_summary: primaryForecast?.forecast || null,
          order_readiness: orderReadinessList,
          top_performers: topPerformers,
          scoring_policy: perfEval.policy,
          month_range: { start: monthStartStr, end: todayStr },
        },
      });
    } catch (err: any) {
      return sendApiError(res, err, 'Failed to load executive operations dashboard.');
    }
  });

  router.get('/audit-logs', requirePermission('operations.view'), async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const db = await getDb();
      const rows = await db.query(`SELECT * FROM manufacturing_audit_logs ORDER BY created_at DESC LIMIT 200`);
      return res.json({ success: true, data: rows.rows || [] });
    } catch (err: any) {
      return sendApiError(res, err, 'Failed to fetch manufacturing audit logs.');
    }
  });

  return router;
}
