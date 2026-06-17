'use client';

import { Modal } from '@/components/ui/Modal';
import { useTranslations } from '@/lib/i18n/useTranslations';
import { formatT } from '@/lib/i18n/translations';

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
  const t = useTranslations();

  return (
    <Modal open={open} title={t.customers.deleteTitle} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p className="muted">
          {t.customers.deleteDescSoft}
          {customerName ? ` ${formatT(t.customers.deleteConfirmName, { name: customerName })}` : ''}
        </p>
        <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn" onClick={onClose}>
            {t.common.cancel}
          </button>
          <button type="button" className="btn btnDanger" onClick={onConfirm} disabled={loading}>
            {loading ? t.common.deleting : t.common.delete}
          </button>
        </div>
      </div>
    </Modal>
  );
}
