'use client';

import { Modal } from '@/components/ui/Modal';

export function DeleteVendorDialog({
  open,
  vendorName,
  onClose,
  onConfirm,
  loading,
}: {
  open: boolean;
  vendorName?: string | null;
  onClose: () => void;
  onConfirm: () => void;
  loading: boolean;
}) {
  return (
    <Modal open={open} title="Delete vendor" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p className="muted" style={{ margin: 0 }}>
          Are you sure you want to delete {vendorName ? <strong>{vendorName}</strong> : 'this vendor'}? This will soft-delete the vendor.
        </p>
        <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn" style={{ background: 'var(--danger)', color: 'white' }} onClick={onConfirm} disabled={loading}>
            {loading ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
