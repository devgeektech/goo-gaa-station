import { Request, Response } from 'express';
import ChatMessage from '../../models/ChatMessage';
import { Order } from '../../models/Order';

// POST /api/v1/app/orders/:orderId/chat
export const sendMessage = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { orderId } = req.params;
    const { message } = req.body;
    const customerId = (req as any).customer._id;

    if (!message || typeof message !== 'string' || !message.trim())
      return res.status(400).json({ message: 'message is required' });
    if (message.trim().length > 1000)
      return res.status(400).json({ message: 'message must be 1000 characters or fewer' });

    const order = await (Order as any).findOne({ _id: orderId, customer: customerId })
      .select('driver status').lean();
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (!order.driver) return res.status(409).json({ message: 'No driver assigned yet' });
    if (['delivered', 'cancelled'].includes(order.status))
      return res.status(409).json({ message: 'Chat is closed for this order' });

    const chatMessage = await (ChatMessage as any).create({
      orderId, senderId: customerId, senderRole: 'customer', message: message.trim(),
    });

    const io = req.app.get('io');
    const payload = {
      _id: chatMessage._id, orderId, senderId: customerId,
      senderRole: 'customer', message: chatMessage.message,
      status: chatMessage.status, createdAt: chatMessage.createdAt,
    };
    io.to(`driver:${order.driver}`).emit('chat:message', payload);
    io.to(`customer:${customerId}`).emit('chat:message', payload); // multi-device
    return res.status(201).json({ chatMessage: payload });
  } catch (err) {
    console.error('[CustomerChat] sendMessage:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// GET /api/v1/app/orders/:orderId/chat
export const getChatHistory = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { orderId } = req.params;
    const customerId = (req as any).customer._id;
    const page = Math.max(1, parseInt((req.query.page as string) ?? '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) ?? '30', 10)));

    const order = await (Order as any).findOne({ _id: orderId, customer: customerId })
      .select('_id driver').lean();
    if (!order) return res.status(404).json({ message: 'Order not found' });

    const [messages, total] = await Promise.all([
      (ChatMessage as any).find({ orderId }).sort({ createdAt: 1 })
        .skip((page - 1) * limit).limit(limit).lean(),
      (ChatMessage as any).countDocuments({ orderId }),
    ]);

    // Mark driver messages as read
    await (ChatMessage as any).updateMany(
      { orderId, senderRole: 'driver', status: { $ne: 'read' } },
      { $set: { status: 'read', readAt: new Date() } }
    );
    if (order.driver) {
      req.app.get('io').to(`driver:${order.driver}`).emit('chat:read', {
        orderId, readBy: 'customer', readAt: new Date().toISOString(),
      });
    }
    return res.status(200).json({
      messages,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('[CustomerChat] getChatHistory:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
