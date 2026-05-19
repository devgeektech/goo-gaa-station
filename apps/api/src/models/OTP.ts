import mongoose from 'mongoose';
import { getOrCreateModel } from '../utils/getOrCreateModel';

const OTP_TTL_MINUTES = 10;

const OTPSchema = new mongoose.Schema(
  {
    phone: { type: String, required: true },
    role: { type: String, enum: ['customer', 'driver', 'vendor'], required: true },
    otpHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    isUsed: { type: Boolean, default: false },
  },
  { timestamps: true }
);

OTPSchema.index({ phone: 1, role: 1 }, { unique: true });
OTPSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const OTP = getOrCreateModel('OTP', OTPSchema);

export function getOTPExpiry(): Date {
  const d = new Date();
  d.setMinutes(d.getMinutes() + OTP_TTL_MINUTES);
  return d;
}
