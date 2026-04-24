import type { Request, Response } from 'express';
import crypto from 'crypto';
import mongoose from 'mongoose';
import { Order } from '../../models/Order';
import { MenuItem } from '../../models/MenuItem';
import { Vendor } from '../../models/Vendor';
import { Driver } from '../../models/Driver';
import { AppError } from '../../utils/AppError';
import { MESSAGES } from '../../constants/messages';
import { sendSuccess } from '../../utils/response';
import { asyncHandler } from '../../utils/asyncHandler';
import { parsePagination } from '../../utils/pagination';
import { transitionOrderStatus } from '../../services/orderStatus.service';
import { syncPreferredAddressFromOrderDelivery } from '../../services/customerPreferredAddress.service';
import type { Server as SocketIOServer } from 'socket.io';

function getIo(req: Request): SocketIOServer | undefined {
  return (req.app as { get?(key: string): unknown }).get?.('io') as SocketIOServer | undefined;
}

function toPaginated<T>(data: T[], total: number, page: number, limit: number) {
  const totalPages = Math.ceil(total / limit) || 1;
  return { data, total, page, limit, totalPages, hasNext: page < totalPages, hasPrev: page > 1 };
}

function generateDeliveryOtp(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

/** POST / — Place new order; validate cart against vendor menu, calculate totals, set deliveryOtp (4-digit) */
export const placeOrder = asyncHandler(async (req: Request, res: Response) => {
  const customerId = req.user?._id;
  if (!customerId) throw new AppError({ en: MESSAGES.AUTH.en.unauthorized, de: MESSAGES.AUTH.de.unauthorized }, 401);

  const { vendorId, items, deliveryAddress, pickupAddress, deliveryFee, discount, notes, phone } = req.body ?? {};
  if (!items || !Array.isArray(items) || items.length === 0) {
    throw new AppError({ en: 'Items are required and must be non-empty', de: 'Artikel erforderlich' }, 400, 'VALIDATION_ERROR');
  }
  const addr = deliveryAddress as {
    _id?: string;
    addressId?: string;
    street?: string;
    addressLine1?: string;
    addressLine2?: string;
    city?: string;
    country?: string;
    lat?: number;
    lng?: number;
    contactName?: string;
    contactPhone?: string;
  } | undefined;
  const street = addr?.street ?? (addr?.addressLine1 ? [addr.addressLine1, addr.addressLine2].filter(Boolean).join(', ') : '');
  if (!addr || !street || !addr.city || !addr.country) {
    throw new AppError({ en: 'Delivery address (street or addressLine1, city, country) required', de: 'Lieferadresse erforderlich' }, 400, 'VALIDATION_ERROR');
  }

  let orderItems: Array<{ name: string; qty: number; unitPrice: number; image: string | null; subtotal: number; itemId: string | null }>;
  let vendorIdObj: mongoose.Types.ObjectId | null = null;

  if (vendorId && mongoose.Types.ObjectId.isValid(vendorId)) {
    const vendor = await Vendor.findById(vendorId).select('status').lean();
    if (!vendor || (vendor as { status?: string }).status !== 'active') {
      throw new AppError({ en: 'Vendor not found or not active', de: 'Anbieter nicht gefunden oder inaktiv' }, 400, 'VALIDATION_ERROR');
    }
    vendorIdObj = new mongoose.Types.ObjectId(vendorId);
    const itemIds = items.map((i: { itemId?: string }) => i?.itemId).filter(Boolean);
    const menuItems = await MenuItem.find({
      _id: { $in: itemIds },
      vendorId: vendorIdObj,
      isAvailable: true,
    }).lean();
    const menuMap = new Map(
      menuItems.map((m: unknown) => {
        const row = m as { _id: mongoose.Types.ObjectId };
        return [row._id.toString(), row] as const;
      })
    );
    orderItems = items.map((i: { itemId?: string; qty?: number }) => {
      const itemId = i?.itemId ? String(i.itemId) : null;
      const qty = Math.max(1, Math.floor(Number(i?.qty) || 0));
      const menu = itemId ? menuMap.get(itemId) : null;
      if (!menu) {
        throw new AppError(
          { en: `Invalid or unavailable item: ${itemId || 'missing itemId'}`, de: 'Ungültiger oder nicht verfügbarer Artikel' },
          400,
          'VALIDATION_ERROR'
        );
      }
      const m = menu as { price: number; name: string; image?: string; _id: mongoose.Types.ObjectId };
      const unitPrice = m.price;
      const subtotal = qty * unitPrice;
      return {
        name: m.name,
        qty,
        unitPrice,
        image: m.image || null,
        subtotal,
        itemId: m._id.toString(),
      };
    });
  } else {
    orderItems = items.map((i: { name?: string; qty?: number; unitPrice?: number; image?: string; itemId?: string }) => {
      const qty = Math.max(1, Math.floor(Number(i?.qty) || 0));
      const unitPrice = Number(i?.unitPrice) || 0;
      const subtotal = qty * unitPrice;
      return {
        name: String(i?.name || ''),
        qty,
        unitPrice,
        image: i?.image || null,
        subtotal,
        itemId: i?.itemId ? String(i.itemId) : null,
      };
    });
  }

  const subtotal = orderItems.reduce((s, i) => s + i.subtotal, 0);
  const fee = Number(deliveryFee) || 0;
  const disc = Number(discount) || 0;
  const total = Math.max(0, subtotal + fee - disc);
  const deliveryOtp = generateDeliveryOtp();

  const order = await Order.create({
    customerId: new mongoose.Types.ObjectId(customerId),
    vendorId: vendorIdObj,
    items: orderItems,
    subtotal,
    deliveryFee: fee,
    discount: disc,
    total,
    wifipayRef: crypto.randomBytes(16).toString('hex'),
    deliveryOtp,
    deliveryAddress: {
      street,
      city: addr.city,
      country: addr.country,
      lat: addr.lat ?? null,
      lng: addr.lng ?? null,
      contactName: addr.contactName ?? null,
      contactPhone: addr.contactPhone ?? phone ?? null,
    },
    pickupAddress: pickupAddress
      ? {
          street: pickupAddress.street,
          city: pickupAddress.city,
          country: pickupAddress.country,
          lat: pickupAddress.lat ?? null,
          lng: pickupAddress.lng ?? null,
          name: pickupAddress.name ?? null,
        }
      : null,
    notes: notes || null,
    status: 'pending',
    statusHistory: [{ status: 'pending', timestamp: new Date(), changedByModel: 'User' }],
  });

  if (addr) await syncPreferredAddressFromOrderDelivery(String(customerId), addr);

  const io = getIo(req);
  if (io) {
    io.to('admin').emit('order:new', order.toObject?.() ?? order);
    io.to(`customer:${customerId}`).emit('order:new', order.toObject?.() ?? order);
  }

  return sendSuccess(res, { order: order.toObject?.() ?? order, paymentRequired: true }, 200);
});

/** GET / — Customer order history */
export const listMyOrders = asyncHandler(async (req: Request, res: Response) => {
  const customerId = req.user?._id;
  if (!customerId) throw new AppError({ en: MESSAGES.AUTH.en.unauthorized, de: MESSAGES.AUTH.de.unauthorized }, 401);

  const { page, limit } = parsePagination(req.query);
  const statusFilter = String(req.query.status || '').trim();

  const filter: Record<string, unknown> = { customerId: new mongoose.Types.ObjectId(customerId) };
  if (statusFilter) filter.status = statusFilter;

  const [orders, total] = await Promise.all([
    Order.find(filter).lean().sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    Order.countDocuments(filter),
  ]);

  return sendSuccess(res, orders, 200, toPaginated(orders, total, page, limit));
});

/** GET /:id — Single order detail */
export const getOrder = asyncHandler(async (req: Request, res: Response) => {
  const customerId = req.user?._id;
  const id = req.params.id;
  if (!customerId) throw new AppError({ en: MESSAGES.AUTH.en.unauthorized, de: MESSAGES.AUTH.de.unauthorized }, 401);
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError({ en: MESSAGES.ORDER.en.notFound, de: MESSAGES.ORDER.de.notFound }, 404);
  }

  const order = await Order.findById(id)
    .populate('driverId', 'name phone profileImage vehicleType vehiclePlate rating')
    .populate('vendorId', 'name slug logo')
    .lean();
  if (!order) throw new AppError({ en: MESSAGES.ORDER.en.notFound, de: MESSAGES.ORDER.de.notFound }, 404);
  if (String((order as { customerId?: { _id?: unknown } }).customerId?._id ?? (order as { customerId?: unknown }).customerId) !== customerId) {
    throw new AppError({ en: 'Forbidden', de: 'Verboten' }, 403, 'FORBIDDEN');
  }
  return sendSuccess(res, { ...order, statusTimeline: (order as { statusHistory?: unknown[] }).statusHistory ?? [] });
});

