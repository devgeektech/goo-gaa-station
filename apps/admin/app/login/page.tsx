'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { Sun, Moon } from 'lucide-react';
import { apiClient, getErrorMessage } from '@/lib/api/client';
import { useTranslations } from '@/lib/i18n/useTranslations';
import { useLocale } from '@/lib/i18n/LocaleContext';
import type { Locale } from '@/lib/i18n/translations';

export default function LoginPage() {
  const router = useRouter();
  const { setTheme, resolvedTheme } = useTheme();
  const { locale, setLocale } = useLocale();
  const t = useTranslations();
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
      <div style={{ position: 'absolute', top: 16, right: 16, display: 'flex', gap: 8 }}>
        <select
          className="select"
          value={locale}
          onChange={(e) => setLocale(e.target.value as Locale)}
          style={{ minWidth: 72, fontSize: 14 }}
          aria-label={t.shell.language}
        >
          <option value="en">EN</option>
          <option value="so">SO</option>
        </select>
        <button
          type="button"
          className="loginThemeToggle"
          aria-label={resolvedTheme === 'dark' ? t.theme.switchToLight : t.theme.switchToDark}
          onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
        >
          {mounted && resolvedTheme === 'dark' ? <Sun size={20} aria-hidden /> : <Moon size={20} aria-hidden />}
        </button>
      </div>
      <div className="card loginCard">
        <div style={{ marginBottom: 8 }}>
          <h1 className="loginTitle">{t.login.title}</h1>
          <p className="muted" style={{ marginTop: 8, fontSize: 14 }}>
            {t.auth.signInTitle}
          </p>
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="field">
            <label className="label" htmlFor="email">
              {t.auth.email}
            </label>
            <input
              id="email"
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t.auth.emailPlaceholder}
              required
              autoComplete="email"
            />
          </div>
          <div className="field">
            <label className="label" htmlFor="password">
              {t.auth.password}
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
            {loading ? t.auth.signingIn : t.auth.signIn}
          </button>
        </form>
      </div>
    </div>
  );
}
