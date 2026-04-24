import path from 'path';
import { config as dotenvSafeConfig } from 'dotenv-safe';
import { config as dotenvConfig } from 'dotenv';

const nodeEnv = process.env.NODE_ENV || 'development';
const isDev = nodeEnv === 'development';

/** API package root (apps/api) — env files are loaded from here and from cwd (monorepo root) */
const apiRoot = path.resolve(__dirname, '../..');
const cwd = process.cwd();

// 1) Load .env.${nodeEnv} from API package (required; runs example check)
dotenvSafeConfig({
  path: path.join(apiRoot, `.env.${nodeEnv}`),
  example: path.join(apiRoot, isDev ? '.env.example.minimal' : '.env.example'),
  allowEmptyValues: true,
});

// 2) Overlay .env from API package and from monorepo root (so your .env is read)
dotenvConfig({ path: path.join(apiRoot, '.env') });
if (cwd !== apiRoot) {
  dotenvConfig({ path: path.join(cwd, '.env') });
}

/** Validated env accessor — use this instead of process.env in app code */
export const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '5000', 10),
  MONGO_URI: process.env.MONGO_URI || '',
  JWT_SECRET: process.env.JWT_SECRET || '',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || '',
  JWT_EXPIRY: process.env.JWT_EXPIRY || '24h',
  JWT_REFRESH_EXPIRY: process.env.JWT_REFRESH_EXPIRY || '7d',
  STORAGE_PROVIDER: process.env.STORAGE_PROVIDER || 'local',
  UPLOAD_DIR: process.env.UPLOAD_DIR || 'uploads',
  AWS_BUCKET: process.env.AWS_BUCKET || '',
  AWS_REGION: process.env.AWS_REGION || '',
  AWS_ACCESS_KEY: process.env.AWS_ACCESS_KEY || '',
  AWS_SECRET_KEY: process.env.AWS_SECRET_KEY || '',
  /** Optional: public base URL for uploaded objects (e.g. CloudFront). If unset, virtual-hosted S3 URL is used. */
  AWS_S3_PUBLIC_BASE_URL: process.env.AWS_S3_PUBLIC_BASE_URL || '',
  /** Optional: custom S3 endpoint (e.g. MinIO). When set, path-style addressing is used. */
  AWS_S3_ENDPOINT: process.env.AWS_S3_ENDPOINT || '',
  WIFIPAY_API_URL: process.env.WIFIPAY_API_URL || '',
  WIFIPAY_API_KEY: process.env.WIFIPAY_API_KEY || '',
  WIFIPAY_WEBHOOK_SECRET: process.env.WIFIPAY_WEBHOOK_SECRET || '',
  ADMIN_DEFAULT_EMAIL: process.env.ADMIN_DEFAULT_EMAIL || 'admin@deliveryapp.com',
  ADMIN_DEFAULT_PASSWORD: process.env.ADMIN_DEFAULT_PASSWORD || 'Admin@12345',
  CLIENT_ORIGIN: process.env.CLIENT_ORIGIN || 'http://localhost:3000',
  /** Comma-separated origins for CORS; if set, used instead of CLIENT_ORIGIN for cors({ origin }) */
  ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
    : [] as string[],
  MAIL_PROVIDER: (process.env.MAIL_PROVIDER || 'mailtrap').toLowerCase(),
  SMTP_HOST: process.env.SMTP_HOST || 'smtp.mailtrap.io',
  SMTP_PORT: parseInt(process.env.SMTP_PORT || '2525', 10),
  SMTP_USER: process.env.SMTP_USER || '',
  SMTP_PASS: process.env.SMTP_PASS || '',
  SENDGRID_API_KEY: process.env.SENDGRID_API_KEY || '',
  FIREBASE_SERVICE_ACCOUNT: process.env.FIREBASE_SERVICE_ACCOUNT || '',
  /** Twilio WhatsApp OTP: Account SID, Auth Token, and WhatsApp sender number (e.g. 14155238886). */
  TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID || '',
  TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN || '',
  TWILIO_WHATSAPP_FROM: process.env.TWILIO_WHATSAPP_FROM || '',
  /** Optional: if set, send with MessagingServiceSid instead of From (WhatsApp sender attached to that service in Console). */
  TWILIO_MESSAGING_SERVICE_SID: process.env.TWILIO_MESSAGING_SERVICE_SID || '',
  /** Optional: Twilio SMS-capable number (E.164). If set, same OTP is also sent via SMS after WhatsApp (recommended when sandbox WhatsApp does not deliver). */
  TWILIO_SMS_FROM: process.env.TWILIO_SMS_FROM || '',
  /** SMS for vendor OTP (e.g. Africa's Talking). */
  SMS_PROVIDER: (process.env.SMS_PROVIDER || '').toLowerCase(),
  SMS_API_KEY: process.env.SMS_API_KEY || '',
  /** Google Maps Distance Matrix API key (used for vendor listing estimated time). */
  GOOGLE_DISTANCE_MATRIX_API_KEY: process.env.GOOGLE_DISTANCE_MATRIX_API_KEY || '',
} as const;
