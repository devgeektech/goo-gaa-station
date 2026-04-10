import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Vendor } from '../../models/Vendor';
import { Product } from '../../models/Product';
import { User } from '../../models/User';
import { Category } from '../../models/Category';
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

function toEtaRange(minutes: number | null): string | null {
  if (minutes == null || !Number.isFinite(minutes) || minutes <= 0) return null;
  const base = Math.max(1, Math.round(minutes));
  const min = Math.max(1, base - 2);
  const max = base + 4;
  return `${min}-${max} mins`;
}

function getCurrentDayKey(now: Date): 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun' {
  const days: Array<'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat'> = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  return days[now.getDay()];
}

function toMinutes(hhmm: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isInteger(hh) || !Number.isInteger(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

function isVendorAvailableNow(vendor: any, now: Date): boolean {
  // 1) Global availability
  if (vendor?.isOpen !== true) return false;

  // 2) Operating-hours toggle for today + 3) time window validation
  const dayKey = getCurrentDayKey(now);
  const todays = Array.isArray(vendor?.operatingHours)
    ? vendor.operatingHours.find((x: any) => x?.day === dayKey)
    : null;
  if (!todays || todays?.isOpen !== true) return false;

  const fromMin = toMinutes(String(todays?.from ?? ''));
  const toMin = toMinutes(String(todays?.to ?? ''));
  if (fromMin == null || toMin == null) return false;
  const nowMin = now.getHours() * 60 + now.getMinutes();

  // Supports same-day and overnight windows.
  if (fromMin <= toMin) return nowMin >= fromMin && nowMin <= toMin;
  return nowMin >= fromMin || nowMin <= toMin;
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

function normalizeVendorRating(v: any): void {
  const avg = Number(v?.averageRating);
  const legacy = Number(v?.rating);
  v.rating = Number.isFinite(avg) ? avg : (Number.isFinite(legacy) ? legacy : 0);
  v.averageRating = v.rating;
  v.totalRatings = Number.isFinite(Number(v?.totalRatings)) ? Number(v.totalRatings) : 0;
}

/** GET /api/v1/app/vendors — List vendors (active only), filter by category, search, optional filters/sort */
export const listVendors = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit } = parsePagination(req.query, 10);
  const search = String(req.query.search || '').trim();
  const categoryId = req.query.category as string | undefined;
  const sortQ = String(req.query.sort || 'recommended').trim();

  const filter: Record<string, unknown> = { status: 'active', isOpen: true };
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
  if (!Number.isNaN(minRating)) {
    if (Vendor.schema.paths.averageRating) (filter as Record<string, unknown>).averageRating = { $gte: minRating };
    else if (Vendor.schema.paths.rating) (filter as Record<string, unknown>).rating = { $gte: minRating };
  }
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
  if (sortQ === 'rating' && Vendor.schema.paths.averageRating) sort = { averageRating: -1, sortOrder: 1, name: 1 };
  else if (sortQ === 'rating' && Vendor.schema.paths.rating) sort = { rating: -1, sortOrder: 1, name: 1 };
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
      .select('name slug description logo coverImage address categoryIds sortOrder deliveryTime isOpen operatingHours rating averageRating totalRatings')
      .populate('categoryIds', '_id name slug icon')
      .lean()
      .sort(sort)
      .skip(shouldApplyRadius ? 0 : (page - 1) * limit)
      .limit(shouldApplyRadius ? 0 : limit),
    Vendor.countDocuments(filter),
  ]);

  // Availability checks for customer list:
  // - global isOpen === true
  // - today's operating-hours toggle isOpen === true
  // - current time within from/to
  const now = new Date();
  vendors = (vendors as any[]).filter((v) => isVendorAvailableNow(v, now));
  total = vendors.length;

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
        const etaMinutes = r?.durationMinutes ?? getFallbackEtaMinutes((vendors as any)[i]);
        (vendors as any)[i].estimatedTime = toEtaRange(etaMinutes);
        (vendors as any)[i].distance = r?.distanceText ?? null;
      }
    } catch {
      for (let i = 0; i < vendors.length; i++) {
        (vendors as any)[i].estimatedTime = toEtaRange(getFallbackEtaMinutes((vendors as any)[i]));
        (vendors as any)[i].distance = null;
      }
    }
  } else {
    for (let i = 0; i < vendors.length; i++) {
      (vendors as any)[i].estimatedTime = toEtaRange(getFallbackEtaMinutes((vendors as any)[i]));
      (vendors as any)[i].distance = null;
    }
  }

  // Normalize rating keys for customer-side consumption.
  for (let i = 0; i < vendors.length; i++) {
    normalizeVendorRating((vendors as any)[i]);
  }

  const pages = Math.ceil(total / limit) || 1;
  return sendSuccess(res, { vendors, total, page, pages });
});

