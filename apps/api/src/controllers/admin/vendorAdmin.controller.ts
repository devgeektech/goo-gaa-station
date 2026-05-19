import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Vendor } from '../../models/Vendor';
import { MenuItem } from '../../models/MenuItem';
import { Product } from '../../models/Product';
import { AppError } from '../../utils/AppError';
import { sendSuccess } from '../../utils/response';
import { asyncHandler } from '../../utils/asyncHandler';
import { parsePagination } from '../../utils/pagination';
import {
  getUploadMiddleware,
  deleteLocalFile,
  getFileUrl,
  MAX_FILE_SIZE_2MB,
  MAX_FILE_SIZE_10MB,
} from '../../utils/storageProvider';
import type { Server as SocketIOServer } from 'socket.io';
import { sendPushToVendor } from '../../services/fcm.service';

const VENDOR_IMAGE_MAX = MAX_FILE_SIZE_10MB;

const uploadVendorFiles = getUploadMiddleware('vendors', VENDOR_IMAGE_MAX).fields([
  { name: 'logo', maxCount: 1 },
  { name: 'coverImage', maxCount: 1 },
]);
const uploadMenuItemImage = getUploadMiddleware('menu-items', MAX_FILE_SIZE_2MB);

function toPaginated<T>(data: T[], total: number, page: number, limit: number) {
  const totalPages = Math.ceil(total / limit) || 1;
  return { data, total, page, limit, totalPages, hasNext: page < totalPages, hasPrev: page > 1 };
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** GET /api/v1/admin/vendors — List with filters (status, search, approvalStatus); meta.pendingCount */
export const listVendors = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit } = parsePagination(req.query);
  const search = String(req.query.search || '').trim();
  const statusFilter = String(req.query.status || '').trim();
  const approvalStatusFilter = String(req.query.approvalStatus || '').trim();

  const filter: Record<string, unknown> = {};
  if (statusFilter) filter.status = statusFilter;
  else filter.status = { $ne: 'deleted' };
  if (approvalStatusFilter && ['none', 'pending', 'approved', 'rejected'].includes(approvalStatusFilter)) {
    filter.approvalStatus = approvalStatusFilter;
  }
  if (search) {
    const re = new RegExp(search, 'i');
    filter.$or = [{ name: re }, { slug: re }, { description: re }, { email: re }, { phone: re }];
  }

  const [vendors, total, pendingCount] = await Promise.all([
    Vendor.find(filter).lean().sort({ sortOrder: 1, createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    Vendor.countDocuments(filter),
    Vendor.countDocuments({ status: { $ne: 'deleted' }, approvalStatus: 'pending' }),
  ]);
  const meta = toPaginated(vendors, total, page, limit);
  return sendSuccess(res, vendors, 200, { ...meta, pendingCount });
});

/** GET /api/v1/admin/vendors/:id — Full vendor detail */
export const getVendor = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id;
  const vendor = await Vendor.findById(id).populate('reviewedBy', 'name').lean();
  if (!vendor || (vendor as { status?: string }).status === 'deleted') {
    throw new AppError({ en: 'Vendor not found', de: 'Anbieter nicht gefunden' }, 404, 'NOT_FOUND');
  }
  const menuItems = await MenuItem.find({ vendorId: new mongoose.Types.ObjectId(id) }).lean().sort({ sortOrder: 1, name: 1 });
  return sendSuccess(res, { ...vendor, menuItems });
});

