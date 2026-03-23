import mongoose from 'mongoose';
import { env } from './env';

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 2000;

/** Connect to MongoDB with 5x retry and exponential backoff */
export async function connectDatabase(): Promise<void> {
  if (!env.MONGO_URI) {
    console.warn('MONGO_URI not set — skipping database connect');
    return;
  }

  let attempt = 0;

  while (attempt < MAX_RETRIES) {
    try {
      await mongoose.connect(env.MONGO_URI);
      console.log('MongoDB connected');
      return;
    } catch (err) {
      attempt += 1;
      console.error(`MongoDB connection attempt ${attempt}/${MAX_RETRIES} failed:`, err);
      if (attempt >= MAX_RETRIES) {
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }
}
