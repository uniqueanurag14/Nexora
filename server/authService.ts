/**
 * Centralized Authentication & Password Service
 * 
 * Provides unified, application-wide authentication primitives:
 * - JWT signing and verification with issuer, audience, and expiration validation
 * - Bcrypt password hashing and verification (12 rounds)
 * - Password complexity validation
 * - Password history tracking and reuse prevention
 * - Secure random token generation (single-use activation and reset tokens)
 * - Dynamic token expiration configuration
 */

import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config();

export interface TokenPayload {
  sub: string;
  uid: number;
  id: number;
  email?: string;
  username?: string;
  role: string;
  jti: string;
}

export interface PasswordValidationResult {
  valid: boolean;
  errors: string[];
  message?: string;
}

export class AuthService {
  private get jwtSecret(): string {
    const envSecret = (process.env.JWT_ACCESS_SECRET || '').trim();
    if (envSecret) return envSecret;
    if ((process.env.NODE_ENV || process.env.APP_ENV) === 'production') {
      throw new Error('SECURITY FATAL: JWT_ACCESS_SECRET environment variable must be set in production.');
    }
    return 'nexora_sec_48a97f2e1c9842f1b802e3a598c1704d9b62f1a8c3e';
  }

  private get jwtIssuer(): string {
    return process.env.JWT_ISSUER || 'nexora';
  }

  private get jwtAudience(): string {
    return process.env.JWT_AUDIENCE || 'nexora-application';
  }

  private get jwtExpiresIn(): string {
    return process.env.JWT_ACCESS_EXPIRES_IN || '15m';
  }

  public getAccessTokenExpirySeconds(): number {
    const raw = this.jwtExpiresIn.trim().toLowerCase();
    const match = raw.match(/^(\d+)([smhd]?)$/);
    if (!match) return 900;
    const val = parseInt(match[1], 10);
    const unit = match[2] || 's';
    if (unit === 'm') return val * 60;
    if (unit === 'h') return val * 3600;
    if (unit === 'd') return val * 86400;
    return val;
  }

  public generateRefreshToken(): { raw: string; hash: string } {
    const raw = `nxr_${crypto.randomBytes(40).toString('hex')}`;
    return { raw, hash: this.hashToken(raw) };
  }

  /**
   * Signs a JWT access token with centralized configuration.
   */
  public signAccessToken(payload: Omit<TokenPayload, 'iat' | 'exp'>): string {
    return jwt.sign(
      {
        sub: payload.sub,
        uid: payload.uid,
        id: payload.id,
        email: payload.email,
        username: payload.username,
        role: payload.role,
        jti: payload.jti,
      },
      this.jwtSecret,
      {
        algorithm: 'HS256',
        issuer: this.jwtIssuer,
        audience: this.jwtAudience,
        expiresIn: this.jwtExpiresIn,
      } as jwt.SignOptions
    );
  }

  /**
   * Cryptographically verifies a JWT access token, validating algorithm, issuer, audience, and expiration.
   */
  public verifyAccessToken(token: string): TokenPayload {
    const decoded = jwt.verify(token, this.jwtSecret, {
      algorithms: ['HS256'],
      issuer: this.jwtIssuer,
      audience: this.jwtAudience,
    }) as any;

    return {
      sub: decoded.sub,
      uid: decoded.uid || decoded.id,
      id: decoded.id || decoded.uid,
      email: decoded.email,
      username: decoded.username,
      role: decoded.role,
      jti: decoded.jti,
    };
  }

  /**
   * Hashes a plaintext password using bcrypt with 12 salt rounds.
   */
  public async hashPassword(password: string): Promise<string> {
    const salt = await bcrypt.genSalt(12);
    return bcrypt.hash(password, salt);
  }

  /**
   * Synchronously hashes a plaintext password (used in seeding).
   */
  public hashPasswordSync(password: string): string {
    const salt = bcrypt.genSaltSync(12);
    return bcrypt.hashSync(password, salt);
  }

  /**
   * Compares a plaintext password against a stored bcrypt hash.
   */
  public async verifyPassword(password: string, hash: string): Promise<boolean> {
    if (!password || !hash) return false;
    return bcrypt.compare(password, hash);
  }

  /**
   * Validates password complexity:
   * - At least 8 characters
   * - At least one uppercase letter (A-Z)
   * - At least one lowercase letter (a-z)
   * - At least one number (0-9)
   * - At least one special symbol (@$!%*?&#^+=_-~)
   */
  public validatePasswordComplexity(password: string): PasswordValidationResult {
    const errors: string[] = [];

    if (!password || typeof password !== 'string') {
      return { valid: false, errors: ['Password is required.'] };
    }

    if (password.length < 8) {
      errors.push('Password must be at least 8 characters long.');
    }

    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter (A-Z).');
    }

    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter (a-z).');
    }

    if (!/\d/.test(password)) {
      errors.push('Password must contain at least one number (0-9).');
    }

    if (!/[@$!%*?&#^+=_\-~]/.test(password)) {
      errors.push('Password must contain at least one special character (@$!%*?&#^+=_-~).');
    }

    return {
      valid: errors.length === 0,
      errors,
      message: errors.length > 0 ? errors[0] : undefined,
    };
  }

  /**
   * Generates a cryptographically secure random token (hex string).
   */
  public generateSecureToken(bytes: number = 32): string {
    return crypto.randomBytes(bytes).toString('hex');
  }

  /**
   * Hashes a raw token with SHA-256 for secure database storage.
   */
  public hashToken(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken.trim()).digest('hex');
  }

  /**
   * Checks if a new password matches the user's current password or any of their recent password history.
   */
  public async isPasswordReused(
    newPassword: string,
    currentHash: string,
    passwordHistory: string[] = []
  ): Promise<boolean> {
    if (await this.verifyPassword(newPassword, currentHash)) {
      return true;
    }

    for (const priorHash of passwordHistory) {
      if (await this.verifyPassword(newPassword, priorHash)) {
        return true;
      }
    }

    return false;
  }
}

export const authService = new AuthService();
