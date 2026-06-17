'use client';

import type { OrderStatus, PaymentStatus } from '@/lib/api/orders.api';
import { useTranslations } from '@/lib/i18n/useTranslations';
import { formatT } from '@/lib/i18n/translations';

const STATUS_COLORS: Record<OrderStatus, string> = {
  placed: '#dbeafe',
  confirmed: '#cffafe',
  preparing: '#ffedd5',
  picked_up: '#f3e8ff',
  on_the_way: '#fef3c7',
  delivered: '#dcfce7',
  cancelled: '#fee2e2',
};

const PAYMENT_COLORS: Record<PaymentStatus, string> = {
  pending: '#fef3c7',
  paid: '#dcfce7',
  failed: '#fee2e2',
  refunded: '#f3e8ff',
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const t = useTranslations();
  const label = t.status.order[status];
  return (
    <span className="badge" style={{ background: STATUS_COLORS[status], color: '#0f172a', border: 'none' }} role="status" aria-label={formatT(t.status.order.orderStatusAria, { label })}>
      {label}
    </span>
  );
}

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const t = useTranslations();
  const label = t.status.payment[status];
  return (
    <span className="badge" style={{ background: PAYMENT_COLORS[status], color: '#0f172a', border: 'none' }} role="status" aria-label={formatT(t.status.payment.paymentAria, { label })}>
      {label}
    </span>
  );
}

/** @deprecated Use <OrderStatusBadge status={...} /> */
export function statusBadge(status: OrderStatus) {
  return <OrderStatusBadge status={status} />;
}

/** @deprecated Use <PaymentStatusBadge status={...} /> */
export function paymentBadge(status: PaymentStatus) {
  return <PaymentStatusBadge status={status} />;
}
