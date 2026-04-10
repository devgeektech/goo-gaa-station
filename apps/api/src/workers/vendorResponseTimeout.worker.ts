import type { Server as SocketIOServer } from 'socket.io';
import mongoose from 'mongoose';
import { DRIVER_ASSIGNMENT_WINDOW_MS } from '../constants/driverAssignment';
import { Order } from '../models/Order';
import { initiateRefund } from '../services/refundService';

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

  return true;
}

export function startVendorResponseTimeoutWorker(io?: SocketIOServer): void {
  const intervalMs = 12_000; // 10–15 seconds
  setInterval(() => {
    // Drain multiple expired orders each tick, but yield to event loop.
    (async () => {
      // safety cap per tick
      for (let i = 0; i < 50; i++) {
        const handled = await processOneTimeout(io);
        if (!handled) break;
      }
      for (let i = 0; i < 50; i++) {
        const handled = await processOneDriverAssignmentTimeout(io);
        if (!handled) break;
      }
    })().catch(() => {
      // ignore — worker must not crash the process
    });
  }, intervalMs);
}

