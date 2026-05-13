import { Router } from 'express';
import { getVendorDashboard } from '../../controllers/vendor/vendorDashboard.controller';

const router = Router();

router.get('/', getVendorDashboard);

export default router;
