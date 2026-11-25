import express, { Request, Response } from 'express';
import { getDb } from './db';
import { store } from './store';
import { AuthenticatedRequest } from '../server';

const router = express.Router();

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
      department: employee.department || 'Operations',
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

// Keepalive heartbeats for SSE
setInterval(() => {
  for (const client of sseClients) {
    try {
      client.write(`: ping\n\n`);
    } catch {
      sseClients.delete(client);
    }
  }
}, 25000);

// ==========================================
// 1. SSE STREAM ENDPOINT
// ==========================================
router.get('/events/stream', (req: Request, res: Response) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
    'Access-Control-Allow-Origin': '*',
  });

  res.write(`data: ${JSON.stringify({ type: 'CONNECTED', message: 'SSE connection established', timestamp: new Date().toISOString() })}\n\n`);
  sseClients.add(res);

  req.on('close', () => {
    sseClients.delete(res);
  });
});

// ==========================================
// 2. PERFORMANCE EMPLOYEE ROSTER MANAGEMENT
// Table: performance_employees
// (NO name or full_name column)
// ==========================================

// GET /api/performance/roster
router.get('/roster', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const { search, status, department } = req.query;

    let queryStr = `
      SELECT
        p.id,
        p.emp_id,
        p.first_name,
        p.last_name,
        p.department,
        p.designation,
        p.login_enabled,
        p.is_active,
        p.created_at,
        p.updated_at,
        p.created_by
      FROM performance_employees p
      WHERE 1=1
    `;
    const params: any[] = [];

    if (status === 'active') {
      params.push(true);
      queryStr += ` AND p.is_active = $${params.length}`;
    } else if (status === 'disabled' || status === 'inactive') {
      params.push(false);
      queryStr += ` AND p.is_active = $${params.length}`;
    }

    if (department && department !== 'all') {
      params.push(department);
      queryStr += ` AND LOWER(p.department) = LOWER($${params.length})`;
    }

    queryStr += ` ORDER BY p.id ASC`;

    const result = await db.query(queryStr, params);
    let rows = result.rows || [];

    // Filter search in memory for robust multi-field matching
    if (search && typeof search === 'string' && search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter((r: any) => {
        const fullName = `${r.first_name || ''} ${r.last_name || ''}`.toLowerCase();
        const empId = (r.emp_id || '').toLowerCase();
        const dept = (r.department || '').toLowerCase();
        const desig = (r.designation || '').toLowerCase();
        return fullName.includes(q) || empId.includes(q) || dept.includes(q) || desig.includes(q);
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

      return {
        id: r.id,
        emp_id: r.emp_id,
        employee_id: r.emp_id,
        first_name: r.first_name || '',
        last_name: r.last_name || '',
        name: displayName,
        display_name: displayName,
        department: r.department || '',
        designation: r.designation || '',
        login_enabled: Boolean(r.login_enabled),
        is_active: Boolean(r.is_active),
        created_at: r.created_at,
        updated_at: r.updated_at,
        created_by: r.created_by,
        total_events: evStats.count,
        last_event_timestamp: evStats.last_event,
      };
    });

    res.json({
      success: true,
      data: mapped,
      total: mapped.length,
    });
  } catch (err: any) {
    console.error('Error fetching performance roster:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch performance employee roster', error: err.message });
  }
});

