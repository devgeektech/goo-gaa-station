import type { Request, Response } from 'express';
import multer from 'multer';
import type { Server as SocketIOServer } from 'socket.io';

import { Admin } from '../models/Admin';
import { Driver } from '../models/Driver';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/response';
import { deleteLocalFile, getFileUrl, getUploadMiddlewareKyc } from '../utils/storageProvider';
import { sendToMultiple } from '../services/fcm.service';

const DRIVER_KYC_MIMES = ['image/jpeg', 'image/png', 'application/pdf'] as const;
const DRIVER_KYC_FOLDER = 'driver-kyc';
const DRIVER_KYC_MAX_FILE = 5 * 1024 * 1024;

function getIo(req: Request): SocketIOServer | undefined {
  return (req.app as { get?(key: string): unknown }).get?.('io') as SocketIOServer | undefined;
}

function deleteKycFilesUrls(urls: string | string[] | null | undefined): void {
  if (!urls) return;
  const list = Array.isArray(urls) ? urls : [urls];
  for (const u of list) {
    if (typeof u === 'string' && u) deleteLocalFile(u);
  }
}

const driverKycUpload = getUploadMiddlewareKyc(DRIVER_KYC_FOLDER, DRIVER_KYC_MAX_FILE, {
  allowedMimes: [...DRIVER_KYC_MIMES],
}).fields([
  { name: 'driversLicense', maxCount: 1 },
  { name: 'nationalId', maxCount: 10 },
  { name: 'vehiclePhotos', maxCount: 10 },
]);

function runDriverKycUpload(req: Request, res: Response): Promise<void> {
  return new Promise((resolve, reject) => {
    driverKycUpload(req, res, (err: unknown) => {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        reject(
          new AppError(
            {
              en: 'Each file must be under 5MB',
              de: 'Jede Datei muss unter 5 MB sein',
            },
            413,
            'FILE_TOO_LARGE'
          )
        );
        return;
      }
      if (err) reject(err as Error);
      else resolve();
    });
  });
}

type KycDocumentsShape = {
  driversLicense: string | null;
  nationalId: string[];
  vehiclePhotos: string[];
};

function defaultKycDocuments(): KycDocumentsShape {
  return {
    driversLicense: null,
    nationalId: [],
    vehiclePhotos: [],
  };
}

/** GET /api/v1/driver/kyc/status */
export const getKycStatus = asyncHandler(async (req: Request, res: Response) => {
  const id = req.driver?._id;
  if (!id) throw new AppError({ en: 'Unauthorized', de: 'Nicht autorisiert' }, 401, 'UNAUTHORIZED');

  const driver = await Driver.findById(id)
    .select('name phone profileImage vehicleType vehicleNumber approvalStatus kycStatus kycRejectionReason kycSubmittedAt kycDocuments')
    .lean();
  if (!driver) throw new AppError({ en: 'Driver not found', de: 'Fahrer nicht gefunden' }, 404, 'NOT_FOUND');

  const raw = (driver as { kycDocuments?: Partial<KycDocumentsShape> }).kycDocuments;
  const kycDocuments: KycDocumentsShape = {
    driversLicense: raw?.driversLicense ?? null,
    nationalId: Array.isArray(raw?.nationalId) ? raw.nationalId : [],
    vehiclePhotos: Array.isArray(raw?.vehiclePhotos) ? raw.vehiclePhotos : [],
  };

  return sendSuccess(res, {
    name: (driver as { name?: string }).name ?? '',
    phone: (driver as { phone?: string }).phone ?? '',
    profileImage: (driver as { profileImage?: string | null }).profileImage ?? null,
    vehicleType: (driver as { vehicleType?: string | null }).vehicleType ?? null,
    vehicleNumber: (driver as { vehicleNumber?: string | null }).vehicleNumber ?? null,
    approvalStatus: (driver as { approvalStatus?: string }).approvalStatus ?? 'pending',
    kycStatus: (driver as { kycStatus?: string }).kycStatus ?? 'not_submitted',
    kycRejectionReason: (driver as { kycRejectionReason?: string | null }).kycRejectionReason ?? null,
    kycSubmittedAt: (driver as { kycSubmittedAt?: Date | null }).kycSubmittedAt ?? null,
    kycDocuments,
  });
});

