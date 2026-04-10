import { Router } from 'express';
import { validateIdParam } from '../../middlewares/validateObjectId.middleware';
import { listVendors, getVendor } from '../../controllers/app/vendorApp.controller';
import { optionalAuth } from '../../middlewares/auth.middleware';

const router = Router();

router.param('id', validateIdParam);

router.get('/', optionalAuth, listVendors);
router.get('/:id', optionalAuth, getVendor);

export default router;