/** GET /api/v1/app/vendors/recommended — rating-first recommended list with non-empty fallback */
export const getRecommendedVendors = asyncHandler(async (req: Request, res: Response) => {
  const fallbackLimit = 4;
  const categoryQ = String(req.query.category || '').trim().toLowerCase();

  const filter: Record<string, unknown> = { status: 'active', isOpen: true };
  if (categoryQ && categoryQ !== 'all') {
    // Support category type filter (food/grocery/pharmacy/fashion/retail)
    // and category ObjectId filter for compatibility.
    const isObjectIdCategory = mongoose.Types.ObjectId.isValid(categoryQ);
    if (isObjectIdCategory) {
      filter.categoryIds = new mongoose.Types.ObjectId(categoryQ);
    } else {
      const supportedTypes = ['food', 'grocery', 'pharmacy', 'fashion', 'retail'];
      if (!supportedTypes.includes(categoryQ)) {
        throw new AppError(
          { en: 'Invalid category. Use all, food, grocery, pharmacy, fashion, retail, or category ObjectId', de: 'Ungültige Kategorie' },
          400,
          'VALIDATION_ERROR'
        );
      }
      const matchedCategories = await (Category as any)
        .find({ type: categoryQ, isActive: true, isDeleted: false })
        .select('_id')
        .lean();
      const categoryIds = (matchedCategories as Array<{ _id: mongoose.Types.ObjectId }>).map((c) => c._id);
      filter.categoryIds = { $in: categoryIds };
    }
  }

  const baseQuery = Vendor.find(filter)
    .select('name slug description logo coverImage address categoryIds sortOrder deliveryTime isOpen operatingHours rating averageRating totalRatings')
    .populate('categoryIds', '_id name slug icon type')
    .lean();

  const ratedQuery = Vendor.schema.paths.averageRating
    ? baseQuery.clone().where({ averageRating: { $gt: 0 } }).sort({ averageRating: -1, createdAt: -1, sortOrder: 1, name: 1 })
    : baseQuery.clone().where({ rating: { $gt: 0 } }).sort({ rating: -1, createdAt: -1, sortOrder: 1, name: 1 });

  let vendors = (await ratedQuery.limit(fallbackLimit)) as any[];
  const now = new Date();
  vendors = vendors.filter((v) => isVendorAvailableNow(v, now));

  if (vendors.length === 0) {
    const unratedQuery = Vendor.schema.paths.averageRating
      ? baseQuery.clone().sort({ createdAt: -1, sortOrder: 1, name: 1 })
      : baseQuery.clone().sort({ createdAt: -1, sortOrder: 1, name: 1 });
    vendors = ((await unratedQuery.limit(fallbackLimit)) as any[]).filter((v) => isVendorAvailableNow(v, now)).slice(0, fallbackLimit);
  }

  for (let i = 0; i < vendors.length; i++) {
    const v = vendors[i];
    normalizeVendorRating(v);
    v.estimatedTime = toEtaRange(getFallbackEtaMinutes(v));
    v.distance = null;
  }

  return sendSuccess(res, { vendors, total: vendors.length, page: 1, pages: 1 });
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
  const products = await (Product as any).find({
    vendor: new mongoose.Types.ObjectId(id),
    isDeleted: false,
    isAvailable: true,
  })
    .select('_id name description price image category isAvailable sortOrder')
    .populate('category', '_id name')
    .lean()
    .sort({ sortOrder: 1 });

  // Customer origin for detail page:
  // (1) query customerLat/customerLng, (2) logged-in user's preferred address.
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
  const vendorLat = Number((vendor as any)?.address?.lat);
  const vendorLng = Number((vendor as any)?.address?.lng);
  const hasVendorCoords = Number.isFinite(vendorLat) && Number.isFinite(vendorLng);

  let distanceKm: number | null = null;
  let estimatedTime: string | null = toEtaRange(getFallbackEtaMinutes(vendor));
  let distance: string | null = null;
  if (customerCoords && hasVendorCoords) {
    distanceKm = Math.round(haversineKm(customerCoords.lat, customerCoords.lng, vendorLat, vendorLng) * 10) / 10;
    distance = `${distanceKm} km`;
    try {
      const [result] = await getDistanceMatrixEstimates({
        origin: customerCoords,
        destinations: [{ lat: vendorLat, lng: vendorLng }],
      });
      if (result?.durationMinutes != null) {
        estimatedTime = toEtaRange(result.durationMinutes);
      }
      if (result?.distanceText != null) {
        distance = result.distanceText;
      }
    } catch {
      // Keep fallback ETA when Distance Matrix is unavailable.
    }
  }

  const vendorOut = vendor as any;
  vendorOut.distanceKm = distanceKm;
  vendorOut.distance = distance;
  vendorOut.estimatedTime = estimatedTime;
  // Ensure customer-side always gets normalized vendor ratings.
  normalizeVendorRating(vendorOut);

  return sendSuccess(res, { vendor: vendorOut, products });
});
