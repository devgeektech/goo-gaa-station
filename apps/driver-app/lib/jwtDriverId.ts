import { jwtDecode } from 'jwt-decode';

type Payload = { _id?: string; sub?: string };

export function getDriverIdFromAccessToken(token: string): string | null {
  try {
    const p = jwtDecode<Payload>(token);
    return p._id ?? p.sub ?? null;
  } catch {
    return null;
  }
}
