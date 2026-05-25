import mongoose from 'mongoose';
import { Driver } from '../models/Driver';

const DRIVER_BROADCAST_SELECT = 'name phone vehicleType vehicleNumber vehiclePlate isOnline isAvailable';

function extractDriverId(item: unknown): string | null {
  if (item == null) return null;
  if (typeof item === 'string') {
    return mongoose.Types.ObjectId.isValid(item) ? item : null;
  }
  if (typeof item === 'object') {
    const id = (item as { _id?: unknown })._id;
    if (id != null && mongoose.Types.ObjectId.isValid(String(id))) return String(id);
  }
  return null;
}

function hasDriverProfile(item: unknown): boolean {
  if (!item || typeof item !== 'object') return false;
  const o = item as { name?: string; phone?: string };
  return Boolean(o.name?.trim() || o.phone?.trim());
}

function mapDriverField(
  arr: unknown[] | undefined,
  byId: Map<string, Record<string, unknown>>
): unknown[] | undefined {
  if (!Array.isArray(arr)) return arr;
  const out: unknown[] = [];
  const seen = new Set<string>();
  for (const item of arr) {
    const id = extractDriverId(item);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const doc = byId.get(id);
    if (doc) {
      out.push(doc);
      continue;
    }
    if (hasDriverProfile(item)) {
      out.push(item);
      continue;
    }
    out.push({
      _id: id,
      name: 'Driver not found',
      phone: null,
      vehicleType: null,
      vehicleNumber: null,
      vehiclePlate: null,
      isOnline: null,
      isAvailable: null,
    });
  }
  return out;
}

/** Resolve broadcast / notified driver refs to full driver rows for admin order detail. */
export async function enrichOrderBroadcastDrivers<T extends Record<string, unknown>>(order: T): Promise<T> {
  const idOrder: string[] = [];
  const seen = new Set<string>();

  for (const field of ['broadcastedToDrivers', 'notifiedDriverIds'] as const) {
    const arr = order[field];
    if (!Array.isArray(arr)) continue;
    for (const item of arr) {
      const id = extractDriverId(item);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      idOrder.push(id);
    }
  }

  if (idOrder.length === 0) return order;

  const drivers = await Driver.find({
    _id: { $in: idOrder.map((id) => new mongoose.Types.ObjectId(id)) },
  })
    .select(DRIVER_BROADCAST_SELECT)
    .lean();

  const byId = new Map<string, Record<string, unknown>>();
  for (const d of drivers) {
    byId.set(String(d._id), d as Record<string, unknown>);
  }

  return {
    ...order,
    broadcastedToDrivers: mapDriverField(order.broadcastedToDrivers as unknown[] | undefined, byId),
    notifiedDriverIds: mapDriverField(order.notifiedDriverIds as unknown[] | undefined, byId),
  };
}
