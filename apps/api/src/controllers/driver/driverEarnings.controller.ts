import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Order } from '../../models/Order';
import { AppError } from '../../utils/AppError';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/response';
import { computeOrderFinancials } from '../../services/orderFinancials.service';

const OrderM = Order as any;

const DELIVERED = { status: 'delivered' as const };
const RECENT_LIMIT = 20;
/** Calendar boundaries for earnings (driver model has no timezone field yet). */
export const DEFAULT_TIME_ZONE = 'Asia/Kolkata';
const MAX_MS_PER_ORDER = 12 * 60 * 60 * 1000;

export function getDriverObjectId(req: Request): mongoose.Types.ObjectId {
  const fromDriver = (req as Request & { driver?: { _id?: unknown } }).driver?._id;
  if (fromDriver) {
    return typeof fromDriver === 'string' ? new mongoose.Types.ObjectId(fromDriver) : (fromDriver as mongoose.Types.ObjectId);
  }
  const u = req.user;
  if (u?._id && u.role === 'driver') {
    return new mongoose.Types.ObjectId(u._id);
  }
  throw new AppError({ en: 'Unauthorized', de: 'Nicht autorisiert' }, 401, 'UNAUTHORIZED');
}

export function ymdInTimeZone(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

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

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function pctChangeLabel(current: number, prior: number): { percent: number | null; label: string | null } {
  if (prior > 0) {
    const raw = ((current - prior) / prior) * 100;
    const percent = Math.round(raw * 10) / 10;
    const sign = percent > 0 ? '+' : '';
    return { percent, label: `${sign}${percent}%` };
  }
  if (current > 0) return { percent: null, label: 'New' };
  return { percent: 0, label: '0%' };
}

function rollingLast7Ymds(now: Date, timeZone: string): string[] {
  const out: string[] = [];
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(now.getTime() - i * 86400000);
    out.push(ymdInTimeZone(d, timeZone));
  }
  return out;
}

function rollingPrev7Ymds(now: Date, timeZone: string): string[] {
  const out: string[] = [];
  for (let i = 13; i >= 7; i -= 1) {
    const d = new Date(now.getTime() - i * 86400000);
    out.push(ymdInTimeZone(d, timeZone));
  }
  return out;
}

function firstDayOfMonthYmd(todayYmd: string): string {
  const i = todayYmd.indexOf('-');
  const year = todayYmd.slice(0, i);
  const rest = todayYmd.slice(i + 1);
  const j = rest.indexOf('-');
  const month = rest.slice(0, j);
  return `${year}-${month}-01`;
}

function firstDayOfPreviousMonthYmd(todayYmd: string): string {
  const [y, m] = todayYmd.split('-').map((x) => parseInt(x, 10));
  const dt = new Date(Date.UTC(y, m - 2, 1));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  return `${yy}-${mm}-01`;
}

function previousMonthMtdEndYmd(todayYmd: string): string {
  const [y, m, d] = todayYmd.split('-').map((x) => parseInt(x, 10));
  const lastPrev = new Date(Date.UTC(y, m - 1, 0));
  const domCap = Math.min(d, lastPrev.getUTCDate());
  const py = lastPrev.getUTCFullYear();
  const pm = String(lastPrev.getUTCMonth() + 1).padStart(2, '0');
  return `${py}-${pm}-${String(domCap).padStart(2, '0')}`;
}

function addOneDayYmd(ymd: string): string {
  const [y, m, d] = ymd.split('-').map((x) => parseInt(x, 10));
  const n = new Date(Date.UTC(y, m - 1, d + 1));
  return `${n.getUTCFullYear()}-${String(n.getUTCMonth() + 1).padStart(2, '0')}-${String(n.getUTCDate()).padStart(2, '0')}`;
}

function ymdRangeInclusive(startYmd: string, endYmd: string): string[] {
  const out: string[] = [];
  let cur = startYmd;
  let guard = 0;
  while (cur <= endYmd && guard < 400) {
    out.push(cur);
    if (cur === endYmd) break;
    cur = addOneDayYmd(cur);
    guard += 1;
  }
  return out;
}

function formatYmdLong(ymd: string, timeZone: string): string {
  const [y, mo, d] = ymd.split('-').map((x) => parseInt(x, 10));
  const utc = new Date(Date.UTC(y, mo - 1, d, 12, 0, 0));
  return new Intl.DateTimeFormat('en-US', { timeZone, month: 'short', day: 'numeric', year: 'numeric' }).format(utc);
}

/**
 * Mongo: driver payout for one delivered order (matches `computeOrderFinancials`: stored driverShare if positive, else deliveryFee).
 */
