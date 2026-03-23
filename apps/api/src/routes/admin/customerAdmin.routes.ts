import { Router } from 'express';
import { authAdmin } from '../../middlewares/authAdmin.middleware';
import { requireRole } from '../../middlewares/auth.middleware';
import { validateIdParam } from '../../middlewares/validateObjectId.middleware';
import {
  listCustomers,
  getCustomer,
  createCustomer,
  updateCustomer,
  blockCustomer,
  deleteCustomer,
} from '../../controllers/admin/customerAdmin.controller';

const router = Router();

router.use(authAdmin);
router.use(requireRole('admin', 'super_admin'));

router.param('id', validateIdParam);

router.get('/', listCustomers);
router.get('/:id', getCustomer);
router.post('/', createCustomer);
router.patch('/:id', updateCustomer);
router.patch('/:id/block', blockCustomer);
router.delete('/:id', deleteCustomer);

export default router;
