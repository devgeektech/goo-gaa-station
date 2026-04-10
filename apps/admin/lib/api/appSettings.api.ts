import { apiClient, type ApiSuccess } from './client';

export type AppSettings = {
  deliveryFee: number;
  taxPercent: number;
  updatedAt?: string;
};

export async function getAppSettings() {
  const res = await apiClient.get<ApiSuccess<AppSettings>>('/admin/app-settings');
  return res.data;
}

export async function updateAppSettings(body: Partial<Pick<AppSettings, 'deliveryFee' | 'taxPercent'>>) {
  const res = await apiClient.patch<ApiSuccess<AppSettings>>('/admin/app-settings', body);
  return res.data;
}

