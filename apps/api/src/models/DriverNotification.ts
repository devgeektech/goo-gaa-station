import mongoose from 'mongoose';
import { getOrCreateModel } from '../utils/getOrCreateModel';

/** Persisted in-app notifications for drivers (e.g. new delivery requests). */
const DRIVER_NOTIFICATION_TYPES = ['new_order'] as const;

const DriverNotificationDataSchema = new mongoose.Schema(
  {
    estimatedPayout: { type: Number, default: null },
    orderNumber: { type: String, default: null },
  },
  { _id: false }
);

const DriverNotificationSchema = new mongoose.Schema(
  {
    driver: { type: mongoose.Schema.Types.ObjectId, ref: 'Driver', required: true, index: true },
    type: { type: String, enum: DRIVER_NOTIFICATION_TYPES, required: true },
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true, trim: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null, index: true },
    data: { type: DriverNotificationDataSchema, default: () => ({}) },
    read: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

// Indexes: list by recency; filter unread per driver (`read` flag)
DriverNotificationSchema.index({ driver: 1, createdAt: -1 });
DriverNotificationSchema.index({ driver: 1, read: 1 });

export const DriverNotification = getOrCreateModel('DriverNotification', DriverNotificationSchema);
