import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import type { Server as SocketIOServer } from 'socket.io';
import { Vendor } from '../../models/Vendor';
import { AppError } from '../../utils/AppError';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/response';
import { getUploadMiddleware, deleteLocalFile, getFileUrl, MAX_FILE_SIZE_2MB, MAX_FILE_SIZE_5MB } from '../../utils/storageProvider';

type ReqVendor = { _id: mongoose.Types.ObjectId | string };

function getIo(req: Request): SocketIOServer | undefined {
  return (req.app as { get?(key: string): unknown }).get?.('io') as SocketIOServer | undefined;
}

function getVendorId(req: Request): mongoose.Types.ObjectId {
  const v = (req as Request & { vendor?: ReqVendor }).vendor;
  const id = v?._id;
  if (!id) throw new AppError({ en: 'Unauthorized', de: 'Nicht autorisiert' }, 401, 'UNAUTHORIZED');
  return typeof id === 'string' ? new mongoose.Types.ObjectId(id) : id;
}

function normalizePhone(phone: string): string {
  const trimmed = String(phone).trim().replace(/\s/g, '');
  const digitsOnly = trimmed.startsWith('+') ? trimmed.slice(1) : trimmed;
  const cleaned = digitsOnly.replace(/\D/g, '');
  return `+${cleaned}`;
}

function toProfileShape(vendor: any) {
  return {
    _id: vendor?._id,
    name: vendor?.name ?? '',
    phone: vendor?.phone ?? null,
    logo: vendor?.logo ?? null,
    coverImage: vendor?.coverImage ?? null,
    category: vendor?.category ?? vendor?.categoryIds ?? null,
    address: vendor?.address ?? null,
    deliveryTime: vendor?.deliveryTime ?? null,
    minimumOrder: vendor?.minimumOrder ?? null,
    isOpen: vendor?.isOpen ?? null,
    rating: vendor?.rating ?? null,
    operatingHours: vendor?.operatingHours ?? [],
    status: vendor?.status ?? null,
    approvalStatus: vendor?.approvalStatus ?? null,
  };
}

const uploadVendorProfile = getUploadMiddleware('vendors', MAX_FILE_SIZE_5MB).fields([
  { name: 'logo', maxCount: 1 },
  { name: 'coverImage', maxCount: 1 },
]);

/** GET /api/v1/vendor/profile — self profile (approved vendors only via route guards) */
export const getVendorProfile = asyncHandler(async (req: Request, res: Response) => {
  const vendorId = getVendorId(req);

  const vendor = await Vendor.findById(vendorId)
    .populate('categoryIds', '_id name slug icon')
    .select('-password -phoneOtp -phoneOtpExpiry -fcmTokens')
    .lean();
  if (!vendor) throw new AppError({ en: 'Vendor not found', de: 'Anbieter nicht gefunden' }, 404, 'NOT_FOUND');

  // Keep response shape stable for the app: expose `category` even though model uses `categoryIds`.
  const out = { ...(vendor as Record<string, unknown>), category: (vendor as any).categoryIds ?? null };
  return sendSuccess(res, { data: toProfileShape(out) }, 200);
});

/** PATCH /api/v1/vendor/profile — multipart update (approved vendors only via route guards) */
export const patchVendorProfile = asyncHandler(async (req: Request, res: Response) => {
  await new Promise<void>((resolve, reject) => {
    uploadVendorProfile(req as any, res as any, (err: unknown) => (err ? reject(err) : resolve()));
  });

  const vendorId = getVendorId(req);

  const vendor = await Vendor.findById(vendorId);
  if (!vendor) throw new AppError({ en: 'Vendor not found', de: 'Anbieter nicht gefunden' }, 404, 'NOT_FOUND');

  const body = req.body ?? {};
  const $set: Record<string, unknown> = {};

  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (name) $set.name = name;
  }

  if (body.phone !== undefined) {
    const nextPhone = normalizePhone(body.phone);
    const currentPhone = (vendor as any).phone ? normalizePhone((vendor as any).phone) : null;
    if (nextPhone && nextPhone !== currentPhone) {
      const exists = await Vendor.findOne({ phone: nextPhone, _id: { $ne: vendorId } }).select('_id').lean();
      if (exists) {
        throw new AppError({ en: 'Phone number already in use', de: 'Telefonnummer wird bereits verwendet' }, 409, 'DUPLICATE_PHONE');
      }
      $set.phone = nextPhone;
    }
  }

  if (body.deliveryTime !== undefined) {
    const n = Number(body.deliveryTime);
    if (!Number.isNaN(n) && n >= 1) $set.deliveryTime = n;
    else throw new AppError({ en: 'deliveryTime must be >= 1', de: 'deliveryTime muss >= 1 sein' }, 400, 'VALIDATION_ERROR');
  }

  if (body.minimumOrder !== undefined) {
    const n = Number(body.minimumOrder);
    if (!Number.isNaN(n) && n >= 0) $set.minimumOrder = n;
    else throw new AppError({ en: 'minimumOrder must be >= 0', de: 'minimumOrder muss >= 0 sein' }, 400, 'VALIDATION_ERROR');
  }

  if (body.address !== undefined) {
    try {
      const parsed = typeof body.address === 'string' ? JSON.parse(body.address) : body.address;
      const street = parsed?.street != null ? String(parsed.street).trim() : null;
      const city = parsed?.city != null ? String(parsed.city).trim() : null;
      const lat = parsed?.lat != null ? Number(parsed.lat) : null;
      const lng = parsed?.lng != null ? Number(parsed.lng) : null;
      $set.address = {
        ...(vendor as any).address,
        ...(street ? { street } : {}),
        ...(city ? { city } : {}),
        ...(Number.isFinite(lat) ? { lat } : {}),
        ...(Number.isFinite(lng) ? { lng } : {}),
      };
    } catch {
      throw new AppError({ en: 'address must be valid JSON', de: 'address muss gültiges JSON sein' }, 400, 'VALIDATION_ERROR');
    }
  }

  const files = (req.files ?? {}) as Record<string, Express.Multer.File[]>;
  const logoFile = files.logo?.[0];
  const coverFile = files.coverImage?.[0];

  if (logoFile?.size != null && logoFile.size > MAX_FILE_SIZE_2MB) {
    throw new AppError({ en: 'Logo file too large (max 2MB)', de: 'Logo zu groß (max 2MB)' }, 413, 'FILE_TOO_LARGE');
  }

  if (logoFile) {
    const prev = (vendor as any).logo;
    if (prev) deleteLocalFile(prev);
    $set.logo = getFileUrl(logoFile, 'vendors');
  }

  if (coverFile) {
    const prev = (vendor as any).coverImage;
    if (prev) deleteLocalFile(prev);
    $set.coverImage = getFileUrl(coverFile, 'vendors');
  }

  if (Object.keys($set).length > 0) {
    await Vendor.updateOne({ _id: vendorId }, { $set });
  }

  const updated = await Vendor.findById(vendorId)
    .populate('categoryIds', '_id name slug icon')
    .select('-password -phoneOtp -phoneOtpExpiry -fcmTokens')
    .lean();
  if (!updated) throw new AppError({ en: 'Vendor not found', de: 'Anbieter nicht gefunden' }, 404, 'NOT_FOUND');
  const out = { ...(updated as Record<string, unknown>), category: (updated as any).categoryIds ?? null };
  return sendSuccess(res, { data: toProfileShape(out) }, 200);
});

