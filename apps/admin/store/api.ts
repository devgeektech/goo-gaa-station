import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

const baseUrl = typeof process !== 'undefined' ? (process.env.NEXT_PUBLIC_API_URL ?? '') : '';

export type CategoryItem = {
  _id: string;
  name: string;
  slug: string;
  icon?: string | null;
  description?: string;
  type: 'food' | 'grocery' | 'pharmacy' | 'fashion';
  sortOrder: number;
  isActive: boolean;
  isDeleted?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type CategoryListResponse = { success: true; data: CategoryItem[] };
export type CategoryOneResponse = { success: true; data: CategoryItem };
export type ReorderResponse = { success: true; data: { updated: number } };
export type DeleteConflictResponse = {
  success: false;
  message: string;
  vendors: Array<{ _id: string; name: string }>;
};

/** Phase 4: Admin vendor products (read-only). */
export type VendorProductItem = {
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

export type VendorProductsResponse = {
  success: true;
  data: VendorProductItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext?: boolean;
  hasPrev?: boolean;
};

export type BannerItem = {
  _id: string;
  image: string;
  heading: string;
  text: string;
  buttonText: string;
  buttonUrl: string;
  position: number;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type BannerListResponse = { success: true; data: BannerItem[] };
export type BannerOneResponse = { success: true; data: BannerItem };

export const api = createApi({
  reducerPath: 'api',
  baseQuery: fetchBaseQuery({
    baseUrl,
    credentials: 'include',
    prepareHeaders(headers, { getState }) {
      return headers;
    },
  }),
  tagTypes: ['Category', 'VendorProducts', 'Banner'],
  endpoints: (builder) => ({
    getCategories: builder.query<CategoryItem[], { type?: string; isActive?: string } | void>({
      query: (params) => ({
        url: '/admin/categories',
        params: params ?? {},
      }),
      transformResponse: (res: CategoryListResponse) => res.data ?? [],
      providesTags: (result) =>
        result ? [...result.map((c) => ({ type: 'Category' as const, id: c._id })), { type: 'Category', id: 'LIST' }] : [{ type: 'Category', id: 'LIST' }],
    }),

    createCategory: builder.mutation<CategoryItem, FormData>({
      query: (body) => ({
        url: '/admin/categories',
        method: 'POST',
        body,
      }),
      transformResponse: (res: CategoryOneResponse) => res.data,
      invalidatesTags: [{ type: 'Category', id: 'LIST' }],
    }),

    updateCategory: builder.mutation<CategoryItem, { id: string; body: FormData }>({
      query: ({ id, body }) => ({
        url: `/admin/categories/${id}`,
        method: 'PATCH',
        body,
      }),
      transformResponse: (res: CategoryOneResponse) => res.data,
      invalidatesTags: (_res, _err, { id }) => [{ type: 'Category', id }, { type: 'Category', id: 'LIST' }],
    }),

    toggleCategoryActive: builder.mutation<CategoryItem, string>({
      query: (id) => ({
        url: `/admin/categories/${id}/toggle`,
        method: 'PATCH',
      }),
      transformResponse: (res: CategoryOneResponse) => res.data,
      invalidatesTags: (_res, _err, id) => [{ type: 'Category', id }, { type: 'Category', id: 'LIST' }],
    }),

    reorderCategories: builder.mutation<{ updated: number }, Array<{ id: string; sortOrder: number }>>({
      query: (body) => ({
        url: '/admin/categories/reorder',
        method: 'PATCH',
        body,
      }),
      transformResponse: (res: ReorderResponse) => res.data,
      invalidatesTags: [{ type: 'Category', id: 'LIST' }],
    }),

    deleteCategory: builder.mutation<CategoryItem, string>({
      query: (id) => ({
        url: `/admin/categories/${id}`,
        method: 'DELETE',
      }),
      transformResponse: (res: CategoryOneResponse) => res.data,
      invalidatesTags: (_res, _err, id) => [{ type: 'Category', id }, { type: 'Category', id: 'LIST' }],
    }),

    getVendorProducts: builder.query<VendorProductsResponse, { vendorId: string; page?: number; limit?: number; category?: string; isAvailable?: boolean }>({
      query: ({ vendorId, page = 1, limit = 20, category, isAvailable }) => ({
        url: `/admin/vendors/${vendorId}/products`,
        params: { page, limit, ...(category && { category }), ...(isAvailable !== undefined && { isAvailable: String(isAvailable) }) },
      }),
      providesTags: (_res, _err, { vendorId }) => [{ type: 'VendorProducts', id: vendorId }],
    }),

    getBanners: builder.query<BannerItem[], void>({
      query: () => ({
        url: '/admin/banners',
      }),
      transformResponse: (res: BannerListResponse) => res.data ?? [],
      providesTags: (result) =>
        result ? [...result.map((b) => ({ type: 'Banner' as const, id: b._id })), { type: 'Banner', id: 'LIST' }] : [{ type: 'Banner', id: 'LIST' }],
    }),

    createBanner: builder.mutation<BannerItem, FormData>({
      query: (body) => ({
        url: '/admin/banners',
        method: 'POST',
        body,
      }),
      transformResponse: (res: BannerOneResponse) => res.data,
      invalidatesTags: [{ type: 'Banner', id: 'LIST' }],
    }),

    updateBanner: builder.mutation<BannerItem, { id: string; body: FormData }>({
      query: ({ id, body }) => ({
        url: `/admin/banners/${id}`,
        method: 'PATCH',
        body,
      }),
      transformResponse: (res: BannerOneResponse) => res.data,
      invalidatesTags: (_res, _err, { id }) => [{ type: 'Banner', id }, { type: 'Banner', id: 'LIST' }],
    }),

    toggleBannerActive: builder.mutation<BannerItem, string>({
      query: (id) => ({
        url: `/admin/banners/${id}/toggle`,
        method: 'PATCH',
      }),
      transformResponse: (res: BannerOneResponse) => res.data,
      invalidatesTags: (_res, _err, id) => [{ type: 'Banner', id }, { type: 'Banner', id: 'LIST' }],
    }),

    deleteBanner: builder.mutation<{ success: boolean }, string>({
      query: (id) => ({
        url: `/admin/banners/${id}`,
        method: 'DELETE',
      }),
      transformResponse: () => ({ success: true }),
      invalidatesTags: (_res, _err, id) => [{ type: 'Banner', id }, { type: 'Banner', id: 'LIST' }],
    }),
  }),
});

export const {
  useGetCategoriesQuery,
  useCreateCategoryMutation,
  useUpdateCategoryMutation,
  useToggleCategoryActiveMutation,
  useReorderCategoriesMutation,
  useDeleteCategoryMutation,
  useGetVendorProductsQuery,
  useGetBannersQuery,
  useCreateBannerMutation,
  useUpdateBannerMutation,
  useToggleBannerActiveMutation,
  useDeleteBannerMutation,
} = api;
