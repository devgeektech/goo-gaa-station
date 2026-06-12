import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Order } from '../../models/Order';
import { User } from '../../models/User';
import { Vendor } from '../../models/Vendor';
import { Driver } from '../../models/Driver';
import { AppError } from '../../utils/AppError';
import { sendSuccess } from '../../utils/response';
import { asyncHandler } from '../../utils/asyncHandler';
import { parsePagination } from '../../utils/pagination';
import { initiateRefund } from '../../services/refundService';
import { sendPushToCustomer, sendPushToDriver } from '../../services/fcm.service';
import { saveCustomerInAppNotification } from '../../services/customerNotification.service';
import { DRIVER_ASSIGNMENT_WINDOW_MS } from '../../constants/driverAssignment';
import { findNearbyDrivers } from '../../services/driverAssignmentService';
import { notifyNearbyDriversOnVendorAccept } from '../../services/driverOpenOrderBroadcast.service';
import type { Server as SocketIOServer } from 'socket.io';
import { VENDOR_CURRENT_ORDER_STATUSES, VENDOR_NEW_ORDER_STATUS } from '../../constants/vendorOrderStatuses';

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  pending: ['accepted'],
  accepted: ['preparing'],
  preparing: ['picked_up'],
  picked_up: ['delivered'],
};

function getIo(req: Request): SocketIOServer | undefined {
  return (req.app as { get?(key: string): unknown }).get?.('io') as SocketIOServer | undefined;
}

function withRemainingTime<T extends Record<string, unknown>>(order: T): T & { remainingTime: number } {
  const deadline = (order as { vendorResponseDeadline?: Date | string | null }).vendorResponseDeadline;
  if (!deadline) return { ...(order as object), remainingTime: 0 } as T & { remainingTime: number };
  const ms = new Date(deadline).getTime() - Date.now();
  return {
    ...(order as object),
    remainingTime: Math.max(0, Math.ceil(ms / 1000)),
  } as T & { remainingTime: number };
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function kmToMiles(km: number): number {
  return km * 0.621371;
}

/** GET / — List orders for vendor; filter by ?status=; paginate; populate customer */
export const getVendorOrders = asyncHandler(async (req: Request, res: Response) => {
  const vendorId = (req as Request & { vendor?: { _id: unknown } }).vendor?._id;
  if (!vendorId) throw new AppError({ en: 'Unauthorized', de: 'Nicht autorisiert' }, 401, 'UNAUTHORIZED');

  const { page, limit } = parsePagination(req.query, 20);
  const statusQ = String(req.query.status || '').trim();
  const filter: Record<string, unknown> = { vendorId: new mongoose.Types.ObjectId(String(vendorId)) };
  if (statusQ) filter.status = statusQ;

  const [orders, total] = await Promise.all([
    Order.find(filter)
      .populate('customerId', 'name phone')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Order.countDocuments(filter),
  ]);
  const pages = Math.ceil(total / limit) || 1;
  return sendSuccess(res, { orders, total, page, pages });
});

/** GET /new — Vendor tab: newly notified orders */
export const getNewOrders = asyncHandler(async (req: Request, res: Response) => {
  const vendorId = (req as Request & { vendor?: { _id: unknown } }).vendor?._id;
  if (!vendorId) throw new AppError({ en: 'Unauthorized', de: 'Nicht autorisiert' }, 401, 'UNAUTHORIZED');

  const { page, limit } = parsePagination(req.query, 20);
  const filter: Record<string, unknown> = {
    vendorId: new mongoose.Types.ObjectId(String(vendorId)),
    status: VENDOR_NEW_ORDER_STATUS,
  };
  const [orders, total] = await Promise.all([
    Order.find(filter)
      .populate('customerId', 'name phone')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Order.countDocuments(filter),
  ]);
  const pages = Math.ceil(total / limit) || 1;
  const withTimer = orders.map((o) => withRemainingTime(o as Record<string, unknown>));
  return sendSuccess(res, { orders: withTimer, total, page, pages });
});

/** GET /current — Vendor tab: accepted/in-progress orders */
export const getCurrentOrders = asyncHandler(async (req: Request, res: Response) => {
  const vendorId = (req as Request & { vendor?: { _id: unknown } }).vendor?._id;
  if (!vendorId) throw new AppError({ en: 'Unauthorized', de: 'Nicht autorisiert' }, 401, 'UNAUTHORIZED');

  const { page, limit } = parsePagination(req.query, 20);
  const filter: Record<string, unknown> = {
    vendorId: new mongoose.Types.ObjectId(String(vendorId)),
    status: { $in: [...VENDOR_CURRENT_ORDER_STATUSES] },
  };
  const [orders, total] = await Promise.all([
    Order.find(filter)
      .populate('customerId', 'name phone')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Order.countDocuments(filter),
  ]);
  const pages = Math.ceil(total / limit) || 1;
  const withTimer = orders.map((o) => withRemainingTime(o as Record<string, unknown>));
  return sendSuccess(res, { orders: withTimer, total, page, pages });
});

/** GET /completed — Vendor tab: delivered/cancelled orders */
export const getCompletedOrders = asyncHandler(async (req: Request, res: Response) => {
  const vendorId = (req as Request & { vendor?: { _id: unknown } }).vendor?._id;
  if (!vendorId) throw new AppError({ en: 'Unauthorized', de: 'Nicht autorisiert' }, 401, 'UNAUTHORIZED');

  const { page, limit } = parsePagination(req.query, 20);
  const filter: Record<string, unknown> = {
    vendorId: new mongoose.Types.ObjectId(String(vendorId)),
    status: { $in: ['delivered', 'cancelled'] },
  };
  const [orders, total] = await Promise.all([
    Order.find(filter)
      .populate('customerId', 'name phone')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Order.countDocuments(filter),
  ]);
  const pages = Math.ceil(total / limit) || 1;
  const withTimer = orders.map((o) => withRemainingTime(o as Record<string, unknown>));
  return sendSuccess(res, { orders: withTimer, total, page, pages });
});

/** GET /:id — Single order; 403 if wrong vendor */
export const getVendorOrder = asyncHandler(async (req: Request, res: Response) => {
  const vendorId = (req as Request & { vendor?: { _id: unknown } }).vendor?._id;
  const id = req.params.id;
  if (!vendorId) throw new AppError({ en: 'Unauthorized', de: 'Nicht autorisiert' }, 401, 'UNAUTHORIZED');
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError({ en: 'Order not found', de: 'Bestellung nicht gefunden' }, 404, 'NOT_FOUND');
  }

  const order = await Order.findById(id).populate('customerId', 'name phone').lean();
  if (!order) throw new AppError({ en: 'Order not found', de: 'Bestellung nicht gefunden' }, 404, 'NOT_FOUND');
  const o = order as { vendorId?: unknown };
  if (String(o.vendorId) !== String(vendorId)) {
    throw new AppError({ en: 'Forbidden', de: 'Verboten' }, 403, 'FORBIDDEN');
  }
  return sendSuccess(res, order);
});

