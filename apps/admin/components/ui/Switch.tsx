'use client';

import type { InputHTMLAttributes } from 'react';

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  'aria-label'?: string;
};

export function Switch({ label, className = '', ...props }: Props) {
  return (
    <label className={`switchWrap ${className}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
      <input type="checkbox" role="switch" className="switchInput" {...props} />
      <span className="switchTrack" aria-hidden />
      {label ? <span className="muted" style={{ fontSize: 14 }}>{label}</span> : null}
    </label>
  );
}
