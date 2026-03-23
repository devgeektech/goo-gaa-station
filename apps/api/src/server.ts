import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import mongoose from 'mongoose';

import './config/env';
import { connectDatabase } from './config/database';
import app from './app';
import { env } from './config/env';
import { Driver } from './models/Driver';

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
