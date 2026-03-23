import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Cart } from '../../models/Cart';
import { Order } from '../../models/Order';
import { Product } from '../../models/Product';
import { Vendor } from '../../models/Vendor';
import { Driver } from '../../models/Driver';
import { User } from '../../models/User';
import { getNextOrderNumber } from '../../models/Counters';
import { AppError } from '../../utils/AppError';
import { sendSuccess } from '../../utils/response';
import { asyncHandler } from '../../utils/asyncHandler';
import { parsePagination } from '../../utils/pagination';
import type { Server as SocketIOServer } from 'socket.io';

const DELIVERY_FEE = 2.0;
const ACTIVE_STATUSES = ['pending', 'accepted', 'preparing', 'picked_up', 'on_the_way'] as const;

function getIo(req: Request): SocketIOServer | undefined {
  return (req.app as { get?(key: string): unknown }).get?.('io') as SocketIOServer | undefined;
}

/** POST / — Place order from cart: load cart, validate vendor + products, create order, update customer, delete cart, emit */
export const placeOrder = asyncHandler(async (req: Request, res: Response) => {
  const customerId = req.user?._id;
  if (!customerId) throw new AppError({ en: 'Unauthorized', de: 'Nicht autorisiert' }, 401, 'UNAUTHORIZED');

  const body = req.body ?? {};
  const deliveryAddress = body.deliveryAddress;
  const usePoints = Math.max(0, Math.floor(Number(body.usePoints) || 0));

  if (!deliveryAddress || typeof deliveryAddress !== 'object') {
    throw new AppError({ en: 'deliveryAddress is required', de: 'Lieferadresse erforderlich' }, 400, 'VALIDATION_ERROR');
  }
  const addr = deliveryAddress as { street?: string; addressLine1?: string; city?: string; country?: string; lat?: number; lng?: number; contactName?: string; contactPhone?: string };
  const street = addr.street ?? (addr.addressLine1 ?? '');
  if (!street || !addr.city || !addr.country) {
    throw new AppError({ en: 'deliveryAddress must have street, city, country', de: 'Adresse erforderlich' }, 400, 'VALIDATION_ERROR');
  }

  const customerIdObj = new mongoose.Types.ObjectId(customerId);
  const cart = await Cart.findOne({ customer: customerIdObj }).populate('items.product').lean();
  if (!cart || !(cart as { items?: unknown[] }).items?.length) {
    throw new AppError({ en: 'Cart is empty', de: 'Warenkorb ist leer' }, 404, 'NOT_FOUND');
  }

  const vendorId = (cart as { vendor: mongoose.Types.ObjectId }).vendor;
  const vendor = await Vendor.findById(vendorId).lean();
  if (!vendor || (vendor as { status?: string }).status !== 'active') {
    throw new AppError({ en: 'Vendor not found or not active', de: 'Anbieter nicht verfügbar' }, 400, 'VALIDATION_ERROR');
  }
  const v = vendor as { isOpen?: boolean; minimumOrder?: number };
  if (v.isOpen === false) {
    throw new AppError({ en: 'Vendor is currently closed', de: 'Anbieter ist geschlossen' }, 400, 'VENDOR_CLOSED');
  }

  const items = (cart as { items: Array<{ product: { _id: mongoose.Types.ObjectId; name: string; price: number; image?: string | null; isAvailable?: boolean }; name: string; price: number; qty: number; image: string | null }> }).items;
  const productIds = items.map((i) => i.product?._id ?? i.product).filter(Boolean);
  const products = await Product.find({
    _id: { $in: productIds },
    vendor: vendorId,
    isDeleted: false,
  }).lean();
  const productMap = new Map(products.map((p: { _id: mongoose.Types.ObjectId }) => [p._id.toString(), p] as const));

  for (const item of items) {
    const pid = (item.product as { _id?: mongoose.Types.ObjectId })?._id?.toString() ?? (item.product as unknown as mongoose.Types.ObjectId).toString();
    const product = productMap.get(pid);
    if (!product) {
      throw new AppError({ en: 'A cart item is no longer available', de: 'Ein Artikel ist nicht mehr verfügbar' }, 422, 'VALIDATION_ERROR');
    }
    if ((product as { isAvailable?: boolean }).isAvailable === false) {
      throw new AppError({ en: `Product not available: ${(product as { name?: string }).name}`, de: 'Produkt nicht verfügbar' }, 422, 'VALIDATION_ERROR');
    }
  }

  const subtotal = (cart as { subtotal: number }).subtotal;
  const deliveryFee = DELIVERY_FEE;
  const user = await User.findById(customerIdObj).select('points').lean();
  const pointsAvailable = (user as { points?: number })?.points ?? 0;
  const discountFromPoints = Math.min(usePoints, pointsAvailable, Math.floor(subtotal * 0.1));
  const discount = discountFromPoints;
  const totalAmount = Math.max(0, subtotal + deliveryFee - discount);

  const minimumOrder = v.minimumOrder != null ? Number(v.minimumOrder) : 0;
  if (minimumOrder > 0 && totalAmount < minimumOrder) {
    throw new AppError({ en: `Minimum order is ${minimumOrder}`, de: `Mindestbestellwert ${minimumOrder}` }, 400, 'MINIMUM_ORDER');
  }

  const orderNumber = await getNextOrderNumber();
  const deliveryOtp = Math.floor(1000 + Math.random() * 9000).toString();

  const orderItems = items.map((i) => {
    const price = i.price;
    const qty = i.qty;
    return {
      name: i.name,
      qty,
      unitPrice: price,
      image: i.image ?? null,
      subtotal: price * qty,
      itemId: (i.product as { _id?: mongoose.Types.ObjectId })?._id?.toString() ?? (i.product as unknown as mongoose.Types.ObjectId).toString(),
    };
  });

  const order = await Order.create({
    orderNumber,
    customerId: customerIdObj,
    vendorId,
    items: orderItems,
    subtotal,
    deliveryFee,
    discount,
    total: totalAmount,
    status: 'pending',
    statusHistory: [{ status: 'pending', timestamp: new Date(), changedByModel: 'User' }],
    paymentStatus: 'pending',
    paymentMethod: 'wifipay',
    deliveryAddress: {
      street,
      city: addr.city,
      country: addr.country,
      lat: addr.lat ?? null,
      lng: addr.lng ?? null,
      contactName: addr.contactName ?? null,
      contactPhone: addr.contactPhone ?? null,
    },
    notes: (body.deliveryInstructions as string) ?? null,
    deliveryOtp,
  });

  await User.findByIdAndUpdate(customerIdObj, {
    $inc: { totalOrders: 1, points: -discount },
    ...(discount > 0 && User.schema.paths.pointsHistory
      ? { $push: { pointsHistory: { amount: -discount, reason: 'Order discount', reference: order._id.toString(), createdAt: new Date() } } }
      : {}),
  });

  await Cart.deleteOne({ customer: customerIdObj });

  const io = getIo(req);
  if (io) {
    io.to('admin').emit('order:new', { orderId: order._id, orderNumber, vendorId, customerId, totalAmount: order.total, paymentMethod: order.paymentMethod });
    io.to(`vendor:${vendorId}`).emit('order:new', { orderId: order._id, orderNumber, vendorId, customerId, totalAmount: order.total, paymentMethod: order.paymentMethod });
  }

  return sendSuccess(
    res,
    { _id: order._id, orderNumber, status: order.status, totalAmount: order.total, deliveryOtp },
    201
  );
});

