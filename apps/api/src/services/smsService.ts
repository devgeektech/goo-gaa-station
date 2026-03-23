import { env } from '../config/env';

/**
 * Send OTP via SMS. In development logs to console; in production uses SMS_PROVIDER (e.g. africas_talking).
 */
export async function sendOtp(phone: string, otp: string): Promise<void> {
  if (env.NODE_ENV === 'development') {
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
