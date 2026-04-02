import { Router } from 'express';
import { authDriver } from '../../middlewares/authDriver.middleware';
import { validateIdParam } from '../../middlewares/validateObjectId.middleware';
import {
  getAvailableOrders,
  acceptOrder,
  pickupOrder,
  enrouteOrder,
  deliverOrder,
  updateOrderStatus,
  getActiveOrder,
  getDeliveryHistory,
} from '../../controllers/app/driverOrder.controller';

const router = Router();

router.use(authDriver);

router.param('id', validateIdParam);
router.get('/available', getAvailableOrders);
router.get('/active', getActiveOrder);
router.get('/history', getDeliveryHistory);
router.patch('/:id/accept', acceptOrder);
router.patch('/:id/pickup', pickupOrder);
router.patch('/:id/enroute', enrouteOrder);
router.patch('/:id/deliver', deliverOrder);
router.patch('/:id/status', updateOrderStatus);

export default router;
