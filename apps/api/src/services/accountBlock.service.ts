import type { Server as SocketIOServer } from 'socket.io';
import mongoose from 'mongoose';
import { User } from '../models/User';
import { Vendor } from '../models/Vendor';
import { Driver } from '../models/Driver';
import { invalidateAllRefreshTokensForUser } from './auth.service';
import {
  getCustomerFcmTokens,
  getDriverFcmTokens,
  getVendorFcmTokens,
  sendPushToTokens,
} from './fcm.service';
import { setVendorClosedFromApp } from './vendorPresence.service';
import { createAccountBlockedError, formatBlockReason } from '../utils/accountBlockError';
import { AppError } from '../utils/AppError';

type BlockNotifyOptions = {
  io?: SocketIOServer;
  blockReason?: string | null;
  sendPush?: boolean;
};

function accountBlockedSocketPayload(blockReason?: string | null): Record<string, string> {
  const reason = formatBlockReason(blockReason);
  return {
    reason: 'account_blocked',
    blockReason: reason,
    message: 'Your account has been blocked. Please contact support.',
  };
}

async function pushAccountBlocked(
  tokens: string[],
  blockReason?: string | null
): Promise<void> {
  if (tokens.length === 0) return;
  const reason = formatBlockReason(blockReason);
  await sendPushToTokens(tokens, {
    title: 'Account blocked',
    body: reason,
    data: {
      type: 'account_block',
      blockReason: reason,
    },
  });
}

function disconnectRoom(io: SocketIOServer | undefined, room: string, blockReason?: string | null): void {
  if (!io) return;
  io.to(room).emit('account:blocked', accountBlockedSocketPayload(blockReason));
  void io.in(room).disconnectSockets(true);
}

/** Invalidate sessions + notify when admin blocks a customer. */
export async function applyCustomerAccountBlock(
  userId: mongoose.Types.ObjectId | string,
  options: BlockNotifyOptions = {}
): Promise<void> {
  const oid = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;
  const idStr = oid.toString();

  await invalidateAllRefreshTokensForUser(oid, 'User');

  disconnectRoom(options.io, `customer:${idStr}`, options.blockReason);

  if (options.sendPush === false) return;

  const user = await User.findById(oid).select('fcmToken fcmTokens').lean();
  if (!user) return;
  await pushAccountBlocked(getCustomerFcmTokens(user as Parameters<typeof getCustomerFcmTokens>[0]), options.blockReason);
}

/** Invalidate sessions + close presence when admin blocks a vendor. */
export async function applyVendorAccountBlock(
  vendorId: mongoose.Types.ObjectId | string,
  options: BlockNotifyOptions = {}
): Promise<void> {
  const oid = typeof vendorId === 'string' ? new mongoose.Types.ObjectId(vendorId) : vendorId;
  const idStr = oid.toString();

  await invalidateAllRefreshTokensForUser(oid, 'Vendor');
  await setVendorClosedFromApp(idStr, options.io);

  disconnectRoom(options.io, `vendor:${idStr}`, options.blockReason);

  if (options.sendPush === false) return;

  const vendor = await Vendor.findById(oid).select('fcmTokens').lean();
  if (!vendor) return;
  await pushAccountBlocked(getVendorFcmTokens(vendor as Parameters<typeof getVendorFcmTokens>[0]), options.blockReason);
}

/** Invalidate sessions + bump driver sessionVersion when admin blocks a driver. */
export async function applyDriverAccountBlock(
  driverId: mongoose.Types.ObjectId | string,
  options: BlockNotifyOptions = {}
): Promise<void> {
  const oid = typeof driverId === 'string' ? new mongoose.Types.ObjectId(driverId) : driverId;
  const idStr = oid.toString();

  await invalidateAllRefreshTokensForUser(oid, 'Driver');
  await Driver.findByIdAndUpdate(
    oid,
    { $inc: { sessionVersion: 1 }, $set: { isOnline: false } },
    { runValidators: false }
  );

  if (options.io) {
    const payload = accountBlockedSocketPayload(options.blockReason);
    options.io.to(`driver:${idStr}`).emit('account:blocked', payload);
    options.io.to(`driver:${idStr}`).emit('driver:session_revoked', {
      reason: 'account_blocked',
      ...payload,
    });
    void options.io.in(`driver:${idStr}`).disconnectSockets(true);
  }

  if (options.sendPush === false) return;

  const driver = await Driver.findById(oid).select('fcmToken fcmTokens').lean();
  if (!driver) return;
  await pushAccountBlocked(getDriverFcmTokens(driver as Parameters<typeof getDriverFcmTokens>[0]), options.blockReason);
}

export async function assertCustomerAccountActive(userId: string): Promise<void> {
  const user = await User.findById(userId).select('status blockReason').lean();
  if (!user) {
    throw new AppError({ en: 'Customer not found', de: 'Kunde nicht gefunden' }, 404, 'NOT_FOUND');
  }
  if (user.status === 'deleted') {
    throw new AppError(
      {
        en: 'Account has been removed. Please sign in again with your phone number.',
        de: 'Konto wurde entfernt. Bitte melden Sie sich erneut mit Ihrer Telefonnummer an.',
      },
      403,
      'ACCOUNT_DELETED'
    );
  }
  if (user.status === 'blocked') {
    throw createAccountBlockedError(user.blockReason);
  }
}

export async function assertVendorAccountActive(vendorId: string): Promise<void> {
  const vendor = await Vendor.findById(vendorId).select('status blockReason').lean();
  if (!vendor) {
    throw new AppError({ en: 'Vendor not found', de: 'Anbieter nicht gefunden' }, 404, 'NOT_FOUND');
  }
  if (vendor.status === 'deleted') {
    throw new AppError({ en: 'Vendor not found', de: 'Anbieter nicht gefunden' }, 404, 'NOT_FOUND');
  }
  if (vendor.status === 'blocked') {
    throw createAccountBlockedError(vendor.blockReason);
  }
}

export async function assertDriverAccountActive(driverId: string): Promise<void> {
  const driver = await Driver.findById(driverId).select('status blockReason').lean();
  if (!driver) {
    throw new AppError({ en: 'Driver not found', de: 'Fahrer nicht gefunden' }, 404, 'NOT_FOUND');
  }
  if (driver.status === 'deleted') {
    throw new AppError(
      {
        en: 'Account has been removed. Please sign in again with your phone number.',
        de: 'Konto wurde entfernt. Bitte melden Sie sich erneut mit Ihrer Telefonnummer an.',
      },
      403,
      'ACCOUNT_DELETED'
    );
  }
  if (driver.status === 'blocked') {
    throw createAccountBlockedError(driver.blockReason);
  }
}
