import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Order } from '../../models/Order';
import { Product } from '../../models/Product';
import { Vendor } from '../../models/Vendor';
import { Driver } from '../../models/Driver';
import { AppError } from '../../utils/AppError';
import { sendSuccess } from '../../utils/response';
import { asyncHandler } from '../../utils/asyncHandler';
import { parsePagination } from '../../utils/pagination';
import { syncPreferredAddressFromOrderDelivery } from '../../services/customerPreferredAddress.service';
import { computeOrderFinancials } from '../../services/orderFinancials.service';
import { getPlatformCommissionRate } from '../../services/appSettings.service';
import type { Server as SocketIOServer } from 'socket.io';
import { CUSTOMER_CANCEL_WINDOW_MS } from '../../constants/customerCancel';
import { customerCancelRemainingSeconds } from '../../services/vendorOrderNotify.service';

const ACTIVE_STATUSES = ['pending', 'vendor_notified', 'placed', 'accepted', 'confirmed', 'preparing', 'picked_up', 'on_the_way'] as const;

function getIo(req: Request): SocketIOServer | undefined {
  return (req.app as { get?(key: string): unknown }).get?.('io') as SocketIOServer | undefined;
}

/** POST / — Place order: validate vendor, items (Product), deliveryAddress, paymentMethod; recalc subtotal/deliveryFee; emit order:new */
export const placeOrder = asyncHandler(async (req: Request, res: Response) => {
  const customerId = req.user?._id;
  if (!customerId) throw new AppError({ en: 'Unauthorized', de: 'Nicht autorisiert' }, 401, 'UNAUTHORIZED');

  const body = req.body ?? {};
  const vendorId = body.vendorId;
  const items = body.items;
  const deliveryAddress = body.deliveryAddress;
  const paymentMethod = body.paymentMethod ?? 'wifipay';
  const deliveryInstructions = body.deliveryInstructions ?? '';
  const vendorNoteInput = body.Note ?? body.note;
  const vendorNote = vendorNoteInput != null ? String(vendorNoteInput).trim().slice(0, 500) : null;

  if (!vendorId || !mongoose.Types.ObjectId.isValid(vendorId)) {
    throw new AppError({ en: 'Valid vendorId is required', de: 'Vendor erforderlich' }, 400, 'VALIDATION_ERROR');
  }
  if (!items || !Array.isArray(items) || items.length === 0) {
    throw new AppError({ en: 'At least one item is required', de: 'Mindestens ein Artikel erforderlich' }, 400, 'VALIDATION_ERROR');
  }
  if (!deliveryAddress || typeof deliveryAddress !== 'object') {
    throw new AppError({ en: 'deliveryAddress is required', de: 'Lieferadresse erforderlich' }, 400, 'VALIDATION_ERROR');
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
  };
  const street = addr.street ?? '';
  if (!street || !addr.city || !addr.country) {
    throw new AppError({ en: 'deliveryAddress must have street, city, country', de: 'Adresse: Straße, Stadt, Land erforderlich' }, 400, 'VALIDATION_ERROR');
  }

  const vendorIdObj = new mongoose.Types.ObjectId(vendorId);
  const vendor = await Vendor.findById(vendorIdObj).lean();
  if (!vendor) {
    throw new AppError({ en: 'Vendor not found', de: 'Anbieter nicht gefunden' }, 404, 'NOT_FOUND');
  }
  const v = vendor as { status?: string; isOpen?: boolean; minimumOrder?: number; deliveryFee?: number };
  if (v.status !== 'active') {
    throw new AppError({ en: 'Vendor not found or not active', de: 'Anbieter nicht verfügbar' }, 404, 'NOT_FOUND');
  }
  if ((v as { isOnline?: boolean }).isOnline !== true) {
    throw new AppError({ en: 'Vendor is currently offline', de: 'Anbieter ist offline' }, 400, 'VENDOR_OFFLINE');
  }
  if (v.isOpen === false) {
    throw new AppError({ en: 'Vendor is currently closed', de: 'Anbieter ist geschlossen' }, 400, 'VENDOR_CLOSED');
  }

  const productIds = items.map((i: { productId?: string }) => i?.productId).filter(Boolean);
  const products = await Product.find({
    _id: { $in: productIds },
    vendor: vendorIdObj,
    isAvailable: true,
    isDeleted: false,
  }).lean();
  const productMap = new Map(products.map((p: { _id: mongoose.Types.ObjectId }) => [p._id.toString(), p] as const));

  const orderItems: Array<{ name: string; qty: number; unitPrice: number; image: string | null; subtotal: number; itemId: string | null }> = [];
  for (const item of items as Array<{ productId?: string; qty?: number; addons?: unknown[] }>) {
    const pid = item?.productId ? String(item.productId) : null;
    const qty = Math.max(1, Math.floor(Number(item?.qty) || 0));
    const product = pid ? productMap.get(pid) : null;
    if (!product) {
      throw new AppError(
        { en: `Product not found or unavailable: ${pid || 'missing productId'}`, de: 'Produkt nicht verfügbar' },
        422,
        'VALIDATION_ERROR'
      );
    }
    const p = product as { _id: mongoose.Types.ObjectId; name: string; price: number; image?: string | null };
    const unitPrice = p.price;
    const subtotal = unitPrice * qty;
    orderItems.push({
      name: p.name,
      qty,
      unitPrice,
      image: p.image ?? null,
      subtotal,
      itemId: p._id.toString(),
    });
  }

  const subtotal = orderItems.reduce((s, i) => s + i.subtotal, 0);
  const deliveryFee = (v.deliveryFee != null ? Number(v.deliveryFee) : 0) || 0;
  const discount = 0;
  const totalAmount = subtotal + deliveryFee - discount;
  const platformCommissionRate = await getPlatformCommissionRate();
  const financials = computeOrderFinancials({
    subtotal,
    deliveryFee,
    discount,
    total: totalAmount,
    platformCommissionRate,
  });

  const minimumOrder = v.minimumOrder != null ? Number(v.minimumOrder) : 0;
  if (minimumOrder > 0 && totalAmount < minimumOrder) {
    throw new AppError(
      { en: `Minimum order amount is ${minimumOrder}`, de: `Mindestbestellwert ist ${minimumOrder}` },
      400,
      'MINIMUM_ORDER'
    );
  }

  const deliveryOtp = Math.floor(1000 + Math.random() * 9000).toString();

  const order = await Order.create({
    customerId: new mongoose.Types.ObjectId(customerId),
    vendorId: vendorIdObj,
    items: orderItems,
    subtotal,
    deliveryFee,
    discount,
    total: totalAmount,
    grossAmount: financials.grossAmount,
    platformCommission: financials.platformCommission,
    wifipayFee: financials.wifipayFee,
    vendorShare: financials.vendorShare,
    driverShare: financials.driverShare,
    status: 'pending',
    statusHistory: [{ status: 'pending', timestamp: new Date(), changedByModel: 'User' }],
    customerCancelDeadline: new Date(Date.now() + CUSTOMER_CANCEL_WINDOW_MS),
    vendorNotifiedAt: null,
    paymentMethod: paymentMethod === 'online' || paymentMethod === 'cash' || paymentMethod === 'wallet' ? 'wifipay' : 'wifipay',
    paymentStatus: 'pending',
    deliveryAddress: {
      street,
      city: addr.city,
      country: addr.country,
      lat: addr.lat ?? null,
      lng: addr.lng ?? null,
      contactName: addr.contactName ?? null,
      contactPhone: addr.contactPhone ?? null,
    },
    notes: deliveryInstructions || null,
    vendorNote,
    deliveryOtp,
  });

  await syncPreferredAddressFromOrderDelivery(String(customerId), addr);

  const customerCancelDeadline = (order as { customerCancelDeadline?: Date }).customerCancelDeadline;
  const cancelRemainingSeconds = customerCancelRemainingSeconds(customerCancelDeadline);
  const io = getIo(req);
  if (io) {
    io.to('admin').emit('order:placed', {
      orderId: order._id,
      orderNumber: order.orderNumber,
      vendorId: vendorId.toString(),
      customerId: String(customerId),
      totalAmount: order.total,
      paymentMethod: order.paymentMethod,
      status: 'pending',
      customerCancelDeadline: customerCancelDeadline?.toISOString(),
      cancelRemainingSeconds,
    });
    io.to(`customer:${customerId}`).emit('order:placed', {
      orderId: order._id,
      orderNumber: order.orderNumber,
      status: 'placed',
      customerCancelDeadline: customerCancelDeadline?.toISOString(),
      cancelRemainingSeconds,
    });
    io.to(`customer:${customerId}`).emit('order:status_updated', {
      orderId: order._id,
      status: 'placed',
      message: 'Your order has been placed. You can cancel within 30 seconds.',
      customerCancelDeadline: customerCancelDeadline?.toISOString(),
      cancelRemainingSeconds,
    });
  }

  return sendSuccess(
    res,
    {
      _id: order._id,
      orderNumber: order.orderNumber,
      status: order.status,
      totalAmount: order.total,
      deliveryOtp: order.deliveryOtp,
      customerCancelDeadline: customerCancelDeadline?.toISOString(),
      cancelRemainingSeconds,
    },
    200
  );
});

