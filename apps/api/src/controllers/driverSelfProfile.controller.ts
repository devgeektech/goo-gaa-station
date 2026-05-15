import type { Request, Response } from 'express';
import type { Server as SocketIOServer } from 'socket.io';

import { Driver } from '../models/Driver';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/response';
import { getUploadMiddleware, deleteLocalFile, getFileUrl, MAX_FILE_SIZE_10MB } from '../utils/storageProvider';

const uploadDriverImage = getUploadMiddleware('drivers', MAX_FILE_SIZE_10MB).single('profileImage');

function getIo(req: Request): SocketIOServer | undefined {
  return (req.app as { get?(key: string): unknown }).get?.('io') as SocketIOServer | undefined;
}

function normalizePhone(phone: string): string {
  const trimmed = String(phone).trim().replace(/\s/g, '');
  const digitsOnly = trimmed.startsWith('+') ? trimmed.slice(1) : trimmed;
  const cleaned = digitsOnly.replace(/\D/g, '');
  return `+${cleaned}`;
}

function toProfileShape(driver: any) {
  return {
    name: driver?.name ?? '',
    phone: driver?.phone ?? '',
    email: driver?.email ?? null,
    profileImage: driver?.profileImage ?? null,
    vehicleType: driver?.vehicleType ?? null,
    vehicleNumber: driver?.vehicleNumber ?? null,
    status: driver?.status ?? null,
    approvalStatus: driver?.approvalStatus ?? null,
    isOnline: Boolean(driver?.isOnline),
    rating: driver?.rating ?? 0,
    fcmTokens: Array.isArray(driver?.fcmTokens) ? driver.fcmTokens : [],
  };
}

const SENSITIVE_DRIVER_KEYS = ['password', 'refreshToken', 'phoneOtp', 'phoneOtpExpiry', 'phoneOtpAttempts'] as const;

function sanitizeDriverForSelfResponse(doc: Record<string, unknown>): Record<string, unknown> {
  const out = { ...doc };
  for (const k of SENSITIVE_DRIVER_KEYS) {
    delete out[k];
  }
  return out;
}

/** GET /api/v1/driver/profile — full logged-in driver document (secrets stripped). */
export const getSelfProfile = asyncHandler(async (req: Request, res: Response) => {
  const id = req.driver?._id;
  if (!id) throw new AppError({ en: 'Unauthorized', de: 'Nicht autorisiert' }, 401, 'UNAUTHORIZED');

  const driver = await Driver.findById(id).lean();
  if (!driver || (driver as { status?: string }).status === 'deleted') {
    throw new AppError({ en: 'Driver not found', de: 'Fahrer nicht gefunden' }, 404, 'NOT_FOUND');
  }

  const full = sanitizeDriverForSelfResponse(driver as Record<string, unknown>);
  return sendSuccess(res, full);
});

/** PATCH /api/v1/driver/profile (multipart) */
export const patchSelfProfile = asyncHandler(async (req: Request, res: Response) => {
  const runUpload = () =>
    new Promise<void>((resolve, reject) => {
      uploadDriverImage(req as any, res as any, (err: unknown) => (err ? reject(err) : resolve()));
    });
  await runUpload();

  const id = req.driver?._id;
  if (!id) throw new AppError({ en: 'Unauthorized', de: 'Nicht autorisiert' }, 401, 'UNAUTHORIZED');

  const driver = await Driver.findById(id);
  if (!driver || driver.status === 'deleted') {
    throw new AppError({ en: 'Driver not found', de: 'Fahrer nicht gefunden' }, 404, 'NOT_FOUND');
  }

  const { name, phone, vehicleType, vehicleNumber } = req.body ?? {};

  if (name !== undefined) driver.name = String(name).trim() || driver.name;
  if (phone !== undefined) driver.phone = normalizePhone(phone);

  if (vehicleType !== undefined) {
    const vt = String(vehicleType).trim().toLowerCase();
    // Backward compat for the prompt enum: map bicycle -> bike (schema enum does not include bicycle).
    const mapped = vt === 'bicycle' ? 'bike' : vt;
    const allowed = ['bike', 'car', 'scooter', 'van'];
    if (!allowed.includes(mapped)) {
      throw new AppError(
        { en: 'Invalid vehicleType', de: 'Ungültiger vehicleType' },
        400,
        'VALIDATION_ERROR'
      );
    }
    (driver as any).vehicleType = mapped;
  }

  if (vehicleNumber !== undefined) {
    (driver as any).vehicleNumber = String(vehicleNumber).trim().toUpperCase();
  }

  const file = req.file as Express.Multer.File | undefined;
  if (file?.filename) {
    if (driver.profileImage) deleteLocalFile(driver.profileImage);
    driver.profileImage = getFileUrl(file, 'drivers');
  }

  await driver.save();
  const out = driver.toObject();
  return sendSuccess(res, toProfileShape(out));
});

