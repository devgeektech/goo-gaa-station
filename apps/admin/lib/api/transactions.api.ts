import { apiClient, type ApiSuccess } from './client';

export type TransactionType = 'payment' | 'refund' | 'payout';
export type TransactionStatus = 'pending' | 'success' | 'failed';

export type TransactionListItem = {
  _id: string;
  orderId?: { _id: string; orderNumber?: string; total?: number } | string | null;
  customerId?: { _id: string; name?: string; phone?: string } | string | null;
  driverId?: { _id: string; name?: string; phone?: string } | string | null;
  type: TransactionType;
  status: TransactionStatus;
  amount: number;
  currency: string;
  phone?: string | null;
  wifipayRef?: string | null;
  wifipayRawResponse?: unknown;
  failureReason?: string | null;
  initiatedAt?: string;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
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

export type GetTransactionsParams = {
  page?: number;
  limit?: number;
  type?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  customerId?: string;
  search?: string; // wifipayRef
};

export async function getTransactions(params: GetTransactionsParams) {
  const res = await apiClient.get<ApiSuccess<TransactionListItem[]>>('/admin/transactions', { params });
  return res.data as ApiSuccess<TransactionListItem[]> & Paginated<TransactionListItem>;
}

export async function getTransactionById(id: string) {
  const res = await apiClient.get<ApiSuccess<TransactionListItem>>(`/admin/transactions/${id}`);
  return res.data;
}

export async function refundTransaction(transactionId: string, reason?: string) {
  const res = await apiClient.post<ApiSuccess<{ refundReference: string }>>('/payment/refund', {
    transactionId,
    reason,
  });
  return res.data;
}

