'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiClient, getErrorMessage } from '@/lib/api/client';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await apiClient.post('/auth/admin/login', { email, password });
      router.push('/');
      router.refresh();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: 'linear-gradient(135deg, var(--primary-light) 0%, var(--bg) 50%, #fff 100%)',
      }}
    >
      <div
        className="card"
        style={{
          width: 'min(420px, 100%)',
          padding: 32,
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        <div style={{ marginBottom: 8 }}>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: 'var(--primary)' }}>
            DeliverEats Admin
          </h1>
          <p className="muted" style={{ marginTop: 8, fontSize: 14 }}>
            Sign in with your admin account
          </p>
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="field">
            <label className="label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@delivereats.com"
              required
              autoComplete="email"
            />
          </div>
          <div className="field">
            <label className="label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>
          {error ? (
            <div
              style={{
                padding: 12,
                background: 'var(--danger-light)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--danger)',
                fontSize: 14,
                color: 'var(--danger)',
              }}
            >
              {error}
            </div>
          ) : null}
          <button type="submit" className="btn btnPrimary" disabled={loading} style={{ padding: 12 }}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p className="muted" style={{ marginTop: 20, fontSize: 13 }}>
          Default after seed: <code style={{ background: 'var(--bg)', padding: '4px 8px', borderRadius: 6, fontSize: 12 }}>admin@delivereats.com</code> / <code style={{ background: 'var(--bg)', padding: '4px 8px', borderRadius: 6, fontSize: 12 }}>Admin@123!</code>
        </p>
        <Link href="/" className="btn" style={{ marginTop: 16, display: 'inline-block' }}>
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
