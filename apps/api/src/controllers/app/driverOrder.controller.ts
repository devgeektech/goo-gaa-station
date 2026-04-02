import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Order } from '../../models/Order';
import { Driver } from '../../models/Driver';
import { User } from '../../models/User';
import { AppError } from '../../utils/AppError';
import { MESSAGES } from '../../constants/messages';
import { sendSuccess } from '../../utils/response';
import { asyncHandler } from '../../utils/asyncHandler';
import { parsePagination } from '../../utils/pagination';
import { transitionOrderStatus } from '../../services/orderStatus.service';
import { sendToMultiple } from '../../services/fcm.service';
import type { Server as SocketIOServer } from 'socket.io';

const STATUS_FLOW = ['accepted', 'confirmed', 'preparing', 'ready', 'picked_up', 'on_the_way', 'delivered'] as const;

function getIo(req: Request): SocketIOServer | undefined {
  return (req.app as { get?(key: string): unknown }).get?.('io') as SocketIOServer | undefined;
}

function toPaginated<T>(data: T[], total: number, page: number, limit: number) {
  const totalPages = Math.ceil(total / limit) || 1;
  return { data, total, page, limit, totalPages, hasNext: page < totalPages, hasPrev: page > 1 };
}

/** GET /available — Orders near driver (status confirmed, no driver) */
export const getAvailableOrders = asyncHandler(async (req: Request, res: Response) => {
  const driverId = req.driver?._id?.toString?.() ?? req.user?._id;
  if (!driverId) throw new AppError({ en: MESSAGES.AUTH.en.unauthorized, de: MESSAGES.AUTH.de.unauthorized }, 401);

  const driver = await Driver.findById(driverId).select('liveLocation deliveryZones approvalStatus status isOnline').lean();
  if (!driver || (driver as { approvalStatus?: string }).approvalStatus !== 'approved' || (driver as { status?: string }).status !== 'active' || !(driver as { isOnline?: boolean }).isOnline) {
    throw new AppError({ en: 'Driver must be approved, active and online', de: 'Fahrer muss genehmigt, aktiv und online sein' }, 403, 'FORBIDDEN');
  }

  const orders = await Order.find({ status: { $in: ['accepted', 'confirmed'] }, driverId: null }).lean();
  const loc = (driver as { liveLocation?: { coordinates?: number[] } }).liveLocation?.coordinates;
  const driverLng = loc?.[0] ?? 0;
  const driverLat = loc?.[1] ?? 0;

  const withDistance = orders.map((o: { deliveryAddress?: { lat?: number; lng?: number }; _id?: unknown; toObject?: () => unknown }) => {
    const addr = o.deliveryAddress;
    const lat = addr?.lat ?? 0;
    const lng = addr?.lng ?? 0;
    const d = Math.sqrt((lat - driverLat) ** 2 + (lng - driverLng) ** 2) * 111;
    return { ...o, distance: Math.round(d * 100) / 100 };
  });
  withDistance.sort((a: { distance: number }, b: { distance: number }) => a.distance - b.distance);

  return sendSuccess(res, withDistance);
});

