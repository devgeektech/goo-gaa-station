import mongoose from 'mongoose';

export type UserModelType = 'Admin' | 'User' | 'Driver' | 'Vendor';

const RefreshTokenSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
    userModel: { type: String, enum: ['Admin', 'User', 'Driver', 'Vendor'], required: true },
    tokenHash: { type: String, required: true, select: false },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

RefreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RefreshToken =
  mongoose.models.RefreshToken ?? mongoose.model('RefreshToken', RefreshTokenSchema);
