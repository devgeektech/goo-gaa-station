import mongoose from 'mongoose';
import { Category } from '../models/Category';
import { AppError } from './AppError';

export const VENDOR_CATEGORY_TYPES = ['food', 'grocery', 'pharmacy', 'fashion', 'retail'] as const;
export type VendorCategoryType = (typeof VENDOR_CATEGORY_TYPES)[number];

function isCategoryObjectId(value: string): boolean {
  return mongoose.Types.ObjectId.isValid(value) && String(new mongoose.Types.ObjectId(value)) === value;
}

/**
 * Resolves vendor `categoryIds` filter from query:
 * - omit / `all` → no filter
 * - 24-char ObjectId → vendor must include that category
 * - food | grocery | pharmacy | fashion | retail → vendor must have at least one active category of that type
 */
export async function resolveVendorCategoryIdsFilter(
  categoryRaw: string | undefined,
  typeRaw?: string | undefined
): Promise<mongoose.Types.ObjectId | { $in: mongoose.Types.ObjectId[] } | null> {
  const q = String(categoryRaw || typeRaw || '')
    .trim()
    .toLowerCase();
  if (!q || q === 'all') return null;

  if (isCategoryObjectId(q)) {
    return new mongoose.Types.ObjectId(q);
  }

  if (!VENDOR_CATEGORY_TYPES.includes(q as VendorCategoryType)) {
    throw new AppError(
      {
        en: 'Invalid category. Use all, food, grocery, pharmacy, fashion, retail, or a category ObjectId',
        de: 'Ungültige Kategorie',
      },
      400,
      'VALIDATION_ERROR'
    );
  }

  const matchedCategories = await (Category as any)
    .find({ type: q, isActive: true, isDeleted: false })
    .select('_id')
    .lean();
  const categoryIds = (matchedCategories as Array<{ _id: mongoose.Types.ObjectId }>).map((c) => c._id);
  return { $in: categoryIds };
}
