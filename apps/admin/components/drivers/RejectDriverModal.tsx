'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';

const MIN_REASON_LENGTH = 10;

export function RejectDriverModal({
  open,
  driverName,
  onClose,
  onConfirm,
  loading,
}: {
  open: boolean;
  driverName: string;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  loading: boolean;
}) {
  const [reason, setReason] = useState('');

  const handleConfirm = () => {
    const trimmed = reason.trim();
    if (trimmed.length < MIN_REASON_LENGTH) return;
    onConfirm(trimmed);
  };

  const valid = reason.trim().length >= MIN_REASON_LENGTH;

  return (
    <Modal open={open} title="Reject Driver" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {driverName ? <p className="muted">Reject {driverName}. The reason will be stored and the driver can be notified (e.g. via FCM).</p> : null}
        <div className="field">
          <label className="label">Reason * (min {MIN_REASON_LENGTH} characters)</label>
          <textarea
            className="textarea"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Enter reason for rejection..."
            required
            minLength={MIN_REASON_LENGTH}
            rows={4}
          />
        </div>
        <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btnDanger" onClick={handleConfirm} disabled={!valid || loading}>
            {loading ? 'Rejecting…' : 'Reject'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
