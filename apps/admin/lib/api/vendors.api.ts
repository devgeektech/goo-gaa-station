import { apiClient, type ApiSuccess } from './client';

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
  sortOrder?: number;
  createdAt?: string;
  /** Phase 3 approval */
  approvalStatus?: string | null;
};

export type VendorDetail = VendorListItem & {
  address?: { street?: string | null; city?: string | null; country?: string | null; lat?: number | null; lng?: number | null };
  openingHours?: Array<{ day: number; open?: string | null; close?: string | null }>;
  menuItems?: MenuItem[];
  /** Phase 2 onboarding */
  onboardingStep?: number;
  approvalStatus?: string | null;
  submittedAt?: string | null;
  kycDocuments?: {
    businessRegistration?: string | null;
    /** One or more identity document URLs (array for multiple) */
    identityDocument?: string | string[] | null;
    healthSafetyLicense?: string | null;
  };
  operatingHours?: Array<{ day: string; isOpen: boolean; from?: string | null; to?: string | null }>;
  contactPerson?: { name?: string | null; email?: string | null; phone?: string | null };
  /** Phase 3 approval review */
  rejectionReason?: string | null;
  approvedAt?: string | null;
  rejectedAt?: string | null;
  reviewedBy?: { _id: string; name?: string } | string | null;
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
  /** Phase 3: count of vendors with approvalStatus === 'pending' */
  pendingCount?: number;
};

export type ListVendorsParams = {
  search?: string;
  status?: string;
  page?: number;
  limit?: number;
  /** Phase 3: filter by approval status */
  approvalStatus?: 'none' | 'pending' | 'approved' | 'rejected';
};

export async function listVendors(params: ListVendorsParams) {
  const res = await apiClient.get<ApiSuccess<VendorListItem[]> & Paginated<VendorListItem>>('/admin/vendors', { params });
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
  sortOrder?: number;
};

function multipartConfig() {
  return {
    headers: { 'Content-Type': undefined as unknown as string },
  };
}

export async function createVendor(formData: FormData) {
  const res = await apiClient.post<ApiSuccess<VendorDetail>>('/admin/vendors', formData, multipartConfig());
  return res.data;
}

export async function updateVendor(id: string, formData: FormData) {
  const res = await apiClient.patch<ApiSuccess<VendorDetail>>(
    `/admin/vendors/${id}`,
    formData,
    multipartConfig()
  );
  return res.data;
}

export async function blockVendor(id: string, reason?: string) {
  const res = await apiClient.patch<ApiSuccess<VendorDetail>>(`/admin/vendors/${id}/block`, { reason });
  return res.data;
}

/** Phase 3: Approve vendor (must be pending). */
export async function approveVendor(id: string) {
  const res = await apiClient.patch<ApiSuccess<VendorDetail>>(`/admin/vendors/${id}/approve`);
  return res.data;
}

/** Phase 3: Reject vendor with reason (min 10 chars). */
export async function rejectVendor(id: string, reason: string) {
  const res = await apiClient.patch<ApiSuccess<VendorDetail>>(`/admin/vendors/${id}/reject`, { reason });
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

/** Phase 4: Vendor products (read-only). */
export type VendorProduct = {
  _id: string;
  vendor: string;
  name: string;
  description?: string;
  price: number;
  category: { _id: string; name?: string; slug?: string };
  image: string | null;
  isAvailable: boolean;
  sortOrder?: number;
  createdAt: string;
  updatedAt?: string;
};

export type ListVendorProductsParams = {
  page?: number;
  limit?: number;
  category?: string;
  isAvailable?: boolean;
};

export type VendorProductsResponse = ApiSuccess<VendorProduct[]> & Paginated<VendorProduct>;

export async function getVendorProducts(vendorId: string, params?: ListVendorProductsParams) {
  const res = await apiClient.get<VendorProductsResponse>(`/admin/vendors/${vendorId}/products`, { params });
  return res.data;
}
