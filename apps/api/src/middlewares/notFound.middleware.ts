import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/AppError';
import { MESSAGES } from '../constants/messages';

/** 404 handler — no route matched */
export function notFoundMiddleware(
  _req: Request,
  _res: Response,
  next: NextFunction
): void {
  next(
    new AppError(
      { en: MESSAGES.GENERAL.en.notFound, de: MESSAGES.GENERAL.de.notFound },
      404,
      'NOT_FOUND'
    )
  );
}
