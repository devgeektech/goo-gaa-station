import { Server, Socket } from 'socket.io';
import ChatMessage from '../models/ChatMessage';
import Order from '../models/Order';

interface AuthPayload { id: string; role: 'customer' | 'driver'; }

export const registerChatHandlers = (io: Server, socket: Socket): void => {

  // chat:join — validate ownership, join shared chat room
  socket.on('chat:join', async ({ orderId }: { orderId: string }) => {
    try {
      const auth = socket.data.auth as AuthPayload | undefined;
      if (!auth) { socket.emit('chat:error', { message: 'Unauthorized' }); return; }

      const query = auth.role === 'customer'
        ? { _id: orderId, customer: auth.id }
        : { _id: orderId, driver:   auth.id };
      const order = await (Order as any).findOne(query).select('_id').lean();
      if (!order) { socket.emit('chat:error', { message: 'Order not found or access denied' }); return; }

      await socket.join(`chat:${orderId}`);
      socket.emit('chat:joined', { orderId, room: `chat:${orderId}` });
    } catch (err) {
      console.error('[Socket chat:join]', err);
      socket.emit('chat:error', { message: 'Failed to join chat room' });
    }
  });

  // chat:typing — no DB write, broadcast to room peers only
  socket.on('chat:typing', ({ orderId, isTyping }: { orderId: string; isTyping: boolean }) => {
    const auth = socket.data.auth as AuthPayload | undefined;
    if (!auth || !orderId) return;
    socket.to(`chat:${orderId}`).emit('chat:typing', {
      orderId, senderRole: auth.role, isTyping,
    });
  });

  // chat:send — socket alternative to REST POST; persists + broadcasts
  socket.on('chat:send', async ({ orderId, message }: { orderId: string; message: string }) => {
    try {
      const auth = socket.data.auth as AuthPayload | undefined;
      if (!auth) { socket.emit('chat:error', { message: 'Unauthorized' }); return; }
      if (!message?.trim()) { socket.emit('chat:error', { message: 'message is required' }); return; }
      if (message.trim().length > 1000) { socket.emit('chat:error', { message: 'message too long' }); return; }

      const query = auth.role === 'customer'
        ? { _id: orderId, customer: auth.id }
        : { _id: orderId, driver:   auth.id };
      const order = await (Order as any).findOne(query).select('customer driver status').lean();
      if (!order) { socket.emit('chat:error', { message: 'Order not found or access denied' }); return; }
      if (['delivered', 'cancelled'].includes(order.status)) {
        socket.emit('chat:error', { message: 'Chat is closed for this order' }); return;
      }

      const chatMessage = await (ChatMessage as any).create({
        orderId, senderId: auth.id, senderRole: auth.role, message: message.trim(),
      });
      const payload = {
        _id: chatMessage._id, orderId, senderId: auth.id,
        senderRole: auth.role, message: chatMessage.message,
        status: chatMessage.status, createdAt: chatMessage.createdAt,
      };

      // Broadcast to shared chat room
      io.to(`chat:${orderId}`).emit('chat:message', payload);
      // Also emit to private room in case the other party hasn't joined the chat room yet
      if (auth.role === 'customer' && order.driver)
        io.to(`driver:${order.driver}`).emit('chat:message', payload);
      if (auth.role === 'driver' && order.customer)
        io.to(`customer:${order.customer}`).emit('chat:message', payload);
    } catch (err) {
      console.error('[Socket chat:send]', err);
      socket.emit('chat:error', { message: 'Failed to send message' });
    }
  });
};
