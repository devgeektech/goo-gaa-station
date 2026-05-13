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

/** Same `remainingTime` seconds as GET /vendor/orders/new and /current (vendor orderVendor.controller). */
function withRemainingTime<T extends Record<string, unknown>>(order: T): T & { remainingTime: number } {
  const deadline = (order as { vendorResponseDeadline?: Date | string | null }).vendorResponseDeadline;
  if (!deadline) return { ...(order as object), remainingTime: 0 } as T & { remainingTime: number };
  const ms = new Date(deadline).getTime() - Date.now();
  return {
    ...(order as object),
    remainingTime: Math.max(0, Math.ceil(ms / 1000)),
  } as T & { remainingTime: number };
}

/** Max orders per list embedded in dashboard (same shape as /vendor/orders/new and /current). */
const DASHBOARD_ORDERS_LIST_CAP = 200;

const ACTIVE_ORDER_STATUSES = ['accepted', 'preparing', 'ready', 'picked_up', 'on_the_way'] as const;

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

/** GET /api/v1/vendor/dashboard — vendor app home + embedded new/active order lists (cap 200 each; use /orders/new|current?page when truncated) */
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

  const newFilter = { vendorId: oid, status: 'vendor_notified' as const };
  const activeFilter = { vendorId: oid, status: { $in: [...ACTIVE_ORDER_STATUSES] } };

  const [
    todayAgg,
    yesterdayAgg,
    newOrdersCount,
    walletBalance,
    totalItems,
    categoryIds,
    ratingRaw,
    newOrdersLean,
    activeOrdersLean,
    activeOrdersCount,
  ] = await Promise.all([
    sumDeliveredVendorShareForDayYmd(oid, timeZone, todayYmd),
    sumDeliveredVendorShareForDayYmd(oid, timeZone, yesterdayYmd),
    Order.countDocuments(newFilter),
    sumWalletBalance(oid),
    Product.countDocuments({ vendor: oid, isDeleted: { $ne: true } }),
    Product.distinct('category', { vendor: oid, isDeleted: { $ne: true } }),
    Promise.resolve(Number((vendor as { averageRating?: unknown }).averageRating)),
    Order.find(newFilter)
      .populate('customerId', 'name phone')
      .sort({ createdAt: -1 })
      .limit(DASHBOARD_ORDERS_LIST_CAP)
      .lean(),
    Order.find(activeFilter)
      .populate('customerId', 'name phone')
      .sort({ createdAt: -1 })
      .limit(DASHBOARD_ORDERS_LIST_CAP)
      .lean(),
    Order.countDocuments(activeFilter),
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

  const newOrders = (newOrdersLean as Record<string, unknown>[]).map((o) => withRemainingTime(o));
  const activeOrders = (activeOrdersLean as Record<string, unknown>[]).map((o) => withRemainingTime(o));

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
    newOrders,
    newOrdersTruncated: newOrdersCount > newOrders.length,
    activeOrdersCount,
    activeOrders,
    activeOrdersTruncated: activeOrdersCount > activeOrders.length,
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
