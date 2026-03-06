'use client';

import type { PropsWithChildren } from 'react';
import { createContext, useCallback, useContext, useMemo, useState } from 'react';

type ToastItem = { id: string; title: string; description?: string; variant?: 'default' | 'success' | 'danger' };
type ToastContextValue = { push: (t: Omit<ToastItem, 'id'>) => void };

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: PropsWithChildren) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const push = useCallback((t: Omit<ToastItem, 'id'>) => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const item: ToastItem = { id, ...t };
    setItems((prev) => [item, ...prev].slice(0, 5));
    window.setTimeout(() => {
      setItems((prev) => prev.filter((x) => x.id !== id));
    }, 2800);
  }, []);

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        style={{
          position: 'fixed',
          right: 16,
          bottom: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          zIndex: 2000,
          width: 360,
          maxWidth: 'calc(100vw - 32px)',
        }}
      >
        {items.map((t) => (
          <div
            key={t.id}
            className="card"
            style={{
              padding: 14,
              borderLeft:
                t.variant === 'success'
                  ? '4px solid var(--success)'
                  : t.variant === 'danger'
                    ? '4px solid var(--danger)'
                    : '4px solid var(--primary)',
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 4 }}>{t.title}</div>
            {t.description ? <div className="muted">{t.description}</div> : null}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

