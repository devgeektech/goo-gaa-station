/** Client-side mirror of apps/api/src/services/orderRevenue.service.ts */

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
