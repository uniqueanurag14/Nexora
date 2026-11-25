/**
 * Nexora Live Server & Connection Status Monitor
 *
 * Implements real-time, non-blocking health checks and continuous monitoring for:
 * 1. Frontend server (React / Vite)
 * 2. Python backend server (FastAPI)
 * 3. PostgreSQL database
 * 4. Email SMTP server
 * 5. Authentication service (JWT & bcrypt)
 * 6. File storage (Read / Write permissions)
 * 7. Configured external APIs
 *
 * Adheres strictly to Section 9 (Service-Specific Health-Check Methods),
 * Section 10 (Standardised Response), Section 11 (Overall Status Calculation),
 * and Section 4 (Continuous Monitoring without console spam).
 */

import dotenv from 'dotenv';
dotenv.config();

import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import pg from 'pg';
import nodemailer from 'nodemailer';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

export type ServiceStatus =
  | 'RUNNING'
  | 'NOT RUNNING'
  | 'CONNECTED'
  | 'DISCONNECTED'
  | 'ACTIVE'
  | 'INACTIVE'
  | 'AVAILABLE'
  | 'UNAVAILABLE'
  | 'DEGRADED'
  | 'FAILED'
  | 'NOT CONFIGURED';

export interface ServiceHealthCheckResult {
  service: string;
  status: ServiceStatus;
  response_time_ms: number;
  last_checked: string;
  message: string;
  is_mandatory: boolean;
  error_code?: string;
  failure_reason?: string;
}

export interface SystemHealthReport {
  overall_status: 'ALL SYSTEMS OPERATIONAL' | 'DEGRADED' | 'CRITICAL' | 'STARTING';
  last_checked: string;
  frontend_url: string;
  backend_url: string;
  services: ServiceHealthCheckResult[];
}

export class NexoraHealthMonitor {
  private port: number;
  private intervalMs: number;
  private timer: NodeJS.Timeout | null = null;
  private previousStates: Map<string, ServiceStatus> = new Map();
  private lastReport: SystemHealthReport | null = null;
  private isChecking: boolean = false;

  constructor(port: number = 3000, intervalSeconds: number = 60) {
    this.port = port;
    this.intervalMs = intervalSeconds * 1000;
  }

  /**
   * Helper: Measure execution duration of an async function in milliseconds.
   */
  private async measure<T>(fn: () => Promise<T>): Promise<{ result: T; durationMs: number }> {
    const start = performance.now();
    const result = await fn();
    const durationMs = Math.round(performance.now() - start);
    return { result, durationMs };
  }

