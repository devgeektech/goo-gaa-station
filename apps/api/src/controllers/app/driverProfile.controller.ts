import type { Request, Response } from 'express';
import { Driver } from '../../models/Driver';
import { AppError } from '../../utils/AppError';
import { MESSAGES } from '../../constants/messages';
import { sendSuccess } from '../../utils/response';
import { asyncHandler } from '../../utils/asyncHandler';
import { getUploadMiddleware, deleteLocalFile, getFileUrl } from '../../utils/storageProvider';
import type { Server as SocketIOServer } from 'socket.io';

const uploadDriverImage = getUploadMiddleware('drivers').single('profileImage');

function getIo(req: Request): SocketIOServer | undefined {
  return (req.app as { get?(key: string): unknown }).get?.('io') as SocketIOServer | undefined;
}

function toPaginated<T>(data: T[], total: number, page: number, limit: number) {
  const totalPages = Math.ceil(total / limit) || 1;
  return { data, total, page, limit, totalPages, hasNext: page < totalPages, hasPrev: page > 1 };
}

/** GET /profile */
export const getProfile = asyncHandler(async (req: Request, res: Response) => {
  const id = req.user?._id;
  if (!id) throw new AppError({ en: MESSAGES.AUTH.en.unauthorized, de: MESSAGES.AUTH.de.unauthorized }, 401);
  const driver = await Driver.findById(id).select('-password').lean();
  if (!driver || (driver as { status?: string }).status === 'deleted') {
    throw new AppError({ en: MESSAGES.DRIVER.en.notFound, de: MESSAGES.DRIVER.de.notFound }, 404);
  }
  return sendSuccess(res, driver);
});

/** PUT /profile — name, email, preferredLang, profileImage only */
export const updateProfile = asyncHandler(async (req: Request, res: Response) => {
  const runUpload = () =>
    new Promise<void>((resolve, reject) => {
      uploadDriverImage(req as any, res as any, (err: unknown) => (err ? reject(err) : resolve()));
    });
  await runUpload();

  const id = req.user?._id;
  if (!id) throw new AppError({ en: MESSAGES.AUTH.en.unauthorized, de: MESSAGES.AUTH.de.unauthorized }, 401);

  const driver = await Driver.findById(id);
  if (!driver || driver.status === 'deleted') {
    throw new AppError({ en: MESSAGES.DRIVER.en.notFound, de: MESSAGES.DRIVER.de.notFound }, 404);
  }

  const { name, email, preferredLang } = req.body ?? {};
  if (name !== undefined) driver.name = String(name).trim();
  if (email !== undefined) driver.email = String(email).toLowerCase().trim() || undefined;
  if (preferredLang !== undefined) driver.preferredLang = preferredLang === 'de' ? 'de' : 'en';

  const file = req.file as Express.Multer.File | undefined;
  if (file?.filename) {
    if (driver.profileImage) deleteLocalFile(driver.profileImage);
    driver.profileImage = getFileUrl(file, 'drivers');
  }

  await driver.save();
  const doc = driver.toObject();
  delete (doc as Record<string, unknown>).password;
  return sendSuccess(res, doc);
});

/** PUT /fcm-token */
export const updateFcmToken = asyncHandler(async (req: Request, res: Response) => {
  const id = req.user?._id;
  if (!id) throw new AppError({ en: MESSAGES.AUTH.en.unauthorized, de: MESSAGES.AUTH.de.unauthorized }, 401);
  const { fcmToken } = req.body ?? {};
  await Driver.findByIdAndUpdate(id, {
    fcmToken: fcmToken != null ? String(fcmToken) : null,
    lastActiveAt: new Date(),
  });
  return sendSuccess(res, { success: true });
});

