/** True when the driver is assigned to an in-progress delivery (must stay online). */
export function driverHasActiveDelivery(driver: { currentOrderId?: unknown | null } | null | undefined): boolean {
  const id = driver?.currentOrderId;
  if (id == null) return false;
  return String(id).length > 0;
}
