import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import { DriverNotification } from '../../models/DriverNotification';
import { asyncHandler } from '../../utils/asyncHandler';
import { AppError } from '../../utils/AppError';
import { sendSuccess } from '../../utils/response';
import { parsePagination } from '../../utils/pagination';

const DN = DriverNotification as mongoose.Model<mongoose.Document>;

function toListItem(row: Record<string, unknown>) {
  const data = (row.data as { orderNumber?: string | null; estimatedPayout?: number | null } | undefined) ?? {};
  const type = String(row.type ?? 'general');
  return {
    _id: row._id,
    type,
    iconKey: type,
    title: row.title,
    body: row.body,
    read: Boolean(row.read),
    orderId: row.orderId ?? null,
    orderNumber: data.orderNumber ?? null,
    screen: row.orderId ? 'OrderDetail' : null,
    estimatedPayout: data.estimatedPayout ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

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

  const [rows, total, unreadCount] = await Promise.all([
    DN.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    DN.countDocuments(filter),
    DN.countDocuments({ driver: driverId, read: false }),
  ]);

  const notifications = (rows as Record<string, unknown>[]).map(toListItem);
  const totalPages = Math.ceil(total / limit) || 1;

  return sendSuccess(res, {
    notifications,
    unreadCount,
    pagination: { page, limit, total, totalPages },
  });
});

/** PATCH /api/v1/driver/notifications/:id/read */
export const markNotificationRead = asyncHandler(async (req: Request, res: Response) => {
  const driverDoc = req.driver;
  const id = req.params.id;
  if (!driverDoc?._id) {
    throw new AppError({ en: 'Unauthorized', de: 'Nicht autorisiert' }, 401, 'UNAUTHORIZED');
  }
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError({ en: 'Notification not found', de: 'Benachrichtigung nicht gefunden' }, 404);
  }

  const updated = await DN.findOneAndUpdate(
    { _id: id, driver: driverDoc._id },
    { $set: { read: true } },
    { new: true }
  ).lean();

  if (!updated) {
    throw new AppError({ en: 'Notification not found', de: 'Benachrichtigung nicht gefunden' }, 404);
  }

  return sendSuccess(res, toListItem(updated as Record<string, unknown>));
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

/** DELETE /api/v1/driver/notifications/:id */
export const deleteNotification = asyncHandler(async (req: Request, res: Response) => {
  const driverDoc = req.driver;
  const id = req.params.id;
  if (!driverDoc?._id) {
    throw new AppError({ en: 'Unauthorized', de: 'Nicht autorisiert' }, 401, 'UNAUTHORIZED');
  }
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError({ en: 'Notification not found', de: 'Benachrichtigung nicht gefunden' }, 404);
  }

  const deleted = await DN.findOneAndDelete({
    _id: id,
    driver: driverDoc._id,
  }).lean();

  if (!deleted) {
    throw new AppError({ en: 'Notification not found', de: 'Benachrichtigung nicht gefunden' }, 404);
  }

  return sendSuccess(res, { deleted: true, _id: id });
});
