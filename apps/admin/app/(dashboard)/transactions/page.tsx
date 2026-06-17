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
import { useTranslations } from '@/lib/i18n/useTranslations';
import { formatT } from '@/lib/i18n/translations';

export default function TransactionsPage(): JSX.Element {
  const t = useTranslations();
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
      const rows = all.map((txn) => {
        const orderIdStr =
          typeof txn.orderId === 'string' ? txn.orderId : txn.orderId?._id != null ? String(txn.orderId._id) : '';
        const orderNumber = typeof txn.orderId === 'string' ? '' : txn.orderId?.orderNumber ?? '';
        const customerIdStr =
          typeof txn.customerId === 'string' ? txn.customerId : txn.customerId?._id != null ? String(txn.customerId._id) : '';
        const customerPhone = typeof txn.customerId === 'string' ? '' : txn.customerId?.phone ?? '';
        return {
          transactionId: txn._id,
          orderId: orderIdStr,
          orderNumber,
          customerId: customerIdStr,
          customerPhone,
          amount: txn.amount,
          currency: txn.currency,
          type: txn.type,
          status: txn.status,
          wifipayRef: txn.wifipayRef ?? '',
          failureReason: txn.failureReason ?? '',
          createdAt: txn.createdAt,
        };
      });
      const csv = toCsv(rows as unknown as Record<string, unknown>[]);
      downloadCsv(`transactions-${new Date().toISOString().slice(0, 10)}.csv`, csv);
      toast.push({ title: t.common.exportSuccess, description: formatT(t.transactions.rowsExported, { n: rows.length }), variant: 'success' });
    } catch (e) {
      toast.push({
        title: t.common.exportFailed,
        description: e instanceof Error ? e.message : t.common.unknownError,
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
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: 'var(--text)' }}>{t.transactions.title}</h1>
          <div className="muted" style={{ marginTop: 4 }}>{t.transactions.subtitle}</div>
        </div>
        <div className="row">
          <button className="btn" onClick={() => void dispatch(fetchTransactions(undefined))} disabled={loading} aria-label={t.common.refresh}>
            <RefreshCcw size={18} aria-hidden /> {t.common.refresh}
          </button>
          <button
            className="btn btnPrimary"
            onClick={() => void exportCsv()}
            disabled={exporting || loading}
            aria-label={t.common.exportCsv}
          >
            <Download size={18} aria-hidden /> {exporting ? t.common.exporting : t.common.exportCsv}
          </button>
        </div>
      </div>

      <div className="card">
        <div className="cardBody">
          <div className="toolbar adminToolbarResponsive">
            <div className="field" style={{ minWidth: 260 }}>
              <div className="label">{t.transactions.searchPlaceholder}</div>
              <input className="input" value={filters.search} onChange={(e) => dispatch(setFilters({ search: e.target.value }))} placeholder={t.transactions.searchWifipayPlaceholder} />
            </div>

            <div className="field">
              <div className="label">{t.transactions.type}</div>
              <select className="select" value={filters.type} onChange={(e) => dispatch(setFilters({ type: e.target.value }))}>
                <option value="">{t.common.all}</option>
                <option value="payment">{t.status.txn.payment}</option>
                <option value="refund">{t.status.txn.refund}</option>
                <option value="payout">{t.status.txn.payout}</option>
              </select>
            </div>
            <div className="field">
              <div className="label">{t.common.status}</div>
              <select className="select" value={filters.status} onChange={(e) => dispatch(setFilters({ status: e.target.value }))}>
                <option value="">{t.common.all}</option>
                <option value="pending">{t.status.payment.pending}</option>
                <option value="success">{t.status.txn.success}</option>
                <option value="failed">{t.status.payment.failed}</option>
              </select>
            </div>
            <div className="field">
              <div className="label">{t.orders.dateFrom}</div>
              <input className="input" type="date" value={filters.dateFrom} onChange={(e) => dispatch(setFilters({ dateFrom: e.target.value }))} />
            </div>
            <div className="field">
              <div className="label">{t.orders.dateTo}</div>
              <input className="input" type="date" value={filters.dateTo} onChange={(e) => dispatch(setFilters({ dateTo: e.target.value }))} />
            </div>
            <div className="field" style={{ minWidth: 120 }}>
              <div className="label"> </div>
              <button className="btn btnPrimary" onClick={() => void dispatch(fetchTransactions({ page: 1 }))}>
                {t.common.apply}
              </button>
            </div>
          </div>
          {error ? (
            <div style={{ marginTop: 12 }} className="muted">
              <span style={{ color: 'var(--danger)', fontWeight: 700 }}>{t.common.error}:</span> {error}
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
                    <th>{t.transactions.txnId}</th>
                    <th>{t.orders.orderNumber}</th>
                    <th>{t.transactions.customerPhone}</th>
                    <th>{t.common.amount}</th>
                    <th>{t.transactions.type}</th>
                    <th>{t.common.status}</th>
                    <th>{t.transactions.wifipayRef}</th>
                    <th>{t.common.date}</th>
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
            <EmptyState icon={<Receipt size={48} />} heading={t.empty.transactions} subtext={t.empty.transactionsSub} />
          ) : (
            <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>{t.transactions.txnId}</th>
                  <th>{t.orders.orderNumber}</th>
                  <th>{t.transactions.customerPhone}</th>
                  <th>{t.common.amount}</th>
                  <th>{t.transactions.type}</th>
                  <th>{t.common.status}</th>
                  <th>{t.transactions.wifipayRef}</th>
                  <th>{t.common.date}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                  {items.map((txn) => {
                    const orderNumber = typeof txn.orderId === 'string' ? txn.orderId : txn.orderId?.orderNumber ?? '—';
                    const customerPhone = typeof txn.customerId === 'string' ? '' : txn.customerId?.phone ?? '';
                    return (
                      <tr
                        key={txn._id}
                        className="clickableRow"
                        onClick={() => router.push(`/transactions/${txn._id}`)}
                      >
                        <td style={{ fontWeight: 800 }}>{truncateId(txn._id)}</td>
                        <td>{orderNumber}</td>
                        <td>{customerPhone || '—'}</td>
                        <td style={{ fontWeight: 800 }}>{formatMoney(txn.amount, txn.currency)}</td>
                        <td>{txnTypeBadge(txn.type)}</td>
                        <td>{txnStatusBadge(txn.status)}</td>
                        <td className="muted" style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {txn.wifipayRef ?? '—'}
                        </td>
                        <td className="muted">{formatDateTime(txn.createdAt)}</td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <Link href={`/transactions/${txn._id}`} className="btn" aria-label={t.common.view}>
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
              {formatT(t.common.pageOf, { page: pagination.page, totalPages: pagination.totalPages, total: pagination.total })}
            </div>
            <div className="row">
              <button className="btn" disabled={!pagination.hasPrev || loading} onClick={() => void dispatch(fetchTransactions({ page: pagination.page - 1 }))}>
                {t.common.prev}
              </button>
              <button className="btn" disabled={!pagination.hasNext || loading} onClick={() => void dispatch(fetchTransactions({ page: pagination.page + 1 }))}>
                {t.common.next}
              </button>
            </div>
          </div>
          ) : null}
        </div>
      </div>

      <div className="card">
        <div className="cardBody" style={{ textAlign: 'center', padding: '28px 24px' }}>
          <div style={{ fontWeight: 700, fontSize: 18, color: 'var(--text)' }}>{t.common.comingSoon}</div>
        </div>
      </div>

    </div>
    </>
  );
}
