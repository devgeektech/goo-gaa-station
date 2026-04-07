import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import { parsePhoneNumber, isValidPhoneNumber } from 'libphonenumber-js';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { Admin } from '../models/Admin';
import { User } from '../models/User';
import { Driver } from '../models/Driver';
import { Vendor } from '../models/Vendor';
import { OTP, getOTPExpiry } from '../models/OTP';
import { env } from '../config/env';
import { AppError } from '../utils/AppError';
import { MESSAGES } from '../constants/messages';
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
import { logAuthFailure } from '../utils/securityLog';

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const first = typeof forwarded === 'string' ? forwarded.split(',')[0] : forwarded[0];
    return first?.trim() ?? req.ip ?? req.socket?.remoteAddress ?? 'unknown';
  }
  return req.ip ?? req.socket?.remoteAddress ?? 'unknown';
}

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
};
const ACCESS_MAX_AGE = 15 * 60 * 1000;       // 15 min
const REFRESH_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days
/** Temp OTP for development (WhatsApp not configured). Use this in app when NODE_ENV=development. */
export const TEMP_OTP_DEV = '1234';

function hashOtp(otp: string): string {
  return crypto.createHash('sha256').update(otp).digest('hex');
}

// ========== ADMIN ==========

/** POST /api/v1/auth/admin/login */
export const adminLogin = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body ?? {};
  if (mongoose.connection.readyState !== 1) {
    throw new AppError(
      { en: 'Database unavailable', de: 'Datenbank nicht erreichbar' },
      503,
      'SERVICE_UNAVAILABLE'
    );
  }
  if (!email || !password) {
    throw new AppError(
      { en: MESSAGES.AUTH.en.loginFailed, de: MESSAGES.AUTH.de.loginFailed },
      400,
      'VALIDATION_ERROR'
    );
  }
  const admin = await Admin.findOne({ email: String(email).toLowerCase() }).select('+password');
  if (!admin) {
    logAuthFailure({ ip: getClientIp(req), route: 'POST /auth/admin/login', reason: 'admin_not_found', identifier: String(email).toLowerCase() });
    throw new AppError(
      { en: MESSAGES.AUTH.en.loginFailed, de: MESSAGES.AUTH.de.loginFailed },
      401,
      'UNAUTHORIZED'
    );
  }
  const match = await admin.comparePassword(password);
  if (!match) {
    logAuthFailure({ ip: getClientIp(req), route: 'POST /auth/admin/login', reason: 'invalid_password', identifier: String(email).toLowerCase() });
    throw new AppError(
      { en: MESSAGES.AUTH.en.loginFailed, de: MESSAGES.AUTH.de.loginFailed },
      401,
      'UNAUTHORIZED'
    );
  }
  if (!admin.isActive) {
    logAuthFailure({ ip: getClientIp(req), route: 'POST /auth/admin/login', reason: 'admin_deactivated', identifier: String(email).toLowerCase() });
    throw new AppError(
      { en: 'Account is deactivated', de: 'Konto ist deaktiviert' },
      403,
      'FORBIDDEN'
    );
  }
  const payload: AccessPayload = {
    _id: admin._id.toString(),
    email: admin.email,
    role: admin.role,
    model: 'Admin',
  };
  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);
  await storeRefreshToken(admin._id, 'Admin', refreshToken);

  res.cookie('adminAccessToken', accessToken, { ...COOKIE_OPTIONS, maxAge: ACCESS_MAX_AGE });
  res.cookie('adminRefreshToken', refreshToken, { ...COOKIE_OPTIONS, maxAge: REFRESH_MAX_AGE });
  // Clear legacy cookie names to avoid cross-role auth collisions.
  res.cookie('accessToken', '', { ...COOKIE_OPTIONS, maxAge: 0 });
  res.cookie('refreshToken', '', { ...COOKIE_OPTIONS, maxAge: 0 });

  return sendSuccess(res, {
    admin: { _id: admin._id, name: admin.name, email: admin.email, role: admin.role },
  });
});

