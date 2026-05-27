import mongoose from 'mongoose';
import { getOrCreateModel } from '../utils/getOrCreateModel';

/** In-app customer notification feed (mirrors push copy). */
export const CUSTOMER_NOTIFICATION_TYPES = [
  'order_placed',
  'order_accepted',
  'order_ready',
  'order_rejected',
  'order_cancelled',
  'driver_assigned',
  'order_picked_up',
  'order_on_the_way',
  'order_delivered',
  'promotion',
  'general',
] as const;

export type CustomerNotificationType = (typeof CUSTOMER_NOTIFICATION_TYPES)[number];

const CustomerNotificationDataSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, default: null },
    screen: { type: String, default: null },
  },
  { _id: false }
);

const CustomerNotificationSchema = new mongoose.Schema(
  {
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: CUSTOMER_NOTIFICATION_TYPES, required: true },
    iconKey: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true, trim: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null, index: true },
    data: { type: CustomerNotificationDataSchema, default: () => ({}) },
    read: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

CustomerNotificationSchema.index({ customer: 1, createdAt: -1 });
CustomerNotificationSchema.index({ customer: 1, read: 1 });

export const CustomerNotification = getOrCreateModel('CustomerNotification', CustomerNotificationSchema);
