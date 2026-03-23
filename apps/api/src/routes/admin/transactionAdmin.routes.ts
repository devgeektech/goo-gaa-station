import { Router } from 'express';
import { authAdmin } from '../../middlewares/authAdmin.middleware';
import { requireRole } from '../../middlewares/auth.middleware';
import { validateIdParam } from '../../middlewares/validateObjectId.middleware';
import { listTransactions, getTransaction, getRevenueStats } from '../../controllers/admin/transactionAdmin.controller';

const router = Router();

router.use(authAdmin);
router.use(requireRole('admin', 'super_admin'));

router.param('id', validateIdParam);
router.get('/stats/revenue', getRevenueStats);
router.get('/', listTransactions);
router.get('/:id', getTransaction);

export default router;
