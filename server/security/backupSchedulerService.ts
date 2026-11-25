/**
 * NEXORA ERP — Persistent PostgreSQL Backup Multi-Scheduler & Streaming pg_dump Engine
 *
 * Strict Architecture Guarantees:
 * - PostgreSQL ONLY: All schedulers, execution logs, and audit trails are stored in PostgreSQL.
 * - ZERO sample/seed schedulers: Starts empty until an administrator creates a schedule.
 * - Streaming pg_dump (-Fc) piped through AES-256-GCM encryption + SHA-256 hashing (no full-file RAM buffering).
 * - Multi-instance duplicate-run protection via PostgreSQL advisory lock (`pg_try_advisory_lock`).
 * - Timezone-aware scheduling (Asia/Kolkata default) with safe monthly day clamping (e.g. Feb 28/29).
 * - Per-scheduler independent retention cleanup that NEVER deletes the last valid backup,
 *   another scheduler's backups, pre-restore recovery backups, or backups currently being restored.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { spawn } from 'child_process';
import { getDb, isDbReady, checkPostgresHealth } from '../db';
import { securityConfig } from './config';
import { runtimeConfig } from '../config/runtimeConfig';
import { securityMonitor } from './securityMonitor';
import { isMaintenanceModeActive } from './maintenanceMode';

export type BackupFrequency = 'daily' | 'weekly' | 'monthly';

export interface BackupSchedulerRecord {
  id: number;
  name: string;
  description: string;
  frequency: BackupFrequency;
  selected_days: number[] | null;
  monthly_day: number | null;
  scheduled_time: string;
  timezone: string;
  backup_type: 'full';
  destination_ref: string;
  retention_days: number;
  is_enabled: boolean;
  next_run_at: string | null;
  last_run_at: string | null;
  last_status: string;
  last_error: string | null;
  created_by: number | null;
  created_by_email: string | null;
  created_at: string;
  updated_by: number | null;
  updated_by_email: string | null;
  updated_at: string;
  deleted_at: string | null;
}

export interface BackupSchedulerInput {
  name: string;
  description?: string;
  frequency: BackupFrequency;
  selected_days?: number[] | null;
  monthly_day?: number | null;
  scheduled_time: string;
  timezone?: string;
  backup_type?: 'full';
  destination_ref?: string;
  retention_days: number;
  is_enabled?: boolean;
}

export interface BackupExecutionRecord {
  id: number;
  backup_uid: string;
  scheduler_id: number | null;
  scheduler_name: string | null;
  execution_type: 'automatic' | 'manual' | 'pre_restore' | 'cli';
  started_at: string;
  completed_at: string | null;
  duration_ms: number;
  destination_ref: string;
  archive_identifier: string;
  file_name: string;
  storage_path: string;
  file_size_bytes: number;
  pg_version: string | null;
  database_name: string | null;
  checksum_sha256: string;
  verification_status: 'pending' | 'verified' | 'failed' | 'missing' | 'corrupted';
  execution_status: 'running' | 'completed' | 'failed' | 'skipped';
  initiated_by: number | null;
  initiated_by_email: string;
  is_protected_recovery: boolean;
  error_details: string | null;
  notes: string | null;
  metadata?: Record<string, any>;
}

export interface BackupActor {
  id: number | null;
  email: string;
  ip?: string;
}

const STREAM_HEADER_MAGIC = Buffer.from('NXS1', 'ascii'); // 4 bytes
const STREAM_HEADER_SIZE = 32; // 4B magic + 12B IV + 16B reserved
const GCM_AUTH_TAG_LENGTH = 16;
const BACKUP_ADVISORY_LOCK_KEY = 88421009;

// Track active restore targets so retention cleanup NEVER deletes a backup currently being restored
const activeRestoreProtectedUids = new Set<string>();

export function markBackupProtectedForRestore(backupUid: string): void {
  activeRestoreProtectedUids.add(backupUid);
}

export function unmarkBackupProtectedForRestore(backupUid: string): void {
  activeRestoreProtectedUids.delete(backupUid);
}

export function getActiveRestoreProtectedUids(): Set<string> {
  return new Set(activeRestoreProtectedUids);
}

export function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat('en-US', { timeZone: tz }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function validateSchedulerInput(raw: Partial<BackupSchedulerInput>): {
  valid: boolean;
  errors: { field: string; message: string }[];
  normalized?: BackupSchedulerInput;
} {
  const errors: { field: string; message: string }[] = [];

  const name = String(raw.name || '').trim();
  if (!name || name.length < 2 || name.length > 160) {
    errors.push({ field: 'name', message: 'Scheduler name must be between 2 and 160 characters.' });
  }

  const frequency = String(raw.frequency || '').toLowerCase() as BackupFrequency;
  if (!['daily', 'weekly', 'monthly'].includes(frequency)) {
    errors.push({ field: 'frequency', message: 'Frequency must be daily, weekly, or monthly.' });
  }

  const scheduledTime = String(raw.scheduled_time || '').trim();
  if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(scheduledTime)) {
    errors.push({ field: 'scheduled_time', message: 'Scheduled time must use 24-hour HH:MM format (e.g., 02:00).' });
  }

  const timezone = String(raw.timezone || 'Asia/Kolkata').trim();
  if (!isValidTimezone(timezone)) {
    errors.push({ field: 'timezone', message: `Invalid IANA timezone "${timezone}".` });
  }

  const retentionDays = Number(raw.retention_days);
  if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 3650) {
    errors.push({ field: 'retention_days', message: 'Retention days must be a whole number between 1 and 3650.' });
  }

  let selectedDays: number[] | null = null;
  if (frequency === 'weekly') {
    const arr = Array.isArray(raw.selected_days) ? raw.selected_days.map(Number) : [];
    const uniqueValid = Array.from(new Set(arr.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))).sort(
      (a, b) => a - b
    );
    if (uniqueValid.length === 0) {
      errors.push({ field: 'selected_days', message: 'Select at least one day of the week (Sun–Sat) for a weekly schedule.' });
    }
    selectedDays = uniqueValid;
  }

  let monthlyDay: number | null = null;
  if (frequency === 'monthly') {
    const dayNum = Number(raw.monthly_day);
    if (!Number.isInteger(dayNum) || dayNum < 1 || dayNum > 31) {
      errors.push({ field: 'monthly_day', message: 'Monthly day of month must be an integer between 1 and 31.' });
    } else {
      monthlyDay = dayNum;
    }
  }

  const destinationRef = String(raw.destination_ref || 'local_encrypted_vault').trim() || 'local_encrypted_vault';
  if (destinationRef.length > 255 || /[<>|;&$`]/.test(destinationRef)) {
    errors.push({ field: 'destination_ref', message: 'Destination reference contains invalid characters.' });
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    errors: [],
    normalized: {
      name,
      description: String(raw.description || '').trim(),
      frequency,
      selected_days: selectedDays,
      monthly_day: monthlyDay,
      scheduled_time: scheduledTime,
      timezone,
      backup_type: 'full',
      destination_ref: destinationRef,
      retention_days: retentionDays,
      is_enabled: raw.is_enabled !== undefined ? Boolean(raw.is_enabled) : true,
    },
  };
}

/**
 * Helper: Extract calendar parts of a UTC Date in a specific IANA timezone.
 */
