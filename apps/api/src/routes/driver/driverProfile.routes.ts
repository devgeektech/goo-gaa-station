import { Router } from 'express';

import {
  getSelfProfile,
  patchSelfProfile,
  registerFcmToken,
  removeFcmToken,
  patchDriverStatus,
} from '../../controllers/driverSelfProfile.controller';

const router = Router();

router.get('/', getSelfProfile);
router.patch('/', patchSelfProfile);
router.post('/fcm-token', registerFcmToken);
router.delete('/fcm-token', removeFcmToken);
router.patch('/status', patchDriverStatus);

export default router;

