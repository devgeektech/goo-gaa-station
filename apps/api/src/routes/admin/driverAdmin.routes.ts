import { Router } from 'express';
import { authAdmin } from '../../middlewares/authAdmin.middleware';
import { requireRole } from '../../middlewares/auth.middleware';
import { validateIdParam } from '../../middlewares/validateObjectId.middleware';
import {
  listDrivers,
  getPendingCount,
  getPendingApprovals,
  getDriver,
  updateDriver,
  deleteDriver,
  approveDriver,
  rejectDriver,
  blockDriver,
  updateDriverStatus,
  getDriverOrders,
  getDriverLocation,
} from '../../controllers/admin/driverAdmin.controller';

const router = Router();

router.use(authAdmin);
router.use(requireRole('admin', 'super_admin'));

router.param('id', validateIdParam);
router.get('/stats/pending-count', getPendingCount);
router.get('/', listDrivers);
router.get('/pending', getPendingApprovals);
router.get('/:id', getDriver);
router.put('/:id', updateDriver);
router.delete('/:id', deleteDriver);
router.patch('/:id/approve', approveDriver);
router.patch('/:id/reject', rejectDriver);
router.patch('/:id/block', blockDriver);
router.patch('/:id/status', updateDriverStatus);
router.get('/:id/orders', getDriverOrders);
router.get('/:id/location', getDriverLocation);

export default router;
