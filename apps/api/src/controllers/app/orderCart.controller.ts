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
import { mapOrderStatusForCustomer, toCustomerOrderStatus } from '../../utils/customerOrderStatus';
import { syncPreferredAddressFromOrderDelivery } from '../../services/customerPreferredAddress.service';
import { initiatePayment } from '../../services/wifipay.service';
import { sendPushToVendor } from '../../services/fcm.service';
import { VENDOR_RESPONSE_WINDOW_MS } from '../../constants/vendorResponse';
import type { Server as SocketIOServer } from 'socket.io';

const DELIVERY_FEE = 2.0;
const MAX_ORDER_RADIUS_KM = 30;
const ACTIVE_STATUSES = ['pending', 'accepted', 'preparing', 'picked_up', 'on_the_way'] as const;

function getCurrentDayKey(now: Date): 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun' {
  const days: Array<'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat'> = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  return days[now.getDay()];
}

function toMinutes(hhmm: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isInteger(hh) || !Number.isInteger(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

function resolveVendorTimezone(vendor: any): string {
  const tz = String(vendor?.timezone || '').trim() || 'Asia/Kolkata';
  try {
    Intl.DateTimeFormat('en-US', { timeZone: tz }).format(new Date());
    return tz;
  } catch {
    return 'UTC';
  }
}

function getVendorLocalNow(
  nowUtc: Date,
  timezone: string
): { dayKey: 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'; nowMin: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(nowUtc);
  const weekday = parts.find((p) => p.type === 'weekday')?.value?.toLowerCase() ?? 'sun';
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  const map: Record<string, 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'> = {
    mon: 'mon',
    tue: 'tue',
    wed: 'wed',
    thu: 'thu',
    fri: 'fri',
    sat: 'sat',
    sun: 'sun',
  };
  const dayKey = map[weekday.slice(0, 3)] ?? 'sun';
  const nowMin = (Number.isFinite(hour) ? hour : 0) * 60 + (Number.isFinite(minute) ? minute : 0);
  return { dayKey, nowMin };
}

function isVendorAvailableNow(vendor: any, now: Date): boolean {
  // 1) Global availability check
  if (vendor?.isOpen !== true) return false;

  // 2) Operating-hours toggle check for today
  const timezone = resolveVendorTimezone(vendor);
  const { dayKey, nowMin } = getVendorLocalNow(now, timezone);
  const todays = Array.isArray(vendor?.operatingHours)
    ? vendor.operatingHours.find((x: any) => x?.day === dayKey)
    : null;
  if (!todays || todays?.isOpen !== true) return false;

  // 3) Current time within operating window
  const fromMin = toMinutes(String(todays?.from ?? ''));
  const toMin = toMinutes(String(todays?.to ?? ''));
  if (fromMin == null || toMin == null) return false;

  if (fromMin <= toMin) return nowMin >= fromMin && nowMin <= toMin;
  return nowMin >= fromMin || nowMin <= toMin;
}

function getIo(req: Request): SocketIOServer | undefined {
  return (req.app as { get?(key: string): unknown }).get?.('io') as SocketIOServer | undefined;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toDisplayOrderId(order: { orderNumber?: string | number | null; _id?: unknown }): string {
  const rawNumber = order.orderNumber != null ? String(order.orderNumber) : '';
  const compact = rawNumber.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (compact.length >= 6) return `#RDY-${compact.slice(-6)}`;
  const idSuffix = String(order._id ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(-6);
  return `#RDY-${(compact + idSuffix).slice(-6).padStart(6, '0')}`;
}

/** POST / — Place order from cart: load cart, validate vendor + products, create order, update customer, delete cart, emit */
export const placeOrder = asyncHandler(async (req: Request, res: Response) => {
  // TODO: To activate WifiPay online payment:
  //   1. Set WifiPay credentials in env.
  //   2. Remove the temporary 503 guard below.
  //   3. Uncomment the WIFIPAY_START/WIFIPAY_END block in this function.
  //   4. Keep "payment success before order create" behavior for online payments.
  const customerId = req.user?._id;
  if (!customerId) throw new AppError({ en: 'Unauthorized', de: 'Nicht autorisiert' }, 401, 'UNAUTHORIZED');

  const body = req.body ?? {};
  const paymentMethod = body.paymentMethod != null ? String(body.paymentMethod).trim().toLowerCase() : 'cash';
  const paymentPhone = body.paymentPhone != null ? String(body.paymentPhone).trim() : '';
  if (paymentMethod === 'online') {
    throw new AppError(
      { en: 'Online payment (WifiPay) is not yet available. Please use cash or wallet.', de: 'Online-Zahlung noch nicht verfügbar. Bitte Barzahlung oder Wallet verwenden.' },
      503,
      'PAYMENT_UNAVAILABLE'
    );
  }
  const deliveryAddressId = body.deliveryAddressId != null ? String(body.deliveryAddressId).trim() : '';
  const deliveryAddress = body.deliveryAddress;
  const usePoints = Math.max(0, Math.floor(Number(body.usePoints) || 0));

  const customerIdObj = new mongoose.Types.ObjectId(customerId);
  const customerForAddress = await User.findById(customerIdObj).select('addresses points');
  if (!customerForAddress) {
    throw new AppError({ en: 'Customer not found', de: 'Kunde nicht gefunden' }, 404, 'NOT_FOUND');
  }

  let addr: {
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

  if (deliveryAddressId) {
    if (!mongoose.Types.ObjectId.isValid(deliveryAddressId)) {
      throw new AppError({ en: 'Valid deliveryAddressId is required', de: 'Gültige deliveryAddressId erforderlich' }, 400, 'VALIDATION_ERROR');
    }
    const saved = customerForAddress.addresses?.id(deliveryAddressId) as
      | {
          _id?: mongoose.Types.ObjectId;
          addressLine1?: string;
          addressLine2?: string | null;
          city?: string;
          country?: string;
          lat?: number | null;
          lng?: number | null;
        }
      | undefined;
    if (!saved) {
      throw new AppError({ en: 'Saved delivery address not found', de: 'Gespeicherte Lieferadresse nicht gefunden' }, 404, 'NOT_FOUND');
    }
    addr = {
      _id: saved._id?.toString(),
      addressId: saved._id?.toString(),
      addressLine1: saved.addressLine1 ?? '',
      addressLine2: saved.addressLine2 ?? undefined,
      city: saved.city ?? '',
      country: saved.country ?? '',
      lat: saved.lat ?? undefined,
      lng: saved.lng ?? undefined,
    };
  } else {
    if (!deliveryAddress || typeof deliveryAddress !== 'object') {
      throw new AppError(
        { en: 'deliveryAddressId (preferred) or deliveryAddress object is required', de: 'deliveryAddressId oder deliveryAddress erforderlich' },
        400,
        'VALIDATION_ERROR'
      );
    }
    addr = deliveryAddress as {
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
  }

  const street = addr.street ?? [addr.addressLine1, addr.addressLine2].filter(Boolean).join(', ');
  if (!street || !addr.city || !addr.country) {
    throw new AppError({ en: 'deliveryAddress must have street, city, country', de: 'Adresse erforderlich' }, 400, 'VALIDATION_ERROR');
  }

  const cart = await Cart.findOne({ customer: customerIdObj }).populate('items.product').lean();
  if (!cart || !(cart as { items?: unknown[] }).items?.length) {
    throw new AppError({ en: 'Cart is empty', de: 'Warenkorb ist leer' }, 404, 'NOT_FOUND');
  }

  const vendorId = (cart as { vendor: mongoose.Types.ObjectId }).vendor;
  const vendor = await Vendor.findById(vendorId).lean();
  if (!vendor || (vendor as { status?: string }).status !== 'active') {
    throw new AppError({ en: 'Vendor not found or not active', de: 'Anbieter nicht verfügbar' }, 400, 'VALIDATION_ERROR');
  }
  const v = vendor as { isOpen?: boolean; minimumOrder?: number; operatingHours?: unknown[] };
  if (!isVendorAvailableNow(v, new Date())) {
    throw new AppError({ en: 'Vendor is currently closed', de: 'Anbieter ist geschlossen' }, 400, 'VENDOR_CLOSED');
  }

  const vendorLat = Number((vendor as { address?: { lat?: number | null } })?.address?.lat);
  const vendorLng = Number((vendor as { address?: { lng?: number | null } })?.address?.lng);
  const customerLat = Number(addr.lat);
  const customerLng = Number(addr.lng);
  if (!Number.isFinite(vendorLat) || !Number.isFinite(vendorLng) || !Number.isFinite(customerLat) || !Number.isFinite(customerLng)) {
    throw new AppError(
      {
        en: 'Vendor and delivery address must have valid latitude/longitude.',
        de: 'Anbieter und Lieferadresse benötigen gültige Breiten-/Längengrade.',
      },
      400,
      'VALIDATION_ERROR'
    );
  }

  const vendorToCustomerKm = haversineKm(vendorLat, vendorLng, customerLat, customerLng);
  if (vendorToCustomerKm > MAX_ORDER_RADIUS_KM) {
    throw new AppError(
      {
        en: `Delivery address is too far from vendor (${vendorToCustomerKm.toFixed(2)} km). Maximum allowed is ${MAX_ORDER_RADIUS_KM} km.`,
        de: `Lieferadresse ist zu weit vom Anbieter entfernt (${vendorToCustomerKm.toFixed(2)} km). Maximal erlaubt sind ${MAX_ORDER_RADIUS_KM} km.`,
      },
      400,
      'VALIDATION_ERROR'
    );
  }

  const items = (cart as {
    items: Array<{
      product: { _id: mongoose.Types.ObjectId; name: string; price: number; image?: string | null; isAvailable?: boolean };
      name: string;
      price: number;
      qty: number;
      image: string | null;
    }>;
  }).items;
  const productIds = items.map((i) => i.product?._id ?? i.product).filter(Boolean);
  const products = await Product.find({
    _id: { $in: productIds },
    vendor: vendorId,
    isDeleted: false,
  }).lean();
  const productMap = new Map(products.map((p: { _id: mongoose.Types.ObjectId }) => [p._id.toString(), p] as const));

  for (const item of items) {
    const pid =
      (item.product as { _id?: mongoose.Types.ObjectId })?._id?.toString() ??
      (item.product as unknown as mongoose.Types.ObjectId).toString();
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
  const pointsAvailable = (customerForAddress as { points?: number })?.points ?? 0;
  const discountFromPoints = Math.min(usePoints, pointsAvailable, Math.floor(subtotal * 0.1));
  const discount = discountFromPoints;
  const totalAmount = Math.max(0, subtotal + deliveryFee - discount);

  const minimumOrder = v.minimumOrder != null ? Number(v.minimumOrder) : 0;
  if (minimumOrder > 0 && totalAmount < minimumOrder) {
    throw new AppError({ en: `Minimum order is ${minimumOrder}`, de: `Mindestbestellwert ${minimumOrder}` }, 400, 'MINIMUM_ORDER');
  }

  const orderNumber = await getNextOrderNumber();
  const deliveryOtp = Math.floor(1000 + Math.random() * 9000).toString();
  let paymentStatus: 'pending' | 'paid' = 'pending';
  let wifipayRef: string | null = null;

  const orderItems = items.map((i) => {
    const price = i.price;
    const qty = i.qty;
    return {
      name: i.name,
      qty,
      unitPrice: price,
      image: i.image ?? null,
      subtotal: price * qty,
      itemId:
        (i.product as { _id?: mongoose.Types.ObjectId })?._id?.toString() ??
        (i.product as unknown as mongoose.Types.ObjectId).toString(),
    };
  });

  /* WIFIPAY_START
  if (paymentMethod === 'online') {
    if (!paymentPhone) {
      throw new AppError(
        { en: 'paymentPhone is required for online payment', de: 'paymentPhone ist für Online-Zahlung erforderlich' },
        422,
        'VALIDATION_ERROR'
      );
    }

    let wifiPayResult;
    try {
      wifiPayResult = await initiatePayment({
        phone: paymentPhone,
        amount: totalAmount,
        currency: 'USD',
        orderId: String(orderNumber),
      });
    } catch {
      throw new AppError(
        { en: 'Payment failed. Please try again or use a different method.', de: 'Zahlung fehlgeschlagen. Bitte erneut versuchen.' },
        402,
        'PAYMENT_FAILED'
      );
    }

    if (!wifiPayResult?.reference) {
      throw new AppError(
        { en: 'Payment was declined by WifiPay.', de: 'Zahlung wurde von WifiPay abgelehnt.' },
        402,
        'PAYMENT_DECLINED'
      );
    }

    paymentStatus = 'paid';
    wifipayRef = wifiPayResult.reference;
  }
  WIFIPAY_END */

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
    paymentStatus,
    paymentMethod: 'wifipay',
    wifipayRef,
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

  const vendorNotifyAt = new Date();
  const vendorResponseDeadline = new Date(vendorNotifyAt.getTime() + VENDOR_RESPONSE_WINDOW_MS);
  order.status = 'vendor_notified';
  (order as unknown as { vendorResponseDeadline: Date }).vendorResponseDeadline = vendorResponseDeadline;
  (order as unknown as { vendorResponseStatus: 'pending' | 'accepted' | 'rejected' | 'timeout' }).vendorResponseStatus = 'pending';
  const history = (order as unknown as { statusHistory?: Array<Record<string, unknown>> }).statusHistory ?? [];
  history.push({
    status: 'vendor_notified',
    timestamp: vendorNotifyAt,
    updatedBy: 'system',
    changedByModel: 'System',
  });
  (order as unknown as { statusHistory: typeof history }).statusHistory = history;
  await order.save();

  await syncPreferredAddressFromOrderDelivery(String(customerId), addr);

  await User.findByIdAndUpdate(customerIdObj, {
    $inc: { totalOrders: 1, points: -discount },
    ...(discount > 0 && User.schema.paths.pointsHistory
      ? { $push: { pointsHistory: { amount: -discount, reason: 'Order discount', reference: order._id.toString(), createdAt: new Date() } } }
      : {}),
  });

  await Cart.deleteOne({ customer: customerIdObj });

  const io = getIo(req);
  const remainingSeconds = Math.max(0, Math.ceil(VENDOR_RESPONSE_WINDOW_MS / 1000));
  const newOrderRealtimePayload = {
    orderId: order._id,
    orderNumber: order.orderNumber,
    items: orderItems,
    totalAmount: order.total,
    paymentMethod: order.paymentMethod,
    vendorResponseDeadline: vendorResponseDeadline.toISOString(),
    remainingSeconds,
  };
  if (io) {
    io.to('admin').emit('order:new', { ...newOrderRealtimePayload, vendorId });
    io.to(`vendor:${vendorId}`).emit('order:new', newOrderRealtimePayload);
  }

  try {
    const vendorDoc = await Vendor.findById(vendorId).select('fcmTokens').lean();
    if (vendorDoc) {
      const itemCount = orderItems.reduce((sum, i) => sum + Number(i.qty || 0), 0);
      const orderForVendorLog = await Order.findById(order._id)
        .populate('customerId', 'name phone')
        .lean();
      const vendorOrderPayload =
        orderForVendorLog
          ? {
              ...orderForVendorLog,
              remainingTime: Math.max(
                0,
                Math.ceil((new Date(orderForVendorLog.vendorResponseDeadline as Date | string).getTime() - Date.now()) / 1000)
              ),
            }
          : null;
      const vendorOrderPayloadJson = vendorOrderPayload ? JSON.stringify(vendorOrderPayload) : '';
      const pushPayload = {
        title: 'New Order Received! 🔔',
        body: `Order ${order.orderNumber} — ${itemCount} item(s) — $${order.total}. Accept within ${remainingSeconds} seconds!`,
        data: {
          screen: 'NewOrders',
          orderId: String(order._id),
          vendorId: String(vendorId),
          orderPayload: vendorOrderPayloadJson,
        },
      };
      const vendorTokenCount = ((vendorDoc as { fcmTokens?: Array<{ token?: string | null }> })?.fcmTokens ?? [])
        .map((t) => t?.token ?? '')
        .filter(Boolean).length;
      // eslint-disable-next-line no-console -- debug aid for production FCM verification
      console.log('[FCM][Vendor][OrderPlaced] preparing vendor push', {
        vendorId: String(vendorId),
        orderId: String(order._id),
        orderNumber: order.orderNumber,
        tokenCount: vendorTokenCount,
        orderPayload: vendorOrderPayload ?? (order.toObject?.() ?? order),
        realtimePayload: newOrderRealtimePayload,
        fcmPayload: pushPayload,
      });
      const pushRes = await sendPushToVendor(vendorDoc as { _id?: unknown; fcmTokens?: Array<{ token: string }> }, pushPayload);
      // eslint-disable-next-line no-console -- debug aid for production FCM verification
      console.log('[FCM][Vendor][OrderPlaced] push result', {
        vendorId: String(vendorId),
        orderId: String(order._id),
        success: pushRes.success,
        failed: pushRes.failed,
      });
    } else {
      // eslint-disable-next-line no-console -- debug aid for missing vendor record during push
      console.warn('[FCM][Vendor][OrderPlaced] vendor not found, skipping push', {
        vendorId: String(vendorId),
        orderId: String(order._id),
      });
    }
  } catch (err) {
    // eslint-disable-next-line no-console -- debug aid when Firebase/token send fails
    console.error('[FCM][Vendor][OrderPlaced] push failed', {
      vendorId: String(vendorId),
      orderId: String(order._id),
      error: err instanceof Error ? err.message : String(err),
    });
    // Do not fail order placement if vendor push fails.
  }

  return sendSuccess(
    res,
    {
      _id: order._id,
      orderNumber: order.orderNumber,
      displayOrderId: toDisplayOrderId({ orderNumber: order.orderNumber, _id: order._id }),
      status: toCustomerOrderStatus(order.status),
      deliveryOtp: order.deliveryOtp,
      items: orderItems.map((i) => ({
        ...i,
        quantity: i.qty,
        lineTotal: i.subtotal,
      })),
      subtotal: order.subtotal,
      deliveryFee: order.deliveryFee,
      discount: order.discount,
      grandTotal: order.total,
      totalAmount: order.total,
      totals: {
        subtotal: order.subtotal,
        deliveryFee: order.deliveryFee,
        discount: order.discount,
        grandTotal: order.total,
      },
      deliveryAddress: order.deliveryAddress,
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod,
      createdAt: order.createdAt,
    },
    200
  );
});

/** GET / — Paginated order history; status filter: all(default) | active | completed | delivered | cancelled */
export const getOrders = asyncHandler(async (req: Request, res: Response) => {
  const customerId = req.user?._id;
  if (!customerId) throw new AppError({ en: 'Unauthorized', de: 'Nicht autorisiert' }, 401, 'UNAUTHORIZED');

  const { page, limit } = parsePagination(req.query, 10);
  const statusQ = String(req.query.status || '').trim();
  const filter: Record<string, unknown> = { customerId: new mongoose.Types.ObjectId(customerId) };
  if (statusQ === 'active') filter.status = { $in: ACTIVE_STATUSES };
  else if (statusQ === 'completed') filter.status = { $in: ['delivered', 'cancelled'] };
  else if (statusQ === 'delivered') filter.status = 'delivered';
  else if (statusQ === 'cancelled') filter.status = 'cancelled';

  const [orders, total] = await Promise.all([
    Order.find(filter).populate('vendorId', 'name logo').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Order.countDocuments(filter),
  ]);
  const pages = Math.ceil(total / limit) || 1;
  const ordersForApp = orders.map((o) => mapOrderStatusForCustomer({ ...o } as Record<string, unknown>));
  return sendSuccess(res, { orders: ordersForApp, total, page, pages });
});

/** GET /:id — Single order; populate vendor (name, logo, phone, address), driver (name, phone, profileImage, vehicleType, liveLocation); includes deliveryOtp (same as place-order response) */
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
  if (String((order as { customerId?: unknown }).customerId) !== customerId) {
    throw new AppError({ en: 'Forbidden', de: 'Verboten' }, 403, 'FORBIDDEN');
  }
  const out = { ...order } as Record<string, unknown>;
  if (out.driverId && typeof out.driverId === 'object' && out.driverId !== null) {
    const d = out.driverId as { liveLocation?: unknown };
    (out.driverId as Record<string, unknown>).currentLocation = d.liveLocation ?? null;
  }
  out.displayOrderId = toDisplayOrderId({
    orderNumber: (out as { orderNumber?: string | number }).orderNumber,
    _id: (out as { _id?: unknown })._id,
  });
  out.grandTotal = (out as { total?: number }).total ?? null;
  return sendSuccess(res, mapOrderStatusForCustomer(out));
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

  return sendSuccess(res, {
    _id: order._id,
    orderNumber: order.orderNumber,
    status: toCustomerOrderStatus(order.status),
  });
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
  return sendSuccess(res, mapOrderStatusForCustomer(out));
});
