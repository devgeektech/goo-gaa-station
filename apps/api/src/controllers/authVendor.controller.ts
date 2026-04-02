import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { parsePhoneNumber, isValidPhoneNumber } from 'libphonenumber-js';
import { Vendor } from '../models/Vendor';
import { User } from '../models/User';
import { AppError } from '../utils/AppError';
import { sendSuccess } from '../utils/response';
import { asyncHandler } from '../utils/asyncHandler';
import {
  generateAccessToken,
  generateRefreshToken,
  storeRefreshToken,
  rotateRefreshToken,
  deleteRefreshToken,
  verifyRefreshToken,
  type AccessPayload,
} from '../services/auth.service';
import { sendOtp } from '../services/smsService';
// WhatsApp OTP (commented): uncomment import and calls below when TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM are set
// import { sendOtpViaTwilioWhatsApp } from '../services/twilioWhatsApp.service';

const OTP_EXPIRY_MS = 10 * 60 * 1000; // 10 min
const MAX_OTP_ATTEMPTS = 5;
const BCRYPT_ROUNDS = 12;
const PLACEHOLDER_NAME_PREFIX = 'Vendor ';

function normalizePhone(phone: string): string {
  const trimmed = String(phone).trim().replace(/\s/g, '');
  if (isValidPhoneNumber(trimmed)) {
    const parsed = parsePhoneNumber(trimmed, 'DE');
    return parsed?.format('E.164') ?? trimmed;
  }
  return trimmed.startsWith('+') ? trimmed : `+${trimmed}`;
}

function maskPhone(phone: string): string {
  if (phone.length <= 6) return '****';
  const last = phone.slice(-4);
  const start = phone.slice(0, Math.min(6, phone.length - 4));
  return `${start}${'*'.repeat(Math.max(0, phone.length - 10))}${last}`;
}

function generateOtp(): string {
  return String(1000 + Math.floor(Math.random() * 9000));
}

function isPlaceholderVendor(vendor: { name?: string; description?: string }): boolean {
  const name = (vendor.name ?? '').trim();
  return name.startsWith(PLACEHOLDER_NAME_PREFIX) && name.length < 25;
}

function getOnboardingStep(vendor: { name?: string; description?: string; categoryIds?: unknown[] }): number {
  if (!isPlaceholderVendor(vendor) && (vendor.description ?? '').trim().length > 0) return 6;
  if (!isPlaceholderVendor(vendor)) return 5;
  const hasCategories = Array.isArray(vendor.categoryIds) && vendor.categoryIds.length > 0;
  if (hasCategories) return 4;
  return 1;
}

/** POST /api/v1/auth/vendor/send-otp */
export const vendorSendOtp = asyncHandler(async (req: Request, res: Response) => {
  const { phone } = req.body ?? {};
  if (!phone || typeof phone !== 'string') {
    throw new AppError({ en: 'Phone is required', de: 'Telefonnummer erforderlich' }, 400, 'VALIDATION_ERROR');
  }
  const normalizedPhone = normalizePhone(String(phone).trim());

  let vendor = await Vendor.findOne({ phone: normalizedPhone });
  if (!vendor) {
    // Cross-role: phone already registered as customer only → must use customer app (driver: apply same check when driver API is added)
    const existingUser = await User.findOne({ phone: normalizedPhone }).select('_id').lean();
    if (existingUser) {
      throw new AppError(
        { en: 'This phone number is registered as a customer. Please use the customer app to log in.', de: 'Diese Nummer ist als Kunde registriert. Bitte die Kunden-App verwenden.' },
        409,
        'PHONE_REGISTERED_AS_CUSTOMER'
      );
    }
    const slugBase = 'v-' + normalizedPhone.replace(/\D/g, '') + '-' + Math.random().toString(36).slice(2, 10);
    const slug = slugBase.toLowerCase();
    vendor = await Vendor.create({
      name: PLACEHOLDER_NAME_PREFIX + normalizedPhone.slice(-6),
      slug,
      phone: normalizedPhone,
      isPhoneVerified: false,
    });
  }

  const otp = generateOtp();
  console.log('otp', otp);
  const phoneOtpHash = await bcrypt.hash(otp, BCRYPT_ROUNDS);
  const phoneOtpExpiry = new Date(Date.now() + OTP_EXPIRY_MS);
  // Use findOneAndUpdate so select:false fields (phoneOtp, phoneOtpExpiry) are persisted (Mongoose may not persist them on doc.save() when they were not selected)
  await Vendor.findOneAndUpdate(
    { phone: normalizedPhone },
    { $set: { phoneOtp: phoneOtpHash, phoneOtpExpiry, phoneOtpAttempts: 0 } },
    { runValidators: false }
  );

  await sendOtp(normalizedPhone, otp);
  // WhatsApp OTP (vendor): uncomment when Twilio env is set (see top of file)
  // await sendOtpViaTwilioWhatsApp(normalizedPhone, otp);
  if (process.env.NODE_ENV === 'development') {
    return sendSuccess(res, { message: 'OTP sent (dev)', otp });
  }
  return sendSuccess(res, { message: 'OTP sent', maskedPhone: maskPhone(normalizedPhone) });
});

