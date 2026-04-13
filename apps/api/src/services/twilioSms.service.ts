/**
 * Twilio Programmable SMS — optional backup when WhatsApp sandbox does not deliver.
 * Set TWILIO_SMS_FROM to a Twilio SMS-capable number (Phone Numbers in Console).
 */
import axios, { isAxiosError } from 'axios';
import { env } from '../config/env';

const TWILIO_MESSAGES_URL = (accountSid: string) =>
  `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

function toE164Digits(phone: string): string {
  const d = phone.replace(/\D/g, '');
  if (!d) throw new Error('Invalid phone');
  return `+${d}`;
}

/**
 * Sends the same OTP via SMS (not whatsapp:). No-op if TWILIO_SMS_FROM is unset.
 * India and some regions may need Twilio/geo permissions or DLT for SMS — check Console if this fails.
 */
export async function sendOtpViaTwilioSms(phone: string, otp: string): Promise<void> {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_SMS_FROM } = env;
  if (!TWILIO_SMS_FROM?.trim() || !TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    return;
  }
  const fromDigits = TWILIO_SMS_FROM.replace(/\D/g, '');
  if (!fromDigits) {
    console.warn('[Twilio SMS] TWILIO_SMS_FROM has no digits');
    return;
  }

  const from = toE164Digits(fromDigits);
  const to = toE164Digits(phone);
  const body = `Your verification code is: ${otp}. Valid for 10 minutes.`;

  try {
    const { data } = await axios.post<Record<string, unknown>>(
      TWILIO_MESSAGES_URL(TWILIO_ACCOUNT_SID),
      new URLSearchParams({ From: from, To: to, Body: body }),
      {
        auth: { username: TWILIO_ACCOUNT_SID, password: TWILIO_AUTH_TOKEN },
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      }
    );
    console.log('[Twilio SMS] OTP sent via SMS backup.', { sid: data?.sid, status: data?.status });
  } catch (err: unknown) {
    const preview = isAxiosError(err)
      ? JSON.stringify(err.response?.data ?? '').slice(0, 400)
      : err instanceof Error
        ? err.message
        : String(err);
    console.error('[Twilio SMS] SMS backup failed:', isAxiosError(err) ? err.response?.status : undefined, preview);
    throw err;
  }
}
