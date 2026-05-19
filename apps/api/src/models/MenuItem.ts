import mongoose from 'mongoose';
import { getOrCreateModel } from '../utils/getOrCreateModel';

const MenuItemSchema = new mongoose.Schema(
  {
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    price: { type: Number, required: true, min: 0 },
    image: { type: String, default: null },
    category: { type: String, required: true, trim: true },
    isAvailable: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

MenuItemSchema.index({ vendorId: 1 });
MenuItemSchema.index({ vendorId: 1, category: 1 });

export const MenuItem = getOrCreateModel('MenuItem', MenuItemSchema);
