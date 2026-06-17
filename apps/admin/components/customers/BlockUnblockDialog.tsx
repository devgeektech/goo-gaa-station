'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { useTranslations } from '@/lib/i18n/useTranslations';

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
  type: 'customer' | 'driver' | 'vendor';
  currentStatus: string;
  currentReason?: string | null;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  loading: boolean;
}) {
  const t = useTranslations();
  const [reason, setReason] = useState('');
  const isBlocking = currentStatus !== 'blocked';

  const title =
    type === 'customer'
      ? isBlocking
        ? t.customers.blockTitle
        : t.customers.unblockTitle
      : type === 'driver'
        ? isBlocking
          ? t.customers.blockDriver
          : t.customers.unblockDriver
        : isBlocking
          ? t.customers.blockVendor
          : t.customers.unblockVendor;

  const handleConfirm = () => {
    if (isBlocking && !reason.trim()) return;
    onConfirm(reason.trim());
  };

  return (
    <Modal open={open} title={title} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {!isBlocking && currentReason ? (
          <div className="muted" style={{ fontSize: 13 }}>
            {t.customers.currentReason} {currentReason}
          </div>
        ) : null}
        {isBlocking ? (
          <div className="field">
            <label className="label">{t.customers.blockReasonRequired}</label>
            <textarea
              className="textarea"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t.customers.blockPlaceholder}
              required
              rows={3}
            />
          </div>
        ) : null}
        <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn" onClick={onClose}>
            {t.common.cancel}
          </button>
          <button
            type="button"
            className="btn btnPrimary"
            onClick={handleConfirm}
            disabled={loading || (isBlocking && !reason.trim())}
          >
            {loading ? t.customers.updating : isBlocking ? t.customers.block : t.customers.unblock}
          </button>
        </div>
      </div>
    </Modal>
  );
}