/** POST /api/v1/auth/vendor/verify-otp */
export const vendorVerifyOtp = asyncHandler(async (req: Request, res: Response) => {
  const { phone, otp } = req.body ?? {};
  if (!phone || !otp) {
    throw new AppError({ en: 'Phone and OTP are required', de: 'Telefon und OTP erforderlich' }, 400, 'VALIDATION_ERROR');
  }
  const normalizedPhone = normalizePhone(String(phone).trim());

  const vendor = await Vendor.findOne({ phone: normalizedPhone }).select('+phoneOtp +phoneOtpExpiry');
  if (!vendor) {
    // Cross-role: phone registered as customer only → clear error (driver: apply same when driver API is added)
    const existingUser = await User.findOne({ phone: normalizedPhone }).select('_id').lean();
    if (existingUser) {
      throw new AppError(
        { en: 'This phone number is registered as a customer. Please use the customer app to log in.', de: 'Diese Nummer ist als Kunde registriert. Bitte die Kunden-App verwenden.' },
        409,
        'PHONE_REGISTERED_AS_CUSTOMER'
      );
    }
    throw new AppError({ en: 'Vendor not found', de: 'Anbieter nicht gefunden' }, 404, 'NOT_FOUND');
  }

  if (vendor.status === 'blocked') {
    throw new AppError({ en: 'Vendor account is blocked', de: 'Anbieter-Konto ist gesperrt' }, 403, 'FORBIDDEN');
  }

  const now = new Date();
  if (!vendor.phoneOtpExpiry || vendor.phoneOtpExpiry < now) {
    await Vendor.findByIdAndUpdate(vendor._id, { $set: { phoneOtp: null, phoneOtpExpiry: null, phoneOtpAttempts: 0 } }, { runValidators: false });
    throw new AppError({ en: 'OTP expired', de: 'OTP abgelaufen' }, 410, 'OTP_EXPIRED');
  }

  if (vendor.phoneOtpAttempts >= MAX_OTP_ATTEMPTS) {
    await Vendor.findByIdAndUpdate(vendor._id, { $set: { phoneOtp: null, phoneOtpExpiry: null, phoneOtpAttempts: 0 } }, { runValidators: false });
    throw new AppError({ en: 'Too many attempts', de: 'Zu viele Versuche' }, 401, 'OTP_INVALIDATED');
  }

  const otpStr = String(otp).trim();
  console.log('otpStr', otpStr);
  const match = await bcrypt.compare(otpStr, vendor.phoneOtp ?? '');
  if (!match) {
    const newAttempts = (vendor.phoneOtpAttempts ?? 0) + 1;
    const clearOtp = newAttempts >= MAX_OTP_ATTEMPTS ? { phoneOtp: null, phoneOtpExpiry: null, phoneOtpAttempts: 0 } : { phoneOtpAttempts: newAttempts };
    await Vendor.findByIdAndUpdate(vendor._id, { $set: clearOtp }, { runValidators: false });
    // OTP validation errors should not be reported as auth-token errors (401).
    throw new AppError({ en: 'Invalid OTP', de: 'Ungültiger OTP' }, 400, 'INVALID_OTP');
  }

  await Vendor.findByIdAndUpdate(
    vendor._id,
    { $set: { isPhoneVerified: true, phoneOtp: null, phoneOtpExpiry: null, phoneOtpAttempts: 0 } },
    { runValidators: false }
  );

  const payload: AccessPayload = {
    _id: vendor._id.toString(),
    phone: vendor.phone ?? undefined,
    role: 'vendor',
    model: 'Vendor',
  };
  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);
  await storeRefreshToken(vendor._id, 'Vendor', refreshToken);

  const isNewVendor = isPlaceholderVendor(vendor);
  const onboardingStep = getOnboardingStep(vendor);

  return sendSuccess(res, {
    accessToken,
    refreshToken,
    isNewVendor,
    onboardingStep,
  });
});

