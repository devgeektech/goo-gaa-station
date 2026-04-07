import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import { DriverNotification } from '../../models/DriverNotification';
import { asyncHandler } from '../../utils/asyncHandler';
import { AppError } from '../../utils/AppError';
import { sendSuccess } from '../../utils/response';
import { parsePagination } from '../../utils/pagination';

const DN = DriverNotification as mongoose.Model<mongoose.Document>;

/** GET /api/v1/driver/notifications */
export const getNotifications = asyncHandler(async (req: Request, res: Response) => {
  const driverDoc = req.driver;
  if (!driverDoc?._id) {
    throw new AppError({ en: 'Unauthorized', de: 'Nicht autorisiert' }, 401, 'UNAUTHORIZED');
  }

  const { page, limit } = parsePagination(req.query, 20);
  const unreadOnly = req.query.unreadOnly === 'true';
  const driverId = driverDoc._id;

  const filter: Record<string, unknown> = { driver: driverId };
  if (unreadOnly) {
    filter.read = false;
  }

  const [notifications, total, unreadCount] = await Promise.all([
    DN.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    DN.countDocuments(filter),
    DN.countDocuments({ driver: driverId, read: false }),
  ]);

  const totalPages = Math.ceil(total / limit);

  return sendSuccess(res, {
    notifications,
    unreadCount,
    pagination: { page, limit, total, totalPages },
  });
});

/** PATCH /api/v1/driver/notifications/read-all */
export const markAllRead = asyncHandler(async (req: Request, res: Response) => {
  const driverDoc = req.driver;
  if (!driverDoc?._id) {
    throw new AppError({ en: 'Unauthorized', de: 'Nicht autorisiert' }, 401, 'UNAUTHORIZED');
  }

  const result = await DN.updateMany({ driver: driverDoc._id, read: false }, { $set: { read: true } });

  return sendSuccess(res, { updated: result.modifiedCount });
});
