'use client';

import { Copy } from 'lucide-react';
import type { OrderListItem } from '@/lib/api/orders.api';
import { resolveDeliveryForOrder, resolvePickupForOrder } from '@/lib/utils/orderAddresses';

type Props = {
  order: OrderListItem;
  onCopyPhone?: (phone: string) => void;
  addressLineStyle?: React.CSSProperties;
};

export function OrderAddressesSection({ order, onCopyPhone, addressLineStyle }: Props) {
  const pickup = resolvePickupForOrder(order);
  const delivery = resolveDeliveryForOrder(order);
  const lineStyle: React.CSSProperties = {
    fontSize: 14,
    color: 'var(--text)',
    lineHeight: 1.45,
    ...addressLineStyle,
  };

  return (
    <div className="grid2">
      <div>
        <div className="muted">Pickup</div>
        <div style={{ marginTop: 6 }}>
          {pickup.line ? (
            <>
              <div style={{ fontWeight: 700 }}>{pickup.title}</div>
              <div style={lineStyle}>{pickup.line}</div>
              {pickup.hint ? <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{pickup.hint}</div> : null}
            </>
          ) : (
            <span className="muted">—</span>
          )}
        </div>
      </div>
      <div>
        <div className="muted">Delivery</div>
        <div style={{ marginTop: 6 }}>
          {delivery.line ? (
            <>
              <div style={{ fontWeight: 700 }}>{delivery.title}</div>
              <div style={lineStyle}>{delivery.line}</div>
              {delivery.phone && onCopyPhone ? (
                <button type="button" className="btn" style={{ marginTop: 8 }} onClick={() => onCopyPhone(delivery.phone!)}>
                  <Copy size={16} /> {delivery.phone}
                </button>
              ) : delivery.phone ? (
                <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>{delivery.phone}</div>
              ) : null}
            </>
          ) : (
            <span className="muted">—</span>
          )}
        </div>
      </div>
    </div>
  );
}
