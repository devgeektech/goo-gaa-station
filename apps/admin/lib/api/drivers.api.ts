import { apiClient, type ApiSuccess } from './client';

export type DriverListItem = {
  _id: string;
  name?: string;
  phone?: string;
  email?: string | null;
  profileImage?: string | null;
  licenseImage?: string | null;
  vehicleImage?: string | null;
  vehicleType?: string | null;
  vehiclePlate?: string | null;
  approvalStatus?: string;
  approvalNote?: string | null;
  kycStatus?: 'not_submitted' | 'pending' | 'approved' | 'rejected';
  kycSubmittedAt?: string | null;
  kycRejectionReason?: string | null;
  blockReason?: string | null;
  status?: string;
  isAvailable?: boolean;
  isOnline?: boolean;
  rating?: number | null;
  ratingCount?: number;
  totalDeliveries?: number;
  totalEarnings?: number;
  createdAt?: string;
};

export type DriverKycDocuments = {
  driversLicense?: string | null;
  nationalId?: string[];
  vehiclePhotos?: string[];
};

export type DriverDetail = DriverListItem & {
  nationalIdImage?: string | null;
  licenseNumber?: string | null;
  nationalId?: string | null;
  deliveryZones?: string[];
  bankAccount?: { iban?: string; bankName?: string; accountHolder?: string };
  walletBalance?: number;
  preferredLang?: string;
  lastActiveAt?: string | null;
  lastLocationAt?: string | null;
  liveLocation?: { type?: string; coordinates?: number[] };
  kycStatus?: 'not_submitted' | 'pending' | 'approved' | 'rejected';
  kycRejectionReason?: string | null;
  kycSubmittedAt?: string | null;
  kycDocuments?: DriverKycDocuments;
  approvalHistory?: Array<{
    status: string;
    note?: string | null;
    changedBy?: { name?: string; email?: string };
    changedAt: string;
  }>;
};

export type DriverLocationResponse = {
  liveLocation?: { type?: string; coordinates?: number[] } | null;
  lastLocationAt?: string | null;
  isOnline?: boolean;
  isAvailable?: boolean;
};

export type DriverOrderItem = {
  _id: string;
  orderNumber: string;
  total: number;
  status: string;
  paymentStatus?: string;
  createdAt: string;
  customerId?: { _id: string; name?: string; phone?: string } | null;
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

export type SearchDriversParams = {
  search?: string;
  page?: number;
  limit?: number;
  approvalStatus?: string;
  status?: string;
  vehicleType?: string;
};

export async function searchDrivers(params: SearchDriversParams) {
  const res = await apiClient.get<ApiSuccess<DriverListItem[]>>('/admin/drivers', { params });
  return res.data as ApiSuccess<DriverListItem[]> & Paginated<DriverListItem>;
}

export async function getPendingCount() {
  const res = await apiClient.get<ApiSuccess<{ count: number }>>('/admin/drivers/stats/pending-count');
  return res.data;
}

export async function getPendingApprovals(page = 1, limit = 50) {
  const params: Record<string, number> = { page, limit };
  const res = await apiClient.get<ApiSuccess<DriverListItem[]>>('/admin/drivers/pending', { params });
  return res.data as ApiSuccess<DriverListItem[]> & Paginated<DriverListItem>;
}

export async function getDriver(id: string) {
  const res = await apiClient.get<ApiSuccess<DriverDetail>>(`/admin/drivers/${id}`);
  return res.data;
}

export async function getDriverLocation(id: string) {
  const res = await apiClient.get<ApiSuccess<DriverLocationResponse>>(`/admin/drivers/${id}/location`);
  return res.data;
}

export async function getDriverOrders(id: string, page?: number, limit?: number) {
  const params: Record<string, number> = {};
  if (page != null) params.page = page;
  if (limit != null) params.limit = limit;
  const res = await apiClient.get<ApiSuccess<DriverOrderItem[]>>(`/admin/drivers/${id}/orders`, { params });
  return res.data as ApiSuccess<DriverOrderItem[]> & Paginated<DriverOrderItem>;
}

export async function approveDriver(id: string) {
  const res = await apiClient.patch<ApiSuccess<DriverDetail>>(`/admin/drivers/${id}/approve`);
  return res.data;
}

export async function rejectDriver(id: string, reason: string, kycRejectionReason?: string) {
  const body: { reason: string; kycRejectionReason?: string } = { reason };
  if (kycRejectionReason != null && kycRejectionReason.trim()) body.kycRejectionReason = kycRejectionReason.trim();
  const res = await apiClient.patch<ApiSuccess<DriverDetail>>(`/admin/drivers/${id}/reject`, body);
  return res.data;
}

export async function updateDriverStatus(id: string, status: 'active' | 'blocked', reason?: string) {
  const res = await apiClient.patch<ApiSuccess<DriverListItem>>(`/admin/drivers/${id}/status`, { status, reason });
  return res.data;
}

export async function deleteDriver(id: string) {
  const res = await apiClient.delete<ApiSuccess<DriverListItem>>(`/admin/drivers/${id}`);
  return res.data;
}

export async function updateDriver(id: string, formData: FormData) {
  const res = await apiClient.put<ApiSuccess<DriverDetail>>(`/admin/drivers/${id}`, formData);
  return res.data;
}
