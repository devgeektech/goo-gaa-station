import { Router } from 'express';
import { authDriver } from '../../middlewares/authDriver.middleware';
import { validateIdParam } from '../../middlewares/validateObjectId.middleware';
import {
  getNewOrders,
  getAvailableOrders,
  acceptOrder,
  rejectOrder,
  pickupOrder,
  enrouteOrder,
  deliverOrder,
  updateOrderStatus,
  getActiveOrder,
  getDeliveryHistory,
  getCompletedOrders,
} from '../../controllers/app/driverOrder.controller';

const router = Router();

router.use(authDriver);

router.param('id', validateIdParam);
router.get('/new', getNewOrders);
router.get('/available', getAvailableOrders);
router.get('/active', getActiveOrder);
router.get('/completed', getCompletedOrders);
router.get('/history', getDeliveryHistory);
router.post('/:id/accept', acceptOrder);
router.post('/:id/reject', rejectOrder);
router.patch('/:id/accept', acceptOrder);
router.patch('/:id/pickup', pickupOrder);
router.patch('/:id/enroute', enrouteOrder);
router.patch('/:id/deliver', deliverOrder);
router.patch('/:id/status', updateOrderStatus);

export default router;
