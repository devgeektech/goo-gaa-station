import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Order } from '../../models/Order';
import { AppError } from '../../utils/AppError';
import { MESSAGES } from '../../constants/messages';
import { sendSuccess } from '../../utils/response';
import { asyncHandler } from '../../utils/asyncHandler';

type LeanVendor = {
  name?: string;
  phone?: string | null;
  address?: { street?: string | null; city?: string | null; country?: string | null; lat?: number | null; lng?: number | null };
} | null;

type LeanCustomer = {
  name?: string;
  phone?: string | null;
  profileImage?: string | null;
} | null;

function formatAddressLine(addr: {
  street?: string | null;
  city?: string | null;
  country?: string | null;
} | null | undefined): string {
  if (!addr) return '';
  return [addr.street, addr.city, addr.country].filter(Boolean).join(', ');
}

/** GET /api/v1/driver/orders/:id/detail — Delivery order details (assigned or broadcasted/notified pre-accept). */
export const getOrderDetail = asyncHandler(async (req: Request, res: Response) => {
  const driverId = req.driver?._id;
  if (!driverId) {
    throw new AppError({ en: MESSAGES.AUTH.en.unauthorized, de: MESSAGES.AUTH.de.unauthorized }, 401);
  }

  type OrderDetailLean = {
    _id: mongoose.Types.ObjectId;
    orderNumber: string;
    status: string;
    driverId?: mongoose.Types.ObjectId | null;
    broadcastedToDrivers?: mongoose.Types.ObjectId[];
    notifiedDriverIds?: mongoose.Types.ObjectId[];
    vendorId?: LeanVendor;
    customerId?: LeanCustomer;
    pickupAddress?: {
      street?: string | null;
      city?: string | null;
      country?: string | null;
      lat?: number | null;
      lng?: number | null;
    } | null;
    deliveryAddress: {
      street?: string | null;
      city?: string | null;
      country?: string | null;
      lat?: number | null;
      lng?: number | null;
      contactPhone?: string | null;
    };
    deliveryFee?: number;
    subtotal?: number;
    discount?: number;
    total?: number;
    items: Array<{ name: string; qty: number; unitPrice: number; subtotal?: number }>;
    notes?: string | null;
  };

  const order = (await (Order as unknown as mongoose.Model<mongoose.Document>)
    .findById(req.params.id)
    .populate('vendorId', 'name address phone')
    .populate('customerId', 'name phone profileImage')
    .lean()) as unknown as OrderDetailLean | null;

  if (!order) {
    throw new AppError({ en: MESSAGES.ORDER.en.notFound, de: MESSAGES.ORDER.de.notFound }, 404);
  }

  const driverIdStr = String(driverId);
  const assigned = order.driverId != null && String(order.driverId) === driverIdStr;
  const broadcasted = (order.broadcastedToDrivers ?? []).map((id) => String(id));
  const notified = (order.notifiedDriverIds ?? []).map((id) => String(id));
  const canViewPreAccept = broadcasted.includes(driverIdStr) || notified.includes(driverIdStr);

  if (!assigned && !canViewPreAccept) {
    throw new AppError(
      { en: 'You cannot view this order', de: 'Sie können diese Bestellung nicht einsehen' },
      403,
      'FORBIDDEN'
    );
  }

  const vendor = order.vendorId as unknown as LeanVendor;
  const customer = order.customerId as unknown as LeanCustomer;

  const vendorAddr = vendor?.address ?? null;
  const pickupAddr = order.pickupAddress ?? vendorAddr;
  const pickupLat = pickupAddr?.lat ?? vendorAddr?.lat ?? null;
  const pickupLng = pickupAddr?.lng ?? vendorAddr?.lng ?? null;

  const drop = order.deliveryAddress;
  const dropoffLat = drop?.lat ?? null;
  const dropoffLng = drop?.lng ?? null;

  const pickupAddressText = formatAddressLine(pickupAddr) || formatAddressLine(vendorAddr);
  const dropoffAddressText = formatAddressLine(drop);

  const deliveryFee = typeof order.deliveryFee === 'number' ? order.deliveryFee : 0;
  const tip = 0;

  const rawItems = order.items ?? [];
  const items = rawItems.map((i) => ({
    name: i.name,
    quantity: i.qty,
    notes: '',
    unitPrice: i.unitPrice,
  }));

  const itemsTotalFromLines = rawItems.reduce((sum, i) => {
    const line =
      typeof i.subtotal === 'number' && Number.isFinite(i.subtotal)
        ? i.subtotal
        : (Number(i.qty) || 0) * (Number(i.unitPrice) || 0);
    return sum + line;
  }, 0);
  const itemsTotal =
    typeof order.subtotal === 'number' && Number.isFinite(order.subtotal)
      ? Math.round(order.subtotal * 100) / 100
      : Math.round(itemsTotalFromLines * 100) / 100;
  const discountNum = typeof order.discount === 'number' && Number.isFinite(order.discount) ? order.discount : 0;
  const grandTotalRaw =
    typeof order.total === 'number' && Number.isFinite(order.total)
      ? order.total
      : Math.max(0, itemsTotal + deliveryFee - discountNum);
  const grandTotal = Math.round(grandTotalRaw * 100) / 100;

  const payload = {
    orderId: order._id,
    orderNumber: order.orderNumber,
    status: order.status,
    map: {
      pickupLat,
      pickupLng,
      dropoffLat,
      dropoffLng,
    },
    pickup: {
      restaurantName: vendor?.name ?? '',
      address: pickupAddressText,
      lat: pickupLat,
      lng: pickupLng,
      phone: vendor?.phone ?? null,
    },
    dropoff: {
      customerName: customer?.name ?? '',
      address: dropoffAddressText,
      lat: dropoffLat,
      lng: dropoffLng,
      phone: drop?.contactPhone ?? customer?.phone ?? null,
      avatarUrl: customer?.profileImage ?? null,
      rating: null as number | null,
      reviewCount: 0,
    },
    customerNote: order.notes ?? '',
    items,
    itemCount: items.length,
    itemsTotal,
    grandTotal,
    earnings: {
      deliveryFee,
      tip,
      totalPayout: deliveryFee + tip,
    },
  };

  return sendSuccess(res, payload);
});
