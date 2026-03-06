'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { hasError: boolean; error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="card" style={{ margin: 24, padding: 24, maxWidth: 480 }}>
          <h2 style={{ margin: '0 0 12px 0', fontSize: 20 }}>Something went wrong</h2>
          <p className="muted" style={{ marginBottom: 16 }}>
            {this.state.error?.message ?? 'An unexpected error occurred.'}
          </p>
          <button
            type="button"
            className="btn btnPrimary"
            onClick={() => window.location.reload()}
            aria-label="Reload page"
          >
            Reload page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