function getZonedDateParts(date: Date, timeZone: string): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number; // 0 = Sun ... 6 = Sat
} {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
    hourCycle: 'h23',
  });
  const parts = fmt.formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) {
    map[p.type] = p.value;
  }
  const wdMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour) % 24,
    minute: Number(map.minute),
    second: Number(map.second),
    weekday: wdMap[map.weekday] ?? 0,
  };
}

/**
 * Convert a wall-clock time (year, month 1..12, day, hour, minute) in an IANA timezone to a UTC Date.
 */
export function zonedWallTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string
): Date {
  // Initial guess treating wall clock as UTC
  const guessMs = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let candidate = new Date(guessMs);
  for (let i = 0; i < 3; i++) {
    const actual = getZonedDateParts(candidate, timeZone);
    const actualAsUtc = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second,
      0
    );
    const targetAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
    const diffMs = targetAsUtc - actualAsUtc;
    if (diffMs === 0) break;
    candidate = new Date(candidate.getTime() + diffMs);
  }
  return candidate;
}

export function daysInMonth(year: number, month1Based: number): number {
  return new Date(Date.UTC(year, month1Based, 0)).getUTCDate();
}

/**
 * Computes the exact next scheduled execution timestamp (UTC ISO) for Daily, Weekly, or Monthly
 * schedules in the configured IANA timezone (default Asia/Kolkata).
 * Safely clamps monthly day (e.g., 31 -> 28/29 in Feb, 30 in Apr/Jun/Sep/Nov).
 */
export function computeNextExecution(
  schedule: {
    frequency: BackupFrequency;
    selected_days?: number[] | null;
    monthly_day?: number | null;
    scheduled_time: string;
    timezone?: string;
  },
  fromDate: Date = new Date()
): Date {
  const tz = schedule.timezone && isValidTimezone(schedule.timezone) ? schedule.timezone : 'Asia/Kolkata';
  const [hourStr, minStr] = (schedule.scheduled_time || '02:00').split(':');
  const targetHour = Number(hourStr) || 0;
  const targetMin = Number(minStr) || 0;

  const nowParts = getZonedDateParts(fromDate, tz);

  if (schedule.frequency === 'daily') {
    const todayCandidate = zonedWallTimeToUtc(
      nowParts.year,
      nowParts.month,
      nowParts.day,
      targetHour,
      targetMin,
      tz
    );
    if (todayCandidate.getTime() > fromDate.getTime()) {
      return todayCandidate;
    }
    const nextDayRef = new Date(Date.UTC(nowParts.year, nowParts.month - 1, nowParts.day + 1));
    return zonedWallTimeToUtc(
      nextDayRef.getUTCFullYear(),
      nextDayRef.getUTCMonth() + 1,
      nextDayRef.getUTCDate(),
      targetHour,
      targetMin,
      tz
    );
  }

  if (schedule.frequency === 'weekly') {
    const days = Array.isArray(schedule.selected_days) && schedule.selected_days.length > 0
      ? Array.from(new Set(schedule.selected_days.map(Number).filter((d) => d >= 0 && d <= 6)))
      : [0];

    for (let offset = 0; offset <= 14; offset++) {
      const ref = new Date(Date.UTC(nowParts.year, nowParts.month - 1, nowParts.day + offset));
      const candidate = zonedWallTimeToUtc(
        ref.getUTCFullYear(),
        ref.getUTCMonth() + 1,
        ref.getUTCDate(),
        targetHour,
        targetMin,
        tz
      );
      const parts = getZonedDateParts(candidate, tz);
      if (days.includes(parts.weekday) && candidate.getTime() > fromDate.getTime()) {
        return candidate;
      }
    }
  }

  // Monthly schedule with safe day clamping for shorter months (Feb 28/29, 30-day months)
  const requestedDay = Math.min(31, Math.max(1, Number(schedule.monthly_day) || 1));
  for (let mOffset = 0; mOffset <= 24; mOffset++) {
    const totalMonths = nowParts.year * 12 + (nowParts.month - 1) + mOffset;
    const year = Math.floor(totalMonths / 12);
    const month = (totalMonths % 12) + 1;
    const clampedDay = Math.min(requestedDay, daysInMonth(year, month));
    const candidate = zonedWallTimeToUtc(year, month, clampedDay, targetHour, targetMin, tz);
    if (candidate.getTime() > fromDate.getTime()) {
      return candidate;
    }
  }

  return new Date(fromDate.getTime() + 24 * 60 * 60 * 1000);
}

/**
 * Pure retention selection logic enforcing ALL safety guarantees:
 * 1. Never deletes the ONLY remaining valid verified backup.
 * 2. Never deletes pre-restore protected recovery backups (`is_protected_recovery = true`).
 * 3. Never deletes any backup currently being restored (`activeRestoreUids`).
 * 4. Only selects backups older than `retentionDays`.
 */