/** POST /:id/cancel — Allowed within 2 min of placement or before status 'accepted' */
export const cancelOrder = asyncHandler(async (req: Request, res: Response) => {
  const customerId = req.user?._id;
  const id = req.params.id;
  const { reason } = req.body ?? {};
  if (!customerId) throw new AppError({ en: MESSAGES.AUTH.en.unauthorized, de: MESSAGES.AUTH.de.unauthorized }, 401);
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError({ en: MESSAGES.ORDER.en.notFound, de: MESSAGES.ORDER.de.notFound }, 404);
  }

  const order = await Order.findOne({ _id: id, customerId });
  if (!order) throw new AppError({ en: MESSAGES.ORDER.en.notFound, de: MESSAGES.ORDER.de.notFound }, 404);
  const status = order.status;
  const createdAt = new Date((order as mongoose.Document & { createdAt?: Date }).createdAt ?? Date.now()).getTime();
  const twoMinMs = 2 * 60 * 1000;
  const withinTwoMin = Date.now() - createdAt <= twoMinMs;
  const beforeAccepted = ['pending', 'placed'].includes(status);
  const allowed = beforeAccepted || (['accepted', 'confirmed'].includes(status) && withinTwoMin);
  if (!allowed) {
    throw new AppError(
      { en: 'Order cannot be cancelled (only within 2 min of placement or before accepted)', de: 'Bestellung kann nur innerhalb von 2 Min. oder vor Annahme storniert werden' },
      400,
      'INVALID_STATUS'
    );
  }

  (order as { cancelledBy?: string; cancellationReason?: string | null }).cancelledBy = 'customer';
  (order as { cancellationReason?: string | null }).cancellationReason = reason ? String(reason).trim() : null;
  await transitionOrderStatus(order, {
    status: 'cancelled',
    note: (order as { cancellationReason?: string | null }).cancellationReason ?? undefined,
    changedByModel: 'User',
  }, getIo(req));

  const doc = order.toObject();
  return sendSuccess(res, doc);
});

