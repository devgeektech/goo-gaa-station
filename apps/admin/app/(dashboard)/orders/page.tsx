'use client';

import { useEffect, useMemo, useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, Download, RefreshCcw, Package } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { fetchOrders, setFilters, setStatusMulti } from '@/store/slices/ordersSlice';
import type { OrderStatus, PaymentStatus } from '@/lib/api/orders.api';
import { paymentBadge, statusBadge } from '@/components/orders/orderBadges';
import { formatDateTime, formatMoney } from '@/lib/utils/format';
import { toCsv, downloadCsv } from '@/lib/utils/csv';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { getOrders } from '@/lib/api/orders.api';
import { useToast } from '@/components/ui/Toast';

const ALL_STATUSES: Array<{ value: OrderStatus; label: string }> = [
  { value: 'placed', label: 'Placed' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'preparing', label: 'Preparing' },
  { value: 'picked_up', label: 'Picked up' },
  { value: 'on_the_way', label: 'On the way' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'cancelled', label: 'Cancelled' },
];

const ALL_PAYMENT: Array<{ value: PaymentStatus; label: string }> = [
  { value: 'pending', label: 'Pending' },
  { value: 'paid', label: 'Paid' },
  { value: 'failed', label: 'Failed' },
  { value: 'refunded', label: 'Refunded' },
];

