'use client';

import { useEffect, useMemo, useState } from 'react';
import { Search, Copy, RefreshCcw } from 'lucide-react';
import type { OrderListItem, OrderStatus } from '@/lib/api/orders.api';
import { Modal } from '@/components/ui/Modal';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatDateTime, formatMoney, copyToClipboard } from '@/lib/utils/format';
import { useToast } from '@/components/ui/Toast';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { adminAssignDriver, adminCancelOrder, adminUpdateOrderStatus, fetchOrderById } from '@/store/slices/ordersSlice';
import { searchDrivers, type DriverListItem } from '@/lib/api/drivers.api';

function asObj<T extends object>(v: unknown): T | null {
  if (!v || typeof v !== 'object') return null;
  return v as T;
}

function getId(v: unknown): string | null {
  if (typeof v === 'string') return v;
  const o = asObj<{ _id?: string }>(v);
  return o?._id ?? null;
}

export function OrderDetailModal({
  open,
  orderId,
  onClose,
}: {
  open: boolean;
  orderId: string | null;
  onClose: () => void;
}) {
  const dispatch = useAppDispatch();
  const toast = useToast();
  const selected = useAppSelector((s) => s.orders.selectedOrder);
  const [localLoading, setLocalLoading] = useState(false);

  const order = selected && orderId && selected._id === orderId ? selected : null;

  useEffect(() => {
    if (!open || !orderId) return;
    setLocalLoading(true);
    void dispatch(fetchOrderById(orderId)).finally(() => setLocalLoading(false));
  }, [dispatch, open, orderId]);

  const isFinal = order?.status === 'delivered' || order?.status === 'cancelled';

  // Admin actions state
  const [nextStatus, setNextStatus] = useState<OrderStatus>('confirmed');
  const [statusNote, setStatusNote] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [driverQuery, setDriverQuery] = useState('');
  const [driverResults, setDriverResults] = useState<DriverListItem[]>([]);
  const [driverLoading, setDriverLoading] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState<DriverListItem | null>(null);

  useEffect(() => {
    if (!open) return;
    setSelectedDriver(null);
    setDriverResults([]);
    setDriverQuery('');
    setCancelReason('');
    setStatusNote('');
  }, [open]);

  const statusHistory = useMemo(() => {
    const h = order?.statusHistory ?? [];
    return [...h].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }, [order?.statusHistory]);

  const customer = asObj<{ name?: string; phone?: string; email?: string }>(order?.customerId);
  const driver = asObj<{ name?: string; phone?: string; vehicleType?: string; vehiclePlate?: string }>(order?.driverId);

  async function copyPhone(phone?: string) {
    if (!phone) return;
    const ok = await copyToClipboard(phone);
    toast.push({ title: ok ? 'Copied' : 'Copy failed', description: phone, variant: ok ? 'success' : 'danger' });
  }

  async function runDriverSearch(q: string) {
    setDriverLoading(true);
    try {
      const res = await searchDrivers({ search: q, page: 1, limit: 10, approvalStatus: 'approved', status: 'active' });
      setDriverResults(res.data);
    } finally {
      setDriverLoading(false);
    }
  }

  async function onAssignDriver() {
    if (!order || !selectedDriver) return;
    const id = order._id;
    const driverId = selectedDriver._id;
    const action = await dispatch(adminAssignDriver({ id, driverId }));
    if (adminAssignDriver.fulfilled.match(action)) {
      toast.push({ title: 'Driver assigned', description: `${selectedDriver.name ?? driverId}`, variant: 'success' });
    } else {
      toast.push({ title: 'Assign failed', description: String(action.payload ?? action.error.message), variant: 'danger' });
    }
  }

  async function onChangeStatus() {
    if (!order) return;
    const action = await dispatch(adminUpdateOrderStatus({ id: order._id, status: nextStatus, note: statusNote || undefined }));
    if (adminUpdateOrderStatus.fulfilled.match(action)) {
      toast.push({ title: 'Status updated', description: nextStatus, variant: 'success' });
      setStatusNote('');
    } else {
      toast.push({ title: 'Update failed', description: String(action.payload ?? action.error.message), variant: 'danger' });
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
      toast.push({ title: 'Cancel failed', description: String(action.payload ?? action.error.message), variant: 'danger' });
    }
  }

  const itemsSubtotal = (order?.items ?? []).reduce((s, i) => s + (Number(i.subtotal) || 0), 0);

  return (
    <Modal
      open={open}
      title={order ? `Order ${order.orderNumber}` : 'Order details'}
      onClose={onClose}
    >
      {localLoading && !order ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Skeleton height={18} />
          <Skeleton height={120} />
          <Skeleton height={120} />
        </div>
      ) : !order ? (
        <div className="muted">No order selected.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="grid3">
            <div className="card" style={{ boxShadow: 'none' }}>
              <div className="cardBody">
                <div className="muted">Order info</div>
                <div style={{ fontWeight: 800, marginTop: 6 }}>{order.orderNumber}</div>
                <div className="muted" style={{ fontSize: 12 }}>
                  Created {formatDateTime(order.createdAt)}
                </div>
                <div className="divider" />
                <div className="muted">Total</div>
                <div style={{ fontWeight: 800, fontSize: 18 }}>{formatMoney(order.total)}</div>
                <div className="muted" style={{ fontSize: 12 }}>
                  Payment: {order.paymentStatus} ({order.paymentMethod ?? '—'})
                </div>
                <div className="muted" style={{ fontSize: 12 }}>
                  WifiPay ref: {order.wifipayRef ?? '—'}
                </div>
              </div>
            </div>

            <div className="card" style={{ boxShadow: 'none' }}>
              <div className="cardBody">
                <div className="muted">Customer</div>
                <div style={{ fontWeight: 800, marginTop: 6 }}>{customer?.name ?? getId(order.customerId) ?? '—'}</div>
                <div className="row" style={{ marginTop: 6 }}>
                  <button className="btn" onClick={() => void copyPhone(customer?.phone)}>
                    <Copy size={16} /> {customer?.phone ?? '—'}
                  </button>
                </div>
              </div>
            </div>

            <div className="card" style={{ boxShadow: 'none' }}>
              <div className="cardBody">
                <div className="muted">Driver</div>
                <div style={{ fontWeight: 800, marginTop: 6 }}>
                  {driver?.name ?? (order.driverId ? getId(order.driverId) : 'Unassigned') ?? 'Unassigned'}
                </div>
                {driver?.phone ? (
                  <div className="row" style={{ marginTop: 6 }}>
                    <button className="btn" onClick={() => void copyPhone(driver.phone)}>
                      <Copy size={16} /> {driver.phone}
                    </button>
                  </div>
                ) : null}
                {driver?.vehicleType || driver?.vehiclePlate ? (
                  <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
                    Vehicle: {driver?.vehicleType ?? '—'} {driver?.vehiclePlate ? `(${driver.vehiclePlate})` : ''}
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="grid2">
            <div className="card" style={{ boxShadow: 'none' }}>
              <div className="cardBody">
                <div style={{ fontWeight: 800 }}>Items</div>
                <div className="divider" />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {order.items.map((i, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                      <div>
                        <div style={{ fontWeight: 700 }}>
                          {i.name} <span className="muted">×{i.qty}</span>
                        </div>
                        <div className="muted" style={{ fontSize: 12 }}>
                          Unit {formatMoney(i.unitPrice)} • Subtotal {formatMoney(i.subtotal)}
                        </div>
                      </div>
                      <div style={{ fontWeight: 800 }}>{formatMoney(i.subtotal)}</div>
                    </div>
                  ))}
                  <div className="divider" />
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <div className="muted">Items subtotal</div>
                    <div style={{ fontWeight: 800 }}>{formatMoney(itemsSubtotal)}</div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <div className="muted">Delivery fee</div>
                    <div style={{ fontWeight: 800 }}>{formatMoney(order.deliveryFee ?? 0)}</div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <div className="muted">Discount</div>
                    <div style={{ fontWeight: 800 }}>{formatMoney(order.discount ?? 0)}</div>
                  </div>
                  <div className="divider" />
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <div style={{ fontWeight: 800 }}>Total</div>
                    <div style={{ fontWeight: 900 }}>{formatMoney(order.total)}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="card" style={{ boxShadow: 'none' }}>
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
                          <div className="muted" style={{ fontSize: 12 }}>
                            {order.pickupAddress.street}, {order.pickupAddress.city}, {order.pickupAddress.country}
                          </div>
                        </>
                      ) : (
                        <div className="muted">—</div>
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="muted">Delivery</div>
                    <div style={{ marginTop: 6 }}>
                      <div style={{ fontWeight: 700 }}>{order.deliveryAddress?.contactName ?? 'Delivery'}</div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {order.deliveryAddress?.street}, {order.deliveryAddress?.city}, {order.deliveryAddress?.country}
                      </div>
                      {order.deliveryAddress?.contactPhone ? (
                        <button className="btn" style={{ marginTop: 8 }} onClick={() => void copyPhone(order.deliveryAddress?.contactPhone ?? undefined)}>
                          <Copy size={16} /> {order.deliveryAddress.contactPhone}
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="card" style={{ boxShadow: 'none' }}>
            <div className="cardBody">
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
                <div>
                  <div style={{ fontWeight: 800 }}>Status timeline</div>
                  <div className="muted">History of changes (admin overrides marked)</div>
                </div>
                <button
                  className="btn"
                  onClick={() => {
                    if (!orderId) return;
                    setLocalLoading(true);
                    void dispatch(fetchOrderById(orderId)).finally(() => setLocalLoading(false));
                  }}
                >
                  <RefreshCcw size={16} /> Refresh
                </button>
              </div>
              <div className="divider" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {statusHistory.length === 0 ? <div className="muted">No history.</div> : null}
                {statusHistory.map((s, idx) => (
                  <div key={`${s.timestamp}-${idx}`} style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 12 }}>
                    <div className="muted">{formatDateTime(s.timestamp)}</div>
                    <div>
                      <div style={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className="badge" style={{ background: 'var(--bg)' }}>
                          {s.status}
                        </span>
                        {s.isAdminOverride ? <span className="badge" style={{ background: 'var(--primary-light)' }}>Override</span> : null}
                        <span className="muted" style={{ fontSize: 12 }}>
                          {s.changedByModel ? `by ${s.changedByModel}` : ''}
                        </span>
                      </div>
                      {s.note ? <div className="muted" style={{ marginTop: 4 }}>{s.note}</div> : null}
                      {s.changedBy ? <div className="muted" style={{ marginTop: 2, fontSize: 12 }}>id: {s.changedBy}</div> : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {!isFinal ? (
            <div className="card" style={{ boxShadow: 'none' }}>
              <div className="cardBody">
                <div style={{ fontWeight: 900 }}>Admin actions</div>
                <div className="divider" />
                <div className="grid3">
                  <div>
                    <div className="muted" style={{ marginBottom: 6 }}>
                      Change status
                    </div>
                    <select className="select" value={nextStatus} onChange={(e) => setNextStatus(e.target.value as OrderStatus)}>
                      <option value="placed">placed</option>
                      <option value="confirmed">confirmed</option>
                      <option value="preparing">preparing</option>
                      <option value="picked_up">picked_up</option>
                      <option value="on_the_way">on_the_way</option>
                      <option value="delivered">delivered</option>
                      <option value="cancelled">cancelled</option>
                    </select>
                    <textarea
                      className="textarea"
                      placeholder="Note (optional)"
                      value={statusNote}
                      onChange={(e) => setStatusNote(e.target.value)}
                      style={{ marginTop: 8 }}
                    />
                    <button className="btn btnPrimary" style={{ marginTop: 10 }} onClick={() => void onChangeStatus()}>
                      Confirm status change
                    </button>
                  </div>

                  <div>
                    <div className="muted" style={{ marginBottom: 6 }}>
                      Cancel order
                    </div>
                    <textarea
                      className="textarea"
                      placeholder="Reason (required)"
                      value={cancelReason}
                      onChange={(e) => setCancelReason(e.target.value)}
                    />
                    <button className="btn btnDanger" style={{ marginTop: 10 }} onClick={() => void onCancelOrder()}>
                      Cancel order
                    </button>
                  </div>

                  <div>
                    <div className="muted" style={{ marginBottom: 6 }}>
                      Assign driver
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        className="input"
                        value={driverQuery}
                        onChange={(e) => setDriverQuery(e.target.value)}
                        placeholder="Search drivers (name/phone)"
                      />
                      <button
                        className="btn"
                        onClick={() => void runDriverSearch(driverQuery)}
                        disabled={driverLoading || !driverQuery.trim()}
                        aria-label="Search drivers"
                      >
                        <Search size={16} />
                      </button>
                    </div>
                    <div style={{ marginTop: 10 }}>
                      {driverLoading ? (
                        <Skeleton height={42} />
                      ) : driverResults.length === 0 ? (
                        <div className="muted" style={{ fontSize: 13 }}>
                          Search for an approved active driver.
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 220, overflow: 'auto' }}>
                          {driverResults.map((d) => (
                            <button
                              key={d._id}
                              className="btn"
                              style={{
                                justifyContent: 'space-between',
                                background: selectedDriver?._id === d._id ? 'var(--primary-light)' : undefined,
                              }}
                              onClick={() => setSelectedDriver(d)}
                              type="button"
                            >
                              <span style={{ fontWeight: 700 }}>{d.name ?? d._id}</span>
                              <span className="muted" style={{ fontSize: 12 }}>
                                {d.phone ?? '—'}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <button className="btn btnPrimary" style={{ marginTop: 10 }} onClick={() => void onAssignDriver()} disabled={!selectedDriver}>
                      Assign selected driver
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="muted" style={{ fontSize: 13 }}>
              Admin actions are disabled for delivered/cancelled orders.
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

