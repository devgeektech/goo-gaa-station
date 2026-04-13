import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import { AppError } from '../../utils/AppError';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/response';
import { parsePagination } from '../../utils/pagination';
import { Vendor } from '../../models/Vendor';
import { Order } from '../../models/Order';
import { Rating } from '../../models/Rating';

async function recalcVendorRating(vendorId: mongoose.Types.ObjectId): Promise<{ averageRating: number; totalRatings: number }> {
  const [agg] = await (Rating as any).aggregate([
    { $match: { vendorId } },
    { $group: { _id: '$vendorId', averageRating: { $avg: '$rating' }, totalRatings: { $sum: 1 } } },
  ]);
  const averageRating = agg?.averageRating != null ? Math.round(Number(agg.averageRating) * 10) / 10 : 0;
  const totalRatings = Number(agg?.totalRatings ?? 0);
  await (Vendor as any).findByIdAndUpdate(vendorId, {
    averageRating,
    totalRatings,
    // Keep backward-compat key used in app sorting/UI.
    rating: averageRating,
  });
  return { averageRating, totalRatings };
}

/** POST /api/v1/app/vendors/:id/ratings — customer rates vendor by delivered order */
export const addVendorRating = asyncHandler(async (req: Request, res: Response) => {
  const customerId = req.user?._id;
  const vendorId = req.params.id;
  const { orderId, rating, comment } = req.body ?? {};

  if (!customerId) {
    throw new AppError({ en: 'Unauthorized', de: 'Nicht autorisiert' }, 401, 'UNAUTHORIZED');
  }
  if (!mongoose.Types.ObjectId.isValid(vendorId)) {
    throw new AppError({ en: 'Vendor not found', de: 'Anbieter nicht gefunden' }, 404, 'NOT_FOUND');
  }
  if (!orderId || !mongoose.Types.ObjectId.isValid(String(orderId))) {
    throw new AppError({ en: 'Valid orderId is required', de: 'Gültige orderId erforderlich' }, 400, 'VALIDATION_ERROR');
  }

  const score = Number(rating);
  if (!Number.isInteger(score) || score < 1 || score > 5) {
    throw new AppError({ en: 'rating must be an integer between 1 and 5', de: 'rating muss eine Ganzzahl zwischen 1 und 5 sein' }, 400, 'VALIDATION_ERROR');
  }

  const vendorObjectId = new mongoose.Types.ObjectId(vendorId);
  const orderObjectId = new mongoose.Types.ObjectId(String(orderId));
  const customerObjectId = new mongoose.Types.ObjectId(customerId);

  const [vendor, order, existing] = await Promise.all([
    (Vendor as any).findById(vendorObjectId).select('_id status').lean(),
    (Order as any).findById(orderObjectId).select('status customerId vendorId').lean(),
    (Rating as any).findOne({ orderId: orderObjectId }).select('_id').lean(),
  ]);

  if (!vendor || (vendor as { status?: string }).status === 'deleted') {
    throw new AppError({ en: 'Vendor not found', de: 'Anbieter nicht gefunden' }, 404, 'NOT_FOUND');
  }
  if (!order) {
    throw new AppError({ en: 'Order not found', de: 'Bestellung nicht gefunden' }, 404, 'NOT_FOUND');
  }
  if (String((order as { customerId?: unknown }).customerId) !== String(customerObjectId)) {
    throw new AppError({ en: 'You can only rate your own delivered orders', de: 'Nur eigene gelieferte Bestellungen können bewertet werden' }, 403, 'FORBIDDEN');
  }
  if (String((order as { vendorId?: unknown }).vendorId) !== String(vendorObjectId)) {
    throw new AppError({ en: 'Order does not belong to this vendor', de: 'Bestellung gehört nicht zu diesem Anbieter' }, 400, 'VALIDATION_ERROR');
  }
  if ((order as { status?: string }).status !== 'delivered') {
    throw new AppError({ en: 'Order must be delivered before rating', de: 'Bestellung muss geliefert sein' }, 400, 'INVALID_STATUS');
  }
  if (existing) {
    throw new AppError({ en: 'This order has already been rated', de: 'Diese Bestellung wurde bereits bewertet' }, 400, 'ALREADY_RATED');
  }

  const created = await (Rating as any).create({
    rating: score,
    comment: comment ? String(comment).trim() : null,
    customerId: customerObjectId,
    vendorId: vendorObjectId,
    orderId: orderObjectId,
  });
  const summary = await recalcVendorRating(vendorObjectId);

  return sendSuccess(res, {
    rating: created,
    averageRating: summary.averageRating,
    totalRatings: summary.totalRatings,
  }, 201);
});

/** GET /api/v1/app/vendors/:id/ratings — list vendor ratings with summary */
export const getVendorRatings = asyncHandler(async (req: Request, res: Response) => {
  const vendorId = req.params.id;
  if (!mongoose.Types.ObjectId.isValid(vendorId)) {
    throw new AppError({ en: 'Vendor not found', de: 'Anbieter nicht gefunden' }, 404, 'NOT_FOUND');
  }
  const vendorObjectId = new mongoose.Types.ObjectId(vendorId);
  const vendor = await (Vendor as any).findById(vendorObjectId).select('_id status averageRating totalRatings rating').lean();
  if (!vendor || (vendor as { status?: string }).status === 'deleted') {
    throw new AppError({ en: 'Vendor not found', de: 'Anbieter nicht gefunden' }, 404, 'NOT_FOUND');
  }

  const { page, limit } = parsePagination(req.query, 10);
  const [rows, total] = await Promise.all([
    (Rating as any).find({ vendorId: vendorObjectId })
      .populate('customerId', 'name phone')
      .populate('orderId', 'orderNumber')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    (Rating as any).countDocuments({ vendorId: vendorObjectId }),
  ]);
  const totalPages = Math.ceil(total / limit) || 1;

  const averageRating = Number((vendor as { averageRating?: number }).averageRating ?? (vendor as { rating?: number }).rating ?? 0);
  const totalRatings = Number((vendor as { totalRatings?: number }).totalRatings ?? total ?? 0);

  return sendSuccess(res, {
    ratings: rows,
    averageRating,
    totalRatings,
    total,
    page,
    limit,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  });
});

