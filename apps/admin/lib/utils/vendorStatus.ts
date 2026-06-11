/** Vendor is online for orders: global isOpen + within today's operating hours. */
export function vendorAvailabilityBadge(vendor: {
  isAvailableNow?: boolean;
  isOpen?: boolean;
  withinOperatingHours?: boolean;
}): { label: string; background: string; hint?: string } {
  if (vendor.isAvailableNow === true) {
    return { label: 'Online', background: 'var(--success-light)' };
  }

  let hint = 'Offline';
  if (vendor.isOpen !== true) {
    hint = 'App offline or closed';
  } else if (vendor.withinOperatingHours === false) {
    hint = 'Outside operating hours';
  }

  return { label: 'Offline', background: 'var(--border-light)', hint };
}
