import { apiClient } from './client';

export type VendorCategory = {
  _id: string;
  name: string;
  slug: string;
  icon: string | null;
  sortOrder: number;
};

/** GET /vendor/categories returns an array of type-groups. */
export type CategoryGroup = {
  type: string;
  categories: VendorCategory[];
};

export type VendorProduct = {
  _id: string;
  vendor: string;
  name: string;
  description: string;
  price: number;
  category: { _id: string; name?: string; slug?: string };
  image: string | null;
  isAvailable: boolean;
  isDeleted?: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

type ListProductsResponse = {
  success: true;
  data: VendorProduct[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
};

export async function getVendorCategories(): Promise<CategoryGroup[]> {
  const { data } = await apiClient.get<{ success: true; data: CategoryGroup[] }>('/vendor/categories');
  return data.data;
}

export async function getVendorProducts(params: {
  category?: string;
  isAvailable?: boolean;
  page?: number;
  limit?: number;
}): Promise<{ products: VendorProduct[]; total: number; page: number; limit: number; totalPages: number }> {
  const q = new URLSearchParams();
  if (params.category) q.set('category', params.category);
  if (params.isAvailable !== undefined) q.set('isAvailable', String(params.isAvailable));
  if (params.page != null) q.set('page', String(params.page));
  if (params.limit != null) q.set('limit', String(params.limit));
  const { data } = await apiClient.get<ListProductsResponse>(`/vendor/products?${q.toString()}`);
  return {
    products: data.data,
    total: data.total,
    page: data.page,
    limit: data.limit,
    totalPages: data.totalPages,
  };
}

export async function getVendorProduct(id: string): Promise<VendorProduct> {
  const { data } = await apiClient.get<{ success: true; data: VendorProduct }>(`/vendor/products/${id}`);
  return data.data;
}

export async function createVendorProduct(form: FormData): Promise<VendorProduct> {
  const { data } = await apiClient.post<{ success: true; data: VendorProduct }>('/vendor/products', form, {
    headers: { 'Content-Type': undefined } as Record<string, string>,
  });
  return data.data;
}

export async function updateVendorProduct(id: string, form: FormData): Promise<VendorProduct> {
  const { data } = await apiClient.patch<{ success: true; data: VendorProduct }>(`/vendor/products/${id}`, form, {
    headers: { 'Content-Type': undefined } as Record<string, string>,
  });
  return data.data;
}

export async function toggleVendorProduct(id: string): Promise<VendorProduct> {
  const { data } = await apiClient.patch<{ success: true; data: VendorProduct }>(`/vendor/products/${id}/toggle`);
  return data.data;
}

export async function deleteVendorProduct(id: string): Promise<void> {
  await apiClient.delete(`/vendor/products/${id}`);
}
