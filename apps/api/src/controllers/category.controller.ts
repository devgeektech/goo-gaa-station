import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Category } from '../models/Category';
import { Vendor } from '../models/Vendor';
import { AppError } from '../utils/AppError';
import { sendSuccess } from '../utils/response';
import { asyncHandler } from '../utils/asyncHandler';
import { parsePagination } from '../utils/pagination';
import {
  getUploadMiddleware,
  deleteLocalFile,
  getFileUrl,
  MAX_FILE_SIZE_2MB,
} from '../utils/storageProvider';

const CATEGORY_TYPES = ['food', 'grocery', 'pharmacy', 'fashion', 'retail'] as const;
const uploadCategoryIcon = getUploadMiddleware('categories', MAX_FILE_SIZE_2MB);

/** GET /api/v1/admin/categories — List (isDeleted: false), filter by type & isActive, sort by sortOrder */
export const adminListCategories = asyncHandler(async (req: Request, res: Response) => {
  const filter: Record<string, unknown> = { isDeleted: false };
  const typeQ = String(req.query.type || '').trim();
  if (typeQ && CATEGORY_TYPES.includes(typeQ as any)) filter.type = typeQ;
  if (req.query.isActive !== undefined) filter.isActive = req.query.isActive === 'true';

  const list = await Category.find(filter).lean().sort({ sortOrder: 1, name: 1 });
  return sendSuccess(res, list);
});

/** POST /api/v1/admin/categories — Create (icon optional via multer) */
export const adminCreateCategory = asyncHandler(async (req: Request, res: Response) => {
  await new Promise<void>((resolve, reject) => {
    uploadCategoryIcon.single('icon')(req as any, res as any, (err: unknown) => (err ? reject(err) : resolve()));
  });

  const body = req.body ?? {};
  const name = String(body.name || '').trim();
  const type = String(body.type || '').trim().toLowerCase();
  if (!name) throw new AppError({ en: 'Name is required', de: 'Name erforderlich' }, 422, 'VALIDATION_ERROR');
  if (!CATEGORY_TYPES.includes(type as any)) {
    throw new AppError({ en: 'Type must be one of: food, grocery, pharmacy, fashion', de: 'Ungültiger Typ' }, 422, 'VALIDATION_ERROR');
  }

  const existing = await Category.findOne({ name, isDeleted: false });
  if (existing) throw new AppError({ en: 'Category name already exists', de: 'Kategoriename existiert bereits' }, 409, 'CONFLICT');

  const payload: Record<string, unknown> = {
    name,
    type,
    description: String(body.description || '').trim(),
    sortOrder: parseInt(String(body.sortOrder), 10) || 0,
    isActive: body.isActive !== false,
    isDeleted: false,
  };
  const file = req.file as Express.Multer.File | undefined;
  if (file?.filename) payload.icon = getFileUrl(file.filename, 'categories');

  const category = await Category.create(payload);
  return sendSuccess(res, category.toObject(), 201);
});

/** PATCH /api/v1/admin/categories/:id — Update; optional icon replace */
export const adminUpdateCategory = asyncHandler(async (req: Request, res: Response) => {
  await new Promise<void>((resolve, reject) => {
    uploadCategoryIcon.single('icon')(req as any, res as any, (err: unknown) => (err ? reject(err) : resolve()));
  });

  const id = req.params.id;
  const category = await Category.findOne({ _id: id, isDeleted: false });
  if (!category) throw new AppError({ en: 'Category not found', de: 'Kategorie nicht gefunden' }, 404, 'NOT_FOUND');

  const body = req.body ?? {};
  if (body.name !== undefined) category.name = String(body.name).trim();
  if (body.type !== undefined) {
    const type = String(body.type).trim().toLowerCase();
    if (!CATEGORY_TYPES.includes(type as any)) throw new AppError({ en: 'Invalid type', de: 'Ungültiger Typ' }, 422, 'VALIDATION_ERROR');
    category.type = type as any;
  }
  if (body.description !== undefined) category.description = String(body.description).trim();
  if (body.sortOrder !== undefined) category.sortOrder = parseInt(String(body.sortOrder), 10) || 0;
  if (body.isActive !== undefined) category.isActive = Boolean(body.isActive);

  const file = req.file as Express.Multer.File | undefined;
  if (file?.filename) {
    if (category.icon) deleteLocalFile(category.icon);
    category.icon = getFileUrl(file.filename, 'categories');
  }

  await category.save();
  return sendSuccess(res, category.toObject());
});

