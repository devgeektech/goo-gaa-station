export type OrderAddressFields = {
  street?: string | null;
  city?: string | null;
  country?: string | null;
  name?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  landmark?: string | null;
  addressLabel?: string | null;
};

type VendorRef = {
  name?: string | null;
  address?: OrderAddressFields | null;
};

export function formatAddressLine(addr?: OrderAddressFields | null): string | null {
  if (!addr) return null;
  const parts = [addr.street, addr.city, addr.country].map((p) => (p != null ? String(p).trim() : '')).filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : null;
}

/** Pickup: order.pickupAddress, else vendor store address (no API change). */
export function resolvePickupForOrder(order: {
  pickupAddress?: OrderAddressFields | null;
  vendorId?: VendorRef | string | null;
}): { title: string; line: string | null; hint: string | null } {
  if (order.pickupAddress) {
    return {
      title: order.pickupAddress.name?.trim() || 'Pickup',
      line: formatAddressLine(order.pickupAddress),
      hint: null,
    };
  }

  const vendor = typeof order.vendorId === 'object' && order.vendorId ? order.vendorId : null;
  const vendorAddr = vendor?.address ?? null;
  const line = formatAddressLine(vendorAddr);
  if (!line) {
    return { title: 'Pickup', line: null, hint: null };
  }

  const landmark = vendorAddr?.landmark?.trim();
  const label = vendorAddr?.addressLabel?.trim();
  const hints = [landmark ? `Landmark: ${landmark}` : null, label ? `Label: ${label}` : null, 'From vendor store address'].filter(
    Boolean
  ) as string[];

  return {
    title: vendor?.name?.trim() || 'Vendor pickup',
    line,
    hint: hints.join(' · '),
  };
}

/** Delivery: prefer contact on address, else customer name; show full address line. */
export function resolveDeliveryForOrder(order: {
  deliveryAddress?: OrderAddressFields | null;
  customerId?: { name?: string | null; phone?: string | null } | string | null;
}): { title: string; line: string | null; phone: string | null } {
  const delivery = order.deliveryAddress;
  const customer = typeof order.customerId === 'object' && order.customerId ? order.customerId : null;

  const title = delivery?.contactName?.trim() || customer?.name?.trim() || 'Delivery';
  const line = formatAddressLine(delivery);
  const phone = delivery?.contactPhone?.trim() || customer?.phone?.trim() || null;

  return { title, line, phone };
}
