import type { Server as SocketIOServer } from 'socket.io';
import { Vendor } from '../models/Vendor';

/** Vendor app connected — open for orders (socket joined). */
export async function setVendorOpenFromApp(vendorId: string, io?: SocketIOServer): Promise<void> {
  const now = new Date();
  const updated = await Vendor.findByIdAndUpdate(vendorId, { isOpen: true }, { new: true })
    .select('name isOpen updatedAt')
    .lean();

  if (!updated || !io) return;

  io.to('admin').emit('vendor:availability_changed', {
    vendorId,
    vendorName: (updated as { name?: string }).name ?? null,
    isOpen: true,
    updatedAt: (updated as { updatedAt?: Date }).updatedAt ?? now,
  });
}

/** Vendor app disconnected — closed (socket dropped or logout). */
export async function setVendorClosedFromApp(vendorId: string, io?: SocketIOServer): Promise<void> {
  const now = new Date();
  const updated = await Vendor.findByIdAndUpdate(vendorId, { isOpen: false }, { new: true })
    .select('name isOpen updatedAt')
    .lean();

  if (!updated || !io) return;

  io.to('admin').emit('vendor:availability_changed', {
    vendorId,
    vendorName: (updated as { name?: string }).name ?? null,
    isOpen: false,
    updatedAt: (updated as { updatedAt?: Date }).updatedAt ?? now,
  });
}

/** @deprecated Use setVendorOpenFromApp */
export const setVendorOnline = setVendorOpenFromApp;

/** @deprecated Use setVendorClosedFromApp */
export const setVendorOffline = setVendorClosedFromApp;
