'use client';

import { useEffect, useState } from 'react';
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
  fetchCustomerOrders,
  setFilters,
  setShowDeleted,
  setSelectedCustomer,
} from '@/store/slices/customersSlice';
import type { AddCustomerForm } from '@/components/customers/AddCustomerModal';
import { AddCustomerModal } from '@/components/customers/AddCustomerModal';
import { EditCustomerDrawer } from '@/components/customers/EditCustomerDrawer';
import { BlockUnblockDialog } from '@/components/customers/BlockUnblockDialog';
import { DeleteCustomerDialog } from '@/components/customers/DeleteCustomerDialog';
import { CustomerDetailDrawer } from '@/components/customers/CustomerDetailDrawer';
import { formatMoney } from '@/lib/utils/format';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';

const STATUS_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'deleted', label: 'Deleted' },
];

export default function CustomersPage() {
  const dispatch = useAppDispatch();
  const toast = useToast();
  const {
    items,
    pagination,
    filters,
    selectedCustomer,
    customerOrders,
    loading,
    error,
  } = useAppSelector((s) => s.customers);

  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [blockDialogOpen, setBlockDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [actionCustomerId, setActionCustomerId] = useState<string | null>(null);
  const [createLoading, setCreateLoading] = useState(false);
  const [updateLoading, setUpdateLoading] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [ordersLoading, setOrdersLoading] = useState(false);

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
          label: form.addressLabel.trim() || 'Home',
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
      toast.push({ title: 'Customer created', variant: 'success' });
      setAddOpen(false);
      void dispatch(fetchCustomers({ page: 1 }));
    } else {
      toast.push({ title: 'Create failed', description: String(action.payload ?? ''), variant: 'danger' });
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
      toast.push({ title: 'Customer updated', variant: 'success' });
      setEditOpen(false);
      void dispatch(fetchCustomers(undefined));
    } else {
      toast.push({ title: 'Update failed', description: String(action.payload ?? ''), variant: 'danger' });
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
      toast.push({ title: newStatus === 'blocked' ? 'Customer blocked' : 'Customer unblocked', variant: 'success' });
      setBlockDialogOpen(false);
      setActionCustomerId(null);
      void dispatch(fetchCustomers(undefined));
    } else {
      toast.push({ title: 'Update failed', description: String(action.payload ?? ''), variant: 'danger' });
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
      toast.push({ title: 'Customer deleted', variant: 'success' });
      setDeleteDialogOpen(false);
      setActionCustomerId(null);
      setDetailOpen(false);
      void dispatch(fetchCustomers(undefined));
    } else {
      toast.push({ title: 'Delete failed', description: String(action.payload ?? ''), variant: 'danger' });
    }
  };

  const openDetail = async (id: string) => {
    setDetailOpen(true);
    void dispatch(fetchCustomerById(id));
  };

  const openEdit = async (id: string) => {
    void dispatch(fetchCustomerById(id));
    setEditOpen(true);
  };

  const fetchOrdersForDetail = (page?: number) => {
    if (!selectedCustomer?._id) return;
    setOrdersLoading(true);
    void dispatch(fetchCustomerOrders({ id: selectedCustomer._id, page, limit: 10 })).finally(() => setOrdersLoading(false));
  };

  useEffect(() => {
    if (editOpen && selectedCustomer) {
      // already have selectedCustomer from openEdit
    }
  }, [editOpen, selectedCustomer]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div className="row adminPageHeader" style={{ justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: 'var(--text)' }}>Customers</h1>
          <div className="muted" style={{ marginTop: 4 }}>Search, filter, and manage customers.</div>
        </div>
        <div className="row">
          <button className="btn" onClick={() => void dispatch(fetchCustomers(undefined))} disabled={loading} aria-label="Refresh">
            <RefreshCcw size={18} aria-hidden /> Refresh
          </button>
          <button className="btn btnPrimary" onClick={() => setAddOpen(true)} aria-label="Add customer">
            <UserPlus size={18} aria-hidden /> Add Customer
          </button>
        </div>
      </div>

      <div className="card">
        <div className="cardBody">
          <div className="toolbar adminToolbarResponsive">
            <div className="field" style={{ minWidth: 260 }}>
              <div className="label">Search (name, phone, email)</div>
              <input
                className="input"
                value={filters.search}
                onChange={(e) => dispatch(setFilters({ search: e.target.value }))}
                placeholder="Search..."
              />
            </div>
            <div className="field">
              <div className="label">Status</div>
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
            <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={filters.showDeleted}
                onChange={(e) => dispatch(setShowDeleted(e.target.checked))}
              />
              <span className="label" style={{ marginBottom: 0 }}>Show deleted</span>
            </label>
            <div className="field">
              <button className="btn btnPrimary" onClick={() => applyFilters()}>Apply</button>
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
              <table>
                <thead>
                  <tr>
                    <th>Avatar</th>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Status</th>
                    <th>Orders</th>
                    <th>Points</th>
                    <th></th>
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
            <EmptyState icon={<UserPlus size={48} />} heading="No customers found" subtext="Try adjusting search or filters." />
          ) : (
            <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>Avatar</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Status</th>
                  <th>Orders</th>
                  <th>Points</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {  
                  items.map((c) => (
                    <tr key={c._id} className="clickableRow" onClick={() => openDetail(c._id)}>
                      <td>
                        {c.profileImage ? (
                          <img
                            src={c.profileImage.startsWith('http') ? c.profileImage : `${process.env.NEXT_PUBLIC_API_URL ?? ''}${c.profileImage}`}
                            alt=""
                            style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'cover' }}
                          />
                        ) : (
                          <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--border-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: 12 }}>—</div>
                        )}
                      </td>
                      <td style={{ fontWeight: 700 }}>{c.name}</td>
                      <td className="muted">{c.email ?? '—'}</td>
                      <td>{c.phone}</td>
                      <td>
                        <span
                          className="badge"
                          style={{
                            background: c.status === 'blocked' ? 'var(--danger-light)' : c.status === 'deleted' ? 'var(--warning-light)' : 'var(--success-light)',
                          }}
                        >
                          {c.status}
                        </span>
                      </td>
                      <td>{c.totalOrders ?? c.orderCount ?? 0}</td>
                      <td>{c.points ?? 0}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <div className="row" style={{ gap: 6 }}>
                          <button className="btn" onClick={() => openDetail(c._id)} aria-label="View"><Eye size={16} /></button>
                          <button className="btn" onClick={() => openEdit(c._id)} aria-label="Edit"><Pencil size={16} /></button>
                          {c.status !== 'deleted' && (
                            <button className="btn" onClick={() => openBlockDialog(c._id)} aria-label={c.status === 'blocked' ? 'Unblock' : 'Block'}><Ban size={16} /></button>
                          )}
                          <button className="btn" onClick={() => openDeleteDialog(c._id)} aria-label="Delete" disabled={c.status === 'deleted'}><Trash2 size={16} /></button>
                        </div>
                      </td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
            </div>
          )}
          {items.length > 0 ? (
          <div className="row adminPaginationRow" style={{ justifyContent: 'space-between', marginTop: 12, alignItems: 'center' }}>
            <div className="muted">Page {pagination.page} / {pagination.totalPages} • Total {pagination.total}</div>
            <div className="row">
              <button className="btn" disabled={!pagination.hasPrev || loading} onClick={() => void dispatch(fetchCustomers({ page: pagination.page - 1 }))}>Prev</button>
              <button className="btn" disabled={!pagination.hasNext || loading} onClick={() => void dispatch(fetchCustomers({ page: pagination.page + 1 }))}>Next</button>
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
      <CustomerDetailDrawer
        open={detailOpen}
        customer={selectedCustomer}
        orders={customerOrders.items}
        ordersLoading={ordersLoading}
        ordersPagination={customerOrders.pagination}
        onClose={() => setDetailOpen(false)}
        onFetchOrders={(page) => {
          if (!selectedCustomer?._id) return;
          setOrdersLoading(true);
          void dispatch(fetchCustomerOrders({ id: selectedCustomer._id, page, limit: 10 })).finally(() => setOrdersLoading(false));
        }}
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
