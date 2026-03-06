/** Order statuses in correct workflow sequence */
export const ORDER_STATUSES = [
  'pending',
  'confirmed',
  'preparing',
  'ready',
  'picked_up',
  'delivered',
  'cancelled',
] as const;

export const VEHICLE_TYPES = ['bike', 'scooter', 'car'] as const;

export const USER_STATUSES = ['active', 'inactive', 'suspended', 'pending'] as const;

export const DRIVER_APPROVAL_STATUSES = ['pending', 'approved', 'rejected'] as const;
