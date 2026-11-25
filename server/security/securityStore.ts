import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import pg from 'pg';
import { securityConfig } from './config';
import { redactSensitiveData, resolveSafePagination } from './redaction';

// ============================================================================
// DOMAIN TYPES
// ============================================================================

export type LoginEventType =
  | 'LOGIN'
  | 'LOGIN_FAILED'
  | 'LOGOUT'
  | 'SESSION_EXPIRED'
  | 'FORCED_LOGOUT'
  | 'MFA_CHALLENGE'
  | 'MFA_FAILED';

export type LoginStatus =
  | 'SUCCESS'
  | 'FAILED'
  | 'LOCKED'
  | 'BLOCKED_DEVICE'
  | 'INACTIVE_ACCOUNT'
  | 'MFA_REQUIRED'
  | 'LOGGED_OUT';

export interface LoginHistoryRecord {
  id: number;
  user_id: number | null;
  username: string | null;
  email: string | null;
  user_role: string | null;
  session_id: string | null;
  event_type: LoginEventType;
  login_status: LoginStatus;
  failure_reason: string | null;
  ip_address: string;
  device_id: string | null;
  device_name: string | null;
  device_type: string | null;
  os_name: string | null;
  os_version: string | null;
  browser_name: string | null;
  browser_version: string | null;
  user_agent: string | null;
  client_source: 'browser_reported' | 'verified_agent';
  verified_machine_name: string | null;
  is_new_device: boolean;
  is_suspicious: boolean;
  login_at: string;
  logout_at: string | null;
  created_at: string;
}

export interface DeviceHistoryRecord {
  id: number;
  user_id: number;
  username?: string;
  user_email?: string;
  device_id: string;
  device_name: string;
  device_type: string;
  os_name: string | null;
  os_version: string | null;
  browser_name: string | null;
  browser_version: string | null;
  user_agent: string | null;
  client_source: 'browser_reported' | 'verified_agent';
  verified_machine_name: string | null;
  first_ip_address: string | null;
  last_ip_address: string | null;
  first_login_at: string;
  last_login_at: string;
  login_count: number;
  trust_status: 'trusted' | 'new' | 'blocked' | 'revoked';
  blocked_at: string | null;
  blocked_by: number | null;
  block_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface SecuritySessionRecord {
  id: number;
  session_id: string;
  user_id: number;
  username: string | null;
  user_email: string | null;
  user_role: string | null;
  access_jti: string;
  refresh_token_hash: string | null;
  previous_refresh_hash: string | null;
  device_id: string | null;
  device_name: string | null;
  device_type: string | null;
  os_name: string | null;
  browser_name: string | null;
  ip_address: string;
  user_agent: string | null;
  client_source: 'browser_reported' | 'verified_agent';
  status: 'active' | 'revoked' | 'expired' | 'logged_out' | 'compromised';
  created_at: string;
  last_activity_at: string;
  expires_at: string;
  refresh_expires_at: string | null;
  revoked_at: string | null;
  revoked_by: number | null;
  revoke_reason: string | null;
}

export interface ActivityLogRecord {
  id: number;
  user_id: number | null;
  username: string | null;
  user_email: string | null;
  user_role: string | null;
  module_name: string;
  action_type: string;
  entity_type: string | null;
  entity_id: string | null;
  http_method: string | null;
  api_endpoint: string | null;
  ip_address: string;
  device_id: string | null;
  device_name: string | null;
  browser_name: string | null;
  os_name: string | null;
  session_id: string | null;
  status: 'SUCCESS' | 'FAILED' | 'DENIED' | 'WARNING';
  response_status_code: number | null;
  description: string | null;
  before_values: Record<string, any> | null;
  after_values: Record<string, any> | null;
  metadata: Record<string, any> | null;
  prev_hash: string;
  entry_hash: string;
  hmac_signature: string;
  created_at: string;
}

export type SecuritySeverity = 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface SecurityEventRecord {
  id: number;
  event_code: string;
  title: string;
  severity: SecuritySeverity;
  user_id: number | null;
  username: string | null;
  user_email: string | null;
  ip_address: string;
  device_id: string | null;
  device_name: string | null;
  endpoint: string | null;
  description: string;
  details: Record<string, any> | null;
  alert_email_sent: boolean;
  alert_sent_at: string | null;
  is_resolved: boolean;
  resolved_at: string | null;
  resolved_by: number | null;
  resolution_notes: string | null;
  created_at: string;
}

export interface BackupHistoryRecord {
  id: number;
  backup_uid: string;
  file_name: string;
  storage_path: string;
  offsite_path: string | null;
  trigger_type: 'manual' | 'scheduled' | 'pre_restore' | 'cli';
  status: 'in_progress' | 'completed' | 'failed' | 'verified' | 'restored' | 'deleted';
  pg_status: 'pending' | 'completed' | 'fallback_logical' | 'skipped_offline' | 'failed';
  pg_engine: string | null;
  json_store_status: 'pending' | 'completed' | 'failed' | 'missing';
  file_size_bytes: number;
  checksum_sha256: string | null;
  encrypted: boolean;
  encryption_algorithm: string;
  compression_algorithm: string;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  verified_at: string | null;
  verified_by: number | null;
  verification_status: string | null;
  retention_until: string | null;
  initiated_by: number | null;
  initiated_by_email: string | null;
  error_message: string | null;
  metadata: Record<string, any> | null;
  created_at: string;
}

export interface UserMfaState {
  user_id: number;
  enabled: boolean;
  secret_encrypted: string | null;
  pending_secret_encrypted?: string | null;
  recovery_code_hashes: string[];
  updated_at: string;
}

interface SecurityStateFile {
  nextIds: {
    login: number;
    device: number;
    session: number;
    activity: number;
    event: number;
    backup: number;
  };
  login_history: LoginHistoryRecord[];
  device_history: DeviceHistoryRecord[];
  sessions: SecuritySessionRecord[];
  activity_logs: ActivityLogRecord[];
  security_events: SecurityEventRecord[];
  backup_history: BackupHistoryRecord[];
  settings: Record<string, { value: any; description?: string; updated_by?: number | null; updated_at: string }>;
  mfa_users: Record<string, UserMfaState>;
}

const DEFAULT_STATE: SecurityStateFile = {
  nextIds: { login: 1, device: 1, session: 1, activity: 1, event: 1, backup: 1 },
  login_history: [],
  device_history: [],
  sessions: [],
  activity_logs: [],
  security_events: [],
  backup_history: [],
  settings: {},
  mfa_users: {},
};

// ============================================================================
// SECURITY REPOSITORY (PostgreSQL-Only Persistence — Zero Local JSON Files)
// ============================================================================

export class SecurityStore {
  private testStateFilePath: string | null = null;
  private state: SecurityStateFile;
  private pgPool: pg.Pool | null = null;
  private pgAvailable = false;
  private pgCheckedAt = 0;

