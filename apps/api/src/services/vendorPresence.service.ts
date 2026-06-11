import type { Server as SocketIOServer } from 'socket.io';
import { Vendor } from '../models/Vendor';

/** Mark vendor app as connected (socket joined). */
export async function setVendorOnline(vendorId: string, io?: SocketIOServer): Promise<void> {
  const now = new Date();
  const updated = await Vendor.findByIdAndUpdate(
    vendorId,
    { isOnline: true, lastActiveAt: now },
    { new: true }
  )
    .select('name isOpen isOnline updatedAt')
    .lean();

  if (!updated || !io) return;

  io.to('admin').emit('vendor:availability_changed', {
    vendorId,
    vendorName: (updated as { name?: string }).name ?? null,
    isOpen: (updated as { isOpen?: boolean }).isOpen ?? false,
    isOnline: true,
    updatedAt: (updated as { updatedAt?: Date }).updatedAt ?? now,
  });
}

/** Mark vendor app as disconnected (socket dropped or logout). */
export async function setVendorOffline(vendorId: string, io?: SocketIOServer): Promise<void> {
  const now = new Date();
  const updated = await Vendor.findByIdAndUpdate(
    vendorId,
    { isOnline: false },
    { new: true }
  )
    .select('name isOpen isOnline updatedAt')
    .lean();

  if (!updated || !io) return;

  io.to('admin').emit('vendor:availability_changed', {
    vendorId,
    vendorName: (updated as { name?: string }).name ?? null,
    isOpen: (updated as { isOpen?: boolean }).isOpen ?? false,
    isOnline: false,
    updatedAt: (updated as { updatedAt?: Date }).updatedAt ?? now,
  });
}