/** POST /api/v1/auth/admin/refresh */
export const adminRefresh = asyncHandler(async (req: Request, res: Response) => {
  const refreshToken = req.cookies?.adminRefreshToken ?? req.cookies?.refreshToken;
  if (!refreshToken) {
    logAuthFailure({ ip: getClientIp(req), route: 'POST /auth/admin/refresh', reason: 'missing_refresh_cookie' });
    throw new AppError(
      { en: MESSAGES.AUTH.en.invalidToken, de: MESSAGES.AUTH.de.invalidToken },
      401,
      'UNAUTHORIZED'
    );
  }
  try {
    const payload = await verifyRefreshToken(refreshToken);
    if (payload.model !== 'Admin') {
      throw new Error('INVALID_REFRESH_TOKEN');
    }
    const refreshed = await rotateRefreshToken(
      refreshToken,
      payload._id as unknown as import('mongoose').Types.ObjectId,
      'Admin',
      payload
    );
    res.cookie('adminAccessToken', refreshed.accessToken, { ...COOKIE_OPTIONS, maxAge: ACCESS_MAX_AGE });
    res.cookie('adminRefreshToken', refreshed.refreshToken, { ...COOKIE_OPTIONS, maxAge: REFRESH_MAX_AGE });
    return sendSuccess(res, {});
  } catch {
    logAuthFailure({ ip: getClientIp(req), route: 'POST /auth/admin/refresh', reason: 'invalid_refresh_token' });
    throw new AppError(
      { en: MESSAGES.AUTH.en.invalidToken, de: MESSAGES.AUTH.de.invalidToken },
      401,
      'UNAUTHORIZED'
    );
  }
});

/** POST /api/v1/auth/admin/logout */
export const adminLogout = asyncHandler(async (req: Request, res: Response) => {
  const refreshToken = req.cookies?.adminRefreshToken ?? req.cookies?.refreshToken;
  if (refreshToken) {
    try {
      const payload = jwt.decode(refreshToken) as { _id?: string } | null;
      if (payload?._id) {
        await deleteRefreshToken(
          new mongoose.Types.ObjectId(payload._id),
          'Admin',
          refreshToken
        );
      }
    } catch {
      // ignore invalid token on logout
    }
  }
  res.cookie('adminAccessToken', '', { ...COOKIE_OPTIONS, maxAge: 0 });
  res.cookie('adminRefreshToken', '', { ...COOKIE_OPTIONS, maxAge: 0 });
  // Clear legacy cookie names as well.
  res.cookie('accessToken', '', { ...COOKIE_OPTIONS, maxAge: 0 });
  res.cookie('refreshToken', '', { ...COOKIE_OPTIONS, maxAge: 0 });
  return sendSuccess(res, {});
});

// ========== APP (Customer / Driver / Vendor) ==========

type AppRole = 'customer' | 'driver';

/** POST /api/v1/auth/app/refresh — Body: { refreshToken }. Use the refreshToken returned from verify-otp (or from a previous refresh). Returns new accessToken, refreshToken, expiresIn. */
export const appRefresh = asyncHandler(async (req: Request, res: Response) => {
  const { refreshToken: raw } = req.body ?? {};
  if (!raw || typeof raw !== 'string') {
    throw new AppError(
      {
        en: 'Refresh token is required in request body (JSON: { "refreshToken": "..." })',
        de: 'Refresh-Token im Request-Body erforderlich (JSON: { "refreshToken": "..." })',
      },
      400,
      'VALIDATION_ERROR'
    );
  }
  try {
    const payload = await verifyRefreshToken(raw);
    const refreshed = await rotateRefreshToken(
      raw,
      new mongoose.Types.ObjectId(payload._id),
      payload.model,
      payload
    );
    return sendSuccess(res, {
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken,
      expiresIn: refreshed.expiresIn,
    });
  } catch (err) {
    const e = err as Error & { name?: string };
    if (e.message === 'REFRESH_TOKEN_EXPIRED' || e.name === 'TokenExpiredError') {
      throw new AppError(
        { en: 'Refresh token has expired', de: 'Refresh-Token ist abgelaufen' },
        401,
        'REFRESH_TOKEN_EXPIRED'
      );
    }
    if (
      e.message === 'INVALID_REFRESH_TOKEN' ||
      e.message === 'REFRESH_TOKEN_NOT_FOUND' ||
      e.name === 'JsonWebTokenError'
    ) {
      throw new AppError(
        { en: 'Invalid or expired refresh token', de: 'Ungültiger oder abgelaufener Refresh-Token' },
        401,
        'INVALID_REFRESH_TOKEN'
      );
    }
    throw err;
  }
});

