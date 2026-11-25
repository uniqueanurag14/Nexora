#!/usr/bin/env tsx
/**
 * Nexora ERP — CLI Audit Log Retention Cleanup Script (cPanel Cron Compatible)
 * Usage: npm run audit:cleanup
 */
import dotenv from 'dotenv';
dotenv.config();

import { securityConfig } from '../server/security/config';
import { securityStore } from '../server/security/securityStore';

async function main() {
  console.log(`[Nexora Audit Cleanup] Purging audit records older than ${securityConfig.auditLogRetentionDays} days...`);
  const removed = await securityStore.purgeExpiredAuditLogs(securityConfig.auditLogRetentionDays);
  console.log(`[Nexora Audit Cleanup] Completed | Purged=${removed} expired record(s)`);
  process.exit(0);
}

main();
