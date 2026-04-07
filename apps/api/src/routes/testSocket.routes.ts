import { Router, type Request, type Response } from 'express';
import type { Server as SocketIOServer } from 'socket.io';
import { env } from '../config/env';
import { sendSuccess } from '../utils/response';

const router = Router();

/**
 * Development-only: broadcast a no-auth test event to every connected Socket.IO client.
 * Postman: connect Socket.IO → Events → listen for `test:ping` → GET or POST this URL → message appears.
 * Disabled in production (404).
 */
function emitTestPing(req: Request, res: Response): void {
  if (env.NODE_ENV === 'production') {
    res.status(404).json({ success: false, message: { en: 'Not found', de: 'Nicht gefunden' } });
    return;
  }

  const io = req.app.get('io') as SocketIOServer | undefined;
  if (!io) {
    res.status(503).json({ success: false, message: { en: 'Socket.IO not initialized', de: 'Socket.IO nicht initialisiert' } });
    return;
  }

  const payload = {
    message: 'Socket.IO test broadcast — if you see this in Postman, realtime is working.',
    at: new Date().toISOString(),
  };
  io.emit('test:ping', payload);
  sendSuccess(res, { emitted: 'test:ping', payload, hint: 'Listen for event name test:ping on your Socket.IO client (no join required).' });
}

router.get('/emit', emitTestPing);
router.post('/emit', emitTestPing);

export default router;
