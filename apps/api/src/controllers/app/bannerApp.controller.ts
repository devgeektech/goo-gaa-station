import type { Request, Response } from 'express';
import { Banner } from '../../models/Banner';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/response';

/** GET /api/v1/app/banners — Active banners only, sorted by position. */
export const listActiveBanners = asyncHandler(async (_req: Request, res: Response) => {
  const banners = await Banner.find({ isActive: true })
    .select('image heading text buttonText buttonUrl position isActive')
    .sort({ position: 1, createdAt: -1 })
    .lean();
  return sendSuccess(res, { banners, total: banners.length });
});