  constructor(customStatePath?: string) {
    this.testStateFilePath =
      process.env.DISABLE_PG_FOR_TESTS === 'true' && customStatePath ? customStatePath : null;
    this.state = this.loadState();
  }

  public setStatePathForTests(filePath: string) {
    if (process.env.DISABLE_PG_FOR_TESTS !== 'true') {
      throw new Error('setStatePathForTests is only permitted in automated test mode.');
    }
    this.testStateFilePath = filePath;
    this.state = this.loadState();
  }

  public async hydrateFromPostgres(): Promise<boolean> {
    const pool = await this.getPgPool();
    if (!pool) return false;
    try {
      const [logins, devices, sessions, logs, events, backups, settings] = await Promise.all([
        pool.query(`SELECT * FROM user_login_history ORDER BY id DESC LIMIT 1000`).catch(() => ({ rows: [] })),
        pool.query(`SELECT * FROM user_device_history ORDER BY id DESC LIMIT 1000`).catch(() => ({ rows: [] })),
        pool.query(`SELECT * FROM user_sessions ORDER BY id DESC LIMIT 1000`).catch(() => ({ rows: [] })),
        pool.query(`SELECT * FROM user_activity_logs ORDER BY id ASC LIMIT 5000`).catch(() => ({ rows: [] })),
        pool.query(`SELECT * FROM security_events ORDER BY id DESC LIMIT 1000`).catch(() => ({ rows: [] })),
        pool.query(`SELECT * FROM database_backup_history ORDER BY id DESC LIMIT 500`).catch(() => ({ rows: [] })),
        pool.query(`SELECT setting_key, setting_value FROM security_settings`).catch(() => ({ rows: [] })),
      ]);

      this.state.login_history = logins.rows as any[];
      this.state.device_history = devices.rows as any[];
      this.state.sessions = sessions.rows as any[];
      this.state.activity_logs = logs.rows as any[];
      this.state.security_events = events.rows as any[];
      this.state.backup_history = backups.rows as any[];
      this.state.settings = {};
      for (const row of settings.rows as any[]) {
        this.state.settings[row.setting_key] = row.setting_value;
      }

      const maxId = (arr: any[]) => arr.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0) + 1;
      this.state.nextIds = {
        login: maxId(this.state.login_history),
        device: maxId(this.state.device_history),
        session: maxId(this.state.sessions),
        activity: maxId(this.state.activity_logs),
        event: maxId(this.state.security_events),
        backup: maxId(this.state.backup_history),
      };
      return true;
    } catch (err: any) {
      console.warn('[SecurityStore] PostgreSQL hydrate note:', err?.message || err);
      return false;
    }
  }

  private loadState(): SecurityStateFile {
    if (process.env.DISABLE_PG_FOR_TESTS === 'true' && this.testStateFilePath) {
      try {
        if (fs.existsSync(this.testStateFilePath)) {
          const raw = fs.readFileSync(this.testStateFilePath, 'utf8');
          const parsed = JSON.parse(raw);
          return {
            nextIds: { ...DEFAULT_STATE.nextIds, ...(parsed.nextIds || {}) },
            login_history: Array.isArray(parsed.login_history) ? parsed.login_history : [],
            device_history: Array.isArray(parsed.device_history) ? parsed.device_history : [],
            sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
            activity_logs: Array.isArray(parsed.activity_logs) ? parsed.activity_logs : [],
            security_events: Array.isArray(parsed.security_events) ? parsed.security_events : [],
            backup_history: Array.isArray(parsed.backup_history) ? parsed.backup_history : [],
            settings: parsed.settings || {},
            mfa_users: parsed.mfa_users || {},
          };
        }
      } catch {
        // Fresh test state
      }
    }
    return JSON.parse(JSON.stringify(DEFAULT_STATE));
  }

