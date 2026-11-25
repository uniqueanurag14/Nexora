/**
 * NEXORA ERP — Controlled Maintenance Mode Middleware
 *
 * Activated exclusively during a verified Production Database Restore.
 * Blocks mutating application requests (POST / PUT / PATCH / DELETE) with HTTP 503
 * while keeping health checks and restore status polling accessible to authorized admins.
 */

import type { Request, Response, NextFunction } from 'express';

export interface MaintenanceModeState {
  active: boolean;
  restore_uid: string | null;
  started_at: string | null;
  initiated_by: string | null;
  reason: string | null;
}

const state: MaintenanceModeState = {
  active: false,
  restore_uid: null,
  started_at: null,
  initiated_by: null,
  reason: null,
};

export function getMaintenanceModeState(): MaintenanceModeState {
  return { ...state };
}

export function isMaintenanceModeActive(): boolean {
  return state.active;
}

export function enterMaintenanceMode(params: {
  restore_uid: string;
  initiated_by: string;
  reason?: string;
}): MaintenanceModeState {
  state.active = true;
  state.restore_uid = params.restore_uid;
  state.started_at = new Date().toISOString();
  state.initiated_by = params.initiated_by;
  state.reason = params.reason || 'Production PostgreSQL database restore in progress.';
  return getMaintenanceModeState();
}

export function exitMaintenanceMode(): MaintenanceModeState {
  state.active = false;
  state.restore_uid = null;
  state.started_at = null;
  state.initiated_by = null;
  state.reason = null;
  return getMaintenanceModeState();
}

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function maintenanceModeMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!state.active) {
    next();
    return;
  }

  const reqPath = req.path || req.originalUrl || '';

  // Always allow health endpoints and restore status / monitoring endpoints
  if (
    reqPath.startsWith('/api/health') ||
    reqPath.startsWith('/api/security/database-restore') ||
    !reqPath.startsWith('/api/')
  ) {
    next();
    return;
  }

  // Block all mutating requests while production restore is underway
  if (MUTATING_METHODS.has(req.method.toUpperCase())) {
    res.status(503).json({
      success: false,
      code: 'MAINTENANCE_MODE',
      message:
        'NEXORA is temporarily in maintenance mode while a production database restore is in progress. Write operations are paused until restoration completes.',
      maintenance: getMaintenanceModeState(),
    });
    return;
  }

  next();
}
