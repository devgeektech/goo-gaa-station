import type { DriverDocument } from '../models/Driver';

/**
 * Option A: same phone after admin soft-delete can sign in again.
 * Restores account to active; keeps approval/KYC/documents so approved drivers are not reset.
 */
export function applyDeletedDriverReactivation(driver: DriverDocument): boolean {
  if ((driver as { status?: string }).status !== 'deleted') {
    return false;
  }

  (driver as { status: string }).status = 'active';
  driver.blockReason = null;
  driver.isOnline = false;
  driver.isAvailable = true;
  driver.currentOrderId = null;

  return true;
}
