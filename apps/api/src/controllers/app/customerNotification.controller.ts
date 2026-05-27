import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import { CustomerNotification } from '../../models/CustomerNotification';
import { asyncHandler } from '../../utils/asyncHandler';
import { AppError } from '../../utils/AppError';
import { sendSuccess } from '../../utils/response';
import { parsePagination } from '../../utils/pagination';
import { MESSAGES } from '../../constants/messages';

const CN = CustomerNotification as mongoose.Model<mongoose.Document>;

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

/** GET /api/v1/app/customer/notifications */
export const listCustomerNotifications = asyncHandler(async (req: Request, res: Response) => {
  const customerId = req.user?._id;
  if (!customerId) {
    throw new AppError({ en: MESSAGES.AUTH.en.unauthorized, de: MESSAGES.AUTH.de.unauthorized }, 401);
  }

  const { page, limit } = parsePagination(req.query, 20);
  const unreadOnly = req.query.unreadOnly === 'true';
  const customerObjectId = new mongoose.Types.ObjectId(String(customerId));

  const filter: Record<string, unknown> = { customer: customerObjectId };
  if (unreadOnly) {
    filter.read = false;
  }

  const [rows, total, unreadCount] = await Promise.all([
    CN.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    CN.countDocuments(filter),
    CN.countDocuments({ customer: customerObjectId, read: false }),
  ]);

  const notifications = (rows as Record<string, unknown>[]).map(toListItem);
  const totalPages = Math.ceil(total / limit) || 1;

  return sendSuccess(res, {
    notifications,
    unreadCount,
    pagination: { page, limit, total, totalPages },
  });
});

/** PATCH /api/v1/app/customer/notifications/:id/read */
export const markCustomerNotificationRead = asyncHandler(async (req: Request, res: Response) => {
  const customerId = req.user?._id;
  const id = req.params.id;
  if (!customerId) {
    throw new AppError({ en: MESSAGES.AUTH.en.unauthorized, de: MESSAGES.AUTH.de.unauthorized }, 401);
  }
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError({ en: 'Notification not found', de: 'Benachrichtigung nicht gefunden' }, 404);
  }

  const updated = await CN.findOneAndUpdate(
    { _id: id, customer: new mongoose.Types.ObjectId(String(customerId)) },
    { $set: { read: true } },
    { new: true }
  ).lean();

  if (!updated) {
    throw new AppError({ en: 'Notification not found', de: 'Benachrichtigung nicht gefunden' }, 404);
  }

  return sendSuccess(res, toListItem(updated as Record<string, unknown>));
});
