import { Router } from 'express';
import { authenticateJWT, requireRole } from '../../middlewares/auth.middleware';
import { validateIdParam } from '../../middlewares/validateObjectId.middleware';
import { getAvailableOrders, acceptOrder, updateOrderStatus, getActiveOrder, getDeliveryHistory } from '../../controllers/app/driverOrder.controller';

const router = Router();

router.use(authenticateJWT);
router.use(requireRole('driver'));

router.param('id', validateIdParam);
router.get('/available', getAvailableOrders);
router.get('/active', getActiveOrder);
router.get('/history', getDeliveryHistory);
router.post('/:id/accept', acceptOrder);
router.patch('/:id/status', updateOrderStatus);

export default router;
