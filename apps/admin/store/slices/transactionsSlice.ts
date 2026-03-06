import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from '../store';
import * as txApi from '@/lib/api/transactions.api';
import { getErrorMessage } from '@/lib/api/client';

export type TransactionsFilters = {
  type: string;
  status: string;
  dateFrom: string;
  dateTo: string;
  search: string;
};

export type TransactionsState = {
  items: txApi.TransactionListItem[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
  filters: TransactionsFilters;
  selectedTransaction: txApi.TransactionListItem | null;
  loading: boolean;
  error: string | null;
};

const initialState: TransactionsState = {
  items: [],
  pagination: { total: 0, page: 1, limit: 20, totalPages: 1, hasNext: false, hasPrev: false },
  filters: { type: '', status: '', dateFrom: '', dateTo: '', search: '' },
  selectedTransaction: null,
  loading: false,
  error: null,
};

export const fetchTransactions = createAsyncThunk(
  'transactions/fetchTransactions',
  async (args: { page?: number; limit?: number } | undefined, { getState, rejectWithValue }) => {
    try {
      const state = getState() as RootState;
      const { filters, pagination } = state.transactions;
      const res = await txApi.getTransactions({
        page: args?.page ?? pagination.page,
        limit: args?.limit ?? pagination.limit,
        type: filters.type || '',
        status: filters.status || '',
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

export const fetchTransactionById = createAsyncThunk(
  'transactions/fetchTransactionById',
  async (id: string, { rejectWithValue }) => {
    try {
      const res = await txApi.getTransactionById(id);
      return res.data;
    } catch (e) {
      return rejectWithValue(getErrorMessage(e));
    }
  }
);

export const refundTransactionThunk = createAsyncThunk(
  'transactions/refundTransaction',
  async (args: { transactionId: string; reason?: string }, { rejectWithValue }) => {
    try {
      const res = await txApi.refundTransaction(args.transactionId, args.reason);
      return res.data;
    } catch (e) {
      return rejectWithValue(getErrorMessage(e));
    }
  }
);

const transactionsSlice = createSlice({
  name: 'transactions',
  initialState,
  reducers: {
    setFilters(state, action: PayloadAction<Partial<TransactionsFilters>>) {
      state.filters = { ...state.filters, ...action.payload };
    },
    setSelectedTransaction(state, action: PayloadAction<txApi.TransactionListItem | null>) {
      state.selectedTransaction = action.payload;
    },
    clearError(state) {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchTransactions.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchTransactions.fulfilled, (state, action) => {
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
      .addCase(fetchTransactions.rejected, (state, action) => {
        state.loading = false;
        state.error = String(action.payload ?? action.error.message ?? 'Failed to fetch transactions');
      })
      .addCase(fetchTransactionById.fulfilled, (state, action) => {
        state.selectedTransaction = action.payload;
      });
  },
});

export const { setFilters, setSelectedTransaction, clearError } = transactionsSlice.actions;
export const selectTransactionsState = (state: RootState) => state.transactions;
export default transactionsSlice.reducer;

