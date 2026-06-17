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
import { useTranslations } from '@/lib/i18n/useTranslations';
import { formatT } from '@/lib/i18n/translations';

function asObj<T extends object>(v: unknown): T | null {
  if (!v || typeof v !== 'object') return null;
  return v as T;
}

export default function TransactionDetailPage() {
  const t = useTranslations();
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
    toast.push({ title: ok ? t.common.copied : t.common.copyFailed, description: label, variant: ok ? 'success' : 'danger' });
  }

  async function onRefund() {
    if (!tx) return;
    setRefunding(true);
    const action = await dispatch(refundTransactionThunk({ transactionId: tx._id, reason: refundReason.trim() || undefined }));
    setRefunding(false);
    if (refundTransactionThunk.fulfilled.match(action)) {
      toast.push({
        title: t.transactions.refundInitiated,
        description: formatT(t.transactions.refundInitiatedDesc, { ref: (action.payload as { refundReference?: string })?.refundReference ?? '' }),
        variant: 'success',
      });
    } else {
      toast.push({ title: t.refunds.recordFailed, description: String(action.payload ?? action.error?.message), variant: 'danger' });
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div className="row" style={{ alignItems: 'center', gap: 12 }}>
        <Link href="/transactions" className="btn" aria-label={t.common.backToTransactions}>
          <ArrowLeft size={18} aria-hidden />
        </Link>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: 'var(--text)' }}>
          {tx ? formatT(t.transactions.txnTitle, { id: truncateId(tx._id) }) : t.transactions.detailTitle}
        </h1>
      </div>

      {!id ? (
        <div className="muted">{t.transactions.invalidId}</div>
      ) : loading && !tx ? (
        <Skeleton height={280} />
      ) : !tx ? (
        <div className="muted">{t.transactions.notFound}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div className="grid3">
            <div className="card" style={{ boxShadow: 'none' }}>
              <div className="cardBody">
                <div className="muted">{t.transactions.sectionTxn}</div>
                <div style={{ fontWeight: 800, marginTop: 6 }}>{truncateId(tx._id)}</div>
                <button type="button" className="btn" style={{ marginTop: 8 }} onClick={() => void copy(tx._id, t.transactions.txnId)}>
                  <Copy size={16} /> {t.transactions.copyIdLabel}
                </button>
                <div className="divider" />
                <div>{txnTypeBadge(tx.type)}</div>
                <div style={{ marginTop: 6 }}>{txnStatusBadge(tx.status)}</div>
              </div>
            </div>
            <div className="card" style={{ boxShadow: 'none' }}>
              <div className="cardBody">
                <div className="muted">{t.common.amount}</div>
                <div style={{ fontWeight: 800, fontSize: 22, marginTop: 6 }}>{formatMoney(tx.amount, tx.currency)}</div>
                <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>{formatT(t.common.createdLabel, { date: formatDateTime(tx.createdAt) })}</div>
                {tx.completedAt ? <div className="muted" style={{ fontSize: 12 }}>{formatT(t.common.completedLabel, { date: formatDateTime(tx.completedAt) })}</div> : null}
                {tx.failureReason ? (
                  <div style={{ marginTop: 12, padding: 12, background: 'var(--danger-light)', borderRadius: 8 }}>
                    <div style={{ fontWeight: 700 }}>{t.transactions.failure}</div>
                    <div className="muted" style={{ fontSize: 13 }}>{tx.failureReason}</div>
                  </div>
                ) : null}
              </div>
            </div>
            <div className="card" style={{ boxShadow: 'none' }}>
              <div className="cardBody">
                <div className="muted">{t.transactions.references}</div>
                <div style={{ marginTop: 8 }}>
                  <div className="muted" style={{ fontSize: 12 }}>{t.transactions.order}</div>
                  <div style={{ fontWeight: 800 }}>{order?.orderNumber ?? (typeof tx.orderId === 'string' ? tx.orderId : '—')}</div>
                </div>
                <div style={{ marginTop: 12 }}>
                  <div className="muted" style={{ fontSize: 12 }}>{t.transactions.wifipayRef}</div>
                  <div className="row" style={{ alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis' }}>{tx.wifipayRef ?? '—'}</span>
                    {tx.wifipayRef ? <button type="button" className="btn" onClick={() => void copy(tx.wifipayRef ?? '', t.transactions.wifipayRef)}><Copy size={14} /></button> : null}
                  </div>
                </div>
                <div style={{ marginTop: 12 }}>
                  <div className="muted" style={{ fontSize: 12 }}>{t.transactions.customer}</div>
                  <div style={{ fontWeight: 800 }}>{customer?.name ?? (typeof tx.customerId === 'string' ? tx.customerId : '—')}</div>
                  {customer?.phone ? <div className="muted" style={{ fontSize: 12 }}>{customer.phone}</div> : null}
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="cardBody">
              <button type="button" className="btn" onClick={() => setShowRaw((v) => !v)}>
                {showRaw ? <ChevronUp size={16} /> : <ChevronDown size={16} />} {t.transactions.wifipayJson}
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
                <div style={{ fontWeight: 800 }}>{t.transactions.refundSection}</div>
                <div className="muted" style={{ marginTop: 4 }}>{t.transactions.refundMarkOrder}</div>
                <div className="divider" />
                <div className="field">
                  <div className="label">{t.common.noteOptional}</div>
                  <input className="input" value={refundReason} onChange={(e) => setRefundReason(e.target.value)} placeholder={t.transactions.refundReasonPlaceholder} />
                </div>
                <button type="button" className="btn" style={{ marginTop: 12, background: 'var(--danger)', color: 'white' }} onClick={() => void onRefund()} disabled={refunding}>
                  {refunding ? t.transactions.refunding : t.transactions.refundTxn}
                </button>
              </div>
            </div>
          ) : (
            <div className="muted" style={{ fontSize: 13 }}>{t.transactions.refundDisabled}</div>
          )}
        </div>
      )}
    </div>
  );
}
