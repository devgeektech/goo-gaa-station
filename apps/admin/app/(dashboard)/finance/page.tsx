'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Wallet, RefreshCcw, Download } from 'lucide-react';
import { getOrders, type OrderListItem } from '@/lib/api/orders.api';
import { formatMoney, formatDateTime } from '@/lib/utils/format';
import { toCsv, downloadCsv } from '@/lib/utils/csv';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { useTranslations } from '@/lib/i18n/useTranslations';
import { formatT } from '@/lib/i18n/translations';

type PaginationState = {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
};

const initialPagination: PaginationState = {
  total: 0,
  page: 1,
  limit: 20,
  totalPages: 1,
  hasNext: false,
  hasPrev: false,
};

const ORDER_STATUS_VALUES = ['placed', 'confirmed', 'preparing', 'picked_up', 'on_the_way', 'delivered', 'cancelled'] as const;

function toNumber(value: unknown, fallback = 0): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function revenueFromOrder(order: OrderListItem) {
  return {
    orderAmount: toNumber(order.orderAmount, toNumber(order.total)),
    driverFee: toNumber(order.driverFee, toNumber(order.deliveryFee)),
    netOrderAmount: toNumber(order.netOrderAmount),
    commission: toNumber(order.commission, toNumber(order.adminRevenue)),
    adminRevenue: toNumber(order.adminRevenue, toNumber(order.commission)),
    vendorRevenue: toNumber(order.vendorRevenue),
    driverRevenue: toNumber(order.driverRevenue, toNumber(order.driverFee, toNumber(order.deliveryFee))),
    refundAmount: toNumber(order.refundAmount),
    countsTowardRevenue: order.countsTowardRevenue ?? (order.status === 'delivered' && order.paymentStatus !== 'refunded'),
  };
}

