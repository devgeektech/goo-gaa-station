'use client';

import { Modal } from '@/components/ui/Modal';
import { useTranslations } from '@/lib/i18n/useTranslations';
import { formatT } from '@/lib/i18n/translations';

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
  const t = useTranslations();
  return (
    <Modal open={open} title={t.drivers.deleteTitle} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p className="muted">
          {t.drivers.deleteDescLong}
          {driverName ? ` ${formatT(t.drivers.deleteDriverConfirm, { name: driverName })}` : ''}
        </p>
        <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn" onClick={onClose}>{t.common.cancel}</button>
          <button type="button" className="btn btnDanger" onClick={onConfirm} disabled={loading}>
            {loading ? t.common.deleting : t.common.delete}
          </button>
        </div>
      </div>
    </Modal>
  );
}
