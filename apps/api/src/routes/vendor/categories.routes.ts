import { Router } from 'express';
import { listVendorCategories } from '../../controllers/vendor/vendorCategory.controller';

const router = Router();
router.get('/', listVendorCategories);
export default router;
