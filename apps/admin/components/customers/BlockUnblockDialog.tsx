'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';

export function BlockUnblockDialog({
  open,
  type,
  currentStatus,
  currentReason,
  onClose,
  onConfirm,
  loading,
}: {
  open: boolean;
  type: 'customer' | 'driver';
  currentStatus: string;
  currentReason?: string | null;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  loading: boolean;
}) {
  const [reason, setReason] = useState('');
  const isBlocking = currentStatus !== 'blocked';

  const handleConfirm = () => {
    if (isBlocking && !reason.trim()) return;
    onConfirm(reason.trim());
  };

  return (
    <Modal
      open={open}
      title={isBlocking ? `Block ${type === 'customer' ? 'Customer' : 'Driver'}` : `Unblock ${type === 'customer' ? 'Customer' : 'Driver'}`}
      onClose={onClose}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {!isBlocking && currentReason ? (
          <div className="muted" style={{ fontSize: 13 }}>
            Current reason: {currentReason}
          </div>
        ) : null}
        {isBlocking ? (
          <div className="field">
            <label className="label">Reason * (required when blocking)</label>
            <textarea
              className="textarea"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Enter reason for blocking..."
              required
              rows={3}
            />
          </div>
        ) : null}
        <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btnPrimary"
            onClick={handleConfirm}
            disabled={loading || (isBlocking && !reason.trim())}
          >
            {loading ? 'Updating…' : isBlocking ? 'Block' : 'Unblock'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
