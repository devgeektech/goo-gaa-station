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
import {
  getUploadMiddleware,
  deleteLocalFile,
  getFileUrl,
  MAX_FILE_SIZE_2MB,
} from '../../utils/storageProvider';

const uploadCustomerImage = getUploadMiddleware('users', MAX_FILE_SIZE_2MB);

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

/** GET /api/v1/admin/customers — Paginated list, search name/phone/email, filter status/isDeleted */
export const listCustomers = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit } = parsePagination(req.query);
  const search = String(req.query.search || '').trim();
  const statusFilter = String(req.query.status || '').trim();
  const isDeleted = String(req.query.isDeleted || '').toLowerCase() === 'true';

  const filter: Record<string, unknown> = {};
  if (statusFilter) {
    filter.status = statusFilter;
  } else if (!isDeleted) {
    filter.status = { $ne: 'deleted' };
  }
  if (search) {
    const re = new RegExp(search, 'i');
    filter.$or = [{ name: re }, { phone: re }, { email: re }];
  }

  const [customers, total] = await Promise.all([
    User.find(filter)
      .select('-password')
      .lean()
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    User.countDocuments(filter),
  ]);

  return sendSuccess(res, customers, 200, toPaginated(customers, total, page, limit));
});

/** GET /api/v1/admin/customers/:id — Detail with order count, total spend, points, addresses */
export const getCustomer = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id;
  const customer = await User.findById(id)
    .select('-password')
    .lean() as { status?: string } | null;
  if (!customer) {
    throw new AppError(
      { en: MESSAGES.USER.en.notFound, de: MESSAGES.USER.de.notFound },
      404,
      'NOT_FOUND'
    );
  }
  const orderCount = await Order.countDocuments({ customerId: new mongoose.Types.ObjectId(id) });
  return sendSuccess(res, {
    ...customer,
    orderCount,
    totalSpent: (customer as { totalSpent?: number }).totalSpent ?? 0,
    points: (customer as { points?: number }).points ?? 0,
    addresses: (customer as { addresses?: unknown[] }).addresses ?? [],
  });
});

/** POST /api/v1/admin/customers — Create customer + optional profile image (Multer 2MB) */
export const createCustomer = asyncHandler(async (req: Request, res: Response) => {
  const upload = uploadCustomerImage.single('profileImage');
  await new Promise<void>((resolve, reject) => {
    upload(req as any, res as any, (err: unknown) => (err ? reject(err) : resolve()));
  });

  const { name, email, phone, password, preferredLang, addresses: addressesRaw, address: singleAddress } =
    req.body ?? {};
  if (!name || !password) {
    throw new AppError(
      { en: 'Name and password are required', de: 'Name und Passwort erforderlich' },
      400,
      'VALIDATION_ERROR'
    );
  }

  const payload: Record<string, unknown> = {
    name: String(name).trim(),
    password: String(password),
    preferredLang: preferredLang === 'de' ? 'de' : 'en',
  };
  if (email) payload.email = String(email).toLowerCase().trim();
  if (phone) {
    const phoneStr = String(phone).trim();
    if (!isValidPhoneNumber(phoneStr)) {
      throw new AppError(
        { en: 'Invalid phone number', de: 'Ungültige Telefonnummer' },
        400,
        'VALIDATION_ERROR'
      );
    }
    payload.phone = parsePhoneNumber(phoneStr, 'DE')?.format('E.164') ?? phoneStr;
    const existing = await User.findOne({ phone: payload.phone });
    if (existing) {
      throw new AppError(
        { en: MESSAGES.USER.en.alreadyExists, de: MESSAGES.USER.de.alreadyExists },
        409,
        'CONFLICT'
      );
    }
  }

  let addresses: Array<{
    addressLine1: string;
    addressLine2?: string | null;
    landmark?: string | null;
    saveAddressType: 'home' | 'work' | 'other';
    city: string;
    country: string;
    lat?: number | null;
    lng?: number | null;
    isDefault?: boolean;
  }> = [];
  if (addressesRaw != null) {
    const parsed = typeof addressesRaw === 'string' ? JSON.parse(addressesRaw) : addressesRaw;
    addresses = Array.isArray(parsed) ? parsed : [];
  } else if (singleAddress != null) {
    const one = typeof singleAddress === 'string' ? JSON.parse(singleAddress) : singleAddress;
    if (one && typeof one === 'object' && one.addressLine1 != null && one.city != null && one.country != null) {
      addresses = [{ ...one, saveAddressType: one.saveAddressType === 'work' ? 'work' : one.saveAddressType === 'other' ? 'other' : 'home' }];
    }
  }
  for (const addr of addresses) {
    if (!addr.addressLine1 || !addr.city || !addr.country) {
      throw new AppError(
        {
          en: 'Each address must have addressLine1, city and country',
          de: 'Jede Adresse muss addressLine1, Stadt und Land haben',
        },
        400,
        'VALIDATION_ERROR'
      );
    }
  }
  if (addresses.length > 0) {
    payload.addresses = addresses.map((a) => ({
      addressLine1: String(a.addressLine1).trim(),
      addressLine2: a.addressLine2 != null && String(a.addressLine2).trim() !== '' ? String(a.addressLine2).trim() : null,
      landmark: a.landmark != null && String(a.landmark).trim() !== '' ? String(a.landmark).trim() : null,
      saveAddressType: a.saveAddressType === 'work' ? 'work' : a.saveAddressType === 'other' ? 'other' : 'home',
      city: String(a.city).trim(),
      country: String(a.country).trim(),
      lat: a.lat != null ? Number(a.lat) : null,
      lng: a.lng != null ? Number(a.lng) : null,
      isDefault: Boolean(a.isDefault),
    }));
  }

  const file = req.file as Express.Multer.File | undefined;
  if (file?.filename) {
    payload.profileImage = getFileUrl(file, 'users');
  }

  const user = await User.create(payload);
  const doc = user.toObject();
  delete (doc as Record<string, unknown>).password;
  return sendSuccess(res, doc, 201);
});

