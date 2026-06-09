import { Router } from 'express';
import { validateIdParam } from '../../middlewares/validateObjectId.middleware';
import { getNotifications, markAllRead, markNotificationRead } from '../../controllers/driver/notification.controller';

const router = Router();

router.get('/', getNotifications);
router.patch('/read-all', markAllRead);
router.param('id', validateIdParam);
router.patch('/:id/read', markNotificationRead);

export default router;
