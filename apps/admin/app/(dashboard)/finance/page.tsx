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

function toNumber(value: unknown, fallback = 0): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

export default function FinancePage() {
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
        title: 'Failed to load finance ledger',
        description: e instanceof Error ? e.message : 'Unknown error',
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
        const grossAmount = toNumber(order.grossAmount, toNumber(order.total));
        const platformCommission = toNumber(order.platformCommission);
        const wifipayFee = toNumber(order.wifipayFee);
        const driverShare = toNumber(order.driverShare, toNumber(order.deliveryFee));
        const vendorShare = toNumber(
          order.vendorShare,
          Math.max(0, grossAmount - platformCommission - wifipayFee - driverShare)
        );
        const vendorIdStr = typeof order.vendorId === 'string' ? order.vendorId : order.vendorId?._id ?? '';
        const vendorName = typeof order.vendorId === 'string' ? '' : order.vendorId?.name ?? '';
        const customerIdStr =
          typeof order.customerId === 'string' ? order.customerId : order.customerId?._id ?? '';
        return {
          orderId: order._id,
          orderNumber: order.orderNumber,
          status: order.status,
          paymentStatus: order.paymentStatus,
          paymentMethod: order.paymentMethod ?? '',
          vendorId: vendorIdStr,
          vendorName,
          customerId: customerIdStr,
          grossAmount,
          platformCommission,
          wifipayFee,
          driverShare,
          vendorShare,
          orderTotal: toNumber(order.total),
          deliveryFee: toNumber(order.deliveryFee),
          createdAt: order.createdAt,
        };
      });
      const csv = toCsv(rows as unknown as Record<string, unknown>[]);
      downloadCsv(`finance-ledger-${new Date().toISOString().slice(0, 10)}.csv`, csv);
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

  const totals = useMemo(() => {
    return items.reduce(
      (acc, order) => {
        const grossAmount = toNumber(order.grossAmount, toNumber(order.total));
        const platformCommission = toNumber(order.platformCommission);
        const wifipayFee = toNumber(order.wifipayFee);
        const driverShare = toNumber(order.driverShare, toNumber(order.deliveryFee));
        const vendorShare = toNumber(order.vendorShare, grossAmount - platformCommission - wifipayFee - driverShare);
        acc.grossAmount += grossAmount;
        acc.platformCommission += platformCommission;
        acc.wifipayFee += wifipayFee;
        acc.driverShare += driverShare;
        acc.vendorShare += Math.max(0, vendorShare);
        return acc;
      },
      { grossAmount: 0, platformCommission: 0, wifipayFee: 0, driverShare: 0, vendorShare: 0 }
    );
  }, [items]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div className="row adminPageHeader" style={{ justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 className="pageTitle">Finance & Ledger</h1>
          <div className="pageSubtitle">Per-order breakdown: gross, commission, WaafiPay fee, vendor share, driver share.</div>
        </div>
        <div className="row">
          <button className="btn" onClick={() => void load(pagination.page)} disabled={loading}>
            <RefreshCcw size={18} aria-hidden /> Refresh
          </button>
          <button
            className="btn btnPrimary"
            onClick={() => void exportCsvLedger()}
            disabled={exporting || loading}
            aria-label="Export finance ledger to CSV"
          >
            <Download size={18} aria-hidden /> {exporting ? 'Exporting…' : 'Export CSV'}
          </button>
        </div>
      </div>

      <div className="grid4">
        <div className="card"><div className="cardBody"><div className="muted" style={{ fontSize: 13 }}>Gross (page)</div><div style={{ fontSize: 24, fontWeight: 800, marginTop: 4 }}>{formatMoney(totals.grossAmount)}</div></div></div>
        <div className="card"><div className="cardBody"><div className="muted" style={{ fontSize: 13 }}>Commission (page)</div><div style={{ fontSize: 24, fontWeight: 800, marginTop: 4 }}>{formatMoney(totals.platformCommission)}</div></div></div>
        <div className="card"><div className="cardBody"><div className="muted" style={{ fontSize: 13 }}>WaafiPay fee (page)</div><div style={{ fontSize: 24, fontWeight: 800, marginTop: 4 }}>{formatMoney(totals.wifipayFee)}</div></div></div>
        <div className="card"><div className="cardBody"><div className="muted" style={{ fontSize: 13 }}>Vendor share (page)</div><div style={{ fontSize: 24, fontWeight: 800, marginTop: 4 }}>{formatMoney(totals.vendorShare)}</div></div></div>
      </div>

      <div className="card">
        <div className="cardBody">
          <div className="toolbar adminToolbarResponsive">
            <div className="field" style={{ minWidth: 240 }}>
              <div className="label">Search (order number)</div>
              <input
                className="input"
                value={filters.search}
                onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
                placeholder="ORD-..."
              />
            </div>
            <div className="field">
              <div className="label">Status</div>
              <select className="select" value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
                <option value="">All</option>
                <option value="placed">Placed</option>
                <option value="confirmed">Confirmed</option>
                <option value="preparing">Preparing</option>
                <option value="picked_up">Picked up</option>
                <option value="on_the_way">On the way</option>
                <option value="delivered">Delivered</option>
                <option value="cancelled">Cancelled</option>
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
            <div className="field" style={{ minWidth: 160 }}>
              <div className="label">Vendor ID</div>
              <input
                className="input"
                value={filters.vendorId}
                onChange={(e) => setFilters((f) => ({ ...f, vendorId: e.target.value }))}
                placeholder="Optional"
              />
            </div>
            <div className="field">
              <div className="label"> </div>
              <button className="btn btnPrimary" onClick={() => void load(1)}>Apply</button>
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
            <EmptyState icon={<Wallet size={44} />} heading="No ledger entries found" subtext="Try adjusting date range or filters." />
          ) : (
            <div className="tableWrap">
              <table>
                <thead>
                  <tr>
                    <th>Order#</th>
                    <th>Vendor</th>
                    <th>Status</th>
                    <th>Gross</th>
                    <th>Commission</th>
                    <th>WaafiPay fee</th>
                    <th>Driver share</th>
                    <th>Vendor share</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((order) => {
                    const grossAmount = toNumber(order.grossAmount, toNumber(order.total));
                    const platformCommission = toNumber(order.platformCommission);
                    const wifipayFee = toNumber(order.wifipayFee);
                    const driverShare = toNumber(order.driverShare, toNumber(order.deliveryFee));
                    const vendorShare = toNumber(order.vendorShare, Math.max(0, grossAmount - platformCommission - wifipayFee - driverShare));
                    const vendorName = typeof order.vendorId === 'string' ? order.vendorId : order.vendorId?.name ?? '—';
                    return (
                      <tr key={order._id}>
                        <td style={{ fontWeight: 700 }}>
                          <Link href={`/orders/${order._id}`} style={{ color: 'var(--primary)' }}>{order.orderNumber}</Link>
                        </td>
                        <td>{vendorName}</td>
                        <td>{order.status}</td>
                        <td style={{ fontWeight: 700 }}>{formatMoney(grossAmount)}</td>
                        <td>{formatMoney(platformCommission)}</td>
                        <td>{formatMoney(wifipayFee)}</td>
                        <td>{formatMoney(driverShare)}</td>
                        <td style={{ fontWeight: 700 }}>{formatMoney(vendorShare)}</td>
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
                Page {pagination.page} / {pagination.totalPages} • Total {pagination.total}
              </div>
              <div className="row">
                <button className="btn" disabled={!pagination.hasPrev || loading} onClick={() => void load(pagination.page - 1)}>Prev</button>
                <button className="btn" disabled={!pagination.hasNext || loading} onClick={() => void load(pagination.page + 1)}>Next</button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
