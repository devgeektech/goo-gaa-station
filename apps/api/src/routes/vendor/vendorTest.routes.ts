import { Router } from 'express';
import { getTestNearbyDrivers } from '../../controllers/vendor/vendorTest.controller';

/** TEMPORARY — remove with vendorTest.controller + index mount */
const router = Router();

router.get('/nearby-drivers', getTestNearbyDrivers);

export default router;
