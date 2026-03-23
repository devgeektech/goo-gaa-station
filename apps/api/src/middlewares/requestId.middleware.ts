import type { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

/** Attach a UUID to each request (req.requestId) and set X-Request-Id header */
export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const id = uuidv4();
  req.requestId = id;
  res.setHeader('X-Request-Id', id);
  next();
}
