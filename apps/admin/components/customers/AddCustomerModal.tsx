'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { isProfileImageWithinLimit, PROFILE_IMAGE_SIZE_LABEL } from '@/lib/constants/uploads';
import { useTranslations } from '@/lib/i18n/useTranslations';
import { formatT } from '@/lib/i18n/translations';

export type AddCustomerForm = {
  name: string;
  email: string;
  phone: string;
  password: string;
  addressLabel: string;
  addressStreet: string;
  addressCity: string;
  addressCountry: string;
  profileImage: File | null;
};

export function AddCustomerModal({
  open,
  onClose,
  onSubmit,
  loading,
  error,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (form: AddCustomerForm) => void;
  loading: boolean;
  error: string | null;
}) {
  const t = useTranslations();
  const initialForm: AddCustomerForm = {
    name: '',
    email: '',
    phone: '',
    password: '',
    addressLabel: t.common.home,
    addressStreet: '',
    addressCity: '',
    addressCountry: '',
    profileImage: null,
  };
  const [form, setForm] = useState<AddCustomerForm>(initialForm);
  const [fileError, setFileError] = useState<string | null>(null);

  const reset = () => {
    setForm({ ...initialForm, addressLabel: t.common.home });
    setFileError(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    if (!form.phone.trim()) return;
    if (!form.password.trim()) return;
    if (form.addressStreet && (!form.addressCity || !form.addressCountry)) return;
    if (form.addressStreet && !form.addressLabel.trim()) return;
    if (form.profileImage && !isProfileImageWithinLimit(form.profileImage)) {
      setFileError(formatT(t.customers.profileImageMaxError, { max: PROFILE_IMAGE_SIZE_LABEL }));
      return;
    }
    onSubmit(form);
  };

  const canSubmit =
    form.name.trim() &&
    form.phone.trim() &&
    form.password.trim() &&
    !loading;

  return (
    <Modal open={open} title={t.customers.addTitle} onClose={handleClose}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {error ? (
          <div style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</div>
        ) : null}
        {fileError ? (
          <div style={{ color: 'var(--danger)', fontSize: 13 }}>{fileError}</div>
        ) : null}
        <div className="field">
          <label className="label" htmlFor="add-name">{t.customers.fieldName} *</label>
          <input
            id="add-name"
            className="input"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder={t.customers.fullNamePlaceholder}
            required
          />
        </div>
        <div className="field">
          <label className="label" htmlFor="add-email">{t.customers.fieldEmail}</label>
          <input
            id="add-email"
            type="email"
            className="input"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            placeholder={t.customers.emailPlaceholder}
          />
        </div>
        <div className="field">
          <label className="label" htmlFor="add-phone">{t.customers.fieldPhone} *</label>
          <input
            id="add-phone"
            type="tel"
            className="input"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            placeholder={t.customers.phonePlaceholder}
            required
          />
        </div>
        <div className="field">
          <label className="label" htmlFor="add-password">{t.customers.fieldPassword} *</label>
          <input
            id="add-password"
            type="password"
            className="input"
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            placeholder={t.customers.passwordMinPlaceholder}
            required
            minLength={6}
          />
        </div>
        <div className="divider" />
        <div className="muted" style={{ fontSize: 13 }}>{t.customers.fieldAddress}</div>
        <div className="field">
          <label className="label" htmlFor="add-addr-label">{t.customers.fieldLabel}</label>
          <input
            id="add-addr-label"
            className="input"
            value={form.addressLabel}
            onChange={(e) => setForm((f) => ({ ...f, addressLabel: e.target.value }))}
            placeholder={t.common.home}
          />
        </div>
        <div className="field">
          <label className="label" htmlFor="add-addr-street">{t.customers.fieldStreet}</label>
          <input
            id="add-addr-street"
            className="input"
            value={form.addressStreet}
            onChange={(e) => setForm((f) => ({ ...f, addressStreet: e.target.value }))}
            placeholder={t.customers.streetPlaceholder}
          />
        </div>
        <div className="row">
          <div className="field" style={{ flex: 1 }}>
            <label className="label" htmlFor="add-addr-city">{t.customers.fieldCity}</label>
            <input
              id="add-addr-city"
              className="input"
              value={form.addressCity}
              onChange={(e) => setForm((f) => ({ ...f, addressCity: e.target.value }))}
              placeholder={t.customers.cityPlaceholder}
            />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label className="label" htmlFor="add-addr-country">{t.customers.fieldCountry}</label>
            <input
              id="add-addr-country"
              className="input"
              value={form.addressCountry}
              onChange={(e) => setForm((f) => ({ ...f, addressCountry: e.target.value }))}
              placeholder={t.customers.countryPlaceholder}
            />
          </div>
        </div>
        <div className="field">
          <label className="label">{formatT(t.customers.profileImageOptionalMax, { max: PROFILE_IMAGE_SIZE_LABEL })}</label>
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
          {form.profileImage ? (
            <span className="muted" style={{ fontSize: 12 }}>{form.profileImage.name}</span>
          ) : null}
        </div>
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
          <button type="button" className="btn" onClick={handleClose}>
            {t.common.cancel}
          </button>
          <button type="submit" className="btn btnPrimary" disabled={!canSubmit}>
            {loading ? t.common.creating : t.customers.createCustomer}
          </button>
        </div>
      </form>
    </Modal>
  );
}
