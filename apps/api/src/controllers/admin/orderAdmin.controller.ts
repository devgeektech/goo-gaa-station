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

function toPaginated<T>(data: T[], total: number, page: number, limit: number) {
  const totalPages = Math.ceil(total / limit) || 1;
  return { data, total, page, limit, totalPages, hasNext: page < totalPages, hasPrev: page > 1 };
}

/** GET / */
export const listOrders = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit } = parsePagination(req.query);
  const status = String(req.query.status || '').trim();
  const paymentStatus = String(req.query.paymentStatus || '').trim();
  const dateFrom = req.query.dateFrom ? new Date(String(req.query.dateFrom)) : null;
  const dateTo = req.query.dateTo ? new Date(String(req.query.dateTo)) : null;
  const customerId = String(req.query.customerId || '').trim();
  const driverId = String(req.query.driverId || '').trim();
  const vendorId = String(req.query.vendorId || '').trim();
  const search = String(req.query.search || '').trim();

  const filter: Record<string, unknown> = {};
  if (status) filter.status = status;
  if (paymentStatus) filter.paymentStatus = paymentStatus;
  if (customerId && mongoose.Types.ObjectId.isValid(customerId)) filter.customerId = new mongoose.Types.ObjectId(customerId);
  if (driverId && mongoose.Types.ObjectId.isValid(driverId)) filter.driverId = new mongoose.Types.ObjectId(driverId);
  if (vendorId && mongoose.Types.ObjectId.isValid(vendorId)) filter.vendorId = new mongoose.Types.ObjectId(vendorId);
  if (search) filter.orderNumber = new RegExp(search, 'i');
  if (dateFrom || dateTo) {
    filter.createdAt = {};
    if (dateFrom) (filter.createdAt as Record<string, Date>).$gte = dateFrom;
    if (dateTo) (filter.createdAt as Record<string, Date>).$lte = dateTo;
  }

  const [orders, total] = await Promise.all([
    Order.find(filter).populate('customerId', 'name phone email').populate('driverId', 'name phone').populate('vendorId', 'name slug').lean().sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    Order.countDocuments(filter),
  ]);

  return sendSuccess(res, orders, 200, toPaginated(orders, total, page, limit));
});

/** GET /:id */
export const getOrder = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError({ en: MESSAGES.ORDER.en.notFound, de: MESSAGES.ORDER.de.notFound }, 404);
  }
  const order = await Order.findById(id).populate('customerId').populate('driverId').populate('vendorId', 'name slug logo').lean();
  if (!order) throw new AppError({ en: MESSAGES.ORDER.en.notFound, de: MESSAGES.ORDER.de.notFound }, 404);
  return sendSuccess(res, order);
});

/** PATCH /:id/status — Manual status push; appends history, sends FCM to customer, emits socket */
export const updateOrderStatus = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id;
  const adminId = req.user?._id;
  const { status, note } = req.body ?? {};
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError({ en: MESSAGES.ORDER.en.notFound, de: MESSAGES.ORDER.de.notFound }, 404);
  }
  const order = await Order.findById(id);
  if (!order) throw new AppError({ en: MESSAGES.ORDER.en.notFound, de: MESSAGES.ORDER.de.notFound }, 404);
  if (!status) {
    const doc = order.toObject();
    return sendSuccess(res, doc);
  }
  const io = (req.app as { get?(key: string): unknown }).get?.('io');
  await transitionOrderStatus(order, {
    status: String(status),
    note: note ? String(note) : undefined,
    changedBy: adminId ?? undefined,
    changedByModel: 'Admin',
    isAdminOverride: true,
  }, io as import('socket.io').Server | undefined);
  const doc = order.toObject();
  return sendSuccess(res, doc);
});

/** PATCH /:id/cancel */
export const cancelOrder = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id;
  const adminId = req.user?._id;
  const { reason } = req.body ?? {};
  if (!reason || String(reason).trim().length < 1) {
    throw new AppError({ en: 'Reason required', de: 'Begründung erforderlich' }, 400, 'VALIDATION_ERROR');
  }
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError({ en: MESSAGES.ORDER.en.notFound, de: MESSAGES.ORDER.de.notFound }, 404);
  }
  const order = await Order.findById(id);
  if (!order) throw new AppError({ en: MESSAGES.ORDER.en.notFound, de: MESSAGES.ORDER.de.notFound }, 404);
  (order as { cancelledBy?: string; cancellationReason?: string }).cancelledBy = 'admin';
  (order as { cancellationReason?: string }).cancellationReason = String(reason).trim();
  const io = (req.app as { get?(key: string): unknown }).get?.('io');
  await transitionOrderStatus(order, {
    status: 'cancelled',
    note: (order as { cancellationReason?: string }).cancellationReason,
    changedBy: adminId ?? undefined,
    changedByModel: 'Admin',
    isAdminOverride: true,
  }, io as import('socket.io').Server | undefined);
  const doc = order.toObject();
  return sendSuccess(res, doc);
});

