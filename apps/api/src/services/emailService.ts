import nodemailer from 'nodemailer';
import { env } from '../config/env';

const OTP_EXPIRY_MINUTES = 10;

function getTransporter() {
  if (env.MAIL_PROVIDER === 'sendgrid' && env.SENDGRID_API_KEY) {
    return nodemailer.createTransport({
      host: 'smtp.sendgrid.net',
      port: 587,
      secure: false,
      auth: {
        user: 'apikey',
        pass: env.SENDGRID_API_KEY,
      },
    });
  }
  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: env.SMTP_USER && env.SMTP_PASS ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  });
}

function otpHtml(code: string, purpose: 'verification' | 'reset'): string {
  const title = purpose === 'verification' ? 'Verify your email' : 'Reset your password';
  const line = purpose === 'verification'
    ? 'Use this code to verify your DeliverEats account:'
    : 'Use this code to reset your DeliverEats password:';
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f5f5;padding:24px">
  <div style="max-width:400px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;box-shadow:0 2px 8px rgba(0,0,0,0.08)">
    <div style="text-align:center;margin-bottom:24px">
      <span style="font-size:24px;font-weight:800;color:#1a1a1a">DeliverEats</span>
    </div>
    <h1 style="font-size:18px;font-weight:700;color:#1a1a1a;margin:0 0 12px">${title}</h1>
    <p style="color:#5c5c5c;margin:0 0 20px;line-height:1.5">${line}</p>
    <div style="background:#f0f4ff;border-radius:8px;padding:16px;text-align:center;margin-bottom:20px">
      <span style="font-size:28px;font-weight:800;letter-spacing:6px;color:#1a1a1a">${code}</span>
    </div>
    <p style="font-size:13px;color:#888;margin:0">This code expires in ${OTP_EXPIRY_MINUTES} minutes. Do not share it.</p>
  </div>
</body>
</html>`;
}

export interface SendOtpEmailOptions {
  to: string;
  otp: string;
  purpose: 'verification' | 'reset';
}

export async function sendOtpEmail(options: SendOtpEmailOptions): Promise<void> {
  const { to, otp, purpose } = options;
  const subject = purpose === 'verification'
    ? 'Your DeliverEats verification code'
    : 'Your DeliverEats password reset code';
  const transporter = getTransporter();
  await transporter.sendMail({
    from: env.SMTP_USER || 'noreply@delivereats.com',
    to,
    subject,
    html: otpHtml(otp, purpose),
  });
}
