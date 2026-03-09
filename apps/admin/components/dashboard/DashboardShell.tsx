'use client';

import type { PropsWithChildren } from 'react';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { BarChart3, Package, Receipt, Users, UserPlus, Menu, LogOut, User, Search, Bell, LayoutGrid } from 'lucide-react';
import { apiClient } from '@/lib/api/client';

const NAV_ITEMS = [
  { href: '/', label: 'Dashboard', icon: BarChart3 },
  { href: '/orders', label: 'Orders', icon: Package },
  { href: '/transactions', label: 'Transactions', icon: Receipt },
  { href: '/customers', label: 'Customers', icon: UserPlus },
  { href: '/drivers', label: 'Drivers', icon: Users },
];

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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

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
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              label={item.label}
              icon={item.icon}
              active={isActive(item.href)}
              onNavigate={closeSidebar}
            />
          ))}
        </nav>
        <div className="sidebarFooter">
          <div className="sidebarProfile">
            <User size={18} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} aria-hidden />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span className="sidebarProfileLabel">Admin</span>
              <span className="sidebarProfileRole">Dashboard</span>
            </div>
          </div>
          <button
            type="button"
            className="logoutBtn"
            onClick={() => void handleLogout()}
            disabled={loggingOut}
            aria-label="Log out"
          >
            <LogOut size={16} aria-hidden />
            {loggingOut ? 'Logging out…' : 'Log out'}
          </button>
        </div>
      </aside>

      <main className="mainContent">
        <header className="mainHeader">
          <div style={{ position: 'relative', width: 260 }}>
            <Search
              size={18}
              aria-hidden
              style={{
                position: 'absolute',
                left: 14,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-secondary)',
                pointerEvents: 'none',
              }}
            />
            <input
              type="search"
              className="mainHeaderSearch"
              placeholder="Search..."
              aria-label="Search"
            />
          </div>
          <div className="mainHeaderIcons">
            <button type="button" className="mainHeaderIconBtn" aria-label="Notifications">
              <Bell size={20} aria-hidden />
            </button>
            <button type="button" className="mainHeaderIconBtn" aria-label="Profile">
              <User size={20} aria-hidden />
            </button>
            <button type="button" className="mainHeaderIconBtn" aria-label="Menu">
              <LayoutGrid size={20} aria-hidden />
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
