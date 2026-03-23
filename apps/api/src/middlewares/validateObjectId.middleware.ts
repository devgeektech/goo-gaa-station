import type { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { AppError } from '../utils/AppError';

/**
 * Express param middleware: validates that req.params[paramName] is a valid MongoDB ObjectId.
 * Use with router.param('id', validateObjectId) on routers that have :id (or :userId etc.) in the path.
 * Returns 400 if invalid.
 */
export function validateObjectId(
  req: Request,
  _res: Response,
  next: NextFunction,
  value: string,
  paramName = 'id'
): void {
  if (!value || !mongoose.Types.ObjectId.isValid(value)) {
    next(new AppError({ en: 'Invalid ID', de: 'Ungültige ID' }, 400, 'VALIDATION_ERROR'));
    return;
  }
  next();
}

/** Bind for router.param('id', ...) */
export const validateIdParam = (
  req: Request,
  res: Response,
  next: NextFunction,
  id: string
) => validateObjectId(req, res, next, id, 'id');
