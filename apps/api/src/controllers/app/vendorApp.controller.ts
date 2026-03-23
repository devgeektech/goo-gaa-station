import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Vendor } from '../../models/Vendor';
import { Product } from '../../models/Product';
import { AppError } from '../../utils/AppError';
import { sendSuccess } from '../../utils/response';
import { asyncHandler } from '../../utils/asyncHandler';
import { parsePagination } from '../../utils/pagination';

/** GET /api/v1/app/vendors — List vendors (active only), filter by category, search, optional filters/sort */
export const listVendors = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit } = parsePagination(req.query, 10);
  const search = String(req.query.search || '').trim();
  const categoryId = req.query.category as string | undefined;
  const sortQ = String(req.query.sort || 'recommended').trim();

  const filter: Record<string, unknown> = { status: 'active' };
  if (categoryId && mongoose.Types.ObjectId.isValid(categoryId)) {
    filter.categoryIds = new mongoose.Types.ObjectId(categoryId);
  }
  if (search) {
    (filter as Record<string, unknown>).name = { $regex: search, $options: 'i' };
  }

  const minRating = req.query.minRating != null && req.query.minRating !== '' ? Number(req.query.minRating) : NaN;
  const maxDeliveryTime = req.query.maxDeliveryTime != null && req.query.maxDeliveryTime !== '' ? Number(req.query.maxDeliveryTime) : NaN;
  const minPrice = req.query.minPrice != null && req.query.minPrice !== '' ? Number(req.query.minPrice) : NaN;
  const maxPrice = req.query.maxPrice != null && req.query.maxPrice !== '' ? Number(req.query.maxPrice) : NaN;
  if (!Number.isNaN(minRating) && Vendor.schema.paths.rating) (filter as Record<string, unknown>).rating = { $gte: minRating };
  if (!Number.isNaN(maxDeliveryTime) && Vendor.schema.paths.deliveryTime) (filter as Record<string, unknown>).deliveryTime = { $lte: maxDeliveryTime };
  if (Vendor.schema.paths.minimumOrder) {
    const cond: Record<string, number> = {};
    if (!Number.isNaN(minPrice)) cond.$gte = minPrice;
    if (!Number.isNaN(maxPrice)) cond.$lte = maxPrice;
    if (Object.keys(cond).length > 0) (filter as Record<string, unknown>).minimumOrder = cond;
  }

  let sort: Record<string, 1 | -1> = { createdAt: -1, sortOrder: 1, name: 1 };
  if (sortQ === 'rating' && Vendor.schema.paths.rating) sort = { rating: -1, sortOrder: 1, name: 1 };
  else if (sortQ === 'deliveryTime' && Vendor.schema.paths.deliveryTime) sort = { deliveryTime: 1, sortOrder: 1, name: 1 };
  else if (sortQ === 'recommended') sort = { createdAt: -1, sortOrder: 1, name: 1 };
  else if (sortQ === 'rating' || sortQ === 'deliveryTime') sort = { sortOrder: 1, name: 1 };

  const [vendors, total] = await Promise.all([
    Vendor.find(filter)
      .select('name slug description logo coverImage address categoryIds sortOrder')
      .populate('categoryIds', '_id name slug icon')
      .lean()
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(limit),
    Vendor.countDocuments(filter),
  ]);
  const pages = Math.ceil(total / limit) || 1;
  return sendSuccess(res, { vendors, total, page, pages });
});

/** GET /api/v1/app/vendors/:id — Vendor detail with products (active only) */
export const getVendor = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id;
  const vendor = await Vendor.findOne({ _id: id, status: 'active' })
    .populate('categoryIds', '_id name slug icon')
    .lean();
  if (!vendor) {
    throw new AppError({ en: 'Vendor not found', de: 'Anbieter nicht gefunden' }, 404, 'NOT_FOUND');
  }
  const products = await Product.find({
    vendor: new mongoose.Types.ObjectId(id),
    isDeleted: false,
    isAvailable: true,
  })
    .select('_id name description price image category isAvailable sortOrder')
    .populate('category', '_id name')
    .lean()
    .sort({ sortOrder: 1 });
  return sendSuccess(res, { vendor, products });
});
