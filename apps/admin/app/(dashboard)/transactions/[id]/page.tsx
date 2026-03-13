'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Copy, ChevronDown, ChevronUp } from 'lucide-react';
import type { TransactionListItem } from '@/lib/api/transactions.api';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { fetchTransactionById, refundTransactionThunk } from '@/store/slices/transactionsSlice';
import { formatDateTime, formatMoney, truncateId, copyToClipboard } from '@/lib/utils/format';
import { txnStatusBadge, txnTypeBadge } from '@/components/transactions/transactionBadges';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';

function asObj<T extends object>(v: unknown): T | null {
  if (!v || typeof v !== 'object') return null;
  return v as T;
}

export default function TransactionDetailPage() {
  const params = useParams();
  const id = typeof params?.id === 'string' ? params.id : '';
  const dispatch = useAppDispatch();
  const toast = useToast();
  const selected = useAppSelector((s) => s.transactions.selectedTransaction);
  const [loading, setLoading] = useState(false);
  const [showRaw, setShowRaw] = useState(true);
  const [refundReason, setRefundReason] = useState('');
  const [refunding, setRefunding] = useState(false);

  const tx = selected?._id === id ? selected : null;

  useEffect(() => {
    if (id) {
      setLoading(true);
      void dispatch(fetchTransactionById(id)).finally(() => setLoading(false));
    }
  }, [id, dispatch]);

  const order = asObj<{ _id: string; orderNumber?: string; total?: number }>(tx?.orderId);
  const customer = asObj<{ _id: string; name?: string; phone?: string }>(tx?.customerId);

  const rawJson = useMemo(() => {
    if (tx?.wifipayRawResponse == null) return '';
    try {
      return JSON.stringify(tx.wifipayRawResponse, null, 2);
    } catch {
      return String(tx.wifipayRawResponse);
    }
  }, [tx?.wifipayRawResponse]);

  const canRefund = Boolean(tx && tx.status === 'success' && tx.type === 'payment');

  async function copy(text: string, label: string) {
    const ok = await copyToClipboard(text);
    toast.push({ title: ok ? 'Copied' : 'Copy failed', description: label, variant: ok ? 'success' : 'danger' });
  }

  async function onRefund() {
    if (!tx) return;
    setRefunding(true);
    const action = await dispatch(refundTransactionThunk({ transactionId: tx._id, reason: refundReason.trim() || undefined }));
    setRefunding(false);
    if (refundTransactionThunk.fulfilled.match(action)) {
      toast.push({ title: 'Refund initiated', description: `Ref: ${(action.payload as { refundReference?: string })?.refundReference ?? ''}`, variant: 'success' });
    } else {
      toast.push({ title: 'Refund failed', description: String(action.payload ?? action.error?.message), variant: 'danger' });
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div className="row" style={{ alignItems: 'center', gap: 12 }}>
        <Link href="/transactions" className="btn" aria-label="Back to transactions">
          <ArrowLeft size={18} aria-hidden />
        </Link>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: 'var(--text)' }}>
          {tx ? `Transaction ${truncateId(tx._id)}` : 'Transaction detail'}
        </h1>
      </div>

      {!id ? (
        <div className="muted">Invalid transaction ID.</div>
      ) : loading && !tx ? (
        <Skeleton height={280} />
      ) : !tx ? (
        <div className="muted">Transaction not found.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div className="grid3">
            <div className="card" style={{ boxShadow: 'none' }}>
              <div className="cardBody">
                <div className="muted">Transaction</div>
                <div style={{ fontWeight: 800, marginTop: 6 }}>{truncateId(tx._id)}</div>
                <button type="button" className="btn" style={{ marginTop: 8 }} onClick={() => void copy(tx._id, 'Transaction ID')}>
                  <Copy size={16} /> Copy ID
                </button>
                <div className="divider" />
                <div>{txnTypeBadge(tx.type)}</div>
                <div style={{ marginTop: 6 }}>{txnStatusBadge(tx.status)}</div>
              </div>
            </div>
            <div className="card" style={{ boxShadow: 'none' }}>
              <div className="cardBody">
                <div className="muted">Amount</div>
                <div style={{ fontWeight: 800, fontSize: 22, marginTop: 6 }}>{formatMoney(tx.amount, tx.currency)}</div>
                <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>Created {formatDateTime(tx.createdAt)}</div>
                {tx.completedAt ? <div className="muted" style={{ fontSize: 12 }}>Completed {formatDateTime(tx.completedAt)}</div> : null}
                {tx.failureReason ? (
                  <div style={{ marginTop: 12, padding: 12, background: 'var(--danger-light)', borderRadius: 8 }}>
                    <div style={{ fontWeight: 700 }}>Failure</div>
                    <div className="muted" style={{ fontSize: 13 }}>{tx.failureReason}</div>
                  </div>
                ) : null}
              </div>
            </div>
            <div className="card" style={{ boxShadow: 'none' }}>
              <div className="cardBody">
                <div className="muted">References</div>
                <div style={{ marginTop: 8 }}>
                  <div className="muted" style={{ fontSize: 12 }}>Order</div>
                  <div style={{ fontWeight: 800 }}>{order?.orderNumber ?? (typeof tx.orderId === 'string' ? tx.orderId : '—')}</div>
                </div>
                <div style={{ marginTop: 12 }}>
                  <div className="muted" style={{ fontSize: 12 }}>WifiPay ref</div>
                  <div className="row" style={{ alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis' }}>{tx.wifipayRef ?? '—'}</span>
                    {tx.wifipayRef ? <button type="button" className="btn" onClick={() => void copy(tx.wifipayRef ?? '', 'WifiPay ref')}><Copy size={14} /></button> : null}
                  </div>
                </div>
                <div style={{ marginTop: 12 }}>
                  <div className="muted" style={{ fontSize: 12 }}>Customer</div>
                  <div style={{ fontWeight: 800 }}>{customer?.name ?? (typeof tx.customerId === 'string' ? tx.customerId : '—')}</div>
                  {customer?.phone ? <div className="muted" style={{ fontSize: 12 }}>{customer.phone}</div> : null}
                </div>
              </div>
            </div>
          </div>

          {/* Raw JSON viewer */}
          <div className="card">
            <div className="cardBody">
              <button type="button" className="btn" onClick={() => setShowRaw((v) => !v)}>
                {showRaw ? <ChevronUp size={16} /> : <ChevronDown size={16} />} WifiPay raw JSON
              </button>
              {showRaw ? (
                <pre
                  style={{
                    marginTop: 12,
                    padding: 16,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    background: 'var(--bg)',
                    borderRadius: 12,
                    fontSize: 12,
                    overflow: 'auto',
                    maxHeight: 400,
                  }}
                >
                  {rawJson || '—'}
                </pre>
              ) : null}
            </div>
          </div>

          {canRefund ? (
            <div className="card">
              <div className="cardBody">
                <div style={{ fontWeight: 800 }}>Refund</div>
                <div className="muted" style={{ marginTop: 4 }}>Allowed for successful payment transactions only.</div>
                <div className="divider" />
                <div className="field">
                  <div className="label">Reason (optional)</div>
                  <input className="input" value={refundReason} onChange={(e) => setRefundReason(e.target.value)} placeholder="Admin refund" />
                </div>
                <button type="button" className="btn" style={{ marginTop: 12, background: 'var(--danger)', color: 'white' }} onClick={() => void onRefund()} disabled={refunding}>
                  {refunding ? 'Refunding…' : 'Refund transaction'}
                </button>
              </div>
            </div>
          ) : (
            <div className="muted" style={{ fontSize: 13 }}>Refund is available only when status=success and type=payment.</div>
          )}
        </div>
      )}
    </div>
  );
}
