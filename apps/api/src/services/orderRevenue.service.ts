/**
 * Admin revenue formulas (COD / ledger):
 * - Net order amount = order amount − driver fee
 * - Commission = commission% × net order amount
 * - Admin revenue = commission
 * - Vendor revenue = order amount − driver fee − commission
 * - Driver revenue = driver fee
 * - Refund record amount = order amount + driver fee + commission
 */

export type OrderRevenueInput = {
  total?: number;
  deliveryFee?: number;
  status?: string;
  paymentStatus?: string;
};

export type OrderRevenueBreakdown = {
  orderAmount: number;
  driverFee: number;
  netOrderAmount: number;
  commission: number;
  adminRevenue: number;
  vendorRevenue: number;
  driverRevenue: number;
  refundAmount: number;
  /** Count toward revenue KPIs when delivered and not refunded */
  countsTowardRevenue: boolean;
};

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function computeOrderRevenueBreakdown(
  order: OrderRevenueInput,
  commissionPercent: number
): OrderRevenueBreakdown {
  const pct = Number.isFinite(commissionPercent) && commissionPercent >= 0 ? Math.min(commissionPercent, 100) : 0;
  const orderAmount = round2(Number(order.total) || 0);
  const driverFee = round2(Number(order.deliveryFee) || 0);
  const netOrderAmount = round2(Math.max(0, orderAmount - driverFee));
  const commission = round2(netOrderAmount * (pct / 100));
  const vendorRevenue = round2(Math.max(0, orderAmount - driverFee - commission));
  const countsTowardRevenue = order.status === 'delivered' && order.paymentStatus !== 'refunded';

  return {
    orderAmount,
    driverFee,
    netOrderAmount,
    commission,
    adminRevenue: commission,
    vendorRevenue,
    driverRevenue: driverFee,
    refundAmount: round2(orderAmount + driverFee + commission),
    countsTowardRevenue,
  };
}

export function enrichOrderWithRevenue<T extends Record<string, unknown>>(
  order: T,
  commissionPercent: number
): T & OrderRevenueBreakdown {
  const breakdown = computeOrderRevenueBreakdown(
    {
      total: Number(order.total),
      deliveryFee: Number(order.deliveryFee),
      status: String(order.status ?? ''),
      paymentStatus: String(order.paymentStatus ?? ''),
    },
    commissionPercent
  );
  return { ...order, ...breakdown };
}

/** Mongo $addFields expression: vendor revenue for one order document. */
export function vendorRevenueMongoExpr(commissionRate: number): Record<string, unknown> {
  const cr = commissionRate;
  return {
    $let: {
      vars: {
        orderAmount: { $toDouble: { $ifNull: ['$total', 0] } },
        driverFee: { $toDouble: { $ifNull: ['$deliveryFee', 0] } },
      },
      in: {
        $let: {
          vars: {
            net: { $max: [0, { $subtract: ['$$orderAmount', '$$driverFee'] }] },
          },
          in: {
            $let: {
              vars: {
                commission: { $multiply: ['$$net', cr] },
              },
              in: {
                $max: [
                  0,
                  {
                    $subtract: ['$$orderAmount', { $add: ['$$driverFee', '$$commission'] }],
                  },
                ],
              },
            },
          },
        },
      },
    },
  };
}

export function adminRevenueMongoExpr(commissionRate: number): Record<string, unknown> {
  const cr = commissionRate;
  return {
    $let: {
      vars: {
        orderAmount: { $toDouble: { $ifNull: ['$total', 0] } },
        driverFee: { $toDouble: { $ifNull: ['$deliveryFee', 0] } },
      },
      in: {
        $let: {
          vars: {
            net: { $max: [0, { $subtract: ['$$orderAmount', '$$driverFee'] }] },
          },
          in: { $multiply: ['$$net', cr] },
        },
      },
    },
  };
}

export function driverRevenueMongoExpr(): Record<string, unknown> {
  return { $toDouble: { $ifNull: ['$deliveryFee', 0] } };
}

export const REVENUE_ELIGIBLE_MATCH = {
  status: 'delivered' as const,
  paymentStatus: { $ne: 'refunded' as const },
};
