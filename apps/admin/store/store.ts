import { configureStore } from '@reduxjs/toolkit';
import ordersReducer from './slices/ordersSlice';
import transactionsReducer from './slices/transactionsSlice';
import customersReducer from './slices/customersSlice';

export const store = configureStore({
  reducer: {
    orders: ordersReducer,
    transactions: transactionsReducer,
    customers: customersReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

