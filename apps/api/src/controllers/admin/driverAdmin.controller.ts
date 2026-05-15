import type { Request, Response } from 'express';
import type { Server as SocketIOServer } from 'socket.io';
import mongoose from 'mongoose';
import { parsePhoneNumber, isValidPhoneNumber } from 'libphonenumber-js';
import { Driver } from '../../models/Driver';
import { Order } from '../../models/Order';
import { AppError } from '../../utils/AppError';
import { MESSAGES } from '../../constants/messages';
import { sendSuccess } from '../../utils/response';
import { asyncHandler } from '../../utils/asyncHandler';
import { parsePagination } from '../../utils/pagination';
import { getUploadMiddleware, deleteLocalFile, getFileUrl, MAX_FILE_SIZE_10MB } from '../../utils/storageProvider';
import { sendPushToDriver } from '../../services/fcm.service';

const uploadDriverImages = getUploadMiddleware('drivers', MAX_FILE_SIZE_10MB).fields([
  { name: 'profileImage', maxCount: 1 },
  { name: 'licenseImage', maxCount: 1 },
  { name: 'vehicleImage', maxCount: 1 },
  { name: 'nationalIdImage', maxCount: 1 },
]);

function toPaginated<T>(data: T[], total: number, page: number, limit: number) {
  const totalPages = Math.ceil(total / limit) || 1;
  return { data, total, page, limit, totalPages, hasNext: page < totalPages, hasPrev: page > 1 };
}

function getIo(req: Request): SocketIOServer | undefined {
  return (req.app as { get?(key: string): unknown }).get?.('io') as SocketIOServer | undefined;
}

type AdminKycDocumentsShape = {
  driversLicense: string | null;
  nationalId: string[];
  vehiclePhotos: string[];
};

function attachNormalizedKyc(leanDriver: Record<string, unknown>): void {
  const raw = leanDriver.kycDocuments as Partial<AdminKycDocumentsShape> | undefined;
  leanDriver.kycDocuments = {
    driversLicense: raw?.driversLicense ?? null,
    nationalId: Array.isArray(raw?.nationalId) ? raw.nationalId : [],
    vehiclePhotos: Array.isArray(raw?.vehiclePhotos) ? raw.vehiclePhotos : [],
  };
  if (leanDriver.kycStatus == null) leanDriver.kycStatus = 'not_submitted';
  if (leanDriver.kycRejectionReason === undefined) leanDriver.kycRejectionReason = null;
}

/** GET / — List drivers */
export const listDrivers = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit } = parsePagination(req.query);
  const search = String(req.query.search || '').trim();
  const approvalFilter = String(req.query.approvalStatus || '').trim();
  const statusFilter = String(req.query.status || '').trim();
  const vehicleTypeFilter = String(req.query.vehicleType || '').trim();

  const filter: Record<string, unknown> = {};
  if (approvalFilter) filter.approvalStatus = approvalFilter;
  if (statusFilter) filter.status = statusFilter;
  else filter.status = { $ne: 'deleted' };
  if (vehicleTypeFilter && ['bike', 'scooter', 'car', 'van'].includes(vehicleTypeFilter)) {
    filter.vehicleType = vehicleTypeFilter;
  }
  if (search) {
    const re = new RegExp(search, 'i');
    filter.$or = [{ name: re }, { phone: re }, { email: re }];
  }

  const sort: Record<string, 1 | -1> = { createdAt: -1 };
  if (!approvalFilter || approvalFilter === 'pending') {
    sort.approvalStatus = 1; // pending first (asc: pending < approved < rejected)
  }

  const [drivers, total] = await Promise.all([
    Driver.find(filter).select('-password').lean().sort(sort).skip((page - 1) * limit).limit(limit),
    Driver.countDocuments(filter),
  ]);

  return sendSuccess(res, drivers, 200, toPaginated(drivers, total, page, limit));
});

/** GET /stats/pending-count */
export const getPendingCount = asyncHandler(async (_req: Request, res: Response) => {
  // Pending queue should include:
  // - new drivers waiting for admin approval (approvalStatus=pending)
  // - drivers who re-uploaded KYC and are waiting for review (kycStatus=pending)
  const count = await Driver.countDocuments({
    status: { $ne: 'deleted' },
    $or: [{ approvalStatus: 'pending' }, { kycStatus: 'pending' }],
  });
  return sendSuccess(res, { count });
});

/** GET /pending — Pending queue: approval pending OR KYC pending */
export const getPendingApprovals = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit } = parsePagination(req.query);
  const filter = {
    status: { $ne: 'deleted' },
    $or: [{ approvalStatus: 'pending' }, { kycStatus: 'pending' }],
  };
  const [drivers, total] = await Promise.all([
    Driver.find(filter).select('-password').lean().sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    Driver.countDocuments(filter),
  ]);
  return sendSuccess(res, drivers, 200, toPaginated(drivers, total, page, limit));
});

