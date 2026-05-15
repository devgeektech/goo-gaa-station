import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import { parsePhoneNumber, isValidPhoneNumber } from 'libphonenumber-js';
import { User } from '../../models/User';
import { Order } from '../../models/Order';
import { AppError } from '../../utils/AppError';
import { MESSAGES } from '../../constants/messages';
import { sendSuccess } from '../../utils/response';
import { asyncHandler } from '../../utils/asyncHandler';
import { parsePagination } from '../../utils/pagination';
import { getUploadMiddleware, deleteLocalFile, getFileUrl, MAX_FILE_SIZE_10MB } from '../../utils/storageProvider';

const uploadUserImage = getUploadMiddleware('users', MAX_FILE_SIZE_10MB);

function toPaginated<T>(data: T[], total: number, page: number, limit: number) {
  const totalPages = Math.ceil(total / limit) || 1;
  return {
    data,
    total,
    page,
    limit,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
}

/** GET / — List users (paginated) */
export const listUsers = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit } = parsePagination(req.query);
  const search = String(req.query.search || '').trim();
  const statusFilter = String(req.query.status || '').trim();
  const showDeleted = String(req.query.showDeleted || '').toLowerCase() === 'true';

  const filter: Record<string, unknown> = {};
  if (statusFilter) {
    filter.status = statusFilter;
  } else if (!showDeleted) {
    filter.status = { $ne: 'deleted' };
  }
  if (search) {
    const re = new RegExp(search, 'i');
    filter.$or = [
      { name: re },
      { phone: re },
      { email: re },
    ];
  }

  const [users, total] = await Promise.all([
    User.find(filter)
      .select('-password')
      .lean()
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    User.countDocuments(filter),
  ]);

  return sendSuccess(res, users, 200, toPaginated(users, total, page, limit));
});

/** POST / — Create user (admin creates customer) */
export const createUser = asyncHandler(async (req: Request, res: Response) => {
  const upload = uploadUserImage.single('profileImage');
  await new Promise<void>((resolve, reject) => {
    upload(req as any, res as any, (err: unknown) => (err ? reject(err) : resolve()));
  });

  const { name, email, phone, password, preferredLang, addresses: addressesRaw, address: singleAddress } = req.body ?? {};
  if (!name || !phone || !password) {
    throw new AppError(
      { en: 'Name, phone and password are required', de: 'Name, Telefon und Passwort erforderlich' },
      400,
      'VALIDATION_ERROR'
    );
  }

  const phoneStr = String(phone).trim();
  if (!isValidPhoneNumber(phoneStr)) {
    throw new AppError(
      { en: 'Invalid phone number', de: 'Ungültige Telefonnummer' },
      400,
      'VALIDATION_ERROR'
    );
  }
  const normalizedPhone = parsePhoneNumber(phoneStr, 'DE')?.format('E.164') ?? phoneStr;

  const existing = await User.findOne({ phone: normalizedPhone });
  if (existing) {
    throw new AppError(
      { en: MESSAGES.USER.en.alreadyExists, de: MESSAGES.USER.de.alreadyExists },
      409,
      'CONFLICT'
    );
  }

  const payload: Record<string, unknown> = {
    name: String(name).trim(),
    phone: normalizedPhone,
    password: String(password),
    preferredLang: preferredLang === 'de' ? 'de' : 'en',
  };
  if (email) payload.email = String(email).toLowerCase().trim();
  let addresses: Array<{ label: string; street: string; city: string; country: string; lat?: number; lng?: number; isDefault?: boolean }> = [];
  if (addressesRaw != null) {
    const parsed = typeof addressesRaw === 'string' ? JSON.parse(addressesRaw) : addressesRaw;
    addresses = Array.isArray(parsed) ? parsed : [];
  } else if (singleAddress != null) {
    const one = typeof singleAddress === 'string' ? JSON.parse(singleAddress) : singleAddress;
    if (one && typeof one === 'object' && one.label != null && one.street != null && one.city != null && one.country != null) {
      addresses = [one];
    }
  }
  for (const addr of addresses) {
    if (!addr.label || !addr.street || !addr.city || !addr.country) {
      throw new AppError(
        { en: 'Each address must have label, street, city and country', de: 'Jede Adresse muss Bezeichnung, Straße, Stadt und Land haben' },
        400,
        'VALIDATION_ERROR'
      );
    }
  }
  if (addresses.length > 0) payload.addresses = addresses;
  const file = req.file as Express.Multer.File | undefined;
  if (file?.filename) {
    payload.profileImage = getFileUrl(file, 'users');
  }

  const user = await User.create(payload);
  const doc = user.toObject();
  delete (doc as Record<string, unknown>).password;
  return sendSuccess(res, doc, 201);
});

