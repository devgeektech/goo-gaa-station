import mongoose from 'mongoose';
import type { Server as SocketIOServer } from 'socket.io';
import { Order } from '../models/Order';
import { Driver } from '../models/Driver';
import { DriverNotification } from '../models/DriverNotification';
import { User } from '../models/User';
import { Vendor } from '../models/Vendor';
import { haversineKm } from '../utils/haversine';
import { sendPushToDriver } from './fcm.service';
import type { NearbyDriver } from './driverAssignmentService';

/** Same radius as findNearbyDrivers at vendor accept. */
export const DRIVER_BROADCAST_RADIUS_KM = 5;

const rebroadcastDebounceMs = 3_000;
const lastRebroadcastAt = new Map<string, number>();

function kmToMiles(km: number): number {
  return km * 0.621371;
}

function resolveDriverLatLng(driver: {
  currentLocation?: { lat?: unknown; lng?: unknown } | null;
  liveLocation?: { coordinates?: number[] } | null;
}): { lat: number; lng: number } | null {
  const clat = driver.currentLocation?.lat;
  const clng = driver.currentLocation?.lng;
  if (Number.isFinite(Number(clat)) && Number.isFinite(Number(clng))) {
    return { lat: Number(clat), lng: Number(clng) };
  }
  const coords = driver.liveLocation?.coordinates;
  if (Array.isArray(coords) && coords.length >= 2) {
    const lng = Number(coords[0]);
    const lat = Number(coords[1]);
    if (Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0)) {
      return { lat, lng };
    }
  }
  return null;
}

export function isDriverEligibleForOpenOrderBroadcast(driver: {
  approvalStatus?: string;
  status?: string;
  isOnline?: boolean;
  isAvailable?: boolean;
  currentOrderId?: unknown;
} | null): boolean {
  if (!driver) return false;
  return (
    driver.approvalStatus === 'approved' &&
    driver.status === 'active' &&
    driver.isOnline === true &&
    driver.isAvailable === true &&
    !driver.currentOrderId
  );
}

type OrderBroadcastDoc = {
  _id: mongoose.Types.ObjectId;
  orderNumber?: string;
  status?: string;
  subtotal?: number;
  total?: number;
  deliveryFee?: number;
  deliveryAddress?: {
    street?: string;
    city?: string;
    country?: string;
    lat?: number;
    lng?: number;
  } | null;
  estimatedDeliveryTime?: number | null;
  driverAssignmentDeadline?: Date | null;
  vendorId?: mongoose.Types.ObjectId;
  customerId?: mongoose.Types.ObjectId;
  items?: Array<{ qty?: number }>;
};

type VendorBroadcastDoc = {
  _id?: mongoose.Types.ObjectId;
  name?: string;
  phone?: string;
  address?: {
    street?: string;
    city?: string;
    country?: string;
    lat?: number;
    lng?: number;
  } | null;
};

