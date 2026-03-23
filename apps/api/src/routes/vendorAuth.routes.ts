import { Router } from 'express';
import {
  vendorSendOtp,
  vendorVerifyOtp,
  vendorResendOtp,
  vendorRefresh,
  vendorLogout,
} from '../controllers/authVendor.controller';
import { authVendor } from '../middlewares/authVendor.middleware';

const router = Router();

router.post('/send-otp', vendorSendOtp);
router.post('/verify-otp', vendorVerifyOtp);
router.post('/resend-otp', vendorResendOtp);
router.post('/refresh', vendorRefresh);
router.post('/logout', authVendor, vendorLogout);

export default router;
