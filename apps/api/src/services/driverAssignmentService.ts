import { Driver } from '../models/Driver';

export type NearbyDriver = {
  _id: unknown;
  name?: string;
  fcmTokens?: Array<{ token?: string | null }>;
  liveLocation?: { coordinates?: number[] };
  distanceKm: number;
};

function toRad(value: number): number {
  return (value * Math.PI) / 180;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/** Online, available drivers within radius of vendor pickup (max 5, nearest first). */
export async function findNearbyDrivers(
  vendorLat: number,
  vendorLng: number,
  radiusKm = 5
): Promise<NearbyDriver[]> {
  const lat = Number(vendorLat);
  const lng = Number(vendorLng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];

  const drivers = await Driver.find({
    status: 'active',
    approvalStatus: 'approved',
    isOnline: true,
    isAvailable: true,
    currentOrderId: null,
  })
    .select('_id name fcmTokens liveLocation')
    .lean();

  return (drivers || [])
    .map((d) => {
      const coords = (d as { liveLocation?: { coordinates?: number[] } })?.liveLocation?.coordinates ?? [];
      const dLng = Number(coords[0]);
      const dLat = Number(coords[1]);
      if (!Number.isFinite(dLat) || !Number.isFinite(dLng)) return null;
      const distanceKm = haversineKm(lat, lng, dLat, dLng);
      return { ...d, distanceKm } as NearbyDriver;
    })
    .filter((d): d is NearbyDriver => d != null)
    .filter((d) => d.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, 5);
}
