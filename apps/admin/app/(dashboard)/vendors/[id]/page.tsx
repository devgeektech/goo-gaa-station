'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Store } from 'lucide-react';
import { getVendor, listMenuItems } from '@/lib/api/vendors.api';
import type { VendorDetail, MenuItem } from '@/lib/api/vendors.api';
import { MenuItemsTable } from '@/components/vendors/MenuItemsTable';
import { Skeleton } from '@/components/ui/Skeleton';

const IMG_BASE = typeof process !== 'undefined' ? (process.env.NEXT_PUBLIC_API_URL ?? '') : '';
function imgSrc(url: string | null | undefined) {
  if (!url) return null;
  return url.startsWith('http') ? url : `${IMG_BASE}${url}`;
}

function categoryNames(v: VendorDetail): string {
  const cats = v.categoryIds;
  if (!cats || cats.length === 0) return '—';
  if (Array.isArray(cats) && cats.length > 0 && typeof cats[0] === 'object' && cats[0] && 'name' in (cats[0] as object)) {
    return (cats as { name?: string }[]).map((c) => c.name).filter(Boolean).join(', ') || '—';
  }
  return '—';
}

export default function VendorDetailPage() {
  const params = useParams();
  const id = typeof params?.id === 'string' ? params.id : '';
  const [vendor, setVendor] = useState<VendorDetail | null>(null);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [menuLoading, setMenuLoading] = useState(false);

  const loadVendor = () => {
    if (!id) return;
    setLoading(true);
    getVendor(id)
      .then((res) => {
        const data = res.data;
        setVendor(data);
        setMenuItems(data?.menuItems ?? []);
      })
      .catch(() => setVendor(null))
      .finally(() => setLoading(false));
  };

  const loadMenuItems = () => {
    if (!id) return;
    setMenuLoading(true);
    listMenuItems(id)
      .then((res) => setMenuItems(res.data ?? []))
      .catch(() => setMenuItems([]))
      .finally(() => setMenuLoading(false));
  };

  useEffect(() => {
    if (id) loadVendor();
  }, [id]);

  useEffect(() => {
    if (vendor && (vendor.menuItems == null || vendor.menuItems.length === 0)) loadMenuItems();
  }, [vendor?._id]);

  if (!id) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div className="muted">Invalid vendor ID.</div>
      </div>
    );
  }

  if (loading && !vendor) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <Skeleton height={40} />
        <Skeleton height={320} />
      </div>
    );
  }

  if (!vendor) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div className="muted">Vendor not found.</div>
      </div>
    );
  }

  const items = menuItems.length > 0 ? menuItems : (vendor.menuItems ?? []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div className="row" style={{ alignItems: 'center', gap: 12 }}>
        <Link href="/vendors" className="btn" aria-label="Back to vendors">
          <ArrowLeft size={18} aria-hidden />
        </Link>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: 'var(--text)' }}>Vendor detail</h1>
      </div>

      <div className="card">
        <div className="cardBody">
          <div className="row" style={{ alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            {imgSrc(vendor.logo) ? (
              <img src={imgSrc(vendor.logo)!} alt="" style={{ width: 72, height: 72, borderRadius: 12, objectFit: 'cover' }} />
            ) : (
              <div style={{ width: 72, height: 72, borderRadius: 12, background: 'var(--border-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
                <Store size={32} />
              </div>
            )}
            <div>
              <div style={{ fontWeight: 800, fontSize: 20 }}>{vendor.name}</div>
              <div className="muted">{vendor.slug}</div>
              {vendor.description ? <div className="muted" style={{ marginTop: 4 }}>{vendor.description}</div> : null}
              {vendor.email ? <div className="muted">{vendor.email}</div> : null}
              {vendor.phone ? <div className="muted">{vendor.phone}</div> : null}
              <span className="badge" style={{ marginTop: 8, background: vendor.status === 'blocked' ? 'var(--danger-light)' : 'var(--success-light)' }}>{vendor.status}</span>
              <div className="muted" style={{ marginTop: 4 }}>Category: {categoryNames(vendor)}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid2">
        <div className="card" style={{ boxShadow: 'none' }}>
          <div className="cardBody">
            <div className="muted">Rating</div>
            <div style={{ marginTop: 8, fontWeight: 800, fontSize: 24 }}>—</div>
          </div>
        </div>
        <div className="card" style={{ boxShadow: 'none' }}>
          <div className="cardBody">
            <div className="muted">Orders</div>
            <div style={{ marginTop: 8, fontWeight: 800, fontSize: 24 }}>—</div>
          </div>
        </div>
      </div>

      <MenuItemsTable
        vendorId={id}
        items={items}
        loading={menuLoading && items.length === 0}
        onRefresh={() => { loadMenuItems(); }}
        onEdit={(item) => { /* optional: open edit modal */ }}
      />
    </div>
  );
}
