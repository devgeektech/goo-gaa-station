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
import { getErrorMessage } from '@/lib/api/client';

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

function publicFileBase(): string {
  const base = typeof process !== 'undefined' ? (process.env.NEXT_PUBLIC_API_URL ?? '') : '';
  return base.replace(/\/api\/v1\/?$/, '');
}

function imageSrc(url: string | null | undefined): string | null {
  if (!url) return null;
  return url.startsWith('http') ? url : `${publicFileBase()}${url}`;
}

function validateForm(form: BannerFormState, occupiedPositions: Set<number>, editId?: string): string | null {
  if (!form.heading.trim() || !form.text.trim() || !form.buttonText.trim()) return 'Heading, text and button text are required.';
  const pos = Number(form.position);
  if (!Number.isInteger(pos) || pos < 1) return 'Position must be a positive integer.';
  if (!editId && occupiedPositions.has(pos)) return 'This position is already in use by another banner.';
  try {
    const parsed = new URL(form.buttonUrl.trim());
    if (!['http:', 'https:'].includes(parsed.protocol)) return 'Button URL must start with http or https.';
  } catch {
    return 'Please enter a valid button URL.';
  }
  return null;
}

export default function BannersPage() {
  const toast = useToast();
  const { data: banners = [], isLoading } = useGetBannersQuery();
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
    const err = validateForm(form, occupiedPositions);
    if (err) {
      toast.push({ title: err, variant: 'warning' });
      return;
    }
    if (!form.imageFile) {
      toast.push({ title: 'Image is required for new banner.', variant: 'warning' });
      return;
    }
    try {
      await createBanner(makeFormData(form)).unwrap();
      toast.push({ title: 'Banner created', variant: 'success' });
      setCreateOpen(false);
      setForm(EMPTY_FORM);
    } catch (e) {
      toast.push({ title: 'Create failed', description: getErrorMessage(e), variant: 'danger' });
    }
  };

  const handleUpdate = async () => {
    if (!editing) return;
    const positionsExcludingCurrent = new Set(Array.from(occupiedPositions).filter((p) => p !== editing.position));
    const err = validateForm(form, positionsExcludingCurrent, editing._id);
    if (err) {
      toast.push({ title: err, variant: 'warning' });
      return;
    }
    try {
      await updateBanner({ id: editing._id, body: makeFormData(form) }).unwrap();
      toast.push({ title: 'Banner updated', variant: 'success' });
      setEditOpen(false);
      setEditing(null);
      setForm(EMPTY_FORM);
    } catch (e) {
      toast.push({ title: 'Update failed', description: getErrorMessage(e), variant: 'danger' });
    }
  };

  const onToggle = async (banner: BannerItem) => {
    try {
      await toggleActive(banner._id).unwrap();
      toast.push({ title: `Banner ${banner.isActive ? 'disabled' : 'enabled'}`, variant: 'success' });
    } catch (e) {
      toast.push({ title: 'Toggle failed', description: getErrorMessage(e), variant: 'danger' });
    }
  };

  const onDelete = async (banner: BannerItem) => {
    const ok = window.confirm(`Delete banner "${banner.heading}"?`);
    if (!ok) return;
    try {
      await deleteBanner(banner._id).unwrap();
      toast.push({ title: 'Banner deleted', variant: 'success' });
    } catch (e) {
      toast.push({ title: 'Delete failed', description: getErrorMessage(e), variant: 'danger' });
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div className="row adminPageHeader" style={{ justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: 'var(--text)' }}>Banners</h1>
          <div className="muted" style={{ marginTop: 6 }}>
            Manage app carousel banners with unique positions and active toggle.
          </div>
        </div>
        <button className="btn btnPrimary" onClick={openCreate}>
          <Plus size={18} aria-hidden /> Add Banner
        </button>
      </div>

      <div className="card">
        <div className="cardBody">
          {isLoading ? (
            <div className="muted">Loading banners…</div>
          ) : banners.length === 0 ? (
            <div className="muted">No banners yet.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Position</th>
                    <th>Image</th>
                    <th>Heading</th>
                    <th>Button</th>
                    <th>Status</th>
                    <th style={{ width: 170 }}>Actions</th>
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
                            <ImageIcon size={16} /> No image
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
                        <Switch checked={b.isActive} onChange={() => void onToggle(b)} disabled={toggling} label={b.isActive ? 'Active' : 'Inactive'} />
                      </td>
                      <td>
                        <div className="row" style={{ gap: 8 }}>
                          <button className="btn" onClick={() => openEdit(b)}>
                            <Pencil size={16} /> Edit
                          </button>
                          <button className="btn" onClick={() => void onDelete(b)} disabled={deleting}>
                            <Trash2 size={16} /> Delete
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

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create Banner">
        <BannerForm form={form} setForm={setForm} />
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 14 }}>
          <button className="btn" onClick={() => setCreateOpen(false)}>Cancel</button>
          <button className="btn btnPrimary" onClick={() => void handleCreate()} disabled={creating}>
            {creating ? 'Creating…' : 'Create'}
          </button>
        </div>
      </Modal>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit Banner">
        <BannerForm form={form} setForm={setForm} existingImage={editing?.image ?? null} />
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 14 }}>
          <button className="btn" onClick={() => setEditOpen(false)}>Cancel</button>
          <button className="btn btnPrimary" onClick={() => void handleUpdate()} disabled={updating}>
            {updating ? 'Saving…' : 'Save'}
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
  const preview = form.imageFile ? URL.createObjectURL(form.imageFile) : imageSrc(existingImage ?? null);
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="field">
        <div className="label">Image</div>
        <input
          className="input"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => setForm((f) => ({ ...f, imageFile: e.target.files?.[0] ?? null }))}
        />
        {preview ? (
          <img src={preview} alt="Banner preview" style={{ marginTop: 8, width: '100%', maxHeight: 140, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }} />
        ) : null}
      </div>

      <div className="field">
        <div className="label">Heading</div>
        <input className="input" value={form.heading} onChange={(e) => setForm((f) => ({ ...f, heading: e.target.value }))} />
      </div>

      <div className="field">
        <div className="label">Text</div>
        <textarea className="input" rows={3} value={form.text} onChange={(e) => setForm((f) => ({ ...f, text: e.target.value }))} />
      </div>

      <div className="field">
        <div className="label">Button Text</div>
        <input className="input" value={form.buttonText} onChange={(e) => setForm((f) => ({ ...f, buttonText: e.target.value }))} />
      </div>

      <div className="field">
        <div className="label">Button URL</div>
        <input className="input" value={form.buttonUrl} onChange={(e) => setForm((f) => ({ ...f, buttonUrl: e.target.value }))} placeholder="https://example.com/promo" />
      </div>

      <div className="field">
        <div className="label">Position</div>
        <input className="input" value={form.position} onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))} inputMode="numeric" />
      </div>

      <Switch
        checked={form.isActive}
        onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
        label={form.isActive ? 'Active' : 'Inactive'}
      />
    </div>
  );
}