/** GET / — Paginated order history; status filter: active | delivered | cancelled */
export const getOrders = asyncHandler(async (req: Request, res: Response) => {
  const customerId = req.user?._id;
  if (!customerId) throw new AppError({ en: 'Unauthorized', de: 'Nicht autorisiert' }, 401, 'UNAUTHORIZED');

  const { page, limit } = parsePagination(req.query, 10);
  const statusQ = String(req.query.status || '').trim();
  const filter: Record<string, unknown> = { customerId: new mongoose.Types.ObjectId(customerId) };
  if (statusQ === 'active') filter.status = { $in: ACTIVE_STATUSES };
  else if (statusQ === 'delivered') filter.status = 'delivered';
  else if (statusQ === 'cancelled') filter.status = 'cancelled';

  const [orders, total] = await Promise.all([
    Order.find(filter).populate('vendorId', 'name logo').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Order.countDocuments(filter),
  ]);
  const pages = Math.ceil(total / limit) || 1;
  return sendSuccess(res, { orders, total, page, pages });
});

/** GET /:id — Single order; populate vendor (name, logo, phone, address), driver (name, phone, profileImage, vehicleType, liveLocation); strip deliveryOtp unless picked_up|on_the_way */
export const getOrder = asyncHandler(async (req: Request, res: Response) => {
  const customerId = req.user?._id;
  const id = req.params.id;
  if (!customerId) throw new AppError({ en: 'Unauthorized', de: 'Nicht autorisiert' }, 401, 'UNAUTHORIZED');
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError({ en: 'Order not found', de: 'Bestellung nicht gefunden' }, 404, 'NOT_FOUND');
  }

  const order = await Order.findById(id)
    .populate('vendorId', 'name logo phone address')
    .populate('driverId', 'name phone profileImage vehicleType liveLocation')
    .lean();
  if (!order) throw new AppError({ en: 'Order not found', de: 'Bestellung nicht gefunden' }, 404, 'NOT_FOUND');
  const o = order as { customerId?: unknown; status?: string; deliveryOtp?: string | null };
  if (String(o.customerId) !== customerId) {
    throw new AppError({ en: 'Forbidden', de: 'Verboten' }, 403, 'FORBIDDEN');
  }
  const out = { ...order } as Record<string, unknown>;
  if (o.status !== 'picked_up' && o.status !== 'on_the_way') {
    delete out.deliveryOtp;
  }
  if (out.driverId && typeof out.driverId === 'object' && out.driverId !== null) {
    const d = out.driverId as { liveLocation?: unknown };
    (out.driverId as Record<string, unknown>).currentLocation = d.liveLocation ?? null;
  }
  return sendSuccess(res, out);
});

