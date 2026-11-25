#!/usr/bin/env tsx
/**
 * Nexora ERP — CLI Backup Integrity & AES-256-GCM Verification Script
 * Usage: npm run backup:verify [optional_backup_uid]
 */
import dotenv from 'dotenv';
dotenv.config();

import { backupService } from '../server/security/backupService';
import { securityStore } from '../server/security/securityStore';

async function main() {
  const targetUid = process.argv[2];
  let uid = targetUid;

  if (!uid) {
    const latest = securityStore.getBackupHistory({ page: 1, limit: 1 }).items[0];
    if (!latest) {
      console.log('[Nexora Backup Verify] No backups found to verify.');
      process.exit(0);
    }
    uid = latest.backup_uid;
  }

  console.log(`[Nexora Backup Verify] Verifying ${uid}...`);
  const report = await backupService.verifyBackup(uid, null);
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.valid ? 0 : 1);
}

main();
