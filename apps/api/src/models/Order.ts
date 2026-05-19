import mongoose from 'mongoose';
import crypto from 'crypto';
import { getOrCreateModel } from '../utils/getOrCreateModel';
import { VENDOR_RESPONSE_WINDOW_MS } from '../constants/vendorResponse';

const ORDER_STATUSES = ['pending', 'vendor_notified', 'placed', 'accepted', 'confirmed', 'preparing', 'ready', 'picked_up', 'on_the_way', 'delivered', 'cancelled'] as const;
const PAYMENT_STATUSES = ['pending', 'paid', 'failed', 'refunded'] as const;
const PAYMENT_METHODS = ['wifipay'] as const;
const CANCELLED_BY = ['customer', 'driver', 'admin', 'system'] as const;
const VENDOR_RESPONSE_STATUSES = ['pending', 'accepted', 'rejected', 'timeout'] as const;

const OrderItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    qty: { type: Number, required: true },
    unitPrice: { type: Number, required: true },
    image: { type: String, default: null },
    subtotal: { type: Number, required: true },
    itemId: { type: String, default: null },
  },
  { _id: false }
);

const AddressSchema = new mongoose.Schema(
  {
    street: { type: String, required: true },
    city: { type: String, required: true },
    country: { type: String, required: true },
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },
    name: { type: String, default: null },
    contactName: { type: String, default: null },
    contactPhone: { type: String, default: null },
  },
  { _id: false }
);

const StatusHistoryItemSchema = new mongoose.Schema(
  {
    status: { type: String, enum: ORDER_STATUSES, required: true },
    timestamp: { type: Date, default: Date.now },
    note: { type: String, default: null },
    changedBy: { type: mongoose.Schema.Types.ObjectId, refPath: 'statusHistory.changedByModel', default: null },
    changedByModel: { type: String, enum: ['User', 'Driver', 'Admin', 'System'], default: null },
    isAdminOverride: { type: Boolean, default: false },
  },
  { _id: false }
);

function generateOrderNumber(): string {
  const date = new Date();
  const yyyymmdd = date.getFullYear() + String(date.getMonth() + 1).padStart(2, '0') + String(date.getDate()).padStart(2, '0');
  const random = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `ORD-${yyyymmdd}-${random}`;
}

const OrderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, unique: true, required: true, default: function () { return generateOrderNumber(); } },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    driverId: { type: mongoose.Schema.Types.ObjectId, ref: 'Driver', default: null },
    restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', default: null },
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', default: null },
    deliveryOtp: { type: String, default: null },
    items: [OrderItemSchema],
    subtotal: { type: Number, required: true },
    deliveryFee: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    total: { type: Number, required: true },
    grossAmount: { type: Number, default: 0 },
    platformCommission: { type: Number, default: 0 },
    wifipayFee: { type: Number, default: 0 },
    vendorShare: { type: Number, default: 0 },
    driverShare: { type: Number, default: 0 },
    paymentStatus: { type: String, enum: PAYMENT_STATUSES, default: 'pending' },
    paymentMethod: { type: String, enum: PAYMENT_METHODS, default: 'wifipay' },
    wifipayRef: { type: String, default: null },
    vendorResponseDeadline: { type: Date, required: true, default: () => new Date(Date.now() + VENDOR_RESPONSE_WINDOW_MS) },
    vendorResponseStatus: { type: String, enum: VENDOR_RESPONSE_STATUSES, default: 'pending' },
    vendorRespondedAt: { type: Date, default: null },
    driver_assigned: { type: Boolean, default: false },
    driverAcceptedAt: { type: Date, default: null },
    driverAssignmentDeadline: { type: Date, default: null },
    notifiedDriverIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Driver' }],
    broadcastedToDrivers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Driver' }],
    rejectedByDrivers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Driver' }],
    status: { type: String, enum: ORDER_STATUSES, default: 'pending' },
    statusHistory: [StatusHistoryItemSchema],
    pickupAddress: { type: AddressSchema, default: null },
    deliveryAddress: { type: AddressSchema, required: true },
    deliveryDistance: { type: Number, default: null },
    estimatedDeliveryTime: { type: Number, default: null },
    actualDeliveryAt: { type: Date, default: null },
    cancellationReason: { type: String, default: null },
    cancelledBy: { type: String, enum: CANCELLED_BY, default: null },
    notes: { type: String, default: null },
    customerRating: { type: Number, default: null },
    customerRatingComment: { type: String, default: null },
    driverRating: { type: Number, default: null },
    foodRating: { type: Number, default: null, min: 1, max: 5 },
    deliveryRating: { type: Number, default: null, min: 1, max: 5 },
  },
  { timestamps: true }
);

OrderSchema.index({ status: 1 });
OrderSchema.index({ vendorId: 1, status: 1 });
OrderSchema.index({ paymentStatus: 1 });
OrderSchema.index({ customerId: 1 });
OrderSchema.index({ driverId: 1 });
OrderSchema.index({ createdAt: -1 });
OrderSchema.index({ wifipayRef: 1 }, { sparse: true, unique: false });
OrderSchema.index({ customerId: 1, status: 1 });
OrderSchema.index({ vendorResponseDeadline: 1 });
OrderSchema.index({ driver_assigned: 1, driverAssignmentDeadline: 1, status: 1 });
OrderSchema.index({ broadcastedToDrivers: 1, driverAssignmentDeadline: 1, status: 1 });

// Phase 12 indexes
OrderSchema.index({ driverId: 1, status: 1 });
OrderSchema.index({ broadcastedToDrivers: 1, status: 1 });
OrderSchema.index({ driverId: 1, status: 1, updatedAt: -1 });

OrderSchema.pre('save', function (next) {
  if (this.isNew && !this.orderNumber) {
    this.orderNumber = generateOrderNumber();
  }
  if (this.isNew && (!this.statusHistory || this.statusHistory.length === 0)) {
    const status = (this as mongoose.Document & { status?: string }).status || 'pending';
    (this as mongoose.Document & { statusHistory: unknown[] }).statusHistory = [{ status, timestamp: new Date(), changedByModel: 'System' }];
  }
  next();
});

export const Order = getOrCreateModel('Order', OrderSchema);
