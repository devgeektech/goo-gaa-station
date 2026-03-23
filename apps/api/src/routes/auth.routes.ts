import { Router } from 'express';
import {
  adminLogin,
  adminRefresh,
  adminLogout,
} from '../controllers/auth.controller';
const router = Router();

// ========== ADMIN (HttpOnly cookies) ==========
router.post('/admin/login', adminLogin);
router.post('/admin/refresh', adminRefresh); // no auth — uses refreshToken cookie
router.post('/admin/logout', adminLogout);

// Customer auth is at /auth/customer (customerAuth.routes). Vendor at /auth/vendor (vendorAuth.routes). Driver TBD.

export default router;
