import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Order } from '../../models/Order';
import { AppError } from '../../utils/AppError';
import { sendSuccess } from '../../utils/response';
import { asyncHandler } from '../../utils/asyncHandler';
import { parsePagination } from '../../utils/pagination';
import type { Server as SocketIOServer } from 'socket.io';

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  pending: ['accepted'],
  accepted: ['preparing'],
  preparing: ['picked_up'],
  picked_up: ['delivered'],
};

function getIo(req: Request): SocketIOServer | undefined {
  return (req.app as { get?(key: string): unknown }).get?.('io') as SocketIOServer | undefined;
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
    io.to(`customer_${order.customerId}`).emit('order:statusChanged', payload);
  }

  return sendSuccess(res, order.toObject?.() ?? order);
});

/** PATCH /:id/reject — Reject order (pending only); set cancelled, emit order:cancelled */
export const rejectOrder = asyncHandler(async (req: Request, res: Response) => {
  const vendorId = (req as Request & { vendor?: { _id: unknown } }).vendor?._id;
  const id = req.params.id;
  const note = (req.body ?? {}).note as string | undefined;
  if (!vendorId) throw new AppError({ en: 'Unauthorized', de: 'Nicht autorisiert' }, 401, 'UNAUTHORIZED');
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError({ en: 'Order not found', de: 'Bestellung nicht gefunden' }, 404, 'NOT_FOUND');
  }

  const order = await Order.findOne({ _id: id, vendorId: new mongoose.Types.ObjectId(String(vendorId)) });
  if (!order) throw new AppError({ en: 'Order not found', de: 'Bestellung nicht gefunden' }, 404, 'NOT_FOUND');
  if (order.status !== 'pending') {
    throw new AppError({ en: 'Only pending orders can be rejected', de: 'Nur ausstehende Bestellungen ablehnbar' }, 409, 'INVALID_STATUS');
  }

  order.status = 'cancelled';
  order.cancelledBy = 'vendor';
  order.cancellationReason = note ?? 'Rejected by vendor';
  const history = (order as { statusHistory?: Array<{ status: string; timestamp: Date; note?: string; changedByModel?: string }> }).statusHistory ?? [];
  history.push({
    status: 'cancelled',
    timestamp: new Date(),
    note: order.cancellationReason,
    changedByModel: 'System',
  });
  (order as { statusHistory: typeof history }).statusHistory = history;
  await order.save();

  const io = getIo(req);
  if (io) {
    io.to('admin').emit('order:cancelled', { orderId: order._id, orderNumber: order.orderNumber, status: 'cancelled' });
    io.to(`customer_${order.customerId}`).emit('order:cancelled', { orderId: order._id, orderNumber: order.orderNumber, status: 'cancelled' });
  }

  return sendSuccess(res, { _id: order._id, orderNumber: order.orderNumber, status: order.status });
});
