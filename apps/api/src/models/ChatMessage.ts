import { Schema, model, Document, Types } from 'mongoose';

export type SenderRole = 'customer' | 'driver';
export type MessageStatus = 'sent' | 'delivered' | 'read';

export interface IChatMessage extends Document {
  orderId:    Types.ObjectId;
  senderId:   Types.ObjectId;
  senderRole: SenderRole;
  message:    string;
  status:     MessageStatus;
  readAt:     Date | null;
  createdAt:  Date;
}

const ChatMessageSchema = new Schema<IChatMessage>(
  {
    orderId: {
      type: Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
      index: true,
    },
    senderId:   { type: Schema.Types.ObjectId, required: true },
    senderRole: { type: String, enum: ['customer', 'driver'], required: true },
    message:    { type: String, required: true, trim: true, maxlength: 1000 },
    status:     { type: String, enum: ['sent', 'delivered', 'read'], default: 'sent' },
    readAt:     { type: Date, default: null },
  },
  { timestamps: true }
);

// Compound index: fast history fetch per order (ordered by time)
ChatMessageSchema.index({ orderId: 1, createdAt: 1 });
// Index for unread-count queries
ChatMessageSchema.index({ orderId: 1, senderRole: 1, status: 1 });

export default model<IChatMessage>('ChatMessage', ChatMessageSchema);
