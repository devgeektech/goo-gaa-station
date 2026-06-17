import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import type { Server as SocketIOServer } from 'socket.io';
import type { Socket } from 'socket.io';
import { env } from '../config/env';
import { Vendor } from '../models/Vendor';
import { setVendorOpenFromApp } from '../services/vendorPresence.service';
import { appSessionMatches } from '../services/appSession.service';

type VendorJoinPayload = {
  vendorId?: string;
  accessToken?: string;
  token?: string;
};

/** Register vendor room join + presence events on a socket connection. */
export function registerVendorSocket(socket: Socket, io: SocketIOServer): void {
  socket.on('vendor:join', async (payload: VendorJoinPayload) => {
    const token =
      payload?.accessToken ??
      payload?.token ??
      (socket.handshake.auth?.token as string | undefined);
    if (!token) return;

    try {
      const decoded = jwt.verify(token, env.JWT_SECRET) as {
        _id?: string;
        model?: string;
        type?: 'access' | 'refresh';
        sessionVersion?: number;
      };
      if (decoded.model !== 'Vendor' || !decoded._id) return;
      if (decoded.type !== undefined && decoded.type !== 'access') return;

      const vendorId = decoded._id;
      if (payload?.vendorId && payload.vendorId !== vendorId) return;
      if (!mongoose.Types.ObjectId.isValid(vendorId)) return;

      const vendor = await Vendor.findById(vendorId).select('status approvalStatus sessionVersion').lean();
      if (!vendor) return;
      if ((vendor as { status?: string }).status === 'blocked') return;
      if (!appSessionMatches(decoded.sessionVersion, (vendor as { sessionVersion?: number }).sessionVersion)) return;

      socket.data.vendorId = vendorId;
      socket.join(`vendor:${vendorId}`);
      await setVendorOpenFromApp(vendorId, io);
    } catch {
      // ignore invalid JWT
    }
  });
}
