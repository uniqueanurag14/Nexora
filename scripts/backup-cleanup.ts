#!/usr/bin/env tsx
/**
 * Nexora ERP — CLI Backup Retention Cleanup Script (cPanel Cron Compatible)
 * Usage: npm run backup:cleanup
 */
import dotenv from 'dotenv';
dotenv.config();

import { backupService } from '../server/security/backupService';
import { securityConfig } from '../server/security/config';

async function main() {
  console.log(`[Nexora Backup Cleanup] Enforcing ${securityConfig.backupRetentionDays}-day retention policy...`);
  const result = await backupService.cleanupExpiredBackups(securityConfig.backupRetentionDays, null);
  console.log(
    `[Nexora Backup Cleanup] Completed | Deleted=${result.deleted_count} | Freed=${result.freed_bytes} bytes`
  );
  process.exit(0);
}

main();
