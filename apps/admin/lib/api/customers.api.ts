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
  phone: string | null;
  profileImage?: string | null;
  status: string;
  blockReason?: string | null;
  totalOrders?: number;
  totalSpent?: number;
  points?: number;
  orderCount?: number;
  createdAt?: string;
};

export type CustomerDetail = CustomerListItem & {
  addresses?: CustomerAddress[];
  orderCount?: number;
  points?: number;
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
  isDeleted?: boolean;
};

export async function searchCustomers(params: SearchCustomersParams) {
  const q: Record<string, string | number | boolean> = {};
  if (params.page != null) q.page = params.page;
  if (params.limit != null) q.limit = params.limit;
  if (params.search) q.search = params.search;
  if (params.status) q.status = params.status;
  if (params.isDeleted !== undefined) q.isDeleted = params.isDeleted;
  const res = await apiClient.get<ApiSuccess<CustomerListItem[]>>('/admin/customers', { params: q });
  return res.data as ApiSuccess<CustomerListItem[]> & Paginated<CustomerListItem>;
}

export async function getCustomer(id: string) {
  const res = await apiClient.get<ApiSuccess<CustomerDetail>>(`/admin/customers/${id}`);
  return res.data;
}

export type CreateCustomerForm = {
  name: string;
  email?: string;
  phone?: string;
  password: string;
  preferredLang?: string;
  address?: { label?: string; street: string; city: string; country: string };
};

export async function createCustomer(formData: FormData) {
  const res = await apiClient.post<ApiSuccess<CustomerDetail>>('/admin/customers', formData);
  return res.data;
}

export async function updateCustomer(id: string, formData: FormData) {
  const res = await apiClient.patch<ApiSuccess<CustomerDetail>>(`/admin/customers/${id}`, formData);
  return res.data;
}

export async function blockCustomer(id: string, reason?: string) {
  const res = await apiClient.patch<ApiSuccess<CustomerDetail>>(`/admin/customers/${id}/block`, { reason });
  return res.data;
}

export async function deleteCustomer(id: string) {
  const res = await apiClient.delete<ApiSuccess<CustomerListItem>>(`/admin/customers/${id}`);
  return res.data;
}

// Customer orders are fetched via users API: GET /admin/users/:id/orders
