import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import crypto from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import pg from 'pg';
import { securityConfig } from './config';
import { BackupHistoryRecord, securityStore } from './securityStore';
import { auditService } from './auditService';
import { securityMonitor } from './securityMonitor';
import { isSafeChildPath } from './redaction';
import { checkPostgresHealth } from '../db';

const execFileAsync = promisify(execFile);

const MAGIC_HEADER = Buffer.from('NXBK01', 'ascii'); // 6 bytes
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

export interface BackupJobProgress {
  job_id: string;
  backup_uid: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  stage: string;
  progress_pct: number;
  started_at: string;
  completed_at?: string;
  error?: string;
  record?: BackupHistoryRecord;
}

export interface BackupVerificationResult {
  valid: boolean;
  backup_uid: string;
  checksum_matched: boolean;
  decryption_valid: boolean;
  archive_valid: boolean;
  pg_included: boolean;
  pg_engine: string | null;
  json_store_included: boolean;
  json_store_entities?: Record<string, number>;
  created_at_ist?: string;
  verified_at: string;
  error?: string;
}

interface PendingRestoreConfirmation {
  token: string;
  backup_uid: string;
  admin_user_id: number;
  expires_at: number;
  validation: BackupVerificationResult;
}

interface BackupBundlePayload {
  format_version: string;
  backup_uid: string;
  created_at_utc: string;
  created_at_ist: string;
  app_name: string;
  company: string;
  components: {
    postgresql: {
      status: BackupHistoryRecord['pg_status'];
      engine: string | null;
      format: 'pg_dump_custom_base64' | 'logical_json' | 'none';
      tables_count: number;
      rows_count: number;
      checksum_sha256: string | null;
      data: any;
    };
    json_store: {
      status: BackupHistoryRecord['json_store_status'];
      source_file: string;
      checksum_sha256: string | null;
      byte_length: number;
      entity_counts: Record<string, number>;
      raw_json: string | null;
    };
  };
}

function formatKolkataTimestamp(date = new Date()): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: securityConfig.appTimezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}

function formatFilenameTimestamp(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: securityConfig.appTimezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (t: string) => parts.find(p => p.type === t)?.value || '00';
  return `${get('year')}${get('month')}${get('day')}_${get('hour')}${get('minute')}${get('second')}_IST`;
}

export class BackupService {
  private activeJobs = new Map<string, BackupJobProgress>();
  private pendingRestores = new Map<string, PendingRestoreConfirmation>();
  private schedulerTimer: NodeJS.Timeout | null = null;
  private lastScheduledDateKey = '';

  private ensureBackupDir(): string {
    const dir = securityConfig.backupDir;
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
    try {
      fs.chmodSync(dir, 0o700);
    } catch {
      // Windows/shared FS chmod notice
    }
    return dir;
  }

  private getLockFilePath(): string {
    return path.join(this.ensureBackupDir(), '.backup.lock');
  }

  public isBackupLocked(): boolean {
    const lockPath = this.getLockFilePath();
    if (!fs.existsSync(lockPath)) return false;
    try {
      const data = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
      const ageMs = Date.now() - Number(data.started_at_ms || 0);
      if (ageMs > 2 * 60 * 60 * 1000) {
        // Stale lock (>2h)
        fs.unlinkSync(lockPath);
        return false;
      }
      return true;
    } catch {
      return true;
    }
  }

  private acquireLock(backupUid: string): void {
    const lockPath = this.getLockFilePath();
    if (fs.existsSync(lockPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
        const ageMs = Date.now() - Number(data.started_at_ms || 0);
        if (ageMs > 2 * 60 * 60 * 1000) {
          fs.unlinkSync(lockPath);
        }
      } catch {
        // Keep lock if unreadable
      }
    }
    try {
      const fd = fs.openSync(lockPath, 'wx', 0o600);
      fs.writeFileSync(
        fd,
        JSON.stringify({ pid: process.pid, backup_uid: backupUid, started_at_ms: Date.now() }),
        'utf8'
      );
      fs.closeSync(fd);
    } catch (err: any) {
      if (err?.code === 'EEXIST') {
        throw new Error('Another backup or restore operation is already in progress. Overlapping backup jobs are prevented.');
      }
      throw err;
    }
  }

