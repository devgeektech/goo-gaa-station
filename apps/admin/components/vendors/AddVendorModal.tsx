'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { isVendorImageWithinLimit, VENDOR_IMAGE_SIZE_LABEL } from '@/lib/constants/uploads';
import { useTranslations } from '@/lib/i18n/useTranslations';
import { formatT } from '@/lib/i18n/translations';

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
  const t = useTranslations();
  const [form, setForm] = useState<AddVendorForm>(initialForm);
  const [fileError, setFileError] = useState<string | null>(null);

  const reset = () => {
    setForm(initialForm);
    setFileError(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    if (form.logo && !isVendorImageWithinLimit(form.logo)) {
      setFileError(formatT(t.vendors.logoMaxError, { max: VENDOR_IMAGE_SIZE_LABEL }));
      return;
    }
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
    <Modal open={open} title={t.vendors.addTitle} onClose={handleClose}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {fileError ? <div style={{ color: 'var(--danger)', fontSize: 13 }}>{fileError}</div> : null}
        <div className="field">
          <label className="label" htmlFor="add-vendor-name">{t.vendors.fieldName} *</label>
          <input
            id="add-vendor-name"
            className="input"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder={t.vendors.namePlaceholder}
            required
          />
        </div>
        <div className="field">
          <label className="label" htmlFor="add-vendor-slug">{t.vendors.fieldSlugOptional}</label>
          <input
            id="add-vendor-slug"
            className="input"
            value={form.slug}
            onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
            placeholder={t.vendors.slugPlaceholder}
          />
        </div>
        <div className="field">
          <label className="label" htmlFor="add-vendor-desc">{t.vendors.fieldDescription}</label>
          <textarea
            id="add-vendor-desc"
            className="textarea"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder={t.vendors.descPlaceholder}
            rows={2}
          />
        </div>
        <div className="field">
          <label className="label" htmlFor="add-vendor-email">{t.vendors.fieldEmail}</label>
          <input
            id="add-vendor-email"
            type="email"
            className="input"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            placeholder={t.vendors.emailPlaceholder}
          />
        </div>
        <div className="field">
          <label className="label" htmlFor="add-vendor-phone">{t.vendors.fieldPhone}</label>
          <input
            id="add-vendor-phone"
            type="tel"
            className="input"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            placeholder={t.vendors.phonePlaceholder}
          />
        </div>
        <div className="field">
          <label className="label">{formatT(t.vendors.logoOptionalMax, { max: VENDOR_IMAGE_SIZE_LABEL })}</label>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null;
              if (file && !isVendorImageWithinLimit(file)) {
                setFileError(formatT(t.vendors.logoMaxError, { max: VENDOR_IMAGE_SIZE_LABEL }));
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
          <button type="button" className="btn" onClick={handleClose}>{t.common.cancel}</button>
          <button type="submit" className="btn btnPrimary" disabled={loading || !form.name.trim()}>
            {loading ? t.common.creating : t.common.create}
          </button>
        </div>
      </form>
    </Modal>
  );
}
