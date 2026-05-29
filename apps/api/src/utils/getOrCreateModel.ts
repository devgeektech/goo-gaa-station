import mongoose, { type Model, type Schema } from 'mongoose';

/**
 * Register or reuse a Mongoose model without `models.X ?? model()` union types
 * that break TypeScript on `.find()` / `.findOne()` etc.
 */
export function getOrCreateModel<T = unknown>(name: string, schema: Schema): Model<T> {
  const existing = mongoose.models[name] as Model<T> | undefined;
  if (existing) return existing;
  return mongoose.model<T>(name, schema);
}
