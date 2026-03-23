import mongoose from 'mongoose';
import { Order } from '../models/Order';
import { User } from '../models/User';
// import { sendPushToCustomer } from './fcm.service'; // Uncomment when FCM token is configured
import type { Server as SocketIOServer } from 'socket.io';

const STATUS_LABELS: Record<string, { title: string; body: string }> = {
  pending: { title: 'Order placed', body: 'Your order has been placed and is awaiting confirmation.' },
  accepted: { title: 'Order accepted', body: 'Your order has been accepted and is being prepared.' },
  confirmed: { title: 'Order confirmed', body: 'Your order has been confirmed.' },
  preparing: { title: 'Preparing your order', body: 'Your order is being prepared.' },
  picked_up: { title: 'Order picked up', body: 'Your order has been picked up and is on the way.' },
  on_the_way: { title: 'On the way', body: 'Your order is on the way to you.' },
  delivered: { title: 'Delivered', body: 'Your order has been delivered. Enjoy!' },
  cancelled: { title: 'Order cancelled', body: 'Your order has been cancelled.' },
};

export interface TransitionOptions {
  status: string;
  note?: string | null;
  changedBy?: string | null;
  changedByModel?: 'User' | 'Driver' | 'Admin' | 'System' | null;
  isAdminOverride?: boolean;
}

export type OrderDocument = mongoose.Document & {
  status: string;
  statusHistory: Array<{ status: string; timestamp?: Date; note?: string; changedBy?: mongoose.Types.ObjectId; changedByModel?: string; isAdminOverride?: boolean }>;
  customerId: mongoose.Types.ObjectId;
  save: () => Promise<OrderDocument>;
};

/**
 * Update order status, append statusHistory, send FCM to customer, and optionally emit socket events.
 * Call this from admin status update and driver status update flows.
 */
export async function transitionOrderStatus(
  order: OrderDocument,
  options: TransitionOptions,
  io?: SocketIOServer
): Promise<OrderDocument> {
  const { status, note, changedBy, changedByModel, isAdminOverride } = options;
  order.status = status;
  order.statusHistory = order.statusHistory || [];
  order.statusHistory.push({
    status,
    timestamp: new Date(),
    note: note ?? undefined,
    changedBy: changedBy ? new mongoose.Types.ObjectId(changedBy) : undefined,
    changedByModel: changedByModel ?? undefined,
    isAdminOverride: isAdminOverride ?? false,
  });
  if (status === 'delivered') {
    (order as OrderDocument & { actualDeliveryAt?: Date }).actualDeliveryAt = new Date();
  }
  await order.save();

  const customerId = order.customerId?.toString();
  if (customerId) {
    // FCM push to customer — uncomment when FIREBASE_SERVICE_ACCOUNT / FCM is configured
    // const user = await User.findById(customerId).select('fcmToken fcmTokens notificationPrefs').lean();
    // if (user) {
    //   const msg = STATUS_LABELS[status] || { title: 'Order update', body: `Your order status: ${status}` };
    //   await sendPushToCustomer(user, {
    //     title: msg.title,
    //     body: msg.body,
    //     data: { type: 'order_status', orderId: (order as mongoose.Document & { _id: mongoose.Types.ObjectId })._id.toString(), status },
    //   });
    // }
    if (io) {
      const orderPayload = order.toObject?.() ?? order;
      io.to(`customer:${customerId}`).emit('order:status_update', orderPayload);
      io.to(`customer:${customerId}`).emit('order:status_changed', orderPayload);
    }
  }
  if (io) {
    const orderPayload = order.toObject?.() ?? order;
    io.to('admin').emit('order:status_update', orderPayload);
    io.to('admin').emit('order:status_changed', orderPayload);
  }
  return order;
}
