import type { Request, Response } from 'express';
import { Vendor } from '../models/Vendor';
import { AppError } from '../utils/AppError';
import { sendSuccess } from '../utils/response';
import { asyncHandler } from '../utils/asyncHandler';
import {
  getUploadMiddleware,
  getUploadMiddlewareKyc,
  getFileUrl,
  MAX_FILE_SIZE_2MB,
} from '../utils/storageProvider';
import type { Server as SocketIOServer } from 'socket.io';
import { sendToMultiple } from '../services/fcm.service';
import { Admin } from '../models/Admin';

// Mongoose model typing in this repo is loose; cast for controller usage.
const VendorModel = Vendor as any;
const AdminModel = Admin as any;

const MAX_KYC_SIZE = 5 * 1024 * 1024; // 5MB

const uploadBusinessInfo = getUploadMiddleware('vendors', MAX_FILE_SIZE_2MB).single('logo');
const uploadKyc = getUploadMiddlewareKyc('kyc', MAX_KYC_SIZE).fields([
  { name: 'businessRegistration', maxCount: 1 },
  { name: 'identityDocument', maxCount: 20 },
  { name: 'healthSafetyLicense', maxCount: 1 },
]);

function getIo(req: Request): SocketIOServer | undefined {
  return (req.app as { get?(key: string): unknown }).get?.('io') as SocketIOServer | undefined;
}

/** GET /api/v1/vendor/onboarding/status */
export const getOnboardingStatus = asyncHandler(async (req: Request, res: Response) => {
  const vendor = (req as Request & { vendor?: { _id: unknown; name?: string; onboardingStep?: number; approvalStatus?: string; submittedAt?: Date } }).vendor;
  if (!vendor) throw new AppError({ en: 'Vendor not found', de: 'Anbieter nicht gefunden' }, 404, 'NOT_FOUND');

  const full = await VendorModel.findById(vendor._id)
    .select('name onboardingStep approvalStatus submittedAt rejectionReason')
    .lean();
  if (!full) throw new AppError({ en: 'Vendor not found', de: 'Anbieter nicht gefunden' }, 404, 'NOT_FOUND');

  return sendSuccess(res, {
    onboardingStep: (full as { onboardingStep?: number }).onboardingStep ?? 0,
    approvalStatus: (full as { approvalStatus?: string | null }).approvalStatus ?? null,
    submittedAt: (full as { submittedAt?: Date | null }).submittedAt ?? null,
    name: (full as { name?: string | null }).name ?? null,
    rejectionReason: (full as { rejectionReason?: string | null }).rejectionReason ?? null,
  });
});

/** PATCH /api/v1/vendor/onboarding/business-info — Step 2 */
export const patchBusinessInfo = asyncHandler(async (req: Request, res: Response) => {
  await new Promise<void>((resolve, reject) => {
    uploadBusinessInfo(req as any, res as any, (err: unknown) => (err ? reject(err) : resolve()));
  });

  const vendor = (req as Request & { vendor?: { _id: unknown } }).vendor;
  if (!vendor) throw new AppError({ en: 'Vendor not found', de: 'Anbieter nicht gefunden' }, 404, 'NOT_FOUND');

  const body = req.body ?? {};
  const storeName = String(body.storeName ?? '').trim();
  if (!storeName) throw new AppError({ en: 'storeName is required', de: 'Store-Name erforderlich' }, 400, 'VALIDATION_ERROR');

  let operatingHours: Array<{ day: string; isOpen: boolean; from?: string; to?: string }> = [];
  if (body.operatingHours) {
    try {
      const parsed = typeof body.operatingHours === 'string' ? JSON.parse(body.operatingHours) : body.operatingHours;
      if (Array.isArray(parsed)) operatingHours = parsed;
    } catch {
      // leave default
    }
  }

  const doc = await VendorModel.findById(vendor._id);
  if (!doc) throw new AppError({ en: 'Vendor not found', de: 'Anbieter nicht gefunden' }, 404, 'NOT_FOUND');

  doc.name = storeName;
  doc.description = typeof body.description === 'string' ? body.description.trim() : (doc.description ?? '');
  doc.operatingHours = operatingHours as any;
  const currentStep = doc.onboardingStep ?? 0;
  doc.onboardingStep = Math.max(currentStep, 2);

  const file = req.file as Express.Multer.File | undefined;
  if (file?.filename) doc.logo = getFileUrl(file.filename, 'vendors');
  await doc.save();

  return sendSuccess(res, { message: 'Business info updated', onboardingStep: doc.onboardingStep });
});

