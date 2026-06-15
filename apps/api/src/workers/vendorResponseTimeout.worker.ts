import type { Server as SocketIOServer } from 'socket.io';
import mongoose from 'mongoose';
import { DRIVER_ASSIGNMENT_WINDOW_MS } from '../constants/driverAssignment';
import {
  DELIVERY_SLA_TIMEOUT_NOTE,
  DELIVERY_SLA_TIMEOUT_REASON,
  DELIVERY_SLA_WINDOW_MS,
  READY_PICKUP_TIMEOUT_NOTE,
  READY_PICKUP_TIMEOUT_REASON,
  READY_PICKUP_WINDOW_MS,
} from '../constants/orderFulfillment';
import { Order } from '../models/Order';
import { initiateRefund } from '../services/refundService';
import { claimOrderSystemCancel } from '../services/orderCancel.service';
import { saveVendorInAppNotification } from '../services/vendorNotification.service';
import { claimAndForwardPendingOrder } from '../services/vendorOrderNotify.service';

const DRIVER_ASSIGNMENT_TIMEOUT_MINUTES = DRIVER_ASSIGNMENT_WINDOW_MS / 60_000;
const DRIVER_ASSIGNMENT_TIMEOUT_REASON = `No driver accepted within ${DRIVER_ASSIGNMENT_TIMEOUT_MINUTES} minutes`;
const DRIVER_ASSIGNMENT_TIMEOUT_NOTE = `Driver assignment timeout (${DRIVER_ASSIGNMENT_TIMEOUT_MINUTES} min)`;

// Mongoose model typing in this repo is loose; cast for worker usage.
const OrderModel = Order as any;

type ClaimedOrder = {
  _id: mongoose.Types.ObjectId;
  vendorId: mongoose.Types.ObjectId | string | null;
  customerId: mongoose.Types.ObjectId | string | null;
  orderNumber?: string | null;
  total: number;
  paymentMethod?: string | null;
  paymentStatus?: string | null;
  wifipayRef?: string | null;
};

async function processOneTimeout(io?: SocketIOServer): Promise<boolean> {
  const now = new Date();

  // Atomically claim one expired order so we never double-handle.
  const claimed = (await OrderModel.findOneAndUpdate(
    {
      status: 'vendor_notified',
      vendorResponseDeadline: { $lt: now },
    },
    {
      $set: {
        status: 'cancelled',
        cancelledBy: 'system',
        cancellationReason: 'Vendor did not respond',
        vendorResponseStatus: 'timeout',
        vendorRespondedAt: now,
      },
      $push: {
        statusHistory: {
          status: 'cancelled',
          timestamp: now,
          note: 'Timeout: vendor did not respond',
          changedByModel: 'System',
        },
      },
    },
    { new: true }
  ).lean()) as unknown as ClaimedOrder | null;

  if (!claimed) return false;
  console.info('[OrderTimeoutWorker] Claimed expired order', {
    orderId: String(claimed._id),
    vendorId: claimed.vendorId ? String(claimed.vendorId) : null,
    customerId: claimed.customerId ? String(claimed.customerId) : null,
    at: now.toISOString(),
  });

  try {
    await initiateRefund(
      {
        _id: claimed._id,
        orderNumber: claimed.orderNumber ?? null,
        customerId: claimed.customerId,
        paymentMethod: claimed.paymentMethod ?? null,
        paymentStatus: claimed.paymentStatus ?? null,
        total: claimed.total,
        wifipayRef: claimed.wifipayRef ?? null,
      },
      'Vendor did not respond within 120 seconds',
      io
    );
  } catch {
    // ignore — timeout handling should continue even if refund side effects fail
  }

  if (io) {
    const payload = { orderId: claimed._id, vendorId: claimed.vendorId };
    io.to('admin').emit('order:timeout', payload);
    if (claimed.vendorId) io.to(`vendor:${claimed.vendorId}`).emit('order:timeout', payload);
    if (claimed.customerId) io.to(`customer:${claimed.customerId}`).emit('order:timeout', payload);
  }

  if (claimed.vendorId) {
    void saveVendorInAppNotification({
      vendorId: claimed.vendorId,
      type: 'order_timeout',
      title: 'Order response timeout',
      body: `Order ${claimed.orderNumber ?? ''} was cancelled — no vendor response in time.`.trim(),
      orderId: claimed._id,
      orderNumber: claimed.orderNumber ?? null,
      screen: 'OrderDetail',
      dedupe: false,
    });
  }

  console.info('[OrderTimeoutWorker] Completed timeout handling', {
    orderId: String(claimed._id),
    at: new Date().toISOString(),
  });

  return true;
}

