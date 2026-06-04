import axios, { type AxiosInstance } from 'axios';
import { API_URL } from '@/lib/config';

export type DriverNewOrderCard = {
  orderId: string;
  orderNumber?: string | null;
  status?: string;
  estimatedPayout?: number | null;
  distance?: number | null;
  vendor?: { name?: string | null; address?: string | null };
  statusLabel?: string | null;
};

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

/** GET /driver/orders/new — orders broadcast to this driver during assignment window. */
export async function fetchDriverNewOrders(accessToken: string): Promise<DriverNewOrderCard[]> {
  const res = await client(accessToken).get<{
    success: boolean;
    data: DriverNewOrderCard[];
  }>('/driver/orders/new', { params: { page: 1, limit: 20 } });
  const rows = res.data?.data;
  return Array.isArray(rows) ? rows : [];
}

/** GET /driver/orders/active — in-progress deliveries assigned to this driver. */
export async function fetchDriverActiveOrders(
  accessToken: string,
  opts?: { limit?: number }
): Promise<DriverNewOrderCard[]> {
  const limit = opts?.limit ?? 5;
  const res = await client(accessToken).get<{
    success: boolean;
    data: DriverNewOrderCard[];
  }>('/driver/orders/active', { params: { page: 1, limit } });
  const rows = res.data?.data;
  return Array.isArray(rows) ? rows : [];
}
