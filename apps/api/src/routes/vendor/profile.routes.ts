import { Router } from 'express';
import {
  getVendorProfile,
  patchVendorProfile,
  registerVendorFcmToken,
  removeVendorFcmToken,
  toggleVendorOpenStatus,
  patchVendorOperatingHours,
} from '../../controllers/vendor/profileController';

const router = Router();

router.get('/', getVendorProfile);
router.patch('/', patchVendorProfile);
router.patch('/toggle', toggleVendorOpenStatus);
router.patch('/operating-hours', patchVendorOperatingHours);
router.post('/fcm-token', registerVendorFcmToken);
router.delete('/fcm-token', removeVendorFcmToken);

export default router;

