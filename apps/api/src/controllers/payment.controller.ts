import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Order } from '../models/Order';
import { Transaction } from '../models/Transaction';
import { User } from '../models/User';
import { AppError } from '../utils/AppError';
import { MESSAGES } from '../constants/messages';
import { sendSuccess } from '../utils/response';
import { asyncHandler } from '../utils/asyncHandler';
import * as wifipayService from '../services/wifipay.service';
import type { Server as SocketIOServer } from 'socket.io';

function getIo(req: Request): SocketIOServer | undefined {
  return (req.app as { get?(key: string): unknown }).get?.('io') as SocketIOServer | undefined;
}

/** POST /initiate — Customer initiates payment */
export const initiatePayment = asyncHandler(async (req: Request, res: Response) => {
  const customerId = req.user?._id;
  if (!customerId) throw new AppError({ en: MESSAGES.AUTH.en.unauthorized, de: MESSAGES.AUTH.de.unauthorized }, 401);
  const { orderId, phone } = req.body ?? {};
  if (!orderId || !phone) {
    throw new AppError({ en: 'orderId and phone required', de: 'orderId und Telefon erforderlich' }, 400, 'VALIDATION_ERROR');
  }

  const order = await Order.findOne({ _id: orderId, customerId });
  if (!order) throw new AppError({ en: MESSAGES.ORDER.en.notFound, de: MESSAGES.ORDER.de.notFound }, 404);
  if (order.paymentStatus !== 'pending') {
    throw new AppError({ en: 'Order is not pending payment', de: 'Bestellung hat keinen ausstehenden Zahlungsstatus' }, 400, 'INVALID_STATUS');
  }

  // Idempotent: reuse existing pending payment to avoid duplicate wifipayRef (e.g. double-click)
  const existing = await Transaction.findOne({
    orderId: order._id,
    type: 'payment',
    status: 'pending',
    wifipayRef: { $ne: null },
  });
  if (existing?.wifipayRef) {
    if (!order.wifipayRef) {
      order.wifipayRef = existing.wifipayRef;
      await order.save();
    }
    return sendSuccess(res, {
      reference: existing.wifipayRef,
      message: { en: 'Payment already initiated', de: 'Zahlung bereits eingeleitet' },
    });
  }

  const result = await wifipayService.initiatePayment({
    phone: String(phone),
    amount: order.total,
    currency: 'EUR',
    orderId: order._id.toString(),
  });

  await Transaction.create({
    orderId: order._id,
    customerId: order.customerId,
    type: 'payment',
    amount: order.total,
    currency: 'EUR',
    phone: String(phone),
    wifipayRef: result.reference,
    status: 'pending',
  });
  order.wifipayRef = result.reference;
  await order.save();

  return sendSuccess(res, {
    reference: result.reference,
    message: { en: 'Payment initiated', de: 'Zahlung eingeleitet' },
  });
});

/** Shared webhook handler: raw body + signature → handleWebhook, then emit socket if needed */
export async function wifipayWebhookHandler(req: Request, res: Response): Promise<void> {
  const rawBody = (req as Request & { body?: Buffer | string }).body;
  const raw = typeof rawBody === 'string' ? rawBody : (Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : '');
  const signature = (req.headers['x-wifipay-signature'] || req.headers['x-signature'] || '') as string;

  const result = await wifipayService.handleWebhook(raw, signature);
  if (result.invalidSignature) {
    res.status(401).send('Invalid signature');
    return;
  }
  const io = getIo(req);
  if (result.status === 'success' && result.order) {
    const order = result.order;
    const customerId = order.customerId?.toString?.() ?? (order as { customerId?: unknown }).customerId;
    if (customerId && io) io.to(`customer:${customerId}`).emit('payment:confirmed', order.toObject?.() ?? order);
    if (io) io.to('admin').emit('order:payment_confirmed', order.toObject?.() ?? order);
  }
  if (result.status === 'failed' && result.reference && io) {
    const tx = await Transaction.findOne({ wifipayRef: result.reference }).select('customerId').lean() as { customerId?: unknown } | null;
    if (tx?.customerId) io.to(`customer:${tx.customerId}`).emit('payment:failed', { reference: result.reference });
  }
  res.status(200).send('OK');
}

/** POST /callback — WifiPay webhook (raw body, no auth); delegates to handleWebhook */
export const paymentCallback = wifipayWebhookHandler;

/** GET /status/:reference */
export const getPaymentStatus = asyncHandler(async (req: Request, res: Response) => {
  const reference = req.params.reference;
  if (!reference) {
    throw new AppError({ en: 'Reference required', de: 'Referenz erforderlich' }, 400);
  }

  const transaction = await Transaction.findOne({ wifipayRef: reference }).lean();
  if (transaction) {
    const tx = transaction as unknown as { status: string; _id: unknown };
    return sendSuccess(res, { status: tx.status, transactionId: tx._id });
  }
  const result = await wifipayService.checkPaymentStatus(reference);
  return sendSuccess(res, { status: result.status });
});

/** POST /refund — Admin */
export const createRefund = asyncHandler(async (req: Request, res: Response) => {
  const { transactionId, reason } = req.body ?? {};
  if (!transactionId) {
    throw new AppError({ en: 'transactionId required', de: 'transactionId erforderlich' }, 400, 'VALIDATION_ERROR');
  }

  const transaction = await Transaction.findById(transactionId);
  if (!transaction) throw new AppError({ en: 'Transaction not found', de: 'Transaktion nicht gefunden' }, 404);
  if (transaction.status !== 'success' || transaction.type !== 'payment') {
    throw new AppError({ en: 'Transaction cannot be refunded', de: 'Transaktion kann nicht erstattet werden' }, 400, 'INVALID_STATUS');
  }

  const order = await Order.findById(transaction.orderId);
  if (!order) throw new AppError({ en: MESSAGES.ORDER.en.notFound, de: MESSAGES.ORDER.de.notFound }, 404);
  if (order.paymentStatus === 'refunded') {
    throw new AppError({ en: 'Order already refunded', de: 'Bereits erstattet' }, 400, 'ALREADY_REFUNDED');
  }

  const result = await wifipayService.initiateRefund({
    originalReference: transaction.wifipayRef || '',
    amount: transaction.amount,
    reason: reason ? String(reason) : undefined,
  });

  await Transaction.create({
    orderId: transaction.orderId,
    customerId: transaction.customerId,
    type: 'refund',
    amount: transaction.amount,
    currency: transaction.currency,
    wifipayRef: result.refundReference,
    status: 'pending',
  });
  await Order.findByIdAndUpdate(transaction.orderId, { paymentStatus: 'refunded' });

  return sendSuccess(res, { refundReference: result.refundReference });
});
