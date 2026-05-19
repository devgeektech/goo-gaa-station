import mongoose from 'mongoose';
import { getOrCreateModel } from '../utils/getOrCreateModel';

const ProductSchema = new mongoose.Schema(
  {
    vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    price: { type: Number, required: true, min: 0 },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
    image: { type: String, default: null },
    isAvailable: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

ProductSchema.index({ vendor: 1, isDeleted: 1 });
ProductSchema.index({ category: 1 });
ProductSchema.index({ vendor: 1, category: 1, isDeleted: 1 });

export const Product = getOrCreateModel('Product', ProductSchema);
