import { env } from '../config/env';

function twilioOtpDeliveryConfigured(): boolean {
  const hasSid = Boolean(env.TWILIO_ACCOUNT_SID?.trim());
  const hasToken = Boolean(env.TWILIO_AUTH_TOKEN?.trim());
  const hasFrom = Boolean(env.TWILIO_WHATSAPP_FROM?.trim());
  const hasMsgSvc = Boolean(env.TWILIO_MESSAGING_SERVICE_SID?.trim());
  return hasSid && hasToken && (hasFrom || hasMsgSvc);
}

/**
 * Phone-login OTP. While SMS/WhatsApp is off, uses OTP_STATIC_CODE (default 1234, 4 digits).
 * Set OTP_STATIC_CODE= (empty) in env when real delivery is enabled and sendOtp is wired.
 */
export function generateLoginOtp(): string {
  const staticCode = env.OTP_STATIC_CODE;
  if (staticCode) return staticCode;
  return String(1000 + Math.floor(Math.random() * 9000));
}

/** Include OTP in send-otp JSON (dev always; production when using a static code). */
export function shouldExposeLoginOtpInResponse(): boolean {
  return env.NODE_ENV === 'development' || Boolean(env.OTP_STATIC_CODE);
}

export function isLoginOtpDeliveryConfigured(): boolean {
  return twilioOtpDeliveryConfigured();
}