export default function FinancePage() {
  const t = useTranslations();
  const toast = useToast();
  const [items, setItems] = useState<OrderListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [pagination, setPagination] = useState<PaginationState>(initialPagination);
  const [filters, setFilters] = useState({
    search: '',
    dateFrom: '',
    dateTo: '',
    vendorId: '',
    status: '',
  });

  async function load(page = 1) {
    setLoading(true);
    try {
      const res = await getOrders({
        page,
        limit: pagination.limit,
        search: filters.search || '',
        dateFrom: filters.dateFrom || '',
        dateTo: filters.dateTo || '',
        vendorId: filters.vendorId || '',
        status: filters.status || '',
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
    } catch (e) {
      toast.push({
        title: t.finance.loadFailed,
        description: e instanceof Error ? e.message : t.common.unknownError,
        variant: 'danger',
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function exportCsvLedger() {
    setExporting(true);
    try {
      const limit = 100;
      let page = 1;
      const all: OrderListItem[] = [];
      while (true) {
        const res = await getOrders({
          page,
          limit,
          search: filters.search || '',
          dateFrom: filters.dateFrom || '',
          dateTo: filters.dateTo || '',
          vendorId: filters.vendorId || '',
          status: filters.status || '',
        });
        all.push(...(res.data ?? []));
        if (!res.hasNext) break;
        page += 1;
      }
      const rows = all.map((order) => {
        const r = revenueFromOrder(order);
        const vendorIdStr = typeof order.vendorId === 'string' ? order.vendorId : order.vendorId?._id ?? '';
        const vendorName = typeof order.vendorId === 'string' ? '' : order.vendorId?.name ?? '';
        const customerIdStr =
          typeof order.customerId === 'string' ? order.customerId : order.customerId?._id ?? '';
        return {
          orderId: order._id,
          orderNumber: order.orderNumber,
          status: order.status,
          paymentStatus: order.paymentStatus,
          vendorId: vendorIdStr,
          vendorName,
          customerId: customerIdStr,
          orderAmount: r.orderAmount,
          driverFee: r.driverFee,
          netOrderAmount: r.netOrderAmount,
          commission: r.commission,
          adminRevenue: r.adminRevenue,
          vendorRevenue: r.vendorRevenue,
          driverRevenue: r.driverRevenue,
          refundAmount: r.refundAmount,
          createdAt: order.createdAt,
        };
      });
      const csv = toCsv(rows as unknown as Record<string, unknown>[]);
      downloadCsv(`finance-ledger-${new Date().toISOString().slice(0, 10)}.csv`, csv);
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

  const totals = useMemo(() => {
    return items.reduce(
      (acc, order) => {
        const r = revenueFromOrder(order);
        if (!r.countsTowardRevenue) return acc;
        acc.orderAmount += r.orderAmount;
        acc.adminRevenue += r.adminRevenue;
        acc.vendorRevenue += r.vendorRevenue;
        acc.driverRevenue += r.driverRevenue;
        return acc;
      },
      { orderAmount: 0, adminRevenue: 0, vendorRevenue: 0, driverRevenue: 0 }
    );
  }, [items]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div className="row adminPageHeader" style={{ justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 className="pageTitle">{t.finance.title}</h1>
          <div className="pageSubtitle">{t.finance.subtitleDetailed}</div>
        </div>
        <div className="row">
          <button className="btn" onClick={() => void load(pagination.page)} disabled={loading}>
            <RefreshCcw size={18} aria-hidden /> {t.common.refresh}
          </button>
          <button
            className="btn btnPrimary"
            onClick={() => void exportCsvLedger()}
            disabled={exporting || loading}
            aria-label={t.common.exportCsv}
          >
            <Download size={18} aria-hidden /> {exporting ? t.common.exporting : t.common.exportCsv}
          </button>
        </div>
      </div>

      <div className="grid4">
        <div className="card"><div className="cardBody"><div className="muted" style={{ fontSize: 13 }}>{t.finance.orderAmountPage}</div><div style={{ fontSize: 24, fontWeight: 800, marginTop: 4 }}>{formatMoney(totals.orderAmount)}</div></div></div>
        <div className="card"><div className="cardBody"><div className="muted" style={{ fontSize: 13 }}>{t.finance.adminRevenuePage}</div><div style={{ fontSize: 24, fontWeight: 800, marginTop: 4 }}>{formatMoney(totals.adminRevenue)}</div></div></div>
        <div className="card"><div className="cardBody"><div className="muted" style={{ fontSize: 13 }}>{t.finance.vendorRevenuePage}</div><div style={{ fontSize: 24, fontWeight: 800, marginTop: 4 }}>{formatMoney(totals.vendorRevenue)}</div></div></div>
        <div className="card"><div className="cardBody"><div className="muted" style={{ fontSize: 13 }}>{t.finance.driverFeesPage}</div><div style={{ fontSize: 24, fontWeight: 800, marginTop: 4 }}>{formatMoney(totals.driverRevenue)}</div></div></div>
      </div>

      <div className="card">
        <div className="cardBody">
          <div className="toolbar adminToolbarResponsive">
            <div className="field" style={{ minWidth: 240 }}>
              <div className="label">{t.finance.searchLabel}</div>
              <input
                className="input"
                value={filters.search}
                onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
                placeholder={t.orders.searchOrderPlaceholder}
              />
            </div>
            <div className="field">
              <div className="label">{t.common.status}</div>
              <select className="select" value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
                <option value="">{t.common.all}</option>
                {ORDER_STATUS_VALUES.map((value) => (
                  <option key={value} value={value}>{t.status.order[value]}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <div className="label">{t.finance.dateFrom}</div>
              <input className="input" type="date" value={filters.dateFrom} onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))} />
            </div>
            <div className="field">
              <div className="label">{t.finance.dateTo}</div>
              <input className="input" type="date" value={filters.dateTo} onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))} />
            </div>
            <div className="field" style={{ minWidth: 160 }}>
              <div className="label">{t.finance.vendorId}</div>
              <input
                className="input"
                value={filters.vendorId}
                onChange={(e) => setFilters((f) => ({ ...f, vendorId: e.target.value }))}
                placeholder={t.finance.vendorIdOptional}
              />
            </div>
            <div className="field">
              <div className="label"> </div>
              <button className="btn btnPrimary" onClick={() => void load(1)}>{t.common.apply}</button>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="cardBody">
          {loading && items.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} height={46} />)}
            </div>
          ) : items.length === 0 ? (
            <EmptyState icon={<Wallet size={44} />} heading={t.empty.ledger} subtext={t.empty.ledgerSub} />
          ) : (
            <div className="tableWrap">
              <table>
                <thead>
                  <tr>
                    <th>{t.orders.orderNumber}</th>
                    <th>{t.finance.vendor}</th>
                    <th>{t.finance.orderAmt}</th>
                    <th>{t.finance.driverFee}</th>
                    <th>{t.finance.adminCommission}</th>
                    <th>{t.finance.vendor}</th>
                    <th>{t.common.date}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((order) => {
                    const r = revenueFromOrder(order);
                    const vendorName = typeof order.vendorId === 'string' ? order.vendorId : order.vendorId?.name ?? '—';
                    return (
                      <tr key={order._id}>
                        <td style={{ fontWeight: 700 }}>
                          <Link href={`/orders/${order._id}`} style={{ color: 'var(--primary)' }}>{order.orderNumber}</Link>
                        </td>
                        <td>{vendorName}</td>
                        <td>{formatMoney(r.orderAmount)}</td>
                        <td>{formatMoney(r.driverFee)}</td>
                        <td>{formatMoney(r.commission)}</td>
                        <td>{formatMoney(r.vendorRevenue)}</td>
                        <td className="muted">{formatDateTime(order.createdAt)}</td>
                      </tr>
                    );
                  })}
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
                <button className="btn" disabled={!pagination.hasPrev || loading} onClick={() => void load(pagination.page - 1)}>{t.common.prev}</button>
                <button className="btn" disabled={!pagination.hasNext || loading} onClick={() => void load(pagination.page + 1)}>{t.common.next}</button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
