import { Router } from 'express';
import { authAdmin } from '../../middlewares/authAdmin.middleware';
import { requireRole } from '../../middlewares/auth.middleware';
import { validateIdParam } from '../../middlewares/validateObjectId.middleware';
import {
  getAdminOrders,
  getAdminOrder,
  updateAdminOrderStatus,
  assignDriver,
} from '../../controllers/admin/orderAdminP7.controller';
import { getStatsSummary } from '../../controllers/admin/orderAdmin.controller';

const router = Router();

router.use(authAdmin);
router.use(requireRole('admin', 'super_admin'));

router.param('id', validateIdParam);

router.get('/stats/summary', getStatsSummary);
router.get('/', getAdminOrders);
router.get('/:id', getAdminOrder);
router.patch('/:id/status', updateAdminOrderStatus);
router.patch('/:id/driver', assignDriver);

export default router;
