import type { Request, Response } from 'express';
import mongoose from 'mongoose';
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
import { invalidateAllRefreshTokensForUser } from '../../services/auth.service';

const uploadUserImage = getUploadMiddleware('users', MAX_FILE_SIZE_2MB);
const MAX_ADDRESSES = 5;

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

/** GET /profile — Customer app: fullName, phone, profileImage, points, totalOrders only. No password/email. */
export const getProfile = asyncHandler(async (req: Request, res: Response) => {
  const id = req.user?._id;
  if (!id) throw new AppError({ en: MESSAGES.AUTH.en.unauthorized, de: MESSAGES.AUTH.de.unauthorized }, 401);
  const user = await User.findById(id)
    .select('name phone profileImage points totalOrders status')
    .lean() as { name?: string; phone?: string; profileImage?: string; status?: string; points?: number; totalOrders?: number } | null;
  if (!user || user.status === 'deleted') {
    throw new AppError({ en: MESSAGES.USER.en.notFound, de: MESSAGES.USER.de.notFound }, 404);
  }
  return sendSuccess(res, {
    fullName: user.name ?? '',
    phone: user.phone ?? '',
    profileImage: user.profileImage ?? null,
    points: user.points ?? 0,
    totalOrders: user.totalOrders ?? 0,
  });
});

/** PUT /profile — Update only fullName, phone, profileImage (multipart). Customer app: no email, no preferredLang. */
export const updateProfile = asyncHandler(async (req: Request, res: Response) => {
  const upload = uploadUserImage.single('profileImage');
  await new Promise<void>((resolve, reject) => {
    upload(req as any, res as any, (err: unknown) => (err ? reject(err) : resolve()));
  });

  const id = req.user?._id;
  if (!id) throw new AppError({ en: MESSAGES.AUTH.en.unauthorized, de: MESSAGES.AUTH.de.unauthorized }, 401);

  const user = await User.findById(id);
  if (!user || user.status === 'deleted') {
    throw new AppError({ en: MESSAGES.USER.en.notFound, de: MESSAGES.USER.de.notFound }, 404);
  }

  const { fullName, phone } = req.body ?? {};
  if (fullName !== undefined) user.name = String(fullName).trim() || user.name;
  if (phone !== undefined) {
    const phoneStr = String(phone).trim();
    user.phone = phoneStr || null;
  }

  const file = req.file as Express.Multer.File | undefined;
  if (file?.filename) {
    if (user.profileImage) deleteLocalFile(user.profileImage);
    user.profileImage = getFileUrl(file.filename, 'users');
  }

  await user.save();
  return sendSuccess(res, {
    fullName: user.name ?? '',
    phone: user.phone ?? '',
    profileImage: user.profileImage ?? null,
  });
});

/** PUT /fcm-token — Legacy: single fcmToken + lastActiveAt */
export const updateFcmToken = asyncHandler(async (req: Request, res: Response) => {
  const id = req.user?._id;
  if (!id) throw new AppError({ en: MESSAGES.AUTH.en.unauthorized, de: MESSAGES.AUTH.de.unauthorized }, 401);
  const { fcmToken } = req.body ?? {};
  await User.findByIdAndUpdate(id, {
    fcmToken: fcmToken != null ? String(fcmToken) : null,
    lastActiveAt: new Date(),
  });
  return sendSuccess(res, { success: true });
});

/** POST /fcm-token — Upsert token in fcmTokens array [{ token, device, updatedAt }] */
export const addOrUpdateFcmToken = asyncHandler(async (req: Request, res: Response) => {
  const id = req.user?._id;
  if (!id) throw new AppError({ en: MESSAGES.AUTH.en.unauthorized, de: MESSAGES.AUTH.de.unauthorized }, 401);
  const { token, device } = req.body ?? {};
  const tokenStr = token != null ? String(token) : '';
  if (!tokenStr) {
    throw new AppError(
      { en: 'Token is required', de: 'Token erforderlich' },
      400,
      'VALIDATION_ERROR'
    );
  }
  const user = await User.findById(id);
  if (!user) throw new AppError({ en: MESSAGES.USER.en.notFound, de: MESSAGES.USER.de.notFound }, 404);
  const fcmTokens = (user as { fcmTokens?: Array<{ token: string; device?: string; updatedAt?: Date }> }).fcmTokens ?? [];
  const existing = fcmTokens.find((t) => t.token === tokenStr);
  const now = new Date();
  if (existing) {
    existing.device = device != null ? String(device) : existing.device;
    existing.updatedAt = now;
  } else {
    fcmTokens.push({
      token: tokenStr,
      device: device != null ? String(device) : undefined,
      updatedAt: now,
    });
  }
  (user as { fcmTokens: typeof fcmTokens }).fcmTokens = fcmTokens;
  (user as { lastActiveAt?: Date }).lastActiveAt = now;
  await user.save();
  return sendSuccess(res, { success: true });
});