/** PATCH /:id/accept */
export const acceptOrder = asyncHandler(async (req: Request, res: Response) => {
  const driverId = req.driver?._id?.toString?.() ?? req.user?._id;
  const orderId = req.params.id;
  if (!driverId) throw new AppError({ en: MESSAGES.AUTH.en.unauthorized, de: MESSAGES.AUTH.de.unauthorized }, 401);
  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    throw new AppError({ en: MESSAGES.ORDER.en.notFound, de: MESSAGES.ORDER.de.notFound }, 404);
  }

  const driver = await Driver.findById(driverId).select('name phone vehicleType vehicleNumber approvalStatus status isAvailable currentOrderId');
  if (!driver || driver.approvalStatus !== 'approved' || driver.status !== 'active') {
    throw new AppError({ en: MESSAGES.DRIVER.en.notFound, de: MESSAGES.DRIVER.de.notFound }, 403);
  }
  if (!driver.isAvailable || driver.currentOrderId) {
    throw new AppError({ en: 'Driver is not available', de: 'Fahrer nicht verfügbar' }, 400, 'DRIVER_BUSY');
  }

  const order = await Order.findById(orderId).select(
    'status driver_assigned notifiedDriverIds driverAssignmentDeadline customerId vendorId orderNumber total deliveryAddress'
  );
  if (!order) {
    throw new AppError({ en: MESSAGES.ORDER.en.notFound, de: MESSAGES.ORDER.de.notFound }, 404);
  }
  const io = getIo(req);
  if (order.status !== 'accepted') {
    throw new AppError({ en: 'Order is not in accepted state', de: 'Bestellung nicht im angenommenen Status' }, 400, 'INVALID_STATUS');
  }
  if ((order as unknown as { driver_assigned?: boolean }).driver_assigned === true) {
    throw new AppError({ en: 'Order already taken by another driver', de: 'Bestellung bereits vergeben' }, 409, 'CONFLICT');
  }

  const notifiedIds = ((order as unknown as { notifiedDriverIds?: Array<mongoose.Types.ObjectId | string> }).notifiedDriverIds ?? []).map(String);
  if (!notifiedIds.includes(String(driverId))) {
    throw new AppError({ en: 'Driver is not eligible for this order', de: 'Fahrer ist für diese Bestellung nicht berechtigt' }, 403, 'FORBIDDEN');
  }

  const deadline = (order as unknown as { driverAssignmentDeadline?: Date | null }).driverAssignmentDeadline ?? null;
  const now = new Date();
  if (!deadline || now.getTime() > new Date(deadline).getTime()) {
    throw new AppError({ en: 'Assignment window expired', de: 'Zuweisungsfenster abgelaufen' }, 400, 'ASSIGNMENT_EXPIRED');
  }

  const updated = await Order.findOneAndUpdate(
    {
      _id: orderId,
      driver_assigned: false,
      status: 'accepted',
      notifiedDriverIds: new mongoose.Types.ObjectId(String(driverId)),
      driverAssignmentDeadline: { $gt: now },
    },
    {
      $set: {
        driverId: new mongoose.Types.ObjectId(String(driverId)),
        driver_assigned: true,
        driverAssignmentDeadline: null,
        status: 'preparing',
      },
      $push: {
        statusHistory: {
          status: 'preparing',
          timestamp: now,
          note: `Driver ${driver.name ?? 'Driver'} accepted and assigned`,
          updatedBy: 'driver',
          changedByModel: 'Driver',
        },
      },
    },
    { new: true }
  );

  if (!updated) {
    throw new AppError({ en: 'Order already taken by another driver', de: 'Bestellung bereits von anderem Fahrer angenommen' }, 409, 'CONFLICT');
  }

  await Driver.findByIdAndUpdate(driverId, {
    // Schema does not support "busy" enum status; use availability/current assignment.
    isAvailable: false,
    currentOrderId: updated._id,
  });

  const driverVehicle = [driver.vehicleType, driver.vehicleNumber].filter(Boolean).join(' ');
  if (io) {
    io.to(`vendor:${updated.vendorId}`).emit('order:driver_assigned', {
      orderId: updated._id,
      driverName: driver.name ?? 'Driver',
      driverPhone: driver.phone ?? null,
      driverVehicle: driverVehicle || null,
      status: 'preparing',
    });
    io.to(`customer:${updated.customerId}`).emit('order:preparing', {
      orderId: updated._id,
      status: 'preparing',
      driverName: driver.name ?? 'Driver',
      estimatedDelivery: (updated as unknown as { estimatedDeliveryTime?: number | null }).estimatedDeliveryTime ?? null,
    });
    io.to('admin').emit('order:driver_assigned', {
      orderId: updated._id,
      driverId: String(driverId),
      vendorId: String(updated.vendorId),
      status: 'preparing',
    });
    for (const otherId of notifiedIds.filter((id) => id !== String(driverId))) {
      io.to(`driver:${otherId}`).emit('order:taken', {
        orderId: updated._id,
        status: 'taken',
      });
    }
  }

  try {
    const customer = await User.findById(updated.customerId).select('fcmTokens').lean();
    const tokens =
      ((customer as { fcmTokens?: Array<{ token?: string | null }> } | null)?.fcmTokens ?? [])
        .map((t) => t?.token ?? '')
        .filter(Boolean);
    if (tokens.length > 0) {
      await sendToMultiple(tokens as string[], {
        title: 'Your order is being prepared! Driver assigned.',
        body: 'Your order is being prepared! Driver assigned.',
        data: { screen: 'OrderDetail', orderId: String(updated._id) },
      });
    }
  } catch {
    // best effort
  }

  const doc = await Order.findById(updated._id).populate('driverId', 'name phone vehicleType vehicleNumber').lean();
  return sendSuccess(res, doc ?? (updated.toObject?.() ?? updated));
});

