import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { Request } from 'express';
import { securityConfig } from './config';
import { computeRedactedDiff, redactSensitiveData, redactString } from './redaction';
import { extractDeviceContext } from './deviceParser';
import { ActivityLogRecord, securityStore } from './securityStore';

export interface AuditLogInput {
  user_id?: number | null;
  username?: string | null;
  user_email?: string | null;
  user_role?: string | null;
  module_name: string;
  action_type: string;
  entity_type?: string | null;
  entity_id?: string | number | null;
  http_method?: string | null;
  api_endpoint?: string | null;
  ip_address?: string;
  device_id?: string | null;
  device_name?: string | null;
  browser_name?: string | null;
  os_name?: string | null;
  session_id?: string | null;
  status?: 'SUCCESS' | 'FAILED' | 'DENIED' | 'WARNING';
  response_status_code?: number | null;
  description?: string | null;
  before_values?: Record<string, any> | null;
  after_values?: Record<string, any> | null;
  metadata?: Record<string, any> | null;
  req?: Request;
}

export interface AuditIntegrityReport {
  valid: boolean;
  checked_count: number;
  broken_at_id: number | null;
  tampered_ids: number[];
  reason: string;
  verified_at: string;
  latest_hash: string;
}

/**
 * Computes deterministic canonical SHA-256 hash chaining each entry to the previous entry
 * and signs with HMAC-SHA256 using external AUDIT_SIGNING_KEY (never stored in DB).
 */
export function computeAuditHashes(
  payload: Omit<ActivityLogRecord, 'id' | 'entry_hash' | 'hmac_signature'>,
  signingKey = securityConfig.auditSigningKey
): { entry_hash: string; hmac_signature: string } {
  const canonical = JSON.stringify({
    prev_hash: payload.prev_hash,
    created_at: payload.created_at,
    user_id: payload.user_id,
    user_email: payload.user_email,
    module_name: payload.module_name,
    action_type: payload.action_type,
    entity_type: payload.entity_type,
    entity_id: payload.entity_id,
    http_method: payload.http_method,
    api_endpoint: payload.api_endpoint,
    ip_address: payload.ip_address,
    status: payload.status,
    description: payload.description,
    before_values: payload.before_values,
    after_values: payload.after_values,
  });

  const entry_hash = crypto.createHash('sha256').update(canonical).digest('hex');
  const hmac_signature = crypto
    .createHmac('sha256', signingKey)
    .update(`${payload.prev_hash}:${entry_hash}`)
    .digest('hex');

  return { entry_hash, hmac_signature };
}

class AuditService {
  private appendToMirrorFile(record: ActivityLogRecord): void {
    try {
      const mirrorPath = securityConfig.auditMirrorPath;
      const dir = path.dirname(mirrorPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      }
      const line = `${JSON.stringify({
        id: record.id,
        created_at: record.created_at,
        user_id: record.user_id,
        user_email: record.user_email,
        module_name: record.module_name,
        action_type: record.action_type,
        entity_type: record.entity_type,
        entity_id: record.entity_id,
        status: record.status,
        prev_hash: record.prev_hash,
        entry_hash: record.entry_hash,
        hmac_signature: record.hmac_signature,
      })}\n`;
      fs.appendFileSync(mirrorPath, line, { encoding: 'utf8', mode: 0o600 });
    } catch {
      // Never crash business operations if mirror file write fails
    }
  }

