import { Router } from 'express';
import {
  getVendorProfile,
  patchVendorProfile,
  toggleVendorOpenStatus,
  patchVendorOperatingHours,
} from '../../controllers/vendor/profileController';

const router = Router();

router.get('/', getVendorProfile);
router.patch('/', patchVendorProfile);
router.patch('/toggle', toggleVendorOpenStatus);
router.patch('/operating-hours', patchVendorOperatingHours);

export default router;

