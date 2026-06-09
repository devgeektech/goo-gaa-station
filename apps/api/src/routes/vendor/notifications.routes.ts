import { Router } from 'express';
import { validateIdParam } from '../../middlewares/validateObjectId.middleware';
import {
  listVendorNotifications,
  markVendorNotificationRead,
  markAllVendorNotificationsRead,
} from '../../controllers/vendor/notification.controller';

const router = Router();

router.get('/', listVendorNotifications);
router.patch('/read-all', markAllVendorNotificationsRead);
router.param('id', validateIdParam);
router.patch('/:id/read', markVendorNotificationRead);

export default router;
