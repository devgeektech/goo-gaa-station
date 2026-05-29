import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Order } from '../../models/Order';
import { Driver } from '../../models/Driver';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/response';
import {
  DEFAULT_TIME_ZONE,
  getDriverObjectId,
  sumDriverDeliveryHoursForYmds,
  sumDriverEffectiveRevenueForDays,
  totalLifetimeDriverEarnings,
  ymdInTimeZone,
} from './driverEarnings.controller';
import { resolveDriverLatLng, toDriverOrderCardActiveShape } from '../app/driverOrder.controller';

const KM_TO_MI = 0.621371;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function tierLabelFromStats(totalDeliveries: number, rating: number): string {
  const d = Number(totalDeliveries) || 0;
  const r = Number(rating) || 0;
  if (d >= 300 && r >= 4.7) return 'Platinum Tier Driver';
  if (d >= 150 || (d >= 80 && r >= 4.5)) return 'Gold Tier Driver';
  if (d >= 40) return 'Silver Tier Driver';
  return 'Bronze Tier Driver';
}

function uiStatusLabel(status: string): string {
  switch (status) {
    case 'ready':
      return 'Pickup Ready';
    case 'preparing':
      return 'Preparing';
    case 'picked_up':
      return 'Picked up';
    case 'on_the_way':
      return 'On the way';
    default:
      return status;
  }
}

function statusIndicatorFor(status: string): 'green' | 'amber' | 'neutral' {
  if (status === 'ready' || status === 'picked_up' || status === 'on_the_way') return 'green';
  if (status === 'preparing') return 'amber';
  return 'neutral';
}

function formatEstTimeLabel(estMinutes: number | null | undefined): string | null {
  if (estMinutes == null || !Number.isFinite(Number(estMinutes))) return null;
  const m = Math.max(1, Math.round(Number(estMinutes)));
  return `Est. ${m} mins`;
}

/**
 * GET /api/v1/driver/dashboard — home screen payload (Figma driver dashboard).
 * Replaces “wallet balance” with lifetime total earnings from delivered orders (same basis as /driver/earnings).
 */
