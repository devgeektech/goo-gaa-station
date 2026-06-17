'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, Pencil, Ban, Trash2, RefreshCcw, Store, Plus } from 'lucide-react';
import { listVendors, blockVendor, deleteVendor } from '@/lib/api/vendors.api';
import type { VendorListItem } from '@/lib/api/vendors.api';
import { AddVendorModal } from '@/components/vendors/AddVendorModal';
import { EditVendorDrawer } from '@/components/vendors/EditVendorDrawer';
import { BlockUnblockDialog } from '@/components/customers/BlockUnblockDialog';
import { DeleteVendorDialog } from '@/components/vendors/DeleteVendorDialog';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { useVendorPending } from '@/lib/context/VendorPendingContext';
import { getErrorMessage } from '@/lib/api/client';
import { formatMoney } from '@/lib/utils/format';
import { useVendorStatusBadges } from '@/lib/i18n/useStatusBadges';
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

export default function VendorsPage() {
  const t = useTranslations();
  const { approvalStatusBadge, availabilityBadge } = useVendorStatusBadges();
  const STATUS_OPTIONS = useMemo(
    () => [
      { value: '', label: t.common.all },
      { value: 'active', label: t.status.account.active },
      { value: 'blocked', label: t.status.account.blocked },
    ],
    [t]
  );
  const APPROVAL_TABS = useMemo(
    () =>
      [
        { value: '', label: t.common.all },
        { value: 'pending', label: t.status.approval.pending },
        { value: 'approved', label: t.status.approval.approved },
        { value: 'rejected', label: t.status.approval.rejected },
      ] as const,
    [t]
  );

  const router = useRouter();
  const toast = useToast();
  const { setPendingCount } = useVendorPending();
  const [items, setItems] = useState<VendorListItem[]>([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 20, totalPages: 1, hasNext: false, hasPrev: false });
  const [filters, setFilters] = useState({ search: '', status: '', approvalStatus: '' as '' | 'pending' | 'approved' | 'rejected' });
  const [loading, setLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [blockDialogOpen, setBlockDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [actionVendorId, setActionVendorId] = useState<string | null>(null);
  const [selectedVendor, setSelectedVendor] = useState<VendorListItem | null>(null);
  const [createLoading, setCreateLoading] = useState(false);
  const [updateLoading, setUpdateLoading] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const load = (page = 1) => {
    setLoading(true);
    listVendors({
      page,
      limit: 20,
      search: filters.search || undefined,
      status: filters.status || undefined,
      approvalStatus: filters.approvalStatus || undefined,
    })
      .then((res) => {
        setItems(res.data ?? []);
        setPagination({
          total: res.total ?? 0,
          page: res.page ?? 1,
          limit: res.limit ?? 20,
          totalPages: res.totalPages ?? 1,
          hasNext: res.hasNext ?? false,
          hasPrev: res.hasPrev ?? false,
        });
        if (typeof res.pendingCount === 'number') setPendingCount(res.pendingCount);
      })
      .catch((e) => toast.push({ title: t.vendors.loadFailed, description: getErrorMessage(e), variant: 'danger' }))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load(1);
  }, [filters.search, filters.status, filters.approvalStatus]);

  const actionVendor = actionVendorId ? items.find((v) => v._id === actionVendorId) ?? selectedVendor : selectedVendor;

  const handleAddSubmit = async (formData: FormData) => {
    setCreateLoading(true);
    try {
      const { createVendor } = await import('@/lib/api/vendors.api');
      await createVendor(formData);
      toast.push({ title: t.vendors.createSuccess, variant: 'success' });
      setAddOpen(false);
      load(1);
    } catch (e: unknown) {
      toast.push({ title: t.common.createFailed, description: getErrorMessage(e), variant: 'danger' });
    } finally {
      setCreateLoading(false);
    }
  };

  const handleEditSubmit = async (formData: FormData) => {
    if (!selectedVendor) return;
    setUpdateLoading(true);
    try {
      const { updateVendor } = await import('@/lib/api/vendors.api');
      await updateVendor(selectedVendor._id, formData);
      toast.push({ title: t.vendors.updateSuccess, variant: 'success' });
      setEditOpen(false);
      load(pagination.page);
    } catch (e: unknown) {
      toast.push({ title: t.common.updateFailed, description: getErrorMessage(e), variant: 'danger' });
    } finally {
      setUpdateLoading(false);
    }
  };

  const handleBlockUnblockConfirm = async (reason: string) => {
    if (!actionVendorId) return;
    setStatusLoading(true);
    try {
      await blockVendor(actionVendorId, reason || undefined);
      toast.push({ title: t.vendors.statusSuccess, variant: 'success' });
      setBlockDialogOpen(false);
      setActionVendorId(null);
      load(pagination.page);
    } catch (e: unknown) {
      toast.push({ title: t.common.updateFailed, description: getErrorMessage(e), variant: 'danger' });
    } finally {
      setStatusLoading(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!actionVendorId) return;
    setDeleteLoading(true);
    try {
      await deleteVendor(actionVendorId);
      toast.push({ title: t.vendors.deleteSuccess, variant: 'success' });
      setDeleteDialogOpen(false);
      setActionVendorId(null);
      setEditOpen(false);
      load(pagination.page);
    } catch (e: unknown) {
      toast.push({ title: t.common.deleteFailed, description: getErrorMessage(e), variant: 'danger' });
    } finally {
      setDeleteLoading(false);
    }
  };

  const openEdit = (v: VendorListItem) => {
    setSelectedVendor(v);
    setEditOpen(true);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div className="row adminPageHeader" style={{ justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: 'var(--text)' }}>{t.vendors.title}</h1>
          <div className="muted" style={{ marginTop: 4 }}>{t.vendors.subtitle}</div>
        </div>
        <div className="row">
          <button className="btn" onClick={() => load(pagination.page)} disabled={loading} aria-label={t.common.refresh}>
            <RefreshCcw size={18} aria-hidden /> {t.common.refresh}
          </button>
        </div>
      </div>

      <div className="card">
        <div className="cardBody" style={{ paddingTop: 12, paddingBottom: 12 }}>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            {APPROVAL_TABS.map((tab) => (
              <button
                key={tab.value}
                type="button"
                className="btn"
                style={{
                  background: filters.approvalStatus === tab.value ? 'var(--primary)' : 'var(--panel)',
                  color: filters.approvalStatus === tab.value ? '#fff' : 'var(--text)',
                  border: '1px solid var(--border)',
                }}
                onClick={() => setFilters((f) => ({ ...f, approvalStatus: tab.value }))}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="cardBody">
          <div className="toolbar adminToolbarResponsive">
            <div className="field" style={{ minWidth: 260 }}>
              <div className="label">{t.vendors.searchLabel}</div>
              <input
                className="input"
                value={filters.search}
                onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
                placeholder={t.vendors.searchPlaceholderShort}
              />
            </div>
            <div className="field">
              <div className="label">{t.vendors.accountStatus}</div>
              <select
                className="select"
                value={filters.status}
                onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <button className="btn btnPrimary" onClick={() => load(1)}>{t.common.apply}</button>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="cardBody">
          {loading && items.length === 0 ? (
            <div className="tableWrap">
              <table className="adminListTable">
                <thead>
                  <tr>
                    <th>{t.vendors.logo}</th>
                    <th>{t.common.name}</th>
                    <th>{t.vendors.approval}</th>
                    <th>{t.vendors.availability}</th>
                    <th>{t.vendors.rating}</th>
                    <th>{t.vendors.revenue}</th>
                    <th>{t.vendors.orders}</th>
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
          ) : items.length === 0 ? (
            <EmptyState icon={<Store size={48} />} heading={t.empty.vendors} subtext={t.empty.vendorsSub} />
          ) : (
            <div className="tableWrap">
            <table className="adminListTable">
              <thead>
                <tr>
                  <th>{t.vendors.logo}</th>
                  <th>{t.common.name}</th>
                  <th>{t.vendors.approval}</th>
                  <th>{t.vendors.availability}</th>
                  <th>{t.vendors.rating}</th>
                  <th>{t.vendors.revenue}</th>
                  <th>{t.vendors.orders}</th>
                  <th>{t.common.actions}</th>
                </tr>
              </thead>
              <tbody>
                  {items.map((v) => {
                    const ab = approvalStatusBadge(v.approvalStatus ?? null);
                    const avail = availabilityBadge(v);
                    return (
                    <tr key={v._id} className="clickableRow" onClick={() => router.push(`/vendors/${v._id}`)}>
                      <td>
                        <div className="adminTableCellCenter">
                          {imgSrc(v.logo) ? (
                            <img src={imgSrc(v.logo)!} alt="" style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover' }} />
                          ) : (
                            <div style={{ width: 40, height: 40, borderRadius: 8, background: 'var(--border-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}><Store size={20} /></div>
                          )}
                        </div>
                      </td>
                      <td style={{ fontWeight: 700 }}>{v.name}</td>
                      <td>
                        <span className="badge" style={ab.style}>{ab.label}</span>
                      </td>
                      <td title={avail.hint}>
                        <span className="badge" style={{ background: avail.background }}>{avail.label}</span>
                      </td>
                      <td className="muted">—</td>
                      <td style={{ fontWeight: 700 }}>{formatMoney(v.revenue ?? 0)}</td>
                      <td className="muted">—</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <div className="row adminTableActions" style={{ gap: 6 }}>
                          <Link href={`/vendors/${v._id}`} className="btn" aria-label={t.common.view}><Eye size={16} /></Link>
                          <button className="btn" onClick={() => openEdit(v)} aria-label={t.common.edit}><Pencil size={16} /></button>
                          {v.status !== 'deleted' && (
                            <button className="btn" onClick={() => { setActionVendorId(v._id); setBlockDialogOpen(true); }} aria-label={v.status === 'blocked' ? t.customers.unblock : t.customers.block}><Ban size={16} /></button>
                          )}
                          <button className="btn" onClick={() => { setActionVendorId(v._id); setDeleteDialogOpen(true); }} aria-label={t.common.delete} disabled={v.status === 'deleted'}><Trash2 size={16} /></button>
                        </div>
                      </td>
                    </tr>
                  ); })}
              </tbody>
            </table>
            </div>
          )}
          {items.length > 0 ? (
          <div className="row adminPaginationRow" style={{ justifyContent: 'space-between', marginTop: 12, alignItems: 'center' }}>
            <div className="muted">{formatT(t.common.pageOf, { page: pagination.page, totalPages: pagination.totalPages, total: pagination.total })}</div>
            <div className="row">
              <button className="btn" disabled={!pagination.hasPrev || loading} onClick={() => load(pagination.page - 1)}>{t.common.prev}</button>
              <button className="btn" disabled={!pagination.hasNext || loading} onClick={() => load(pagination.page + 1)}>{t.common.next}</button>
            </div>
          </div>
          ) : null}
        </div>
      </div>

      <AddVendorModal open={addOpen} onClose={() => setAddOpen(false)} onSubmit={handleAddSubmit} loading={createLoading} />
      <EditVendorDrawer open={editOpen} vendor={selectedVendor} onClose={() => { setEditOpen(false); setSelectedVendor(null); }} onSubmit={handleEditSubmit} loading={updateLoading} />
      <BlockUnblockDialog
        open={blockDialogOpen}
        type="vendor"
        currentStatus={actionVendor?.status ?? 'active'}
        currentReason={actionVendor?.blockReason ?? undefined}
        onClose={() => { setBlockDialogOpen(false); setActionVendorId(null); }}
        onConfirm={handleBlockUnblockConfirm}
        loading={statusLoading}
      />
      <DeleteVendorDialog
        open={deleteDialogOpen}
        vendorName={actionVendor?.name}
        onClose={() => { setDeleteDialogOpen(false); setActionVendorId(null); }}
        onConfirm={handleDeleteConfirm}
        loading={deleteLoading}
      />
    </div>
  );
}
