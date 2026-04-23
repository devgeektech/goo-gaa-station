import type { Request, Response } from 'express';
import { AppError } from '../../utils/AppError';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/response';
import { AppSettings } from '../../models/AppSettings';

async function getOrCreateSettings() {
  const existing = await AppSettings.findOne().lean();
  if (existing) return existing;
  const created = await AppSettings.create({});
  return created.toObject();
}

/** GET /api/v1/admin/app-settings */
export const getAppSettings = asyncHandler(async (_req: Request, res: Response) => {
  const settings = await getOrCreateSettings();
  return sendSuccess(res, settings);
});

function assertValidTimezone(tz: string): void {
  try {
    Intl.DateTimeFormat('en-US', { timeZone: tz }).format(new Date());
  } catch {
    throw new AppError({ en: 'Invalid defaultTimezone', de: 'Ungültige Zeitzone' }, 400, 'VALIDATION_ERROR');
  }
}

/** PATCH /api/v1/admin/app-settings */
export const patchAppSettings = asyncHandler(async (req: Request, res: Response) => {
  const { deliveryFee, taxPercent, defaultCurrency, defaultTimezone, serviceZones } = req.body ?? {};

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
  if (defaultCurrency !== undefined) {
    const code = String(defaultCurrency).trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(code)) {
      throw new AppError({ en: 'defaultCurrency must be a 3-letter ISO code', de: 'Währungscode ungültig' }, 400, 'VALIDATION_ERROR');
    }
    update.defaultCurrency = code;
  }
  if (defaultTimezone !== undefined) {
    const tz = String(defaultTimezone).trim();
    if (!tz || tz.length > 80) {
      throw new AppError({ en: 'defaultTimezone is required', de: 'Zeitzone erforderlich' }, 400, 'VALIDATION_ERROR');
    }
    assertValidTimezone(tz);
    update.defaultTimezone = tz;
  }
  if (serviceZones !== undefined) {
    if (!Array.isArray(serviceZones)) {
      throw new AppError({ en: 'serviceZones must be an array of strings', de: 'serviceZones ungültig' }, 400, 'VALIDATION_ERROR');
    }
    const cleaned = serviceZones
      .map((z: unknown) => String(z ?? '').trim())
      .filter(Boolean)
      .map((z) => z.slice(0, 120));
    if (cleaned.length > 80) {
      throw new AppError({ en: 'At most 80 service zones', de: 'Maximal 80 Zonen' }, 400, 'VALIDATION_ERROR');
    }
    update.serviceZones = cleaned;
  }

  const settings = await AppSettings.findOneAndUpdate({}, update, { new: true, upsert: true, setDefaultsOnInsert: true }).lean();
  return sendSuccess(res, settings);
});