/** GET /:id — Driver detail */
export const getDriver = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError({ en: MESSAGES.DRIVER.en.notFound, de: MESSAGES.DRIVER.de.notFound }, 404, 'NOT_FOUND');
  }
  const driver = await Driver.findById(id).select('-password').populate('approvalHistory.changedBy', 'name email').lean();
  if (!driver || (driver as { status?: string }).status === 'deleted') {
    throw new AppError({ en: MESSAGES.DRIVER.en.notFound, de: MESSAGES.DRIVER.de.notFound }, 404, 'NOT_FOUND');
  }
  const doc = driver as Record<string, unknown>;
  if (typeof doc.rating === 'number') doc.rating = Math.round(doc.rating * 10) / 10;
  attachNormalizedKyc(doc);
  return sendSuccess(res, driver);
});

/** PUT /:id — Update driver */
export const updateDriver = asyncHandler(async (req: Request, res: Response) => {
  const runUpload = () =>
    new Promise<void>((resolve, reject) => {
      uploadDriverImages(req as any, res as any, (err: unknown) => (err ? reject(err) : resolve()));
    });
  await runUpload();

  const id = req.params.id;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError({ en: MESSAGES.DRIVER.en.notFound, de: MESSAGES.DRIVER.de.notFound }, 404, 'NOT_FOUND');
  }
  const driver = await Driver.findById(id);
  if (!driver || driver.status === 'deleted') {
    throw new AppError({ en: MESSAGES.DRIVER.en.notFound, de: MESSAGES.DRIVER.de.notFound }, 404, 'NOT_FOUND');
  }

  const { name, email, phone, vehicleType, vehiclePlate, deliveryZones, bankAccount, preferredLang } = req.body ?? {};
  if (name !== undefined) driver.name = String(name).trim();
  if (email !== undefined) driver.email = String(email).toLowerCase().trim() || undefined;
  if (phone !== undefined) {
    const phoneStr = String(phone).trim();
    if (!isValidPhoneNumber(phoneStr)) {
      throw new AppError({ en: 'Invalid phone number', de: 'Ungültige Telefonnummer' }, 400, 'VALIDATION_ERROR');
    }
    const normalized = parsePhoneNumber(phoneStr, 'DE')?.format('E.164') ?? phoneStr;
    const existing = await Driver.findOne({ phone: normalized, _id: { $ne: id } });
    if (existing) throw new AppError({ en: 'Phone already in use', de: 'Telefon bereits vergeben' }, 409, 'CONFLICT');
    driver.phone = normalized;
  }
  if (vehicleType !== undefined) driver.vehicleType = vehicleType || null;
  if (vehiclePlate !== undefined) driver.vehiclePlate = vehiclePlate || null;
  if (deliveryZones !== undefined) driver.deliveryZones = Array.isArray(deliveryZones) ? deliveryZones : driver.deliveryZones;
  if (preferredLang !== undefined) driver.preferredLang = preferredLang === 'de' ? 'de' : 'en';
  if (bankAccount !== undefined && typeof bankAccount === 'object') {
    const prev = driver.bankAccount || {};
    driver.bankAccount = {
      iban: bankAccount.iban != null ? String(bankAccount.iban) : prev.iban,
      bankName: bankAccount.bankName != null ? String(bankAccount.bankName) : prev.bankName,
      accountHolder: bankAccount.accountHolder != null ? String(bankAccount.accountHolder) : prev.accountHolder,
    };
  }

  const files = req.files as Record<string, Express.Multer.File[]> | undefined;
  const imageFields = ['profileImage', 'licenseImage', 'vehicleImage', 'nationalIdImage'] as const;
  for (const field of imageFields) {
    const arr = files?.[field];
    if (arr?.[0]?.filename) {
      const old = driver[field];
      if (old) deleteLocalFile(old);
      driver[field] = getFileUrl(arr[0], 'drivers');
    }
  }

  await driver.save();
  const doc = driver.toObject();
  delete (doc as Record<string, unknown>).password;
  return sendSuccess(res, doc);
});

/** DELETE /:id — Soft delete */
export const deleteDriver = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError({ en: MESSAGES.DRIVER.en.notFound, de: MESSAGES.DRIVER.de.notFound }, 404, 'NOT_FOUND');
  }
  const driver = await Driver.findByIdAndUpdate(id, { status: 'deleted' }, { new: true }).select('-password').lean();
  if (!driver) {
    throw new AppError({ en: MESSAGES.DRIVER.en.notFound, de: MESSAGES.DRIVER.de.notFound }, 404, 'NOT_FOUND');
  }
  return sendSuccess(res, driver);
});

