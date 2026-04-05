import * as nodemailer from 'nodemailer';
import { Logger } from '@nestjs/common';

const logger = new Logger('EmailService');

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
    const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'no-reply@filorag.app';
    const appName = process.env.APP_NAME || 'FiloRag';
    const year = new Date().getFullYear();

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Reset your password</title>
</head>
<body style="margin:0;padding:0;background-color:#0a0a0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color:#0a0a0f;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:560px;">

          <!-- Logo / Header -->
          <tr>
            <td align="center" style="padding-bottom:32px;">
              <table cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td style="background:linear-gradient(135deg,#a855f7,#ec4899);border-radius:14px;padding:10px 22px;">
                    <span style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.3px;">${appName}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background:#13131f;border:1px solid #1e1e35;border-radius:20px;padding:48px 44px 40px;box-shadow:0 24px 60px rgba(0,0,0,0.5);">

              <!-- Icon -->
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:28px;">
                <tr>
                  <td align="center">
                    <div style="display:inline-block;background:linear-gradient(135deg,rgba(168,85,247,0.15),rgba(236,72,153,0.15));border:1px solid rgba(168,85,247,0.25);border-radius:16px;padding:16px;">
                      <span style="font-size:32px;line-height:1;">🔐</span>
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Title -->
              <h1 style="margin:0 0 12px;font-size:26px;font-weight:700;color:#f3f4f6;text-align:center;letter-spacing:-0.4px;">Reset your password</h1>
              <p style="margin:0 0 32px;font-size:15px;color:#6b7280;text-align:center;line-height:1.6;">
                Someone requested a password reset for the ${appName} account linked to this email address. If this was you, click the button below.
              </p>

              <!-- Divider -->
              <div style="height:1px;background:linear-gradient(90deg,transparent,#1e1e35,transparent);margin-bottom:32px;"></div>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:32px;">
                <tr>
                  <td align="center">
                    <a href="${resetUrl}"
                      style="display:inline-block;background:linear-gradient(135deg,#a855f7,#ec4899);color:#ffffff;text-decoration:none;font-size:16px;font-weight:600;padding:15px 40px;border-radius:12px;letter-spacing:0.1px;box-shadow:0 8px 24px rgba(168,85,247,0.35);">
                      Reset Password →
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Expiry notice -->
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:28px;">
                <tr>
                  <td align="center">
                    <table cellpadding="0" cellspacing="0" role="presentation">
                      <tr>
                        <td style="background:#0f0f1c;border:1px solid #1e1e35;border-radius:8px;padding:10px 18px;">
                          <span style="font-size:13px;color:#6b7280;">⏱&nbsp;&nbsp;Expires in&nbsp;</span>
                          <span style="font-size:13px;color:#a78bfa;font-weight:600;">1 hour</span>
                          <span style="font-size:13px;color:#4b5563;">&nbsp;&nbsp;·&nbsp;&nbsp;</span>
                          <span style="font-size:13px;color:#6b7280;">🔒&nbsp;Single-use only</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Divider -->
              <div style="height:1px;background:linear-gradient(90deg,transparent,#1e1e35,transparent);margin-bottom:28px;"></div>

              <!-- Didn't request this -->
              <p style="margin:0 0 20px;font-size:13px;color:#4b5563;text-align:center;line-height:1.6;">
                If you didn't request a password reset, you can safely ignore this email.<br/>Your password won't change until you click the button above.
              </p>

              <!-- Fallback link -->
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td style="background:#0a0a15;border:1px solid #16162a;border-radius:10px;padding:14px 18px;">
                    <p style="margin:0 0 6px;font-size:11px;color:#4b5563;text-transform:uppercase;letter-spacing:0.8px;font-weight:600;">Button not working? Copy this link:</p>
                    <a href="${resetUrl}" style="font-size:12px;color:#7c3aed;text-decoration:none;word-break:break-all;line-height:1.5;">${resetUrl}</a>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding-top:28px;">
              <p style="margin:0 0 6px;font-size:12px;color:#374151;">© ${year} ${appName}. All rights reserved.</p>
              <p style="margin:0;font-size:12px;color:#1f2937;">You're receiving this because a password reset was requested for your account.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    try {
        await transporter.sendMail({
            from: `${appName} <${from}>`,
            to,
            subject: `Reset your ${appName} password`,
            html,
        });
        logger.log(`Password reset email sent to ${to}`);
    } catch (error) {
        logger.error(`Failed to send reset email to ${to}:`, error.message);
        // Do not re-throw — let the caller return success to prevent email enumeration
        // and avoid exposing SMTP configuration errors to the client
    }
}
