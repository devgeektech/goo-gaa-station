'use client';

import { useState, useRef, useMemo } from 'react';
import { Modal } from '@/components/ui/Modal';
import { useCreateCategoryMutation } from '@/store/api';
import { useToast } from '@/components/ui/Toast';
import { useTranslations } from '@/lib/i18n/useTranslations';

const MAX_ICON_SIZE = 2 * 1024 * 1024;

type Props = { open: boolean; onClose: () => void };

export function AddCategoryModal({ open, onClose }: Props) {
  const t = useTranslations();
  const TYPE_OPTIONS = useMemo(
    () => [
      { value: 'food', label: t.categories.filterFood },
      { value: 'grocery', label: t.categories.filterGrocery },
      { value: 'pharmacy', label: t.categories.filterPharmacy },
      { value: 'fashion', label: t.categories.filterFashion },
    ],
    [t]
  );

  const [createCategory, { isLoading }] = useCreateCategoryMutation();
  const toast = useToast();
  const [name, setName] = useState('');
  const [type, setType] = useState('food');
  const [description, setDescription] = useState('');
  const [sortOrder, setSortOrder] = useState(0);
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [iconPreview, setIconPreview] = useState<string | null>(null);
  const [nameError, setNameError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      setSubmitError(t.categories.iconMaxSize);
      return;
    }
    setSubmitError('');
    setIconFile(file);
    setIconPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setNameError('');
    setSubmitError('');
    const trimmedName = name.trim();
    if (!trimmedName) {
      setNameError(t.categories.nameRequired);
      return;
    }
    const formData = new FormData();
    formData.append('name', trimmedName);
    formData.append('type', type);
    formData.append('description', description);
    formData.append('sortOrder', String(sortOrder));
    if (iconFile) formData.append('icon', iconFile);
    try {
      await createCategory(formData).unwrap();
      toast.push({ title: t.categories.createSuccess, variant: 'success' });
      setName('');
      setType('food');
      setDescription('');
      setSortOrder(0);
      setIconFile(null);
      if (iconPreview) URL.revokeObjectURL(iconPreview);
      setIconPreview(null);
      onClose();
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'data' in err
        ? String((err as { data?: { message?: string } }).data?.message ?? t.common.createFailed)
        : err instanceof Error ? err.message : t.common.createFailed;
      setSubmitError(msg);
    }
  };

  const handleClose = () => {
    if (iconPreview) URL.revokeObjectURL(iconPreview);
    onClose();
  };

  return (
    <Modal open={open} title={t.categories.addTitle} onClose={handleClose}>
      <form onSubmit={handleSubmit}>
        <div className="field" style={{ marginBottom: 16 }}>
          <div className="label">{t.categories.fieldName} *</div>
          <input
            className="input"
            value={name}
            onChange={(e) => { setName(e.target.value); setNameError(''); }}
            placeholder={t.categories.namePlaceholder}
          />
          {nameError ? <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 4 }}>{nameError}</div> : null}
        </div>
        <div className="field" style={{ marginBottom: 16 }}>
          <div className="label">{t.categories.fieldType} *</div>
          <select className="select" value={type} onChange={(e) => setType(e.target.value)}>
            {TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="field" style={{ marginBottom: 16 }}>
          <div className="label">{t.categories.iconHint}</div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png"
            onChange={onFileChange}
            style={{ fontSize: 14 }}
          />
          {iconPreview ? (
            <div style={{ marginTop: 8 }}>
              <img src={iconPreview} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8 }} />
            </div>
          ) : null}
        </div>
        <div className="field" style={{ marginBottom: 16 }}>
          <div className="label">{t.categories.fieldDescription}</div>
          <textarea
            className="input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder={t.categories.descPlaceholder}
          />
        </div>
        <div className="field" style={{ marginBottom: 16 }}>
          <div className="label">{t.categories.fieldSortOrder}</div>
          <input
            type="number"
            className="input"
            value={sortOrder}
            onChange={(e) => setSortOrder(Number(e.target.value) || 0)}
          />
        </div>
        {submitError ? (
          <div style={{ color: 'var(--danger)', fontSize: 14, marginBottom: 16 }}>{submitError}</div>
        ) : null}
        <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn" onClick={handleClose}>{t.common.cancel}</button>
          <button type="submit" className="btn btnPrimary" disabled={isLoading}>
            {isLoading ? t.common.creating : t.common.create}
          </button>
        </div>
      </form>
    </Modal>
  );
}
