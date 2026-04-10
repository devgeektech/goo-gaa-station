import type { Request, Response } from 'express';
import type { Server as SocketIOServer } from 'socket.io';
import { Driver } from '../../models/Driver';
import { Order } from '../../models/Order';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/response';
import { AppError } from '../../utils/AppError';

function getIo(req: Request): SocketIOServer | undefined {
  return (req.app as { get?(key: string): unknown }).get?.('io') as SocketIOServer | undefined;
}

/**
 * PATCH /api/v1/driver/location — Persist GPS + broadcast to customer & vendor for active order.
 * Complements socket event `driver:location_update` (both remain supported).
 */
export const updateLocation = asyncHandler(async (req: Request, res: Response) => {
  const driverDoc = req.driver;
  if (!driverDoc?._id) {
    throw new AppError({ en: 'Unauthorized', de: 'Nicht autorisiert' }, 401, 'UNAUTHORIZED');
  }

  const { lat, lng, heading } = req.body ?? {};
  if (lat == null || lng == null) {
    throw new AppError({ en: 'lat and lng required', de: 'lat und lng erforderlich' }, 400, 'VALIDATION_ERROR');
  }

  const latNum = Number(lat);
  const lngNum = Number(lng);
  if (Number.isNaN(latNum) || latNum < -90 || latNum > 90) {
    throw new AppError({ en: 'Invalid lat', de: 'Ungültige lat' }, 400, 'VALIDATION_ERROR');
  }
  if (Number.isNaN(lngNum) || lngNum < -180 || lngNum > 180) {
    throw new AppError({ en: 'Invalid lng', de: 'Ungültige lng' }, 400, 'VALIDATION_ERROR');
  }

  const headingVal = heading != null && heading !== '' ? Number(heading) : null;
  const now = new Date();

  await Driver.findByIdAndUpdate(driverDoc._id, {
    'currentLocation.lat': latNum,
    'currentLocation.lng': lngNum,
    'currentLocation.heading': headingVal != null && !Number.isNaN(headingVal) ? headingVal : null,
    'currentLocation.updatedAt': now,
    liveLocation: { type: 'Point', coordinates: [lngNum, latNum] },
    lastLocationAt: now,
    lastActiveAt: now,
    isOnline: true,
  });

  const activeOrder = await Order.findOne({
    driverId: driverDoc._id,
    status: { $in: ['preparing', 'ready', 'picked_up', 'on_the_way'] },
  })
    .select('customerId vendorId _id')
    .lean();

  const io = getIo(req);
  if (activeOrder && io) {
    const locationPayload = {
      orderId: activeOrder._id,
      driverId: driverDoc._id,
      lat: latNum,
      lng: lngNum,
      heading: headingVal != null && !Number.isNaN(headingVal) ? headingVal : null,
      updatedAt: now.toISOString(),
    };
    io.to(`customer:${String(activeOrder.customerId)}`).emit('driver:location', locationPayload);
    if (activeOrder.vendorId) {
      io.to(`vendor:${String(activeOrder.vendorId)}`).emit('driver:location', locationPayload);
    }
  }

  return sendSuccess(res, {
    message: 'Location updated',
    hasActiveOrder: !!activeOrder,
  });
});