/** GET /:id — User detail */
export const getUser = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError(
      { en: MESSAGES.USER.en.notFound, de: MESSAGES.USER.de.notFound },
      404,
      'NOT_FOUND'
    );
  }
  const user = await User.findById(id).select('-password').lean() as { status?: string } | null;
  if (!user || user.status === 'deleted') {
    throw new AppError(
      { en: MESSAGES.USER.en.notFound, de: MESSAGES.USER.de.notFound },
      404,
      'NOT_FOUND'
    );
  }
  return sendSuccess(res, user);
});

/** PUT /:id — Update user */
export const updateUser = asyncHandler(async (req: Request, res: Response) => {
  const upload = uploadUserImage.single('profileImage');
  await new Promise<void>((resolve, reject) => {
    upload(req as any, res as any, (err: unknown) => (err ? reject(err) : resolve()));
  });

  const id = req.params.id;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError(
      { en: MESSAGES.USER.en.notFound, de: MESSAGES.USER.de.notFound },
      404,
      'NOT_FOUND'
    );
  }

  const user = await User.findById(id);
  if (!user || user.status === 'deleted') {
    throw new AppError(
      { en: MESSAGES.USER.en.notFound, de: MESSAGES.USER.de.notFound },
      404,
      'NOT_FOUND'
    );
  }

  const { name, email, phone, preferredLang, addresses } = req.body ?? {};
  if (name !== undefined) user.name = String(name).trim();
  if (email !== undefined) user.email = String(email).toLowerCase().trim() || undefined;
  if (preferredLang !== undefined) user.preferredLang = preferredLang === 'de' ? 'de' : 'en';
  if (addresses !== undefined) user.addresses = Array.isArray(addresses) ? addresses : user.addresses;

  if (phone !== undefined) {
    const phoneStr = String(phone).trim();
    if (!isValidPhoneNumber(phoneStr)) {
      throw new AppError(
        { en: 'Invalid phone number', de: 'Ungültige Telefonnummer' },
        400,
        'VALIDATION_ERROR'
      );
    }
    const normalizedPhone = parsePhoneNumber(phoneStr, 'DE')?.format('E.164') ?? phoneStr;
    const existing = await User.findOne({ phone: normalizedPhone, _id: { $ne: id } });
    if (existing) {
      throw new AppError(
        { en: MESSAGES.USER.en.alreadyExists, de: MESSAGES.USER.de.alreadyExists },
        409,
        'CONFLICT'
      );
    }
    user.phone = normalizedPhone;
  }

  const file = req.file as Express.Multer.File | undefined;
  if (file?.filename) {
    if (user.profileImage) deleteLocalFile(user.profileImage);
    user.profileImage = getFileUrl(file, 'users');
  }

  await user.save();
  const doc = user.toObject();
  delete (doc as Record<string, unknown>).password;
  return sendSuccess(res, doc);
});

