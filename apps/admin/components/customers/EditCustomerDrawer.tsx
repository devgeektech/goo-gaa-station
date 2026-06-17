'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import type { CustomerDetail, CustomerAddress } from '@/lib/api/customers.api';
import { isProfileImageWithinLimit, PROFILE_IMAGE_SIZE_LABEL } from '@/lib/constants/uploads';
import { useTranslations } from '@/lib/i18n/useTranslations';
import { formatT } from '@/lib/i18n/translations';

export type EditCustomerForm = {
  name: string;
  email: string;
  phone: string;
  addresses: CustomerAddress[];
  profileImage: File | null;
};

function publicFileBase(): string {
  const base = typeof process !== 'undefined' ? (process.env.NEXT_PUBLIC_API_URL ?? '') : '';
  return base.replace(/\/api\/v1\/?$/, '');
}

function imgSrc(url: string | null | undefined) {
  if (!url) return null;
  return url.startsWith('http') ? url : `${publicFileBase()}${url}`;
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
  const t = useTranslations();

  const toForm = (c: CustomerDetail | null): EditCustomerForm => {
    if (!c) return { name: '', email: '', phone: '', addresses: [], profileImage: null };
    return {
      name: c.name ?? '',
      email: c.email ?? '',
      phone: c.phone ?? '',
      addresses: Array.isArray(c.addresses) && c.addresses.length > 0 ? c.addresses : [{ label: t.common.home, street: '', city: '', country: '' }],
      profileImage: null,
    };
  };

  const [form, setForm] = useState<EditCustomerForm>(toForm(customer));
  const [fileError, setFileError] = useState<string | null>(null);

  useEffect(() => {
    if (open) setForm(toForm(customer));
  }, [open, customer]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    if (!form.phone.trim()) return;
    if (form.profileImage && !isProfileImageWithinLimit(form.profileImage)) {
      setFileError(formatT(t.customers.profileImageMaxError, { max: PROFILE_IMAGE_SIZE_LABEL }));
      return;
    }
    const validAddresses = form.addresses.filter((a) => a.street?.trim() && a.city?.trim() && a.country?.trim() && a.label?.trim());
    onSubmit({ ...form, addresses: validAddresses.length > 0 ? form.addresses : [] });
  };

  const addAddress = () => {
    setForm((f) => ({
      ...f,
      addresses: [...f.addresses, { label: t.customers.addressDefaultLabel, street: '', city: '', country: '' }],
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
          <div className="modalTitle">{t.customers.editTitle}</div>
          <button type="button" className="btn" onClick={onClose} aria-label={t.common.close}>
            <X size={18} aria-hidden />
          </button>
        </div>
        <div className="modalBody" style={{ overflow: 'auto', flex: 1 }}>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {error ? <div style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</div> : null}
            {fileError ? <div style={{ color: 'var(--danger)', fontSize: 13 }}>{fileError}</div> : null}
            <div className="field">
              <label className="label">{formatT(t.customers.profileImageOptionalMax, { max: PROFILE_IMAGE_SIZE_LABEL })}</label>
              <div className="row" style={{ alignItems: 'center', gap: 12 }}>
                {imgSrc(imageUrl) ? (
                  <img src={imgSrc(imageUrl)!} alt="" style={{ width: 64, height: 64, borderRadius: 8, objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: 64, height: 64, borderRadius: 8, background: 'var(--border-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>{t.common.noImage}</div>
                )}
                <div>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      if (file && !isProfileImageWithinLimit(file)) {
                        setFileError(formatT(t.customers.profileImageMaxError, { max: PROFILE_IMAGE_SIZE_LABEL }));
                        setForm((f) => ({ ...f, profileImage: null }));
                        e.target.value = '';
                        return;
                      }
                      setFileError(null);
                      setForm((f) => ({ ...f, profileImage: file }));
                    }}
                  />
                  <span className="muted" style={{ fontSize: 12 }}>{form.profileImage ? form.profileImage.name : t.common.replace}</span>
                </div>
              </div>
            </div>
            <div className="field">
              <label className="label">{t.customers.fieldName} *</label>
              <input className="input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
            </div>
            <div className="field">
              <label className="label">{t.customers.fieldEmail}</label>
              <input type="email" className="input" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="field">
              <label className="label">{t.customers.fieldPhone} *</label>
              <input type="tel" className="input" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} required />
            </div>
            <div className="divider" />
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="muted">{t.customers.addresses}</span>
              <button type="button" className="btn" onClick={addAddress}>{t.customers.addAddress}</button>
            </div>
            {form.addresses.map((addr, index) => (
              <div key={index} className="card" style={{ padding: 12 }}>
                <div className="field">
                  <label className="label">{t.customers.fieldLabel}</label>
                  <input className="input" value={addr.label} onChange={(e) => updateAddress(index, 'label', e.target.value)} placeholder={t.common.home} />
                </div>
                <div className="field">
                  <label className="label">{t.customers.fieldStreet}</label>
                  <input className="input" value={addr.street} onChange={(e) => updateAddress(index, 'street', e.target.value)} />
                </div>
                <div className="row">
                  <div className="field" style={{ flex: 1 }}>
                    <label className="label">{t.customers.fieldCity}</label>
                    <input className="input" value={addr.city} onChange={(e) => updateAddress(index, 'city', e.target.value)} />
                  </div>
                  <div className="field" style={{ flex: 1 }}>
                    <label className="label">{t.customers.fieldCountry}</label>
                    <input className="input" value={addr.country} onChange={(e) => updateAddress(index, 'country', e.target.value)} />
                  </div>
                </div>
                <button type="button" className="btn" style={{ marginTop: 8 }} onClick={() => removeAddress(index)}>{t.customers.removeAddress}</button>
              </div>
            ))}
            <div className="row" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
              <button type="button" className="btn" onClick={onClose}>{t.common.cancel}</button>
              <button type="submit" className="btn btnPrimary" disabled={!canSubmit}>{loading ? t.common.saving : t.common.save}</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