function effectiveDriverRevenueMongoExpr(): Record<string, unknown> {
  return {
    $round: [
      {
        $cond: [
          { $gt: [{ $toDouble: { $ifNull: ['$driverShare', 0] } }, 0] },
          { $toDouble: { $ifNull: ['$driverShare', 0] } },
          { $max: [0, { $toDouble: { $ifNull: ['$deliveryFee', 0] } }] },
        ],
      },
      2,
    ],
  };
}

function effectiveDriverAmountFromOrder(o: Record<string, unknown>): number {
  const stored = Number(o.driverShare);
  if (Number.isFinite(stored) && stored > 0) return round2(stored);
  const f = computeOrderFinancials({
    subtotal: Number(o.subtotal) || 0,
    deliveryFee: Number(o.deliveryFee) || 0,
    discount: Number(o.discount) || 0,
    total: Number(o.total),
  });
  return round2(f.driverShare);
}

function weekdayShortFromYmd(ymd: string): string {
  const [y, m, d] = ymd.split('-').map((x) => parseInt(x, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return '';
  const utcNoon = Date.UTC(y, m - 1, d, 12, 0, 0);
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' }).format(new Date(utcNoon)).toUpperCase();
}

export async function sumDriverEffectiveRevenueForDays(
  driverId: mongoose.Types.ObjectId,
  timeZone: string,
  ymds: string[]
): Promise<{ revenue: number; orderCount: number }> {
  if (ymds.length === 0) return { revenue: 0, orderCount: 0 };
  const rows = await OrderM.aggregate([
    {
      $match: {
        driverId,
        ...DELIVERED,
      },
    },
    { $addFields: { __edr: effectiveDriverRevenueMongoExpr() } },
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
    { $match: { deliveryDay: { $in: ymds } } },
    {
      $group: {
        _id: null,
        revenue: { $sum: '$__edr' },
        orderCount: { $sum: 1 },
      },
    },
  ]);
  const row = rows[0];
  return {
    revenue: Number.isFinite(Number(row?.revenue)) ? round2(Number(row!.revenue)) : 0,
    orderCount: Number.isFinite(Number(row?.orderCount)) ? Number(row!.orderCount) : 0,
  };
}

async function monthToDateDriverStats(
  driverId: mongoose.Types.ObjectId,
  timeZone: string,
  monthStartYmd: string,
  throughYmd: string
): Promise<{ revenue: number; orderCount: number }> {
  const ymds = ymdRangeInclusive(monthStartYmd, throughYmd);
  return sumDriverEffectiveRevenueForDays(driverId, timeZone, ymds);
}

export async function totalLifetimeDriverEarnings(driverId: mongoose.Types.ObjectId): Promise<{ revenue: number; orderCount: number }> {
  const rows = await OrderM.aggregate([
    { $match: { driverId, ...DELIVERED } },
    { $addFields: { __edr: effectiveDriverRevenueMongoExpr() } },
    { $group: { _id: null, revenue: { $sum: '$__edr' }, orderCount: { $sum: 1 } } },
  ]);
  const row = rows[0];
  return {
    revenue: Number.isFinite(Number(row?.revenue)) ? round2(Number(row!.revenue)) : 0,
    orderCount: Number.isFinite(Number(row?.orderCount)) ? Number(row!.orderCount) : 0,
  };
}

export async function sumDriverDeliveryHoursForYmds(
  driverId: mongoose.Types.ObjectId,
  timeZone: string,
  ymds: string[]
): Promise<number> {
  if (ymds.length === 0) return 0;
  const rows = await OrderM.aggregate([
    { $match: { driverId, ...DELIVERED } },
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
    { $match: { deliveryDay: { $in: ymds } } },
    {
      $addFields: {
        rawMs: {
          $subtract: [
            { $toLong: { $ifNull: ['$actualDeliveryAt', '$updatedAt'] } },
            { $toLong: { $ifNull: ['$driverAcceptedAt', '$createdAt'] } },
          ],
        },
      },
    },
    {
      $addFields: {
        cappedMs: {
          $cond: [
            { $or: [{ $lte: ['$rawMs', 0] }, { $not: [{ $isNumber: ['$rawMs'] }] }] },
            0,
            { $min: ['$rawMs', MAX_MS_PER_ORDER] },
          ],
        },
      },
    },
    { $group: { _id: null, totalMs: { $sum: '$cappedMs' } } },
  ]);
  const ms = Number(rows[0]?.totalMs);
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return round1(ms / (60 * 60 * 1000));
}

async function totalLifetimeDriverHours(driverId: mongoose.Types.ObjectId, timeZone: string): Promise<number> {
  const rows = await OrderM.aggregate([
    { $match: { driverId, ...DELIVERED } },
    {
      $addFields: {
        rawMs: {
          $subtract: [
            { $toLong: { $ifNull: ['$actualDeliveryAt', '$updatedAt'] } },
            { $toLong: { $ifNull: ['$driverAcceptedAt', '$createdAt'] } },
          ],
        },
      },
    },
    {
      $addFields: {
        cappedMs: {
          $cond: [
            { $or: [{ $lte: ['$rawMs', 0] }, { $not: [{ $isNumber: ['$rawMs'] }] }] },
            0,
            { $min: ['$rawMs', MAX_MS_PER_ORDER] },
          ],
        },
      },
    },
    { $group: { _id: null, totalMs: { $sum: '$cappedMs' } } },
  ]);
  const ms = Number(rows[0]?.totalMs);
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return round1(ms / (60 * 60 * 1000));
}

async function dailyBarLast7DaysDriver(
  driverId: mongoose.Types.ObjectId,
  timeZone: string,
  ymds: string[]
): Promise<Array<{ date: string; label: string; amount: number; orderCount: number }>> {
  const rows = await OrderM.aggregate([
    { $match: { driverId, ...DELIVERED } },
    { $addFields: { __edr: effectiveDriverRevenueMongoExpr() } },
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
    { $match: { deliveryDay: { $in: ymds } } },
    {
      $group: {
        _id: '$deliveryDay',
        amount: { $sum: '$__edr' },
        orderCount: { $sum: 1 },
      },
    },
  ]);
  const typedRows = rows as Array<{ _id: string; amount: number; orderCount: number }>;
  const map = new Map(typedRows.map((r) => [r._id, { amount: round2(Number(r.amount) || 0), orderCount: Number(r.orderCount) || 0 }]));
  return ymds.map((date) => {
    const v = map.get(date);
    return {
      date,
      label: weekdayShortFromYmd(date),
      amount: v?.amount ?? 0,
      orderCount: v?.orderCount ?? 0,
    };
  });
}

function mapDeliveryRow(o: Record<string, unknown>) {
  const items = (o.items as Array<{ qty?: number }> | undefined) ?? [];
  const itemsCount = items.reduce((s, it) => s + (Number(it?.qty) || 0), 0);
  const deliveredAt = o.actualDeliveryAt ?? o.updatedAt;
  return {
    _id: String(o._id),
    orderNumber: String(o.orderNumber ?? ''),
    status: String(o.status ?? ''),
    paymentStatus: String(o.paymentStatus ?? ''),
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
    deliveredAt,
    itemsCount,
    driverAmount: effectiveDriverAmountFromOrder(o),
    orderTotal: round2(Number(o.total) || 0),
  };
}

async function recentDriverDeliveries(
  driverId: mongoose.Types.ObjectId,
  timeZone: string,
  startYmd: string,
  endYmd: string,
  limit: number
): Promise<ReturnType<typeof mapDeliveryRow>[]> {
  const rows = await OrderM.aggregate([
    { $match: { driverId, ...DELIVERED } },
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
    { $match: { deliveryDay: { $gte: startYmd, $lte: endYmd } } },
    { $sort: { actualDeliveryAt: -1, updatedAt: -1 } },
    { $limit: limit },
    {
      $project: {
        orderNumber: 1,
        status: 1,
        paymentStatus: 1,
        createdAt: 1,
        updatedAt: 1,
        actualDeliveryAt: 1,
        items: 1,
        driverShare: 1,
        total: 1,
        subtotal: 1,
        deliveryFee: 1,
        discount: 1,
      },
    },
  ]);
  return rows.map((d) => mapDeliveryRow(d as Record<string, unknown>));
}

/**
 * GET /api/v1/app/driver/earnings and GET /api/v1/driver/earnings — dashboard payload (daily / weekly / monthly).
 */
export const getDriverEarnings = asyncHandler(async (req: Request, res: Response) => {
  const driverId = getDriverObjectId(req);
  const now = new Date();
  const timeZone = DEFAULT_TIME_ZONE;

  const todayYmd = ymdInTimeZone(now, timeZone);
  const yesterdayYmd = getYesterdayYmd(now, timeZone);
  const last7Ymds = rollingLast7Ymds(now, timeZone);
  const prev7Ymds = rollingPrev7Ymds(now, timeZone);
  const monthStartYmd = firstDayOfMonthYmd(todayYmd);
  const prevMonthStart = firstDayOfPreviousMonthYmd(todayYmd);
  const prevMonthMtdEnd = previousMonthMtdEndYmd(todayYmd);

  const weekStartYmd = last7Ymds[0]!;
  const weekEndYmd = last7Ymds[6]!;

  const [
    lifetime,
    lifetimeHours,
    todayAgg,
    yesterdayAgg,
    weekAgg,
    prevWeekAgg,
    last7Bars,
    monthAgg,
    prevMonthMtdAgg,
    hoursToday,
    hoursWeek,
    hoursMonth,
    recentDaily,
    recentWeekly,
    recentMonthly,
  ] = await Promise.all([
    totalLifetimeDriverEarnings(driverId),
    totalLifetimeDriverHours(driverId, timeZone),
    sumDriverEffectiveRevenueForDays(driverId, timeZone, [todayYmd]),
    sumDriverEffectiveRevenueForDays(driverId, timeZone, [yesterdayYmd]),
    sumDriverEffectiveRevenueForDays(driverId, timeZone, last7Ymds),
    sumDriverEffectiveRevenueForDays(driverId, timeZone, prev7Ymds),
    dailyBarLast7DaysDriver(driverId, timeZone, last7Ymds),
    monthToDateDriverStats(driverId, timeZone, monthStartYmd, todayYmd),
    monthToDateDriverStats(driverId, timeZone, prevMonthStart, prevMonthMtdEnd),
    sumDriverDeliveryHoursForYmds(driverId, timeZone, [todayYmd]),
    sumDriverDeliveryHoursForYmds(driverId, timeZone, last7Ymds),
    sumDriverDeliveryHoursForYmds(driverId, timeZone, ymdRangeInclusive(monthStartYmd, todayYmd)),
    recentDriverDeliveries(driverId, timeZone, todayYmd, todayYmd, RECENT_LIMIT),
    recentDriverDeliveries(driverId, timeZone, weekStartYmd, weekEndYmd, RECENT_LIMIT),
    recentDriverDeliveries(driverId, timeZone, monthStartYmd, todayYmd, RECENT_LIMIT),
  ]);

  const dailyEarningsChange = pctChangeLabel(todayAgg.revenue, yesterdayAgg.revenue);
  const weeklyEarningsChange = pctChangeLabel(weekAgg.revenue, prevWeekAgg.revenue);
  const monthlyEarningsChange = pctChangeLabel(monthAgg.revenue, prevMonthMtdAgg.revenue);

  const data = {
    withdrawFunds: null as null,
    lifetime: {
      totalEarnings: lifetime.revenue,
      totalDeliveries: lifetime.orderCount,
      totalHoursWorked: lifetimeHours,
    },
    periods: {
      daily: {
        totalEarnings: todayAgg.revenue,
        dateRangeLabel: formatYmdLong(todayYmd, timeZone),
        earningsChangePercent: dailyEarningsChange.percent,
        earningsChangeLabel: dailyEarningsChange.label,
        totalDeliveries: todayAgg.orderCount,
        totalHoursWorked: hoursToday,
        performanceGraph: null as null,
        recentDeliveries: recentDaily,
      },
      weekly: {
        totalEarnings: weekAgg.revenue,
        dateRangeLabel: `${formatYmdLong(weekStartYmd, timeZone)} – ${formatYmdLong(weekEndYmd, timeZone)}`,
        earningsChangePercent: weeklyEarningsChange.percent,
        earningsChangeLabel: weeklyEarningsChange.label,
        totalDeliveries: weekAgg.orderCount,
        totalHoursWorked: hoursWeek,
        performanceGraph: last7Bars,
        recentDeliveries: recentWeekly,
      },
      monthly: {
        totalEarnings: monthAgg.revenue,
        dateRangeLabel: `${formatYmdLong(monthStartYmd, timeZone)} – ${formatYmdLong(todayYmd, timeZone)}`,
        earningsChangePercent: monthlyEarningsChange.percent,
        earningsChangeLabel: monthlyEarningsChange.label,
        totalDeliveries: monthAgg.orderCount,
        totalHoursWorked: hoursMonth,
        performanceGraph: null as null,
        recentDeliveries: recentMonthly,
      },
    },
    meta: {
      currency: 'USD',
      timeZone,
      earningsBasis: 'delivered_orders_effective_driver_share',
      earningsNote:
        'Uses stored driverShare when positive; otherwise delivery fee (same rules as order placement / computeOrderFinancials).',
      hoursNote:
        'Hours are estimated per delivered order as time from driverAcceptedAt (or createdAt) to actualDeliveryAt (or updatedAt), capped at 12h per order; not a full shift clock.',
      withdrawNote: 'No online wallet or withdraw flow; withdrawFunds is always null.',
    },
  };

  return sendSuccess(res, data, 200);
});
