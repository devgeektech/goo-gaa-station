import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Order } from '../../models/Order';
import { Driver } from '../../models/Driver';
import { AppError } from '../../utils/AppError';
import { MESSAGES } from '../../constants/messages';
import { sendSuccess } from '../../utils/response';
import { asyncHandler } from '../../utils/asyncHandler';
import { parsePagination } from '../../utils/pagination';
import { transitionOrderStatus } from '../../services/orderStatus.service';
import type { Server as SocketIOServer } from 'socket.io';

const STATUS_FLOW = ['accepted', 'confirmed', 'preparing', 'picked_up', 'on_the_way', 'delivered'] as const;

function getIo(req: Request): SocketIOServer | undefined {
  return (req.app as { get?(key: string): unknown }).get?.('io') as SocketIOServer | undefined;
}

function toPaginated<T>(data: T[], total: number, page: number, limit: number) {
  const totalPages = Math.ceil(total / limit) || 1;
  return { data, total, page, limit, totalPages, hasNext: page < totalPages, hasPrev: page > 1 };
}

/** GET /available — Orders near driver (status confirmed, no driver) */
export const getAvailableOrders = asyncHandler(async (req: Request, res: Response) => {
  const driverId = req.user?._id;
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

/** POST /:id/accept */
export const acceptOrder = asyncHandler(async (req: Request, res: Response) => {
  const driverId = req.user?._id;
  const orderId = req.params.id;
  if (!driverId) throw new AppError({ en: MESSAGES.AUTH.en.unauthorized, de: MESSAGES.AUTH.de.unauthorized }, 401);
  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    throw new AppError({ en: MESSAGES.ORDER.en.notFound, de: MESSAGES.ORDER.de.notFound }, 404);
  }

  const driver = await Driver.findById(driverId);
  if (!driver || driver.approvalStatus !== 'approved' || driver.status !== 'active') {
    throw new AppError({ en: MESSAGES.DRIVER.en.notFound, de: MESSAGES.DRIVER.de.notFound }, 403);
  }
  if (!driver.isAvailable || driver.currentOrderId) {
    throw new AppError({ en: 'Driver is not available', de: 'Fahrer nicht verfügbar' }, 400, 'DRIVER_BUSY');
  }

  const order = await Order.findOne({ _id: orderId, status: { $in: ['accepted', 'confirmed'] }, driverId: null });
  if (!order) {
    throw new AppError({ en: 'Order no longer available', de: 'Bestellung nicht mehr verfügbar' }, 409, 'CONFLICT');
  }
  order.driverId = new mongoose.Types.ObjectId(driverId);
  await transitionOrderStatus(order, {
    status: 'preparing',
    changedBy: driverId,
    changedByModel: 'Driver',
  }, getIo(req));
  await Driver.findByIdAndUpdate(driverId, { currentOrderId: order._id, isAvailable: false });

  const io = getIo(req);
  if (io) io.to(`customer:${order.customerId}`).emit('order:driver_assigned', order.toObject?.() ?? order);

  const doc = order.toObject();
  return sendSuccess(res, doc);
});

/** PATCH /:id/status */
export const updateOrderStatus = asyncHandler(async (req: Request, res: Response) => {
  const driverId = req.user?._id;
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
  const driverId = req.user?._id;
  if (!driverId) throw new AppError({ en: MESSAGES.AUTH.en.unauthorized, de: MESSAGES.AUTH.de.unauthorized }, 401);

  const order = await Order.findOne({
    driverId,
    status: { $nin: ['delivered', 'cancelled'] },
  }).populate('customerId', 'name phone').lean();

  return sendSuccess(res, order);
});

/** GET /history */
export const getDeliveryHistory = asyncHandler(async (req: Request, res: Response) => {
  const driverId = req.user?._id;
  if (!driverId) throw new AppError({ en: MESSAGES.AUTH.en.unauthorized, de: MESSAGES.AUTH.de.unauthorized }, 401);

  const { page, limit } = parsePagination(req.query);

  const [orders, total] = await Promise.all([
    Order.find({ driverId, status: 'delivered' }).lean().sort({ actualDeliveryAt: -1 }).skip((page - 1) * limit).limit(limit),
    Order.countDocuments({ driverId, status: 'delivered' }),
  ]);

  const withEarnings = orders.map((o: { total?: number; _id?: unknown }) => ({ ...o, earnings: (o as { total?: number }).total ?? 0 }));
  return sendSuccess(res, withEarnings, 200, toPaginated(withEarnings, total, page, limit));
});
