import express, { Request, Response } from 'express';
import crypto from 'crypto';
import { getDb } from './db';
import { store } from './store';
import { authService } from './authService';
import { securityStore } from './security/securityStore';
import { securityConfig } from './security/config';
import { processHardwareButtonEvent } from './operationsPerformanceRoutes';
import { isValidIsoDate } from './security/redaction';
import { computeNextEmployeeId } from './utils/employeeId';
import { AuthenticatedRequest } from '../server';

const router = express.Router();

export const VALID_EMPLOYEE_TYPES = ['full_time', 'training', 'third_party'] as const;
export type PerformanceEmployeeType = (typeof VALID_EMPLOYEE_TYPES)[number];

export const EMPLOYEE_TYPE_LABELS: Record<PerformanceEmployeeType, string> = {
  full_time: 'Full-time',
  training: 'Training',
  third_party: 'Third-party',
};

export function normalizeEmployeeType(raw: unknown): PerformanceEmployeeType | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (cleaned === 'full_time' || cleaned === 'fulltime') return 'full_time';
  if (cleaned === 'training' || cleaned === 'trainee') return 'training';
  if (cleaned === 'third_party' || cleaned === 'thirdparty') return 'third_party';
  return null;
}

export function validateHardwareId(raw: unknown): { valid: boolean; value: string; error?: string } {
  const value = typeof raw === 'string' ? raw.trim().toUpperCase() : '';
  if (!value) {
    return { valid: false, value: '', error: 'Hardware ID is required.' };
  }
  if (value.length < 2 || value.length > 100) {
    return { valid: false, value, error: 'Hardware ID must be between 2 and 100 characters.' };
  }
  if (!/^[A-Z0-9][A-Z0-9._:-]*$/.test(value)) {
    return {
      valid: false,
      value,
      error: 'Hardware ID may only contain letters, numbers, hyphens, underscores, dots, or colons.',
    };
  }
  return { valid: true, value };
}

function getActiveCompanyName(): string {
  try {
    const company = store.getAppCompany?.();
    if (company?.company_name) return company.company_name;
  } catch {}
  return process.env.COMPANY_NAME || 'Nexora ERP';
}

let performanceDbOverride: (() => Promise<any>) | null = null;
export function setPerformanceDbProvider(provider: (() => Promise<any>) | null): void {
  performanceDbOverride = provider;
}

async function resolvePerfDb(): Promise<any> {
  return performanceDbOverride ? performanceDbOverride() : getDb();
}

function resolveUserDepartmentScope(req: AuthenticatedRequest): { restricted: boolean; departmentName: string | null } {
  const reqUser = req.user;
  if (!reqUser) return { restricted: false, departmentName: null };
  const storeUser = store.findUserById(reqUser.id);
  const roleList = [reqUser.role, ...(storeUser?.roles || [])].map((r) => String(r || '').toLowerCase());
  const isGlobalRole = roleList.includes('super_admin') || roleList.includes('admin');
  if (isGlobalRole) return { restricted: false, departmentName: null };

  const perms = storeUser ? store.getUserEffectivePermissions(storeUser) : store.getRolePermissions(reqUser.role);
  const hasGlobalScope = perms.includes('*') || perms.includes('users.view') || perms.includes('departments.view');
  const dept = (storeUser?.department || (reqUser as any).department || '').trim();
  if (!hasGlobalScope && dept) {
    return { restricted: true, departmentName: dept };
  }
  return { restricted: false, departmentName: null };
}

