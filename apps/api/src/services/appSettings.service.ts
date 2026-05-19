import { AppSettings } from '../models/AppSettings';

const ENV_COMMISSION_PERCENT = Number(process.env.PLATFORM_COMMISSION_RATE ?? 0.15) * 100;

/** Admin commission % (0–100) from AppSettings, legacy taxPercent, or env default. */
export async function getCommissionPercent(): Promise<number> {
  const settings = await AppSettings.findOne().select('commissionPercent taxPercent').lean();
  const raw = settings?.commissionPercent ?? (settings as { taxPercent?: number } | null)?.taxPercent;
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) {
    return Math.min(raw, 100);
  }
  return Number.isFinite(ENV_COMMISSION_PERCENT) ? Math.min(Math.max(ENV_COMMISSION_PERCENT, 0), 100) : 15;
}

/** Decimal rate for financial math (e.g. 15 → 0.15). */
export async function getPlatformCommissionRate(): Promise<number> {
  const pct = await getCommissionPercent();
  return pct / 100;
}

export function normalizeAppSettingsForApi<T extends Record<string, unknown>>(settings: T): T & { commissionPercent: number } {
  const doc = { ...settings } as T & { commissionPercent?: number; taxPercent?: number };
  if (doc.commissionPercent == null && typeof doc.taxPercent === 'number') {
    doc.commissionPercent = doc.taxPercent;
  }
  if (doc.commissionPercent == null) {
    doc.commissionPercent = ENV_COMMISSION_PERCENT;
  }
  delete doc.taxPercent;
  return doc as T & { commissionPercent: number };
}
