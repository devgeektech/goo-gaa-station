import { Router } from 'express';
import { authAdmin } from '../../middlewares/authAdmin.middleware';
import { requireRole } from '../../middlewares/auth.middleware';
import { validateIdParam } from '../../middlewares/validateObjectId.middleware';
import {
  listUsers,
  createUser,
  getUser,
  updateUser,
  deleteUser,
  updateUserStatus,
  getUserOrders,
  exportUsersCsv,
} from '../../controllers/admin/userAdmin.controller';

const router = Router();

router.use(authAdmin);
router.use(requireRole('admin', 'super_admin'));

router.param('id', validateIdParam);
router.get('/export/csv', exportUsersCsv);
router.get('/', listUsers);
router.post('/', createUser);
router.get('/:id', getUser);
router.put('/:id', updateUser);
router.delete('/:id', deleteUser);
router.patch('/:id/status', updateUserStatus);
router.get('/:id/orders', getUserOrders);

export default router;
