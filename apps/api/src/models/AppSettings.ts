import mongoose from 'mongoose';

const AppSettingsSchema = new mongoose.Schema(
  {
    /** Flat delivery fee applied to cart/order totals. */
    deliveryFee: { type: Number, default: 0, min: 0 },
    /** Tax percentage applied to subtotal (e.g. 5 => 5%). */
    taxPercent: { type: Number, default: 0, min: 0, max: 100 },
  },
  { timestamps: true }
);

// Single-document collection (we always use findOne, upsert if missing).
AppSettingsSchema.index({ updatedAt: 1 });

export type AppSettingsDocument = mongoose.Document & {
  deliveryFee: number;
  taxPercent: number;
};

export const AppSettings: mongoose.Model<AppSettingsDocument> =
  (mongoose.models.AppSettings as mongoose.Model<AppSettingsDocument> | undefined) ??
  mongoose.model<AppSettingsDocument>('AppSettings', AppSettingsSchema);

