import mongoose from 'mongoose';
import type { Server as SocketIOServer } from 'socket.io';
import { Driver } from '../models/Driver';
import { DriverNotification } from '../models/DriverNotification';
import { Order } from '../models/Order';
import { AppError } from '../utils/AppError';
import { MESSAGES } from '../constants/messages';
import { invalidateAllRefreshTokensForUser } from './auth.service';
import { startNewDriverSession } from './driverSession.service';

const ACTIVE_DELIVERY_STATUSES = ['preparing', 'ready', 'picked_up', 'on_the_way'] as const;

async function assertNoActiveDelivery(driverId: mongoose.Types.ObjectId): Promise<void> {
  const activeOrder = await Order.findOne({
    driverId,
    status: { $in: [...ACTIVE_DELIVERY_STATUSES] },
  })
    .select('_id orderNumber status')
    .lean();

  if (activeOrder) {
    throw new AppError(
      {
        en: 'Cannot delete driver with an active delivery. Complete or reassign the order first.',
        de: 'Fahrer mit aktiver Lieferung kann nicht gelöscht werden. Schließen oder weisen Sie die Bestellung zuerst zu.',
      },
      400,
      'DRIVER_HAS_ACTIVE_ORDER'
    );
  }
}

/** Revoke sessions and remove driver-owned rows before the Driver document is removed. */
export async function purgeDriverBeforeDelete(
  driverId: mongoose.Types.ObjectId,
  io?: SocketIOServer
): Promise<void> {
  await invalidateAllRefreshTokensForUser(driverId, 'Driver');
  if (io) {
    await startNewDriverSession(driverId, io);
  } else {
    await Driver.findByIdAndUpdate(driverId, {
      $inc: { sessionVersion: 1 },
      $set: { isOnline: false, refreshToken: null },
    });
  }
  await DriverNotification.deleteMany({ driver: driverId });
}

/**
 * Permanently remove a driver from the database (admin delete).
 * Historical orders/transactions keep their driverId for audit; populate may not resolve.
 */
export async function permanentlyDeleteDriver(
  driverId: mongoose.Types.ObjectId,
  io?: SocketIOServer
): Promise<Record<string, unknown>> {
  const driver = await Driver.findById(driverId).select('-password').lean();
  if (!driver) {
    throw new AppError({ en: MESSAGES.DRIVER.en.notFound, de: MESSAGES.DRIVER.de.notFound }, 404, 'NOT_FOUND');
  }

  await assertNoActiveDelivery(driverId);
  await purgeDriverBeforeDelete(driverId, io);

  await Driver.deleteOne({ _id: driverId });

  return driver as Record<string, unknown>;
}

/** Remove a legacy soft-deleted row so the same phone can register as a new driver. */
export async function permanentlyDeleteLegacySoftDeletedDriver(
  driverId: mongoose.Types.ObjectId
): Promise<void> {
  const driver = await Driver.findById(driverId).select('status').lean();
  if (!driver || driver.status !== 'deleted') return;

  await purgeDriverBeforeDelete(driverId);
  await Driver.deleteOne({ _id: driverId });
}
