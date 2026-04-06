import { Router } from 'express';
import { getNotifications, markAllRead } from '../../controllers/driver/notification.controller';

const router = Router();

router.get('/', getNotifications);
router.patch('/read-all', markAllRead);

export default router;
