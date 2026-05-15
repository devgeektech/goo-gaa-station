'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { isProfileImageWithinLimit, PROFILE_IMAGE_SIZE_LABEL } from '@/lib/constants/uploads';

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

const initialForm: AddCustomerForm = {
  name: '',
  email: '',
  phone: '',
  password: '',
  addressLabel: 'Home',
  addressStreet: '',
  addressCity: '',
  addressCountry: '',
  profileImage: null,
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
  const [form, setForm] = useState<AddCustomerForm>(initialForm);
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
    if (!form.phone.trim()) return;
    if (!form.password.trim()) return;
    if (form.addressStreet && (!form.addressCity || !form.addressCountry)) return;
    if (form.addressStreet && !form.addressLabel.trim()) return;
    if (form.profileImage && !isProfileImageWithinLimit(form.profileImage)) {
      setFileError(`Profile image must be at most ${PROFILE_IMAGE_SIZE_LABEL}`);
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
    <Modal open={open} title="Add Customer" onClose={handleClose}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {error ? (
          <div style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</div>
        ) : null}
        {fileError ? (
          <div style={{ color: 'var(--danger)', fontSize: 13 }}>{fileError}</div>
        ) : null}
        <div className="field">
          <label className="label" htmlFor="add-name">Name *</label>
          <input
            id="add-name"
            className="input"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Full name"
            required
          />
        </div>
        <div className="field">
          <label className="label" htmlFor="add-email">Email</label>
          <input
            id="add-email"
            type="email"
            className="input"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            placeholder="email@example.com"
          />
        </div>
        <div className="field">
          <label className="label" htmlFor="add-phone">Phone *</label>
          <input
            id="add-phone"
            type="tel"
            className="input"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            placeholder="+49..."
            required
          />
        </div>
        <div className="field">
          <label className="label" htmlFor="add-password">Password *</label>
          <input
            id="add-password"
            type="password"
            className="input"
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            placeholder="Min 6 characters"
            required
            minLength={6}
          />
        </div>
        <div className="divider" />
        <div className="muted" style={{ fontSize: 13 }}>Address (optional)</div>
        <div className="field">
          <label className="label" htmlFor="add-addr-label">Label</label>
          <input
            id="add-addr-label"
            className="input"
            value={form.addressLabel}
            onChange={(e) => setForm((f) => ({ ...f, addressLabel: e.target.value }))}
            placeholder="Home"
          />
        </div>
        <div className="field">
          <label className="label" htmlFor="add-addr-street">Street</label>
          <input
            id="add-addr-street"
            className="input"
            value={form.addressStreet}
            onChange={(e) => setForm((f) => ({ ...f, addressStreet: e.target.value }))}
            placeholder="Street and number"
          />
        </div>
        <div className="row">
          <div className="field" style={{ flex: 1 }}>
            <label className="label" htmlFor="add-addr-city">City</label>
            <input
              id="add-addr-city"
              className="input"
              value={form.addressCity}
              onChange={(e) => setForm((f) => ({ ...f, addressCity: e.target.value }))}
              placeholder="City"
            />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label className="label" htmlFor="add-addr-country">Country</label>
            <input
              id="add-addr-country"
              className="input"
              value={form.addressCountry}
              onChange={(e) => setForm((f) => ({ ...f, addressCountry: e.target.value }))}
              placeholder="Country"
            />
          </div>
        </div>
        <div className="field">
          <label className="label">Profile image (optional, max {PROFILE_IMAGE_SIZE_LABEL})</label>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null;
              if (file && !isProfileImageWithinLimit(file)) {
                setFileError(`Profile image must be at most ${PROFILE_IMAGE_SIZE_LABEL}`);
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
            Cancel
          </button>
          <button type="submit" className="btn btnPrimary" disabled={!canSubmit}>
            {loading ? 'Creating…' : 'Create Customer'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
