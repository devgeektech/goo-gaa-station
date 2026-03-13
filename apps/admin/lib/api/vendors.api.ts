import { apiClient, type ApiSuccess } from './client';

export type VendorCategoryRef = { _id: string; name?: string; icon?: string };

export type VendorListItem = {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  logo?: string | null;
  coverImage?: string | null;
  email?: string | null;
  phone?: string | null;
  status: string;
  blockReason?: string | null;
  categoryIds?: string[];
  sortOrder?: number;
  createdAt?: string;
};

export type VendorDetail = VendorListItem & {
  categoryIds?: VendorCategoryRef[] | string[];
  address?: { street?: string | null; city?: string | null; country?: string | null; lat?: number | null; lng?: number | null };
  openingHours?: Array<{ day: number; open?: string | null; close?: string | null }>;
  menuItems?: MenuItem[];
};

export type MenuItem = {
  _id: string;
  vendorId: string;
  name: string;
  description?: string;
  price: number;
  image?: string | null;
  category: string;
  isAvailable: boolean;
  sortOrder?: number;
  createdAt?: string;
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

export type ListVendorsParams = {
  search?: string;
  status?: string;
  page?: number;
  limit?: number;
};

export async function listVendors(params: ListVendorsParams) {
  const res = await apiClient.get<ApiSuccess<VendorListItem[]>>('/admin/vendors', { params });
  return res.data as ApiSuccess<VendorListItem[]> & Paginated<VendorListItem>;
}

export async function getVendor(id: string) {
  const res = await apiClient.get<ApiSuccess<VendorDetail>>(`/admin/vendors/${id}`);
  return res.data;
}

export type CreateVendorPayload = {
  name: string;
  slug?: string;
  description?: string;
  email?: string;
  phone?: string;
  address?: { street?: string; city?: string; country?: string; lat?: number; lng?: number };
  categoryIds?: string[];
  sortOrder?: number;
};

export async function createVendor(formData: FormData) {
  const res = await apiClient.post<ApiSuccess<VendorDetail>>('/admin/vendors', formData);
  return res.data;
}

export async function updateVendor(id: string, formData: FormData) {
  const res = await apiClient.patch<ApiSuccess<VendorDetail>>(`/admin/vendors/${id}`, formData);
  return res.data;
}

export async function blockVendor(id: string, reason?: string) {
  const res = await apiClient.patch<ApiSuccess<VendorDetail>>(`/admin/vendors/${id}/block`, { reason });
  return res.data;
}

export async function deleteVendor(id: string) {
  const res = await apiClient.delete<ApiSuccess<VendorListItem>>(`/admin/vendors/${id}`);
  return res.data;
}

export async function listMenuItems(vendorId: string) {
  const res = await apiClient.get<ApiSuccess<MenuItem[]>>(`/admin/vendors/${vendorId}/menu-items`);
  return res.data;
}

export type CreateMenuItemPayload = {
  name: string;
  description?: string;
  price: number;
  category: string;
  isAvailable?: boolean;
  sortOrder?: number;
};

export async function createMenuItem(vendorId: string, formData: FormData) {
  const res = await apiClient.post<ApiSuccess<MenuItem>>(`/admin/vendors/${vendorId}/menu-items`, formData);
  return res.data;
}

export async function updateMenuItem(vendorId: string, itemId: string, formData: FormData) {
  const res = await apiClient.patch<ApiSuccess<MenuItem>>(`/admin/vendors/${vendorId}/menu-items/${itemId}`, formData);
  return res.data;
}

export async function deleteMenuItem(vendorId: string, itemId: string) {
  const res = await apiClient.delete<ApiSuccess<MenuItem>>(`/admin/vendors/${vendorId}/menu-items/${itemId}`);
  return res.data;
}
