import { env } from '../config/env';
import { sendOtpViaTwilioSms } from './twilioSms.service';
import { maskPhoneForLog, sendOtpViaTwilioWhatsApp } from './twilioWhatsApp.service';

/**
 * Send OTP: Twilio WhatsApp when TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + (TWILIO_WHATSAPP_FROM or TWILIO_MESSAGING_SERVICE_SID);
 * otherwise same as before (dev console; SMS_PROVIDER placeholder in prod).
 */
export async function sendOtp(phone: string, otp: string): Promise<void> {
  const hasSid = Boolean(env.TWILIO_ACCOUNT_SID?.trim());
  const hasToken = Boolean(env.TWILIO_AUTH_TOKEN?.trim());
  const hasFrom = Boolean(env.TWILIO_WHATSAPP_FROM?.trim());
  const hasMsgSvc = Boolean(env.TWILIO_MESSAGING_SERVICE_SID?.trim());
  const twilioConfigured = hasSid && hasToken && (hasFrom || hasMsgSvc);

  console.log('[sendOtp][debug]', {
    NODE_ENV: env.NODE_ENV,
    toMasked: maskPhoneForLog(phone),
    otpLength: otp?.length,
    twilioConfigured,
    hasSid,
    hasToken,
    hasFrom,
    hasMsgSvc,
    tokenLength: env.TWILIO_AUTH_TOKEN?.length ?? 0,
  });

  if (twilioConfigured) {
    console.log('[sendOtp][debug] routing → sendOtpViaTwilioWhatsApp');
    await sendOtpViaTwilioWhatsApp(phone, otp);
    // WhatsApp sandbox often does not deliver until the user joins; SMS uses the same Twilio account and reaches the handset reliably when TWILIO_SMS_FROM is a valid SMS sender.
    if (env.TWILIO_SMS_FROM?.trim()) {
      try {
        await sendOtpViaTwilioSms(phone, otp);
        console.log('[sendOtp] SMS backup delivered via Twilio to', maskPhoneForLog(phone));
      } catch {
        console.error('[sendOtp] SMS backup failed; WhatsApp was still queued. Add a valid TWILIO_SMS_FROM or join the WhatsApp sandbox.');
      }
    } else {
      console.log(
        '[sendOtp] No TWILIO_SMS_FROM — only WhatsApp was sent. If the user gets no WhatsApp: join the sandbox (Console → Messaging → Try WhatsApp) or set TWILIO_SMS_FROM to your Twilio SMS number for SMS backup.'
      );
    }
    return;
  }
  if (env.NODE_ENV === 'development') {
    console.warn(
      '[sendOtp] Twilio is NOT configured (set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM in apps/api/.env.development). OTP is only in this log and in the API response — no WhatsApp.'
    );
    console.log(`SMS to ${phone}: Your DeliverEats OTP is ${otp}`);
    return;
  }
  if (env.SMS_PROVIDER === 'africas_talking' && env.SMS_API_KEY) {
    // TODO: integrate Africa's Talking API when ready
    console.log(`[SMS] To ${phone}: OTP ${otp} (Africa's Talking not wired)`);
    return;
  }
  console.log(`SMS to ${phone}: Your DeliverEats OTP is ${otp}`);
}
