import { env } from '../config/env';

export type DistanceMatrixResult = {
  distanceText: string;
  durationMinutes: number;
};

type GoogleDistanceMatrixResponse = {
  status?: string;
  rows?: Array<{
    elements?: Array<{
      status?: string;
      distance?: { text?: string; value?: number };
      duration?: { text?: string; value?: number };
    }>;
  }>;
};

export async function getDistanceMatrixEstimates(args: {
  origin: { lat: number; lng: number };
  destinations: Array<{ lat: number; lng: number }>;
}): Promise<Array<DistanceMatrixResult | null>> {
  // Fallback-only mode for now (no Google key configured yet).
  // When key is ready, uncomment the "live estimation" block below.
  const key = env.GOOGLE_DISTANCE_MATRIX_API_KEY;
  void key;
  void args.origin;
  return args.destinations.map(() => null);

  /*
  // Live estimation (enable later):
  const key = env.GOOGLE_DISTANCE_MATRIX_API_KEY;
  if (!key) return args.destinations.map(() => null);
  if (args.destinations.length === 0) return [];

  const origin = `${args.origin.lat},${args.origin.lng}`;
  const destinations = args.destinations.map((d) => `${d.lat},${d.lng}`).join('|');

  const url = new URL('https://maps.googleapis.com/maps/api/distancematrix/json');
  url.searchParams.set('origins', origin);
  url.searchParams.set('destinations', destinations);
  url.searchParams.set('mode', 'driving');
  url.searchParams.set('key', key);

  const resp = await fetch(url.toString(), { method: 'GET' });
  if (!resp.ok) return args.destinations.map(() => null);

  const json = (await resp.json()) as GoogleDistanceMatrixResponse;
  const elements = json.rows?.[0]?.elements ?? [];
  if (!Array.isArray(elements) || elements.length === 0) return args.destinations.map(() => null);

  return args.destinations.map((_, idx) => {
    const el = elements[idx];
    if (!el || el.status !== 'OK') return null;
    const distanceText = el.distance?.text;
    const durationSec = el.duration?.value;
    if (!distanceText || durationSec == null || !Number.isFinite(durationSec)) return null;
    return { distanceText, durationMinutes: Math.max(1, Math.ceil(durationSec / 60)) };
  });
  */
}

