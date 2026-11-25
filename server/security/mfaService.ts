import crypto from 'crypto';
import { securityConfig } from './config';

/**
 * Standard RFC 6238 TOTP Multi-Factor Authentication Service (Pure Node.js Crypto)
 * Provides optional 2FA enrollment, otpauth:// URI generation, code verification,
 * AES-256-GCM secret-at-rest protection, and single-use recovery codes for Administrators.
 */

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (let i = 0; i < buf.length; i++) {
    value = (value << 8) | buf[i];
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

function base32Decode(str: string): Buffer {
  const clean = str.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (let i = 0; i < clean.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(clean[i]);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function hotp(secretBase32: string, counter: number, digits = 6): string {
  const key = base32Decode(secretBase32);
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  counterBuf.writeUInt32BE(counter >>> 0, 4);

  const hmac = crypto.createHmac('sha1', key).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  return String(code % Math.pow(10, digits)).padStart(digits, '0');
}

function getMfaEncryptionKey(): Buffer {
  return crypto
    .createHash('sha256')
    .update(`nexora-mfa-secret-wrap:${securityConfig.auditSigningKey}`)
    .digest();
}

export class MfaService {
  public generateSecret(): string {
    return base32Encode(crypto.randomBytes(20));
  }

  public buildOtpAuthUri(email: string, secret: string): string {
    const issuer = encodeURIComponent(`${securityConfig.appName} ERP`);
    const account = encodeURIComponent(email);
    return `otpauth://totp/${issuer}:${account}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
  }

  public generateCode(secret: string, timestampMs = Date.now()): string {
    const step = Math.floor(timestampMs / 30000);
    return hotp(secret, step, 6);
  }

  public verifyCode(secret: string, token: string, windowSteps = 1, timestampMs = Date.now()): boolean {
    const clean = String(token || '').replace(/\s+/g, '');
    if (!/^\d{6}$/.test(clean)) return false;

    const currentStep = Math.floor(timestampMs / 30000);
    const cleanBuf = Buffer.from(clean);

    for (let offset = -windowSteps; offset <= windowSteps; offset++) {
      const candidate = hotp(secret, currentStep + offset, 6);
      const candBuf = Buffer.from(candidate);
      if (candBuf.length === cleanBuf.length && crypto.timingSafeEqual(candBuf, cleanBuf)) {
        return true;
      }
    }
    return false;
  }

  public generateRecoveryCodes(count = 8): { plain: string[]; hashes: string[] } {
    const plain: string[] = [];
    const hashes: string[] = [];
    for (let i = 0; i < count; i++) {
      const code = `${crypto.randomBytes(2).toString('hex').toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
      plain.push(code);
      hashes.push(this.hashRecoveryCode(code));
    }
    return { plain, hashes };
  }

  public hashRecoveryCode(code: string): string {
    return crypto
      .createHash('sha256')
      .update(code.trim().toUpperCase())
      .digest('hex');
  }

  public encryptSecret(secret: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', getMfaEncryptionKey(), iv);
    const enc = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `v1:${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
  }

  public decryptSecret(payload: string): string {
    const parts = String(payload || '').split(':');
    if (parts.length !== 4 || parts[0] !== 'v1') {
      throw new Error('Invalid encrypted MFA secret format');
    }
    const iv = Buffer.from(parts[1], 'hex');
    const tag = Buffer.from(parts[2], 'hex');
    const enc = Buffer.from(parts[3], 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', getMfaEncryptionKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
  }
}

export const mfaService = new MfaService();
