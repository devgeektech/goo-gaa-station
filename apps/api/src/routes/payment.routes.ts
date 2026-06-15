import { Router } from 'express';
import { authenticateJWT, requireRole } from '../middlewares/auth.middleware';
import { enforceCustomerAccount } from '../middlewares/enforceCustomerAccount.middleware';
import { initiatePayment, getPaymentStatus, createRefund } from '../controllers/payment.controller';

const router = Router();

router.post('/initiate', authenticateJWT, enforceCustomerAccount, requireRole('user'), initiatePayment);
router.get('/status/:reference', authenticateJWT, enforceCustomerAccount, getPaymentStatus);
router.post('/refund', authenticateJWT, requireRole('admin', 'super_admin'), createRefund);

export default router;