/** POST /api/v1/driver/profile/fcm-token */
export const registerFcmToken = asyncHandler(async (req: Request, res: Response) => {
  const id = req.driver?._id;
  if (!id) throw new AppError({ en: 'Unauthorized', de: 'Nicht autorisiert' }, 401, 'UNAUTHORIZED');

  const { token, device } = req.body ?? {};
  const tokenStr = token != null ? String(token).trim() : '';
  if (!tokenStr) {
    throw new AppError({ en: 'token is required', de: 'token erforderlich' }, 400, 'VALIDATION_ERROR');
  }

  const driver = await Driver.findById(id);
  if (!driver || driver.status === 'deleted') {
    throw new AppError({ en: 'Driver not found', de: 'Fahrer nicht gefunden' }, 404, 'NOT_FOUND');
  }

  const now = new Date();
  const fcmTokens = ((driver as any).fcmTokens ?? []) as Array<{ token: string; device?: string | null; updatedAt?: Date }>;
  const existing = fcmTokens.find((t) => t.token === tokenStr);
  if (existing) {
    existing.updatedAt = now;
    if (device !== undefined) existing.device = device != null ? String(device) : null;
  } else {
    fcmTokens.push({ token: tokenStr, device: device != null ? String(device) : null, updatedAt: now });
  }

  // Max 5 tokens: remove oldest by updatedAt
  if (fcmTokens.length > 5) {
    fcmTokens.sort((a, b) => (a.updatedAt?.getTime?.() ?? 0) - (b.updatedAt?.getTime?.() ?? 0));
    while (fcmTokens.length > 5) fcmTokens.shift();
  }

  (driver as any).fcmTokens = fcmTokens;
  await driver.save();

  return sendSuccess(res, { message: 'FCM token registered' });
});

/** DELETE /api/v1/driver/profile/fcm-token */
export const removeFcmToken = asyncHandler(async (req: Request, res: Response) => {
  const id = req.driver?._id;
  if (!id) throw new AppError({ en: 'Unauthorized', de: 'Nicht autorisiert' }, 401, 'UNAUTHORIZED');

  const { token } = req.body ?? {};
  const tokenStr = token != null ? String(token).trim() : '';
  if (!tokenStr) {
    throw new AppError({ en: 'token is required', de: 'token erforderlich' }, 400, 'VALIDATION_ERROR');
  }

  const driver = await Driver.findById(id);
  if (!driver || driver.status === 'deleted') {
    throw new AppError({ en: 'Driver not found', de: 'Fahrer nicht gefunden' }, 404, 'NOT_FOUND');
  }

  const fcmTokens = ((driver as any).fcmTokens ?? []) as Array<{ token: string }>;
  (driver as any).fcmTokens = fcmTokens.filter((t) => t.token !== tokenStr);
  await driver.save();

  return sendSuccess(res, { message: 'FCM token removed' });
});

/** PATCH /api/v1/driver/profile/status */
export const patchDriverStatus = asyncHandler(async (req: Request, res: Response) => {
  const id = req.driver?._id;
  if (!id) throw new AppError({ en: 'Unauthorized', de: 'Nicht autorisiert' }, 401, 'UNAUTHORIZED');

  const { status } = req.body ?? {};
  if (status !== 'online' && status !== 'offline') {
    throw new AppError(
      { en: "status must be 'online' or 'offline'", de: "status muss 'online' oder 'offline' sein" },
      400,
      'VALIDATION_ERROR'
    );
  }

  const driver = await Driver.findById(id);
  if (!driver || driver.status === 'deleted') {
    throw new AppError({ en: 'Driver not found', de: 'Fahrer nicht gefunden' }, 404, 'NOT_FOUND');
  }

  if (driver.approvalStatus !== 'approved') {
    throw new AppError(
      { en: 'Account not approved. Cannot go online.', de: 'Konto nicht genehmigt. Kann nicht online gehen.' },
      422,
      'VALIDATION_ERROR'
    );
  }

  // NOTE: Driver schema `status` is account status (active/blocked/deleted). Online/offline is stored in `isOnline`.
  const nextIsOnline = status === 'online';
  (driver as any).isOnline = nextIsOnline;
  (driver as any).lastActiveAt = new Date();
  await driver.save();

  const io = getIo(req);
  if (io) {
    io.to('admin').emit('driver:status_changed', {
      driverId: driver._id.toString(),
      name: driver.name ?? '',
      status,
      updatedAt: new Date().toISOString(),
    });
  }

  return sendSuccess(res, { status });
});

