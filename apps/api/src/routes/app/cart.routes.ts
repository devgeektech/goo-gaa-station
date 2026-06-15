import { Router } from 'express';
import { authenticateJWT, requireRole } from '../../middlewares/auth.middleware';
import { enforceCustomerAccount } from '../../middlewares/enforceCustomerAccount.middleware';
import { getCart, setCart, updateItem, clearCart } from '../../controllers/app/cartController';

const router = Router();

router.use(authenticateJWT);
router.use(enforceCustomerAccount);
router.use(requireRole('user'));

router.get('/', getCart);
router.post('/', setCart);
router.patch('/item', updateItem);
router.delete('/', clearCart);

export default router;
