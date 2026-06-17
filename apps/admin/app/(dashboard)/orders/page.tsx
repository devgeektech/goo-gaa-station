'use client';

import { useEffect, useMemo, useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, RefreshCcw, Package, ShieldAlert } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { fetchOrders, setFilters, setStatusMulti, adminUpdateOrderStatus } from '@/store/slices/ordersSlice';
import type { OrderStatus, PaymentStatus } from '@/lib/api/orders.api';
import { OrderStatusBadge, PaymentStatusBadge } from '@/components/orders/orderBadges';
import { formatDateTime, formatMoney } from '@/lib/utils/format';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { searchCustomers } from '@/lib/api/customers.api';
import { searchDrivers } from '@/lib/api/drivers.api';
import { listVendors } from '@/lib/api/vendors.api';
import { useToast } from '@/components/ui/Toast';
import { Modal } from '@/components/ui/Modal';
import { useTranslations } from '@/lib/i18n/useTranslations';
import { formatT } from '@/lib/i18n/translations';

const ORDER_STATUS_VALUES = ['placed', 'confirmed', 'preparing', 'picked_up', 'on_the_way', 'delivered', 'cancelled'] as const;
const PAYMENT_STATUS_VALUES = ['pending', 'paid', 'failed', 'refunded'] as const;

