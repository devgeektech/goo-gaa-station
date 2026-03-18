'use client';

import { useState, useRef, useEffect } from 'react';
import type { CategoryItem } from '@/store/api';
import { useUpdateCategoryMutation } from '@/store/api';
import { Switch } from '@/components/ui/Switch';
import { useToast } from '@/components/ui/Toast';

const MAX_ICON_SIZE = 2 * 1024 * 1024;
const IMG_BASE = typeof process !== 'undefined' ? (process.env.NEXT_PUBLIC_API_URL ?? '') : '';
const TYPE_OPTIONS = [
  { value: 'food', label: 'Food' },
  { value: 'grocery', label: 'Grocery' },
  { value: 'pharmacy', label: 'Pharmacy' },
  { value: 'fashion', label: 'Fashion' },
];

type Props = { category: CategoryItem | null; open: boolean; onClose: () => void };

export function EditCategoryDrawer({ category, open, onClose }: Props) {
  const [updateCategory, { isLoading }] = useUpdateCategoryMutation();
  const toast = useToast();
  const [name, setName] = useState('');
  const [type, setType] = useState('food');
  const [description, setDescription] = useState('');
  const [sortOrder, setSortOrder] = useState(0);
  const [isActive, setIsActive] = useState(true);
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [iconPreview, setIconPreview] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (category) {
      setName(category.name);
      setType(category.type);
      setDescription(category.description ?? '');
      setSortOrder(category.sortOrder ?? 0);
      setIsActive(category.isActive ?? true);
      setIconFile(null);
      setIconPreview(null);
      setSubmitError('');
    }
  }, [category]);

  const currentIconUrl = category?.icon
    ? (category.icon.startsWith('http') ? category.icon : `${IMG_BASE}${category.icon}`)
    : null;

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      setIconFile(null);
      setIconPreview(null);
      return;
    }
    if (file.size > MAX_ICON_SIZE) {
      setIconFile(null);
      setIconPreview(null);
      setSubmitError('Icon must be at most 2MB');
      return;
    }
    setSubmitError('');
    setIconFile(file);
    setIconPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!category) return;
    setSubmitError('');
    const formData = new FormData();
    formData.append('name', name.trim());
    formData.append('type', type);
    formData.append('description', description);
    formData.append('sortOrder', String(sortOrder));
    formData.append('isActive', String(isActive));
    if (iconFile) formData.append('icon', iconFile);
    try {
      await updateCategory({ id: category._id, body: formData }).unwrap();
      toast.push({ title: 'Category updated', variant: 'success' });
      if (iconPreview) URL.revokeObjectURL(iconPreview);
      onClose();
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'data' in err
        ? String((err as { data?: { message?: string } }).data?.message ?? 'Update failed')
        : err instanceof Error ? err.message : 'Update failed';
      setSubmitError(msg);
    }
  };

  if (!open) return null;

  return (
    <div
      className="drawerOverlay"
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        zIndex: 1000,
        display: 'flex',
        justifyContent: 'flex-end',
      }}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: 420,
          height: '100%',
          borderRadius: 0,
          overflow: 'auto',
          padding: 24,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h2 style={{ margin: 0, fontSize: 20 }}>Edit Category</h2>
          <button type="button" className="btn" onClick={onClose} aria-label="Close">×</button>
        </div>
        {category ? (
          <form onSubmit={handleSubmit}>
            <div className="field" style={{ marginBottom: 16 }}>
              <div className="label">Name *</div>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="field" style={{ marginBottom: 16 }}>
              <div className="label">Type *</div>
              <select className="select" value={type} onChange={(e) => setType(e.target.value)}>
                {TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="field" style={{ marginBottom: 16 }}>
              <div className="label">Icon</div>
              {currentIconUrl && !iconPreview ? (
                <div style={{ marginBottom: 8 }}>
                  <img src={currentIconUrl} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8 }} />
                </div>
              ) : null}
              {iconPreview ? (
                <div style={{ marginBottom: 8 }}>
                  <img src={iconPreview} alt="New" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8 }} />
                </div>
              ) : null}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png"
                onChange={onFileChange}
                style={{ fontSize: 14 }}
              />
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Replace image (max 2MB)</div>
            </div>
            <div className="field" style={{ marginBottom: 16 }}>
              <div className="label">Description</div>
              <textarea className="input" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
            </div>
            <div className="field" style={{ marginBottom: 16 }}>
              <div className="label">Sort Order</div>
              <input type="number" className="input" value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value) || 0)} />
            </div>
            <div className="field" style={{ marginBottom: 16 }}>
              <Switch checked={isActive} onChange={(e) => setIsActive(e.target.checked)} label="Active" />
            </div>
            {submitError ? <div style={{ color: 'var(--danger)', fontSize: 14, marginBottom: 16 }}>{submitError}</div> : null}
            <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" className="btn" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn btnPrimary" disabled={isLoading}>{isLoading ? 'Saving…' : 'Save'}</button>
            </div>
          </form>
        ) : null}
      </div>
    </div>
  );
}
