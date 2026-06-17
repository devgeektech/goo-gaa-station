'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { fetchCustomerById, fetchCustomerOrders } from '@/store/slices/customersSlice';
import { formatDateTime, formatMoney } from '@/lib/utils/format';
import { Avatar } from '@/components/ui/Avatar';
import { Skeleton } from '@/components/ui/Skeleton';
import { useDriverStatusBadges } from '@/lib/i18n/useStatusBadges';
import { useTranslations } from '@/lib/i18n/useTranslations';
import { formatT } from '@/lib/i18n/translations';

function publicFileBase(): string {
  const base = typeof process !== 'undefined' ? (process.env.NEXT_PUBLIC_API_URL ?? '') : '';
  return base.replace(/\/api\/v1\/?$/, '');
}
function imgSrc(url: string | null | undefined) {
  if (!url) return null;
  return url.startsWith('http') ? url : `${publicFileBase()}${url}`;
}

export default function CustomerDetailPage() {
  const t = useTranslations();
  const { accountStatusBadge } = useDriverStatusBadges();
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
        <Link href="/customers" className="btn" aria-label={t.common.backToCustomers}>
          <ArrowLeft size={18} aria-hidden />
        </Link>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: 'var(--text)' }}>{t.customers.detailTitle}</h1>
      </div>

      {!id ? (
        <div className="muted">{t.customers.invalidId}</div>
      ) : loading && !customer ? (
        <Skeleton height={320} />
      ) : !customer ? (
        <div className="muted">{t.customers.notFound}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div className="card">
            <div className="cardBody">
              <div className="row" style={{ alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                <Avatar src={imgSrc(customer.profileImage)} name={customer.name} size={72} radius={12} />
                <div>
                  <div style={{ fontWeight: 800, fontSize: 20 }}>{customer.name}</div>
                  <div className="muted">{customer.phone}</div>
                  {customer.email ? <div className="muted">{customer.email}</div> : null}
                  <span className="badge" style={{ marginTop: 8, background: accountStatusBadge(customer.status).background }}>
                    {accountStatusBadge(customer.status).label}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="grid2">
            <div className="card" style={{ boxShadow: 'none' }}>
              <div className="cardBody">
                <div className="muted">{t.customers.totalOrders}</div>
                <div style={{ marginTop: 8, fontWeight: 800, fontSize: 24 }}>{customer.orderCount ?? customer.totalOrders ?? 0}</div>
              </div>
            </div>
          </div>

          {customer.addresses && customer.addresses.length > 0 ? (
            <div className="card">
              <div className="cardBody">
                <div style={{ fontWeight: 800 }}>{t.customers.addresses}</div>
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
              <div style={{ fontWeight: 800 }}>{t.customers.orderHistory}</div>
              <div className="muted" style={{ fontSize: 14 }}>{formatT(t.common.totalCount, { total: customerOrders.pagination.total })}</div>
              <div className="divider" />
              {ordersLoading && customerOrders.items.length === 0 ? (
                <Skeleton height={120} />
              ) : customerOrders.items.length === 0 ? (
                <div className="muted">{t.empty.ordersYet}</div>
              ) : (
                <>
                  <div className="tableWrap">
                    <table>
                      <thead>
                        <tr>
                          <th>{t.orders.orderNumber}</th>
                          <th>{t.common.date}</th>
                          <th>{t.common.total}</th>
                          <th>{t.common.status}</th>
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
                    <span className="muted">{formatT(t.common.pageOfShort, { page: customerOrders.pagination.page, totalPages: customerOrders.pagination.totalPages })}</span>
                    <div className="row">
                      <button className="btn" disabled={!customerOrders.pagination.hasPrev || ordersLoading} onClick={() => fetchOrders(customerOrders.pagination.page - 1)}>{t.common.prev}</button>
                      <button className="btn" disabled={!customerOrders.pagination.hasNext || ordersLoading} onClick={() => fetchOrders(customerOrders.pagination.page + 1)}>{t.common.next}</button>
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
