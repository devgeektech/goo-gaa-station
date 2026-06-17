'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Copy, Search, RefreshCcw, RotateCcw } from 'lucide-react';
import type { OrderListItem, OrderStatus } from '@/lib/api/orders.api';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
  fetchOrderById,
  adminUpdateOrderStatus,
  adminCancelOrder,
  adminAssignDriver,
  adminRecordOrderRefund,
} from '@/store/slices/ordersSlice';
import { searchDrivers, type DriverListItem } from '@/lib/api/drivers.api';
import { formatDateTime, formatMoney, copyToClipboard } from '@/lib/utils/format';
import { OrderStatusBadge, PaymentStatusBadge } from '@/components/orders/orderBadges';
import { OrderDriversNotified } from '@/components/orders/OrderDriversNotified';
import { OrderAddressesSection } from '@/components/orders/OrderAddressesSection';
import { Skeleton } from '@/components/ui/Skeleton';
import { useTranslations } from '@/lib/i18n/useTranslations';
import { formatT } from '@/lib/i18n/translations';
import { useToast } from '@/components/ui/Toast';

function asObj<T extends object>(v: unknown): T | null {
  if (!v || typeof v !== 'object') return null;
  return v as T;
}
function getId(v: unknown): string | null {
  if (typeof v === 'string') return v;
  const o = asObj<{ _id?: string }>(v);
  return o?._id ?? null;
}

const ORDER_STATUS_VALUES = ['placed', 'confirmed', 'preparing', 'picked_up', 'on_the_way', 'delivered', 'cancelled'] as const;

