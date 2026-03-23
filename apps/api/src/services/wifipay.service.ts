import crypto from 'crypto';
import axios from 'axios';
import { Order } from '../models/Order';
import { Transaction } from '../models/Transaction';
import { User } from '../models/User';
import { env } from '../config/env';
import { AppError } from '../utils/AppError';
import { MESSAGES } from '../constants/messages';

export interface WebhookPayload {
  reference?: string;
  status?: string;
  amount?: number;
  failureReason?: string;
  [key: string]: unknown;
}

export interface InitiatePaymentParams {
  phone: string;
  amount: number;
  currency: string;
  orderId: string;
}

export interface InitiatePaymentResult {
  reference: string;
  status: string;
  rawResponse: unknown;
}

export async function initiatePayment(params: InitiatePaymentParams): Promise<InitiatePaymentResult> {
  const url = `${env.WIFIPAY_API_URL.replace(/\/$/, '')}/payments/initiate`;
  try {
    const { data } = await axios.post(
      url,
      {
        phone: params.phone,
        amount: params.amount,
        currency: params.currency || 'EUR',
        reference: params.orderId,
      },
      {
        headers: { Authorization: `Bearer ${env.WIFIPAY_API_KEY}` },
        timeout: 10000,
      }
    );
    return {
      reference: data.reference ?? data.id ?? '',
      status: data.status ?? 'pending',
      rawResponse: data,
    };
  } catch (err) {
    throw new AppError(
      { en: MESSAGES.PAYMENT.en.initFailed, de: MESSAGES.PAYMENT.de.initFailed },
      502,
      'PAYMENT_INIT_FAILED'
    );
  }
}

export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  const secret = env.WIFIPAY_WEBHOOK_SECRET || '';
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

export async function checkPaymentStatus(reference: string): Promise<{ status: string; amount?: number; phone?: string; rawResponse: unknown }> {
  const url = `${env.WIFIPAY_API_URL.replace(/\/$/, '')}/payments/${reference}`;
  try {
    const { data } = await axios.get(url, {
      headers: { Authorization: `Bearer ${env.WIFIPAY_API_KEY}` },
      timeout: 5000,
    });
    return {
      status: data.status ?? 'unknown',
      amount: data.amount,
      phone: data.phone,
      rawResponse: data,
    };
  } catch {
    return { status: 'unknown', rawResponse: null };
  }
}

export interface InitiateRefundParams {
  originalReference: string;
  amount: number;
  reason?: string;
}

export interface InitiateRefundResult {
  refundReference: string;
  status: string;
}

/**
 * Convenience: initiate payment by orderId, phone, amount. Returns WifiPay reference.
 */
export async function initiatePaymentForOrder(
  orderId: string,
  phone: string,
  amount: number,
  currency = 'EUR'
): Promise<{ reference: string; status: string }> {
  const result = await initiatePayment({
    orderId,
    phone,
    amount,
    currency,
  });
  return { reference: result.reference, status: result.status };
}

export interface HandleWebhookResult {
  handled: boolean;
  invalidSignature?: boolean;
  status?: 'success' | 'failed';
  order?: { _id: unknown; customerId?: unknown; toObject?: () => unknown };
  reference?: string;
}

/**
 * Handle WifiPay webhook: verify signature, then update order.paymentStatus and Transaction.
 * Call with raw body string and x-wifipay-signature (or x-signature) header value.
 * Returns result so caller can emit socket (order, status, reference).
 */
export async function handleWebhook(
  rawBody: string,
  signature: string
): Promise<HandleWebhookResult> {
  if (!verifyWebhookSignature(rawBody, signature)) {
    return { handled: false, invalidSignature: true };
  }

  let payload: WebhookPayload;
  try {
    payload = JSON.parse(rawBody) as WebhookPayload;
  } catch {
    return { handled: true };
  }

  const reference = payload.reference;
  if (!reference || typeof reference !== 'string') {
    return { handled: true };
  }

  const transaction = await Transaction.findOne({ wifipayRef: reference });
  if (!transaction) {
    return { handled: true };
  }
  if (transaction.status !== 'pending') {
    return { handled: true };
  }

  const status = (payload.status || '').toUpperCase();

  if (status === 'SUCCESS') {
    transaction.status = 'success';
    transaction.completedAt = new Date();
    transaction.wifipayRawResponse = payload;
    await transaction.save();

    const order = await Order.findByIdAndUpdate(transaction.orderId, { paymentStatus: 'paid' }, { new: true });
    if (order?.customerId) {
      await User.findByIdAndUpdate(order.customerId, { $inc: { totalSpent: order.total } });
    }
    return { handled: true, status: 'success', order: order ?? undefined, reference };
  }

  if (status === 'FAILED') {
    transaction.status = 'failed';
    transaction.failureReason = payload.failureReason || 'Webhook FAILED';
    transaction.wifipayRawResponse = payload;
    await transaction.save();
    await Order.findByIdAndUpdate(transaction.orderId, { paymentStatus: 'failed' });
    return { handled: true, status: 'failed', reference };
  }

  return { handled: true };
}

export async function initiateRefund(params: InitiateRefundParams): Promise<InitiateRefundResult> {
  const url = `${env.WIFIPAY_API_URL.replace(/\/$/, '')}/payments/refund`;
  try {
    const { data } = await axios.post(
      url,
      {
        originalReference: params.originalReference,
        amount: params.amount,
        reason: params.reason,
      },
      {
        headers: { Authorization: `Bearer ${env.WIFIPAY_API_KEY}` },
        timeout: 10000,
      }
    );
    return {
      refundReference: data.refundReference ?? data.reference ?? data.id ?? '',
      status: data.status ?? 'pending',
    };
  } catch {
    throw new AppError(
      { en: 'Refund initiation failed', de: 'Rückerstattung fehlgeschlagen' },
      502,
      'REFUND_FAILED'
    );
  }
}