/** POST /api/v1/admin/vendors — Create vendor (logo and coverImage max 10MB each) */
export const createVendor = asyncHandler(async (req: Request, res: Response) => {
  await new Promise<void>((resolve, reject) => {
    uploadVendorFiles(req as any, res as any, (err: unknown) => (err ? reject(err) : resolve()));
  });

  const body = req.body ?? {};
  const name = String(body.name || '').trim();
  if (!name) throw new AppError({ en: 'Name is required', de: 'Name erforderlich' }, 400, 'VALIDATION_ERROR');

  const slug = body.slug ? slugify(String(body.slug)) : slugify(name);
  const existing = await Vendor.findOne({ slug });
  if (existing) throw new AppError({ en: 'Slug already in use', de: 'Slug bereits vergeben' }, 409, 'CONFLICT');

  const files = req.files as Record<string, Express.Multer.File[]> | undefined;
  const logoFile = files?.logo?.[0];
  const coverFile = files?.coverImage?.[0];
  if (logoFile?.size && logoFile.size > VENDOR_IMAGE_MAX) {
    throw new AppError({ en: 'Logo must be at most 10MB', de: 'Logo max. 10MB' }, 400, 'VALIDATION_ERROR');
  }
  if (coverFile?.size && coverFile.size > VENDOR_IMAGE_MAX) {
    throw new AppError({ en: 'Cover image must be at most 10MB', de: 'Titelbild max. 10MB' }, 400, 'VALIDATION_ERROR');
  }

  const payload: Record<string, unknown> = {
    name,
    slug,
    description: String(body.description || '').trim(),
    email: body.email ? String(body.email).toLowerCase().trim() : null,
    phone: body.phone ? String(body.phone).trim() : null,
    status: 'active',
    sortOrder: parseInt(String(body.sortOrder), 10) || 0,
  };
  if (body.address && typeof body.address === 'object') {
    payload.address = {
      street: body.address.street != null ? String(body.address.street) : null,
      city: body.address.city != null ? String(body.address.city) : null,
      country: body.address.country != null ? String(body.address.country) : null,
      lat: body.address.lat != null ? Number(body.address.lat) : null,
      lng: body.address.lng != null ? Number(body.address.lng) : null,
    };
  }
  if (logoFile) payload.logo = getFileUrl(logoFile, 'vendors');
  if (coverFile) payload.coverImage = getFileUrl(coverFile, 'vendors');

  const vendor = await Vendor.create(payload);
  return sendSuccess(res, vendor.toObject(), 201);
});

/** PATCH /api/v1/admin/vendors/:id — Update + optional logo/coverImage replace */
export const updateVendor = asyncHandler(async (req: Request, res: Response) => {
  await new Promise<void>((resolve, reject) => {
    uploadVendorFiles(req as any, res as any, (err: unknown) => (err ? reject(err) : resolve()));
  });

  const id = req.params.id;
  const vendor = await Vendor.findById(id);
  if (!vendor || vendor.status === 'deleted') {
    throw new AppError({ en: 'Vendor not found', de: 'Anbieter nicht gefunden' }, 404, 'NOT_FOUND');
  }

  const body = req.body ?? {};
  if (body.name !== undefined) vendor.name = String(body.name).trim();
  if (body.description !== undefined) vendor.description = String(body.description).trim();
  if (body.email !== undefined) vendor.email = body.email ? String(body.email).toLowerCase().trim() : null;
  if (body.phone !== undefined) vendor.phone = body.phone ? String(body.phone).trim() : null;
  if (body.status !== undefined && ['active', 'blocked'].includes(body.status)) vendor.status = body.status;
  if (body.sortOrder !== undefined) vendor.sortOrder = parseInt(String(body.sortOrder), 10) || 0;
  if (body.slug !== undefined) {
    const slug = slugify(String(body.slug));
    if (slug !== vendor.slug) {
      const existing = await Vendor.findOne({ slug, _id: { $ne: id } });
      if (existing) throw new AppError({ en: 'Slug already in use', de: 'Slug bereits vergeben' }, 409, 'CONFLICT');
      vendor.slug = slug;
    }
  }
  if (body.address !== undefined && typeof body.address === 'object') {
    vendor.address = {
      street: body.address.street != null ? String(body.address.street) : null,
      city: body.address.city != null ? String(body.address.city) : null,
      country: body.address.country != null ? String(body.address.country) : null,
      lat: body.address.lat != null ? Number(body.address.lat) : null,
      lng: body.address.lng != null ? Number(body.address.lng) : null,
    };
  }

  const files = req.files as Record<string, Express.Multer.File[]> | undefined;
  const logoFile = files?.logo?.[0];
  const coverFile = files?.coverImage?.[0];
  if (logoFile?.size && logoFile.size > VENDOR_IMAGE_MAX) {
    throw new AppError({ en: 'Logo must be at most 10MB', de: 'Logo max. 10MB' }, 400, 'VALIDATION_ERROR');
  }
  if (coverFile?.size && coverFile.size > VENDOR_IMAGE_MAX) {
    throw new AppError({ en: 'Cover image must be at most 10MB', de: 'Titelbild max. 10MB' }, 400, 'VALIDATION_ERROR');
  }
  if (logoFile) {
    const logoUrl = getFileUrl(logoFile, 'vendors');
    if (logoUrl) {
      if (vendor.logo) deleteLocalFile(vendor.logo);
      vendor.logo = logoUrl;
    }
  }
  if (coverFile) {
    const coverUrl = getFileUrl(coverFile, 'vendors');
    if (coverUrl) {
      if (vendor.coverImage) deleteLocalFile(vendor.coverImage);
      vendor.coverImage = coverUrl;
    }
  }

  await vendor.save();
  return sendSuccess(res, vendor.toObject());
});

