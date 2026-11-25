/**
 * NEXORA ERP — Backup Multi-Scheduler & Back Office Restore API Router
 *
 * Enforces strict server-side RBAC on every single endpoint:
 * - Viewing backups/schedulers: `settings.backups.view` or `settings.backup`
 * - Managing schedulers / running backups: `settings.backups.manage` or `settings.backup`
 * - Restoring to Isolated DB (Option 1): `settings.backups.restore.isolated`
 * - Restoring Production DB (Option 2): `settings.backups.restore.production` + Super Admin role + password re-auth + confirmation phrase
 * - Viewing restore history: `settings.backups.restore.history` or `settings.backups.view`
 */

import express, { Request, Response, NextFunction } from 'express';
import { store } from '../store';
import { backupSchedulerService } from './backupSchedulerService';
import { restoreService } from './restoreService';
import type { AuthenticatedRequest } from '../../server';

function getActor(req: AuthenticatedRequest) {
  return {
    id: req.user?.id ?? null,
    email: req.user?.email || 'system',
    ip: req.ip || '127.0.0.1',
  };
}

export function hasAnyPermission(role: string | undefined, required: string[]): boolean {
  if (!role) return false;
  if (role === 'super_admin') return true;
  const granted = store.getRolePermissions(role) || [];
  return required.some((perm) => granted.includes(perm));
}