/** PATCH /api/v1/vendor/profile/toggle — flip manual open/closed state */
export const toggleVendorOpenStatus = asyncHandler(async (req: Request, res: Response) => {
  const vendorId = getVendorId(req);
  const vendor = await Vendor.findById(vendorId);
  if (!vendor) throw new AppError({ en: 'Vendor not found', de: 'Anbieter nicht gefunden' }, 404, 'NOT_FOUND');

  vendor.isOpen = !vendor.isOpen;
  vendor.updatedAt = new Date();
  await vendor.save();

  const io = getIo(req);
  if (io) {
    io.to('admin').emit('vendor:availability_changed', {
      vendorId: vendor._id,
      vendorName: vendor.name,
      isOpen: vendor.isOpen,
      updatedAt: vendor.updatedAt,
    });
  }

  return sendSuccess(res, { isOpen: vendor.isOpen, updatedAt: vendor.updatedAt }, 200);
});

/** PATCH /api/v1/vendor/profile/operating-hours — replace full 7-day schedule */
export const patchVendorOperatingHours = asyncHandler(async (req: Request, res: Response) => {
  const vendorId = getVendorId(req);
  const operatingHours = (req.body ?? {}).operatingHours;
  const VALID_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

  if (!Array.isArray(operatingHours) || operatingHours.length !== 7) {
    return res.status(422).json({ message: 'operatingHours must be an array of exactly 7 days' });
  }

  const submittedDays = operatingHours.map((d) => d?.day);
  const missingDays = VALID_DAYS.filter((d) => !submittedDays.includes(d));
  if (missingDays.length > 0) {
    return res.status(422).json({ message: 'All 7 days must be included', missing: missingDays });
  }

  const timeRegex = /^\d{2}:\d{2}$/;
  const sanitisedArray: Array<{ day: string; isOpen: boolean; from: string | null; to: string | null }> = [];

  for (const entry of operatingHours as Array<{ day?: unknown; isOpen?: unknown; from?: unknown; to?: unknown }>) {
    const day = String(entry.day ?? '');
    const isOpen = entry.isOpen;

    if (!VALID_DAYS.includes(day as (typeof VALID_DAYS)[number])) {
      return res.status(422).json({ message: `Invalid day: ${day}` });
    }
    if (typeof isOpen !== 'boolean') {
      return res.status(422).json({ message: `isOpen must be boolean for ${day}` });
    }

    if (isOpen) {
      const from = entry.from != null ? String(entry.from) : '';
      const to = entry.to != null ? String(entry.to) : '';
      if (!timeRegex.test(from) || !timeRegex.test(to)) {
        return res.status(422).json({ message: `Invalid time format for ${day}` });
      }
      sanitisedArray.push({ day, isOpen: true, from, to });
    } else {
      sanitisedArray.push({ day, isOpen: false, from: null, to: null });
    }
  }

  const updated = await Vendor.findByIdAndUpdate(
    vendorId,
    { $set: { operatingHours: sanitisedArray } },
    { new: true, select: 'operatingHours' }
  ).lean();

  if (!updated) throw new AppError({ en: 'Vendor not found', de: 'Anbieter nicht gefunden' }, 404, 'NOT_FOUND');

  return res.status(200).json({ operatingHours: (updated as { operatingHours?: unknown[] }).operatingHours ?? [] });
});

