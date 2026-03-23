import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Order } from '../../models/Order';
import { Driver } from '../../models/Driver';
import { AppError } from '../../utils/AppError';
import { sendSuccess } from '../../utils/response';
import { asyncHandler } from '../../utils/asyncHandler';
import { parsePagination } from '../../utils/pagination';
import type { Server as SocketIOServer } from 'socket.io';

function getIo(req: Request): SocketIOServer | undefined {
  return (req.app as { get?(key: string): unknown }).get?.('io') as SocketIOServer | undefined;
}

/** GET / — Full filter: ?status, ?vendorId, ?customerId, ?driverId, ?dateFrom, ?dateTo, ?search (orderNumber); populate customer, vendor, driver */
export const getAdminOrders = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit } = parsePagination(req.query, 20);
  const status = String(req.query.status || '').trim();
  const vendorId = String(req.query.vendorId || '').trim();
  const customerId = String(req.query.customerId || '').trim();
  const driverId = String(req.query.driverId || '').trim();
  const dateFrom = req.query.dateFrom ? new Date(String(req.query.dateFrom)) : null;
  const dateTo = req.query.dateTo ? new Date(String(req.query.dateTo)) : null;
  const search = String(req.query.search || '').trim();

  const filter: Record<string, unknown> = {};
  if (status) filter.status = status;
  if (vendorId && mongoose.Types.ObjectId.isValid(vendorId)) filter.vendorId = new mongoose.Types.ObjectId(vendorId);
  if (customerId && mongoose.Types.ObjectId.isValid(customerId)) filter.customerId = new mongoose.Types.ObjectId(customerId);
  if (driverId && mongoose.Types.ObjectId.isValid(driverId)) filter.driverId = new mongoose.Types.ObjectId(driverId);
  if (search) filter.orderNumber = new RegExp(search, 'i');
  if (dateFrom || dateTo) {
    filter.createdAt = {} as Record<string, Date>;
    if (dateFrom) (filter.createdAt as Record<string, Date>).$gte = dateFrom;
    if (dateTo) (filter.createdAt as Record<string, Date>).$lte = dateTo;
  }

  const [orders, total] = await Promise.all([
    Order.find(filter)
      .populate('customerId', 'name phone')
      .populate('vendorId', 'name')
      .populate('driverId', 'name')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Order.countDocuments(filter),
  ]);
  const pages = Math.ceil(total / limit) || 1;
  return sendSuccess(res, { orders, total, page, pages });
});

/** GET /:id — Full order detail with all populations */
export const getAdminOrder = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError({ en: 'Order not found', de: 'Bestellung nicht gefunden' }, 404, 'NOT_FOUND');
  }
  const order = await Order.findById(id)
    .populate('customerId', 'name phone email')
    .populate('vendorId', 'name slug logo phone address')
    .populate('driverId', 'name phone profileImage vehicleType')
    .lean();
  if (!order) throw new AppError({ en: 'Order not found', de: 'Bestellung nicht gefunden' }, 404, 'NOT_FOUND');
  return sendSuccess(res, order);
});

/** PATCH /:id/status — Admin can set any status; push statusHistory updatedBy:'admin'; emit socket */
export const updateAdminOrderStatus = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id;
  const newStatus = (req.body ?? {}).status as string | undefined;
  const note = (req.body ?? {}).note as string | undefined;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError({ en: 'Order not found', de: 'Bestellung nicht gefunden' }, 404, 'NOT_FOUND');
  }
  if (!newStatus) {
    throw new AppError({ en: 'status is required', de: 'Status erforderlich' }, 400, 'VALIDATION_ERROR');
  }

  const order = await Order.findById(id);
  if (!order) throw new AppError({ en: 'Order not found', de: 'Bestellung nicht gefunden' }, 404, 'NOT_FOUND');

  const history = (order as { statusHistory?: Array<{ status: string; timestamp: Date; note?: string; changedByModel?: string }> }).statusHistory ?? [];
  history.push({
    status: newStatus,
    timestamp: new Date(),
    note: note ?? undefined,
    changedByModel: 'Admin',
  });
  (order as { statusHistory: typeof history }).statusHistory = history;
  order.status = newStatus;
  await order.save();

  const io = getIo(req);
  const payload = { orderId: order._id, orderNumber: order.orderNumber, status: newStatus };
  if (io) {
    io.to('admin').emit('order:statusChanged', payload);
    io.to(`customer_${order.customerId}`).emit('order:statusChanged', payload);
  }

  return sendSuccess(res, order.toObject?.() ?? order);
});

/** PATCH /:id/driver — Assign driver; validate driver exists and approvalStatus==='approved'; set order.driverId */
export const assignDriver = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id;
  const driverId = (req.body ?? {}).driverId as string | undefined;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError({ en: 'Order not found', de: 'Bestellung nicht gefunden' }, 404, 'NOT_FOUND');
  }
  if (!driverId || !mongoose.Types.ObjectId.isValid(driverId)) {
    throw new AppError({ en: 'Valid driverId is required', de: 'driverId erforderlich' }, 400, 'VALIDATION_ERROR');
  }

  const driver = await Driver.findById(driverId).select('approvalStatus').lean();
  if (!driver) throw new AppError({ en: 'Driver not found', de: 'Fahrer nicht gefunden' }, 404, 'NOT_FOUND');
  if ((driver as { approvalStatus?: string }).approvalStatus !== 'approved') {
    throw new AppError({ en: 'Driver must be approved', de: 'Fahrer muss genehmigt sein' }, 400, 'VALIDATION_ERROR');
  }

  const order = await Order.findByIdAndUpdate(
    id,
    { $set: { driverId: new mongoose.Types.ObjectId(driverId) } },
    { new: true }
  )
    .populate('customerId', 'name phone')
    .populate('vendorId', 'name')
    .populate('driverId', 'name phone')
    .lean();
  if (!order) throw new AppError({ en: 'Order not found', de: 'Bestellung nicht gefunden' }, 404, 'NOT_FOUND');

  const io = getIo(req);
  if (io) {
    io.to('admin').emit('order:driverAssigned', { orderId: order._id, orderNumber: (order as { orderNumber?: string }).orderNumber, driverId });
    io.to(`customer_${(order as { customerId?: unknown }).customerId}`).emit('order:driverAssigned', { orderId: order._id, driverId });
  }

  return sendSuccess(res, order);
});
