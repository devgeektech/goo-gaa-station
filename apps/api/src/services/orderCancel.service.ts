import type { Server as SocketIOServer } from 'socket.io';
import mongoose from 'mongoose';
import { Driver } from '../models/Driver';
import { Order } from '../models/Order';
import { initiateRefund } from './refundService';
import { saveVendorInAppNotification } from './vendorNotification.service';
import type { VendorNotificationType } from '../models/VendorNotification';

const OrderModel = Order as any;

export type CancellableOrder = {
  _id: mongoose.Types.ObjectId;
  vendorId?: mongoose.Types.ObjectId | string | null;
  customerId?: mongoose.Types.ObjectId | string | null;
  driverId?: mongoose.Types.ObjectId | string | null;
  orderNumber?: string | null;
  total: number;
  paymentMethod?: string | null;
  paymentStatus?: string | null;
  wifipayRef?: string | null;
};

type CancellationSideEffectOptions = {
  socketEvent?: string;
  vendorNotification?: {
    type: VendorNotificationType;
    title: string;
    body: string;
  };
};

/** Free driver so they can accept new orders after cancellation. */
export async function releaseDriverFromOrder(
  driverId: mongoose.Types.ObjectId | string | null | undefined,
  orderId: mongoose.Types.ObjectId | string
): Promise<void> {
  if (!driverId) return;
  const driverOid = typeof driverId === 'string' ? new mongoose.Types.ObjectId(driverId) : driverId;
  const orderOid = typeof orderId === 'string' ? new mongoose.Types.ObjectId(orderId) : orderId;
  await Driver.findOneAndUpdate(
    { _id: driverOid, currentOrderId: orderOid },
    { $set: { currentOrderId: null, isAvailable: true } },
    { runValidators: false }
  );
}

/** Refund, notify parties, and optionally emit a dedicated timeout socket event. */
export async function runOrderCancellationSideEffects(
  order: CancellableOrder,
  reason: string,
  io?: SocketIOServer,
  options: CancellationSideEffectOptions = {}
): Promise<void> {
  await releaseDriverFromOrder(order.driverId, order._id);

  try {
    await initiateRefund(
      {
        _id: order._id,
        orderNumber: order.orderNumber ?? null,
        customerId: order.customerId,
        paymentMethod: order.paymentMethod ?? null,
        paymentStatus: order.paymentStatus ?? null,
        total: order.total,
        wifipayRef: order.wifipayRef ?? null,
      },
      reason,
      io
    );
  } catch {
    // cancellation must continue even if refund side effects fail
  }

  if (io && options.socketEvent) {
    const payload = { orderId: order._id, vendorId: order.vendorId, reason };
    io.to('admin').emit(options.socketEvent, payload);
    if (order.vendorId) io.to(`vendor:${order.vendorId}`).emit(options.socketEvent, payload);
    if (order.customerId) io.to(`customer:${order.customerId}`).emit(options.socketEvent, payload);
    if (order.driverId) io.to(`driver:${order.driverId}`).emit(options.socketEvent, payload);
  }

  if (order.vendorId && options.vendorNotification) {
    void saveVendorInAppNotification({
      vendorId: order.vendorId,
      type: options.vendorNotification.type,
      title: options.vendorNotification.title,
      body: options.vendorNotification.body,
      orderId: order._id,
      orderNumber: order.orderNumber ?? null,
      screen: 'OrderDetail',
      dedupe: false,
    });
  }
}

type SystemCancelOptions = {
  io?: SocketIOServer;
  socketEvent?: string;
  vendorNotification?: CancellationSideEffectOptions['vendorNotification'];
};

/**
 * Atomically claim one order matching `query` and mark it cancelled by the system.
 * Returns true when an order was claimed and side effects were run.
 */
export async function claimOrderSystemCancel(
  query: Record<string, unknown>,
  reason: string,
  historyNote: string,
  options: SystemCancelOptions = {}
): Promise<boolean> {
  const now = new Date();
  const claimed = (await OrderModel.findOneAndUpdate(
    query,
    {
      $set: {
        status: 'cancelled',
        cancelledBy: 'system',
        cancellationReason: reason,
        readyPickupDeadline: null,
        deliverySlaDeadline: null,
      },
      $push: {
        statusHistory: {
          status: 'cancelled',
          timestamp: now,
          note: historyNote,
          changedByModel: 'System',
        },
      },
    },
    { new: true }
  ).lean()) as unknown as CancellableOrder | null;

  if (!claimed) return false;

  console.info('[OrderCancel] System cancellation', {
    orderId: String(claimed._id),
    reason,
    at: now.toISOString(),
  });

  await runOrderCancellationSideEffects(claimed, reason, options.io, {
    socketEvent: options.socketEvent,
    vendorNotification: options.vendorNotification,
  });

  return true;
}

type AdminCancelOptions = {
  adminId?: string;
  io?: SocketIOServer;
};

const TERMINAL_STATUSES = ['delivered', 'cancelled'];

/**
 * Cancel an order from admin panel: updates status, frees driver, triggers refund flow.
 * Returns the updated order document or null if not found / already terminal.
 */
export async function cancelOrderByAdmin(
  orderId: string,
  reason: string,
  options: AdminCancelOptions = {}
): Promise<Record<string, unknown> | null> {
  if (!mongoose.Types.ObjectId.isValid(orderId)) return null;

  const now = new Date();
  const reasonStr = reason.trim();
  const oid = new mongoose.Types.ObjectId(orderId);

  const cancelled = (await OrderModel.findOneAndUpdate(
    { _id: oid, status: { $nin: TERMINAL_STATUSES } },
    {
      $set: {
        status: 'cancelled',
        cancelledBy: 'admin',
        cancellationReason: reasonStr,
        readyPickupDeadline: null,
        deliverySlaDeadline: null,
      },
      $push: {
        statusHistory: {
          status: 'cancelled',
          timestamp: now,
          note: reasonStr,
          changedBy: options.adminId ? new mongoose.Types.ObjectId(options.adminId) : undefined,
          changedByModel: 'Admin',
          isAdminOverride: true,
        },
      },
    },
    { new: true }
  ).lean()) as unknown as CancellableOrder | null;

  if (!cancelled) return null;

  await runOrderCancellationSideEffects(cancelled, reasonStr, options.io);

  if (options.io) {
    const orderPayload = cancelled;
    const customerId = cancelled.customerId?.toString();
    if (customerId) {
      options.io.to(`customer:${customerId}`).emit('order:status_update', orderPayload);
      options.io.to(`customer:${customerId}`).emit('order:status_changed', orderPayload);
    }
    options.io.to('admin').emit('order:status_update', orderPayload);
    options.io.to('admin').emit('order:status_changed', orderPayload);
  }

  return cancelled as unknown as Record<string, unknown>;
}
