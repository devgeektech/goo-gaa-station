import mongoose from 'mongoose';
import { env } from '../config/env';
import { connectDatabase } from '../config/database';
import { Admin } from '../models/Admin';

/** Seed default super_admin if none exists. Idempotent. */
export async function runAdminSeed(): Promise<void> {
  if (!env.MONGO_URI) {
    console.warn('MONGO_URI not set — skipping admin seed');
    return;
  }

  await connectDatabase();

  const existing = await Admin.findOne({ email: env.ADMIN_DEFAULT_EMAIL.toLowerCase() });
  if (existing) {
    console.log('Default admin already exists');
    await mongoose.disconnect();
    return;
  }

  await Admin.create({
    name: 'Admin',
    email: env.ADMIN_DEFAULT_EMAIL.toLowerCase(),
    password: env.ADMIN_DEFAULT_PASSWORD,
    role: 'super_admin',
    isActive: true,
  });

  console.log('Default admin created:', env.ADMIN_DEFAULT_EMAIL);
  await mongoose.disconnect();
}

if (require.main === module) {
  runAdminSeed().catch((err) => {
    console.error('Admin seed failed:', err);
    process.exit(1);
  });
}
