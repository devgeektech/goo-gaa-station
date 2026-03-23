import { Router } from 'express';
import { authAdmin } from '../../middlewares/authAdmin.middleware';
import { validateIdParam } from '../../middlewares/validateObjectId.middleware';
import {
  adminListCategories,
  adminCreateCategory,
  adminUpdateCategory,
  adminToggleActive,
  adminReorderCategories,
  adminDeleteCategory,
} from '../../controllers/category.controller';

const router = Router();

router.use(authAdmin);

router.get('/', adminListCategories);
router.post('/', adminCreateCategory);
router.patch('/reorder', adminReorderCategories);

router.param('id', validateIdParam);
router.patch('/:id', adminUpdateCategory);
router.patch('/:id/toggle', adminToggleActive);
router.delete('/:id', adminDeleteCategory);

export default router;