/** DELETE /fcm-token — Remove token on logout (body: { token }) */
export const removeFcmToken = asyncHandler(async (req: Request, res: Response) => {
  const id = req.user?._id;
  if (!id) throw new AppError({ en: MESSAGES.AUTH.en.unauthorized, de: MESSAGES.AUTH.de.unauthorized }, 401);
  const { token } = req.body ?? {};
  const tokenStr = token != null ? String(token) : '';
  const user = await User.findById(id);
  if (!user) throw new AppError({ en: MESSAGES.USER.en.notFound, de: MESSAGES.USER.de.notFound }, 404);
  let fcmTokens = (user as { fcmTokens?: Array<{ token: string }> }).fcmTokens ?? [];
  if (tokenStr) {
    fcmTokens = fcmTokens.filter((t) => t.token !== tokenStr);
  } else {
    fcmTokens = [];
  }
  (user as { fcmTokens: typeof fcmTokens }).fcmTokens = fcmTokens;
  await user.save();
  return sendSuccess(res, { success: true });
});

function normalizeAddressForResponse(addr: Record<string, unknown>): Record<string, unknown> {
  const line1 = (addr.addressLine1 ?? addr.street ?? '').toString().trim();
  const saveAddressType = addr.saveAddressType === 'work' ? 'work' : addr.saveAddressType === 'other' ? 'other' : 'home';
  /** DB field `isDefault` is the persisted preferred flag; API exposes `preferred` only. */
  const preferred = Boolean(addr.preferred ?? addr.isDefault);
  return {
    _id: addr._id,
    addressLine1: line1,
    addressLine2: addr.addressLine2 ?? null,
    landmark: addr.landmark ?? null,
    saveAddressType,
    city: addr.city ?? '',
    country: addr.country ?? '',
    lat: addr.lat ?? null,
    lng: addr.lng ?? null,
    preferred,
  };
}

function addressesSuccessPayload(userAddresses: Record<string, unknown>[] | undefined) {
  const addresses = (userAddresses || []).map((a) => normalizeAddressForResponse(a));
  return { addresses };
}

/** If nothing is preferred after a delete, mark the first remaining row (persisted as isDefault). */
function ensureAtLeastOnePreferredAddress(user: { addresses?: Array<{ isDefault?: boolean }> }): void {
  const addrs = user.addresses ?? [];
  if (!addrs.length) return;
  if (!addrs.some((a) => a.isDefault)) (addrs[0] as { isDefault: boolean }).isDefault = true;
}

/** GET /addresses */
export const getAddresses = asyncHandler(async (req: Request, res: Response) => {
  const id = req.user?._id;
  if (!id) throw new AppError({ en: MESSAGES.AUTH.en.unauthorized, de: MESSAGES.AUTH.de.unauthorized }, 401);
  const user = await User.findById(id).select('addresses').lean() as { addresses?: Record<string, unknown>[] } | null;
  if (!user) throw new AppError({ en: MESSAGES.USER.en.notFound, de: MESSAGES.USER.de.notFound }, 404);
  return sendSuccess(res, addressesSuccessPayload(user.addresses));
});

