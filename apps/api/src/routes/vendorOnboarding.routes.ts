import { Router } from 'express';
import { authVendor } from '../middlewares/authVendor.middleware';
import {
  getOnboardingStatus,
  patchBusinessInfo,
  patchAddress,
  postKycDocuments,
  postSubmit,
  postResubmit,
} from '../controllers/vendorOnboarding.controller';

const router = Router();

router.use(authVendor);

router.get('/status', getOnboardingStatus);
router.patch('/business-info', patchBusinessInfo);
router.patch('/address', patchAddress);
router.post('/kyc-documents', postKycDocuments);
router.post('/submit', postSubmit);
router.post('/resubmit', postResubmit);

export default router;
