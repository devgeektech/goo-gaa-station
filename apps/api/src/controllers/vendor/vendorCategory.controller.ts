import type { Request, Response } from 'express';
import { Category } from '../../models/Category';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/response';

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
 * Only types that have at least one active category are included.
 */
export const listVendorCategories = asyncHandler(async (_req: Request, res: Response) => {
  const categories = await Category.find({
    isActive: true,
    isDeleted: false,
  })
    .sort({ type: 1, sortOrder: 1 })
    .select('_id name slug icon type sortOrder')
    .lean()
    .exec();

  const grouped = (categories as CategoryDoc[]).reduce<
    Array<{ type: string; categories: ReturnType<typeof formatCat>[] }>
  >((acc, cat) => {
    const existing = acc.find((g) => g.type === cat.type);
    const formatted = formatCat(cat);
    if (existing) {
      existing.categories.push(formatted);
    } else {
      acc.push({ type: cat.type, categories: [formatted] });
    }
    return acc;
  }, []);

  return sendSuccess(res, grouped);
});