/** PATCH /:id/accept — Accept vendor_notified order before deadline */
export const acceptOrder = asyncHandler(async (req: Request, res: Response) => {
  const vendorId = (req as Request & { vendor?: { _id: unknown } }).vendor?._id;
  const id = req.params.id;
  if (!vendorId) throw new AppError({ en: 'Unauthorized', de: 'Nicht autorisiert' }, 401, 'UNAUTHORIZED');
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError({ en: 'Order not found', de: 'Bestellung nicht gefunden' }, 404, 'NOT_FOUND');
  }

  const order = await Order.findById(id);
  if (!order) throw new AppError({ en: 'Order not found', de: 'Bestellung nicht gefunden' }, 404, 'NOT_FOUND');
  if (String((order as { vendorId?: unknown }).vendorId) !== String(vendorId)) {
    throw new AppError({ en: 'Forbidden', de: 'Verboten' }, 403, 'FORBIDDEN');
  }
  if (order.status !== 'vendor_notified') {
    throw new AppError({ en: 'Order cannot be accepted in current status', de: 'Bestellung kann nicht angenommen werden' }, 400, 'INVALID_STATUS');
  }

  const now = new Date();
  const deadline = (order as unknown as { vendorResponseDeadline?: Date | null }).vendorResponseDeadline ?? null;
  if (deadline && now.getTime() > new Date(deadline).getTime()) {
    throw new AppError({ en: 'Order expired', de: 'Bestellung abgelaufen' }, 400, 'ORDER_EXPIRED');
  }

  // Atomic accept to prevent double-accept/reject race.
  const acceptedOrder = await Order.findOneAndUpdate(
    {
      _id: order._id,
      vendorId: new mongoose.Types.ObjectId(String(vendorId)),
      status: 'vendor_notified',
    },
    {
      $set: {
        status: 'accepted',
        vendorResponseStatus: 'accepted',
        vendorRespondedAt: now,
      },
      $push: {
        statusHistory: {
          status: 'accepted',
          timestamp: now,
          updatedBy: 'vendor',
          changedByModel: 'System',
        },
      },
    },
    { new: true }
  );
  if (!acceptedOrder) {
    throw new AppError({ en: 'Order already processed', de: 'Bestellung bereits verarbeitet' }, 400, 'ALREADY_PROCESSED');
  }

  try {
    const customer = await User.findById(acceptedOrder.customerId).select('fcmToken fcmTokens notificationPrefs').lean();
    if (customer) {
      const pushTitle = 'Order Accepted';
      const pushBody = 'Your order has been accepted by the vendor.';
      await sendPushToCustomer(customer as { _id?: unknown; fcmToken?: string | null; fcmTokens?: Array<{ token: string }>; notificationPrefs?: { push?: boolean; orderUpdates?: boolean } }, {
        title: pushTitle,
        body: pushBody,
        data: { orderId: String(acceptedOrder._id), screen: 'OrderDetail' },
      });
      await saveCustomerInAppNotification({
        customerId: customer._id as mongoose.Types.ObjectId,
        type: 'order_accepted',
        title: pushTitle,
        body: pushBody,
        orderId: acceptedOrder._id,
        orderNumber: acceptedOrder.orderNumber ?? null,
        screen: 'OrderDetail',
        notificationPrefs: (customer as { notificationPrefs?: { orderUpdates?: boolean } }).notificationPrefs,
      });
    }
  } catch {
    // Do not fail accept flow when FCM fails.
  }

  const io = getIo(req);
  if (io) {
    io.to('admin').emit('order:accepted', { orderId: acceptedOrder._id, vendorId: String(vendorId) });
    io.to(`customer:${acceptedOrder.customerId}`).emit('order:accepted', { orderId: acceptedOrder._id, vendorId: String(vendorId) });
    io.to(`customer:${acceptedOrder.customerId}`).emit('order:status_updated', {
      orderId: acceptedOrder._id,
      status: 'accepted',
      message: 'Your order has been accepted by the vendor.',
    });
  }

  const assignmentDeadline = new Date(Date.now() + DRIVER_ASSIGNMENT_WINDOW_MS);
  await Order.findByIdAndUpdate(acceptedOrder._id, {
    $set: {
      driver_assigned: false,
      driverAssignmentDeadline: assignmentDeadline,
    },
  });

  const vendor = await Vendor.findById(vendorId).select('name address phone').lean();
  const customer = await User.findById(acceptedOrder.customerId).select('name phone').lean();
  const vendorLat = Number((vendor as { address?: { lat?: number } } | null)?.address?.lat);
  const vendorLng = Number((vendor as { address?: { lng?: number } } | null)?.address?.lng);
  const nearbyDrivers = await findNearbyDrivers(vendorLat, vendorLng, 5);

  // No drivers online at accept: keep order accepted until driverAssignmentDeadline.
  // Late-join (go online + GPS) can add drivers; timeout worker cancels if none accepts.
  if (nearbyDrivers.length > 0) {
    await notifyNearbyDriversOnVendorAccept({
      order: acceptedOrder as Parameters<typeof notifyNearbyDriversOnVendorAccept>[0]['order'],
      vendor: vendor as Parameters<typeof notifyNearbyDriversOnVendorAccept>[0]['vendor'],
      customer: customer as { name?: string; phone?: string } | null,
      nearbyDrivers,
      assignmentDeadline,
      vendorId: String(vendorId),
      io,
    });

    await Order.findByIdAndUpdate(acceptedOrder._id, {
      $set: {
        notifiedDriverIds: nearbyDrivers.map((d) => (d as { _id: unknown })._id),
        broadcastedToDrivers: nearbyDrivers.map((d) => (d as { _id: unknown })._id),
      },
    });
  } else {
    await Order.findByIdAndUpdate(acceptedOrder._id, {
      $set: {
        notifiedDriverIds: [],
        broadcastedToDrivers: [],
      },
    });
  }

  const updated = await Order.findById(acceptedOrder._id).populate('customerId', 'name phone').lean();
  return sendSuccess(res, updated ?? (acceptedOrder.toObject?.() ?? acceptedOrder));
});