async function processOneDriverAssignmentTimeout(io?: SocketIOServer): Promise<boolean> {
  const now = new Date();
  const claimed = (await OrderModel.findOneAndUpdate(
    {
      status: 'accepted',
      driver_assigned: false,
      driverAssignmentDeadline: { $lt: now },
    },
    {
      $set: {
        status: 'cancelled',
        cancelledBy: 'system',
        cancellationReason: DRIVER_ASSIGNMENT_TIMEOUT_REASON,
      },
      $push: {
        statusHistory: {
          status: 'cancelled',
          timestamp: now,
          note: DRIVER_ASSIGNMENT_TIMEOUT_NOTE,
          changedByModel: 'System',
        },
      },
    },
    { new: true }
  ).lean()) as unknown as ClaimedOrder | null;

  if (!claimed) return false;

  try {
    await initiateRefund(
      {
        _id: claimed._id,
        orderNumber: claimed.orderNumber ?? null,
        customerId: claimed.customerId,
        paymentMethod: claimed.paymentMethod ?? null,
        paymentStatus: claimed.paymentStatus ?? null,
        total: claimed.total,
        wifipayRef: claimed.wifipayRef ?? null,
      },
      DRIVER_ASSIGNMENT_TIMEOUT_REASON,
      io
    );
  } catch {
    // ignore — timeout handling must continue
  }

  if (io) {
    const payload = { orderId: claimed._id, vendorId: claimed.vendorId };
    io.to('admin').emit('order:driver_assignment_timeout', payload);
    if (claimed.vendorId) io.to(`vendor:${claimed.vendorId}`).emit('order:driver_assignment_timeout', payload);
    if (claimed.customerId) io.to(`customer:${claimed.customerId}`).emit('order:driver_assignment_timeout', payload);
  }

  if (claimed.vendorId) {
    void saveVendorInAppNotification({
      vendorId: claimed.vendorId,
      type: 'driver_assignment_timeout',
      title: 'Driver assignment timeout',
      body: `Order ${claimed.orderNumber ?? ''} was cancelled — no driver accepted in time.`.trim(),
      orderId: claimed._id,
      orderNumber: claimed.orderNumber ?? null,
      screen: 'OrderDetail',
      dedupe: false,
    });
  }

  return true;
}

/** Backfill deadlines for orders created before timeout fields existed. */
async function backfillMissingFulfillmentDeadlines(): Promise<void> {
  const readyOrders = await OrderModel.find({
    status: 'ready',
    readyPickupDeadline: null,
  })
    .select('_id updatedAt')
    .limit(25)
    .lean();

  for (const row of readyOrders as Array<{ _id: mongoose.Types.ObjectId; updatedAt?: Date }>) {
    const base = row.updatedAt ? new Date(row.updatedAt) : new Date();
    await OrderModel.updateOne(
      { _id: row._id, status: 'ready', readyPickupDeadline: null },
      {
        $set: {
          readyAt: base,
          readyPickupDeadline: new Date(base.getTime() + READY_PICKUP_WINDOW_MS),
        },
      }
    );
  }

  const inDelivery = await OrderModel.find({
    status: { $in: ['picked_up', 'on_the_way'] },
    deliverySlaDeadline: null,
  })
    .select('_id updatedAt')
    .limit(25)
    .lean();

  for (const row of inDelivery as Array<{ _id: mongoose.Types.ObjectId; updatedAt?: Date }>) {
    const base = row.updatedAt ? new Date(row.updatedAt) : new Date();
    await OrderModel.updateOne(
      { _id: row._id, status: { $in: ['picked_up', 'on_the_way'] }, deliverySlaDeadline: null },
      {
        $set: {
          deliverySlaDeadline: new Date(base.getTime() + DELIVERY_SLA_WINDOW_MS),
        },
      }
    );
  }
}

async function processOneReadyPickupTimeout(io?: SocketIOServer): Promise<boolean> {
  const now = new Date();
  return claimOrderSystemCancel(
    {
      status: 'ready',
      readyPickupDeadline: { $lt: now, $ne: null },
    },
    READY_PICKUP_TIMEOUT_REASON,
    READY_PICKUP_TIMEOUT_NOTE,
    {
      io,
      socketEvent: 'order:ready_pickup_timeout',
      vendorNotification: {
        type: 'order_timeout',
        title: 'Pickup timeout',
        body: `Order was cancelled — driver did not pick up within 1 hour.`,
      },
    }
  );
}

async function processOneDeliverySlaTimeout(io?: SocketIOServer): Promise<boolean> {
  const now = new Date();
  return claimOrderSystemCancel(
    {
      status: { $in: ['picked_up', 'on_the_way'] },
      deliverySlaDeadline: { $lt: now, $ne: null },
    },
    DELIVERY_SLA_TIMEOUT_REASON,
    DELIVERY_SLA_TIMEOUT_NOTE,
    {
      io,
      socketEvent: 'order:delivery_timeout',
      vendorNotification: {
        type: 'order_cancelled',
        title: 'Delivery timeout',
        body: `Order was cancelled — delivery not completed within 1 hour.`,
      },
    }
  );
}

async function processCustomerCancelGraceForwards(io?: SocketIOServer): Promise<void> {
  for (let i = 0; i < 50; i++) {
    const forwarded = await claimAndForwardPendingOrder(io);
    if (!forwarded) break;
  }
}

export function startVendorResponseTimeoutWorker(io?: SocketIOServer): void {
  const intervalMs = 3_000; // poll frequently so 30s grace forwards promptly
  setInterval(() => {
    // Drain multiple expired orders each tick, but yield to event loop.
    (async () => {
      await processCustomerCancelGraceForwards(io);
      await backfillMissingFulfillmentDeadlines();
      // safety cap per tick
      for (let i = 0; i < 50; i++) {
        const handled = await processOneTimeout(io);
        if (!handled) break;
      }
      for (let i = 0; i < 50; i++) {
        const handled = await processOneDriverAssignmentTimeout(io);
        if (!handled) break;
      }
      for (let i = 0; i < 50; i++) {
        const handled = await processOneReadyPickupTimeout(io);
        if (!handled) break;
      }
      for (let i = 0; i < 50; i++) {
        const handled = await processOneDeliverySlaTimeout(io);
        if (!handled) break;
      }
    })().catch(() => {
      // ignore — worker must not crash the process
    });
  }, intervalMs);
}

