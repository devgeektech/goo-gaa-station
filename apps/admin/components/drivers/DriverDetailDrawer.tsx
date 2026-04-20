'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';
import type { DriverDetail, DriverOrderItem } from '@/lib/api/drivers.api';
import { approveDriver, rejectDriver } from '@/lib/api/drivers.api';
import { DriverKycCard } from '@/components/drivers/DriverKycCard';
import { RejectDriverModal } from '@/components/drivers/RejectDriverModal';
import { formatMoney, formatDateTime } from '@/lib/utils/format';
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

  const coords = location?.liveLocation?.coordinates;
  const mapsUrl = coords && coords.length >= 2
    ? `https://www.google.com/maps?q=${coords[1]},${coords[0]}`
    : null;

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
                  <div className="row" style={{ gap: 8, marginTop: 8 }}>
                    <span className="badge" style={{ background: driver.approvalStatus === 'approved' ? 'var(--success-light)' : driver.approvalStatus === 'rejected' ? 'var(--danger-light)' : 'var(--warning-light)' }}>{driver.approvalStatus}</span>
                    <span className="badge" style={{ background: driver.status === 'blocked' ? 'var(--danger-light)' : driver.status === 'deleted' ? 'var(--warning-light)' : 'var(--success-light)' }}>{driver.status}</span>
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <Link href={`/drivers/${driver._id}`} className="btn" style={{ fontSize: 13 }}>View full page</Link>
                  </div>
                </div>
              </div>

              <div className="card" style={{ boxShadow: 'none' }}>
                <div className="cardBody">
                  <div className="muted" style={{ marginBottom: 8 }}>Photos</div>
                  <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
                    {imgSrc(driver.profileImage) && <div><img src={imgSrc(driver.profileImage)!} alt="Profile" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8 }} /></div>}
                    {imgSrc(driver.licenseImage) && <div><div className="muted" style={{ fontSize: 11 }}>License</div><img src={imgSrc(driver.licenseImage)!} alt="License" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8 }} /></div>}
                    {imgSrc(driver.vehicleImage) && <div><div className="muted" style={{ fontSize: 11 }}>Vehicle</div><img src={imgSrc(driver.vehicleImage)!} alt="Vehicle" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8 }} /></div>}
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
                    <div style={{ marginTop: 6, fontWeight: 800 }}>{driver.rating != null ? Number(driver.rating).toFixed(1) : '—'}</div>
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
                  {location ? (
                    <div style={{ marginTop: 8 }}>
                      <div className="muted" style={{ fontSize: 13 }}>Online: {location.isOnline ? 'Yes' : 'No'}</div>
                      {coords && coords.length >= 2 ? (
                        <a href={mapsUrl!} target="_blank" rel="noopener noreferrer" className="btn" style={{ marginTop: 8 }}>
                          View on map ({coords[1].toFixed(4)}, {coords[0].toFixed(4)})
                        </a>
                      ) : (
                        <div className="muted" style={{ marginTop: 8 }}>No location yet</div>
                      )}
                      {location.lastLocationAt ? <div className="muted" style={{ fontSize: 12 }}>Updated {formatDateTime(location.lastLocationAt)}</div> : null}
                    </div>
                  ) : (
                    <div style={{ marginTop: 8 }}><Skeleton height={40} /></div>
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
