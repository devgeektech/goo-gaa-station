'use client';

import { useMemo, useState } from 'react';
import { Image as ImageIcon, Pencil, Plus, Trash2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Switch } from '@/components/ui/Switch';
import { useToast } from '@/components/ui/Toast';
import {
  useCreateBannerMutation,
  useDeleteBannerMutation,
  useGetBannersQuery,
  useToggleBannerActiveMutation,
  useUpdateBannerMutation,
  type BannerItem,
} from '@/store/api';
import { apiErrorToast, getErrorMessage } from '@/lib/api/client';
import { useTranslations } from '@/lib/i18n/useTranslations';
import { formatT } from '@/lib/i18n/translations';
import type { translationsEn } from '@/lib/i18n/translations/en';

type BannerFormState = {
  heading: string;
  text: string;
  buttonText: string;
  buttonUrl: string;
  position: string;
  isActive: boolean;
  imageFile: File | null;
};

const EMPTY_FORM: BannerFormState = {
  heading: '',
  text: '',
  buttonText: '',
  buttonUrl: '',
  position: '1',
  isActive: true,
  imageFile: null,
};

/** Matches API banner upload limit (MAX_FILE_SIZE_10MB). */
const BANNER_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const BANNER_IMAGE_MAX_MB = 10;
const BANNER_IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp';

type T = typeof translationsEn;

function validateBannerImageFile(file: File | null, t: T): string | null {
  if (!file) return null;
  if (file.size > BANNER_IMAGE_MAX_BYTES) {
    return formatT(t.banners.imageTooLargeMb, { size: (file.size / (1024 * 1024)).toFixed(1), max: BANNER_IMAGE_MAX_MB });
  }
  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  if (file.type && !allowed.includes(file.type)) {
    return t.banners.imageFormat;
  }
  return null;
}

function publicFileBase(): string {
  const base = typeof process !== 'undefined' ? (process.env.NEXT_PUBLIC_API_URL ?? '') : '';
  return base.replace(/\/api\/v1\/?$/, '');
}

function imageSrc(url: string | null | undefined): string | null {
  if (!url) return null;
  return url.startsWith('http') ? url : `${publicFileBase()}${url}`;
}

function validateForm(form: BannerFormState, occupiedPositions: Set<number>, t: T, editId?: string): string | null {
  if (!form.heading.trim() || !form.text.trim() || !form.buttonText.trim()) return t.banners.validationRequired;
  const pos = Number(form.position);
  if (!Number.isInteger(pos) || pos < 1) return t.banners.validationPosition;
  if (!editId && occupiedPositions.has(pos)) return t.banners.validationPositionTaken;
  try {
    const parsed = new URL(form.buttonUrl.trim());
    if (!['http:', 'https:'].includes(parsed.protocol)) return t.banners.validationUrlProtocol;
  } catch {
    return t.banners.validationUrlInvalid;
  }
  return null;
}