/** GET / — Order history: filter by status (active | delivered | cancelled), paginate, populate vendor and items */
export const getOrders = asyncHandler(async (req: Request, res: Response) => {
  const customerId = req.user?._id;
  if (!customerId) throw new AppError({ en: 'Unauthorized', de: 'Nicht autorisiert' }, 401, 'UNAUTHORIZED');

  const { page, limit } = parsePagination(req.query, 10);
  const statusQ = String(req.query.status || '').trim();

  const filter: Record<string, unknown> = { customerId: new mongoose.Types.ObjectId(customerId) };
  if (statusQ === 'active') {
    filter.status = { $in: ACTIVE_STATUSES };
  } else if (statusQ === 'delivered') {
    filter.status = 'delivered';
  } else if (statusQ === 'cancelled') {
    filter.status = 'cancelled';
  }

  const [orders, total] = await Promise.all([
    Order.find(filter)
      .populate('vendorId', '_id name logo')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Order.countDocuments(filter),
  ]);

  const pages = Math.ceil(total / limit) || 1;
  return sendSuccess(res, { orders, total, page, pages });
});

/** GET /:id — Order detail; 403 if not own order; populate vendor, driver, items */
export const getOrderById = asyncHandler(async (req: Request, res: Response) => {
  const customerId = req.user?._id;
  const id = req.params.id;
  if (!customerId) throw new AppError({ en: 'Unauthorized', de: 'Nicht autorisiert' }, 401, 'UNAUTHORIZED');
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError({ en: 'Order not found', de: 'Bestellung nicht gefunden' }, 404, 'NOT_FOUND');
  }

  const order = await Order.findById(id)
    .populate('vendorId', '_id name logo address')
    .populate('driverId', '_id name phone profileImage')
    .lean();
  if (!order) {
    throw new AppError({ en: 'Order not found', de: 'Bestellung nicht gefunden' }, 404, 'NOT_FOUND');
  }
  const o = order as { customerId?: unknown };
  if (String(o.customerId) !== customerId) {
    throw new AppError({ en: 'Forbidden', de: 'Verboten' }, 403, 'FORBIDDEN');
  }
  return sendSuccess(res, order);
});

