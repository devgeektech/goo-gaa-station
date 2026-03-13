'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getDriver, getDriverLocation, getDriverOrders } from '@/lib/api/drivers.api';
import type { DriverDetail, DriverOrderItem } from '@/lib/api/drivers.api';
import { DriverMap } from '@/components/drivers/DriverMap';
import { formatDateTime, formatMoney } from '@/lib/utils/format';
import { Skeleton } from '@/components/ui/Skeleton';

const IMG_BASE = typeof process !== 'undefined' ? (process.env.NEXT_PUBLIC_API_URL ?? '') : '';
function imgSrc(url: string | null | undefined) {
  if (!url) return null;
  return url.startsWith('http') ? url : `${IMG_BASE}${url}`;
}

export default function DriverDetailPage() {
  const params = useParams();
  const id = typeof params?.id === 'string' ? params.id : '';
  const [driver, setDriver] = useState<DriverDetail | null>(null);
  const [location, setLocation] = useState<{ liveLocation?: { coordinates?: number[] }; lastLocationAt?: string; isOnline?: boolean } | null>(null);
  const [orders, setOrders] = useState<DriverOrderItem[]>([]);
  const [ordersPagination, setOrdersPagination] = useState({ total: 0, page: 1, totalPages: 1, hasNext: false, hasPrev: false });
  const [loading, setLoading] = useState(true);
  const [ordersLoading, setOrdersLoading] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getDriver(id)
      .then((res) => setDriver(res.data))
      .catch(() => setDriver(null))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!id) return;
    getDriverLocation(id)
      .then((res) => setLocation(res.data))
      .catch(() => setLocation(null));
  }, [id]);

  useEffect(() => {
    if (!id) return;
    setOrdersLoading(true);
    getDriverOrders(id, 1, 20)
      .then((res) => {
        setOrders(res.data ?? []);
        setOrdersPagination({
          total: res.total ?? 0,
          page: res.page ?? 1,
          totalPages: res.totalPages ?? 1,
          hasNext: res.hasNext ?? false,
          hasPrev: res.hasPrev ?? false,
        });
      })
      .finally(() => setOrdersLoading(false));
  }, [id]);

  const fetchOrders = (page: number) => {
    if (!id) return;
    setOrdersLoading(true);
    getDriverOrders(id, page, 20)
      .then((res) => {
        setOrders(res.data ?? []);
        setOrdersPagination({
          total: res.total ?? 0,
          page: res.page ?? 1,
          totalPages: res.totalPages ?? 1,
          hasNext: res.hasNext ?? false,
          hasPrev: res.hasPrev ?? false,
        });
      })
      .finally(() => setOrdersLoading(false));
  };

  const coords = location?.liveLocation?.coordinates;
  const coordsTuple: [number, number] | null =
    coords && coords.length >= 2 && typeof coords[0] === 'number' && typeof coords[1] === 'number'
      ? [coords[0], coords[1]]
      : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div className="row" style={{ alignItems: 'center', gap: 12 }}>
        <Link href="/drivers" className="btn" aria-label="Back to drivers">
          <ArrowLeft size={18} aria-hidden />
        </Link>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: 'var(--text)' }}>Driver detail</h1>
      </div>

      {!id ? (
        <div className="muted">Invalid driver ID.</div>
      ) : loading && !driver ? (
        <Skeleton height={320} />
      ) : !driver ? (
        <div className="muted">Driver not found.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div className="card">
            <div className="cardBody">
              <div className="row" style={{ alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                {imgSrc(driver.profileImage) ? (
                  <img src={imgSrc(driver.profileImage)!} alt="" style={{ width: 72, height: 72, borderRadius: 12, objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: 72, height: 72, borderRadius: 12, background: 'var(--border-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>No photo</div>
                )}
                <div>
                  <div style={{ fontWeight: 800, fontSize: 20 }}>{driver.name}</div>
                  <div className="muted">{driver.phone}</div>
                  {driver.email ? <div className="muted">{driver.email}</div> : null}
                  <div className="row" style={{ gap: 8, marginTop: 8 }}>
                    <span className="badge" style={{ background: driver.approvalStatus === 'approved' ? 'var(--success-light)' : driver.approvalStatus === 'rejected' ? 'var(--danger-light)' : 'var(--warning-light)' }}>{driver.approvalStatus}</span>
                    <span className="badge" style={{ background: driver.status === 'blocked' ? 'var(--danger-light)' : driver.status === 'deleted' ? 'var(--warning-light)' : 'var(--success-light)' }}>{driver.status}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid2">
            <div className="card" style={{ boxShadow: 'none' }}>
              <div className="cardBody">
                <div className="muted">Rating</div>
                <div style={{ marginTop: 8, fontWeight: 800, fontSize: 24 }}>{driver.rating != null ? Number(driver.rating).toFixed(1) : '—'}</div>
              </div>
            </div>
            <div className="card" style={{ boxShadow: 'none' }}>
              <div className="cardBody">
                <div className="muted">Total deliveries</div>
                <div style={{ marginTop: 8, fontWeight: 800, fontSize: 24 }}>{driver.totalDeliveries ?? 0}</div>
              </div>
            </div>
            <div className="card" style={{ boxShadow: 'none' }}>
              <div className="cardBody">
                <div className="muted">Total earnings</div>
                <div style={{ marginTop: 8, fontWeight: 800, fontSize: 24 }}>{formatMoney(driver.totalEarnings ?? 0)}</div>
              </div>
            </div>
            <div className="card" style={{ boxShadow: 'none' }}>
              <div className="cardBody">
                <div className="muted">Vehicle</div>
                <div style={{ marginTop: 8 }}>{driver.vehicleType ?? '—'} {driver.vehiclePlate ? `(${driver.vehiclePlate})` : ''}</div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="cardBody">
              <div className="muted" style={{ marginBottom: 8 }}>Live location</div>
              {location ? (
                <>
                  <div className="muted" style={{ fontSize: 13 }}>Online: {location.isOnline ? 'Yes' : 'No'}</div>
                  {location.lastLocationAt ? <div className="muted" style={{ fontSize: 12 }}>Updated {formatDateTime(location.lastLocationAt)}</div> : null}
                  <div style={{ marginTop: 12 }}>
                    <DriverMap coordinates={coordsTuple} driverName={driver.name} height={320} />
                  </div>
                </>
              ) : (
                <Skeleton height={200} />
              )}
            </div>
          </div>

          {driver.blockReason && driver.status === 'blocked' ? (
            <div className="card" style={{ boxShadow: 'none', borderColor: 'var(--danger)' }}>
              <div className="cardBody">
                <div className="muted">Block reason</div>
                <div style={{ marginTop: 6 }}>{driver.blockReason}</div>
              </div>
            </div>
          ) : null}

          <div className="card">
            <div className="cardBody">
              <div style={{ fontWeight: 800 }}>Order history</div>
              <div className="muted" style={{ fontSize: 14 }}>Total {ordersPagination.total}</div>
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
                  <div className="row" style={{ justifyContent: 'space-between', marginTop: 12, alignItems: 'center' }}>
                    <span className="muted">Page {ordersPagination.page} / {ordersPagination.totalPages}</span>
                    <div className="row">
                      <button className="btn" disabled={!ordersPagination.hasPrev || ordersLoading} onClick={() => fetchOrders(ordersPagination.page - 1)}>Prev</button>
                      <button className="btn" disabled={!ordersPagination.hasNext || ordersLoading} onClick={() => fetchOrders(ordersPagination.page + 1)}>Next</button>
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
