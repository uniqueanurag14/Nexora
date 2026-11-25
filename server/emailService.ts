import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import { store } from './store';
dotenv.config();

function resolveConfiguredAppUrl(overrideUrl?: string): string {
  const port = process.env.PORT || process.env.SERVER_PORT || '3000';
  return (overrideUrl || process.env.FRONTEND_URL || process.env.APP_URL || `http://localhost:${port}`).replace(/\/+$/, '');
}

function resolveBranding(): { appName: string; appCompany: string } {
  const settings = store.getSettings();
  const appName = (settings.app_name || process.env.APP_NAME || 'Nexora').trim();
  const appCompany = (settings.company_name || process.env.APP_COMPANY || appName).trim();
  return { appName, appCompany };
}

export interface EmailSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  link?: string;
  supplierLink?: string;
  resetUrl?: string;
}

export interface EmailLogEntry {
  id?: number;
  recipient_email: string;
  recipient_name?: string;
  template: string;
  subject: string;
  status: 'sent' | 'failed' | 'simulated';
  message_id?: string;
  error?: string;
  timestamp: string;
}

/**
 * Extracts first name from a full name for personalized email greetings.
 * Fallback to 'User' if empty.
 */
export function extractFirstName(fullNameOrFirst?: string): string {
  if (!fullNameOrFirst) return 'User';
  const trimmed = fullNameOrFirst.trim();
  const first = trimmed.split(/\s+/)[0];
  return first || 'User';
}

