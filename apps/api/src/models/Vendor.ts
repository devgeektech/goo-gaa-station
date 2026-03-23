import mongoose from 'mongoose';

const FcmTokenSchema = new mongoose.Schema(
  {
    token: { type: String, required: true },
    device: { type: String, default: null },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const OPERATING_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

const OperatingHourSchema = new mongoose.Schema(
  {
    day: { type: String, enum: OPERATING_DAYS, required: true },
    isOpen: { type: Boolean, default: false },
    from: { type: String, default: null }, // "HH:MM"
    to: { type: String, default: null }, // "HH:MM"
  },
  { _id: false }
);

const VendorSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: { type: String, default: '' },
    logo: { type: String, default: null },
    coverImage: { type: String, default: null },
    email: { type: String, default: null, lowercase: true },
    phone: { type: String, default: null },
    phoneOtp: { type: String, default: null, select: false },
    phoneOtpExpiry: { type: Date, default: null, select: false },
    phoneOtpAttempts: { type: Number, default: 0 },
    isPhoneVerified: { type: Boolean, default: false },
    onboardingStep: { type: Number, default: 0, min: 0, max: 6 },
    contactPerson: {
      name: { type: String, default: null },
      email: { type: String, default: null },
      phone: { type: String, default: null },
    },
    operatingHours: { type: [OperatingHourSchema], default: [] },
    kycDocuments: {
      businessRegistration: { type: String, default: null },
      /** Array of URLs; vendor can upload multiple identity documents */
      identityDocument: { type: [String], default: [] },
      healthSafetyLicense: { type: String, default: null },
    },
    approvalStatus: { type: String, enum: ['none', 'pending', 'approved', 'rejected'], default: 'none' },
    rejectionReason: { type: String, default: null },
    approvedAt: { type: Date, default: null },
    rejectedAt: { type: Date, default: null },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
    submittedAt: { type: Date, default: null },
    fcmTokens: { type: [FcmTokenSchema], default: [] },
    address: {
      street: { type: String, default: null },
      city: { type: String, default: null },
      country: { type: String, default: null },
      landmark: { type: String, default: null },
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
      addressLabel: { type: String, enum: ['home', 'work', 'other'], default: null },
    },
    status: { type: String, enum: ['active', 'blocked', 'deleted', 'pending'], default: 'active' },
    blockReason: { type: String, default: null },
    categoryIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: [] }],
    openingHours: {
      type: [
        {
          day: { type: Number, min: 0, max: 6 },
          open: { type: String, default: null },
          close: { type: String, default: null },
        },
      ],
      default: undefined,
    },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

VendorSchema.index({ status: 1 });
VendorSchema.index({ slug: 1 });
VendorSchema.index({ categoryIds: 1 });
VendorSchema.index({ phone: 1 }, { unique: true, sparse: true });

export const Vendor = (mongoose.models.Vendor ?? mongoose.model('Vendor', VendorSchema)) as mongoose.Model<any>;
