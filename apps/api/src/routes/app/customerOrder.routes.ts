import { Router } from 'express';
import { authenticateJWT, requireRole } from '../../middlewares/auth.middleware';
import { validateIdParam } from '../../middlewares/validateObjectId.middleware';
import { placeOrder, listMyOrders, getOrder, cancelOrder, rateOrder, trackOrder } from '../../controllers/app/customerOrder.controller';

const router = Router();

router.use(authenticateJWT);
router.use(requireRole('user'));

router.param('id', validateIdParam);
router.post('/', placeOrder);
router.get('/', listMyOrders);
router.get('/:id', getOrder);
router.post('/:id/cancel', cancelOrder);
router.post('/:id/rate', rateOrder);
router.get('/:id/track', trackOrder);

export default router;
