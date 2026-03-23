'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import type { CustomerDetail, CustomerAddress } from '@/lib/api/customers.api';

export type EditCustomerForm = {
  name: string;
  email: string;
  phone: string;
  addresses: CustomerAddress[];
  profileImage: File | null;
};

function toForm(c: CustomerDetail | null): EditCustomerForm {
  if (!c) return { name: '', email: '', phone: '', addresses: [], profileImage: null };
  return {
    name: c.name ?? '',
    email: c.email ?? '',
    phone: c.phone ?? '',
    addresses: Array.isArray(c.addresses) && c.addresses.length > 0 ? c.addresses : [{ label: 'Home', street: '', city: '', country: '' }],
    profileImage: null,
  };
}

export function EditCustomerDrawer({
  open,
  customer,
  onClose,
  onSubmit,
  loading,
  error,
}: {
  open: boolean;
  customer: CustomerDetail | null;
  onClose: () => void;
  onSubmit: (form: EditCustomerForm) => void;
  loading: boolean;
  error: string | null;
}) {
  const [form, setForm] = useState<EditCustomerForm>(toForm(customer));

  useEffect(() => {
    if (open) setForm(toForm(customer));
  }, [open, customer]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    if (!form.phone.trim()) return;
    const validAddresses = form.addresses.filter((a) => a.street?.trim() && a.city?.trim() && a.country?.trim() && a.label?.trim());
    onSubmit({ ...form, addresses: validAddresses.length > 0 ? form.addresses : [] });
  };

  const addAddress = () => {
    setForm((f) => ({
      ...f,
      addresses: [...f.addresses, { label: 'Address', street: '', city: '', country: '' }],
    }));
  };

  const updateAddress = (index: number, field: keyof CustomerAddress, value: string | number | boolean) => {
    setForm((f) => ({
      ...f,
      addresses: f.addresses.map((a, i) => (i === index ? { ...a, [field]: value } : a)),
    }));
  };

  const removeAddress = (index: number) => {
    setForm((f) => ({ ...f, addresses: f.addresses.filter((_, i) => i !== index) }));
  };

  const imageUrl = customer?.profileImage ?? null;
  const canSubmit = form.name.trim() && form.phone.trim() && !loading;

  if (!open) return null;

  return (
    <div
      className="modalOverlay"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{ alignItems: 'stretch', justifyContent: 'flex-end' }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 480,
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
          <div className="modalTitle">Edit Customer</div>
          <button type="button" className="btn" onClick={onClose} aria-label="Close">
            <X size={18} aria-hidden />
          </button>
        </div>
        <div className="modalBody" style={{ overflow: 'auto', flex: 1 }}>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {error ? <div style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</div> : null}
            <div className="field">
              <label className="label">Profile image</label>
              <div className="row" style={{ alignItems: 'center', gap: 12 }}>
                {imageUrl ? (
                  <img src={imageUrl.startsWith('http') ? imageUrl : `${process.env.NEXT_PUBLIC_API_URL ?? ''}${imageUrl}`} alt="" style={{ width: 64, height: 64, borderRadius: 8, objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: 64, height: 64, borderRadius: 8, background: 'var(--border-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>No image</div>
                )}
                <div>
                  <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setForm((f) => ({ ...f, profileImage: e.target.files?.[0] ?? null }))} />
                  <span className="muted" style={{ fontSize: 12 }}>{form.profileImage ? form.profileImage.name : 'Replace'}</span>
                </div>
              </div>
            </div>
            <div className="field">
              <label className="label">Name *</label>
              <input className="input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
            </div>
            <div className="field">
              <label className="label">Email</label>
              <input type="email" className="input" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="field">
              <label className="label">Phone *</label>
              <input type="tel" className="input" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} required />
            </div>
            <div className="divider" />
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="muted">Addresses</span>
              <button type="button" className="btn" onClick={addAddress}>Add address</button>
            </div>
            {form.addresses.map((addr, index) => (
              <div key={index} className="card" style={{ padding: 12 }}>
                <div className="field">
                  <label className="label">Label</label>
                  <input className="input" value={addr.label} onChange={(e) => updateAddress(index, 'label', e.target.value)} placeholder="Home" />
                </div>
                <div className="field">
                  <label className="label">Street</label>
                  <input className="input" value={addr.street} onChange={(e) => updateAddress(index, 'street', e.target.value)} />
                </div>
                <div className="row">
                  <div className="field" style={{ flex: 1 }}>
                    <label className="label">City</label>
                    <input className="input" value={addr.city} onChange={(e) => updateAddress(index, 'city', e.target.value)} />
                  </div>
                  <div className="field" style={{ flex: 1 }}>
                    <label className="label">Country</label>
                    <input className="input" value={addr.country} onChange={(e) => updateAddress(index, 'country', e.target.value)} />
                  </div>
                </div>
                <button type="button" className="btn" style={{ marginTop: 8 }} onClick={() => removeAddress(index)}>Remove</button>
              </div>
            ))}
            <div className="row" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
              <button type="button" className="btn" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn btnPrimary" disabled={!canSubmit}>{loading ? 'Saving…' : 'Save'}</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