/** POST /:id/cancel — Customer may cancel only within 30s grace (pending, vendor not yet notified) */
export const cancelOrder = asyncHandler(async (req: Request, res: Response) => {
  const customerId = req.user?._id;
  const id = req.params.id;
  const reason = typeof (req.body ?? {}).reason === 'string' ? String((req.body ?? {}).reason) : 'Cancelled by customer';
  if (!customerId) throw new AppError({ en: 'Unauthorized', de: 'Nicht autorisiert' }, 401, 'UNAUTHORIZED');
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError({ en: 'Order not found', de: 'Bestellung nicht gefunden' }, 404, 'NOT_FOUND');
  }

  const customerIdObj = new mongoose.Types.ObjectId(customerId);
  const now = new Date();
  const cancelHistory = {
    status: 'cancelled',
    timestamp: now,
    note: reason,
    changedByModel: 'User' as const,
  };

  type CancelledOrder = {
    _id: mongoose.Types.ObjectId;
    orderNumber?: string | null;
    customerId?: mongoose.Types.ObjectId | string;
    total?: number;
    paymentMethod?: string | null;
    paymentStatus?: string | null;
    wifipayRef?: string | null;
    status: string;
  };

  const order = (await Order.findOneAndUpdate(
    {
      _id: id,
      customerId: customerIdObj,
      status: 'pending',
      vendorNotifiedAt: null,
      customerCancelDeadline: { $gt: now },
    },
    {
      $set: { status: 'cancelled', cancelledBy: 'customer', cancellationReason: reason },
      $push: { statusHistory: cancelHistory },
    },
    { new: true }
  ).lean()) as unknown as CancelledOrder | null;

  if (!order) {
    const existing = await Order.findOne({ _id: id, customerId: customerIdObj })
      .select('status customerCancelDeadline vendorNotifiedAt')
      .lean();
    if (!existing) {
      throw new AppError({ en: 'Order not found', de: 'Bestellung nicht gefunden' }, 404, 'NOT_FOUND');
    }
    const graceExpired =
      existing.status === 'pending' &&
      !(existing as { vendorNotifiedAt?: Date | null }).vendorNotifiedAt &&
      (existing as { customerCancelDeadline?: Date | null }).customerCancelDeadline &&
      new Date((existing as { customerCancelDeadline: Date }).customerCancelDeadline).getTime() <= now.getTime();
    if (graceExpired) {
      throw new AppError(
        { en: 'Cancel window has expired; order is being sent to the vendor', de: 'Stornierungsfenster abgelaufen; Bestellung wird an den Anbieter gesendet' },
        400,
        'CANCEL_WINDOW_EXPIRED'
      );
    }
    throw new AppError(
      { en: 'Order can only be cancelled within 30 seconds of placement, before it is sent to the vendor', de: 'Stornierung nur innerhalb von 30 Sekunden und vor Benachrichtigung des Anbieters möglich' },
      400,
      'INVALID_STATUS'
    );
  }

  const io = getIo(req);

  /* WIFIPAY_CUSTOMER_CANCEL_REFUND_START
  // Uncomment when WifiPay online payment is live (see orderCart.controller placeOrder WIFIPAY block).
  // import { initiateRefund } from '../../services/refundService';
  try {
    await initiateRefund(
      {
        _id: order._id,
        orderNumber: order.orderNumber ?? null,
        customerId: customerIdObj,
        paymentMethod: order.paymentMethod ?? null,
        paymentStatus: order.paymentStatus ?? null,
        total: order.total ?? 0,
        wifipayRef: order.wifipayRef ?? null,
      },
      reason,
      io
    );
  } catch {
    // Do not fail customer cancel if refund side effects fail.
  }
  WIFIPAY_CUSTOMER_CANCEL_REFUND_END */

  if (io) {
    const payload = { orderId: order._id, orderNumber: order.orderNumber, status: 'cancelled' };
    io.to('admin').emit('order:cancelled', payload);
    io.to(`customer:${customerId}`).emit('order:status_updated', {
      orderId: order._id,
      status: 'cancelled',
      message: 'Your order has been cancelled.',
    });
  }

  return sendSuccess(res, { _id: order._id, orderNumber: order.orderNumber, status: order.status });
});