async function fetchActiveDepartments(db: any): Promise<Array<{ id: number; code: string; name: string }>> {
  const fromPg = new Map<number, { id: number; code: string; name: string }>();
  try {
    const res = await db.query(
      `SELECT id, code, name FROM departments
       WHERE COALESCE(is_active, TRUE) = TRUE
         AND LOWER(COALESCE(status, 'active')) = 'active'
       ORDER BY name ASC`
    );
    for (const row of res.rows || []) {
      fromPg.set(Number(row.id), {
        id: Number(row.id),
        code: String(row.code || ''),
        name: String(row.name || ''),
      });
    }
  } catch (err: any) {
    // Graceful fallback if legacy departments table has only status or only is_active
    if (err?.code === '42703') {
      try {
        const res = await db.query(
          `SELECT id, code, name FROM departments
           WHERE LOWER(COALESCE(status, 'active')) = 'active'
           ORDER BY name ASC`
        );
        for (const row of res.rows || []) {
          fromPg.set(Number(row.id), {
            id: Number(row.id),
            code: String(row.code || ''),
            name: String(row.name || ''),
          });
        }
      } catch {
        try {
          const res = await db.query(`SELECT id, code, name FROM departments ORDER BY name ASC`);
          for (const row of res.rows || []) {
            fromPg.set(Number(row.id), {
              id: Number(row.id),
              code: String(row.code || ''),
              name: String(row.name || ''),
            });
          }
        } catch {}
      }
    }
  }

  if (fromPg.size > 0) {
    return Array.from(fromPg.values());
  }

  // Fallback to active departments persisted in PostgreSQL-backed store state if relational table not yet populated
  try {
    const storeDepts = store.getDepartments({ status: 'active' }) || [];
    return storeDepts
      .filter((d: any) => d.is_active !== false)
      .map((d: any) => ({
        id: Number(d.id),
        code: String(d.code || ''),
        name: String(d.name || ''),
      }))
      .sort((a: any, b: any) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

async function fetchActiveRoles(db: any): Promise<Array<{ id: number; code: string; name: string }>> {
  const fromPg = new Map<number, { id: number; code: string; name: string }>();
  try {
    const res = await db.query(
      `SELECT id, code, name FROM roles WHERE COALESCE(is_active, TRUE) = TRUE ORDER BY name ASC`
    );
    for (const row of res.rows || []) {
      fromPg.set(Number(row.id), {
        id: Number(row.id),
        code: String(row.code || ''),
        name: String(row.name || ''),
      });
    }
  } catch (err: any) {
    if (err?.code === '42703') {
      try {
        const res = await db.query(`SELECT id, code, name FROM roles ORDER BY name ASC`);
        for (const row of res.rows || []) {
          fromPg.set(Number(row.id), {
            id: Number(row.id),
            code: String(row.code || ''),
            name: String(row.name || ''),
          });
        }
      } catch {}
    }
  }

  if (fromPg.size > 0) {
    return Array.from(fromPg.values());
  }

  try {
    const storeRoles = store.getRoles?.() || [];
    return storeRoles
      .filter((r: any) => r.is_active !== false)
      .map((r: any, idx: number) => ({
        id: Number(r.id || idx + 1),
        code: String(r.code || r.name || ''),
        name: String(r.name || r.code || ''),
      }))
      .sort((a: any, b: any) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

async function resolveAndSyncActiveDepartment(
  client: any,
  departmentId: number
): Promise<{ id: number; code: string; name: string } | null> {
  // Use SAVEPOINT so schema variance (status vs is_active) never aborts the active PG transaction (25P02)
  await client.query(`SAVEPOINT sp_resolve_dept`);
  try {
    const pgRes = await client.query(
      `SELECT id, code, name FROM departments
       WHERE id = $1
         AND COALESCE(is_active, TRUE) = TRUE
         AND LOWER(COALESCE(status, 'active')) = 'active'
       LIMIT 1`,
      [departmentId]
    );
    await client.query(`RELEASE SAVEPOINT sp_resolve_dept`);
    if (pgRes.rows && pgRes.rows.length > 0) {
      const r = pgRes.rows[0];
      return { id: Number(r.id), code: String(r.code || ''), name: String(r.name || '') };
    }
  } catch (err: any) {
    await client.query(`ROLLBACK TO SAVEPOINT sp_resolve_dept`);
    if (err?.code === '42703') {
      try {
        const legacyRes = await client.query(
          `SELECT id, code, name FROM departments WHERE id = $1 LIMIT 1`,
          [departmentId]
        );
        await client.query(`RELEASE SAVEPOINT sp_resolve_dept`);
        if (legacyRes.rows && legacyRes.rows.length > 0) {
          const r = legacyRes.rows[0];
          return { id: Number(r.id), code: String(r.code || ''), name: String(r.name || '') };
        }
      } catch {
        await client.query(`ROLLBACK TO SAVEPOINT sp_resolve_dept`);
        await client.query(`RELEASE SAVEPOINT sp_resolve_dept`);
      }
    } else {
      await client.query(`RELEASE SAVEPOINT sp_resolve_dept`);
      throw err;
    }
  }

  // Check active Department Management store (persisted in PG app state) and sync row cleanly
  const storeDept = (store.getDepartments({ status: 'active' }) || []).find(
    (d: any) => Number(d.id) === Number(departmentId) && d.is_active !== false
  );
  if (!storeDept) return null;

  // Check if department already exists in PG by code or name to avoid UNIQUE(code)/UNIQUE(name) conflicts
  await client.query(`SAVEPOINT sp_sync_dept`);
  try {
    const byCodeOrName = await client.query(
      `SELECT id, code, name FROM departments
       WHERE LOWER(TRIM(code)) = LOWER(TRIM($1)) OR LOWER(TRIM(name)) = LOWER(TRIM($2))
       LIMIT 1`,
      [storeDept.code, storeDept.name]
    );
    if (byCodeOrName.rows && byCodeOrName.rows.length > 0) {
      await client.query(`RELEASE SAVEPOINT sp_sync_dept`);
      const existing = byCodeOrName.rows[0];
      return { id: Number(existing.id), code: String(existing.code), name: String(existing.name) };
    }

    const synced = await client.query(
      `INSERT INTO departments (id, code, name, description, status, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'active', TRUE, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, code = EXCLUDED.code, status = 'active', is_active = TRUE, updated_at = NOW()
       RETURNING id, code, name`,
      [storeDept.id, storeDept.code, storeDept.name, storeDept.description || '']
    );
    await client.query(`RELEASE SAVEPOINT sp_sync_dept`);
    const row = synced.rows[0];
    return { id: Number(row.id), code: String(row.code), name: String(row.name) };
  } catch (syncErr: any) {
    await client.query(`ROLLBACK TO SAVEPOINT sp_sync_dept`);
    // Fallback for legacy departments schema lacking is_active or status column
    if (syncErr?.code === '42703') {
      try {
        const legacyInsert = await client.query(
          `INSERT INTO departments (id, code, name, description, created_at, updated_at)
           VALUES ($1, $2, $3, $4, NOW(), NOW())
           ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, code = EXCLUDED.code, updated_at = NOW()
           RETURNING id, code, name`,
          [storeDept.id, storeDept.code, storeDept.name, storeDept.description || '']
        );
        await client.query(`RELEASE SAVEPOINT sp_sync_dept`);
        const row = legacyInsert.rows[0];
        return { id: Number(row.id), code: String(row.code), name: String(row.name) };
      } catch {
        await client.query(`ROLLBACK TO SAVEPOINT sp_sync_dept`);
        await client.query(`RELEASE SAVEPOINT sp_sync_dept`);
        return { id: Number(storeDept.id), code: String(storeDept.code), name: String(storeDept.name) };
      }
    }
    await client.query(`RELEASE SAVEPOINT sp_sync_dept`);
    throw syncErr;
  }
}

async function resolveAndSyncActiveRole(
  client: any,
  roleId: number
): Promise<{ id: number; code: string; name: string } | null> {
  await client.query(`SAVEPOINT sp_resolve_role`);
  try {
    const pgRes = await client.query(
      `SELECT id, code, name FROM roles WHERE id = $1 AND COALESCE(is_active, TRUE) = TRUE LIMIT 1`,
      [roleId]
    );
    await client.query(`RELEASE SAVEPOINT sp_resolve_role`);
    if (pgRes.rows && pgRes.rows.length > 0) {
      const r = pgRes.rows[0];
      return { id: Number(r.id), code: String(r.code || ''), name: String(r.name || '') };
    }
  } catch (err: any) {
    await client.query(`ROLLBACK TO SAVEPOINT sp_resolve_role`);
    if (err?.code === '42703') {
      try {
        const legacyRes = await client.query(`SELECT id, code, name FROM roles WHERE id = $1 LIMIT 1`, [roleId]);
        await client.query(`RELEASE SAVEPOINT sp_resolve_role`);
        if (legacyRes.rows && legacyRes.rows.length > 0) {
          const r = legacyRes.rows[0];
          return { id: Number(r.id), code: String(r.code || ''), name: String(r.name || '') };
        }
      } catch {
        await client.query(`ROLLBACK TO SAVEPOINT sp_resolve_role`);
        await client.query(`RELEASE SAVEPOINT sp_resolve_role`);
      }
    } else {
      await client.query(`RELEASE SAVEPOINT sp_resolve_role`);
      throw err;
    }
  }

  const storeRole = (store.getRoles?.() || []).find(
    (r: any) => Number(r.id) === Number(roleId) && r.is_active !== false
  );
  if (!storeRole) return null;

  const roleCode = storeRole.code || String(storeRole.name || '').toLowerCase().replace(/\s+/g, '_');

  await client.query(`SAVEPOINT sp_sync_role`);
  try {
    const byCode = await client.query(
      `SELECT id, code, name FROM roles WHERE LOWER(TRIM(code)) = LOWER(TRIM($1)) LIMIT 1`,
      [roleCode]
    );
    if (byCode.rows && byCode.rows.length > 0) {
      await client.query(`RELEASE SAVEPOINT sp_sync_role`);
      const existing = byCode.rows[0];
      return { id: Number(existing.id), code: String(existing.code), name: String(existing.name) };
    }

    const synced = await client.query(
      `INSERT INTO roles (id, code, name, description, is_system, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, TRUE, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, code = EXCLUDED.code, is_active = TRUE, updated_at = NOW()
       RETURNING id, code, name`,
      [
        storeRole.id,
        roleCode,
        storeRole.name,
        storeRole.description || '',
        Boolean(storeRole.is_system),
      ]
    );
    await client.query(`RELEASE SAVEPOINT sp_sync_role`);
    const row = synced.rows[0];
    return { id: Number(row.id), code: String(row.code), name: String(row.name) };
  } catch (syncErr: any) {
    await client.query(`ROLLBACK TO SAVEPOINT sp_sync_role`);
    if (syncErr?.code === '42703') {
      try {
        const legacyIns = await client.query(
          `INSERT INTO roles (id, code, name, description, created_at, updated_at)
           VALUES ($1, $2, $3, $4, NOW(), NOW())
           ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, code = EXCLUDED.code, updated_at = NOW()
           RETURNING id, code, name`,
          [storeRole.id, roleCode, storeRole.name, storeRole.description || '']
        );
        await client.query(`RELEASE SAVEPOINT sp_sync_role`);
        const row = legacyIns.rows[0];
        return { id: Number(row.id), code: String(row.code), name: String(row.name) };
      } catch {
        await client.query(`ROLLBACK TO SAVEPOINT sp_sync_role`);
        await client.query(`RELEASE SAVEPOINT sp_sync_role`);
        return { id: Number(storeRole.id), code: roleCode, name: String(storeRole.name) };
      }
    }
    await client.query(`RELEASE SAVEPOINT sp_sync_role`);
    throw syncErr;
  }
}

/**
 * Concurrency-safe Employee ID generation inside an active PostgreSQL transaction.
 * Uses a PostgreSQL transaction-scoped advisory lock + SAVEPOINT around optional legacy table checks
 * so simultaneous registrations never collide and a missing column can never abort the transaction (25P02).
 */
export async function generateNextPerformanceEmployeeId(client: {
  query: (sql: string, params?: any[]) => Promise<{ rows: any[] }>;
}): Promise<{ next_emp_id: string; prefix: string; sequence: number; company_name: string }> {
  await client.query(`SELECT pg_advisory_xact_lock(72839104)`);
  const existingIds: string[] = [];

  const perfRes = await client.query(`SELECT emp_id FROM performance_employees WHERE emp_id IS NOT NULL`);
  for (const r of perfRes.rows || []) {
    if (r.emp_id) existingIds.push(String(r.emp_id));
  }

  await client.query(`SAVEPOINT sp_users_emp_id`);
  try {
    const userRes = await client.query(`SELECT employee_id FROM users WHERE employee_id IS NOT NULL`);
    await client.query(`RELEASE SAVEPOINT sp_users_emp_id`);
    for (const r of userRes.rows || []) {
      if (r.employee_id) existingIds.push(String(r.employee_id));
    }
  } catch {
    // Roll back only to savepoint so outer transaction stays healthy (prevents PG 25P02)
    await client.query(`ROLLBACK TO SAVEPOINT sp_users_emp_id`).catch(() => {});
    await client.query(`RELEASE SAVEPOINT sp_users_emp_id`).catch(() => {});
  }

  return computeNextEmployeeId(getActiveCompanyName(), existingIds);
}

function sendRouteError(res: Response, err: any, fallbackMessage: string) {
  const code = String(err?.code || '');
  console.error('[PerformanceRoutes Error]', {
    code,
    statusCode: err?.statusCode,
    constraint: err?.constraint,
    message: err?.message,
  });

  if (code === 'DB_UNAVAILABLE' || code === 'ECONNREFUSED' || code === '57P01' || err?.statusCode === 503) {
    return res.status(503).json({
      success: false,
      message: 'PostgreSQL database is currently unavailable. Please verify connectivity and retry.',
    });
  }
  if (code === '42703' || code === '42P01') {
    return res.status(503).json({
      success: false,
      message: 'Database schema update required. Please run "npm run db:update" to apply the latest migrations.',
    });
  }
  if (code === '23505') {
    return res.status(409).json({
      success: false,
      message: 'A conflicting unique record already exists.',
    });
  }
  if (code === '23503') {
    return res.status(400).json({
      success: false,
      message: 'Referenced department, role, or employee record does not exist.',
    });
  }
  if (code === '22P02' || code === '23514') {
    return res.status(400).json({
      success: false,
      message: 'Invalid request parameter format or constraint violation.',
    });
  }
  return res.status(500).json({
    success: false,
    message: fallbackMessage,
  });
}

// SSE Clients Registry
const sseClients = new Set<Response>();

export function broadcastWorkEvent(event: any, employee: any) {
  const displayName = employee.display_name ||
    [employee.first_name, employee.last_name].filter(Boolean).map((s: string) => s.trim()).filter(Boolean).join(' ') ||
    employee.name ||
    `Employee #${employee.emp_id || employee.id}`;

  const empIdStr = employee.emp_id || `EMP-${String(employee.id).padStart(4, '0')}`;

  const payload = JSON.stringify({
    type: 'WORK_EVENT_RECORDED',
    timestamp: new Date().toISOString(),
    event: {
      ...event,
      emp_id: event.emp_id || empIdStr,
      employee_id: event.emp_id || empIdStr,
    },
    employee: {
      id: employee.id,
      emp_id: empIdStr,
      employee_id: empIdStr,
      first_name: employee.first_name || '',
      last_name: employee.last_name || '',
      display_name: displayName,
      name: displayName,
      department: employee.department || '',
      designation: employee.designation || '',
    },
  });

  for (const client of sseClients) {
    try {
      client.write(`data: ${payload}\n\n`);
    } catch {
      sseClients.delete(client);
    }
  }
}

// Keepalive heartbeats for SSE (keeps connections alive through Apache/Nginx/cPanel reverse proxies)
const sseKeepaliveTimer = setInterval(() => {
  for (const client of sseClients) {
    try {
      client.write(`: ping\n\n`);
    } catch {
      sseClients.delete(client);
    }
  }
}, 25000);
if (typeof sseKeepaliveTimer.unref === 'function') {
  sseKeepaliveTimer.unref();
}

export function getActiveSseClientCount(): number {
  return sseClients.size;
}

export function closeAllSseClients(): void {
  clearInterval(sseKeepaliveTimer);
  for (const client of sseClients) {
    try {
      client.end();
    } catch {
      // Ignore socket already closed
    }
  }
  sseClients.clear();
}

// ==========================================
// 1. SSE STREAM ENDPOINT (Authenticated & Origin-Restricted)
// ==========================================
export function handleSseStream(req: Request, res: Response) {
  // Validate JWT via Authorization header or query token (for native browser EventSource)
  const authHeader = req.headers['authorization'];
  const headerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const queryToken = typeof req.query.token === 'string' ? req.query.token.trim() : '';
  const token = headerToken || queryToken;

  if (!token) {
    return res.status(401).json({ success: false, message: 'Authentication required for live performance SSE stream.' });
  }

  try {
    const decoded = authService.verifyAccessToken(token);
    if (decoded.jti && store.isTokenRevoked(decoded.jti)) {
      return res.status(401).json({ success: false, message: 'Session token has been revoked.' });
    }
    if (decoded.jti) {
      const sessState = securityStore.isSessionActive(decoded.jti);
      if (!sessState.active) {
        return res.status(401).json({ success: false, message: sessState.reason || 'Session is no longer active.' });
      }
    }
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid or expired authentication token.' });
  }

  const origin = req.headers.origin;
  const headers: Record<string, string> = {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  };
  if (origin && (securityConfig.corsAllowedOrigins.includes(origin.replace(/\/+$/, '')) || !securityConfig.isProduction)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Vary'] = 'Origin';
  }

  // Disable Nagle's algorithm / socket timeout for long-lived SSE behind reverse proxies
  req.socket?.setTimeout?.(0);
  req.socket?.setNoDelay?.(true);
  req.socket?.setKeepAlive?.(true);

  res.writeHead(200, headers);
  res.flushHeaders?.();
  res.write(`retry: 5000\n`);
  res.write(`data: ${JSON.stringify({ type: 'CONNECTED', message: 'Authenticated SSE connection established', timestamp: new Date().toISOString() })}\n\n`);
  sseClients.add(res);

  req.on('close', () => {
    sseClients.delete(res);
  });
}

router.get('/events/stream', handleSseStream);
router.get('/live/stream', handleSseStream);

// ==========================================
// 2. PERFORMANCE EMPLOYEE ROSTER MANAGEMENT
// Table: performance_employees
// (NO name or full_name column)
// ==========================================

// GET /api/performance/options - Active Departments & Roles + Employee Type enum
router.get('/options', async (_req: Request, res: Response) => {
  try {
    const db = await resolvePerfDb();
    const [departments, roles] = await Promise.all([
      fetchActiveDepartments(db),
      fetchActiveRoles(db),
    ]);
    res.json({
      success: true,
      data: {
        departments,
        roles,
        employee_types: VALID_EMPLOYEE_TYPES.map((value) => ({
          value,
          label: EMPLOYEE_TYPE_LABELS[value],
        })),
      },
    });
  } catch (err: any) {
    console.error('Error fetching performance registration options:', err);
    sendRouteError(res, err, 'Failed to fetch active departments and roles');
  }
});

// GET /api/performance/roster/next-id - Read-only preview of next system-generated Employee ID
router.get('/roster/next-id', async (_req: Request, res: Response) => {
  try {
    const db = await resolvePerfDb();
    const existingIds: string[] = [];
    const perfRes = await db.query(`SELECT emp_id FROM performance_employees WHERE emp_id IS NOT NULL`);
    for (const r of perfRes.rows || []) {
      if (r.emp_id) existingIds.push(String(r.emp_id));
    }
    try {
      const userRes = await db.query(`SELECT employee_id FROM users WHERE employee_id IS NOT NULL`);
      for (const r of userRes.rows || []) {
        if (r.employee_id) existingIds.push(String(r.employee_id));
      }
    } catch {}

    const computed = computeNextEmployeeId(getActiveCompanyName(), existingIds);
    res.json({
      success: true,
      data: computed,
    });
  } catch (err: any) {
    console.error('Error computing next Employee ID preview:', err);
    sendRouteError(res, err, 'Failed to compute next Employee ID preview');
  }
});

// GET /api/performance/roster
router.get('/roster', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const db = await resolvePerfDb();
    const { search, status, department, department_id, role_id, employee_type, page, limit } = req.query;
    const deptScope = resolveUserDepartmentScope(req);

    let queryStr = `
      SELECT
        p.id,
        p.emp_id,
        p.first_name,
        p.last_name,
        p.hardware_id,
        p.employee_type,
        p.department_id,
        COALESCE(d.name, p.department) AS department_name,
        d.code AS department_code,
        p.role_id,
        COALESCE(r.name, p.designation) AS role_name,
        r.code AS role_code,
        p.department,
        p.designation,
        p.login_enabled,
        p.is_active,
        p.created_at,
        p.updated_at,
        p.created_by
      FROM performance_employees p
      LEFT JOIN departments d ON p.department_id = d.id
      LEFT JOIN roles r ON p.role_id = r.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (deptScope.restricted && deptScope.departmentName) {
      if (
        department &&
        department !== 'all' &&
        String(department).trim().toLowerCase() !== deptScope.departmentName.toLowerCase()
      ) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: You are only authorized to view employees in your assigned department.',
        });
      }
      params.push(deptScope.departmentName);
      queryStr += ` AND LOWER(COALESCE(d.name, p.department, '')) = LOWER($${params.length})`;
    } else if (department_id && !Number.isNaN(Number(department_id))) {
      params.push(Number(department_id));
      queryStr += ` AND p.department_id = $${params.length}`;
    } else if (department && department !== 'all') {
      params.push(department);
      queryStr += ` AND LOWER(COALESCE(d.name, p.department, '')) = LOWER($${params.length})`;
    }

    if (status === 'active') {
      params.push(true);
      queryStr += ` AND p.is_active = $${params.length}`;
    } else if (status === 'disabled' || status === 'inactive') {
      params.push(false);
      queryStr += ` AND p.is_active = $${params.length}`;
    }

    if (role_id && !Number.isNaN(Number(role_id))) {
      params.push(Number(role_id));
      queryStr += ` AND p.role_id = $${params.length}`;
    }

    if (employee_type && employee_type !== 'all') {
      const normalizedType = normalizeEmployeeType(employee_type);
      if (normalizedType) {
        params.push(normalizedType);
        queryStr += ` AND p.employee_type = $${params.length}`;
      }
    }

    queryStr += ` ORDER BY p.id ASC`;

    let rows: any[] = [];
    try {
      const result = await db.query(queryStr, params);
      rows = result.rows || [];
    } catch (colErr: any) {
      // Graceful fallback if migration 002 hasn't been executed yet on an older database
      if (colErr?.code === '42703') {
        const legacyRes = await db.query(
          `SELECT id, emp_id, first_name, last_name, department, designation, login_enabled, is_active, created_at, updated_at, created_by
           FROM performance_employees ORDER BY id ASC`
        );
        rows = legacyRes.rows || [];
        if (deptScope.restricted && deptScope.departmentName) {
          rows = rows.filter(
            (r: any) => String(r.department || '').trim().toLowerCase() === deptScope.departmentName!.toLowerCase()
          );
        }
      } else {
        throw colErr;
      }
    }

    // Filter search across name, emp_id, hardware_id, department, and role
    if (search && typeof search === 'string' && search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter((r: any) => {
        const fullName = `${r.first_name || ''} ${r.last_name || ''}`.toLowerCase();
        const empId = (r.emp_id || '').toLowerCase();
        const hwId = (r.hardware_id || '').toLowerCase();
        const dept = (r.department_name || r.department || '').toLowerCase();
        const roleLabel = (r.role_name || r.designation || '').toLowerCase();
        return fullName.includes(q) || empId.includes(q) || hwId.includes(q) || dept.includes(q) || roleLabel.includes(q);
      });
    }

    // Get event stats per emp_id
    let eventCountsMap = new Map<string, { count: number; last_event: string | null }>();
    try {
      const countsRes = await db.query(`
        SELECT
          emp_id,
          COUNT(*)::int AS event_count,
          MAX(event_timestamp) AS last_event
        FROM employee_performance_events
        GROUP BY emp_id
      `);
      for (const row of countsRes.rows) {
        eventCountsMap.set((row as any).emp_id, {
          count: Number((row as any).event_count),
          last_event: (row as any).last_event ? new Date((row as any).last_event).toISOString() : null,
        });
      }
    } catch {}

    const mapped = rows.map((r: any) => {
      const displayName = `${r.first_name || ''} ${r.last_name || ''}`.trim() || `Employee #${r.emp_id}`;
      const evStats = eventCountsMap.get(r.emp_id) || { count: 0, last_event: null };
      const empType = normalizeEmployeeType(r.employee_type) || 'full_time';

      return {
        id: r.id,
        emp_id: r.emp_id,
        employee_id: r.emp_id,
        first_name: r.first_name || '',
        last_name: r.last_name || '',
        name: displayName,
        display_name: displayName,
        hardware_id: r.hardware_id || '',
        employee_type: empType,
        employee_type_label: EMPLOYEE_TYPE_LABELS[empType],
        department_id: r.department_id ? Number(r.department_id) : null,
        department: r.department_name || r.department || '',
        department_code: r.department_code || '',
        role_id: r.role_id ? Number(r.role_id) : null,
        role_name: r.role_name || r.designation || '',
        role_code: r.role_code || '',
        designation: r.role_name || r.designation || '',
        login_enabled: Boolean(r.login_enabled),
        is_active: Boolean(r.is_active),
        created_at: r.created_at,
        updated_at: r.updated_at,
        created_by: r.created_by,
        total_events: evStats.count,
        last_event_timestamp: evStats.last_event,
      };
    });

    const total = mapped.length;
    const pageNum = page ? Math.max(1, Number(page) || 1) : 1;
    const limitNum = limit ? Math.min(200, Math.max(1, Number(limit) || 50)) : total || 50;
    const pagedData = page || limit ? mapped.slice((pageNum - 1) * limitNum, pageNum * limitNum) : mapped;

    res.json({
      success: true,
      message: total > 0 ? `Retrieved ${pagedData.length} of ${total} performance roster employee(s).` : 'No performance roster employees found.',
      data: pagedData,
      total,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        total_pages: Math.max(1, Math.ceil(total / Math.max(1, limitNum))),
      },
    });
  } catch (err: any) {
    sendRouteError(res, err, 'Failed to fetch performance employee roster');
  }
});

// POST /api/performance/roster - Register new employee (backend auto-generates Employee ID)
router.post('/roster', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid request payload. Expected a JSON object.',
      });
    }

    const {
      first_name,
      last_name,
      hardware_id,
      employee_type,
      department_id,
      role_id,
    } = req.body;

    const errors: { field: string; message: string }[] = [];
    if (!first_name || typeof first_name !== 'string' || !first_name.trim()) {
      errors.push({ field: 'first_name', message: 'First name is required.' });
    } else if (first_name.trim().length > 100) {
      errors.push({ field: 'first_name', message: 'First name cannot exceed 100 characters.' });
    }

    if (!last_name || typeof last_name !== 'string' || !last_name.trim()) {
      errors.push({ field: 'last_name', message: 'Last name is required.' });
    } else if (last_name.trim().length > 100) {
      errors.push({ field: 'last_name', message: 'Last name cannot exceed 100 characters.' });
    }

    const hwCheck = validateHardwareId(hardware_id);
    if (!hwCheck.valid) {
      errors.push({ field: 'hardware_id', message: hwCheck.error || 'Valid Hardware ID is required.' });
    }

    const parsedType = normalizeEmployeeType(employee_type);
    if (!parsedType) {
      errors.push({
        field: 'employee_type',
        message: 'Employee Type must be Full-time, Training, or Third-party.',
      });
    }

    const parsedDeptId = Number(department_id);
    if (!department_id || !Number.isInteger(parsedDeptId) || parsedDeptId <= 0) {
      errors.push({ field: 'department_id', message: 'Please select an active Department.' });
    }

    const parsedRoleId = Number(role_id);
    if (!role_id || !Number.isInteger(parsedRoleId) || parsedRoleId <= 0) {
      errors.push({ field: 'role_id', message: 'Please select an active Role.' });
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed. Please correct the highlighted fields.',
        errors,
      });
    }

    const cleanFirst = String(first_name).trim();
    const cleanLast = String(last_name).trim();
    const cleanHardwareId = hwCheck.value;
    const createdBy = req.user?.email || 'System';
    const deptScope = resolveUserDepartmentScope(req);

    const db = await resolvePerfDb();
    const client = await db.connect();

    try {
      await client.query('BEGIN');

      // Validate active Department exists
      const dept = await resolveAndSyncActiveDepartment(client, parsedDeptId);
      if (!dept) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'Selected department does not exist or is inactive.',
          errors: [{ field: 'department_id', message: 'Selected department is not active.' }],
        });
      }

      // Enforce department-level authorization for department-restricted users
      if (
        deptScope.restricted &&
        deptScope.departmentName &&
        dept.name.trim().toLowerCase() !== deptScope.departmentName.trim().toLowerCase()
      ) {
        await client.query('ROLLBACK');
        return res.status(403).json({
          success: false,
          message: `Forbidden: You are only authorized to register employees in the "${deptScope.departmentName}" department.`,
          errors: [{ field: 'department_id', message: 'Department outside your authorized scope.' }],
        });
      }

      // Validate active Role exists
      const role = await resolveAndSyncActiveRole(client, parsedRoleId);
      if (!role) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'Selected role does not exist or is inactive.',
          errors: [{ field: 'role_id', message: 'Selected role is not active.' }],
        });
      }

      // Enforce unique Hardware ID across active employees
      const existingHw = await client.query(
        `SELECT id, emp_id, first_name, last_name
         FROM performance_employees
         WHERE UPPER(TRIM(hardware_id)) = UPPER($1) AND is_active = TRUE
         LIMIT 1`,
        [cleanHardwareId]
      );
      if (existingHw.rows && existingHw.rows.length > 0) {
        const holder = existingHw.rows[0];
        await client.query('ROLLBACK');
        return res.status(409).json({
          success: false,
          message: `Hardware ID "${cleanHardwareId}" is already assigned to active employee ${holder.emp_id} (${holder.first_name} ${holder.last_name}).`,
          errors: [{ field: 'hardware_id', message: 'Hardware ID is already assigned to an active employee.' }],
        });
      }

      // Concurrency-safe backend Employee ID generation (client-supplied emp_id is never trusted)
      const generated = await generateNextPerformanceEmployeeId(client);
      const generatedEmpId = generated.next_emp_id;

      const insertRes = await client.query(
        `INSERT INTO performance_employees
         (emp_id, first_name, last_name, hardware_id, employee_type, department_id, department, role_id, designation, password_hash, login_enabled, is_active, created_at, updated_at, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NULL, FALSE, TRUE, NOW(), NOW(), $10)
         RETURNING *`,
        [
          generatedEmpId,
          cleanFirst,
          cleanLast,
          cleanHardwareId,
          parsedType,
          dept.id,
          dept.name,
          role.id,
          role.name,
          createdBy,
        ]
      );

      await client.query('COMMIT');

      const inserted = insertRes.rows[0];
      const displayName = `${cleanFirst} ${cleanLast}`.trim();

      store.logAudit({
        user_id: req.user?.id || null,
        user_email: req.user?.email || 'system',
        action: 'PERFORMANCE_EMPLOYEE_REGISTERED',
        module: 'Performance',
        details: `Registered performance employee ${generatedEmpId} (${displayName}) | Hardware: ${cleanHardwareId} | Type: ${EMPLOYEE_TYPE_LABELS[parsedType!]} | Dept: ${dept.name} | Role: ${role.name}`,
        ip_address: req.ip || '127.0.0.1',
      });

      res.status(201).json({
        success: true,
        message: `Employee ${displayName} (${generatedEmpId}) registered successfully.`,
        data: {
          id: inserted.id,
          emp_id: inserted.emp_id,
          employee_id: inserted.emp_id,
          first_name: inserted.first_name,
          last_name: inserted.last_name,
          name: displayName,
          display_name: displayName,
          hardware_id: inserted.hardware_id,
          employee_type: inserted.employee_type,
          employee_type_label: EMPLOYEE_TYPE_LABELS[parsedType!],
          department_id: dept.id,
          department: dept.name,
          department_code: dept.code,
          role_id: role.id,
          role_name: role.name,
          role_code: role.code,
          designation: role.name,
          login_enabled: Boolean(inserted.login_enabled),
          is_active: Boolean(inserted.is_active),
          created_at: inserted.created_at,
          updated_at: inserted.updated_at,
        },
      });
    } catch (txErr: any) {
      await client.query('ROLLBACK').catch(() => {});
      if (txErr?.code === '23505') {
        const constraint = String(txErr?.constraint || '').toLowerCase();
        const isHw = constraint.includes('hardware');
        return res.status(409).json({
          success: false,
          message: isHw
            ? `Hardware ID "${cleanHardwareId}" is already assigned to another active employee.`
            : 'Duplicate employee record conflict. Please retry.',
          errors: [
            {
              field: isHw ? 'hardware_id' : 'emp_id',
              message: isHw ? 'Hardware ID must be unique among active employees.' : 'Duplicate Employee ID.',
            },
          ],
        });
      }
      if (txErr?.code === '42703') {
        return res.status(503).json({
          success: false,
          message: 'Database schema update required. Please run "npm run db:update" to add the latest performance employee columns.',
        });
      }
      throw txErr;
    } finally {
      client.release();
    }
  } catch (err: any) {
    sendRouteError(res, err, 'Failed to register performance employee');
  }
});

