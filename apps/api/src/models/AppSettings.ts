import mongoose from 'mongoose';
import { getOrCreateModel } from '../utils/getOrCreateModel';

const AppSettingsSchema = new mongoose.Schema(
  {
    /** Flat delivery fee applied to cart/order totals. */
    deliveryFee: { type: Number, default: 0, min: 0 },
    /** Admin platform commission % on order gross (e.g. 15 => 15%). */
    commissionPercent: { type: Number, default: 2, min: 0, max: 100 },
    /** @deprecated Use commissionPercent. Kept for existing DB documents. */
    taxPercent: { type: Number, min: 0, max: 100 },
    /** ISO 4217 code for display / future pricing (MVP metadata). */
    defaultCurrency: { type: String, default: 'USD', trim: true, maxlength: 8 },
    /** IANA timezone for platform-wide defaults (MVP metadata). */
    defaultTimezone: { type: String, default: 'UTC', trim: true, maxlength: 80 },
    /** Named delivery or service areas (MVP; not yet enforced by routing). */
    serviceZones: { type: [String], default: [] },
  },
  { timestamps: true }
);

// Single-document collection (we always use findOne, upsert if missing).
AppSettingsSchema.index({ updatedAt: 1 });

export type AppSettingsDocument = mongoose.Document & {
  deliveryFee: number;
  commissionPercent: number;
  taxPercent?: number;
  defaultCurrency: string;
  defaultTimezone: string;
  serviceZones: string[];
};

export const AppSettings = getOrCreateModel<AppSettingsDocument>('AppSettings', AppSettingsSchema);