  private saveState(): void {
    // Production/development persistence is strictly PostgreSQL-only.
    // Only test isolation harness writes to explicit tmp test path when DISABLE_PG_FOR_TESTS=true.
    if (process.env.DISABLE_PG_FOR_TESTS === 'true' && this.testStateFilePath) {
      try {
        const dir = path.dirname(this.testStateFilePath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        const tmpPath = `${this.testStateFilePath}.${process.pid}.tmp`;
        fs.writeFileSync(tmpPath, JSON.stringify(this.state, null, 2), { encoding: 'utf8', mode: 0o600 });
        fs.renameSync(tmpPath, this.testStateFilePath);
      } catch {
        // Ignore test cleanup races
      }
    }
  }

  private async getPgPool(): Promise<pg.Pool | null> {
    if (!process.env.DATABASE_URL || process.env.DISABLE_PG_FOR_TESTS === 'true') {
      return null;
    }
    const now = Date.now();
    if (this.pgPool && now - this.pgCheckedAt < 15000) {
      return this.pgAvailable ? this.pgPool : null;
    }
    this.pgCheckedAt = now;
    try {
      if (!this.pgPool) {
        this.pgPool = new pg.Pool({
          connectionString: process.env.DATABASE_URL,
          max: Math.min(10, parseInt(process.env.PG_POOL_MAX || '10', 10) || 10),
          connectionTimeoutMillis: parseInt(process.env.PG_CONNECTION_TIMEOUT_MS || '2500', 10) || 2500,
          idleTimeoutMillis: parseInt(process.env.PG_IDLE_TIMEOUT_MS || '30000', 10) || 30000,
        });
        this.pgPool.on('error', () => {
          this.pgAvailable = false;
        });
      }
      const client = await this.pgPool.connect();
      client.release();
      this.pgAvailable = true;
      return this.pgPool;
    } catch {
      this.pgAvailable = false;
      return null;
    }
  }

  public async close(): Promise<void> {
    if (this.pgPool) {
      const closing = this.pgPool;
      this.pgPool = null;
      this.pgAvailable = false;
      try {
        await closing.end();
      } catch {
        // Ignore shutdown errors
      }
    }
  }

  private async mirrorPg(sql: string, params: any[]): Promise<void> {
    const pool = await this.getPgPool();
    if (!pool) return;
    try {
      await pool.query(sql, params);
    } catch {
      // Non-fatal mirror warning when PG schema or FK is absent
    }
  }

  // ============================================================================
  // 1. LOGIN HISTORY
  // ============================================================================
  public async recordLoginEvent(input: Omit<LoginHistoryRecord, 'id' | 'created_at'>): Promise<LoginHistoryRecord> {
    const now = new Date().toISOString();
    const record: LoginHistoryRecord = {
      ...input,
      id: this.state.nextIds.login++,
      created_at: now,
    };
    this.state.login_history.unshift(record);
    if (this.state.login_history.length > 5000) {
      this.state.login_history.length = 5000;
    }
    this.saveState();

    await this.mirrorPg(
      `INSERT INTO user_login_history (
        user_id, username, email, user_role, session_id, event_type, login_status, failure_reason,
        ip_address, device_id, device_name, device_type, os_name, os_version, browser_name, browser_version,
        user_agent, client_source, verified_machine_name, is_new_device, is_suspicious, login_at, logout_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)`,
      [
        record.user_id, record.username, record.email, record.user_role, record.session_id,
        record.event_type, record.login_status, record.failure_reason, record.ip_address,
        record.device_id, record.device_name, record.device_type, record.os_name, record.os_version,
        record.browser_name, record.browser_version, record.user_agent, record.client_source,
        record.verified_machine_name, record.is_new_device, record.is_suspicious, record.login_at, record.logout_at,
      ]
    );
    return record;
  }

  public async markLoginLogout(sessionId: string): Promise<void> {
    const now = new Date().toISOString();
    const rec = this.state.login_history.find(l => l.session_id === sessionId && !l.logout_at);
    if (rec) {
      rec.logout_at = now;
      this.saveState();
    }
    await this.mirrorPg('UPDATE user_login_history SET logout_at = $1 WHERE session_id = $2 AND logout_at IS NULL', [now, sessionId]);
  }

  public getLoginHistory(filters: {
    search?: string;
    user_id?: number;
    status?: string;
    date_from?: string;
    date_to?: string;
    page?: number | string;
    limit?: number | string;
  }) {
    const { page, limit, offset } = resolveSafePagination(filters.page, filters.limit, 25, 200);
    let rows = [...this.state.login_history];

    if (filters.user_id) {
      rows = rows.filter(r => r.user_id === Number(filters.user_id));
    }
    if (filters.status && filters.status !== 'all') {
      rows = rows.filter(r => r.login_status === filters.status.toUpperCase());
    }
    if (filters.date_from) {
      const fromTs = new Date(filters.date_from).getTime();
      if (!Number.isNaN(fromTs)) rows = rows.filter(r => new Date(r.login_at).getTime() >= fromTs);
    }
    if (filters.date_to) {
      const toTs = new Date(`${filters.date_to.slice(0, 10)}T23:59:59.999Z`).getTime();
      if (!Number.isNaN(toTs)) rows = rows.filter(r => new Date(r.login_at).getTime() <= toTs);
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      rows = rows.filter(r =>
        (r.email || '').toLowerCase().includes(q) ||
        (r.username || '').toLowerCase().includes(q) ||
        (r.ip_address || '').toLowerCase().includes(q) ||
        (r.device_name || '').toLowerCase().includes(q) ||
        (r.browser_name || '').toLowerCase().includes(q) ||
        (r.os_name || '').toLowerCase().includes(q)
      );
    }

    const total = rows.length;
    return {
      items: rows.slice(offset, offset + limit),
      total,
      page,
      limit,
      total_pages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  // ============================================================================
  // 2. DEVICE HISTORY
  // ============================================================================
  public async upsertDevice(params: {
    user_id: number;
    username?: string;
    user_email?: string;
    device_id: string;
    device_name: string;
    device_type: string;
    os_name: string;
    os_version: string;
    browser_name: string;
    browser_version: string;
    user_agent: string;
    client_source: 'browser_reported' | 'verified_agent';
    verified_machine_name: string | null;
    ip_address: string;
  }): Promise<{ device: DeviceHistoryRecord; isNewDevice: boolean; ipChanged: boolean; isBlocked: boolean }> {
    const now = new Date().toISOString();
    let existing = this.state.device_history.find(
      d => d.user_id === params.user_id && d.device_id === params.device_id
    );

    if (existing) {
      const ipChanged = Boolean(existing.last_ip_address && existing.last_ip_address !== params.ip_address);
      const isBlocked = existing.trust_status === 'blocked' || existing.trust_status === 'revoked';
      if (!isBlocked) {
        existing.device_name = params.device_name;
        existing.device_type = params.device_type;
        existing.os_name = params.os_name;
        existing.os_version = params.os_version;
        existing.browser_name = params.browser_name;
        existing.browser_version = params.browser_version;
        existing.user_agent = params.user_agent;
        existing.client_source = params.client_source;
        existing.verified_machine_name = params.verified_machine_name;
        existing.last_ip_address = params.ip_address;
        existing.last_login_at = now;
        existing.login_count += 1;
        existing.updated_at = now;
        if (existing.trust_status === 'new') existing.trust_status = 'trusted';
        this.saveState();

        await this.mirrorPg(
          `UPDATE user_device_history
           SET device_name=$1, device_type=$2, os_name=$3, os_version=$4, browser_name=$5, browser_version=$6,
               user_agent=$7, client_source=$8, verified_machine_name=$9, last_ip_address=$10,
               last_login_at=$11, login_count=login_count+1, updated_at=$11
           WHERE user_id=$12 AND device_id=$13`,
          [
            params.device_name, params.device_type, params.os_name, params.os_version,
            params.browser_name, params.browser_version, params.user_agent, params.client_source,
            params.verified_machine_name, params.ip_address, now, params.user_id, params.device_id,
          ]
        );
      }
      return { device: existing, isNewDevice: false, ipChanged, isBlocked };
    }

    const userHadPriorDevices = this.state.device_history.some(d => d.user_id === params.user_id);
    const created: DeviceHistoryRecord = {
      id: this.state.nextIds.device++,
      user_id: params.user_id,
      username: params.username,
      user_email: params.user_email,
      device_id: params.device_id,
      device_name: params.device_name,
      device_type: params.device_type,
      os_name: params.os_name,
      os_version: params.os_version,
      browser_name: params.browser_name,
      browser_version: params.browser_version,
      user_agent: params.user_agent,
      client_source: params.client_source,
      verified_machine_name: params.verified_machine_name,
      first_ip_address: params.ip_address,
      last_ip_address: params.ip_address,
      first_login_at: now,
      last_login_at: now,
      login_count: 1,
      trust_status: userHadPriorDevices ? 'new' : 'trusted',
      blocked_at: null,
      blocked_by: null,
      block_reason: null,
      created_at: now,
      updated_at: now,
    };

    this.state.device_history.unshift(created);
    this.saveState();

    await this.mirrorPg(
      `INSERT INTO user_device_history (
        user_id, device_id, device_name, device_type, os_name, os_version, browser_name, browser_version,
        user_agent, client_source, verified_machine_name, first_ip_address, last_ip_address,
        first_login_at, last_login_at, login_count, trust_status
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12,$13,$13,1,$14)
      ON CONFLICT (user_id, device_id) DO UPDATE SET last_login_at = EXCLUDED.last_login_at`,
      [
        created.user_id, created.device_id, created.device_name, created.device_type,
        created.os_name, created.os_version, created.browser_name, created.browser_version,
        created.user_agent, created.client_source, created.verified_machine_name,
        created.first_ip_address, now, created.trust_status,
      ]
    );

    return { device: created, isNewDevice: userHadPriorDevices, ipChanged: false, isBlocked: false };
  }

  public isDeviceBlocked(userId: number, deviceId: string): boolean {
    const d = this.state.device_history.find(x => x.user_id === userId && x.device_id === deviceId);
    return Boolean(d && (d.trust_status === 'blocked' || d.trust_status === 'revoked'));
  }

  public async setDeviceStatus(
    deviceRecordId: number,
    status: 'trusted' | 'blocked' | 'revoked',
    actorUserId: number,
    reason?: string
  ): Promise<DeviceHistoryRecord | null> {
    const dev = this.state.device_history.find(d => d.id === deviceRecordId);
    if (!dev) return null;
    const now = new Date().toISOString();
    dev.trust_status = status;
    dev.updated_at = now;
    if (status === 'blocked' || status === 'revoked') {
      dev.blocked_at = now;
      dev.blocked_by = actorUserId;
      dev.block_reason = reason || `Marked ${status} by administrator`;
      // Immediately revoke all active sessions bound to this device
      await this.revokeSessionsByDevice(dev.user_id, dev.device_id, actorUserId, `Device ${status}`);
    } else {
      dev.blocked_at = null;
      dev.blocked_by = null;
      dev.block_reason = null;
    }
    this.saveState();

    await this.mirrorPg(
      `UPDATE user_device_history SET trust_status=$1, blocked_at=$2, blocked_by=$3, block_reason=$4, updated_at=$5
       WHERE user_id=$6 AND device_id=$7`,
      [dev.trust_status, dev.blocked_at, dev.blocked_by, dev.block_reason, now, dev.user_id, dev.device_id]
    );
    return dev;
  }

  public getDevices(filters: { search?: string; user_id?: number; status?: string; page?: number | string; limit?: number | string }) {
    const { page, limit, offset } = resolveSafePagination(filters.page, filters.limit, 25, 200);
    let rows = [...this.state.device_history];
    if (filters.user_id) rows = rows.filter(d => d.user_id === Number(filters.user_id));
    if (filters.status && filters.status !== 'all') rows = rows.filter(d => d.trust_status === filters.status);
    if (filters.search) {
      const q = filters.search.toLowerCase();
      rows = rows.filter(d =>
        (d.device_name || '').toLowerCase().includes(q) ||
        (d.device_id || '').toLowerCase().includes(q) ||
        (d.user_email || '').toLowerCase().includes(q) ||
        (d.username || '').toLowerCase().includes(q) ||
        (d.last_ip_address || '').toLowerCase().includes(q) ||
        (d.os_name || '').toLowerCase().includes(q) ||
        (d.browser_name || '').toLowerCase().includes(q)
      );
    }
    const total = rows.length;
    return {
      items: rows.slice(offset, offset + limit),
      total,
      page,
      limit,
      total_pages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  // ============================================================================
  // 3. USER SESSIONS (Server-side tracking, refresh rotation, revocation)
  // ============================================================================
  public async createSession(params: {
    user_id: number;
    username?: string;
    user_email?: string;
    user_role?: string;
    access_jti: string;
    refresh_token_hash: string;
    device_id: string;
    device_name: string;
    device_type: string;
    os_name: string;
    browser_name: string;
    ip_address: string;
    user_agent: string;
    client_source: 'browser_reported' | 'verified_agent';
    expires_at: string;
    refresh_expires_at: string;
  }): Promise<SecuritySessionRecord> {
    const now = new Date().toISOString();
    const session: SecuritySessionRecord = {
      id: this.state.nextIds.session++,
      session_id: `sess_${crypto.randomBytes(16).toString('hex')}`,
      user_id: params.user_id,
      username: params.username || null,
      user_email: params.user_email || null,
      user_role: params.user_role || null,
      access_jti: params.access_jti,
      refresh_token_hash: params.refresh_token_hash,
      previous_refresh_hash: null,
      device_id: params.device_id,
      device_name: params.device_name,
      device_type: params.device_type,
      os_name: params.os_name,
      browser_name: params.browser_name,
      ip_address: params.ip_address,
      user_agent: params.user_agent,
      client_source: params.client_source,
      status: 'active',
      created_at: now,
      last_activity_at: now,
      expires_at: params.expires_at,
      refresh_expires_at: params.refresh_expires_at,
      revoked_at: null,
      revoked_by: null,
      revoke_reason: null,
    };

    this.state.sessions.unshift(session);
    if (this.state.sessions.length > 3000) {
      this.state.sessions.length = 3000;
    }
    this.saveState();

    await this.mirrorPg(
      `INSERT INTO user_sessions (
        session_id, user_id, username, user_email, user_role, access_jti, refresh_token_hash,
        device_id, device_name, device_type, os_name, browser_name, ip_address, user_agent,
        client_source, status, expires_at, refresh_expires_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'active',$16,$17)`,
      [
        session.session_id, session.user_id, session.username, session.user_email, session.user_role,
        session.access_jti, session.refresh_token_hash, session.device_id, session.device_name,
        session.device_type, session.os_name, session.browser_name, session.ip_address,
        session.user_agent, session.client_source, session.expires_at, session.refresh_expires_at,
      ]
    );
    return session;
  }

  public getSessionByJti(jti: string): SecuritySessionRecord | null {
    return this.state.sessions.find(s => s.access_jti === jti) || null;
  }

  public getSessionById(sessionId: string): SecuritySessionRecord | null {
    return this.state.sessions.find(s => s.session_id === sessionId) || null;
  }

  public isSessionActive(jti: string): { active: boolean; reason?: string; session?: SecuritySessionRecord } {
    const sess = this.getSessionByJti(jti);
    if (!sess) {
      // Allow pre-existing legacy sessions created before security_state existed unless explicitly revoked in store
      return { active: true };
    }
    if (sess.status !== 'active') {
      return { active: false, reason: `Session is ${sess.status}`, session: sess };
    }
    const nowMs = Date.now();
    if (new Date(sess.expires_at).getTime() <= nowMs) {
      sess.status = 'expired';
      this.saveState();
      return { active: false, reason: 'Session expired', session: sess };
    }
    // Check idle timeout
    const idleMs = securityConfig.sessionIdleTimeoutMinutes * 60 * 1000;
    if (nowMs - new Date(sess.last_activity_at).getTime() > idleMs) {
      sess.status = 'expired';
      sess.revoke_reason = 'Idle timeout exceeded';
      this.saveState();
      return { active: false, reason: 'Session timed out due to inactivity', session: sess };
    }
    if (sess.device_id && this.isDeviceBlocked(sess.user_id, sess.device_id)) {
      sess.status = 'revoked';
      sess.revoke_reason = 'Device blocked';
      this.saveState();
      return { active: false, reason: 'Device has been blocked by administrator', session: sess };
    }
    return { active: true, session: sess };
  }

  public touchSessionActivity(jti: string): void {
    const sess = this.getSessionByJti(jti);
    if (!sess || sess.status !== 'active') return;
    const now = Date.now();
    // Throttle disk writes to at most once every 30 seconds per session
    if (now - new Date(sess.last_activity_at).getTime() > 30000) {
      sess.last_activity_at = new Date(now).toISOString();
      this.saveState();
    }
  }

  public async rotateRefreshToken(params: {
    refreshTokenHash: string;
    newAccessJti: string;
    newRefreshTokenHash: string;
    newExpiresAt: string;
    newRefreshExpiresAt: string;
  }): Promise<{ ok: true; session: SecuritySessionRecord } | { ok: false; compromised?: boolean; userId?: number; reason: string }> {
    const nowMs = Date.now();

    // Detect refresh token REUSE (already rotated -> possible token theft!)
    const reused = this.state.sessions.find(s => s.previous_refresh_hash === params.refreshTokenHash);
    if (reused) {
      await this.revokeAllUserSessions(reused.user_id, null, 'Refresh token reuse detected (potential compromise)');
      return {
        ok: false,
        compromised: true,
        userId: reused.user_id,
        reason: 'Refresh token reuse detected. All active sessions for this user have been terminated for security.',
      };
    }

    const sess = this.state.sessions.find(s => s.refresh_token_hash === params.refreshTokenHash);
    if (!sess) {
      return { ok: false, reason: 'Invalid refresh token.' };
    }
    if (sess.status !== 'active') {
      return { ok: false, reason: `Session is no longer active (${sess.status}).` };
    }
    if (sess.refresh_expires_at && new Date(sess.refresh_expires_at).getTime() <= nowMs) {
      sess.status = 'expired';
      this.saveState();
      return { ok: false, reason: 'Refresh token expired. Please sign in again.' };
    }
    if (sess.device_id && this.isDeviceBlocked(sess.user_id, sess.device_id)) {
      sess.status = 'revoked';
      sess.revoke_reason = 'Device blocked';
      this.saveState();
      return { ok: false, reason: 'Device has been blocked.' };
    }

    sess.previous_refresh_hash = sess.refresh_token_hash;
    sess.refresh_token_hash = params.newRefreshTokenHash;
    sess.access_jti = params.newAccessJti;
    sess.expires_at = params.newExpiresAt;
    sess.refresh_expires_at = params.newRefreshExpiresAt;
    sess.last_activity_at = new Date(nowMs).toISOString();
    this.saveState();

    await this.mirrorPg(
      `UPDATE user_sessions
       SET previous_refresh_hash=$1, refresh_token_hash=$2, access_jti=$3, expires_at=$4,
           refresh_expires_at=$5, last_activity_at=$6
       WHERE session_id=$7`,
      [
        sess.previous_refresh_hash, sess.refresh_token_hash, sess.access_jti,
        sess.expires_at, sess.refresh_expires_at, sess.last_activity_at, sess.session_id,
      ]
    );
    return { ok: true, session: sess };
  }

  public async revokeSessionById(
    sessionIdOrNumericId: string | number,
    actorUserId: number | null,
    reason = 'Revoked by administrator',
    newStatus: 'revoked' | 'logged_out' = 'revoked'
  ): Promise<SecuritySessionRecord | null> {
    const sess = this.state.sessions.find(
      s => s.session_id === String(sessionIdOrNumericId) || s.id === Number(sessionIdOrNumericId) || s.access_jti === String(sessionIdOrNumericId)
    );
    if (!sess) return null;
    const now = new Date().toISOString();
    sess.status = newStatus;
    sess.revoked_at = now;
    sess.revoked_by = actorUserId;
    sess.revoke_reason = reason;
    this.saveState();

    await this.mirrorPg(
      'UPDATE user_sessions SET status=$1, revoked_at=$2, revoked_by=$3, revoke_reason=$4 WHERE session_id=$5',
      [newStatus, now, actorUserId, reason, sess.session_id]
    );
    return sess;
  }

  public async revokeAllUserSessions(
    userId: number,
    actorUserId: number | null,
    reason = 'All sessions revoked',
    exceptJti?: string
  ): Promise<string[]> {
    const now = new Date().toISOString();
    const revokedJtis: string[] = [];
    for (const s of this.state.sessions) {
      if (s.user_id === userId && s.status === 'active' && s.access_jti !== exceptJti) {
        s.status = 'revoked';
        s.revoked_at = now;
        s.revoked_by = actorUserId;
        s.revoke_reason = reason;
        revokedJtis.push(s.access_jti);
      }
    }
    this.saveState();

    await this.mirrorPg(
      exceptJti
        ? 'UPDATE user_sessions SET status=\'revoked\', revoked_at=$1, revoked_by=$2, revoke_reason=$3 WHERE user_id=$4 AND status=\'active\' AND access_jti <> $5'
        : 'UPDATE user_sessions SET status=\'revoked\', revoked_at=$1, revoked_by=$2, revoke_reason=$3 WHERE user_id=$4 AND status=\'active\'',
      exceptJti ? [now, actorUserId, reason, userId, exceptJti] : [now, actorUserId, reason, userId]
    );
    return revokedJtis;
  }

  public async revokeSessionsByDevice(
    userId: number,
    deviceId: string,
    actorUserId: number | null,
    reason = 'Device revoked'
  ): Promise<string[]> {
    const now = new Date().toISOString();
    const revokedJtis: string[] = [];
    for (const s of this.state.sessions) {
      if (s.user_id === userId && s.device_id === deviceId && s.status === 'active') {
        s.status = 'revoked';
        s.revoked_at = now;
        s.revoked_by = actorUserId;
        s.revoke_reason = reason;
        revokedJtis.push(s.access_jti);
      }
    }
    this.saveState();
    await this.mirrorPg(
      'UPDATE user_sessions SET status=\'revoked\', revoked_at=$1, revoked_by=$2, revoke_reason=$3 WHERE user_id=$4 AND device_id=$5 AND status=\'active\'',
      [now, actorUserId, reason, userId, deviceId]
    );
    return revokedJtis;
  }

  public getSessions(filters: { search?: string; status?: string; user_id?: number; page?: number | string; limit?: number | string }) {
    const nowMs = Date.now();
    // Auto-mark expired sessions cleanly
    let mutated = false;
    for (const s of this.state.sessions) {
      if (s.status === 'active' && new Date(s.expires_at).getTime() <= nowMs) {
        s.status = 'expired';
        mutated = true;
      }
    }
    if (mutated) this.saveState();

    const { page, limit, offset } = resolveSafePagination(filters.page, filters.limit, 25, 200);
    let rows = [...this.state.sessions];
    if (filters.user_id) rows = rows.filter(s => s.user_id === Number(filters.user_id));
    if (filters.status && filters.status !== 'all') rows = rows.filter(s => s.status === filters.status);
    if (filters.search) {
      const q = filters.search.toLowerCase();
      rows = rows.filter(s =>
        (s.user_email || '').toLowerCase().includes(q) ||
        (s.username || '').toLowerCase().includes(q) ||
        (s.ip_address || '').toLowerCase().includes(q) ||
        (s.device_name || '').toLowerCase().includes(q)
      );
    }

    // Never expose token hashes to API callers
    const safeRows = rows.slice(offset, offset + limit).map(({ refresh_token_hash, previous_refresh_hash, ...safe }) => safe);
    const total = rows.length;
    return {
      items: safeRows,
      total,
      page,
      limit,
      total_pages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  // ============================================================================
  // 4. ACTIVITY LOGS (Append-only with hash chain)
  // ============================================================================
  public getLatestActivityHash(): string {
    if (this.state.activity_logs.length === 0) {
      return 'GENESIS_NEXORA_AUDIT_CHAIN_V1';
    }
    return this.state.activity_logs[0].entry_hash;
  }

  public async appendActivityLog(entry: Omit<ActivityLogRecord, 'id'>): Promise<ActivityLogRecord> {
    const rec: ActivityLogRecord = {
      ...entry,
      id: this.state.nextIds.activity++,
    };
    this.state.activity_logs.unshift(rec);
    if (this.state.activity_logs.length > 10000) {
      this.state.activity_logs.length = 10000;
    }
    this.saveState();

    await this.mirrorPg(
      `INSERT INTO user_activity_logs (
        user_id, username, user_email, user_role, module_name, action_type, entity_type, entity_id,
        http_method, api_endpoint, ip_address, device_id, device_name, browser_name, os_name,
        session_id, status, response_status_code, description, before_values, after_values, metadata,
        prev_hash, entry_hash, hmac_signature, created_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)`,
      [
        rec.user_id, rec.username, rec.user_email, rec.user_role, rec.module_name, rec.action_type,
        rec.entity_type, rec.entity_id, rec.http_method, rec.api_endpoint, rec.ip_address,
        rec.device_id, rec.device_name, rec.browser_name, rec.os_name, rec.session_id,
        rec.status, rec.response_status_code, rec.description,
        rec.before_values ? JSON.stringify(rec.before_values) : null,
        rec.after_values ? JSON.stringify(rec.after_values) : null,
        rec.metadata ? JSON.stringify(rec.metadata) : null,
        rec.prev_hash, rec.entry_hash, rec.hmac_signature, rec.created_at,
      ]
    );
    return rec;
  }

  public getAllActivityLogsChronological(): ActivityLogRecord[] {
    return [...this.state.activity_logs].reverse();
  }

  public getActivityLogs(filters: {
    search?: string;
    user_id?: number;
    module?: string;
    action?: string;
    status?: string;
    date_from?: string;
    date_to?: string;
    page?: number | string;
    limit?: number | string;
  }) {
    const { page, limit, offset } = resolveSafePagination(filters.page, filters.limit, 25, 200);
    let rows = [...this.state.activity_logs];

    if (filters.user_id) rows = rows.filter(r => r.user_id === Number(filters.user_id));
    if (filters.module && filters.module !== 'all') {
      const m = filters.module.toLowerCase();
      rows = rows.filter(r => r.module_name.toLowerCase() === m);
    }
    if (filters.action && filters.action !== 'all') {
      const a = filters.action.toLowerCase();
      rows = rows.filter(r => r.action_type.toLowerCase().includes(a));
    }
    if (filters.status && filters.status !== 'all') {
      rows = rows.filter(r => r.status === filters.status.toUpperCase());
    }
    if (filters.date_from) {
      const fromTs = new Date(filters.date_from).getTime();
      if (!Number.isNaN(fromTs)) rows = rows.filter(r => new Date(r.created_at).getTime() >= fromTs);
    }
    if (filters.date_to) {
      const toTs = new Date(`${filters.date_to.slice(0, 10)}T23:59:59.999Z`).getTime();
      if (!Number.isNaN(toTs)) rows = rows.filter(r => new Date(r.created_at).getTime() <= toTs);
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      rows = rows.filter(r =>
        (r.user_email || '').toLowerCase().includes(q) ||
        (r.username || '').toLowerCase().includes(q) ||
        (r.module_name || '').toLowerCase().includes(q) ||
        (r.action_type || '').toLowerCase().includes(q) ||
        (r.description || '').toLowerCase().includes(q) ||
        (r.api_endpoint || '').toLowerCase().includes(q) ||
        (r.entity_id || '').toLowerCase().includes(q) ||
        (r.ip_address || '').toLowerCase().includes(q)
      );
    }

    const total = rows.length;
    return {
      items: rows.slice(offset, offset + limit),
      total,
      page,
      limit,
      total_pages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  public async purgeExpiredAuditLogs(retentionDays: number): Promise<number> {
    const cutoff = Date.now() - retentionDays * 86400 * 1000;
    const beforeCount = this.state.activity_logs.length;
    this.state.activity_logs = this.state.activity_logs.filter(r => new Date(r.created_at).getTime() >= cutoff);
    const removed = beforeCount - this.state.activity_logs.length;
    if (removed > 0) this.saveState();

    const pool = await this.getPgPool();
    if (pool) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query("SELECT set_config('nexora.allow_audit_retention_purge', 'on', true)");
        await client.query('DELETE FROM user_activity_logs WHERE created_at < NOW() - ($1::int || \' days\')::interval', [retentionDays]);
        await client.query('COMMIT');
      } catch {
        await client.query('ROLLBACK').catch(() => {});
      } finally {
        client.release();
      }
    }
    return removed;
  }

  // ============================================================================
  // 5. SECURITY EVENTS
  // ============================================================================
  public async recordSecurityEvent(input: Omit<SecurityEventRecord, 'id' | 'created_at' | 'is_resolved' | 'resolved_at' | 'resolved_by' | 'resolution_notes'>): Promise<SecurityEventRecord> {
    const now = new Date().toISOString();
    const rec: SecurityEventRecord = {
      ...input,
      details: input.details ? redactSensitiveData(input.details) : null,
      id: this.state.nextIds.event++,
      is_resolved: false,
      resolved_at: null,
      resolved_by: null,
      resolution_notes: null,
      created_at: now,
    };
    this.state.security_events.unshift(rec);
    if (this.state.security_events.length > 5000) {
      this.state.security_events.length = 5000;
    }
    this.saveState();

    await this.mirrorPg(
      `INSERT INTO security_events (
        event_code, title, severity, user_id, username, user_email, ip_address, device_id,
        device_name, endpoint, description, details, alert_email_sent, alert_sent_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        rec.event_code, rec.title, rec.severity, rec.user_id, rec.username, rec.user_email,
        rec.ip_address, rec.device_id, rec.device_name, rec.endpoint, rec.description,
        rec.details ? JSON.stringify(rec.details) : null, rec.alert_email_sent, rec.alert_sent_at,
      ]
    );
    return rec;
  }

  public async resolveSecurityEvent(id: number, actorUserId: number, notes: string): Promise<SecurityEventRecord | null> {
    const ev = this.state.security_events.find(e => e.id === id);
    if (!ev) return null;
    const now = new Date().toISOString();
    ev.is_resolved = true;
    ev.resolved_at = now;
    ev.resolved_by = actorUserId;
    ev.resolution_notes = notes || 'Reviewed and resolved by administrator';
    this.saveState();
    await this.mirrorPg(
      'UPDATE security_events SET is_resolved=TRUE, resolved_at=$1, resolved_by=$2, resolution_notes=$3 WHERE id=$4',
      [now, actorUserId, ev.resolution_notes, id]
    );
    return ev;
  }

  public getSecurityEvents(filters: {
    search?: string;
    severity?: string;
    resolved?: string;
    date_from?: string;
    date_to?: string;
    page?: number | string;
    limit?: number | string;
  }) {
    const { page, limit, offset } = resolveSafePagination(filters.page, filters.limit, 25, 200);
    let rows = [...this.state.security_events];

    if (filters.severity && filters.severity !== 'all') {
      rows = rows.filter(r => r.severity === filters.severity.toUpperCase());
    }
    if (filters.resolved === 'true') rows = rows.filter(r => r.is_resolved);
    if (filters.resolved === 'false') rows = rows.filter(r => !r.is_resolved);
    if (filters.date_from) {
      const fromTs = new Date(filters.date_from).getTime();
      if (!Number.isNaN(fromTs)) rows = rows.filter(r => new Date(r.created_at).getTime() >= fromTs);
    }
    if (filters.date_to) {
      const toTs = new Date(`${filters.date_to.slice(0, 10)}T23:59:59.999Z`).getTime();
      if (!Number.isNaN(toTs)) rows = rows.filter(r => new Date(r.created_at).getTime() <= toTs);
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      rows = rows.filter(r =>
        r.title.toLowerCase().includes(q) ||
        r.event_code.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        (r.user_email || '').toLowerCase().includes(q) ||
        (r.ip_address || '').toLowerCase().includes(q)
      );
    }

    const total = rows.length;
    return {
      items: rows.slice(offset, offset + limit),
      total,
      page,
      limit,
      total_pages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  // ============================================================================
  // 6. BACKUP HISTORY
  // ============================================================================
  public async createBackupRecord(input: Omit<BackupHistoryRecord, 'id' | 'created_at'>): Promise<BackupHistoryRecord> {
    const now = new Date().toISOString();
    const rec: BackupHistoryRecord = {
      ...input,
      id: this.state.nextIds.backup++,
      created_at: now,
    };
    this.state.backup_history.unshift(rec);
    this.saveState();

    await this.mirrorPg(
      `INSERT INTO database_backup_history (
        backup_uid, file_name, storage_path, offsite_path, trigger_type, status, pg_status, pg_engine,
        json_store_status, file_size_bytes, checksum_sha256, encrypted, encryption_algorithm,
        compression_algorithm, started_at, completed_at, duration_ms, retention_until,
        initiated_by, initiated_by_email, error_message, metadata
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`,
      [
        rec.backup_uid, rec.file_name, rec.storage_path, rec.offsite_path, rec.trigger_type,
        rec.status, rec.pg_status, rec.pg_engine, rec.json_store_status, rec.file_size_bytes,
        rec.checksum_sha256, rec.encrypted, rec.encryption_algorithm, rec.compression_algorithm,
        rec.started_at, rec.completed_at, rec.duration_ms, rec.retention_until,
        rec.initiated_by, rec.initiated_by_email, rec.error_message,
        rec.metadata ? JSON.stringify(rec.metadata) : null,
      ]
    );
    return rec;
  }

  public async updateBackupRecord(backupUid: string, patch: Partial<BackupHistoryRecord>): Promise<BackupHistoryRecord | null> {
    const rec = this.state.backup_history.find(b => b.backup_uid === backupUid);
    if (!rec) return null;
    Object.assign(rec, patch);
    this.saveState();

    await this.mirrorPg(
      `UPDATE database_backup_history
       SET status=$1, pg_status=$2, pg_engine=$3, json_store_status=$4, file_size_bytes=$5,
           checksum_sha256=$6, completed_at=$7, duration_ms=$8, verified_at=$9, verified_by=$10,
           verification_status=$11, offsite_path=$12, error_message=$13, metadata=$14
       WHERE backup_uid=$15`,
      [
        rec.status, rec.pg_status, rec.pg_engine, rec.json_store_status, rec.file_size_bytes,
        rec.checksum_sha256, rec.completed_at, rec.duration_ms, rec.verified_at, rec.verified_by,
        rec.verification_status, rec.offsite_path, rec.error_message,
        rec.metadata ? JSON.stringify(rec.metadata) : null, backupUid,
      ]
    );
    return rec;
  }

  public getBackupByUidOrId(idOrUid: string | number): BackupHistoryRecord | null {
    return this.state.backup_history.find(
      b => b.backup_uid === String(idOrUid) || b.id === Number(idOrUid)
    ) || null;
  }

  public getBackupHistory(filters: { status?: string; trigger_type?: string; page?: number | string; limit?: number | string } = {}) {
    const { page, limit, offset } = resolveSafePagination(filters.page, filters.limit, 25, 200);
    let rows = [...this.state.backup_history];
    if (filters.status && filters.status !== 'all') rows = rows.filter(b => b.status === filters.status);
    if (filters.trigger_type && filters.trigger_type !== 'all') rows = rows.filter(b => b.trigger_type === filters.trigger_type);
    const total = rows.length;
    return {
      items: rows.slice(offset, offset + limit),
      total,
      page,
      limit,
      total_pages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  // ============================================================================
  // 7. MFA & SECURITY SETTINGS
  // ============================================================================
  public getUserMfa(userId: number): UserMfaState | null {
    return this.state.mfa_users[String(userId)] || null;
  }

  public async saveUserMfa(mfa: UserMfaState): Promise<void> {
    this.state.mfa_users[String(mfa.user_id)] = mfa;
    this.saveState();
    await this.mirrorPg(
      'UPDATE users SET mfa_enabled=$1, mfa_secret_encrypted=$2, mfa_recovery_codes=$3 WHERE id=$4',
      [mfa.enabled, mfa.secret_encrypted, JSON.stringify(mfa.recovery_code_hashes), mfa.user_id]
    );
  }

  public getSetting(key: string): any {
    return this.state.settings[key]?.value ?? null;
  }

  public async setSetting(key: string, value: any, description?: string, updatedBy?: number | null): Promise<void> {
    const now = new Date().toISOString();
    this.state.settings[key] = { value, description, updated_by: updatedBy ?? null, updated_at: now };
    this.saveState();
    await this.mirrorPg(
      `INSERT INTO security_settings (setting_key, setting_value, description, updated_by, updated_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (setting_key) DO UPDATE SET setting_value=$2, description=$3, updated_by=$4, updated_at=$5`,
      [key, JSON.stringify(value), description || null, updatedBy ?? null, now]
    );
  }

  // ============================================================================
  // 8. SECURITY CENTER DASHBOARD OVERVIEW METRICS
  // ============================================================================
  public getOverviewMetrics() {
    const now = Date.now();
    // Compute start of today in Asia/Kolkata (+05:30)
    const kolkataDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: securityConfig.appTimezone }).format(new Date(now));
    const todayStartMs = new Date(`${kolkataDateStr}T00:00:00+05:30`).getTime();

    const activeSessions = this.state.sessions.filter(
      s => s.status === 'active' && new Date(s.expires_at).getTime() > now
    );
    const uniqueActiveUsers = new Set(activeSessions.map(s => s.user_id)).size;

    const todayLogins = this.state.login_history.filter(
      l => l.login_status === 'SUCCESS' && new Date(l.login_at).getTime() >= todayStartMs
    ).length;

    const todayFailedLogins = this.state.login_history.filter(
      l => l.login_status !== 'SUCCESS' && l.login_status !== 'LOGGED_OUT' && new Date(l.login_at).getTime() >= todayStartMs
    ).length;

    const totalFailedLogins24h = this.state.login_history.filter(
      l => l.login_status !== 'SUCCESS' && l.login_status !== 'LOGGED_OUT' && now - new Date(l.login_at).getTime() <= 86400 * 1000
    ).length;

    const todayActivities = this.state.activity_logs.filter(
      a => new Date(a.created_at).getTime() >= todayStartMs
    ).length;

    const newDevicesCount = this.state.device_history.filter(
      d => d.trust_status === 'new' || (now - new Date(d.first_login_at).getTime() <= 7 * 86400 * 1000)
    ).length;

    const blockedDevicesCount = this.state.device_history.filter(
      d => d.trust_status === 'blocked' || d.trust_status === 'revoked'
    ).length;

    const unresolvedSuspiciousEvents = this.state.security_events.filter(
      e => !e.is_resolved && (e.severity === 'MEDIUM' || e.severity === 'HIGH' || e.severity === 'CRITICAL')
    ).length;

    const criticalEvents24h = this.state.security_events.filter(
      e => (e.severity === 'HIGH' || e.severity === 'CRITICAL') && now - new Date(e.created_at).getTime() <= 86400 * 1000
    ).length;

    const activeBackups = this.state.backup_history.filter(b => b.status !== 'deleted');
    const latestBackup = activeBackups[0] || null;
    const backupFailuresCount = this.state.backup_history.filter(
      b => b.status === 'failed' && now - new Date(b.created_at).getTime() <= 30 * 86400 * 1000
    ).length;

    const totalBackupStorageBytes = activeBackups
      .filter(b => b.status === 'completed' || b.status === 'verified' || b.status === 'restored')
      .reduce((sum, b) => sum + (Number(b.file_size_bytes) || 0), 0);

    return {
      timezone: securityConfig.appTimezone,
      active_users_count: uniqueActiveUsers,
      active_sessions_count: activeSessions.length,
      today_logins_count: todayLogins,
      today_activities_count: todayActivities,
      failed_logins_today: todayFailedLogins,
      failed_logins_24h: totalFailedLogins24h,
      new_devices_count: newDevicesCount,
      total_registered_devices: this.state.device_history.length,
      blocked_devices_count: blockedDevicesCount,
      suspicious_events_unresolved: unresolvedSuspiciousEvents,
      high_critical_events_24h: criticalEvents24h,
      latest_backup: latestBackup
        ? {
            backup_uid: latestBackup.backup_uid,
            status: latestBackup.status,
            pg_status: latestBackup.pg_status,
            json_store_status: latestBackup.json_store_status,
            completed_at: latestBackup.completed_at || latestBackup.started_at,
            file_size_bytes: latestBackup.file_size_bytes,
            verified_at: latestBackup.verified_at,
            encrypted: latestBackup.encrypted,
          }
        : null,
      backup_failures_30d: backupFailuresCount,
      backup_storage_bytes: totalBackupStorageBytes,
      backup_count: activeBackups.length,
      backup_schedule: securityConfig.backupSchedule,
      backup_retention_days: securityConfig.backupRetentionDays,
      audit_retention_days: securityConfig.auditLogRetentionDays,
      total_audit_logs: this.state.activity_logs.length,
    };
  }
}

export const securityStore = new SecurityStore();