function requireAnyPerm(perms: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }
    if (!hasAnyPermission(req.user.role, perms)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required permission: ${perms.join(' or ')}.`,
      });
    }
    next();
  };
}

function requireProductionRestoreAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Authentication required.' });
  }
  const granted = store.getRolePermissions(req.user.role) || [];
  const hasProdPerm = granted.includes('*') || granted.includes('settings.backups.restore.production');
  if (req.user.role !== 'super_admin' || !hasProdPerm) {
    return res.status(403).json({
      success: false,
      message:
        'Access denied. Production PostgreSQL database restoration is strictly restricted to Super Administrators with `settings.backups.restore.production` permission.',
    });
  }
  next();
}

function sendError(res: Response, err: any, fallback: string) {
  const status =
    err?.statusCode ||
    (err?.code === 'DB_UNAVAILABLE' ? 503 : err?.code === '42P01' ? 503 : 500);
  const message =
    err?.code === '42P01'
      ? 'Database backup tables are not initialized yet. Please run `npm run db:update`.'
      : err?.message || fallback;
  return res.status(status).json({
    success: false,
    message,
    errors: err?.errors,
  });
}

export function createBackupRestoreRouter(
  authenticateMiddleware: (req: Request, res: Response, next: NextFunction) => void
) {
  const router = express.Router();
  router.use(authenticateMiddleware);

  // ==========================================
  // BACKUP SCHEDULERS MANAGEMENT
  // ==========================================

  router.get(
    '/backup-schedulers/stats',
    requireAnyPerm(['settings.backups.view', 'settings.backup']),
    async (_req: AuthenticatedRequest, res: Response) => {
      try {
        const stats = await backupSchedulerService.getStats();
        res.json({ success: true, data: stats });
      } catch (err: any) {
        sendError(res, err, 'Failed to fetch backup scheduler statistics.');
      }
    }
  );

  router.get(
    '/backup-schedulers',
    requireAnyPerm(['settings.backups.view', 'settings.backup']),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const rows = await backupSchedulerService.listSchedulers({
          search: typeof req.query.search === 'string' ? req.query.search : undefined,
          frequency: typeof req.query.frequency === 'string' ? req.query.frequency : undefined,
          status: typeof req.query.status === 'string' ? req.query.status : undefined,
          last_status: typeof req.query.last_status === 'string' ? req.query.last_status : undefined,
        });
        res.json({ success: true, data: rows });
      } catch (err: any) {
        sendError(res, err, 'Failed to load backup schedulers.');
      }
    }
  );

  router.post(
    '/backup-schedulers',
    requireAnyPerm(['settings.backups.manage', 'settings.backup']),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const created = await backupSchedulerService.createScheduler(req.body || {}, getActor(req));
        res.status(201).json({
          success: true,
          message: `Backup scheduler "${created.name}" created successfully.`,
          data: created,
        });
      } catch (err: any) {
        sendError(res, err, 'Failed to create backup scheduler.');
      }
    }
  );

  router.put(
    '/backup-schedulers/:id',
    requireAnyPerm(['settings.backups.manage', 'settings.backup']),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
          return res.status(400).json({ success: false, message: 'Invalid scheduler ID.' });
        }
        const updated = await backupSchedulerService.updateScheduler(id, req.body || {}, getActor(req));
        res.json({
          success: true,
          message: `Backup scheduler "${updated.name}" updated and applied immediately.`,
          data: updated,
        });
      } catch (err: any) {
        sendError(res, err, 'Failed to update backup scheduler.');
      }
    }
  );

  router.patch(
    '/backup-schedulers/:id/toggle',
    requireAnyPerm(['settings.backups.manage', 'settings.backup']),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
          return res.status(400).json({ success: false, message: 'Invalid scheduler ID.' });
        }
        const enabled = Boolean(req.body?.is_enabled);
        const updated = await backupSchedulerService.toggleScheduler(id, enabled, getActor(req));
        res.json({
          success: true,
          message: `Scheduler "${updated.name}" ${enabled ? 'enabled' : 'disabled'}. Existing backup archives remain intact.`,
          data: updated,
        });
      } catch (err: any) {
        sendError(res, err, 'Failed to toggle backup scheduler.');
      }
    }
  );

  router.delete(
    '/backup-schedulers/:id',
    requireAnyPerm(['settings.backups.manage', 'settings.backup']),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
          return res.status(400).json({ success: false, message: 'Invalid scheduler ID.' });
        }
        const deleted = await backupSchedulerService.deleteScheduler(id, getActor(req));
        res.json({
          success: true,
          message: `Scheduler "${deleted.name}" removed. Previously created backups and audit logs were preserved.`,
          data: deleted,
        });
      } catch (err: any) {
        sendError(res, err, 'Failed to delete backup scheduler.');
      }
    }
  );

  router.post(
    '/backup-schedulers/:id/run-now',
    requireAnyPerm(['settings.backups.manage', 'settings.backup']),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
          return res.status(400).json({ success: false, message: 'Invalid scheduler ID.' });
        }
        const execution = await backupSchedulerService.runSchedulerNow(id, getActor(req));
        res.status(201).json({
          success: true,
          message: `PostgreSQL backup "${execution.backup_uid}" completed and verified.`,
          data: execution,
        });
      } catch (err: any) {
        sendError(res, err, 'Failed to run scheduled backup.');
      }
    }
  );

  router.post(
    '/backup-schedulers/manual-backup',
    requireAnyPerm(['settings.backups.manage', 'settings.backups.create', 'settings.backup']),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const notes = typeof req.body?.notes === 'string' ? req.body.notes.trim() : undefined;
        const execution = await backupSchedulerService.runManualBackup(
          { executionType: 'manual', notes },
          getActor(req)
        );
        res.status(201).json({
          success: true,
          message: `Manual PostgreSQL backup "${execution.backup_uid}" completed and verified.`,
          data: execution,
        });
      } catch (err: any) {
        sendError(res, err, 'Failed to run manual PostgreSQL backup.');
      }
    }
  );

  router.get(
    '/backup-schedulers/history',
    requireAnyPerm(['settings.backups.view', 'settings.backup']),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const rows = await backupSchedulerService.listExecutionHistory({
          scheduler_id: req.query.scheduler_id ? Number(req.query.scheduler_id) : undefined,
          status: typeof req.query.status === 'string' ? req.query.status : undefined,
          execution_type: typeof req.query.execution_type === 'string' ? req.query.execution_type : undefined,
          search: typeof req.query.search === 'string' ? req.query.search : undefined,
          limit: req.query.limit ? Number(req.query.limit) : 100,
        });
        res.json({ success: true, data: rows });
      } catch (err: any) {
        sendError(res, err, 'Failed to load backup execution history.');
      }
    }
  );

  router.get(
    '/backup-schedulers/audit',
    requireAnyPerm(['settings.backups.view', 'settings.backup']),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const limit = req.query.limit ? Number(req.query.limit) : 100;
        const rows = await backupSchedulerService.listAuditHistory(limit);
        res.json({ success: true, data: rows });
      } catch (err: any) {
        sendError(res, err, 'Failed to load backup scheduler audit log.');
      }
    }
  );

  // ==========================================
  // BACK OFFICE DATABASE RESTORE MANAGEMENT
  // ==========================================

  router.get(
    '/database-restore/status',
    requireAnyPerm(['settings.backups.view', 'settings.backups.restore.history', 'settings.backup']),
    async (_req: AuthenticatedRequest, res: Response) => {
      res.json({
        success: true,
        data: restoreService.getLiveStatus(),
      });
    }
  );

  router.get(
    '/database-restore/available',
    requireAnyPerm([
      'settings.backups.view',
      'settings.backups.restore.isolated',
      'settings.backups.restore.production',
      'settings.backup',
    ]),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const rows = await restoreService.listAvailableBackups({
          search: typeof req.query.search === 'string' ? req.query.search : undefined,
          execution_type: typeof req.query.execution_type === 'string' ? req.query.execution_type : undefined,
          verification_status:
            typeof req.query.verification_status === 'string' ? req.query.verification_status : undefined,
        });
        res.json({ success: true, data: rows });
      } catch (err: any) {
        sendError(res, err, 'Failed to list available backups for restore.');
      }
    }
  );

  router.get(
    '/database-restore/preview/:backupUid',
    requireAnyPerm([
      'settings.backups.restore.isolated',
      'settings.backups.restore.production',
      'settings.backups.restore',
    ]),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const preview = await restoreService.getRestorePreview(String(req.params.backupUid));
        res.json({ success: true, data: preview });
      } catch (err: any) {
        sendError(res, err, 'Failed to generate restore preview.');
      }
    }
  );

  router.post(
    '/database-restore/isolated',
    requireAnyPerm(['settings.backups.restore.isolated']),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { backup_uid, target_database_name } = req.body || {};
        if (!backup_uid) {
          return res.status(400).json({ success: false, message: 'backup_uid is required.' });
        }
        const result = await restoreService.restoreToIsolatedDatabase(
          String(backup_uid),
          getActor(req),
          typeof target_database_name === 'string' ? target_database_name : undefined
        );
        res.status(201).json({
          success: true,
          message: `Backup restored and verified in isolated database "${result.target_database_name}". Production database was not modified.`,
          data: result,
        });
      } catch (err: any) {
        sendError(res, err, 'Isolated database restore failed.');
      }
    }
  );

  router.post(
    '/database-restore/production',
    requireProductionRestoreAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { backup_uid, password, confirmation_phrase } = req.body || {};
        if (!backup_uid) {
          return res.status(400).json({ success: false, message: 'backup_uid is required.' });
        }
        const result = await restoreService.restoreProductionDatabase({
          backupUid: String(backup_uid),
          actor: getActor(req),
          password: String(password || ''),
          confirmationPhrase: String(confirmation_phrase || ''),
        });
        res.status(200).json({
          success: true,
          message: `Production PostgreSQL database restored from backup "${backup_uid}". Pre-restore recovery backup: ${result.pre_restore_backup_uid || 'recorded'}.`,
          data: result,
        });
      } catch (err: any) {
        sendError(res, err, 'Production database restore failed.');
      }
    }
  );

  router.get(
    '/database-restore/history',
    requireAnyPerm(['settings.backups.restore.history', 'settings.backups.view', 'settings.backup']),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const limit = req.query.limit ? Number(req.query.limit) : 100;
        const rows = await restoreService.listRestoreHistory(limit);
        res.json({ success: true, data: rows });
      } catch (err: any) {
        sendError(res, err, 'Failed to fetch database restore history.');
      }
    }
  );

  router.get(
    '/database-restore/history/:restoreUid',
    requireAnyPerm(['settings.backups.restore.history', 'settings.backups.view', 'settings.backup']),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const row = await restoreService.getRestoreByUid(String(req.params.restoreUid));
        if (!row) {
          return res.status(404).json({ success: false, message: 'Restore execution record not found.' });
        }
        res.json({ success: true, data: row });
      } catch (err: any) {
        sendError(res, err, 'Failed to fetch restore status.');
      }
    }
  );

  return router;
}