// PUT /api/performance/roster/:id - Update employee details or status (emp_id is strictly immutable)
router.put('/roster/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const idParam = req.params.id;
    const {
      emp_id: attemptedEmpId,
      first_name,
      last_name,
      hardware_id,
      employee_type,
      department_id,
      role_id,
      is_active,
    } = req.body || {};

    const db = await resolvePerfDb();
    const deptScope = resolveUserDepartmentScope(req);
    const numericId = Number(idParam);
    const checkRes = await db.query(
      'SELECT * FROM performance_employees WHERE id = $1 OR emp_id = $2 LIMIT 1',
      [Number.isInteger(numericId) ? numericId : -1, String(idParam)]
    );
    if (!checkRes.rows || checkRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Performance employee not found.' });
    }

    const current = checkRes.rows[0];

    if (
      deptScope.restricted &&
      deptScope.departmentName &&
      String(current.department || '').trim().toLowerCase() !== deptScope.departmentName.trim().toLowerCase()
    ) {
      return res.status(403).json({
        success: false,
        message: `Forbidden: You are only authorized to update employees in the "${deptScope.departmentName}" department.`,
      });
    }

    // Enforce Employee ID immutability
    if (
      attemptedEmpId !== undefined &&
      String(attemptedEmpId).trim() !== '' &&
      String(attemptedEmpId).trim().toUpperCase() !== String(current.emp_id).trim().toUpperCase()
    ) {
      return res.status(400).json({
        success: false,
        message: 'Employee ID is auto-generated and cannot be modified.',
        errors: [{ field: 'emp_id', message: 'Employee ID is immutable.' }],
      });
    }

    const errors: { field: string; message: string }[] = [];
    const nextFirst = first_name !== undefined ? String(first_name).trim() : current.first_name;
    const nextLast = last_name !== undefined ? String(last_name).trim() : current.last_name;
    const nextActive = is_active !== undefined ? Boolean(is_active) : Boolean(current.is_active);

    if (!nextFirst) errors.push({ field: 'first_name', message: 'First name is required.' });
    if (!nextLast) errors.push({ field: 'last_name', message: 'Last name is required.' });

    let nextHardwareId: string | null = current.hardware_id || null;
    if (hardware_id !== undefined) {
      const hwCheck = validateHardwareId(hardware_id);
      if (!hwCheck.valid) {
        errors.push({ field: 'hardware_id', message: hwCheck.error || 'Invalid Hardware ID.' });
      } else {
        nextHardwareId = hwCheck.value;
      }
    }

    let nextEmployeeType: PerformanceEmployeeType =
      normalizeEmployeeType(current.employee_type) || 'full_time';
    if (employee_type !== undefined) {
      const parsed = normalizeEmployeeType(employee_type);
      if (!parsed) {
        errors.push({
          field: 'employee_type',
          message: 'Employee Type must be Full-time, Training, or Third-party.',
        });
      } else {
        nextEmployeeType = parsed;
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed. Please correct the highlighted fields.',
        errors,
      });
    }

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      let nextDeptId: number | null = current.department_id ? Number(current.department_id) : null;
      let nextDeptName: string = current.department || '';
      if (department_id !== undefined && department_id !== null && department_id !== '') {
        const parsedDeptId = Number(department_id);
        const dept = await resolveAndSyncActiveDepartment(client, parsedDeptId);
        if (!dept) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            success: false,
            message: 'Selected department does not exist or is inactive.',
            errors: [{ field: 'department_id', message: 'Selected department is not active.' }],
          });
        }
        if (
          deptScope.restricted &&
          deptScope.departmentName &&
          dept.name.trim().toLowerCase() !== deptScope.departmentName.trim().toLowerCase()
        ) {
          await client.query('ROLLBACK');
          return res.status(403).json({
            success: false,
            message: `Forbidden: You cannot reassign employees outside the "${deptScope.departmentName}" department.`,
            errors: [{ field: 'department_id', message: 'Department outside your authorized scope.' }],
          });
        }
        nextDeptId = dept.id;
        nextDeptName = dept.name;
      }

      let nextRoleId: number | null = current.role_id ? Number(current.role_id) : null;
      let nextRoleName: string = current.designation || '';
      if (role_id !== undefined && role_id !== null && role_id !== '') {
        const parsedRoleId = Number(role_id);
        const role = await resolveAndSyncActiveRole(client, parsedRoleId);
        if (!role) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            success: false,
            message: 'Selected role does not exist or is inactive.',
            errors: [{ field: 'role_id', message: 'Selected role is not active.' }],
          });
        }
        nextRoleId = role.id;
        nextRoleName = role.name;
      }

      // Check active hardware_id uniqueness if employee will be active and has a hardware_id
      if (nextActive && nextHardwareId) {
        const conflict = await client.query(
          `SELECT id, emp_id, first_name, last_name
           FROM performance_employees
           WHERE UPPER(TRIM(hardware_id)) = UPPER($1)
             AND is_active = TRUE
             AND id <> $2
           LIMIT 1`,
          [nextHardwareId, current.id]
        );
        if (conflict.rows && conflict.rows.length > 0) {
          const holder = conflict.rows[0];
          await client.query('ROLLBACK');
          return res.status(409).json({
            success: false,
            message: `Hardware ID "${nextHardwareId}" is already assigned to active employee ${holder.emp_id} (${holder.first_name} ${holder.last_name}).`,
            errors: [{ field: 'hardware_id', message: 'Hardware ID is already assigned to an active employee.' }],
          });
        }
      }

      const updateRes = await client.query(
        `UPDATE performance_employees
         SET first_name = $1,
             last_name = $2,
             hardware_id = $3,
             employee_type = $4,
             department_id = $5,
             department = $6,
             role_id = $7,
             designation = $8,
             is_active = $9,
             updated_at = NOW()
         WHERE id = $10
         RETURNING *`,
        [
          nextFirst,
          nextLast,
          nextHardwareId,
          nextEmployeeType,
          nextDeptId,
          nextDeptName,
          nextRoleId,
          nextRoleName,
          nextActive,
          current.id,
        ]
      );

      await client.query('COMMIT');

      const updated = updateRes.rows[0];
      const displayName = `${updated.first_name} ${updated.last_name}`.trim();

      store.logAudit({
        user_id: req.user?.id || null,
        user_email: req.user?.email || 'system',
        action:
          nextActive !== Boolean(current.is_active)
            ? nextActive
              ? 'EMPLOYEE_ACTIVATED'
              : 'EMPLOYEE_DEACTIVATED'
            : 'EMPLOYEE_UPDATED',
        module: 'Performance',
        details: `Updated performance employee ${current.emp_id} (${displayName}) | Hardware: ${nextHardwareId || 'None'} | Type: ${EMPLOYEE_TYPE_LABELS[nextEmployeeType]} | Status: ${nextActive ? 'Active' : 'Inactive'}`,
        ip_address: req.ip || '127.0.0.1',
      });

      res.json({
        success: true,
        message: `Employee ${displayName} (${current.emp_id}) updated successfully.`,
        data: {
          ...updated,
          employee_id: updated.emp_id,
          name: displayName,
          display_name: displayName,
          employee_type_label: EMPLOYEE_TYPE_LABELS[nextEmployeeType],
          role_name: nextRoleName,
        },
      });
    } catch (txErr: any) {
      await client.query('ROLLBACK').catch(() => {});
      if (txErr?.code === '23505') {
        return res.status(409).json({
          success: false,
          message: `Hardware ID "${nextHardwareId}" is already assigned to another active employee.`,
          errors: [{ field: 'hardware_id', message: 'Hardware ID must be unique among active employees.' }],
        });
      }
      throw txErr;
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error('Error updating performance employee:', err);
    sendRouteError(res, err, 'Failed to update employee');
  }
});