/** PATCH /api/v1/admin/vendors/:id/approve — Approve vendor (must be pending); emit vendor:approved, FCM to vendor */
export const approveVendor = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id;
  const adminId = (req as Request & { admin?: { _id: unknown } }).admin?._id;
  const vendor = await Vendor.findById(id);
  if (!vendor || vendor.status === 'deleted') {
    throw new AppError({ en: 'Vendor not found', de: 'Anbieter nicht gefunden' }, 404, 'NOT_FOUND');
  }
  const current = (vendor.approvalStatus as string) ?? 'none';
  if (current !== 'pending') {
    throw new AppError(
      { en: 'Vendor is not pending approval', de: 'Anbieter steht nicht zur Freigabe aus' },
      400,
      'VALIDATION_ERROR'
    );
  }
  const now = new Date();
  vendor.approvalStatus = 'approved';
  vendor.approvedAt = now;
  vendor.rejectedAt = null;
  vendor.rejectionReason = null;
  vendor.reviewedBy = adminId ? (adminId as mongoose.Types.ObjectId) : undefined;
  vendor.status = 'active';
  await vendor.save();

  const io = (req.app as { get?(key: string): unknown }).get?.('io') as SocketIOServer | undefined;
  if (io) {
    io.to('admin').emit('vendor:approved', vendor.toObject());
  }
  const doc = await Vendor.findById(id).select('fcmTokens').lean();
  if (doc) {
    await sendPushToVendor(doc, {
      title: 'Application approved',
      body: 'Your vendor application has been approved. You can now start receiving orders.',
      data: { vendorId: id, type: 'vendor_approved' },
    });
  }
  return sendSuccess(res, vendor.toObject());
});

/** PATCH /api/v1/admin/vendors/:id/reject — Reject with reason (min 10 chars); emit vendor:rejected, FCM to vendor */
export const rejectVendor = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id;
  const adminId = (req as Request & { admin?: { _id: unknown } }).admin?._id;
  const body = req.body ?? {};
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (reason.length < 10) {
    throw new AppError(
      { en: 'Rejection reason is required (min 10 characters)', de: 'Ablehnungsgrund erforderlich (min. 10 Zeichen)' },
      400,
      'VALIDATION_ERROR'
    );
  }
  const vendor = await Vendor.findById(id);
  if (!vendor || vendor.status === 'deleted') {
    throw new AppError({ en: 'Vendor not found', de: 'Anbieter nicht gefunden' }, 404, 'NOT_FOUND');
  }
  const now = new Date();
  vendor.approvalStatus = 'rejected';
  vendor.rejectedAt = now;
  vendor.rejectionReason = reason;
  vendor.approvedAt = null;
  vendor.reviewedBy = adminId ? (adminId as mongoose.Types.ObjectId) : undefined;
  await vendor.save();

  const io = (req.app as { get?(key: string): unknown }).get?.('io') as SocketIOServer | undefined;
  if (io) {
    io.to('admin').emit('vendor:rejected', vendor.toObject());
  }
  const doc = await Vendor.findById(id).select('fcmTokens').lean();
  if (doc) {
    await sendPushToVendor(doc, {
      title: 'Application rejected',
      body: reason.length > 100 ? `${reason.slice(0, 97)}...` : reason,
      data: { vendorId: id, type: 'vendor_rejected', reason },
    });
  }
  return sendSuccess(res, vendor.toObject());
});