/** PATCH /:id/approve */
export const approveDriver = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id;
  const adminId = req.user?._id;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError({ en: MESSAGES.DRIVER.en.notFound, de: MESSAGES.DRIVER.de.notFound }, 404, 'NOT_FOUND');
  }
  const driver = await Driver.findById(id);
  if (!driver || driver.status === 'deleted') {
    throw new AppError({ en: MESSAGES.DRIVER.en.notFound, de: MESSAGES.DRIVER.de.notFound }, 404, 'NOT_FOUND');
  }
  if (driver.approvalStatus === 'approved') {
    throw new AppError({ en: 'Driver already approved', de: 'Fahrer bereits genehmigt' }, 400, 'ALREADY_APPROVED');
  }
  driver.approvalStatus = 'approved';
  driver.approvalNote = undefined;
  driver.approvalHistory = driver.approvalHistory || [];
  driver.approvalHistory.push({
    status: 'approved',
    changedBy: new mongoose.Types.ObjectId(adminId),
    changedAt: new Date(),
  } as never);
  await driver.save();
  await sendPushToDriver(driver, {
    title: 'Congratulations!',
    body: 'Your driver account has been approved. You can now start accepting deliveries.',
    data: { type: 'approval', status: 'approved' },
  });

  const hadPendingKyc = driver.kycStatus === 'pending';
  if (hadPendingKyc) {
    driver.kycStatus = 'approved';
    await driver.save();
    const io = getIo(req);
    const driverIdStr = driver._id.toString();
    io?.to(`driver:${driverIdStr}`).emit('driver:kyc_approved', { kycStatus: 'approved' as const });
    await sendPushToDriver(driver, {
      title: 'KYC Approved',
      body: 'Your identity documents have been verified. You can now go online.',
      data: { type: 'kyc_approved', kycStatus: 'approved' },
    });
  }

  const doc = driver.toObject();
  delete (doc as Record<string, unknown>).password;
  attachNormalizedKyc(doc as Record<string, unknown>);
  return sendSuccess(res, doc);
});

/** PATCH /:id/reject */
export const rejectDriver = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id;
  const adminId = req.user?._id;
  const { reason, kycRejectionReason } = req.body ?? {};
  if (!reason || String(reason).trim().length < 10) {
    throw new AppError({ en: 'Reason required (min 10 chars)', de: 'Begründung erforderlich (min. 10 Zeichen)' }, 400, 'VALIDATION_ERROR');
  }
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError({ en: MESSAGES.DRIVER.en.notFound, de: MESSAGES.DRIVER.de.notFound }, 404, 'NOT_FOUND');
  }
  const driver = await Driver.findById(id);
  if (!driver || driver.status === 'deleted') {
    throw new AppError({ en: MESSAGES.DRIVER.en.notFound, de: MESSAGES.DRIVER.de.notFound }, 404, 'NOT_FOUND');
  }
  driver.approvalStatus = 'rejected';
  driver.approvalNote = String(reason).trim();
  driver.approvalHistory = driver.approvalHistory || [];
  driver.approvalHistory.push({
    status: 'rejected',
    note: driver.approvalNote,
    changedBy: new mongoose.Types.ObjectId(adminId),
    changedAt: new Date(),
  } as never);
  await driver.save();
  await sendPushToDriver(driver, {
    title: 'Application Update',
    body: driver.approvalNote || 'Your driver application was not approved.',
    data: { type: 'approval', status: 'rejected' },
  });

  const kycReasonRaw =
    (kycRejectionReason != null && String(kycRejectionReason).trim()) ||
    (reason != null && String(reason).trim()) ||
    null;
  driver.kycStatus = 'rejected';
  driver.kycRejectionReason = kycReasonRaw;
  await driver.save();

  const io = getIo(req);
  const driverIdStr = driver._id.toString();
  io?.to(`driver:${driverIdStr}`).emit('driver:kyc_rejected', {
    kycStatus: 'rejected' as const,
    kycRejectionReason: driver.kycRejectionReason,
  });
  await sendPushToDriver(driver, {
    title: 'Action Required — KYC Rejected',
    body:
      driver.kycRejectionReason?.trim() || 'Your documents were not accepted. Please re-upload.',
    data: { type: 'kyc_rejected', kycStatus: 'rejected' },
  });

  const doc = driver.toObject();
  delete (doc as Record<string, unknown>).password;
  attachNormalizedKyc(doc as Record<string, unknown>);
  return sendSuccess(res, doc);
});