/** POST /api/v1/auth/app/logout */
export const appLogout = asyncHandler(async (req: Request, res: Response) => {
  const { refreshToken: raw } = req.body ?? {};
  if (raw) {
    try {
      const payload = jwt.decode(raw) as { _id?: string; model?: 'User' | 'Driver' | 'Vendor' } | null;
      if (payload?._id && payload?.model) {
        await deleteRefreshToken(
          new mongoose.Types.ObjectId(payload._id),
          payload.model,
          raw
        );
      }
    } catch {
      // ignore invalid token on logout
    }
  }
  return sendSuccess(res, {});
});

/** POST /api/v1/auth/app/send-otp — Phone OTP; WhatsApp via Twilio when TWILIO_* env vars are set (see smsService.sendOtp). */
export const appSendOtp = asyncHandler(async (req: Request, res: Response) => {
  const { phone, role } = req.body ?? {};
  const roleStr = role ? String(role).toLowerCase().trim() : '';
  if (!phone || typeof phone !== 'string') {
    throw new AppError(
      { en: 'Phone is required', de: 'Telefonnummer erforderlich' },
      400,
      'VALIDATION_ERROR'
    );
  }
  const allowedRoles = ['vendor', 'customer', 'driver'];
  if (!allowedRoles.includes(roleStr)) {
    throw new AppError(
      { en: 'Role must be vendor, customer or driver', de: 'Rolle muss Vendor, Customer oder Driver sein' },
      400,
      'VALIDATION_ERROR'
    );
  }
  const phoneStr = String(phone).trim();
  const normalizedPhone = isValidPhoneNumber(phoneStr)
    ? (parsePhoneNumber(phoneStr, 'DE')?.format('E.164') ?? phoneStr)
    : phoneStr;

  // Cross-role: phone already registered as vendor only → must use vendor app (customer/driver: apply same pattern when driver is added)
  if (roleStr === 'customer') {
    const [existingVendor, existingUser] = await Promise.all([
      Vendor.findOne({ phone: normalizedPhone }).select('_id').lean(),
      User.findOne({ phone: normalizedPhone }).select('_id').lean(),
    ]);
    if (existingVendor && !existingUser) {
      throw new AppError(
        { en: 'This phone number is registered as a vendor. Please use the vendor app to log in.', de: 'Diese Nummer ist als Anbieter registriert. Bitte die Anbieter-App verwenden.' },
        409,
        'PHONE_REGISTERED_AS_VENDOR'
      );
    }
  }

  const otp = String(Math.floor(1000 + Math.random() * 9000));
  const otpHash = hashOtp(otp);
  await OTP.findOneAndUpdate(
    { phone: normalizedPhone, role: roleStr },
    { otpHash, expiresAt: getOTPExpiry(), isUsed: false },
    { upsert: true, new: true }
  );

  await sendOtp(normalizedPhone, otp);

  if (env.NODE_ENV === 'development') {
    return sendSuccess(res, { message: 'OTP sent (dev)', otp });
  }
  return sendSuccess(res, { message: 'OTP sent' });
});

