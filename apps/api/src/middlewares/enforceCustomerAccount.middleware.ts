import type { Request, Response, NextFunction } from 'express';
import { User } from '../models/User';
import { createAccountBlockedError } from '../utils/accountBlockError';
import { AppError } from '../utils/AppError';

/** After authenticateJWT — reject blocked/deleted customers on protected routes. */
export function enforceCustomerAccount(req: Request, _res: Response, next: NextFunction): void {
  if (req.user?.model !== 'User' || !req.user._id) {
    next();
    return;
  }

  User.findById(req.user._id)
    .select('status blockReason')
    .lean()
    .then((user) => {
      if (!user) {
        next(new AppError({ en: 'Customer not found', de: 'Kunde nicht gefunden' }, 404, 'NOT_FOUND'));
        return;
      }
      if (user.status === 'deleted') {
        next(
          new AppError(
            {
              en: 'Account has been removed. Please sign in again with your phone number.',
              de: 'Konto wurde entfernt. Bitte melden Sie sich erneut mit Ihrer Telefonnummer an.',
            },
            403,
            'ACCOUNT_DELETED'
          )
        );
        return;
      }
      if (user.status === 'blocked') {
        next(createAccountBlockedError(user.blockReason));
        return;
      }
      next();
    })
    .catch(next);
}
