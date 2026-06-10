import mongoose from 'mongoose';
import type { Server as SocketIOServer } from 'socket.io';
import { Order } from '../models/Order';
import { Vendor } from '../models/Vendor';
import { VENDOR_RESPONSE_WINDOW_MS } from '../constants/vendorResponse';
import { sendPushToVendor } from './fcm.service';
import { saveVendorInAppNotification } from './vendorNotification.service';

const OrderModel = Order as mongoose.Model<mongoose.Document>;

function withRemainingTime<T extends Record<string, unknown>>(order: T): T & { remainingTime: number } {
  const deadline = (order as { vendorResponseDeadline?: Date | string | null }).vendorResponseDeadline;
  if (!deadline) return { ...(order as object), remainingTime: 0 } as T & { remainingTime: number };
  const ms = new Date(deadline).getTime() - Date.now();
  return {
    ...(order as object),
    remainingTime: Math.max(0, Math.ceil(ms / 1000)),
  } as T & { remainingTime: number };
}

async function buildVendorNewOrdersSocketPayload(vendorId: string): Promise<Record<string, unknown>> {
  const page = 1;
  const limit = 20;
  const filter: Record<string, unknown> = {
    vendorId: new mongoose.Types.ObjectId(String(vendorId)),
    status: 'vendor_notified',
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
  return {
    data: { orders: withTimer, total, page, pages },
  };
}

type ForwardedOrder = {
  _id: mongoose.Types.ObjectId;
  orderNumber?: string | null;
  vendorId: mongoose.Types.ObjectId | string;
  customerId?: mongoose.Types.ObjectId | string | null;
  total: number;
  paymentMethod?: string | null;
  items?: Array<{ qty?: number }>;
  vendorResponseDeadline?: Date | string;
};

/** Socket, in-app, and FCM notifications when an order enters `vendor_notified`. */
export async function notifyVendorNewOrder(order: ForwardedOrder, io?: SocketIOServer): Promise<void> {
  const vendorId = String(order.vendorId);
  const vendorResponseDeadline = order.vendorResponseDeadline
    ? new Date(order.vendorResponseDeadline)
    : new Date(Date.now() + VENDOR_RESPONSE_WINDOW_MS);
  const remainingSeconds = Math.max(0, Math.ceil(VENDOR_RESPONSE_WINDOW_MS / 1000));
  const placedItemCount = (order.items ?? []).reduce((sum, i) => sum + Number(i.qty || 0), 0);

  const newOrderRealtimePayload = {
    orderId: order._id,
    orderNumber: order.orderNumber,
    items: order.items,
    totalAmount: order.total,
    paymentMethod: order.paymentMethod,
    vendorResponseDeadline: vendorResponseDeadline.toISOString(),
    remainingSeconds,
  };

  if (io) {
    io.to('admin').emit('order:new', { ...newOrderRealtimePayload, vendorId });
    const vendorSnapshotPayload = await buildVendorNewOrdersSocketPayload(vendorId);
    io.to(`vendor:${vendorId}`).emit('order:new', vendorSnapshotPayload);
    io.to(`vendor:${vendorId}`).emit('vendor:orders:new_snapshot', vendorSnapshotPayload);
    if (order.customerId) {
      io.to(`customer:${order.customerId}`).emit('order:status_updated', {
        orderId: order._id,
        status: 'placed',
        message: 'Your order has been sent to the vendor.',
      });
    }
  }

  void saveVendorInAppNotification({
    vendorId,
    type: 'order_new',
    title: 'New Order Received! 🔔',
    body: `Order ${order.orderNumber} — ${placedItemCount} item(s) — $${order.total}. Accept within ${remainingSeconds} seconds!`,
    orderId: order._id,
    orderNumber: order.orderNumber ?? null,
    screen: 'NewOrders',
  });

  try {
    const vendorDoc = await Vendor.findById(vendorId).select('fcmTokens').lean();
    if (!vendorDoc) return;

    const orderForVendorLog = await Order.findById(order._id).populate('customerId', 'name phone').lean();
    const vendorOrderPayload = orderForVendorLog
      ? {
          ...orderForVendorLog,
          remainingTime: Math.max(
            0,
            Math.ceil((new Date(orderForVendorLog.vendorResponseDeadline as Date | string).getTime() - Date.now()) / 1000)
          ),
        }
      : null;
    const vendorOrderPayloadJson = vendorOrderPayload ? JSON.stringify(vendorOrderPayload) : '';
    const pushPayload = {
      title: 'New Order Received! 🔔',
      body: `Order ${order.orderNumber} — ${placedItemCount} item(s) — $${order.total}. Accept within ${remainingSeconds} seconds!`,
      data: {
        screen: 'NewOrders',
        orderId: String(order._id),
        vendorId,
        orderPayload: vendorOrderPayloadJson,
      },
    };
    await sendPushToVendor(vendorDoc as { _id?: unknown; fcmTokens?: Array<{ token: string }> }, pushPayload);
  } catch {
    // Do not fail forwarding if vendor push fails.
  }
}

/**
 * Atomically claim one pending order whose customer cancel window has expired
 * and forward it to the vendor (`vendor_notified`).
 */
export async function claimAndForwardPendingOrder(io?: SocketIOServer): Promise<boolean> {
  const now = new Date();
  const vendorNotifyAt = now;
  const vendorResponseDeadline = new Date(vendorNotifyAt.getTime() + VENDOR_RESPONSE_WINDOW_MS);

  const claimed = (await OrderModel.findOneAndUpdate(
    {
      status: 'pending',
      vendorNotifiedAt: null,
      customerCancelDeadline: { $lte: now, $exists: true, $ne: null },
    },
    {
      $set: {
        status: 'vendor_notified',
        vendorNotifiedAt: vendorNotifyAt,
        vendorResponseDeadline,
        vendorResponseStatus: 'pending',
      },
      $push: {
        statusHistory: {
          status: 'vendor_notified',
          timestamp: vendorNotifyAt,
          changedByModel: 'System',
        },
      },
    },
    { new: true }
  ).lean()) as unknown as ForwardedOrder | null;

  if (!claimed) return false;

  await notifyVendorNewOrder(claimed, io);
  return true;
}

export function customerCancelRemainingSeconds(deadline: Date | string | null | undefined): number {
  if (!deadline) return 0;
  return Math.max(0, Math.ceil((new Date(deadline).getTime() - Date.now()) / 1000));
}

/** True when the vendor has not yet been notified (grace-period cancel). */
export function isBeforeVendorNotification(order: {
  status?: string;
  vendorNotifiedAt?: Date | string | null;
}): boolean {
  if (order.vendorNotifiedAt) return false;
  return order.status === 'pending';
}
