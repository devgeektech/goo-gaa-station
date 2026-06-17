'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, Pencil, Ban, Trash2, RefreshCcw, UserPlus } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
  fetchCustomers,
  fetchCustomerById,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  updateCustomerStatus,
  setFilters,
  setShowDeleted,
} from '@/store/slices/customersSlice';
import type { AddCustomerForm } from '@/components/customers/AddCustomerModal';
import { AddCustomerModal } from '@/components/customers/AddCustomerModal';
import { EditCustomerDrawer } from '@/components/customers/EditCustomerDrawer';
import { BlockUnblockDialog } from '@/components/customers/BlockUnblockDialog';
import { DeleteCustomerDialog } from '@/components/customers/DeleteCustomerDialog';
import { Avatar } from '@/components/ui/Avatar';
import { Skeleton } from '@/components/ui/Skeleton';
import { Switch } from '@/components/ui/Switch';
import { useToast } from '@/components/ui/Toast';
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

export default function CustomersPage() {
  const t = useTranslations();
  const { accountStatusBadge } = useDriverStatusBadges();
  const STATUS_OPTIONS = useMemo(
    () => [
      { value: '', label: t.common.all },
      { value: 'active', label: t.status.account.active },
      { value: 'blocked', label: t.status.account.blocked },
      { value: 'deleted', label: t.status.account.deleted },
    ],
    [t]
  );

  const router = useRouter();
  const dispatch = useAppDispatch();
  const toast = useToast();
  const {
    items,
    pagination,
    filters,
    selectedCustomer,
    loading,
    error,
  } = useAppSelector((s) => s.customers);

  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [blockDialogOpen, setBlockDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [actionCustomerId, setActionCustomerId] = useState<string | null>(null);
  const [createLoading, setCreateLoading] = useState(false);
  const [updateLoading, setUpdateLoading] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const goToDetail = (id: string) => router.push(`/customers/${id}`);

  useEffect(() => {
    void dispatch(fetchCustomers({ page: 1, limit: 20 }));
  }, [dispatch]);

  const applyFilters = () => void dispatch(fetchCustomers({ page: 1 }));

  const customerForAction = actionCustomerId ? items.find((c) => c._id === actionCustomerId) ?? selectedCustomer : selectedCustomer;

  const handleAddSubmit = async (form: AddCustomerForm) => {
    setCreateLoading(true);
    const fd = new FormData();
    fd.append('name', form.name.trim());
    fd.append('phone', form.phone.trim());
    fd.append('password', form.password);
    if (form.email.trim()) fd.append('email', form.email.trim());
    if (form.addressStreet.trim() && form.addressCity.trim() && form.addressCountry.trim()) {
      fd.append(
        'address',
        JSON.stringify({
          label: form.addressLabel.trim() || t.common.home,
          street: form.addressStreet.trim(),
          city: form.addressCity.trim(),
          country: form.addressCountry.trim(),
        })
      );
    }
    if (form.profileImage) fd.append('profileImage', form.profileImage);
    const action = await dispatch(createCustomer(fd));
    setCreateLoading(false);
    if (createCustomer.fulfilled.match(action)) {
      toast.push({ title: t.customers.createSuccess, variant: 'success' });
      setAddOpen(false);
      void dispatch(fetchCustomers({ page: 1 }));
    } else {
      toast.push({ title: t.common.createFailed, description: String(action.payload ?? ''), variant: 'danger' });
    }
  };

  const handleEditSubmit = async (form: Parameters<typeof EditCustomerDrawer>[0]['onSubmit'] extends (f: infer F) => void ? F : never) => {
    if (!selectedCustomer) return;
    setUpdateLoading(true);
    const fd = new FormData();
    fd.append('name', form.name.trim());
    fd.append('phone', form.phone.trim());
    if (form.email !== undefined) fd.append('email', form.email.trim());
    fd.append('addresses', JSON.stringify(form.addresses));
    if (form.profileImage) fd.append('profileImage', form.profileImage);
    const action = await dispatch(updateCustomer({ id: selectedCustomer._id, formData: fd }));
    setUpdateLoading(false);
    if (updateCustomer.fulfilled.match(action)) {
      toast.push({ title: t.customers.updateSuccess, variant: 'success' });
      setEditOpen(false);
      void dispatch(fetchCustomers(undefined));
    } else {
      toast.push({ title: t.common.updateFailed, description: String(action.payload ?? ''), variant: 'danger' });
    }
  };

  const openBlockDialog = (id: string) => {
    setActionCustomerId(id);
    setBlockDialogOpen(true);
  };

  const handleBlockUnblockConfirm = async (reason: string) => {
    if (!actionCustomerId) return;
    const c = items.find((x) => x._id === actionCustomerId);
    setStatusLoading(true);
    const newStatus = c?.status === 'blocked' ? 'active' : 'blocked';
    const action = await dispatch(updateCustomerStatus({ id: actionCustomerId, status: newStatus, reason: reason || undefined }));
    setStatusLoading(false);
    if (updateCustomerStatus.fulfilled.match(action)) {
      toast.push({ title: newStatus === 'blocked' ? t.customers.blockSuccess : t.customers.unblockSuccess, variant: 'success' });
      setBlockDialogOpen(false);
      setActionCustomerId(null);
      void dispatch(fetchCustomers(undefined));
    } else {
      toast.push({ title: t.common.updateFailed, description: String(action.payload ?? ''), variant: 'danger' });
    }
  };

  const openDeleteDialog = (id: string) => {
    setActionCustomerId(id);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!actionCustomerId) return;
    setDeleteLoading(true);
    const action = await dispatch(deleteCustomer(actionCustomerId));
    setDeleteLoading(false);
    if (deleteCustomer.fulfilled.match(action)) {
      toast.push({ title: t.customers.deleteSuccess, variant: 'success' });
      setDeleteDialogOpen(false);
      setActionCustomerId(null);
      void dispatch(fetchCustomers(undefined));
    } else {
      toast.push({ title: t.common.deleteFailed, description: String(action.payload ?? ''), variant: 'danger' });
    }
  };

  const openEdit = async (id: string) => {
    void dispatch(fetchCustomerById(id));
    setEditOpen(true);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div className="row adminPageHeader" style={{ justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: 'var(--text)' }}>{t.customers.title}</h1>
          <div className="muted" style={{ marginTop: 4 }}>{t.customers.subtitle}</div>
        </div>
        <div className="row">
          <button className="btn" onClick={() => void dispatch(fetchCustomers(undefined))} disabled={loading} aria-label={t.common.refresh}>
            <RefreshCcw size={18} aria-hidden /> {t.common.refresh}
          </button>
        </div>
      </div>

      <div className="card">
        <div className="cardBody">
          <div className="toolbar adminToolbarResponsive">
            <div className="field" style={{ minWidth: 260 }}>
              <div className="label">{t.customers.searchLabel}</div>
              <input
                className="input"
                value={filters.search}
                onChange={(e) => dispatch(setFilters({ search: e.target.value }))}
                placeholder={t.customers.searchPlaceholder}
              />
            </div>
            <div className="field">
              <div className="label">{t.common.status}</div>
              <select
                className="select"
                value={filters.status}
                onChange={(e) => dispatch(setFilters({ status: e.target.value }))}
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <div className="label">{t.customers.showDeleted}</div>
              <div className="adminFilterSwitchControl">
                <Switch
                  checked={filters.showDeleted}
                  onChange={(e) => dispatch(setShowDeleted(e.target.checked))}
                  label={filters.showDeleted ? t.common.on : t.common.off}
                  aria-label={t.customers.showDeletedAria}
                />
              </div>
            </div>
            <div className="field">
              <button className="btn btnPrimary" onClick={() => applyFilters()}>{t.common.apply}</button>
            </div>
          </div>
          {error ? (
            <div style={{ marginTop: 12, color: 'var(--danger)' }}>{error}</div>
          ) : null}
        </div>
      </div>

      <div className="card">
        <div className="cardBody">
          {loading && items.length === 0 ? (
            <div className="tableWrap">
              <table className="adminListTable adminCustomersTable">
                <thead>
                  <tr>
                    <th>{t.customers.avatar}</th>
                    <th>{t.common.name}</th>
                    <th>{t.common.email}</th>
                    <th>{t.common.phone}</th>
                    <th>{t.common.status}</th>
                    <th>{t.customers.ordersCol}</th>
                    <th>{t.customers.points}</th>
                    <th>{t.common.actions}</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={8}><Skeleton height={18} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : items.length === 0 ? (
            <EmptyState icon={<UserPlus size={48} />} heading={t.empty.customers} subtext={t.common.tryFilters} />
          ) : (
            <div className="tableWrap">
            <table className="adminListTable adminCustomersTable">
              <thead>
                <tr>
                  <th>{t.customers.avatar}</th>
                  <th>{t.common.name}</th>
                  <th>{t.common.email}</th>
                  <th>{t.common.phone}</th>
                  <th>{t.common.status}</th>
                  <th>{t.customers.ordersCol}</th>
                  <th>{t.customers.points}</th>
                  <th>{t.common.actions}</th>
                </tr>
              </thead>
              <tbody>
                  {items.map((c) => {
                    const badge = accountStatusBadge(c.status);
                    return (
                    <tr key={c._id} className="clickableRow" onClick={() => goToDetail(c._id)}>
                      <td>
                        <div className="adminTableCellCenter">
                          <Avatar src={imgSrc(c.profileImage)} name={c.name} size={36} radius={8} />
                        </div>
                      </td>
                      <td style={{ fontWeight: 700 }}>{c.name}</td>
                      <td className="muted">{c.email ?? '—'}</td>
                      <td>{c.phone}</td>
                      <td>
                        <span className="badge" style={{ background: badge.background }}>
                          {badge.label}
                        </span>
                      </td>
                      <td>{c.totalOrders ?? c.orderCount ?? 0}</td>
                      <td>{c.points ?? 0}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <div className="row adminTableActions" style={{ gap: 6 }}>
                          <button className="btn" onClick={() => goToDetail(c._id)} aria-label={t.common.view}><Eye size={16} /></button>
                          {c.status !== 'deleted' && (
                            <button className="btn" onClick={() => openBlockDialog(c._id)} aria-label={c.status === 'blocked' ? t.customers.unblock : t.customers.block}><Ban size={16} /></button>
                          )}
                          <button className="btn" onClick={() => openDeleteDialog(c._id)} aria-label={t.common.delete} disabled={c.status === 'deleted'}><Trash2 size={16} /></button>
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
              <button className="btn" disabled={!pagination.hasPrev || loading} onClick={() => void dispatch(fetchCustomers({ page: pagination.page - 1 }))}>{t.common.prev}</button>
              <button className="btn" disabled={!pagination.hasNext || loading} onClick={() => void dispatch(fetchCustomers({ page: pagination.page + 1 }))}>{t.common.next}</button>
            </div>
          </div>
          ) : null}
        </div>
      </div>

      <AddCustomerModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSubmit={handleAddSubmit}
        loading={createLoading}
        error={null}
      />
      <EditCustomerDrawer
        open={editOpen}
        customer={selectedCustomer}
        onClose={() => setEditOpen(false)}
        onSubmit={handleEditSubmit}
        loading={updateLoading}
        error={null}
      />
      <BlockUnblockDialog
        open={blockDialogOpen}
        type="customer"
        currentStatus={customerForAction?.status ?? 'active'}
        currentReason={customerForAction?.blockReason ?? undefined}
        onClose={() => { setBlockDialogOpen(false); setActionCustomerId(null); }}
        onConfirm={handleBlockUnblockConfirm}
        loading={statusLoading}
      />
      <DeleteCustomerDialog
        open={deleteDialogOpen}
        customerName={customerForAction?.name ?? ''}
        onClose={() => { setDeleteDialogOpen(false); setActionCustomerId(null); }}
        onConfirm={handleDeleteConfirm}
        loading={deleteLoading}
      />
    </div>
  );
}
