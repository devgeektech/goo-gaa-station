const { Transaction } = require('../models/Transaction');
const { Order } = require('../models/Order');
const { User } = require('../models/User');
const { sendToMultiple } = require('./fcm.service');

/**
 * Shared refund + customer-notification helper for vendor reject/timeout flows.
 * Idempotent: if refund tx exists, no duplicate refund tx is created.
 */
async function initiateRefund(order, reason, io) {
  // IDEMPOTENCY GUARD: prevent double refunds
  const existing = await Transaction.findOne({ orderId: order._id, type: 'refund' });
  if (existing) return existing;

  // Only refund if payment was actually taken (online/wallet)
  if (order.paymentMethod === 'cash' || order.paymentStatus !== 'paid') {
    if (io) {
      io.to(`customer:${order.customerId}`).emit('order:cancelled', {
        orderId: order._id,
        orderNumber: order.orderNumber,
        reason,
        refundInitiated: false,
      });
    }
    const customer = await User.findById(order.customerId).select('fcmTokens').lean();
    const tokens = (customer?.fcmTokens ?? []).map((t) => t?.token ?? '').filter(Boolean);
    if (tokens.length) {
      await sendToMultiple(tokens, {
        title: '❌ Order Cancelled',
        body: `Your order ${order.orderNumber} was cancelled. ${reason}.`,
        data: { screen: 'OrderDetail', orderId: String(order._id) },
      });
    }
    return null;
  }

  /* WIFIPAY_REFUND_START
  // Uncomment when WifiPay credentials are available
  await wifiPayClient.post('/v1/refunds', {
    reference: order.wifipayRef,
    amount: order.total,
    reason,
  });
  WIFIPAY_REFUND_END */

  // Create refund transaction record
  const tx = await Transaction.create({
    orderId: order._id,
    customerId: order.customerId ?? null,
    type: 'refund',
    status: 'success',
    amount: order.total,
    wifipayRef: order.wifipayRef ?? null,
    wifipayRawResponse: { reason },
    completedAt: new Date(),
  });

  // Update order paymentStatus
  await Order.findByIdAndUpdate(order._id, { paymentStatus: 'refunded' });

  // Notify customer via Socket.IO
  if (io) {
    io.to(`customer:${order.customerId}`).emit('order:cancelled', {
      orderId: order._id,
      orderNumber: order.orderNumber,
      reason,
      refundInitiated: true,
    });
  }

  // FCM push to customer
  const customer = await User.findById(order.customerId).select('fcmTokens').lean();
  const tokens = (customer?.fcmTokens ?? []).map((t) => t?.token ?? '').filter(Boolean);
  if (tokens.length) {
    await sendToMultiple(tokens, {
      title: '❌ Order Cancelled',
      body: `Your order ${order.orderNumber} was cancelled. ${reason}. Refund initiated.`,
      data: { screen: 'OrderDetail', orderId: String(order._id) },
    });
  }
  return tx;
}

module.exports = { initiateRefund };

