'use client';

import type { OrderStatus, PaymentStatus } from '@/lib/api/orders.api';

const STATUS_LABELS: Record<OrderStatus, string> = {
  placed: 'Placed',
  confirmed: 'Confirmed',
  preparing: 'Preparing',
  picked_up: 'Picked up',
  on_the_way: 'On the way',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

const STATUS_COLORS: Record<OrderStatus, string> = {
  placed: '#dbeafe',
  confirmed: '#cffafe',
  preparing: '#ffedd5',
  picked_up: '#f3e8ff',
  on_the_way: '#fef3c7',
  delivered: '#dcfce7',
  cancelled: '#fee2e2',
};

export function statusBadge(status: OrderStatus) {
  const label = STATUS_LABELS[status];
  return (
    <span className="badge" style={{ background: STATUS_COLORS[status], color: '#0f172a', border: 'none' }} role="status" aria-label={`Order status: ${label}`}>
      {label}
    </span>
  );
}

const PAYMENT_LABELS: Record<PaymentStatus, string> = {
  pending: 'Pending',
  paid: 'Paid',
  failed: 'Failed',
  refunded: 'Refunded',
};

const PAYMENT_COLORS: Record<PaymentStatus, string> = {
  pending: '#fef3c7',
  paid: '#dcfce7',
  failed: '#fee2e2',
  refunded: '#f3e8ff',
};

export function paymentBadge(status: PaymentStatus) {
  const label = PAYMENT_LABELS[status];
  return (
    <span className="badge" style={{ background: PAYMENT_COLORS[status], color: '#0f172a', border: 'none' }} role="status" aria-label={`Payment: ${label}`}>
      {label}
    </span>
  );
}