export const getDriverDashboard = asyncHandler(async (req: Request, res: Response) => {
  const driverId = getDriverObjectId(req);
  const now = new Date();
  const timeZone = DEFAULT_TIME_ZONE;
  const todayYmd = ymdInTimeZone(now, timeZone);

  const newOrdersFilter = {
    status: 'accepted',
    driver_assigned: false,
    rejectedByDrivers: { $ne: driverId },
    driverAssignmentDeadline: { $gt: now },
    $or: [{ broadcastedToDrivers: driverId }, { notifiedDriverIds: driverId }],
  };

  const activeFilter = {
    driverId,
    status: { $in: ['preparing', 'ready', 'picked_up', 'on_the_way'] },
  };

  const OrderDoc = Order as mongoose.Model<Record<string, unknown>>;

  const [driverLean, lifetime, todayRevenue, hoursToday, newOrdersCount, activeOrdersRaw] = await Promise.all([
    Driver.findById(driverId)
      .select('name profileImage isOnline rating totalDeliveries currentLocation liveLocation')
      .lean(),
    totalLifetimeDriverEarnings(driverId),
    sumDriverEffectiveRevenueForDays(driverId, timeZone, [todayYmd]),
    sumDriverDeliveryHoursForYmds(driverId, timeZone, [todayYmd]),
    OrderDoc.countDocuments(newOrdersFilter),
    OrderDoc.find(activeFilter)
      .populate('customerId', 'name phone')
      .populate('vendorId', 'name address phone')
      .sort({ updatedAt: -1 })
      .limit(20)
      .lean(),
  ]);

  const driver = driverLean as {
    name?: string;
    profileImage?: string | null;
    isOnline?: boolean;
    rating?: number;
    totalDeliveries?: number;
    currentLocation?: { lat?: unknown; lng?: unknown };
    liveLocation?: { coordinates?: number[] };
  } | null;

  const tipsAmount = 0;

  const driverPos = resolveDriverLatLng(driverLean);
  const emptyCompletion = { deliveredAt: null, deliveryDurationMinutes: null, statusBadge: null };

  const activeOrders = activeOrdersRaw.map((order: Record<string, unknown>, index: number) => {
    const card = toDriverOrderCardActiveShape(order, driverPos, emptyCompletion) as Record<string, unknown>;
    const statusStr = String(order.status ?? '');
    const vendor = (order.vendorId ?? {}) as {
      name?: string | null;
      address?: { street?: string; city?: string; country?: string; lat?: number; lng?: number } | null;
    };
    const drop = (order.deliveryAddress ?? {}) as {
      name?: string | null;
      street?: string;
      city?: string;
      country?: string;
      lat?: number | null;
      lng?: number | null;
    };
    const pickupStreet = vendor.address?.street;
    const pickupCity = [vendor.address?.city, vendor.address?.country].filter(Boolean).join(', ');
    const pickupAddressLine = [pickupStreet, pickupCity].filter(Boolean).join(', ') || null;
    const dropStreet = drop.street;
    const dropCity = [drop.city, drop.country].filter(Boolean).join(', ');
    const dropAddressLine = [dropStreet, dropCity].filter(Boolean).join(', ') || null;

    const estMinutes = card.estTime != null && Number.isFinite(Number(card.estTime)) ? Number(card.estTime) : null;
    const distKm = card.distance != null && Number.isFinite(Number(card.distance)) ? Number(card.distance) : null;
    const distMi = distKm != null ? round2(distKm * KM_TO_MI) : null;

    const queuePositionLabel =
      index > 0 && distMi != null ? `Next in queue · ${distMi} mi away` : index > 0 ? 'Next in queue' : null;

    return {
      figmaDisplay: {
        orderNumberFormatted: card.orderNumber ? `#${String(card.orderNumber)}` : null,
        statusUiLabel: uiStatusLabel(statusStr),
        statusIndicator: statusIndicatorFor(statusStr),
        primaryActionLabel: 'View Route',
        queuePositionLabel,
        statusBadge: index === 0 ? null : 'Pending',
      },
      pickupLocation: {
        name: vendor.name ?? null,
        addressLine: pickupAddressLine,
        lat: vendor.address?.lat ?? null,
        lng: vendor.address?.lng ?? null,
      },
      dropoffLocation: {
        label: drop.name ?? null,
        addressLine: dropAddressLine,
        lat: drop.lat ?? null,
        lng: drop.lng ?? null,
      },
      estMinutes,
      estTimeLabel: formatEstTimeLabel(estMinutes),
      distanceKm: distKm,
      distanceMiles: distMi,
      orderCard: card,
    };
  });

  const mapCenter = driverPos;

  const data = {
    driverProfile: {
      name: driver?.name ?? '',
      tierLabel: tierLabelFromStats(Number(driver?.totalDeliveries) || 0, Number(driver?.rating) || 0),
      profileImageUrl: driver?.profileImage ?? null,
      isOnline: Boolean(driver?.isOnline),
    },
    todaysEarningsCard: {
      periodLabel: "Today's Earnings",
      totalEarnings: todayRevenue.revenue,
      orderCount: todayRevenue.orderCount,
      hoursWorked: hoursToday,
      tipsAmount,
    },
    totalEarningsCard: {
      label: 'Total Earnings',
      amount: lifetime.revenue,
      cashOutCtaLabel: 'Cash Out >',
      cashOutAvailable: false,
      withdrawFunds: null as null,
    },
    newOrdersCount,
    activeOrders,
    map: {
      openMapButtonLabel: 'Open Map View',
      mapPreviewUrl: null as string | null,
      center: mapCenter ? { lat: mapCenter.lat, lng: mapCenter.lng } : null,
    },
    meta: {
      currency: 'USD',
      timeZone,
      tipsNote: 'Order schema has no driver-tip field yet; tipsAmount is always 0 until modeled.',
      tierNote: 'tierLabel is derived from totalDeliveries and rating thresholds (not a stored field).',
      hoursNote:
        'hoursWorked for today matches /driver/earnings: estimated per delivered order from assignment to delivery, capped at 12h each.',
      earningsBasis: 'delivered_orders_effective_driver_share',
      totalEarningsNote:
        'totalEarningsCard.amount is lifetime sum of effective driver share on delivered orders (same as GET /driver/earnings lifetime.totalEarnings), not walletBalance.',
    },
  };

  return sendSuccess(res, data, 200);
});