/** POST /:id/rate — Submit food + delivery ratings (1-5) */
export const rateOrder = asyncHandler(async (req: Request, res: Response) => {
  const customerId = req.user?._id;
  const id = req.params.id;
  const { foodRating, deliveryRating, rating, comment } = req.body ?? {};
  if (!customerId) throw new AppError({ en: MESSAGES.AUTH.en.unauthorized, de: MESSAGES.AUTH.de.unauthorized }, 401);
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError({ en: MESSAGES.ORDER.en.notFound, de: MESSAGES.ORDER.de.notFound }, 404);
  }

  const food = foodRating != null ? Number(foodRating) : (rating != null ? Number(rating) : null);
  const delivery = deliveryRating != null ? Number(deliveryRating) : null;
  if (food != null && (Number.isNaN(food) || food < 1 || food > 5)) {
    throw new AppError({ en: 'Food rating must be 1-5', de: 'Bewertung Essen muss 1-5 sein' }, 400, 'VALIDATION_ERROR');
  }
  if (delivery != null && (Number.isNaN(delivery) || delivery < 1 || delivery > 5)) {
    throw new AppError({ en: 'Delivery rating must be 1-5', de: 'Bewertung Lieferung muss 1-5 sein' }, 400, 'VALIDATION_ERROR');
  }

  const order = await Order.findOne({ _id: id, customerId });
  if (!order) throw new AppError({ en: MESSAGES.ORDER.en.notFound, de: MESSAGES.ORDER.de.notFound }, 404);
  if (order.status !== 'delivered') {
    throw new AppError({ en: 'Can only rate delivered orders', de: 'Nur gelieferte Bestellungen bewertbar' }, 400, 'INVALID_STATUS');
  }
  const hasExisting = (order as { foodRating?: number; deliveryRating?: number; customerRating?: number }).foodRating != null
    || (order as { deliveryRating?: number }).deliveryRating != null
    || order.customerRating != null;
  if (hasExisting) {
    throw new AppError({ en: 'Order already rated', de: 'Bestellung bereits bewertet' }, 400, 'ALREADY_RATED');
  }

  if (food != null) {
    (order as { customerRating?: number }).customerRating = food;
    (order as { foodRating?: number }).foodRating = food;
  }
  if (delivery != null) (order as { deliveryRating?: number }).deliveryRating = delivery;
  (order as { customerRatingComment?: string | null }).customerRatingComment = comment ? String(comment).trim() : null;
  await order.save();

  if (order.driverId && (delivery != null || food != null)) {
    const driverOrders = await Order.find({ driverId: order.driverId })
      .select('deliveryRating customerRating')
      .lean() as Array<{ deliveryRating?: number; customerRating?: number }>;
    const ratings = driverOrders
      .map((o) => o.deliveryRating != null ? o.deliveryRating : o.customerRating)
      .filter((r): r is number => typeof r === 'number');
    const avg = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 5;
    await Driver.findByIdAndUpdate(order.driverId, { rating: Math.round(avg * 10) / 10 });
  }

  return sendSuccess(res, { success: true });
});

