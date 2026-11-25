import { emailService } from '../emailService';
import { securityConfig } from './config';
import { SecurityEventRecord, SecuritySeverity, securityStore } from './securityStore';

interface LockoutEntry {
  failures: number[];
  lockedUntil: number | null;
}

/**
 * Real-Time Security Event Monitoring, Brute-Force Lockout & Cooldown-Throttled Alert Engine
 */
class SecurityMonitor {
  private accountLockouts = new Map<string, LockoutEntry>();
  private ipFailedAttempts = new Map<string, number[]>();
  private ipUnauthorizedBursts = new Map<string, number[]>();
  private userExportBursts = new Map<number, number[]>();
  private alertCooldowns = new Map<string, number>();

  private getWindowMs(): number {
    return securityConfig.loginLockoutMinutes * 60 * 1000;
  }

  public resetInMemoryCountersForTests(): void {
    this.accountLockouts.clear();
    this.ipFailedAttempts.clear();
    this.ipUnauthorizedBursts.clear();
    this.userExportBursts.clear();
    this.alertCooldowns.clear();
  }

  public checkAccountLockout(identifier: string, ipAddress: string): { locked: boolean; retryAfterSeconds: number; reason?: string } {
    const key = identifier.trim().toLowerCase();
    const now = Date.now();

    const acct = this.accountLockouts.get(key);
    if (acct?.lockedUntil && acct.lockedUntil > now) {
      return {
        locked: true,
        retryAfterSeconds: Math.ceil((acct.lockedUntil - now) / 1000),
        reason: 'Account temporarily locked due to repeated failed login attempts.',
      };
    }

    // Check IP-level brute force window (3x account threshold)
    const ipThreshold = securityConfig.maxLoginAttempts * 3;
    const ipAttempts = (this.ipFailedAttempts.get(ipAddress) || []).filter(ts => now - ts < this.getWindowMs());
    if (ipAttempts.length >= ipThreshold) {
      return {
        locked: true,
        retryAfterSeconds: Math.ceil(this.getWindowMs() / 1000),
        reason: 'Too many failed authentication attempts from this IP address.',
      };
    }

    return { locked: false, retryAfterSeconds: 0 };
  }

  public async recordFailedLoginAttempt(params: {
    identifier: string;
    userId?: number | null;
    username?: string | null;
    email?: string | null;
    ipAddress: string;
    deviceId?: string | null;
    deviceName?: string | null;
    reason: string;
  }): Promise<{ lockedNow: boolean; attemptsInWindow: number }> {
    const key = params.identifier.trim().toLowerCase();
    const now = Date.now();
    const windowMs = this.getWindowMs();

    const entry = this.accountLockouts.get(key) || { failures: [], lockedUntil: null };
    entry.failures = entry.failures.filter(ts => now - ts < windowMs);
    entry.failures.push(now);

    const ipList = (this.ipFailedAttempts.get(params.ipAddress) || []).filter(ts => now - ts < windowMs);
    ipList.push(now);
    this.ipFailedAttempts.set(params.ipAddress, ipList);

    let lockedNow = false;
    if (entry.failures.length >= securityConfig.maxLoginAttempts) {
      entry.lockedUntil = now + windowMs;
      lockedNow = true;
    }
    this.accountLockouts.set(key, entry);

    if (lockedNow) {
      await this.raiseEvent({
        event_code: 'BRUTE_FORCE_LOCKOUT',
        title: `Account Locked After ${entry.failures.length} Failed Login Attempts`,
        severity: 'HIGH',
        user_id: params.userId ?? null,
        username: params.username ?? params.identifier,
        user_email: params.email ?? (params.identifier.includes('@') ? params.identifier : null),
        ip_address: params.ipAddress,
        device_id: params.deviceId ?? null,
        device_name: params.deviceName ?? null,
        endpoint: '/api/auth/login',
        description: `Account "${params.identifier}" was temporarily locked for ${securityConfig.loginLockoutMinutes} minutes after ${entry.failures.length} consecutive failed attempts from ${params.ipAddress}.`,
        details: {
          attempts: entry.failures.length,
          lockout_minutes: securityConfig.loginLockoutMinutes,
          last_reason: params.reason,
        },
        notifyAdmin: true,
        cooldownKey: `lockout:${key}:${params.ipAddress}`,
      });
    } else if (entry.failures.length === Math.max(3, securityConfig.maxLoginAttempts - 1)) {
      await this.raiseEvent({
        event_code: 'REPEATED_LOGIN_FAILURES',
        title: 'Repeated Failed Login Attempts Detected',
        severity: 'MEDIUM',
        user_id: params.userId ?? null,
        username: params.username ?? params.identifier,
        user_email: params.email ?? null,
        ip_address: params.ipAddress,
        device_id: params.deviceId ?? null,
        device_name: params.deviceName ?? null,
        endpoint: '/api/auth/login',
        description: `${entry.failures.length} failed login attempts for "${params.identifier}" from ${params.ipAddress}.`,
        details: { attempts: entry.failures.length, reason: params.reason },
        notifyAdmin: false,
      });
    }

    return { lockedNow, attemptsInWindow: entry.failures.length };
  }

  public clearFailedLoginAttempts(identifier: string): void {
    this.accountLockouts.delete(identifier.trim().toLowerCase());
  }

