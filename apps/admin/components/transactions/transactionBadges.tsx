'use client';

import type { TransactionStatus, TransactionType } from '@/lib/api/transactions.api';
import { useTranslations } from '@/lib/i18n/useTranslations';

const TYPE_COLORS: Record<TransactionType, string> = {
  payment: '#dcfce7',
  refund: '#f3e8ff',
  payout: '#dbeafe',
};

const STATUS_COLORS: Record<TransactionStatus, string> = {
  pending: '#fef3c7',
  success: '#dcfce7',
  failed: '#fee2e2',
};

export function TxnTypeBadge({ type }: { type: TransactionType }) {
  const t = useTranslations();
  const label = t.status.txn[type];
  return (
    <span className="badge" style={{ background: TYPE_COLORS[type], color: '#0f172a', border: 'none' }} role="status" aria-label={`Type: ${label}`}>
      {label}
    </span>
  );
}

export function TxnStatusBadge({ status }: { status: TransactionStatus }) {
  const t = useTranslations();
  const label =
    status === 'success'
      ? t.status.txn.success
      : status === 'failed'
        ? t.status.payment.failed
        : t.status.payment.pending;
  return (
    <span className="badge" style={{ background: STATUS_COLORS[status], color: '#0f172a', border: 'none' }} role="status" aria-label={`Status: ${label}`}>
      {label}
    </span>
  );
}

/** @deprecated Use <TxnTypeBadge type={...} /> */
export function txnTypeBadge(type: TransactionType) {
  return <TxnTypeBadge type={type} />;
}

/** @deprecated Use <TxnStatusBadge status={...} /> */
export function txnStatusBadge(status: TransactionStatus) {
  return <TxnStatusBadge status={status} />;
}
