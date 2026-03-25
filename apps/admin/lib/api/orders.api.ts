import { apiClient, type ApiSuccess } from './client';

export type OrderStatus =
  | 'placed'
  | 'confirmed'
  | 'preparing'
  | 'picked_up'
  | 'on_the_way'
  | 'delivered'
  | 'cancelled';

export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';

export type OrderListItem = {
  _id: string;
  orderNumber: string;
  customerId?: { _id: string; name?: string; phone?: string; email?: string } | string;
  driverId?: { _id: string; name?: string; phone?: string } | string | null;
  vendorId?: { _id: string; name?: string; slug?: string; logo?: string } | string | null;
  items: Array<{ name: string; qty: number; unitPrice: number; subtotal: number }>;
  total: number;
  paymentStatus: PaymentStatus;
  status: OrderStatus;
  createdAt: string;
  wifipayRef?: string | null;
  paymentMethod?: string;
  deliveryAddress?: { street: string; city: string; country: string; contactName?: string | null; contactPhone?: string | null };
  pickupAddress?: { street: string; city: string; country: string; name?: string | null } | null;
  statusHistory?: Array<{
    status: OrderStatus;
    timestamp: string;
    note?: string | null;
    changedBy?: string | null;
    changedByModel?: 'User' | 'Driver' | 'Admin' | 'System' | null;
    isAdminOverride?: boolean;
  }>;
  subtotal?: number;
  deliveryFee?: number;
  discount?: number;
  cancellationReason?: string | null;
  cancelledBy?: string | null;
  actualDeliveryAt?: string | null;
  notes?: string | null;
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

export type GetOrdersParams = {
  page?: number;
  limit?: number;
  status?: string; // backend expects a single status
  paymentStatus?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  customerId?: string;
  driverId?: string;
  vendorId?: string;
};

export async function getOrders(params: GetOrdersParams) {
  const res = await apiClient.get<ApiSuccess<OrderListItem[] | { orders?: OrderListItem[]; total?: number; page?: number; pages?: number }>>('/admin/orders', { params });
  const raw = res.data;
  const payload = raw.data;

  const list = Array.isArray(payload) ? payload : (payload?.orders ?? []);
  const total = raw.total ?? (Array.isArray(payload) ? 0 : (payload?.total ?? 0));
  const page = raw.page ?? (Array.isArray(payload) ? 1 : (payload?.page ?? 1));
  const limit = raw.limit ?? params.limit ?? 20;
  const totalPages = raw.totalPages ?? (Array.isArray(payload) ? 1 : (payload?.pages ?? 1));

  return {
    ...raw,
    data: list,
    total,
    page,
    limit,
    totalPages,
    hasNext: raw.hasNext ?? page < totalPages,
    hasPrev: raw.hasPrev ?? page > 1,
  } as ApiSuccess<OrderListItem[]> & Paginated<OrderListItem>;
}

export async function getOrderById(id: string) {
  const res = await apiClient.get<ApiSuccess<OrderListItem>>(`/admin/orders/${id}`);
  return res.data;
}

export async function updateOrderStatus(id: string, status: OrderStatus, note?: string) {
  const res = await apiClient.patch<ApiSuccess<OrderListItem>>(`/admin/orders/${id}/status`, { status, note });
  return res.data;
}

export async function cancelOrder(id: string, reason: string) {
  const res = await apiClient.patch<ApiSuccess<OrderListItem>>(`/admin/orders/${id}/cancel`, { reason });
  return res.data;
}

export async function assignDriver(id: string, driverId: string) {
  const res = await apiClient.patch<ApiSuccess<OrderListItem>>(`/admin/orders/${id}/assign-driver`, { driverId });
  return res.data;
}

export type OrderStatsSummary = {
  totalOrders: number;
  ordersToday: number;
  ordersByStatus: Record<string, number>;
  totalRevenue: number;
  revenueToday: number;
  last7DaysRevenue: Array<{ date: string; revenue: number; count: number }>;
  pendingDriverApprovals: number;
  activeDrivers: number;
  totalCustomers: number;
};

export async function getOrderStats() {
  const res = await apiClient.get<ApiSuccess<OrderStatsSummary>>('/admin/orders/stats/summary');
  return res.data;
}