// ==========================================
// 3. GET ACTIVE EMPLOYEES WITH PERFORMANCE STATS
// Used by Live Performance Page
// (Strictly NO fake or dummy employees)
// ==========================================
router.get(['/employees', '/live'], async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const period = (req.query.period as string) || 'today';

    // 1. Fetch active employees from performance_employees roster
    let employeesRes = await db.query(`
      SELECT
        id,
        emp_id,
        first_name,
        last_name,
        department,
        designation,
        is_active,
        created_at
      FROM performance_employees
      WHERE is_active = TRUE
      ORDER BY id ASC
    `);

    let activeEmployees = employeesRes.rows || [];

    // Fallback: If no performance employees registered, return honest empty state (NO seed/dummy data!)
    if (activeEmployees.length === 0) {
      return res.json({
        success: true,
        data: [],
        meta: {
          total_eligible: 0,
          active_with_events: 0,
          period,
        },
      });
    }

    // 2. Aggregate stats from employee_performance_events (and work_completion_events)
    const statsQuery = `
      SELECT
        emp_id,
        COUNT(*)::int AS total_count,
        COUNT(*) FILTER (WHERE event_timestamp >= CURRENT_DATE)::int AS today_count,
        COUNT(*) FILTER (WHERE event_timestamp >= DATE_TRUNC('week', CURRENT_DATE))::int AS week_count,
        COUNT(*) FILTER (WHERE event_timestamp >= DATE_TRUNC('month', CURRENT_DATE))::int AS month_count,
        MAX(event_timestamp) AS last_event_timestamp
      FROM employee_performance_events
      GROUP BY emp_id
    `;
    let statsMap = new Map<string, any>();
    try {
      const statsRes = await db.query(statsQuery);
      for (const row of statsRes.rows) {
        statsMap.set(String((row as any).emp_id), row);
      }
    } catch {}

    // Latest source per employee
    const latestQuery = `
      SELECT DISTINCT ON (emp_id)
        emp_id,
        source AS last_event_source,
        device_id AS last_device_id,
        event_timestamp
      FROM employee_performance_events
      ORDER BY emp_id, event_timestamp DESC
    `;
    let latestSourceMap = new Map<string, any>();
    try {
      const latestRes = await db.query(latestQuery);
      for (const row of latestRes.rows) {
        latestSourceMap.set(String((row as any).emp_id), row);
      }
    } catch {}

    const enriched = activeEmployees.map((u: any) => {
      const stats = statsMap.get(u.emp_id);
      const latest = latestSourceMap.get(u.emp_id);

      const todayCount = stats ? Number(stats.today_count) : 0;
      const weekCount = stats ? Number(stats.week_count) : 0;
      const monthCount = stats ? Number(stats.month_count) : 0;
      const totalCount = stats ? Number(stats.total_count) : 0;

      let periodCount = todayCount;
      if (period === 'week') periodCount = weekCount;
      if (period === 'month') periodCount = monthCount;
      if (period === 'all') periodCount = totalCount;

      const lastTimestamp = stats?.last_event_timestamp ? new Date(stats.last_event_timestamp).toISOString() : null;
      const displayName = `${u.first_name || ''} ${u.last_name || ''}`.trim() || `Employee #${u.emp_id}`;

      return {
        id: u.id,
        emp_id: u.emp_id,
        employee_id: u.emp_id,
        first_name: u.first_name || '',
        last_name: u.last_name || '',
        name: displayName,
        display_name: displayName,
        department: u.department || '',
        designation: u.designation || '',
        is_active: u.is_active !== false,
        today_count: todayCount,
        week_count: weekCount,
        month_count: monthCount,
        total_count: totalCount,
        period_count: periodCount,
        last_event_timestamp: lastTimestamp,
        last_event_source: latest?.last_event_source || null,
        last_device_id: latest?.last_device_id || null,
      };
    });

    // STRICT SORTING RULE:
    // 1. Employees with recorded activity sorted newest first (descending timestamp)
    // 2. Employees with NO activity visible beneath those with activity
    // 3. Secondary stable sort by employee ID ASC
    enriched.sort((a, b) => {
      if (a.last_event_timestamp && b.last_event_timestamp) {
        const diff = new Date(b.last_event_timestamp).getTime() - new Date(a.last_event_timestamp).getTime();
        if (diff !== 0) return diff;
        return a.id - b.id;
      }
      if (a.last_event_timestamp && !b.last_event_timestamp) {
        return -1; // a comes first
      }
      if (!a.last_event_timestamp && b.last_event_timestamp) {
        return 1; // b comes first
      }
      return a.id - b.id;
    });

    res.json({
      success: true,
      data: enriched,
      meta: {
        total_eligible: enriched.length,
        active_with_events: enriched.filter(e => e.last_event_timestamp !== null).length,
        period,
      },
    });
  } catch (err: any) {
    console.error('Failed to fetch performance employees:', err);
    sendRouteError(res, err, 'Failed to retrieve employee performance data');
  }
});