export function selectBackupsForRetentionCleanup(
  schedulerBackups: Array<{
    backup_uid: string;
    completed_at: string | null;
    started_at: string;
    verification_status: string;
    execution_status: string;
    is_protected_recovery: boolean;
  }>,
  retentionDays: number,
  activeRestoreUids: Set<string> = new Set(),
  now: Date = new Date()
): string[] {
  const cutoffMs = now.getTime() - Math.max(1, retentionDays) * 24 * 60 * 60 * 1000;

  // Sort newest first so we always preserve the newest valid verified backup
  const sorted = [...schedulerBackups].sort((a, b) => {
    const ta = new Date(a.completed_at || a.started_at).getTime();
    const tb = new Date(b.completed_at || b.started_at).getTime();
    return tb - ta;
  });

  const validVerified = sorted.filter(
    (b) => b.execution_status === 'completed' && b.verification_status === 'verified'
  );
  const newestValidUid = validVerified[0]?.backup_uid || null;

  const toDelete: string[] = [];
  let remainingValidCount = validVerified.length;

  for (const item of sorted) {
    if (item.is_protected_recovery) continue;
    if (activeRestoreUids.has(item.backup_uid)) continue;

    const ts = new Date(item.completed_at || item.started_at).getTime();
    if (Number.isNaN(ts) || ts >= cutoffMs) continue;

    const isValid = item.execution_status === 'completed' && item.verification_status === 'verified';
    if (isValid) {
      // Never delete the ONLY remaining valid backup
      if (remainingValidCount <= 1 || item.backup_uid === newestValidUid) {
        continue;
      }
      remainingValidCount--;
    }

    toDelete.push(item.backup_uid);
  }

  return toDelete;
}

function getBackupEncryptionKey(): Buffer {
  const cfgKey = securityConfig.backupEncryptionKey;
  if (Buffer.isBuffer(cfgKey) && cfgKey.length === 32) {
    return cfgKey;
  }
  const rawKey = typeof cfgKey === 'string' ? cfgKey : process.env.BACKUP_ENCRYPTION_KEY || '';
  if (rawKey.length >= 64 && /^[0-9a-fA-F]+$/.test(rawKey)) {
    return Buffer.from(rawKey.slice(0, 64), 'hex');
  }
  return crypto.createHash('sha256').update(rawKey || process.env.JWT_ACCESS_SECRET || 'nexora-backup-key').digest();
}

export function resolveSafeBackupFilePath(fileName: string): string {
  const backupDir = path.resolve(securityConfig.backupDir);
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
  }
  const safeBase = path.basename(fileName);
  const resolved = path.resolve(backupDir, safeBase);
  if (!resolved.startsWith(backupDir + path.sep)) {
    throw new Error('Invalid backup archive path outside configured backup directory.');
  }
  return resolved;
}

/**
 * Streaming AES-256-GCM decryption for `.pgdump.enc` archives produced by `streamEncryptedPgDump`.
 * Verifies GCM authentication tag AND archive SHA-256 checksum without buffering full files in RAM.
 */
export async function decryptStreamingBackupArchive(
  encryptedFilePath: string,
  outputPlainFilePath: string,
  expectedSha256?: string
): Promise<{ verified: boolean; sha256: string; sizeBytes: number }> {
  const backupDir = path.resolve(securityConfig.backupDir);
  const resolvedEnc = path.resolve(encryptedFilePath);
  const resolvedOut = path.resolve(outputPlainFilePath);
  if (!resolvedEnc.startsWith(backupDir + path.sep) || !resolvedOut.startsWith(backupDir + path.sep)) {
    throw new Error('Backup file path violates backup directory confinement.');
  }

  const stat = fs.statSync(resolvedEnc);
  if (stat.size <= STREAM_HEADER_SIZE + GCM_AUTH_TAG_LENGTH) {
    throw new Error('Backup archive is corrupted or truncated.');
  }

  // Verify full-file SHA-256 first via streaming
  const actualSha256 = await new Promise<string>((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const rs = fs.createReadStream(resolvedEnc);
    rs.on('data', (chunk) => hash.update(chunk));
    rs.on('error', reject);
    rs.on('end', () => resolve(hash.digest('hex')));
  });

  if (expectedSha256 && actualSha256 !== expectedSha256) {
    throw new Error('Backup archive SHA-256 checksum mismatch (file modified or corrupted).');
  }

  // Read fixed 32-byte header and 16-byte trailing GCM auth tag
  const fd = fs.openSync(resolvedEnc, 'r');
  const headerBuf = Buffer.alloc(STREAM_HEADER_SIZE);
  const tagBuf = Buffer.alloc(GCM_AUTH_TAG_LENGTH);
  try {
    fs.readSync(fd, headerBuf, 0, STREAM_HEADER_SIZE, 0);
    fs.readSync(fd, tagBuf, 0, GCM_AUTH_TAG_LENGTH, stat.size - GCM_AUTH_TAG_LENGTH);
  } finally {
    fs.closeSync(fd);
  }

  if (!headerBuf.subarray(0, 4).equals(STREAM_HEADER_MAGIC)) {
    throw new Error('Unrecognized streaming backup archive format.');
  }

  const iv = headerBuf.subarray(4, 16);
  const key = getBackupEncryptionKey();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tagBuf);

  const cipherEnd = stat.size - GCM_AUTH_TAG_LENGTH - 1;
  await new Promise<void>((resolve, reject) => {
    const input = fs.createReadStream(resolvedEnc, { start: STREAM_HEADER_SIZE, end: cipherEnd });
    const output = fs.createWriteStream(resolvedOut, { mode: 0o600 });

    const onError = (err: Error) => {
      input.destroy();
      output.destroy();
      try {
        if (fs.existsSync(resolvedOut)) fs.unlinkSync(resolvedOut);
      } catch {}
      reject(err);
    };

    input.on('error', onError);
    decipher.on('error', onError);
    output.on('error', onError);
    output.on('finish', () => resolve());

    input.pipe(decipher).pipe(output);
  });

  return { verified: true, sha256: actualSha256, sizeBytes: stat.size };
}

/**
 * Streams `pg_dump --format=custom` through AES-256-GCM encryption directly to disk.
 * Never loads the full PostgreSQL dump into memory and never uses shell string interpolation.
 */
