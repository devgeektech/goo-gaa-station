/** Vendor "current" tab + dashboard activeOrders — must stay in sync. Excludes `ready` (post-kitchen, pre-pickup). */
export const VENDOR_CURRENT_ORDER_STATUSES = [
  'accepted',
  'preparing',
  'picked_up',
  'on_the_way',
] as const;

export const VENDOR_NEW_ORDER_STATUS = 'vendor_notified' as const;