function buildDriverRequestPayloads(
  order: OrderBroadcastDoc,
  vendor: VendorBroadcastDoc,
  customer: { name?: string; phone?: string } | null,
  assignmentDeadline: Date,
  driverToPickupKm: number
) {
  const vendorAddress = vendor.address ?? null;
  const deliveryAddress = order.deliveryAddress ?? null;
  const vendorToCustomerKm =
    Number.isFinite(Number(vendorAddress?.lat)) &&
    Number.isFinite(Number(vendorAddress?.lng)) &&
    Number.isFinite(Number(deliveryAddress?.lat)) &&
    Number.isFinite(Number(deliveryAddress?.lng))
      ? haversineKm(
          Number(vendorAddress?.lat),
          Number(vendorAddress?.lng),
          Number(deliveryAddress?.lat),
          Number(deliveryAddress?.lng)
        )
      : null;
  const vendorToCustomerMiles =
    vendorToCustomerKm != null ? Math.round(kmToMiles(vendorToCustomerKm) * 100) / 100 : null;
  const estimatedTimeMinutes = Number.isFinite(Number(order.estimatedDeliveryTime))
    ? Number(order.estimatedDeliveryTime)
    : null;
  const itemCount = Array.isArray(order.items)
    ? order.items.reduce((sum, item) => sum + (Number(item?.qty) || 0), 0)
    : 0;

  const driverToPickupMiles = Number.isFinite(driverToPickupKm)
    ? Math.round(kmToMiles(driverToPickupKm) * 100) / 100
    : null;

  const baseNotifyPayload = {
    orderId: order._id,
    orderNumber: order.orderNumber,
    vendorName: vendor.name ?? 'Vendor',
    vendorAddress: vendor.address ?? null,
    deliveryAddress: order.deliveryAddress ?? null,
    totalAmount: order.total,
    assignmentDeadline: assignmentDeadline.toISOString(),
    pickup: {
      name: vendor.name ?? 'Pickup',
      address: vendorAddress,
    },
    dropoff: {
      address: deliveryAddress,
      distanceMilesFromPickup: vendorToCustomerMiles,
    },
    totalMiles: vendorToCustomerMiles,
    timing: {
      estimatedMinutes: estimatedTimeMinutes,
    },
    itemCount,
  };

  const notifyPayload = {
    ...baseNotifyPayload,
    pickup: {
      ...baseNotifyPayload.pickup,
      distanceMilesFromDriver: driverToPickupMiles,
    },
    totalMiles:
      driverToPickupMiles != null && vendorToCustomerMiles != null
        ? Math.round((driverToPickupMiles + vendorToCustomerMiles) * 100) / 100
        : baseNotifyPayload.totalMiles,
  };

  const vendorAddressText =
    vendorAddress?.street ??
    ([vendorAddress?.city, vendorAddress?.country].filter(Boolean).join(', ') || null);
  const dropoffAddressText =
    deliveryAddress?.street ??
    ([deliveryAddress?.city, deliveryAddress?.country].filter(Boolean).join(', ') || null);
  const subtotalNum = Number(order.subtotal);
  const itemPrice = Number.isFinite(subtotalNum) ? Math.round(subtotalNum * 100) / 100 : null;

  const driverNewApiCard = {
    orderId: String(order._id),
    orderNumber: order.orderNumber,
    status: String(order.status ?? 'accepted'),
    isHighPriority: false,
    estimatedPayout: typeof order.deliveryFee === 'number' ? order.deliveryFee : order.total,
    itemPrice,
    estTime: null,
    distance: driverToPickupKm != null ? Math.round(driverToPickupKm * 100) / 100 : null,
    vendor: {
      name: vendor.name ?? null,
      address: vendorAddressText,
      lat: vendorAddress?.lat ?? null,
      lng: vendorAddress?.lng ?? null,
      phone: vendor.phone ?? null,
    },
    customer: {
      name: customer?.name ?? null,
      phone: customer?.phone ?? null,
    },
    dropoff: {
      address: dropoffAddressText,
      lat: deliveryAddress?.lat ?? null,
      lng: deliveryAddress?.lng ?? null,
    },
    pickingUpEtaMinutes: estimatedTimeMinutes,
    statusLabel: 'PICKING UP',
    deliveredAt: null,
    deliveryDurationMinutes: null,
    statusBadge: null,
  };

  return { notifyPayload, driverNewApiCard };
}

/** Socket + FCM + in-app notification for one driver on one order (vendor accept or late join). */
export async function notifyDriverOfOrderRequest(params: {
  order: OrderBroadcastDoc;
  vendor: VendorBroadcastDoc;
  customer: { name?: string; phone?: string } | null;
  driver: { _id: unknown; fcmTokens?: Array<{ token: string }> };
  driverToPickupKm: number;
  assignmentDeadline: Date;
  vendorId: string;
  io?: SocketIOServer;
}): Promise<void> {
  const { order, vendor, customer, driver, driverToPickupKm, assignmentDeadline, vendorId, io } = params;
  const driverId = String(driver._id ?? '');
  if (!driverId) return;

  const { notifyPayload, driverNewApiCard } = buildDriverRequestPayloads(
    order,
    vendor,
    customer,
    assignmentDeadline,
    driverToPickupKm
  );

  if (io) {
    const room = `driver:${driverId}`;
    io.to(room).emit('order:driver_request', notifyPayload);
  }

  if ((driver.fcmTokens ?? []).length > 0) {
    try {
      await sendPushToDriver(driver, {
        title: '🚚 Delivery Request',
        body: `New order from ${notifyPayload.vendorName}. Tap to accept!`,
        data: {
          screen: 'NewOrders',
          orderId: String(order._id),
          vendorId: String(vendorId),
          orderPayload: JSON.stringify({ data: [driverNewApiCard] }),
        },
      });
    } catch {
      // best effort
    }
  }

  const existingNotif = await DriverNotification.findOne({
    driver: new mongoose.Types.ObjectId(driverId),
    orderId: order._id,
    type: 'new_order',
  })
    .select('_id')
    .lean();
  if (!existingNotif) {
    await DriverNotification.create({
      driver: new mongoose.Types.ObjectId(driverId),
      type: 'new_order',
      title: 'New Order Available',
      body: 'A new delivery request is nearby. Tap to view details and accept it.',
      orderId: order._id,
      read: false,
      data: {
        estimatedPayout: order.deliveryFee ?? 0,
        orderNumber: order.orderNumber,
      },
    });
  }
}