/** PATCH /:id/status — Allowed transitions; push statusHistory; emit order:statusChanged */
export const updateOrderStatus = asyncHandler(async (req: Request, res: Response) => {
  const vendorId = (req as Request & { vendor?: { _id: unknown } }).vendor?._id;
  const id = req.params.id;
  const newStatus = (req.body ?? {}).status as string | undefined;
  const note = (req.body ?? {}).note as string | undefined;
  if (!vendorId) throw new AppError({ en: 'Unauthorized', de: 'Nicht autorisiert' }, 401, 'UNAUTHORIZED');
  if (!newStatus || !mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError({ en: 'Order not found or status required', de: 'Status erforderlich' }, 400, 'VALIDATION_ERROR');
  }

  const order = await Order.findOne({ _id: id, vendorId: new mongoose.Types.ObjectId(String(vendorId)) });
  if (!order) throw new AppError({ en: 'Order not found', de: 'Bestellung nicht gefunden' }, 404, 'NOT_FOUND');

  const currentStatus = order.status;
  const allowed = ALLOWED_TRANSITIONS[currentStatus];
  if (!allowed || !allowed.includes(newStatus)) {
    throw new AppError(
      { en: `Cannot transition from ${currentStatus} to ${newStatus}`, de: 'Ungültiger Statuswechsel' },
      409,
      'INVALID_TRANSITION'
    );
  }

  const history = (order as { statusHistory?: Array<{ status: string; timestamp: Date; note?: string; changedByModel?: string }> }).statusHistory ?? [];
  history.push({
    status: newStatus,
    timestamp: new Date(),
    note: note ?? undefined,
    changedByModel: 'System',
  });
  (order as { statusHistory: typeof history }).statusHistory = history;
  order.status = newStatus;
  await order.save();

  const io = getIo(req);
  const payload = { orderId: order._id, orderNumber: order.orderNumber, status: newStatus, vendorId: String(vendorId) };
  if (io) {
    io.to('admin').emit('order:statusChanged', payload);
    io.to(`customer:${order.customerId}`).emit('order:statusChanged', payload);
    io.to(`customer:${order.customerId}`).emit('order:status_updated', {
      orderId: order._id,
      status: newStatus,
      message: `Order status updated to ${newStatus}`,
    });
  }

  return sendSuccess(res, order.toObject?.() ?? order);
});