// ==========================================
// 4. SUMMARY STATS FOR DASHBOARD / LIVE
// ==========================================
router.get('/summary', async (req: Request, res: Response) => {
  try {
    const db = await getDb();

    let totalRoster = 0;
    try {
      const rosterCount = await db.query('SELECT COUNT(*)::int AS cnt FROM performance_employees WHERE is_active = TRUE');
      totalRoster = Number(rosterCount.rows[0]?.cnt || 0);
    } catch {}

    let statsRow: any = {};
    try {
      const statsRes = await db.query(`
        SELECT
          COUNT(*)::int AS today_events,
          COUNT(*) FILTER (WHERE source = 'HARDWARE')::int AS today_hardware_events,
          COUNT(*) FILTER (WHERE source = 'SIMULATED')::int AS today_simulated_events,
          COUNT(DISTINCT emp_id) FILTER (WHERE event_timestamp >= CURRENT_DATE)::int AS active_today_employees
        FROM employee_performance_events
        WHERE event_timestamp >= CURRENT_DATE
      `);
      statsRow = statsRes.rows[0] || {};
    } catch {}

    let latestEventData: any = null;
    try {
      const latestRes = await db.query(`
        SELECT e.*, p.first_name, p.last_name, p.department
        FROM employee_performance_events e
        LEFT JOIN performance_employees p ON e.emp_id = p.emp_id
        ORDER BY e.event_timestamp DESC
        LIMIT 1
      `);

      const latest = (latestRes.rows[0] || null) as any;
      if (latest) {
        const displayName = `${latest.first_name || ''} ${latest.last_name || ''}`.trim() || `Employee #${latest.emp_id}`;
        latestEventData = {
          id: latest.id,
          employee_id: latest.emp_id,
          emp_id: latest.emp_id,
          employee_name: displayName,
          timestamp: latest.event_timestamp,
          source: latest.source,
          device_id: latest.device_id,
        };
      }
    } catch {}

    res.json({
      success: true,
      data: {
        total_eligible_employees: totalRoster,
        today_work_events: Number(statsRow.today_events || 0),
        today_hardware_events: Number(statsRow.today_hardware_events || 0),
        today_simulated_events: Number(statsRow.today_simulated_events || 0),
        active_today_employees: Number(statsRow.active_today_employees || 0),
        latest_event: latestEventData,
      },
    });
  } catch (err: any) {
    sendRouteError(res, err, 'Failed to fetch summary stats');
  }
});