/** POST /addresses — Add address (max 5) */
export const addAddress = asyncHandler(async (req: Request, res: Response) => {
  const id = req.user?._id;
  if (!id) throw new AppError({ en: MESSAGES.AUTH.en.unauthorized, de: MESSAGES.AUTH.de.unauthorized }, 401);

  const user = await User.findById(id);
  if (!user) throw new AppError({ en: MESSAGES.USER.en.notFound, de: MESSAGES.USER.de.notFound }, 404);

  const addresses = user.addresses || [];
  if (addresses.length >= MAX_ADDRESSES) {
    throw new AppError(
      { en: 'Maximum 5 addresses allowed', de: 'Maximal 5 Adressen erlaubt' },
      400,
      'MAX_ADDRESSES'
    );
  }

  const isFirstAddress = addresses.length === 0;
  const { addressLine1, addressLine2, landmark, saveAddressType, city, country, lat, lng } = req.body ?? {};
  if (!addressLine1 || !city || !country) {
    throw new AppError(
      { en: 'addressLine1, city and country are required', de: 'Adresszeile 1, Stadt und Land erforderlich' },
      400,
      'VALIDATION_ERROR'
    );
  }
  const addrType = isFirstAddress
    ? 'home'
    : saveAddressType === 'work'
      ? 'work'
      : saveAddressType === 'other'
        ? 'other'
        : 'home';
  const newAddr = {
    addressLine1: String(addressLine1).trim(),
    addressLine2: addressLine2 != null && String(addressLine2).trim() !== '' ? String(addressLine2).trim() : null,
    landmark: landmark != null && String(landmark).trim() !== '' ? String(landmark).trim() : null,
    saveAddressType: addrType,
    city: String(city).trim(),
    country: String(country).trim(),
    lat: lat != null ? Number(lat) : null,
    lng: lng != null ? Number(lng) : null,
    isDefault: isFirstAddress,
  };

  if (newAddr.isDefault && user.addresses?.length) {
    for (let i = 0; i < user.addresses.length; i++) {
      (user.addresses[i] as { isDefault: boolean }).isDefault = false;
    }
  }

  user.addresses = user.addresses || [];
  user.addresses.push(newAddr as never);
  await user.save();
  return sendSuccess(res, addressesSuccessPayload(user.addresses as unknown as Record<string, unknown>[]));
});

/** PUT /addresses/:index — Update address by index (legacy) */
export const updateAddress = asyncHandler(async (req: Request, res: Response) => {
  const id = req.user?._id;
  const index = parseInt(req.params.index, 10);
  if (!id) throw new AppError({ en: MESSAGES.AUTH.en.unauthorized, de: MESSAGES.AUTH.de.unauthorized }, 401);

  const user = await User.findById(id);
  if (!user) throw new AppError({ en: MESSAGES.USER.en.notFound, de: MESSAGES.USER.de.notFound }, 404);

  const addresses = user.addresses || [];
  if (index < 0 || index >= addresses.length) {
    throw new AppError(
      { en: 'Invalid address index', de: 'Ungültiger Adressindex' },
      400,
      'INVALID_INDEX'
    );
  }

  const { addressLine1, addressLine2, landmark, saveAddressType, city, country, lat, lng } = req.body ?? {};
  const addrType = saveAddressType === 'work' ? 'work' : saveAddressType === 'other' ? 'other' : saveAddressType === 'home' ? 'home' : undefined;
  const updated = addresses.map((a: { toObject?: () => Record<string, unknown>; addressLine1?: string; addressLine2?: string | null; landmark?: string | null; saveAddressType?: string; city?: string; country?: string; lat?: number | null; lng?: number | null; isDefault?: boolean; _id?: unknown }, i: number) => {
    if (i !== index) {
      const base = (a.toObject?.() || a) as Record<string, unknown>;
      return { ...base, isDefault: false };
    }
    const prev = a.toObject?.() || a;
    const prevLine1 = prev.addressLine1 ?? (prev as { street?: string }).street ?? '';
    return {
      ...((a.toObject?.() || a) as Record<string, unknown>),
      addressLine1: addressLine1 !== undefined ? String(addressLine1).trim() : prevLine1,
      addressLine2: addressLine2 !== undefined ? (addressLine2 != null && String(addressLine2).trim() !== '' ? String(addressLine2).trim() : null) : prev.addressLine2,
      landmark: landmark !== undefined ? (landmark != null && String(landmark).trim() !== '' ? String(landmark).trim() : null) : prev.landmark,
      saveAddressType: addrType !== undefined ? addrType : (prev.saveAddressType ?? 'home'),
      city: city !== undefined ? String(city).trim() : prev.city,
      country: country !== undefined ? String(country).trim() : prev.country,
      lat: lat !== undefined ? (lat != null ? Number(lat) : null) : prev.lat,
      lng: lng !== undefined ? (lng != null ? Number(lng) : null) : prev.lng,
      isDefault: true,
    };
  });
  const normalized = updated.map((row: unknown, i: number) => {
    const r = row as Record<string, unknown>;
    return { ...r, isDefault: i === index };
  });
  user.addresses = normalized as never;
  await user.save();
  return sendSuccess(res, addressesSuccessPayload(user.addresses as unknown as Record<string, unknown>[]));
});

