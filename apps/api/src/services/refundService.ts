const svc = require('./refundService.js') as {
  initiateRefund: (
    order: {
      _id: unknown;
      orderNumber?: string | null;
      customerId?: unknown;
      paymentMethod?: string | null;
      paymentStatus?: string | null;
      total?: number | null;
      wifipayRef?: string | null;
    },
    reason: string,
    io?: unknown
  ) => Promise<unknown>;
};

export const initiateRefund = svc.initiateRefund;
module.exports = svc;

