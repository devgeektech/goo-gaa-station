import { Router } from 'express';
import { authenticateJWT, requireRole } from '../../middlewares/auth.middleware';
import {
  getProfile,
  updateProfile,
  updateFcmToken,
  getAddresses,
  addAddress,
  updateAddressById,
  deleteAddressById,
  getOrderHistory,
  deleteAccount,
  updateWishlist,
  getWishlist,
} from '../../controllers/app/customerProfile.controller';

const router = Router();

router.use(authenticateJWT);
router.use(requireRole('user')); // JWT role for customer (phone OTP login)

router.get('/profile', getProfile);
router.put('/profile', updateProfile);
router.put('/fcm-token', updateFcmToken);
router.get('/addresses', getAddresses);
router.post('/addresses', addAddress);
router.put('/addresses/:id', updateAddressById);
router.delete('/addresses/:id', deleteAddressById);
router.get('/order-history', getOrderHistory);
router.put('/wishlist', updateWishlist);
router.get('/wishlist', getWishlist);
router.delete('/account', deleteAccount);

export default router;
