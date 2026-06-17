'use client';

import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { useTranslations } from '@/lib/i18n/useTranslations';

export function ErrorBoundaryFallback({ message }: { message: string }) {
  const t = useTranslations();
  return (
    <div
      className="card"
      style={{
        maxWidth: 560,
        margin: '24px auto',
        padding: 32,
        textAlign: 'center',
      }}
    >
      <div style={{ marginBottom: 16, color: 'var(--danger)' }}>
        <AlertTriangle size={48} aria-hidden />
      </div>
      <h2 style={{ margin: '0 0 8px 0', fontSize: 20, fontWeight: 800 }}>{t.errorBoundary.title}</h2>
      <p className="muted" style={{ marginBottom: 16 }}>
        {message}
      </p>
      <Link href="/" className="btn btnPrimary">
        {t.errorBoundary.back}
      </Link>
    </div>
  );
}