/** PATCH /:id/status */
export const updateOrderStatus = asyncHandler(async (req: Request, res: Response) => {
  const driverId = req.driver?._id?.toString?.() ?? req.user?._id;
  const orderId = req.params.id;
  const { status, note } = req.body ?? {};
  if (!driverId) throw new AppError({ en: MESSAGES.AUTH.en.unauthorized, de: MESSAGES.AUTH.de.unauthorized }, 401);
  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    throw new AppError({ en: MESSAGES.ORDER.en.notFound, de: MESSAGES.ORDER.de.notFound }, 404);
  }
  if (!STATUS_FLOW.includes(status)) {
    throw new AppError({ en: 'Invalid status', de: 'Ungültiger Status' }, 400, 'VALIDATION_ERROR');
  }

  const order = await Order.findOne({ _id: orderId, driverId });
  if (!order) throw new AppError({ en: MESSAGES.ORDER.en.notFound, de: MESSAGES.ORDER.de.notFound }, 404);
  const currentIdx = STATUS_FLOW.indexOf(order.status as (typeof STATUS_FLOW)[number]);
  const newIdx = STATUS_FLOW.indexOf(status);
  if (currentIdx < 0 || newIdx <= currentIdx) {
    throw new AppError({ en: 'Status can only advance forward', de: 'Status kann nur vorwärts geändert werden' }, 400, 'INVALID_STATUS');
  }

  if (status === 'delivered') {
    await Driver.findByIdAndUpdate(driverId, { currentOrderId: null, isAvailable: true, $inc: { totalDeliveries: 1 } });
  }

  await transitionOrderStatus(order, {
    status,
    note: note ? String(note) : undefined,
    changedBy: driverId,
    changedByModel: 'Driver',
  }, getIo(req));

  const doc = order.toObject();
  return sendSuccess(res, doc);
});

/** GET /active */
export const getActiveOrder = asyncHandler(async (req: Request, res: Response) => {
  const driverId = req.driver?._id?.toString?.() ?? req.user?._id;
  if (!driverId) throw new AppError({ en: MESSAGES.AUTH.en.unauthorized, de: MESSAGES.AUTH.de.unauthorized }, 401);

  const order = await Order.findOne({
    driverId,
    status: { $nin: ['delivered', 'cancelled'] },
  }).populate('customerId', 'name phone').lean();

  return sendSuccess(res, order);
});

/** GET /history */
export const getDeliveryHistory = asyncHandler(async (req: Request, res: Response) => {
  const driverId = req.driver?._id?.toString?.() ?? req.user?._id;
  if (!driverId) throw new AppError({ en: MESSAGES.AUTH.en.unauthorized, de: MESSAGES.AUTH.de.unauthorized }, 401);

  const { page, limit } = parsePagination(req.query);

  const [orders, total] = await Promise.all([
    Order.find({ driverId, status: 'delivered' }).lean().sort({ actualDeliveryAt: -1 }).skip((page - 1) * limit).limit(limit),
    Order.countDocuments({ driverId, status: 'delivered' }),
  ]);

  const withEarnings = orders.map((o: { total?: number; _id?: unknown }) => ({ ...o, earnings: (o as { total?: number }).total ?? 0 }));
  return sendSuccess(res, withEarnings, 200, toPaginated(withEarnings, total, page, limit));
});

