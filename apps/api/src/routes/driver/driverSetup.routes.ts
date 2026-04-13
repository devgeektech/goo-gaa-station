import { Router } from 'express';
import { getSetupStatus, updateProfileInfo } from '../../controllers/driverSetup.controller';

const router = Router();

router.get('/status', getSetupStatus);
router.patch('/profile-info', updateProfileInfo);

export default router;