// ==========================================
// 5. SIMULATE HARDWARE TEST EVENT (POPUP ONLY)
// Records exactly one SIMULATED event
// ==========================================
router.post(['/events/simulate', '/simulate', '/work-completion/simulate'], async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { employee_id, emp_id, idempotency_key, notes } = req.body;
    const targetEmpId = emp_id || employee_id;

    if (!targetEmpId) {
      return res.status(400).json({
        success: false,
        message: 'employee_id or emp_id is required to record a work completion event.',
      });
    }

    const db = await getDb();

    // Verify employee in performance_employees roster
    let empRes = await db.query(
      `SELECT * FROM performance_employees WHERE emp_id = $1 OR id = $2 LIMIT 1`,
      [String(targetEmpId), Number(targetEmpId) || 0]
    );

    if (!empRes.rows || empRes.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Employee with ID "${targetEmpId}" not found in performance roster.`,
      });
    }

    const employee = empRes.rows[0];

    if (!employee.is_active) {
      return res.status(400).json({
        success: false,
        message: `Employee "${employee.emp_id}" is currently inactive. Please reactivate them in Employee Registration before recording work events.`,
      });
    }

    // Idempotency verification
    if (idempotency_key) {
      const existing = await db.query(
        'SELECT * FROM employee_performance_events WHERE idempotency_key = $1',
        [idempotency_key]
      );
      if (existing.rows && existing.rows.length > 0) {
        return res.json({
          success: true,
          message: 'Event already recorded (idempotent duplicate recognized)',
          data: existing.rows[0],
          is_duplicate: true,
        });
      }
    }

    // Cooldown check (configurable via WORK_EVENT_COOLDOWN_SECONDS)
    const cooldownSecs = parseInt(process.env.WORK_EVENT_COOLDOWN_SECONDS || '0', 10);
    if (cooldownSecs > 0) {
      const recent = await db.query(
        `SELECT event_timestamp FROM employee_performance_events
         WHERE emp_id = $1 AND event_timestamp >= NOW() - INTERVAL '${cooldownSecs} seconds'
         ORDER BY event_timestamp DESC LIMIT 1`,
        [employee.emp_id]
      );
      if (recent.rows && recent.rows.length > 0) {
        return res.status(429).json({
          success: false,
          message: `Event cooldown active. Please wait ${cooldownSecs} seconds between consecutive work-completion events for this employee.`,
        });
      }
    }

    const recordedBy = req.user?.id || null;
    const finalKey = idempotency_key || `sim_${employee.emp_id}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    // Insert into employee_performance_events
    const insertRes = await db.query(
      `INSERT INTO employee_performance_events
       (emp_id, event_timestamp, created_at, source, device_id, idempotency_key, recorded_by_user_id, notes)
       VALUES ($1, NOW(), NOW(), 'SIMULATED', 'SIMULATOR-MODAL', $2, $3, $4)
       RETURNING *`,
      [employee.emp_id, finalKey, recordedBy, notes || 'Simulated via Test Hardware Modal']
    );

    const newEvent = insertRes.rows[0];

    // Maintain legacy sync to work_completion_events if table exists
    try {
      await db.query(
        `INSERT INTO work_completion_events
         (employee_id, event_timestamp, created_at, source, device_id, idempotency_key, recorded_by_user_id, notes)
         VALUES ($1, NOW(), NOW(), 'SIMULATED', 'SIMULATOR-MODAL', $2, $3, $4)
         ON CONFLICT (idempotency_key) DO NOTHING`,
        [employee.id, finalKey, recordedBy, notes || 'Simulated via Test Hardware Modal']
      );
    } catch {}

    // Broadcast SSE in real-time to all live clients
    broadcastWorkEvent(newEvent, employee);

    const empDisplayName = `${employee.first_name} ${employee.last_name}`.trim();

    res.status(201).json({
      success: true,
      message: `Work-completion event successfully recorded for ${empDisplayName}.`,
      data: newEvent,
    });
  } catch (err: any) {
    console.error('Error recording simulated work event:', err);
    sendRouteError(res, err, 'Failed to record simulated work completion event');
  }
});

// ==========================================
// 6. HARDWARE INGESTION ENDPOINT
// ==========================================
router.post('/events/hardware', async (req: Request, res: Response) => {
  try {
    const deviceToken = (req.headers['x-device-token'] as string) ||
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
        message: 'Unauthorized hardware device. Invalid or missing x-device-token.',
      });
    }

    const {
      event_id,
      event_uid,
      employee_id,
      emp_id,
      hardware_id,
      device_id,
      product_id,
      operation_id,
      production_order_id,
      workstation,
      quantity,
      timestamp,
      idempotency_key,
      notes,
    } = req.body;
    const targetEmpId = emp_id || employee_id;
    const targetHardwareId = (hardware_id || (!targetEmpId ? device_id : '') || '').toString().trim();

    if (!targetEmpId && !targetHardwareId) {
      return res.status(400).json({
        success: false,
        message: 'hardware_id, device_id, emp_id, or employee_id is required.',
      });
    }

    // Attempt full Operation-Based Hardware Ingestion pipeline (idempotency, debounce, active assignment,
    // historical standard snapshot, supervisor exception queue, and atomic WIP update).
    // Falls back cleanly to legacy flow if migration 004 has not yet been applied.
    try {
      const opResult = await processHardwareButtonEvent({
        event_id,
        event_uid,
        idempotency_key,
        hardware_id: targetHardwareId || undefined,
        device_id,
        emp_id: emp_id ? String(emp_id) : undefined,
        employee_id,
        product_id: product_id ? Number(product_id) : undefined,
        operation_id: operation_id ? Number(operation_id) : undefined,
        production_order_id: production_order_id ? Number(production_order_id) : undefined,
        workstation,
        quantity: quantity ? Number(quantity) : 1,
        timestamp,
        source: 'HARDWARE',
        notes,
      });
      return res.status(opResult.httpStatus).json({
        success: opResult.success,
        message: opResult.message,
        data: opResult.data,
        is_duplicate: opResult.is_duplicate,
        exception_queued: opResult.exception_queued,
      });
    } catch (opErr: any) {
      if (opErr?.code !== '42P01') {
        throw opErr;
      }
      // Migration 004 tables not created yet -> continue with legacy handler below
    }

    const db = await getDb();

    // Resolve employee by hardware_id (for IoT device integration) or emp_id / id
    let empRes;
    if (targetHardwareId && !targetEmpId) {
      empRes = await db.query(
        `SELECT * FROM performance_employees
         WHERE UPPER(TRIM(hardware_id)) = UPPER($1) AND is_active = TRUE
         LIMIT 1`,
        [targetHardwareId]
      );
    } else {
      empRes = await db.query(
        `SELECT * FROM performance_employees WHERE emp_id = $1 OR id = $2 LIMIT 1`,
        [String(targetEmpId), Number(targetEmpId) || 0]
      );
    }

    if (!empRes.rows || empRes.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: targetHardwareId && !targetEmpId
          ? `No active employee assigned to Hardware ID "${targetHardwareId}".`
          : `Employee "${targetEmpId}" not registered in Nexora performance roster.`,
      });
    }

    const employee = empRes.rows[0];

    if (!employee.is_active) {
      return res.status(400).json({
        success: false,
        message: `Employee "${employee.emp_id}" is inactive. Hardware events rejected.`,
      });
    }

    let eventTime = new Date();
    if (timestamp) {
      const parsedTime = new Date(timestamp);
      if (isNaN(parsedTime.getTime())) {
        return res.status(400).json({ success: false, message: 'Invalid timestamp format' });
      }
      if (parsedTime.getTime() > Date.now() + 60000) {
        return res.status(400).json({ success: false, message: 'Event timestamp cannot be in the future.' });
      }
      eventTime = parsedTime;
    }

    if (idempotency_key) {
      const existing = await db.query(
        'SELECT * FROM employee_performance_events WHERE idempotency_key = $1',
        [idempotency_key]
      );
      if (existing.rows && existing.rows.length > 0) {
        return res.json({
          success: true,
          message: 'Hardware event already processed (idempotent duplicate)',
          data: existing.rows[0],
          is_duplicate: true,
        });
      }
    }

    const finalKey = idempotency_key || `hw_${employee.emp_id}_${device_id || 'dev'}_${Date.now()}`;

    const insertRes = await db.query(
      `INSERT INTO employee_performance_events
       (emp_id, event_timestamp, created_at, source, device_id, idempotency_key, notes)
       VALUES ($1, $2, NOW(), 'HARDWARE', $3, $4, $5)
       RETURNING *`,
      [employee.emp_id, eventTime.toISOString(), device_id || 'IoT-Terminal-1', finalKey, notes || 'Hardware automated trigger']
    );

    const newEvent = insertRes.rows[0];

    broadcastWorkEvent(newEvent, employee);

    res.status(201).json({
      success: true,
      message: 'Hardware work-completion event verified and recorded',
      data: newEvent,
    });
  } catch (err: any) {
    console.error('Error processing hardware event:', err);
    sendRouteError(res, err, 'Failed to process hardware event');
  }
});