/** PATCH /:id/reject — Reject vendor_notified order; refund and notify customer */
export const rejectOrder = asyncHandler(async (req: Request, res: Response) => {
  const vendorId = (req as Request & { vendor?: { _id: unknown } }).vendor?._id;
  const id = req.params.id;
  const reasonRaw = (req.body ?? {}).reason;
  const reason = typeof reasonRaw === 'string' ? reasonRaw.trim() : '';
  if (!vendorId) throw new AppError({ en: 'Unauthorized', de: 'Nicht autorisiert' }, 401, 'UNAUTHORIZED');
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError({ en: 'Order not found', de: 'Bestellung nicht gefunden' }, 404, 'NOT_FOUND');
  }
  if (!reason) {
    throw new AppError({ en: 'reason is required', de: 'reason ist erforderlich' }, 400, 'VALIDATION_ERROR');
  }

  const order = await Order.findOne({ _id: id, vendorId: new mongoose.Types.ObjectId(String(vendorId)) });
  if (!order) throw new AppError({ en: 'Order not found', de: 'Bestellung nicht gefunden' }, 404, 'NOT_FOUND');
  if (order.status !== 'vendor_notified') {
    throw new AppError({ en: 'Only vendor_notified orders can be rejected', de: 'Nur benachrichtigte Bestellungen ablehnbar' }, 409, 'INVALID_STATUS');
  }

  const now = new Date();
  const deadline = (order as unknown as { vendorResponseDeadline?: Date | null }).vendorResponseDeadline ?? null;
  if (deadline && now.getTime() > new Date(deadline).getTime()) {
    throw new AppError({ en: 'Order expired', de: 'Bestellung abgelaufen' }, 400, 'ORDER_EXPIRED');
  }

  // Atomic reject to prevent double-accept/reject race.
  const rejectedOrder = await Order.findOneAndUpdate(
    {
      _id: order._id,
      vendorId: new mongoose.Types.ObjectId(String(vendorId)),
      status: 'vendor_notified',
    },
    {
      $set: {
        status: 'cancelled',
        cancelledBy: 'vendor',
        cancellationReason: reason,
        vendorResponseStatus: 'rejected',
        vendorRespondedAt: now,
      },
      $push: {
        statusHistory: {
          status: 'cancelled',
          timestamp: now,
          note: reason,
          updatedBy: 'vendor',
          changedByModel: 'System',
        },
      },
    },
    { new: true }
  );
  if (!rejectedOrder) {
    throw new AppError({ en: 'Order already processed', de: 'Bestellung bereits verarbeitet' }, 400, 'ALREADY_PROCESSED');
  }

  const io = getIo(req);
  try {
    await initiateRefund(
      {
        _id: rejectedOrder._id,
        orderNumber: rejectedOrder.orderNumber,
        customerId: rejectedOrder.customerId,
        paymentMethod: rejectedOrder.paymentMethod,
        paymentStatus: rejectedOrder.paymentStatus,
        total: rejectedOrder.total,
        wifipayRef: rejectedOrder.wifipayRef,
      },
      reason,
      io
    );
  } catch {
    // Do not fail reject flow when refund/push side effects fail.
  }

  if (io) {
    const payload = { orderId: rejectedOrder._id, vendorId: String(vendorId) };
    io.to('admin').emit('order:rejected', payload);
    io.to(`customer:${rejectedOrder.customerId}`).emit('order:rejected', payload);
  }

  return sendSuccess(res, rejectedOrder.toObject?.() ?? rejectedOrder);
});

