import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 12;

export type AdminRole = 'super_admin' | 'admin';

const FcmTokenSchema = new mongoose.Schema(
  {
    token: { type: String, required: true },
    device: { type: String, default: null },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const AdminSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true, select: false },
    role: { type: String, enum: ['super_admin', 'admin'], default: 'admin' },
    isActive: { type: Boolean, default: true },
    fcmTokens: { type: [FcmTokenSchema], default: [] },
  },
  { timestamps: true }
);

AdminSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password as string, SALT_ROUNDS);
  next();
});

AdminSchema.methods.comparePassword = function (plain: string): Promise<boolean> {
  return bcrypt.compare(plain, this.password);
};

export const Admin = mongoose.models.Admin ?? mongoose.model('Admin', AdminSchema);
