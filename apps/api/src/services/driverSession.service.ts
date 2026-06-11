import type { Server as SocketIOServer } from 'socket.io';
import mongoose from 'mongoose';
import { Driver } from '../models/Driver';
import { invalidateAllRefreshTokensForUser } from './auth.service';

/** Compare JWT session version with driver document (missing treated as 0). */
export function driverSessionMatches(
  tokenVersion: number | undefined,
  driverVersion: number | undefined | null
): boolean {
  return (tokenVersion ?? 0) === (driverVersion ?? 0);
}

/**
 * Invalidate all refresh tokens, bump sessionVersion, mark offline, notify sockets.
 * Call on new OTP login so only the latest device/session remains valid.
 */
export async function startNewDriverSession(
  driverId: mongoose.Types.ObjectId,
  io?: SocketIOServer
): Promise<number> {
  await invalidateAllRefreshTokensForUser(driverId, 'Driver');

  const updated = await Driver.findByIdAndUpdate(
    driverId,
    {
      $inc: { sessionVersion: 1 },
      $set: { isOnline: false },
    },
    { new: true }
  )
    .select('sessionVersion')
    .lean();

  const sessionVersion = Number(updated?.sessionVersion ?? 1);

  if (io) {
    io.to(`driver:${driverId}`).emit('driver:session_revoked', {
      reason: 'logged_in_elsewhere',
      message: 'You have been logged out because this account signed in on another device.',
    });
  }

  return sessionVersion;
}
