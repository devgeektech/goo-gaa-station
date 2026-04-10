import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 12;

const AddressSchema = new mongoose.Schema(
  {
    addressLine1: { type: String, required: true, trim: true },
    addressLine2: { type: String, default: null, trim: true },
    landmark: { type: String, default: null, trim: true },
    saveAddressType: { type: String, enum: ['home', 'work', 'other'], required: true, default: 'home' },
    city: { type: String, required: true, trim: true },
    country: { type: String, required: true, trim: true },
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },
    isDefault: { type: Boolean, default: false },
  },
  { _id: true }
);

const FcmTokenSchema = new mongoose.Schema(
  {
    token: { type: String, required: true },
    device: { type: String, default: null },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const PointsHistorySchema = new mongoose.Schema(
  {
    amount: { type: Number, required: true },
    reason: { type: String, required: true },
    reference: { type: String, default: null },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const NotificationPrefsSchema = new mongoose.Schema(
  {
    push: { type: Boolean, default: true },
    email: { type: Boolean, default: true },
    orderUpdates: { type: Boolean, default: true },
    promotions: { type: Boolean, default: false },
  },
  { _id: false }
);

const UserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, sparse: true, lowercase: true },
    phone: { type: String, default: null },
    password: { type: String, required: false, default: null, select: false },
    profileImage: { type: String, default: null },
    addresses: [AddressSchema],
    status: { type: String, enum: ['active', 'blocked', 'deleted'], default: 'active' },
    blockReason: { type: String, default: null },
    fcmToken: { type: String, default: null },
    fcmTokens: [FcmTokenSchema],
    preferredLang: { type: String, enum: ['en', 'de'], default: 'en' },
    lastActiveAt: { type: Date, default: null },
    totalOrders: { type: Number, default: 0 },
    totalSpent: { type: Number, default: 0 },
    points: { type: Number, default: 0 },
    pointsHistory: [PointsHistorySchema],
    wishlistVendorIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Vendor' }],
    notificationPrefs: {
      type: NotificationPrefsSchema,
      default: () => ({ push: true, email: true, orderUpdates: true, promotions: false }),
    },
  },
  { timestamps: true }
);

UserSchema.index({ phone: 1 }, { unique: true, sparse: true });
UserSchema.index({ email: 1 }, { sparse: true, unique: true });

UserSchema.pre('save', async function (next) {
  if (!this.isModified('password') || this.password == null || this.password === '') return next();
  this.password = await bcrypt.hash(this.password as string, SALT_ROUNDS);
  next();
});

UserSchema.methods.comparePassword = function (plain: string): Promise<boolean> {
  if (this.password == null || this.password === '') return Promise.resolve(false);
  return bcrypt.compare(plain, this.password);
};

export const User = mongoose.models.User ?? mongoose.model('User', UserSchema);
