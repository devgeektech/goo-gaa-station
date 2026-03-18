import { configureStore } from '@reduxjs/toolkit';
import ordersReducer from './slices/ordersSlice';
import transactionsReducer from './slices/transactionsSlice';
import customersReducer from './slices/customersSlice';
import { api } from './api';

export const store = configureStore({
  reducer: {
    orders: ordersReducer,
    transactions: transactionsReducer,
    customers: customersReducer,
    [api.reducerPath]: api.reducer,
  },
  middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(api.middleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

