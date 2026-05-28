import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Banner } from '../../models/Banner';
import { AppError } from '../../utils/AppError';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/response';
import {
  deleteLocalFile,
  getFileUrl,
  getUploadMiddleware,
  MAX_FILE_SIZE_10MB,
} from '../../utils/storageProvider';

const uploadBannerImage = getUploadMiddleware('banners', MAX_FILE_SIZE_10MB);

function toPositiveInt(value: unknown): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) {
    throw new AppError(
      { en: 'position must be a positive integer', de: 'position muss eine positive Ganzzahl sein' },
      400,
      'VALIDATION_ERROR'
    );
  }
  return n;
}

function assertValidHttpUrl(raw: unknown, field: string): string {
  const url = String(raw ?? '').trim();
  if (!url) {
    throw new AppError(
      { en: `${field} is required`, de: `${field} ist erforderlich` },
      400,
      'VALIDATION_ERROR'
    );
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('invalid protocol');
    }
    return parsed.toString();
  } catch {
    throw new AppError(
      { en: `${field} must be a valid URL`, de: `${field} muss eine gültige URL sein` },
      400,
      'VALIDATION_ERROR'
    );
  }
}

async function ensurePositionAvailable(position: number, excludeId?: string): Promise<void> {
  const filter: Record<string, unknown> = { position };
  if (excludeId) filter._id = { $ne: new mongoose.Types.ObjectId(excludeId) };
  const existing = await Banner.findOne(filter).select('_id').lean();
  if (existing) {
    throw new AppError(
      { en: 'Banner position already in use', de: 'Banner-Position wird bereits verwendet' },
      409,
      'POSITION_CONFLICT'
    );
  }
}

/** GET /api/v1/admin/banners */
export const listBanners = asyncHandler(async (_req: Request, res: Response) => {
  const banners = await Banner.find({})
    .sort({ position: 1, createdAt: -1 })
    .lean();
  return sendSuccess(res, banners);
});

/** POST /api/v1/admin/banners */
export const createBanner = asyncHandler(async (req: Request, res: Response) => {
  await new Promise<void>((resolve, reject) => {
    uploadBannerImage.single('image')(req as any, res as any, (err: unknown) => (err ? reject(err) : resolve()));
  });

  const heading = String(req.body?.heading ?? '').trim();
  const text = String(req.body?.text ?? '').trim();
  const buttonText = String(req.body?.buttonText ?? '').trim();
  const buttonUrl = assertValidHttpUrl(req.body?.buttonUrl, 'buttonUrl');
  const position = toPositiveInt(req.body?.position);
  const isActive = req.body?.isActive !== undefined ? String(req.body.isActive) === 'true' : true;

  if (!heading || !text || !buttonText) {
    throw new AppError(
      { en: 'heading, text and buttonText are required', de: 'heading, text und buttonText sind erforderlich' },
      400,
      'VALIDATION_ERROR'
    );
  }

  if (!req.file) {
    throw new AppError({ en: 'image is required', de: 'image ist erforderlich' }, 400, 'VALIDATION_ERROR');
  }

  await ensurePositionAvailable(position);

  const banner = await Banner.create({
    image: getFileUrl(req.file, 'banners'),
    heading,
    text,
    buttonText,
    buttonUrl,
    position,
    isActive,
  });

  return sendSuccess(res, banner.toObject(), 201);
});

/** PATCH /api/v1/admin/banners/:id */
export const updateBanner = asyncHandler(async (req: Request, res: Response) => {
  await new Promise<void>((resolve, reject) => {
    uploadBannerImage.single('image')(req as any, res as any, (err: unknown) => (err ? reject(err) : resolve()));
  });

  const id = req.params.id;
  const banner = await Banner.findById(id);
  if (!banner) {
    throw new AppError({ en: 'Banner not found', de: 'Banner nicht gefunden' }, 404, 'NOT_FOUND');
  }

  if (req.body?.heading !== undefined) banner.heading = String(req.body.heading).trim();
  if (req.body?.text !== undefined) banner.text = String(req.body.text).trim();
  if (req.body?.buttonText !== undefined) banner.buttonText = String(req.body.buttonText).trim();
  if (req.body?.buttonUrl !== undefined) banner.buttonUrl = assertValidHttpUrl(req.body.buttonUrl, 'buttonUrl');
  if (req.body?.isActive !== undefined) banner.isActive = String(req.body.isActive) === 'true';
  if (req.body?.position !== undefined) {
    const position = toPositiveInt(req.body.position);
    await ensurePositionAvailable(position, id);
    banner.position = position;
  }

  if (req.file) {
    if (banner.image) deleteLocalFile(banner.image);
    banner.image = getFileUrl(req.file, 'banners');
  }

  if (!banner.heading || !banner.text || !banner.buttonText || !banner.buttonUrl) {
    throw new AppError(
      { en: 'heading, text, buttonText and buttonUrl are required', de: 'Pflichtfelder fehlen' },
      400,
      'VALIDATION_ERROR'
    );
  }

  await banner.save();
  return sendSuccess(res, banner.toObject());
});

/** PATCH /api/v1/admin/banners/:id/toggle */
export const toggleBannerStatus = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id;
  const banner = await Banner.findById(id);
  if (!banner) {
    throw new AppError({ en: 'Banner not found', de: 'Banner nicht gefunden' }, 404, 'NOT_FOUND');
  }
  banner.isActive = !banner.isActive;
  await banner.save();
  return sendSuccess(res, banner.toObject());
});

/** DELETE /api/v1/admin/banners/:id */
export const deleteBanner = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id;
  const banner = await Banner.findById(id);
  if (!banner) {
    throw new AppError({ en: 'Banner not found', de: 'Banner nicht gefunden' }, 404, 'NOT_FOUND');
  }
  if (banner.image) deleteLocalFile(banner.image);
  await banner.deleteOne();
  return sendSuccess(res, { success: true });
});