/** PATCH /:id/pickup — Driver picks up ready order */
export const pickupOrder = asyncHandler(async (req: Request, res: Response) => {
  const driverId = req.driver?._id?.toString?.() ?? req.user?._id;
  const orderId = req.params.id;
  if (!driverId) throw new AppError({ en: MESSAGES.AUTH.en.unauthorized, de: MESSAGES.AUTH.de.unauthorized }, 401);

  const driver = await Driver.findById(driverId).select('name phone liveLocation');
  if (!driver) throw new AppError({ en: MESSAGES.DRIVER.en.notFound, de: MESSAGES.DRIVER.de.notFound }, 404);

  const order = await Order.findOne({ _id: orderId, driverId: new mongoose.Types.ObjectId(String(driverId)) });
  if (!order) throw new AppError({ en: MESSAGES.ORDER.en.notFound, de: MESSAGES.ORDER.de.notFound }, 404);
  if (order.status !== 'ready') {
    throw new AppError({ en: 'Order must be ready', de: 'Bestellung muss bereit sein' }, 400, 'INVALID_STATUS');
  }

  order.status = 'picked_up';
  const now = new Date();
  const history = (order as unknown as { statusHistory?: Array<Record<string, unknown>> }).statusHistory ?? [];
  history.push({ status: 'picked_up', timestamp: now, updatedBy: 'driver', changedByModel: 'Driver' });
  (order as unknown as { statusHistory: typeof history }).statusHistory = history;
  await order.save();

  const io = getIo(req);
  const coords = driver.liveLocation?.coordinates ?? [0, 0];
  if (io) {
    io.to(`customer:${order.customerId}`).emit('order:picked_up', {
      orderId: order._id,
      driverName: driver.name,
      driverPhone: driver.phone,
      driverCurrentLocation: { lat: coords[1] ?? 0, lng: coords[0] ?? 0 },
    });
    io.to(`vendor:${order.vendorId}`).emit('order:status_updated', { orderId: order._id, status: 'picked_up' });
  }

  try {
    const customer = await User.findById(order.customerId).select('fcmTokens').lean();
    const tokens = ((customer as { fcmTokens?: Array<{ token?: string | null }> } | null)?.fcmTokens ?? [])
      .map((t) => t?.token ?? '')
      .filter(Boolean);
    if (tokens.length > 0) {
      await sendToMultiple(tokens as string[], {
        title: `🚚 ${driver.name} has picked up your order!`,
        body: `🚚 ${driver.name} has picked up your order!`,
        data: { screen: 'OrderDetail', orderId: String(order._id) },
      });
    }
  } catch {
    // best effort
  }

  return sendSuccess(res, order.toObject?.() ?? order);
});

/** PATCH /:id/enroute — Driver starts delivery to customer */
export const enrouteOrder = asyncHandler(async (req: Request, res: Response) => {
  const driverId = req.driver?._id?.toString?.() ?? req.user?._id;
  const orderId = req.params.id;
  if (!driverId) throw new AppError({ en: MESSAGES.AUTH.en.unauthorized, de: MESSAGES.AUTH.de.unauthorized }, 401);

  const order = await Order.findOne({ _id: orderId, driverId: new mongoose.Types.ObjectId(String(driverId)) });
  if (!order) throw new AppError({ en: MESSAGES.ORDER.en.notFound, de: MESSAGES.ORDER.de.notFound }, 404);
  if (order.status !== 'picked_up') {
    throw new AppError({ en: 'Order must be picked_up', de: 'Bestellung muss abgeholt sein' }, 400, 'INVALID_STATUS');
  }

  order.status = 'on_the_way';
  const now = new Date();
  const history = (order as unknown as { statusHistory?: Array<Record<string, unknown>> }).statusHistory ?? [];
  history.push({ status: 'on_the_way', timestamp: now, updatedBy: 'driver', changedByModel: 'Driver' });
  (order as unknown as { statusHistory: typeof history }).statusHistory = history;
  await order.save();

  const io = getIo(req);
  if (io) {
    io.to(`customer:${order.customerId}`).emit('order:on_the_way', {
      orderId: order._id,
      status: 'on_the_way',
      deliveryOtp: order.deliveryOtp,
    });
    io.to(`customer:${order.customerId}`).emit('order:status_updated', {
      orderId: order._id,
      status: 'on_the_way',
      message: 'Your order is on the way.',
    });
  }

  try {
    const customer = await User.findById(order.customerId).select('fcmTokens').lean();
    const tokens = ((customer as { fcmTokens?: Array<{ token?: string | null }> } | null)?.fcmTokens ?? [])
      .map((t) => t?.token ?? '')
      .filter(Boolean);
    if (tokens.length > 0) {
      await sendToMultiple(tokens as string[], {
        title: `🏃 Your order is on the way! Your delivery code: ${order.deliveryOtp ?? ''}`,
        body: `🏃 Your order is on the way! Your delivery code: ${order.deliveryOtp ?? ''}`,
        data: { screen: 'OrderDetail', orderId: String(order._id) },
      });
    }
  } catch {
    // best effort
  }

  return sendSuccess(res, order.toObject?.() ?? order);
});

