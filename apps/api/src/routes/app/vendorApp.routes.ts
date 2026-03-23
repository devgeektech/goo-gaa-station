import { Router } from 'express';
import { validateIdParam } from '../../middlewares/validateObjectId.middleware';
import { listVendors, getVendor } from '../../controllers/app/vendorApp.controller';

const router = Router();

router.param('id', validateIdParam);

router.get('/', listVendors);
router.get('/:id', getVendor);

export default router;
