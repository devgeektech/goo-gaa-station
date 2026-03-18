'use client';

import { useState } from 'react';
import { useDeleteCategoryMutation } from '@/store/api';
import type { CategoryItem } from '@/store/api';
import { useToast } from '@/components/ui/Toast';

type Props = {
  category: CategoryItem | null;
  open: boolean;
  onClose: () => void;
  onDeleted?: () => void;
};

export function DeleteCategoryDialog({ category, open, onClose, onDeleted }: Props) {
  const [deleteCategory, { isLoading }] = useDeleteCategoryMutation();
  const toast = useToast();
  const [blockedVendors, setBlockedVendors] = useState<Array<{ _id: string; name: string }>>([]);
  const [blockedMode, setBlockedMode] = useState(false);

  const handleConfirm = async () => {
    if (!category) return;
    setBlockedVendors([]);
    setBlockedMode(false);
    try {
      await deleteCategory(category._id).unwrap();
      toast.push({ title: 'Category deleted', variant: 'success' });
      onClose();
      onDeleted?.();
    } catch (err: unknown) {
      const e = err as { status?: number; data?: { vendors?: Array<{ _id: string; name: string }> } };
      if (e.status === 409 && Array.isArray(e.data?.vendors)) {
        setBlockedVendors(e.data.vendors);
        setBlockedMode(true);
      } else {
        toast.push({
          title: 'Delete failed',
          description: e?.data && typeof e.data === 'object' && 'message' in e.data ? String((e.data as { message?: string }).message) : 'Unknown error',
          variant: 'danger',
        });
      }
    }
  };

  const handleClose = () => {
    setBlockedVendors([]);
    setBlockedMode(false);
    onClose();
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-dialog-title"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onMouseDown={(e) => e.target === e.currentTarget && handleClose()}
    >
      <div
        className="card"
        style={{
          maxWidth: 440,
          width: '90%',
          padding: 24,
        }}
      >
        {blockedMode && category ? (
          <>
            <h2 id="delete-dialog-title" style={{ margin: '0 0 12px 0', fontSize: 18 }}>
              Cannot delete {category.name}
            </h2>
            <p className="muted" style={{ marginBottom: 16 }}>
              This category is used by the following vendors. Remove the category from these vendors first:
            </p>
            <ul style={{ margin: '0 0 20px 0', paddingLeft: 20 }}>
              {blockedVendors.map((v) => (
                <li key={v._id} style={{ marginBottom: 4 }}>{v.name}</li>
              ))}
            </ul>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" className="btn btnPrimary" onClick={handleClose}>Close</button>
            </div>
          </>
        ) : (
          <>
            <h2 id="delete-dialog-title" style={{ margin: '0 0 12px 0', fontSize: 18 }}>
              Are you sure you want to delete {category?.name ?? 'this category'}?
            </h2>
            <p className="muted" style={{ marginBottom: 20 }}>This cannot be undone.</p>
            <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" className="btn" onClick={handleClose}>Cancel</button>
              <button type="button" className="btn btnDanger" onClick={handleConfirm} disabled={isLoading}>
                {isLoading ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
