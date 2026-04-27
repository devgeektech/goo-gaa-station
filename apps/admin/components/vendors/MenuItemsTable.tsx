'use client';

import { useState } from 'react';
import type { MenuItem } from '@/lib/api/vendors.api';
import { formatMoney } from '@/lib/utils/format';
import { AddMenuItemModal } from './AddMenuItemModal';
import { Skeleton } from '@/components/ui/Skeleton';

function publicFileBase(): string {
  const base = typeof process !== 'undefined' ? (process.env.NEXT_PUBLIC_API_URL ?? '') : '';
  return base.replace(/\/api\/v1\/?$/, '');
}
function imgSrc(url: string | null | undefined) {
  if (!url) return null;
  return url.startsWith('http') ? url : `${publicFileBase()}${url}`;
}

export function MenuItemsTable({
  vendorId,
  items,
  loading,
  onRefresh,
  onEdit,
}: {
  vendorId: string;
  items: MenuItem[];
  loading: boolean;
  onRefresh: () => void;
  onEdit?: (item: MenuItem) => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);

  const handleAddSubmit = async (formData: FormData) => {
    setCreateLoading(true);
    try {
      const { createMenuItem } = await import('@/lib/api/vendors.api');
      await createMenuItem(vendorId, formData);
      onRefresh();
      setAddOpen(false);
    } finally {
      setCreateLoading(false);
    }
  };

  return (
    <div className="card" style={{ boxShadow: 'none' }}>
      <div className="cardBody">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontWeight: 800 }}>Menu items</div>
          <button type="button" className="btn btnPrimary" onClick={() => setAddOpen(true)}>Add item</button>
        </div>
        <AddMenuItemModal open={addOpen} onClose={() => setAddOpen(false)} onSubmit={handleAddSubmit} loading={createLoading} />
        {loading && items.length === 0 ? (
          <Skeleton height={120} />
        ) : items.length === 0 ? (
          <div className="muted">No menu items yet.</div>
        ) : (
          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>Image</th>
                  <th>Name</th>
                  <th>Category</th>
                  <th>Price</th>
                  <th>Available</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item._id}>
                    <td>
                      {imgSrc(item.image) ? (
                        <img src={imgSrc(item.image)!} alt="" style={{ width: 40, height: 40, borderRadius: 6, objectFit: 'cover' }} />
                      ) : (
                        <div style={{ width: 40, height: 40, borderRadius: 6, background: 'var(--border-light)' }} />
                      )}
                    </td>
                    <td style={{ fontWeight: 600 }}>{item.name}</td>
                    <td className="muted">{item.category}</td>
                    <td>{formatMoney(item.price)}</td>
                    <td><span className="badge" style={{ background: item.isAvailable ? 'var(--success-light)' : 'var(--danger-light)' }}>{item.isAvailable ? 'Yes' : 'No'}</span></td>
                    <td>
                      {onEdit && (
                        <button type="button" className="btn" onClick={() => onEdit(item)}>Edit</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