/** Vendor accept: notify each nearby driver (existing behaviour, shared payload). */
export async function notifyNearbyDriversOnVendorAccept(params: {
  order: OrderBroadcastDoc;
  vendor: VendorBroadcastDoc;
  customer: { name?: string; phone?: string } | null;
  nearbyDrivers: NearbyDriver[];
  assignmentDeadline: Date;
  vendorId: string;
  io?: SocketIOServer;
}): Promise<void> {
  const { order, vendor, customer, nearbyDrivers, assignmentDeadline, vendorId, io } = params;
  for (const driver of nearbyDrivers) {
    const driverToPickupKm = Number((driver as { distanceKm?: number }).distanceKm);
    if (!Number.isFinite(driverToPickupKm)) continue;
    await notifyDriverOfOrderRequest({
      order,
      vendor,
      customer,
      driver: driver as { _id: unknown; fcmTokens?: Array<{ token: string }> },
      driverToPickupKm,
      assignmentDeadline,
      vendorId,
      io,
    });
  }
}

/**
 * Late join: driver went online (or moved in range) during assignment window.
 * Adds driver to broadcast lists and emits existing order:driver_request.
 */
export async function tryRebroadcastOpenOrdersToDriver(
  driverId: string,
  io?: SocketIOServer
): Promise<void> {
  if (!mongoose.Types.ObjectId.isValid(driverId)) return;

  const now = Date.now();
  const last = lastRebroadcastAt.get(driverId) ?? 0;
  if (now - last < rebroadcastDebounceMs) return;
  lastRebroadcastAt.set(driverId, now);

  const driverObjectId = new mongoose.Types.ObjectId(driverId);
  const driver = await Driver.findById(driverObjectId)
    .select('approvalStatus status isOnline isAvailable currentOrderId currentLocation liveLocation fcmTokens name')
    .lean();
  if (!isDriverEligibleForOpenOrderBroadcast(driver)) return;

  const driverPos = resolveDriverLatLng(
    driver as {
      currentLocation?: { lat?: unknown; lng?: unknown };
      liveLocation?: { coordinates?: number[] };
    }
  );
  if (!driverPos) return;

  const openOrders = await Order.find({
    status: 'accepted',
    driver_assigned: false,
    driverAssignmentDeadline: { $gt: new Date() },
    rejectedByDrivers: { $ne: driverObjectId },
    broadcastedToDrivers: { $ne: driverObjectId },
  })
    .select(
      'orderNumber status subtotal total deliveryFee deliveryAddress estimatedDeliveryTime driverAssignmentDeadline vendorId customerId items'
    )
    .sort({ createdAt: -1 })
    .limit(30)
    .lean();

  for (const order of openOrders) {
    const vendorId = order.vendorId;
    if (!vendorId) continue;

    const vendor = await Vendor.findById(vendorId).select('name address phone').lean();
    if (!vendor) continue;

    const vendorLat = Number((vendor as VendorBroadcastDoc).address?.lat);
    const vendorLng = Number((vendor as VendorBroadcastDoc).address?.lng);
    if (!Number.isFinite(vendorLat) || !Number.isFinite(vendorLng)) continue;

    const distanceKm = haversineKm(driverPos.lat, driverPos.lng, vendorLat, vendorLng);
    if (distanceKm > DRIVER_BROADCAST_RADIUS_KM) continue;

    const updated = await Order.findOneAndUpdate(
      {
        _id: order._id,
        status: 'accepted',
        driver_assigned: false,
        driverAssignmentDeadline: { $gt: new Date() },
        rejectedByDrivers: { $ne: driverObjectId },
        broadcastedToDrivers: { $ne: driverObjectId },
      },
      {
        $addToSet: {
          broadcastedToDrivers: driverObjectId,
          notifiedDriverIds: driverObjectId,
        },
      },
      { new: true }
    ).lean();

    if (!updated) continue;

    const deadline = updated.driverAssignmentDeadline ?? order.driverAssignmentDeadline;
    if (!deadline) continue;

    const customer = order.customerId
      ? await User.findById(order.customerId).select('name phone').lean()
      : null;

    await notifyDriverOfOrderRequest({
      order: updated as OrderBroadcastDoc,
      vendor: vendor as VendorBroadcastDoc,
      customer: customer as { name?: string; phone?: string } | null,
      driver: driver as { _id: unknown; fcmTokens?: Array<{ token: string }> },
      driverToPickupKm: distanceKm,
      assignmentDeadline: new Date(deadline),
      vendorId: String(vendorId),
      io,
    });
  }
}