/** PATCH /api/v1/admin/customers/:id — Update + optional image replace */
export const updateCustomer = asyncHandler(async (req: Request, res: Response) => {
  const upload = uploadCustomerImage.single('profileImage');
  await new Promise<void>((resolve, reject) => {
    upload(req as any, res as any, (err: unknown) => (err ? reject(err) : resolve()));
  });

  const id = req.params.id;
  const user = await User.findById(id);
  if (!user || user.status === 'deleted') {
    throw new AppError(
      { en: MESSAGES.USER.en.notFound, de: MESSAGES.USER.de.notFound },
      404,
      'NOT_FOUND'
    );
  }

  const { name, email, phone, preferredLang, addresses: addressesRaw } = req.body ?? {};
  if (name !== undefined) user.name = String(name).trim();
  if (email !== undefined) user.email = (String(email).toLowerCase().trim() || undefined) as string | undefined;
  if (preferredLang !== undefined) user.preferredLang = preferredLang === 'de' ? 'de' : 'en';
  if (addressesRaw !== undefined && Array.isArray(addressesRaw)) {
    user.addresses = addressesRaw.map((a: Record<string, unknown>) => {
      const line1 = (a.addressLine1 ?? a.street) != null ? String(a.addressLine1 ?? a.street).trim() : '';
      const city = a.city != null ? String(a.city).trim() : '';
      const country = a.country != null ? String(a.country).trim() : '';
      const saveAddressType = a.saveAddressType === 'work' ? 'work' : a.saveAddressType === 'other' ? 'other' : 'home';
      return {
        addressLine1: line1,
        addressLine2: a.addressLine2 != null && String(a.addressLine2).trim() !== '' ? String(a.addressLine2).trim() : null,
        landmark: a.landmark != null && String(a.landmark).trim() !== '' ? String(a.landmark).trim() : null,
        saveAddressType,
        city,
        country,
        lat: a.lat != null ? Number(a.lat) : null,
        lng: a.lng != null ? Number(a.lng) : null,
        isDefault: Boolean(a.isDefault),
      };
    });
  }

  if (phone !== undefined) {
    const phoneStr = String(phone).trim();
    if (phoneStr && !isValidPhoneNumber(phoneStr)) {
      throw new AppError(
        { en: 'Invalid phone number', de: 'Ungültige Telefonnummer' },
        400,
        'VALIDATION_ERROR'
      );
    }
    const normalizedPhone = phoneStr ? parsePhoneNumber(phoneStr, 'DE')?.format('E.164') ?? phoneStr : null;
    if (normalizedPhone) {
      const existing = await User.findOne({ phone: normalizedPhone, _id: { $ne: id } });
      if (existing) {
        throw new AppError(
          { en: MESSAGES.USER.en.alreadyExists, de: MESSAGES.USER.de.alreadyExists },
          409,
          'CONFLICT'
        );
      }
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

/** PATCH /api/v1/admin/customers/:id/block — Toggle status (block/unblock) + reason */
export const blockCustomer = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id;
  const adminId = req.user?._id ?? req.admin?._id;
  if (id === adminId) {
    throw new AppError(
      { en: 'Cannot block your own account', de: 'Eigenes Konto kann nicht gesperrt werden' },
      400,
      'FORBIDDEN'
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

  const newStatus = user.status === 'blocked' ? 'active' : 'blocked';
  const { reason } = req.body ?? {};
  if (newStatus === 'blocked' && (reason == null || String(reason).trim() === '')) {
    throw new AppError(
      { en: 'Reason is required when blocking', de: 'Begründung beim Sperren erforderlich' },
      400,
      'VALIDATION_ERROR'
    );
  }

  user.status = newStatus;
  user.blockReason = newStatus === 'blocked' ? String(reason).trim() : null;
  await user.save();

  const doc = user.toObject();
  delete (doc as Record<string, unknown>).password;
  return sendSuccess(res, doc);
});

/** DELETE /api/v1/admin/customers/:id — Soft delete */
export const deleteCustomer = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id;
  const user = await User.findByIdAndUpdate(
    id,
    { status: 'deleted' },
    { new: true }
  )
    .select('-password')
    .lean();
  if (!user) {
    throw new AppError(
      { en: MESSAGES.USER.en.notFound, de: MESSAGES.USER.de.notFound },
      404,
      'NOT_FOUND'
    );
  }
  return sendSuccess(res, user);
});
