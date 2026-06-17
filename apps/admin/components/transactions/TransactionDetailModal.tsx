'use client';

import { useEffect, useMemo, useState } from 'react';
import { Copy, ChevronDown, ChevronUp } from 'lucide-react';
import type { TransactionListItem } from '@/lib/api/transactions.api';
import { Modal } from '@/components/ui/Modal';
import { Skeleton } from '@/components/ui/Skeleton';
import { copyToClipboard, formatDateTime, formatMoney, truncateId } from '@/lib/utils/format';
import { useToast } from '@/components/ui/Toast';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { fetchTransactionById, refundTransactionThunk } from '@/store/slices/transactionsSlice';
import { useTranslations } from '@/lib/i18n/useTranslations';
import { formatT } from '@/lib/i18n/translations';

function asObj<T extends object>(v: unknown): T | null {
  if (!v || typeof v !== 'object') return null;
  return v as T;
}

export function TransactionDetailModal({
  open,
  transactionId,
  onClose,
}: {
  open: boolean;
  transactionId: string | null;
  onClose: () => void;
}) {
  const t = useTranslations();
  const dispatch = useAppDispatch();
  const toast = useToast();
  const selected = useAppSelector((s) => s.transactions.selectedTransaction);
  const [localLoading, setLocalLoading] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const [refundReason, setRefundReason] = useState('');
  const [refunding, setRefunding] = useState(false);

  const tx = selected && transactionId && selected._id === transactionId ? selected : null;

  useEffect(() => {
    if (!open || !transactionId) return;
    setLocalLoading(true);
    void dispatch(fetchTransactionById(transactionId)).finally(() => setLocalLoading(false));
  }, [dispatch, open, transactionId]);

  const order = asObj<{ _id: string; orderNumber?: string; total?: number }>(tx?.orderId);
  const customer = asObj<{ _id: string; name?: string; phone?: string }>(tx?.customerId);

  const raw = useMemo(() => {
    if (!tx?.wifipayRawResponse) return '';
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
        description: formatT(t.transactions.refundInitiatedDesc, { ref: action.payload.refundReference }),
        variant: 'success',
      });
    } else {
      toast.push({ title: t.refunds.recordFailed, description: String(action.payload ?? action.error.message), variant: 'danger' });
    }
  }

  return (
    <Modal open={open} title={tx ? formatT(t.transactions.txnTitle, { id: truncateId(tx._id) }) : t.transactions.modalTitle} onClose={onClose}>
      {localLoading && !tx ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Skeleton height={18} />
          <Skeleton height={120} />
        </div>
      ) : !tx ? (
        <div className="muted">{t.transactions.noTxnSelected}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="grid3">
            <div className="card" style={{ boxShadow: 'none' }}>
              <div className="cardBody">
                <div className="muted">{t.transactions.sectionTxn}</div>
                <div style={{ fontWeight: 900, marginTop: 6 }}>{truncateId(tx._id)}</div>
                <div className="row" style={{ marginTop: 8 }}>
                  <button className="btn" onClick={() => void copy(tx._id, t.transactions.txnId)}>
                    <Copy size={16} /> {t.transactions.copyTxnId}
                  </button>
                </div>
                <div className="divider" />
                <div className="muted">{t.common.typeLabel}</div>
                <div style={{ fontWeight: 800 }}>{tx.type}</div>
                <div className="muted" style={{ marginTop: 6 }}>
                  {formatT(t.common.statusLabel, { status: tx.status })}
                </div>
              </div>
            </div>

            <div className="card" style={{ boxShadow: 'none' }}>
              <div className="cardBody">
                <div className="muted">{t.common.amount}</div>
                <div style={{ fontWeight: 900, fontSize: 18, marginTop: 6 }}>{formatMoney(tx.amount, tx.currency)}</div>
                <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
                  {formatT(t.common.createdLabel, { date: formatDateTime(tx.createdAt) })}
                </div>
                <div className="muted" style={{ fontSize: 12 }}>
                  {formatT(t.common.completedLabel, { date: formatDateTime(tx.completedAt ?? null) })}
                </div>
                {tx.failureReason ? (
                  <div className="card" style={{ padding: 10, marginTop: 10, boxShadow: 'none', borderLeft: '4px solid var(--danger)' }}>
                    <div style={{ fontWeight: 700 }}>{t.transactions.failure}</div>
                    <div className="muted">{tx.failureReason}</div>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="card" style={{ boxShadow: 'none' }}>
              <div className="cardBody">
                <div className="muted">{t.transactions.references}</div>
                <div style={{ marginTop: 6 }}>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {t.transactions.order}
                  </div>
                  <div style={{ fontWeight: 800 }}>{order?.orderNumber ?? (typeof tx.orderId === 'string' ? tx.orderId : '—')}</div>
                </div>
                <div style={{ marginTop: 10 }}>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {t.transactions.wifipayRef}
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <div style={{ fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis' }}>{tx.wifipayRef ?? '—'}</div>
                    {tx.wifipayRef ? (
                      <button className="btn" onClick={() => void copy(tx.wifipayRef ?? '', t.transactions.wifipayRef)}>
                        <Copy size={16} />
                      </button>
                    ) : null}
                  </div>
                </div>
                <div style={{ marginTop: 10 }}>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {t.transactions.customer}
                  </div>
                  <div style={{ fontWeight: 800 }}>{customer?.name ?? (typeof tx.customerId === 'string' ? tx.customerId : '—')}</div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {customer?.phone ?? ''}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="card" style={{ boxShadow: 'none' }}>
            <div className="cardBody">
              <button className="btn" onClick={() => setShowRaw((v) => !v)} type="button">
                {showRaw ? <ChevronUp size={16} /> : <ChevronDown size={16} />} {t.transactions.wifipayJson}
              </button>
              {showRaw ? (
                <pre
                  className="card"
                  style={{
                    marginTop: 10,
                    padding: 12,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    boxShadow: 'none',
                    background: 'var(--bg)',
                    borderRadius: 12,
                  }}
                >
                  {raw || '—'}
                </pre>
              ) : null}
            </div>
          </div>

          {canRefund ? (
            <div className="card" style={{ boxShadow: 'none' }}>
              <div className="cardBody">
                <div style={{ fontWeight: 900 }}>{t.transactions.refundSection}</div>
                <div className="muted" style={{ marginTop: 4 }}>
                  {t.transactions.refundMarkOrder}
                </div>
                <div className="divider" />
                <div className="field" style={{ minWidth: 'auto' }}>
                  <div className="label">{t.common.noteOptional}</div>
                  <input className="input" value={refundReason} onChange={(e) => setRefundReason(e.target.value)} placeholder={t.transactions.refundReasonPlaceholder} />
                </div>
                <button className="btn btnDanger" style={{ marginTop: 10 }} onClick={() => void onRefund()} disabled={refunding}>
                  {refunding ? t.transactions.refunding : t.transactions.refundTxn}
                </button>
              </div>
            </div>
          ) : (
            <div className="muted" style={{ fontSize: 13 }}>
              {t.transactions.refundDisabled}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
