import type { Request, Response } from 'express';
import { Category } from '../../models/Category';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/response';
import { orderedCategoryTypes } from '../../utils/categoryTypes';

type CategoryDoc = { _id: unknown; name: string; slug?: string; icon?: string | null; type: string; sortOrder?: number };

function formatCat(c: CategoryDoc): { _id: string; name: string; slug: string; icon: string | null; sortOrder: number } {
  return {
    _id: String(c._id),
    name: c.name,
    slug: c.slug ?? '',
    icon: c.icon ?? null,
    sortOrder: c.sortOrder ?? 0,
  };
}

/**
 * GET /api/v1/vendor/categories
 * Auth: authVendor + requireApproved.
 * Returns categories grouped by type: [ { type, categories: [...] }, ... ].
 * Type order: food → grocery → pharmacy → fashion → retail.
 * Only types that have at least one active category are included.
 */
export const listVendorCategories = asyncHandler(async (_req: Request, res: Response) => {
  const categories = await Category.find({
    isActive: true,
    isDeleted: false,
  })
    .sort({ sortOrder: 1, name: 1 })
    .select('_id name slug icon type sortOrder')
    .lean()
    .exec();

  const groupsByType = new Map<string, ReturnType<typeof formatCat>[]>();
  for (const cat of categories as CategoryDoc[]) {
    const key = cat.type;
    if (!groupsByType.has(key)) groupsByType.set(key, []);
    groupsByType.get(key)!.push(formatCat(cat));
  }

  const grouped = orderedCategoryTypes(groupsByType.keys()).map((type) => ({
    type,
    categories: groupsByType.get(type)!,
  }));

  return sendSuccess(res, grouped);
});