  /**
   * 9.1 Frontend Server Health Check (React / Vite)
   */
  public async checkFrontendServer(appUrl?: string): Promise<ServiceHealthCheckResult> {
    const targetUrl = appUrl || `http://127.0.0.1:${this.port}/`;
    const start = performance.now();
    const nowIso = new Date().toISOString();

    return new Promise<ServiceHealthCheckResult>((resolve) => {
      try {
        const urlObj = new URL(targetUrl);
        const client = urlObj.protocol === 'https:' ? https : http;

        const req = client.get(
          targetUrl,
          { timeout: 2500, headers: { 'User-Agent': 'Nexora-Health-Check' } },
          (res) => {
            const durationMs = Math.round(performance.now() - start);
            res.resume(); // consume response body
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 400) {
              resolve({
                service: 'Frontend Server',
                status: 'RUNNING',
                response_time_ms: durationMs,
                last_checked: nowIso,
                message: `Frontend responds successfully with HTTP ${res.statusCode} (${durationMs}ms)`,
                is_mandatory: true,
              });
            } else {
              resolve({
                service: 'Frontend Server',
                status: 'FAILED',
                response_time_ms: durationMs,
                last_checked: nowIso,
                message: `Frontend returned HTTP ${res.statusCode}`,
                failure_reason: `Unexpected status code: ${res.statusCode}`,
                is_mandatory: true,
              });
            }
          }
        );

        req.on('timeout', () => {
          req.destroy();
          resolve({
            service: 'Frontend Server',
            status: 'FAILED',
            response_time_ms: Math.round(performance.now() - start),
            last_checked: nowIso,
            message: 'Frontend server request timed out after 2500ms',
            failure_reason: 'Request timeout',
            is_mandatory: true,
          });
        });

        req.on('error', (err) => {
          resolve({
            service: 'Frontend Server',
            status: 'FAILED',
            response_time_ms: Math.round(performance.now() - start),
            last_checked: nowIso,
            message: `Frontend server connection failed: ${err.message}`,
            failure_reason: err.message,
            is_mandatory: true,
          });
        });
      } catch (err: any) {
        resolve({
          service: 'Frontend Server',
          status: 'FAILED',
          response_time_ms: Math.round(performance.now() - start),
          last_checked: nowIso,
          message: `Frontend check error: ${err.message}`,
          failure_reason: err.message,
          is_mandatory: true,
        });
      }
    });
  }

  /**
   * 9.2 Python Backend Server Health Check (FastAPI)
   */
  public async checkPythonBackend(): Promise<ServiceHealthCheckResult> {
    const start = performance.now();
    const nowIso = new Date().toISOString();
    const pythonPort = process.env.BACKEND_PORT ? parseInt(process.env.BACKEND_PORT, 10) : 8001;
    const candidates = [pythonPort, 8000];

    for (const port of candidates) {
      const probeUrl = `http://127.0.0.1:${port}/api/health/liveness`;
      const res = await new Promise<ServiceHealthCheckResult | null>((resolve) => {
        try {
          const req = http.get(
            probeUrl,
            { timeout: 1500, headers: { 'User-Agent': 'Nexora-Health-Check' } },
            (httpRes) => {
              const durationMs = Math.round(performance.now() - start);
              httpRes.resume();
              if (httpRes.statusCode && httpRes.statusCode >= 200 && httpRes.statusCode < 400) {
                resolve({
                  service: 'Python Backend Server',
                  status: 'RUNNING',
                  response_time_ms: durationMs,
                  last_checked: nowIso,
                  message: `Python FastAPI server active on port ${port} (${durationMs}ms)`,
                  is_mandatory: false,
                });
              } else {
                resolve(null);
              }
            }
          );
          req.on('timeout', () => { req.destroy(); resolve(null); });
          req.on('error', () => { resolve(null); });
        } catch {
          resolve(null);
        }
      });

      if (res) return res;
    }

    const durationMs = Math.round(performance.now() - start);
    return {
      service: 'Python Backend Server',
      status: 'NOT RUNNING',
      response_time_ms: durationMs,
      last_checked: nowIso,
      message: `Python backend process is not listening on port ${pythonPort} (Node Express backend handles API requests)`,
      failure_reason: 'Connection refused on backend port',
      is_mandatory: false,
    };
  }

  /**
   * 9.3 PostgreSQL Database Health Check
   */
  public async checkPostgreSql(): Promise<ServiceHealthCheckResult> {
    const start = performance.now();
    const nowIso = new Date().toISOString();
    const dbUrl = process.env.DATABASE_URL;

    if (!dbUrl || !dbUrl.trim()) {
      return {
        service: 'PostgreSQL Database',
        status: 'NOT CONFIGURED',
        response_time_ms: 0,
        last_checked: nowIso,
        message: 'DATABASE_URL environment variable is not defined',
        is_mandatory: false,
      };
    }

    // Sanitize connection string for safe log/report display
    const sanitizedUrl = dbUrl.replace(/:[^:@]*@/, ':••••••••@');

    try {
      const client = new pg.Client({
        connectionString: dbUrl,
        connectionTimeoutMillis: 2000,
      });

      await client.connect();
      const queryStart = performance.now();
      await client.query('SELECT 1;');
      const queryDurationMs = Math.round(performance.now() - queryStart);
      await client.end();

      const totalDurationMs = Math.round(performance.now() - start);
      const isDegraded = totalDurationMs > 1500;

      return {
        service: 'PostgreSQL Database',
        status: isDegraded ? 'DEGRADED' : 'CONNECTED',
        response_time_ms: totalDurationMs,
        last_checked: nowIso,
        message: isDegraded
          ? `Database connected but query latency elevated (${totalDurationMs}ms)`
          : `PostgreSQL connection and ping query successful (${totalDurationMs}ms)`,
        is_mandatory: true,
      };
    } catch (err: any) {
      const durationMs = Math.round(performance.now() - start);
      // Clean error message - NEVER expose credentials
      const cleanMessage = err.message
        ? err.message.replace(/password=[^\s]*/gi, 'password=••••')
        : 'Connection failed';

      return {
        service: 'PostgreSQL Database',
        status: 'DISCONNECTED',
        response_time_ms: durationMs,
        last_checked: nowIso,
        message: `Database connection error: ${cleanMessage} (${sanitizedUrl})`,
        failure_reason: cleanMessage,
        is_mandatory: true,
      };
    }
  }

  /**
   * 9.4 Email SMTP Server Health Check
   */
  public async checkEmailSmtp(): Promise<ServiceHealthCheckResult> {
    const start = performance.now();
    const nowIso = new Date().toISOString();

    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT || '465', 10);
    const secure = process.env.SMTP_SECURE === 'true' || port === 465;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASSWORD || process.env.SMTP_PASS;

    if (!host || !host.trim()) {
      return {
        service: 'Email SMTP Server',
        status: 'NOT CONFIGURED',
        response_time_ms: 0,
        last_checked: nowIso,
        message: 'SMTP host is not configured in environment',
        is_mandatory: false,
      };
    }

    try {
      const transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: user && pass ? { user, pass } : undefined,
        connectionTimeout: 4000,
        greetingTimeout: 3000,
        socketTimeout: 4000,
        tls: { rejectUnauthorized: false },
      });

      // Verify connection and authentication without sending any email
      await transporter.verify();
      const durationMs = Math.round(performance.now() - start);

      return {
        service: 'Email SMTP Server',
        status: 'CONNECTED',
        response_time_ms: durationMs,
        last_checked: nowIso,
        message: `SMTP gateway verified via ${host}:${port} (${durationMs}ms)`,
        is_mandatory: false,
      };
    } catch (err: any) {
      const durationMs = Math.round(performance.now() - start);
      const rawMsg = err.message || '';
      const isAuthOrTls =
        rawMsg.toLowerCase().includes('auth') ||
        rawMsg.toLowerCase().includes('credential') ||
        rawMsg.toLowerCase().includes('tls') ||
        rawMsg.toLowerCase().includes('certificate');

      // Sanitize any sensitive token/password fragments
      const sanitized = rawMsg
        .replace(/pass(word)?\s*[:=]\s*[^\s]+/gi, 'password=••••')
        .replace(/[A-Za-z0-9+/=]{20,}/g, '••••');

      return {
        service: 'Email SMTP Server',
        status: isAuthOrTls ? 'DEGRADED' : 'DISCONNECTED',
        response_time_ms: durationMs,
        last_checked: nowIso,
        message: `SMTP check notice: ${sanitized || 'Handshake failed'}`,
        failure_reason: sanitized,
        is_mandatory: false,
      };
    }
  }

  /**
   * 9.5 Authentication Service Health Check (JWT, bcrypt, RBAC)
   */
  public async checkAuthenticationService(): Promise<ServiceHealthCheckResult> {
    const start = performance.now();
    const nowIso = new Date().toISOString();

    try {
      const jwtSecret =
        process.env.JWT_ACCESS_SECRET || 'nexora_sec_48a97f2e1c9842f1b802e3a598c1704d9b62f1a8c3e';

      // 1. Verify token signing and cryptographic verification
      const payload = { sub: 'health_probe', type: 'system_health', iat: Math.floor(Date.now() / 1000) };
      const token = jwt.sign(payload, jwtSecret, { expiresIn: '60s' });
      const decoded = jwt.verify(token, jwtSecret) as any;

      if (!decoded || decoded.sub !== 'health_probe') {
        throw new Error('JWT token verification payload mismatch');
      }

      // 2. Verify password hashing engine
      const testPass = 'ProbeTestPass@2026';
      const hash = await bcrypt.hash(testPass, 8);
      const isMatch = await bcrypt.compare(testPass, hash);
      if (!isMatch) {
        throw new Error('Bcrypt password verification failed');
      }

      const durationMs = Math.round(performance.now() - start);
      return {
        service: 'Authentication Service',
        status: 'ACTIVE',
        response_time_ms: durationMs,
        last_checked: nowIso,
        message: `JWT token signing, verification, and bcrypt hashing operational (${durationMs}ms)`,
        is_mandatory: true,
      };
    } catch (err: any) {
      const durationMs = Math.round(performance.now() - start);
      return {
        service: 'Authentication Service',
        status: 'FAILED',
        response_time_ms: durationMs,
        last_checked: nowIso,
        message: `Authentication engine failure: ${err.message}`,
        failure_reason: err.message,
        is_mandatory: true,
      };
    }
  }

  /**
   * 9.6 File Storage Health Check
   */
  public async checkFileStorage(): Promise<ServiceHealthCheckResult> {
    const start = performance.now();
    const nowIso = new Date().toISOString();

    try {
      const backupsDir = path.resolve(process.cwd(), 'database', 'backups');
      if (!fs.existsSync(backupsDir)) {
        fs.mkdirSync(backupsDir, { recursive: true });
      }

      // Verify read permission
      fs.accessSync(backupsDir, fs.constants.R_OK);

      // Verify write permission with safe, non-destructive probe file
      const probeFile = path.join(backupsDir, `.health_probe_${process.pid}_${Date.now()}.tmp`);
      const testContent = `probe_${Date.now()}`;
      fs.writeFileSync(probeFile, testContent, 'utf-8');

      const readBack = fs.readFileSync(probeFile, 'utf-8');
      if (readBack !== testContent) {
        throw new Error('File storage write/read integrity verification failed');
      }

      // Clean up temporary probe file immediately
      if (fs.existsSync(probeFile)) {
        fs.unlinkSync(probeFile);
      }

      const durationMs = Math.round(performance.now() - start);
      return {
        service: 'File Storage',
        status: 'AVAILABLE',
        response_time_ms: durationMs,
        last_checked: nowIso,
        message: `Storage directory verified with read/write access (${durationMs}ms)`,
        is_mandatory: true,
      };
    } catch (err: any) {
      const durationMs = Math.round(performance.now() - start);
      return {
        service: 'File Storage',
        status: 'UNAVAILABLE',
        response_time_ms: durationMs,
        last_checked: nowIso,
        message: `File storage access failed: ${err.message}`,
        failure_reason: err.message,
        is_mandatory: true,
      };
    }
  }

  /**
   * 9.7 External API Health Check
   */
  public async checkExternalApis(): Promise<ServiceHealthCheckResult> {
    const nowIso = new Date().toISOString();
    const hasGemini = Boolean(process.env.GEMINI_API_KEY);

    if (!hasGemini) {
      return {
        service: 'External APIs',
        status: 'NOT CONFIGURED',
        response_time_ms: 0,
        last_checked: nowIso,
        message: 'No third-party external APIs configured in environment',
        is_mandatory: false,
      };
    }

    const start = performance.now();
    return new Promise<ServiceHealthCheckResult>((resolve) => {
      try {
        const req = https.get(
          'https://generativelanguage.googleapis.com/',
          { timeout: 2500 },
          (res) => {
            const durationMs = Math.round(performance.now() - start);
            res.resume();
            resolve({
              service: 'External APIs',
              status: res.statusCode && res.statusCode < 500 ? 'CONNECTED' : 'DEGRADED',
              response_time_ms: durationMs,
              last_checked: nowIso,
              message: `External API gateway responded (${durationMs}ms)`,
              is_mandatory: false,
            });
          }
        );
        req.on('timeout', () => {
          req.destroy();
          resolve({
            service: 'External APIs',
            status: 'FAILED',
            response_time_ms: Math.round(performance.now() - start),
            last_checked: nowIso,
            message: 'External API endpoint timed out',
            is_mandatory: false,
          });
        });
        req.on('error', (err) => {
          resolve({
            service: 'External APIs',
            status: 'FAILED',
            response_time_ms: Math.round(performance.now() - start),
            last_checked: nowIso,
            message: `External API unreachable: ${err.message}`,
            is_mandatory: false,
          });
        });
      } catch {
        resolve({
          service: 'External APIs',
          status: 'NOT CONFIGURED',
          response_time_ms: 0,
          last_checked: nowIso,
          message: 'No external APIs configured',
          is_mandatory: false,
        });
      }
    });
  }

  /**
   * Run full system health check across all services in parallel.
   */
  public async runFullCheck(): Promise<SystemHealthReport> {
    if (this.isChecking) {
      if (this.lastReport) return this.lastReport;
    }
    this.isChecking = true;

    try {
      const nowIso = new Date().toISOString();
      const frontendUrl = (process.env.FRONTEND_URL || process.env.APP_URL || `http://localhost:${this.port}`).replace(/\/+$/, '');
      const backendUrl = (process.env.BACKEND_URL || process.env.APP_URL || `http://localhost:${this.port}`).replace(/\/+$/, '');
      const localProbeUrl = `http://127.0.0.1:${this.port}/`;

      const [frontend, python, postgres, smtp, auth, storage, external] = await Promise.all([
        this.checkFrontendServer(process.env.NODE_ENV === 'production' ? localProbeUrl : frontendUrl),
        this.checkPythonBackend(),
        this.checkPostgreSql(),
        this.checkEmailSmtp(),
        this.checkAuthenticationService(),
        this.checkFileStorage(),
        this.checkExternalApis(),
      ]);

      const services: ServiceHealthCheckResult[] = [
        frontend,
        python,
        postgres,
        smtp,
        auth,
        storage,
        external,
      ];

      // Section 11: Overall Status Calculation
      let overallStatus: SystemHealthReport['overall_status'] = 'ALL SYSTEMS OPERATIONAL';

      const criticalFailures = services.filter(
        (s) => s.is_mandatory && (s.status === 'FAILED' || s.status === 'UNAVAILABLE')
      );

      if (criticalFailures.length > 0) {
        overallStatus = 'CRITICAL';
      } else {
        const degradedOrOffline = services.filter(
          (s) => s.status === 'DEGRADED' || (s.status === 'DISCONNECTED' && s.is_mandatory)
        );
        if (degradedOrOffline.length > 0) {
          overallStatus = 'DEGRADED';
        }
      }

      this.lastReport = {
        overall_status: overallStatus,
        last_checked: nowIso,
        frontend_url: frontendUrl,
        backend_url: backendUrl,
        services,
      };

      return this.lastReport;
    } finally {
      this.isChecking = false;
    }
  }

  /**
   * Section 3: Print the Standardized Terminal Banner
   */
  public printStatusBanner(report: SystemHealthReport): void {
    const getStatusText = (name: string): string => {
      const s = report.services.find((item) => item.service.toLowerCase().includes(name.toLowerCase()));
      return s ? s.status : 'UNKNOWN';
    };

    const frontendStatus = getStatusText('frontend');
    const backendStatus = getStatusText('python') === 'RUNNING' ? 'RUNNING' : 'RUNNING (NODE)';
    const postgresStatus = getStatusText('postgresql');
    const smtpStatus = getStatusText('smtp');
    const authStatus = getStatusText('authentication');
    const storageStatus = getStatusText('storage');
    const externalStatus = getStatusText('external');

    const formattedDate = new Date(report.last_checked).toUTCString();

    console.log('');
    console.log('================================================');
    console.log('             NEXORA SYSTEM MONITOR              ');
    console.log('================================================');
    console.log('');
    console.log(`FRONTEND SERVER       : ${frontendStatus}`);
    console.log(`BACKEND SERVER        : ${backendStatus}`);
    console.log(`POSTGRESQL DATABASE   : ${postgresStatus}`);
    console.log(`EMAIL SMTP SERVER     : ${smtpStatus}`);
    console.log(`AUTHENTICATION        : ${authStatus}`);
    console.log(`FILE STORAGE          : ${storageStatus}`);
    console.log(`EXTERNAL APIs         : ${externalStatus}`);
    console.log('');
    console.log('------------------------------------------------');
    console.log(`OVERALL STATUS        : ${report.overall_status}`);
    console.log('------------------------------------------------');
    console.log('');
    console.log(`Frontend URL          : ${report.frontend_url}`);
    console.log(`Backend URL           : ${report.backend_url}`);
    console.log('');
    console.log(`Last Health Check     : ${formattedDate}`);
    console.log('');
    console.log('================================================');
    console.log('              NEXORA IS READY                   ');
    console.log('================================================');
    console.log('');

    // Save initial state map
    for (const s of report.services) {
      this.previousStates.set(s.service, s.status);
    }
  }

  /**
   * Section 4: Continuous Health Monitoring Loop
   * Checks every 60s, logs only state changes (alerts / recoveries) without console spam.
   */
  public startMonitoring(): void {
    if (this.timer) return;

    this.timer = setInterval(async () => {
      try {
        const report = await this.runFullCheck();
        const now = new Date().toISOString();

        for (const s of report.services) {
          const prev = this.previousStates.get(s.service);

          if (prev && prev !== s.status) {
            const isFailure =
              s.status === 'FAILED' || s.status === 'DISCONNECTED' || s.status === 'UNAVAILABLE';
            const isRecovery =
              (prev === 'FAILED' || prev === 'DISCONNECTED' || prev === 'UNAVAILABLE') &&
              (s.status === 'RUNNING' || s.status === 'CONNECTED' || s.status === 'ACTIVE' || s.status === 'AVAILABLE');

            if (isFailure) {
              console.log(
                `[ALERT] ${now} - ${s.service} is ${s.status}: ${s.message} (${s.response_time_ms}ms)`
              );
            } else if (isRecovery) {
              console.log(
                `[RECOVERY] ${now} - ${s.service} is RESTORED: ${s.status} (${s.response_time_ms}ms)`
              );
            } else {
              console.log(
                `[NOTICE] ${now} - ${s.service} status changed: ${prev} -> ${s.status} (${s.response_time_ms}ms)`
              );
            }

            this.previousStates.set(s.service, s.status);
          } else if (!prev) {
            this.previousStates.set(s.service, s.status);
          }
        }
      } catch (err: any) {
        console.warn(`[Nexora Health Monitor Notice]: ${err.message}`);
      }
    }, this.intervalMs);

    // Ensure timer doesn't hold the process open if everything else exits
    if (this.timer.unref) {
      this.timer.unref();
    }
  }

  /**
   * Stop background health monitoring gracefully.
   */
  public stopMonitoring(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Retrieve the most recent health check report.
   */
  public getLastReport(): SystemHealthReport | null {
    return this.lastReport;
  }
}

export const healthMonitor = new NexoraHealthMonitor(
  parseInt(process.env.PORT || process.env.SERVER_PORT || '3000', 10),
  parseInt(process.env.HEALTH_CHECK_INTERVAL_SECONDS || '60', 10)
);
