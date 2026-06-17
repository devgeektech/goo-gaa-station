'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, Ban, Trash2, RefreshCcw, CheckCircle, XCircle, Users } from 'lucide-react';
import {
  searchDrivers,
  getPendingApprovals,
  getPendingCount,
  approveDriver,
  rejectDriver,
  updateDriverStatus,
  deleteDriver,
} from '@/lib/api/drivers.api';
import type { DriverListItem } from '@/lib/api/drivers.api';
import { BlockUnblockDialog } from '@/components/customers/BlockUnblockDialog';
import { RejectDriverModal } from '@/components/drivers/RejectDriverModal';
import { DeleteDriverDialog } from '@/components/drivers/DeleteDriverDialog';
import { Avatar } from '@/components/ui/Avatar';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { formatDriverRating } from '@/lib/utils/driverRating';
import { useDriverStatusBadges } from '@/lib/i18n/useStatusBadges';
import { useTranslations } from '@/lib/i18n/useTranslations';
import { formatT } from '@/lib/i18n/translations';

/** Uploads are served at `{origin}/uploads/...`, not under `/api/v1`. */
function publicFileBase(): string {
  const base = typeof process !== 'undefined' ? (process.env.NEXT_PUBLIC_API_URL ?? '') : '';
  return base.replace(/\/api\/v1\/?$/, '');
}
function imgSrc(url: string | null | undefined) {
  if (!url) return null;
  return url.startsWith('http') ? url : `${publicFileBase()}${url}`;
}