export class EmailService {
  private transporter: any = null;
  private activeConfig: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    pass: string;
    fromEmail: string;
    fromName: string;
    replyTo: string;
  } | null = null;
  private emailLogs: EmailLogEntry[] = [];

  constructor() {
    this.initTransporter();
  }

  /**
   * Initializes or updates the nodemailer transporter using database overrides or .env defaults.
   */
  public initTransporter(configOverrides?: {
    smtp_host?: string;
    smtp_port?: string | number;
    smtp_secure?: string | boolean;
    smtp_user?: string;
    smtp_password?: string;
    smtp_from_email?: string;
    smtp_from_name?: string;
    smtp_reply_to?: string;
  }) {
    const host = (configOverrides?.smtp_host || process.env.SMTP_HOST || '').trim();
    const port = parseInt(String(configOverrides?.smtp_port || process.env.SMTP_PORT || '465'), 10);
    const secure = configOverrides?.smtp_secure !== undefined
      ? (String(configOverrides.smtp_secure) === 'true' || port === 465)
      : (process.env.SMTP_SECURE === 'true' || port === 465);
    const user = (configOverrides?.smtp_user || process.env.SMTP_USER || '').trim();
    
    // If the provided password is the masked placeholder, fallback to active or env
    let pass = configOverrides?.smtp_password;
    if (!pass || pass === '••••••••••••') {
      pass = this.activeConfig?.pass || process.env.SMTP_PASSWORD || process.env.SMTP_PASS || '';
    }

    const fromEmail = (configOverrides?.smtp_from_email || process.env.SMTP_FROM_EMAIL || user).trim();
    const fromName = (configOverrides?.smtp_from_name || process.env.SMTP_FROM_NAME || process.env.APP_NAME || 'Nexora').trim();
    const replyTo = (configOverrides?.smtp_reply_to || process.env.SMTP_REPLY_TO || fromEmail).trim();

    this.activeConfig = {
      host,
      port,
      secure,
      user,
      pass,
      fromEmail,
      fromName,
      replyTo,
    };

    if (host && user && pass) {
      try {
        this.transporter = nodemailer.createTransport({
          host,
          port,
          secure,
          auth: { user, pass },
          tls: { rejectUnauthorized: false },
        });
      } catch (err: any) {
        console.warn('[EmailService] Failed to initialize nodemailer transporter:', err.message);
        this.transporter = null;
      }
    } else {
      this.transporter = null;
    }
  }

  /**
   * Reload configuration from system settings.
   */
  public reloadConfig(configOverrides?: Record<string, string>) {
    this.initTransporter(configOverrides);
  }

  public isConfigured(): boolean {
    return Boolean(this.transporter && this.activeConfig?.host && this.activeConfig?.user);
  }

  public getActiveConfigInfo() {
    return {
      host: this.activeConfig?.host || process.env.SMTP_HOST || 'Not configured',
      port: this.activeConfig?.port || parseInt(process.env.SMTP_PORT || '465', 10),
      secure: this.activeConfig?.secure ?? (process.env.SMTP_SECURE === 'true'),
      user: this.activeConfig?.user || process.env.SMTP_USER || 'Not configured',
      fromEmail: this.activeConfig?.fromEmail || process.env.SMTP_FROM_EMAIL || 'Not configured',
      fromName: this.activeConfig?.fromName || process.env.SMTP_FROM_NAME || 'Nexora',
      replyTo: this.activeConfig?.replyTo || process.env.SMTP_REPLY_TO || '',
      isConfigured: this.isConfigured(),
    };
  }

  /**
   * Verifies SMTP connection handshake without sending an email.
   */
  public async testConnection(): Promise<{ success: boolean; message: string; error?: string }> {
    if (!this.transporter) {
      return {
        success: false,
        message: 'SMTP transporter not configured. Please check host, port, username, and password.',
        error: 'Missing required SMTP parameters',
      };
    }

    try {
      await this.transporter.verify();
      return {
        success: true,
        message: `SMTP connection established and authenticated successfully with ${this.activeConfig?.host}:${this.activeConfig?.port}.`,
      };
    } catch (err: any) {
      return {
        success: false,
        message: `SMTP connection failed: ${err.message}`,
        error: err.message,
      };
    }
  }

  /**
   * Logs an email dispatch event safely without logging passwords, tokens, or credentials.
   */
  private logEmail(entry: Omit<EmailLogEntry, 'timestamp'>) {
    const logItem: EmailLogEntry = {
      ...entry,
      timestamp: new Date().toISOString(),
    };
    this.emailLogs.unshift(logItem);
    if (this.emailLogs.length > 500) {
      this.emailLogs.pop();
    }
  }

  public getEmailLogs(): EmailLogEntry[] {
    return this.emailLogs;
  }

  /**
   * Common mail dispatcher with unified logging and error handling.
   */
  private async dispatchMail(params: {
    to: string;
    recipientName?: string;
    subject: string;
    text: string;
    html: string;
    template: string;
  }): Promise<EmailSendResult> {
    const fromAddress = this.activeConfig?.fromEmail || process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || 'noreply@nexora.io';
    const fromName = this.activeConfig?.fromName || process.env.SMTP_FROM_NAME || 'Nexora';
    const replyTo = this.activeConfig?.replyTo || process.env.SMTP_REPLY_TO || fromAddress;

    if (this.transporter && process.env.ENABLE_EMAIL_NOTIFICATIONS !== 'false') {
      try {
        const info = await this.transporter.sendMail({
          from: `"${fromName}" <${fromAddress}>`,
          to: params.to,
          replyTo,
          subject: params.subject,
          text: params.text,
          html: params.html,
        });

        this.logEmail({
          recipient_email: params.to,
          recipient_name: params.recipientName,
          template: params.template,
          subject: params.subject,
          status: 'sent',
          message_id: info.messageId,
        });

        console.log(`[EmailService] Dispatched '${params.template}' to ${params.to} (MessageId: ${info.messageId})`);
        return { success: true, messageId: info.messageId };
      } catch (err: any) {
        console.error(`[EmailService] Dispatch failed for '${params.template}' to ${params.to}:`, err.message);
        this.logEmail({
          recipient_email: params.to,
          recipient_name: params.recipientName,
          template: params.template,
          subject: params.subject,
          status: 'failed',
          error: err.message,
        });
        return { success: false, error: err.message };
      }
    }

    // Simulated / fallback dispatch
    console.log(`[EmailService (Simulation)] '${params.template}' generated for ${params.to} (Subject: ${params.subject})`);
    this.logEmail({
      recipient_email: params.to,
      recipient_name: params.recipientName,
      template: params.template,
      subject: params.subject,
      status: 'simulated',
    });
    return { success: true };
  }

  // =========================================================================
  // TEMPLATE 1 & 2: NEW USER ACCOUNT ACTIVATION / FIRST-TIME PASSWORD SETUP
  // =========================================================================
  public async sendAccountActivationEmail(params: {
    recipientEmail: string;
    recipientName: string;
    department?: string;
    role?: string;
    setupToken: string;
    expiresAt: Date;
    appUrl?: string;
  }): Promise<EmailSendResult> {
    const appUrl = resolveConfiguredAppUrl(params.appUrl);
    const activationUrl = `${appUrl}/reset-password?token=${encodeURIComponent(params.setupToken)}&type=activation`;
    const { appName, appCompany } = resolveBranding();
    const expiryMins = Math.max(1, Math.round((params.expiresAt.getTime() - Date.now()) / (60 * 1000)));

    const formattedExpiry = params.expiresAt.toLocaleString('en-US', {
      timeZone: process.env.APP_TIMEZONE || 'Asia/Kolkata',
      dateStyle: 'medium',
      timeStyle: 'short',
    });

    const subject = `[${appName}] Welcome! Complete Your Account Activation & Password Setup`;
    const greetingName = extractFirstName(params.recipientName);

    const textContent = `Hello ${greetingName},

Welcome to ${appName}! An enterprise user account has been provisioned for you at ${appCompany}.

Account Details:
- Name: ${params.recipientName}
- Registered Email: ${params.recipientEmail}
- Department: ${params.department || '—'}
- Assigned Role: ${params.role || '—'}

To activate your account and choose your password, please open this link:
${activationUrl}

Security Notice:
- This is a single-use secure link valid for ${expiryMins} minutes (expires ${formattedExpiry}).
- You must create your own password meeting Nexora's complexity guidelines (at least 8 characters, uppercase, lowercase, numbers, and symbols).
- Plaintext passwords are never sent via email.

If you have questions, please reach out to your system administrator.

Sincerely,
${appName} Administration Team`;

    const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Account Activation</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F6F9FC; color: #101B32; margin: 0; padding: 24px; }
    .card { max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
    .header { background: #101B32; color: #ffffff; padding: 28px 32px; border-bottom: 3px solid #0084CC; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 800; letter-spacing: -0.02em; }
    .header p { margin: 4px 0 0; font-size: 13px; color: #94a3b8; }
    .content { padding: 32px; line-height: 1.6; }
    .user-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0; font-size: 13px; }
    .user-row { display: flex; justify-content: space-between; padding: 4px 0; }
    .user-label { color: #64748b; font-weight: 600; }
    .user-val { color: #101B32; font-weight: 700; }
    .btn-container { text-align: center; margin: 28px 0; }
    .btn { display: inline-block; background-color: #0084CC; color: #ffffff !important; text-decoration: none; font-weight: 700; font-size: 14px; padding: 14px 32px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,132,204,0.3); }
    .expiry-box { background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px; padding: 12px 16px; margin: 20px 0; font-size: 12px; color: #0369a1; }
    .footer { padding: 16px 32px; background: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 11px; color: #64748b; text-align: center; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1>${appName} • Enterprise Activation</h1>
      <p>${appCompany}</p>
    </div>
    <div class="content">
      <p style="margin-top:0; font-size: 16px;">Hello <strong>${greetingName}</strong>,</p>
      <p>An enterprise account has been provisioned for you. Please activate your account and establish your secure personal password:</p>
      
      <div class="user-box">
        <div class="user-row"><span class="user-label">Registered Email:</span><span class="user-val">${params.recipientEmail}</span></div>
        <div class="user-row"><span class="user-label">Assigned Department:</span><span class="user-val">${params.department || '—'}</span></div>
        <div class="user-row"><span class="user-label">Assigned Role:</span><span class="user-val">${params.role || '—'}</span></div>
      </div>

      <div class="btn-container">
        <a href="${activationUrl}" class="btn" target="_blank">Activate Account & Set Password</a>
      </div>

      <div class="expiry-box">
        <strong>Time-Limited Link:</strong> This activation link is valid for <strong>${expiryMins} minutes</strong> (until ${formattedExpiry}). It can only be used once.
      </div>

      <p style="font-size: 12px; color: #64748b; word-break: break-all;">
        If the button does not work, open this URL directly:<br/>
        <a href="${activationUrl}" style="color: #0084CC;">${activationUrl}</a>
      </p>
    </div>
    <div class="footer">
      Automated dispatch from ${appName} Security & Governance • Do not reply directly to this email.
    </div>
  </div>
</body>
</html>`;

    const res = await this.dispatchMail({
      to: params.recipientEmail,
      recipientName: params.recipientName,
      subject,
      text: textContent,
      html: htmlContent,
      template: 'account_activation',
    });

    return { ...res, link: activationUrl, resetUrl: activationUrl };
  }

  // =========================================================================
  // TEMPLATE 3: FORGOT PASSWORD REQUEST
  // =========================================================================
  public async sendPasswordResetEmail(params: {
    recipientEmail: string;
    recipientName: string;
    resetToken: string;
    expiresAt: Date;
    appUrl?: string;
  }): Promise<EmailSendResult> {
    const appUrl = resolveConfiguredAppUrl(params.appUrl);
    const resetUrl = `${appUrl}/reset-password?token=${encodeURIComponent(params.resetToken)}`;
    const { appName, appCompany } = resolveBranding();
    const expiryMins = Math.max(1, Math.round((params.expiresAt.getTime() - Date.now()) / (60 * 1000)));

    const formattedExpiry = params.expiresAt.toLocaleString('en-US', {
      timeZone: process.env.APP_TIMEZONE || 'Asia/Kolkata',
      dateStyle: 'medium',
      timeStyle: 'short',
    });

    const subject = `[${appName}] Password Reset Request`;
    const greetingName = extractFirstName(params.recipientName);

    const textContent = `Hello ${greetingName},

We received a request to reset your password for your ${appName} (${appCompany}) account.

To choose a new password, open this secure link:
${resetUrl}

Notice:
- This password reset link is valid for ${expiryMins} minutes (expires ${formattedExpiry}).
- It is single-use and will be invalidated once used.
- If you did not request this, please ignore this email. Your existing password remains completely secure.

Sincerely,
${appName} Security Team`;

    const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Password Reset</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F6F9FC; color: #101B32; margin: 0; padding: 24px; }
    .card { max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
    .header { background: #101B32; color: #ffffff; padding: 28px 32px; border-bottom: 3px solid #0084CC; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 800; }
    .content { padding: 32px; line-height: 1.6; }
    .btn-container { text-align: center; margin: 28px 0; }
    .btn { display: inline-block; background-color: #0084CC; color: #ffffff !important; text-decoration: none; font-weight: 700; font-size: 14px; padding: 14px 32px; border-radius: 8px; }
    .expiry-box { background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px; padding: 12px 16px; margin: 20px 0; font-size: 12px; color: #0369a1; }
    .security-notice { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 12px 16px; margin: 20px 0; font-size: 12px; color: #991b1b; }
    .footer { padding: 16px 32px; background: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 11px; color: #64748b; text-align: center; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1>${appName} — Account Security</h1>
    </div>
    <div class="content">
      <p style="margin-top:0;">Hello <strong>${greetingName}</strong>,</p>
      <p>We received a request to reset the password for your account. Click the button below to choose a new password:</p>
      
      <div class="btn-container">
        <a href="${resetUrl}" class="btn" target="_blank">Reset My Password</a>
      </div>

      <div class="expiry-box">
        <strong>Time-Limited Link:</strong> Valid for <strong>${expiryMins} minutes</strong> (expires ${formattedExpiry}). Single-use only.
      </div>

      <div class="security-notice">
        <strong>Security Notice:</strong> If you did not request a password reset, you can safely ignore this email. Your password remains unchanged.
      </div>

      <p style="font-size: 12px; color: #64748b; word-break: break-all;">
        Or paste into browser:<br/>
        <a href="${resetUrl}" style="color: #0084CC;">${resetUrl}</a>
      </p>
    </div>
    <div class="footer">
      ${appName} Security Services • ${appCompany}
    </div>
  </div>
</body>
</html>`;

    const res = await this.dispatchMail({
      to: params.recipientEmail,
      recipientName: params.recipientName,
      subject,
      text: textContent,
      html: htmlContent,
      template: 'forgot_password',
    });

    return { ...res, resetUrl };
  }

  // =========================================================================
  // TEMPLATE 4 & 5: PASSWORD RESET / CHANGED CONFIRMATION
  // =========================================================================
  public async sendPasswordChangedConfirmationEmail(params: {
    recipientEmail: string;
    recipientName: string;
    changedAt: Date;
    appUrl?: string;
  }): Promise<EmailSendResult> {
    const { appName, appCompany } = resolveBranding();

    const formattedDate = params.changedAt.toLocaleString('en-US', {
      timeZone: process.env.APP_TIMEZONE || 'Asia/Kolkata',
      dateStyle: 'medium',
      timeStyle: 'short',
    });

    const subject = `[${appName}] Security Notification: Password Changed Successfully`;
    const greetingName = extractFirstName(params.recipientName);

    const textContent = `Hello ${greetingName},

Your ${appName} (${appCompany}) account password was successfully updated on ${formattedDate}.

Security Notice:
- All other active sessions have been automatically invalidated for your security.
- If you performed this password update, you can safely ignore this notification.
- ALERT: If you did NOT make this change, please contact your system administrator or security department immediately.

Sincerely,
${appName} Security Team`;

    const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Security Alert: Password Updated</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F6F9FC; color: #101B32; margin: 0; padding: 24px; }
    .card { max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; }
    .header { background: #101B32; color: #ffffff; padding: 24px 32px; border-bottom: 3px solid #0084CC; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 800; }
    .content { padding: 32px; line-height: 1.6; }
    .alert-box { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 14px 16px; margin: 20px 0; font-size: 12px; color: #991b1b; }
    .footer { padding: 16px 32px; background: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 11px; color: #64748b; text-align: center; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1>${appName} — Security Alert</h1>
    </div>
    <div class="content">
      <p style="margin-top:0;">Hello <strong>${greetingName}</strong>,</p>
      <p>Your account password was successfully updated on <strong>${formattedDate}</strong>.</p>
      <p>For your protection, any other active sessions have been signed out.</p>

      <div class="alert-box">
        <strong>Important:</strong> If you did NOT authorize this change, someone may have compromised your account. Contact your system administrator immediately.
      </div>
    </div>
    <div class="footer">
      ${appName} Security & Governance • ${appCompany}
    </div>
  </div>
</body>
</html>`;

    return this.dispatchMail({
      to: params.recipientEmail,
      recipientName: params.recipientName,
      subject,
      text: textContent,
      html: htmlContent,
      template: 'password_changed_confirmation',
    });
  }

  // =========================================================================
  // TEMPLATE 6: ADMIN-INITIATED PASSWORD RESET
  // =========================================================================
  public async sendAdminInitiatedPasswordResetEmail(params: {
    recipientEmail: string;
    recipientName: string;
    resetToken: string;
    expiresAt: Date;
    adminName?: string;
    appUrl?: string;
  }): Promise<EmailSendResult> {
    const appUrl = resolveConfiguredAppUrl(params.appUrl);
    const resetUrl = `${appUrl}/reset-password?token=${encodeURIComponent(params.resetToken)}`;
    const { appName, appCompany } = resolveBranding();
    const expiryMins = Math.max(1, Math.round((params.expiresAt.getTime() - Date.now()) / (60 * 1000)));

    const formattedExpiry = params.expiresAt.toLocaleString('en-US', {
      timeZone: process.env.APP_TIMEZONE || 'Asia/Kolkata',
      dateStyle: 'medium',
      timeStyle: 'short',
    });

    const subject = `[${appName}] Administrative Password Reset Request`;
    const greetingName = extractFirstName(params.recipientName);

    const textContent = `Hello ${greetingName},

An administrator (${params.adminName || 'System Administrator'}) has initiated a password reset for your ${appName} (${appCompany}) account.

Please choose your new password by visiting this secure link:
${resetUrl}

Notice:
- This reset link is valid for ${expiryMins} minutes (expires ${formattedExpiry}).
- It can only be used once.
- Never share this link with anyone.

Sincerely,
${appName} Administration`;

    const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Admin-Initiated Password Reset</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F6F9FC; color: #101B32; margin: 0; padding: 24px; }
    .card { max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; }
    .header { background: #101B32; color: #ffffff; padding: 24px 32px; border-bottom: 3px solid #0084CC; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 800; }
    .content { padding: 32px; line-height: 1.6; }
    .btn-container { text-align: center; margin: 28px 0; }
    .btn { display: inline-block; background-color: #0084CC; color: #ffffff !important; text-decoration: none; font-weight: 700; font-size: 14px; padding: 14px 32px; border-radius: 8px; }
    .expiry-box { background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px; padding: 12px 16px; margin: 20px 0; font-size: 12px; color: #0369a1; }
    .footer { padding: 16px 32px; background: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 11px; color: #64748b; text-align: center; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1>${appName} • Administrator Reset</h1>
    </div>
    <div class="content">
      <p style="margin-top:0;">Hello <strong>${greetingName}</strong>,</p>
      <p>A system administrator (${params.adminName || 'System Administrator'}) has initiated a password reset for your account.</p>
      
      <div class="btn-container">
        <a href="${resetUrl}" class="btn" target="_blank">Set Your New Password</a>
      </div>

      <div class="expiry-box">
        <strong>Time-Limited Link:</strong> Valid for <strong>${expiryMins} minutes</strong> (expires ${formattedExpiry}).
      </div>

      <p style="font-size: 12px; color: #64748b; word-break: break-all;">
        Direct Link:<br/>
        <a href="${resetUrl}" style="color: #0084CC;">${resetUrl}</a>
      </p>
    </div>
    <div class="footer">
      ${appName} Administration • ${appCompany}
    </div>
  </div>
</body>
</html>`;

    const res = await this.dispatchMail({
      to: params.recipientEmail,
      recipientName: params.recipientName,
      subject,
      text: textContent,
      html: htmlContent,
      template: 'admin_password_reset',
    });

    return { ...res, resetUrl };
  }

  // =========================================================================
  // TEMPLATE 7 & 8: ACCOUNT SECURITY ALERTS & NOTIFICATIONS
  // =========================================================================
  public async sendSecurityAlertEmail(params: {
    recipientEmail: string;
    recipientName: string;
    alertType: string;
    details: string;
    timestamp?: Date;
    appUrl?: string;
  }): Promise<EmailSendResult> {
    const { appName, appCompany } = resolveBranding();
    const timeStr = (params.timestamp || new Date()).toLocaleString('en-US', {
      timeZone: process.env.APP_TIMEZONE || 'Asia/Kolkata',
      dateStyle: 'medium',
      timeStyle: 'short',
    });

    const subject = `[${appName}] Security Alert: ${params.alertType}`;
    const greetingName = extractFirstName(params.recipientName);

    const textContent = `Hello ${greetingName},

We are notifying you of a security event regarding your ${appName} account:

Alert Type: ${params.alertType}
Timestamp: ${timeStr}
Details: ${params.details}

If this activity was authorized by you, no action is necessary. Otherwise, please contact your system administrator or change your password immediately.

Sincerely,
${appName} Security Team`;

    const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Security Alert</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F6F9FC; color: #101B32; margin: 0; padding: 24px; }
    .card { max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; }
    .header { background: #101B32; color: #ffffff; padding: 24px 32px; border-bottom: 3px solid #0084CC; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 800; }
    .content { padding: 32px; line-height: 1.6; }
    .box { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin: 20px 0; font-size: 13px; color: #991b1b; }
    .footer { padding: 16px 32px; background: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 11px; color: #64748b; text-align: center; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1>${appName} • Security Notification</h1>
    </div>
    <div class="content">
      <p style="margin-top:0;">Hello <strong>${greetingName}</strong>,</p>
      <div class="box">
        <strong>${params.alertType}</strong><br/>
        <span>${params.details}</span><br/>
        <small style="color: #64748b;">Recorded at ${timeStr}</small>
      </div>
    </div>
    <div class="footer">
      ${appName} Security & Governance • ${appCompany}
    </div>
  </div>
</body>
</html>`;

    return this.dispatchMail({
      to: params.recipientEmail,
      recipientName: params.recipientName,
      subject,
      text: textContent,
      html: htmlContent,
      template: 'security_alert',
    });
  }

  // =========================================================================
  // TEST EMAIL & SUPPLIER REORDER (Preserved)
  // =========================================================================
  public async sendTestEmail(params: {
    recipientEmail: string;
    senderName?: string;
    senderEmail?: string;
  }): Promise<EmailSendResult> {
    const { appName, appCompany } = resolveBranding();
    const timestamp = new Date().toLocaleString();
    const subject = `[${appName}] SMTP Configuration Verification — ${timestamp}`;

    const textContent = `Hello,

This automated test email confirms that your Email & SMTP Gateway in ${appName} (${appCompany}) is functioning correctly.

Dispatch Timestamp: ${timestamp}
Host: ${this.activeConfig?.host || process.env.SMTP_HOST || 'N/A'}
Port: ${this.activeConfig?.port || process.env.SMTP_PORT || 'N/A'}

Sincerely,
${appName} System Administration`;

    const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>SMTP Test</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F6F9FC; color: #101B32; margin: 0; padding: 24px; }
    .card { max-width: 580px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; }
    .header { background: #101B32; color: #ffffff; padding: 24px; border-bottom: 3px solid #0084CC; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 800; }
    .content { padding: 28px; line-height: 1.6; font-size: 14px; }
    .meta-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0; font-size: 13px; }
    .footer { background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px 28px; font-size: 12px; color: #64748b; text-align: center; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1>${appName} • SMTP Gateway Verification</h1>
    </div>
    <div class="content">
      <p style="margin-top:0;">Hello Administrator,</p>
      <p>This automated test confirms that your <strong>Email & SMTP Gateway</strong> in ${appName} is functioning correctly and is ready for production dispatch.</p>
      <div class="meta-box">
        <div><strong>Server Host:</strong> ${this.activeConfig?.host || process.env.SMTP_HOST || 'smtp.gmail.com'}</div>
        <div><strong>Port:</strong> ${this.activeConfig?.port || process.env.SMTP_PORT || '465'}</div>
        <div><strong>Recipient:</strong> ${params.recipientEmail}</div>
        <div><strong>Timestamp:</strong> ${timestamp}</div>
      </div>
    </div>
    <div class="footer">
      ${appName} Settings & Governance • ${appCompany}
    </div>
  </div>
</body>
</html>`;

    return this.dispatchMail({
      to: params.recipientEmail,
      recipientName: 'Administrator',
      subject,
      text: textContent,
      html: htmlContent,
      template: 'test_email',
    });
  }

  public async sendSupplierReorderEmail(params: {
    supplierEmail: string;
    supplierName: string;
    reorderNo: string;
    itemName: string;
    itemCode: string;
    quantity: number;
    unitPrice: number;
    totalAmount: number;
    expectedDeliveryDate?: string | null;
    notes?: string;
    token: string;
    appUrl?: string;
  }): Promise<EmailSendResult> {
    const appUrl = resolveConfiguredAppUrl(params.appUrl);
    const supplierLink = `${appUrl}/supplier-portal/${params.token}`;
    const subject = `[Nexora] Reorder Request ${params.reorderNo}: ${params.itemName}`;

    const textContent = `Hello ${params.supplierName},

Nexora has generated an automated supplier reorder request:
Reorder Number: ${params.reorderNo}
Item: ${params.itemName} (${params.itemCode})
Requested Quantity: ${params.quantity}
Proposed Unit Price: ₹${params.unitPrice.toFixed(2)}
Order Total: ₹${params.totalAmount.toFixed(2)}

Please review and confirm via our portal:
${supplierLink}

Sincerely,
Nexora Procurement`;

    const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Reorder Request ${params.reorderNo}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b; margin: 0; padding: 24px; }
    .card { max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; }
    .header { background: #0f172a; color: #ffffff; padding: 20px 24px; }
    .content { padding: 24px; }
    .btn { display: inline-block; background-color: #0284c7; color: #ffffff !important; text-decoration: none; font-weight: 600; font-size: 14px; padding: 12px 28px; border-radius: 6px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h2 style="margin:0;">NEXORA PROCUREMENT — REORDER REQUEST</h2>
    </div>
    <div class="content">
      <p>Dear <strong>${params.supplierName}</strong>,</p>
      <p>A purchase reorder request has been issued for <strong>${params.itemName}</strong> (${params.quantity} units, ₹${params.totalAmount.toFixed(2)}).</p>
      <p style="text-align:center; margin:24px 0;"><a href="${supplierLink}" class="btn" target="_blank">Review & Respond to Reorder</a></p>
    </div>
  </div>
</body>
</html>`;

    const res = await this.dispatchMail({
      to: params.supplierEmail,
      recipientName: params.supplierName,
      subject,
      text: textContent,
      html: htmlContent,
      template: 'supplier_reorder',
    });

    return { ...res, supplierLink };
  }

  public async sendEmailVerificationEmail(params: {
    recipientEmail: string;
    recipientName: string;
    verificationCode: string;
    verificationToken: string;
    appUrl?: string;
  }): Promise<EmailSendResult> {
    const appName = process.env.APP_NAME || 'Nexora';
    const appUrl = resolveConfiguredAppUrl(params.appUrl);
    const verifyUrl = `${appUrl}/verify-email?token=${encodeURIComponent(params.verificationToken)}`;
    const subject = `[${appName}] Verify Your New Email Address`;
    const greetingName = extractFirstName(params.recipientName);

    const textContent = `Hello ${greetingName},
Your verification code is: ${params.verificationCode}
Or click: ${verifyUrl}
Valid for 24 hours.`;

    const htmlContent = `<!DOCTYPE html>
<html>
<body>
  <h2>${appName} — Email Verification</h2>
  <p>Hello ${greetingName}, your code is: <strong>${params.verificationCode}</strong></p>
  <p><a href="${verifyUrl}">Click to verify</a></p>
</body>
</html>`;

    return this.dispatchMail({
      to: params.recipientEmail,
      recipientName: params.recipientName,
      subject,
      text: textContent,
      html: htmlContent,
      template: 'email_verification',
    });
  }
}

export const emailService = new EmailService();
