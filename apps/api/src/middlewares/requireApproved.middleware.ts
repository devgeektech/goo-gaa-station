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

/**
 * Use AFTER authVendor on /vendor/profile only.
 * Allows vendors still onboarding (approvalStatus none) and approved stores.
 * Returns 403 only after submit while waiting for admin (pending), or when rejected.
 */
export function blockIfAwaitingApproval(req: Request, _res: Response, next: NextFunction): void {
  const vendor = (req as Request & { vendor?: { approvalStatus?: string; rejectionReason?: string | null } }).vendor;
  if (!vendor) {
    next(new AppError({ en: 'Vendor not found', de: 'Anbieter nicht gefunden' }, 401, 'UNAUTHORIZED'));
    return;
  }

  const approval = vendor.approvalStatus ?? 'none';
  if (approval === 'approved' || approval === 'none') {
    next();
    return;
  }

  if (approval === 'pending') {
    next(
      new AppError(
        { en: 'Store not approved yet', de: 'Geschäft noch nicht freigegeben' },
        403,
        'FORBIDDEN'
      )
    );
    return;
  }

  if (approval === 'rejected') {
    const reason = typeof vendor.rejectionReason === 'string' ? vendor.rejectionReason.trim() : '';
    next(
      new AppError(
        {
          en: reason ? `Application rejected: ${reason}` : 'Application rejected',
          de: reason ? `Antrag abgelehnt: ${reason}` : 'Antrag abgelehnt',
        },
        403,
        'FORBIDDEN'
      )
    );
    return;
  }

  next(
    new AppError(
      { en: 'Store not approved yet', de: 'Geschäft noch nicht freigegeben' },
      403,
      'FORBIDDEN'
    )
  );
}
