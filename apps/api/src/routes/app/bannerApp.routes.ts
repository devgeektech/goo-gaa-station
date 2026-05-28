import { Router } from 'express';
import { listActiveBanners } from '../../controllers/app/bannerApp.controller';

const router = Router();

router.get('/', listActiveBanners);

export default router;
