import fs from 'fs';
import path from 'path';

const LOG_DIR = path.join(process.cwd(), 'logs');
const SECURITY_LOG = path.join(LOG_DIR, 'security.log');

function ensureLogDir(): void {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

/**
 * Log auth failures (and other security events) with IP and timestamp.
 * Writes to logs/security.log and console in development.
 */
export function logAuthFailure(params: {
  ip: string;
  route: string;
  reason: string;
  identifier?: string; // e.g. email (do not log password)
}): void {
  const line = `${new Date().toISOString()} [AUTH_FAIL] ip=${params.ip} route=${params.route} reason=${params.reason}${params.identifier ? ` identifier=${params.identifier}` : ''}\n`;
  try {
    ensureLogDir();
    fs.appendFileSync(SECURITY_LOG, line);
  } catch (err) {
    console.error('[securityLog] Failed to write:', err);
  }
  if (process.env.NODE_ENV === 'development') {
    process.stdout.write(line);
  }
}
