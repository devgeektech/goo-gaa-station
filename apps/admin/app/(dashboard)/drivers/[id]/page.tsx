'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getDriver, getDriverLocation, getDriverOrders, approveDriver, rejectDriver } from '@/lib/api/drivers.api';
import type { DriverDetail, DriverOrderItem, DriverLocationResponse } from '@/lib/api/drivers.api';
import { DriverMap } from '@/components/drivers/DriverMap';
import { DriverKycCard } from '@/components/drivers/DriverKycCard';
import { RejectDriverModal } from '@/components/drivers/RejectDriverModal';
import { formatDateTime, formatMoney, formatVehicleType } from '@/lib/utils/format';
import { useDriverStatusBadges } from '@/lib/i18n/useStatusBadges';
import { Avatar } from '@/components/ui/Avatar';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
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

function driverRatingSubtitle(t: ReturnType<typeof useTranslations>, rating?: number | null, ratingCount?: number): string {
  const count = ratingCount ?? 0;
  if (count <= 0 || rating == null) return t.status.noRatings;
  return count === 1 ? t.drivers.deliveryRatingOne : formatT(t.drivers.deliveryRatingsCount, { n: count });
}

export default function DriverDetailPage() {
  const t = useTranslations();
  const { approvalStatusBadge, accountStatusBadge, onlineStatusBadge } = useDriverStatusBadges();
  const toast = useToast();
  const params = useParams();
  const id = typeof params?.id === 'string' ? params.id : '';
  const [driver, setDriver] = useState<DriverDetail | null>(null);
  const [location, setLocation] = useState<DriverLocationResponse | null>(null);
  const [orders, setOrders] = useState<DriverOrderItem[]>([]);
  const [ordersPagination, setOrdersPagination] = useState({ total: 0, page: 1, totalPages: 1, hasNext: false, hasPrev: false });
  const [loading, setLoading] = useState(true);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [approveLoading, setApproveLoading] = useState(false);
  const [rejectLoading, setRejectLoading] = useState(false);

  const refreshDriver = () => {
    if (!id) return;
    getDriver(id).then((res) => setDriver(res.data)).catch(() => setDriver(null));
  };

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

  const coords = location?.liveLocation?.coordinates ?? driver?.liveLocation?.coordinates;
  const coordsTuple: [number, number] | null =
    coords && coords.length >= 2 && typeof coords[0] === 'number' && typeof coords[1] === 'number'
      ? [coords[0], coords[1]]
      : null;
  const isOnline = driver?.isOnline === true;

  const ratingValue =
    driver?.ratingCount && driver.ratingCount > 0 && driver.rating != null
      ? Number(driver.rating).toFixed(1)
      : '—';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div className="row" style={{ alignItems: 'center', gap: 12 }}>
        <Link href="/drivers" className="btn" aria-label={t.common.backToDrivers}>
          <ArrowLeft size={18} aria-hidden />
        </Link>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: 'var(--text)' }}>{t.drivers.detailTitle}</h1>
      </div>

      {!id ? (
        <div className="muted">{t.drivers.invalidId}</div>
      ) : loading && !driver ? (
        <Skeleton height={320} />
      ) : !driver ? (
        <div className="muted">{t.drivers.notFound}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div className="card">
            <div className="cardBody">
              <div className="row" style={{ alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                <Avatar src={imgSrc(driver.profileImage)} name={driver.name} size={72} radius={12} />
                <div>
                  <div style={{ fontWeight: 800, fontSize: 20 }}>{driver.name}</div>
                  <div className="muted">{driver.phone}</div>
                  {driver.email ? <div className="muted">{driver.email}</div> : null}
                  <div className="row" style={{ gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                    <span className="badge" style={{ background: approvalStatusBadge(driver.approvalStatus).background }}>{approvalStatusBadge(driver.approvalStatus).label}</span>
                    <span className="badge" style={{ background: accountStatusBadge(driver.status).background }}>{accountStatusBadge(driver.status).label}</span>
                    <span className="badge" style={{ background: onlineStatusBadge(isOnline).background }}>{onlineStatusBadge(isOnline).label}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid2">
            <div className="card" style={{ boxShadow: 'none' }}>
              <div className="cardBody">
                <div className="muted">{t.drivers.rating}</div>
                <div style={{ marginTop: 8, fontWeight: 800, fontSize: 24 }}>{ratingValue}</div>
                <div className="muted" style={{ marginTop: 4, fontSize: 13 }}>{driverRatingSubtitle(t, driver.rating, driver.ratingCount)}</div>
              </div>
            </div>
            <div className="card" style={{ boxShadow: 'none' }}>
              <div className="cardBody">
                <div className="muted">{t.drivers.totalDeliveries}</div>
                <div style={{ marginTop: 8, fontWeight: 800, fontSize: 24 }}>{driver.totalDeliveries ?? 0}</div>
              </div>
            </div>
            <div className="card" style={{ boxShadow: 'none' }}>
              <div className="cardBody">
                <div className="muted">{t.drivers.totalEarnings}</div>
                <div style={{ marginTop: 8, fontWeight: 800, fontSize: 24 }}>{formatMoney(driver.totalEarnings ?? 0)}</div>
              </div>
            </div>
            <div className="card" style={{ boxShadow: 'none' }}>
              <div className="cardBody">
                <div className="muted">{t.drivers.vehicle}</div>
                <div style={{ marginTop: 8 }}>{formatVehicleType(driver.vehicleType)} {driver.vehiclePlate ? `(${driver.vehiclePlate})` : ''}</div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="cardBody">
              <div className="muted" style={{ marginBottom: 8 }}>{t.drivers.liveLocation}</div>
              {location ? (
                <>
                  <div className="muted" style={{ fontSize: 13 }}>{isOnline ? t.common.onlineYes : t.common.onlineNo}</div>
                  {location.lastLocationAt ? <div className="muted" style={{ fontSize: 12 }}>{formatT(t.common.updated, { date: formatDateTime(location.lastLocationAt) })}</div> : null}
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
                <div className="muted">{t.drivers.blockReason}</div>
                <div style={{ marginTop: 6 }}>{driver.blockReason}</div>
              </div>
            </div>
          ) : null}

          <DriverKycCard
            driver={driver}
            approveLoading={approveLoading}
            onApprove={
              driver.kycStatus === 'pending'
                ? async () => {
                    setApproveLoading(true);
                    try {
                      await approveDriver(driver._id);
                      toast.push({ title: t.drivers.approveSuccess, variant: 'success' });
                      refreshDriver();
                    } catch (e: unknown) {
                      toast.push({ title: t.drivers.approveFailed, description: e instanceof Error ? e.message : t.common.error, variant: 'danger' });
                    } finally {
                      setApproveLoading(false);
                    }
                  }
                : undefined
            }
            onReject={driver.kycStatus === 'pending' ? () => setRejectOpen(true) : undefined}
          />

          <div className="card">
            <div className="cardBody">
              <div style={{ fontWeight: 800 }}>{t.drivers.orderHistory}</div>
              <div className="muted" style={{ fontSize: 14 }}>{formatT(t.common.totalCount, { total: ordersPagination.total })}</div>
              <div className="divider" />
              {ordersLoading && orders.length === 0 ? (
                <Skeleton height={120} />
              ) : orders.length === 0 ? (
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
                    <span className="muted">{formatT(t.common.pageOfShort, { page: ordersPagination.page, totalPages: ordersPagination.totalPages })}</span>
                    <div className="row">
                      <button className="btn" disabled={!ordersPagination.hasPrev || ordersLoading} onClick={() => fetchOrders(ordersPagination.page - 1)}>{t.common.prev}</button>
                      <button className="btn" disabled={!ordersPagination.hasNext || ordersLoading} onClick={() => fetchOrders(ordersPagination.page + 1)}>{t.common.next}</button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <RejectDriverModal
        open={rejectOpen}
        driverName={driver?.name ?? ''}
        onClose={() => setRejectOpen(false)}
        loading={rejectLoading}
        onConfirm={async (reason) => {
          if (!driver?._id) return;
          setRejectLoading(true);
          try {
            await rejectDriver(driver._id, reason);
            toast.push({ title: t.drivers.rejectSuccess, variant: 'success' });
            setRejectOpen(false);
            refreshDriver();
          } catch (e: unknown) {
            toast.push({ title: t.drivers.rejectFailed, description: e instanceof Error ? e.message : t.common.error, variant: 'danger' });
          } finally {
            setRejectLoading(false);
          }
        }}
      />
    </div>
  );
}