/** PATCH /:id/assign-driver */
export const assignDriver = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id;
  const { driverId: newDriverId } = req.body ?? {};
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError({ en: MESSAGES.ORDER.en.notFound, de: MESSAGES.ORDER.de.notFound }, 404);
  }
  if (!newDriverId || !mongoose.Types.ObjectId.isValid(newDriverId)) {
    throw new AppError({ en: 'Valid driverId required', de: 'Gültige driverId erforderlich' }, 400, 'VALIDATION_ERROR');
  }

  const driver = await Driver.findOne({ _id: newDriverId, approvalStatus: 'approved', status: 'active' });
  if (!driver) throw new AppError({ en: 'Driver not found or not approved and active', de: 'Fahrer nicht gefunden oder nicht genehmigt/aktiv' }, 400, 'INVALID_DRIVER');

  const order = await Order.findById(id);
  if (!order) throw new AppError({ en: MESSAGES.ORDER.en.notFound, de: MESSAGES.ORDER.de.notFound }, 404);
  if (['delivered', 'cancelled'].includes(order.status)) {
    throw new AppError({ en: 'Order cannot be assigned', de: 'Bestellung kann nicht zugewiesen werden' }, 400, 'INVALID_STATUS');
  }

  // If driver is currently on another order, unassign them from it first
  if (driver.currentOrderId && !driver.currentOrderId.equals(order._id)) {
    await Order.findByIdAndUpdate(driver.currentOrderId, { driverId: null });
    await Driver.findByIdAndUpdate(newDriverId, { currentOrderId: null, isAvailable: true });
  }

  const oldDriverId = order.driverId;
  if (oldDriverId) await Driver.findByIdAndUpdate(oldDriverId, { currentOrderId: null, isAvailable: true });

  order.driverId = new mongoose.Types.ObjectId(newDriverId);
  await order.save();
  await Driver.findByIdAndUpdate(newDriverId, { currentOrderId: order._id, isAvailable: false });

  const io = (req.app as { get?(key: string): unknown }).get?.('io');
  if (io) {
    (io as import('socket.io').Server).to(`customer:${order.customerId}`).emit('order:driver_assigned', order.toObject?.() ?? order);
    (io as import('socket.io').Server).to('admin').emit('order:driver_assigned', order.toObject?.() ?? order);
  }

  const populated = await Order.findById(order._id).populate('customerId', 'name phone').populate('driverId', 'name phone vehicleType vehiclePlate').lean();
  return sendSuccess(res, populated ?? order.toObject());
});

/** GET /stats/summary */
export const getStatsSummary = asyncHandler(async (_req: Request, res: Response) => {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const [totalOrders, ordersToday, ordersByStatus, revenuePaid, revenueTodayPaid, last7Days, pendingDrivers, activeDrivers, totalCustomers] = await Promise.all([
    Order.countDocuments(),
    Order.countDocuments({ createdAt: { $gte: todayStart } }),
    Order.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    Order.aggregate([{ $match: { paymentStatus: 'paid' } }, { $group: { _id: null, total: { $sum: '$total' } } }]),
    Order.aggregate([{ $match: { paymentStatus: 'paid', createdAt: { $gte: todayStart } } }, { $group: { _id: null, total: { $sum: '$total' } } }]),
    Order.aggregate([
      { $match: { paymentStatus: 'paid', createdAt: { $gte: sevenDaysAgo } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, revenue: { $sum: '$total' }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    Driver.countDocuments({ approvalStatus: 'pending' }),
    Driver.countDocuments({ approvalStatus: 'approved', status: 'active' }),
    User.countDocuments({ status: { $ne: 'deleted' } }),
  ]);

  const statusMap: Record<string, number> = {};
  ordersByStatus.forEach((s: { _id: string; count: number }) => { statusMap[s._id] = s.count; });

  return sendSuccess(res, {
    totalOrders,
    ordersToday,
    ordersByStatus: statusMap,
    totalRevenue: revenuePaid[0]?.total ?? 0,
    revenueToday: revenueTodayPaid[0]?.total ?? 0,
    last7DaysRevenue: last7Days.map((d: { _id: string; revenue: number; count: number }) => ({ date: d._id, revenue: d.revenue, count: d.count })),
    pendingDriverApprovals: pendingDrivers,
    activeDrivers,
    totalCustomers,
  });
});
