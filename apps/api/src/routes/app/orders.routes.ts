import { Router } from 'express';
import { authenticateJWT, requireRole } from '../../middlewares/auth.middleware';
import { validateIdParam } from '../../middlewares/validateObjectId.middleware';
import {
  placeOrder,
  getOrders,
  getOrderById,
  cancelOrder,
  rateOrder,
} from '../../controllers/app/orderController';

const router = Router();

router.use(authenticateJWT);
router.use(requireRole('user'));

router.param('id', validateIdParam);

router.post('/', placeOrder);
router.get('/', getOrders);
router.get('/:id', getOrderById);
router.post('/:id/cancel', cancelOrder);
router.post('/:id/rate', rateOrder);

export default router;
