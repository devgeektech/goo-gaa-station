'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { fetchCustomerById, fetchCustomerOrders } from '@/store/slices/customersSlice';
import { formatDateTime, formatMoney } from '@/lib/utils/format';
import { Skeleton } from '@/components/ui/Skeleton';

const IMG_BASE = typeof process !== 'undefined' ? (process.env.NEXT_PUBLIC_API_URL ?? '') : '';
function imgSrc(url: string | null | undefined) {
  if (!url) return null;
  return url.startsWith('http') ? url : `${IMG_BASE}${url}`;
}

export default function CustomerDetailPage() {
  const params = useParams();
  const id = typeof params?.id === 'string' ? params.id : '';
  const dispatch = useAppDispatch();
  const { selectedCustomer, customerOrders, loading } = useAppSelector((s) => s.customers);
  const [ordersLoading, setOrdersLoading] = useState(false);

  useEffect(() => {
    if (id) {
      void dispatch(fetchCustomerById(id));
    }
  }, [id, dispatch]);

  useEffect(() => {
    if (id) {
      setOrdersLoading(true);
      void dispatch(fetchCustomerOrders({ id, page: 1, limit: 20 })).finally(() => setOrdersLoading(false));
    }
  }, [id, dispatch]);

  const fetchOrders = (page?: number) => {
    if (!id) return;
    setOrdersLoading(true);
    void dispatch(fetchCustomerOrders({ id, page, limit: 20 })).finally(() => setOrdersLoading(false));
  };

  const customer = selectedCustomer?._id === id ? selectedCustomer : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div className="row" style={{ alignItems: 'center', gap: 12 }}>
        <Link href="/customers" className="btn" aria-label="Back to customers">
          <ArrowLeft size={18} aria-hidden />
        </Link>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: 'var(--text)' }}>Customer detail</h1>
      </div>

      {!id ? (
        <div className="muted">Invalid customer ID.</div>
      ) : loading && !customer ? (
        <Skeleton height={320} />
      ) : !customer ? (
        <div className="muted">Customer not found.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div className="card">
            <div className="cardBody">
              <div className="row" style={{ alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                {imgSrc(customer.profileImage) ? (
                  <img src={imgSrc(customer.profileImage)!} alt="" style={{ width: 72, height: 72, borderRadius: 12, objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: 72, height: 72, borderRadius: 12, background: 'var(--border-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>No photo</div>
                )}
                <div>
                  <div style={{ fontWeight: 800, fontSize: 20 }}>{customer.name}</div>
                  <div className="muted">{customer.phone}</div>
                  {customer.email ? <div className="muted">{customer.email}</div> : null}
                  <span className="badge" style={{ marginTop: 8, background: customer.status === 'blocked' ? 'var(--danger-light)' : customer.status === 'deleted' ? 'var(--warning-light)' : 'var(--success-light)' }}>
                    {customer.status}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="grid2">
            <div className="card" style={{ boxShadow: 'none' }}>
              <div className="cardBody">
                <div className="muted">Points balance</div>
                <div style={{ marginTop: 8, fontWeight: 800, fontSize: 24 }}>{customer.points ?? 0}</div>
              </div>
            </div>
            <div className="card" style={{ boxShadow: 'none' }}>
              <div className="cardBody">
                <div className="muted">Total orders</div>
                <div style={{ marginTop: 8, fontWeight: 800, fontSize: 24 }}>{customer.orderCount ?? customer.totalOrders ?? 0}</div>
              </div>
            </div>
            <div className="card" style={{ boxShadow: 'none' }}>
              <div className="cardBody">
                <div className="muted">Total spend</div>
                <div style={{ marginTop: 8, fontWeight: 800, fontSize: 24 }}>{formatMoney(customer.totalSpent ?? 0)}</div>
              </div>
            </div>
          </div>

          {customer.addresses && customer.addresses.length > 0 ? (
            <div className="card">
              <div className="cardBody">
                <div style={{ fontWeight: 800 }}>Addresses</div>
                <div className="divider" />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {customer.addresses.map((a, i) => (
                    <div key={i}>
                      <div style={{ fontWeight: 600 }}>{a.label}</div>
                      <div className="muted" style={{ fontSize: 14 }}>{a.street}, {a.city}, {a.country}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          <div className="card">
            <div className="cardBody">
              <div style={{ fontWeight: 800 }}>Order history</div>
              <div className="muted" style={{ fontSize: 14 }}>Total {customerOrders.pagination.total}</div>
              <div className="divider" />
              {ordersLoading && customerOrders.items.length === 0 ? (
                <Skeleton height={120} />
              ) : customerOrders.items.length === 0 ? (
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
                        {customerOrders.items.map((o) => (
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
                    <span className="muted">Page {customerOrders.pagination.page} / {customerOrders.pagination.totalPages}</span>
                    <div className="row">
                      <button className="btn" disabled={!customerOrders.pagination.hasPrev || ordersLoading} onClick={() => fetchOrders(customerOrders.pagination.page - 1)}>Prev</button>
                      <button className="btn" disabled={!customerOrders.pagination.hasNext || ordersLoading} onClick={() => fetchOrders(customerOrders.pagination.page + 1)}>Next</button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
