import type { Request, Response } from 'express';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/response';
import { type DriverDocument } from '../models/Driver';
import { getUploadMiddleware, deleteLocalFile, getFileUrl, MAX_FILE_SIZE_2MB } from '../utils/storageProvider';

const uploadDriverImage = getUploadMiddleware('drivers', MAX_FILE_SIZE_2MB);

function normalizePhone(phone: string): string {
  const trimmed = String(phone).trim().replace(/\s/g, '');
  const digitsOnly = trimmed.startsWith('+') ? trimmed.slice(1) : trimmed;
  const cleaned = digitsOnly.replace(/\D/g, '');
  return `+${cleaned}`;
}

/** GET /api/v1/driver/setup/status */
export const getSetupStatus = asyncHandler(async (req: Request, res: Response) => {
  const driver = req.driver as DriverDocument | undefined;
  if (!driver?._id) throw new AppError({ en: 'Unauthorized', de: 'Nicht autorisiert' }, 401, 'UNAUTHORIZED');

  return sendSuccess(res, {
    setupStep: driver.setupStep ?? 0,
    approvalStatus: driver.approvalStatus ?? 'pending',
    name: driver.name ?? '',
    profileImage: driver.profileImage ?? null,
  });
});

/** PATCH /api/v1/driver/setup/profile-info (Step 1) */
export const updateProfileInfo = asyncHandler(async (req: Request, res: Response) => {
  const driver = req.driver as DriverDocument | undefined;
  if (!driver?._id) throw new AppError({ en: 'Unauthorized', de: 'Nicht autorisiert' }, 401, 'UNAUTHORIZED');

  // Parse multipart/form-data for profileImage using multer.
  const upload = uploadDriverImage.single('profileImage');
  await new Promise<void>((resolve, reject) => {
    upload(req as any, res as any, (err: unknown) => (err ? reject(err) : resolve()));
  });

  const { name, phone } = req.body ?? {};
  if (!name || typeof name !== 'string') {
    throw new AppError({ en: 'Name is required', de: 'Name erforderlich' }, 400, 'VALIDATION_ERROR');
  }

  driver.name = String(name).trim();

  if (phone !== undefined) {
    if (typeof phone !== 'string') throw new AppError({ en: 'phone must be a string', de: 'phone muss ein String sein' }, 400, 'VALIDATION_ERROR');
    driver.phone = normalizePhone(phone);
  }

  const file = req.file as Express.Multer.File | undefined;
  if (file?.filename) {
    if (driver.profileImage) deleteLocalFile(driver.profileImage);
    driver.profileImage = getFileUrl(file.filename, 'drivers');
  }

  driver.setupStep = Math.max(driver.setupStep ?? 0, 1);
  await driver.save();

  return sendSuccess(res, {
    name: driver.name ?? '',
    phone: driver.phone ?? '',
    profileImage: driver.profileImage ?? null,
    setupStep: driver.setupStep ?? 0,
  });
});

/** PATCH /api/v1/driver/setup/vehicle-info (Step 2) */
export const updateVehicleInfo = asyncHandler(async (req: Request, res: Response) => {
  const driver = req.driver as DriverDocument | undefined;
  if (!driver?._id) throw new AppError({ en: 'Unauthorized', de: 'Nicht autorisiert' }, 401, 'UNAUTHORIZED');

  if ((driver.setupStep ?? 0) < 1) {
    throw new AppError({ en: 'Complete Profile Information first', de: 'Bitte Profilinformationen zuerst vervollständigen' }, 422, 'VALIDATION_ERROR');
  }

  const { vehicleType, vehicleNumber } = req.body ?? {};
  const allowedVehicleTypes = ['bike', 'car', 'scooter', 'bicycle'] as const;

  if (!vehicleType || typeof vehicleType !== 'string' || !allowedVehicleTypes.includes(vehicleType as any)) {
    throw new AppError({ en: 'vehicleType is required and must be valid', de: 'vehicleType ist erforderlich und muss gültig sein' }, 400, 'VALIDATION_ERROR');
  }
  if (!vehicleNumber || typeof vehicleNumber !== 'string') {
    throw new AppError({ en: 'vehicleNumber is required', de: 'vehicleNumber erforderlich' }, 400, 'VALIDATION_ERROR');
  }

  // Schema transform also normalizes, but keep explicit for clarity.
  driver.vehicleType = vehicleType as DriverDocument['vehicleType'];
  driver.vehicleNumber = String(vehicleNumber).trim().toUpperCase();

  driver.setupStep = Math.max(driver.setupStep ?? 0, 2);
  await driver.save();

  return sendSuccess(res, {
    vehicleType: driver.vehicleType ?? null,
    vehicleNumber: driver.vehicleNumber ?? null,
    setupStep: driver.setupStep ?? 0,
  });
});

