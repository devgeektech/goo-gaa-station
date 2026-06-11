import mongoose from 'mongoose';
import { getOrCreateModel } from '../utils/getOrCreateModel';

/** In-app vendor notification feed (mirrors push / socket copy). */
export const VENDOR_NOTIFICATION_TYPES = [
  'order_new',
  'order_cancelled',
  'driver_assigned',
  'order_picked_up',
  'order_delivered',
  'order_timeout',
  'driver_assignment_timeout',
  'general',
] as const;

export type VendorNotificationType = (typeof VENDOR_NOTIFICATION_TYPES)[number];

const VendorNotificationDataSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, default: null },
    screen: { type: String, default: null },
  },
  { _id: false }
);

const VendorNotificationSchema = new mongoose.Schema(
  {
    vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
    type: { type: String, enum: VENDOR_NOTIFICATION_TYPES, required: true },
    iconKey: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true, trim: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null, index: true },
    data: { type: VendorNotificationDataSchema, default: () => ({}) },
    read: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

VendorNotificationSchema.index({ vendor: 1, createdAt: -1 });
VendorNotificationSchema.index({ vendor: 1, read: 1 });
VendorNotificationSchema.index({ vendor: 1, orderId: 1, type: 1 });

export const VendorNotification = getOrCreateModel('VendorNotification', VendorNotificationSchema);