/** PATCH /addresses/:id — Edit address by _id */
export const updateAddressById = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?._id;
  const addrId = req.params.id;
  if (!userId) throw new AppError({ en: MESSAGES.AUTH.en.unauthorized, de: MESSAGES.AUTH.de.unauthorized }, 401);
  if (!mongoose.Types.ObjectId.isValid(addrId)) {
    throw new AppError({ en: 'Invalid address id', de: 'Ungültige Adress-ID' }, 400, 'VALIDATION_ERROR');
  }

  const user = await User.findById(userId);
  if (!user) throw new AppError({ en: MESSAGES.USER.en.notFound, de: MESSAGES.USER.de.notFound }, 404);
  const addr = user.addresses?.id(addrId);
  if (!addr) {
    throw new AppError({ en: 'Address not found', de: 'Adresse nicht gefunden' }, 404, 'NOT_FOUND');
  }

  const { addressLine1, addressLine2, landmark, saveAddressType, city, country, lat, lng, preferred } = req.body ?? {};
  const preferredExplicitTrue = preferred === true;
  let fieldsTouched = false;
  if (addressLine1 !== undefined) {
    (addr as { addressLine1: string }).addressLine1 = String(addressLine1).trim();
    fieldsTouched = true;
  }
  if (addressLine2 !== undefined) {
    (addr as { addressLine2?: string | null }).addressLine2 = addressLine2 != null && String(addressLine2).trim() !== '' ? String(addressLine2).trim() : null;
    fieldsTouched = true;
  }
  if (landmark !== undefined) {
    (addr as { landmark?: string | null }).landmark = landmark != null && String(landmark).trim() !== '' ? String(landmark).trim() : null;
    fieldsTouched = true;
  }
  if (saveAddressType !== undefined) {
    (addr as { saveAddressType: string }).saveAddressType = saveAddressType === 'work' ? 'work' : saveAddressType === 'other' ? 'other' : 'home';
    fieldsTouched = true;
  }
  if (city !== undefined) {
    (addr as { city: string }).city = String(city).trim();
    fieldsTouched = true;
  }
  if (country !== undefined) {
    (addr as { country: string }).country = String(country).trim();
    fieldsTouched = true;
  }
  if (lat !== undefined) {
    (addr as { lat?: number | null }).lat = lat != null ? Number(lat) : null;
    fieldsTouched = true;
  }
  if (lng !== undefined) {
    (addr as { lng?: number | null }).lng = lng != null ? Number(lng) : null;
    fieldsTouched = true;
  }
  if (fieldsTouched || preferredExplicitTrue) {
    for (const a of user.addresses ?? []) {
      (a as { isDefault: boolean }).isDefault = a === addr;
    }
  }
  await user.save();
  return sendSuccess(res, addressesSuccessPayload(user.addresses as unknown as Record<string, unknown>[]));
});

