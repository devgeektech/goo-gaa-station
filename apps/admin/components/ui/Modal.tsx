'use client';

import type { PropsWithChildren, ReactNode } from 'react';
import { X } from 'lucide-react';
import { useTranslations } from '@/lib/i18n/useTranslations';

export function Modal({
  open,
  title,
  onClose,
  children,
}: PropsWithChildren<{
  open: boolean;
  title: ReactNode;
  onClose: () => void;
}>) {
  const t = useTranslations();
  if (!open) return null;
  return (
    <div
      className="modalOverlay"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal">
        <div className="modalHeader">
          <div className="modalTitle">{title}</div>
          <button type="button" className="btn" onClick={onClose} aria-label={t.modal.close}>
            <X size={18} aria-hidden />
          </button>
        </div>
        <div className="modalBody">{children}</div>
      </div>
    </div>
  );
}
