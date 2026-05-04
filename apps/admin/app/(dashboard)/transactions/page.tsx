'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, RefreshCcw, Receipt, Download } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { fetchTransactions, setFilters } from '@/store/slices/transactionsSlice';
import { txnStatusBadge, txnTypeBadge } from '@/components/transactions/transactionBadges';
import { formatDateTime, formatMoney, truncateId } from '@/lib/utils/format';
import { toCsv, downloadCsv } from '@/lib/utils/csv';
import { getTransactions } from '@/lib/api/transactions.api';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';

export default function TransactionsPage(): JSX.Element {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const toast = useToast();
  const { items, pagination, filters, loading, error } = useAppSelector((s) => s.transactions);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    void dispatch(fetchTransactions({ page: 1, limit: 20 }));
  }, [dispatch]);

  async function exportCsv() {
    setExporting(true);
    try {
      const limit = 100;
      let page = 1;
      const all: typeof items = [];
      while (true) {
        const res = await getTransactions({
          page,
          limit,
          type: filters.type || '',
          status: filters.status || '',
          dateFrom: filters.dateFrom || '',
          dateTo: filters.dateTo || '',
          search: filters.search || '',
        });
        all.push(...(res.data ?? []));
        if (!res.hasNext) break;
        page += 1;
      }
      const rows = all.map((t) => {
        const orderIdStr =
          typeof t.orderId === 'string' ? t.orderId : t.orderId?._id != null ? String(t.orderId._id) : '';
        const orderNumber = typeof t.orderId === 'string' ? '' : t.orderId?.orderNumber ?? '';
        const customerIdStr =
          typeof t.customerId === 'string' ? t.customerId : t.customerId?._id != null ? String(t.customerId._id) : '';
        const customerPhone = typeof t.customerId === 'string' ? '' : t.customerId?.phone ?? '';
        return {
          transactionId: t._id,
          orderId: orderIdStr,
          orderNumber,
          customerId: customerIdStr,
          customerPhone,
          amount: t.amount,
          currency: t.currency,
          type: t.type,
          status: t.status,
          wifipayRef: t.wifipayRef ?? '',
          failureReason: t.failureReason ?? '',
          createdAt: t.createdAt,
        };
      });
      const csv = toCsv(rows as unknown as Record<string, unknown>[]);
      downloadCsv(`transactions-${new Date().toISOString().slice(0, 10)}.csv`, csv);
      toast.push({ title: 'CSV exported', description: `${rows.length} row(s)`, variant: 'success' });
    } catch (e) {
      toast.push({
        title: 'Export failed',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'danger',
      });
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div className="row adminPageHeader" style={{ justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: 'var(--text)' }}>Transactions</h1>
          <div className="muted" style={{ marginTop: 4 }}>Payments, refunds and payout records.</div>
        </div>
        <div className="row">
          <button className="btn" onClick={() => void dispatch(fetchTransactions(undefined))} disabled={loading} aria-label="Refresh transactions list">
            <RefreshCcw size={18} aria-hidden /> Refresh
          </button>
          <button
            className="btn btnPrimary"
            onClick={() => void exportCsv()}
            disabled={exporting || loading}
            aria-label="Export transactions to CSV"
          >
            <Download size={18} aria-hidden /> {exporting ? 'Exporting…' : 'Export CSV'}
          </button>
        </div>
      </div>

      <div className="card">
        <div className="cardBody">
          <div className="toolbar adminToolbarResponsive">
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
          {loading && items.length === 0 ? (
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
                  {Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i}><td colSpan={9}><Skeleton height={18} /></td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : items.length === 0 ? (
            <EmptyState icon={<Receipt size={48} />} heading="No transactions found" subtext="Try adjusting type, status or date range." />
          ) : (
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
                  {items.map((t) => {
                    const orderNumber = typeof t.orderId === 'string' ? t.orderId : t.orderId?.orderNumber ?? '—';
                    const customerPhone = typeof t.customerId === 'string' ? '' : t.customerId?.phone ?? '';
                    return (
                      <tr
                        key={t._id}
                        className="clickableRow"
                        onClick={() => router.push(`/transactions/${t._id}`)}
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
                        <td onClick={(e) => e.stopPropagation()}>
                          <Link href={`/transactions/${t._id}`} className="btn" aria-label="View transaction details">
                            <Eye size={18} aria-hidden />
                          </Link>
                        </td>
                      </tr>
                    );
                  })
                }
              </tbody>
            </table>
            </div>
          )}
          {items.length > 0 ? (
          <div className="row adminPaginationRow" style={{ justifyContent: 'space-between', marginTop: 12, alignItems: 'center' }}>
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
          ) : null}
        </div>
      </div>

    </div>
    </>
  );
}

