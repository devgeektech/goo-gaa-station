import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Product } from '../../models/Product';
import { Category } from '../../models/Category';
import { Vendor } from '../../models/Vendor';
import { AppError } from '../../utils/AppError';
import { sendSuccess } from '../../utils/response';
import { asyncHandler } from '../../utils/asyncHandler';
import { parsePagination } from '../../utils/pagination';
import {
  getUploadMiddleware,
  deleteLocalFile,
  getFileUrl,
  MAX_FILE_SIZE_2MB,
} from '../../utils/storageProvider';
import type { Server as SocketIOServer } from 'socket.io';

const uploadProductImage = getUploadMiddleware('products', MAX_FILE_SIZE_2MB);
const ProductModel = Product as any;
const CategoryModel = Category as any;
const VendorModel = Vendor as any;

type ReqVendor = { _id: mongoose.Types.ObjectId; name?: string; categoryIds?: mongoose.Types.ObjectId[] };

function getVendor(req: Request): ReqVendor {
  const v = (req as Request & { vendor?: ReqVendor }).vendor;
  if (!v) throw new AppError({ en: 'Vendor not found', de: 'Anbieter nicht gefunden' }, 401, 'UNAUTHORIZED');
  return v;
}

function getIo(req: Request): SocketIOServer | undefined {
  return (req.app as { get?(key: string): unknown }).get?.('io') as SocketIOServer | undefined;
}

/**
 * Keep Vendor.categoryIds aligned with current non-deleted products.
 * This is best-effort so existing product APIs keep working even if sync fails.
 */
async function syncVendorCategoryIds(vendorId: mongoose.Types.ObjectId): Promise<void> {
  try {
    const distinctCategoryIds = await ProductModel.distinct('category', {
      vendor: vendorId,
      isDeleted: false,
    });
    const normalizedCategoryIds = distinctCategoryIds
      .filter((id) => mongoose.Types.ObjectId.isValid(String(id)))
      .map((id) => new mongoose.Types.ObjectId(String(id)));
    await VendorModel.updateOne(
      { _id: vendorId },
      { $set: { categoryIds: normalizedCategoryIds } },
      { runValidators: false }
    );
  } catch (err) {
    console.warn('Failed to sync vendor categoryIds', {
      vendorId: String(vendorId),
      error: (err as Error)?.message ?? err,
    });
  }
}

/** GET /api/v1/vendor/products — list with ?category, ?isAvailable, pagination */
export const listProducts = asyncHandler(async (req: Request, res: Response) => {
  const vendor = getVendor(req);
  const { page, limit } = parsePagination(req.query);
  const categoryId = req.query.category as string | undefined;
  const isAvailable = req.query.isAvailable as string | undefined;

  const filter: Record<string, unknown> = { vendor: vendor._id, isDeleted: false };
  if (categoryId && mongoose.Types.ObjectId.isValid(categoryId)) filter.category = new mongoose.Types.ObjectId(categoryId);
  if (isAvailable !== undefined) {
    if (isAvailable === 'true') filter.isAvailable = true;
    else if (isAvailable === 'false') filter.isAvailable = false;
  }

  const [products, total] = await Promise.all([
    ProductModel.find(filter).populate('category', 'name slug').sort({ sortOrder: 1, name: 1 }).skip((page - 1) * limit).limit(limit).lean(),
    ProductModel.countDocuments(filter),
  ]);
  const totalPages = Math.ceil(total / limit) || 1;
  return sendSuccess(res, products, 200, {
    total,
    page,
    limit,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  });
});

/** GET /api/v1/vendor/products/:id — single product; 403 if wrong vendor */
export const getProduct = asyncHandler(async (req: Request, res: Response) => {
  const vendor = getVendor(req);
  const id = req.params.id;
  const product = await ProductModel.findOne({ _id: id, vendor: vendor._id, isDeleted: false })
    .populate('category', 'name slug icon')
    .lean();
  if (!product) {
    throw new AppError({ en: 'Product not found', de: 'Produkt nicht gefunden' }, 404, 'NOT_FOUND');
  }
  if (product.category && typeof product.category === 'string') {
    const category = await CategoryModel.findById(product.category)
      .select('name slug')
      .lean();

    product.category = category || null;
  }

  return sendSuccess(res, product);
});