  public async trackUnauthorizedAccess(params: {
    statusCode: 401 | 403;
    userId?: number | null;
    username?: string | null;
    userEmail?: string | null;
    ipAddress: string;
    deviceId?: string | null;
    deviceName?: string | null;
    endpoint: string;
    permission?: string;
  }): Promise<void> {
    const now = Date.now();
    const key = `${params.ipAddress}:${params.userId || 'anon'}`;
    const list = (this.ipUnauthorizedBursts.get(key) || []).filter(ts => now - ts < 5 * 60 * 1000);
    list.push(now);
    this.ipUnauthorizedBursts.set(key, list);

    if (list.length >= 5) {
      await this.raiseEvent({
        event_code: params.statusCode === 403 ? 'REPEATED_PERMISSION_DENIAL' : 'REPEATED_UNAUTHORIZED_ACCESS',
        title: params.statusCode === 403 ? 'Repeated Forbidden Access Attempts (403)' : 'Repeated Unauthorized API Requests (401)',
        severity: 'HIGH',
        user_id: params.userId ?? null,
        username: params.username ?? null,
        user_email: params.userEmail ?? null,
        ip_address: params.ipAddress,
        device_id: params.deviceId ?? null,
        device_name: params.deviceName ?? null,
        endpoint: params.endpoint,
        description: `${list.length} HTTP ${params.statusCode} rejections in 5 minutes from ${params.ipAddress} targeting ${params.endpoint}.`,
        details: { burst_count: list.length, required_permission: params.permission || null },
        notifyAdmin: true,
        cooldownKey: `unauth:${key}`,
      });
    }
  }

  public async trackExportActivity(params: {
    userId: number;
    username?: string;
    userEmail?: string;
    ipAddress: string;
    endpoint: string;
    moduleName: string;
  }): Promise<void> {
    const now = Date.now();
    const list = (this.userExportBursts.get(params.userId) || []).filter(ts => now - ts < 10 * 60 * 1000);
    list.push(now);
    this.userExportBursts.set(params.userId, list);

    if (list.length >= 6) {
      await this.raiseEvent({
        event_code: 'UNUSUAL_EXPORT_VOLUME',
        title: 'Unusual Bulk Export Activity Detected',
        severity: 'MEDIUM',
        user_id: params.userId,
        username: params.username ?? null,
        user_email: params.userEmail ?? null,
        ip_address: params.ipAddress,
        endpoint: params.endpoint,
        description: `User ${params.userEmail || params.userId} triggered ${list.length} data exports within 10 minutes (latest: ${params.moduleName}).`,
        details: { export_count_10m: list.length, module: params.moduleName },
        notifyAdmin: true,
        cooldownKey: `export:${params.userId}`,
      });
    }
  }

  public async raiseEvent(params: {
    event_code: string;
    title: string;
    severity: SecuritySeverity;
    user_id?: number | null;
    username?: string | null;
    user_email?: string | null;
    ip_address?: string;
    device_id?: string | null;
    device_name?: string | null;
    endpoint?: string | null;
    description: string;
    details?: Record<string, any> | null;
    notifyAdmin?: boolean;
    notifyUserEmail?: string | null;
    notifyUserName?: string | null;
    cooldownKey?: string;
  }): Promise<SecurityEventRecord> {
    const shouldNotify =
      Boolean(params.notifyAdmin) ||
      params.severity === 'HIGH' ||
      params.severity === 'CRITICAL';

    const eventRecord = await securityStore.recordSecurityEvent({
      event_code: params.event_code,
      title: params.title,
      severity: params.severity,
      user_id: params.user_id ?? null,
      username: params.username ?? null,
      user_email: params.user_email ?? null,
      ip_address: params.ip_address || '127.0.0.1',
      device_id: params.device_id ?? null,
      device_name: params.device_name ?? null,
      endpoint: params.endpoint ?? null,
      description: params.description,
      details: params.details ?? null,
      alert_email_sent: false,
      alert_sent_at: null,
    });

    if (shouldNotify && process.env.NODE_ENV !== 'test') {
      const cKey = params.cooldownKey || `${params.event_code}:${params.ip_address || 'sys'}`;
      const lastSent = this.alertCooldowns.get(cKey) || 0;
      const cooldownMs = securityConfig.alertCooldownMinutes * 60 * 1000;

      if (Date.now() - lastSent >= cooldownMs) {
        this.alertCooldowns.set(cKey, Date.now());
        const recipient = securityConfig.securityAlertEmail;
        if (recipient) {
          // Dispatch asynchronously so login/API responses are never stalled by SMTP network latency
          emailService
            .sendSecurityAlertEmail({
              recipientEmail: recipient,
              recipientName: 'Nexora Security Administrator',
              alertType: `[${params.severity}] ${params.title}`,
              details: `${params.description} | IP: ${params.ip_address || 'unknown'}${params.device_name ? ` | Device: ${params.device_name}` : ''}`,
              timestamp: new Date(),
            })
            .then((res) => {
              if (res.success) {
                eventRecord.alert_email_sent = true;
                eventRecord.alert_sent_at = new Date().toISOString();
              }
            })
            .catch(() => {
              // Never interrupt request flow if SMTP fails
            });
        }
        if (params.notifyUserEmail && params.notifyUserEmail !== recipient) {
          emailService
            .sendSecurityAlertEmail({
              recipientEmail: params.notifyUserEmail,
              recipientName: params.notifyUserName || params.username || 'User',
              alertType: params.title,
              details: `${params.description} (IP: ${params.ip_address || 'unknown'})`,
              timestamp: new Date(),
            })
            .catch(() => {});
        }
      }
    }

    return eventRecord;
  }
}

export const securityMonitor = new SecurityMonitor();