// ==========================================
// 7. PERFORMANCE REPORTS AGGREGATION
// ==========================================
router.get('/reports', async (req: Request, res: Response) => {
  try {
    const {
      period = 'daily',
      start_date,
      end_date,
      employee_id,
      emp_id,
      department,
      include_simulated = 'false',
    } = req.query;

    const db = await getDb();
    const shouldIncludeSimulated = include_simulated === 'true';
    const filterEmp = (emp_id || employee_id) as string;

    // Date boundary
    let dateFilter = `e.event_timestamp >= CURRENT_DATE`;
    let prevDateFilter = `e.event_timestamp >= CURRENT_DATE - INTERVAL '1 day' AND e.event_timestamp < CURRENT_DATE`;
    let currentLabel = 'Today';
    let prevLabel = 'Yesterday';

    const currParams: any[] = [];
    const prevParams: any[] = [];

    if (period === 'weekly') {
      dateFilter = `e.event_timestamp >= DATE_TRUNC('week', CURRENT_DATE)`;
      prevDateFilter = `e.event_timestamp >= DATE_TRUNC('week', CURRENT_DATE) - INTERVAL '1 week' AND e.event_timestamp < DATE_TRUNC('week', CURRENT_DATE)`;
      currentLabel = 'This Week';
      prevLabel = 'Last Week';
    } else if (period === 'monthly') {
      dateFilter = `e.event_timestamp >= DATE_TRUNC('month', CURRENT_DATE)`;
      prevDateFilter = `e.event_timestamp >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month' AND e.event_timestamp < DATE_TRUNC('month', CURRENT_DATE)`;
      currentLabel = 'This Month';
      prevLabel = 'Last Month';
    } else if (period === 'custom' && start_date) {
      const startStr = String(start_date).trim();
      const endStr = end_date ? String(end_date).trim() : '';
      if (!isValidIsoDate(startStr) || (endStr && !isValidIsoDate(endStr))) {
        return res.status(400).json({
          success: false,
          message: 'Invalid date parameter. Dates must follow strict YYYY-MM-DD format.',
        });
      }
      currParams.push(`${startStr} 00:00:00`);
      const startIdx = currParams.length;
      if (endStr) {
        currParams.push(`${endStr} 23:59:59`);
        dateFilter = `e.event_timestamp >= $${startIdx}::TIMESTAMPTZ AND e.event_timestamp <= $${currParams.length}::TIMESTAMPTZ`;
      } else {
        dateFilter = `e.event_timestamp >= $${startIdx}::TIMESTAMPTZ AND e.event_timestamp <= NOW()`;
      }
      currentLabel = `${startStr}${endStr ? ` to ${endStr}` : ''}`;
      prevLabel = 'Prior Equivalent Span';
      if (endStr) {
        const diffMs = new Date(endStr).getTime() - new Date(startStr).getTime();
        const days = Math.min(3650, Math.max(Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1, 1));
        prevParams.push(`${startStr} 00:00:00`, days);
        prevDateFilter = `e.event_timestamp >= $1::TIMESTAMPTZ - ($2::int * INTERVAL '1 day') AND e.event_timestamp < $1::TIMESTAMPTZ`;
      }
    }

    // Source filtering: by default, official reports exclude simulated events
    const sourceFilter = shouldIncludeSimulated ? '1=1' : `e.source = 'HARDWARE'`;

    // Strictly parameterized employee filter (eliminates SQL injection)
    const breakdownParams = [...currParams];
    let employeeFilterCurr = '1=1';
    let employeeFilterPrev = '1=1';
    if (filterEmp && filterEmp !== 'all') {
      const cleanEmp = String(filterEmp).trim().slice(0, 64);
      currParams.push(cleanEmp);
      employeeFilterCurr = `e.emp_id = $${currParams.length}`;
      prevParams.push(cleanEmp);
      employeeFilterPrev = `e.emp_id = $${prevParams.length}`;
    }

    // Total registered employees count
    let totalRegistered = 0;
    try {
      const regRes = await db.query(`SELECT COUNT(*)::int AS cnt FROM performance_employees WHERE is_active = TRUE`);
      totalRegistered = Number(regRes.rows[0]?.cnt || 0);
    } catch {}

    // 1. Overall stats
    const statsQuery = `
      SELECT
        COUNT(*)::int AS total_events,
        COUNT(DISTINCT e.emp_id)::int AS active_employees,
        COUNT(*) FILTER (WHERE e.source = 'HARDWARE')::int AS hardware_events,
        COUNT(*) FILTER (WHERE e.source = 'SIMULATED')::int AS simulated_events
      FROM employee_performance_events e
      WHERE ${dateFilter} AND ${sourceFilter} AND ${employeeFilterCurr}
    `;
    const statsRes = await db.query(statsQuery, currParams);
    const overallStats = (statsRes.rows[0] || { total_events: 0, active_employees: 0, hardware_events: 0, simulated_events: 0 }) as any;

    // 2. Previous period comparison
    let prevTotal = 0;
    try {
      const prevRes = await db.query(`
        SELECT COUNT(*)::int AS prev_events
        FROM employee_performance_events e
        WHERE ${prevDateFilter} AND ${sourceFilter} AND ${employeeFilterPrev}
      `, prevParams);
      prevTotal = Number(prevRes.rows[0]?.prev_events || 0);
    } catch {}

    const currentTotal = Number(overallStats.total_events || 0);
    let percentChange: number | null = null;
    if (prevTotal > 0) {
      percentChange = Math.round(((currentTotal - prevTotal) / prevTotal) * 100);
    } else if (currentTotal > 0) {
      percentChange = 100;
    } else {
      percentChange = 0;
    }

    // 3. Timeline Trend (Adaptive Grouping)
    const grouping = period === 'daily' ? `TO_CHAR(e.event_timestamp, 'HH24:00')` : `TO_CHAR(e.event_timestamp, 'YYYY-MM-DD')`;
    const trendQuery = `
      SELECT
        ${grouping} AS time_bucket,
        COUNT(*)::int AS event_count,
        COUNT(*) FILTER (WHERE e.source = 'HARDWARE')::int AS hardware_count,
        COUNT(*) FILTER (WHERE e.source = 'SIMULATED')::int AS simulated_count
      FROM employee_performance_events e
      WHERE ${dateFilter} AND ${sourceFilter} AND ${employeeFilterCurr}
      GROUP BY time_bucket
      ORDER BY time_bucket ASC
    `;
    const trendRes = await db.query(trendQuery, currParams);

    // 4. Hourly Distribution (24 hours: 00:00 to 23:00)
    let hourlyDistribution: Array<{ hour: number; label: string; event_count: number; hardware_count: number; simulated_count: number }> = [];
    try {
      const hourlyRes = await db.query(`
        SELECT
          EXTRACT(HOUR FROM e.event_timestamp)::int AS hour,
          COUNT(*)::int AS event_count,
          COUNT(*) FILTER (WHERE e.source = 'HARDWARE')::int AS hardware_count,
          COUNT(*) FILTER (WHERE e.source = 'SIMULATED')::int AS simulated_count
        FROM employee_performance_events e
        WHERE ${dateFilter} AND ${sourceFilter} AND ${employeeFilterCurr}
        GROUP BY hour
        ORDER BY hour ASC
      `, currParams);

      const hourMap = new Map<number, { event_count: number; hardware_count: number; simulated_count: number }>();
      for (const row of (hourlyRes.rows || [])) {
        hourMap.set(Number((row as any).hour), {
          event_count: Number((row as any).event_count || 0),
          hardware_count: Number((row as any).hardware_count || 0),
          simulated_count: Number((row as any).simulated_count || 0),
        });
      }

      hourlyDistribution = Array.from({ length: 24 }, (_, h) => {
        const d = hourMap.get(h) || { event_count: 0, hardware_count: 0, simulated_count: 0 };
        return {
          hour: h,
          label: `${String(h).padStart(2, '0')}:00`,
          event_count: d.event_count,
          hardware_count: d.hardware_count,
          simulated_count: d.simulated_count,
        };
      });
    } catch {
      hourlyDistribution = Array.from({ length: 24 }, (_, h) => ({
        hour: h,
        label: `${String(h).padStart(2, '0')}:00`,
        event_count: 0,
        hardware_count: 0,
        simulated_count: 0,
      }));
    }

    // 5. Personnel Performance Ledger (Keep registered performance employees visible even with 0 activity)
    let registeredEmployees: any[] = [];
    try {
      let rosterQuery = `
        SELECT id, emp_id, first_name, last_name, department, designation, is_active
        FROM performance_employees
        WHERE is_active = TRUE
      `;
      const rosterParams: any[] = [];
      if (filterEmp && filterEmp !== 'all') {
        rosterParams.push(String(filterEmp).trim());
        rosterQuery += ` AND emp_id = $${rosterParams.length}`;
      }
      if (department && department !== 'all') {
        rosterParams.push(String(department).trim());
        rosterQuery += ` AND LOWER(department) = LOWER($${rosterParams.length})`;
      }
      rosterQuery += ` ORDER BY emp_id ASC`;
      const rRes = await db.query(rosterQuery, rosterParams);
      registeredEmployees = rRes.rows || [];
    } catch {}

    // Query event stats grouped by emp_id for this period
    const eventsByEmp = new Map<string, any>();
    try {
      const breakdownQuery = `
        SELECT
          e.emp_id,
          COUNT(*)::int AS completed_count,
          COUNT(*) FILTER (WHERE e.source = 'HARDWARE')::int AS hardware_count,
          COUNT(*) FILTER (WHERE e.source = 'SIMULATED')::int AS simulated_count,
          MIN(e.event_timestamp) AS first_event,
          MAX(e.event_timestamp) AS last_event
        FROM employee_performance_events e
        WHERE ${dateFilter} AND ${sourceFilter}
        GROUP BY e.emp_id
      `;
      const evRes = await db.query(breakdownQuery, breakdownParams);
      for (const row of evRes.rows) {
        eventsByEmp.set(String((row as any).emp_id), row);
      }
    } catch {}

    // Query last overall event source per employee
    const lastSourceMap = new Map<string, string>();
    try {
      const srcRes = await db.query(`
        SELECT DISTINCT ON (emp_id) emp_id, source AS last_source
        FROM employee_performance_events
        ORDER BY emp_id, event_timestamp DESC
      `);
      for (const row of srcRes.rows) {
        lastSourceMap.set(String((row as any).emp_id), (row as any).last_source);
      }
    } catch {}

    // Merge registered employees with period event metrics
    const ledgerEmployees = registeredEmployees.map(emp => {
      const empIdStr = String(emp.emp_id);
      const ev = eventsByEmp.get(empIdStr);
      const derivedName = `${emp.first_name || ''} ${emp.last_name || ''}`.trim() || `Employee #${empIdStr}`;
      const completedCount = ev ? Number(ev.completed_count) : 0;
      const hwCount = ev ? Number(ev.hardware_count) : 0;
      const simCount = ev ? Number(ev.simulated_count) : 0;
      const firstEvent = ev?.first_event ? new Date(ev.first_event).toISOString() : null;
      const lastEvent = ev?.last_event ? new Date(ev.last_event).toISOString() : null;
      const lastSource = lastSourceMap.get(empIdStr) || null;

      return {
        id: emp.id,
        raw_id: emp.id,
        emp_id: empIdStr,
        employee_id: empIdStr,
        first_name: emp.first_name || '',
        last_name: emp.last_name || '',
        name: derivedName,
        display_name: derivedName,
        department: emp.department || '',
        designation: emp.designation || '',
        completed_count: completedCount,
        hardware_count: hwCount,
        simulated_count: simCount,
        first_event: firstEvent,
        last_event: lastEvent,
        last_source: lastSource,
      };
    });

    // Default sort: most recent actual activity first (last_event DESC), then completed_count DESC, then inactive by emp_id ASC
    ledgerEmployees.sort((a, b) => {
      if (a.last_event && b.last_event) {
        const diff = new Date(b.last_event).getTime() - new Date(a.last_event).getTime();
        if (diff !== 0) return diff;
      }
      if (a.last_event && !b.last_event) return -1;
      if (!a.last_event && b.last_event) return 1;
      if (b.completed_count !== a.completed_count) {
        return b.completed_count - a.completed_count;
      }
      return a.emp_id.localeCompare(b.emp_id);
    });

    // Top Performing Personnel: ranked by qualifying work-completion count (> 0 only)
    const topPerformers = ledgerEmployees
      .filter(e => e.completed_count > 0)
      .sort((a, b) => b.completed_count - a.completed_count || a.emp_id.localeCompare(b.emp_id))
      .slice(0, 10)
      .map(e => ({
        emp_id: e.emp_id,
        first_name: e.first_name,
        last_name: e.last_name,
        name: e.name,
        department: e.department,
        completed_count: e.completed_count,
      }));

    res.json({
      success: true,
      data: {
        period,
        include_simulated: shouldIncludeSimulated,
        total_registered_employees: totalRegistered,
        stats: {
          total_events: Number(overallStats.total_events || 0),
          active_employees: Number(overallStats.active_employees || 0),
          hardware_events: Number(overallStats.hardware_events || 0),
          simulated_events: Number(overallStats.simulated_events || 0),
        },
        comparison: {
          current_label: currentLabel,
          prev_label: prevLabel,
          current_total: currentTotal,
          prev_total: prevTotal,
          percent_change: percentChange,
        },
        top_performers: topPerformers,
        hourly_distribution: hourlyDistribution,
        trend: trendRes.rows || [],
        employees: ledgerEmployees,
      },
    });
  } catch (err: any) {
    console.error('Error generating performance reports:', err);
    sendRouteError(res, err, 'Failed to generate performance reports');
  }
});