export default function DriversPage() {
  const t = useTranslations();
  const { approvalStatusBadge, onlineStatusBadge } = useDriverStatusBadges();
  const STATUS_OPTIONS = [
    { value: '', label: t.common.all },
    { value: 'active', label: t.status.account.active },
    { value: 'blocked', label: t.status.account.blocked },
    { value: 'deleted', label: t.status.account.deleted },
  ];
  const APPROVAL_OPTIONS = [
    { value: '', label: t.common.all },
    { value: 'pending', label: t.status.approval.pending },
    { value: 'approved', label: t.status.approval.approved },
    { value: 'rejected', label: t.status.approval.rejected },
  ];
  const VEHICLE_OPTIONS = [
    { value: '', label: t.common.all },
    { value: 'bike', label: t.status.vehicle.bike },
    { value: 'scooter', label: t.status.vehicle.scooter },
    { value: 'car', label: t.status.vehicle.car },
    { value: 'van', label: t.status.vehicle.van },
  ];
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState<'pending' | 'all'>('pending');
  const [pendingList, setPendingList] = useState<DriverListItem[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [allList, setAllList] = useState<DriverListItem[]>([]);
  const [allPagination, setAllPagination] = useState({ total: 0, page: 1, limit: 20, totalPages: 1, hasNext: false, hasPrev: false });
  const [filters, setFilters] = useState({ search: '', status: '', approvalStatus: '', vehicleType: '' });
  const [loadingPending, setLoadingPending] = useState(false);
  const [loadingAll, setLoadingAll] = useState(false);
  const [blockDialogOpen, setBlockDialogOpen] = useState(false);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [actionDriverId, setActionDriverId] = useState<string | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [rejectLoading, setRejectLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [approveLoadingId, setApproveLoadingId] = useState<string | null>(null);

  const goToDetail = (id: string) => router.push(`/drivers/${id}`);

  const actionDriver = actionDriverId ? (allList.find((d) => d._id === actionDriverId) ?? pendingList.find((d) => d._id === actionDriverId)) : null;

  useEffect(() => {
    if (tab === 'pending') {
      setLoadingPending(true);
      Promise.all([
        getPendingApprovals(1, 50),
        getPendingCount(),
      ])
        .then(([listRes, countRes]) => {
          setPendingList(listRes.data);
          setPendingCount(countRes.data?.count ?? 0);
        })
        .catch((e) => toast.push({ title: t.drivers.loadPendingFailed, description: e?.message ?? t.common.error, variant: 'danger' }))
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
        .catch((e) => toast.push({ title: t.drivers.loadFailed, description: e?.message ?? t.common.error, variant: 'danger' }))
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

  const handleApprove = async (id: string) => {
    setApproveLoadingId(id);
    try {
      await approveDriver(id);
      toast.push({ title: t.drivers.approveSuccess, variant: 'success' });
      setPendingList((prev) => prev.filter((d) => d._id !== id));
      setPendingCount((c) => Math.max(0, c - 1));
    } catch (e: unknown) {
      toast.push({ title: t.drivers.approveFailed, description: e instanceof Error ? e.message : t.common.error, variant: 'danger' });
    } finally {
      setApproveLoadingId(null);
    }
  };

  const handleRejectConfirm = async (reason: string) => {
    if (!actionDriverId) return;
    setRejectLoading(true);
    try {
      await rejectDriver(actionDriverId, reason);
      toast.push({ title: t.drivers.rejectSuccess, variant: 'success' });
      setRejectModalOpen(false);
      setActionDriverId(null);
      setPendingList((prev) => prev.filter((d) => d._id !== actionDriverId));
      setPendingCount((c) => Math.max(0, c - 1));
    } catch (e: unknown) {
      toast.push({ title: t.drivers.rejectFailed, description: e instanceof Error ? e.message : t.common.error, variant: 'danger' });
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
      toast.push({ title: newStatus === 'blocked' ? t.drivers.blockSuccess : t.drivers.unblockSuccess, variant: 'success' });
      setBlockDialogOpen(false);
      setActionDriverId(null);
      if (tab === 'all') fetchAllPage(allPagination.page);
    } catch (e: unknown) {
      toast.push({ title: t.common.updateFailed, description: e instanceof Error ? e.message : t.common.error, variant: 'danger' });
    } finally {
      setStatusLoading(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!actionDriverId) return;
    setDeleteLoading(true);
    try {
      await deleteDriver(actionDriverId);
      toast.push({ title: t.drivers.deleteSuccess, variant: 'success' });
      setDeleteDialogOpen(false);
      setActionDriverId(null);
      if (tab === 'all') fetchAllPage(allPagination.page);
    } catch (e: unknown) {
      toast.push({ title: t.drivers.deleteFailed, description: e instanceof Error ? e.message : t.common.error, variant: 'danger' });
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div className="row adminPageHeader" style={{ justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: 'var(--text)' }}>{t.drivers.title}</h1>
          <div className="muted" style={{ marginTop: 4 }}>{t.drivers.subtitle}</div>
        </div>
        <div className="row">
          <button className="btn" onClick={() => (tab === 'pending' ? setTab('pending') : setTab('all'))} disabled aria-hidden style={{ visibility: 'hidden' }} />
          <button className="btn btnPrimary" onClick={() => { setTab('pending'); setPendingCount(0); setLoadingPending(true); getPendingApprovals(1, 50).then((r) => { setPendingList(r.data); getPendingCount().then((c) => setPendingCount(c.data?.count ?? 0)); }).finally(() => setLoadingPending(false)); }}>
            <RefreshCcw size={18} /> {t.common.refresh}
          </button>
        </div>
      </div>

      <div className="row" style={{ gap: 8, borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
        <button
          type="button"
          className={`btn ${tab === 'pending' ? 'btnPrimary' : ''}`}
          onClick={() => setTab('pending')}
        >
          {t.drivers.tabPending} {pendingCount > 0 ? `(${pendingCount})` : ''}
        </button>
        <button
          type="button"
          className={`btn ${tab === 'all' ? 'btnPrimary' : ''}`}
          onClick={() => setTab('all')}
        >
          {t.drivers.tabAll}
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
              <EmptyState icon={<Users size={48} />} heading={t.empty.driversPending} subtext={t.empty.driversPendingSub} />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {pendingList.map((d) => (
                  <div key={d._id} className="card" style={{ boxShadow: 'none', border: '1px solid var(--border)' }}>
                    <div className="cardBody">
                      <div className="row" style={{ alignItems: 'flex-start', gap: 24, flexWrap: 'wrap' }}>
                        <div className="row" style={{ gap: 16, alignItems: 'center' }}>
                          <Avatar src={imgSrc(d.profileImage)} name={d.name} size={80} radius={8} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 800 }}>{d.name}</div>
                          <div className="muted">{d.phone}</div>
                          {d.email ? <div className="muted">{d.email}</div> : null}
                          {d.kycStatus !== 'pending' ? (
                            <div style={{ marginTop: 10 }}>
                              <span className="badge" style={{ background: 'var(--border-light)', color: 'var(--text-secondary)' }}>
                                {t.status.kyc.notSubmitted}
                              </span>
                            </div>
                          ) : null}
                          {d.kycStatus === 'pending' && d.approvalStatus === 'pending' ? (
                            <div style={{ marginTop: 10 }}>
                              <span className="badge" style={{ background: 'rgba(249, 115, 22, 0.15)', color: '#ea580c' }}>
                                {t.drivers.kycUploadedReview}
                              </span>
                              {d.kycSubmittedAt ? (
                                <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                                  {formatT(t.common.submitted, { date: new Date(d.kycSubmittedAt).toLocaleString() })}
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                          {d.kycStatus === 'pending' && d.approvalStatus !== 'pending' ? (
                            <div style={{ marginTop: 10 }}>
                              <span className="badge" style={{ background: 'rgba(249, 115, 22, 0.15)', color: '#ea580c' }}>
                                {t.drivers.kycResubmittedReview}
                              </span>
                              {d.kycSubmittedAt ? (
                                <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                                  {formatT(t.common.submitted, { date: new Date(d.kycSubmittedAt).toLocaleString() })}
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                          <button className="btn" onClick={() => goToDetail(d._id)} aria-label={t.common.view}><Eye size={18} /></button>
                          {d.kycStatus === 'pending' ? (
                            <>
                              <button className="btn btnPrimary" onClick={() => handleApprove(d._id)} disabled={approveLoadingId === d._id} aria-label={t.drivers.approve}>
                                <CheckCircle size={18} /> {approveLoadingId === d._id ? '…' : t.drivers.approve}
                              </button>
                              <button className="btn btnDanger" onClick={() => { setActionDriverId(d._id); setRejectModalOpen(true); }} aria-label={t.drivers.reject}>
                                <XCircle size={18} /> {t.drivers.reject}
                              </button>
                            </>
                          ) : null}
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
              <div className="toolbar adminToolbarResponsive">
                <div className="field" style={{ minWidth: 200 }}>
                  <div className="label">{t.common.search}</div>
                  <input className="input" value={filters.search} onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))} placeholder={t.drivers.searchPlaceholderShort} />
                </div>
                <div className="field">
                  <div className="label">{t.drivers.accountStatus}</div>
                  <select className="select" value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
                    {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div className="field">
                  <div className="label">{t.drivers.approval}</div>
                  <select className="select" value={filters.approvalStatus} onChange={(e) => setFilters((f) => ({ ...f, approvalStatus: e.target.value }))}>
                    {APPROVAL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div className="field">
                  <div className="label">{t.drivers.vehicle}</div>
                  <select className="select" value={filters.vehicleType} onChange={(e) => setFilters((f) => ({ ...f, vehicleType: e.target.value }))}>
                    {VEHICLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div className="field">
                  <button className="btn btnPrimary" onClick={() => fetchAllPage(1)}>{t.common.apply}</button>
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="cardBody">
              {loadingAll && allList.length === 0 ? (
                <div className="tableWrap">
                  <table className="adminListTable">
                    <thead>
                      <tr>
                        <th>{t.drivers.photo}</th>
                        <th>{t.common.name}</th>
                        <th>{t.common.phone}</th>
                        <th>{t.drivers.license}</th>
                        <th>{t.drivers.approval}</th>
                        {/* <th>Account Status</th> */}
                        <th>{t.drivers.onlineStatus}</th>
                        <th>{t.drivers.vehicle}</th>
                        <th>{t.drivers.rating}</th>
                        <th>{t.common.actions}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from({ length: 6 }).map((_, i) => (
                        <tr key={i}><td colSpan={9}><Skeleton height={18} /></td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : allList.length === 0 ? (
                <EmptyState icon={<Users size={48} />} heading={t.empty.drivers} />
              ) : (
                <>
              <div className="tableWrap">
                <table className="adminListTable">
                  <thead>
                    <tr>
                      <th>{t.drivers.photo}</th>
                      <th>{t.common.name}</th>
                      <th>{t.common.phone}</th>
                      <th>{t.drivers.license}</th>
                      <th>{t.drivers.approval}</th>
                      {/* <th>Account Status</th> */}
                      <th>{t.drivers.onlineStatus}</th>
                      <th>{t.drivers.vehicle}</th>
                      <th>{t.drivers.rating}</th>
                      <th>{t.common.actions}</th>
                    </tr>
                  </thead>
                  <tbody>
                      {allList.map((d) => (
                        <tr key={d._id} className="clickableRow" onClick={() => goToDetail(d._id)}>
                          <td>
                            <div className="adminTableCellCenter">
                              <Avatar src={imgSrc(d.profileImage)} name={d.name} size={36} radius={8} />
                            </div>
                          </td>
                          <td style={{ fontWeight: 700 }}>{d.name}</td>
                          <td>{d.phone}</td>
                          <td>
                            {imgSrc(d.licenseImage) ? (
                              <img
                                src={imgSrc(d.licenseImage)!}
                                alt=""
                                style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'cover' }}
                              />
                            ) : (
                              <span className="muted">—</span>
                            )}
                          </td>
                          <td>
                            <span className="badge" style={{ background: approvalStatusBadge(d.approvalStatus).background }}>{approvalStatusBadge(d.approvalStatus).label}</span>
                          </td>
                          {/* <td>
                            <span className="badge" style={{ background: accountStatusBadge(d.status).background }}>{accountStatusBadge(d.status).label}</span>
                          </td> */}
                          <td>
                            <span className="badge" style={{ background: onlineStatusBadge(d.isOnline).background }}>
                              {onlineStatusBadge(d.isOnline).label}
                            </span>
                          </td>
                          <td className="muted">{(() => {
                            const vt = d.vehicleType?.toLowerCase();
                            const key = vt as keyof typeof t.status.vehicle;
                            return vt && key in t.status.vehicle ? t.status.vehicle[key] : (d.vehicleType ?? '—');
                          })()}</td>
                          <td>{formatDriverRating(d.rating, d.ratingCount).value}</td>
                          <td onClick={(e) => e.stopPropagation()}>
                            <div className="row adminTableActions" style={{ gap: 6 }}>
                              <button className="btn" onClick={() => goToDetail(d._id)} aria-label={t.common.view}><Eye size={16} /></button>
                              {d.status !== 'deleted' && d.approvalStatus === 'approved' && (
                                <button className="btn" onClick={() => { setActionDriverId(d._id); setBlockDialogOpen(true); }} aria-label={d.status === 'blocked' ? t.customers.unblock : t.customers.block}><Ban size={16} /></button>
                              )}
                              <button className="btn" onClick={() => { setActionDriverId(d._id); setDeleteDialogOpen(true); }} aria-label={t.common.delete} disabled={d.status === 'deleted'}><Trash2 size={16} /></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              <div className="row adminPaginationRow" style={{ justifyContent: 'space-between', marginTop: 12, alignItems: 'center' }}>
                <div className="muted">{formatT(t.common.pageOf, { page: allPagination.page, totalPages: allPagination.totalPages, total: allPagination.total })}</div>
                <div className="row">
                  <button className="btn" disabled={!allPagination.hasPrev || loadingAll} onClick={() => fetchAllPage(allPagination.page - 1)}>{t.common.prev}</button>
                  <button className="btn" disabled={!allPagination.hasNext || loadingAll} onClick={() => fetchAllPage(allPagination.page + 1)}>{t.common.next}</button>
                </div>
              </div>
                </>
              )}
            </div>
          </div>
        </>
      )}

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
        driverName={actionDriver?.name ?? ''}
        onClose={() => { setRejectModalOpen(false); setActionDriverId(null); }}
        onConfirm={handleRejectConfirm}
        loading={rejectLoading}
      />
      <DeleteDriverDialog
        open={deleteDialogOpen}
        driverName={actionDriver?.name ?? ''}
        onClose={() => { setDeleteDialogOpen(false); setActionDriverId(null); }}
        onConfirm={handleDeleteConfirm}
        loading={deleteLoading}
      />
    </div>
  );
}
