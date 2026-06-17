'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { useTranslations } from '@/lib/i18n/useTranslations';
import { formatT } from '@/lib/i18n/translations';

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
  const t = useTranslations();
  const [reason, setReason] = useState('');

  const handleConfirm = () => {
    const trimmed = reason.trim();
    if (trimmed.length < MIN_REASON_LENGTH) return;
    onConfirm(trimmed);
  };

  const valid = reason.trim().length >= MIN_REASON_LENGTH;

  return (
    <Modal open={open} title={t.drivers.rejectTitle} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {driverName ? <p className="muted">{formatT(t.drivers.rejectDriverName, { name: driverName })}</p> : null}
        <div className="field">
          <label className="label">{t.drivers.rejectReason}</label>
          <textarea
            className="textarea"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t.drivers.rejectPlaceholder}
            required
            minLength={MIN_REASON_LENGTH}
            rows={4}
          />
        </div>
        <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn" onClick={onClose}>{t.common.cancel}</button>
          <button type="button" className="btn btnDanger" onClick={handleConfirm} disabled={!valid || loading}>
            {loading ? t.common.rejecting : t.drivers.reject}
          </button>
        </div>
      </div>
    </Modal>
  );
}
