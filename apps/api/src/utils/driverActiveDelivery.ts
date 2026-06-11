import mongoose from 'mongoose';
import { Order } from '../models/Order';

/** Order statuses treated as an in-progress driver delivery (same as GET /driver/orders/active). */
export const DRIVER_ACTIVE_ORDER_STATUSES = ['preparing', 'ready', 'picked_up', 'on_the_way'] as const;

/** True when the driver is assigned to an in-progress delivery (must stay online). */
export function driverHasActiveDelivery(driver: { currentOrderId?: unknown | null } | null | undefined): boolean {
  const id = driver?.currentOrderId;
  if (id == null) return false;
  return String(id).length > 0;
}

/** True when the driver has at least one active assigned order. */
export async function driverHasActiveOrder(driverId: mongoose.Types.ObjectId | string): Promise<boolean> {
  const exists = await Order.exists({
    driverId: new mongoose.Types.ObjectId(String(driverId)),
    status: { $in: [...DRIVER_ACTIVE_ORDER_STATUSES] },
  });
  return exists != null;
}
