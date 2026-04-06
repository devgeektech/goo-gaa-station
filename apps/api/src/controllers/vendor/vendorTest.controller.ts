import type { Request, Response } from 'express';
import { Vendor } from '../../models/Vendor';
import { findNearbyDrivers } from '../../services/driverAssignmentService';
import { asyncHandler } from '../../utils/asyncHandler';
import { AppError } from '../../utils/AppError';
import { sendSuccess } from '../../utils/response';

/**
 * TEMPORARY — remove when no longer needed.
 * Same nearby-driver query as vendor order accept (findNearbyDrivers).
 */
export const getTestNearbyDrivers = asyncHandler(async (req: Request, res: Response) => {
  const vendorId = (req as Request & { vendor?: { _id: unknown } }).vendor?._id;
  if (!vendorId) throw new AppError({ en: 'Unauthorized', de: 'Nicht autorisiert' }, 401);

  const vendor = await Vendor.findById(vendorId).select('name address').lean();
  if (!vendor) throw new AppError({ en: 'Vendor not found', de: 'Vendor nicht gefunden' }, 404);

  const lat = Number((vendor as { address?: { lat?: number } }).address?.lat);
  const lng = Number((vendor as { address?: { lng?: number } }).address?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new AppError(
      { en: 'Vendor address must have lat/lng', de: 'Vendor-Adresse benötigt lat/lng' },
      400,
      'VALIDATION_ERROR'
    );
  }

  const raw = Number(req.query.radiusKm);
  const radiusKm = Number.isFinite(raw) ? Math.min(50, Math.max(1, raw)) : 5;

  const drivers = await findNearbyDrivers(lat, lng, radiusKm);

  return sendSuccess(res, {
    vendorLat: lat,
    vendorLng: lng,
    radiusKm,
    count: drivers.length,
    drivers,
  });
});
