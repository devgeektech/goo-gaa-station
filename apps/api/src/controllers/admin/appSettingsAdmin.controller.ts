import type { Request, Response } from 'express';
import { AppError } from '../../utils/AppError';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/response';
import { AppSettings } from '../../models/AppSettings';

async function getOrCreateSettings() {
  const existing = await AppSettings.findOne().lean();
  if (existing) return existing;
  const created = await AppSettings.create({ deliveryFee: 0, taxPercent: 0 });
  return created.toObject();
}

/** GET /api/v1/admin/app-settings */
export const getAppSettings = asyncHandler(async (_req: Request, res: Response) => {
  const settings = await getOrCreateSettings();
  return sendSuccess(res, settings);
});

/** PATCH /api/v1/admin/app-settings */
export const patchAppSettings = asyncHandler(async (req: Request, res: Response) => {
  const { deliveryFee, taxPercent } = req.body ?? {};

  const update: Record<string, unknown> = {};
  if (deliveryFee !== undefined) {
    const n = Number(deliveryFee);
    if (!Number.isFinite(n) || n < 0) throw new AppError({ en: 'deliveryFee must be >= 0', de: 'deliveryFee muss >= 0 sein' }, 400, 'VALIDATION_ERROR');
    update.deliveryFee = n;
  }
  if (taxPercent !== undefined) {
    const n = Number(taxPercent);
    if (!Number.isFinite(n) || n < 0 || n > 100) throw new AppError({ en: 'taxPercent must be 0-100', de: 'taxPercent muss 0-100 sein' }, 400, 'VALIDATION_ERROR');
    update.taxPercent = n;
  }

  const settings = await AppSettings.findOneAndUpdate({}, update, { new: true, upsert: true, setDefaultsOnInsert: true }).lean();
  return sendSuccess(res, settings);
});

