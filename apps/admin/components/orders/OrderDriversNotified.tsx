'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Copy } from 'lucide-react';
import type { OrderListItem, OrderBroadcastDriverRef } from '@/lib/api/orders.api';
import { getDriver } from '@/lib/api/drivers.api';
import { formatDateTime, copyToClipboard } from '@/lib/utils/format';
import { useTranslations } from '@/lib/i18n/useTranslations';
import { formatT } from '@/lib/i18n/translations';

export type NormalizedBroadcastDriver = {
  id: string;
  name: string;
  phone: string;
  vehicle: string;
  isOnline: boolean | null;
  isAvailable: boolean | null;
  missing?: boolean;
};

function getRefId(v: unknown): string | null {
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object' && '_id' in v) {
    const id = (v as { _id?: unknown })._id;
    return id != null ? String(id) : null;
  }
  return null;
}

function driverRefToRow(v: OrderBroadcastDriverRef | string): NormalizedBroadcastDriver | null {
  const id = getRefId(v);
  if (!id) return null;
  if (typeof v === 'string') {
    return { id, name: '—', phone: '—', vehicle: '—', isOnline: null, isAvailable: null, missing: true };
  }
  const vehicle = [v.vehicleType, v.vehicleNumber ?? v.vehiclePlate].filter(Boolean).join(' · ') || '—';
  const name = v.name?.trim() || '';
  const phone = v.phone?.trim() || '';
  const missing = !name && !phone && v.name !== 'Driver not found';
  return {
    id,
    name: name || (v.name === 'Driver not found' ? 'Driver not found' : '—'),
    phone: phone || '—',
    vehicle,
    isOnline: typeof v.isOnline === 'boolean' ? v.isOnline : null,
    isAvailable: typeof v.isAvailable === 'boolean' ? v.isAvailable : null,
    missing,
  };
}

export function normalizeBroadcastDrivers(order: OrderListItem): NormalizedBroadcastDriver[] {
  const raw = [...(order.broadcastedToDrivers ?? []), ...(order.notifiedDriverIds ?? [])];
  const seen = new Set<string>();
  const out: NormalizedBroadcastDriver[] = [];
  for (const item of raw) {
    const row = driverRefToRow(item);
    if (!row || seen.has(row.id)) continue;
    seen.add(row.id);
    if (row.name === 'Driver not found') row.missing = true;
    out.push(row);
  }
  return out;
}

function boolLabel(v: boolean | null, t: ReturnType<typeof useTranslations>): string {
  if (v === true) return t.common.yes;
  if (v === false) return t.common.no;
  return '—';
}

function mergeDriverDetail(
  row: NormalizedBroadcastDriver,
  detail: { name?: string; phone?: string; vehicleType?: string | null; vehicleNumber?: string | null; vehiclePlate?: string | null; isOnline?: boolean; isAvailable?: boolean } | null
): NormalizedBroadcastDriver {
  if (!detail) {
    return { ...row, name: 'Driver not found', phone: '—', vehicle: '—', missing: true };
  }
  const vehicle =
    [detail.vehicleType, detail.vehicleNumber ?? detail.vehiclePlate].filter(Boolean).join(' · ') || '—';
  return {
    id: row.id,
    name: detail.name?.trim() || '—',
    phone: detail.phone?.trim() || '—',
    vehicle,
    isOnline: typeof detail.isOnline === 'boolean' ? detail.isOnline : null,
    isAvailable: typeof detail.isAvailable === 'boolean' ? detail.isAvailable : null,
    missing: false,
  };
}

