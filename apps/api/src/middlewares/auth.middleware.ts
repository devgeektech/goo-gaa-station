import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { AppError } from '../utils/AppError';
import { MESSAGES } from '../constants/messages';
import type { UserModelType } from '../models/RefreshToken';

export interface JwtPayload {
  _id: string;
  email?: string;
  phone?: string;
  role: string;
  model: UserModelType;
  type?: 'access' | 'refresh';
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

/** Get access token from cookie (admin) or Authorization Bearer (app) */
function getAccessToken(req: Request): string | undefined {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7);
  const fromCookie = req.cookies?.accessToken;
  if (fromCookie) return fromCookie;
  return undefined;
}

/** Verify JWT and attach decoded payload to req.user. 401 if missing or invalid. */
export function authenticateJWT(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const token = getAccessToken(req);
  if (!token) {
    throw new AppError(
      { en: MESSAGES.AUTH.en.unauthorized, de: MESSAGES.AUTH.de.unauthorized },
      401,
      'UNAUTHORIZED'
    );
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    // Accept only access tokens (from verify-otp or admin login). Reject refresh tokens.
    if (decoded.type !== undefined && decoded.type !== 'access') {
      throw new AppError(
        { en: MESSAGES.AUTH.en.invalidToken, de: MESSAGES.AUTH.de.invalidToken },
        401,
        'INVALID_TOKEN'
      );
    }
    req.user = decoded;
    next();
  } catch {
    throw new AppError(
      { en: MESSAGES.AUTH.en.invalidToken, de: MESSAGES.AUTH.de.invalidToken },
      401,
      'INVALID_TOKEN'
    );
  }
}

/** Require req.user.role to be one of the allowed roles. Use after authenticateJWT. */
export function requireRole(...allowedRoles: string[]) {
  console.log('allowedRoles', allowedRoles);

  return (req: Request, _res: Response, next: NextFunction): void => {
    console.log('req.user', req.user);
    if (!req.user) {
      throw new AppError(
        { en: MESSAGES.AUTH.en.unauthorized, de: MESSAGES.AUTH.de.unauthorized },
        401,
        'UNAUTHORIZED'
      );
    }
    if (!allowedRoles.includes(req.user.role)) {
      throw new AppError(
        { en: MESSAGES.AUTH.en.unauthorized, de: MESSAGES.AUTH.de.unauthorized },
        403,
        'FORBIDDEN'
      );
    }
    next();
  };
}

/** Attach req.user if valid token present; continue either way (no 401). */
export function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const token = getAccessToken(req);
  if (!token) {
    next();
    return;
  }
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    if (decoded.type !== undefined && decoded.type !== 'access') {
      next();
      return;
    }
    req.user = decoded;
  } catch {
    // ignore invalid token
  }
  next();
}