/** PATCH /api/v1/vendor/onboarding/address — Step 3 */
export const patchAddress = asyncHandler(async (req: Request, res: Response) => {
  const vendor = (req as Request & { vendor?: { _id: unknown } }).vendor;
  if (!vendor) throw new AppError({ en: 'Vendor not found', de: 'Anbieter nicht gefunden' }, 404, 'NOT_FOUND');

  const body = req.body ?? {};
  const addressLine1 = String(body.addressLine1 ?? '').trim();
  const lat = body.lat != null ? Number(body.lat) : null;
  const lng = body.lng != null ? Number(body.lng) : null;
  if (!addressLine1) throw new AppError({ en: 'addressLine1 is required', de: 'Adresse erforderlich' }, 400, 'VALIDATION_ERROR');
  if (lat == null || lng == null) throw new AppError({ en: 'lat and lng are required', de: 'lat und lng erforderlich' }, 400, 'VALIDATION_ERROR');

  const addressLabel = ['home', 'work', 'other'].includes(String(body.addressLabel ?? '').trim())
    ? String(body.addressLabel).trim()
    : null;

  const update: Record<string, unknown> = {
    'address.street': addressLine1,
    'address.city': body.addressLine2 != null ? String(body.addressLine2).trim() : null,
    'address.landmark': body.landmark != null ? String(body.landmark).trim() : null,
    'address.lat': lat,
    'address.lng': lng,
    'address.addressLabel': addressLabel,
    onboardingStep: Math.max((vendor as { onboardingStep?: number }).onboardingStep ?? 0, 3),
  };

  const doc = await VendorModel.findByIdAndUpdate(
    vendor._id,
    { $set: update },
    { new: true, runValidators: true }
  );
  if (!doc) throw new AppError({ en: 'Vendor not found', de: 'Anbieter nicht gefunden' }, 404, 'NOT_FOUND');

  return sendSuccess(res, { message: 'Address updated', onboardingStep: doc.onboardingStep });
});

/** POST /api/v1/vendor/onboarding/kyc-documents — Step 5 */
export const postKycDocuments = asyncHandler(async (req: Request, res: Response) => {
  await new Promise<void>((resolve, reject) => {
    uploadKyc(req as any, res as any, (err: unknown) => (err ? reject(err) : resolve()));
  });

  const vendor = (req as Request & { vendor?: { _id: unknown } }).vendor;
  if (!vendor) throw new AppError({ en: 'Vendor not found', de: 'Anbieter nicht gefunden' }, 404, 'NOT_FOUND');

  const files = req.files as Record<string, Express.Multer.File[]> | undefined;
  const businessRegistration = files?.businessRegistration?.[0];
  const identityDocuments = files?.identityDocument ?? [];
  const healthSafetyLicense = files?.healthSafetyLicense?.[0];
  if (!businessRegistration?.filename) throw new AppError({ en: 'businessRegistration file is required', de: 'Dokument erforderlich' }, 400, 'VALIDATION_ERROR');
  if (!identityDocuments.length || !identityDocuments.some((f) => f?.filename)) {
    throw new AppError({ en: 'At least one identityDocument file is required', de: 'Mindestens ein Identitätsdokument erforderlich' }, 400, 'VALIDATION_ERROR');
  }

  const identityUrls = identityDocuments.filter((f) => f?.filename).map((f) => getFileUrl(f!.filename, 'kyc'));
  const update: Record<string, string | null | string[]> = {
    'kycDocuments.businessRegistration': getFileUrl(businessRegistration.filename, 'kyc'),
    'kycDocuments.identityDocument': identityUrls,
  };
  if (healthSafetyLicense?.filename) update['kycDocuments.healthSafetyLicense'] = getFileUrl(healthSafetyLicense.filename, 'kyc');

  const doc = await VendorModel.findByIdAndUpdate(
    vendor._id,
    {
      $set: {
        ...update,
        onboardingStep: Math.max((vendor as { onboardingStep?: number }).onboardingStep ?? 0, 5),
      },
    },
    { new: true }
  );
  if (!doc) throw new AppError({ en: 'Vendor not found', de: 'Anbieter nicht gefunden' }, 404, 'NOT_FOUND');

  return sendSuccess(res, { message: 'KYC documents uploaded', onboardingStep: doc.onboardingStep });
});

