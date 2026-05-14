import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Order } from '../../models/Order';
import { Vendor } from '../../models/Vendor';
import { AppError } from '../../utils/AppError';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/response';
import { computeOrderFinancials } from '../../services/orderFinancials.service';

const OrderM = Order as any;
const VendorM = Vendor as any;

type ReqVendor = { _id: mongoose.Types.ObjectId | string };

/** Same defaults as `orderFinancials.service.ts` (keep in sync with aggregation). */
const PLATFORM_COMMISSION_RATE = Number(process.env.PLATFORM_COMMISSION_RATE ?? 0.15);
const WIFIPAY_FEE_RATE = Number(process.env.WIFIPAY_FEE_RATE ?? 0.02);

function getVendorId(req: Request): mongoose.Types.ObjectId {
  const v = (req as Request & { vendor?: ReqVendor }).vendor;
  const id = v?._id;
  if (!id) throw new AppError({ en: 'Unauthorized', de: 'Nicht autorisiert' }, 401, 'UNAUTHORIZED');
  return typeof id === 'string' ? new mongoose.Types.ObjectId(id) : id;
}

function ymdInTimeZone(d: Date, timeZone: string): string {
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

function pctChangeLabel(current: number, prior: number): { percent: number | null; label: string | null } {
  if (prior > 0) {
    const raw = ((current - prior) / prior) * 100;
    const percent = Math.round(raw * 10) / 10;
    const sign = percent > 0 ? '+' : '';
    return { percent, label: `${sign}${percent}%` };
  }
  // Prior period is zero — no meaningful % vs baseline; show a badge when current > 0.
  if (current > 0) return { percent: null, label: 'New' };
  return { percent: 0, label: '0%' };
}

/** COD: realized on delivery. Uses stored vendorShare when positive; otherwise recomputes from subtotal/total/fees (legacy rows). */
const EARNINGS_MATCH = { status: 'delivered' as const };

const STATUS_QUEUED = ['pending', 'vendor_notified', 'placed'] as const;
const STATUS_ACTIVE = ['accepted', 'confirmed', 'preparing', 'ready', 'picked_up', 'on_the_way'] as const;

const RECENT_LIMIT = 20;
const TAB_LIST_LIMIT = 50;

/**
 * Mongo expression: vendor revenue for one order document (matches `computeOrderFinancials` policy).
 */
function effectiveVendorRevenueMongoExpr(): Record<string, unknown> {
  const cr = PLATFORM_COMMISSION_RATE;
  const wr = WIFIPAY_FEE_RATE;
  return {
    $let: {
      vars: {
        t: '$total',
        s: { $ifNull: ['$subtotal', 0] },
        df: { $ifNull: ['$deliveryFee', 0] },
        disc: { $ifNull: ['$discount', 0] },
        storedVs: { $toDouble: { $ifNull: ['$vendorShare', 0] } },
      },
      in: {
        $let: {
          vars: {
            gross: {
              $cond: [
                {
                  $and: [
                    { $ne: ['$$t', null] },
                    { $in: [{ $type: '$$t' }, ['double', 'decimal', 'int', 'long']] },
                  ],
                },
                { $toDouble: '$$t' },
                { $subtract: [{ $add: ['$$s', '$$df'] }, '$$disc'] },
              ],
            },
          },
          in: {
            $round: [
              {
                $cond: [
                  { $gt: ['$$storedVs', 0] },
                  '$$storedVs',
                  {
                    $max: [
                      0,
                      {
                        $subtract: [
                          '$$gross',
                          {
                            $add: [
                              { $multiply: ['$$gross', cr] },
                              { $multiply: ['$$gross', wr] },
                              '$$df',
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
              2,
            ],
          },
        },
      },
    },
  };
}

async function sumEffectiveVendorRevenueForDays(
  vendorId: mongoose.Types.ObjectId,
  timeZone: string,
  ymds: string[]
): Promise<{ revenue: number; orderCount: number }> {
  if (ymds.length === 0) return { revenue: 0, orderCount: 0 };
  const rows = await OrderM.aggregate([
    {
      $match: {
        vendorId,
        ...EARNINGS_MATCH,
      },
    },
    { $addFields: { __evr: effectiveVendorRevenueMongoExpr() } },
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
        revenue: { $sum: '$__evr' },
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

async function totalLifetimeEffectiveVendorRevenue(vendorId: mongoose.Types.ObjectId): Promise<number> {
  const rows = await OrderM.aggregate([
    { $match: { vendorId, ...EARNINGS_MATCH } },
    { $addFields: { __evr: effectiveVendorRevenueMongoExpr() } },
    { $group: { _id: null, total: { $sum: '$__evr' } } },
  ]);
  const n = Number(rows[0]?.total);
  return Number.isFinite(n) ? round2(n) : 0;
}

async function sumEffectiveVendorRevenueSingleDay(
  vendorId: mongoose.Types.ObjectId,
  timeZone: string,
  dayYmd: string
): Promise<{ revenue: number; orderCount: number }> {
  return sumEffectiveVendorRevenueForDays(vendorId, timeZone, [dayYmd]);
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

function weekdayShortFromYmd(ymd: string): string {
  const [y, m, d] = ymd.split('-').map((x) => parseInt(x, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return '';
  const utcNoon = Date.UTC(y, m - 1, d, 12, 0, 0);
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' }).format(new Date(utcNoon)).toUpperCase();
}

async function dailyBarLast7Days(
  vendorId: mongoose.Types.ObjectId,
  timeZone: string,
  ymds: string[]
): Promise<Array<{ date: string; label: string; amount: number; orderCount: number }>> {
  const rows = await OrderM.aggregate([
    {
      $match: {
        vendorId,
        ...EARNINGS_MATCH,
      },
    },
    { $addFields: { __evr: effectiveVendorRevenueMongoExpr() } },
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
        amount: { $sum: '$__evr' },
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

async function monthToDateEffectiveRevenue(
  vendorId: mongoose.Types.ObjectId,
  timeZone: string,
  monthStartYmd: string,
  throughYmd: string
): Promise<{ revenue: number; orderCount: number }> {
  const rows = await OrderM.aggregate([
    {
      $match: {
        vendorId,
        ...EARNINGS_MATCH,
      },
    },
    { $addFields: { __evr: effectiveVendorRevenueMongoExpr() } },
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
    { $match: { deliveryDay: { $gte: monthStartYmd, $lte: throughYmd } } },
    {
      $group: {
        _id: null,
        revenue: { $sum: '$__evr' },
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

function effectiveVendorAmountFromOrder(o: Record<string, unknown>): number {
  const stored = Number(o.vendorShare);
  if (Number.isFinite(stored) && stored > 0) return round2(stored);
  const f = computeOrderFinancials({
    subtotal: Number(o.subtotal) || 0,
    deliveryFee: Number(o.deliveryFee) || 0,
    discount: Number(o.discount) || 0,
    total: Number(o.total),
  });
  return round2(f.vendorShare);
}

function mapOrderListRow(o: Record<string, unknown>) {
  const items = (o.items as Array<{ qty?: number }> | undefined) ?? [];
  const itemsCount = items.reduce((s, it) => s + (Number(it?.qty) || 0), 0);
  return {
    _id: String(o._id),
    orderNumber: String(o.orderNumber ?? ''),
    status: String(o.status ?? ''),
    paymentStatus: String(o.paymentStatus ?? ''),
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
    itemsCount,
    /** Vendor portion after platform/driver share; uses `computeOrderFinancials` when DB `vendorShare` is 0. */
    vendorAmount: effectiveVendorAmountFromOrder(o),
    orderTotal: round2(Number(o.total) || 0),
  };
}

async function fetchOrdersForStatuses(
  vendorId: mongoose.Types.ObjectId,
  statuses: readonly string[],
  limit: number
): Promise<{ orders: ReturnType<typeof mapOrderListRow>[]; totalAmount: number }> {
  const filter = { vendorId, status: { $in: [...statuses] } };
  const docs = await OrderM
    .find(filter)
    .sort({ updatedAt: -1 })
    .limit(limit)
    .select('orderNumber status paymentStatus createdAt updatedAt items vendorShare total subtotal deliveryFee discount')
    .lean();
  const orders = docs.map((d) => mapOrderListRow(d as Record<string, unknown>));
  const totalAmount = round2(orders.reduce((s, r) => s + r.orderTotal, 0));
  return { orders, totalAmount };
}

/**
 * GET /api/v1/vendor/wallet — Wallet overview, revenue analytics, and order buckets (COD; no payouts).
 */
export const getVendorWallet = asyncHandler(async (req: Request, res: Response) => {
  const vendorId = getVendorId(req);
  const now = new Date();

  const vendor = await VendorM.findById(vendorId).select('timezone').lean();
  if (!vendor) throw new AppError({ en: 'Vendor not found', de: 'Anbieter nicht gefunden' }, 404, 'NOT_FOUND');

  const vDoc = vendor as unknown as { timezone?: string };
  const timeZone =
    typeof vDoc.timezone === 'string' && vDoc.timezone.trim() ? String(vDoc.timezone).trim() : 'Asia/Kolkata';

  const todayYmd = ymdInTimeZone(now, timeZone);
  const yesterdayYmd = getYesterdayYmd(now, timeZone);
  const last7Ymds = rollingLast7Ymds(now, timeZone);
  const prev7Ymds = rollingPrev7Ymds(now, timeZone);
  const monthStartYmd = firstDayOfMonthYmd(todayYmd);
  const prevMonthStart = firstDayOfPreviousMonthYmd(todayYmd);
  const prevMonthMtdEnd = previousMonthMtdEndYmd(todayYmd);

  const [
    totalEarningsLifetime,
    todayAgg,
    yesterdayAgg,
    weekAgg,
    prevWeekAgg,
    last7Bars,
    monthAgg,
    prevMonthMtdAgg,
    recentDocs,
    queuedTab,
    activeTab,
    deliveredTab,
  ] = await Promise.all([
    totalLifetimeEffectiveVendorRevenue(vendorId),
    sumEffectiveVendorRevenueSingleDay(vendorId, timeZone, todayYmd),
    sumEffectiveVendorRevenueSingleDay(vendorId, timeZone, yesterdayYmd),
    sumEffectiveVendorRevenueForDays(vendorId, timeZone, last7Ymds),
    sumEffectiveVendorRevenueForDays(vendorId, timeZone, prev7Ymds),
    dailyBarLast7Days(vendorId, timeZone, last7Ymds),
    monthToDateEffectiveRevenue(vendorId, timeZone, monthStartYmd, todayYmd),
    monthToDateEffectiveRevenue(vendorId, timeZone, prevMonthStart, prevMonthMtdEnd),
    OrderM
      .find({ vendorId })
      .sort({ updatedAt: -1 })
      .limit(RECENT_LIMIT)
      .select('orderNumber status paymentStatus createdAt updatedAt items vendorShare total subtotal deliveryFee discount')
      .lean(),
    fetchOrdersForStatuses(vendorId, STATUS_QUEUED, TAB_LIST_LIMIT),
    fetchOrdersForStatuses(vendorId, STATUS_ACTIVE, TAB_LIST_LIMIT),
    fetchOrdersForStatuses(vendorId, ['delivered'], TAB_LIST_LIMIT),
  ]);

  const todayEarnings = todayAgg.revenue;
  const weekEarnings = weekAgg.revenue;

  const todayVsYesterday = pctChangeLabel(todayEarnings, yesterdayAgg.revenue);
  const weekVsPrior = pctChangeLabel(weekAgg.revenue, prevWeekAgg.revenue);

  const recentOrders = recentDocs.map((d) => mapOrderListRow(d as Record<string, unknown>));

  const weeklyRevenueChange = pctChangeLabel(weekAgg.revenue, prevWeekAgg.revenue);
  const weeklyOrdersChange = pctChangeLabel(weekAgg.orderCount, prevWeekAgg.orderCount);

  const dailyRevenueChange = pctChangeLabel(todayAgg.revenue, yesterdayAgg.revenue);
  const dailyOrdersChange = pctChangeLabel(todayAgg.orderCount, yesterdayAgg.orderCount);

  const monthlyRevenueChange = pctChangeLabel(monthAgg.revenue, prevMonthMtdAgg.revenue);
  const monthlyOrdersChange = pctChangeLabel(monthAgg.orderCount, prevMonthMtdAgg.orderCount);

  const data = {
    overview: {
      summary: {
        totalEarnings: totalEarningsLifetime,
        todayEarnings,
        weekEarnings,
        todayVsYesterdayPercent: todayVsYesterday.percent,
        todayVsYesterdayLabel: todayVsYesterday.label,
        weekVsLastWeekPercent: weekVsPrior.percent,
        weekVsLastWeekLabel: weekVsPrior.label,
      },
      recentOrders,
    },
    revenueAnalytics: {
      periodRevenue: {
        daily: todayAgg.revenue,
        weekly: weekAgg.revenue,
        monthly: monthAgg.revenue,
      },
      graphs: {
        daily: null,
        weekly: last7Bars,
        monthly: null,
      },
      totals: {
        totalRevenue: weekAgg.revenue,
        revenueChangePercent: weeklyRevenueChange.percent,
        revenueChangeLabel: weeklyRevenueChange.label,
        totalOrders: weekAgg.orderCount,
        ordersChangePercent: weeklyOrdersChange.percent,
        ordersChangeLabel: weeklyOrdersChange.label,
      },
      changeByPeriod: {
        daily: {
          revenue: todayAgg.revenue,
          revenueChangePercent: dailyRevenueChange.percent,
          revenueChangeLabel: dailyRevenueChange.label,
          orders: todayAgg.orderCount,
          ordersChangePercent: dailyOrdersChange.percent,
          ordersChangeLabel: dailyOrdersChange.label,
        },
        weekly: {
          revenue: weekAgg.revenue,
          revenueChangePercent: weeklyRevenueChange.percent,
          revenueChangeLabel: weeklyRevenueChange.label,
          orders: weekAgg.orderCount,
          ordersChangePercent: weeklyOrdersChange.percent,
          ordersChangeLabel: weeklyOrdersChange.label,
        },
        monthly: {
          revenue: monthAgg.revenue,
          revenueChangePercent: monthlyRevenueChange.percent,
          revenueChangeLabel: monthlyRevenueChange.label,
          orders: monthAgg.orderCount,
          ordersChangePercent: monthlyOrdersChange.percent,
          ordersChangeLabel: monthlyOrdersChange.label,
        },
      },
      recentOrders,
    },
    orderBuckets: {
      queued: {
        orders: queuedTab.orders,
        totalAmount: queuedTab.totalAmount,
      },
      active: {
        orders: activeTab.orders,
        totalAmount: activeTab.totalAmount,
      },
      delivered: {
        orders: deliveredTab.orders,
        totalAmount: deliveredTab.totalAmount,
      },
    },
    meta: {
      currency: 'USD',
      timeZone,
      earningsBasis: 'delivered_orders_effective_vendor_revenue',
      earningsNote:
        'Uses stored vendorShare when positive; otherwise recomputed from order totals and fees (same rules as order placement). Commission and wifipay rates follow PLATFORM_COMMISSION_RATE and WIFIPAY_FEE_RATE.',
      note: 'No payout or online-wallet fields; COD-only flows.',
    },
  };

  return sendSuccess(res, data, 200);
});
