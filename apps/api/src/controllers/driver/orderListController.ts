import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import {
  getNewOrders as getNewOrdersBase,
  getActiveOrder as getActiveOrdersBase,
  getCompletedOrders as getCompletedOrdersBase,
  acceptOrder as acceptOrderBase,
  rejectOrder as rejectOrderBase,
} from '../app/driverOrder.controller';

/** GET /api/v1/driver/orders/new */
export const getNewOrders = asyncHandler(async (req: Request, res: Response) => {
  return getNewOrdersBase(req, res);
});

/** GET /api/v1/driver/orders/active */
export const getActiveOrders = asyncHandler(async (req: Request, res: Response) => {
  return getActiveOrdersBase(req, res);
});

/** GET /api/v1/driver/orders/completed */
export const getCompletedOrders = asyncHandler(async (req: Request, res: Response) => {
  return getCompletedOrdersBase(req, res);
});

/** POST /api/v1/driver/orders/:id/accept */
export const acceptOrder = asyncHandler(async (req: Request, res: Response) => {
  return acceptOrderBase(req, res);
});

/** POST /api/v1/driver/orders/:id/reject */
export const rejectOrder = asyncHandler(async (req: Request, res: Response) => {
  return rejectOrderBase(req, res);
});

