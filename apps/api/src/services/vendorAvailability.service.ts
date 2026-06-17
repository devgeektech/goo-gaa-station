type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export type VendorAvailabilityInput = {
  isOpen?: boolean | null;
  timezone?: string | null;
  operatingHours?: Array<{ day?: string; isOpen?: boolean; from?: string | null; to?: string | null }> | null;
};

function toMinutes(hhmm: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isInteger(hh) || !Number.isInteger(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

function resolveVendorTimezone(vendor: VendorAvailabilityInput): string {
  const tz = String(vendor?.timezone || '').trim() || 'Asia/Kolkata';
  try {
    Intl.DateTimeFormat('en-US', { timeZone: tz }).format(new Date());
    return tz;
  } catch {
    return 'UTC';
  }
}

function getVendorLocalNow(
  nowUtc: Date,
  timezone: string
): { dayKey: DayKey; nowMin: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(nowUtc);
  const weekday = parts.find((p) => p.type === 'weekday')?.value?.toLowerCase() ?? 'sun';
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  const map: Record<string, DayKey> = {
    mon: 'mon',
    tue: 'tue',
    wed: 'wed',
    thu: 'thu',
    fri: 'fri',
    sat: 'sat',
    sun: 'sun',
  };
  const dayKey = map[weekday.slice(0, 3)] ?? 'sun';
  const nowMin = (Number.isFinite(hour) ? hour : 0) * 60 + (Number.isFinite(minute) ? minute : 0);
  return { dayKey, nowMin };
}

function isWithinOperatingHours(vendor: VendorAvailabilityInput, now: Date): boolean {
  const timezone = resolveVendorTimezone(vendor);
  const { dayKey, nowMin } = getVendorLocalNow(now, timezone);
  const todays = Array.isArray(vendor?.operatingHours)
    ? vendor.operatingHours.find((x) => x?.day === dayKey)
    : null;
  if (!todays || todays?.isOpen !== true) return false;

  const fromMin = toMinutes(String(todays?.from ?? ''));
  const toMin = toMinutes(String(todays?.to ?? ''));
  if (fromMin == null || toMin == null) return false;

  if (fromMin <= toMin) return nowMin >= fromMin && nowMin <= toMin;
  return nowMin >= fromMin || nowMin <= toMin;
}

/** True when global isOpen is on and current time is inside today's operating window. */
export function isVendorAvailableNow(vendor: VendorAvailabilityInput, now: Date = new Date()): boolean {
  if (vendor?.isOpen !== true) return false;
  return isWithinOperatingHours(vendor, now);
}

export type VendorAvailabilityStatus = {
  isAvailableNow: boolean;
  isOpen: boolean;
  withinOperatingHours: boolean;
};

export function getVendorAvailabilityStatus(
  vendor: VendorAvailabilityInput,
  now: Date = new Date()
): VendorAvailabilityStatus {
  const isOpen = vendor?.isOpen === true;
  const withinOperatingHours = isOpen ? isWithinOperatingHours(vendor, now) : false;
  return {
    isAvailableNow: isOpen && withinOperatingHours,
    isOpen,
    withinOperatingHours,
  };
}

/** Attach computed availability fields to a vendor payload (keeps DB `isOpen` unchanged). */
export function applyVendorAvailabilityFields<T extends VendorAvailabilityInput>(
  vendor: T,
  now: Date = new Date()
): T & VendorAvailabilityStatus {
  const status = getVendorAvailabilityStatus(vendor, now);
  return Object.assign(vendor, status);
}

export function applyVendorAvailabilityFieldsMany<T extends VendorAvailabilityInput>(
  vendors: T[],
  now: Date = new Date()
): Array<T & VendorAvailabilityStatus> {
  return vendors.map((v) => applyVendorAvailabilityFields(v, now));
}