// ==========================================
// 8. CSV EXPORT FOR PERFORMANCE REPORTS
// ==========================================
router.get('/reports/export', async (req: Request, res: Response) => {
  try {
    const {
      period = 'daily',
      start_date,
      end_date,
      employee_id,
      emp_id,
      include_simulated = 'false',
    } = req.query;

    const db = await getDb();
    const shouldIncludeSimulated = include_simulated === 'true';
    const filterEmp = (emp_id || employee_id) as string;

    const exportParams: any[] = [];
    let dateFilter = `e.event_timestamp >= CURRENT_DATE`;
    if (period === 'weekly') {
      dateFilter = `e.event_timestamp >= DATE_TRUNC('week', CURRENT_DATE)`;
    } else if (period === 'monthly') {
      dateFilter = `e.event_timestamp >= DATE_TRUNC('month', CURRENT_DATE)`;
    } else if (period === 'custom' && start_date) {
      const startStr = String(start_date).trim();
      const endStr = end_date ? String(end_date).trim() : '';
      if (!isValidIsoDate(startStr) || (endStr && !isValidIsoDate(endStr))) {
        return res.status(400).json({
          success: false,
          message: 'Invalid date parameter. Dates must follow strict YYYY-MM-DD format.',
        });
      }
      exportParams.push(`${startStr} 00:00:00`);
      const sIdx = exportParams.length;
      if (endStr) {
        exportParams.push(`${endStr} 23:59:59`);
        dateFilter = `e.event_timestamp >= $${sIdx}::TIMESTAMPTZ AND e.event_timestamp <= $${exportParams.length}::TIMESTAMPTZ`;
      } else {
        dateFilter = `e.event_timestamp >= $${sIdx}::TIMESTAMPTZ AND e.event_timestamp <= NOW()`;
      }
    }

    const sourceFilter = shouldIncludeSimulated ? '1=1' : `e.source = 'HARDWARE'`;
    let empFilter = '1=1';
    if (filterEmp && filterEmp !== 'all') {
      exportParams.push(String(filterEmp).trim().slice(0, 64));
      empFilter = `e.emp_id = $${exportParams.length}`;
    }

    const rawRows = await db.query(`
      SELECT
        e.id,
        e.emp_id,
        e.event_timestamp,
        e.source,
        e.device_id,
        e.notes,
        p.first_name,
        p.last_name,
        p.department,
        p.designation
      FROM employee_performance_events e
      LEFT JOIN performance_employees p ON e.emp_id = p.emp_id
      WHERE ${dateFilter} AND ${sourceFilter} AND ${empFilter}
      ORDER BY e.event_timestamp DESC
    `, exportParams);

    const headers = ['Event ID', 'Employee ID', 'Employee Name', 'Department', 'Designation', 'Event Timestamp', 'Source', 'Device ID', 'Notes'];
    const lines = [headers.join(',')];

    for (const r of (rawRows.rows as any[])) {
      const displayName = `${r.first_name || ''} ${r.last_name || ''}`.trim() || `Employee #${r.emp_id}`;
      const empId = `"${r.emp_id}"`;
      const empName = `"${displayName.replace(/"/g, '""')}"`;
      const dept = `"${(r.department || '').replace(/"/g, '""')}"`;
      const desig = `"${(r.designation || '').replace(/"/g, '""')}"`;
      const time = `"${new Date(r.event_timestamp).toISOString()}"`;
      const src = `"${r.source}"`;
      const dev = `"${(r.device_id || '').replace(/"/g, '""')}"`;
      const notes = `"${(r.notes || '').replace(/"/g, '""')}"`;

      lines.push([r.id, empId, empName, dept, desig, time, src, dev, notes].join(','));
    }

    const csvContent = lines.join('\n');
    const filename = `Nexora_Performance_Report_${period}_${new Date().toISOString().slice(0, 10)}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csvContent);
  } catch (err: any) {
    sendRouteError(res, err, 'Failed to export CSV');
  }
});

export default router;
