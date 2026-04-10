import { Router } from 'express';
import { validateIdParam } from '../../middlewares/validateObjectId.middleware';
import {
  getNewOrders,
  getActiveOrders,
  getCompletedOrders,
  acceptOrder,
  rejectOrder,
} from '../../controllers/driver/orderListController';
import { getOrderDetail } from '../../controllers/driver/orderDetail.controller';

const router = Router();

router.param('id', validateIdParam);

router.get('/new', getNewOrders);
router.get('/active', getActiveOrders);
router.get('/completed', getCompletedOrders);
router.get('/:id/detail', getOrderDetail);
router.post('/:id/accept', acceptOrder);
router.post('/:id/reject', rejectOrder);

export default router;

