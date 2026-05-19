import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Order } from '../../models/Order';
import { Transaction } from '../../models/Transaction';
import { Driver } from '../../models/Driver';
import { User } from '../../models/User';
import { AppError } from '../../utils/AppError';
import { MESSAGES } from '../../constants/messages';
import { sendSuccess } from '../../utils/response';
import { asyncHandler } from '../../utils/asyncHandler';
import { parsePagination } from '../../utils/pagination';
import { transitionOrderStatus } from '../../services/orderStatus.service';
import { enrichOrderFinancials } from '../../services/orderFinancials.service';
import { getCommissionPercent } from '../../services/appSettings.service';
import {
  adminRevenueMongoExpr,
  computeOrderRevenueBreakdown,
  driverRevenueMongoExpr,
  enrichOrderWithRevenue,
  REVENUE_ELIGIBLE_MATCH,
  vendorRevenueMongoExpr,
} from '../../services/orderRevenue.service';

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

  const commissionPercent = await getCommissionPercent();
  const [orders, total] = await Promise.all([
    Order.find(filter).populate('customerId', 'name phone email').populate('driverId', 'name phone').populate('vendorId', 'name slug').lean().sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    Order.countDocuments(filter),
  ]);
  const ordersWithFinancials = orders.map((order) =>
    enrichOrderWithRevenue(enrichOrderFinancials(order) as Record<string, unknown>, commissionPercent)
  );
  return sendSuccess(res, ordersWithFinancials, 200, toPaginated(ordersWithFinancials, total, page, limit));
});

/** GET /:id */
export const getOrder = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError({ en: MESSAGES.ORDER.en.notFound, de: MESSAGES.ORDER.de.notFound }, 404);
  }
  const [order, commissionPercent] = await Promise.all([
    Order.findById(id).populate('customerId').populate('driverId').populate('vendorId', 'name slug logo').lean(),
    getCommissionPercent(),
  ]);
  if (!order) throw new AppError({ en: MESSAGES.ORDER.en.notFound, de: MESSAGES.ORDER.de.notFound }, 404);
  return sendSuccess(res, enrichOrderWithRevenue(enrichOrderFinancials(order) as Record<string, unknown>, commissionPercent));
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

