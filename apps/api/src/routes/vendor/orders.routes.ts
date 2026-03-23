import { Router } from 'express';
import { validateIdParam } from '../../middlewares/validateObjectId.middleware';
import {
  getVendorOrders,
  getVendorOrder,
  updateOrderStatus,
  rejectOrder,
} from '../../controllers/vendor/orderVendor.controller';

const router = Router();

router.param('id', validateIdParam);

router.get('/', getVendorOrders);
router.get('/:id', getVendorOrder);
router.patch('/:id/status', updateOrderStatus);
router.patch('/:id/reject', rejectOrder);

export default router;
