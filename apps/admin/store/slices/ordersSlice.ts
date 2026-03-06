import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from '../store';
import * as ordersApi from '@/lib/api/orders.api';
import { getErrorMessage } from '@/lib/api/client';

export type OrdersFilters = {
  status: string[]; // UI multi-select; API call uses first value for now
  paymentStatus: string;
  dateFrom: string;
  dateTo: string;
  search: string;
};

export type OrdersState = {
  items: ordersApi.OrderListItem[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
  filters: OrdersFilters;
  selectedOrder: ordersApi.OrderListItem | null;
  stats: ordersApi.OrderStatsSummary | null;
  loading: boolean;
  error: string | null;
};

const initialState: OrdersState = {
  items: [],
  pagination: { total: 0, page: 1, limit: 20, totalPages: 1, hasNext: false, hasPrev: false },
  filters: { status: [], paymentStatus: '', dateFrom: '', dateTo: '', search: '' },
  selectedOrder: null,
  stats: null,
  loading: false,
  error: null,
};

export const fetchOrders = createAsyncThunk(
  'orders/fetchOrders',
  async (args: { page?: number; limit?: number } | undefined, { getState, rejectWithValue }) => {
    try {
      const state = getState() as RootState;
      const { filters, pagination } = state.orders;
      const res = await ordersApi.getOrders({
        page: args?.page ?? pagination.page,
        limit: args?.limit ?? pagination.limit,
        status: filters.status[0] || '',
        paymentStatus: filters.paymentStatus || '',
        dateFrom: filters.dateFrom || '',
        dateTo: filters.dateTo || '',
        search: filters.search || '',
      });
      return res;
    } catch (e) {
      return rejectWithValue(getErrorMessage(e));
    }
  }
);

export const fetchOrderById = createAsyncThunk('orders/fetchOrderById', async (id: string, { rejectWithValue }) => {
  try {
    const res = await ordersApi.getOrderById(id);
    return res.data;
  } catch (e) {
    return rejectWithValue(getErrorMessage(e));
  }
});

export const fetchOrderStats = createAsyncThunk('orders/fetchOrderStats', async (_, { rejectWithValue }) => {
  try {
    const res = await ordersApi.getOrderStats();
    return res.data;
  } catch (e) {
    return rejectWithValue(getErrorMessage(e));
  }
});

export const adminUpdateOrderStatus = createAsyncThunk(
  'orders/adminUpdateOrderStatus',
  async (args: { id: string; status: ordersApi.OrderStatus; note?: string }, { rejectWithValue }) => {
    try {
      const res = await ordersApi.updateOrderStatus(args.id, args.status, args.note);
      return res.data;
    } catch (e) {
      return rejectWithValue(getErrorMessage(e));
    }
  }
);

export const adminCancelOrder = createAsyncThunk(
  'orders/adminCancelOrder',
  async (args: { id: string; reason: string }, { rejectWithValue }) => {
    try {
      const res = await ordersApi.cancelOrder(args.id, args.reason);
      return res.data;
    } catch (e) {
      return rejectWithValue(getErrorMessage(e));
    }
  }
);

export const adminAssignDriver = createAsyncThunk(
  'orders/adminAssignDriver',
  async (args: { id: string; driverId: string }, { rejectWithValue }) => {
    try {
      const res = await ordersApi.assignDriver(args.id, args.driverId);
      return res.data;
    } catch (e) {
      return rejectWithValue(getErrorMessage(e));
    }
  }
);

const ordersSlice = createSlice({
  name: 'orders',
  initialState,
  reducers: {
    setFilters(state, action: PayloadAction<Partial<OrdersFilters>>) {
      state.filters = { ...state.filters, ...action.payload };
    },
    setStatusMulti(state, action: PayloadAction<string[]>) {
      state.filters.status = action.payload;
    },
    setSelectedOrder(state, action: PayloadAction<ordersApi.OrderListItem | null>) {
      state.selectedOrder = action.payload;
    },
    clearError(state) {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchOrders.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchOrders.fulfilled, (state, action) => {
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
      .addCase(fetchOrders.rejected, (state, action) => {
        state.loading = false;
        state.error = String(action.payload ?? action.error.message ?? 'Failed to fetch orders');
      })
      .addCase(fetchOrderById.fulfilled, (state, action) => {
        state.selectedOrder = action.payload;
      })
      .addCase(fetchOrderStats.fulfilled, (state, action) => {
        state.stats = action.payload;
        state.error = null;
      })
      .addCase(fetchOrderStats.rejected, (state, action) => {
        const msg = String(action.payload ?? action.error.message ?? 'Failed to load stats');
        if (!state.error) state.error = msg;
      })
      .addCase(adminUpdateOrderStatus.fulfilled, (state, action) => {
        state.selectedOrder = action.payload;
        const idx = state.items.findIndex((o) => o._id === action.payload._id);
        if (idx >= 0) state.items[idx] = action.payload;
      })
      .addCase(adminCancelOrder.fulfilled, (state, action) => {
        state.selectedOrder = action.payload;
        const idx = state.items.findIndex((o) => o._id === action.payload._id);
        if (idx >= 0) state.items[idx] = action.payload;
      })
      .addCase(adminAssignDriver.fulfilled, (state, action) => {
        state.selectedOrder = action.payload;
        const idx = state.items.findIndex((o) => o._id === action.payload._id);
        if (idx >= 0) state.items[idx] = action.payload;
      });
  },
});

export const { setFilters, setSelectedOrder, setStatusMulti, clearError } = ordersSlice.actions;
export const selectOrdersState = (state: RootState) => state.orders;
export default ordersSlice.reducer;

