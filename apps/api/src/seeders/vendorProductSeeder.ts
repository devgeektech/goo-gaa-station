import mongoose from 'mongoose';
import { env } from '../config/env';
import { connectDatabase } from '../config/database';
import { Vendor } from '../models/Vendor';
import { Category } from '../models/Category';
import { Product } from '../models/Product';

const SEED_VENDOR_SLUG = 'seed-demo-restaurant';
const DEFAULT_SEED_VENDOR_PHONE = '+491701234567';

type SeedProduct = {
  name: string;
  categorySlug: string;
  price: number;
  description: string;
  sortOrder: number;
};

const PRODUCTS: SeedProduct[] = [
  {
    name: 'Classic Cheeseburger',
    categorySlug: 'burgers',
    price: 8.99,
    description: 'Beef patty, cheddar, lettuce, tomato, house sauce.',
    sortOrder: 1,
  },
  {
    name: 'Margherita Pizza',
    categorySlug: 'pizza',
    price: 11.5,
    description: 'Tomato, mozzarella, basil.',
    sortOrder: 2,
  },
  {
    name: 'Chicken Shawarma Wrap',
    categorySlug: 'shawarma',
    price: 7.25,
    description: 'Marinated chicken, garlic sauce, pickles.',
    sortOrder: 3,
  },
  {
    name: 'Sparkling Water',
    categorySlug: 'drinks',
    price: 2.5,
    description: '330ml bottle.',
    sortOrder: 4,
  },
  {
    name: 'Caesar Salad',
    categorySlug: 'salads',
    price: 6.75,
    description: 'Romaine, parmesan, croutons, Caesar dressing.',
    sortOrder: 5,
  },
];

async function syncVendorCategoryIds(vendorId: mongoose.Types.ObjectId): Promise<void> {
  const distinctCategoryIds = await Product.distinct('category', {
    vendor: vendorId,
    isDeleted: false,
  });
  const categoryIds = distinctCategoryIds
    .filter((id) => mongoose.Types.ObjectId.isValid(String(id)))
    .map((id) => new mongoose.Types.ObjectId(String(id)));
  await Vendor.updateOne({ _id: vendorId }, { $set: { categoryIds } }, { runValidators: false });
}

async function resolveVendor(): Promise<mongoose.Types.ObjectId> {
  const byId = (process.env.SEED_VENDOR_ID || '').trim();
  if (byId && mongoose.Types.ObjectId.isValid(byId)) {
    const vendor = await Vendor.findOne({
      _id: new mongoose.Types.ObjectId(byId),
      status: { $ne: 'deleted' },
    });
    if (!vendor) {
      throw new Error(`Vendor not found for SEED_VENDOR_ID=${byId}`);
    }
    return vendor._id as mongoose.Types.ObjectId;
  }

  const phone = (process.env.SEED_VENDOR_PHONE || DEFAULT_SEED_VENDOR_PHONE).trim();
  let vendor = await Vendor.findOne({ phone, status: { $ne: 'deleted' } });
  if (!vendor) {
    vendor = await Vendor.findOne({ slug: SEED_VENDOR_SLUG, status: { $ne: 'deleted' } });
  }

  if (!vendor) {
    vendor = await Vendor.create({
      name: 'Seed Demo Restaurant',
      slug: SEED_VENDOR_SLUG,
      description: 'Demo vendor for local development (seed).',
      phone,
      isPhoneVerified: true,
      approvalStatus: 'approved',
      approvedAt: new Date(),
      onboardingStep: 6,
      status: 'active',
      globalToggle: true,
      isOpen: true,
    });
    console.log('Created seed vendor:', vendor.name, `(${vendor._id})`);
  } else {
    await Vendor.updateOne(
      { _id: vendor._id },
      {
        $set: {
          approvalStatus: 'approved',
          status: 'active',
          isPhoneVerified: true,
          globalToggle: true,
        },
      },
      { runValidators: false }
    );
    console.log('Using existing vendor:', vendor.name, `(${vendor._id})`);
  }

  return vendor._id as mongoose.Types.ObjectId;
}

/** Seed sample products for a vendor. Idempotent (upsert by vendor + name). Run category seed first. */
export async function runVendorProductSeed(): Promise<void> {
  if (!env.MONGO_URI) {
    console.warn('MONGO_URI not set — skipping vendor product seed');
    return;
  }

  await connectDatabase();

  const vendorId = await resolveVendor();
  let upserted = 0;

  for (const p of PRODUCTS) {
    const category = await Category.findOne({ slug: p.categorySlug, isDeleted: { $ne: true } }).select('_id');
    if (!category) {
      console.warn(`Category slug "${p.categorySlug}" not found — run seed:categories first; skipping`, p.name);
      continue;
    }

    const result = await Product.updateOne(
      { vendor: vendorId, name: p.name },
      {
        $set: {
          vendor: vendorId,
          name: p.name,
          description: p.description,
          price: p.price,
          category: category._id,
          isAvailable: true,
          isDeleted: false,
          sortOrder: p.sortOrder,
        },
      },
      { upsert: true }
    );
    if (result.upsertedCount > 0 || result.modifiedCount > 0) upserted++;
  }

  await syncVendorCategoryIds(vendorId);
  console.log('Vendor products seeded:', upserted, '/', PRODUCTS.length, 'for vendor', String(vendorId));

  await mongoose.disconnect();
}

if (require.main === module) {
  runVendorProductSeed()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Vendor product seed failed:', err);
      process.exit(1);
    });
}