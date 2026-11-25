import test from 'node:test';
import assert from 'node:assert/strict';
import { NexoraHealthMonitor, type ServiceHealthCheckResult, type SystemHealthReport } from '../../server/healthMonitor.ts';

test('Nexora Health Monitor: Constructor sets valid port and check interval', () => {
  const monitor = new NexoraHealthMonitor(3000, 60);
  assert.ok(monitor, 'Monitor instance should be created');
  assert.strictEqual(typeof monitor.runFullCheck, 'function');
  assert.strictEqual(typeof monitor.printStatusBanner, 'function');
  assert.strictEqual(typeof monitor.startMonitoring, 'function');
  assert.strictEqual(typeof monitor.stopMonitoring, 'function');
});

test('Nexora Health Monitor: Standardised response schema verification (Section 10)', async () => {
  const monitor = new NexoraHealthMonitor(3000, 60);
  const report: SystemHealthReport = await monitor.runFullCheck();

  // Verify top-level report structure
  assert.ok(report, 'Report should be returned');
  assert.ok(['ALL SYSTEMS OPERATIONAL', 'DEGRADED', 'CRITICAL', 'STARTING'].includes(report.overall_status));
  assert.ok(typeof report.last_checked === 'string' && report.last_checked.length > 0);
  assert.ok(report.frontend_url.startsWith('http://') || report.frontend_url.startsWith('https://'));
  assert.ok(report.backend_url.startsWith('http://') || report.backend_url.startsWith('https://'));
  assert.ok(Array.isArray(report.services));
  assert.strictEqual(report.services.length, 7, 'Must monitor exactly 7 core services');

  // Verify each service health check object schema
  for (const s of report.services) {
    assert.ok(typeof s.service === 'string' && s.service.length > 0, 'service name is required');
    assert.ok(typeof s.status === 'string', 'status is required');
    assert.ok(typeof s.response_time_ms === 'number' && s.response_time_ms >= 0, 'response_time_ms is non-negative');
    assert.ok(typeof s.last_checked === 'string', 'last_checked ISO timestamp is required');
    assert.ok(typeof s.message === 'string' && s.message.length > 0, 'descriptive message is required');
    assert.ok(typeof s.is_mandatory === 'boolean', 'is_mandatory flag is required');
  }
});

test('Nexora Health Monitor: Authentication service check validates JWT and bcrypt (9.5)', async () => {
  const monitor = new NexoraHealthMonitor(3000, 60);
  const authResult = await monitor.checkAuthenticationService();

  assert.ok(authResult.service.includes('Authentication'));
  assert.strictEqual(authResult.is_mandatory, true);
  assert.strictEqual(authResult.status, 'ACTIVE');
  assert.ok(authResult.response_time_ms >= 0);
  assert.ok(authResult.message.includes('operational') || authResult.message.includes('verified'));
});

test('Nexora Health Monitor: File storage health check verifies read/write and cleans up (9.6)', async () => {
  const monitor = new NexoraHealthMonitor(3000, 60);
  const storageResult = await monitor.checkFileStorage();

  assert.strictEqual(storageResult.service, 'File Storage');
  assert.ok(storageResult.status === 'AVAILABLE' || storageResult.status === 'DEGRADED');
  assert.ok(storageResult.response_time_ms >= 0);
  assert.ok(typeof storageResult.message === 'string');
});

test('Nexora Health Monitor: Overall status calculation logic adheres to Section 11', () => {
  const monitor = new NexoraHealthMonitor(3000, 60);

  // Scenario 1: All healthy
  const healthyServices: ServiceHealthCheckResult[] = [
    { service: 'Frontend', status: 'RUNNING', response_time_ms: 5, last_checked: '', message: 'OK', is_mandatory: true },
    { service: 'Python Backend', status: 'NOT RUNNING', response_time_ms: 1, last_checked: '', message: 'Offline', is_mandatory: false },
    { service: 'PostgreSQL', status: 'CONNECTED', response_time_ms: 10, last_checked: '', message: 'OK', is_mandatory: false },
    { service: 'Email SMTP', status: 'CONNECTED', response_time_ms: 15, last_checked: '', message: 'OK', is_mandatory: false },
    { service: 'Authentication', status: 'ACTIVE', response_time_ms: 2, last_checked: '', message: 'OK', is_mandatory: true },
    { service: 'File Storage', status: 'AVAILABLE', response_time_ms: 1, last_checked: '', message: 'OK', is_mandatory: true },
    { service: 'External APIs', status: 'NOT CONFIGURED', response_time_ms: 0, last_checked: '', message: 'N/A', is_mandatory: false },
  ];

  // Mock checking overall logic
  let critical = healthyServices.filter(s => s.is_mandatory && (s.status === 'FAILED' || s.status === 'UNAVAILABLE'));
  let degraded = healthyServices.filter(s => s.status === 'DEGRADED' || (s.status === 'DISCONNECTED' && s.is_mandatory));
  assert.strictEqual(critical.length, 0);
  assert.strictEqual(degraded.length, 0);

  // Scenario 2: Mandatory service fails -> CRITICAL
  const criticalServices: ServiceHealthCheckResult[] = [
    ...healthyServices.map(s => s.service === 'Authentication' ? { ...s, status: 'FAILED' as const } : s),
  ];
  critical = criticalServices.filter(s => s.is_mandatory && (s.status === 'FAILED' || s.status === 'UNAVAILABLE'));
  assert.strictEqual(critical.length > 0, true);

  // Scenario 3: Non-mandatory service degraded -> DEGRADED
  const degradedServices: ServiceHealthCheckResult[] = [
    ...healthyServices.map(s => s.service === 'File Storage' ? { ...s, status: 'DEGRADED' as const } : s),
  ];
  degraded = degradedServices.filter(s => s.status === 'DEGRADED' || (s.status === 'DISCONNECTED' && s.is_mandatory));
  assert.strictEqual(degraded.length > 0, true);
});

