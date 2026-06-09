import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import { VendorNotification } from '../../models/VendorNotification';
import { asyncHandler } from '../../utils/asyncHandler';
import { AppError } from '../../utils/AppError';
import { sendSuccess } from '../../utils/response';
import { parsePagination } from '../../utils/pagination';

const VN = VendorNotification as mongoose.Model<mongoose.Document>;

function toListItem(row: Record<string, unknown>) {
  const data = (row.data as { orderNumber?: string | null; screen?: string | null } | undefined) ?? {};
  return {
    _id: row._id,
    type: row.type,
    iconKey: row.iconKey,
    title: row.title,
    body: row.body,
    read: Boolean(row.read),
    orderId: row.orderId ?? null,
    orderNumber: data.orderNumber ?? null,
    screen: data.screen ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** GET /api/v1/vendor/notifications */
export const listVendorNotifications = asyncHandler(async (req: Request, res: Response) => {
  const vendorId = req.vendor?._id;
  if (!vendorId) {
    throw new AppError({ en: 'Unauthorized', de: 'Nicht autorisiert' }, 401, 'UNAUTHORIZED');
  }

  const { page, limit } = parsePagination(req.query, 20);
  const unreadOnly = req.query.unreadOnly === 'true';
  const vendorObjectId = new mongoose.Types.ObjectId(String(vendorId));

  const filter: Record<string, unknown> = { vendor: vendorObjectId };
  if (unreadOnly) {
    filter.read = false;
  }

  const [rows, total, unreadCount] = await Promise.all([
    VN.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    VN.countDocuments(filter),
    VN.countDocuments({ vendor: vendorObjectId, read: false }),
  ]);

  const notifications = (rows as Record<string, unknown>[]).map(toListItem);
  const totalPages = Math.ceil(total / limit) || 1;

  return sendSuccess(res, {
    notifications,
    unreadCount,
    pagination: { page, limit, total, totalPages },
  });
});

/** PATCH /api/v1/vendor/notifications/:id/read */
export const markVendorNotificationRead = asyncHandler(async (req: Request, res: Response) => {
  const vendorId = req.vendor?._id;
  const id = req.params.id;
  if (!vendorId) {
    throw new AppError({ en: 'Unauthorized', de: 'Nicht autorisiert' }, 401, 'UNAUTHORIZED');
  }
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError({ en: 'Notification not found', de: 'Benachrichtigung nicht gefunden' }, 404);
  }

  const updated = await VN.findOneAndUpdate(
    { _id: id, vendor: new mongoose.Types.ObjectId(String(vendorId)) },
    { $set: { read: true } },
    { new: true }
  ).lean();

  if (!updated) {
    throw new AppError({ en: 'Notification not found', de: 'Benachrichtigung nicht gefunden' }, 404);
  }

  return sendSuccess(res, toListItem(updated as Record<string, unknown>));
});

/** PATCH /api/v1/vendor/notifications/read-all */
export const markAllVendorNotificationsRead = asyncHandler(async (req: Request, res: Response) => {
  const vendorId = req.vendor?._id;
  if (!vendorId) {
    throw new AppError({ en: 'Unauthorized', de: 'Nicht autorisiert' }, 401, 'UNAUTHORIZED');
  }

  const result = await VN.updateMany(
    { vendor: new mongoose.Types.ObjectId(String(vendorId)), read: false },
    { $set: { read: true } }
  );

  return sendSuccess(res, { updated: result.modifiedCount });
});