export default function OrdersPage() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const toast = useToast();
  const { items, pagination, filters, loading, error } = useAppSelector((s) => s.orders);

  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const statusDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void dispatch(fetchOrders({ page: 1, limit: 20 }));
  }, [dispatch]);

  useEffect(() => {
    if (!statusDropdownOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(e.target as Node)) {
        setStatusDropdownOpen(false);
      }
    }
    document.addEventListener('click', handleClickOutside, true);
    return () => document.removeEventListener('click', handleClickOutside, true);
  }, [statusDropdownOpen]);

  const selectedStatusesLabel = useMemo(() => {
    if (filters.status.length === 0) return 'All';
    if (filters.status.length === 1) return filters.status[0];
    return `${filters.status.length} selected`;
  }, [filters.status]);

  async function applyFilters() {
    void dispatch(fetchOrders({ page: 1 }));
  }

  async function exportCsv() {
    setExporting(true);
    try {
      const limit = 50;
      let page = 1;
      let all: typeof items = [];

      // Note: backend currently supports single status; for multi-select we export one by one and merge.
      const statusValues = filters.status.length > 0 ? filters.status : [''];
      for (const st of statusValues) {
        page = 1;
        while (true) {
          const res = await getOrders({
            page,
            limit,
            status: st || '',
            paymentStatus: filters.paymentStatus || '',
            dateFrom: filters.dateFrom || '',
            dateTo: filters.dateTo || '',
            search: filters.search || '',
          });
          all = all.concat(res.data);
          if (!res.hasNext) break;
          page += 1;
        }
      }

      // de-dupe by _id
      const uniq = Array.from(new Map(all.map((o) => [o._id, o])).values());
      const rows = uniq.map((o) => ({
        orderId: o._id,
        orderNumber: o.orderNumber,
        customer: typeof o.customerId === 'string' ? o.customerId : o.customerId?._id ?? '',
        customerPhone: typeof o.customerId === 'string' ? '' : o.customerId?.phone ?? '',
        driver: o.driverId ? (typeof o.driverId === 'string' ? o.driverId : o.driverId._id) : '',
        driverPhone: o.driverId && typeof o.driverId !== 'string' ? o.driverId.phone ?? '' : '',
        itemsCount: o.items?.length ?? 0,
        total: o.total,
        paymentStatus: o.paymentStatus,
        status: o.status,
        createdAt: o.createdAt,
        wifipayRef: o.wifipayRef ?? '',
      }));
      const csv = toCsv(rows);
      downloadCsv(`orders-${new Date().toISOString().slice(0, 10)}.csv`, csv);
      toast.push({ title: 'CSV exported', description: `${rows.length} order(s)`, variant: 'success' });
    } catch (e) {
      toast.push({ title: 'Export failed', description: e instanceof Error ? e.message : 'Unknown error', variant: 'danger' });
    } finally {
      setExporting(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div className="row adminPageHeader" style={{ justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: 'var(--text)' }}>Orders</h1>
          <div className="muted" style={{ marginTop: 4 }}>Manage orders, status, drivers, cancellations.</div>
        </div>
        <div className="row">
          <button className="btn" onClick={() => void dispatch(fetchOrders(undefined))} disabled={loading} aria-label="Refresh orders list">
            <RefreshCcw size={18} aria-hidden /> Refresh
          </button>
          <button className="btn btnPrimary" onClick={() => void exportCsv()} disabled={exporting} aria-label="Export orders to CSV">
            <Download size={18} aria-hidden /> {exporting ? 'Exporting…' : 'Export CSV'}
          </button>
        </div>
      </div>

      <div className="card">
        <div className="cardBody">
          <div className="toolbar adminToolbarResponsive">
            <div className="field" style={{ minWidth: 260 }}>
              <div className="label">Search (order number)</div>
              <input
                className="input"
                value={filters.search}
                onChange={(e) => dispatch(setFilters({ search: e.target.value }))}
                placeholder="ORD-2026…"
              />
            </div>

            <div className="field" style={{ minWidth: 220, position: 'relative' }} ref={statusDropdownRef}>
              <div className="label">Status (multi-select)</div>
              <button className="btn" type="button" onClick={(e) => { e.stopPropagation(); setStatusDropdownOpen((v) => !v); }}>
                {selectedStatusesLabel}
              </button>
              {statusDropdownOpen ? (
                <div
                  className="card adminOrdersStatusPopover"
                  style={{
                    position: 'absolute',
                    top: 66,
                    left: 0,
                    zIndex: 50,
                    padding: 10,
                    boxShadow: 'var(--shadow)',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {ALL_STATUSES.map((s) => {
                      const checked = filters.status.includes(s.value);
                      return (
                        <label key={s.value} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              const next = e.target.checked
                                ? [...filters.status, s.value]
                                : filters.status.filter((x) => x !== s.value);
                              dispatch(setStatusMulti(next));
                            }}
                          />
                          <span>{s.label}</span>
                        </label>
                      );
                    })}
                    <div className="divider" />
                    <button className="btn" type="button" onClick={() => dispatch(setStatusMulti([]))}>
                      Clear
                    </button>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="field">
              <div className="label">Payment status</div>
              <select
                className="select"
                value={filters.paymentStatus}
                onChange={(e) => dispatch(setFilters({ paymentStatus: e.target.value }))}
              >
                <option value="">All</option>
                {ALL_PAYMENT.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
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
            <div className="field" style={{ minWidth: 140 }}>
              <div className="label">Customer ID</div>
              <input className="input" value={filters.customerId} onChange={(e) => dispatch(setFilters({ customerId: e.target.value }))} placeholder="Optional" />
            </div>
            <div className="field" style={{ minWidth: 140 }}>
              <div className="label">Driver ID</div>
              <input className="input" value={filters.driverId} onChange={(e) => dispatch(setFilters({ driverId: e.target.value }))} placeholder="Optional" />
            </div>
            <div className="field" style={{ minWidth: 140 }}>
              <div className="label">Vendor ID</div>
              <input className="input" value={filters.vendorId} onChange={(e) => dispatch(setFilters({ vendorId: e.target.value }))} placeholder="Optional" />
            </div>

            <div className="field" style={{ minWidth: 120 }}>
              <div className="label"> </div>
              <button className="btn btnPrimary" onClick={() => void applyFilters()}>
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
                    <th>Order#</th>
                    <th>Customer</th>
                    <th>Driver</th>
                    <th>Items</th>
                    <th>Total</th>
                    <th>Payment</th>
                    <th>Status</th>
                    <th>Date</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={9}><Skeleton height={18} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : items.length === 0 ? (
            <EmptyState icon={<Package size={48} />} heading="No orders found" subtext="Try adjusting filters or date range." />
          ) : (
            <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>Order#</th>
                  <th>Customer</th>
                  <th>Driver</th>
                  <th>Items</th>
                  <th>Total</th>
                  <th>Payment</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {
                  items.map((o) => {
                    const customerName = typeof o.customerId === 'string' ? o.customerId : o.customerId?.name ?? '—';
                    const driverName = !o.driverId ? 'Unassigned' : typeof o.driverId === 'string' ? o.driverId : o.driverId?.name ?? '—';
                    return (
                      <tr
                        key={o._id}
                        className="clickableRow"
                        onClick={() => router.push(`/orders/${o._id}`)}
                      >
                        <td style={{ fontWeight: 800 }}>{o.orderNumber}</td>
                        <td>{customerName}</td>
                        <td>{driverName}</td>
                        <td>{o.items?.length ?? 0}</td>
                        <td style={{ fontWeight: 800 }}>{formatMoney(o.total)}</td>
                        <td>{paymentBadge(o.paymentStatus)}</td>
                        <td>{statusBadge(o.status)}</td>
                        <td className="muted">{formatDateTime(o.createdAt)}</td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <Link href={`/orders/${o._id}`} className="btn" aria-label="View order details">
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
              <button className="btn" disabled={!pagination.hasPrev || loading} onClick={() => void dispatch(fetchOrders({ page: pagination.page - 1 }))}>
                Prev
              </button>
              <button className="btn" disabled={!pagination.hasNext || loading} onClick={() => void dispatch(fetchOrders({ page: pagination.page + 1 }))}>
                Next
              </button>
            </div>
          </div>
          ) : null}
        </div>
      </div>

    </div>
  );
}