/** POST /api/v1/auth/vendor/resend-otp */
export const vendorResendOtp = asyncHandler(async (req: Request, res: Response) => {
  const { phone } = req.body ?? {};
  if (!phone || typeof phone !== 'string') {
    throw new AppError({ en: 'Phone is required', de: 'Telefonnummer erforderlich' }, 400, 'VALIDATION_ERROR');
  }
  const normalizedPhone = normalizePhone(String(phone).trim());

  const vendor = await Vendor.findOne({ phone: normalizedPhone });
  if (!vendor) {
    throw new AppError({ en: 'Vendor not found', de: 'Anbieter nicht gefunden' }, 404, 'NOT_FOUND');
  }

  const otp = generateOtp();
  const phoneOtpHash = await bcrypt.hash(otp, BCRYPT_ROUNDS);
  const phoneOtpExpiry = new Date(Date.now() + OTP_EXPIRY_MS);
  await Vendor.findOneAndUpdate(
    { phone: normalizedPhone },
    { $set: { phoneOtp: phoneOtpHash, phoneOtpExpiry, phoneOtpAttempts: 0 } },
    { runValidators: false }
  );

  await sendOtp(normalizedPhone, otp);
  // WhatsApp OTP (vendor resend): uncomment when Twilio env is set (see top of file)
  // await sendOtpViaTwilioWhatsApp(normalizedPhone, otp);
  if (process.env.NODE_ENV === 'development') {
    return sendSuccess(res, { message: 'OTP resent (dev)', otp });
  }
  return sendSuccess(res, { message: 'OTP resent', maskedPhone: maskPhone(normalizedPhone) });
});

/** POST /api/v1/auth/vendor/refresh */
export const vendorRefresh = asyncHandler(async (req: Request, res: Response) => {
  const { refreshToken: raw } = req.body ?? {};
  if (!raw || typeof raw !== 'string') {
    throw new AppError(
      { en: 'Refresh token is required', de: 'Refresh-Token erforderlich' },
      400,
      'VALIDATION_ERROR'
    );
  }
  try {
    const payload = await verifyRefreshToken(raw);
    if (payload.model !== 'Vendor') {
      throw new AppError({ en: 'Invalid token for vendor', de: 'Ungültiger Token' }, 401, 'INVALID_REFRESH_TOKEN');
    }
    const refreshed = await rotateRefreshToken(
      raw,
      new mongoose.Types.ObjectId(payload._id),
      'Vendor',
      payload
    );
    return sendSuccess(res, {
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken,
      expiresIn: refreshed.expiresIn,
    });
  } catch (err) {
    const e = err as Error & { message?: string; name?: string };
    if (e.message === 'REFRESH_TOKEN_EXPIRED' || e.name === 'TokenExpiredError') {
      throw new AppError({ en: 'Refresh token expired', de: 'Refresh-Token abgelaufen' }, 401, 'REFRESH_TOKEN_EXPIRED');
    }
    if (
      e.message === 'INVALID_REFRESH_TOKEN' ||
      e.message === 'REFRESH_TOKEN_NOT_FOUND' ||
      e.name === 'JsonWebTokenError'
    ) {
      throw new AppError({ en: 'Invalid refresh token', de: 'Ungültiger Refresh-Token' }, 401, 'INVALID_REFRESH_TOKEN');
    }
    throw err;
  }
});

/** POST /api/v1/auth/vendor/logout — requires authVendor; optional body: { refreshToken, fcmToken } */
export const vendorLogout = asyncHandler(async (req: Request, res: Response) => {
  const vendor = (req as Request & { vendor?: { _id: unknown; fcmTokens?: Array<{ token: string }> } }).vendor;
  if (!vendor) {
    throw new AppError({ en: 'Unauthorized', de: 'Nicht autorisiert' }, 401, 'UNAUTHORIZED');
  }

  const { refreshToken: raw, fcmToken } = req.body ?? {};
  if (raw && typeof raw === 'string') {
    try {
      await deleteRefreshToken(new mongoose.Types.ObjectId(String(vendor._id)), 'Vendor', raw);
    } catch {
      // ignore
    }
  }

  if (fcmToken && typeof fcmToken === 'string') {
    const tokens = (vendor.fcmTokens ?? []).filter((t) => t.token !== fcmToken);
    await Vendor.findByIdAndUpdate(vendor._id, { fcmTokens: tokens }, { runValidators: false });
  }

  return sendSuccess(res, {});
});
