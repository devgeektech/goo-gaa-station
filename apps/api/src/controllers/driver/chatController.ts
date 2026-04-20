import { Request, Response } from 'express';
import ChatMessage from '../../models/ChatMessage';
import Order from '../../models/Order';

// POST /api/v1/driver/orders/:orderId/chat
export const sendMessage = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { orderId } = req.params;
    const { message } = req.body;
    const driverId = (req as any).driver._id;

    if (!message || typeof message !== 'string' || !message.trim())
      return res.status(400).json({ message: 'message is required' });
    if (message.trim().length > 1000)
      return res.status(400).json({ message: 'message must be 1000 characters or fewer' });

    const order = await (Order as any).findOne({ _id: orderId, driver: driverId })
      .select('customer status').lean();
    if (!order) return res.status(404).json({ message: 'Order not found or not assigned to you' });
    if (['delivered', 'cancelled'].includes(order.status))
      return res.status(409).json({ message: 'Chat is closed for this order' });

    const chatMessage = await (ChatMessage as any).create({
      orderId, senderId: driverId, senderRole: 'driver', message: message.trim(),
    });

    const io = req.app.get('io');
    const payload = {
      _id: chatMessage._id, orderId, senderId: driverId,
      senderRole: 'driver', message: chatMessage.message,
      status: chatMessage.status, createdAt: chatMessage.createdAt,
    };
    io.to(`customer:${order.customer}`).emit('chat:message', payload);
    io.to(`driver:${driverId}`).emit('chat:message', payload); // multi-device
    return res.status(201).json({ chatMessage: payload });
  } catch (err) {
    console.error('[DriverChat] sendMessage:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// GET /api/v1/driver/orders/:orderId/chat
export const getChatHistory = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { orderId } = req.params;
    const driverId = (req as any).driver._id;
    const page = Math.max(1, parseInt((req.query.page as string) ?? '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) ?? '30', 10)));

    const order = await (Order as any).findOne({ _id: orderId, driver: driverId })
      .select('_id customer').lean();
    if (!order) return res.status(404).json({ message: 'Order not found or not assigned to you' });

    const [messages, total] = await Promise.all([
      (ChatMessage as any).find({ orderId }).sort({ createdAt: 1 })
        .skip((page - 1) * limit).limit(limit).lean(),
      (ChatMessage as any).countDocuments({ orderId }),
    ]);

    // Mark customer messages as read
    await (ChatMessage as any).updateMany(
      { orderId, senderRole: 'customer', status: { $ne: 'read' } },
      { $set: { status: 'read', readAt: new Date() } }
    );
    req.app.get('io').to(`customer:${order.customer}`).emit('chat:read', {
      orderId, readBy: 'driver', readAt: new Date().toISOString(),
    });
    return res.status(200).json({
      messages,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('[DriverChat] getChatHistory:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
