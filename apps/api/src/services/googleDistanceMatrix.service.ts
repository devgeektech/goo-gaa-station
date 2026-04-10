import { env } from '../config/env';

export type DistanceMatrixResult = {
  distanceText: string;
  durationMinutes: number;
};

type GoogleDistanceMatrixResponse = {
  status?: string;
  error_message?: string;
  rows?: Array<{
    elements?: Array<{
      status?: string;
      distance?: { text?: string; value?: number };
      duration?: { text?: string; value?: number };
    }>;
  }>;
};

/** Google allows at most 25 destination points per Distance Matrix request (single origin). */
const MAX_DESTINATIONS_PER_REQUEST = 25;

export async function getDistanceMatrixEstimates(args: {
  origin: { lat: number; lng: number };
  destinations: Array<{ lat: number; lng: number }>;
}): Promise<Array<DistanceMatrixResult | null>> {
  const key = env.GOOGLE_DISTANCE_MATRIX_API_KEY;
  if (!key || args.destinations.length === 0) {
    return args.destinations.map(() => null);
  }

  const out: Array<DistanceMatrixResult | null> = [];
  for (let offset = 0; offset < args.destinations.length; offset += MAX_DESTINATIONS_PER_REQUEST) {
    const chunk = args.destinations.slice(offset, offset + MAX_DESTINATIONS_PER_REQUEST);
    const chunkResults = await fetchDistanceMatrixChunk(args.origin, chunk, key);
    out.push(...chunkResults);
  }
  return out;
}

async function fetchDistanceMatrixChunk(
  origin: { lat: number; lng: number },
  destinations: Array<{ lat: number; lng: number }>,
  key: string
): Promise<Array<DistanceMatrixResult | null>> {
  const originStr = `${origin.lat},${origin.lng}`;
  const destStr = destinations.map((d) => `${d.lat},${d.lng}`).join('|');

  const url = new URL('https://maps.googleapis.com/maps/api/distancematrix/json');
  url.searchParams.set('origins', originStr);
  url.searchParams.set('destinations', destStr);
  url.searchParams.set('mode', 'driving');
  url.searchParams.set('units', 'metric');
  url.searchParams.set('key', key);

  const resp = await fetch(url.toString(), { method: 'GET' });
  if (!resp.ok) return destinations.map(() => null);

  const json = (await resp.json()) as GoogleDistanceMatrixResponse;
  if (json.status && json.status !== 'OK') {
    if (process.env.NODE_ENV === 'development' && json.error_message) {
      console.warn('[Distance Matrix]', json.status, json.error_message);
    }
    return destinations.map(() => null);
  }

  const elements = json.rows?.[0]?.elements ?? [];
  if (!Array.isArray(elements) || elements.length === 0) return destinations.map(() => null);

  return destinations.map((_, idx) => {
    const el = elements[idx];
    if (!el || el.status !== 'OK') return null;
    const distanceText = el.distance?.text;
    const durationSec = el.duration?.value;
    if (!distanceText || durationSec == null || !Number.isFinite(durationSec)) return null;
    return { distanceText, durationMinutes: Math.max(1, Math.ceil(durationSec / 60)) };
  });
}