/** POST /api/v1/vendor/onboarding/submit — Step 6 final */
export const postSubmit = asyncHandler(async (req: Request, res: Response) => {
  const vendor = (req as Request & { vendor?: { _id: unknown } }).vendor;
  if (!vendor) throw new AppError({ en: 'Vendor not found', de: 'Anbieter nicht gefunden' }, 404, 'NOT_FOUND');

  const doc = await VendorModel.findById(vendor._id).lean();
  if (!doc) throw new AppError({ en: 'Vendor not found', de: 'Anbieter nicht gefunden' }, 404, 'NOT_FOUND');

  const step = (doc as { onboardingStep?: number }).onboardingStep ?? 0;
  if (step < 5) {
    const missingSteps: number[] = [];
    for (let i = 2; i <= 5; i++) if (step < i) missingSteps.push(i);
    return res.status(422).json({
      success: false,
      code: 'VALIDATION_ERROR',
      message: { en: 'Complete all steps before submitting', de: 'Bitte alle Schritte abschließen' },
      data: { missingSteps },
      requestId: (req as Request & { requestId?: string }).requestId,
    });
  }

  const submittedAt = new Date();
  await VendorModel.findByIdAndUpdate(vendor._id, {
    $set: {
      approvalStatus: 'pending',
      onboardingStep: 6,
      status: 'pending',
      submittedAt,
    },
  });

  const summary = await VendorModel.findById(vendor._id).select('name phone email approvalStatus submittedAt').lean();
  const io = getIo(req);
  if (io) {
    io.to('admin').emit('vendor:new_submission', summary ?? { _id: vendor._id, approvalStatus: 'pending', submittedAt });
  }

  const admins = await AdminModel.find({ isActive: true }).select('fcmTokens').lean();
  const adminTokens: string[] = [];
  for (const a of admins) {
    const tokens = (a as { fcmTokens?: Array<{ token: string }> }).fcmTokens ?? [];
    for (const t of tokens) if (t?.token?.trim()) adminTokens.push(t.token.trim());
  }
  if (adminTokens.length > 0) {
    await sendToMultiple(adminTokens, {
      title: 'New vendor application',
      body: summary?.name ? `${summary.name} submitted an application.` : 'A new vendor application was submitted.',
      data: { vendorId: String(vendor._id), type: 'vendor_new_submission' },
    });
  }

  return sendSuccess(res, {
    message: 'Application submitted',
    approvalStatus: 'pending',
    submittedAt,
  });
});

/** POST /api/v1/vendor/onboarding/resubmit — Reset approval for re-submission; sets approvalStatus=none, clears rejectionReason, onboardingStep=4; emits vendor:new_submission */
export const postResubmit = asyncHandler(async (req: Request, res: Response) => {
  const vendor = (req as Request & { vendor?: { _id: unknown } }).vendor;
  if (!vendor) throw new AppError({ en: 'Vendor not found', de: 'Anbieter nicht gefunden' }, 404, 'NOT_FOUND');

  const doc = await VendorModel.findByIdAndUpdate(
    vendor._id,
    {
      $set: {
        approvalStatus: 'none',
        onboardingStep: 4,
        rejectionReason: null,
        rejectedAt: null,
        reviewedBy: null,
      },
    },
    { new: true }
  ).select('name phone email approvalStatus submittedAt').lean();
  if (!doc) throw new AppError({ en: 'Vendor not found', de: 'Anbieter nicht gefunden' }, 404, 'NOT_FOUND');

  const io = getIo(req);
  if (io) {
    io.to('admin').emit('vendor:new_submission', { ...doc, resubmit: true });
  }

  const admins = await AdminModel.find({ isActive: true }).select('fcmTokens').lean();
  const adminTokens: string[] = [];
  for (const a of admins) {
    const tokens = (a as { fcmTokens?: Array<{ token: string }> }).fcmTokens ?? [];
    for (const t of tokens) if (t?.token?.trim()) adminTokens.push(t.token.trim());
  }
  if (adminTokens.length > 0) {
    await sendToMultiple(adminTokens, {
      title: 'Vendor resubmission',
      body: (doc as { name?: string }).name ? `${(doc as { name: string }).name} requested re-review.` : 'A vendor requested re-review.',
      data: { vendorId: String(vendor._id), type: 'vendor_resubmit' },
    });
  }

  return sendSuccess(res, {
    message: 'Resubmission started; complete steps 4–6 to submit again',
    approvalStatus: 'none',
    onboardingStep: 4,
  });
});
