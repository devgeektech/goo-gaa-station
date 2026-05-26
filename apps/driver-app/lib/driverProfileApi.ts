import axios, { type AxiosInstance } from 'axios';
import { API_URL } from '@/lib/config';

export type DriverPresenceStatus = 'online' | 'offline';

function client(accessToken: string): AxiosInstance {
  return axios.create({
    baseURL: `${API_URL.replace(/\/$/, '')}/api/v1`,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
    timeout: 30_000,
  });
}

/** PATCH /driver/profile/status — sets isOnline (approved drivers only). */
export async function patchDriverPresenceStatus(accessToken: string, status: DriverPresenceStatus) {
  const res = await client(accessToken).patch<{ success: boolean; data: { status: DriverPresenceStatus } }>(
    '/driver/profile/status',
    { status }
  );
  return res.data.data;
}
