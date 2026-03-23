'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';

export type AddMenuItemForm = {
  name: string;
  description: string;
  price: string;
  category: string;
  isAvailable: boolean;
  image: File | null;
};

const initialForm: AddMenuItemForm = {
  name: '',
  description: '',
  price: '',
  category: '',
  isAvailable: true,
  image: null,
};

export function AddMenuItemModal({
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
  const [form, setForm] = useState<AddMenuItemForm>(initialForm);

  const reset = () => setForm(initialForm);

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    const price = parseFloat(form.price);
    if (Number.isNaN(price) || price < 0) return;
    if (!form.category.trim()) return;
    const fd = new FormData();
    fd.append('name', form.name.trim());
    fd.append('description', form.description.trim());
    fd.append('price', String(price));
    fd.append('category', form.category.trim());
    fd.append('isAvailable', String(form.isAvailable));
    if (form.image) fd.append('image', form.image);
    onSubmit(fd);
  };

  return (
    <Modal open={open} title="Add menu item" onClose={handleClose}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="field">
          <label className="label">Name *</label>
          <input
            className="input"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Item name"
            required
          />
        </div>
        <div className="field">
          <label className="label">Description</label>
          <textarea
            className="textarea"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            rows={2}
          />
        </div>
        <div className="field">
          <label className="label">Price *</label>
          <input
            type="number"
            step="0.01"
            min="0"
            className="input"
            value={form.price}
            onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
            placeholder="0.00"
            required
          />
        </div>
        <div className="field">
          <label className="label">Category *</label>
          <input
            className="input"
            value={form.category}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            placeholder="e.g. Main, Drinks"
            required
          />
        </div>
        <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={form.isAvailable}
            onChange={(e) => setForm((f) => ({ ...f, isAvailable: e.target.checked }))}
          />
          <span className="label" style={{ marginBottom: 0 }}>Available</span>
        </label>
        <div className="field">
          <label className="label">Image (optional)</label>
          <input type="file" accept="image/*" onChange={(e) => setForm((f) => ({ ...f, image: e.target.files?.[0] ?? null }))} />
        </div>
        <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn" onClick={handleClose}>Cancel</button>
          <button type="submit" className="btn btnPrimary" disabled={loading || !form.name.trim() || !form.category.trim() || form.price === ''}>
            {loading ? 'Adding…' : 'Add'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
