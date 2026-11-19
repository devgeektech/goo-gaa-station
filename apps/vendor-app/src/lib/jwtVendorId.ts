type Payload = { _id?: string; sub?: string; model?: string };

function decodeJwtPayload(token: string): Payload | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const padded = part.replace(/-/g, '+').replace(/_/g, '/');
    const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
    return JSON.parse(globalThis.atob(padded + pad)) as Payload;
  } catch {
    return null;
  }
}

export function getVendorIdFromAccessToken(token: string): string | null {
  const p = decodeJwtPayload(token);
  if (!p) return null;
  if (p.model && p.model !== 'Vendor') return null;
  return p._id ?? p.sub ?? null;
}
