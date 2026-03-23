import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 12;

const ApprovalHistoryItemSchema = new mongoose.Schema(
  {
    status: { type: String, enum: ['pending', 'approved', 'rejected'], required: true },
    note: { type: String, default: null },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
    changedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const BankAccountSchema = new mongoose.Schema(
  {
    iban: { type: String, default: null },
    bankName: { type: String, default: null },
    accountHolder: { type: String, default: null },
  },
  { _id: false }
);

const FcmTokenSchema = new mongoose.Schema(
  {
    token: { type: String, required: true },
    device: { type: String, default: null },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const DriverSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, sparse: true, unique: true, default: null, lowercase: true },
    phone: { type: String, required: true, unique: true },
    password: { type: String, required: true, select: false },
    profileImage: { type: String, default: null },
    licenseImage: { type: String, default: null },
    vehicleImage: { type: String, default: null },
    nationalIdImage: { type: String, default: null },
    vehicleType: { type: String, enum: ['bike', 'scooter', 'car', 'van'], default: null },
    vehiclePlate: { type: String, default: null },
    licenseNumber: { type: String, default: null },
    nationalId: { type: String, default: null },
    approvalStatus: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    approvalNote: { type: String, default: null },
    blockReason: { type: String, default: null },
    approvalHistory: [ApprovalHistoryItemSchema],
    isOnline: { type: Boolean, default: false },
    isAvailable: { type: Boolean, default: true },
    status: { type: String, enum: ['active', 'blocked', 'deleted'], default: 'active' },
    liveLocation: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: [0, 0] },
    },
    lastLocationAt: { type: Date, default: null },
    currentOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
    deliveryZones: [String],
    rating: { type: Number, default: 5, min: 1, max: 5 },
    totalDeliveries: { type: Number, default: 0 },
    totalEarnings: { type: Number, default: 0 },
    bankAccount: { type: BankAccountSchema, default: () => ({}) },
    walletBalance: { type: Number, default: 0 },
    fcmToken: { type: String, default: null },
    fcmTokens: [FcmTokenSchema],
    preferredLang: { type: String, enum: ['en', 'de'], default: 'en' },
    lastActiveAt: { type: Date, default: null },
  },
  { timestamps: true }
);

DriverSchema.index({ phone: 1 }, { unique: true });
DriverSchema.index({ email: 1 }, { sparse: true, unique: true });
DriverSchema.index({ approvalStatus: 1 });
DriverSchema.index({ status: 1 });
DriverSchema.index({ approvalStatus: 1, status: 1 });
DriverSchema.index({ liveLocation: '2dsphere' });

DriverSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password as string, SALT_ROUNDS);
  next();
});

DriverSchema.methods.comparePassword = function (plain: string): Promise<boolean> {
  return bcrypt.compare(plain, this.password);
};

export const Driver = mongoose.models.Driver ?? mongoose.model('Driver', DriverSchema);
