import { Router } from 'express';
import { validateIdParam } from '../../middlewares/validateObjectId.middleware';
import {
  listCustomerNotifications,
  markCustomerNotificationRead,
  deleteCustomerNotification,
} from '../../controllers/app/customerNotification.controller';

const router = Router();

router.get('/', listCustomerNotifications);
router.param('id', validateIdParam);
router.patch('/:id/read', markCustomerNotificationRead);
router.delete('/:id', deleteCustomerNotification);

export default router;
