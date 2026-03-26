import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';

import { Driver, type DriverDocument } from '../models/Driver';
import { AppError } from '../utils/AppError';
import { sendSuccess } from '../utils/response';
import { asyncHandler } from '../utils/asyncHandler';
import { sendOtp } from '../services/smsService';
import { env } from '../config/env';
import {
  deleteRefreshToken,
  generateAccessToken,
  generateRefreshToken,
  hashToken,
  rotateRefreshToken,
  storeRefreshToken,
  verifyRefreshToken,
  type AccessPayload,
} from '../services/auth.service';
import { MESSAGES } from '../constants/messages';

const SALT_ROUNDS = 12;
const OTP_TTL_MINUTES = 10;
const MAX_OTP_ATTEMPTS = 5;
const PLACEHOLDER_NAME_PREFIX = 'Driver ';

function normalizePhone(phone: string): string {
  const trimmed = String(phone).trim().replace(/\s/g, '');
  const digitsOnly = trimmed.startsWith('+') ? trimmed.slice(1) : trimmed;
  const cleaned = digitsOnly.replace(/\D/g, '');
  return `+${cleaned}`;
}

function isPlaceholderDriver(driver: { name?: string | null }): boolean {
  const name = (driver.name ?? '').trim();
  return name.startsWith(PLACEHOLDER_NAME_PREFIX) && name.length < 25;
}

function getOTPExpiry(): Date {
  const d = new Date();
  d.setMinutes(d.getMinutes() + OTP_TTL_MINUTES);
  return d;
}

function maskPhone(normalizedPhone: string): string {
  // Example style: +252 0 888****
  const digits = normalizedPhone.replace(/[^\d]/g, '');
  if (digits.startsWith('252') && digits.length >= 8) {
    const country = digits.slice(0, 3);
    const prefix = digits.slice(3, 4);
    const mid = digits.slice(4, 7);
    return `+${country} ${prefix} ${mid}****`;
  }

  // Generic: keep last 4 digits, mask the rest
  if (digits.length <= 4) return `${normalizedPhone.slice(0, 2)}****`;
  return `${normalizedPhone.slice(0, Math.min(4, normalizedPhone.length))}****`;
}

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const first = typeof forwarded === 'string' ? forwarded.split(',')[0] : forwarded[0];
    return first?.trim() ?? req.ip ?? 'unknown';
  }
  return req.ip ?? req.socket?.remoteAddress ?? 'unknown';
}

async function findOrCreateDriverByPhone(phone: string): Promise<{ driver: DriverDocument; isNewDriver: boolean }> {
  const existing = await Driver.findOne({ phone });
  if (existing) return { driver: existing, isNewDriver: false };

  // Ensure required `password` exists: we generate a random placeholder password.
  // Driver OTP auth does not use this password, but schema requires it.
  const placeholderPassword = crypto.randomBytes(16).toString('hex');
  const placeholderName = PLACEHOLDER_NAME_PREFIX + phone.slice(-6);
  const created = await Driver.create({
    phone,
    name: placeholderName,
    password: placeholderPassword,
    isPhoneVerified: false,
  });

  return { driver: created, isNewDriver: true };
}

export const driverSendOtp = asyncHandler(async (req: Request, res: Response) => {
  const { phone } = req.body ?? {};
  if (!phone || typeof phone !== 'string') {
    throw new AppError({ en: 'Phone is required', de: 'Telefonnummer erforderlich' }, 400, 'VALIDATION_ERROR');
  }

  const normalizedPhone = normalizePhone(phone);
  const otp = String(1000 + Math.floor(Math.random() * 9000));
  const otpHash = await bcrypt.hash(otp, SALT_ROUNDS);
  const phoneOtpExpiry = getOTPExpiry();

  const { driver } = await findOrCreateDriverByPhone(normalizedPhone);
  // Reset OTP state for fresh verification.
  driver.isPhoneVerified = false;
  driver.phoneOtp = otpHash;
  driver.phoneOtpExpiry = phoneOtpExpiry;
  driver.phoneOtpAttempts = 0;
  await driver.save();

  await sendOtp(normalizedPhone, otp);

  // In dev, smsService already logs OTP to console (per repo behavior).
  if (env.NODE_ENV === 'development') {
    return sendSuccess(res, { message: 'OTP sent (dev)', otp });
  }
  return sendSuccess(res, { message: 'OTP sent', maskedPhone: maskPhone(normalizedPhone) });
});