/** POST /api/v1/auth/app/resend-otp — Resend phone OTP (phone+role). Same as send-otp; rate-limited. */
export const appResendOtp = asyncHandler(async (req: Request, res: Response) => {
  const { phone, role } = req.body ?? {};
  const roleStr = role ? String(role).toLowerCase().trim() : '';
  if (!phone || typeof phone !== 'string') {
    throw new AppError(
      { en: 'Phone is required', de: 'Telefonnummer erforderlich' },
      400,
      'VALIDATION_ERROR'
    );
  }
  const allowedRoles = ['vendor', 'customer', 'driver'];
  if (!allowedRoles.includes(roleStr)) {
    throw new AppError(
      { en: 'Role must be vendor, customer or driver', de: 'Rolle muss Vendor, Customer oder Driver sein' },
      400,
      'VALIDATION_ERROR'
    );
  }
  const phoneStr = String(phone).trim();
  const normalizedPhone = isValidPhoneNumber(phoneStr)
    ? (parsePhoneNumber(phoneStr, 'DE')?.format('E.164') ?? phoneStr)
    : phoneStr;

  // Cross-role: same as send-otp (customer/driver: apply same pattern when driver is added)
  if (roleStr === 'customer') {
    const [existingVendor, existingUser] = await Promise.all([
      Vendor.findOne({ phone: normalizedPhone }).select('_id').lean(),
      User.findOne({ phone: normalizedPhone }).select('_id').lean(),
    ]);
    if (existingVendor && !existingUser) {
      throw new AppError(
        { en: 'This phone number is registered as a vendor. Please use the vendor app to log in.', de: 'Diese Nummer ist als Anbieter registriert. Bitte die Anbieter-App verwenden.' },
        409,
        'PHONE_REGISTERED_AS_VENDOR'
      );
    }
  }

  const otp = String(Math.floor(1000 + Math.random() * 9000));
  const otpHash = hashOtp(otp);
  await OTP.findOneAndUpdate(
    { phone: normalizedPhone, role: roleStr },
    { otpHash, expiresAt: getOTPExpiry(), isUsed: false },
    { upsert: true, new: true }
  );

  await sendOtp(normalizedPhone, otp);

  if (env.NODE_ENV === 'development') {
    return sendSuccess(res, { message: 'OTP resent (dev)', otp });
  }
  return sendSuccess(res, { message: 'OTP resent' });
});

