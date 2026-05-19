import mongoose from 'mongoose';
import { getOrCreateModel } from '../utils/getOrCreateModel';

/** Stub for future restaurant module */
const RestaurantSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    slug: { type: String, default: null },
  },
  { timestamps: true }
);

export const Restaurant = getOrCreateModel('Restaurant', RestaurantSchema);
