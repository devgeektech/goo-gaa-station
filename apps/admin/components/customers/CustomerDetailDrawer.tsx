'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';
import type { CustomerDetail } from '@/lib/api/customers.api';
import type { CustomerOrderItem } from '@/lib/api/users.api';
import { formatDateTime, formatMoney } from '@/lib/utils/format';
import { Skeleton } from '@/components/ui/Skeleton';

function publicFileBase(): string {
  const base = typeof process !== 'undefined' ? (process.env.NEXT_PUBLIC_API_URL ?? '') : '';
  return base.replace(/\/api\/v1\/?$/, '');
}
function imgSrc(url: string | null | undefined) {
  if (!url) return null;
  return url.startsWith('http') ? url : `${publicFileBase()}${url}`;
}

export function CustomerDetailDrawer({
  open,
  customer,
  orders,
  ordersLoading,
  ordersPagination,
  onClose,
  onFetchOrders,
}: {
  open: boolean;
  customer: CustomerDetail | null;
  orders: CustomerOrderItem[];
  ordersLoading: boolean;
  ordersPagination: { page: number; totalPages: number; hasNext: boolean; hasPrev: boolean; total: number };
  onClose: () => void;
  onFetchOrders: (page?: number) => void;
}) {
  useEffect(() => {
    if (open && customer?._id) onFetchOrders(1);
  }, [open, customer?._id]);

  if (!open) return null;

  return (
    <div
      className="modalOverlay"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{ alignItems: 'stretch', justifyContent: 'flex-end' }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 560,
          background: 'var(--panel)',
          borderLeft: '1px solid var(--border)',
          boxShadow: 'var(--shadow-lg)',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '100vh',
          overflow: 'hidden',
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modalHeader" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="modalTitle">Customer Detail</div>
          <button type="button" className="btn" onClick={onClose} aria-label="Close">
            <X size={18} aria-hidden />
          </button>
        </div>
        <div className="modalBody" style={{ overflow: 'auto', flex: 1 }}>
          {!customer ? (
            <Skeleton height={200} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div className="grid2">
                <div className="card" style={{ boxShadow: 'none' }}>
                  <div className="cardBody">
                   
                    <div className="row" style={{ alignItems: 'center', gap: 12, marginTop: 8 }}>
                      {imgSrc(customer.profileImage) ? (
                        <img
                          src={imgSrc(customer.profileImage)!}
                          alt=""
                          style={{ width: 56, height: 56, borderRadius: 8, objectFit: 'cover' }}
                        />
                      ) : null}
                      <div>
                        <div style={{ fontWeight: 800 }}>{customer.name}</div>
                        <div className="muted">{customer.phone}</div>
                        {customer.email ? <div className="muted">{customer.email}</div> : null}
                        <span className="badge" style={{ marginTop: 6, background: customer.status === 'blocked' ? 'var(--danger-light)' : customer.status === 'deleted' ? 'var(--warning-light)' : 'var(--success-light)' }}>
                          {customer.status}
                        </span>
                        <div style={{ marginTop: 8 }}>
                          <Link href={`/customers/${customer._id}`} className="btn" style={{ fontSize: 13 }}>View full page</Link>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="card" style={{ boxShadow: 'none' }}>
                  <div className="cardBody">
                    <div className="muted">Stats</div>
                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontWeight: 800 }}>{formatMoney(customer.totalSpent ?? 0)}</div>
                      <div className="muted" style={{ fontSize: 13 }}>Total spend</div>
                    </div>
                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontWeight: 800 }}>{customer.orderCount ?? customer.totalOrders ?? 0}</div>
                      <div className="muted" style={{ fontSize: 13 }}>Orders</div>
                    </div>
                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontWeight: 800 }}>{customer.points ?? 0}</div>
                      <div className="muted" style={{ fontSize: 13 }}>Points balance</div>
                    </div>
                  </div>
                </div>
              </div>
              {customer.addresses && customer.addresses.length > 0 ? (
                <div className="card" style={{ boxShadow: 'none' }}>
                  <div className="cardBody">
                    <div style={{ fontWeight: 800 }}>Addresses</div>
                    <div className="divider" />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {customer.addresses.map((a, i) => (
                        <div key={i}>
                          <div style={{ fontWeight: 600 }}>{a.label}</div>
                          <div className="muted" style={{ fontSize: 13 }}>
                            {a.street}, {a.city}, {a.country}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}
              <div className="card" style={{ boxShadow: 'none' }}>
                <div className="cardBody">
                  <div style={{ fontWeight: 800 }}>Order history</div>
                  <div className="muted" style={{ fontSize: 13 }}>Total {ordersPagination.total}</div>
                  <div className="divider" />
                  {ordersLoading && orders.length === 0 ? (
                    <Skeleton height={120} />
                  ) : orders.length === 0 ? (
                    <div className="muted">No orders yet.</div>
                  ) : (
                    <>
                      <div className="tableWrap">
                        <table>
                          <thead>
                            <tr>
                              <th>Order#</th>
                              <th>Date</th>
                              <th>Total</th>
                              <th>Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {orders.map((o) => (
                              <tr key={o._id}>
                                <td style={{ fontWeight: 700 }}>{o.orderNumber}</td>
                                <td className="muted">{formatDateTime(o.createdAt)}</td>
                                <td>{formatMoney(o.total)}</td>
                                <td><span className="badge">{o.status}</span></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="row adminPaginationRow" style={{ justifyContent: 'space-between', marginTop: 12, alignItems: 'center' }}>
                        <span className="muted">Page {ordersPagination.page} / {ordersPagination.totalPages}</span>
                        <div className="row">
                          <button className="btn" disabled={!ordersPagination.hasPrev || ordersLoading} onClick={() => onFetchOrders(ordersPagination.page - 1)}>Prev</button>
                          <button className="btn" disabled={!ordersPagination.hasNext || ordersLoading} onClick={() => onFetchOrders(ordersPagination.page + 1)}>Next</button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
