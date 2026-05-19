import type { Request, Response } from 'express';
import { Driver } from '../models/Driver';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/response';
import { type DriverDocument } from '../models/Driver';
import { getUploadMiddleware, deleteLocalFile, getFileUrl, MAX_FILE_SIZE_10MB } from '../utils/storageProvider';

const uploadDriverImage = getUploadMiddleware('drivers', MAX_FILE_SIZE_10MB);

function normalizePhone(phone: string): string {
  const trimmed = String(phone).trim().replace(/\s/g, '');
  const digitsOnly = trimmed.startsWith('+') ? trimmed.slice(1) : trimmed;
  const cleaned = digitsOnly.replace(/\D/g, '');
  return `+${cleaned}`;
}

/** GET /api/v1/driver/setup/status */
export const getSetupStatus = asyncHandler(async (req: Request, res: Response) => {
  const driver = req.driver as unknown as DriverDocument | undefined;
  if (!driver?._id) throw new AppError({ en: 'Unauthorized', de: 'Nicht autorisiert' }, 401, 'UNAUTHORIZED');

  return sendSuccess(res, {
    approvalStatus: driver.approvalStatus ?? 'pending',
    name: driver.name ?? '',
    profileImage: driver.profileImage ?? null,
  });
});

/** PATCH /api/v1/driver/setup/profile-info (Step 1) */
export const updateProfileInfo = asyncHandler(async (req: Request, res: Response) => {
  const driver = req.driver as unknown as DriverDocument | undefined;
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
    const normalized = normalizePhone(phone);
    // Allow the same phone already bound to this driver; reject only true conflicts.
    if (normalized !== driver.phone) {
      const exists = await Driver.findOne({ phone: normalized, _id: { $ne: driver._id } }).select('_id').lean();
      if (exists) {
        throw new AppError({ en: 'Phone number already in use', de: 'Telefonnummer bereits vergeben' }, 409, 'CONFLICT');
      }
      driver.phone = normalized;
    }
  }

  const file = req.file as Express.Multer.File | undefined;
  if (file?.filename) {
    if (driver.profileImage) deleteLocalFile(driver.profileImage);
    driver.profileImage = getFileUrl(file, 'drivers');
  }

  driver.setupStep = Math.max(driver.setupStep ?? 0, 1);
  await driver.save();

  return sendSuccess(res, {
    name: driver.name ?? '',
    phone: driver.phone ?? '',
    profileImage: driver.profileImage ?? null,
  });
});

