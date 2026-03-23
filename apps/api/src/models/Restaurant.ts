import mongoose from 'mongoose';

/** Stub for future restaurant module */
const RestaurantSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    slug: { type: String, default: null },
  },
  { timestamps: true }
);

export const Restaurant =
  mongoose.models.Restaurant ?? mongoose.model('Restaurant', RestaurantSchema);
