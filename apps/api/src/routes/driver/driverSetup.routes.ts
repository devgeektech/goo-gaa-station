import { Router } from 'express';
import { getSetupStatus, updateProfileInfo, updateVehicleInfo } from '../../controllers/driverSetup.controller';

const router = Router();

router.get('/status', getSetupStatus);
router.patch('/profile-info', updateProfileInfo);
router.patch('/vehicle-info', updateVehicleInfo);

export default router;

