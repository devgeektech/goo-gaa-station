import type { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { AppError } from '../utils/AppError';
import { MESSAGES } from '../constants/messages';
import mongoose from 'mongoose';
import type { JsonWebTokenError, TokenExpiredError } from 'jsonwebtoken';

interface ErrorResponse {
  success: false;
  code?: string;
  message: { en: string; de: string };
  data: null;
  requestId?: string;
}

/** Global error handler: AppError, Mongoose errors, JWT errors, unknown → 500 */
export function errorMiddleware(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const requestId = req.requestId;

  // AppError (operational)
  if (err instanceof AppError) {
    const body: ErrorResponse = {
      success: false,
      code: err.code,
      message: err.messageObj,
      data: null,
      requestId,
    };
    res.status(err.statusCode).json(body);
    return;
  }

  // Mongoose ValidationError → 400 with field errors
  if (err instanceof mongoose.Error.ValidationError) {
    const fieldErrors: Record<string, string> = {};
    for (const key of Object.keys(err.errors)) {
      const e = err.errors[key];
      fieldErrors[key] = e?.message ?? 'Invalid';
    }
    res.status(400).json({
      success: false,
      code: 'VALIDATION_ERROR',
      message: {
        en: MESSAGES.GENERAL.en.validationError,
        de: MESSAGES.GENERAL.de.validationError,
      },
      data: { errors: fieldErrors },
      requestId,
    });
    return;
  }

  // MongoDB unreachable / timeout (connection or server selection)
  const mongoErr = err as mongoose.mongo.MongoServerError & { code?: string };
  if (mongoErr.name === 'MongoServerSelectionError' || mongoErr.name === 'MongoNetworkError' || mongoErr.code === 'ECONNREFUSED') {
    console.error('Database unreachable:', mongoErr.message);
    res.status(503).json({
      success: false,
      code: 'SERVICE_UNAVAILABLE',
      message: {
        en: 'Database is unavailable. Check MongoDB is running and MONGO_URI is correct.',
        de: 'Datenbank nicht erreichbar. MongoDB prüfen und MONGO_URI prüfen.',
      },
      data: null,
      requestId,
    });
    return;
  }

  // Mongoose duplicate key (11000)
  if (err instanceof mongoose.mongo.MongoServerError && err.code === 11000) {
    const field = err.message.includes('index:') ? err.message.split('index:')[1]?.split(' ')[1]?.replace(/_1/g, '') : 'field';
    res.status(409).json({
      success: false,
      code: 'DUPLICATE_KEY',
      message: {
        en: `Duplicate value for ${field}`,
        de: `Doppelter Wert für ${field}`,
      },
      data: null,
      requestId,
    });
    return;
  }

  // Missing JWT config (JWT_SECRET / JWT_REFRESH_SECRET not set or empty in .env)
  const isJwtConfigError =
    (err.message?.includes('JWT_SECRET') && err.message?.includes('JWT_REFRESH_SECRET')) ||
    err.message === 'secretOrPrivateKey must have a value';
  if (isJwtConfigError) {
    console.error('Config error:', err.message);
    res.status(503).json({
      success: false,
      code: 'CONFIG_ERROR',
      message: {
        en: 'JWT_SECRET and JWT_REFRESH_SECRET must be set in .env (or .env.development). Add them and restart the API.',
        de: 'JWT_SECRET und JWT_REFRESH_SECRET müssen in .env gesetzt werden. Bitte setzen und API neu starten.',
      },
      data: null,
      requestId,
    });
    return;
  }

  // Multer errors (file too large, wrong field, etc.) → 413 or 400
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({
        success: false,
        code: 'FILE_TOO_LARGE',
        message: {
          en: 'File too large. Please upload a smaller file (e.g. logo max 2MB).',
          de: 'Datei zu groß. Bitte eine kleinere Datei hochladen (z. B. Logo max. 2MB).',
        },
        data: err.field ? { field: err.field } : null,
        requestId,
      });
      return;
    }
    res.status(400).json({
      success: false,
      code: 'UPLOAD_ERROR',
      message: {
        en: err.message || 'Upload error',
        de: err.message || 'Upload-Fehler',
      },
      data: err.field ? { field: err.field } : null,
      requestId,
    });
    return;
  }

  // JWT errors → 401
  const jwtError = err as JsonWebTokenError | TokenExpiredError;
  if (jwtError.name === 'JsonWebTokenError' || jwtError.name === 'TokenExpiredError') {
    res.status(401).json({
      success: false,
      code: jwtError.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN',
      message: {
        en: jwtError.name === 'TokenExpiredError' ? MESSAGES.AUTH.en.tokenExpired : MESSAGES.AUTH.en.invalidToken,
        de: jwtError.name === 'TokenExpiredError' ? MESSAGES.AUTH.de.tokenExpired : MESSAGES.AUTH.de.invalidToken,
      },
      data: null,
      requestId,
    });
    return;
  }

  // Unknown: log full stack, return 500
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    code: 'INTERNAL_ERROR',
    message: {
      en: MESSAGES.GENERAL.en.serverError,
      de: MESSAGES.GENERAL.de.serverError,
    },
    data: null,
    requestId,
  });
}