export default function BannersPage() {
  const t = useTranslations();
  const toast = useToast();
  const pushApiError = (err: unknown, fallback: string) => {
    const { title, description } = apiErrorToast(err, fallback, { uploadMaxMb: BANNER_IMAGE_MAX_MB });
    toast.push({ title, description, variant: 'danger' });
  };

  const { data: banners = [], isLoading, isError, error: loadError } = useGetBannersQuery();
  const [createBanner, { isLoading: creating }] = useCreateBannerMutation();
  const [updateBanner, { isLoading: updating }] = useUpdateBannerMutation();
  const [toggleActive, { isLoading: toggling }] = useToggleBannerActiveMutation();
  const [deleteBanner, { isLoading: deleting }] = useDeleteBannerMutation();

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState<BannerFormState>(EMPTY_FORM);
  const [editing, setEditing] = useState<BannerItem | null>(null);

  const occupiedPositions = useMemo(() => new Set(banners.map((b) => b.position)), [banners]);

  const openCreate = () => {
    setForm({ ...EMPTY_FORM, position: String((banners[banners.length - 1]?.position ?? 0) + 1) });
    setCreateOpen(true);
  };

  const openEdit = (banner: BannerItem) => {
    setEditing(banner);
    setForm({
      heading: banner.heading,
      text: banner.text,
      buttonText: banner.buttonText,
      buttonUrl: banner.buttonUrl,
      position: String(banner.position),
      isActive: banner.isActive,
      imageFile: null,
    });
    setEditOpen(true);
  };

  const makeFormData = (f: BannerFormState): FormData => {
    const fd = new FormData();
    fd.append('heading', f.heading.trim());
    fd.append('text', f.text.trim());
    fd.append('buttonText', f.buttonText.trim());
    fd.append('buttonUrl', f.buttonUrl.trim());
    fd.append('position', String(Number(f.position)));
    fd.append('isActive', String(f.isActive));
    if (f.imageFile) fd.append('image', f.imageFile);
    return fd;
  };

  const handleCreate = async () => {
    const err = validateForm(form, occupiedPositions, t);
    if (err) {
      toast.push({ title: err, variant: 'warning' });
      return;
    }
    if (!form.imageFile) {
      toast.push({ title: t.banners.addImagePrompt, variant: 'warning' });
      return;
    }
    const imageErr = validateBannerImageFile(form.imageFile, t);
    if (imageErr) {
      toast.push({ title: imageErr, variant: 'warning' });
      return;
    }
    try {
      await createBanner(makeFormData(form)).unwrap();
      toast.push({ title: t.banners.createSuccess, variant: 'success' });
      setCreateOpen(false);
      setForm(EMPTY_FORM);
    } catch (e) {
      pushApiError(e, t.common.createFailed);
    }
  };

  const handleUpdate = async () => {
    if (!editing) return;
    const positionsExcludingCurrent = new Set(Array.from(occupiedPositions).filter((p) => p !== editing.position));
    const err = validateForm(form, positionsExcludingCurrent, t, editing._id);
    if (err) {
      toast.push({ title: err, variant: 'warning' });
      return;
    }
    if (form.imageFile) {
      const imageErr = validateBannerImageFile(form.imageFile, t);
      if (imageErr) {
        toast.push({ title: imageErr, variant: 'warning' });
        return;
      }
    }
    try {
      await updateBanner({ id: editing._id, body: makeFormData(form) }).unwrap();
      toast.push({ title: t.banners.updateSuccess, variant: 'success' });
      setEditOpen(false);
      setEditing(null);
      setForm(EMPTY_FORM);
    } catch (e) {
      pushApiError(e, t.common.updateFailed);
    }
  };

  const onToggle = async (banner: BannerItem) => {
    try {
      await toggleActive(banner._id).unwrap();
      toast.push({ title: banner.isActive ? t.banners.toggleDisabled : t.banners.toggleEnabled, variant: 'success' });
    } catch (e) {
      pushApiError(e, t.banners.toggleFailed);
    }
  };

  const onDelete = async (banner: BannerItem) => {
    const ok = window.confirm(formatT(t.banners.deleteConfirm, { heading: banner.heading }));
    if (!ok) return;
    try {
      await deleteBanner(banner._id).unwrap();
      toast.push({ title: t.banners.deleteSuccess, variant: 'success' });
    } catch (e) {
      pushApiError(e, t.common.deleteFailed);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div className="row adminPageHeader" style={{ justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: 'var(--text)' }}>{t.banners.title}</h1>
          <div className="muted" style={{ marginTop: 6 }}>
            {t.banners.subtitleCarousel}
          </div>
        </div>
        <button className="btn btnPrimary" onClick={openCreate}>
          <Plus size={18} aria-hidden /> {t.banners.addBanner}
        </button>
      </div>

      <div className="card">
        <div className="cardBody">
          {isLoading ? (
            <div className="muted">{t.banners.loading}</div>
          ) : isError ? (
            <div style={{ color: 'var(--danger)' }}>{getErrorMessage(loadError)}</div>
          ) : banners.length === 0 ? (
            <div className="muted">{t.empty.banners}</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>{t.banners.position}</th>
                    <th>{t.banners.image}</th>
                    <th>{t.banners.heading}</th>
                    <th>{t.banners.button}</th>
                    <th>{t.common.status}</th>
                    <th style={{ width: 170 }}>{t.common.actions}</th>
                  </tr>
                </thead>
                <tbody>
                  {banners.map((b) => (
                    <tr key={b._id}>
                      <td>#{b.position}</td>
                      <td>
                        {imageSrc(b.image) ? (
                          <img src={imageSrc(b.image)!} alt={b.heading} style={{ width: 120, height: 56, borderRadius: 8, objectFit: 'cover', border: '1px solid var(--border)' }} />
                        ) : (
                          <div className="muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <ImageIcon size={16} /> {t.common.noImage}
                          </div>
                        )}
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{b.heading}</div>
                        <div className="muted" style={{ fontSize: 12, maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {b.text}
                        </div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{b.buttonText}</div>
                        <a href={b.buttonUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>
                          {b.buttonUrl}
                        </a>
                      </td>
                      <td>
                        <Switch checked={b.isActive} onChange={() => void onToggle(b)} disabled={toggling} label={b.isActive ? t.status.banner.active : t.status.banner.inactive} />
                      </td>
                      <td>
                        <div className="row" style={{ gap: 8 }}>
                          <button className="btn" onClick={() => openEdit(b)}>
                            <Pencil size={16} /> {t.common.edit}
                          </button>
                          <button className="btn" onClick={() => void onDelete(b)} disabled={deleting}>
                            <Trash2 size={16} /> {t.common.delete}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title={t.banners.createTitle}>
        <BannerForm form={form} setForm={setForm} />
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 14 }}>
          <button className="btn" onClick={() => setCreateOpen(false)}>{t.common.cancel}</button>
          <button className="btn btnPrimary" onClick={() => void handleCreate()} disabled={creating}>
            {creating ? t.common.creating : t.common.create}
          </button>
        </div>
      </Modal>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title={t.banners.editTitle}>
        <BannerForm form={form} setForm={setForm} existingImage={editing?.image ?? null} />
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 14 }}>
          <button className="btn" onClick={() => setEditOpen(false)}>{t.common.cancel}</button>
          <button className="btn btnPrimary" onClick={() => void handleUpdate()} disabled={updating}>
            {updating ? t.common.saving : t.common.save}
          </button>
        </div>
      </Modal>
    </div>
  );
}

function BannerForm({
  form,
  setForm,
  existingImage,
}: {
  form: BannerFormState;
  setForm: React.Dispatch<React.SetStateAction<BannerFormState>>;
  existingImage?: string | null;
}) {
  const t = useTranslations();
  const [imageError, setImageError] = useState<string | null>(null);
  const preview = form.imageFile ? URL.createObjectURL(form.imageFile) : imageSrc(existingImage ?? null);

  const onImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setForm((f) => ({ ...f, imageFile: file }));
    setImageError(file ? validateBannerImageFile(file, t) : null);
  };

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="field">
        <div className="label">{t.banners.fieldImage}</div>
        <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
          {formatT(t.banners.imageMaxHint, { max: BANNER_IMAGE_MAX_MB })}
        </div>
        <input className="input" type="file" accept={BANNER_IMAGE_ACCEPT} onChange={onImageChange} />
        {imageError ? (
          <div style={{ marginTop: 6, fontSize: 13, color: 'var(--danger)' }}>{imageError}</div>
        ) : null}
        {preview ? (
          <img src={preview} alt={t.banners.bannerPreview} style={{ marginTop: 8, width: '100%', maxHeight: 140, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }} />
        ) : null}
      </div>

      <div className="field">
        <div className="label">{t.banners.fieldHeading}</div>
        <input className="input" value={form.heading} onChange={(e) => setForm((f) => ({ ...f, heading: e.target.value }))} />
      </div>

      <div className="field">
        <div className="label">{t.banners.fieldText}</div>
        <textarea className="input" rows={3} value={form.text} onChange={(e) => setForm((f) => ({ ...f, text: e.target.value }))} />
      </div>

      <div className="field">
        <div className="label">{t.banners.fieldButtonText}</div>
        <input className="input" value={form.buttonText} onChange={(e) => setForm((f) => ({ ...f, buttonText: e.target.value }))} />
      </div>

      <div className="field">
        <div className="label">{t.banners.fieldButtonUrl}</div>
        <input className="input" value={form.buttonUrl} onChange={(e) => setForm((f) => ({ ...f, buttonUrl: e.target.value }))} placeholder={t.banners.buttonUrlPlaceholder} />
        <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{t.banners.buttonUrlHint}</div>
      </div>

      <div className="field">
        <div className="label">{t.banners.fieldPosition}</div>
        <input className="input" value={form.position} onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))} inputMode="numeric" />
        <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{t.banners.positionHint}</div>
      </div>

      <Switch
        checked={form.isActive}
        onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
        label={form.isActive ? t.status.banner.active : t.status.banner.inactive}
      />
    </div>
  );
}
