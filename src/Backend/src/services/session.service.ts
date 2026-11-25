/**
 * Session Service
 * Provides active session querying and server-side revocation.
 */

import { sessionRepository, UserSessionRecord } from '../repositories/session.repository';

export class SessionService {
  public async getActiveSessions(userId: string, currentToken?: string, isSuperAdmin: boolean = false): Promise<UserSessionRecord[]> {
    if (isSuperAdmin) {
      return sessionRepository.getAllActiveSessions(currentToken);
    }
    return sessionRepository.getActiveSessions(userId, currentToken);
  }

  public async getUserActiveSessions(userId: string, currentToken?: string): Promise<UserSessionRecord[]> {
    return sessionRepository.getActiveSessions(userId, currentToken);
  }

  public async revokeSession(sessionId: string, userId: string, isSuperAdmin: boolean = false): Promise<boolean> {
    return sessionRepository.revokeSession(sessionId, userId, isSuperAdmin);
  }

  public async revokeAllOtherSessions(userId: string, currentToken?: string): Promise<number> {
    return sessionRepository.revokeAllOtherSessions(userId, currentToken);
  }

  public async isTokenRevoked(token: string): Promise<boolean> {
    return sessionRepository.isTokenRevoked(token);
  }
}

export const sessionService = new SessionService();