export function OrderDriversNotified({
  order,
  assignedDriverId,
  onCopy,
}: {
  order: OrderListItem;
  assignedDriverId?: string | null;
  onCopy?: (text: string, label: string) => void;
}) {
  const t = useTranslations();
  const initialRows = useMemo(() => normalizeBroadcastDrivers(order), [order]);
  const [drivers, setDrivers] = useState<NormalizedBroadcastDriver[]>(initialRows);
  const [loadingDetails, setLoadingDetails] = useState(false);

  useEffect(() => {
    setDrivers(initialRows);
  }, [initialRows]);

  useEffect(() => {
    const needsFetch = initialRows.some((r) => r.missing || r.name === '—');
    if (!needsFetch || initialRows.length === 0) return;

    let cancelled = false;
    setLoadingDetails(true);
    void (async () => {
      const enriched = await Promise.all(
        initialRows.map(async (row) => {
          if (!row.missing && row.name !== '—') return row;
          try {
            const res = await getDriver(row.id);
            return mergeDriverDetail(row, res.data ?? null);
          } catch {
            return mergeDriverDetail(row, null);
          }
        })
      );
      if (!cancelled) {
        setDrivers(enriched);
        setLoadingDetails(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [order._id, initialRows]);

  const deadline = order.driverAssignmentDeadline;
  const offerOpen =
    order.driver_assigned === false &&
    deadline != null &&
    new Date(deadline).getTime() > Date.now();

  async function copyId(id: string) {
    const ok = await copyToClipboard(id);
    onCopy?.(id, ok ? t.orders.copiedDriverId : t.common.copyFailed);
  }

  return (
    <div className="card" style={{ boxShadow: 'none' }}>
      <div className="cardBody">
        <div style={{ fontWeight: 800 }}>{t.orders.driversNotified}</div>
        {/* <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
          Drivers who received broadcast after vendor accept (socket, push, in-app). Use for delivery testing.
        </div> */}
        {/* {order.driver_assigned === true && assignedDriverId ? (
          <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
            Assigned driver:{' '}
            <Link href={`/drivers/${assignedDriverId}`} style={{ fontWeight: 700 }}>
              {drivers.find((d) => d.id === assignedDriverId)?.name ?? assignedDriverId}
            </Link>
          </div>
        ) : offerOpen ? (
          <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
            Offer window open until {formatDateTime(deadline)}
          </div>
        ) : deadline ? (
          <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
            Assignment deadline was {formatDateTime(deadline)}
          </div>
        ) : null} */}
        <div className="divider" />
        {drivers.length === 0 ? (
          <div className="muted" style={{ fontSize: 13 }}>
            {t.orders.driversBroadcastEmpty}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            {loadingDetails ? (
              <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
                {t.orders.loadingDrivers}
              </div>
            ) : null}
            <table style={{ fontSize: 13, minWidth: 520, width: '100%' }}>
              <thead>
                <tr>
                  <th>{t.common.name}</th>
                  <th>{t.common.phone}</th>
                  <th>{t.orders.vehicle}</th>
                  <th>{t.orders.onlineCol}</th>
                  <th>{t.orders.availableCol}</th>
                  <th>{t.orders.driverId}</th>
                </tr>
              </thead>
              <tbody>
                {drivers.map((d) => {
                  const isAssigned = assignedDriverId === d.id;
                  return (
                    <tr
                      key={d.id}
                      style={isAssigned ? { background: 'var(--surface-2, rgba(0,128,0,0.06))' } : undefined}
                    >
                      <td>
                        {d.missing ? (
                          <span style={{ fontWeight: 700, color: 'var(--danger, #c62828)' }}>{d.name}</span>
                        ) : (
                          <Link href={`/drivers/${d.id}`} style={{ fontWeight: 700 }}>
                            {d.name}
                          </Link>
                        )}
                        {isAssigned ? (
                          <span className="muted" style={{ marginLeft: 6, fontSize: 11 }}>
                            {t.common.assigned}
                          </span>
                        ) : null}
                      </td>
                      <td>{d.phone}</td>
                      <td>{d.vehicle}</td>
                      <td>{boolLabel(d.isOnline, t)}</td>
                      <td>{boolLabel(d.isAvailable, t)}</td>
                      <td>
                        <button
                          type="button"
                          className="btn"
                          style={{ padding: '4px 8px', fontSize: 11 }}
                          onClick={() => void copyId(d.id)}
                          title={t.orders.copyDriverIdTitle}
                        >
                          <Copy size={12} /> {d.id.slice(-8)}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {/* <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
              Count: {drivers.length}
            </div> */}
          </div>
        )}
      </div>
    </div>
  );
}