/** POST /api/v1/vendor/products — multipart: name, price, category (req), description, image (file 2MB image/*) */
export const createProduct = asyncHandler(async (req: Request, res: Response) => {
  const upload = uploadProductImage.single('image');
  await new Promise<void>((resolve, reject) => {
    upload(req as Request & { file?: Express.Multer.File }, res as Response, (err: unknown) =>
      err ? reject(err) : resolve()
    );
  });

  const vendor = getVendor(req);
  const body = req.body ?? {};
  const name = String(body.name || '').trim();
  const price = parseFloat(String(body.price));
  const categoryId = String(body.category || '').trim();
  if (!name) throw new AppError({ en: 'Name is required', de: 'Name erforderlich' }, 400, 'VALIDATION_ERROR');
  if (Number.isNaN(price) || price < 0) throw new AppError({ en: 'Valid price required', de: 'Gültiger Preis erforderlich' }, 400, 'VALIDATION_ERROR');
  if (!categoryId) throw new AppError({ en: 'Category is required', de: 'Kategorie erforderlich' }, 400, 'VALIDATION_ERROR');

  const catId = new mongoose.Types.ObjectId(categoryId);

  const categoryDoc = await CategoryModel.findById(catId).select('name').lean();
  if (!categoryDoc) throw new AppError({ en: 'Category not found', de: 'Kategorie nicht gefunden' }, 400, 'VALIDATION_ERROR');

  const payload: Record<string, unknown> = {
    vendor: vendor._id,
    name,
    description: String(body.description || '').trim(),
    price,
    category: catId,
    isAvailable: true,
    isDeleted: false,
    sortOrder: parseInt(String(body.sortOrder), 10) || 0,
  };
  const file = req.file as Express.Multer.File | undefined;
  if (file) payload.image = getFileUrl(file, 'products');
  else payload.image = null;

  const product = await ProductModel.create(payload);
  const productObj = product.toObject();
  await syncVendorCategoryIds(vendor._id);

  const io = getIo(req);
  if (io) {
    io.to('admin').emit('product:created', {
      productId: product._id,
      productName: product.name,
      vendorId: vendor._id,
      vendorName: vendor.name ?? '',
      categoryName: categoryDoc.name,
      price: product.price,
      createdAt: product.createdAt,
    });
  }

  return sendSuccess(res, productObj, 200);
});

/** PATCH /api/v1/vendor/products/:id — multipart; all fields optional; replace image if uploaded */
export const updateProduct = asyncHandler(async (req: Request, res: Response) => {
  const upload = uploadProductImage.single('image');
  await new Promise<void>((resolve, reject) => {
    upload(req as Request & { file?: Express.Multer.File }, res as Response, (err: unknown) =>
      err ? reject(err) : resolve()
    );
  });

  const vendor = getVendor(req);
  const id = req.params.id;
  const product = await ProductModel.findOne({ _id: id, vendor: vendor._id, isDeleted: false });
  if (!product) {
    throw new AppError({ en: 'Product not found', de: 'Produkt nicht gefunden' }, 404, 'NOT_FOUND');
  }

  const body = req.body ?? {};
  if (body.name !== undefined) product.name = String(body.name).trim();
  if (body.description !== undefined) product.description = String(body.description).trim();
  if (body.price !== undefined) {
    const p = parseFloat(String(body.price));
    if (!Number.isNaN(p) && p >= 0) product.price = p;
  }
  if (body.category !== undefined) {
    const rawCategoryId = String(body.category).trim();
    if (!mongoose.Types.ObjectId.isValid(rawCategoryId)) {
      throw new AppError({ en: 'Invalid category id', de: 'Ungültige Kategorie-ID' }, 400, 'VALIDATION_ERROR');
    }
    const catId = new mongoose.Types.ObjectId(rawCategoryId);
    const categoryDoc = await CategoryModel.findById(catId).select('_id').lean();
    if (!categoryDoc) throw new AppError({ en: 'Category not found', de: 'Kategorie nicht gefunden' }, 400, 'VALIDATION_ERROR');
    product.category = catId;
  }
  if (body.isAvailable !== undefined) product.isAvailable = Boolean(body.isAvailable);
  if (body.sortOrder !== undefined) product.sortOrder = parseInt(String(body.sortOrder), 10) || 0;

  const file = req.file as Express.Multer.File | undefined;
  if (file) {
    if (product.image) deleteLocalFile(product.image);
    product.image = getFileUrl(file, 'products');
  }

  await product.save();
  await syncVendorCategoryIds(vendor._id);
  return sendSuccess(res, product.toObject());
});

/** PATCH /api/v1/vendor/products/:id/toggle — flip isAvailable; if false emit product:toggled */
export const toggleProduct = asyncHandler(async (req: Request, res: Response) => {
  const vendor = getVendor(req);
  const id = req.params.id;
  const product = await ProductModel.findOne({ _id: id, vendor: vendor._id, isDeleted: false });
  if (!product) {
    throw new AppError({ en: 'Product not found', de: 'Produkt nicht gefunden' }, 404, 'NOT_FOUND');
  }
  product.isAvailable = !product.isAvailable;
  await product.save();

  const io = getIo(req);
  if (io && product.isAvailable === false) {
    io.to('admin').emit('product:toggled', {
      productId: product._id,
      productName: product.name,
      vendorId: vendor._id,
      vendorName: vendor.name ?? '',
      isAvailable: false,
    });
  }

  return sendSuccess(res, product.toObject());
});

/** DELETE /api/v1/vendor/products/:id — soft delete; emit product:deleted; returns success payload */
export const deleteProduct = asyncHandler(async (req: Request, res: Response) => {
  const vendor = getVendor(req);
  const id = req.params.id;
  const product = await ProductModel.findOne({ _id: id, vendor: vendor._id, isDeleted: false });
  if (!product) {
    throw new AppError({ en: 'Product not found', de: 'Produkt nicht gefunden' }, 404, 'NOT_FOUND');
  }
  product.isDeleted = true;
  await product.save();
  await syncVendorCategoryIds(vendor._id);

  const io = getIo(req);
  if (io) {
    io.to('admin').emit('product:deleted', {
      productId: product._id,
      productName: product.name,
      vendorId: vendor._id,
      vendorName: vendor.name ?? '',
    });
  }

  return sendSuccess(res, { message: 'Product deleted successfully' }, 200);
});
