import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { env } from '../config/env';
import { AppError } from '../utils/AppError';
import { MESSAGES } from '../constants/messages';
import { Driver } from '../models/Driver';
import { driverSessionMatches } from '../services/driverSession.service';

export interface DriverJwtPayload {
  _id: string;
  role: string;
  model: 'Driver';
  type?: 'access' | 'refresh';
  sessionVersion?: number;
}

const SESSION_REVOKED_ERROR = new AppError(
  {
    en: 'Session ended. Please sign in again (logged in on another device).',
    de: 'Sitzung beendet. Bitte erneut anmelden (Anmeldung auf anderem Gerät).',
  },
  401,
  'SESSION_REVOKED'
);

declare global {
  namespace Express {
    interface Request {
      driver?: Record<string, unknown> & { _id: mongoose.Types.ObjectId; status?: string; fcmTokens?: Array<{ token: string }> };
    }
  }
}

function getBearerToken(req: Request): string | undefined {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7);
  return undefined;
}

/** Verify Bearer JWT, resolve Driver by _id, attach req.driver. 403 if blocked. */
export function authDriver(req: Request, _res: Response, next: NextFunction): void {
  const token = getBearerToken(req);
  if (!token) {
    next(new AppError({ en: MESSAGES.AUTH.en.unauthorized, de: MESSAGES.AUTH.de.unauthorized }, 401, 'UNAUTHORIZED'));
    return;
  }

  let decoded: DriverJwtPayload;
  try {
    decoded = jwt.verify(token, env.JWT_SECRET) as DriverJwtPayload;
  } catch {
    next(new AppError({ en: MESSAGES.AUTH.en.invalidToken, de: MESSAGES.AUTH.de.invalidToken }, 401, 'INVALID_TOKEN'));
    return;
  }

  if (decoded.type !== undefined && decoded.type !== 'access') {
    next(new AppError({ en: MESSAGES.AUTH.en.invalidToken, de: MESSAGES.AUTH.de.invalidToken }, 401, 'INVALID_TOKEN'));
    return;
  }

  if (decoded.model !== 'Driver' || !decoded._id) {
    next(new AppError({ en: MESSAGES.AUTH.en.invalidToken, de: MESSAGES.AUTH.de.invalidToken }, 401, 'INVALID_TOKEN'));
    return;
  }

  Driver.findById(decoded._id)
    .select('+sessionVersion')
    .exec()
    .then((driver) => {
      if (!driver) {
        next(new AppError({ en: MESSAGES.DRIVER.en.notFound, de: MESSAGES.DRIVER.de.notFound }, 404, 'NOT_FOUND'));
        return;
      }
      if ((driver as { status?: string }).status === 'deleted') {
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
      if ((driver as { status?: string }).status === 'blocked') {
        next(new AppError({ en: 'Driver account is blocked', de: 'Fahrer-Konto ist gesperrt' }, 403, 'FORBIDDEN'));
        return;
      }
      const driverVersion = (driver as { sessionVersion?: number }).sessionVersion;
      if (!driverSessionMatches(decoded.sessionVersion, driverVersion)) {
        next(SESSION_REVOKED_ERROR);
        return;
      }
      req.driver = driver as unknown as Request['driver'];
      next();
    })
    .catch(next);
}

/** After authenticateJWT + requireRole('driver') on /app/driver/* routes */
export function enforceDriverSession(req: Request, _res: Response, next: NextFunction): void {
  if (req.user?.model !== 'Driver' || !req.user._id) {
    next();
    return;
  }

  const tokenVersion = (req.user as { sessionVersion?: number }).sessionVersion;

  Driver.findById(req.user._id)
    .select('sessionVersion status')
    .lean()
    .then((driver) => {
      if (!driver) {
        next(new AppError({ en: MESSAGES.DRIVER.en.notFound, de: MESSAGES.DRIVER.de.notFound }, 404, 'NOT_FOUND'));
        return;
      }
      if (driver.status === 'deleted') {
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
      if (driver.status === 'blocked') {
        next(new AppError({ en: 'Driver account is blocked', de: 'Fahrer-Konto ist gesperrt' }, 403, 'FORBIDDEN'));
        return;
      }
      if (!driverSessionMatches(tokenVersion, driver.sessionVersion)) {
        next(SESSION_REVOKED_ERROR);
        return;
      }
      next();
    })
    .catch(next);
}

