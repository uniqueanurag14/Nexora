import express, { Request, Response } from 'express';
import * as XLSX from 'xlsx';
import { securityStore } from './securityStore';
import { auditService } from './auditService';
import { securityMonitor } from './securityMonitor';
import { backupService } from './backupService';
import { mfaService } from './mfaService';
import { securityConfig } from './config';
import { store } from '../store';

export interface SecurityRouteDeps {
  authenticateToken: express.RequestHandler;
  requirePermission: (code: string) => express.RequestHandler;
}

export function createSecurityRouter(deps: SecurityRouteDeps) {
  const router = express.Router();
  const { authenticateToken, requirePermission } = deps;

  // All /api/security/* routes require valid authentication
  router.use(authenticateToken);

  // 1. OVERVIEW DASHBOARD KPIs & CAPABILITIES
  router.get('/overview', requirePermission('settings.security.view'), async (_req: Request, res: Response) => {
    try {
      const metrics = securityStore.getOverviewMetrics();
      const integrity = auditService.verifyIntegrity();
      const capabilities = await backupService.detectCapabilities();
      const userId = (res.req as any)?.user?.id;
      const mfaState = userId ? securityStore.getUserMfa(userId) : null;

      res.json({
        success: true,
        data: {
          metrics,
          audit_integrity: integrity,
          backup_capabilities: capabilities,
          security_policy: {
            max_login_attempts: securityConfig.maxLoginAttempts,
            login_lockout_minutes: securityConfig.loginLockoutMinutes,
            session_idle_timeout_minutes: securityConfig.sessionIdleTimeoutMinutes,
            audit_log_retention_days: securityConfig.auditLogRetentionDays,
            backup_retention_days: securityConfig.backupRetentionDays,
            backup_schedule: securityConfig.backupSchedule,
            timezone: securityConfig.appTimezone,
            require_admin_mfa: securityConfig.requireAdminMfa,
          },
          current_user_mfa_enabled: Boolean(mfaState?.enabled),
          config_warnings: securityConfig.warnings,
        },
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // 2. LOGIN HISTORY
  router.get('/logins', requirePermission('settings.audit.view'), (req: Request, res: Response) => {
    const data = securityStore.getLoginHistory({
      search: req.query.search ? String(req.query.search) : undefined,
      user_id: req.query.user_id ? Number(req.query.user_id) : undefined,
      status: req.query.status ? String(req.query.status) : undefined,
      date_from: req.query.date_from ? String(req.query.date_from) : undefined,
      date_to: req.query.date_to ? String(req.query.date_to) : undefined,
      page: req.query.page as string,
      limit: req.query.limit as string,
    });
    res.json({ success: true, data });
  });

  // 3. DEVICE MONITORING & BLOCK / UNBLOCK / REVOKE
  router.get('/devices', requirePermission('settings.sessions.view'), (req: Request, res: Response) => {
    const data = securityStore.getDevices({
      search: req.query.search ? String(req.query.search) : undefined,
      user_id: req.query.user_id ? Number(req.query.user_id) : undefined,
      status: req.query.status ? String(req.query.status) : undefined,
      page: req.query.page as string,
      limit: req.query.limit as string,
    });
    res.json({ success: true, data });
  });

  router.post('/devices/:id/status', requirePermission('settings.sessions'), async (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    const { status, reason } = req.body || {};
    if (!['trusted', 'blocked', 'revoked'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Status must be trusted, blocked, or revoked.' });
    }
    const actor = (req as any).user;
    const updated = await securityStore.setDeviceStatus(id, status, actor.id, reason);
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Device record not found.' });
    }

    // Also revoke any matching sessions in legacy JSON store
    if (status === 'blocked' || status === 'revoked') {
      const legacySessions = store.getUserSessions(updated.user_id);
      for (const s of legacySessions) {
        if (s.user_agent === updated.user_agent) {
          store.revokeSession(s.id);
        }
      }
      await securityMonitor.raiseEvent({
        event_code: 'DEVICE_BLOCKED_BY_ADMIN',
        title: `Device ${status.toUpperCase()} by Administrator`,
        severity: 'MEDIUM',
        user_id: updated.user_id,
        username: updated.username ?? null,
        user_email: updated.user_email ?? null,
        ip_address: updated.last_ip_address || 'unknown',
        device_id: updated.device_id,
        device_name: updated.device_name,
        endpoint: req.originalUrl,
        description: `Administrator ${actor.email} marked device "${updated.device_name}" as ${status}. Active sessions bound to this device were revoked.`,
      });
    }

    (res.locals as any).__nexoraAudited = true;
    await auditService.log({
      req,
      module_name: 'Security Center',
      action_type: `DEVICE_${status.toUpperCase()}`,
      entity_type: 'UserDevice',
      entity_id: id,
      status: 'SUCCESS',
      description: `Changed device "${updated.device_name}" trust status to ${status}`,
      after_values: { trust_status: status, reason: reason || null },
    });

    res.json({ success: true, data: updated, message: `Device marked as ${status}.` });
  });

  // 4. ACTIVE SESSIONS MANAGEMENT
  router.get('/sessions', requirePermission('settings.sessions.view'), (req: Request, res: Response) => {
    const data = securityStore.getSessions({
      search: req.query.search ? String(req.query.search) : undefined,
      status: req.query.status ? String(req.query.status) : undefined,
      user_id: req.query.user_id ? Number(req.query.user_id) : undefined,
      page: req.query.page as string,
      limit: req.query.limit as string,
    });
    res.json({ success: true, data });
  });

  router.delete('/sessions/:id', requirePermission('settings.sessions'), async (req: Request, res: Response) => {
    const actor = (req as any).user;
    const reason = (req.body && req.body.reason) || 'Revoked by administrator from Security Center';
    const revoked = await securityStore.revokeSessionById(req.params.id, actor.id, reason);
    if (!revoked) {
      return res.status(404).json({ success: false, message: 'Session not found.' });
    }
    store.revokeToken(revoked.access_jti);

    (res.locals as any).__nexoraAudited = true;
    await auditService.log({
      req,
      module_name: 'Security Center',
      action_type: 'SESSION_REVOKED',
      entity_type: 'UserSession',
      entity_id: revoked.session_id,
      status: 'SUCCESS',
      description: `Revoked session ${revoked.session_id} for ${revoked.user_email || revoked.user_id} (${revoked.device_name || 'unknown device'})`,
    });

    res.json({ success: true, message: 'Session revoked immediately.', data: { session_id: revoked.session_id } });
  });

  router.post('/sessions/revoke-user/:userId', requirePermission('settings.sessions'), async (req: Request, res: Response) => {
    const targetUserId = parseInt(req.params.userId, 10);
    if (Number.isNaN(targetUserId)) {
      return res.status(400).json({ success: false, message: 'Valid user ID is required.' });
    }
    const actor = (req as any).user;
    const reason = (req.body && req.body.reason) || 'All sessions terminated by administrator';
    const revokedJtis = await securityStore.revokeAllUserSessions(targetUserId, actor.id, reason);
    for (const jti of revokedJtis) store.revokeToken(jti);
    store.revokeAllUserSessions(targetUserId);

    (res.locals as any).__nexoraAudited = true;
    await auditService.log({
      req,
      module_name: 'Security Center',
      action_type: 'USER_SESSIONS_TERMINATED',
      entity_type: 'User',
      entity_id: targetUserId,
      status: 'SUCCESS',
      description: `Terminated ${revokedJtis.length} active session(s) for user #${targetUserId}`,
    });

    res.json({
      success: true,
      message: `Terminated ${revokedJtis.length} active session(s) for user #${targetUserId}.`,
      data: { revoked_count: revokedJtis.length },
    });
  });

  // 5. USER ACTIVITY AUDIT LOGS, INTEGRITY VERIFICATION & EXPORT
  router.get('/activity-logs', requirePermission('settings.audit.view'), (req: Request, res: Response) => {
    const data = securityStore.getActivityLogs({
      search: req.query.search ? String(req.query.search) : undefined,
      user_id: req.query.user_id ? Number(req.query.user_id) : undefined,
      module: req.query.module ? String(req.query.module) : undefined,
      action: req.query.action ? String(req.query.action) : undefined,
      status: req.query.status ? String(req.query.status) : undefined,
      date_from: req.query.date_from ? String(req.query.date_from) : undefined,
      date_to: req.query.date_to ? String(req.query.date_to) : undefined,
      page: req.query.page as string,
      limit: req.query.limit as string,
    });
    res.json({ success: true, data });
  });

  router.get('/activity-logs/verify', requirePermission('settings.audit.view'), async (req: Request, res: Response) => {
    const report = auditService.verifyIntegrity();
    if (!report.valid) {
      await securityMonitor.raiseEvent({
        event_code: 'AUDIT_CHAIN_TAMPER_DETECTED',
        title: 'CRITICAL: Audit Log Hash Chain Verification Failed',
        severity: 'CRITICAL',
        user_id: (req as any).user?.id ?? null,
        user_email: (req as any).user?.email ?? null,
        endpoint: req.originalUrl,
        description: report.reason,
        details: { tampered_ids: report.tampered_ids, broken_at_id: report.broken_at_id },
        notifyAdmin: true,
      });
    }
    res.json({ success: true, data: report });
  });

  router.get('/activity-logs/export', requirePermission('settings.audit.export'), (req: Request, res: Response) => {
    const { items } = securityStore.getActivityLogs({
      search: req.query.search ? String(req.query.search) : undefined,
      module: req.query.module ? String(req.query.module) : undefined,
      action: req.query.action ? String(req.query.action) : undefined,
      status: req.query.status ? String(req.query.status) : undefined,
      date_from: req.query.date_from ? String(req.query.date_from) : undefined,
      date_to: req.query.date_to ? String(req.query.date_to) : undefined,
      page: 1,
      limit: 200,
    });

    const rows = items.map(r => ({
      ID: r.id,
      Timestamp_UTC: r.created_at,
      User: r.user_email || r.username || 'System',
      Role: r.user_role || '',
      Module: r.module_name,
      Action: r.action_type,
      Entity: r.entity_type ? `${r.entity_type}#${r.entity_id || ''}` : '',
      Method: r.http_method || '',
      Endpoint: r.api_endpoint || '',
      Status: r.status,
      IP_Address: r.ip_address,
      Device: r.device_name || '',
      Description: r.description || '',
      Entry_Hash: r.entry_hash,
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'AuditLogs');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="nexora_audit_logs_${Date.now()}.xlsx"`);
    res.send(buf);
  });

  // 6. SECURITY EVENTS & RESOLUTION
  router.get('/events', requirePermission('settings.security.view'), (req: Request, res: Response) => {
    const data = securityStore.getSecurityEvents({
      search: req.query.search ? String(req.query.search) : undefined,
      severity: req.query.severity ? String(req.query.severity) : undefined,
      resolved: req.query.resolved ? String(req.query.resolved) : undefined,
      date_from: req.query.date_from ? String(req.query.date_from) : undefined,
      date_to: req.query.date_to ? String(req.query.date_to) : undefined,
      page: req.query.page as string,
      limit: req.query.limit as string,
    });
    res.json({ success: true, data });
  });

  router.post('/events/:id/resolve', requirePermission('settings.security.edit'), async (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    const actor = (req as any).user;
    const notes = String(req.body?.notes || 'Reviewed and cleared by security administrator').slice(0, 500);
    const updated = await securityStore.resolveSecurityEvent(id, actor.id, notes);
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Security event not found.' });
    }
    (res.locals as any).__nexoraAudited = true;
    await auditService.log({
      req,
      module_name: 'Security Center',
      action_type: 'SECURITY_EVENT_RESOLVED',
      entity_type: 'SecurityEvent',
      entity_id: id,
      status: 'SUCCESS',
      description: `Resolved security event #${id} (${updated.event_code}): ${notes}`,
    });
    res.json({ success: true, data: updated, message: 'Security event marked as resolved.' });
  });

  // 7. DATABASE BACKUP & CONTROLLED RESTORATION MANAGER
  router.get('/backups', requirePermission('settings.backups.view'), async (req: Request, res: Response) => {
    const list = securityStore.getBackupHistory({
      status: req.query.status ? String(req.query.status) : undefined,
      trigger_type: req.query.trigger_type ? String(req.query.trigger_type) : undefined,
      page: req.query.page as string,
      limit: req.query.limit as string,
    });
    const capabilities = await backupService.detectCapabilities();
    res.json({
      success: true,
      data: {
        ...list,
        capabilities,
        backup_in_progress: backupService.isBackupLocked(),
      },
    });
  });

  router.post('/backups/run', requirePermission('settings.backup'), async (req: Request, res: Response) => {
    const actor = (req as any).user;
    const syncMode = req.body?.sync === true;
    try {
      if (syncMode) {
        const record = await backupService.runBackup({
          triggerType: 'manual',
          initiatedByUserId: actor.id,
          initiatedByEmail: actor.email,
        });
        (res.locals as any).__nexoraAudited = true;
        return res.status(201).json({
          success: true,
          message: `Encrypted dual-storage backup ${record.file_name} completed.`,
          data: { record },
        });
      }

      const job = backupService.startManualBackupAsync({
        initiatedByUserId: actor.id,
        initiatedByEmail: actor.email,
        triggerType: 'manual',
      });
      (res.locals as any).__nexoraAudited = true;
      res.status(202).json({
        success: true,
        message: 'Encrypted backup job started in background.',
        data: { job },
      });
    } catch (err: any) {
      res.status(409).json({ success: false, message: err.message });
    }
  });

  router.get('/backups/jobs/:jobId', requirePermission('settings.backups.view'), (req: Request, res: Response) => {
    const job = backupService.getJobStatus(req.params.jobId);
    if (!job) {
      return res.status(404).json({ success: false, message: 'Backup job status not found.' });
    }
    res.json({ success: true, data: job });
  });

  router.post('/backups/:uid/verify', requirePermission('settings.backups.view'), async (req: Request, res: Response) => {
    const actor = (req as any).user;
    const report = await backupService.verifyBackup(req.params.uid, actor.id);
    (res.locals as any).__nexoraAudited = true;
    await auditService.log({
      req,
      module_name: 'Database Backups',
      action_type: 'BACKUP_VERIFIED',
      entity_type: 'Backup',
      entity_id: req.params.uid,
      status: report.valid ? 'SUCCESS' : 'FAILED',
      description: report.valid
        ? `Verified integrity and AES-256-GCM decryption for backup ${report.backup_uid}.`
        : `Verification failed for ${report.backup_uid}: ${report.error}`,
    });
    res.status(report.valid ? 200 : 422).json({
      success: report.valid,
      message: report.valid ? 'Backup checksum and AES-256-GCM encryption verified.' : report.error,
      data: report,
    });
  });

  router.get('/backups/:uid/download', requirePermission('settings.backups.download'), async (req: Request, res: Response) => {
    const resolved = backupService.resolveDownloadableBackup(req.params.uid);
    if (!resolved) {
      return res.status(404).json({ success: false, message: 'Authorized backup file not found.' });
    }
    (res.locals as any).__nexoraAudited = true;
    await auditService.log({
      req,
      module_name: 'Database Backups',
      action_type: 'BACKUP_DOWNLOADED',
      entity_type: 'Backup',
      entity_id: resolved.record.backup_uid,
      status: 'SUCCESS',
      description: `Authorized download of encrypted backup ${resolved.fileName}`,
    });
    res.download(resolved.filePath, resolved.fileName);
  });

  router.post('/backups/:uid/restore/prepare', requirePermission('settings.backup'), async (req: Request, res: Response) => {
    const actor = (req as any).user;
    const result = await backupService.prepareControlledRestore(req.params.uid, actor.id);
    if (!result.ok) {
      return res.status(422).json({
        success: false,
        message: result.validation.error || 'Backup failed pre-restore verification.',
        data: result,
      });
    }
    res.json({
      success: true,
      message: 'Pre-restore verification passed. Review summary and confirm explicitly to execute controlled restoration.',
      data: result,
    });
  });

  router.post('/backups/:uid/restore/execute', requirePermission('settings.backup'), async (req: Request, res: Response) => {
    const actor = (req as any).user;
    const { confirm_token, confirm_phrase } = req.body || {};
    if (!confirm_token || !confirm_phrase) {
      return res.status(400).json({
        success: false,
        message: 'Both confirm_token and exact confirm_phrase are required for controlled restoration.',
      });
    }
    try {
      const outcome = await backupService.executeControlledRestore({
        backupIdOrUid: req.params.uid,
        confirmToken: String(confirm_token),
        confirmPhrase: String(confirm_phrase),
        adminUserId: actor.id,
        adminEmail: actor.email,
        onStoreReload: () => {
          if (typeof (store as any).reloadFromDisk === 'function') {
            (store as any).reloadFromDisk();
          }
        },
      });
      (res.locals as any).__nexoraAudited = true;
      res.json({ success: true, message: outcome.message, data: outcome });
    } catch (err: any) {
      res.status(400).json({ success: false, message: err.message });
    }
  });

  router.post('/backups/cleanup', requirePermission('settings.backup'), async (req: Request, res: Response) => {
    const actor = (req as any).user;
    const result = await backupService.cleanupExpiredBackups(securityConfig.backupRetentionDays, actor.id);
    (res.locals as any).__nexoraAudited = true;
    res.json({
      success: true,
      message: `Retention cleanup complete. Removed ${result.deleted_count} expired backup(s).`,
      data: result,
    });
  });

  // 8. ADMINISTRATOR OPTIONAL TOTP MFA ENROLLMENT & MANAGEMENT
  router.get('/mfa/status', (req: Request, res: Response) => {
    const actor = (req as any).user;
    const mfa = securityStore.getUserMfa(actor.id);
    res.json({
      success: true,
      data: {
        enabled: Boolean(mfa?.enabled),
        recovery_codes_remaining: mfa?.recovery_code_hashes?.length || 0,
        updated_at: mfa?.updated_at || null,
      },
    });
  });

  router.post('/mfa/setup', async (req: Request, res: Response) => {
    const actor = (req as any).user;
    const secret = mfaService.generateSecret();
    const otpauthUri = mfaService.buildOtpAuthUri(actor.email, secret);
    const existing = securityStore.getUserMfa(actor.id);

    await securityStore.saveUserMfa({
      user_id: actor.id,
      enabled: Boolean(existing?.enabled),
      secret_encrypted: existing?.secret_encrypted || null,
      pending_secret_encrypted: mfaService.encryptSecret(secret),
      recovery_code_hashes: existing?.recovery_code_hashes || [],
      updated_at: new Date().toISOString(),
    });

    (res.locals as any).__nexoraAudited = true;
    await auditService.log({
      req,
      module_name: 'Authentication',
      action_type: 'MFA_SETUP_INITIATED',
      entity_type: 'User',
      entity_id: actor.id,
      status: 'SUCCESS',
      description: `User ${actor.email} initiated TOTP MFA enrollment.`,
    });

    res.json({
      success: true,
      data: {
        manual_secret: secret,
        otpauth_uri: otpauthUri,
      },
      message: 'Scan or enter the secret in Google Authenticator / Authy, then verify with a 6-digit code.',
    });
  });

  router.post('/mfa/enable', async (req: Request, res: Response) => {
    const actor = (req as any).user;
    const { code } = req.body || {};
    const mfa = securityStore.getUserMfa(actor.id);
    if (!mfa?.pending_secret_encrypted) {
      return res.status(400).json({ success: false, message: 'No pending MFA enrollment found. Call setup first.' });
    }
    const secret = mfaService.decryptSecret(mfa.pending_secret_encrypted);
    if (!mfaService.verifyCode(secret, String(code || ''))) {
      return res.status(400).json({ success: false, message: 'Invalid 6-digit authenticator code.' });
    }

    const recovery = mfaService.generateRecoveryCodes(8);
    await securityStore.saveUserMfa({
      user_id: actor.id,
      enabled: true,
      secret_encrypted: mfa.pending_secret_encrypted,
      pending_secret_encrypted: null,
      recovery_code_hashes: recovery.hashes,
      updated_at: new Date().toISOString(),
    });

    (res.locals as any).__nexoraAudited = true;
    await auditService.log({
      req,
      module_name: 'Authentication',
      action_type: 'MFA_ENABLED',
      entity_type: 'User',
      entity_id: actor.id,
      status: 'SUCCESS',
      description: `TOTP Multi-Factor Authentication enabled for ${actor.email}.`,
    });

    res.json({
      success: true,
      message: 'Two-factor authentication enabled. Save your recovery codes safely — they are shown only once.',
      data: { recovery_codes: recovery.plain },
    });
  });

  router.post('/mfa/disable', async (req: Request, res: Response) => {
    const actor = (req as any).user;
    const { code } = req.body || {};
    const mfa = securityStore.getUserMfa(actor.id);
    if (!mfa?.enabled || !mfa.secret_encrypted) {
      return res.status(400).json({ success: false, message: 'MFA is not currently enabled.' });
    }
    const secret = mfaService.decryptSecret(mfa.secret_encrypted);
    if (!mfaService.verifyCode(secret, String(code || ''))) {
      return res.status(400).json({ success: false, message: 'Valid 6-digit authenticator code required to disable MFA.' });
    }

    await securityStore.saveUserMfa({
      user_id: actor.id,
      enabled: false,
      secret_encrypted: null,
      pending_secret_encrypted: null,
      recovery_code_hashes: [],
      updated_at: new Date().toISOString(),
    });

    (res.locals as any).__nexoraAudited = true;
    await auditService.log({
      req,
      module_name: 'Authentication',
      action_type: 'MFA_DISABLED',
      entity_type: 'User',
      entity_id: actor.id,
      status: 'WARNING',
      description: `TOTP Multi-Factor Authentication disabled for ${actor.email}.`,
    });

    res.json({ success: true, message: 'Two-factor authentication disabled.' });
  });

  return router;
}