/** POST /:id/rate — Rate delivered order: food (1-5), delivery (1-5 optional), comment (max 500); recalc Vendor/Driver rating */
export const rateOrder = asyncHandler(async (req: Request, res: Response) => {
  const customerId = req.user?._id;
  const id = req.params.id;
  const body = req.body ?? {};
  const food = body.food != null ? Number(body.food) : NaN;
  const delivery = body.delivery != null ? Number(body.delivery) : NaN;
  const comment = body.comment != null ? String(body.comment).trim().slice(0, 500) : '';
  if (!customerId) throw new AppError({ en: 'Unauthorized', de: 'Nicht autorisiert' }, 401, 'UNAUTHORIZED');
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError({ en: 'Order not found', de: 'Bestellung nicht gefunden' }, 404, 'NOT_FOUND');
  }
  if (Number.isNaN(food) || food < 1 || food > 5) {
    throw new AppError({ en: 'food rating is required and must be 1-5', de: 'Bewertung Essen 1-5 erforderlich' }, 400, 'VALIDATION_ERROR');
  }
  if (!Number.isNaN(delivery) && (delivery < 1 || delivery > 5)) {
    throw new AppError({ en: 'delivery rating must be 1-5', de: 'Bewertung Lieferung 1-5' }, 400, 'VALIDATION_ERROR');
  }

  const order = await Order.findOne({ _id: id, customerId: new mongoose.Types.ObjectId(customerId) });
  if (!order) {
    throw new AppError({ en: 'Order not found', de: 'Bestellung nicht gefunden' }, 404, 'NOT_FOUND');
  }
  if (order.status !== 'delivered') {
    throw new AppError({ en: 'Can only rate delivered orders', de: 'Nur gelieferte Bestellungen bewertbar' }, 400, 'INVALID_STATUS');
  }
  if (order.foodRating != null) {
    throw new AppError({ en: 'Order already rated', de: 'Bereits bewertet' }, 400, 'ALREADY_RATED');
  }

  order.foodRating = food;
  if (!Number.isNaN(delivery)) order.deliveryRating = delivery;
  order.customerRatingComment = comment || null;
  await order.save();

  const vendorId = order.vendorId;
  if (vendorId && Vendor.schema.paths.rating) {
    const agg = await Order.aggregate<{ avgFood: number }>([
      { $match: { vendorId: new mongoose.Types.ObjectId(vendorId), foodRating: { $ne: null } } },
      { $group: { _id: null, avgFood: { $avg: '$foodRating' } } },
    ]);
    const avgFood = agg[0]?.avgFood ?? food;
    await Vendor.findByIdAndUpdate(vendorId, { rating: Math.round(avgFood * 10) / 10 });
  }

  if (order.driverId && !Number.isNaN(delivery)) {
    const driverAgg = await Order.aggregate<{ avgDelivery: number }>([
      { $match: { driverId: order.driverId, deliveryRating: { $ne: null } } },
      { $group: { _id: null, avgDelivery: { $avg: '$deliveryRating' } } },
    ]);
    const avgDelivery = driverAgg[0]?.avgDelivery ?? delivery;
    await Driver.findByIdAndUpdate(order.driverId, { rating: Math.round(avgDelivery * 10) / 10 });
  }

  return sendSuccess(res, {
    _id: order._id,
    orderNumber: order.orderNumber,
    rating: { food: order.foodRating, delivery: order.deliveryRating ?? undefined, comment: order.customerRatingComment ?? undefined },
  });
});
