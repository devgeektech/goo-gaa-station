'use client';

import { Modal } from '@/components/ui/Modal';
import { useTranslations } from '@/lib/i18n/useTranslations';
import { formatT } from '@/lib/i18n/translations';

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
  const t = useTranslations();
  const name = vendorName ?? t.vendors.thisVendor;

  return (
    <Modal open={open} title={t.vendors.deleteTitle} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p className="muted" style={{ margin: 0 }}>
          {formatT(t.vendors.deleteDescSoft, { name })}
        </p>
        <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn" onClick={onClose}>{t.common.cancel}</button>
          <button type="button" className="btn" style={{ background: 'var(--danger)', color: 'white' }} onClick={onConfirm} disabled={loading}>
            {loading ? t.common.deleting : t.common.delete}
          </button>
        </div>
      </div>
    </Modal>
  );
}