/** DELETE /:id — Soft delete */
export const deleteUser = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id;
  const userId = req.user?._id;
  if (id === userId) {
    throw new AppError(
      { en: 'Cannot delete your own account', de: 'Eigenes Konto kann nicht gelöscht werden' },
      400,
      'FORBIDDEN'
    );
  }
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError(
      { en: MESSAGES.USER.en.notFound, de: MESSAGES.USER.de.notFound },
      404,
      'NOT_FOUND'
    );
  }
  const user = await User.findByIdAndUpdate(
    id,
    { status: 'deleted' },
    { new: true }
  ).select('-password').lean();
  if (!user) {
    throw new AppError(
      { en: MESSAGES.USER.en.notFound, de: MESSAGES.USER.de.notFound },
      404,
      'NOT_FOUND'
    );
  }
  return sendSuccess(res, user);
});

/** PATCH /:id/status — Block / Enable */
export const updateUserStatus = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id;
  const userId = req.user?._id;
  if (id === userId) {
    throw new AppError(
      { en: 'Cannot change your own status', de: 'Eigenen Status nicht änderbar' },
      400,
      'FORBIDDEN'
    );
  }
  const { status, reason } = req.body ?? {};
  if (status !== 'active' && status !== 'blocked') {
    throw new AppError(
      { en: 'Status must be active or blocked', de: 'Status muss active oder blocked sein' },
      400,
      'VALIDATION_ERROR'
    );
  }
  if (status === 'blocked') {
    const reasonStr = reason != null ? String(reason).trim() : '';
    if (!reasonStr) {
      throw new AppError(
        { en: 'Reason is required when blocking', de: 'Begründung beim Sperren erforderlich' },
        400,
        'VALIDATION_ERROR'
      );
    }
  }
  const update: Record<string, unknown> = { status };
  if (status === 'blocked') update.blockReason = String(reason).trim();
  else update.blockReason = null;
  const user = await User.findOneAndUpdate(
    { _id: id, status: { $ne: 'deleted' } },
    update,
    { new: true }
  ).select('-password').lean();
  if (!user) {
    throw new AppError(
      { en: MESSAGES.USER.en.notFound, de: MESSAGES.USER.de.notFound },
      404,
      'NOT_FOUND'
    );
  }
  return sendSuccess(res, user);
});

/** GET /:id/orders — Order history */
export const getUserOrders = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError(
      { en: MESSAGES.USER.en.notFound, de: MESSAGES.USER.de.notFound },
      404,
      'NOT_FOUND'
    );
  }
  const user = await User.findById(id).select('status').lean();
  if (!user || (user as { status?: string }).status === 'deleted') {
    throw new AppError(
      { en: MESSAGES.USER.en.notFound, de: MESSAGES.USER.de.notFound },
      404,
      'NOT_FOUND'
    );
  }
  const { page, limit } = parsePagination(req.query);
  const filter = { customerId: new mongoose.Types.ObjectId(id) };
  const [orders, total] = await Promise.all([
    Order.find(filter)
      .populate('driverId', 'name phone')
      .lean()
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Order.countDocuments(filter),
  ]);
  return sendSuccess(res, orders, 200, toPaginated(orders, total, page, limit));
});

/** GET /export/csv — Export users as CSV */
export const exportUsersCsv = asyncHandler(async (req: Request, res: Response) => {
  const search = String(req.query.search || '').trim();
  const statusFilter = String(req.query.status || '').trim();

  const filter: Record<string, unknown> = {};
  if (statusFilter) filter.status = statusFilter;
  else filter.status = { $ne: 'deleted' };
  if (search) {
    const re = new RegExp(search, 'i');
    filter.$or = [{ name: re }, { phone: re }, { email: re }];
  }

  const users = await User.find(filter).select('-password').lean().sort({ createdAt: -1 });

  const headers = ['ID', 'Name', 'Phone', 'Email', 'Status', 'Registered', 'TotalOrders', 'TotalSpent'];
  const rows = users.map((u) => [
    u._id,
    u.name,
    u.phone,
    u.email || '',
    u.status,
    u.createdAt ? new Date(u.createdAt).toISOString() : '',
    u.totalOrders ?? 0,
    u.totalSpent ?? 0,
  ].map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','));

  const csv = [headers.join(','), ...rows].join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=users.csv');
  res.send(csv);
});
