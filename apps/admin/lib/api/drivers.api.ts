import { apiClient, type ApiSuccess } from './client';

export type DriverListItem = {
  _id: string;
  name?: string;
  phone?: string;
  approvalStatus?: string;
  status?: string;
  isAvailable?: boolean;
  isOnline?: boolean;
};

export type Paginated<T> = {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
};

export async function searchDrivers(params: { search?: string; page?: number; limit?: number; approvalStatus?: string; status?: string }) {
  const res = await apiClient.get<ApiSuccess<DriverListItem[]>>('/admin/drivers', { params });
  return res.data as ApiSuccess<DriverListItem[]> & Paginated<DriverListItem>;
}

