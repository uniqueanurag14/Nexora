#!/usr/bin/env tsx
/**
 * NEXORA ERP — CLI PostgreSQL Backup Command (`npm run db:backup` / `npm run backup:database`)
 *
 * Executes a streaming encrypted PostgreSQL `pg_dump -Fc` backup, computes SHA-256 checksum,
 * verifies archive integrity, and logs execution metadata into PostgreSQL `backup_execution_history`.
 */

import dotenv from 'dotenv';
dotenv.config();

import { closeDbPool } from '../server/db';
import { backupSchedulerService } from '../server/security/backupSchedulerService';

async function main() {
  const args = process.argv.slice(2);
  const noteIdx = args.indexOf('--notes');
  const notes = noteIdx >= 0 && args[noteIdx + 1] ? args[noteIdx + 1] : 'CLI PostgreSQL backup (`npm run db:backup`)';

  console.log('[db:backup] Starting streaming encrypted PostgreSQL backup...');
  try {
    const record = await backupSchedulerService.runManualBackup(
      {
        executionType: 'cli',
        notes,
      },
      { id: null, email: 'cli-operator@nexora' }
    );

    console.log('');
    console.log('=== NEXORA PostgreSQL Backup Completed ===');
    console.log(`Backup UID          : ${record.backup_uid}`);
    console.log(`Archive File        : ${record.file_name}`);
    console.log(`Size (bytes)        : ${record.file_size_bytes}`);
    console.log(`SHA-256 Checksum    : ${record.checksum_sha256}`);
    console.log(`Verification Status : ${record.verification_status}`);
    console.log(`Duration            : ${record.duration_ms}ms`);
  } catch (err: any) {
    console.error('[db:backup] FAILED:', err?.message || err);
    process.exitCode = 1;
  } finally {
    await closeDbPool().catch(() => {});
  }
}

main();
