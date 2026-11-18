import mongoose from 'mongoose';

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 2000;

/** Connect for CLI seeds — uses MONGO_URI from process.env (see seedEnv.ts). */
export async function connectSeedDatabase(): Promise<void> {
  const uri = (process.env.MONGO_URI || '').trim();
  if (!uri) {
    console.warn('MONGO_URI not set — skipping database connect');
    return;
  }

  let attempt = 0;
  while (attempt < MAX_RETRIES) {
    try {
      if (attempt === 0) console.log('Connecting to MongoDB…');
      await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 10_000,
        connectTimeoutMS: 10_000,
      });
      console.log('MongoDB connected');
      return;
    } catch (err) {
      attempt += 1;
      console.error(`MongoDB connection attempt ${attempt}/${MAX_RETRIES} failed:`, err);
      if (attempt >= MAX_RETRIES) throw err;
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }
}