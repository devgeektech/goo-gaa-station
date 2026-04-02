import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import mongoose from 'mongoose';

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
  socket.on('driver:join', (payload: { driverId?: string }) => {
    const driverId = payload?.driverId;
    if (!driverId || !mongoose.Types.ObjectId.isValid(driverId)) return;
    socket.join(`driver:${driverId}`);
  });

  socket.on('driver:location_update', async (payload: { driverId?: string; lat?: number; lng?: number }) => {
    const driverId = payload?.driverId;
    const lat = payload?.lat != null ? Number(payload.lat) : null;
    const lng = payload?.lng != null ? Number(payload.lng) : null;
    if (!driverId || !mongoose.Types.ObjectId.isValid(driverId) || lat == null || lng == null) return;
    try {
      await Driver.findByIdAndUpdate(driverId, {
        liveLocation: { type: 'Point', coordinates: [lng, lat] },
        lastLocationAt: new Date(),
      });
      io.to('admin').emit('driver:location_update', {
        driverId,
        lat,
        lng,
        coordinates: [lng, lat],
        timestamp: new Date().toISOString(),
      });
    } catch {
      // ignore
    }
  });

  socket.on('disconnect', () => {
    // no-op
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
