import { apiClient, type ApiSuccess } from './client';

export type AppSettings = {
  deliveryFee: number;
  commissionPercent: number;
  defaultCurrency?: string;
  defaultTimezone?: string;
  serviceZones?: string[];
  updatedAt?: string;
};

export async function getAppSettings() {
  const res = await apiClient.get<ApiSuccess<AppSettings>>('/admin/app-settings');
  return res.data;
}

export async function updateAppSettings(
  body: Partial<
    Pick<AppSettings, 'deliveryFee' | 'commissionPercent' | 'defaultCurrency' | 'defaultTimezone' | 'serviceZones'>
  >
) {
  const res = await apiClient.patch<ApiSuccess<AppSettings>>('/admin/app-settings', body);
  return res.data;
}