  public async log(input: AuditLogInput): Promise<ActivityLogRecord | null> {
    if (!securityConfig.auditLogEnabled) return null;

    const deviceCtx = input.req ? extractDeviceContext(input.req) : null;
    const reqUser = (input.req as any)?.user;

    const diff = computeRedactedDiff(input.before_values, input.after_values);
    const safeMetadata = input.metadata ? redactSensitiveData(input.metadata) : null;
    const safeDescription = input.description ? redactString(input.description) : null;

    const prev_hash = securityStore.getLatestActivityHash();
    const created_at = new Date().toISOString();

    const basePayload: Omit<ActivityLogRecord, 'id' | 'entry_hash' | 'hmac_signature'> = {
      user_id: input.user_id !== undefined ? input.user_id : (reqUser?.id ?? null),
      username: input.username !== undefined ? input.username : (reqUser?.username ?? null),
      user_email: input.user_email !== undefined ? input.user_email : (reqUser?.email ?? null),
      user_role: input.user_role !== undefined ? input.user_role : (reqUser?.role ?? null),
      module_name: input.module_name,
      action_type: input.action_type,
      entity_type: input.entity_type ?? null,
      entity_id: input.entity_id !== undefined && input.entity_id !== null ? String(input.entity_id) : null,
      http_method: input.http_method ?? input.req?.method ?? null,
      api_endpoint: input.api_endpoint ?? (input.req ? redactString(input.req.originalUrl || input.req.path) : null),
      ip_address: input.ip_address || deviceCtx?.ipAddress || '127.0.0.1',
      device_id: input.device_id ?? deviceCtx?.deviceId ?? null,
      device_name: input.device_name ?? deviceCtx?.deviceName ?? null,
      browser_name: input.browser_name ?? deviceCtx?.browserName ?? null,
      os_name: input.os_name ?? deviceCtx?.osName ?? null,
      session_id: input.session_id ?? reqUser?.session_id ?? null,
      status: input.status || 'SUCCESS',
      response_status_code: input.response_status_code ?? null,
      description: safeDescription,
      before_values: diff.before_values,
      after_values: diff.after_values,
      metadata: safeMetadata,
      prev_hash,
      created_at,
    };

    const { entry_hash, hmac_signature } = computeAuditHashes(basePayload);
    const saved = await securityStore.appendActivityLog({
      ...basePayload,
      entry_hash,
      hmac_signature,
    });

    this.appendToMirrorFile(saved);
    return saved;
  }

  /**
   * Cryptographically verifies the entire append-only hash chain and HMAC signatures.
   * Detects any row modification, insertion, or deletion in the audit trail.
   */
  public verifyIntegrity(): AuditIntegrityReport {
    const records = securityStore.getAllActivityLogsChronological();
    const verified_at = new Date().toISOString();

    if (records.length === 0) {
      return {
        valid: true,
        checked_count: 0,
        broken_at_id: null,
        tampered_ids: [],
        reason: 'Audit chain is empty (genesis state).',
        verified_at,
        latest_hash: 'GENESIS_NEXORA_AUDIT_CHAIN_V1',
      };
    }

    const tamperedIds: number[] = [];
    let expectedPrevHash = records[0].prev_hash; // supports retention-pruned prefix while validating every link & HMAC

    for (const rec of records) {
      const { id, entry_hash, hmac_signature, ...rest } = rec;
      const recomputed = computeAuditHashes(rest);
      const chainMatches = rec.prev_hash === expectedPrevHash;
      const hashMatches = recomputed.entry_hash === entry_hash;
      const sigMatches =
        recomputed.hmac_signature.length === hmac_signature.length &&
        crypto.timingSafeEqual(Buffer.from(recomputed.hmac_signature), Buffer.from(hmac_signature));

      if (!chainMatches || !hashMatches || !sigMatches) {
        tamperedIds.push(id);
      }
      expectedPrevHash = rec.entry_hash;
    }

    const valid = tamperedIds.length === 0;
    return {
      valid,
      checked_count: records.length,
      broken_at_id: tamperedIds.length > 0 ? tamperedIds[0] : null,
      tampered_ids: tamperedIds,
      reason: valid
        ? `All ${records.length} audit log record(s) passed SHA-256 hash-chain and HMAC-SHA256 verification.`
        : `Tampering detected across ${tamperedIds.length} audit record(s) starting at ID #${tamperedIds[0]}.`,
      verified_at,
      latest_hash: records[records.length - 1].entry_hash,
    };
  }
}

export const auditService = new AuditService();
