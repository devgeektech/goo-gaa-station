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
import { registerChatHandlers } from './sockets/chatHandler';
import { driverSessionMatches } from './services/driverSession.service';
import { tryRebroadcastOpenOrdersToDriver } from './services/driverOpenOrderBroadcast.service';

const server = http.createServer(app);

const allowedOrigins = env.ALLOWED_ORIGINS.length > 0 ? env.ALLOWED_ORIGINS : [env.CLIENT_ORIGIN];
const io = new SocketIOServer(server, {
  cors: {
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.includes(origin)) cb(null, true);
      else cb(new Error('Not allowed by CORS'));
    },
    credentials: true,
  },
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
  socket.on('driver:join', async (payload: { driverId?: string; accessToken?: string; token?: string }) => {
    const token = payload?.accessToken ?? payload?.token ?? (socket.handshake.auth?.token as string | undefined);
    if (!token) return;

    try {
      const decoded = jwt.verify(token, env.JWT_SECRET) as {
        _id?: string;
        model?: string;
        type?: 'access' | 'refresh';
        sessionVersion?: number;
      };
      if (decoded.model !== 'Driver' || !decoded._id) return;
      if (decoded.type !== undefined && decoded.type !== 'access') return;

      const driverId = decoded._id;
      if (payload?.driverId && payload.driverId !== driverId) return;
      if (!mongoose.Types.ObjectId.isValid(driverId)) return;

      const driver = await Driver.findById(driverId).select('sessionVersion isOnline').lean();
      if (!driver || !driverSessionMatches(decoded.sessionVersion, driver.sessionVersion)) return;

      socket.data.driverId = driverId;
      socket.join(`driver:${driverId}`);

      if ((driver as { isOnline?: boolean }).isOnline === true) {
        void tryRebroadcastOpenOrdersToDriver(driverId, io);
      }
    } catch {
      // ignore invalid JWT
    }
  });

  socket.on('driver:location_update', async (payload: { driverId?: string; lat?: number; lng?: number }) => {
    const driverId = payload?.driverId != null ? String(payload.driverId).trim() : '';
    const lat = payload?.lat != null ? Number(payload.lat) : null;
    const lng = payload?.lng != null ? Number(payload.lng) : null;
    const now = new Date();

    const emitDriverLocationAck = (ack: {
      success: boolean;
      driverId?: string;
      lat?: number;
      lng?: number;
      timestamp?: string;
      error?: string;
      message?: string;
    }) => {
      socket.emit('driver:location_update', ack);
    };

    if (!driverId || !mongoose.Types.ObjectId.isValid(driverId) || lat == null || lng == null) {
      emitDriverLocationAck({
        success: false,
        error: 'INVALID_PAYLOAD',
        message: 'driverId, lat, and lng are required',
      });
      return;
    }
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
      emitDriverLocationAck({
        success: false,
        driverId,
        error: 'INVALID_COORDINATES',
        message: 'lat must be between -90 and 90; lng between -180 and 180',
      });
      return;
    }

    // Best-effort sanity-check: if join was validated, enforce the same driverId on updates.
    const joinedDriverId = socket.data?.driverId as string | undefined;
    if (joinedDriverId && joinedDriverId !== driverId) {
      emitDriverLocationAck({
        success: false,
        driverId,
        error: 'DRIVER_MISMATCH',
        message: 'driverId does not match authenticated driver session',
      });
      return;
    }

    try {
      await Driver.findByIdAndUpdate(driverId, {
        currentLocation: { lat, lng, updatedAt: now },
        liveLocation: { type: 'Point', coordinates: [lng, lat] },
        lastLocationAt: now,
        lastActiveAt: now,
      });
      void tryRebroadcastOpenOrdersToDriver(driverId, io);
      emitDriverLocationAck({
        success: true,
        driverId,
        lat,
        lng,
        timestamp: now.toISOString(),
      });
      // Admin map: unchanged payload shape (no `success` field).
      io.to('admin').emit('driver:location_update', {
        driverId,
        lat,
        lng,
        coordinates: [lng, lat],
        timestamp: now.toISOString(),
      });
    } catch {
      emitDriverLocationAck({
        success: false,
        driverId,
        error: 'UPDATE_FAILED',
        message: 'Could not persist driver location',
      });
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

  // ── PHASE 14: Chat handler ──────────────────────────────────────────
  registerChatHandlers(io, socket);
  // ── END PHASE 14 ────────────────────────────────────────────────────
});

const wifipayMode = env.WIFIPAY_API_URL && env.WIFIPAY_API_KEY ? 'enabled' : 'disabled';

async function start(): Promise<void> {
  await connectDatabase();
  startVendorResponseTimeoutWorker(io);
  server.listen(env.PORT, () => {
    console.log('--- Goo-Gaa Station API ---');
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
