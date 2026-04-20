import { Router } from 'express';
import { sendMessage, getChatHistory } from '../../controllers/driver/chatController';

const router = Router({ mergeParams: true });

router.get('/', getChatHistory);
router.post('/', sendMessage);

export default router;
