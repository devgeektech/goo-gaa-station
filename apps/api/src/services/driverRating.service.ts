import mongoose from 'mongoose';
import { Order } from '../models/Order';

export type DriverRatingStats = {
  /** Average delivery rating (1–5), null when no rated deliveries yet */
  rating: number | null;
  ratingCount: number;
};

/**
 * Average from delivered orders with deliveryRating, driverRating, or legacy customerRating.
 * Matches recalculation in order rate handlers.
 */
export async function computeDriverRatingStats(
  driverId: mongoose.Types.ObjectId | string
): Promise<DriverRatingStats> {
  const id = new mongoose.Types.ObjectId(String(driverId));
  const agg = await Order.aggregate<{ avg: number; count: number }>([
    {
      $match: {
        driverId: id,
        status: 'delivered',
      },
    },
    {
      $addFields: {
        score: {
          $ifNull: ['$deliveryRating', { $ifNull: ['$driverRating', '$customerRating'] }],
        },
      },
    },
    { $match: { score: { $ne: null } } },
    {
      $group: {
        _id: null,
        avg: { $avg: '$score' },
        count: { $sum: 1 },
      },
    },
  ]);

  const count = agg[0]?.count ?? 0;
  if (!count || typeof agg[0]?.avg !== 'number' || Number.isNaN(agg[0].avg)) {
    return { rating: null, ratingCount: 0 };
  }

  return {
    rating: Math.round(agg[0].avg * 10) / 10,
    ratingCount: count,
  };
}

/** Attach computed rating stats to lean driver list items (batch). */
export async function attachDriverRatingStats<T extends { _id: unknown }>(
  drivers: T[]
): Promise<Array<T & DriverRatingStats>> {
  if (!drivers.length) return [];

  const ids = drivers.map((d) => new mongoose.Types.ObjectId(String(d._id)));
  const agg = await Order.aggregate<{ _id: mongoose.Types.ObjectId; avg: number; count: number }>([
    {
      $match: {
        driverId: { $in: ids },
        status: 'delivered',
      },
    },
    {
      $addFields: {
        score: {
          $ifNull: ['$deliveryRating', { $ifNull: ['$driverRating', '$customerRating'] }],
        },
      },
    },
    { $match: { score: { $ne: null } } },
    {
      $group: {
        _id: '$driverId',
        avg: { $avg: '$score' },
        count: { $sum: 1 },
      },
    },
  ]);

  const byDriver = new Map(
    agg.map((row) => [
      String(row._id),
      {
        rating: Math.round(row.avg * 10) / 10,
        ratingCount: row.count,
      },
    ])
  );

  return drivers.map((d) => {
    const stats = byDriver.get(String(d._id));
    return {
      ...d,
      rating: stats?.rating ?? null,
      ratingCount: stats?.ratingCount ?? 0,
    };
  });
}
