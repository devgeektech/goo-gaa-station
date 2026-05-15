'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import type { VendorListItem, VendorDetail } from '@/lib/api/vendors.api';
import { isVendorImageWithinLimit, VENDOR_IMAGE_SIZE_LABEL } from '@/lib/constants/uploads';

export type EditVendorForm = {
  name: string;
  slug: string;
  description: string;
  email: string;
  phone: string;
  status: string;
  logo: File | null;
};

function toForm(v: VendorListItem | VendorDetail | null): EditVendorForm {
  if (!v) return { name: '', slug: '', description: '', email: '', phone: '', status: 'active', logo: null };
  return {
    name: v.name ?? '',
    slug: v.slug ?? '',
    description: (v as VendorDetail).description ?? '',
    email: (v as VendorDetail).email ?? '',
    phone: (v as VendorDetail).phone ?? '',
    status: v.status ?? 'active',
    logo: null,
  };
}

function publicFileBase(): string {
  const base = typeof process !== 'undefined' ? (process.env.NEXT_PUBLIC_API_URL ?? '') : '';
  return base.replace(/\/api\/v1\/?$/, '');
}
function imgSrc(url: string | null | undefined) {
  if (!url) return null;
  return url.startsWith('http') ? url : `${publicFileBase()}${url}`;
}

export function EditVendorDrawer({
  open,
  vendor,
  onClose,
  onSubmit,
  loading,
}: {
  open: boolean;
  vendor: VendorListItem | null;
  onClose: () => void;
  onSubmit: (formData: FormData) => void;
  loading: boolean;
}) {
  const [form, setForm] = useState<EditVendorForm>(toForm(vendor));
  const [fileError, setFileError] = useState<string | null>(null);

  useEffect(() => {
    if (open) setForm(toForm(vendor));
  }, [open, vendor]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    if (form.logo && !isVendorImageWithinLimit(form.logo)) {
      setFileError(`Logo must be at most ${VENDOR_IMAGE_SIZE_LABEL}`);
      return;
    }
    const fd = new FormData();
    fd.append('name', form.name.trim());
    fd.append('slug', form.slug.trim());
    fd.append('description', form.description.trim());
    fd.append('email', form.email.trim());
    fd.append('phone', form.phone.trim());
    fd.append('status', form.status);
    if (form.logo) fd.append('logo', form.logo);
    onSubmit(fd);
  };

  if (!open) return null;

  const logoUrl = imgSrc(vendor?.logo);

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
          <div className="modalTitle">Edit Vendor</div>
          <button type="button" className="btn" onClick={onClose} aria-label="Close">
            <X size={18} aria-hidden />
          </button>
        </div>
        <div className="modalBody" style={{ overflow: 'auto', flex: 1 }}>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {fileError ? <div style={{ color: 'var(--danger)', fontSize: 13 }}>{fileError}</div> : null}
            <div className="field">
              <label className="label">Name *</label>
              <input className="input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
            </div>
            <div className="field">
              <label className="label">Slug</label>
              <input className="input" value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))} />
            </div>
            <div className="field">
              <label className="label">Description</label>
              <textarea className="textarea" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={2} />
            </div>
            <div className="field">
              <label className="label">Email</label>
              <input type="email" className="input" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="field">
              <label className="label">Phone</label>
              <input className="input" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
            </div>
            <div className="field">
              <label className="label">Status</label>
              <select className="select" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
                <option value="active">Active</option>
                <option value="blocked">Blocked</option>
              </select>
            </div>
            <div className="field">
              <label className="label">Logo (replace, max {VENDOR_IMAGE_SIZE_LABEL})</label>
              {logoUrl && <img src={logoUrl} alt="" style={{ width: 64, height: 64, borderRadius: 8, objectFit: 'cover', marginBottom: 8 }} />}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  if (file && !isVendorImageWithinLimit(file)) {
                    setFileError(`Logo must be at most ${VENDOR_IMAGE_SIZE_LABEL}`);
                    setForm((f) => ({ ...f, logo: null }));
                    e.target.value = '';
                    return;
                  }
                  setFileError(null);
                  setForm((f) => ({ ...f, logo: file }));
                }}
              />
            </div>
            <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" className="btn" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn btnPrimary" disabled={loading || !form.name.trim()}>
                {loading ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