export const driverVerifyOtp = asyncHandler(async (req: Request, res: Response) => {
  const { phone, otp } = req.body ?? {};
  if (!phone || typeof phone !== 'string' || !otp || typeof otp !== 'string') {
    throw new AppError({ en: 'Phone and OTP are required', de: 'Telefon und OTP erforderlich' }, 400, 'VALIDATION_ERROR');
  }

  const normalizedPhone = normalizePhone(phone);
  const otpStr = String(otp).trim();

  const driver = await Driver.findOne({ phone: normalizedPhone }).select('+phoneOtp +phoneOtpExpiry +phoneOtpAttempts');
  if (!driver) {
    throw new AppError({ en: 'Driver not found', de: 'Fahrer nicht gefunden' }, 404, 'NOT_FOUND');
  }

  const expiry = driver.phoneOtpExpiry;
  if (!expiry || expiry < new Date()) {
    driver.phoneOtp = null;
    driver.phoneOtpExpiry = null;
    driver.phoneOtpAttempts = 0;
    await driver.save();
    throw new AppError({ en: 'OTP expired', de: 'OTP abgelaufen' }, 410, 'OTP_EXPIRED');
  }

  const match = await bcrypt.compare(otpStr, driver.phoneOtp ?? '');
  if (!match) {
    const currentAttempts = driver.phoneOtpAttempts ?? 0;
    const nextAttempts = currentAttempts + 1;

    if (nextAttempts >= MAX_OTP_ATTEMPTS) {
      driver.phoneOtp = null;
      driver.phoneOtpExpiry = null;
      driver.phoneOtpAttempts = 0;
    } else {
      driver.phoneOtpAttempts = nextAttempts;
    }
    await driver.save();

    throw new AppError({ en: 'Invalid OTP', de: 'Ungültiger OTP' }, 401, 'INVALID_OTP');
  }

  // Correct OTP
  driver.isPhoneVerified = true;
  driver.phoneOtp = null;
  driver.phoneOtpExpiry = null;
  driver.phoneOtpAttempts = 0;

  const payload: AccessPayload = {
    _id: driver._id.toString(),
    phone: driver.phone ?? undefined,
    role: 'driver',
    model: 'Driver',
  };

  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);

  // Store refresh token hash in DB (canonical store)
  await storeRefreshToken(driver._id, 'Driver', refreshToken);

  // Also set hashed refresh token on driver document (per Phase 7.2 requirement)
  driver.refreshToken = hashToken(refreshToken);

  await driver.save();

  const isNewDriver = isPlaceholderDriver(driver);
  const approvalStatus = driver.approvalStatus === 'approved' ? 'approved' : 'pending';

  return sendSuccess(res, {
    accessToken,
    refreshToken,
    isNewDriver,
    approvalStatus,
  });
});

export const driverResendOtp = asyncHandler(async (req: Request, res: Response) => {
  // Resend uses same logic as send-otp.
  const { phone } = req.body ?? {};
  if (!phone || typeof phone !== 'string') {
    throw new AppError({ en: 'Phone is required', de: 'Telefonnummer erforderlich' }, 400, 'VALIDATION_ERROR');
  }

  const normalizedPhone = normalizePhone(phone);
  const otp = String(1000 + Math.floor(Math.random() * 9000));
  const otpHash = await bcrypt.hash(otp, SALT_ROUNDS);
  const phoneOtpExpiry = getOTPExpiry();

  const { driver } = await findOrCreateDriverByPhone(normalizedPhone);

  driver.isPhoneVerified = false;
  driver.phoneOtp = otpHash;
  driver.phoneOtpExpiry = phoneOtpExpiry;
  driver.phoneOtpAttempts = 0;
  await driver.save();

  await sendOtp(normalizedPhone, otp);

  if (env.NODE_ENV === 'development') {
    return sendSuccess(res, { message: 'OTP resent (dev)', otp });
  }
  return sendSuccess(res, { message: 'OTP resent', maskedPhone: maskPhone(normalizedPhone) });
});

export const driverRefresh = asyncHandler(async (req: Request, res: Response) => {
  const { refreshToken: raw } = req.body ?? {};
  if (!raw || typeof raw !== 'string') {
    throw new AppError(
      { en: 'Refresh token is required', de: 'Refresh-Token erforderlich' },
      400,
      'VALIDATION_ERROR'
    );
  }

  const payload = await verifyRefreshToken(raw);
  if (payload.model !== 'Driver') {
    throw new AppError({ en: 'Invalid token for driver', de: 'Ungültiger Token für Fahrer' }, 401, 'INVALID_REFRESH_TOKEN');
  }

  const refreshed = await rotateRefreshToken(
    raw,
    new mongoose.Types.ObjectId(payload._id),
    'Driver',
    payload
  );

  await Driver.findByIdAndUpdate(payload._id, { $set: { refreshToken: hashToken(refreshed.refreshToken) } }, { runValidators: false });

  return sendSuccess(res, {
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.refreshToken,
    expiresIn: refreshed.expiresIn,
  });
});

export const driverLogout = asyncHandler(async (req: Request, res: Response) => {
  const driver = req.driver;
  if (!driver?._id) {
    throw new AppError({ en: 'Unauthorized', de: 'Nicht autorisiert' }, 401, 'UNAUTHORIZED');
  }

  const { refreshToken: raw, fcmToken } = req.body ?? {};

  if (raw && typeof raw === 'string') {
    try {
      await deleteRefreshToken(driver._id, 'Driver', raw);
    } catch {
      // ignore
    }
  }

  // Set hashed refresh token field to null (Phase 7.2 requirement)
  await Driver.findByIdAndUpdate(driver._id, { $set: { refreshToken: null } }, { runValidators: false });

  if (fcmToken && typeof fcmToken === 'string') {
    const tokens = (driver.fcmTokens ?? []).filter((t) => t?.token !== fcmToken);
    await Driver.findByIdAndUpdate(driver._id, { $set: { fcmTokens: tokens } }, { runValidators: false });
  }

  return sendSuccess(res, {});
});

