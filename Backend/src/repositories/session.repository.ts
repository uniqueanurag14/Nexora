/**
 * Active Session Repository
 * Tracks user sessions, devices, IP addresses, and provides server-side session revocation.
 */

import crypto from 'crypto';
import { dbAdapter } from '../db/adapter';

export interface UserSessionRecord {
  id: string;
  userId: string;
  tokenHash: string;
  ipAddress: string;
  userAgent: string;
  deviceInfo: string;
  browser: string;
  os: string;
  isRevoked: boolean;
  lastActiveAt: string;
  createdAt: string;
  expiresAt: string;
  userName?: string;
  userEmail?: string;
  isCurrent?: boolean;
}

function parseUserAgent(ua: string = '') {
  let browser = 'Modern Browser';
  let os = 'Unknown OS';
  let deviceInfo = 'Desktop';

  if (/chrome|crios/i.test(ua) && !/edge|opr\//i.test(ua)) browser = 'Google Chrome';
  else if (/firefox|fxios/i.test(ua)) browser = 'Mozilla Firefox';
  else if (/safari/i.test(ua) && !/chrome/i.test(ua)) browser = 'Apple Safari';
  else if (/edg/i.test(ua)) browser = 'Microsoft Edge';
  else if (/opera|opr\//i.test(ua)) browser = 'Opera';

  if (/windows/i.test(ua)) os = 'Windows';
  else if (/macintosh|mac os x/i.test(ua)) os = 'macOS';
  else if (/linux/i.test(ua)) os = 'Linux';
  else if (/android/i.test(ua)) { os = 'Android'; deviceInfo = 'Mobile Device'; }
  else if (/iphone|ipad|ipod/i.test(ua)) { os = 'iOS'; deviceInfo = 'Apple Mobile'; }

  return { browser, os, deviceInfo };
}

export class SessionRepository {
  public async createSession(
    userId: string,
    token: string,
    ipAddress: string = '127.0.0.1',
    userAgent: string = 'Mozilla/5.0'
  ): Promise<UserSessionRecord> {
    const id = `sess-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const { browser, os, deviceInfo } = parseUserAgent(userAgent);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const sql = `
      INSERT INTO user_sessions (
        id, user_id, token_hash, ip_address, user_agent, device_info,
        browser, os, is_revoked, last_active_at, created_at, expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $9)
      RETURNING *;
    `;

    const res = await dbAdapter.query(sql, [
      id, userId, tokenHash, ipAddress, userAgent, deviceInfo, browser, os, expiresAt
    ]);

    const row = res.rows[0];
    return {
      id: row.id,
      userId: row.user_id,
      tokenHash: row.token_hash,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      deviceInfo: row.device_info,
      browser: row.browser,
      os: row.os,
      isRevoked: row.is_revoked,
      lastActiveAt: row.last_active_at,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
    };
  }

  public async getActiveSessions(userId: string, currentToken?: string): Promise<UserSessionRecord[]> {
    const currentTokenHash = currentToken
      ? crypto.createHash('sha256').update(currentToken).digest('hex')
      : null;

    const sql = `
      SELECT s.*, u.name as user_name, u.email as user_email
      FROM user_sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.user_id = $1 AND s.is_revoked = FALSE AND s.expires_at > CURRENT_TIMESTAMP
      ORDER BY s.last_active_at DESC;
    `;

    const res = await dbAdapter.query(sql, [userId]);
    return res.rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      tokenHash: r.token_hash,
      ipAddress: r.ip_address,
      userAgent: r.user_agent,
      deviceInfo: r.device_info,
      browser: r.browser,
      os: r.os,
      isRevoked: r.is_revoked,
      lastActiveAt: r.last_active_at,
      createdAt: r.created_at,
      expiresAt: r.expires_at,
      userName: r.user_name,
      userEmail: r.user_email,
      isCurrent: Boolean(currentTokenHash && r.token_hash === currentTokenHash),
    }));
  }

  public async getAllActiveSessions(currentToken?: string): Promise<UserSessionRecord[]> {
    const currentTokenHash = currentToken
      ? crypto.createHash('sha256').update(currentToken).digest('hex')
      : null;

    const sql = `
      SELECT s.*, u.name as user_name, u.email as user_email
      FROM user_sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.is_revoked = FALSE AND s.expires_at > CURRENT_TIMESTAMP
      ORDER BY s.last_active_at DESC;
    `;

    const res = await dbAdapter.query(sql);
    return res.rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      tokenHash: r.token_hash,
      ipAddress: r.ip_address,
      userAgent: r.user_agent,
      deviceInfo: r.device_info,
      browser: r.browser,
      os: r.os,
      isRevoked: r.is_revoked,
      lastActiveAt: r.last_active_at,
      createdAt: r.created_at,
      expiresAt: r.expires_at,
      userName: r.user_name,
      userEmail: r.user_email,
      isCurrent: Boolean(currentTokenHash && r.token_hash === currentTokenHash),
    }));
  }

  public async isTokenRevoked(token: string): Promise<boolean> {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const sql = `
      SELECT id, is_revoked, expires_at
      FROM user_sessions
      WHERE token_hash = $1
      LIMIT 1;
    `;
    const res = await dbAdapter.query(sql, [tokenHash]);
    if (res.rows.length === 0) return false;
    const session = res.rows[0];
    if (session.is_revoked) return true;
    if (new Date(session.expires_at).getTime() < Date.now()) return true;
    return false;
  }

  public async touchSession(token: string): Promise<void> {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    await dbAdapter.query(
      `UPDATE user_sessions SET last_active_at = CURRENT_TIMESTAMP WHERE token_hash = $1`,
      [tokenHash]
    );
  }

  public async revokeSession(sessionId: string, userId?: string, isSuperAdmin: boolean = false): Promise<boolean> {
    let sql: string;
    let params: any[];

    if (isSuperAdmin) {
      sql = `UPDATE user_sessions SET is_revoked = TRUE WHERE id = $1;`;
      params = [sessionId];
    } else {
      sql = `UPDATE user_sessions SET is_revoked = TRUE WHERE id = $1 AND user_id = $2;`;
      params = [sessionId, userId];
    }

    const res = await dbAdapter.query(sql, params);
    return (res.rowCount || 0) > 0;
  }

  public async revokeAllOtherSessions(userId: string, currentToken?: string): Promise<number> {
    if (!currentToken) {
      const res = await dbAdapter.query(
        `UPDATE user_sessions SET is_revoked = TRUE WHERE user_id = $1 AND is_revoked = FALSE;`,
        [userId]
      );
      return res.rowCount || 0;
    }

    const currentTokenHash = crypto.createHash('sha256').update(currentToken).digest('hex');
    const res = await dbAdapter.query(
      `UPDATE user_sessions SET is_revoked = TRUE WHERE user_id = $1 AND token_hash != $2 AND is_revoked = FALSE;`,
      [userId, currentTokenHash]
    );
    return res.rowCount || 0;
  }
}

export const sessionRepository = new SessionRepository();