/** PATCH /:id/block — Toggle block (active ↔ blocked) + reason; send FCM notification */
export const blockDriver = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id;
  const { reason } = req.body ?? {};
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError({ en: MESSAGES.DRIVER.en.notFound, de: MESSAGES.DRIVER.de.notFound }, 404, 'NOT_FOUND');
  }
  const driver = await Driver.findById(id);
  if (!driver || driver.status === 'deleted') {
    throw new AppError({ en: MESSAGES.DRIVER.en.notFound, de: MESSAGES.DRIVER.de.notFound }, 404, 'NOT_FOUND');
  }
  const newStatus = driver.status === 'blocked' ? 'active' : 'blocked';
  if (newStatus === 'blocked') {
    const reasonStr = reason != null ? String(reason).trim() : '';
    if (!reasonStr) {
      throw new AppError(
        { en: 'Reason is required when blocking', de: 'Begründung beim Sperren erforderlich' },
        400,
        'VALIDATION_ERROR'
      );
    }
    driver.blockReason = reasonStr;
  } else {
    driver.blockReason = null;
  }
  driver.status = newStatus;
  await driver.save();
  await sendPushToDriver(driver, {
    title: newStatus === 'blocked' ? 'Account Update' : 'Account Restored',
    body:
      newStatus === 'blocked'
        ? (driver.blockReason || 'Your driver account has been blocked.')
        : 'Your driver account has been unblocked. You can go online again.',
    data: { type: 'block', status: newStatus },
  });
  const doc = driver.toObject();
  delete (doc as Record<string, unknown>).password;
  return sendSuccess(res, doc);
});

/** PATCH /:id/status — Block / Enable (only approved) */
export const updateDriverStatus = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id;
  const { status, reason } = req.body ?? {};
  if (status !== 'active' && status !== 'blocked') {
    throw new AppError({ en: 'Status must be active or blocked', de: 'Status muss active oder blocked sein' }, 400, 'VALIDATION_ERROR');
  }
  if (status === 'blocked') {
    const reasonStr = reason != null ? String(reason).trim() : '';
    if (!reasonStr) {
      throw new AppError({ en: 'Reason is required when blocking', de: 'Begründung beim Sperren erforderlich' }, 400, 'VALIDATION_ERROR');
    }
  }
  const update: Record<string, unknown> = { status };
  if (status === 'blocked') update.blockReason = String(reason).trim();
  else update.blockReason = null;
  const driver = await Driver.findOneAndUpdate(
    { _id: id, approvalStatus: 'approved', status: { $ne: 'deleted' } },
    update,
    { new: true }
  ).select('-password').lean();
  if (!driver) {
    throw new AppError({ en: MESSAGES.DRIVER.en.notFound, de: MESSAGES.DRIVER.de.notFound }, 404, 'NOT_FOUND');
  }
  return sendSuccess(res, driver);
});

/** GET /:id/orders — Driver order history */
export const getDriverOrders = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError({ en: MESSAGES.DRIVER.en.notFound, de: MESSAGES.DRIVER.de.notFound }, 404, 'NOT_FOUND');
  }
  const driver = await Driver.findById(id).select('status').lean();
  if (!driver || (driver as { status?: string }).status === 'deleted') {
    throw new AppError({ en: MESSAGES.DRIVER.en.notFound, de: MESSAGES.DRIVER.de.notFound }, 404, 'NOT_FOUND');
  }
  const { page, limit } = parsePagination(req.query);
  const filter = { driverId: new mongoose.Types.ObjectId(id) };
  const [orders, total] = await Promise.all([
    Order.find(filter)
      .populate('customerId', 'name phone')
      .lean()
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Order.countDocuments(filter),
  ]);
  return sendSuccess(res, orders, 200, toPaginated(orders, total, page, limit));
});

/** GET /:id/location */
export const getDriverLocation = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError({ en: MESSAGES.DRIVER.en.notFound, de: MESSAGES.DRIVER.de.notFound }, 404, 'NOT_FOUND');
  }
  const driver = await Driver.findById(id).select('liveLocation lastLocationAt isOnline isAvailable').lean();
  if (!driver || (driver as { status?: string }).status === 'deleted') {
    throw new AppError({ en: MESSAGES.DRIVER.en.notFound, de: MESSAGES.DRIVER.de.notFound }, 404, 'NOT_FOUND');
  }
  return sendSuccess(res, {
    liveLocation: (driver as { liveLocation?: { type?: string; coordinates?: number[] } }).liveLocation,
    lastLocationAt: (driver as { lastLocationAt?: Date }).lastLocationAt,
    isOnline: (driver as { isOnline?: boolean }).isOnline,
    isAvailable: (driver as { isAvailable?: boolean }).isAvailable,
  });
});
