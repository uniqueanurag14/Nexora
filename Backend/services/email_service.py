"""
Nexora Email Service (SMTP)
Handles branded password recovery emails and SMTP connectivity verification
with bounded timeouts and credential protection.
"""

import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Tuple
from Backend.core.config import settings
from Backend.core.logging import logger


class EmailService:
    @staticmethod
    def is_configured() -> bool:
        """Checks if SMTP credentials and host are present in configuration."""
        return bool(settings.SMTP_HOST and settings.SMTP_HOST.strip())

    @classmethod
    def check_smtp_connection(cls, timeout: float = 5.0) -> Tuple[bool, str]:
        """
        Tests SMTP server connectivity without sending any emails.
        Protects credentials from logs and error output.
        """
        if not cls.is_configured():
            return False, "SMTP Server: NOT CONFIGURED"

        try:
            port = settings.SMTP_PORT or 587
            host = settings.SMTP_HOST

            # Port 465 uses SSL directly; port 587 / 25 uses STARTTLS
            if port == 465:
                server = smtplib.SMTP_SSL(host, port, timeout=timeout)
            else:
                server = smtplib.SMTP(host, port, timeout=timeout)
                server.ehlo()
                if server.has_extn("STARTTLS"):
                    server.starttls()
                    server.ehlo()

            if settings.SMTP_USER and settings.SMTP_PASSWORD:
                server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)

            server.quit()
            return True, "SMTP Server: CONNECTED"
        except Exception as e:
            # Never expose passwords or raw connection strings
            logger.warning("SMTP connectivity check failed: %s", str(e))
            return False, "SMTP Server: UNAVAILABLE\nWarning: Email-dependent features may not work."

    @classmethod
    def send_password_reset_email(
        cls, recipient_email: str, recipient_name: str, reset_token: str
    ) -> bool:
        """
        Constructs and delivers a branded password reset email.
        Uses configured APP_URL for reset link generation.
        Returns True on successful delivery, False on failure.
        """
        if not cls.is_configured():
            logger.warning(
                "Cannot send password reset email to %s: SMTP is not configured.",
                recipient_email,
            )
            return False

        try:
            # Construct reset URL using configured APP_URL
            base_url = settings.APP_URL.rstrip("/")
            reset_url = f"{base_url}/reset-password?token={reset_token}"

            msg = MIMEMultipart("alternative")
            msg["Subject"] = f"Password Reset Request — {settings.APP_NAME}"
            msg["From"] = settings.EMAIL_FROM
            msg["To"] = recipient_email

            text_content = f"""Hello {recipient_name},

We received a request to reset your password for your {settings.APP_NAME} account.

To reset your password, please open the following secure link in your browser:
{reset_url}

This password reset link is valid for 60 minutes and can only be used once.

If you did not request a password reset, you can safely ignore this email. Your account remains secure.

Best regards,
The {settings.APP_NAME} Security Team
"""

            html_content = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Password Reset</title>
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b; }}
    .card {{ max-width: 540px; margin: 0 auto; background: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0; padding: 32px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }}
    .brand {{ font-size: 22px; font-weight: 700; color: #0f172a; margin-bottom: 24px; letter-spacing: -0.025em; }}
    .btn {{ display: inline-block; background-color: #0284c7; color: #ffffff !important; font-weight: 600; text-decoration: none; padding: 12px 24px; border-radius: 6px; margin: 20px 0; }}
    .footer {{ font-size: 12px; color: #64748b; margin-top: 24px; border-top: 1px solid #e2e8f0; padding-top: 16px; }}
  </style>
</head>
<body>
  <div class="card">
    <div class="brand">{settings.APP_NAME}</div>
    <h2>Reset Your Password</h2>
    <p>Hello <strong>{recipient_name}</strong>,</p>
    <p>A password reset was requested for your account. Click the button below to choose a new password:</p>
    <div>
      <a href="{reset_url}" class="btn" target="_blank" rel="noopener noreferrer">Reset Password</a>
    </div>
    <p style="font-size: 13px; color: #64748b;">Or copy and paste this URL into your browser:<br>
      <span style="word-break: break-all; color: #0284c7;">{reset_url}</span>
    </p>
    <p style="font-size: 13px; color: #64748b;">This link will expire in 60 minutes and is single-use.</p>
    <div class="footer">
      If you did not request this change, please ignore this email or contact your administrator immediately.
    </div>
  </div>
</body>
</html>
"""
            msg.attach(MIMEText(text_content, "plain"))
            msg.attach(MIMEText(html_content, "html"))

            port = settings.SMTP_PORT or 587
            host = settings.SMTP_HOST

            if port == 465:
                server = smtplib.SMTP_SSL(host, port, timeout=10.0)
            else:
                server = smtplib.SMTP(host, port, timeout=10.0)
                server.ehlo()
                if server.has_extn("STARTTLS"):
                    server.starttls()
                    server.ehlo()

            if settings.SMTP_USER and settings.SMTP_PASSWORD:
                server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)

            server.sendmail(settings.EMAIL_FROM, [recipient_email], msg.as_string())
            server.quit()

            logger.info("Password reset email sent to %s", recipient_email)
            return True
        except Exception as e:
            logger.error("Failed to send password reset email: %s", str(e))
            return False