/** POST /api/v1/driver/kyc/upload */
export const postKycUpload = asyncHandler(async (req: Request, res: Response) => {
  const id = req.driver?._id;
  if (!id) throw new AppError({ en: 'Unauthorized', de: 'Nicht autorisiert' }, 401, 'UNAUTHORIZED');

  await runDriverKycUpload(req, res);

  const files = req.files as Record<string, Express.Multer.File[]> | undefined;
  const vehicleTypeRaw = String(req.body?.vehicleType ?? '').trim().toLowerCase();
  const vehicleNumberRaw = String(req.body?.vehicleNumber ?? '').trim().toUpperCase();
  const vehicleType = vehicleTypeRaw === 'bicycle' ? 'bike' : vehicleTypeRaw;
  const allowedVehicleTypes = ['bike', 'car', 'scooter', 'van'];
  const driversLicenseFiles = files?.driversLicense ?? [];
  const nationalIdFiles = files?.nationalId ?? [];
  const vehiclePhotosFiles = files?.vehiclePhotos ?? [];

  const missing: string[] = [];
  if (!vehicleType) missing.push('vehicleType');
  if (!vehicleNumberRaw) missing.push('vehicleNumber');
  if (driversLicenseFiles.length < 1) missing.push('driversLicense');
  if (nationalIdFiles.length < 1) missing.push('nationalId');
  if (vehiclePhotosFiles.length < 1) missing.push('vehiclePhotos');

  if (missing.length > 0) {
    for (const f of [...driversLicenseFiles, ...nationalIdFiles, ...vehiclePhotosFiles]) {
      deleteLocalFile(getFileUrl(f, DRIVER_KYC_FOLDER));
    }
    throw new AppError(
      {
        en: 'All three documents are required',
        de: 'Alle drei Dokumente sind erforderlich',
      },
      422,
      'VALIDATION_ERROR',
      { missing }
    );
  }
  if (!allowedVehicleTypes.includes(vehicleType)) {
    for (const f of [...driversLicenseFiles, ...nationalIdFiles, ...vehiclePhotosFiles]) {
      deleteLocalFile(getFileUrl(f, DRIVER_KYC_FOLDER));
    }
    throw new AppError(
      {
        en: 'vehicleType must be one of: bike, car, scooter, van',
        de: 'vehicleType muss einer von: bike, car, scooter, van sein',
      },
      400,
      'VALIDATION_ERROR'
    );
  }

  const driver = await Driver.findById(id);
  if (!driver || driver.status === 'deleted') {
    throw new AppError({ en: 'Driver not found', de: 'Fahrer nicht gefunden' }, 404, 'NOT_FOUND');
  }

  const prev = (driver as { kycDocuments?: Record<string, unknown> }).kycDocuments as
    | {
        driversLicense?: string | null;
        nationalId?: string[];
        vehiclePhotos?: string[];
      }
    | undefined;
  if (prev?.driversLicense) deleteLocalFile(prev.driversLicense);
  if (prev?.nationalId?.length) deleteKycFilesUrls(prev.nationalId);
  if (prev?.vehiclePhotos?.length) deleteKycFilesUrls(prev.vehiclePhotos);

  const driversLicenseUrl = getFileUrl(driversLicenseFiles[0]!, DRIVER_KYC_FOLDER);
  const nationalIdUrls = nationalIdFiles.map((f) => getFileUrl(f, DRIVER_KYC_FOLDER));
  const vehiclePhotoUrls = vehiclePhotosFiles.map((f) => getFileUrl(f, DRIVER_KYC_FOLDER));

  const submittedAt = new Date();
  (driver as any).kycDocuments = {
    driversLicense: driversLicenseUrl,
    nationalId: nationalIdUrls,
    vehiclePhotos: vehiclePhotoUrls,
  };
  (driver as any).kycStatus = 'pending';
  (driver as any).kycSubmittedAt = submittedAt;
  (driver as any).kycRejectionReason = null;
  (driver as any).vehicleType = vehicleType;
  (driver as any).vehicleNumber = vehicleNumberRaw;
  (driver as any).setupStep = Math.max((driver as any).setupStep ?? 0, 2);

  await driver.save();

  const io = getIo(req);
  if (io) {
    io.to('admin').emit('driver:kyc_submitted', {
      driverId: driver._id.toString(),
      name: driver.name ?? '',
      phone: driver.phone ?? '',
      submittedAt: submittedAt.toISOString(),
    });
  }

  const admins = await Admin.find({ isActive: true }).select('fcmTokens').lean();
  const adminTokens: string[] = [];
  for (const a of admins) {
    const tokens = (a as { fcmTokens?: Array<{ token?: string }> }).fcmTokens ?? [];
    for (const t of tokens) {
      if (t?.token?.trim()) adminTokens.push(t.token.trim());
    }
  }
  if (adminTokens.length > 0) {
    const driverName = driver.name ?? 'A driver';
    await sendToMultiple(adminTokens, {
      title: 'New KYC Submission',
      body: `${driverName} has submitted KYC documents.`,
      data: { driverId: String(driver._id), type: 'driver_kyc_submitted' },
    });
  }

  return sendSuccess(res, {
    message: 'Documents submitted successfully',
    vehicleType,
    vehicleNumber: vehicleNumberRaw,
    kycStatus: 'pending' as const,
    kycSubmittedAt: submittedAt,
  });
});

/** PATCH /api/v1/driver/kyc/resubmit */
export const patchKycResubmit = asyncHandler(async (req: Request, res: Response) => {
  const id = req.driver?._id;
  if (!id) throw new AppError({ en: 'Unauthorized', de: 'Nicht autorisiert' }, 401, 'UNAUTHORIZED');

  const driver = await Driver.findById(id);
  if (!driver || driver.status === 'deleted') {
    throw new AppError({ en: 'Driver not found', de: 'Fahrer nicht gefunden' }, 404, 'NOT_FOUND');
  }

  if ((driver as { kycStatus?: string }).kycStatus !== 'rejected') {
    throw new AppError(
      {
        en: 'Resubmission only allowed after rejection',
        de: 'Erneute Einreichung nur nach Ablehnung möglich',
      },
      422,
      'VALIDATION_ERROR'
    );
  }

  (driver as any).kycStatus = 'not_submitted';
  (driver as any).kycRejectionReason = null;
  await driver.save();

  return sendSuccess(res, { kycStatus: 'not_submitted' });
});
