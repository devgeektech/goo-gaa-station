import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { AppError } from '../utils/AppError';
import { MESSAGES } from '../constants/messages';
import { Vendor } from '../models/Vendor';

export interface VendorJwtPayload {
  _id: string;
  phone?: string;
  role: string;
  model: string;
  type?: 'access' | 'refresh';
}

declare global {
  namespace Express {
    interface Request {
      vendor?: Record<string, unknown> & { _id: unknown; status?: string };
    }
  }
}

function getBearerToken(req: Request): string | undefined {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7);
  return undefined;
}

/** Verify Bearer JWT, resolve Vendor by _id, attach req.vendor. 403 if vendor is blocked. */
export function authVendor(req: Request, res: Response, next: NextFunction): void {
  const token = getBearerToken(req);
  if (!token) {
    next(new AppError({ en: MESSAGES.AUTH.en.unauthorized, de: MESSAGES.AUTH.de.unauthorized }, 401, 'UNAUTHORIZED'));
    return;
  }

  let decoded: VendorJwtPayload;
  try {
    decoded = jwt.verify(token, env.JWT_SECRET) as VendorJwtPayload;
  } catch {
    next(new AppError({ en: MESSAGES.AUTH.en.invalidToken, de: MESSAGES.AUTH.de.invalidToken }, 401, 'INVALID_TOKEN'));
    return;
  }
  if (decoded.type !== undefined && decoded.type !== 'access') {
    next(new AppError({ en: MESSAGES.AUTH.en.invalidToken, de: MESSAGES.AUTH.de.invalidToken }, 401, 'INVALID_TOKEN'));
    return;
  }
  if (decoded.model !== 'Vendor' || !decoded._id) {
    next(new AppError({ en: MESSAGES.AUTH.en.invalidToken, de: MESSAGES.AUTH.de.invalidToken }, 401, 'INVALID_TOKEN'));
    return;
  }

  Vendor.findById(decoded._id)
    .lean()
    .exec()
    .then((v) => {
      if (!v) {
        next(new AppError({ en: 'Vendor not found', de: 'Anbieter nicht gefunden' }, 404, 'NOT_FOUND'));
        return;
      }
      if ((v as { status?: string }).status === 'blocked') {
        next(new AppError({ en: 'Vendor account is blocked', de: 'Anbieter-Konto ist gesperrt' }, 403, 'FORBIDDEN'));
        return;
      }
      (req as Request).vendor = v as Request['vendor'];
      next();
    })
    .catch(next);
}
