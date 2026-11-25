import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
const smtpPort = parseInt(process.env.SMTP_PORT || '465', 10);
const smtpSecure = process.env.SMTP_SECURE === 'true' || smtpPort === 465;
const smtpUser = process.env.SMTP_USER || 'toanuragsinha@gmail.com';
const smtpPass = process.env.SMTP_PASS || 'nnjw yopq ewgb vilz';
const smtpFrom = process.env.SMTP_FROM || `"Nexora Procurement" <${smtpUser}>`;

export const mailTransporter = nodemailer.createTransport({
  host: smtpHost,
  port: smtpPort,
  secure: smtpSecure,
  auth: {
    user: smtpUser,
    pass: smtpPass,
  },
  tls: {
    rejectUnauthorized: false,
  },
});

export async function sendReorderNotificationEmail(options: {
  toEmail: string;
  supplierName: string;
  referenceNo: string;
  itemName: string;
  itemCode: string;
  quantity: number;
  unit: string;
  proposedUnitPrice: number;
  deliveryDate?: string;
  notes?: string;
  supplierPortalUrl: string;
  expiryHours: number;
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const totalProposed = (options.quantity * options.proposedUnitPrice).toFixed(2);

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0f172a; color: #f8fafc; margin: 0; padding: 24px; }
          .container { max-width: 600px; margin: 0 auto; background: #1e293b; border-radius: 12px; border: 1px solid #334155; overflow: hidden; }
          .header { background: linear-gradient(135deg, #4f46e5, #06b6d4); padding: 28px; text-align: center; }
          .header h1 { margin: 0; font-size: 24px; font-weight: 700; color: #ffffff; letter-spacing: -0.5px; }
          .header p { margin: 6px 0 0; color: #e2e8f0; font-size: 14px; }
          .content { padding: 32px 28px; }
          .badge { display: inline-block; background: #3b82f6; color: #ffffff; padding: 4px 10px; border-radius: 9999px; font-size: 12px; font-weight: 600; text-transform: uppercase; margin-bottom: 16px; }
          .card { background: #0f172a; border: 1px solid #334155; border-radius: 8px; padding: 20px; margin: 20px 0; }
          .row { display: flex; justify-content: space-between; margin-bottom: 12px; font-size: 14px; }
          .row:last-child { margin-bottom: 0; }
          .label { color: #94a3b8; }
          .value { color: #f8fafc; font-weight: 600; }
          .highlight { font-size: 18px; color: #38bdf8; font-weight: 700; border-top: 1px solid #334155; padding-top: 12px; margin-top: 12px; }
          .btn-container { text-align: center; margin: 32px 0 20px; }
          .btn { background: #4f46e5; color: #ffffff !important; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px; display: inline-block; box-shadow: 0 4px 12px rgba(79, 70, 229, 0.4); }
          .footer { border-top: 1px solid #334155; padding: 20px 28px; text-align: center; font-size: 12px; color: #64748b; }
          .warning { color: #f59e0b; font-size: 12px; margin-top: 16px; text-align: center; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>NEXORA PROCUREMENT</h1>
            <p>Official Purchase & Reorder Request</p>
          </div>
          <div class="content">
            <span class="badge">Reorder Request #${options.referenceNo}</span>
            <p>Dear <strong>${options.supplierName}</strong>,</p>
            <p>Nexora Procurement has submitted a purchase reorder for critical inventory replenishment. Please review the proposal terms below:</p>
            
            <div class="card">
              <div class="row">
                <span class="label">Item Name:</span>
                <span class="value">${options.itemName} (${options.itemCode})</span>
              </div>
              <div class="row">
                <span class="label">Requested Quantity:</span>
                <span class="value">${options.quantity} ${options.unit}</span>
              </div>
              <div class="row">
                <span class="label">Proposed Unit Price:</span>
                <span class="value">$${options.proposedUnitPrice.toFixed(2)}</span>
              </div>
              ${options.deliveryDate ? `
              <div class="row">
                <span class="label">Target Delivery Date:</span>
                <span class="value">${options.deliveryDate}</span>
              </div>` : ''}
              ${options.notes ? `
              <div class="row">
                <span class="label">Procurement Notes:</span>
                <span class="value">${options.notes}</span>
              </div>` : ''}
              <div class="row highlight">
                <span>Total Estimated Value:</span>
                <span>$${totalProposed}</span>
              </div>
            </div>

            <p>You can <strong>Accept</strong>, <strong>Negotiate</strong> (propose counter-terms), or <strong>Decline</strong> this order online directly through the secure supplier portal.</p>

            <div class="btn-container">
              <a href="${options.supplierPortalUrl}" class="btn" target="_blank">Review & Respond to Reorder</a>
            </div>

            <p class="warning">
              ⏳ This secure access link will expire in ${options.expiryHours} hours. No password is required.
            </p>
          </div>
          <div class="footer">
            Nexora Enterprise ERP & Procurement Systems &bull; Automated notification
          </div>
        </div>
      </body>
    </html>
  `;

  const text = `
    NEXORA PROCUREMENT REORDER REQUEST
    Reference: ${options.referenceNo}
    
    Dear ${options.supplierName},
    
    Nexora Procurement has submitted a reorder request:
    - Item: ${options.itemName} (${options.itemCode})
    - Quantity: ${options.quantity} ${options.unit}
    - Proposed Unit Price: $${options.proposedUnitPrice.toFixed(2)}
    - Total Value: $${totalProposed}
    ${options.deliveryDate ? `- Target Delivery: ${options.deliveryDate}\n` : ''}
    ${options.notes ? `- Notes: ${options.notes}\n` : ''}
    
    Respond directly through your secure link (valid for ${options.expiryHours} hours):
    ${options.supplierPortalUrl}
  `;

  try {
    const info = await mailTransporter.sendMail({
      from: smtpFrom,
      to: options.toEmail,
      subject: `[Nexora Procurement] Reorder Request #${options.referenceNo} - ${options.itemName}`,
      text,
      html,
    });
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error('Failed to send reorder email via SMTP:', error.message || error);
    return { success: false, error: error.message || 'SMTP delivery error' };
  }
}

export async function sendInvoiceEmail(options: {
  toEmail: string;
  customerName: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  totalAmount: number;
  balanceDue: number;
  notes?: string;
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0f172a; color: #f8fafc; margin: 0; padding: 24px; }
          .container { max-width: 600px; margin: 0 auto; background: #1e293b; border-radius: 12px; border: 1px solid #334155; padding: 28px; }
          .header { border-bottom: 1px solid #334155; padding-bottom: 20px; margin-bottom: 24px; }
          .header h1 { margin: 0; font-size: 22px; color: #38bdf8; }
          .amount-box { background: #0f172a; border-radius: 8px; padding: 20px; border-left: 4px solid #38bdf8; margin: 20px 0; }
          .amount-val { font-size: 28px; font-weight: 700; color: #f8fafc; }
          .footer { font-size: 12px; color: #64748b; margin-top: 24px; text-align: center; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>NEXORA INVOICE #${options.invoiceNumber}</h1>
            <p style="color: #94a3b8; margin: 4px 0 0;">Billing & Accounts Receivable</p>
          </div>
          <p>Dear <strong>${options.customerName}</strong>,</p>
          <p>Please find attached the summary for Invoice <strong>#${options.invoiceNumber}</strong>.</p>
          <div class="amount-box">
            <div style="color: #94a3b8; font-size: 13px;">Balance Due</div>
            <div class="amount-val">$${options.balanceDue.toFixed(2)}</div>
            <div style="font-size: 13px; color: #94a3b8; margin-top: 6px;">Due Date: <strong>${options.dueDate}</strong></div>
          </div>
          <p>Total Invoiced: $${options.totalAmount.toFixed(2)}</p>
          ${options.notes ? `<p>Notes: ${options.notes}</p>` : ''}
          <div class="footer">
            Thank you for your business. &bull; Nexora ERP
          </div>
        </div>
      </body>
    </html>
  `;

  try {
    const info = await mailTransporter.sendMail({
      from: smtpFrom,
      to: options.toEmail,
      subject: `Invoice #${options.invoiceNumber} from Nexora - $${options.balanceDue.toFixed(2)} due`,
      text: `Invoice #${options.invoiceNumber}\nTotal: $${options.totalAmount.toFixed(2)}\nDue: ${options.dueDate}\nBalance: $${options.balanceDue.toFixed(2)}`,
      html,
    });
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error('Failed to send invoice email:', error.message || error);
    return { success: false, error: error.message || 'SMTP delivery error' };
  }
}