// POST /api/performance/roster - Register new employee
router.post('/roster', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { emp_id, first_name, last_name, department, designation } = req.body;

    const errors: { field: string; message: string }[] = [];
    if (!emp_id || !emp_id.trim()) {
      errors.push({ field: 'emp_id', message: 'Employee ID is required.' });
    }
    if (!first_name || !first_name.trim()) {
      errors.push({ field: 'first_name', message: 'First name is required.' });
    }
    if (!last_name || !last_name.trim()) {
      errors.push({ field: 'last_name', message: 'Last name is required.' });
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed. Please correct the highlighted fields.',
        errors,
      });
    }

    const cleanEmpId = emp_id.trim().toUpperCase();
    const cleanFirst = first_name.trim();
    const cleanLast = last_name.trim();
    const cleanDept = (department || 'Operations').trim();
    const cleanDesig = (designation || 'Staff').trim();
    const createdBy = req.user?.email || 'System';

    const db = await getDb();

    // Check unique emp_id
    const existing = await db.query('SELECT id, emp_id FROM performance_employees WHERE emp_id = $1', [cleanEmpId]);
    if (existing.rows && existing.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: `Employee ID "${cleanEmpId}" is already registered in the performance roster.`,
        errors: [{ field: 'emp_id', message: 'Employee ID must be unique.' }],
      });
    }

    // Insert into performance_employees table (Strictly NO name or full_name column)
    const insertRes = await db.query(
      `INSERT INTO performance_employees
       (emp_id, first_name, last_name, password_hash, login_enabled, department, designation, is_active, created_at, updated_at, created_by)
       VALUES ($1, $2, $3, NULL, FALSE, $4, $5, TRUE, NOW(), NOW(), $6)
       RETURNING *`,
      [cleanEmpId, cleanFirst, cleanLast, cleanDept, cleanDesig, createdBy]
    );

    const inserted = insertRes.rows[0];
    const displayName = `${cleanFirst} ${cleanLast}`.trim();

    store.logAudit({
      user_id: req.user?.id || null,
      user_email: req.user?.email || 'system',
      action: 'PERFORMANCE_EMPLOYEE_REGISTERED',
      module: 'Performance',
      details: `Registered performance employee: ${cleanEmpId} (${displayName}) in ${cleanDept}`,
      ip_address: req.ip || '127.0.0.1',
    });

    res.status(201).json({
      success: true,
      message: `Employee ${displayName} (${cleanEmpId}) registered successfully.`,
      data: {
        id: inserted.id,
        emp_id: inserted.emp_id,
        employee_id: inserted.emp_id,
        first_name: inserted.first_name,
        last_name: inserted.last_name,
        name: displayName,
        display_name: displayName,
        department: inserted.department,
        designation: inserted.designation,
        login_enabled: inserted.login_enabled,
        is_active: inserted.is_active,
        created_at: inserted.created_at,
        updated_at: inserted.updated_at,
      },
    });
  } catch (err: any) {
    console.error('Error registering performance employee:', err);
    res.status(500).json({ success: false, message: 'Failed to register performance employee', error: err.message });
  }
});

// PUT /api/performance/roster/:id - Update or toggle status
router.put('/roster/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = req.params.id;
    const { department, designation, is_active } = req.body;

    const db = await getDb();

    // Verify employee exists
    const checkRes = await db.query('SELECT * FROM performance_employees WHERE id = $1 OR emp_id = $1', [id]);
    if (!checkRes.rows || checkRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Performance employee not found.' });
    }

    const current = checkRes.rows[0];
    const newDept = department !== undefined ? department.trim() : current.department;
    const newDesig = designation !== undefined ? designation.trim() : current.designation;
    const newActive = is_active !== undefined ? Boolean(is_active) : current.is_active;

    await db.query(
      `UPDATE performance_employees
       SET department = $1, designation = $2, is_active = $3, updated_at = NOW()
       WHERE id = $4`,
      [newDept, newDesig, newActive, current.id]
    );

    const displayName = `${current.first_name} ${current.last_name}`.trim();

    store.logAudit({
      user_id: req.user?.id || null,
      user_email: req.user?.email || 'system',
      action: newActive !== current.is_active ? (newActive ? 'EMPLOYEE_ACTIVATED' : 'EMPLOYEE_DEACTIVATED') : 'EMPLOYEE_UPDATED',
      module: 'Performance',
      details: `Updated performance employee ${current.emp_id} (${displayName}) - status: ${newActive ? 'Active' : 'Deactivated'}`,
      ip_address: req.ip || '127.0.0.1',
    });

    res.json({
      success: true,
      message: `Employee ${displayName} updated successfully.`,
      data: {
        ...current,
        department: newDept,
        designation: newDesig,
        is_active: newActive,
        updated_at: new Date().toISOString(),
      },
    });
  } catch (err: any) {
    console.error('Error updating performance employee:', err);
    res.status(500).json({ success: false, message: 'Failed to update employee', error: err.message });
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
        department: u.department || 'Operations',
        designation: u.designation || 'Staff',
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
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve employee performance data',
      error: err.message,
    });
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
    res.status(500).json({ success: false, message: 'Failed to fetch summary stats', error: err.message });
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
    res.status(500).json({
      success: false,
      message: 'Failed to record simulated work completion event',
      error: err.message,
    });
  }
});

