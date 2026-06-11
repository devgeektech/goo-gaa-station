import mongoose from 'mongoose';
import {
  VendorNotification,
  type VendorNotificationType,
} from '../models/VendorNotification';

/** Persist in-app row only (does not send push). */
export async function createVendorNotification(params: {
  vendorId: string | mongoose.Types.ObjectId;
  type: VendorNotificationType;
  title: string;
  body: string;
  orderId?: string | mongoose.Types.ObjectId | null;
  orderNumber?: string | null;
  screen?: string | null;
  iconKey?: string;
  dedupe?: boolean;
}): Promise<void> {
  if (!mongoose.Types.ObjectId.isValid(String(params.vendorId))) return;

  const vendorObjectId = new mongoose.Types.ObjectId(String(params.vendorId));
  const orderId =
    params.orderId != null && mongoose.Types.ObjectId.isValid(String(params.orderId))
      ? new mongoose.Types.ObjectId(String(params.orderId))
      : null;

  if (params.dedupe !== false && orderId) {
    const existing = await VendorNotification.findOne({
      vendor: vendorObjectId,
      orderId,
      type: params.type,
    })
      .select('_id')
      .lean();
    if (existing) return;
  }

  await VendorNotification.create({
    vendor: vendorObjectId,
    type: params.type,
    iconKey: params.iconKey ?? params.type,
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

/** Best-effort: never throws. */
export async function saveVendorInAppNotification(params: {
  vendorId: string | mongoose.Types.ObjectId;
  type: VendorNotificationType;
  title: string;
  body: string;
  orderId?: string | mongoose.Types.ObjectId | null;
  orderNumber?: string | null;
  screen?: string | null;
  iconKey?: string;
  dedupe?: boolean;
}): Promise<void> {
  try {
    await createVendorNotification(params);
  } catch {
    // must not break order flows
  }
}
