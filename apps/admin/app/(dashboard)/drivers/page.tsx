'use client';

import { useEffect, useState } from 'react';
import { Eye, Ban, Trash2, RefreshCcw, CheckCircle, XCircle, Users } from 'lucide-react';
import {
  searchDrivers,
  getPendingCount,
  getDriver,
  getDriverLocation,
  getDriverOrders,
  approveDriver,
  rejectDriver,
  updateDriverStatus,
  deleteDriver,
} from '@/lib/api/drivers.api';
import type { DriverListItem, DriverDetail, DriverOrderItem } from '@/lib/api/drivers.api';
import { BlockUnblockDialog } from '@/components/customers/BlockUnblockDialog';
import { RejectDriverModal } from '@/components/drivers/RejectDriverModal';
import { DeleteDriverDialog } from '@/components/drivers/DeleteDriverDialog';
import { DriverDetailDrawer } from '@/components/drivers/DriverDetailDrawer';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';

const STATUS_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'deleted', label: 'Deleted' },
];

const APPROVAL_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
];

const VEHICLE_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'bike', label: 'Bike' },
  { value: 'scooter', label: 'Scooter' },
  { value: 'car', label: 'Car' },
  { value: 'van', label: 'Van' },
];

const IMG_BASE = typeof process !== 'undefined' ? (process.env.NEXT_PUBLIC_API_URL ?? '') : '';
function imgSrc(url: string | null | undefined) {
  if (!url) return null;
  return url.startsWith('http') ? url : `${IMG_BASE}${url}`;
}