// ==========================================
// 6. HARDWARE INGESTION ENDPOINT
// ==========================================
router.post('/events/hardware', async (req: Request, res: Response) => {
  try {
    const deviceToken = req.headers['x-device-token'] as string ||
      (req.headers['authorization']?.startsWith('Bearer ') ? req.headers['authorization'].slice(7) : '');

    const expectedToken = process.env.HARDWARE_DEVICE_TOKEN || 'nexora_hw_sec_toy_biz_99a8b7c6d5e4';

    if (!deviceToken || deviceToken !== expectedToken) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized hardware device. Invalid or missing x-device-token.',
      });
    }

    const { employee_id, emp_id, device_id, timestamp, idempotency_key, notes } = req.body;
    const targetEmpId = emp_id || employee_id;

    if (!targetEmpId) {
      return res.status(400).json({
        success: false,
        message: 'emp_id or employee_id is required.',
      });
    }

    const db = await getDb();

    // Verify employee in performance_employees roster
    const empRes = await db.query(
      `SELECT * FROM performance_employees WHERE emp_id = $1 OR id = $2 LIMIT 1`,
      [String(targetEmpId), Number(targetEmpId) || 0]
    );

    if (!empRes.rows || empRes.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Employee "${targetEmpId}" not registered in Nexora performance roster.`,
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
    res.status(500).json({
      success: false,
      message: 'Failed to process hardware event',
      error: err.message,
    });
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
    if (period === 'weekly') {
      dateFilter = `e.event_timestamp >= DATE_TRUNC('week', CURRENT_DATE)`;
    } else if (period === 'monthly') {
      dateFilter = `e.event_timestamp >= DATE_TRUNC('month', CURRENT_DATE)`;
    } else if (period === 'custom' && start_date) {
      const end = end_date ? `'${end_date} 23:59:59'` : 'NOW()';
      dateFilter = `e.event_timestamp >= '${start_date} 00:00:00' AND e.event_timestamp <= ${end}`;
    }

    // Source filtering: by default, official reports exclude simulated events
    const sourceFilter = shouldIncludeSimulated ? '1=1' : `e.source = 'HARDWARE'`;

    let employeeFilter = '1=1';
    if (filterEmp && filterEmp !== 'all') {
      employeeFilter = `e.emp_id = '${filterEmp.replace(/'/g, "''")}'`;
    }

    // 1. Overall stats
    const statsQuery = `
      SELECT
        COUNT(*)::int AS total_events,
        COUNT(DISTINCT e.emp_id)::int AS active_employees,
        COUNT(*) FILTER (WHERE e.source = 'HARDWARE')::int AS hardware_events,
        COUNT(*) FILTER (WHERE e.source = 'SIMULATED')::int AS simulated_events
      FROM employee_performance_events e
      WHERE ${dateFilter} AND ${sourceFilter} AND ${employeeFilter}
    `;
    const statsRes = await db.query(statsQuery);
    const overallStats = (statsRes.rows[0] || { total_events: 0, active_employees: 0, hardware_events: 0, simulated_events: 0 }) as any;

    // 2. Timeline Trend
    const grouping = period === 'daily' ? `TO_CHAR(e.event_timestamp, 'HH24:00')` : `TO_CHAR(e.event_timestamp, 'YYYY-MM-DD')`;
    const trendQuery = `
      SELECT
        ${grouping} AS time_bucket,
        COUNT(*)::int AS event_count,
        COUNT(*) FILTER (WHERE e.source = 'HARDWARE')::int AS hardware_count,
        COUNT(*) FILTER (WHERE e.source = 'SIMULATED')::int AS simulated_count
      FROM employee_performance_events e
      WHERE ${dateFilter} AND ${sourceFilter} AND ${employeeFilter}
      GROUP BY time_bucket
      ORDER BY time_bucket ASC
    `;
    const trendRes = await db.query(trendQuery);

    // 3. Employee breakdown table
    const breakdownQuery = `
      SELECT
        e.emp_id,
        COUNT(*)::int AS completed_count,
        COUNT(*) FILTER (WHERE e.source = 'HARDWARE')::int AS hardware_count,
        COUNT(*) FILTER (WHERE e.source = 'SIMULATED')::int AS simulated_count,
        MIN(e.event_timestamp) AS first_event,
        MAX(e.event_timestamp) AS last_event
      FROM employee_performance_events e
      WHERE ${dateFilter} AND ${sourceFilter} AND ${employeeFilter}
      GROUP BY e.emp_id
      ORDER BY completed_count DESC, e.emp_id ASC
    `;
    const breakdownRes = await db.query(breakdownQuery);

    // Enrich breakdown with employee details from performance_employees
    const employeeMap = new Map<string, any>();
    try {
      const userRes = await db.query(`
        SELECT id, emp_id, first_name, last_name, department, designation
        FROM performance_employees
      `);
      for (const u of userRes.rows) {
        employeeMap.set((u as any).emp_id, u);
      }
    } catch {}

    const employeesBreakdown = (breakdownRes.rows as any[]).map(row => {
      const empIdStr = String(row.emp_id);
      const emp = employeeMap.get(empIdStr);
      const derivedName = emp
        ? `${emp.first_name || ''} ${emp.last_name || ''}`.trim() || `Employee #${empIdStr}`
        : `Employee #${empIdStr}`;

      return {
        id: emp?.id || 0,
        emp_id: empIdStr,
        employee_id: empIdStr,
        raw_id: emp?.id || 0,
        first_name: emp?.first_name || '',
        last_name: emp?.last_name || '',
        name: derivedName,
        display_name: derivedName,
        department: emp?.department || 'Operations',
        designation: emp?.designation || 'Staff',
        completed_count: Number(row.completed_count),
        hardware_count: Number(row.hardware_count),
        simulated_count: Number(row.simulated_count),
        first_event: row.first_event ? new Date(row.first_event).toISOString() : null,
        last_event: row.last_event ? new Date(row.last_event).toISOString() : null,
      };
    });

    const filteredBreakdown = (department && department !== 'all')
      ? employeesBreakdown.filter(e => e.department.toLowerCase() === (department as string).toLowerCase())
      : employeesBreakdown;

    res.json({
      success: true,
      data: {
        period,
        include_simulated: shouldIncludeSimulated,
        stats: {
          total_events: Number(overallStats.total_events || 0),
          active_employees: Number(overallStats.active_employees || 0),
          hardware_events: Number(overallStats.hardware_events || 0),
          simulated_events: Number(overallStats.simulated_events || 0),
        },
        trend: trendRes.rows || [],
        employees: filteredBreakdown,
      },
    });
  } catch (err: any) {
    console.error('Error generating performance reports:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to generate performance reports',
      error: err.message,
    });
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

    let dateFilter = `e.event_timestamp >= CURRENT_DATE`;
    if (period === 'weekly') {
      dateFilter = `e.event_timestamp >= DATE_TRUNC('week', CURRENT_DATE)`;
    } else if (period === 'monthly') {
      dateFilter = `e.event_timestamp >= DATE_TRUNC('month', CURRENT_DATE)`;
    } else if (period === 'custom' && start_date) {
      const end = end_date ? `'${end_date} 23:59:59'` : 'NOW()';
      dateFilter = `e.event_timestamp >= '${start_date} 00:00:00' AND e.event_timestamp <= ${end}`;
    }

    const sourceFilter = shouldIncludeSimulated ? '1=1' : `e.source = 'HARDWARE'`;
    let empFilter = '1=1';
    if (filterEmp && filterEmp !== 'all') {
      empFilter = `e.emp_id = '${filterEmp.replace(/'/g, "''")}'`;
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
    `);

    const headers = ['Event ID', 'Employee ID', 'Employee Name', 'Department', 'Designation', 'Event Timestamp', 'Source', 'Device ID', 'Notes'];
    const lines = [headers.join(',')];

    for (const r of (rawRows.rows as any[])) {
      const displayName = `${r.first_name || ''} ${r.last_name || ''}`.trim() || `Employee #${r.emp_id}`;
      const empId = `"${r.emp_id}"`;
      const empName = `"${displayName.replace(/"/g, '""')}"`;
      const dept = `"${(r.department || 'Operations').replace(/"/g, '""')}"`;
      const desig = `"${(r.designation || 'Staff').replace(/"/g, '""')}"`;
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
    res.status(500).json({ success: false, message: 'Failed to export CSV', error: err.message });
  }
});

export default router;
