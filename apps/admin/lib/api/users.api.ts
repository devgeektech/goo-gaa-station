import { apiClient, type ApiSuccess } from './client';

export type CustomerAddress = {
  label: string;
  street: string;
  city: string;
  country: string;
  lat?: number | null;
  lng?: number | null;
  isDefault?: boolean;
};

export type CustomerListItem = {
  _id: string;
  name: string;
  email?: string | null;
  phone: string;
  profileImage?: string | null;
  status: string;
  blockReason?: string | null;
  totalOrders?: number;
  totalSpent?: number;
  createdAt?: string;
};

export type CustomerDetail = CustomerListItem & {
  addresses?: CustomerAddress[];
  preferredLang?: string;
  lastActiveAt?: string | null;
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

export type SearchCustomersParams = {
  search?: string;
  page?: number;
  limit?: number;
  status?: string;
  showDeleted?: boolean;
};

export async function searchCustomers(params: SearchCustomersParams) {
  const res = await apiClient.get<ApiSuccess<CustomerListItem[]>>('/admin/users', { params });
  return res.data as ApiSuccess<CustomerListItem[]> & Paginated<CustomerListItem>;
}

export async function getCustomer(id: string) {
  const res = await apiClient.get<ApiSuccess<CustomerDetail>>(`/admin/users/${id}`);
  return res.data;
}

export async function createCustomer(formData: FormData) {
  const res = await apiClient.post<ApiSuccess<CustomerDetail>>('/admin/users', formData);
  return res.data;
}

export async function updateCustomer(id: string, formData: FormData) {
  const res = await apiClient.put<ApiSuccess<CustomerDetail>>(`/admin/users/${id}`, formData);
  return res.data;
}

export async function deleteCustomer(id: string) {
  const res = await apiClient.delete<ApiSuccess<CustomerListItem>>(`/admin/users/${id}`);
  return res.data;
}

export async function updateCustomerStatus(id: string, status: 'active' | 'blocked', reason?: string) {
  const res = await apiClient.patch<ApiSuccess<CustomerListItem>>(`/admin/users/${id}/status`, { status, reason });
  return res.data;
}

export type CustomerOrderItem = {
  _id: string;
  orderNumber: string;
  total: number;
  status: string;
  paymentStatus?: string;
  createdAt: string;
  driverId?: { _id: string; name?: string; phone?: string } | null;
};

export async function getCustomerOrders(id: string, page?: number, limit?: number) {
  const params: Record<string, number> = {};
  if (page != null) params.page = page;
  if (limit != null) params.limit = limit;
  const res = await apiClient.get<ApiSuccess<CustomerOrderItem[]>>(`/admin/users/${id}/orders`, { params });
  return res.data as ApiSuccess<CustomerOrderItem[]> & Paginated<CustomerOrderItem>;
}

export async function exportCustomersCsv(params: { search?: string; status?: string; showDeleted?: boolean }) {
  const res = await apiClient.get('/admin/users/export/csv', {
    params,
    responseType: 'blob',
  });
  return res.data as Blob;
}