export default function DriversPage() {
  const toast = useToast();
  const [tab, setTab] = useState<'pending' | 'all'>('pending');
  const [pendingList, setPendingList] = useState<DriverListItem[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [allList, setAllList] = useState<DriverListItem[]>([]);
  const [allPagination, setAllPagination] = useState({ total: 0, page: 1, limit: 20, totalPages: 1, hasNext: false, hasPrev: false });
  const [filters, setFilters] = useState({ search: '', status: '', approvalStatus: '', vehicleType: '' });
  const [loadingPending, setLoadingPending] = useState(false);
  const [loadingAll, setLoadingAll] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState<DriverDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [driverLocation, setDriverLocation] = useState<{ liveLocation?: { coordinates?: number[] }; lastLocationAt?: string; isOnline?: boolean } | null>(null);
  const [driverOrders, setDriverOrders] = useState<DriverOrderItem[]>([]);
  const [driverOrdersPagination, setDriverOrdersPagination] = useState({ total: 0, page: 1, totalPages: 1, hasNext: false, hasPrev: false });
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [blockDialogOpen, setBlockDialogOpen] = useState(false);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [actionDriverId, setActionDriverId] = useState<string | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [rejectLoading, setRejectLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [approveLoadingId, setApproveLoadingId] = useState<string | null>(null);

  const actionDriver = actionDriverId ? (allList.find((d) => d._id === actionDriverId) ?? pendingList.find((d) => d._id === actionDriverId)) : null;

  useEffect(() => {
    if (tab === 'pending') {
      setLoadingPending(true);
      Promise.all([
        searchDrivers({ approvalStatus: 'pending', page: 1, limit: 50 }),
        getPendingCount(),
      ])
        .then(([listRes, countRes]) => {
          setPendingList(listRes.data);
          setPendingCount(countRes.data?.count ?? 0);
        })
        .catch((e) => toast.push({ title: 'Failed to load pending', description: e?.message ?? 'Error', variant: 'danger' }))
        .finally(() => setLoadingPending(false));
    }
  }, [tab]);

  useEffect(() => {
    if (tab === 'all') {
      setLoadingAll(true);
      searchDrivers({
        page: 1,
        limit: 20,
        search: filters.search || undefined,
        status: filters.status || undefined,
        approvalStatus: filters.approvalStatus || undefined,
        vehicleType: filters.vehicleType || undefined,
      })
        .then((res) => {
          setAllList(res.data);
          setAllPagination({
            total: res.total ?? 0,
            page: res.page ?? 1,
            limit: res.limit ?? 20,
            totalPages: res.totalPages ?? 1,
            hasNext: res.hasNext ?? false,
            hasPrev: res.hasPrev ?? false,
          });
        })
        .catch((e) => toast.push({ title: 'Failed to load drivers', description: e?.message ?? 'Error', variant: 'danger' }))
        .finally(() => setLoadingAll(false));
    }
  }, [tab, filters.search, filters.status, filters.approvalStatus, filters.vehicleType]);

  const fetchAllPage = (page: number) => {
    setLoadingAll(true);
    searchDrivers({
      page,
      limit: 20,
      search: filters.search || undefined,
      status: filters.status || undefined,
      approvalStatus: filters.approvalStatus || undefined,
      vehicleType: filters.vehicleType || undefined,
    })
      .then((res) => {
        setAllList(res.data);
        setAllPagination({
          total: res.total ?? 0,
          page: res.page ?? 1,
          limit: res.limit ?? 20,
          totalPages: res.totalPages ?? 1,
          hasNext: res.hasNext ?? false,
          hasPrev: res.hasPrev ?? false,
        });
      })
      .finally(() => setLoadingAll(false));
  };

  const openDetail = (id: string) => {
    setSelectedDriver(null);
    setDriverLocation(null);
    setDriverOrders([]);
    setDetailOpen(true);
    getDriver(id).then((res) => setSelectedDriver(res.data)).catch(() => setSelectedDriver(null));
  };

  const fetchLocation = () => {
    if (!selectedDriver?._id) return;
    getDriverLocation(selectedDriver._id).then((res) => setDriverLocation(res.data)).catch(() => setDriverLocation(null));
  };

  const fetchOrders = (page?: number) => {
    if (!selectedDriver?._id) return;
    setOrdersLoading(true);
    getDriverOrders(selectedDriver._id, page ?? 1, 10)
      .then((res) => {
        setDriverOrders(res.data ?? []);
        setDriverOrdersPagination({
          total: res.total ?? 0,
          page: res.page ?? 1,
          totalPages: res.totalPages ?? 1,
          hasNext: res.hasNext ?? false,
          hasPrev: res.hasPrev ?? false,
        });
      })
      .finally(() => setOrdersLoading(false));
  };

  const handleApprove = async (id: string) => {
    setApproveLoadingId(id);
    try {
      await approveDriver(id);
      toast.push({ title: 'Driver approved', variant: 'success' });
      setPendingList((prev) => prev.filter((d) => d._id !== id));
      setPendingCount((c) => Math.max(0, c - 1));
    } catch (e: unknown) {
      toast.push({ title: 'Approve failed', description: e instanceof Error ? e.message : 'Error', variant: 'danger' });
    } finally {
      setApproveLoadingId(null);
    }
  };

  const handleRejectConfirm = async (reason: string) => {
    if (!actionDriverId) return;
    setRejectLoading(true);
    try {
      await rejectDriver(actionDriverId, reason);
      toast.push({ title: 'Driver rejected', variant: 'success' });
      setRejectModalOpen(false);
      setActionDriverId(null);
      setPendingList((prev) => prev.filter((d) => d._id !== actionDriverId));
      setPendingCount((c) => Math.max(0, c - 1));
    } catch (e: unknown) {
      toast.push({ title: 'Reject failed', description: e instanceof Error ? e.message : 'Error', variant: 'danger' });
    } finally {
      setRejectLoading(false);
    }
  };

  const handleBlockUnblockConfirm = async (reason: string) => {
    if (!actionDriverId) return;
    const d = allList.find((x) => x._id === actionDriverId) ?? actionDriver;
    setStatusLoading(true);
    const newStatus = d?.status === 'blocked' ? 'active' : 'blocked';
    try {
      await updateDriverStatus(actionDriverId, newStatus, reason || undefined);
      toast.push({ title: newStatus === 'blocked' ? 'Driver blocked' : 'Driver unblocked', variant: 'success' });
      setBlockDialogOpen(false);
      setActionDriverId(null);
      if (tab === 'all') fetchAllPage(allPagination.page);
    } catch (e: unknown) {
      toast.push({ title: 'Update failed', description: e instanceof Error ? e.message : 'Error', variant: 'danger' });
    } finally {
      setStatusLoading(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!actionDriverId) return;
    setDeleteLoading(true);
    try {
      await deleteDriver(actionDriverId);
      toast.push({ title: 'Driver deleted', variant: 'success' });
      setDeleteDialogOpen(false);
      setActionDriverId(null);
      setDetailOpen(false);
      if (tab === 'all') fetchAllPage(allPagination.page);
    } catch (e: unknown) {
      toast.push({ title: 'Delete failed', description: e instanceof Error ? e.message : 'Error', variant: 'danger' });
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: 'var(--text)' }}>Drivers</h1>
          <div className="muted" style={{ marginTop: 4 }}>Pending approvals and all drivers.</div>
        </div>
        <div className="row">
          <button className="btn" onClick={() => (tab === 'pending' ? setTab('pending') : setTab('all'))} disabled aria-hidden style={{ visibility: 'hidden' }} />
          <button className="btn btnPrimary" onClick={() => { setTab('pending'); setPendingCount(0); setLoadingPending(true); searchDrivers({ approvalStatus: 'pending' }).then((r) => { setPendingList(r.data); getPendingCount().then((c) => setPendingCount(c.data?.count ?? 0)); }).finally(() => setLoadingPending(false)); }}>
            <RefreshCcw size={18} /> Refresh
          </button>
        </div>
      </div>

      <div className="row" style={{ gap: 8, borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
        <button
          type="button"
          className={`btn ${tab === 'pending' ? 'btnPrimary' : ''}`}
          onClick={() => setTab('pending')}
        >
          Pending Approvals {pendingCount > 0 ? `(${pendingCount})` : ''}
        </button>
        <button
          type="button"
          className={`btn ${tab === 'all' ? 'btnPrimary' : ''}`}
          onClick={() => setTab('all')}
        >
          All Drivers
        </button>
      </div>

      {tab === 'pending' ? (
        <div className="card">
          <div className="cardBody">
            {loadingPending && pendingList.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <Skeleton height={120} />
                <Skeleton height={120} />
              </div>
            ) : pendingList.length === 0 ? (
              <EmptyState icon={<Users size={48} />} heading="No pending approvals" subtext="All driver applications are processed." />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {pendingList.map((d) => (
                  <div key={d._id} className="card" style={{ boxShadow: 'none', border: '1px solid var(--border)' }}>
                    <div className="cardBody">
                      <div className="row" style={{ alignItems: 'flex-start', gap: 24, flexWrap: 'wrap' }}>
                        <div className="row" style={{ gap: 16, alignItems: 'center' }}>
                          <div>
                            <div className="muted" style={{ fontSize: 11 }}>Profile</div>
                            {imgSrc(d.profileImage) ? (
                              <img src={imgSrc(d.profileImage)!} alt="" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8 }} />
                            ) : (
                              <div style={{ width: 80, height: 80, borderRadius: 8, background: 'var(--border-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>No photo</div>
                            )}
                          </div>
                          <div>
                            <div className="muted" style={{ fontSize: 11 }}>License</div>
                            {imgSrc(d.licenseImage) ? (
                              <img src={imgSrc(d.licenseImage)!} alt="" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8 }} />
                            ) : (
                              <div style={{ width: 80, height: 80, borderRadius: 8, background: 'var(--border-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>No photo</div>
                            )}
                          </div>
                        </div>
                        <div style={{ flex: 1, minWidth: 200 }}>
                          <div style={{ fontWeight: 800 }}>{d.name}</div>
                          <div className="muted">{d.phone}</div>
                          {d.email ? <div className="muted">{d.email}</div> : null}
                        </div>
                        <div className="row" style={{ gap: 8 }}>
                          <button className="btn" onClick={() => openDetail(d._id)} aria-label="View"><Eye size={18} /></button>
                          <button className="btn btnPrimary" onClick={() => handleApprove(d._id)} disabled={approveLoadingId === d._id} aria-label="Approve">
                            <CheckCircle size={18} /> {approveLoadingId === d._id ? '…' : 'Approve'}
                          </button>
                          <button className="btn btnDanger" onClick={() => { setActionDriverId(d._id); setRejectModalOpen(true); }} aria-label="Reject">
                            <XCircle size={18} /> Reject
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="card">
            <div className="cardBody">
              <div className="toolbar">
                <div className="field" style={{ minWidth: 200 }}>
                  <div className="label">Search</div>
                  <input className="input" value={filters.search} onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))} placeholder="Name, phone, email" />
                </div>
                <div className="field">
                  <div className="label">Status</div>
                  <select className="select" value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
                    {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div className="field">
                  <div className="label">Approval</div>
                  <select className="select" value={filters.approvalStatus} onChange={(e) => setFilters((f) => ({ ...f, approvalStatus: e.target.value }))}>
                    {APPROVAL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div className="field">
                  <div className="label">Vehicle</div>
                  <select className="select" value={filters.vehicleType} onChange={(e) => setFilters((f) => ({ ...f, vehicleType: e.target.value }))}>
                    {VEHICLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div className="field">
                  <button className="btn btnPrimary" onClick={() => fetchAllPage(1)}>Apply</button>
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="cardBody">
              {loadingAll && allList.length === 0 ? (
                <div className="tableWrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Phone</th>
                        <th>Approval</th>
                        <th>Status</th>
                        <th>Vehicle</th>
                        <th>Rating</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from({ length: 6 }).map((_, i) => (
                        <tr key={i}><td colSpan={7}><Skeleton height={18} /></td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : allList.length === 0 ? (
                <EmptyState icon={<Users size={48} />} heading="No drivers found" subtext="Try adjusting search or filters." />
              ) : (
                <>
              <div className="tableWrap">
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Phone</th>
                      <th>Approval</th>
                      <th>Status</th>
                      <th>Vehicle</th>
                      <th>Rating</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                      {allList.map((d) => (
                        <tr key={d._id} className="clickableRow" onClick={() => openDetail(d._id)}>
                          <td style={{ fontWeight: 700 }}>{d.name}</td>
                          <td>{d.phone}</td>
                          <td>
                            <span className="badge" style={{ background: d.approvalStatus === 'approved' ? 'var(--success-light)' : d.approvalStatus === 'rejected' ? 'var(--danger-light)' : 'var(--warning-light)' }}>{d.approvalStatus}</span>
                          </td>
                          <td>
                            <span className="badge" style={{ background: d.status === 'blocked' ? 'var(--danger-light)' : d.status === 'deleted' ? 'var(--warning-light)' : 'var(--success-light)' }}>{d.status}</span>
                          </td>
                          <td className="muted">{d.vehicleType ?? '—'}</td>
                          <td>{d.rating != null ? Number(d.rating).toFixed(1) : '—'}</td>
                          <td onClick={(e) => e.stopPropagation()}>
                            <div className="row" style={{ gap: 6 }}>
                              <button className="btn" onClick={() => openDetail(d._id)} aria-label="View"><Eye size={16} /></button>
                              {d.status !== 'deleted' && d.approvalStatus === 'approved' && (
                                <button className="btn" onClick={() => { setActionDriverId(d._id); setBlockDialogOpen(true); }} aria-label={d.status === 'blocked' ? 'Unblock' : 'Block'}><Ban size={16} /></button>
                              )}
                              <button className="btn" onClick={() => { setActionDriverId(d._id); setDeleteDialogOpen(true); }} aria-label="Delete" disabled={d.status === 'deleted'}><Trash2 size={16} /></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              <div className="row" style={{ justifyContent: 'space-between', marginTop: 12, alignItems: 'center' }}>
                <div className="muted">Page {allPagination.page} / {allPagination.totalPages} • Total {allPagination.total}</div>
                <div className="row">
                  <button className="btn" disabled={!allPagination.hasPrev || loadingAll} onClick={() => fetchAllPage(allPagination.page - 1)}>Prev</button>
                  <button className="btn" disabled={!allPagination.hasNext || loadingAll} onClick={() => fetchAllPage(allPagination.page + 1)}>Next</button>
                </div>
              </div>
                </>
              )}
            </div>
          </div>
        </>
      )}

      <DriverDetailDrawer
        open={detailOpen}
        driver={selectedDriver}
        location={driverLocation}
        orders={driverOrders}
        ordersLoading={ordersLoading}
        ordersPagination={driverOrdersPagination}
        onClose={() => { setDetailOpen(false); setSelectedDriver(null); setDriverLocation(null); }}
        onFetchLocation={fetchLocation}
        onFetchOrders={(page) => selectedDriver && fetchOrders(page)}
      />
      <BlockUnblockDialog
        open={blockDialogOpen}
        type="driver"
        currentStatus={actionDriver?.status ?? 'active'}
        currentReason={actionDriver?.blockReason ?? undefined}
        onClose={() => { setBlockDialogOpen(false); setActionDriverId(null); }}
        onConfirm={handleBlockUnblockConfirm}
        loading={statusLoading}
      />
      <RejectDriverModal
        open={rejectModalOpen}
        driverName={actionDriver?.name}
        onClose={() => { setRejectModalOpen(false); setActionDriverId(null); }}
        onConfirm={handleRejectConfirm}
        loading={rejectLoading}
      />
      <DeleteDriverDialog
        open={deleteDialogOpen}
        driverName={actionDriver?.name}
        onClose={() => { setDeleteDialogOpen(false); setActionDriverId(null); }}
        onConfirm={handleDeleteConfirm}
        loading={deleteLoading}
      />
    </div>
  );
}