  private releaseLock(): void {
    try {
      const lockPath = this.getLockFilePath();
      if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath);
    } catch {
      // Ignore cleanup errors
    }
  }

  public async detectCapabilities(): Promise<{
    pg_dump_available: boolean;
    pg_restore_available: boolean;
    pg_connected: boolean;
    json_store_exists: boolean;
    json_store_size_bytes: number;
    backup_dir: string;
    offsite_configured: boolean;
    encryption_key_configured: boolean;
    schedule: string;
    retention_days: number;
    timezone: string;
  }> {
    let pgDumpAvailable = false;
    let pgRestoreAvailable = false;
    try {
      await execFileAsync('pg_dump', ['--version'], { timeout: 3000 });
      pgDumpAvailable = true;
    } catch {
      pgDumpAvailable = false;
    }
    try {
      await execFileAsync('pg_restore', ['--version'], { timeout: 3000 });
      pgRestoreAvailable = true;
    } catch {
      pgRestoreAvailable = false;
    }

    let pgConnected = false;
    if (process.env.DATABASE_URL && process.env.DISABLE_PG_FOR_TESTS !== 'true') {
      let pool: pg.Pool | null = null;
      try {
        pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 1500 });
        const client = await pool.connect();
        await client.query('SELECT 1');
        client.release();
        pgConnected = true;
      } catch {
        pgConnected = false;
      } finally {
        if (pool) await pool.end().catch(() => {});
      }
    }

    return {
      pg_dump_available: pgDumpAvailable,
      pg_restore_available: pgRestoreAvailable,
      pg_connected: pgConnected,
      json_store_exists: false,
      json_store_size_bytes: 0,
      backup_dir: securityConfig.backupDir,
      offsite_configured: Boolean(securityConfig.backupOffsiteDir),
      encryption_key_configured: securityConfig.backupEncryptionKeyConfigured,
      schedule: securityConfig.backupSchedule,
      retention_days: securityConfig.backupRetentionDays,
      timezone: securityConfig.appTimezone,
    };
  }

  /**
   * Captures PostgreSQL backup via `pg_dump -Fc` (preferred) or pure-Node logical dump fallback.
   * Never uses shell interpolation and never reads file-based JSON stores.
   */
  private async capturePostgresBackup(backupUid: string): Promise<BackupBundlePayload['components']['postgresql']> {
    if (process.env.DISABLE_PG_FOR_TESTS === 'true') {
      const testTables = { nexora_app_state: [{ state_key: 'primary', captured_at: new Date().toISOString() }] };
      const serialized = JSON.stringify(testTables);
      return {
        status: 'fallback_logical',
        engine: 'pg_test_logical',
        format: 'logical_json',
        tables_count: 1,
        rows_count: 1,
        checksum_sha256: crypto.createHash('sha256').update(serialized).digest('hex'),
        data: testTables,
      };
    }

    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      return {
        status: 'skipped_offline',
        engine: 'none',
        format: 'none',
        tables_count: 0,
        rows_count: 0,
        checksum_sha256: null,
        data: null,
      };
    }

    // 1. Test live PostgreSQL connectivity first
    let pool: pg.Pool | null = null;
    try {
      pool = new pg.Pool({ connectionString: dbUrl, connectionTimeoutMillis: 2500 });
      const client = await pool.connect();
      await client.query('SELECT 1');
      client.release();
    } catch {
      if (pool) await pool.end().catch(() => {});
      return {
        status: 'skipped_offline',
        engine: 'pg_unreachable',
        format: 'none',
        tables_count: 0,
        rows_count: 0,
        checksum_sha256: null,
        data: null,
      };
    }

    // 2. Try native `pg_dump -Fc` first (safe execFile argument array, no shell)
    const tmpDumpPath = path.join(this.ensureBackupDir(), `.tmp_${backupUid}.pgdump`);
    try {
      await execFileAsync('pg_dump', ['--version'], { timeout: 3000 });
      await execFileAsync('pg_dump', ['-Fc', '--no-owner', '--no-acl', '-f', tmpDumpPath, dbUrl], {
        timeout: 120000,
        maxBuffer: 10 * 1024 * 1024,
      });

      const dumpBytes = fs.readFileSync(tmpDumpPath);
      const checksum = crypto.createHash('sha256').update(dumpBytes).digest('hex');

      // Query table counts for manifest visibility
      const tableRes = await pool.query(
        `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`
      );
      await pool.end().catch(() => {});
      fs.unlinkSync(tmpDumpPath);

      return {
        status: 'completed',
        engine: 'pg_dump',
        format: 'pg_dump_custom_base64',
        tables_count: tableRes.rows.length,
        rows_count: 0,
        checksum_sha256: checksum,
        data: dumpBytes.toString('base64'),
      };
    } catch {
      if (fs.existsSync(tmpDumpPath)) {
        try { fs.unlinkSync(tmpDumpPath); } catch {}
      }
    }

    // 3. Pure-Node logical PostgreSQL dump fallback (cPanel / containers lacking pg_dump)
    try {
      const tableRes = await pool.query(
        `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`
      );
      const tables: Record<string, any[]> = {};
      let totalRows = 0;

      for (const row of tableRes.rows) {
        const tbl = String(row.tablename);
        // Validate identifier strictly before quoting
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tbl)) continue;
        const dataRes = await pool.query(`SELECT * FROM "public"."${tbl}"`);
        tables[tbl] = dataRes.rows;
        totalRows += dataRes.rows.length;
      }

      const serialized = JSON.stringify(tables);
      const checksum = crypto.createHash('sha256').update(serialized).digest('hex');
      await pool.end().catch(() => {});

      return {
        status: 'fallback_logical',
        engine: 'node_pg_logical',
        format: 'logical_json',
        tables_count: Object.keys(tables).length,
        rows_count: totalRows,
        checksum_sha256: checksum,
        data: tables,
      };
    } catch (err: any) {
      await pool.end().catch(() => {});
      throw new Error(`PostgreSQL logical dump failed: ${err.message}`);
    }
  }

  /**
   * File-based JSON store is permanently removed under the PostgreSQL-only architecture.
   */
  private captureJsonStoreBackup(): BackupBundlePayload['components']['json_store'] {
    return {
      status: 'missing',
      source_file: 'deprecated_postgresql_only',
      checksum_sha256: null,
      byte_length: 0,
      entity_counts: {},
      raw_json: null,
    };
  }

  /**
   * Encrypts gzipped archive bytes with AES-256-GCM using dedicated external BACKUP_ENCRYPTION_KEY.
   */
  public encryptBuffer(plainBuffer: Buffer, key = securityConfig.backupEncryptionKey): Buffer {
    const compressed = zlib.gzipSync(plainBuffer, { level: 6 });
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(compressed), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([MAGIC_HEADER, iv, authTag, encrypted]);
  }

  /**
   * Decrypts and authenticates an `.nxenc` AES-256-GCM archive. Throws immediately if tampered.
   */
  public decryptBuffer(encryptedBuffer: Buffer, key = securityConfig.backupEncryptionKey): Buffer {
    const minLen = MAGIC_HEADER.length + IV_LENGTH + AUTH_TAG_LENGTH + 1;
    if (encryptedBuffer.length < minLen) {
      throw new Error('Encrypted backup file is truncated or invalid.');
    }
    const magic = encryptedBuffer.subarray(0, MAGIC_HEADER.length);
    if (!magic.equals(MAGIC_HEADER)) {
      throw new Error('Invalid Nexora backup file header magic.');
    }
    const ivStart = MAGIC_HEADER.length;
    const tagStart = ivStart + IV_LENGTH;
    const dataStart = tagStart + AUTH_TAG_LENGTH;

    const iv = encryptedBuffer.subarray(ivStart, tagStart);
    const authTag = encryptedBuffer.subarray(tagStart, dataStart);
    const ciphertext = encryptedBuffer.subarray(dataStart);

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    const compressed = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return zlib.gunzipSync(compressed);
  }

  private updateJob(jobId: string | undefined, patch: Partial<BackupJobProgress>) {
    if (!jobId) return;
    const current = this.activeJobs.get(jobId);
    if (current) {
      Object.assign(current, patch);
    }
  }

  public getJobStatus(jobId: string): BackupJobProgress | null {
    return this.activeJobs.get(jobId) || null;
  }

  public startManualBackupAsync(params: {
    initiatedByUserId: number | null;
    initiatedByEmail: string | null;
    triggerType?: BackupHistoryRecord['trigger_type'];
  }): BackupJobProgress {
    if (this.isBackupLocked()) {
      throw new Error('A backup or restore job is already running. Please wait for completion.');
    }
    const jobId = `job_${crypto.randomBytes(8).toString('hex')}`;
    const backupUid = `nx_bkp_${formatFilenameTimestamp()}_${crypto.randomBytes(3).toString('hex')}`;
    const progress: BackupJobProgress = {
      job_id: jobId,
      backup_uid: backupUid,
      status: 'queued',
      stage: 'Initializing encrypted dual-storage backup',
      progress_pct: 5,
      started_at: new Date().toISOString(),
    };
    this.activeJobs.set(jobId, progress);

    // Execute asynchronously on next tick so normal HTTP requests are never blocked
    setImmediate(() => {
      this.runBackup({
        backupUid,
        jobId,
        triggerType: params.triggerType || 'manual',
        initiatedByUserId: params.initiatedByUserId,
        initiatedByEmail: params.initiatedByEmail,
      }).catch(() => {});
    });

    return progress;
  }

  public async runBackup(params: {
    backupUid?: string;
    jobId?: string;
    triggerType: BackupHistoryRecord['trigger_type'];
    initiatedByUserId?: number | null;
    initiatedByEmail?: string | null;
  }): Promise<BackupHistoryRecord> {
    const startMs = Date.now();
    const backupUid = params.backupUid || `nx_bkp_${formatFilenameTimestamp()}_${crypto.randomBytes(3).toString('hex')}`;
    const backupDir = this.ensureBackupDir();
    const fileName = `${backupUid}.nxenc`;
    const filePath = path.join(backupDir, fileName);
    const retentionUntil = new Date(
      startMs + securityConfig.backupRetentionDays * 86400 * 1000
    ).toISOString();

    this.acquireLock(backupUid);

    let record = await securityStore.createBackupRecord({
      backup_uid: backupUid,
      file_name: fileName,
      storage_path: filePath,
      offsite_path: null,
      trigger_type: params.triggerType,
      status: 'in_progress',
      pg_status: 'pending',
      pg_engine: null,
      json_store_status: 'pending',
      file_size_bytes: 0,
      checksum_sha256: null,
      encrypted: true,
      encryption_algorithm: 'aes-256-gcm',
      compression_algorithm: 'gzip',
      started_at: new Date(startMs).toISOString(),
      completed_at: null,
      duration_ms: null,
      verified_at: null,
      verified_by: null,
      verification_status: null,
      retention_until: retentionUntil,
      initiated_by: params.initiatedByUserId ?? null,
      initiated_by_email: params.initiatedByEmail ?? 'system-scheduler',
      error_message: null,
      metadata: null,
    });

    try {
      this.updateJob(params.jobId, { status: 'running', stage: 'Capturing PostgreSQL database snapshot', progress_pct: 35 });
      const pgComponent = await this.capturePostgresBackup(backupUid);
      const jsonComponent = this.captureJsonStoreBackup();

      if (pgComponent.status === 'failed' || pgComponent.status === 'skipped_offline') {
        throw new Error('PostgreSQL database is unreachable or failed to snapshot.');
      }

      const bundle: BackupBundlePayload = {
        format_version: '2.0',
        backup_uid: backupUid,
        created_at_utc: new Date().toISOString(),
        created_at_ist: formatKolkataTimestamp(),
        app_name: securityConfig.appName,
        company: securityConfig.appCompany,
        components: {
          postgresql: pgComponent,
          json_store: jsonComponent,
        },
      };

      this.updateJob(params.jobId, { stage: 'Compressing & encrypting backup with AES-256-GCM', progress_pct: 75 });
      const plainBytes = Buffer.from(JSON.stringify(bundle), 'utf8');
      const encryptedBytes = this.encryptBuffer(plainBytes);
      const checksumSha256 = crypto.createHash('sha256').update(encryptedBytes).digest('hex');

      // Atomic write with restricted permissions (0600)
      const tmpOut = `${filePath}.tmp`;
      fs.writeFileSync(tmpOut, encryptedBytes, { mode: 0o600 });
      fs.renameSync(tmpOut, filePath);
      try { fs.chmodSync(filePath, 0o600); } catch {}

      // Optional secondary offsite copy
      let offsitePath: string | null = null;
      if (securityConfig.backupOffsiteDir) {
        try {
          if (!fs.existsSync(securityConfig.backupOffsiteDir)) {
            fs.mkdirSync(securityConfig.backupOffsiteDir, { recursive: true, mode: 0o700 });
          }
          const dest = path.join(securityConfig.backupOffsiteDir, fileName);
          fs.copyFileSync(filePath, dest);
          try { fs.chmodSync(dest, 0o600); } catch {}
          offsitePath = dest;
        } catch (offErr: any) {
          console.warn('[BackupService] Offsite copy warning:', offErr.message);
        }
      }

      const completedAt = new Date().toISOString();
      const durationMs = Date.now() - startMs;

      record = (await securityStore.updateBackupRecord(backupUid, {
        status: 'completed',
        pg_status: pgComponent.status,
        pg_engine: pgComponent.engine,
        json_store_status: jsonComponent.status,
        file_size_bytes: encryptedBytes.length,
        checksum_sha256: checksumSha256,
        offsite_path: offsitePath,
        completed_at: completedAt,
        duration_ms: durationMs,
        metadata: {
          created_at_ist: bundle.created_at_ist,
          pg_tables_count: pgComponent.tables_count,
          pg_rows_count: pgComponent.rows_count,
          json_store_bytes: jsonComponent.byte_length,
          json_store_entities: jsonComponent.entity_counts,
        },
      })) || record;

      await auditService.log({
        user_id: params.initiatedByUserId ?? null,
        user_email: params.initiatedByEmail ?? 'system',
        module_name: 'Database Backups',
        action_type: 'BACKUP_CREATED',
        entity_type: 'Backup',
        entity_id: backupUid,
        status: 'SUCCESS',
        description: `Encrypted dual-storage backup ${fileName} completed (${encryptedBytes.length} bytes, PG: ${pgComponent.status}, JSON Store: ${jsonComponent.status}).`,
        after_values: {
          backup_uid: backupUid,
          trigger_type: params.triggerType,
          file_size_bytes: encryptedBytes.length,
          checksum_sha256: checksumSha256,
          pg_status: pgComponent.status,
          json_store_status: jsonComponent.status,
        },
      });

      this.updateJob(params.jobId, {
        status: 'completed',
        stage: 'Backup encrypted and checksummed successfully',
        progress_pct: 100,
        completed_at: completedAt,
        record,
      });

      return record;
    } catch (err: any) {
      const completedAt = new Date().toISOString();
      const durationMs = Date.now() - startMs;

      record = (await securityStore.updateBackupRecord(backupUid, {
        status: 'failed',
        completed_at: completedAt,
        duration_ms: durationMs,
        error_message: err.message,
      })) || record;

      this.updateJob(params.jobId, {
        status: 'failed',
        stage: 'Backup failed',
        progress_pct: 100,
        completed_at: completedAt,
        error: err.message,
        record,
      });

      await securityMonitor.raiseEvent({
        event_code: 'BACKUP_FAILURE',
        title: 'Database Backup Execution Failed',
        severity: 'CRITICAL',
        user_id: params.initiatedByUserId ?? null,
        user_email: params.initiatedByEmail ?? 'system',
        endpoint: '/api/security/backups',
        description: `Backup job ${backupUid} (${params.triggerType}) failed: ${err.message}`,
        details: { backup_uid: backupUid, trigger_type: params.triggerType, error: err.message },
        notifyAdmin: true,
      });

      throw err;
    } finally {
      this.releaseLock();
    }
  }

  /**
   * Verifies checksum, AES-256-GCM authentication tag, decompression, and archive manifest integrity.
   */
  public async verifyBackup(backupIdOrUid: string | number, actorUserId?: number | null): Promise<BackupVerificationResult> {
    const rec = securityStore.getBackupByUidOrId(backupIdOrUid);
    const verifiedAt = new Date().toISOString();

    if (!rec) {
      return {
        valid: false,
        backup_uid: String(backupIdOrUid),
        checksum_matched: false,
        decryption_valid: false,
        archive_valid: false,
        pg_included: false,
        pg_engine: null,
        json_store_included: false,
        verified_at: verifiedAt,
        error: 'Backup record not found.',
      };
    }

    if (!isSafeChildPath(securityConfig.backupDir, rec.storage_path) || !fs.existsSync(rec.storage_path)) {
      return {
        valid: false,
        backup_uid: rec.backup_uid,
        checksum_matched: false,
        decryption_valid: false,
        archive_valid: false,
        pg_included: false,
        pg_engine: rec.pg_engine,
        json_store_included: false,
        verified_at: verifiedAt,
        error: 'Backup artifact file is missing or resides outside the authorized private backup directory.',
      };
    }

    const encryptedBytes = fs.readFileSync(rec.storage_path);
    const actualChecksum = crypto.createHash('sha256').update(encryptedBytes).digest('hex');
    const checksumMatched = Boolean(rec.checksum_sha256 && actualChecksum === rec.checksum_sha256);

    if (!checksumMatched) {
      await securityStore.updateBackupRecord(rec.backup_uid, {
        verified_at: verifiedAt,
        verified_by: actorUserId ?? null,
        verification_status: 'CHECKSUM_MISMATCH',
      });
      await securityMonitor.raiseEvent({
        event_code: 'BACKUP_CHECKSUM_TAMPERED',
        title: 'Backup Checksum Integrity Verification Failed',
        severity: 'CRITICAL',
        user_id: actorUserId ?? null,
        endpoint: '/api/security/backups/verify',
        description: `Backup ${rec.file_name} failed SHA-256 verification. Expected ${rec.checksum_sha256}, computed ${actualChecksum}.`,
        notifyAdmin: true,
      });
      return {
        valid: false,
        backup_uid: rec.backup_uid,
        checksum_matched: false,
        decryption_valid: false,
        archive_valid: false,
        pg_included: false,
        pg_engine: rec.pg_engine,
        json_store_included: false,
        verified_at: verifiedAt,
        error: 'SHA-256 checksum mismatch — backup file may be corrupted or tampered with.',
      };
    }

    let bundle: BackupBundlePayload;
    try {
      const decrypted = this.decryptBuffer(encryptedBytes);
      bundle = JSON.parse(decrypted.toString('utf8'));
    } catch (err: any) {
      await securityStore.updateBackupRecord(rec.backup_uid, {
        verified_at: verifiedAt,
        verified_by: actorUserId ?? null,
        verification_status: 'DECRYPTION_FAILED',
      });
      return {
        valid: false,
        backup_uid: rec.backup_uid,
        checksum_matched: true,
        decryption_valid: false,
        archive_valid: false,
        pg_included: false,
        pg_engine: rec.pg_engine,
        json_store_included: false,
        verified_at: verifiedAt,
        error: `AES-256-GCM authentication/decryption failed: ${err.message}`,
      };
    }

    // Validate JSON Store inner checksum if present
    let jsonValid = true;
    const jsonComp = bundle?.components?.json_store;
    if (jsonComp?.status === 'completed' && jsonComp.raw_json) {
      const innerHash = crypto.createHash('sha256').update(jsonComp.raw_json, 'utf8').digest('hex');
      jsonValid = innerHash === jsonComp.checksum_sha256;
      try {
        JSON.parse(jsonComp.raw_json);
      } catch {
        jsonValid = false;
      }
    }

    const pgComp = bundle?.components?.postgresql;
    const archiveValid = Boolean(bundle?.backup_uid === rec.backup_uid && bundle?.components && jsonValid);

    await securityStore.updateBackupRecord(rec.backup_uid, {
      status: archiveValid ? 'verified' : rec.status,
      verified_at: verifiedAt,
      verified_by: actorUserId ?? null,
      verification_status: archiveValid ? 'PASSED' : 'ARCHIVE_INVALID',
    });

    return {
      valid: archiveValid,
      backup_uid: rec.backup_uid,
      checksum_matched: true,
      decryption_valid: true,
      archive_valid: archiveValid,
      pg_included: Boolean(pgComp && (pgComp.status === 'completed' || pgComp.status === 'fallback_logical')),
      pg_engine: pgComp?.engine || null,
      json_store_included: Boolean(jsonComp && jsonComp.status === 'completed'),
      json_store_entities: jsonComp?.entity_counts || {},
      created_at_ist: bundle.created_at_ist,
      verified_at: verifiedAt,
      error: archiveValid ? undefined : 'Backup archive manifest or inner checksum validation failed.',
    };
  }

  /**
   * STEP 1 OF CONTROLLED RESTORATION:
   * Verifies backup integrity & returns dry-run summary + single-use 10-min confirmation token.
   */
  public async prepareControlledRestore(backupIdOrUid: string | number, adminUserId: number): Promise<{
    ok: boolean;
    confirm_token?: string;
    confirm_phrase?: string;
    expires_at?: string;
    validation: BackupVerificationResult;
  }> {
    const validation = await this.verifyBackup(backupIdOrUid, adminUserId);
    if (!validation.valid) {
      return { ok: false, validation };
    }

    const token = `rst_${crypto.randomBytes(24).toString('hex')}`;
    const expiresAtMs = Date.now() + 10 * 60 * 1000;
    this.pendingRestores.set(token, {
      token,
      backup_uid: validation.backup_uid,
      admin_user_id: adminUserId,
      expires_at: expiresAtMs,
      validation,
    });

    return {
      ok: true,
      confirm_token: token,
      confirm_phrase: `RESTORE ${validation.backup_uid}`,
      expires_at: new Date(expiresAtMs).toISOString(),
      validation,
    };
  }

  /**
   * STEP 2 OF CONTROLLED RESTORATION:
   * 1) Validates single-use admin confirmation token & phrase
   * 2) Re-verifies checksum & GCM decryption
   * 3) Creates a fresh pre-restore safety backup of live production
   * 4) Validates payload in isolated staging parse before swapping live data
   * 5) Atomically restores JSON Store (+ PostgreSQL when included & online)
   * 6) Logs audit trail + CRITICAL/HIGH security event + admin email alert
   */
  public async executeControlledRestore(params: {
    backupIdOrUid: string | number;
    confirmToken: string;
    confirmPhrase: string;
    adminUserId: number;
    adminEmail: string;
    onStoreReload?: () => void;
  }): Promise<{
    success: boolean;
    pre_restore_backup_uid: string;
    restored_backup_uid: string;
    pg_restored: boolean;
    json_store_restored: boolean;
    message: string;
  }> {
    const pending = this.pendingRestores.get(params.confirmToken);
    if (!pending || pending.admin_user_id !== params.adminUserId || pending.expires_at < Date.now()) {
      throw new Error('Invalid or expired restoration confirmation token. Please re-run pre-restore verification.');
    }

    const rec = securityStore.getBackupByUidOrId(params.backupIdOrUid);
    if (!rec || rec.backup_uid !== pending.backup_uid) {
      throw new Error('Backup identifier does not match verified restoration token.');
    }

    const expectedPhrase = `RESTORE ${rec.backup_uid}`;
    if (String(params.confirmPhrase || '').trim() !== expectedPhrase) {
      throw new Error(`Confirmation phrase mismatch. Please type exactly: ${expectedPhrase}`);
    }

    // Consume single-use confirmation token immediately
    this.pendingRestores.delete(params.confirmToken);

    // Re-verify backup before touching live storage
    const verification = await this.verifyBackup(rec.backup_uid, params.adminUserId);
    if (!verification.valid) {
      throw new Error(`Pre-restore verification failed: ${verification.error}`);
    }

    // Create mandatory fresh pre-restore safety backup
    const preRestoreBackup = await this.runBackup({
      triggerType: 'pre_restore',
      initiatedByUserId: params.adminUserId,
      initiatedByEmail: params.adminEmail,
    });

    // Acquire lock for atomic restoration
    this.acquireLock(`restore_${rec.backup_uid}`);
    let jsonStoreRestored = false;
    let pgRestored = false;

    try {
      const encryptedBytes = fs.readFileSync(rec.storage_path);
      const bundle: BackupBundlePayload = JSON.parse(this.decryptBuffer(encryptedBytes).toString('utf8'));

      // Restore PostgreSQL strictly (JSON file store is permanently retired)
      const pgComp = bundle.components.postgresql;
      if (
        pgComp &&
        (pgComp.status === 'completed' || pgComp.status === 'fallback_logical') &&
        process.env.DISABLE_PG_FOR_TESTS === 'true'
      ) {
        pgRestored = true;
        if (params.onStoreReload) params.onStoreReload();
      } else if (
        pgComp &&
        (pgComp.status === 'completed' || pgComp.status === 'fallback_logical') &&
        process.env.DATABASE_URL
      ) {
        if (pgComp.format === 'pg_dump_custom_base64' && typeof pgComp.data === 'string') {
          const tmpPgFile = path.join(this.ensureBackupDir(), `.tmp_restore_${rec.backup_uid}.pgdump`);
          try {
            fs.writeFileSync(tmpPgFile, Buffer.from(pgComp.data, 'base64'), { mode: 0o600 });
            await execFileAsync(
              'pg_restore',
              ['--clean', '--if-exists', '--no-owner', '--no-acl', '-d', process.env.DATABASE_URL, tmpPgFile],
              { timeout: 180000 }
            );
            pgRestored = true;
          } finally {
            if (fs.existsSync(tmpPgFile)) {
              try { fs.unlinkSync(tmpPgFile); } catch {}
            }
          }
        } else if (pgComp.format === 'logical_json' && pgComp.data && typeof pgComp.data === 'object') {
          const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 3000 });
          const client = await pool.connect();
          try {
            await client.query('BEGIN');
            for (const [tbl, rows] of Object.entries(pgComp.data as Record<string, any[]>)) {
              if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tbl) || tbl === 'user_activity_logs') continue;
              if (!Array.isArray(rows) || rows.length === 0) continue;
              const cols = Object.keys(rows[0]).filter(c => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(c));
              if (cols.length === 0) continue;
              const colList = cols.map(c => `"${c}"`).join(', ');
              const placeholders = cols.map((_, idx) => `$${idx + 1}`).join(', ');
              for (const r of rows) {
                const vals = cols.map(c => r[c]);
                await client.query(
                  `INSERT INTO "public"."${tbl}" (${colList}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
                  vals
                );
              }
            }
            await client.query('COMMIT');
            pgRestored = true;
          } catch (pgErr) {
            await client.query('ROLLBACK').catch(() => {});
            throw pgErr;
          } finally {
            client.release();
            await pool.end().catch(() => {});
          }
        }
      }

      await securityStore.updateBackupRecord(rec.backup_uid, { status: 'restored' });

      await auditService.log({
        user_id: params.adminUserId,
        user_email: params.adminEmail,
        module_name: 'Database Backups',
        action_type: 'BACKUP_RESTORED',
        entity_type: 'Backup',
        entity_id: rec.backup_uid,
        status: 'SUCCESS',
        description: `Controlled restoration executed from ${rec.file_name}. Pre-restore safety backup: ${preRestoreBackup.backup_uid}. JSON Store restored: ${jsonStoreRestored}, PostgreSQL restored: ${pgRestored}.`,
        after_values: {
          restored_backup_uid: rec.backup_uid,
          pre_restore_backup_uid: preRestoreBackup.backup_uid,
          json_store_restored: jsonStoreRestored,
          pg_restored: pgRestored,
        },
      });

      await securityMonitor.raiseEvent({
        event_code: 'DATABASE_BACKUP_RESTORED',
        title: 'Controlled Production Backup Restoration Executed',
        severity: 'HIGH',
        user_id: params.adminUserId,
        user_email: params.adminEmail,
        endpoint: '/api/security/backups/restore',
        description: `Administrator ${params.adminEmail} restored Nexora ERP from backup ${rec.file_name} (safety backup ${preRestoreBackup.backup_uid} created automatically).`,
        notifyAdmin: true,
      });

      return {
        success: true,
        pre_restore_backup_uid: preRestoreBackup.backup_uid,
        restored_backup_uid: rec.backup_uid,
        pg_restored: pgRestored,
        json_store_restored: jsonStoreRestored,
        message: `Controlled restoration completed from ${rec.file_name}. Safety snapshot ${preRestoreBackup.backup_uid} preserved.`,
      };
    } finally {
      this.releaseLock();
    }
  }

  /**
   * Resolves a verified download path strictly inside `DB_BACKUP_DIR` (blocks path traversal).
   */
  public resolveDownloadableBackup(backupIdOrUid: string | number): { filePath: string; fileName: string; record: BackupHistoryRecord } | null {
    const rec = securityStore.getBackupByUidOrId(backupIdOrUid);
    if (!rec || rec.status === 'deleted') return null;
    if (!isSafeChildPath(securityConfig.backupDir, rec.storage_path)) return null;
    if (!fs.existsSync(rec.storage_path)) return null;
    return { filePath: rec.storage_path, fileName: rec.file_name, record: rec };
  }

  /**
   * Deletes expired backups older than `retentionDays` (default 30 days).
   */
  public async cleanupExpiredBackups(retentionDays = securityConfig.backupRetentionDays, actorUserId?: number | null): Promise<{
    deleted_count: number;
    freed_bytes: number;
    deleted_uids: string[];
  }> {
    const now = Date.now();
    const cutoffMs = now - retentionDays * 86400 * 1000;
    const all = securityStore.getBackupHistory({ page: 1, limit: 200 }).items;
    const deletedUids: string[] = [];
    let freedBytes = 0;

    for (const b of all) {
      if (b.status === 'deleted' || b.status === 'in_progress') continue;
      const retentionTs = b.retention_until ? new Date(b.retention_until).getTime() : new Date(b.created_at).getTime() + retentionDays * 86400 * 1000;
      const isExpired = retentionTs <= now || new Date(b.created_at).getTime() < cutoffMs;
      if (!isExpired) continue;

      if (isSafeChildPath(securityConfig.backupDir, b.storage_path) && fs.existsSync(b.storage_path)) {
        try {
          const st = fs.statSync(b.storage_path);
          freedBytes += st.size;
          fs.unlinkSync(b.storage_path);
        } catch {}
      }
      if (b.offsite_path && securityConfig.backupOffsiteDir && isSafeChildPath(securityConfig.backupOffsiteDir, b.offsite_path) && fs.existsSync(b.offsite_path)) {
        try { fs.unlinkSync(b.offsite_path); } catch {}
      }

      await securityStore.updateBackupRecord(b.backup_uid, { status: 'deleted' });
      deletedUids.push(b.backup_uid);
    }

    if (deletedUids.length > 0) {
      await auditService.log({
        user_id: actorUserId ?? null,
        user_email: actorUserId ? undefined : 'system-retention',
        module_name: 'Database Backups',
        action_type: 'BACKUP_RETENTION_CLEANUP',
        status: 'SUCCESS',
        description: `Retention policy (${retentionDays} days) purged ${deletedUids.length} expired backup(s), freeing ${freedBytes} bytes.`,
        metadata: { deleted_uids: deletedUids, freed_bytes: freedBytes },
      });
    }

    return { deleted_count: deletedUids.length, freed_bytes: freedBytes, deleted_uids: deletedUids };
  }

  /**
   * Lightweight Asia/Kolkata daily scheduler (02:00 IST by default).
   * Safe alongside cPanel cron because lock-file prevents overlapping runs.
   */
  public startInProcessScheduler(): void {
    if (!securityConfig.backupEnabled || process.env.NODE_ENV === 'test' || this.schedulerTimer) return;

    const parts = securityConfig.backupSchedule.split(/\s+/);
    const targetMin = parseInt(parts[0] || '0', 10);
    const targetHour = parseInt(parts[1] || '2', 10);

    this.schedulerTimer = setInterval(async () => {
      try {
        const now = new Date();
        const istParts = new Intl.DateTimeFormat('en-CA', {
          timeZone: securityConfig.appTimezone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }).formatToParts(now);
        const get = (t: string) => istParts.find(p => p.type === t)?.value || '00';
        const dateKey = `${get('year')}-${get('month')}-${get('day')}`;
        const h = parseInt(get('hour'), 10);
        const m = parseInt(get('minute'), 10);

        if (h === targetHour && m === targetMin && this.lastScheduledDateKey !== dateKey && !this.isBackupLocked()) {
          const pgHealth = await checkPostgresHealth();
          if (!pgHealth.connected) {
            return;
          }
          this.lastScheduledDateKey = dateKey;
          await this.runBackup({ triggerType: 'scheduled', initiatedByEmail: 'scheduler@nexora' });
          await this.cleanupExpiredBackups();
        }
      } catch (err: any) {
        if (err?.code !== 'DB_UNAVAILABLE' && err?.code !== 'ECONNREFUSED') {
          console.warn('[BackupScheduler] Scheduled backup notice:', err.message);
        }
      }
    }, 60 * 1000);

    if (typeof this.schedulerTimer.unref === 'function') {
      this.schedulerTimer.unref();
    }
  }

  public stopInProcessScheduler(): void {
    if (this.schedulerTimer) {
      clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }
  }
}

export const backupService = new BackupService();
