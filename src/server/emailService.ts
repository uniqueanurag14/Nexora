import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
dotenv.config();

export interface EmailSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  supplierLink?: string;
}

export class EmailService {
  private transporter: any = null;

  constructor() {
    this.initTransporter();
  }

  private initTransporter() {
    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT || '465', 10);
    const secure = process.env.SMTP_SECURE === 'true' || port === 465;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASSWORD;

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
      }
    }
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
    const appUrl = (params.appUrl || process.env.APP_URL || 'http://localhost:3000').replace(/\/+$/, '');
    const supplierLink = `${appUrl}/supplier-portal/${params.token}`;
    const subject = `[Nexora] Reorder Request ${params.reorderNo}: ${params.itemName}`;

    const textContent = `
Hello ${params.supplierName},

Nexora has generated an automated supplier reorder request for your attention:

Reorder Number: ${params.reorderNo}
Item: ${params.itemName} (Code: ${params.itemCode})
Requested Quantity: ${params.quantity}
Proposed Unit Price: ₹${params.unitPrice.toFixed(2)}
Calculated Order Total: ₹${params.totalAmount.toFixed(2)}
Expected Delivery Date: ${params.expectedDeliveryDate || 'Standard Delivery'}
Buyer Notes: ${params.notes || 'None'}

Please review and confirm your acceptance, negotiate counter terms, or decline via our secure portal:
${supplierLink}

Note: This link is unique and valid for ${process.env.SUPPLIER_LINK_EXPIRY_HOURS || 72} hours.

Sincerely,
Nexora Procurement & Inventory
`;

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Reorder Request ${params.reorderNo}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b; margin: 0; padding: 24px; }
    .card { max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; }
    .header { background: #0f172a; color: #ffffff; padding: 20px 24px; }
    .header h2 { margin: 0; font-size: 18px; font-weight: 700; letter-spacing: -0.02em; }
    .content { padding: 24px; }
    .grid { display: table; width: 100%; border-collapse: collapse; margin-top: 16px; margin-bottom: 24px; }
    .row { display: table-row; }
    .col-label { display: table-cell; padding: 8px 12px; font-size: 13px; font-weight: 600; color: #64748b; border-bottom: 1px solid #f1f5f9; width: 40%; }
    .col-val { display: table-cell; padding: 8px 12px; font-size: 13px; font-weight: 500; color: #0f172a; border-bottom: 1px solid #f1f5f9; }
    .btn-container { text-align: center; margin: 30px 0 10px; }
    .btn { display: inline-block; background-color: #0284c7; color: #ffffff !important; text-decoration: none; font-weight: 600; font-size: 14px; padding: 12px 28px; border-radius: 6px; }
    .footer { padding: 16px 24px; background: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; text-align: center; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h2>NEXORA PROCUREMENT — REORDER REQUEST</h2>
    </div>
    <div class="content">
      <p style="margin-top:0;">Dear <strong>${params.supplierName}</strong>,</p>
      <p>A purchase reorder request has been issued for the following inventory item:</p>
      
      <div class="grid">
        <div class="row"><div class="col-label">Reorder Number</div><div class="col-val">${params.reorderNo}</div></div>
        <div class="row"><div class="col-label">Item / Product</div><div class="col-val">${params.itemName} (${params.itemCode})</div></div>
        <div class="row"><div class="col-label">Quantity</div><div class="col-val"><strong>${params.quantity}</strong></div></div>
        <div class="row"><div class="col-label">Proposed Unit Price</div><div class="col-val">₹${params.unitPrice.toFixed(2)}</div></div>
        <div class="row"><div class="col-label">Order Total</div><div class="col-val"><strong>₹${params.totalAmount.toFixed(2)}</strong></div></div>
        <div class="row"><div class="col-label">Expected Delivery Date</div><div class="col-val">${params.expectedDeliveryDate || 'Immediate / Standard'}</div></div>
        <div class="row"><div class="col-label">Buyer Notes</div><div class="col-val">${params.notes || 'None'}</div></div>
      </div>

      <div class="btn-container">
        <a href="${supplierLink}" class="btn" target="_blank">Review & Respond to Reorder</a>
      </div>
      
      <p style="font-size: 12px; color: #64748b; text-align: center; margin-top: 16px;">
        Or access directly: <br/><a href="${supplierLink}" style="color: #0284c7; word-break: break-all;">${supplierLink}</a>
      </p>
    </div>
    <div class="footer">
      Protected Link • Expires in ${process.env.SUPPLIER_LINK_EXPIRY_HOURS || 72} hours • Generated by Nexora Platform
    </div>
  </div>
</body>
</html>
`;

    // Attempt real SMTP dispatch if configured
    if (this.transporter && process.env.ENABLE_EMAIL_NOTIFICATIONS !== 'false') {
      try {
        const fromAddress = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER;
        const fromName = process.env.SMTP_FROM_NAME || 'Nexora Services';
        const info = await this.transporter.sendMail({
          from: `"${fromName}" <${fromAddress}>`,
          to: params.supplierEmail,
          replyTo: process.env.SMTP_REPLY_TO || fromAddress,
          subject,
          text: textContent,
          html: htmlContent,
        });

        console.log(`[EmailService] Sent reorder email ${params.reorderNo} to ${params.supplierEmail} (MessageId: ${info.messageId})`);
        return { success: true, messageId: info.messageId, supplierLink };
      } catch (err: any) {
        console.warn(`[EmailService] SMTP delivery attempt failed: ${err.message}. Link preserved: ${supplierLink}`);
        return { success: false, error: err.message, supplierLink };
      }
    }

    // Fallback if SMTP not configured or disabled
    console.log(`[EmailService] Simulated email to ${params.supplierEmail}. Link: ${supplierLink}`);
    return { success: true, supplierLink };
  }
}

export const emailService = new EmailService();
