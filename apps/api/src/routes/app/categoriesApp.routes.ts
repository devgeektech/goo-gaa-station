import { Router } from 'express';
import { appListCategories, appCategoryVendors } from '../../controllers/category.controller';

const router = Router();

router.get('/', appListCategories);
router.get('/:slug/vendors', appCategoryVendors);

export default router;
