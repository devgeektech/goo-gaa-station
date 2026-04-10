'use client';

import { useEffect, useMemo, useState } from 'react';
import { RefreshCcw, RotateCcw, Receipt } from 'lucide-react';
import { getTransactions, refundTransaction, type TransactionListItem } from '@/lib/api/transactions.api';
import { formatDateTime, formatMoney, truncateId } from '@/lib/utils/format';
import { txnStatusBadge } from '@/components/transactions/transactionBadges';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';

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
        title: 'Failed to load refunds',
        description: e instanceof Error ? e.message : 'Error',
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
      toast.push({ title: 'Transaction ID is required', variant: 'danger' });
      return;
    }

    if (recordType === 'partial') {
      toast.push({
        title: 'Partial refund not supported yet',
        description: 'Current API supports full refunds only. Use Full refund for now.',
        variant: 'danger',
      });
      return;
    }

    setRecording(true);
    try {
      await refundTransaction(txId, reason.trim() || undefined);
      toast.push({ title: 'Refund recorded', variant: 'success' });
      setTransactionId('');
      setAmount('');
      setReason('');
      await load(1);
    } catch (e: unknown) {
      toast.push({
        title: 'Refund failed',
        description: e instanceof Error ? e.message : 'Error',
        variant: 'danger',
      });
    } finally {
      setRecording(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: 'var(--text)' }}>Refunds</h1>
          <div className="muted" style={{ marginTop: 4 }}>List of refunded orders with filters and refund recording.</div>
        </div>
        <button className="btn" onClick={() => void load(pagination.page)} disabled={loading}>
          <RefreshCcw size={18} /> Refresh
        </button>
      </div>

      <div className="card">
        <div className="cardBody">
          <div className="toolbar">
            <div className="field" style={{ minWidth: 260 }}>
              <div className="label">Search (WifiPay ref)</div>
              <input
                className="input"
                value={filters.search}
                onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
                placeholder="wifipayRef…"
              />
            </div>
            <div className="field">
              <div className="label">Status</div>
              <select className="select" value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
                <option value="">All</option>
                <option value="pending">Pending</option>
                <option value="success">Success</option>
                <option value="failed">Failed</option>
              </select>
            </div>
            <div className="field">
              <div className="label">Date from</div>
              <input className="input" type="date" value={filters.dateFrom} onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))} />
            </div>
            <div className="field">
              <div className="label">Date to</div>
              <input className="input" type="date" value={filters.dateTo} onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))} />
            </div>
            <div className="field">
              <div className="label"> </div>
              <button className="btn btnPrimary" onClick={() => void load(1)}>Apply</button>
            </div>
          </div>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1.6fr 1fr', gap: 16 }}>
        <div className="card">
          <div className="cardBody">
            <h3 style={{ marginTop: 0 }}>Refund list</h3>
            {loading && items.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Skeleton height={18} />
                <Skeleton height={18} />
                <Skeleton height={18} />
              </div>
            ) : items.length === 0 ? (
              <EmptyState icon={<Receipt size={40} />} heading="No refunds found" subtext="Try adjusting filters." />
            ) : (
              <>
                <div className="tableWrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Refund Txn</th>
                        <th>Order#</th>
                        <th>Amount</th>
                        <th>Status</th>
                        <th>Transaction ID</th>
                        <th>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((t) => {
                        const orderNumber = typeof t.orderId === 'string' ? t.orderId : t.orderId?.orderNumber ?? '—';
                        return (
                          <tr key={t._id}>
                            <td style={{ fontWeight: 700 }}>{truncateId(t._id)}</td>
                            <td>{orderNumber}</td>
                            <td style={{ fontWeight: 700 }}>{formatMoney(t.amount, t.currency)}</td>
                            <td>{txnStatusBadge(t.status)}</td>
                            <td className="muted" style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {t.wifipayRef ?? '—'}
                            </td>
                            <td className="muted">{formatDateTime(t.createdAt)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="row" style={{ justifyContent: 'space-between', marginTop: 12 }}>
                  <div className="muted">Page {pagination.page} / {pagination.totalPages} • Total {pagination.total}</div>
                  <div className="row">
                    <button className="btn" disabled={!pagination.hasPrev || loading} onClick={() => void load(pagination.page - 1)}>Prev</button>
                    <button className="btn" disabled={!pagination.hasNext || loading} onClick={() => void load(pagination.page + 1)}>Next</button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="card">
          <div className="cardBody">
            <h3 style={{ marginTop: 0 }}>Record refund</h3>
            <div className="field">
              <div className="label">Refund type</div>
              <select className="select" value={recordType} onChange={(e) => setRecordType(e.target.value as 'full' | 'partial')}>
                <option value="full">Full</option>
                <option value="partial">Partial</option>
              </select>
            </div>
            <div className="field">
              <div className="label">Amount</div>
              <input
                className="input"
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={recordAmountDisabled ? 'Full amount from transaction' : 'Enter partial amount'}
                disabled={recordAmountDisabled}
              />
            </div>
            <div className="field">
              <div className="label">Reason</div>
              <textarea
                className="input"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Reason for refund"
                rows={3}
              />
            </div>
            <div className="field">
              <div className="label">Transaction ID</div>
              <input
                className="input"
                value={transactionId}
                onChange={(e) => setTransactionId(e.target.value)}
                placeholder="Original payment transaction ID"
              />
            </div>
            <button className="btn btnPrimary" onClick={() => void handleRecordRefund()} disabled={recording}>
              <RotateCcw size={16} /> {recording ? 'Recording…' : 'Record refund'}
            </button>
            <p className="muted" style={{ marginTop: 12, fontSize: 12 }}>
              Transaction ID is required. Current backend supports full refund processing by transaction ID.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

