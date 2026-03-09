'use client';

import { Modal } from '@/components/ui/Modal';

export function DeleteCustomerDialog({
  open,
  customerName,
  onClose,
  onConfirm,
  loading,
}: {
  open: boolean;
  customerName: string;
  onClose: () => void;
  onConfirm: () => void;
  loading: boolean;
}) {
  return (
    <Modal open={open} title="Delete Customer" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p className="muted">
          Soft delete. The customer will be hidden from the default list. You can toggle &quot;Show deleted&quot; to see them again.
          {customerName ? ` Delete ${customerName}?` : ''}
        </p>
        <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btnDanger" onClick={onConfirm} disabled={loading}>
            {loading ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
