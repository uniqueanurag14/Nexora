/**
 * Session Controller
 * Endpoints for viewing active sessions and revoking sessions.
 */

import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { sessionService } from '../services/session.service';

export class SessionController {
  public async getSessions(req: AuthenticatedRequest, res: Response) {
    try {
      if (!req.user?.id) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }

      const currentToken = req.headers.authorization?.replace(/^Bearer\s+/i, '');
      const isSuperAdmin = Boolean(req.user.isSuperAdmin || req.user.role === 'SUPER_ADMIN');
      const sessions = await sessionService.getActiveSessions(String(req.user.id), currentToken, isSuperAdmin);

      return res.json({
        success: true,
        data: sessions,
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message || 'Failed to retrieve active sessions.' });
    }
  }

  public async revokeSession(req: AuthenticatedRequest, res: Response) {
    try {
      if (!req.user?.id) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }

      const sessionId = req.params.id;
      if (!sessionId) {
        return res.status(400).json({ success: false, error: 'Session ID is required.' });
      }

      const isSuperAdmin = Boolean(req.user.isSuperAdmin || req.user.role === 'SUPER_ADMIN');
      const success = await sessionService.revokeSession(sessionId, String(req.user.id), isSuperAdmin);

      if (!success) {
        return res.status(404).json({ success: false, error: 'Session not found or already revoked.' });
      }

      return res.json({
        success: true,
        message: 'Session revoked successfully.',
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message || 'Failed to revoke session.' });
    }
  }

  public async revokeAllOtherSessions(req: AuthenticatedRequest, res: Response) {
    try {
      if (!req.user?.id) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }

      const currentToken = req.headers.authorization?.replace(/^Bearer\s+/i, '');
      const count = await sessionService.revokeAllOtherSessions(String(req.user.id), currentToken);

      return res.json({
        success: true,
        message: `Revoked ${count} other active session(s).`,
        count,
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message || 'Failed to revoke other sessions.' });
    }
  }
}

export const sessionController = new SessionController();
