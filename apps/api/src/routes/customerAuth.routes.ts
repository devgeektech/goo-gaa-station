import { Router, type Request, type Response, type NextFunction } from 'express';
import {
  appRefresh,
  appLogout,
  appSendOtp,
  appResendOtp,
  appVerifyOtp,
} from '../controllers/auth.controller';

const router = Router();

/** Force role=customer for OTP flows so this route is customer-only (vendor uses /auth/vendor, driver later /auth/driver). */
function customerOnly(req: Request, res: Response, next: NextFunction): void {
  req.body = { ...(req.body ?? {}), role: 'customer' };
  next();
}

router.post('/send-otp', customerOnly, appSendOtp);
router.post('/verify-otp', customerOnly, appVerifyOtp);
router.post('/resend-otp', customerOnly, appResendOtp);
router.post('/refresh', appRefresh);
router.post('/logout', appLogout);

export default router;
