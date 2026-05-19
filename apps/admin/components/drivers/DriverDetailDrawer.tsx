'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';
import type { DriverDetail, DriverOrderItem } from '@/lib/api/drivers.api';
import { approveDriver, rejectDriver } from '@/lib/api/drivers.api';
import { DriverKycCard } from '@/components/drivers/DriverKycCard';
import { RejectDriverModal } from '@/components/drivers/RejectDriverModal';
import { formatMoney, formatDateTime } from '@/lib/utils/format';
import { accountStatusBadge, approvalStatusBadge, onlineStatusBadge } from '@/lib/utils/driverStatus';
import { formatDriverRating } from '@/lib/utils/driverRating';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';

/** Uploads are served at `{origin}/uploads/...`, not under `/api/v1`. */
function publicFileBase(): string {
  const base = typeof process !== 'undefined' ? (process.env.NEXT_PUBLIC_API_URL ?? '') : '';
  return base.replace(/\/api\/v1\/?$/, '');
}

function imgSrc(url: string | null | undefined) {
  if (!url) return null;
  return url.startsWith('http') ? url : `${publicFileBase()}${url}`;
}

export function DriverDetailDrawer({
  open,
  driver,
  location,
  orders,
  ordersLoading,
  ordersPagination,
  onClose,
  onFetchLocation,
  onFetchOrders,
  onRefreshDriver,
}: {
  open: boolean;
  driver: DriverDetail | null;
  location: { liveLocation?: { coordinates?: number[] } | null; lastLocationAt?: string | null; isOnline?: boolean } | null;
  orders: DriverOrderItem[];
  ordersLoading: boolean;
  ordersPagination: { page: number; totalPages: number; hasNext: boolean; hasPrev: boolean; total: number };
  onClose: () => void;
  onFetchLocation: () => void;
  onFetchOrders: (page?: number) => void;
  /** Refetch driver detail after KYC approve/reject */
  onRefreshDriver?: () => void;
}) {
  const toast = useToast();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [approveLoading, setApproveLoading] = useState(false);
  const [rejectLoading, setRejectLoading] = useState(false);

  useEffect(() => {
    if (open && driver?._id) {
      onFetchLocation();
      onFetchOrders(1);
    }
  }, [open, driver?._id]);

  useEffect(() => {
    if (!open) {
      setRejectOpen(false);
      setApproveLoading(false);
      setRejectLoading(false);
    }
  }, [open]);

  if (!open) return null;

  const coords =
    location?.liveLocation?.coordinates ?? driver?.liveLocation?.coordinates;
  const mapsUrl = coords && coords.length >= 2
    ? `https://www.google.com/maps?q=${coords[1]},${coords[0]}`
    : null;

  const isOnline = driver?.isOnline === true;
  const approvalBadge = driver ? approvalStatusBadge(driver.approvalStatus) : null;
  const accountBadge = driver ? accountStatusBadge(driver.status) : null;
  const onlineBadge = onlineStatusBadge(isOnline);

  return (
    <div
      className="modalOverlay"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
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
          <div className="modalTitle">Driver Detail</div>
          <button type="button" className="btn" onClick={onClose} aria-label="Close">
            <X size={18} aria-hidden />
          </button>
        </div>
        <div className="modalBody" style={{ overflow: 'auto', flex: 1 }}>
          {!driver ? (
            <Skeleton height={200} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div className="row" style={{ alignItems: 'center', gap: 16 }}>
                {imgSrc(driver.profileImage) ? (
                  <img src={imgSrc(driver.profileImage)!} alt="" style={{ width: 72, height: 72, borderRadius: 12, objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: 72, height: 72, borderRadius: 12, background: 'var(--border-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>No photo</div>
                )}
                <div>
                  <div style={{ fontWeight: 800, fontSize: 18 }}>{driver.name}</div>
                  <div className="muted">{driver.phone}</div>
                  {driver.email ? <div className="muted">{driver.email}</div> : null}
                  <div className="row" style={{ gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                    <span className="badge" style={{ background: approvalBadge!.background }}>{approvalBadge!.label}</span>
                    <span className="badge" style={{ background: accountBadge!.background }}>{accountBadge!.label}</span>
                    <span className="badge" style={{ background: onlineBadge.background }}>{onlineBadge.label}</span>
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <Link href={`/drivers/${driver._id}`} className="btn" style={{ fontSize: 13 }}>View full page</Link>
                  </div>
                </div>
              </div>


              <div className="grid2">
                <div className="card" style={{ boxShadow: 'none' }}>
                  <div className="cardBody">
                    <div className="muted">Vehicle</div>
                    <div style={{ marginTop: 6 }}>{driver.vehicleType ?? '—'} {driver.vehiclePlate ? `(${driver.vehiclePlate})` : ''}</div>
                  </div>
                </div>
                <div className="card" style={{ boxShadow: 'none' }}>
                  <div className="cardBody">
                    <div className="muted">Rating</div>
                    {(() => {
                      const { value, subtitle } = formatDriverRating(driver.rating, driver.ratingCount);
                      return (
                        <>
                          <div style={{ marginTop: 6, fontWeight: 800 }}>{value}</div>
                          <div className="muted" style={{ marginTop: 4, fontSize: 12 }}>{subtitle}</div>
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>

              <div className="card" style={{ boxShadow: 'none' }}>
                <div className="cardBody">
                  <div className="muted">Delivery stats</div>
                  <div className="row" style={{ marginTop: 8, gap: 16 }}>
                    <div><span style={{ fontWeight: 800 }}>{driver.totalDeliveries ?? 0}</span> <span className="muted">deliveries</span></div>
                    <div><span style={{ fontWeight: 800 }}>{formatMoney(driver.totalEarnings ?? 0)}</span> <span className="muted">earnings</span></div>
                  </div>
                </div>
              </div>

              <div className="card" style={{ boxShadow: 'none' }}>
                <div className="cardBody">
                  <div className="muted">Current location</div>
                  <div style={{ marginTop: 8 }}>
                    <div className="muted" style={{ fontSize: 13 }}>Online: {isOnline ? 'Yes' : 'No'}</div>
                    <div className="muted" style={{ fontSize: 13 }}>Available for orders: {driver.isAvailable ? 'Yes' : 'No'}</div>
                    {!location ? <div style={{ marginTop: 8 }}><Skeleton height={24} /></div> : null}
                    {coords && coords.length >= 2 ? (
                      <a href={mapsUrl!} target="_blank" rel="noopener noreferrer" className="btn" style={{ marginTop: 8 }}>
                        View on map ({coords[1].toFixed(4)}, {coords[0].toFixed(4)})
                      </a>
                    ) : location ? (
                      <div className="muted" style={{ marginTop: 8 }}>No location yet</div>
                    ) : null}
                    {(location?.lastLocationAt ?? driver.lastLocationAt) ? (
                      <div className="muted" style={{ fontSize: 12 }}>
                        Updated {formatDateTime(String(location?.lastLocationAt ?? driver.lastLocationAt))}
                      </div>
                    ) : null}
                  </div>
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

              <DriverKycCard
                driver={driver}
                approveLoading={approveLoading}
                onApprove={
                  driver.kycStatus === 'pending'
                    ? async () => {
                        setApproveLoading(true);
                        try {
                          await approveDriver(driver._id);
                          toast.push({ title: 'Driver approved', variant: 'success' });
                          onRefreshDriver?.();
                        } catch (e: unknown) {
                          toast.push({
                            title: 'Approve failed',
                            description: e instanceof Error ? e.message : 'Error',
                            variant: 'danger',
                          });
                        } finally {
                          setApproveLoading(false);
                        }
                      }
                    : undefined
                }
                onReject={driver.kycStatus === 'pending' ? () => setRejectOpen(true) : undefined}
              />

              <div className="card" style={{ boxShadow: 'none' }}>
                <div className="cardBody">
                  <div style={{ fontWeight: 800 }}>Order history</div>
                  <div className="muted" style={{ fontSize: 13 }}>Total {ordersPagination.total}</div>
                  <div className="divider" />
                  {ordersLoading && orders.length === 0 ? (
                    <Skeleton height={100} />
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
            toast.push({ title: 'Driver rejected', variant: 'success' });
            setRejectOpen(false);
            onRefreshDriver?.();
          } catch (e: unknown) {
            toast.push({
              title: 'Reject failed',
              description: e instanceof Error ? e.message : 'Error',
              variant: 'danger',
            });
          } finally {
            setRejectLoading(false);
          }
        }}
      />
    </div>
  );
}
