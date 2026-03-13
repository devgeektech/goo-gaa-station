'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTheme } from 'next-themes';
import { Sun, Moon } from 'lucide-react';
import { apiClient, getErrorMessage } from '@/lib/api/client';

export default function LoginPage() {
  const router = useRouter();
  const { setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => setMounted(true), []);

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
    <div className="loginPage">
      <button
        type="button"
        className="loginThemeToggle"
        aria-label={resolvedTheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
      >
        {mounted && resolvedTheme === 'dark' ? <Sun size={20} aria-hidden /> : <Moon size={20} aria-hidden />}
      </button>
      <div className="card loginCard">
        <div style={{ marginBottom: 8 }}>
          <h1 className="loginTitle">DeliverEats Admin</h1>
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
        <p className="muted loginHint">
          Default after seed: <code className="loginCode">admin@delivereats.com</code> / <code className="loginCode">Admin@123!</code>
        </p>
        <Link href="/" className="btn" style={{ marginTop: 16, display: 'inline-block' }}>
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