async function streamEncryptedPgDump(
  databaseUrl: string,
  destinationPath: string
): Promise<{ fileSizeBytes: number; sha256: string }> {
  const key = getBackupEncryptionKey();
  const iv = crypto.randomBytes(12);
  const header = Buffer.alloc(STREAM_HEADER_SIZE, 0);
  STREAM_HEADER_MAGIC.copy(header, 0);
  iv.copy(header, 4);

  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const fileHash = crypto.createHash('sha256');
  const outStream = fs.createWriteStream(destinationPath, { mode: 0o600 });

  let totalBytes = 0;
  const writeChunk = (buf: Buffer): Promise<void> =>
    new Promise((resolve, reject) => {
      fileHash.update(buf);
      totalBytes += buf.length;
      if (!outStream.write(buf)) {
        outStream.once('drain', resolve);
        outStream.once('error', reject);
      } else {
        resolve();
      }
    });

  await writeChunk(header);

  return new Promise((resolve, reject) => {
    let stderrBuf = '';
    const child = spawn(
      'pg_dump',
      ['--format=custom', '--no-owner', '--no-acl', databaseUrl],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
      }
    );

    let finished = false;
    const fail = (err: Error) => {
      if (finished) return;
      finished = true;
      try {
        outStream.destroy();
        if (fs.existsSync(destinationPath)) fs.unlinkSync(destinationPath);
      } catch {}
      reject(err);
    };

    child.on('error', (err: NodeJS.ErrnoException) => {
      const msg =
        err.code === 'ENOENT'
          ? 'PostgreSQL `pg_dump` utility is not installed or not in PATH on this server.'
          : `pg_dump spawn error: ${err.message}`;
      fail(new Error(msg));
    });

    child.stderr.on('data', (chunk) => {
      if (stderrBuf.length < 4096) stderrBuf += chunk.toString('utf8');
    });

    child.stdout.on('data', (chunk: Buffer) => {
      try {
        const enc = cipher.update(chunk);
        if (enc.length > 0) {
          fileHash.update(enc);
          totalBytes += enc.length;
          if (!outStream.write(enc)) {
            child.stdout.pause();
            outStream.once('drain', () => child.stdout.resume());
          }
        }
      } catch (err: any) {
        fail(err);
      }
    });

    child.on('close', (code) => {
      if (finished) return;
      if (code !== 0) {
        fail(new Error(`pg_dump exited with code ${code}: ${stderrBuf.trim() || 'Unknown pg_dump error'}`));
        return;
      }

      try {
        const finalEnc = cipher.final();
        const authTag = cipher.getAuthTag();
        if (finalEnc.length > 0) {
          fileHash.update(finalEnc);
          totalBytes += finalEnc.length;
          outStream.write(finalEnc);
        }
        fileHash.update(authTag);
        totalBytes += authTag.length;
        outStream.end(authTag, () => {
          finished = true;
          resolve({ fileSizeBytes: totalBytes, sha256: fileHash.digest('hex') });
        });
      } catch (err: any) {
        fail(err);
      }
    });
  });
}

class BackupSchedulerService {
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private isTicking = false;
  private waitingForDatabase = false;
  private runningBackupUids = new Set<string>();

  start(): void {
    if (this.pollTimer) return;
    if (process.env.DISABLE_PG_FOR_TESTS === 'true') return;

    this.pollTimer = setInterval(() => {
      this.tickDueSchedulers().catch((err) => {
        if (err?.code !== 'DB_UNAVAILABLE' && err?.code !== 'ECONNREFUSED') {
          console.warn('[BackupScheduler] Tick warning:', err?.message || err);
        }
      });
    }, 30_000);

    if (typeof this.pollTimer.unref === 'function') {
      this.pollTimer.unref();
    }
    console.log('[BackupScheduler] Persistent PostgreSQL multi-scheduler polling active (30s interval).');
  }

  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  isBackupInProgress(): boolean {
    return this.runningBackupUids.size > 0;
  }

  async tickDueSchedulers(): Promise<void> {
    if (this.isTicking || isMaintenanceModeActive() || !isDbReady()) return;
    this.isTicking = true;

    try {
      const health = await checkPostgresHealth();
      if (!health.connected) {
        if (!this.waitingForDatabase) {
          this.waitingForDatabase = true;
          console.warn(
            '[BackupScheduler] PostgreSQL is currently unreachable — scheduler paused until database connectivity is restored.'
          );
        }
        return;
      }

      if (this.waitingForDatabase) {
        this.waitingForDatabase = false;
        console.log('[BackupScheduler] PostgreSQL connection restored — resuming scheduled backup checks.');
      }

      const db = await getDb({ silent: true });
      const dueRes = await db.query(
        `SELECT * FROM backup_schedulers
         WHERE deleted_at IS NULL
           AND is_enabled = TRUE
           AND next_run_at IS NOT NULL
           AND next_run_at <= NOW()
         ORDER BY next_run_at ASC`
      );

      for (const scheduler of dueRes.rows || []) {
        if (isMaintenanceModeActive()) break;
        await this.executeBackupJob({
          scheduler,
          executionType: 'automatic',
          actor: { id: null, email: 'scheduler@system' },
          notes: `Scheduled ${scheduler.frequency} full PostgreSQL backup (${scheduler.name})`,
        });
      }
    } catch (err: any) {
      // Ignore transient DB unavailability or unmigrated table before `npm run db:update`
      if (err?.code === 'DB_UNAVAILABLE' || err?.code === 'ECONNREFUSED') {
        if (!this.waitingForDatabase) {
          this.waitingForDatabase = true;
          console.warn(
            '[BackupScheduler] PostgreSQL became unreachable during scheduler check — pausing until connectivity returns.'
          );
        }
      } else if (err?.code !== '42P01') {
        console.error('[BackupScheduler] Failed checking due schedulers:', err?.message || err);
      }
    } finally {
      this.isTicking = false;
    }
  }

