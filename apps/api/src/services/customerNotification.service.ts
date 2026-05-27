import mongoose from 'mongoose';
import {
  CustomerNotification,
  type CustomerNotificationType,
} from '../models/CustomerNotification';
import { Order } from '../models/Order';
import { Vendor } from '../models/Vendor';
import { Category } from '../models/Category';

const ORDER_UPDATE_TYPES = new Set<CustomerNotificationType>([
  'order_placed',
  'order_accepted',
  'order_ready',
  'order_rejected',
  'order_cancelled',
  'driver_assigned',
  'order_picked_up',
  'order_on_the_way',
  'order_delivered',
]);

const DELIVERY_VISUAL_TYPES = new Set<CustomerNotificationType>([
  'driver_assigned',
  'order_picked_up',
  'order_on_the_way',
  'order_delivered',
]);

const PACKAGE_CATEGORY_TYPES = new Set(['grocery', 'pharmacy', 'fashion', 'retail']);

type NotificationPrefs = {
  push?: boolean;
  orderUpdates?: boolean;
  promotions?: boolean;
};

function shouldPersistInApp(type: CustomerNotificationType, prefs?: NotificationPrefs | null): boolean {
  if (ORDER_UPDATE_TYPES.has(type)) {
    return prefs?.orderUpdates !== false;
  }
  if (type === 'promotion') {
    return prefs?.promotions === true;
  }
  return true;
}

function resolveDeliveryVisual(categoryTypes: string[]): 'scooter' | 'package' {
  if (categoryTypes.length === 0) return 'scooter';
  if (categoryTypes.some((t) => t === 'food')) return 'scooter';
  if (categoryTypes.every((t) => PACKAGE_CATEGORY_TYPES.has(t))) return 'package';
  return 'scooter';
}

/** Stable key for mobile notification icons. */
export function buildCustomerNotificationIconKey(
  type: CustomerNotificationType,
  deliveryVisual: 'scooter' | 'package' | 'neutral' = 'neutral'
): string {
  if (!DELIVERY_VISUAL_TYPES.has(type)) {
    return type;
  }
  const suffix = deliveryVisual === 'package' ? 'package' : 'scooter';
  return `${type}_${suffix}`;
}

async function resolveDeliveryVisualForOrder(
  orderId?: string | mongoose.Types.ObjectId | null
): Promise<'scooter' | 'package'> {
  if (orderId == null || !mongoose.Types.ObjectId.isValid(String(orderId))) {
    return 'scooter';
  }
  const order = await Order.findById(orderId).select('vendorId').lean();
  const vendorId = (order as { vendorId?: mongoose.Types.ObjectId } | null)?.vendorId;
  if (!vendorId) return 'scooter';

  const vendor = await Vendor.findById(vendorId).select('categoryIds').lean();
  const categoryIds = (vendor as { categoryIds?: mongoose.Types.ObjectId[] } | null)?.categoryIds ?? [];
  if (categoryIds.length === 0) return 'scooter';

  const categories = await Category.find({ _id: { $in: categoryIds } }).select('type').lean();
  const types = categories.map((c) => String((c as { type?: string }).type ?? '')).filter(Boolean);
  return resolveDeliveryVisual(types);
}

/** Persist in-app row only (does not send push). */
export async function createCustomerNotification(params: {
  customerId: string | mongoose.Types.ObjectId;
  type: CustomerNotificationType;
  title: string;
  body: string;
  orderId?: string | mongoose.Types.ObjectId | null;
  orderNumber?: string | null;
  screen?: string | null;
  notificationPrefs?: NotificationPrefs | null;
  iconKey?: string;
}): Promise<void> {
  if (!mongoose.Types.ObjectId.isValid(String(params.customerId))) return;
  if (!shouldPersistInApp(params.type, params.notificationPrefs ?? undefined)) return;

  let iconKey = params.iconKey;
  if (!iconKey) {
    const visual = DELIVERY_VISUAL_TYPES.has(params.type)
      ? await resolveDeliveryVisualForOrder(params.orderId)
      : 'neutral';
    iconKey = buildCustomerNotificationIconKey(params.type, visual);
  }

  const orderId =
    params.orderId != null && mongoose.Types.ObjectId.isValid(String(params.orderId))
      ? new mongoose.Types.ObjectId(String(params.orderId))
      : null;

  await CustomerNotification.create({
    customer: new mongoose.Types.ObjectId(String(params.customerId)),
    type: params.type,
    iconKey,
    title: params.title,
    body: params.body,
    orderId,
    data: {
      orderNumber: params.orderNumber ?? null,
      screen: params.screen ?? null,
    },
    read: false,
  });
}

/**
 * Call after sendPushToCustomer with the same copy — push behavior unchanged.
 * Best-effort: never throws.
 */
export async function saveCustomerInAppNotification(params: {
  customerId: string | mongoose.Types.ObjectId;
  type: CustomerNotificationType;
  title: string;
  body: string;
  orderId?: string | mongoose.Types.ObjectId | null;
  orderNumber?: string | null;
  screen?: string | null;
  notificationPrefs?: NotificationPrefs | null;
}): Promise<void> {
  try {
    await createCustomerNotification(params);
  } catch {
    // best effort — must not break order flows
  }
}

/** For refundService.js and other JS callers. */
export async function saveCustomerInAppNotificationById(params: {
  customerId: string | mongoose.Types.ObjectId;
  type: CustomerNotificationType;
  title: string;
  body: string;
  orderId?: string | mongoose.Types.ObjectId | null;
  orderNumber?: string | null;
  screen?: string | null;
  notificationPrefs?: NotificationPrefs | null;
}): Promise<void> {
  return saveCustomerInAppNotification(params);
}
