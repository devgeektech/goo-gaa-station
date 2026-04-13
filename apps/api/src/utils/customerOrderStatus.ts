/**
 * Customer-app order lifecycle (timeline). Internal DB statuses are mapped on read;
 * vendor/driver/admin keep using ORDER_STATUSES unchanged.
 */
export const CUSTOMER_ORDER_STATUSES = ['placed', 'accepted', 'preparing', 'pickup', 'delivered', 'cancelled'] as const;
export type CustomerOrderStatus = (typeof CUSTOMER_ORDER_STATUSES)[number];

const INTERNAL_TO_CUSTOMER: Record<string, CustomerOrderStatus> = {
  pending: 'placed',
  placed: 'placed',
  accepted: 'accepted',
  confirmed: 'accepted',
  preparing: 'preparing',
  picked_up: 'pickup',
  on_the_way: 'pickup',
  delivered: 'delivered',
  cancelled: 'cancelled',
};

export function toCustomerOrderStatus(internal: string | undefined | null): CustomerOrderStatus {
  if (internal == null || internal === '') return 'placed';
  return INTERNAL_TO_CUSTOMER[internal] ?? 'placed';
}

/** Map `status` and each `statusHistory[].status` for API responses. */
export function mapOrderStatusForCustomer<T extends Record<string, unknown>>(doc: T): T {
  const copy = { ...doc } as T & { status?: string; statusHistory?: Array<Record<string, unknown>> };
  copy.status = toCustomerOrderStatus(copy.status);
  const hist = copy.statusHistory;
  if (Array.isArray(hist)) {
    copy.statusHistory = hist.map((entry) => ({
      ...entry,
      status: toCustomerOrderStatus(entry.status as string | undefined),
    }));
  }
  return copy as T;
}
