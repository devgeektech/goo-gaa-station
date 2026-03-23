'use client';

import type { TransactionStatus, TransactionType } from '@/lib/api/transactions.api';

const TYPE_LABELS: Record<TransactionType, string> = {
  payment: 'Payment',
  refund: 'Refund',
  payout: 'Payout',
};

const TYPE_COLORS: Record<TransactionType, string> = {
  payment: '#dcfce7',
  refund: '#f3e8ff',
  payout: '#dbeafe',
};

export function txnTypeBadge(type: TransactionType) {
  const label = TYPE_LABELS[type];
  return (
    <span className="badge" style={{ background: TYPE_COLORS[type], color: '#0f172a', border: 'none' }} role="status" aria-label={`Type: ${label}`}>
      {label}
    </span>
  );
}

const STATUS_LABELS: Record<TransactionStatus, string> = {
  pending: 'Pending',
  success: 'Success',
  failed: 'Failed',
};

const STATUS_COLORS: Record<TransactionStatus, string> = {
  pending: '#fef3c7',
  success: '#dcfce7',
  failed: '#fee2e2',
};

export function txnStatusBadge(status: TransactionStatus) {
  const label = STATUS_LABELS[status];
  return (
    <span className="badge" style={{ background: STATUS_COLORS[status], color: '#0f172a', border: 'none' }} role="status" aria-label={`Status: ${label}`}>
      {label}
    </span>
  );
}