/** PATCH /api/v1/admin/vendors/:id/block — Toggle block + reason */
export const blockVendor = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id;
  const vendor = await Vendor.findById(id);
  if (!vendor || vendor.status === 'deleted') {
    throw new AppError({ en: 'Vendor not found', de: 'Anbieter nicht gefunden' }, 404, 'NOT_FOUND');
  }
  const newStatus = vendor.status === 'blocked' ? 'active' : 'blocked';
  const { reason } = req.body ?? {};
  if (newStatus === 'blocked' && (reason == null || String(reason).trim() === '')) {
    throw new AppError({ en: 'Reason is required when blocking', de: 'Begründung beim Sperren erforderlich' }, 400, 'VALIDATION_ERROR');
  }
  vendor.status = newStatus;
  vendor.blockReason = newStatus === 'blocked' ? String(reason).trim() : null;
  await vendor.save();
  return sendSuccess(res, vendor.toObject());
});

/** DELETE /api/v1/admin/vendors/:id — Soft delete */
export const deleteVendor = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id;
  const vendor = await Vendor.findByIdAndUpdate(id, { status: 'deleted' }, { new: true }).lean();
  if (!vendor) throw new AppError({ en: 'Vendor not found', de: 'Anbieter nicht gefunden' }, 404, 'NOT_FOUND');
  return sendSuccess(res, vendor);
});

// ---------- Menu items ----------

/** GET /api/v1/admin/vendors/:id/menu-items */
export const listMenuItems = asyncHandler(async (req: Request, res: Response) => {
  const vendorId = req.params.id;
  const vendor = await Vendor.findById(vendorId).select('status').lean();
  if (!vendor || (vendor as { status?: string }).status === 'deleted') {
    throw new AppError({ en: 'Vendor not found', de: 'Anbieter nicht gefunden' }, 404, 'NOT_FOUND');
  }
  const items = await MenuItem.find({ vendorId: new mongoose.Types.ObjectId(vendorId) }).lean().sort({ sortOrder: 1, name: 1 });
  return sendSuccess(res, items);
});

/** GET /api/v1/admin/vendors/:id/products — Paginated products for vendor; ?category, ?isAvailable */
export const listVendorProducts = asyncHandler(async (req: Request, res: Response) => {
  const vendorId = req.params.id;
  const vendor = await Vendor.findById(vendorId).select('_id status').lean();
  if (!vendor || (vendor as { status?: string }).status === 'deleted') {
    throw new AppError({ en: 'Vendor not found', de: 'Anbieter nicht gefunden' }, 404, 'NOT_FOUND');
  }
  const { page, limit } = parsePagination(req.query);
  const categoryId = req.query.category as string | undefined;
  const isAvailable = req.query.isAvailable as string | undefined;

  const filter: Record<string, unknown> = { vendor: vendor._id, isDeleted: false };
  if (categoryId && mongoose.Types.ObjectId.isValid(categoryId)) filter.category = new mongoose.Types.ObjectId(categoryId);
  if (isAvailable === 'true') filter.isAvailable = true;
  else if (isAvailable === 'false') filter.isAvailable = false;

  const [products, total] = await Promise.all([
    Product.find(filter).populate('category', 'name slug').sort({ sortOrder: 1, name: 1 }).skip((page - 1) * limit).limit(limit).lean(),
    Product.countDocuments(filter),
  ]);
  const meta = toPaginated(products, total, page, limit);
  return sendSuccess(res, products, 200, meta);
});

