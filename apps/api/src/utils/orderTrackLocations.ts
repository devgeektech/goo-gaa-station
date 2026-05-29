export type TrackAddressLike = {
  street?: string | null;
  city?: string | null;
  country?: string | null;
  landmark?: string | null;
  name?: string | null;
  lat?: unknown;
  lng?: unknown;
};

export function toCurrentLocation(addr?: { lat?: unknown; lng?: unknown } | null): { lat: number; lng: number } | null {
  const lat = Number(addr?.lat);
  const lng = Number(addr?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

export function toTrackAddressSummary(addr?: TrackAddressLike | null): Record<string, string | null> | null {
  if (!addr) return null;
  return {
    street: addr.street != null ? String(addr.street) : null,
    city: addr.city != null ? String(addr.city) : null,
    country: addr.country != null ? String(addr.country) : null,
    landmark: addr.landmark != null ? String(addr.landmark) : null,
    name: addr.name != null ? String(addr.name) : null,
  };
}

/** Pickup coords: prefer order.pickupAddress when lat/lng are valid, else vendor address. */
export function resolvePickupLatLng(
  orderPickup: { lat?: unknown; lng?: unknown } | null | undefined,
  vendorAddress: { lat?: unknown; lng?: unknown } | null | undefined
): { lat: number; lng: number } | null {
  return toCurrentLocation(orderPickup as TrackAddressLike) ?? toCurrentLocation(vendorAddress as TrackAddressLike);
}

export function buildTrackPartyLocation(
  address: TrackAddressLike | null | undefined,
  currentLocation: { lat: number; lng: number } | null
): { currentLocation: { lat: number; lng: number } | null; address: Record<string, string | null> | null } {
  return {
    currentLocation,
    address: toTrackAddressSummary(address ?? null),
  };
}