/** GET /:id/track — Returns { status, driverLocation, estimatedDelivery, deliveryOtp } */
export const trackOrder = asyncHandler(async (req: Request, res: Response) => {
  const customerId = req.user?._id;
  const id = req.params.id;
  if (!customerId) throw new AppError({ en: MESSAGES.AUTH.en.unauthorized, de: MESSAGES.AUTH.de.unauthorized }, 401);
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError({ en: MESSAGES.ORDER.en.notFound, de: MESSAGES.ORDER.de.notFound }, 404);
  }

  const order = await Order.findById(id)
    .select('customerId status deliveryOtp estimatedDeliveryTime driverId')
    .populate('driverId', 'name phone vehicleType vehiclePlate liveLocation')
    .lean();
  if (!order) throw new AppError({ en: MESSAGES.ORDER.en.notFound, de: MESSAGES.ORDER.de.notFound }, 404);
  const o = order as {
    customerId?: unknown;
    status?: string;
    deliveryOtp?: string | null;
    estimatedDeliveryTime?: number | null;
    driverId?: { liveLocation?: { coordinates?: number[] } } | null;
  };
  if (o.customerId?.toString?.() !== customerId && String(o.customerId) !== customerId) {
    throw new AppError({ en: 'Forbidden', de: 'Verboten' }, 403, 'FORBIDDEN');
  }
  if (['delivered', 'cancelled'].includes(o.status || '')) {
    return sendSuccess(res, {
      status: o.status,
      driverLocation: null,
      estimatedDelivery: o.estimatedDeliveryTime ?? null,
      deliveryOtp: o.deliveryOtp ?? null,
    });
  }

  const driver = o.driverId as { liveLocation?: { coordinates?: number[] } } | null;
  const coords = driver?.liveLocation?.coordinates;
  return sendSuccess(res, {
    status: o.status,
    driverLocation: coords && coords.length >= 2 ? { lat: coords[1], lng: coords[0] } : null,
    estimatedDelivery: o.estimatedDeliveryTime ?? null,
    deliveryOtp: o.deliveryOtp ?? null,
  });
});