  async getStats(): Promise<{
    total_schedulers: number;
    enabled_schedulers: number;
    disabled_schedulers: number;
    next_upcoming_backup: string | null;
    last_backup_at: string | null;
    last_backup_status: string | null;
    total_verified_backups: number;
    failed_backups_count: number;
  }> {
    const db = await getDb();
    const schedRes = await db.query(`
      SELECT
        COUNT(*)::int AS total_schedulers,
        COUNT(*) FILTER (WHERE is_enabled = TRUE)::int AS enabled_schedulers,
        COUNT(*) FILTER (WHERE is_enabled = FALSE)::int AS disabled_schedulers,
        MIN(next_run_at) FILTER (WHERE is_enabled = TRUE) AS next_upcoming_backup
      FROM backup_schedulers
      WHERE deleted_at IS NULL
    `);

    const execRes = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE execution_status = 'completed' AND verification_status = 'verified')::int AS total_verified_backups,
        COUNT(*) FILTER (WHERE execution_status = 'failed')::int AS failed_backups_count
      FROM backup_execution_history
    `);

    const lastRes = await db.query(`
      SELECT started_at, completed_at, execution_status
      FROM backup_execution_history
      ORDER BY started_at DESC
      LIMIT 1
    `);

    const s = schedRes.rows[0] || {};
    const e = execRes.rows[0] || {};
    const l = lastRes.rows[0] || null;

    return {
      total_schedulers: Number(s.total_schedulers || 0),
      enabled_schedulers: Number(s.enabled_schedulers || 0),
      disabled_schedulers: Number(s.disabled_schedulers || 0),
      next_upcoming_backup: s.next_upcoming_backup ? new Date(s.next_upcoming_backup).toISOString() : null,
      last_backup_at: l ? new Date(l.completed_at || l.started_at).toISOString() : null,
      last_backup_status: l ? String(l.execution_status) : null,
      total_verified_backups: Number(e.total_verified_backups || 0),
      failed_backups_count: Number(e.failed_backups_count || 0),
    };
  }

  async listSchedulers(filters: {
    search?: string;
    frequency?: string;
    status?: string;
    last_status?: string;
  } = {}): Promise<BackupSchedulerRecord[]> {
    const db = await getDb();
    const params: any[] = [];
    let sql = `SELECT * FROM backup_schedulers WHERE deleted_at IS NULL`;

    if (filters.frequency && ['daily', 'weekly', 'monthly'].includes(filters.frequency)) {
      params.push(filters.frequency);
      sql += ` AND frequency = $${params.length}`;
    }
    if (filters.status === 'enabled') {
      sql += ` AND is_enabled = TRUE`;
    } else if (filters.status === 'disabled') {
      sql += ` AND is_enabled = FALSE`;
    }
    if (filters.last_status && filters.last_status !== 'all') {
      params.push(filters.last_status);
      sql += ` AND last_status = $${params.length}`;
    }
    if (filters.search && filters.search.trim()) {
      params.push(`%${filters.search.trim()}%`);
      sql += ` AND (name ILIKE $${params.length} OR description ILIKE $${params.length} OR destination_ref ILIKE $${params.length})`;
    }

    sql += ` ORDER BY is_enabled DESC, next_run_at ASC NULLS LAST, id DESC`;
    const res = await db.query(sql, params);
    return res.rows || [];
  }

  async createScheduler(input: BackupSchedulerInput, actor: BackupActor): Promise<BackupSchedulerRecord> {
    const validated = validateSchedulerInput(input);
    if (!validated.valid || !validated.normalized) {
      const err: any = new Error(validated.errors[0]?.message || 'Invalid scheduler configuration.');
      err.statusCode = 400;
      err.errors = validated.errors;
      throw err;
    }

    const cfg = validated.normalized;
    const nextRun = cfg.is_enabled ? computeNextExecution(cfg, new Date()).toISOString() : null;
    const db = await getDb();
    const client = await db.connect();

    try {
      await client.query('BEGIN');
      const insertRes = await client.query(
        `INSERT INTO backup_schedulers
         (name, description, frequency, selected_days, monthly_day, scheduled_time, timezone, backup_type, destination_ref, retention_days, is_enabled, next_run_at, last_status, created_by, created_by_email, updated_by, updated_by_email, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'full', $8, $9, $10, $11, 'never_run', $12, $13, $12, $13, NOW(), NOW())
         RETURNING *`,
        [
          cfg.name,
          cfg.description || '',
          cfg.frequency,
          cfg.selected_days,
          cfg.monthly_day,
          cfg.scheduled_time,
          cfg.timezone,
          cfg.destination_ref,
          cfg.retention_days,
          cfg.is_enabled,
          nextRun,
          actor.id,
          actor.email,
        ]
      );
      const created = insertRes.rows[0];

      await client.query(
        `INSERT INTO backup_scheduler_audit_history
         (scheduler_id, scheduler_name, action, previous_config, new_config, performed_by, performed_by_email, performed_at)
         VALUES ($1, $2, 'CREATED', NULL, $3::jsonb, $4, $5, NOW())`,
        [created.id, created.name, JSON.stringify(created), actor.id, actor.email]
      );

      await client.query('COMMIT');
      return created;
    } catch (err: any) {
      await client.query('ROLLBACK').catch(() => {});
      if (err?.code === '23505') {
        const dup: any = new Error(`A backup scheduler named "${cfg.name}" already exists.`);
        dup.statusCode = 409;
        dup.errors = [{ field: 'name', message: 'Scheduler name must be unique.' }];
        throw dup;
      }
      throw err;
    } finally {
      client.release();
    }
  }

  async updateScheduler(
    id: number,
    input: Partial<BackupSchedulerInput>,
    actor: BackupActor
  ): Promise<BackupSchedulerRecord> {
    const db = await getDb();
    const existingRes = await db.query(
      `SELECT * FROM backup_schedulers WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
      [id]
    );
    if (!existingRes.rows || existingRes.rows.length === 0) {
      const notFound: any = new Error('Backup scheduler not found.');
      notFound.statusCode = 404;
      throw notFound;
    }
    const prev = existingRes.rows[0];

    const merged: Partial<BackupSchedulerInput> = {
      name: input.name !== undefined ? input.name : prev.name,
      description: input.description !== undefined ? input.description : prev.description,
      frequency: input.frequency !== undefined ? input.frequency : prev.frequency,
      selected_days: input.selected_days !== undefined ? input.selected_days : prev.selected_days,
      monthly_day: input.monthly_day !== undefined ? input.monthly_day : prev.monthly_day,
      scheduled_time: input.scheduled_time !== undefined ? input.scheduled_time : prev.scheduled_time,
      timezone: input.timezone !== undefined ? input.timezone : prev.timezone,
      destination_ref: input.destination_ref !== undefined ? input.destination_ref : prev.destination_ref,
      retention_days: input.retention_days !== undefined ? input.retention_days : prev.retention_days,
      is_enabled: input.is_enabled !== undefined ? input.is_enabled : prev.is_enabled,
    };

    const validated = validateSchedulerInput(merged);
    if (!validated.valid || !validated.normalized) {
      const err: any = new Error(validated.errors[0]?.message || 'Invalid scheduler configuration.');
      err.statusCode = 400;
      err.errors = validated.errors;
      throw err;
    }

    const cfg = validated.normalized;
    const nextRun = cfg.is_enabled ? computeNextExecution(cfg, new Date()).toISOString() : null;

    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const updRes = await client.query(
        `UPDATE backup_schedulers
         SET name = $1,
             description = $2,
             frequency = $3,
             selected_days = $4,
             monthly_day = $5,
             scheduled_time = $6,
             timezone = $7,
             destination_ref = $8,
             retention_days = $9,
             is_enabled = $10,
             next_run_at = $11,
             updated_by = $12,
             updated_by_email = $13,
             updated_at = NOW()
         WHERE id = $14
         RETURNING *`,
        [
          cfg.name,
          cfg.description || '',
          cfg.frequency,
          cfg.selected_days,
          cfg.monthly_day,
          cfg.scheduled_time,
          cfg.timezone,
          cfg.destination_ref,
          cfg.retention_days,
          cfg.is_enabled,
          nextRun,
          actor.id,
          actor.email,
          id,
        ]
      );
      const updated = updRes.rows[0];

      await client.query(
        `INSERT INTO backup_scheduler_audit_history
         (scheduler_id, scheduler_name, action, previous_config, new_config, performed_by, performed_by_email, performed_at)
         VALUES ($1, $2, 'UPDATED', $3::jsonb, $4::jsonb, $5, $6, NOW())`,
        [id, updated.name, JSON.stringify(prev), JSON.stringify(updated), actor.id, actor.email]
      );

      await client.query('COMMIT');
      return updated;
    } catch (err: any) {
      await client.query('ROLLBACK').catch(() => {});
      if (err?.code === '23505') {
        const dup: any = new Error(`A backup scheduler named "${cfg.name}" already exists.`);
        dup.statusCode = 409;
        throw dup;
      }
      throw err;
    } finally {
      client.release();
    }
  }

  async toggleScheduler(id: number, isEnabled: boolean, actor: BackupActor): Promise<BackupSchedulerRecord> {
    const db = await getDb();
    const existingRes = await db.query(
      `SELECT * FROM backup_schedulers WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
      [id]
    );
    if (!existingRes.rows || existingRes.rows.length === 0) {
      const notFound: any = new Error('Backup scheduler not found.');
      notFound.statusCode = 404;
      throw notFound;
    }
    const prev = existingRes.rows[0];
    const nextRun = isEnabled
      ? computeNextExecution(
          {
            frequency: prev.frequency,
            selected_days: prev.selected_days,
            monthly_day: prev.monthly_day,
            scheduled_time: prev.scheduled_time,
            timezone: prev.timezone,
          },
          new Date()
        ).toISOString()
      : null;

    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const updRes = await client.query(
        `UPDATE backup_schedulers
         SET is_enabled = $1, next_run_at = $2, updated_by = $3, updated_by_email = $4, updated_at = NOW()
         WHERE id = $5
         RETURNING *`,
        [isEnabled, nextRun, actor.id, actor.email, id]
      );
      const updated = updRes.rows[0];

      await client.query(
        `INSERT INTO backup_scheduler_audit_history
         (scheduler_id, scheduler_name, action, previous_config, new_config, performed_by, performed_by_email, performed_at)
         VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, NOW())`,
        [
          id,
          updated.name,
          isEnabled ? 'ENABLED' : 'DISABLED',
          JSON.stringify(prev),
          JSON.stringify(updated),
          actor.id,
          actor.email,
        ]
      );
      await client.query('COMMIT');
      return updated;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Soft-deletes a scheduler configuration without EVER deleting existing backup archives,
   * execution history, or interrupting an in-flight backup job.
   */
  async deleteScheduler(id: number, actor: BackupActor): Promise<{ id: number; name: string }> {
    const db = await getDb();
    const existingRes = await db.query(
      `SELECT * FROM backup_schedulers WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
      [id]
    );
    if (!existingRes.rows || existingRes.rows.length === 0) {
      const notFound: any = new Error('Backup scheduler not found.');
      notFound.statusCode = 404;
      throw notFound;
    }
    const prev = existingRes.rows[0];

    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE backup_schedulers
         SET is_enabled = FALSE, next_run_at = NULL, deleted_at = NOW(), updated_by = $1, updated_by_email = $2, updated_at = NOW()
         WHERE id = $3`,
        [actor.id, actor.email, id]
      );
      await client.query(
        `INSERT INTO backup_scheduler_audit_history
         (scheduler_id, scheduler_name, action, previous_config, new_config, performed_by, performed_by_email, performed_at)
         VALUES ($1, $2, 'DELETED', $3::jsonb, NULL, $4, $5, NOW())`,
        [id, prev.name, JSON.stringify(prev), actor.id, actor.email]
      );
      await client.query('COMMIT');
      return { id: prev.id, name: prev.name };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  async runSchedulerNow(id: number, actor: BackupActor): Promise<BackupExecutionRecord> {
    const db = await getDb();
    const res = await db.query(
      `SELECT * FROM backup_schedulers WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
      [id]
    );
    if (!res.rows || res.rows.length === 0) {
      const notFound: any = new Error('Backup scheduler not found.');
      notFound.statusCode = 404;
      throw notFound;
    }
    const scheduler = res.rows[0];

    await db.query(
      `INSERT INTO backup_scheduler_audit_history
       (scheduler_id, scheduler_name, action, previous_config, new_config, performed_by, performed_by_email, performed_at)
       VALUES ($1, $2, 'TRIGGERED_NOW', NULL, $3::jsonb, $4, $5, NOW())`,
      [scheduler.id, scheduler.name, JSON.stringify({ trigger: 'manual_run_now' }), actor.id, actor.email]
    );

    return this.executeBackupJob({
      scheduler,
      executionType: 'manual',
      actor,
      notes: `Manual immediate run for scheduler "${scheduler.name}"`,
    });
  }

  async runManualBackup(
    options: {
      notes?: string;
      executionType?: 'manual' | 'pre_restore' | 'cli';
      isProtectedRecovery?: boolean;
      destinationRef?: string;
    },
    actor: BackupActor
  ): Promise<BackupExecutionRecord> {
    return this.executeBackupJob({
      scheduler: null,
      executionType: options.executionType || 'manual',
      actor,
      notes: options.notes || 'On-demand PostgreSQL database backup',
      isProtectedRecovery: Boolean(options.isProtectedRecovery),
      destinationRef: options.destinationRef || 'local_encrypted_vault',
    });
  }

  /**
   * Executes a single PostgreSQL streaming encrypted backup with advisory locking,
   * metadata recording, SHA-256 verification, and per-scheduler retention cleanup.
   */
  async executeBackupJob(params: {
    scheduler: BackupSchedulerRecord | null;
    executionType: 'automatic' | 'manual' | 'pre_restore' | 'cli';
    actor: BackupActor;
    notes?: string;
    isProtectedRecovery?: boolean;
    destinationRef?: string;
  }): Promise<BackupExecutionRecord> {
    if (isMaintenanceModeActive() && params.executionType !== 'pre_restore') {
      const err: any = new Error('Cannot start a backup while production maintenance mode is active.');
      err.statusCode = 503;
      throw err;
    }

    const databaseUrl = runtimeConfig.databaseUrl || process.env.DATABASE_URL || '';
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is not configured. PostgreSQL backup cannot run.');
    }

    const db = await getDb();
    const lockClient = await db.connect();
    let lockAcquired = false;

    const startedAt = new Date();
    const startedMs = Date.now();
    const backupUid = `bkp_${startedAt.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}_${crypto
      .randomBytes(4)
      .toString('hex')}`;
    const fileName = `nexora_pg_${backupUid}.pgdump.enc`;
    const storagePath = resolveSafeBackupFilePath(fileName);
    const destRef = params.scheduler?.destination_ref || params.destinationRef || 'local_encrypted_vault';

    try {
      // Acquire PostgreSQL session advisory lock to prevent overlapping backup executions
      const lockRes = await lockClient.query(`SELECT pg_try_advisory_lock($1) AS locked`, [
        BACKUP_ADVISORY_LOCK_KEY,
      ]);
      lockAcquired = Boolean(lockRes.rows[0]?.locked);
      if (!lockAcquired) {
        const conflict: any = new Error('Another PostgreSQL backup job is currently running. Please wait for it to finish.');
        conflict.statusCode = 409;
        throw conflict;
      }

      this.runningBackupUids.add(backupUid);

      // Query current database name & PostgreSQL version
      const infoRes = await lockClient.query(
        `SELECT current_database() AS db_name, version() AS pg_version`
      );
      const dbName = String(infoRes.rows[0]?.db_name || 'nexora');
      const pgVersion = String(infoRes.rows[0]?.pg_version || '').slice(0, 120);

      // Insert initial RUNNING execution row
      await db.query(
        `INSERT INTO backup_execution_history
         (backup_uid, scheduler_id, scheduler_name, execution_type, started_at, destination_ref, archive_identifier, file_name, storage_path, file_size_bytes, pg_version, database_name, checksum_sha256, verification_status, execution_status, initiated_by, initiated_by_email, is_protected_recovery, notes, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0, $10, $11, 'pending', 'pending', 'running', $12, $13, $14, $15, $16::jsonb)`,
        [
          backupUid,
          params.scheduler?.id || null,
          params.scheduler?.name || null,
          params.executionType,
          startedAt.toISOString(),
          destRef,
          fileName,
          fileName,
          storagePath,
          pgVersion,
          dbName,
          params.actor.id,
          params.actor.email,
          Boolean(params.isProtectedRecovery),
          params.notes || null,
          JSON.stringify({ format: 'pg_dump_custom_aes256gcm_stream' }),
        ]
      );

      // Run streaming pg_dump -> AES-256-GCM -> disk
      const dumpResult = await streamEncryptedPgDump(databaseUrl, storagePath);

      // Verify archive exists, is non-empty, and SHA-256 matches
      const verifiedStat = fs.statSync(storagePath);
      const isVerified = verifiedStat.size > STREAM_HEADER_SIZE + GCM_AUTH_TAG_LENGTH && dumpResult.sha256.length === 64;
      const durationMs = Date.now() - startedMs;
      const completedAt = new Date().toISOString();

      const updateRes = await db.query(
        `UPDATE backup_execution_history
         SET completed_at = $1,
             duration_ms = $2,
             file_size_bytes = $3,
             checksum_sha256 = $4,
             verification_status = $5,
             execution_status = 'completed'
         WHERE backup_uid = $6
         RETURNING *`,
        [
          completedAt,
          durationMs,
          dumpResult.fileSizeBytes,
          dumpResult.sha256,
          isVerified ? 'verified' : 'failed',
          backupUid,
        ]
      );
      const completedRow: BackupExecutionRecord = updateRes.rows[0];

      // Mirror into legacy database_backup_history table for existing dashboards
      try {
        await db.query(
          `INSERT INTO database_backup_history
           (backup_uid, backup_type, storage_path, file_name, encrypted, encryption_algo, file_size_bytes, checksum_sha256, pg_status, json_store_status, status, verified, verified_at, initiated_by, notes, duration_ms, created_at)
           VALUES ($1, $2, $3, $4, TRUE, 'aes-256-gcm', $5, $6, 'completed', 'removed', 'completed', $7, $8, $9, $10, $11, $8)
           ON CONFLICT (backup_uid) DO NOTHING`,
          [
            backupUid,
            params.executionType,
            storagePath,
            fileName,
            dumpResult.fileSizeBytes,
            dumpResult.sha256,
            isVerified,
            completedAt,
            params.actor.email,
            params.notes || null,
            durationMs,
          ]
        );
      } catch {}

      // Update scheduler next_run_at & last_run_at if triggered by a scheduler
      if (params.scheduler) {
        const freshSched = await db.query(
          `SELECT * FROM backup_schedulers WHERE id = $1 LIMIT 1`,
          [params.scheduler.id]
        );
        const schedNow = freshSched.rows[0];
        if (schedNow && !schedNow.deleted_at) {
          const nextRun = schedNow.is_enabled
            ? computeNextExecution(
                {
                  frequency: schedNow.frequency,
                  selected_days: schedNow.selected_days,
                  monthly_day: schedNow.monthly_day,
                  scheduled_time: schedNow.scheduled_time,
                  timezone: schedNow.timezone,
                },
                new Date()
              ).toISOString()
            : null;

          await db.query(
            `UPDATE backup_schedulers
             SET last_run_at = $1, last_status = 'completed', last_error = NULL, next_run_at = $2, updated_at = NOW()
             WHERE id = $3`,
            [completedAt, nextRun, schedNow.id]
          );

          // Per-scheduler independent retention cleanup
          await this.applyRetentionForScheduler(schedNow.id, Number(schedNow.retention_days || 30));
        }
      }

      return completedRow;
    } catch (err: any) {
      const durationMs = Date.now() - startedMs;
      const errMsg = err?.message || String(err);

      try {
        await db.query(
          `UPDATE backup_execution_history
           SET completed_at = NOW(),
               duration_ms = $1,
               verification_status = 'failed',
               execution_status = 'failed',
               error_details = $2
           WHERE backup_uid = $3`,
          [durationMs, errMsg, backupUid]
        );
      } catch {}

      if (params.scheduler) {
        try {
          const nextRun = params.scheduler.is_enabled
            ? computeNextExecution(
                {
                  frequency: params.scheduler.frequency,
                  selected_days: params.scheduler.selected_days,
                  monthly_day: params.scheduler.monthly_day,
                  scheduled_time: params.scheduler.scheduled_time,
                  timezone: params.scheduler.timezone,
                },
                new Date()
              ).toISOString()
            : null;

          await db.query(
            `UPDATE backup_schedulers
             SET last_run_at = NOW(), last_status = 'failed', last_error = $1, next_run_at = $2, updated_at = NOW()
             WHERE id = $3 AND deleted_at IS NULL`,
            [errMsg, nextRun, params.scheduler.id]
          );
        } catch {}
      }

      // Notify Super Admin on backup failure
      try {
        await securityMonitor.raiseEvent({
          event_code: 'BACKUP_FAILURE',
          severity: 'HIGH',
          title: params.scheduler
            ? `Scheduled PostgreSQL Backup Failed (${params.scheduler.name})`
            : 'PostgreSQL Database Backup Failed',
          description: `Backup ${backupUid} failed after ${durationMs}ms: ${errMsg}`,
          user_email: params.actor.email,
          details: {
            backup_uid: backupUid,
            scheduler_id: params.scheduler?.id || null,
            execution_type: params.executionType,
          },
          notifyAdmin: true,
        });
      } catch {}

      throw err;
    } finally {
      this.runningBackupUids.delete(backupUid);
      if (lockAcquired) {
        await lockClient.query(`SELECT pg_advisory_unlock($1)`, [BACKUP_ADVISORY_LOCK_KEY]).catch(() => {});
      }
      lockClient.release();
    }
  }

  async applyRetentionForScheduler(schedulerId: number, retentionDays: number): Promise<number> {
    const db = await getDb();
    const res = await db.query(
      `SELECT backup_uid, storage_path, completed_at, started_at, verification_status, execution_status, is_protected_recovery
       FROM backup_execution_history
       WHERE scheduler_id = $1
       ORDER BY started_at DESC`,
      [schedulerId]
    );

    const candidateUids = selectBackupsForRetentionCleanup(
      res.rows || [],
      retentionDays,
      getActiveRestoreProtectedUids()
    );

    let removed = 0;
    const backupDir = path.resolve(securityConfig.backupDir);

    for (const uid of candidateUids) {
      const row = (res.rows || []).find((r: any) => r.backup_uid === uid);
      if (!row) continue;

      try {
        const resolved = path.resolve(String(row.storage_path || ''));
        if (resolved.startsWith(backupDir + path.sep) && fs.existsSync(resolved)) {
          fs.unlinkSync(resolved);
        }
        await db.query(
          `UPDATE backup_execution_history
           SET metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb
           WHERE backup_uid = $2`,
          [JSON.stringify({ pruned_by_retention: true, pruned_at: new Date().toISOString() }), uid]
        );
        removed++;
      } catch (err: any) {
        console.error(`[BackupScheduler] Retention cleanup error for ${uid}:`, err?.message || err);
      }
    }

    return removed;
  }

  async listExecutionHistory(filters: {
    scheduler_id?: number;
    status?: string;
    execution_type?: string;
    search?: string;
    limit?: number;
  } = {}): Promise<BackupExecutionRecord[]> {
    const db = await getDb();
    const params: any[] = [];
    let sql = `SELECT * FROM backup_execution_history WHERE 1=1`;

    if (filters.scheduler_id) {
      params.push(filters.scheduler_id);
      sql += ` AND scheduler_id = $${params.length}`;
    }
    if (filters.status && filters.status !== 'all') {
      params.push(filters.status);
      sql += ` AND execution_status = $${params.length}`;
    }
    if (filters.execution_type && filters.execution_type !== 'all') {
      params.push(filters.execution_type);
      sql += ` AND execution_type = $${params.length}`;
    }
    if (filters.search && filters.search.trim()) {
      params.push(`%${filters.search.trim()}%`);
      sql += ` AND (backup_uid ILIKE $${params.length} OR file_name ILIKE $${params.length} OR COALESCE(scheduler_name, '') ILIKE $${params.length} OR COALESCE(notes, '') ILIKE $${params.length})`;
    }

    const limit = Math.min(200, Math.max(1, Number(filters.limit) || 100));
    params.push(limit);
    sql += ` ORDER BY started_at DESC LIMIT $${params.length}`;

    const res = await db.query(sql, params);
    return res.rows || [];
  }

  async listAuditHistory(limit = 100): Promise<any[]> {
    const db = await getDb();
    const safeLimit = Math.min(300, Math.max(1, Number(limit) || 100));
    const res = await db.query(
      `SELECT * FROM backup_scheduler_audit_history ORDER BY performed_at DESC LIMIT $1`,
      [safeLimit]
    );
    return res.rows || [];
  }
}

export const backupSchedulerService = new BackupSchedulerService();
