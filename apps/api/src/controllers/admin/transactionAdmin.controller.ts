import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Transaction } from '../../models/Transaction';
import { AppError } from '../../utils/AppError';
import { sendSuccess } from '../../utils/response';
import { asyncHandler } from '../../utils/asyncHandler';
import { parsePagination } from '../../utils/pagination';

function toPaginated<T>(data: T[], total: number, page: number, limit: number) {
  const totalPages = Math.ceil(total / limit) || 1;
  return { data, total, page, limit, totalPages, hasNext: page < totalPages, hasPrev: page > 1 };
}

/** GET / */
export const listTransactions = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit } = parsePagination(req.query);
  const type = String(req.query.type || '').trim();
  const status = String(req.query.status || '').trim();
  const dateFrom = req.query.dateFrom ? new Date(String(req.query.dateFrom)) : null;
  const dateTo = req.query.dateTo ? new Date(String(req.query.dateTo)) : null;
  const customerId = String(req.query.customerId || '').trim();
  const search = String(req.query.search || '').trim();

  const filter: Record<string, unknown> = {};
  if (type) filter.type = type;
  if (status) filter.status = status;
  if (customerId && mongoose.Types.ObjectId.isValid(customerId)) filter.customerId = new mongoose.Types.ObjectId(customerId);
  if (search) filter.wifipayRef = new RegExp(search, 'i');
  if (dateFrom || dateTo) {
    filter.createdAt = {};
    if (dateFrom) (filter.createdAt as Record<string, Date>).$gte = dateFrom;
    if (dateTo) (filter.createdAt as Record<string, Date>).$lte = dateTo;
  }

  const [transactions, total] = await Promise.all([
    Transaction.find(filter).select('-wifipayRawResponse').populate('customerId', 'name phone').populate('orderId', 'orderNumber total').lean().sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    Transaction.countDocuments(filter),
  ]);

  return sendSuccess(res, transactions, 200, toPaginated(transactions, total, page, limit));
});

/** GET /:id */
export const getTransaction = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError({ en: 'Transaction not found', de: 'Transaktion nicht gefunden' }, 404);
  }
  const tx = await Transaction.findById(id).populate('orderId').populate('customerId').lean();
  if (!tx) throw new AppError({ en: 'Transaction not found', de: 'Transaktion nicht gefunden' }, 404);
  return sendSuccess(res, tx);
});

/** GET /stats/revenue */
export const getRevenueStats = asyncHandler(async (req: Request, res: Response) => {
  const period = String(req.query.period || 'daily');
  const dateFrom = req.query.dateFrom ? new Date(String(req.query.dateFrom)) : new Date(0);
  const dateTo = req.query.dateTo ? new Date(String(req.query.dateTo)) : new Date();

  const format = period === 'monthly' ? '%Y-%m' : period === 'weekly' ? '%Y-W%V' : '%Y-%m-%d';
  const group = await Transaction.aggregate([
    { $match: { type: 'payment', status: 'success', createdAt: { $gte: dateFrom, $lte: dateTo } } },
    { $group: { _id: { $dateToString: { format, date: '$createdAt' } }, revenue: { $sum: '$amount' }, count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);
  const refunds = await Transaction.aggregate([
    { $match: { type: 'refund', status: 'success', createdAt: { $gte: dateFrom, $lte: dateTo } } },
    { $group: { _id: { $dateToString: { format, date: '$createdAt' } }, refunds: { $sum: '$amount' } } },
  ]);
  const refundMap: Record<string, number> = {};
  refunds.forEach((r: { _id: string; refunds: number }) => { refundMap[r._id] = r.refunds; });

  const result = group.map((g: { _id: string; revenue: number; count: number }) => ({
    period: g._id,
    revenue: g.revenue,
    count: g.count,
    refunds: refundMap[g._id] ?? 0,
  }));

  return sendSuccess(res, result);
});
