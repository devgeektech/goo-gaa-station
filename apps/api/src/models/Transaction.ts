import mongoose from 'mongoose';
import { getOrCreateModel } from '../utils/getOrCreateModel';

const TransactionSchema = new mongoose.Schema(
  {
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    driverId: { type: mongoose.Schema.Types.ObjectId, ref: 'Driver', default: null },
    type: { type: String, enum: ['payment', 'refund', 'payout'], required: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'EUR' },
    phone: { type: String, default: null },
    wifipayRef: { type: String, default: null },
    wifipayRawResponse: { type: mongoose.Schema.Types.Mixed, default: null },
    status: { type: String, enum: ['pending', 'success', 'failed'], default: 'pending' },
    failureReason: { type: String, default: null },
    initiatedAt: { type: Date, default: Date.now },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

TransactionSchema.index({ wifipayRef: 1 }, { sparse: true, unique: true });
TransactionSchema.index({ customerId: 1 });
TransactionSchema.index({ driverId: 1 });
TransactionSchema.index({ status: 1 });
TransactionSchema.index({ type: 1 });
TransactionSchema.index({ createdAt: -1 });

export const Transaction = getOrCreateModel('Transaction', TransactionSchema);
