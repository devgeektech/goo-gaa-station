import mongoose from 'mongoose';

const RatingSchema = new mongoose.Schema(
  {
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, default: null, trim: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, unique: true },
  },
  { timestamps: true }
);

RatingSchema.index({ vendorId: 1, createdAt: -1 });
RatingSchema.index({ customerId: 1, vendorId: 1, createdAt: -1 });

export const Rating = (mongoose.models.Rating ?? mongoose.model('Rating', RatingSchema)) as mongoose.Model<any>;

