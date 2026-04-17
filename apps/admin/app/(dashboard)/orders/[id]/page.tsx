'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Copy, Search, RefreshCcw } from 'lucide-react';
import type { OrderListItem, OrderStatus } from '@/lib/api/orders.api';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
  fetchOrderById,
  adminUpdateOrderStatus,
  adminCancelOrder,
  adminAssignDriver,
} from '@/store/slices/ordersSlice';
import { searchDrivers, type DriverListItem } from '@/lib/api/drivers.api';
import { formatDateTime, formatMoney, copyToClipboard } from '@/lib/utils/format';
import { paymentBadge, statusBadge } from '@/components/orders/orderBadges';
import { Skeleton } from '@/components/ui/Skeleton';
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

const ALL_STATUSES: OrderStatus[] = ['placed', 'confirmed', 'preparing', 'picked_up', 'on_the_way', 'delivered', 'cancelled'];

export default function OrderDetailPage() {
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

  const order = selectedOrder?._id === id ? selectedOrder : null;

  useEffect(() => {
    if (id) {
      setLoading(true);
      void dispatch(fetchOrderById(id)).finally(() => setLoading(false));
    }
  }, [id, dispatch]);

  const isFinal = order?.status === 'delivered' || order?.status === 'cancelled';
  const isAssignable = order && !isFinal;

  useEffect(() => {
    if (isAssignable) runDriverSearch('');
  }, [order?._id, isAssignable]);

  const statusHistory = useMemo(() => {
    const h = order?.statusHistory ?? [];
    return [...h].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }, [order?.statusHistory]);

  const customer = asObj<{ name?: string; phone?: string; email?: string }>(order?.customerId);
  const driver = asObj<{ name?: string; phone?: string; vehicleType?: string; vehiclePlate?: string }>(order?.driverId);
  const vendor = asObj<{ name?: string; slug?: string; logo?: string }>(order?.vendorId);

  async function copyPhone(phone?: string) {
    if (!phone) return;
    const ok = await copyToClipboard(phone);
    toast.push({ title: ok ? 'Copied' : 'Copy failed', description: phone, variant: ok ? 'success' : 'danger' });
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
      toast.push({ title: 'Driver assigned', description: selectedDriver.name ?? selectedDriver._id, variant: 'success' });
    } else {
      toast.push({ title: 'Assign failed', description: String(action.payload ?? action.error?.message), variant: 'danger' });
    }
  }

  async function onChangeStatus() {
    if (!order) return;
    const action = await dispatch(adminUpdateOrderStatus({ id: order._id, status: nextStatus, note: statusNote || undefined }));
    if (adminUpdateOrderStatus.fulfilled.match(action)) {
      toast.push({ title: 'Status updated', description: nextStatus, variant: 'success' });
      setStatusNote('');
    } else {
      toast.push({ title: 'Update failed', description: String(action.payload ?? action.error?.message), variant: 'danger' });
    }
  }

  async function onCancelOrder() {
    if (!order) return;
    if (!cancelReason.trim()) {
      toast.push({ title: 'Reason required', description: 'Please enter a cancellation reason.', variant: 'danger' });
      return;
    }
    const action = await dispatch(adminCancelOrder({ id: order._id, reason: cancelReason.trim() }));
    if (adminCancelOrder.fulfilled.match(action)) {
      toast.push({ title: 'Order cancelled', variant: 'success' });
    } else {
      toast.push({ title: 'Cancel failed', description: String(action.payload ?? action.error?.message), variant: 'danger' });
    }
  }

  const itemsSubtotal = (order?.items ?? []).reduce((s, i) => s + (Number(i.subtotal) || 0), 0);
  const IMG_BASE = typeof process !== 'undefined' ? (process.env.NEXT_PUBLIC_API_URL ?? '') : '';
  const grossAmount = Number(order?.grossAmount ?? order?.total ?? 0);
  const platformCommission = Number(order?.platformCommission ?? 0);
  const wifipayFee = Number(order?.wifipayFee ?? 0);
  const driverShare = Number(order?.driverShare ?? order?.deliveryFee ?? 0);
  const vendorShare = Number(
    order?.vendorShare ?? Math.max(0, grossAmount - platformCommission - wifipayFee - driverShare)
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div className="row" style={{ alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Link href="/orders" className="btn" aria-label="Back to orders">
          <ArrowLeft size={18} aria-hidden />
        </Link>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: 'var(--text)' }}>
          {order ? `Order ${order.orderNumber}` : 'Order detail'}
        </h1>
      </div>

      {!id ? (
        <div className="muted">Invalid order ID.</div>
      ) : loading && !order ? (
        <Skeleton height={320} />
      ) : !order ? (
        <div className="muted">Order not found.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Customer / Driver / Vendor cards */}
          <div className="grid3">
            <div className="card" style={{ boxShadow: 'none' }}>
              <div className="cardBody">
                <div className="muted">Customer</div>
                <div style={{ fontWeight: 800, marginTop: 6 }}>{customer?.name ?? getId(order.customerId) ?? '—'}</div>
                <button type="button" className="btn" style={{ marginTop: 8 }} onClick={() => void copyPhone(customer?.phone)}>
                  <Copy size={16} /> {customer?.phone ?? '—'}
                </button>
                {customer?.email ? <div className="muted" style={{ marginTop: 6 }}>{customer.email}</div> : null}
              </div>
            </div>
            <div className="card" style={{ boxShadow: 'none' }}>
              <div className="cardBody">
                <div className="muted">Driver</div>
                <div style={{ fontWeight: 800, marginTop: 6 }}>
                  {driver?.name ?? (order.driverId ? getId(order.driverId) : 'Unassigned') ?? 'Unassigned'}
                </div>
                {driver?.phone ? (
                  <button type="button" className="btn" style={{ marginTop: 8 }} onClick={() => void copyPhone(driver.phone)}>
                    <Copy size={16} /> {driver.phone}
                  </button>
                ) : null}
                {(driver?.vehicleType || driver?.vehiclePlate) ? (
                  <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
                    Vehicle: {driver?.vehicleType ?? '—'} {driver?.vehiclePlate ? `(${driver.vehiclePlate})` : ''}
                  </div>
                ) : null}
              </div>
            </div>
            <div className="card" style={{ boxShadow: 'none' }}>
              <div className="cardBody">
                <div className="muted">Vendor</div>
                <div style={{ fontWeight: 800, marginTop: 6 }}>{vendor?.name ?? (order.vendorId ? getId(order.vendorId) : '—') ?? '—'}</div>
                {vendor?.slug ? <div className="muted" style={{ fontSize: 12 }}>{vendor.slug}</div> : null}
                {vendor?.logo ? (
                  <img src={vendor.logo.startsWith('http') ? vendor.logo : `${IMG_BASE}${vendor.logo}`} alt="" style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover', marginTop: 8 }} />
                ) : null}
              </div>
            </div>
          </div>

          {/* Order info + Payment */}
          <div className="grid2">
            <div className="card" style={{ boxShadow: 'none' }}>
              <div className="cardBody">
                <div className="muted">Order info</div>
                <div style={{ fontWeight: 800, marginTop: 6 }}>{order.orderNumber}</div>
                <div className="muted" style={{ fontSize: 12 }}>Created {formatDateTime(order.createdAt)}</div>
                <div style={{ marginTop: 12 }}>{statusBadge(order.status)} {paymentBadge(order.paymentStatus)}</div>
              </div>
            </div>
            <div className="card" style={{ boxShadow: 'none' }}>
              <div className="cardBody">
                <div className="muted">Payment</div>
                <div style={{ fontWeight: 800, fontSize: 20, marginTop: 6 }}>{formatMoney(order.total)}</div>
                <div className="muted" style={{ fontSize: 12 }}>Method: {order.paymentMethod ?? '—'}</div>
                <div className="muted" style={{ fontSize: 12 }}>WifiPay ref: {order.wifipayRef ?? '—'}</div>
              </div>
            </div>
          </div>

          {/* Finance & ledger */}
          <div className="card">
            <div className="cardBody">
              <div style={{ fontWeight: 800 }}>Finance & Ledger</div>
              <div className="divider" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span className="muted">Gross amount</span>
                  <span>{formatMoney(grossAmount)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span className="muted">Platform commission</span>
                  <span>{formatMoney(platformCommission)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span className="muted">WaafiPay fee</span>
                  <span>{formatMoney(wifipayFee)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span className="muted">Driver share</span>
                  <span>{formatMoney(driverShare)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800 }}>
                  <span>Vendor share</span>
                  <span>{formatMoney(vendorShare)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Items */}
          <div className="card">
            <div className="cardBody">
              <div style={{ fontWeight: 800 }}>Items</div>
              <div className="divider" />
              <div className="tableWrap">
                <table>
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Qty</th>
                      <th>Unit price</th>
                      <th>Subtotal</th>
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
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="muted">Subtotal</span><span>{formatMoney(itemsSubtotal)}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="muted">Delivery fee</span><span>{formatMoney(order.deliveryFee ?? 0)}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="muted">Discount</span><span>{formatMoney(order.discount ?? 0)}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800 }}><span>Total</span><span>{formatMoney(order.total)}</span></div>
              </div>
            </div>
          </div>

          {/* Addresses */}
          <div className="card">
            <div className="cardBody">
              <div style={{ fontWeight: 800 }}>Addresses</div>
              <div className="divider" />
              <div className="grid2">
                <div>
                  <div className="muted">Pickup</div>
                  <div style={{ marginTop: 6 }}>
                    {order.pickupAddress ? (
                      <>
                        <div style={{ fontWeight: 700 }}>{order.pickupAddress.name ?? 'Pickup'}</div>
                        <div className="muted" style={{ fontSize: 13 }}>{order.pickupAddress.street}, {order.pickupAddress.city}, {order.pickupAddress.country}</div>
                      </>
                    ) : <span className="muted">—</span>}
                  </div>
                </div>
                <div>
                  <div className="muted">Delivery</div>
                  <div style={{ marginTop: 6 }}>
                    <div style={{ fontWeight: 700 }}>{order.deliveryAddress?.contactName ?? 'Delivery'}</div>
                    <div className="muted" style={{ fontSize: 13 }}>{order.deliveryAddress?.street}, {order.deliveryAddress?.city}, {order.deliveryAddress?.country}</div>
                    {order.deliveryAddress?.contactPhone ? (
                      <button type="button" className="btn" style={{ marginTop: 8 }} onClick={() => void copyPhone(order.deliveryAddress?.contactPhone ?? undefined)}>
                        <Copy size={16} /> {order.deliveryAddress.contactPhone}
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Status timeline */}
          <div className="card">
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
          </div>

          {/* Admin actions */}
          {!isFinal ? (
            <div className="card">
              <div className="cardBody">
                <div style={{ fontWeight: 900 }}>Admin actions</div>
                <div className="divider" />
                <div className="grid2" style={{ gap: 24 }}>
                  <div>
                    <div className="muted" style={{ marginBottom: 8 }}>Change status</div>
                    <select className="select" value={nextStatus} onChange={(e) => setNextStatus(e.target.value as OrderStatus)}>
                      {ALL_STATUSES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                    <textarea className="textarea" placeholder="Note (optional)" value={statusNote} onChange={(e) => setStatusNote(e.target.value)} style={{ marginTop: 8, minHeight: 60 }} />
                    <button type="button" className="btn btnPrimary" style={{ marginTop: 10 }} onClick={() => void onChangeStatus()}>
                      Update status
                    </button>
                  </div>
                  <div>
                    <div className="muted" style={{ marginBottom: 8 }}>Assign driver</div>
                    <div className="adminDriverSearchRow">
                      <input className="input" value={driverQuery} onChange={(e) => setDriverQuery(e.target.value)} placeholder="Search drivers" />
                      <button type="button" className="btn" onClick={() => void runDriverSearch(driverQuery)} disabled={driverLoading} aria-label="Search"><Search size={16} /></button>
                    </div>
                    {driverLoading ? (
                      <div style={{ marginTop: 10 }}>
                        <Skeleton height={42} />
                      </div>
                    ) : driverResults.length === 0 ? (
                      <div className="muted" style={{ marginTop: 10, fontSize: 13 }}>No approved active drivers. Click Search to load.</div>
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
                      Assign selected driver
                    </button>
                  </div>
                </div>
                <div className="divider" />
                <div>
                  <div className="muted" style={{ marginBottom: 8 }}>Cancel order</div>
                  <textarea className="textarea" placeholder="Reason (required)" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} style={{ minHeight: 60 }} />
                  <button type="button" className="btn" style={{ marginTop: 10, background: 'var(--danger)', color: 'white' }} onClick={() => void onCancelOrder()} disabled={!cancelReason.trim()}>
                    Cancel order
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="muted" style={{ fontSize: 13 }}>Admin actions are disabled for delivered/cancelled orders.</div>
          )}
        </div>
      )}
    </div>
  );
}
