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

const KycDocumentsSchema = new mongoose.Schema(
  {
    driversLicense: { type: String, default: null },
    nationalId: { type: [String], default: [] },
    vehiclePhotos: { type: [String], default: [] },
  },
  { _id: false }
);

const DriverSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    // Important: no default `null`.
    // Placeholder drivers created during OTP auth should *not* write an indexed
    // `email: null` value, otherwise MongoDB can throw duplicate-key errors.
    email: { type: String, sparse: true, unique: true, lowercase: true },
    phone: { type: String, required: true, unique: true },
    phoneOtp: { type: String, default: null, select: false },
    phoneOtpExpiry: { type: Date, default: null, select: false },
    phoneOtpAttempts: { type: Number, default: 0, select: false },
    isPhoneVerified: { type: Boolean, default: false },
    refreshToken: { type: String, default: null, select: false },
    password: { type: String, required: true, select: false },
    profileImage: { type: String, default: null },
    licenseImage: { type: String, default: null },
    vehicleImage: { type: String, default: null },
    nationalIdImage: { type: String, default: null },
    vehicleType: { type: String, enum: ['bike', 'scooter', 'car', 'van'], default: null },
    vehiclePlate: { type: String, default: null },
    // Phase 8: vehicle number (profile setup step 2)
    vehicleNumber: {
      type: String,
      default: null,
      set: (v: string | null | undefined) => {
        if (v === null || v === undefined) return v;
        return String(v).trim().toUpperCase();
      },
    },
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
    // Phase 12.2: latest GPS location (lat/lng + timestamp).
    currentLocation: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
      updatedAt: { type: Date, default: null },
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
    // Phase 8: 0=auth-only, 1=profile saved, 2=vehicle saved
    setupStep: { type: Number, default: 0, min: 0, max: 2 },
    kycDocuments: {
      type: KycDocumentsSchema,
      default: () => ({}),
    },
    kycStatus: {
      type: String,
      enum: ['not_submitted', 'pending', 'approved', 'rejected'],
      default: 'not_submitted',
    },
    kycRejectionReason: { type: String, default: null },
    kycSubmittedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

DriverSchema.index({ phone: 1 }, { unique: true });
DriverSchema.index({ email: 1 }, { sparse: true, unique: true });
DriverSchema.index({ approvalStatus: 1 });
DriverSchema.index({ status: 1 });
DriverSchema.index({ approvalStatus: 1, status: 1 });
DriverSchema.index({ liveLocation: '2dsphere' });

// Phase 12 indexes
DriverSchema.index({ status: 1, approvalStatus: 1 });
DriverSchema.index({ 'currentLocation.updatedAt': -1 });

DriverSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password as string, SALT_ROUNDS);
  next();
});

DriverSchema.methods.comparePassword = function (plain: string): Promise<boolean> {
  return bcrypt.compare(plain, this.password);
};

export type DriverDocument = mongoose.Document & {
  name: string;
  email?: string | null;
  phone: string;
  isOnline?: boolean;
  isAvailable?: boolean;
  phoneOtp?: string | null;
  phoneOtpExpiry?: Date | null;
  phoneOtpAttempts?: number;
  isPhoneVerified: boolean;
  refreshToken?: string | null;
  password: string;
  approvalStatus: 'pending' | 'approved' | 'rejected';
  status: 'active' | 'blocked' | 'deleted';
  fcmTokens?: Array<{ token: string | null | undefined; device?: string | null }>;
  kycDocuments?: {
    driversLicense?: string | null;
    nationalId?: string[];
    vehiclePhotos?: string[];
  };
  kycStatus?: 'not_submitted' | 'pending' | 'approved' | 'rejected';
  kycRejectionReason?: string | null;
  kycSubmittedAt?: Date | null;
  currentLocation?: { lat: number | null; lng: number | null; updatedAt: Date | null };
};

export const Driver: mongoose.Model<DriverDocument> =
  (mongoose.models.Driver as mongoose.Model<DriverDocument> | undefined) ??
  mongoose.model<DriverDocument>('Driver', DriverSchema);
