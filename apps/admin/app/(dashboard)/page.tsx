'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { fetchOrderStats, fetchOrders } from '@/store/slices/ordersSlice';
import { formatMoney, formatDateTime } from '@/lib/utils/format';
import { Skeleton } from '@/components/ui/Skeleton';
import { useTranslations } from '@/lib/i18n/useTranslations';
import { formatT } from '@/lib/i18n/translations';

export default function DashboardHome() {
  const dispatch = useAppDispatch();
  const { stats, items, loading, error } = useAppSelector((s) => s.orders);
  const [mounted, setMounted] = useState(false);
  const t = useTranslations();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    void dispatch(fetchOrderStats());
    void dispatch(fetchOrders({ page: 1, limit: 10 }));
  }, [dispatch]);

  const kpiLoading = !stats;
  const recentLoading = loading && items.length === 0;

  const chartData = useMemo(() => {
    const raw = stats?.last7DaysRevenue ?? [];
    return raw.map((d: { date?: string; revenue?: number; count?: number }) => ({
      ...d,
      dateLabel: d.date != null ? String(d.date).slice(5) : '',
      revenue: Number(d.revenue) || 0,
    }));
  }, [stats?.last7DaysRevenue]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div className="row adminPageHeader" style={{ justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 className="pageTitle">{t.dashboard.title}</h1>
          <div className="pageSubtitle">{t.dashboard.subtitle}</div>
        </div>
        <div className="row">
          <Link className="btn btnPrimary" href="/orders">{t.dashboard.viewOrders}</Link>
          <Link className="btn" href="/transactions">{t.dashboard.viewTransactions}</Link>
        </div>
      </div>

      {error ? (
        <div className="card" style={{ padding: 20, borderLeft: '4px solid var(--danger)' }}>
          <div style={{ fontWeight: 700, color: 'var(--text)' }}>{t.dashboard.loadFailed}</div>
          <div className="muted" style={{ marginTop: 4 }}>{error}</div>
          {(typeof error === 'string' && (error.toLowerCase().includes('unauthorized') || error.includes('401'))) ? (
            <a href="/login" className="btn btnPrimary" style={{ marginTop: 12, display: 'inline-block' }}>{t.common.signIn}</a>
          ) : null}
        </div>
      ) : null}

      {stats?.pendingDriverApprovals && stats.pendingDriverApprovals > 0 ? (
        <div className="card" style={{ padding: 20, borderLeft: '4px solid var(--warning)' }}>
          <div style={{ fontWeight: 700, color: 'var(--text)' }}>{t.dashboard.pendingDrivers}</div>
          <div className="muted" style={{ marginTop: 4 }}>
            {formatT(t.dashboard.pendingDriversBody, { n: stats.pendingDriverApprovals })}{' '}
            <Link href="/drivers" style={{ color: 'var(--primary)', fontWeight: 600 }}>{t.dashboard.goToDrivers}</Link>
          </div>
        </div>
      ) : null}

      <div className="grid4">
        <div className="card">
          <div className="cardBody">
            <div className="muted" style={{ fontSize: 13 }}>{t.dashboard.totalOrders}</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text)', marginTop: 4 }}>{kpiLoading ? <Skeleton height={32} width={80} /> : stats?.totalOrders}</div>
          </div>
        </div>
        <div className="card">
          <div className="cardBody">
            <div className="muted" style={{ fontSize: 13 }}>{t.dashboard.ordersToday}</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text)', marginTop: 4 }}>{kpiLoading ? <Skeleton height={32} width={60} /> : stats?.ordersToday}</div>
          </div>
        </div>
        <div className="card">
          <div className="cardBody">
            <div className="muted" style={{ fontSize: 13 }}>{t.dashboard.commissionRate}</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text)', marginTop: 4 }}>
              {kpiLoading ? <Skeleton height={32} width={60} /> : `${stats?.commissionPercent ?? 2}%`}
            </div>
          </div>
        </div>
        <div className="card">
          <div className="cardBody">
            <div className="muted" style={{ fontSize: 13 }}>{t.dashboard.activeDrivers}</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text)', marginTop: 4 }}>{kpiLoading ? <Skeleton height={32} width={60} /> : stats?.activeDrivers ?? 0}</div>
          </div>
        </div>
      </div>

      <div className="grid3">
        <div className="card">
          <div className="cardBody">
            <div className="muted" style={{ fontSize: 13 }}>{t.dashboard.adminRevenue}</div>
            <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>{t.dashboard.adminRevenueHint}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--primary)', marginTop: 6 }}>
              {kpiLoading ? <Skeleton height={32} width={100} /> : formatMoney(stats?.adminRevenue ?? stats?.totalRevenue ?? 0)}
            </div>
          </div>
        </div>
        <div className="card">
          <div className="cardBody">
            <div className="muted" style={{ fontSize: 13 }}>{t.dashboard.vendorRevenue}</div>
            <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>{t.dashboard.vendorRevenueHint}</div>
            <div style={{ fontSize: 26, fontWeight: 800, marginTop: 6 }}>
              {kpiLoading ? <Skeleton height={32} width={100} /> : formatMoney(stats?.vendorRevenue ?? 0)}
            </div>
          </div>
        </div>
        <div className="card">
          <div className="cardBody">
            <div className="muted" style={{ fontSize: 13 }}>{t.dashboard.driverFees}</div>
            <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>{t.dashboard.driverFeesHint}</div>
            <div style={{ fontSize: 26, fontWeight: 800, marginTop: 6 }}>
              {kpiLoading ? <Skeleton height={32} width={100} /> : formatMoney(stats?.driverRevenue ?? 0)}
            </div>
          </div>
        </div>
      </div>

      <div className="grid2">
        <div className="card">
          <div className="cardHeader">
            <div>
              <div style={{ fontWeight: 700, fontSize: 18, color: 'var(--text)' }}>{t.dashboard.chartTitle}</div>
              <div className="muted" style={{ fontSize: 13 }}>{t.dashboard.chartSubtitle}</div>
            </div>
          </div>
          <div className="cardBody" style={{ height: 280, minHeight: 280 }}>
            {!mounted || kpiLoading ? (
              <Skeleton height={260} />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="dateLabel" stroke="var(--text-secondary)" style={{ fontSize: 12 }} />
                  <YAxis stroke="var(--text-secondary)" style={{ fontSize: 12 }} tickFormatter={(v) => `${v}$`} />
                  <Tooltip
                    contentStyle={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)' }}
                    formatter={(v: unknown) => (typeof v === 'number' ? formatMoney(v) : String(v))}
                  />
                  <Line type="monotone" dataKey="revenue" stroke="var(--primary)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="card">
          <div className="cardHeader">
            <div>
              <div style={{ fontWeight: 700, fontSize: 18, color: 'var(--text)' }}>{t.dashboard.recentOrders}</div>
              <div className="muted" style={{ fontSize: 13 }}>{t.dashboard.recentOrdersSub}</div>
            </div>
            <Link href="/orders" className="btn btnPrimary">{t.common.open}</Link>
          </div>
          <div className="cardBody">
            {recentLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[1, 2, 3, 4].map((i) => <Skeleton key={i} height={56} />)}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {Array.isArray(items) &&items.slice(0, 10).map((o) => (
                  <Link key={o._id} href="/orders" className="card" style={{ padding: 14, background: 'var(--bg)', boxShadow: 'none', border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: 700, color: 'var(--text)' }}>{o.orderNumber}</div>
                        <div className="muted" style={{ fontSize: 12 }}>{formatDateTime(o.createdAt)}</div>
                      </div>
                      <div style={{ fontWeight: 700, color: 'var(--primary)' }}>{formatMoney(Number(o.total) || 0)}</div>
                    </div>
                  </Link>
                ))}
                {items.length === 0 ? <div className="muted" style={{ padding: 20, textAlign: 'center' }}>{t.empty.ordersYet}</div> : null}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

