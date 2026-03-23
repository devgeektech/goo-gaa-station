import type { Response } from 'express';

/**
 * Send a success JSON response.
 * @param meta - Optional meta object (e.g. pagination) merged into the payload
 */
export function sendSuccess<T>(
  res: Response,
  data: T,
  statusCode = 200,
  meta?: Record<string, unknown>
): Response {
  const payload = meta ? { success: true, data, ...meta } : { success: true, data };
  return res.status(statusCode).json(payload);
}

/** Send an error JSON response. message can be string or { en, de }. */
export function sendError(
  res: Response,
  message: string | { en: string; de: string },
  statusCode = 400
): Response {
  const payload =
    typeof message === 'string'
      ? { success: false, message: { en: message, de: message } }
      : { success: false, message };
  return res.status(statusCode).json(payload);
}
