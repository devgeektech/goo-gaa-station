import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/AppError';

/**
 * Use AFTER authVendor. Ensures req.vendor.approvalStatus === 'approved'.
 * Returns 403 { message: 'Store not approved yet' } otherwise.
 */
export function requireApproved(req: Request, _res: Response, next: NextFunction): void {
  const vendor = (req as Request & { vendor?: { approvalStatus?: string } }).vendor;
  if (!vendor) {
    next(new AppError({ en: 'Vendor not found', de: 'Anbieter nicht gefunden' }, 401, 'UNAUTHORIZED'));
    return;
  }
  if (vendor.approvalStatus !== 'approved') {
    next(
      new AppError(
        { en: 'Store not approved yet', de: 'Geschäft noch nicht freigegeben' },
        403,
        'FORBIDDEN'
      )
    );
    return;
  }
  next();
}
