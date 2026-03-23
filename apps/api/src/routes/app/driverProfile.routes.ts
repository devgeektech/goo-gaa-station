import { Router } from 'express';
import { authenticateJWT, requireRole } from '../../middlewares/auth.middleware';
import {
  getProfile,
  updateProfile,
  updateFcmToken,
  updateOnlineStatus,
  updateLocation,
  getCurrentOrder,
  getEarnings,
  getDeliveryHistory,
} from '../../controllers/app/driverProfile.controller';

const router = Router();

router.use(authenticateJWT);
router.use(requireRole('driver'));

router.get('/profile', getProfile);
router.put('/profile', updateProfile);
router.put('/fcm-token', updateFcmToken);
router.patch('/online-status', updateOnlineStatus);
router.put('/location', updateLocation);
router.get('/current-order', getCurrentOrder);
router.get('/earnings', getEarnings);
router.get('/delivery-history', getDeliveryHistory);

export default router;