/** DELETE /addresses/:id — Remove address */
export const deleteAddressById = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?._id;
  const addrId = req.params.id;
  if (!userId) throw new AppError({ en: MESSAGES.AUTH.en.unauthorized, de: MESSAGES.AUTH.de.unauthorized }, 401);
  if (!mongoose.Types.ObjectId.isValid(addrId)) {
    throw new AppError({ en: 'Invalid address id', de: 'Ungültige Adress-ID' }, 400, 'VALIDATION_ERROR');
  }

  const user = await User.findById(userId);
  if (!user) throw new AppError({ en: MESSAGES.USER.en.notFound, de: MESSAGES.USER.de.notFound }, 404);
  const addr = user.addresses?.id(addrId);
  if (!addr) {
    throw new AppError({ en: 'Address not found', de: 'Adresse nicht gefunden' }, 404, 'NOT_FOUND');
  }
  const wasPreferred = (addr as { isDefault?: boolean }).isDefault;
  if (user.addresses?.length === 1 && wasPreferred) {
    throw new AppError(
      { en: 'Cannot remove your only saved address', de: 'Die einzige gespeicherte Adresse kann nicht entfernt werden' },
      400,
      'FORBIDDEN'
    );
  }
  user.addresses = user.addresses?.filter((a: { _id?: mongoose.Types.ObjectId }) => a._id?.toString() !== addrId) ?? [];
  ensureAtLeastOnePreferredAddress(user);
  await user.save();
  return sendSuccess(res, addressesSuccessPayload(user.addresses as unknown as Record<string, unknown>[]));
});

/** PATCH /addresses/:id/default — Set this address as the only preferred (isDefault in DB), clear others */
export const setDefaultAddress = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?._id;
  const addrId = req.params.id;
  if (!userId) throw new AppError({ en: MESSAGES.AUTH.en.unauthorized, de: MESSAGES.AUTH.de.unauthorized }, 401);
  if (!mongoose.Types.ObjectId.isValid(addrId)) {
    throw new AppError({ en: 'Invalid address id', de: 'Ungültige Adress-ID' }, 400, 'VALIDATION_ERROR');
  }

  const user = await User.findById(userId);
  if (!user) throw new AppError({ en: MESSAGES.USER.en.notFound, de: MESSAGES.USER.de.notFound }, 404);
  const addr = user.addresses?.id(addrId);
  if (!addr) {
    throw new AppError({ en: 'Address not found', de: 'Adresse nicht gefunden' }, 404, 'NOT_FOUND');
  }
  for (const a of user.addresses ?? []) {
    (a as { isDefault: boolean }).isDefault = a === addr;
  }
  await user.save();
  return sendSuccess(res, addressesSuccessPayload(user.addresses as unknown as Record<string, unknown>[]));
});

/** DELETE /addresses/:index */
export const deleteAddress = asyncHandler(async (req: Request, res: Response) => {
  const id = req.user?._id;
  const index = parseInt(req.params.index, 10);
  if (!id) throw new AppError({ en: MESSAGES.AUTH.en.unauthorized, de: MESSAGES.AUTH.de.unauthorized }, 401);

  const user = await User.findById(id);
  if (!user) throw new AppError({ en: MESSAGES.USER.en.notFound, de: MESSAGES.USER.de.notFound }, 404);

  const addresses = user.addresses || [];
  if (index < 0 || index >= addresses.length) {
    throw new AppError(
      { en: 'Invalid address index', de: 'Ungültiger Adressindex' },
      400,
      'INVALID_INDEX'
    );
  }

  const addr = addresses[index];
  const wasPreferred = (addr as { isDefault?: boolean }).isDefault;
  if (addresses.length === 1 && wasPreferred) {
    throw new AppError(
      { en: 'Cannot remove your only saved address', de: 'Die einzige gespeicherte Adresse kann nicht entfernt werden' },
      400,
      'FORBIDDEN'
    );
  }

  user.addresses = addresses.filter((_: unknown, i: number) => i !== index);
  ensureAtLeastOnePreferredAddress(user);
  await user.save();
  return sendSuccess(res, addressesSuccessPayload(user.addresses as unknown as Record<string, unknown>[]));
});

/** GET /order-history — Paginated order history (legacy path) */
export const getOrderHistory = asyncHandler(async (req: Request, res: Response) => {
  const id = req.user?._id;
  if (!id) throw new AppError({ en: MESSAGES.AUTH.en.unauthorized, de: MESSAGES.AUTH.de.unauthorized }, 401);
  const { page, limit } = parsePagination(req.query);
  const filter = { customerId: new mongoose.Types.ObjectId(id) };
  const [orders, total] = await Promise.all([
    Order.find(filter).lean().sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    Order.countDocuments(filter),
  ]);
  return sendSuccess(res, orders, 200, toPaginated(orders, total, page, limit));
});

