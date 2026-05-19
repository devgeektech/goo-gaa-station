import mongoose from 'mongoose';
import { getOrCreateModel } from '../utils/getOrCreateModel';

const CartItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    name: { type: String, required: true },
    price: { type: Number, required: true },
    qty: { type: Number, required: true, min: 1 },
    image: { type: String, default: null },
  },
  { _id: false }
);

const CartSchema = new mongoose.Schema(
  {
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true },
    items: [CartItemSchema],
    subtotal: { type: Number, required: true },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

CartSchema.index({ customer: 1 }, { unique: true });

export const Cart = getOrCreateModel('Cart', CartSchema);
