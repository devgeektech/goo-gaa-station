'use client';

import { Modal } from '@/components/ui/Modal';

export function DeleteDriverDialog({
  open,
  driverName,
  onClose,
  onConfirm,
  loading,
}: {
  open: boolean;
  driverName: string;
  onClose: () => void;
  onConfirm: () => void;
  loading: boolean;
}) {
  return (
    <Modal open={open} title="Delete Driver" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p className="muted">
          Soft delete. The driver will be hidden from the default list. You can filter by status &quot;Deleted&quot; to see them.
          {driverName ? ` Delete ${driverName}?` : ''}
        </p>
        <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btnDanger" onClick={onConfirm} disabled={loading}>
            {loading ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
