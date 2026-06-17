/**
 * Legacy non-React helper — prefer `useVendorStatusBadges()` from `@/lib/i18n/useStatusBadges`.
 * Kept for any non-component callers; labels are English-only.
 */
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
