import mongoose from 'mongoose';
import type { Socket } from 'socket.io';

/** Register vendor room join events on a socket connection. */
export function registerVendorSocket(socket: Socket): void {
  socket.on('vendor:join', (payload: { vendorId?: string }) => {
    const vendorId = payload?.vendorId;
    if (!vendorId || !mongoose.Types.ObjectId.isValid(vendorId)) return;
    socket.join(`vendor:${vendorId}`);
  });
}

