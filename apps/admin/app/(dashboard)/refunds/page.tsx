'use client';

import { useEffect, useMemo, useState } from 'react';
import { RefreshCcw, RotateCcw, Receipt } from 'lucide-react';
import { getTransactions, refundTransaction, type TransactionListItem } from '@/lib/api/transactions.api';
import { formatDateTime, formatMoney, truncateId } from '@/lib/utils/format';
import { txnStatusBadge } from '@/components/transactions/transactionBadges';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { useTranslations } from '@/lib/i18n/useTranslations';
import { formatT } from '@/lib/i18n/translations';

type RefundFilters = {
  status: string;
  dateFrom: string;
  dateTo: string;
  search: string;
};

type RefundPagination = {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
};

export default function RefundsPage(): JSX.Element {
  const t = useTranslations();
  const toast = useToast();
  const [filters, setFilters] = useState<RefundFilters>({ status: '', dateFrom: '', dateTo: '', search: '' });
  const [items, setItems] = useState<TransactionListItem[]>([]);
  const [pagination, setPagination] = useState<RefundPagination>({
    total: 0,
    page: 1,
    limit: 20,
    totalPages: 1,
    hasNext: false,
    hasPrev: false,
  });
  const [loading, setLoading] = useState(false);

  const [recordType, setRecordType] = useState<'full' | 'partial'>('full');
  const [transactionId, setTransactionId] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [recording, setRecording] = useState(false);

  const recordAmountDisabled = useMemo(() => recordType === 'full', [recordType]);

  async function load(page = 1): Promise<void> {
    setLoading(true);
    try {
      const res = await getTransactions({
        page,
        limit: pagination.limit,
        type: 'refund',
        status: filters.status || '',
        dateFrom: filters.dateFrom || '',
        dateTo: filters.dateTo || '',
        search: filters.search || '',
      });
      setItems(res.data ?? []);
      setPagination({
        total: res.total ?? 0,
        page: res.page ?? 1,
        limit: res.limit ?? 20,
        totalPages: res.totalPages ?? 1,
        hasNext: res.hasNext ?? false,
        hasPrev: res.hasPrev ?? false,
      });
    } catch (e: unknown) {
      toast.push({
        title: t.refunds.loadFailed,
        description: e instanceof Error ? e.message : t.common.error,
        variant: 'danger',
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(1);
  }, []);

  async function handleRecordRefund(): Promise<void> {
    const txId = transactionId.trim();
    if (!txId) {
      toast.push({ title: t.refunds.txnIdRequired, variant: 'danger' });
      return;
    }

    if (recordType === 'partial') {
      toast.push({
        title: t.refunds.partialNotSupported,
        description: t.refunds.fullRefundOnly,
        variant: 'danger',
      });
      return;
    }

    setRecording(true);
    try {
      await refundTransaction(txId, reason.trim() || undefined);
      toast.push({ title: t.refunds.recordSuccess, variant: 'success' });
      setTransactionId('');
      setAmount('');
      setReason('');
      await load(1);
    } catch (e: unknown) {
      toast.push({
        title: t.refunds.recordFailed,
        description: e instanceof Error ? e.message : t.common.error,
        variant: 'danger',
      });
    } finally {
      setRecording(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div className="row adminPageHeader" style={{ justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: 'var(--text)' }}>{t.refunds.title}</h1>
          <div className="muted" style={{ marginTop: 4 }}>{t.refunds.subtitleList}</div>
        </div>
        <button className="btn" onClick={() => void load(pagination.page)} disabled={loading}>
          <RefreshCcw size={18} /> {t.common.refresh}
        </button>
      </div>

      <div className="card">
        <div className="cardBody">
          <div className="toolbar adminToolbarResponsive">
            <div className="field" style={{ minWidth: 260 }}>
              <div className="label">{t.transactions.searchPlaceholder}</div>
              <input
                className="input"
                value={filters.search}
                onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
                placeholder={t.transactions.searchWifipayPlaceholder}
              />
            </div>
            <div className="field">
              <div className="label">{t.common.status}</div>
              <select className="select" value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
                <option value="">{t.common.all}</option>
                <option value="pending">{t.status.payment.pending}</option>
                <option value="success">{t.status.txn.success}</option>
                <option value="failed">{t.status.payment.failed}</option>
              </select>
            </div>
            <div className="field">
              <div className="label">{t.orders.dateFrom}</div>
              <input className="input" type="date" value={filters.dateFrom} onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))} />
            </div>
            <div className="field">
              <div className="label">{t.orders.dateTo}</div>
              <input className="input" type="date" value={filters.dateTo} onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))} />
            </div>
            <div className="field">
              <div className="label"> </div>
              <button className="btn btnPrimary" onClick={() => void load(1)}>{t.common.apply}</button>
            </div>
          </div>
        </div>
      </div>

      <div className="adminRefundsGrid">
        <div className="card adminRefundsListCard">
          <div className="cardBody">
            <h3 style={{ marginTop: 0 }}>{t.refunds.listTab}</h3>
            {loading && items.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Skeleton height={18} />
                <Skeleton height={18} />
                <Skeleton height={18} />
              </div>
            ) : items.length === 0 ? (
              <EmptyState icon={<Receipt size={40} />} heading={t.empty.refunds} />
            ) : (
              <>
                <div className="tableWrap">
                  <table>
                    <thead>
                      <tr>
                        <th>{t.refunds.refundTxn}</th>
                        <th>{t.orders.orderNumber}</th>
                        <th>{t.common.amount}</th>
                        <th>{t.common.status}</th>
                        <th>{t.refunds.transactionId}</th>
                        <th>{t.common.date}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((txn) => {
                        const orderNumber = typeof txn.orderId === 'string' ? txn.orderId : txn.orderId?.orderNumber ?? '—';
                        return (
                          <tr key={txn._id}>
                            <td style={{ fontWeight: 700 }}>{truncateId(txn._id)}</td>
                            <td>{orderNumber}</td>
                            <td style={{ fontWeight: 700 }}>{formatMoney(txn.amount, txn.currency)}</td>
                            <td>{txnStatusBadge(txn.status)}</td>
                            <td className="muted" style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {txn.wifipayRef ?? '—'}
                            </td>
                            <td className="muted">{formatDateTime(txn.createdAt)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="row adminPaginationRow" style={{ justifyContent: 'space-between', marginTop: 12 }}>
                  <div className="muted">{formatT(t.common.pageOf, { page: pagination.page, totalPages: pagination.totalPages, total: pagination.total })}</div>
                  <div className="row">
                    <button className="btn" disabled={!pagination.hasPrev || loading} onClick={() => void load(pagination.page - 1)}>{t.common.prev}</button>
                    <button className="btn" disabled={!pagination.hasNext || loading} onClick={() => void load(pagination.page + 1)}>{t.common.next}</button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="card adminRefundsRecordCard">
          <div className="cardBody">
            <h3 style={{ marginTop: 0 }}>{t.refunds.recordTab}</h3>
            <div className="field">
              <div className="label">{t.refunds.refundType}</div>
              <select className="select" value={recordType} onChange={(e) => setRecordType(e.target.value as 'full' | 'partial')}>
                <option value="full">{t.status.refundType.full}</option>
                <option value="partial">{t.status.refundType.partial}</option>
              </select>
            </div>
            <div className="field">
              <div className="label">{t.refunds.amount}</div>
              <input
                className="input"
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={recordAmountDisabled ? t.refunds.fullAmountPlaceholder : t.refunds.partialAmountPlaceholder}
                disabled={recordAmountDisabled}
              />
            </div>
            <div className="field">
              <div className="label">{t.refunds.reason}</div>
              <textarea
                className="input"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={t.refunds.reasonPlaceholder}
                rows={3}
              />
            </div>
            <div className="field">
              <div className="label">{t.refunds.transactionId}</div>
              <input
                className="input"
                value={transactionId}
                onChange={(e) => setTransactionId(e.target.value)}
                placeholder={t.refunds.txnIdPlaceholder}
              />
            </div>
            <button className="btn btnPrimary" onClick={() => void handleRecordRefund()} disabled={recording}>
              <RotateCcw size={16} /> {recording ? t.common.recording : t.orders.recordRefund}
            </button>
            <p className="muted" style={{ marginTop: 12, fontSize: 12 }}>
              {t.refunds.recordNote}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
