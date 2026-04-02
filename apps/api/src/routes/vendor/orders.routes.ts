import { Router } from 'express';
import { validateIdParam } from '../../middlewares/validateObjectId.middleware';
import {
  getVendorOrders,
  getNewOrders,
  getCurrentOrders,
  getCompletedOrders,
  getVendorOrder,
  acceptOrder,
  markOrderReady,
  updateOrderStatus,
  rejectOrder,
} from '../../controllers/vendor/orderVendor.controller';

const router = Router();

router.param('id', validateIdParam);

router.get('/', getVendorOrders);
router.get('/new', getNewOrders);
router.get('/current', getCurrentOrders);
router.get('/completed', getCompletedOrders);
router.get('/:id', getVendorOrder);
router.patch('/:id/accept', acceptOrder);
router.patch('/:id/ready', markOrderReady);
router.patch('/:id/status', updateOrderStatus);
router.patch('/:id/reject', rejectOrder);

export default router;