/** POST /api/v1/auth/app/verify-otp — Phone only: phone+otp+role → accessToken + refreshToken (vendor/customer). Use accessToken in Authorization: Bearer for protected routes; use refreshToken in POST /app/refresh to get a new pair. */
export const appVerifyOtp = asyncHandler(async (req: Request, res: Response) => {
  const { phone, otp, role } = req.body ?? {};

  if (!phone || !otp || !role) {
    throw new AppError(
      { en: 'Phone, OTP and role are required', de: 'Telefon, OTP und Rolle erforderlich' },
      400,
      'VALIDATION_ERROR'
    );
  }
  const phoneStr = String(phone).trim();
  const normalizedPhone = isValidPhoneNumber(phoneStr)
    ? (parsePhoneNumber(phoneStr, 'DE')?.format('E.164') ?? phoneStr)
    : phoneStr;

  const doc = await OTP.findOne({ phone: normalizedPhone, role, isUsed: false });
  if (!doc || doc.expiresAt < new Date()) {
    throw new AppError(
      { en: 'Invalid or expired OTP', de: 'Ungültiger oder abgelaufener OTP' },
      400,
      'INVALID_OTP'
    );
  }
  const hash = hashOtp(String(otp));
  if (doc.otpHash !== hash) {
    throw new AppError(
      { en: 'Invalid OTP', de: 'Ungültiger OTP' },
      400,
      'INVALID_OTP'
    );
  }
  await OTP.updateOne({ _id: doc._id }, { isUsed: true });

  const roleStr = String(role).toLowerCase().trim();

  if (roleStr === 'vendor') {
    let vendor = await Vendor.findOne({ phone: normalizedPhone }).lean();
    if (!vendor || (vendor as { status?: string }).status === 'deleted') {
      const slugBase = 'v-' + normalizedPhone.replace(/\D/g, '') + '-' + Math.random().toString(36).slice(2, 10);
      const slug = slugBase.toLowerCase();
      const created = await Vendor.create({
        name: 'Vendor ' + normalizedPhone.slice(-6),
        slug,
        phone: normalizedPhone,
        status: 'active',
      });
      vendor = created.toObject();
    } else if ((vendor as { status?: string }).status === 'blocked') {
      throw new AppError(
        { en: 'Vendor account is blocked', de: 'Anbieter-Konto ist gesperrt' },
        403,
        'FORBIDDEN'
      );
    }
    const payload: AccessPayload = {
      _id: (vendor as { _id: unknown })._id.toString(),
      phone: (vendor as { phone?: string }).phone ?? undefined,
      role: 'vendor',
      model: 'Vendor',
    };
    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);
    await storeRefreshToken(
      new mongoose.Types.ObjectId(String((vendor as { _id: unknown })._id)),
      'Vendor',
      refreshToken
    );
    const decoded = jwt.decode(accessToken) as { exp: number };
    const expiresIn = decoded?.exp ? String(decoded.exp - Math.floor(Date.now() / 1000)) : '900';
    return sendSuccess(res, { vendor, accessToken, refreshToken, expiresIn });
  }

  if (roleStr === 'customer') {
    let user = await User.findOne({ phone: normalizedPhone }).lean();
    if (!user || (user as { status?: string }).status === 'deleted') {
      // Cross-role: do not create customer if phone is already registered as vendor only
      const existingVendor = await Vendor.findOne({ phone: normalizedPhone }).select('_id').lean();
      if (existingVendor) {
        throw new AppError(
          { en: 'This phone number is registered as a vendor. Please use the vendor app to log in.', de: 'Diese Nummer ist als Anbieter registriert. Bitte die Anbieter-App verwenden.' },
          409,
          'PHONE_REGISTERED_AS_VENDOR'
        );
      }
      const created = await User.create({
        name: 'Customer ' + normalizedPhone.slice(-6),
        phone: normalizedPhone,
        preferredLang: 'en',
      });
      user = created.toObject();
    } else if (['blocked', 'deleted'].includes((user as { status?: string }).status ?? '')) {
      throw new AppError(
        { en: 'Account is blocked or deleted', de: 'Konto ist gesperrt oder gelöscht' },
        403,
        'FORBIDDEN'
      );
    }
    const payload: AccessPayload = {
      _id: (user as { _id: unknown })._id.toString(),
      phone: (user as { phone?: string }).phone ?? undefined,
      role: 'user',
      model: 'User',
    };
    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);
    await storeRefreshToken(
      new mongoose.Types.ObjectId(String((user as { _id: unknown })._id)),
      'User',
      refreshToken
    );
    const decoded = jwt.decode(accessToken) as { exp: number };
    const expiresIn = decoded?.exp ? String(decoded.exp - Math.floor(Date.now() / 1000)) : '900';
    const fullName = (user as { name?: string }).name ?? '';
    const phoneOut = (user as { phone?: string }).phone ?? '';
    const profileImage = (user as { profileImage?: string }).profileImage ?? null;
    return sendSuccess(res, {
      user: { _id: (user as { _id: unknown })._id, fullName, phone: phoneOut, profileImage },
      accessToken,
      refreshToken,
      expiresIn,
    });
  }

  if (roleStr === 'driver') {
    throw new AppError(
      { en: 'Phone login for driver is not supported', de: 'Telefon-Login für Fahrer nicht unterstützt' },
      400,
      'ROLE_NOT_SUPPORTED'
    );
  }

  throw new AppError(
    { en: 'Role must be vendor or customer', de: 'Rolle muss Vendor oder Customer sein' },
    400,
    'VALIDATION_ERROR'
  );
});
