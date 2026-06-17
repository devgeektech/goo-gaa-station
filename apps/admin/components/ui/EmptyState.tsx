'use client';

import type { ReactNode } from 'react';
import { useTranslations } from '@/lib/i18n/useTranslations';

type Props = {
  icon?: ReactNode;
  heading: string;
  subtext?: string;
  action?: ReactNode;
};

export function EmptyState({ icon, heading, subtext, action }: Props) {
  const t = useTranslations();
  const resolvedSubtext = subtext ?? t.common.tryFilters;
  return (
    <div
      className="card"
      style={{
        padding: 32,
        textAlign: 'center',
        background: 'var(--panel)',
      }}
    >
      {icon ? (
        <div style={{ marginBottom: 16, color: 'var(--muted)' }}>{icon}</div>
      ) : null}
      <h3 style={{ margin: '0 0 8px 0', fontSize: 18 }}>{heading}</h3>
      <p className="muted" style={{ marginBottom: action ? 16 : 0 }}>
        {resolvedSubtext}
      </p>
      {action ? <div>{action}</div> : null}
    </div>
  );
}
