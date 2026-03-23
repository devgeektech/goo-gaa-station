'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import Link from 'next/link';

type Props = { children: ReactNode; fallback?: ReactNode };
type State = { hasError: boolean; error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    if (typeof console !== 'undefined') {
      console.error('[ErrorBoundary]', error, errorInfo);
    }
  }

  render() {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) return this.props.fallback;
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
          <h2 style={{ margin: '0 0 8px 0', fontSize: 20, fontWeight: 800 }}>Something went wrong</h2>
          <p className="muted" style={{ marginBottom: 16 }}>
            {this.state.error.message}
          </p>
          <Link href="/" className="btn btnPrimary">
            Back to dashboard
          </Link>
        </div>
      );
    }
    return this.props.children;
  }
}
