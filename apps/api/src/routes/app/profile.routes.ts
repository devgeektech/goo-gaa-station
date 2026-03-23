import { Router } from 'express';
import { authenticateJWT, requireRole } from '../../middlewares/auth.middleware';
import { validateIdParam } from '../../middlewares/validateObjectId.middleware';
import {
  getProfile,
  updateProfile,
  getAddresses,
  addAddress,
  updateAddressById,
  deleteAddressById,
  setDefaultAddress,
  getNotifications,
  updateNotifications,
  addOrUpdateFcmToken,
  removeFcmToken,
  getOrders,
  getPoints,
} from '../../controllers/app/customerProfile.controller';

const router = Router();

router.use(authenticateJWT);
router.use(requireRole('user'));

router.param('id', validateIdParam);

router.get('/', getProfile);
router.patch('/', updateProfile);

router.get('/addresses', getAddresses);
router.post('/addresses', addAddress);
router.patch('/addresses/:id', updateAddressById);
router.delete('/addresses/:id', deleteAddressById);
router.patch('/addresses/:id/default', setDefaultAddress);

router.get('/notifications', getNotifications);
router.patch('/notifications', updateNotifications);

router.post('/fcm-token', addOrUpdateFcmToken);
router.delete('/fcm-token', removeFcmToken);

router.get('/orders', getOrders);
router.get('/points', getPoints);

export default router;
