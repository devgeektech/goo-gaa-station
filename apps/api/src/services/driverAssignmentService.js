const { Driver } = require('../models/Driver');

function toRad(value) {
  return (value * Math.PI) / 180;
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

async function findNearbyDrivers(vendorLat, vendorLng, radiusKm = 5) {
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
      const coords = d?.liveLocation?.coordinates || [];
      const dLng = Number(coords[0]);
      const dLat = Number(coords[1]);
      if (!Number.isFinite(dLat) || !Number.isFinite(dLng)) return null;
      const distanceKm = haversineKm(lat, lng, dLat, dLng);
      return { ...d, distanceKm };
    })
    .filter(Boolean)
    .filter((d) => d.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, 5);
}

module.exports = { findNearbyDrivers };

