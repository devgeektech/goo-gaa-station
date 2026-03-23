/**
 * Twilio WhatsApp OTP — send OTP via Twilio WhatsApp API.
 * Customer: uncomment the calls in auth.controller (appSendOtp / appResendOtp).
 * Vendor: uncomment the calls in authVendor.controller (vendorSendOtp / vendorResendOtp).
 * Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM in .env.
 * From number: use Twilio WhatsApp sandbox (e.g. +1 415 523 8886) or your approved WhatsApp number.
 */
import axios from 'axios';
import { env } from '../config/env';

const TWILIO_MESSAGES_URL = (accountSid: string) =>
  `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

/** Format E.164 phone for Twilio WhatsApp: ensure whatsapp:+... */
function toWhatsAppE164(phone: string): string {
  const p = phone.startsWith('+') ? phone : '+' + phone;
  return 'whatsapp:' + p;
}

/**
 * Send OTP via Twilio WhatsApp. No-op if Twilio env vars are missing.
 * @param phone E.164 phone (e.g. +252618889456)
 * @param otp 4-digit OTP code
 */
export async function sendOtpViaTwilioWhatsApp(phone: string, otp: string): Promise<void> {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM } = env;
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_WHATSAPP_FROM) {
    console.warn('[Twilio WhatsApp] Skipped: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN or TWILIO_WHATSAPP_FROM not set');
    return;
  }

  const fromNum = TWILIO_WHATSAPP_FROM.replace(/\D/g, '');
  if (!fromNum) throw new Error('TWILIO_WHATSAPP_FROM must be a number with country code (e.g. 14155238886)');
  const from = toWhatsAppE164(fromNum);

  const to = toWhatsAppE164(phone);
  const body = `Your verification code is: ${otp}. Valid for 10 minutes.`;

  await axios.post(
    TWILIO_MESSAGES_URL(TWILIO_ACCOUNT_SID),
    new URLSearchParams({
      From: from,
      To: to,
      Body: body,
    }),
    {
      auth: {
        username: TWILIO_ACCOUNT_SID,
        password: TWILIO_AUTH_TOKEN,
      },
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    }
  );
}