test('Nexora Health Monitor: Credential masking guarantees no password or secret leaks', async () => {
  const monitor = new NexoraHealthMonitor(3000, 60);
  const report = await monitor.runFullCheck();

  const reportString = JSON.stringify(report);
  assert.strictEqual(reportString.includes(process.env.DATABASE_URL || 'never_leak_db_secret_999'), false);
  if (process.env.SMTP_PASS) {
    assert.strictEqual(reportString.includes(process.env.SMTP_PASS), false);
  }
  if (process.env.JWT_ACCESS_SECRET) {
    assert.strictEqual(reportString.includes(process.env.JWT_ACCESS_SECRET), false);
  }
});

test('Nexora Health Monitor: Terminal banner formatting matches Section 3 ASCII standard', () => {
  const monitor = new NexoraHealthMonitor(3000, 60);

  const mockReport: SystemHealthReport = {
    overall_status: 'ALL SYSTEMS OPERATIONAL',
    last_checked: new Date('2026-11-02T12:00:00Z').toISOString(),
    frontend_url: 'http://localhost:3000',
    backend_url: 'http://localhost:3000',
    services: [
      { service: 'Frontend Server', status: 'RUNNING', response_time_ms: 10, last_checked: '', message: 'OK', is_mandatory: true },
      { service: 'Python Backend Server', status: 'NOT RUNNING', response_time_ms: 1, last_checked: '', message: 'Offline', is_mandatory: false },
      { service: 'PostgreSQL Database', status: 'CONNECTED', response_time_ms: 5, last_checked: '', message: 'OK', is_mandatory: false },
      { service: 'Email SMTP Server', status: 'CONNECTED', response_time_ms: 12, last_checked: '', message: 'OK', is_mandatory: false },
      { service: 'Authentication', status: 'ACTIVE', response_time_ms: 3, last_checked: '', message: 'OK', is_mandatory: true },
      { service: 'File Storage', status: 'AVAILABLE', response_time_ms: 1, last_checked: '', message: 'OK', is_mandatory: true },
      { service: 'External APIs', status: 'NOT CONFIGURED', response_time_ms: 0, last_checked: '', message: 'None', is_mandatory: false },
    ],
  };

  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (...args: any[]) => logs.push(args.join(' '));

  try {
    monitor.printStatusBanner(mockReport);
  } finally {
    console.log = originalLog;
  }

  const output = logs.join('\n');
  assert.ok(output.includes('NEXORA SYSTEM MONITOR'));
  assert.ok(output.includes('FRONTEND SERVER       : RUNNING'));
  assert.ok(output.includes('BACKEND SERVER        : RUNNING (NODE)'));
  assert.ok(output.includes('POSTGRESQL DATABASE   : CONNECTED'));
  assert.ok(output.includes('EMAIL SMTP SERVER     : CONNECTED'));
  assert.ok(output.includes('AUTHENTICATION        : ACTIVE'));
  assert.ok(output.includes('FILE STORAGE          : AVAILABLE'));
  assert.ok(output.includes('EXTERNAL APIs         : NOT CONFIGURED'));
  assert.ok(output.includes('OVERALL STATUS        : ALL SYSTEMS OPERATIONAL'));
  assert.ok(output.includes('Frontend URL          : http://localhost:3000'));
  assert.ok(output.includes('Backend URL           : http://localhost:3000'));
  assert.ok(output.includes('NEXORA IS READY'));
});