export default function OrdersPage() {
  const t = useTranslations();
  const router = useRouter();
  const dispatch = useAppDispatch();
  const toast = useToast();
  const { items, pagination, filters, loading, error } = useAppSelector((s) => s.orders);

  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const statusDropdownRef = useRef<HTMLDivElement>(null);
  const [filterOptionsLoading, setFilterOptionsLoading] = useState(true);
  const [customerOptions, setCustomerOptions] = useState<Array<{ _id: string; label: string }>>([]);
  const [driverOptions, setDriverOptions] = useState<Array<{ _id: string; label: string }>>([]);
  const [vendorOptions, setVendorOptions] = useState<Array<{ _id: string; label: string }>>([]);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideOrderId, setOverrideOrderId] = useState<string | null>(null);
  const [overrideStatus, setOverrideStatus] = useState<OrderStatus>('confirmed');
  const [overrideNote, setOverrideNote] = useState('');
  const [overrideSaving, setOverrideSaving] = useState(false);

  const ALL_STATUSES = useMemo(
    () => ORDER_STATUS_VALUES.map((value) => ({ value, label: t.status.order[value] })),
    [t]
  );
  const ALL_PAYMENT = useMemo(
    () => PAYMENT_STATUS_VALUES.map((value) => ({ value, label: t.status.payment[value] })),
    [t]
  );

  useEffect(() => {
    void dispatch(fetchOrders({ page: 1, limit: 20 }));
  }, [dispatch]);

  useEffect(() => {
    let cancelled = false;
    async function loadFilterDropdowns() {
      setFilterOptionsLoading(true);
      try {
        const [customersRes, driversRes, vendorsRes] = await Promise.all([
          searchCustomers({ page: 1, limit: 100 }),
          searchDrivers({ page: 1, limit: 100 }),
          listVendors({ page: 1, limit: 100 }),
        ]);
        if (cancelled) return;
        const customers = customersRes.data ?? [];
        const drivers = driversRes.data ?? [];
        const vendors = vendorsRes.data ?? [];
        setCustomerOptions(
          customers.map((c) => ({
            _id: c._id,
            label: [c.name || '—', c.phone].filter(Boolean).join(' · '),
          }))
        );
        setDriverOptions(
          drivers.map((d) => ({
            _id: d._id,
            label: [d.name || 'Driver', d.phone].filter(Boolean).join(' · '),
          }))
        );
        setVendorOptions(
          vendors.map((v) => ({
            _id: v._id,
            label: v.name || '—',
          }))
        );
      } catch {
        if (!cancelled) {
          setCustomerOptions([]);
          setDriverOptions([]);
          setVendorOptions([]);
        }
      } finally {
        if (!cancelled) setFilterOptionsLoading(false);
      }
    }
    void loadFilterDropdowns();
    return () => {
      cancelled = true;
    };
  }, []);

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
    if (filters.status.length === 0) return t.common.all;
    if (filters.status.length === 1) return t.status.order[filters.status[0] as keyof typeof t.status.order] ?? filters.status[0];
    return formatT(t.common.selected, { n: filters.status.length });
  }, [filters.status, t]);

  async function applyFilters() {
    void dispatch(fetchOrders({ page: 1 }));
  }

  function openOverride(orderId: string, currentStatus: OrderStatus) {
    setOverrideOrderId(orderId);
    setOverrideStatus(currentStatus);
    setOverrideNote('');
    setOverrideOpen(true);
  }

  async function submitOverride() {
    if (!overrideOrderId) return;
    setOverrideSaving(true);
    const action = await dispatch(
      adminUpdateOrderStatus({
        id: overrideOrderId,
        status: overrideStatus,
        note: overrideNote.trim() || undefined,
      })
    );
    setOverrideSaving(false);
    if (adminUpdateOrderStatus.fulfilled.match(action)) {
      toast.push({ title: t.orders.overrideSuccess, description: t.status.order[overrideStatus], variant: 'success' });
      setOverrideOpen(false);
      setOverrideOrderId(null);
      setOverrideNote('');
    } else {
      toast.push({
        title: t.orders.overrideFailed,
        description: String(action.payload ?? action.error?.message ?? t.common.unknownError),
        variant: 'danger',
      });
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div className="row adminPageHeader" style={{ justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: 'var(--text)' }}>{t.orders.title}</h1>
          <div className="muted" style={{ marginTop: 4 }}>{t.orders.subtitle}</div>
        </div>
        <div className="row">
          <button className="btn" onClick={() => void dispatch(fetchOrders(undefined))} disabled={loading} aria-label={t.common.refresh}>
            <RefreshCcw size={18} aria-hidden /> {t.common.refresh}
          </button>
        </div>
      </div>

      <div className="card">
        <div className="cardBody">
          <div className="toolbar adminToolbarResponsive">
            <div className="field" style={{ minWidth: 260 }}>
              <div className="label">{t.orders.searchLabel}</div>
              <input
                className="input"
                value={filters.search}
                onChange={(e) => dispatch(setFilters({ search: e.target.value }))}
                placeholder={t.orders.searchOrderPlaceholder}
              />
            </div>

            <div className="field" style={{ minWidth: 220, position: 'relative' }} ref={statusDropdownRef}>
              <div className="label">{t.orders.statusMultiSelect}</div>
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
                      {t.common.clear}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="field">
              <div className="label">{t.orders.paymentFilter}</div>
              <select
                className="select"
                value={filters.paymentStatus}
                onChange={(e) => dispatch(setFilters({ paymentStatus: e.target.value }))}
              >
                <option value="">{t.common.all}</option>
                {ALL_PAYMENT.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
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
            <div className="field" style={{ minWidth: 200 }}>
              <div className="label">{t.orders.customer}</div>
              <select
                className="select"
                value={filters.customerId}
                disabled={filterOptionsLoading}
                onChange={(e) => dispatch(setFilters({ customerId: e.target.value }))}
              >
                <option value="">{t.common.all}</option>
                {customerOptions.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ minWidth: 200 }}>
              <div className="label">{t.orders.driver}</div>
              <select
                className="select"
                value={filters.driverId}
                disabled={filterOptionsLoading}
                onChange={(e) => dispatch(setFilters({ driverId: e.target.value }))}
              >
                <option value="">{t.common.all}</option>
                {driverOptions.map((d) => (
                  <option key={d._id} value={d._id}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ minWidth: 200 }}>
              <div className="label">{t.orders.vendor}</div>
              <select
                className="select"
                value={filters.vendorId}
                disabled={filterOptionsLoading}
                onChange={(e) => dispatch(setFilters({ vendorId: e.target.value }))}
              >
                <option value="">{t.common.all}</option>
                {vendorOptions.map((v) => (
                  <option key={v._id} value={v._id}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="field" style={{ minWidth: 120 }}>
              <div className="label"> </div>
              <button className="btn btnPrimary" onClick={() => void applyFilters()}>
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
                    <th>{t.orders.orderNumber}</th>
                    <th>{t.orders.customer}</th>
                    <th>{t.orders.driver}</th>
                    <th>{t.orders.items}</th>
                    <th>{t.common.total}</th>
                    <th>{t.orders.payment}</th>
                    <th>{t.common.status}</th>
                    <th>{t.common.date}</th>
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
            <EmptyState icon={<Package size={48} />} heading={t.empty.orders} subtext={t.empty.ordersSub} />
          ) : (
            <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>{t.orders.orderNumber}</th>
                  <th>{t.orders.customer}</th>
                  <th>{t.orders.driver}</th>
                  <th>{t.orders.items}</th>
                  <th>{t.common.total}</th>
                  <th>{t.orders.payment}</th>
                  <th>{t.common.status}</th>
                  <th>{t.common.date}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {
                  items.map((o) => {
                    const customerName = typeof o.customerId === 'string' ? o.customerId : o.customerId?.name ?? '—';
                    const driverName = !o.driverId ? t.common.unassigned : typeof o.driverId === 'string' ? o.driverId : o.driverId?.name ?? '—';
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
                        <td><PaymentStatusBadge status={o.paymentStatus} /></td>
                        <td><OrderStatusBadge status={o.status} /></td>
                        <td className="muted">{formatDateTime(o.createdAt)}</td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <div className="row" style={{ gap: 6 }}>
                            <Link href={`/orders/${o._id}`} className="btn" aria-label={t.common.view}>
                              <Eye size={18} aria-hidden />
                            </Link>
                            {/* <button
                              type="button"
                              className="btn"
                              aria-label="Status override"
                              onClick={() => openOverride(o._id, o.status)}
                              title="Status override (emergency)"
                            >
                              <ShieldAlert size={17} aria-hidden />
                            </button> */}
                          </div>
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
              <button className="btn" disabled={!pagination.hasPrev || loading} onClick={() => void dispatch(fetchOrders({ page: pagination.page - 1 }))}>
                {t.common.prev}
              </button>
              <button className="btn" disabled={!pagination.hasNext || loading} onClick={() => void dispatch(fetchOrders({ page: pagination.page + 1 }))}>
                {t.common.next}
              </button>
            </div>
          </div>
          ) : null}
        </div>
      </div>

      <Modal
        open={overrideOpen}
        title={t.orders.overrideTitle}
        onClose={() => {
          if (overrideSaving) return;
          setOverrideOpen(false);
          setOverrideOrderId(null);
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="muted" style={{ fontSize: 13 }}>
            {t.orders.overrideDescModal}
          </div>
          <div className="field">
            <div className="label">{t.orders.overrideStatus}</div>
            <select className="select" value={overrideStatus} onChange={(e) => setOverrideStatus(e.target.value as OrderStatus)}>
              {ALL_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <div className="label">{t.common.noteOptional}</div>
            <textarea
              className="textarea"
              placeholder={t.orders.overrideNotePlaceholder}
              value={overrideNote}
              onChange={(e) => setOverrideNote(e.target.value)}
              rows={3}
            />
          </div>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button
              className="btn"
              onClick={() => {
                setOverrideOpen(false);
                setOverrideOrderId(null);
              }}
              disabled={overrideSaving}
            >
              {t.common.cancel}
            </button>
            <button className="btn btnPrimary" onClick={() => void submitOverride()} disabled={overrideSaving || !overrideOrderId}>
              {overrideSaving ? t.common.applying : t.orders.overrideApply}
            </button>
          </div>
        </div>
      </Modal>

    </div>
  );
}

