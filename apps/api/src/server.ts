import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';

import './config/env';
import { connectDatabase } from './config/database';
import app from './app';
import { env } from './config/env';
import { Driver } from './models/Driver';
import { startVendorResponseTimeoutWorker } from './workers/vendorResponseTimeout.worker';
import { registerVendorSocket } from './sockets/vendorSocket';

const server = http.createServer(app);

const io = new SocketIOServer(server, {
  cors: { origin: env.CLIENT_ORIGIN },
});

// Attach io to app for use in routes (e.g. req.app.get('io'))
app.set('io', io);

// Socket.IO: admin:join, driver:location_update, order:status_changed (emitted from orderStatus.service)
io.on('connection', (socket) => {
  socket.on('admin:join', () => {
    socket.join('admin');
  });

  registerVendorSocket(socket);

  /** Customer app: join `customer:<customerId>` for order notifications. */
  socket.on('customer:join', (payload: { customerId?: string }) => {
    const customerId = payload?.customerId;
    if (!customerId || !mongoose.Types.ObjectId.isValid(customerId)) return;
    socket.join(`customer:${customerId}`);
  });

  /** Driver app: join `driver:<driverId>` for KYC events (`driver:kyc_approved`, `driver:kyc_rejected`). */
  socket.on('driver:join', (payload: { driverId?: string; accessToken?: string; token?: string }) => {
    const token = payload?.accessToken ?? payload?.token ?? (socket.handshake.auth?.token as string | undefined);
    if (!token) return;

    try {
      const decoded = jwt.verify(token, env.JWT_SECRET) as { _id?: string; model?: string; type?: 'access' | 'refresh' };
      if (decoded.model !== 'Driver' || !decoded._id) return;
      if (decoded.type !== undefined && decoded.type !== 'access') return;

      const driverId = decoded._id;
      if (payload?.driverId && payload.driverId !== driverId) return;
      if (!mongoose.Types.ObjectId.isValid(driverId)) return;

      socket.data.driverId = driverId;
      socket.join(`driver:${driverId}`);
    } catch {
      // ignore invalid JWT
    }
  });

  socket.on('driver:location_update', async (payload: { driverId?: string; lat?: number; lng?: number }) => {
    const driverId = payload?.driverId;
    const lat = payload?.lat != null ? Number(payload.lat) : null;
    const lng = payload?.lng != null ? Number(payload.lng) : null;
    const now = new Date();
    if (!driverId || !mongoose.Types.ObjectId.isValid(driverId) || lat == null || lng == null) return;

    // Best-effort sanity-check: if join was validated, enforce the same driverId on updates.
    const joinedDriverId = socket.data?.driverId as string | undefined;
    if (joinedDriverId && joinedDriverId !== driverId) return;

    try {
      await Driver.findByIdAndUpdate(driverId, {
        currentLocation: { lat, lng, updatedAt: now },
        liveLocation: { type: 'Point', coordinates: [lng, lat] },
        lastLocationAt: now,
        isOnline: true,
        lastActiveAt: now,
      });
      io.to('admin').emit('driver:location_update', {
        driverId,
        lat,
        lng,
        coordinates: [lng, lat],
        timestamp: now.toISOString(),
      });
    } catch {
      // ignore
    }
  });

  socket.on('disconnect', async () => {
    const driverId = socket.data?.driverId as string | undefined;
    if (!driverId) return;

    try {
      const driver = await Driver.findById(driverId).select('isOnline').lean();
      if (!driver?.isOnline) return; // only mark offline when we were online

      await Driver.findByIdAndUpdate(driverId, {
        isOnline: false,
      });
    } catch {
      // ignore
    }
  });
});

const wifipayMode = env.WIFIPAY_API_URL && env.WIFIPAY_API_KEY ? 'enabled' : 'disabled';

async function start(): Promise<void> {
  await connectDatabase();
  startVendorResponseTimeoutWorker(io);
  server.listen(env.PORT, () => {
    console.log('--- DeliverEats API ---');
    console.log(`Node env:    ${env.NODE_ENV}`);
    console.log(`Port:        ${env.PORT}`);
    console.log('DB:          connected');
    console.log(`Storage:     ${env.STORAGE_PROVIDER}`);
    console.log(`WifiPay:     ${wifipayMode}`);
    console.log('-----------------------');
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
