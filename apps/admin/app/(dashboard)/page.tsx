'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { fetchOrderStats, fetchOrders } from '@/store/slices/ordersSlice';
import { formatMoney, formatDateTime } from '@/lib/utils/format';
import { Skeleton } from '@/components/ui/Skeleton';

export default function DashboardHome() {
  const dispatch = useAppDispatch();
  const { stats, items, loading, error } = useAppSelector((s) => s.orders);
  const [mounted, setMounted] = useState(false);

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
          <h1 className="pageTitle">Dashboard</h1>
          <div className="pageSubtitle">Live overview of orders and revenue.</div>
        </div>
        <div className="row">
          <Link className="btn btnPrimary" href="/orders">View orders</Link>
          <Link className="btn" href="/transactions">View transactions</Link>
        </div>
      </div>

      {error ? (
        <div className="card" style={{ padding: 20, borderLeft: '4px solid var(--danger)' }}>
          <div style={{ fontWeight: 700, color: 'var(--text)' }}>Failed to load dashboard</div>
          <div className="muted" style={{ marginTop: 4 }}>{error}</div>
          {(typeof error === 'string' && (error.toLowerCase().includes('unauthorized') || error.includes('401'))) ? (
            <a href="/login" className="btn btnPrimary" style={{ marginTop: 12, display: 'inline-block' }}>Sign in</a>
          ) : null}
        </div>
      ) : null}

      {stats?.pendingDriverApprovals && stats.pendingDriverApprovals > 0 ? (
        <div className="card" style={{ padding: 20, borderLeft: '4px solid var(--warning)' }}>
          <div style={{ fontWeight: 700, color: 'var(--text)' }}>Pending driver approvals</div>
          <div className="muted" style={{ marginTop: 4 }}>
            {stats.pendingDriverApprovals} driver(s) need review.{' '}
            <Link href="/drivers" style={{ color: 'var(--primary)', fontWeight: 600 }}>Go to drivers</Link>
          </div>
        </div>
      ) : null}

      <div className="grid4">
        <div className="card">
          <div className="cardBody">
            <div className="muted" style={{ fontSize: 13 }}>Total orders</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text)', marginTop: 4 }}>{kpiLoading ? <Skeleton height={32} width={80} /> : stats?.totalOrders}</div>
          </div>
        </div>
        <div className="card">
          <div className="cardBody">
            <div className="muted" style={{ fontSize: 13 }}>Orders today</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text)', marginTop: 4 }}>{kpiLoading ? <Skeleton height={32} width={60} /> : stats?.ordersToday}</div>
          </div>
        </div>
        <div className="card">
          <div className="cardBody">
            <div className="muted" style={{ fontSize: 13 }}>Revenue (paid)</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--primary)', marginTop: 4 }}>{kpiLoading ? <Skeleton height={32} width={100} /> : formatMoney(stats?.totalRevenue ?? 0)}</div>
          </div>
        </div>
        <div className="card">
          <div className="cardBody">
            <div className="muted" style={{ fontSize: 13 }}>Active drivers</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text)', marginTop: 4 }}>{kpiLoading ? <Skeleton height={32} width={60} /> : stats?.activeDrivers ?? 0}</div>
          </div>
        </div>
      </div>

      <div className="grid2">
        <div className="card">
          <div className="cardHeader">
            <div>
              <div style={{ fontWeight: 700, fontSize: 18, color: 'var(--text)' }}>Revenue (last 7 days)</div>
              <div className="muted" style={{ fontSize: 13 }}>Paid orders only</div>
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
                  <YAxis stroke="var(--text-secondary)" style={{ fontSize: 12 }} tickFormatter={(v) => `${v}€`} />
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
              <div style={{ fontWeight: 700, fontSize: 18, color: 'var(--text)' }}>Recent orders</div>
              <div className="muted" style={{ fontSize: 13 }}>Last 10 created</div>
            </div>
            <Link href="/orders" className="btn btnPrimary">Open</Link>
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
                {items.length === 0 ? <div className="muted" style={{ padding: 20, textAlign: 'center' }}>No orders yet.</div> : null}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

