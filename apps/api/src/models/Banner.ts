import mongoose from 'mongoose';
import { getOrCreateModel } from '../utils/getOrCreateModel';

const BannerSchema = new mongoose.Schema(
  {
    image: { type: String, required: true, trim: true },
    heading: { type: String, required: true, trim: true, maxlength: 120 },
    text: { type: String, required: true, trim: true, maxlength: 500 },
    buttonText: { type: String, required: true, trim: true, maxlength: 60 },
    buttonUrl: { type: String, required: true, trim: true, maxlength: 500 },
    position: { type: Number, required: true, min: 1 },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

BannerSchema.index({ position: 1 }, { unique: true });
BannerSchema.index({ isActive: 1, position: 1 });

export const Banner = getOrCreateModel('Banner', BannerSchema);
