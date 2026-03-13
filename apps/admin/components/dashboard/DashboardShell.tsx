'use client';

import type { PropsWithChildren } from 'react';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { BarChart3, Package, Receipt, Users, UserPlus, Store, Menu, LogOut, Sun, Moon } from 'lucide-react';
import { useTranslations } from '@/lib/i18n/useTranslations';
import type { Locale } from '@/lib/i18n/translations';

const NAV_KEYS = [
  { href: '/', key: 'dashboard' as const, icon: BarChart3 },
  { href: '/orders', key: 'orders' as const, icon: Package },
  { href: '/transactions', key: 'transactions' as const, icon: Receipt },
  { href: '/customers', key: 'customers' as const, icon: UserPlus },
  { href: '/drivers', key: 'drivers' as const, icon: Users },
  { href: '/vendors', key: 'vendors' as const, icon: Store },
];

import { apiClient } from '@/lib/api/client';

function NavLink({
  href,
  label,
  icon: Icon,
  active,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
  active: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      className={`sidebarLink ${active ? 'sidebarLinkActive' : ''}`}
      onClick={onNavigate}
    >
      <Icon size={18} aria-hidden />
      <span>{label}</span>
    </Link>
  );
}

export function DashboardShell({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const router = useRouter();
  const { setTheme, resolvedTheme } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [locale, setLocale] = useState<Locale>('en');
  const t = useTranslations(locale);

  useEffect(() => setMounted(true), []);

  const isActive = (href: string) => {
    const pathBase = href.split('?')[0];
    return pathname === href || pathname === pathBase || pathname.startsWith(pathBase + '/');
  };

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await apiClient.post('/auth/admin/logout');
      router.push('/login');
      router.refresh();
    } catch {
      router.push('/login');
      router.refresh();
    } finally {
      setLoggingOut(false);
    }
  }

  const closeSidebar = () => setSidebarOpen(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSidebarOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className={`dashboardShell ${sidebarOpen ? 'sidebarOpen' : ''}`}>
      <button
        type="button"
        className="sidebarToggle"
        onClick={() => setSidebarOpen((o) => !o)}
        aria-label={sidebarOpen ? 'Close menu' : 'Open menu'}
        aria-expanded={sidebarOpen}
      >
        <Menu size={22} aria-hidden />
      </button>

      <div className="sidebarOverlay" onClick={closeSidebar} aria-hidden />

      <aside className="sidebar" aria-label="Main navigation">
        <div className="sidebarHeader">
          <Link href="/" className="sidebarBrand" aria-label="DeliverEats Admin home" onClick={closeSidebar}>
            DeliverEats Admin
          </Link>
        </div>
        <nav className="sidebarNav" aria-label="Main">
          <div className="sidebarNavSection">Menu</div>
          {NAV_KEYS.map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              label={t.nav[item.key]}
              icon={item.icon}
              active={isActive(item.href)}
              onNavigate={closeSidebar}
            />
          ))}
        </nav>
      </aside>

      <main className="mainContent">
        <header className="mainHeader">
          <div className="mainHeaderIcons">
            <select
              className="select"
              value={locale}
              onChange={(e) => setLocale(e.target.value as Locale)}
              style={{ minWidth: 72, fontSize: 14 }}
              aria-label="Language"
            >
              <option value="en">EN</option>
              <option value="so">SO</option>
            </select>
            <button
              type="button"
              className="mainHeaderIconBtn"
              aria-label={t.theme.toggle}
              onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
            >
              {mounted && resolvedTheme === 'dark' ? <Sun size={20} aria-hidden /> : <Moon size={20} aria-hidden />}
            </button>
            <button
              type="button"
              className="mainHeaderIconBtn mainHeaderIconBtn--logout"
              aria-label={t.auth.logout}
              onClick={() => void handleLogout()}
              disabled={loggingOut}
            >
              <LogOut size={20} aria-hidden />
              <span>{loggingOut ? t.auth.loggingOut : t.auth.logout}</span>
            </button>
          </div>
        </header>
        <div className="mainContentBody">
          <div className="container">{children}</div>
        </div>
      </main>
    </div>
  );
}
