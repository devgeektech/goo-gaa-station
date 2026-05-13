'use client';

import type { MenuItem } from '@/lib/api/vendors.api';
import { formatMoney } from '@/lib/utils/format';
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
  items,
  loading,
  onEdit,
}: {
  vendorId: string;
  items: MenuItem[];
  loading: boolean;
  onRefresh: () => void;
  onEdit?: (item: MenuItem) => void;
}) {
  return (
    <div className="card" style={{ boxShadow: 'none' }}>
      <div className="cardBody">
        <div style={{ fontWeight: 800, marginBottom: 12 }}>Menu items</div>
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
