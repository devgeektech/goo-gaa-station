import { Router } from 'express';
import { authAdmin } from '../../middlewares/authAdmin.middleware';
import { requireRole } from '../../middlewares/auth.middleware';
import { validateIdParam } from '../../middlewares/validateObjectId.middleware';
import {
  listOrders,
  getOrder,
  updateOrderStatus,
  cancelOrder,
  assignDriver,
  getStatsSummary,
} from '../../controllers/admin/orderAdmin.controller';

const router = Router();

router.use(authAdmin);
router.use(requireRole('admin', 'super_admin'));

router.param('id', validateIdParam);
router.get('/stats/summary', getStatsSummary);
router.get('/', listOrders);
router.get('/:id', getOrder);
router.patch('/:id/status', updateOrderStatus);
router.patch('/:id/cancel', cancelOrder);
router.patch('/:id/assign-driver', assignDriver);

export default router;
