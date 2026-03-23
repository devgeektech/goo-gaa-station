import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { AppError } from '../utils/AppError';
import { MESSAGES } from '../constants/messages';
import type { JwtPayload } from './auth.middleware';

declare global {
  namespace Express {
    interface Request {
      admin?: JwtPayload;
    }
  }
}

/**
 * Admin auth: verify accessToken from httpOnly cookie only → attach req.admin (and req.user for compatibility).
 * Use on routes under /api/v1/auth/admin or /api/v1/admin.
 */
export function authAdmin(req: Request, _res: Response, next: NextFunction): void {
  const accessToken = req.cookies?.accessToken;
  if (!accessToken) {
    throw new AppError(
      { en: MESSAGES.AUTH.en.unauthorized, de: MESSAGES.AUTH.de.unauthorized },
      401,
      'UNAUTHORIZED'
    );
  }

  try {
    const decoded = jwt.verify(accessToken, env.JWT_SECRET) as JwtPayload;
    if (decoded.type && decoded.type !== 'access') {
      throw new AppError(
        { en: MESSAGES.AUTH.en.invalidToken, de: MESSAGES.AUTH.de.invalidToken },
        401,
        'INVALID_TOKEN'
      );
    }
    if (decoded.model !== 'Admin') {
      throw new AppError(
        { en: MESSAGES.AUTH.en.invalidToken, de: MESSAGES.AUTH.de.invalidToken },
        401,
        'INVALID_TOKEN'
      );
    }
    req.admin = decoded;
    (req as Request & { user?: JwtPayload }).user = decoded;
    next();
  } catch {
    throw new AppError(
      { en: MESSAGES.AUTH.en.invalidToken, de: MESSAGES.AUTH.de.invalidToken },
      401,
      'INVALID_TOKEN'
    );
  }
}
