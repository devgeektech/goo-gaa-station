import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import type { Request } from 'express';

import { authDriver } from '../middlewares/authDriver.middleware';
import {
  driverLogout,
  driverRefresh,
  driverResendOtp,
  driverSendOtp,
  driverVerifyOtp,
} from '../controllers/authDriver.controller';

function normalizePhoneKey(phone: unknown): string {
  if (typeof phone !== 'string') return '';
  const trimmed = phone.trim().replace(/\s/g, '');
  const digitsOnly = trimmed.startsWith('+') ? trimmed.slice(1) : trimmed;
  const cleaned = digitsOnly.replace(/\D/g, '');
  return cleaned ? `+${cleaned}` : '';
}

const phoneOtpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => {
    const normalized = normalizePhoneKey((req as Request).body?.phone);
    return normalized || ((req as Request).ip ?? 'unknown');
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    const resetTime = (req as Request & { rateLimit?: { resetTime?: number } }).rateLimit?.resetTime;
    const waitMinutes = resetTime ? Math.max(1, Math.ceil((resetTime - Date.now()) / 60000)) : 60;
    res.status(429).json({ success: false, message: 'Too many OTP requests', waitMinutes });
  },
});

const router = Router();

// Driver Phone OTP Auth (Phase 7.2)
router.post('/send-otp', phoneOtpLimiter, driverSendOtp);
router.post('/verify-otp', driverVerifyOtp);
router.post('/resend-otp', phoneOtpLimiter, driverResendOtp);
router.post('/refresh', driverRefresh);
router.post('/logout', authDriver, driverLogout);

export default router;