/** POST /api/v1/admin/vendors/:id/menu-items — Create item (image 2MB) */
export const createMenuItem = asyncHandler(async (req: Request, res: Response) => {
  const upload = uploadMenuItemImage.single('image');
  await new Promise<void>((resolve, reject) => {
    upload(req as any, res as any, (err: unknown) => (err ? reject(err) : resolve()));
  });

  const vendorId = req.params.id;
  const vendor = await Vendor.findById(vendorId);
  if (!vendor || vendor.status === 'deleted') {
    throw new AppError({ en: 'Vendor not found', de: 'Anbieter nicht gefunden' }, 404, 'NOT_FOUND');
  }

  const body = req.body ?? {};
  const name = String(body.name || '').trim();
  const price = parseFloat(String(body.price));
  const category = String(body.category || '').trim();
  if (!name) throw new AppError({ en: 'Name is required', de: 'Name erforderlich' }, 400, 'VALIDATION_ERROR');
  if (Number.isNaN(price) || price < 0) throw new AppError({ en: 'Valid price required', de: 'Gültiger Preis erforderlich' }, 400, 'VALIDATION_ERROR');
  if (!category) throw new AppError({ en: 'Category is required', de: 'Kategorie erforderlich' }, 400, 'VALIDATION_ERROR');

  const payload: Record<string, unknown> = {
    vendorId: vendor._id,
    name,
    description: String(body.description || '').trim(),
    price,
    category,
    isAvailable: body.isAvailable !== false,
    sortOrder: parseInt(String(body.sortOrder), 10) || 0,
  };
  const file = req.file as Express.Multer.File | undefined;
  if (file) payload.image = getFileUrl(file, 'menu-items');

  const item = await MenuItem.create(payload);
  return sendSuccess(res, item.toObject(), 201);
});

/** PATCH /api/v1/admin/vendors/:id/menu-items/:itemId — Update item + optional image replace */
export const updateMenuItem = asyncHandler(async (req: Request, res: Response) => {
  const upload = uploadMenuItemImage.single('image');
  await new Promise<void>((resolve, reject) => {
    upload(req as any, res as any, (err: unknown) => (err ? reject(err) : resolve()));
  });

  const { id: vendorId, itemId } = req.params;
  const vendor = await Vendor.findById(vendorId);
  if (!vendor || vendor.status === 'deleted') {
    throw new AppError({ en: 'Vendor not found', de: 'Anbieter nicht gefunden' }, 404, 'NOT_FOUND');
  }
  const item = await MenuItem.findOne({ _id: itemId, vendorId: new mongoose.Types.ObjectId(vendorId) });
  if (!item) throw new AppError({ en: 'Menu item not found', de: 'Menüpunkt nicht gefunden' }, 404, 'NOT_FOUND');

  const body = req.body ?? {};
  if (body.name !== undefined) item.name = String(body.name).trim();
  if (body.description !== undefined) item.description = String(body.description).trim();
  if (body.price !== undefined) {
    const p = parseFloat(String(body.price));
    if (!Number.isNaN(p) && p >= 0) item.price = p;
  }
  if (body.category !== undefined) item.category = String(body.category).trim();
  if (body.isAvailable !== undefined) item.isAvailable = Boolean(body.isAvailable);
  if (body.sortOrder !== undefined) item.sortOrder = parseInt(String(body.sortOrder), 10) || 0;

  const file = req.file as Express.Multer.File | undefined;
  if (file) {
    const imageUrl = getFileUrl(file, 'menu-items');
    if (imageUrl) {
      if (item.image) deleteLocalFile(item.image);
      item.image = imageUrl;
    }
  }

  await item.save();
  return sendSuccess(res, item.toObject());
});

/** DELETE /api/v1/admin/vendors/:id/menu-items/:itemId */
export const deleteMenuItem = asyncHandler(async (req: Request, res: Response) => {
  const { id: vendorId, itemId } = req.params;
  const item = await MenuItem.findOneAndDelete({
    _id: itemId,
    vendorId: new mongoose.Types.ObjectId(vendorId),
  });
  if (!item) throw new AppError({ en: 'Menu item not found', de: 'Menüpunkt nicht gefunden' }, 404, 'NOT_FOUND');
  if (item.image) deleteLocalFile(item.image);
  return sendSuccess(res, item.toObject());
});