/** GET /orders — Paginated order history */
export const getOrders = asyncHandler(async (req: Request, res: Response) => {
  const id = req.user?._id;
  if (!id) throw new AppError({ en: MESSAGES.AUTH.en.unauthorized, de: MESSAGES.AUTH.de.unauthorized }, 401);
  const { page, limit } = parsePagination(req.query);
  const filter = { customerId: new mongoose.Types.ObjectId(id) };
  const [orders, total] = await Promise.all([
    Order.find(filter).lean().sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    Order.countDocuments(filter),
  ]);
  return sendSuccess(res, orders, 200, toPaginated(orders, total, page, limit));
});

/** GET /points — { balance, history[] } */
export const getPoints = asyncHandler(async (req: Request, res: Response) => {
  const id = req.user?._id;
  if (!id) throw new AppError({ en: MESSAGES.AUTH.en.unauthorized, de: MESSAGES.AUTH.de.unauthorized }, 401);
  const user = await User.findById(id)
    .select('points pointsHistory')
    .lean() as { points?: number; pointsHistory?: Array<{ amount: number; reason: string; reference?: string; createdAt?: Date }> } | null;
  if (!user) throw new AppError({ en: MESSAGES.USER.en.notFound, de: MESSAGES.USER.de.notFound }, 404);
  const balance = user.points ?? 0;
  const history = user.pointsHistory ?? [];
  return sendSuccess(res, { balance, history });
});

/** GET /notifications — Return notificationPrefs */
export const getNotifications = asyncHandler(async (req: Request, res: Response) => {
  const id = req.user?._id;
  if (!id) throw new AppError({ en: MESSAGES.AUTH.en.unauthorized, de: MESSAGES.AUTH.de.unauthorized }, 401);
  const user = await User.findById(id)
    .select('notificationPrefs')
    .lean() as { notificationPrefs?: Record<string, boolean> } | null;
  if (!user) throw new AppError({ en: MESSAGES.USER.en.notFound, de: MESSAGES.USER.de.notFound }, 404);
  return sendSuccess(res, user.notificationPrefs ?? { push: true, email: true, orderUpdates: true, promotions: false });
});

/** PATCH /notifications — Update notificationPrefs */
export const updateNotifications = asyncHandler(async (req: Request, res: Response) => {
  const id = req.user?._id;
  if (!id) throw new AppError({ en: MESSAGES.AUTH.en.unauthorized, de: MESSAGES.AUTH.de.unauthorized }, 401);
  const { push, email, orderUpdates, promotions } = req.body ?? {};
  const user = await User.findById(id);
  if (!user) throw new AppError({ en: MESSAGES.USER.en.notFound, de: MESSAGES.USER.de.notFound }, 404);
  const prefs = (user as { notificationPrefs?: Record<string, boolean> }).notificationPrefs ?? {};
  if (push !== undefined) prefs.push = Boolean(push);
  if (email !== undefined) prefs.email = Boolean(email);
  if (orderUpdates !== undefined) prefs.orderUpdates = Boolean(orderUpdates);
  if (promotions !== undefined) prefs.promotions = Boolean(promotions);
  const updated = { ...prefs };
  (user as { notificationPrefs: Record<string, boolean> }).notificationPrefs = updated;
  user.markModified('notificationPrefs');
  await user.save();
  return sendSuccess(res, updated);
});

/** DELETE /account — Soft delete + invalidate tokens */
export const deleteAccount = asyncHandler(async (req: Request, res: Response) => {
  const id = req.user?._id;
  if (!id) throw new AppError({ en: MESSAGES.AUTH.en.unauthorized, de: MESSAGES.AUTH.de.unauthorized }, 401);

  await User.findByIdAndUpdate(id, { status: 'deleted', fcmToken: null });
  await invalidateAllRefreshTokensForUser(new mongoose.Types.ObjectId(id), 'User');

  return sendSuccess(res, {
    success: true,
    message: 'Account scheduled for deletion',
  });
});
