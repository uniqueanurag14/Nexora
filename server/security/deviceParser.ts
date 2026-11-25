import crypto from 'crypto';
import type { Request } from 'express';
import { securityConfig } from './config';

export interface ParsedDeviceContext {
  ipAddress: string;
  userAgent: string;
  deviceId: string;
  deviceName: string;
  deviceType: 'Desktop' | 'Laptop' | 'Tablet' | 'Mobile' | 'API Client';
  osName: string;
  osVersion: string;
  browserName: string;
  browserVersion: string;
  /**
   * Honest provenance:
   * - 'browser_reported': standard web browser telemetry (cannot determine OS hostname or MAC address).
   * - 'verified_agent': authenticated enterprise desktop agent presenting valid VERIFIED_AGENT_TOKEN.
   */
  clientSource: 'browser_reported' | 'verified_agent';
  verifiedMachineName: string | null;
}

function sanitizeHeader(val: unknown, maxLen = 180): string {
  if (typeof val !== 'string') return '';
  return val.replace(/[\r\n\0<>]/g, '').trim().slice(0, maxLen);
}

export function extractClientIp(req: Request): string {
  // Never blindly trust X-Forwarded-For unless Express's configured trust proxy accepted the hop.
  // Express computes `req.ip` strictly according to `app.set('trust proxy', runtimeConfig.trustProxy)`.
  if (securityConfig.trustProxy !== false && req.ip) {
    return String(req.ip).replace(/^::ffff:/, '');
  }
  const sockIp = req.socket?.remoteAddress || '127.0.0.1';
  return String(sockIp).replace(/^::ffff:/, '');
}

export function parseUserAgent(rawUa: string): {
  osName: string;
  osVersion: string;
  browserName: string;
  browserVersion: string;
  deviceType: ParsedDeviceContext['deviceType'];
} {
  const ua = (rawUa || '').trim();
  if (!ua) {
    return {
      osName: 'Unknown OS',
      osVersion: '',
      browserName: 'Unknown Client',
      browserVersion: '',
      deviceType: 'API Client',
    };
  }

  // Detect OS
  let osName = 'Unknown OS';
  let osVersion = '';
  if (/Windows NT 10\.0/i.test(ua)) {
    osName = 'Windows';
    osVersion = '10/11';
  } else if (/Windows NT 6\.3/i.test(ua)) {
    osName = 'Windows';
    osVersion = '8.1';
  } else if (/Windows NT 6\.1/i.test(ua)) {
    osName = 'Windows';
    osVersion = '7';
  } else if (/Android\s+([\d.]+)/i.test(ua)) {
    osName = 'Android';
    osVersion = ua.match(/Android\s+([\d.]+)/i)?.[1] || '';
  } else if (/iPhone OS\s+([\d_]+)/i.test(ua) || /iPad; CPU OS\s+([\d_]+)/i.test(ua)) {
    osName = 'iOS';
    osVersion = (ua.match(/OS\s+([\d_]+)/i)?.[1] || '').replace(/_/g, '.');
  } else if (/Mac OS X\s+([\d_]+)/i.test(ua)) {
    osName = 'macOS';
    osVersion = (ua.match(/Mac OS X\s+([\d_]+)/i)?.[1] || '').replace(/_/g, '.');
  } else if (/CrOS/i.test(ua)) {
    osName = 'ChromeOS';
  } else if (/Ubuntu/i.test(ua)) {
    osName = 'Ubuntu Linux';
  } else if (/Linux/i.test(ua)) {
    osName = 'Linux';
  }

  // Detect Browser
  let browserName = 'Unknown Browser';
  let browserVersion = '';
  if (/Edg\/([\d.]+)/i.test(ua)) {
    browserName = 'Microsoft Edge';
    browserVersion = ua.match(/Edg\/([\d.]+)/i)?.[1] || '';
  } else if (/OPR\/([\d.]+)/i.test(ua)) {
    browserName = 'Opera';
    browserVersion = ua.match(/OPR\/([\d.]+)/i)?.[1] || '';
  } else if (/Chrome\/([\d.]+)/i.test(ua) && !/Chromium/i.test(ua)) {
    browserName = 'Google Chrome';
    browserVersion = ua.match(/Chrome\/([\d.]+)/i)?.[1] || '';
  } else if (/Firefox\/([\d.]+)/i.test(ua)) {
    browserName = 'Mozilla Firefox';
    browserVersion = ua.match(/Firefox\/([\d.]+)/i)?.[1] || '';
  } else if (/Version\/([\d.]+).*Safari/i.test(ua)) {
    browserName = 'Apple Safari';
    browserVersion = ua.match(/Version\/([\d.]+)/i)?.[1] || '';
  } else if (/curl\/([\d.]+)/i.test(ua)) {
    browserName = 'cURL';
    browserVersion = ua.match(/curl\/([\d.]+)/i)?.[1] || '';
  } else if (/node|undici|axios|fetch/i.test(ua)) {
    browserName = 'Automated HTTP Client';
  }

  // Detect Device Type
  let deviceType: ParsedDeviceContext['deviceType'] = 'Desktop';
  if (/iPad|Tablet|PlayBook|Silk/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) {
    deviceType = 'Tablet';
  } else if (/Mobile|iPhone|iPod|Android.*Mobile|Windows Phone/i.test(ua)) {
    deviceType = 'Mobile';
  } else if (browserName === 'cURL' || browserName === 'Automated HTTP Client') {
    deviceType = 'API Client';
  }

  return { osName, osVersion, browserName, browserVersion, deviceType };
}

function timingSafeMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Extracts honest device telemetry from HTTP request.
 * Never fabricates physical hostnames or MAC addresses from browser requests.
 */
export function extractDeviceContext(req: Request): ParsedDeviceContext {
  const ipAddress = extractClientIp(req);
  const userAgent = sanitizeHeader(req.headers['user-agent'] || '', 500);
  const parsed = parseUserAgent(userAgent);

  // Check optional verified enterprise desktop agent credentials
  const agentToken = sanitizeHeader(req.headers['x-nexora-agent-token'], 256);
  const claimedMachine = sanitizeHeader(req.headers['x-nexora-machine-name'], 128);
  const isVerifiedAgent = Boolean(
    securityConfig.verifiedAgentToken &&
    agentToken &&
    timingSafeMatch(agentToken, securityConfig.verifiedAgentToken) &&
    claimedMachine
  );

  // Persistent privacy-conscious browser device_id (generated client-side via crypto.randomUUID)
  const headerDeviceId = sanitizeHeader(
    req.headers['x-nexora-device-id'] || (req.body && typeof req.body === 'object' ? (req.body as any).device_id : ''),
    128
  );

  let deviceId = headerDeviceId;
  if (!deviceId || !/^[A-Za-z0-9_\-:.]{8,128}$/.test(deviceId)) {
    // Deterministic fallback identifier scoped to UA + client type when client did not send X-Nexora-Device-Id
    deviceId = `srv_${crypto.createHash('sha256').update(`${userAgent}|${parsed.osName}|${parsed.browserName}`).digest('hex').slice(0, 24)}`;
  }

  const clientLabel = sanitizeHeader(
    req.body && typeof req.body === 'object' ? (req.body as any).device_label : '',
    120
  );

  const osDisplay = parsed.osVersion ? `${parsed.osName} ${parsed.osVersion}` : parsed.osName;
  const browserDisplay = parsed.browserVersion
    ? `${parsed.browserName} ${parsed.browserVersion.split('.')[0]}`
    : parsed.browserName;

  const deviceName = isVerifiedAgent
    ? `${claimedMachine} (Verified Agent · ${osDisplay})`
    : clientLabel
      ? `${clientLabel} (${browserDisplay} on ${osDisplay})`
      : `${browserDisplay} on ${osDisplay}`;

  return {
    ipAddress,
    userAgent: userAgent || 'Unknown',
    deviceId,
    deviceName,
    deviceType: parsed.deviceType,
    osName: parsed.osName,
    osVersion: parsed.osVersion,
    browserName: parsed.browserName,
    browserVersion: parsed.browserVersion,
    clientSource: isVerifiedAgent ? 'verified_agent' : 'browser_reported',
    verifiedMachineName: isVerifiedAgent ? claimedMachine : null,
  };
}
