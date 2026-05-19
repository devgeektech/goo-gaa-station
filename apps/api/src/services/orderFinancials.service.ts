type FinancialInput = {
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total?: number;
  /** Override platform commission rate as decimal (e.g. 0.15 for 15%). */
  platformCommissionRate?: number;
};

export type OrderFinancialBreakdown = {
  grossAmount: number;
  platformCommission: number;
  wifipayFee: number;
  vendorShare: number;
  driverShare: number;
};

const DEFAULT_PLATFORM_COMMISSION_RATE = Number(process.env.PLATFORM_COMMISSION_RATE ?? 0.15);
const DEFAULT_WIFIPAY_FEE_RATE = Number(process.env.WIFIPAY_FEE_RATE ?? 0.02);

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function safeRate(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return value;
}

export function computeOrderFinancials(input: FinancialInput): OrderFinancialBreakdown {
  const subtotal = Number(input.subtotal) || 0;
  const deliveryFee = Number(input.deliveryFee) || 0;
  const discount = Number(input.discount) || 0;

  const grossAmount = round2(
    input.total != null && Number.isFinite(input.total)
      ? Number(input.total)
      : subtotal + deliveryFee - discount
  );

  const commissionRate =
    input.platformCommissionRate != null
      ? safeRate(input.platformCommissionRate)
      : safeRate(DEFAULT_PLATFORM_COMMISSION_RATE);
  const wifipayRate = safeRate(DEFAULT_WIFIPAY_FEE_RATE);

  const platformCommission = round2(grossAmount * commissionRate);
  const wifipayFee = round2(grossAmount * wifipayRate);

  // Default policy: delivery fee belongs to the driver.
  const driverShare = round2(Math.max(0, deliveryFee));
  const vendorShare = round2(Math.max(0, grossAmount - platformCommission - wifipayFee - driverShare));

  return {
    grossAmount,
    platformCommission,
    wifipayFee,
    vendorShare,
    driverShare,
  };
}

export function enrichOrderFinancials<T extends Record<string, unknown>>(order: T): T & OrderFinancialBreakdown {
  const grossAmount = Number(order.grossAmount);
  const platformCommission = Number(order.platformCommission);
  const wifipayFee = Number(order.wifipayFee);
  const vendorShare = Number(order.vendorShare);
  const driverShare = Number(order.driverShare);

  const hasStored =
    Number.isFinite(grossAmount) &&
    Number.isFinite(platformCommission) &&
    Number.isFinite(wifipayFee) &&
    Number.isFinite(vendorShare) &&
    Number.isFinite(driverShare);

  if (hasStored) {
    return {
      ...order,
      grossAmount,
      platformCommission,
      wifipayFee,
      vendorShare,
      driverShare,
    };
  }

  const computed = computeOrderFinancials({
    subtotal: Number(order.subtotal) || 0,
    deliveryFee: Number(order.deliveryFee) || 0,
    discount: Number(order.discount) || 0,
    total: Number(order.total) || 0,
  });

  return {
    ...order,
    ...computed,
  };
}