export default function OrderDetailPage() {
  const t = useTranslations();
  const params = useParams();
  const id = typeof params?.id === 'string' ? params.id : '';
  const dispatch = useAppDispatch();
  const toast = useToast();
  const selectedOrder = useAppSelector((s) => s.orders.selectedOrder);
  const [loading, setLoading] = useState(false);
  const [nextStatus, setNextStatus] = useState<OrderStatus>('confirmed');
  const [statusNote, setStatusNote] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [driverQuery, setDriverQuery] = useState('');
  const [driverResults, setDriverResults] = useState<DriverListItem[]>([]);
  const [driverLoading, setDriverLoading] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState<DriverListItem | null>(null);
  const [refundReason, setRefundReason] = useState('');
  const [refundOpen, setRefundOpen] = useState(false);
  const [refunding, setRefunding] = useState(false);

  const order = selectedOrder?._id === id ? selectedOrder : null;

  useEffect(() => {
    if (id) {
      setLoading(true);
      void dispatch(fetchOrderById(id)).finally(() => setLoading(false));
    }
  }, [id, dispatch]);

  const isFinal = order?.status === 'delivered' || order?.status === 'cancelled';
  const isAssignable = order && !isFinal;
  const canRecordRefund = order?.status === 'delivered' && order.paymentStatus !== 'refunded';
  const isRefunded = order?.paymentStatus === 'refunded';

  useEffect(() => {
    if (isAssignable) runDriverSearch('');
  }, [order?._id, isAssignable]);

  const statusHistory = useMemo(() => {
    const h = order?.statusHistory ?? [];
    return [...h].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }, [order?.statusHistory]);

  const customer = asObj<{ name?: string; phone?: string; email?: string }>(order?.customerId);
  const driver = asObj<{ name?: string; phone?: string }>(order?.driverId);
  const vendor = asObj<{ name?: string }>(order?.vendorId);

  async function copyPhone(phone?: string) {
    if (!phone) return;
    const ok = await copyToClipboard(phone);
    toast.push({ title: ok ? t.common.copied : t.common.copyFailed, description: phone, variant: ok ? 'success' : 'danger' });
  }

  async function runDriverSearch(q: string) {
    setDriverLoading(true);
    try {
      const res = await searchDrivers({
        search: q.trim() || undefined,
        page: 1,
        limit: 20,
        approvalStatus: 'approved',
        status: 'active',
      });
      setDriverResults(res.data ?? []);
    } catch {
      setDriverResults([]);
    } finally {
      setDriverLoading(false);
    }
  }

  async function onAssignDriver() {
    if (!order || !selectedDriver) return;
    const action = await dispatch(adminAssignDriver({ id: order._id, driverId: selectedDriver._id }));
    if (adminAssignDriver.fulfilled.match(action)) {
      toast.push({ title: t.orders.driverAssigned, description: selectedDriver.name ?? selectedDriver._id, variant: 'success' });
    } else {
      toast.push({ title: t.orders.assignFailed, description: String(action.payload ?? action.error?.message), variant: 'danger' });
    }
  }

  async function onChangeStatus() {
    if (!order) return;
    const action = await dispatch(adminUpdateOrderStatus({ id: order._id, status: nextStatus, note: statusNote || undefined }));
    if (adminUpdateOrderStatus.fulfilled.match(action)) {
      toast.push({ title: t.orders.statusUpdated, description: nextStatus, variant: 'success' });
      setStatusNote('');
    } else {
      toast.push({ title: t.orders.updateFailed, description: String(action.payload ?? action.error?.message), variant: 'danger' });
    }
  }

  async function onRecordRefund() {
    if (!order) return;
    setRefunding(true);
    const action = await dispatch(
      adminRecordOrderRefund({ id: order._id, reason: refundReason.trim() || undefined })
    );
    setRefunding(false);
    if (adminRecordOrderRefund.fulfilled.match(action)) {
      toast.push({ title: t.orders.refundRecordedToast, description: t.orders.refundPaymentUpdated, variant: 'success' });
      setRefundOpen(false);
      setRefundReason('');
    } else {
      toast.push({
        title: t.orders.refundFailed,
        description: String(action.payload ?? action.error?.message),
        variant: 'danger',
      });
    }
  }

  async function onCancelOrder() {
    if (!order) return;
    if (!cancelReason.trim()) {
      toast.push({ title: t.orders.reasonRequired, description: t.orders.cancelReasonHint, variant: 'danger' });
      return;
    }
    const action = await dispatch(adminCancelOrder({ id: order._id, reason: cancelReason.trim() }));
    if (adminCancelOrder.fulfilled.match(action)) {
      toast.push({ title: t.orders.orderCancelled, variant: 'success' });
    } else {
      toast.push({ title: t.orders.cancelFailed, description: String(action.payload ?? action.error?.message), variant: 'danger' });
    }
  }

  const itemsSubtotal = (order?.items ?? []).reduce((s, i) => s + (Number(i.subtotal) || 0), 0);
  const orderAmount = Number(order?.orderAmount ?? order?.total ?? 0);
  const driverFee = Number(order?.driverFee ?? order?.deliveryFee ?? 0);
  const netOrderAmount = Number(order?.netOrderAmount ?? Math.max(0, orderAmount - driverFee));
  const commission = Number(order?.commission ?? order?.adminRevenue ?? 0);
  const adminRevenue = Number(order?.adminRevenue ?? commission);
  const vendorRevenue = Number(order?.vendorRevenue ?? Math.max(0, orderAmount - driverFee - commission));
  const driverRevenue = Number(order?.driverRevenue ?? driverFee);
  const refundAmount = Number(order?.refundAmount ?? orderAmount + driverFee + commission);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div className="row" style={{ alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Link href="/orders" className="btn" aria-label={t.common.backToOrders}>
          <ArrowLeft size={18} aria-hidden />
        </Link>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: 'var(--text)' }}>
          {order ? formatT(t.orders.orderTitle, { number: order.orderNumber }) : t.orders.detailTitle}
        </h1>
      </div>

      {!id ? (
        <div className="muted">{t.orders.invalidOrderId}</div>
      ) : loading && !order ? (
        <Skeleton height={320} />
      ) : !order ? (
        <div className="muted">{t.orders.notFound}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Customer / Driver / Vendor cards */}
          <div className="grid3">
            <div className="card" style={{ boxShadow: 'none' }}>
              <div className="cardBody">
                <div className="muted">{t.orders.customerSection}</div>
                <div style={{ fontWeight: 800, marginTop: 6 }}>{customer?.name ?? getId(order.customerId) ?? '—'}</div>
                <button type="button" className="btn" style={{ marginTop: 8 }} onClick={() => void copyPhone(customer?.phone)}>
                  <Copy size={16} /> {customer?.phone ?? '—'}
                </button>
                {customer?.email ? <div className="muted" style={{ marginTop: 6 }}>{customer.email}</div> : null}
              </div>
            </div>
            <div className="card" style={{ boxShadow: 'none' }}>
              <div className="cardBody">
                <div className="muted">{t.orders.driverSection}</div>
                <div style={{ fontWeight: 800, marginTop: 6 }}>
                  {driver?.name ?? (order.driverId ? getId(order.driverId) : t.common.unassigned) ?? t.common.unassigned}
                </div>
                {driver?.phone ? (
                  <button type="button" className="btn" style={{ marginTop: 8 }} onClick={() => void copyPhone(driver.phone)}>
                    <Copy size={16} /> {driver.phone}
                  </button>
                ) : null}
              </div>
            </div>
            <div className="card" style={{ boxShadow: 'none' }}>
              <div className="cardBody">
                <div className="muted">{t.orders.vendorSection}</div>
                <div style={{ fontWeight: 800, marginTop: 6 }}>{vendor?.name ?? (order.vendorId ? getId(order.vendorId) : '—') ?? '—'}</div>
              </div>
            </div>
          </div>

          {/* Order info + Payment */}
          <div className="grid2">
            <div className="card" style={{ boxShadow: 'none' }}>
              <div className="cardBody">
                <div className="muted">{t.orders.orderInfo}</div>
                <div style={{ fontWeight: 800, marginTop: 6 }}>{order.orderNumber}</div>
                <div className="muted" style={{ fontSize: 12 }}>{formatT(t.common.createdAt, { date: formatDateTime(order.createdAt) })}</div>
                <div style={{ marginTop: 12 }}><OrderStatusBadge status={order.status} /></div>
              </div>
            </div>
            <div className="card" style={{ boxShadow: 'none' }}>
              <div className="cardBody">
                <div className="muted">{t.orders.paymentSection}</div>
                <div style={{ fontWeight: 800, fontSize: 20, marginTop: 6 }}>{formatMoney(order.total)}</div>
                <div className="muted" style={{ fontSize: 12 }}>{formatT(t.common.methodLabel, { method: order.paymentMethod ?? '—' })}</div>
                <div className="muted" style={{ fontSize: 12 }}>{t.orders.wifipayRef}: {order.wifipayRef ?? '—'}</div>
                <div style={{ marginTop: 10 }}><PaymentStatusBadge status={order.paymentStatus} /></div>
                {isRefunded ? (
                  <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>{t.orders.refundRecorded}</div>
                ) : canRecordRefund ? (
                  <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {!refundOpen ? (
                      <button type="button" className="btn btnPrimary" onClick={() => setRefundOpen(true)}>
                        <RotateCcw size={16} /> {t.orders.recordRefund}
                      </button>
                    ) : (
                      <>
                        <textarea
                          className="input"
                          rows={2}
                          placeholder={t.orders.refundReasonOptional}
                          value={refundReason}
                          onChange={(e) => setRefundReason(e.target.value)}
                          disabled={refunding}
                        />
                        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            className="btn btnPrimary"
                            onClick={() => void onRecordRefund()}
                            disabled={refunding}
                          >
                            {refunding ? t.common.recording : t.orders.confirmRefund}
                          </button>
                          <button
                            type="button"
                            className="btn"
                            onClick={() => {
                              setRefundOpen(false);
                              setRefundReason('');
                            }}
                            disabled={refunding}
                          >
                            {t.common.cancel}
                          </button>
                        </div>
                        <div className="muted" style={{ fontSize: 12 }}>
                          {t.orders.codManualNote}
                        </div>
                      </>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <OrderDriversNotified
            order={order}
            assignedDriverId={getId(order.driverId)}
            onCopy={(text, label) => {
              toast.push({
                title: label,
                description: text,
                variant: label === t.orders.copiedDriverId || label === t.common.copied ? 'success' : 'danger',
              });
            }}
          />

          {/* Finance & ledger */}
          <div className="card">
            <div className="cardBody">
              <div style={{ fontWeight: 800 }}>{t.orders.financeSection}</div>
              <div className="divider" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span className="muted">{t.orders.orderAmount}</span>
                  <span>{formatMoney(orderAmount)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span className="muted">{t.orders.driverFee}</span>
                  <span>{formatMoney(driverFee)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span className="muted">{t.orders.netOrderAmount}</span>
                  <span>{formatMoney(netOrderAmount)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span className="muted">{t.orders.commission}</span>
                  <span>{formatMoney(commission)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span className="muted">{t.orders.adminRevenue}</span>
                  <span>{formatMoney(adminRevenue)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span className="muted">{t.orders.vendorRevenue}</span>
                  <span>{formatMoney(vendorRevenue)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span className="muted">{t.orders.driverDeliveryFee}</span>
                  <span>{formatMoney(driverRevenue)}</span>
                </div>
                <div className="divider" />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800 }}>
                  <span>{t.orders.refundRecordAmount}</span>
                  <span>{formatMoney(refundAmount)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Items */}
          <div className="card">
            <div className="cardBody">
              <div style={{ fontWeight: 800 }}>{t.orders.itemsSection}</div>
              <div className="divider" />
              <div className="tableWrap">
                <table>
                  <thead>
                    <tr>
                      <th>{t.orders.item}</th>
                      <th>{t.orders.qty}</th>
                      <th>{t.orders.unitPrice}</th>
                      <th>{t.orders.subtotal}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.items.map((i, idx) => (
                      <tr key={idx}>
                        <td style={{ fontWeight: 600 }}>{i.name}</td>
                        <td>{i.qty}</td>
                        <td>{formatMoney(i.unitPrice)}</td>
                        <td style={{ fontWeight: 800 }}>{formatMoney(i.subtotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="divider" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="muted">{t.orders.subtotal}</span><span>{formatMoney(itemsSubtotal)}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="muted">{t.orders.deliveryFee}</span><span>{formatMoney(order.deliveryFee ?? 0)}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="muted">{t.orders.discount}</span><span>{formatMoney(order.discount ?? 0)}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800 }}><span>{t.common.total}</span><span>{formatMoney(order.total)}</span></div>
              </div>
            </div>
          </div>

          {/* Addresses */}
          <div className="card">
            <div className="cardBody">
              <div style={{ fontWeight: 800 }}>{t.orders.addressesSection}</div>
              <div className="divider" />
              <OrderAddressesSection order={order} onCopyPhone={(phone) => void copyPhone(phone)} />
            </div>
          </div>

          {/* Status timeline */}
          {/* <div className="card">
            <div className="cardBody">
              <div className="row adminPageHeader" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontWeight: 800 }}>Status timeline</div>
                <button type="button" className="btn" onClick={() => { setLoading(true); void dispatch(fetchOrderById(id)).finally(() => setLoading(false)); }}>
                  <RefreshCcw size={16} /> Refresh
                </button>
              </div>
              <div className="divider" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {statusHistory.length === 0 ? <div className="muted">No history.</div> : null}
                {statusHistory.map((s, idx) => (
                  <div key={`${s.timestamp}-${idx}`} className="adminStatusTimelineRow">
                    <div className="muted">{formatDateTime(s.timestamp)}</div>
                    <div>
                      <span className="badge" style={{ background: 'var(--bg)' }}>{s.status}</span>
                      {s.isAdminOverride ? <span className="badge" style={{ background: 'var(--primary-light)', marginLeft: 8 }}>Override</span> : null}
                      <span className="muted" style={{ fontSize: 12, marginLeft: 8 }}>{s.changedByModel ? `by ${s.changedByModel}` : ''}</span>
                      {s.note ? <div className="muted" style={{ marginTop: 4 }}>{s.note}</div> : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div> */}

          {/* Admin actions */}
          {!isFinal ? (
            <div className="card">
              <div className="cardBody">
                <div style={{ fontWeight: 900 }}>{t.orders.adminActions}</div>
                <div className="divider" />
                <div className="grid2" style={{ gap: 24 }}>
                  <div>
                    <div className="muted" style={{ marginBottom: 8 }}>{t.orders.changeStatus}</div>
                    <select className="select" value={nextStatus} onChange={(e) => setNextStatus(e.target.value as OrderStatus)}>
                      {ORDER_STATUS_VALUES.map((s) => (
                        <option key={s} value={s}>{t.status.order[s]}</option>
                      ))}
                    </select>
                    <textarea className="textarea" placeholder={t.common.noteOptional} value={statusNote} onChange={(e) => setStatusNote(e.target.value)} style={{ marginTop: 8, minHeight: 60 }} />
                    <button type="button" className="btn btnPrimary" style={{ marginTop: 10 }} onClick={() => void onChangeStatus()}>
                      {t.orders.updateStatus}
                    </button>
                  </div>
                  <div>
                    <div className="muted" style={{ marginBottom: 8 }}>{t.orders.assignDriver}</div>
                    <div className="adminDriverSearchRow">
                      <input className="input" value={driverQuery} onChange={(e) => setDriverQuery(e.target.value)} placeholder={t.orders.searchDrivers} />
                      <button type="button" className="btn" onClick={() => void runDriverSearch(driverQuery)} disabled={driverLoading} aria-label={t.common.search}><Search size={16} /></button>
                    </div>
                    {driverLoading ? (
                      <div style={{ marginTop: 10 }}>
                        <Skeleton height={42} />
                      </div>
                    ) : driverResults.length === 0 ? (
                      <div className="muted" style={{ marginTop: 10, fontSize: 13 }}>{t.orders.noDriversSearchHint}</div>
                    ) : (
                      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflow: 'auto' }}>
                        {driverResults.map((d) => (
                          <button key={d._id} type="button" className="btn" style={{ justifyContent: 'space-between', background: selectedDriver?._id === d._id ? 'var(--primary-light)' : undefined }} onClick={() => setSelectedDriver(d)}>
                            <span style={{ fontWeight: 700 }}>{d.name ?? d._id}</span>
                            <span className="muted" style={{ fontSize: 12 }}>{d.phone ?? '—'}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    <button type="button" className="btn btnPrimary" style={{ marginTop: 10 }} onClick={() => void onAssignDriver()} disabled={!selectedDriver}>
                      {t.orders.assignSelectedDriver}
                    </button>
                  </div>
                </div>
                <div className="divider" />
                <div>
                  <div className="muted" style={{ marginBottom: 8 }}>{t.orders.cancelOrder}</div>
                  <textarea className="textarea" placeholder={t.common.reasonRequired} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} style={{ minHeight: 60 }} />
                  <button type="button" className="btn" style={{ marginTop: 10, background: 'var(--danger)', color: 'white' }} onClick={() => void onCancelOrder()} disabled={!cancelReason.trim()}>
                    {t.orders.cancelOrder}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="muted" style={{ fontSize: 13 }}>{t.orders.actionsDisabled}</div>
          )}
        </div>
      )}
    </div>
  );
}
