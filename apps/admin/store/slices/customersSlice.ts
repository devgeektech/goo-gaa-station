import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from '../store';
import * as usersApi from '@/lib/api/users.api';
import { getErrorMessage } from '@/lib/api/client';

export type CustomersFilters = {
  search: string;
  status: string;
  showDeleted: boolean;
};

export type CustomersState = {
  items: usersApi.CustomerListItem[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
  filters: CustomersFilters;
  selectedCustomer: usersApi.CustomerDetail | null;
  customerOrders: {
    items: usersApi.CustomerOrderItem[];
    pagination: { total: number; page: number; limit: number; totalPages: number; hasNext: boolean; hasPrev: boolean };
  };
  loading: boolean;
  error: string | null;
};

const initialPagination = { total: 0, page: 1, limit: 20, totalPages: 1, hasNext: false, hasPrev: false };

const initialState: CustomersState = {
  items: [],
  pagination: initialPagination,
  filters: { search: '', status: '', showDeleted: false },
  selectedCustomer: null,
  customerOrders: { items: [], pagination: initialPagination },
  loading: false,
  error: null,
};

export const fetchCustomers = createAsyncThunk(
  'customers/fetchCustomers',
  async (args: { page?: number; limit?: number } | undefined, { getState, rejectWithValue }) => {
    try {
      const state = getState() as RootState;
      const { filters, pagination } = state.customers;
      const res = await usersApi.searchCustomers({
        page: args?.page ?? pagination.page,
        limit: args?.limit ?? pagination.limit,
        search: filters.search || undefined,
        status: filters.status || undefined,
        showDeleted: filters.showDeleted,
      });
      return res;
    } catch (e) {
      return rejectWithValue(getErrorMessage(e));
    }
  }
);

export const fetchCustomerById = createAsyncThunk(
  'customers/fetchCustomerById',
  async (id: string, { rejectWithValue }) => {
    try {
      const res = await usersApi.getCustomer(id);
      return res.data;
    } catch (e) {
      return rejectWithValue(getErrorMessage(e));
    }
  }
);

export const createCustomer = createAsyncThunk(
  'customers/createCustomer',
  async (formData: FormData, { rejectWithValue }) => {
    try {
      const res = await usersApi.createCustomer(formData);
      return res.data;
    } catch (e) {
      return rejectWithValue(getErrorMessage(e));
    }
  }
);

export const updateCustomer = createAsyncThunk(
  'customers/updateCustomer',
  async (args: { id: string; formData: FormData }, { rejectWithValue }) => {
    try {
      const res = await usersApi.updateCustomer(args.id, args.formData);
      return res.data;
    } catch (e) {
      return rejectWithValue(getErrorMessage(e));
    }
  }
);

export const deleteCustomer = createAsyncThunk(
  'customers/deleteCustomer',
  async (id: string, { rejectWithValue }) => {
    try {
      const res = await usersApi.deleteCustomer(id);
      return res.data;
    } catch (e) {
      return rejectWithValue(getErrorMessage(e));
    }
  }
);

export const updateCustomerStatus = createAsyncThunk(
  'customers/updateCustomerStatus',
  async (args: { id: string; status: 'active' | 'blocked'; reason?: string }, { rejectWithValue }) => {
    try {
      const res = await usersApi.updateCustomerStatus(args.id, args.status, args.reason);
      return res.data;
    } catch (e) {
      return rejectWithValue(getErrorMessage(e));
    }
  }
);

export const fetchCustomerOrders = createAsyncThunk(
  'customers/fetchCustomerOrders',
  async (args: { id: string; page?: number; limit?: number }, { rejectWithValue }) => {
    try {
      const res = await usersApi.getCustomerOrders(args.id, args.page, args.limit);
      return { data: res.data, ...res };
    } catch (e) {
      return rejectWithValue(getErrorMessage(e));
    }
  }
);

const customersSlice = createSlice({
  name: 'customers',
  initialState,
  reducers: {
    setFilters(state, action: PayloadAction<Partial<CustomersFilters>>) {
      state.filters = { ...state.filters, ...action.payload };
    },
    setShowDeleted(state, action: PayloadAction<boolean>) {
      state.filters.showDeleted = action.payload;
    },
    setSelectedCustomer(state, action: PayloadAction<usersApi.CustomerDetail | null>) {
      state.selectedCustomer = action.payload;
    },
    clearError(state) {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchCustomers.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchCustomers.fulfilled, (state, action) => {
        state.loading = false;
        state.items = action.payload.data;
        state.pagination = {
          total: action.payload.total ?? 0,
          page: action.payload.page ?? 1,
          limit: action.payload.limit ?? 20,
          totalPages: action.payload.totalPages ?? 1,
          hasNext: action.payload.hasNext ?? false,
          hasPrev: action.payload.hasPrev ?? false,
        };
      })
      .addCase(fetchCustomers.rejected, (state, action) => {
        state.loading = false;
        state.error = String(action.payload ?? action.error.message ?? 'Failed to fetch customers');
      })
      .addCase(fetchCustomerById.fulfilled, (state, action) => {
        state.selectedCustomer = action.payload;
      })
      .addCase(fetchCustomerById.rejected, (state) => {
        state.selectedCustomer = null;
      })
      .addCase(createCustomer.fulfilled, (state, action) => {
        state.items = [action.payload, ...state.items];
        state.pagination.total = (state.pagination.total ?? 0) + 1;
      })
      .addCase(updateCustomer.fulfilled, (state, action) => {
        state.selectedCustomer = action.payload;
        const idx = state.items.findIndex((c) => c._id === action.payload._id);
        if (idx >= 0) state.items[idx] = action.payload;
      })
      .addCase(deleteCustomer.fulfilled, (state, action) => {
        const idx = state.items.findIndex((c) => c._id === action.payload._id);
        if (idx >= 0) state.items[idx] = action.payload;
        if (state.selectedCustomer?._id === action.payload._id) state.selectedCustomer = null;
      })
      .addCase(updateCustomerStatus.fulfilled, (state, action) => {
        state.selectedCustomer = action.payload as usersApi.CustomerDetail;
        const idx = state.items.findIndex((c) => c._id === action.payload._id);
        if (idx >= 0) state.items[idx] = action.payload;
      })
      .addCase(fetchCustomerOrders.fulfilled, (state, action) => {
        state.customerOrders = {
          items: action.payload.data ?? [],
          pagination: {
            total: action.payload.total ?? 0,
            page: action.payload.page ?? 1,
            limit: action.payload.limit ?? 20,
            totalPages: action.payload.totalPages ?? 1,
            hasNext: action.payload.hasNext ?? false,
            hasPrev: action.payload.hasPrev ?? false,
          },
        };
      });
  },
});

export const { setFilters, setShowDeleted, setSelectedCustomer, clearError } = customersSlice.actions;
export const selectCustomersState = (state: RootState) => state.customers;
export default customersSlice.reducer;
