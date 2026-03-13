'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';

export type AddVendorForm = {
  name: string;
  slug: string;
  description: string;
  email: string;
  phone: string;
  logo: File | null;
};

const initialForm: AddVendorForm = {
  name: '',
  slug: '',
  description: '',
  email: '',
  phone: '',
  logo: null,
};

export function AddVendorModal({
  open,
  onClose,
  onSubmit,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (formData: FormData) => void;
  loading: boolean;
}) {
  const [form, setForm] = useState<AddVendorForm>(initialForm);

  const reset = () => setForm(initialForm);

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    const fd = new FormData();
    fd.append('name', form.name.trim());
    if (form.slug.trim()) fd.append('slug', form.slug.trim());
    fd.append('description', form.description.trim());
    if (form.email.trim()) fd.append('email', form.email.trim());
    if (form.phone.trim()) fd.append('phone', form.phone.trim());
    if (form.logo) fd.append('logo', form.logo);
    onSubmit(fd);
  };

  return (
    <Modal open={open} title="Add Vendor" onClose={handleClose}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="field">
          <label className="label" htmlFor="add-vendor-name">Name *</label>
          <input
            id="add-vendor-name"
            className="input"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Vendor name"
            required
          />
        </div>
        <div className="field">
          <label className="label" htmlFor="add-vendor-slug">Slug (optional)</label>
          <input
            id="add-vendor-slug"
            className="input"
            value={form.slug}
            onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
            placeholder="url-slug"
          />
        </div>
        <div className="field">
          <label className="label" htmlFor="add-vendor-desc">Description</label>
          <textarea
            id="add-vendor-desc"
            className="textarea"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Short description"
            rows={2}
          />
        </div>
        <div className="field">
          <label className="label" htmlFor="add-vendor-email">Email</label>
          <input
            id="add-vendor-email"
            type="email"
            className="input"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            placeholder="vendor@example.com"
          />
        </div>
        <div className="field">
          <label className="label" htmlFor="add-vendor-phone">Phone</label>
          <input
            id="add-vendor-phone"
            type="tel"
            className="input"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            placeholder="+49..."
          />
        </div>
        <div className="field">
          <label className="label">Logo (optional, max 2MB)</label>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setForm((f) => ({ ...f, logo: e.target.files?.[0] ?? null }))}
          />
        </div>
        <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn" onClick={handleClose}>Cancel</button>
          <button type="submit" className="btn btnPrimary" disabled={loading || !form.name.trim()}>
            {loading ? 'Creating…' : 'Create'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
