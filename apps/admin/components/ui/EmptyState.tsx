'use client';

import type { ReactNode } from 'react';

type Props = {
  icon?: ReactNode;
  heading: string;
  subtext?: string;
  action?: ReactNode;
};

export function EmptyState({ icon, heading, subtext = 'Try adjusting filters.', action }: Props) {
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
        {subtext}
      </p>
      {action ? <div>{action}</div> : null}
    </div>
  );
}
