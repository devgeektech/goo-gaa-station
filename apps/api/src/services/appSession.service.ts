import type { Server as SocketIOServer } from 'socket.io';
import mongoose from 'mongoose';
import { User } from '../models/User';
import { Vendor } from '../models/Vendor';
import { invalidateAllRefreshTokensForUser } from './auth.service';
import { setVendorClosedFromApp } from './vendorPresence.service';
import { AppError } from '../utils/AppError';

const SESSION_REVOKED_MESSAGE = {
  en: 'Session ended. Please sign in again (logged in on another device).',
  de: 'Sitzung beendet. Bitte erneut anmelden (Anmeldung auf anderem Gerät).',
};

const SESSION_REVOKED_SOCKET = {
  reason: 'logged_in_elsewhere' as const,
  message: 'You have been logged out because this account signed in on another device.',
};

/** Compare JWT session version with document (missing treated as 0). */
export function appSessionMatches(
  tokenVersion: number | undefined,
  docVersion: number | undefined | null
): boolean {
  return (tokenVersion ?? 0) === (docVersion ?? 0);
}

export function createSessionRevokedError(): AppError {
  return new AppError(SESSION_REVOKED_MESSAGE, 401, 'SESSION_REVOKED');
}

export async function assertCustomerSessionMatches(
  userId: string,
  tokenVersion?: number
): Promise<number> {
  const user = await User.findById(userId).select('sessionVersion').lean();
  if (!user) {
    throw new AppError({ en: 'Customer not found', de: 'Kunde nicht gefunden' }, 404, 'NOT_FOUND');
  }
  const version = Number((user as { sessionVersion?: number }).sessionVersion ?? 0);
  if (!appSessionMatches(tokenVersion, version)) {
    throw createSessionRevokedError();
  }
  return version;
}

export async function assertVendorSessionMatches(
  vendorId: string,
  tokenVersion?: number
): Promise<number> {
  const vendor = await Vendor.findById(vendorId).select('sessionVersion').lean();
  if (!vendor) {
    throw new AppError({ en: 'Vendor not found', de: 'Anbieter nicht gefunden' }, 404, 'NOT_FOUND');
  }
  const version = Number((vendor as { sessionVersion?: number }).sessionVersion ?? 0);
  if (!appSessionMatches(tokenVersion, version)) {
    throw createSessionRevokedError();
  }
  return version;
}

/** Invalidate refresh tokens, bump sessionVersion, notify sockets — customer OTP login. */
export async function startNewCustomerSession(
  userId: mongoose.Types.ObjectId | string,
  io?: SocketIOServer
): Promise<number> {
  const oid = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;
  const idStr = oid.toString();

  await invalidateAllRefreshTokensForUser(oid, 'User');

  const updated = await User.findByIdAndUpdate(oid, { $inc: { sessionVersion: 1 } }, { new: true })
    .select('sessionVersion')
    .lean();

  const sessionVersion = Number((updated as { sessionVersion?: number } | null)?.sessionVersion ?? 1);

  if (io) {
    io.to(`customer:${idStr}`).emit('customer:session_revoked', SESSION_REVOKED_SOCKET);
    void io.in(`customer:${idStr}`).disconnectSockets(true);
  }

  return sessionVersion;
}

/** Invalidate refresh tokens, bump sessionVersion, close store presence — vendor OTP login. */
export async function startNewVendorSession(
  vendorId: mongoose.Types.ObjectId | string,
  io?: SocketIOServer
): Promise<number> {
  const oid = typeof vendorId === 'string' ? new mongoose.Types.ObjectId(vendorId) : vendorId;
  const idStr = oid.toString();

  await invalidateAllRefreshTokensForUser(oid, 'Vendor');
  await setVendorClosedFromApp(idStr, io);

  const updated = await Vendor.findByIdAndUpdate(oid, { $inc: { sessionVersion: 1 } }, { new: true })
    .select('sessionVersion')
    .lean();

  const sessionVersion = Number((updated as { sessionVersion?: number } | null)?.sessionVersion ?? 1);

  if (io) {
    io.to(`vendor:${idStr}`).emit('vendor:session_revoked', SESSION_REVOKED_SOCKET);
    void io.in(`vendor:${idStr}`).disconnectSockets(true);
  }

  return sessionVersion;
}

/** Bump session version without login (e.g. account block) so access JWTs stop working. */
export async function bumpCustomerSessionVersion(userId: mongoose.Types.ObjectId | string): Promise<void> {
  const oid = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;
  await User.findByIdAndUpdate(oid, { $inc: { sessionVersion: 1 } }, { runValidators: false });
}

export async function bumpVendorSessionVersion(vendorId: mongoose.Types.ObjectId | string): Promise<void> {
  const oid = typeof vendorId === 'string' ? new mongoose.Types.ObjectId(vendorId) : vendorId;
  await Vendor.findByIdAndUpdate(oid, { $inc: { sessionVersion: 1 } }, { runValidators: false });
}
