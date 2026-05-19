import mongoose from 'mongoose';
import { getOrCreateModel } from '../utils/getOrCreateModel';

const CounterSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    seq: { type: Number, default: 0 },
  },
  { timestamps: false }
);

CounterSchema.index({ name: 1 }, { unique: true });

export const Counter = getOrCreateModel('Counter', CounterSchema);

/** Get next order number in format #ORD-YYYY-NNNN */
export async function getNextOrderNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const name = `orderNumber_${year}`;
  const doc = await Counter.findOneAndUpdate(
    { name },
    { $inc: { seq: 1 } },
    { upsert: true, new: true }
  );
  const seq = (doc?.seq ?? 1) as number;
  return `#ORD-${year}-${String(seq).padStart(4, '0')}`;
}
