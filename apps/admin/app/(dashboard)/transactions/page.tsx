'use client';

import { useEffect, useState } from 'react';
import { Eye, RefreshCcw } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { fetchTransactions, setFilters, setSelectedTransaction } from '@/store/slices/transactionsSlice';
import { txnStatusBadge, txnTypeBadge } from '@/components/transactions/transactionBadges';
import { formatDateTime, formatMoney, truncateId } from '@/lib/utils/format';
import { Skeleton } from '@/components/ui/Skeleton';
import { TransactionDetailModal } from '@/components/transactions/TransactionDetailModal';

export default function TransactionsPage() {
  const dispatch = useAppDispatch();
  const { items, pagination, filters, loading, error, selectedTransaction } = useAppSelector((s) => s.transactions);
  const [detailOpen, setDetailOpen] = useState(false);

  useEffect(() => {
    void dispatch(fetchTransactions({ page: 1, limit: 20 }));
  }, [dispatch]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: 'var(--text)' }}>Transactions</h1>
          <div className="muted" style={{ marginTop: 4 }}>Payments, refunds and payout records.</div>
        </div>
        <button className="btn" onClick={() => void dispatch(fetchTransactions(undefined))} disabled={loading} aria-label="Refresh transactions list">
          <RefreshCcw size={18} aria-hidden /> Refresh
        </button>
      </div>

      <div className="card">
        <div className="cardBody">
          <div className="toolbar">
            <div className="field" style={{ minWidth: 260 }}>
              <div className="label">Search (WifiPay ref)</div>
              <input className="input" value={filters.search} onChange={(e) => dispatch(setFilters({ search: e.target.value }))} placeholder="wifipayRef…" />
            </div>

            <div className="field">
              <div className="label">Type</div>
              <select className="select" value={filters.type} onChange={(e) => dispatch(setFilters({ type: e.target.value }))}>
                <option value="">All</option>
                <option value="payment">Payment</option>
                <option value="refund">Refund</option>
                <option value="payout">Payout</option>
              </select>
            </div>
            <div className="field">
              <div className="label">Status</div>
              <select className="select" value={filters.status} onChange={(e) => dispatch(setFilters({ status: e.target.value }))}>
                <option value="">All</option>
                <option value="pending">Pending</option>
                <option value="success">Success</option>
                <option value="failed">Failed</option>
              </select>
            </div>
            <div className="field">
              <div className="label">Date from</div>
              <input className="input" type="date" value={filters.dateFrom} onChange={(e) => dispatch(setFilters({ dateFrom: e.target.value }))} />
            </div>
            <div className="field">
              <div className="label">Date to</div>
              <input className="input" type="date" value={filters.dateTo} onChange={(e) => dispatch(setFilters({ dateTo: e.target.value }))} />
            </div>
            <div className="field" style={{ minWidth: 120 }}>
              <div className="label"> </div>
              <button className="btn btnPrimary" onClick={() => void dispatch(fetchTransactions({ page: 1 }))}>
                Apply
              </button>
            </div>
          </div>
          {error ? (
            <div style={{ marginTop: 12 }} className="muted">
              <span style={{ color: 'var(--danger)', fontWeight: 700 }}>Error:</span> {error}
            </div>
          ) : null}
        </div>
      </div>

      <div className="card">
        <div className="cardBody">
          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>Txn ID</th>
                  <th>Order#</th>
                  <th>Customer phone</th>
                  <th>Amount</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>WifiPay Ref</th>
                  <th>Date</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {loading && items.length === 0 ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={9}>
                        <Skeleton height={18} />
                      </td>
                    </tr>
                  ))
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="muted">
                      No transactions found.
                    </td>
                  </tr>
                ) : (
                  items.map((t) => {
                    const orderNumber = typeof t.orderId === 'string' ? t.orderId : t.orderId?.orderNumber ?? '—';
                    const customerPhone = typeof t.customerId === 'string' ? '' : t.customerId?.phone ?? '';
                    return (
                      <tr
                        key={t._id}
                        className="clickableRow"
                        onClick={() => {
                          dispatch(setSelectedTransaction(t));
                          setDetailOpen(true);
                        }}
                      >
                        <td style={{ fontWeight: 800 }}>{truncateId(t._id)}</td>
                        <td>{orderNumber}</td>
                        <td>{customerPhone || '—'}</td>
                        <td style={{ fontWeight: 800 }}>{formatMoney(t.amount, t.currency)}</td>
                        <td>{txnTypeBadge(t.type)}</td>
                        <td>{txnStatusBadge(t.status)}</td>
                        <td className="muted" style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {t.wifipayRef ?? '—'}
                        </td>
                        <td className="muted">{formatDateTime(t.createdAt)}</td>
                        <td>
                          <button
                            className="btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              dispatch(setSelectedTransaction(t));
                              setDetailOpen(true);
                            }}
                            aria-label="View transaction details"
                          >
                            <Eye size={18} aria-hidden />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="row" style={{ justifyContent: 'space-between', marginTop: 12, alignItems: 'center' }}>
            <div className="muted">
              Page {pagination.page} / {pagination.totalPages} • Total {pagination.total}
            </div>
            <div className="row">
              <button className="btn" disabled={!pagination.hasPrev || loading} onClick={() => void dispatch(fetchTransactions({ page: pagination.page - 1 }))}>
                Prev
              </button>
              <button className="btn" disabled={!pagination.hasNext || loading} onClick={() => void dispatch(fetchTransactions({ page: pagination.page + 1 }))}>
                Next
              </button>
            </div>
          </div>
        </div>
      </div>

      <TransactionDetailModal
        open={detailOpen}
        transactionId={selectedTransaction?._id ?? null}
        onClose={() => setDetailOpen(false)}
      />
    </div>
  );
}

