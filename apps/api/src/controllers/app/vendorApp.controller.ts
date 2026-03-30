import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Vendor } from '../../models/Vendor';
import { Product } from '../../models/Product';
import { User } from '../../models/User';
import { AppError } from '../../utils/AppError';
import { sendSuccess } from '../../utils/response';
import { asyncHandler } from '../../utils/asyncHandler';
import { parsePagination } from '../../utils/pagination';
import { getDistanceMatrixEstimates } from '../../services/googleDistanceMatrix.service';
import { haversineKm } from '../../utils/haversine';

function getFallbackEtaMinutes(vendor: any): number | null {
  const raw = Number(vendor?.deliveryTime);
  return Number.isFinite(raw) && raw > 0 ? raw : null;
}

/** Customer origin for Distance Matrix: optional query `customerLat`/`customerLng` (WGS84). */
function parseCustomerOriginFromQuery(req: Request): { lat: number; lng: number } | null {
  const q = req.query;
  const latRaw = q.customerLat;
  const lngRaw = q.customerLng;
  if (latRaw == null || lngRaw == null || latRaw === '' || lngRaw === '') return null;
  const lat = Number(latRaw);
  const lng = Number(lngRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

/** GET /api/v1/app/vendors — List vendors (active only), filter by category, search, optional filters/sort */
export const listVendors = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit } = parsePagination(req.query, 10);
  const search = String(req.query.search || '').trim();
  const categoryId = req.query.category as string | undefined;
  const sortQ = String(req.query.sort || 'recommended').trim();

  const filter: Record<string, unknown> = { status: 'active' };
  if (categoryId && mongoose.Types.ObjectId.isValid(categoryId)) {
    filter.categoryIds = new mongoose.Types.ObjectId(categoryId);
  }
  if (search) {
    (filter as Record<string, unknown>).name = { $regex: search, $options: 'i' };
  }

  const minRating = req.query.minRating != null && req.query.minRating !== '' ? Number(req.query.minRating) : NaN;
  const maxDeliveryTime = req.query.maxDeliveryTime != null && req.query.maxDeliveryTime !== '' ? Number(req.query.maxDeliveryTime) : NaN;
  const minPrice = req.query.minPrice != null && req.query.minPrice !== '' ? Number(req.query.minPrice) : NaN;
  const maxPrice = req.query.maxPrice != null && req.query.maxPrice !== '' ? Number(req.query.maxPrice) : NaN;
  if (!Number.isNaN(minRating) && Vendor.schema.paths.rating) (filter as Record<string, unknown>).rating = { $gte: minRating };
  if (!Number.isNaN(maxDeliveryTime) && Vendor.schema.paths.deliveryTime) {
    // Backward-compatible: keep vendors that don't yet have deliveryTime stored.
    (filter as Record<string, unknown>).$or = [
      { deliveryTime: { $lte: maxDeliveryTime } },
      { deliveryTime: { $exists: false } },
      { deliveryTime: null },
    ];
  }
  if (Vendor.schema.paths.minimumOrder) {
    const cond: Record<string, number> = {};
    if (!Number.isNaN(minPrice)) cond.$gte = minPrice;
    if (!Number.isNaN(maxPrice)) cond.$lte = maxPrice;
    if (Object.keys(cond).length > 0) (filter as Record<string, unknown>).minimumOrder = cond;
  }

  let sort: Record<string, 1 | -1> = { createdAt: -1, sortOrder: 1, name: 1 };
  if (sortQ === 'rating' && Vendor.schema.paths.rating) sort = { rating: -1, sortOrder: 1, name: 1 };
  else if (sortQ === 'deliveryTime' && Vendor.schema.paths.deliveryTime) sort = { deliveryTime: 1, sortOrder: 1, name: 1 };
  else if (sortQ === 'recommended') sort = { createdAt: -1, sortOrder: 1, name: 1 };
  else if (sortQ === 'rating' || sortQ === 'deliveryTime') sort = { sortOrder: 1, name: 1 };

  // Distance Matrix origin: (1) query customerLat/customerLng, (2) else logged-in user's preferred address.
  let customerCoords: { lat: number; lng: number } | null = parseCustomerOriginFromQuery(req);
  if (!customerCoords && req.user?.model === 'User' && mongoose.Types.ObjectId.isValid(req.user._id)) {
    const user = (await (User as any).findById(req.user._id).select('addresses').lean()) as
      | { addresses?: Array<{ lat?: number | null; lng?: number | null; isDefault?: boolean; preferred?: boolean }> }
      | null;
    const addresses = user?.addresses ?? [];
    const preferred = addresses.find((a) => a?.isDefault || a?.preferred) ?? addresses[0];
    const lat = preferred?.lat;
    const lng = preferred?.lng;
    if (typeof lat === 'number' && Number.isFinite(lat) && typeof lng === 'number' && Number.isFinite(lng)) {
      customerCoords = { lat, lng };
    }
  }

  // If customer coords are provided, we need to filter/sort by distance BEFORE pagination,
  // otherwise we can miss vendors that are within the radius but outside the paged slice.
  const shouldApplyRadius = Boolean(customerCoords);

  let [vendors, total] = await Promise.all([
    Vendor.find(filter)
      .select('name slug description logo coverImage address categoryIds sortOrder deliveryTime')
      .populate('categoryIds', '_id name slug icon')
      .lean()
      .sort(sort)
      .skip(shouldApplyRadius ? 0 : (page - 1) * limit)
      .limit(shouldApplyRadius ? 0 : limit),
    Vendor.countDocuments(filter),
  ]);

  // If customer coords are provided, restrict to 30km radius and sort by nearest first.
  // Uses straight-line (Haversine) distance for fast filtering/sorting.
  const MAX_RADIUS_KM = 30;
  if (customerCoords) {
    const withKm = (vendors as any[])
      .map((v) => {
        const lat = v?.address?.lat;
        const lng = v?.address?.lng;
        if (typeof lat !== 'number' || !Number.isFinite(lat) || typeof lng !== 'number' || !Number.isFinite(lng)) return null;
        const km = haversineKm(customerCoords.lat, customerCoords.lng, lat, lng);
        return { v, km };
      })
      .filter(Boolean) as Array<{ v: any; km: number }>;

    const within = withKm.filter((x) => x.km <= MAX_RADIUS_KM).sort((a, b) => a.km - b.km);
    total = within.length;
    const start = Math.max(0, (page - 1) * limit);
    const end = start + limit;
    vendors = within.slice(start, end).map((x) => x.v);
  }

  if (customerCoords) {
    const destinations = vendors.map((v: any) => ({ lat: v?.address?.lat, lng: v?.address?.lng }));
    const validDestinations = destinations.map((d) =>
      typeof d.lat === 'number' && Number.isFinite(d.lat) && typeof d.lng === 'number' && Number.isFinite(d.lng)
        ? { lat: d.lat, lng: d.lng }
        : null
    );

    const mapIndexToDestIndex: number[] = [];
    const compactDestinations: Array<{ lat: number; lng: number }> = [];
    for (let i = 0; i < validDestinations.length; i++) {
      const d = validDestinations[i];
      if (!d) continue;
      mapIndexToDestIndex[i] = compactDestinations.length;
      compactDestinations.push(d);
    }

    try {
      const compactResults = await getDistanceMatrixEstimates({ origin: customerCoords, destinations: compactDestinations });
      for (let i = 0; i < vendors.length; i++) {
        const destIdx = mapIndexToDestIndex[i];
        const r = destIdx !== undefined ? compactResults[destIdx] : null;
        (vendors as any)[i].estimatedTime = r?.durationMinutes ?? getFallbackEtaMinutes((vendors as any)[i]);
        (vendors as any)[i].distance = r?.distanceText ?? null;
      }
    } catch {
      for (let i = 0; i < vendors.length; i++) {
        (vendors as any)[i].estimatedTime = getFallbackEtaMinutes((vendors as any)[i]);
        (vendors as any)[i].distance = null;
      }
    }
  } else {
    for (let i = 0; i < vendors.length; i++) {
      (vendors as any)[i].estimatedTime = getFallbackEtaMinutes((vendors as any)[i]);
      (vendors as any)[i].distance = null;
    }
  }

  const pages = Math.ceil(total / limit) || 1;
  return sendSuccess(res, { vendors, total, page, pages });
});

/** GET /api/v1/app/vendors/:id — Vendor detail with products (active only) */
export const getVendor = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id;
  const vendor = await Vendor.findOne({ _id: id, status: 'active' })
    .populate('categoryIds', '_id name slug icon')
    .lean();
  if (!vendor) {
    throw new AppError({ en: 'Vendor not found', de: 'Anbieter nicht gefunden' }, 404, 'NOT_FOUND');
  }
  const products = await Product.find({
    vendor: new mongoose.Types.ObjectId(id),
    isDeleted: false,
    isAvailable: true,
  })
    .select('_id name description price image category isAvailable sortOrder')
    .populate('category', '_id name')
    .lean()
    .sort({ sortOrder: 1 });
  return sendSuccess(res, { vendor, products });
});
