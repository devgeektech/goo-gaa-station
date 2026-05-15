import 'express-async-errors';
import path from 'path';
import express, { type Request } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import mongoSanitize from 'express-mongo-sanitize';

import { env } from './config/env';
import { requestIdMiddleware } from './middlewares/requestId.middleware';
import { notFoundMiddleware } from './middlewares/notFound.middleware';
import { errorMiddleware } from './middlewares/error.middleware';
import swaggerUi from 'swagger-ui-express';
import routes from './routes';
import { paymentCallback, wifipayWebhookHandler } from './controllers/payment.controller';
import customerChatRouter from './routes/customer/chat';
import driverChatRouter from './routes/driver/chat';
import { authenticateJWT, requireRole } from './middlewares/auth.middleware';
import { authDriver } from './middlewares/authDriver.middleware';

const app = express();
app.set('trust proxy', 1);

// --- WifiPay webhooks (raw body) — MUST be before json parser; public, signature verification in handler ---
app.use('/api/v1/payment/callback', express.raw({ type: '*/*' }), paymentCallback);
app.use('/api/v1/webhooks/wifipay', express.raw({ type: '*/*' }), wifipayWebhookHandler);

// --- Body parsing: 10mb JSON, 10mb urlencoded; multipart limits vary per route (profile/vendor images 10MB, product 2MB, KYC 5MB) ---
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// --- Security: sanitize after body parser (no $ or . in req body) ---
app.use(mongoSanitize());
// app.use(compression() as unknown as express.RequestHandler);

// --- CORS: whitelist from ALLOWED_ORIGINS env, or single CLIENT_ORIGIN ---
const allowedOrigins = env.ALLOWED_ORIGINS.length > 0 ? env.ALLOWED_ORIGINS : [env.CLIENT_ORIGIN];
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.includes(origin)) cb(null, true);
      else cb(null, false);
    },
    credentials: true,
  })
);

// --- Helmet with CSP (scriptSrc unsafe-inline for Swagger UI at /api-docs) ---
app.use(
  helmet({
    // Allow the admin web app (different origin) to display uploaded images/docs
    // via <img src="http://api-host/uploads/..."> and <a href=...>.
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
      },
    },
  })
);

// --- Logging (dev only) ---
if (env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// --- Request ID ---
app.use(requestIdMiddleware);

function getAuthRateLimitKey(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const phone = (body as { phone?: unknown }).phone;
  if (typeof phone !== 'string') return null;
  const normalized = phone.trim().replace(/\s/g, '');
  return normalized.length > 0 ? normalized : null;
}

// --- Rate limits ---
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  skip: (req) =>
    req.path === '/api/health' || req.path.startsWith('/api/v1/admin'),
});
app.use(globalLimiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: (req) => {
    const phoneKey = getAuthRateLimitKey(req.body);
    if (phoneKey) return `auth:phone:${phoneKey}`;
    return `auth:ip:${req.ip ?? 'unknown'}`;
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    const resetTime = (req as Request & { rateLimit?: { resetTime?: number } }).rateLimit?.resetTime;
    const waitMinutes = resetTime ? Math.max(1, Math.ceil((resetTime - Date.now()) / 60000)) : 15;
    res.status(429).json({
      success: false,
      message: `Too many requests. Please try again after ${waitMinutes} minute(s).`,
      waitMinutes,
    });
  },
});
// Temporarily disabled: keep only OTP-specific rate limits active during testing.
// app.use('/api/v1/auth', authLimiter);

const customerOtpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 50,
  keyGenerator: (req) => {
    const phone = req.body?.phone;
    return typeof phone === 'string' ? String(phone).trim().replace(/\s/g, '') : (req.ip ?? 'unknown');
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    const resetTime = (req as Request & { rateLimit?: { resetTime?: number } }).rateLimit?.resetTime;
    const waitMinutes = resetTime ? Math.max(1, Math.ceil((resetTime - Date.now()) / 60000)) : 60;
    res.status(429).json({
      success: false,
      message: `Too many OTP requests. Please try again after ${waitMinutes} minute(s).`,
      waitMinutes,
    });
  },
});
app.use('/api/v1/auth/customer/send-otp', customerOtpLimiter);
app.use('/api/v1/auth/customer/resend-otp', customerOtpLimiter);

const vendorOtpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 50,
  keyGenerator: (req) => {
    const phone = req.body?.phone;
    return typeof phone === 'string' ? String(phone).trim().replace(/\s/g, '') : (req.ip ?? 'unknown');
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    const resetTime = (req as Request & { rateLimit?: { resetTime?: number } }).rateLimit?.resetTime;
    const waitMinutes = resetTime ? Math.max(1, Math.ceil((resetTime - Date.now()) / 60000)) : 60;
    res.status(429).json({
      success: false,
      message: `Too many OTP requests. Please try again after ${waitMinutes} minute(s).`,
      waitMinutes,
    });
  },
});
app.use('/api/v1/auth/vendor/send-otp', vendorOtpLimiter);
app.use('/api/v1/auth/vendor/resend-otp', vendorOtpLimiter);

const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
});
app.use('/api/v1/admin', adminLimiter);

// --- Static uploads (local storage only) ---
if ((env.STORAGE_PROVIDER || 'local').toLowerCase() === 'local') {
  const uploadsPath = path.join(process.cwd(), env.UPLOAD_DIR);
  app.use('/uploads', express.static(uploadsPath));
}

// --- API routes (health at /api/health, v1 at /api/v1) ---
app.use('/api', routes);

// ── PHASE 14: Driver <-> Customer Chat ─────────────────────────────
const authApp = [authenticateJWT, requireRole('user')];
app.use('/api/v1/app/orders/:orderId/chat', authApp, customerChatRouter);
app.use('/api/v1/driver/orders/:orderId/chat', authDriver, driverChatRouter);
// ── END PHASE 14 ────────────────────────────────────────────────────

// --- Swagger UI: interactive API docs at /api-docs (for app team) ---
app.use(
  '/api-docs',
  swaggerUi.serve,
  swaggerUi.setup(null, {
    swaggerOptions: { url: '/api/openapi.json' },
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'Goo-Gaa Station API',
  })
);

// --- 404 then global error handler ---
app.use(notFoundMiddleware);
app.use(errorMiddleware);

export default app;