/** PATCH /:id/ready — Vendor marks preparing order as ready for pickup */
export const markOrderReady = asyncHandler(async (req: Request, res: Response) => {
  const vendorId = (req as Request & { vendor?: { _id: unknown } }).vendor?._id;
  const id = req.params.id;
  if (!vendorId) throw new AppError({ en: 'Unauthorized', de: 'Nicht autorisiert' }, 401, 'UNAUTHORIZED');
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError({ en: 'Order not found', de: 'Bestellung nicht gefunden' }, 404, 'NOT_FOUND');
  }

  const order = await Order.findOne({ _id: id, vendorId: new mongoose.Types.ObjectId(String(vendorId)) });
  if (!order) throw new AppError({ en: 'Order not found', de: 'Bestellung nicht gefunden' }, 404, 'NOT_FOUND');
  if (order.status !== 'preparing') {
    throw new AppError({ en: 'Order must be preparing', de: 'Bestellung muss in Zubereitung sein' }, 422, 'INVALID_STATUS');
  }

  const now = new Date();
  order.status = 'ready';
  const history = (order as unknown as { statusHistory?: Array<Record<string, unknown>> }).statusHistory ?? [];
  history.push({
    status: 'ready',
    updatedBy: 'vendor',
    timestamp: now,
    changedByModel: 'System',
  });
  (order as unknown as { statusHistory: typeof history }).statusHistory = history;
  await order.save();

  const io = getIo(req);
  const vendor = await Vendor.findById(vendorId).select('name address').lean();
  const vendorName = (vendor as { name?: string } | null)?.name ?? 'Vendor';
  const vendorAddress = (vendor as { address?: unknown } | null)?.address ?? null;
  const driverId = String((order as unknown as { driverId?: unknown }).driverId ?? '');
  if (io && driverId) {
    io.to(`driver:${driverId}`).emit('order:ready_for_pickup', {
      orderId: order._id,
      vendorName,
      vendorAddress,
    });
  }
  if (io) {
    io.to(`customer:${order.customerId}`).emit('order:status_updated', {
      orderId: order._id,
      status: 'ready',
      message: 'Your food is ready! Driver is on the way.',
    });
  }

  try {
    const customer = await User.findById(order.customerId).select('fcmToken fcmTokens notificationPrefs').lean();
    if (customer) {
      const pushTitle = 'Your food is ready and waiting for pickup! 🍽️';
      const pushBody = 'Your food is ready and waiting for pickup! 🍽️';
      await sendPushToCustomer(customer as { _id?: unknown; fcmToken?: string | null; fcmTokens?: Array<{ token: string }>; notificationPrefs?: { push?: boolean; orderUpdates?: boolean } }, {
        title: pushTitle,
        body: pushBody,
        data: { screen: 'OrderDetail', orderId: String(order._id) },
      });
      await saveCustomerInAppNotification({
        customerId: customer._id as mongoose.Types.ObjectId,
        type: 'order_ready',
        title: pushTitle,
        body: pushBody,
        orderId: order._id,
        orderNumber: (order as { orderNumber?: string }).orderNumber ?? null,
        screen: 'OrderDetail',
        notificationPrefs: (customer as { notificationPrefs?: { orderUpdates?: boolean } }).notificationPrefs,
      });
    }
  } catch {
    // best effort
  }

  if (driverId) {
    try {
      const driver = await Driver.findById(driverId).select('fcmTokens').lean();
      if (driver) {
        await sendPushToDriver(driver as { _id?: unknown; fcmTokens?: Array<{ token: string }> }, {
          title: `Food is ready for pickup at ${vendorName}`,
          body: `Food is ready for pickup at ${vendorName}`,
          data: {
            data: JSON.stringify({
              data: {
                orderId: String(order._id),
                orderNumber: order.orderNumber,
                vendorName,
                vendorAddress,
                status: 'ready',
              },
            }),
          },
        });
      }
    } catch {
      // best effort
    }
  }

  return sendSuccess(res, order.toObject?.() ?? order);
});