/** POST /:id/cancel — Cancel order (pending|accepted only); restore points if discount > 0 */
export const cancelOrder = asyncHandler(async (req: Request, res: Response) => {
  const customerId = req.user?._id;
  const id = req.params.id;
  const reason = (req.body ?? {}).reason ?? 'Cancelled by customer';
  if (!customerId) throw new AppError({ en: 'Unauthorized', de: 'Nicht autorisiert' }, 401, 'UNAUTHORIZED');
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError({ en: 'Order not found', de: 'Bestellung nicht gefunden' }, 404, 'NOT_FOUND');
  }

  const order = await Order.findOne({ _id: id, customerId: new mongoose.Types.ObjectId(customerId) });
  if (!order) throw new AppError({ en: 'Order not found', de: 'Bestellung nicht gefunden' }, 404, 'NOT_FOUND');
  if (order.status !== 'pending' && order.status !== 'accepted') {
    throw new AppError({ en: 'Order can only be cancelled when pending or accepted', de: 'Nur ausstehende Bestellungen stornierbar' }, 400, 'INVALID_STATUS');
  }

  const discount = order.discount ?? 0;
  if (discount > 0 && User.schema.paths.points) {
    await User.findByIdAndUpdate(customerId, { $inc: { points: discount } });
  }

  order.status = 'cancelled';
  order.cancelledBy = 'customer';
  order.cancellationReason = typeof reason === 'string' ? reason : 'Cancelled by customer';
  const history = (order as { statusHistory?: Array<{ status: string; timestamp: Date; note?: string; changedByModel?: string }> }).statusHistory ?? [];
  history.push({ status: 'cancelled', timestamp: new Date(), note: order.cancellationReason ?? undefined, changedByModel: 'User' });
  (order as { statusHistory: typeof history }).statusHistory = history;
  await order.save();

  const io = getIo(req);
  if (io) {
    io.to('admin').emit('order:cancelled', { orderId: order._id, orderNumber: order.orderNumber, status: 'cancelled' });
    io.to(`vendor:${order.vendorId}`).emit('order:cancelled', { orderId: order._id, orderNumber: order.orderNumber, status: 'cancelled' });
  }

  return sendSuccess(res, { _id: order._id, orderNumber: order.orderNumber, status: order.status });
});

/** POST /:id/rate — Rate delivered order; recalc vendor.rating from order.rating.food */
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
    throw new AppError({ en: 'food rating 1-5 required', de: 'Bewertung Essen 1-5' }, 400, 'VALIDATION_ERROR');
  }
  if (!Number.isNaN(delivery) && (delivery < 1 || delivery > 5)) {
    throw new AppError({ en: 'delivery rating must be 1-5', de: 'Bewertung Lieferung 1-5' }, 400, 'VALIDATION_ERROR');
  }

  const order = await Order.findOne({ _id: id, customerId: new mongoose.Types.ObjectId(customerId) });
  if (!order) throw new AppError({ en: 'Order not found', de: 'Bestellung nicht gefunden' }, 404, 'NOT_FOUND');
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

/** GET /:id/track — status, statusHistory, estimatedDelivery, driver { name, phone, currentLocation }; strip deliveryOtp unless picked_up|on_the_way */
export const trackOrder = asyncHandler(async (req: Request, res: Response) => {
  const customerId = req.user?._id;
  const id = req.params.id;
  if (!customerId) throw new AppError({ en: 'Unauthorized', de: 'Nicht autorisiert' }, 401, 'UNAUTHORIZED');
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError({ en: 'Order not found', de: 'Bestellung nicht gefunden' }, 404, 'NOT_FOUND');
  }

  const order = await Order.findById(id)
    .select('customerId status statusHistory estimatedDeliveryTime deliveryOtp driverId')
    .populate('driverId', 'name phone liveLocation')
    .lean();
  if (!order) throw new AppError({ en: 'Order not found', de: 'Bestellung nicht gefunden' }, 404, 'NOT_FOUND');
  const o = order as { customerId?: unknown; status?: string; statusHistory?: unknown[]; estimatedDeliveryTime?: number | null; deliveryOtp?: string | null; driverId?: { name?: string; phone?: string; liveLocation?: { coordinates?: number[] } } | null };
  if (String(o.customerId) !== customerId) {
    throw new AppError({ en: 'Forbidden', de: 'Verboten' }, 403, 'FORBIDDEN');
  }

  const driver = o.driverId;
  const coords = driver?.liveLocation?.coordinates;
  const currentLocation = coords && coords.length >= 2 ? { lat: coords[1], lng: coords[0] } : null;
  const out: Record<string, unknown> = {
    status: o.status,
    statusHistory: o.statusHistory ?? [],
    estimatedDelivery: o.estimatedDeliveryTime ?? null,
    driver: driver ? { name: driver.name, phone: driver.phone, currentLocation } : null,
  };
  if (o.status === 'picked_up' || o.status === 'on_the_way') {
    out.deliveryOtp = o.deliveryOtp ?? null;
  }
  return sendSuccess(res, out);
});
