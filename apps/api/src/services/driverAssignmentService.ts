const svc = require('./driverAssignmentService.js') as {
  findNearbyDrivers: (
    vendorLat: number,
    vendorLng: number,
    radiusKm?: number
  ) => Promise<
    Array<{
      _id: unknown;
      name?: string;
      fcmTokens?: Array<{ token?: string | null }>;
      liveLocation?: { coordinates?: number[] };
      distanceKm?: number;
    }>
  >;
};

export const findNearbyDrivers = svc.findNearbyDrivers;
module.exports = svc;

