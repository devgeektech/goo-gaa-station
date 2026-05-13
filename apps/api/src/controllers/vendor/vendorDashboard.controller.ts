import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Order } from '../../models/Order';
import { Product } from '../../models/Product';
import { Vendor } from '../../models/Vendor';
import { AppError } from '../../utils/AppError';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/response';

type ReqVendor = { _id: mongoose.Types.ObjectId | string };

function getVendorId(req: Request): mongoose.Types.ObjectId {
  const v = (req as Request & { vendor?: ReqVendor }).vendor;
  const id = v?._id;
  if (!id) throw new AppError({ en: 'Unauthorized', de: 'Nicht autorisiert' }, 401, 'UNAUTHORIZED');
  return typeof id === 'string' ? new mongoose.Types.ObjectId(id) : id;
}

/** YYYY-MM-DD in IANA timezone (e.g. Asia/Kolkata). */
function ymdInTimeZone(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** Previous calendar day string (in same timezone) relative to `now`. */
function getYesterdayYmd(now: Date, timeZone: string): string {
  const todayYmd = ymdInTimeZone(now, timeZone);
  let t = now.getTime() - 12 * 3600 * 1000;
  for (let i = 0; i < 10; i++) {
    const ymd = ymdInTimeZone(new Date(t), timeZone);
    if (ymd !== todayYmd) return ymd;
    t -= 24 * 3600 * 1000;
  }
  return ymdInTimeZone(new Date(now.getTime() - 86400000), timeZone);
}

function displayStoreId(vendorId: mongoose.Types.ObjectId): string {
  const hex = vendorId.toHexString().slice(-4).toUpperCase();
  return `#${hex}`;
}

async function sumDeliveredVendorShareForDayYmd(
  vendorId: mongoose.Types.ObjectId,
  timeZone: string,
  dayYmd: string
): Promise<{ earnings: number; totalOrders: number }> {
  const rows = await Order.aggregate<{ earnings: number; totalOrders: number }>([
    {
      $match: {
        vendorId,
        status: 'delivered',
        paymentStatus: 'paid',
      },
    },
    {
      $addFields: {
        deliveryDay: {
          $dateToString: {
            format: '%Y-%m-%d',
            date: { $ifNull: ['$actualDeliveryAt', '$updatedAt'] },
            timezone: timeZone,
          },
        },
      },
    },
    { $match: { deliveryDay: dayYmd } },
    {
      $group: {
        _id: null,
        earnings: { $sum: { $ifNull: ['$vendorShare', 0] } },
        totalOrders: { $sum: 1 },
      },
    },
  ]);
  const row = rows[0];
  return {
    earnings: Number.isFinite(Number(row?.earnings)) ? Number(row!.earnings) : 0,
    totalOrders: Number.isFinite(Number(row?.totalOrders)) ? Number(row!.totalOrders) : 0,
  };
}

async function sumWalletBalance(vendorId: mongoose.Types.ObjectId): Promise<number> {
  const rows = await Order.aggregate<{ balance: number }>([
    {
      $match: {
        vendorId,
        status: 'delivered',
        paymentStatus: 'paid',
      },
    },
    {
      $group: {
        _id: null,
        balance: { $sum: { $ifNull: ['$vendorShare', 0] } },
      },
    },
  ]);
  const n = Number(rows[0]?.balance);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

/** GET /api/v1/vendor/dashboard — vendor app home: today stats, new orders count, wallet, menu summary */
export const getVendorDashboard = asyncHandler(async (req: Request, res: Response) => {
  const vendorId = getVendorId(req);
  const now = new Date();

  const vendor = await Vendor.findById(vendorId)
    .select('name slug logo averageRating totalRatings timezone')
    .lean();
  if (!vendor) throw new AppError({ en: 'Vendor not found', de: 'Anbieter nicht gefunden' }, 404, 'NOT_FOUND');

  const timeZone =
    typeof (vendor as { timezone?: unknown }).timezone === 'string' && (vendor as { timezone: string }).timezone.trim()
      ? String((vendor as { timezone: string }).timezone).trim()
      : 'Asia/Kolkata';

  const todayYmd = ymdInTimeZone(now, timeZone);
  const yesterdayYmd = getYesterdayYmd(now, timeZone);

  const oid = vendorId;

  const [
    todayAgg,
    yesterdayAgg,
    newOrdersCount,
    walletBalance,
    totalItems,
    categoryIds,
    ratingRaw,
  ] = await Promise.all([
    sumDeliveredVendorShareForDayYmd(oid, timeZone, todayYmd),
    sumDeliveredVendorShareForDayYmd(oid, timeZone, yesterdayYmd),
    Order.countDocuments({ vendorId: oid, status: 'vendor_notified' }),
    sumWalletBalance(oid),
    Product.countDocuments({ vendor: oid, isDeleted: { $ne: true } }),
    Product.distinct('category', { vendor: oid, isDeleted: { $ne: true } }),
    Promise.resolve(Number((vendor as { averageRating?: unknown }).averageRating)),
  ]);

  const todayEarnings = Math.round(todayAgg.earnings * 100) / 100;
  const yesterdayEarnings = Math.round(yesterdayAgg.earnings * 100) / 100;

  let earningsChangePercent: number | null = null;
  let earningsChangeLabel: string | null = null;
  if (yesterdayEarnings > 0) {
    const rawPct = ((todayEarnings - yesterdayEarnings) / yesterdayEarnings) * 100;
    earningsChangePercent = Math.round(rawPct * 10) / 10;
    const sign = earningsChangePercent > 0 ? '+' : '';
    earningsChangeLabel = `${sign}${earningsChangePercent}%`;
  } else if (todayEarnings > 0) {
    earningsChangePercent = null;
    earningsChangeLabel = null;
  } else {
    earningsChangePercent = 0;
    earningsChangeLabel = '0%';
  }

  const rating = Number.isFinite(ratingRaw) && ratingRaw >= 0 ? Math.round(ratingRaw * 10) / 10 : 0;

  const data = {
    vendor: {
      name: String((vendor as { name?: string }).name ?? ''),
      storeId: displayStoreId(vendorId),
      slug: (vendor as { slug?: string }).slug ?? null,
      logo: (vendor as { logo?: string | null }).logo ?? null,
    },
    todayStats: {
      earnings: todayEarnings,
      totalOrders: todayAgg.totalOrders,
      rating,
      totalRatings: Number((vendor as { totalRatings?: unknown }).totalRatings) || 0,
      earningsChangePercent,
      earningsChangeLabel,
    },
    newOrdersCount,
    wallet: {
      balance: walletBalance,
      currency: 'USD',
    },
    menuSummary: {
      totalItems,
      totalCategories: Array.isArray(categoryIds) ? categoryIds.filter(Boolean).length : 0,
    },
  };

  return sendSuccess(res, data, 200);
});
