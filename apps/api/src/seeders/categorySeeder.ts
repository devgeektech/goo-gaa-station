import '../config/env';
import { connectDatabase } from '../config/database';
import { Category } from '../models/Category';

const CATEGORIES = [
  { name: 'Burgers', slug: 'burgers', type: 'food', sortOrder: 1 },
  { name: 'Pizza', slug: 'pizza', type: 'food', sortOrder: 2 },
  { name: 'Shawarma', slug: 'shawarma', type: 'food', sortOrder: 3 },
  { name: 'Grills & BBQ', slug: 'grills-bbq', type: 'food', sortOrder: 4 },
  { name: 'Chicken', slug: 'chicken', type: 'food', sortOrder: 5 },
  { name: 'Sushi', slug: 'sushi', type: 'food', sortOrder: 6 },
  { name: 'Pasta', slug: 'pasta', type: 'food', sortOrder: 7 },
  { name: 'Breakfast', slug: 'breakfast', type: 'food', sortOrder: 8 },
  { name: 'Salads', slug: 'salads', type: 'food', sortOrder: 9 },
  { name: 'Desserts', slug: 'desserts', type: 'food', sortOrder: 10 },
  { name: 'Drinks', slug: 'drinks', type: 'food', sortOrder: 11 },
  { name: 'Fast Food', slug: 'fast-food', type: 'food', sortOrder: 12 },
  { name: 'Grocery', slug: 'grocery', type: 'grocery', sortOrder: 20 },
  { name: 'Pharmacy', slug: 'pharmacy', type: 'pharmacy', sortOrder: 30 },
  { name: 'Fashion', slug: 'fashion', type: 'fashion', sortOrder: 40 },
];

/** Seed 15 categories. Re-run safe: duplicate key errors ignored (ordered: false). */
export async function runCategorySeed(): Promise<void> {
  const uri = process.env.MONGO_URI || '';
  if (!uri) {
    console.warn('MONGO_URI not set — skipping category seed');
    return;
  }

  await connectDatabase();

  let inserted = 0;
  for (const c of CATEGORIES) {
    try {
      const result = await (Category as import('mongoose').Model<unknown>).updateOne(
        { slug: c.slug },
        { $set: { name: c.name, type: c.type, sortOrder: c.sortOrder, isActive: true, isDeleted: false } },
        { upsert: true }
      );
      if (result.upsertedCount > 0 || result.modifiedCount > 0) inserted++;
    } catch {
      // duplicate or other - skip
    }
  }
  console.log('Categories seeded:', inserted, '/', CATEGORIES.length);

  const mongoose = await import('mongoose');
  await mongoose.default.disconnect();
}

if (require.main === module) {
  runCategorySeed().catch((err) => {
    console.error('Category seed failed:', err);
    process.exit(1);
  });
}
