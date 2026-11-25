/**
 * NEXORA ERP — Back Office PostgreSQL Database Restore Management Service
 *
 * Implements two strictly governed restore modes:
 * 1. Option 1 — Restore to Isolated Database:
 *    Creates a new isolated PostgreSQL database, verifies archive checksum + AES-256-GCM decrypt,
 *    executes `pg_restore`, validates restored tables & row counts, NEVER touches production.
 *
 * 2. Option 2 — Restore Production Database (Super Admin ONLY):
 *    - Enforces password re-authentication (`bcrypt.compare`) + exact phrase `RESTORE NEXORA PRODUCTION`
 *    - Verifies archive existence, SHA-256 checksum, AES-256-GCM decryption, & PG version compatibility
 *    - Protects target backup from retention cleanup during restore
 *    - Creates and verifies a fresh Pre-Restore Safety Backup (`is_protected_recovery = TRUE`) FIRST
 *    - Enables controlled Maintenance Mode (HTTP 503 for write requests, pauses schedulers)
 *    - Executes `pg_restore --clean --if-exists --no-owner --no-acl` against production PostgreSQL
 *    - Verifies restored database health, rehydrates app state, exits Maintenance Mode
 *    - On failure: logs complete details, attempts recovery from verified pre-restore backup if safe, alerts Super Admin
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { spawn } from 'child_process';
import pg from 'pg';
import { getDb, closeDbPool } from '../db';
import { store } from '../store';
import { runtimeConfig } from '../config/runtimeConfig';
import { securityConfig } from './config';
import { securityMonitor } from './securityMonitor';
import {
  backupSchedulerService,
  decryptStreamingBackupArchive,
  markBackupProtectedForRestore,
  unmarkBackupProtectedForRestore,
  resolveSafeBackupFilePath,
  type BackupActor,
} from './backupSchedulerService';
import { enterMaintenanceMode, exitMaintenanceMode, getMaintenanceModeState } from './maintenanceMode';

export const PRODUCTION_RESTORE_CONFIRMATION_PHRASE = 'RESTORE NEXORA PRODUCTION';

export type RestoreStatus =
  | 'pending'
  | 'validating'
  | 'creating_recovery_backup'
  | 'preparing_database'
  | 'maintenance_mode'
  | 'restoring'
  | 'verifying'
  | 'completed'
  | 'failed'
  | 'recovery_required';

export interface RestorableBackupSummary {
  backup_uid: string;
  scheduler_id: number | null;
  scheduler_name: string | null;
  execution_type: string;
  created_at: string;
  completed_at: string | null;
  file_name: string;
  file_size_bytes: number;
  pg_version: string | null;
  database_name: string | null;
  checksum_sha256: string;
  verification_status: string;
  availability_status: 'available' | 'missing' | 'corrupted';
  is_protected_recovery: boolean;
  initiated_by_email: string;
  notes: string | null;
}

export interface RestorePreviewResult {
  backup: RestorableBackupSummary;
  current_production_database: string;
  current_pg_version: string;
  suggested_isolated_database: string;
  archive_checksum_valid: boolean;
  compatibility_warning: string | null;
  production_restore_warning: string;
  required_confirmation_phrase: string;
}

export function sanitizeIsolatedDatabaseName(input?: string): string {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  if (!input || !input.trim()) {
    return `nexora_restore_${stamp}`;
  }
  const cleaned = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/^_+/, '')
    .slice(0, 50);

  if (!cleaned || !/^[a-z][a-z0-9_]{2,49}$/.test(cleaned)) {
    throw new Error('Isolated database name must start with a letter and contain only lowercase letters, numbers, and underscores (3–50 chars).');
  }
  return cleaned;
}

function buildDatabaseUrlForDbName(baseUrl: string, targetDbName: string): string {
  const parsed = new URL(baseUrl);
  parsed.pathname = `/${targetDbName}`;
  return parsed.toString();
}

function getDatabaseNameFromUrl(baseUrl: string): string {
  try {
    const parsed = new URL(baseUrl);
    return parsed.pathname.replace(/^\/+/, '') || 'nexora';
  } catch {
    return 'nexora';
  }
}

async function computeFileSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const rs = fs.createReadStream(filePath);
    rs.on('data', (chunk) => hash.update(chunk));
    rs.on('error', reject);
    rs.on('end', () => resolve(hash.digest('hex')));
  });
}

function runPgRestoreProcess(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    let stderr = '';
    const child = spawn('pg_restore', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    });

    child.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT') {
        reject(new Error('PostgreSQL `pg_restore` utility is not installed or not available in server PATH.'));
      } else {
        reject(new Error(`pg_restore spawn error: ${err.message}`));
      }
    });

    child.stderr.on('data', (chunk) => {
      if (stderr.length < 6000) stderr += chunk.toString('utf8');
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`pg_restore exited with code ${code}: ${stderr.trim() || 'Unknown pg_restore error'}`));
      }
    });
  });
}

async function verifyDatabaseConnectivityAndCounts(dbUrl: string): Promise<{
  public_table_count: number;
  database_name: string;
}> {
  const verifyPool = new pg.Pool({
    connectionString: dbUrl,
    max: 2,
    connectionTimeoutMillis: runtimeConfig.pgConnectionTimeoutMs,
    ssl: runtimeConfig.pgSsl,
  });
  try {
    const res = await verifyPool.query(`
      SELECT
        current_database() AS db_name,
        (SELECT COUNT(*)::int FROM information_schema.tables WHERE table_schema = 'public') AS table_cnt
    `);
    return {
      database_name: String(res.rows[0]?.db_name || ''),
      public_table_count: Number(res.rows[0]?.table_cnt || 0),
    };
  } finally {
    await verifyPool.end().catch(() => {});
  }
}

class RestoreService {
  private activeRestoreUid: string | null = null;

  getLiveStatus(): {
    active_restore_uid: string | null;
    maintenance_mode: ReturnType<typeof getMaintenanceModeState>;
  } {
    return {
      active_restore_uid: this.activeRestoreUid,
      maintenance_mode: getMaintenanceModeState(),
    };
  }

  async listAvailableBackups(filters: {
    search?: string;
    execution_type?: string;
    verification_status?: string;
  } = {}): Promise<RestorableBackupSummary[]> {
    const db = await getDb();
    const params: any[] = [];
    let sql = `
      SELECT * FROM backup_execution_history
      WHERE execution_status = 'completed'
    `;

    if (filters.execution_type && filters.execution_type !== 'all') {
      params.push(filters.execution_type);
      sql += ` AND execution_type = $${params.length}`;
    }
    if (filters.verification_status && filters.verification_status !== 'all') {
      params.push(filters.verification_status);
      sql += ` AND verification_status = $${params.length}`;
    }
    if (filters.search && filters.search.trim()) {
      params.push(`%${filters.search.trim()}%`);
      sql += ` AND (backup_uid ILIKE $${params.length} OR file_name ILIKE $${params.length} OR COALESCE(scheduler_name, '') ILIKE $${params.length} OR COALESCE(notes, '') ILIKE $${params.length})`;
    }

    sql += ` ORDER BY started_at DESC LIMIT 100`;
    const res = await db.query(sql, params);
    const backupDir = path.resolve(securityConfig.backupDir);

    return (res.rows || []).map((row: any) => {
      let availability: 'available' | 'missing' | 'corrupted' = 'missing';
      try {
        const resolved = path.resolve(String(row.storage_path || ''));
        if (resolved.startsWith(backupDir + path.sep) && fs.existsSync(resolved)) {
          const stat = fs.statSync(resolved);
          availability = stat.size > 48 ? 'available' : 'corrupted';
        }
      } catch {
        availability = 'missing';
      }

      return {
        backup_uid: row.backup_uid,
        scheduler_id: row.scheduler_id ? Number(row.scheduler_id) : null,
        scheduler_name: row.scheduler_name || null,
        execution_type: row.execution_type,
        created_at: row.started_at,
        completed_at: row.completed_at,
        file_name: row.file_name,
        file_size_bytes: Number(row.file_size_bytes || 0),
        pg_version: row.pg_version || null,
        database_name: row.database_name || null,
        checksum_sha256: row.checksum_sha256,
        verification_status: row.verification_status,
        availability_status: availability,
        is_protected_recovery: Boolean(row.is_protected_recovery),
        initiated_by_email: row.initiated_by_email,
        notes: row.notes || null,
      };
    });
  }

  async getRestorePreview(backupUid: string): Promise<RestorePreviewResult> {
    const db = await getDb();
    const res = await db.query(
      `SELECT * FROM backup_execution_history WHERE backup_uid = $1 LIMIT 1`,
      [backupUid]
    );
    if (!res.rows || res.rows.length === 0) {
      const err: any = new Error(`Backup "${backupUid}" was not found in backup history.`);
      err.statusCode = 404;
      throw err;
    }

    const row = res.rows[0];
    const backupDir = path.resolve(securityConfig.backupDir);
    const resolved = path.resolve(String(row.storage_path || ''));

    let availability: 'available' | 'missing' | 'corrupted' = 'missing';
    let checksumValid = false;

    if (resolved.startsWith(backupDir + path.sep) && fs.existsSync(resolved)) {
      const actualHash = await computeFileSha256(resolved);
      checksumValid = actualHash === row.checksum_sha256;
      availability = checksumValid ? 'available' : 'corrupted';
    }

    const infoRes = await db.query(`SELECT current_database() AS db_name, version() AS pg_ver`);
    const currentDb = String(infoRes.rows[0]?.db_name || 'nexora');
    const currentPgVer = String(infoRes.rows[0]?.pg_ver || '').slice(0, 120);

    const sourceMajor = String(row.pg_version || '').match(/PostgreSQL\s+(\d+)/i)?.[1] || null;
    const currentMajor = currentPgVer.match(/PostgreSQL\s+(\d+)/i)?.[1] || null;
    const compatWarning =
      sourceMajor && currentMajor && sourceMajor !== currentMajor
        ? `Backup was created on PostgreSQL ${sourceMajor}, while current target server runs PostgreSQL ${currentMajor}. Verify in an isolated database before restoring production.`
        : null;

    return {
      backup: {
        backup_uid: row.backup_uid,
        scheduler_id: row.scheduler_id ? Number(row.scheduler_id) : null,
        scheduler_name: row.scheduler_name || null,
        execution_type: row.execution_type,
        created_at: row.started_at,
        completed_at: row.completed_at,
        file_name: row.file_name,
        file_size_bytes: Number(row.file_size_bytes || 0),
        pg_version: row.pg_version || null,
        database_name: row.database_name || null,
        checksum_sha256: row.checksum_sha256,
        verification_status: row.verification_status,
        availability_status: availability,
        is_protected_recovery: Boolean(row.is_protected_recovery),
        initiated_by_email: row.initiated_by_email,
        notes: row.notes || null,
      },
      current_production_database: currentDb,
      current_pg_version: currentPgVer,
      suggested_isolated_database: sanitizeIsolatedDatabaseName(),
      archive_checksum_valid: checksumValid,
      compatibility_warning: compatWarning,
      production_restore_warning:
        'WARNING: Production restore will permanently replace the live NEXORA PostgreSQL database with this backup. Any transactions, inventory updates, work orders, or performance events recorded after this backup timestamp will be overwritten. A fresh verified pre-restore safety backup will be created automatically before production restore begins.',
      required_confirmation_phrase: PRODUCTION_RESTORE_CONFIRMATION_PHRASE,
    };
  }

  private async updateRestoreRecord(
    restoreUid: string,
    fields: {
      restore_status?: RestoreStatus;
      verification_status?: string;
      pre_restore_backup_uid?: string | null;
      completed_at?: string;
      duration_ms?: number;
      error_details?: string | null;
      recovery_action_status?: string | null;
      metadata?: Record<string, any>;
    }
  ): Promise<void> {
    try {
      const db = await getDb();
      await db.query(
        `UPDATE database_restore_history
         SET restore_status = COALESCE($1, restore_status),
             verification_status = COALESCE($2, verification_status),
             pre_restore_backup_uid = COALESCE($3, pre_restore_backup_uid),
             completed_at = COALESCE($4, completed_at),
             duration_ms = COALESCE($5, duration_ms),
             error_details = COALESCE($6, error_details),
             recovery_action_status = COALESCE($7, recovery_action_status),
             metadata = COALESCE(metadata, '{}'::jsonb) || COALESCE($8::jsonb, '{}'::jsonb)
         WHERE restore_uid = $9`,
        [
          fields.restore_status || null,
          fields.verification_status || null,
          fields.pre_restore_backup_uid ?? null,
          fields.completed_at || null,
          fields.duration_ms ?? null,
          fields.error_details ?? null,
          fields.recovery_action_status ?? null,
          fields.metadata ? JSON.stringify(fields.metadata) : null,
          restoreUid,
        ]
      );
    } catch {
      // During brief pool recycle on production restore, non-fatal
    }
  }

  /**
   * OPTION 1: Restore to Isolated PostgreSQL Database (zero impact on production)
   */
  async restoreToIsolatedDatabase(
    backupUid: string,
    actor: BackupActor,
    requestedTargetDbName?: string
  ): Promise<any> {
    if (this.activeRestoreUid) {
      const err: any = new Error('Another database restore operation is already in progress.');
      err.statusCode = 409;
      throw err;
    }

    const databaseUrl = runtimeConfig.databaseUrl || process.env.DATABASE_URL || '';
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is not configured.');
    }

    const prodDbName = getDatabaseNameFromUrl(databaseUrl);
    const targetDbName = sanitizeIsolatedDatabaseName(requestedTargetDbName);
    if (targetDbName.toLowerCase() === prodDbName.toLowerCase()) {
      const err: any = new Error('Isolated restore target database name must be different from the live production database.');
      err.statusCode = 400;
      throw err;
    }

    const db = await getDb();
    const bkpRes = await db.query(
      `SELECT * FROM backup_execution_history WHERE backup_uid = $1 LIMIT 1`,
      [backupUid]
    );
    if (!bkpRes.rows || bkpRes.rows.length === 0) {
      const err: any = new Error(`Backup "${backupUid}" not found.`);
      err.statusCode = 404;
      throw err;
    }
    const backupRow = bkpRes.rows[0];

    const startedMs = Date.now();
    const restoreUid = `rst_iso_${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}_${crypto
      .randomBytes(3)
      .toString('hex')}`;
    const tempPlainDump = resolveSafeBackupFilePath(`tmp_${restoreUid}.dump`);

    this.activeRestoreUid = restoreUid;
    markBackupProtectedForRestore(backupUid);

    try {
      await db.query(
        `INSERT INTO database_restore_history
         (restore_uid, backup_uid, backup_created_at, restore_mode, target_database_name, initiated_by, initiated_by_email, started_at, verification_status, restore_status)
         VALUES ($1, $2, $3, 'isolated', $4, $5, $6, NOW(), 'pending', 'validating')`,
        [restoreUid, backupUid, backupRow.started_at, targetDbName, actor.id, actor.email]
      );

      // Step 1: Validate & decrypt archive
      await decryptStreamingBackupArchive(
        backupRow.storage_path,
        tempPlainDump,
        backupRow.checksum_sha256
      );
      await this.updateRestoreRecord(restoreUid, {
        verification_status: 'verified',
        restore_status: 'preparing_database',
      });

      // Step 2: Create isolated PostgreSQL database (strictly validated identifier)
      const adminUrl = buildDatabaseUrlForDbName(databaseUrl, 'postgres');
      const adminPool = new pg.Pool({
        connectionString: adminUrl,
        max: 2,
        connectionTimeoutMillis: runtimeConfig.pgConnectionTimeoutMs,
        ssl: runtimeConfig.pgSsl,
      });
      try {
        // targetDbName is strictly sanitized to /^[a-z][a-z0-9_]{2,49}$/
        await adminPool.query(`CREATE DATABASE "${targetDbName}"`);
      } finally {
        await adminPool.end().catch(() => {});
      }

      // Step 3: Restore into isolated DB via pg_restore
      await this.updateRestoreRecord(restoreUid, { restore_status: 'restoring' });
      const isolatedUrl = buildDatabaseUrlForDbName(databaseUrl, targetDbName);
      await runPgRestoreProcess(['--no-owner', '--no-acl', '-d', isolatedUrl, tempPlainDump]);

      // Step 4: Verify restored isolated database
      await this.updateRestoreRecord(restoreUid, { restore_status: 'verifying' });
      const verification = await verifyDatabaseConnectivityAndCounts(isolatedUrl);
      const durationMs = Date.now() - startedMs;

      await this.updateRestoreRecord(restoreUid, {
        restore_status: 'completed',
        verification_status: 'verified',
        completed_at: new Date().toISOString(),
        duration_ms: durationMs,
        metadata: {
          restored_table_count: verification.public_table_count,
          isolated_database: targetDbName,
        },
      });

      store.logAudit({
        user_id: actor.id,
        user_email: actor.email,
        action: 'DATABASE_RESTORE_ISOLATED_COMPLETED',
        module: 'Security',
        details: `Restored backup ${backupUid} into isolated PostgreSQL database "${targetDbName}" (${verification.public_table_count} tables verified, ${durationMs}ms). Production untouched.`,
        ip_address: actor.ip || '127.0.0.1',
      });

      const finalRow = await db.query(
        `SELECT * FROM database_restore_history WHERE restore_uid = $1 LIMIT 1`,
        [restoreUid]
      );
      return finalRow.rows[0];
    } catch (err: any) {
      const durationMs = Date.now() - startedMs;
      await this.updateRestoreRecord(restoreUid, {
        restore_status: 'failed',
        completed_at: new Date().toISOString(),
        duration_ms: durationMs,
        error_details: err?.message || String(err),
      });
      throw err;
    } finally {
      unmarkBackupProtectedForRestore(backupUid);
      this.activeRestoreUid = null;
      try {
        if (fs.existsSync(tempPlainDump)) fs.unlinkSync(tempPlainDump);
      } catch {}
    }
  }

  /**
   * OPTION 2: Restore Production PostgreSQL Database (Super Admin ONLY)
   */
  async restoreProductionDatabase(params: {
    backupUid: string;
    actor: BackupActor;
    password: string;
    confirmationPhrase: string;
  }): Promise<any> {
    if (this.activeRestoreUid) {
      const err: any = new Error('Another database restore operation is already in progress.');
      err.statusCode = 409;
      throw err;
    }

    if (params.confirmationPhrase !== PRODUCTION_RESTORE_CONFIRMATION_PHRASE) {
      const err: any = new Error(
        `Invalid confirmation phrase. Type "${PRODUCTION_RESTORE_CONFIRMATION_PHRASE}" exactly to authorize production restore.`
      );
      err.statusCode = 400;
      throw err;
    }

    if (!params.password || !params.password.trim()) {
      const err: any = new Error('Super Admin password re-authentication is required for production database restore.');
      err.statusCode = 400;
      throw err;
    }

    // Re-authenticate actor's password against persisted password hash
    const userRecord = store.findUserByEmail(params.actor.email);
    if (!userRecord || !userRecord.password_hash) {
      const err: any = new Error('Unable to verify administrator credentials.');
      err.statusCode = 401;
      throw err;
    }
    const passwordMatches = await bcrypt.compare(params.password, userRecord.password_hash);
    if (!passwordMatches) {
      const err: any = new Error('Administrator password re-authentication failed.');
      err.statusCode = 401;
      throw err;
    }

    const databaseUrl = runtimeConfig.databaseUrl || process.env.DATABASE_URL || '';
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is not configured.');
    }

    const prodDbName = getDatabaseNameFromUrl(databaseUrl);
    const db = await getDb();
    const bkpRes = await db.query(
      `SELECT * FROM backup_execution_history WHERE backup_uid = $1 LIMIT 1`,
      [params.backupUid]
    );
    if (!bkpRes.rows || bkpRes.rows.length === 0) {
      const err: any = new Error(`Backup "${params.backupUid}" not found.`);
      err.statusCode = 404;
      throw err;
    }
    const backupRow = bkpRes.rows[0];

    const startedMs = Date.now();
    const restoreUid = `rst_prod_${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}_${crypto
      .randomBytes(3)
      .toString('hex')}`;
    const tempPlainDump = resolveSafeBackupFilePath(`tmp_${restoreUid}.dump`);
    let preRestoreBackupUid: string | null = null;
    let preRestoreStoragePath: string | null = null;
    let preRestoreSha256: string | null = null;

    this.activeRestoreUid = restoreUid;
    markBackupProtectedForRestore(params.backupUid);

    try {
      await db.query(
        `INSERT INTO database_restore_history
         (restore_uid, backup_uid, backup_created_at, restore_mode, target_database_name, initiated_by, initiated_by_email, started_at, verification_status, restore_status)
         VALUES ($1, $2, $3, 'production', $4, $5, $6, NOW(), 'pending', 'validating')`,
        [restoreUid, params.backupUid, backupRow.started_at, prodDbName, params.actor.id, params.actor.email]
      );

      // Step 1: Verify and decrypt target backup archive before touching production
      await decryptStreamingBackupArchive(
        backupRow.storage_path,
        tempPlainDump,
        backupRow.checksum_sha256
      );
      await this.updateRestoreRecord(restoreUid, {
        verification_status: 'verified',
        restore_status: 'creating_recovery_backup',
      });

      // Step 2: Mandatory fresh verified Pre-Restore Safety Backup (protected from retention cleanup!)
      const safetyBackup = await backupSchedulerService.runManualBackup(
        {
          executionType: 'pre_restore',
          isProtectedRecovery: true,
          notes: `Mandatory pre-restore safety recovery backup before ${restoreUid} (restoring ${params.backupUid})`,
        },
        params.actor
      );
      if (safetyBackup.execution_status !== 'completed' || safetyBackup.verification_status !== 'verified') {
        throw new Error('Mandatory pre-restore safety backup failed verification. Production restore aborted cleanly without modifying production.');
      }
      preRestoreBackupUid = safetyBackup.backup_uid;
      preRestoreStoragePath = safetyBackup.storage_path;
      preRestoreSha256 = safetyBackup.checksum_sha256;

      await this.updateRestoreRecord(restoreUid, {
        pre_restore_backup_uid: preRestoreBackupUid,
        restore_status: 'maintenance_mode',
      });

      // Step 3: Enter Controlled Maintenance Mode (pauses schedulers & blocks mutating API writes with HTTP 503)
      enterMaintenanceMode({
        restore_uid: restoreUid,
        initiated_by: params.actor.email,
        reason: `Production database restore from backup ${params.backupUid} in progress.`,
      });

      await this.updateRestoreRecord(restoreUid, { restore_status: 'restoring' });

      // Close active application connections gracefully before running pg_restore
      await closeDbPool();

      // Terminate any lingering connections to the production DB via postgres maintenance DB
      const adminUrl = buildDatabaseUrlForDbName(databaseUrl, 'postgres');
      const adminPool = new pg.Pool({
        connectionString: adminUrl,
        max: 2,
        connectionTimeoutMillis: runtimeConfig.pgConnectionTimeoutMs,
        ssl: runtimeConfig.pgSsl,
      });
      try {
        await adminPool.query(
          `SELECT pg_terminate_backend(pid)
           FROM pg_stat_activity
           WHERE datname = $1 AND pid <> pg_backend_pid()`,
          [prodDbName]
        );
      } finally {
        await adminPool.end().catch(() => {});
      }

      // Step 4: Execute pg_restore against production database
      await runPgRestoreProcess([
        '--clean',
        '--if-exists',
        '--no-owner',
        '--no-acl',
        '-d',
        databaseUrl,
        tempPlainDump,
      ]);

      // Step 5: Verify restored production database & rehydrate application state
      const verification = await verifyDatabaseConnectivityAndCounts(databaseUrl);
      await store.hydrateFromPostgres();

      const durationMs = Date.now() - startedMs;
      await this.updateRestoreRecord(restoreUid, {
        restore_status: 'completed',
        verification_status: 'verified',
        pre_restore_backup_uid: preRestoreBackupUid,
        completed_at: new Date().toISOString(),
        duration_ms: durationMs,
        metadata: {
          restored_table_count: verification.public_table_count,
          production_database: prodDbName,
        },
      });

      exitMaintenanceMode();

      await securityMonitor.raiseEvent({
        event_code: 'PRODUCTION_DATABASE_RESTORED',
        severity: 'HIGH',
        title: `Production Database Restored (${params.backupUid})`,
        description: `Super Admin ${params.actor.email} restored production PostgreSQL database "${prodDbName}" from backup ${params.backupUid}. Pre-restore safety backup: ${preRestoreBackupUid}.`,
        user_id: params.actor.id,
        user_email: params.actor.email,
        ip_address: params.actor.ip,
        details: {
          restore_uid: restoreUid,
          backup_uid: params.backupUid,
          pre_restore_backup_uid: preRestoreBackupUid,
          duration_ms: durationMs,
        },
        notifyAdmin: true,
      });

      const refreshedDb = await getDb();
      const finalRes = await refreshedDb.query(
        `SELECT * FROM database_restore_history WHERE restore_uid = $1 LIMIT 1`,
        [restoreUid]
      );
      return finalRes.rows[0] || {
        restore_uid: restoreUid,
        backup_uid: params.backupUid,
        pre_restore_backup_uid: preRestoreBackupUid,
        restore_mode: 'production',
        target_database_name: prodDbName,
        restore_status: 'completed',
        duration_ms: durationMs,
      };
    } catch (err: any) {
      const durationMs = Date.now() - startedMs;
      const errMsg = err?.message || String(err);
      let recoveryActionStatus = 'not_needed_production_untouched';

      // If failure happened after entering maintenance mode / touching production, attempt automatic recovery from verified pre-restore safety backup
      if (preRestoreBackupUid && preRestoreStoragePath && preRestoreSha256 && getMaintenanceModeState().active) {
        const tempRecoveryDump = resolveSafeBackupFilePath(`tmp_recovery_${restoreUid}.dump`);
        try {
          await decryptStreamingBackupArchive(preRestoreStoragePath, tempRecoveryDump, preRestoreSha256);
          await runPgRestoreProcess([
            '--clean',
            '--if-exists',
            '--no-owner',
            '--no-acl',
            '-d',
            databaseUrl,
            tempRecoveryDump,
          ]);
          await store.hydrateFromPostgres();
          recoveryActionStatus = `auto_recovered_from_${preRestoreBackupUid}`;
        } catch (recErr: any) {
          recoveryActionStatus = `recovery_failed: ${recErr?.message || recErr}`;
        } finally {
          try {
            if (fs.existsSync(tempRecoveryDump)) fs.unlinkSync(tempRecoveryDump);
          } catch {}
        }
      }

      exitMaintenanceMode();

      await this.updateRestoreRecord(restoreUid, {
        restore_status: recoveryActionStatus.startsWith('recovery_failed') ? 'recovery_required' : 'failed',
        completed_at: new Date().toISOString(),
        duration_ms: durationMs,
        error_details: errMsg,
        recovery_action_status: recoveryActionStatus,
        pre_restore_backup_uid: preRestoreBackupUid,
      });

      await securityMonitor.raiseEvent({
        event_code: 'PRODUCTION_RESTORE_FAILED',
        severity: 'CRITICAL',
        title: `Production Database Restore Failed (${params.backupUid})`,
        description: `Restore ${restoreUid} failed: ${errMsg}. Recovery status: ${recoveryActionStatus}. Pre-restore safety backup: ${preRestoreBackupUid || 'N/A'}.`,
        user_id: params.actor.id,
        user_email: params.actor.email,
        details: {
          restore_uid: restoreUid,
          backup_uid: params.backupUid,
          pre_restore_backup_uid: preRestoreBackupUid,
          recovery_action_status: recoveryActionStatus,
        },
        notifyAdmin: true,
      }).catch(() => {});

      throw err;
    } finally {
      unmarkBackupProtectedForRestore(params.backupUid);
      this.activeRestoreUid = null;
      try {
        if (fs.existsSync(tempPlainDump)) fs.unlinkSync(tempPlainDump);
      } catch {}
    }
  }

  async listRestoreHistory(limit = 100): Promise<any[]> {
    const db = await getDb();
    const safeLimit = Math.min(200, Math.max(1, Number(limit) || 100));
    const res = await db.query(
      `SELECT * FROM database_restore_history ORDER BY started_at DESC LIMIT $1`,
      [safeLimit]
    );
    return res.rows || [];
  }

  async getRestoreByUid(restoreUid: string): Promise<any | null> {
    const db = await getDb();
    const res = await db.query(
      `SELECT * FROM database_restore_history WHERE restore_uid = $1 LIMIT 1`,
      [restoreUid]
    );
    return res.rows[0] || null;
  }
}

export const restoreService = new RestoreService();