/** PATCH /api/v1/admin/categories/:id/toggle — Flip isActive */
export const adminToggleActive = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id;
  const category = await Category.findOne({ _id: id, isDeleted: false });
  if (!category) throw new AppError({ en: 'Category not found', de: 'Kategorie nicht gefunden' }, 404, 'NOT_FOUND');
  category.isActive = !category.isActive;
  await category.save();
  return sendSuccess(res, category.toObject());
});

/** PATCH /api/v1/admin/categories/reorder — Body: [{ id, sortOrder }, ...] */
export const adminReorderCategories = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body;
  const items = Array.isArray(body) ? body : body?.items ?? [];
  if (items.length === 0) return sendSuccess(res, { updated: 0 });

  const ops = items
    .filter((x: { id?: string; sortOrder?: number }) => x.id && Number.isInteger(Number(x.sortOrder)))
    .map((x: { id: string; sortOrder: number }) => ({
      updateOne: {
        filter: { _id: new mongoose.Types.ObjectId(x.id) },
        update: { $set: { sortOrder: Number(x.sortOrder) } },
      },
    }));

  const result = await Category.bulkWrite(ops);
  return sendSuccess(res, { updated: result.modifiedCount });
});

/** DELETE /api/v1/admin/categories/:id — Soft delete if no vendors use it */
export const adminDeleteCategory = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id;
  const categoryId = new mongoose.Types.ObjectId(id);
  const vendors = await Vendor.find({ categoryIds: categoryId })
    .select('_id name')
    .lean();
  if (vendors.length > 0) {
    return res.status(409).json({
      success: false,
      message: 'Category is in use',
      vendors: vendors.map((v) => ({ _id: v._id, name: (v as { name: string }).name })),
    });
  }
  const category = await Category.findOne({ _id: id, isDeleted: false });
  if (!category) throw new AppError({ en: 'Category not found', de: 'Kategorie nicht gefunden' }, 404, 'NOT_FOUND');
  category.isDeleted = true;
  await category.save();
  return sendSuccess(res, category.toObject());
});

/** GET /api/v1/app/categories — Public list (isActive, !isDeleted), optional ?type= */
export const appListCategories = asyncHandler(async (req: Request, res: Response) => {
  const filter: Record<string, unknown> = { isActive: true, isDeleted: false };
  const typeQ = String(req.query.type || '').trim();
  if (typeQ && CATEGORY_TYPES.includes(typeQ as any)) filter.type = typeQ;

  const list = await Category.find(filter)
    .select('_id name slug icon type sortOrder')
    .lean()
    .sort({ sortOrder: 1 });

  // Group categories by `type` for better UI consumption.
  // Response format:
  // { data: [{ type: 'food', categories: [{ _id, name, slug, icon, sortOrder }, ...] }, ...] }
  const groupsByType = new Map<string, typeof list>();
  for (const item of list) {
    const key = String((item as { type?: unknown }).type ?? '');
    if (!groupsByType.has(key)) groupsByType.set(key, []);
    groupsByType.get(key)!.push(item);
  }

  const data = Array.from(groupsByType.entries())
    .sort(([a], [b]) => a.localeCompare(b)) // stable alphabetical order by type
    .map(([type, items]) => ({
      type,
      categories: items.map((c) => {
        const { type: _ignored, ...rest } = c as unknown as { type?: unknown };
        return rest;
      }),
    }));

  return sendSuccess(res, data);
});

/** GET /api/v1/app/categories/:slug/vendors — Vendors in category (by slug), with filters */
export const appCategoryVendors = asyncHandler(async (req: Request, res: Response) => {
  const slug = req.params.slug;
  const category = await Category.findOne({ slug, isActive: true, isDeleted: false }).lean();
  if (!category) throw new AppError({ en: 'Category not found', de: 'Kategorie nicht gefunden' }, 404, 'NOT_FOUND');

  const { page, limit } = parsePagination(req.query, 10);
  const sortQ = String(req.query.sort || 'recommended').trim();
  const filter: Record<string, unknown> = {
    categoryIds: (category as { _id: mongoose.Types.ObjectId })._id,
    status: 'active',
  };

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
