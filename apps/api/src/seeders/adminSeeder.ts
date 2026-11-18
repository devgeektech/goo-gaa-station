import './seedEnv';
import mongoose from 'mongoose';
import { connectSeedDatabase } from './seedDatabase';
import { Admin } from '../models/Admin';

const adminEmail = (process.env.ADMIN_DEFAULT_EMAIL || 'admin@deliveryapp.com').toLowerCase();
const adminPassword = process.env.ADMIN_DEFAULT_PASSWORD || 'Admin@12345';

/** Seed default super_admin if none exists. Idempotent. */
export async function runAdminSeed(): Promise<void> {
  console.log('Admin seed: connecting (NODE_ENV=%s)...', process.env.NODE_ENV || 'development');

  if (!(process.env.MONGO_URI || '').trim()) {
    console.warn('MONGO_URI not set — skipping admin seed');
    return;
  }

  await connectSeedDatabase();

  const existing = await Admin.findOne({ email: adminEmail });
  if (existing) {
    console.log('Default admin already exists');
    await mongoose.disconnect();
    return;
  }

  await Admin.create({
    name: 'Admin',
    email: adminEmail,
    password: adminPassword,
    role: 'super_admin',
    isActive: true,
  });

  console.log('Default admin created:', adminEmail);
  await mongoose.disconnect();
}

if (require.main === module) {
  runAdminSeed()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Admin seed failed:', err);
      process.exit(1);
    });
}