/** PATCH /online-status */
export const updateOnlineStatus = asyncHandler(async (req: Request, res: Response) => {
  const id = req.user?._id;
  if (!id) throw new AppError({ en: MESSAGES.AUTH.en.unauthorized, de: MESSAGES.AUTH.de.unauthorized }, 401);
  const { isOnline } = req.body ?? {};
  if (typeof isOnline !== 'boolean') {
    throw new AppError({ en: 'isOnline must be boolean', de: 'isOnline muss boolean sein' }, 400, 'VALIDATION_ERROR');
  }

  const driver = await Driver.findById(id);
  if (!driver || driver.status === 'deleted') {
    throw new AppError({ en: MESSAGES.DRIVER.en.notFound, de: MESSAGES.DRIVER.de.notFound }, 404);
  }
  if (driver.approvalStatus !== 'approved' || driver.status !== 'active') {
    throw new AppError({ en: 'Only approved and active drivers can change online status', de: 'Nur genehmigte aktive Fahrer können den Status ändern' }, 403, 'FORBIDDEN');
  }
  if (isOnline === false && driver.currentOrderId) {
    throw new AppError({ en: 'Cannot go offline during delivery', de: 'Während der Lieferung nicht offline gehen' }, 400, 'DELIVERY_ACTIVE');
  }

  driver.isOnline = isOnline;
  driver.lastActiveAt = new Date();
  await driver.save();

  const io = getIo(req);
  if (io) {
    io.to('admin').emit('driver:online_status', { driverId: id, isOnline });
  }

  return sendSuccess(res, { success: true, isOnline });
});

/** PUT /location */
export const updateLocation = asyncHandler(async (req: Request, res: Response) => {
  const id = req.user?._id;
  if (!id) throw new AppError({ en: MESSAGES.AUTH.en.unauthorized, de: MESSAGES.AUTH.de.unauthorized }, 401);
  const { lat, lng } = req.body ?? {};
  const latNum = Number(lat);
  const lngNum = Number(lng);
  if (Number.isNaN(latNum) || latNum < -90 || latNum > 90) {
    throw new AppError({ en: 'Invalid lat (-90 to 90)', de: 'Ungültige Lat (-90 bis 90)' }, 400, 'VALIDATION_ERROR');
  }
  if (Number.isNaN(lngNum) || lngNum < -180 || lngNum > 180) {
    throw new AppError({ en: 'Invalid lng (-180 to 180)', de: 'Ungültige Lng (-180 bis 180)' }, 400, 'VALIDATION_ERROR');
  }

  const driver = await Driver.findByIdAndUpdate(
    id,
    {
      'liveLocation.coordinates': [lngNum, latNum],
      lastLocationAt: new Date(),
    },
    { new: true }
  ).select('currentOrderId').lean();

  if (!driver) throw new AppError({ en: MESSAGES.DRIVER.en.notFound, de: MESSAGES.DRIVER.de.notFound }, 404);

  const io = getIo(req);
  const ts = Date.now();
  if (io) {
    const payload = { driverId: id, lat: latNum, lng: lngNum, timestamp: ts };
    const orderId = (driver as { currentOrderId?: unknown }).currentOrderId;
    if (orderId) {
      io.to(`order:${orderId}`).emit('driver:location_update', payload);
    }
    io.to('admin').emit('admin:driver_location', { ...payload, driverId: id });
  }

  return sendSuccess(res, { success: true });
});

/** GET /current-order — Stub (Phase 4: populate Order) */
export const getCurrentOrder = asyncHandler(async (req: Request, res: Response) => {
  const id = req.user?._id;
  if (!id) throw new AppError({ en: MESSAGES.AUTH.en.unauthorized, de: MESSAGES.AUTH.de.unauthorized }, 401);
  const driver = await Driver.findById(id).select('currentOrderId').lean();
  if (!driver || !(driver as { currentOrderId?: unknown }).currentOrderId) {
    return sendSuccess(res, null);
  }
  return sendSuccess(res, null);
});

/** GET /delivery-history — Stub */
export const getDeliveryHistory = asyncHandler(async (_req: Request, res: Response) => {
  return sendSuccess(res, [], 200, toPaginated([], 0, 1, 20));
});