/** PATCH /:id/deliver — Driver delivers order after OTP verification */
export const deliverOrder = asyncHandler(async (req: Request, res: Response) => {
  const driverId = req.driver?._id?.toString?.() ?? req.user?._id;
  const orderId = req.params.id;
  const otp = String((req.body ?? {}).otp ?? '').trim();
  if (!driverId) throw new AppError({ en: MESSAGES.AUTH.en.unauthorized, de: MESSAGES.AUTH.de.unauthorized }, 401);

  const order = await Order.findOne({ _id: orderId, driverId: new mongoose.Types.ObjectId(String(driverId)) });
  if (!order) throw new AppError({ en: MESSAGES.ORDER.en.notFound, de: MESSAGES.ORDER.de.notFound }, 404);
  if (order.status !== 'on_the_way') {
    throw new AppError({ en: 'Order must be on_the_way', de: 'Bestellung muss unterwegs sein' }, 400, 'INVALID_STATUS');
  }
  if (otp !== String(order.deliveryOtp ?? '')) {
    throw new AppError({ en: 'Incorrect delivery code', de: 'Falscher Liefercode' }, 400, 'INVALID_OTP');
  }

  order.status = 'delivered';
  if (order.paymentStatus === 'pending') order.paymentStatus = 'paid';
  const now = new Date();
  order.actualDeliveryAt = now;
  const history = (order as unknown as { statusHistory?: Array<Record<string, unknown>> }).statusHistory ?? [];
  history.push({ status: 'delivered', timestamp: now, updatedBy: 'driver', changedByModel: 'Driver' });
  (order as unknown as { statusHistory: typeof history }).statusHistory = history;
  await order.save();

  await Driver.findByIdAndUpdate(driverId, {
    isAvailable: true,
    isOnline: true,
    currentOrderId: null,
    $inc: { totalDeliveries: 1 },
  });
  await User.findByIdAndUpdate(order.customerId, {
    $inc: { totalOrders: 1, points: Math.floor(Number(order.total || 0)) },
  });

  const driver = await Driver.findById(driverId).select('name').lean();
  const io = getIo(req);
  if (io) {
    io.to(`customer:${order.customerId}`).emit('order:delivered', { orderId: order._id, status: 'delivered' });
    io.to(`customer:${order.customerId}`).emit('order:status_updated', {
      orderId: order._id,
      status: 'delivered',
      message: 'Your order has been delivered.',
    });
    io.to(`vendor:${order.vendorId}`).emit('order:delivered', { orderId: order._id, status: 'delivered' });
    io.to('admin').emit('order:delivered', {
      orderId: order._id,
      vendorId: order.vendorId,
      driverId: order.driverId,
      totalAmount: order.total,
    });
  }

  try {
    const customer = await User.findById(order.customerId).select('fcmTokens').lean();
    const tokens = ((customer as { fcmTokens?: Array<{ token?: string | null }> } | null)?.fcmTokens ?? [])
      .map((t) => t?.token ?? '')
      .filter(Boolean);
    if (tokens.length > 0) {
      await sendToMultiple(tokens as string[], {
        title: '🎉 Order delivered! How was your food? Rate your experience.',
        body: '🎉 Order delivered! How was your food? Rate your experience.',
        data: { screen: 'RateOrder', orderId: String(order._id) },
      });
    }
  } catch {
    // best effort
  }

  return sendSuccess(res, {
    ...(order.toObject?.() ?? order),
    driverName: (driver as { name?: string } | null)?.name ?? null,
  });
});