/** POST /:id/refund — Record manual refund (COD / admin bookkeeping; no WifiPay call) */
export const recordOrderRefund = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id;
  const adminId = req.user?._id;
  const reason = req.body?.reason != null ? String(req.body.reason).trim().slice(0, 500) : '';

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError({ en: MESSAGES.ORDER.en.notFound, de: MESSAGES.ORDER.de.notFound }, 404);
  }

  const order = await Order.findById(id);
  if (!order) throw new AppError({ en: MESSAGES.ORDER.en.notFound, de: MESSAGES.ORDER.de.notFound }, 404);

  if (order.status !== 'delivered') {
    throw new AppError(
      { en: 'Only delivered orders can be refunded', de: 'Nur gelieferte Bestellungen können erstattet werden' },
      400,
      'INVALID_STATUS'
    );
  }

  if (order.paymentStatus === 'refunded') {
    throw new AppError({ en: 'Order already refunded', de: 'Bereits erstattet' }, 400, 'ALREADY_REFUNDED');
  }

  const commissionPercent = await getCommissionPercent();
  const { refundAmount } = computeOrderRevenueBreakdown(
    {
      total: order.total,
      deliveryFee: order.deliveryFee,
      status: order.status,
      paymentStatus: order.paymentStatus,
    },
    commissionPercent
  );

  const existingRefund = await Transaction.findOne({ orderId: order._id, type: 'refund' });
  if (!existingRefund) {
    await Transaction.create({
      orderId: order._id,
      customerId: order.customerId ?? null,
      type: 'refund',
      amount: refundAmount,
      currency: 'EUR',
      status: 'success',
      wifipayRef: null,
      wifipayRawResponse: {
        reason: reason || 'Manual refund recorded by admin',
        manual: true,
        recordedBy: adminId ?? null,
      },
      completedAt: new Date(),
    });
  }

  order.paymentStatus = 'refunded';
  await order.save();

  const populated = await Order.findById(order._id)
    .populate('customerId')
    .populate('driverId')
    .populate('vendorId', 'name slug logo')
    .lean();
  if (!populated) throw new AppError({ en: MESSAGES.ORDER.en.notFound, de: MESSAGES.ORDER.de.notFound }, 404);

  return sendSuccess(res, enrichOrderWithRevenue(enrichOrderFinancials(populated) as Record<string, unknown>, commissionPercent));
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

  const commissionPercent = await getCommissionPercent();
  const commissionRate = commissionPercent / 100;
  const revenueMatch = REVENUE_ELIGIBLE_MATCH;

  const revenueGroupStages = [
    { $addFields: { __adminRev: adminRevenueMongoExpr(commissionRate) } },
    { $addFields: { __vendorRev: vendorRevenueMongoExpr(commissionRate) } },
    { $addFields: { __driverRev: driverRevenueMongoExpr() } },
    {
      $group: {
        _id: null,
        adminRevenue: { $sum: '$__adminRev' },
        vendorRevenue: { $sum: '$__vendorRev' },
        driverRevenue: { $sum: '$__driverRev' },
      },
    },
  ];

  const [
    totalOrders,
    ordersToday,
    ordersByStatus,
    revenueTotals,
    revenueTodayTotals,
    last7Days,
    pendingDrivers,
    activeDrivers,
    totalCustomers,
  ] = await Promise.all([
    Order.countDocuments(),
    Order.countDocuments({ createdAt: { $gte: todayStart } }),
    Order.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    Order.aggregate([{ $match: revenueMatch }, ...revenueGroupStages]),
    Order.aggregate([
      { $match: { ...revenueMatch, createdAt: { $gte: todayStart } } },
      ...revenueGroupStages,
    ]),
    Order.aggregate([
      { $match: { ...revenueMatch, createdAt: { $gte: sevenDaysAgo } } },
      { $addFields: { __adminRev: adminRevenueMongoExpr(commissionRate) } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          revenue: { $sum: '$__adminRev' },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Driver.countDocuments({ approvalStatus: 'pending' }),
    Driver.countDocuments({ approvalStatus: 'approved', status: 'active' }),
    User.countDocuments({ status: { $ne: 'deleted' } }),
  ]);

  const statusMap: Record<string, number> = {};
  ordersByStatus.forEach((s: { _id: string; count: number }) => { statusMap[s._id] = s.count; });

  const totals = revenueTotals[0] as { adminRevenue?: number; vendorRevenue?: number; driverRevenue?: number } | undefined;
  const todayTotals = revenueTodayTotals[0] as
    | { adminRevenue?: number; vendorRevenue?: number; driverRevenue?: number }
    | undefined;

  const round = (n: unknown) => Math.round((Number(n) || 0) * 100) / 100;

  return sendSuccess(res, {
    totalOrders,
    ordersToday,
    ordersByStatus: statusMap,
    commissionPercent,
    totalRevenue: round(totals?.adminRevenue),
    adminRevenue: round(totals?.adminRevenue),
    vendorRevenue: round(totals?.vendorRevenue),
    driverRevenue: round(totals?.driverRevenue),
    revenueToday: round(todayTotals?.adminRevenue),
    adminRevenueToday: round(todayTotals?.adminRevenue),
    vendorRevenueToday: round(todayTotals?.vendorRevenue),
    driverRevenueToday: round(todayTotals?.driverRevenue),
    last7DaysRevenue: last7Days.map((d: { _id: string; revenue: number; count: number }) => ({
      date: d._id,
      revenue: round(d.revenue),
      count: d.count,
    })),
    pendingDriverApprovals: pendingDrivers,
    activeDrivers,
    totalCustomers,
  });
});
