import { Router } from 'express';
import { authAdmin } from '../../middlewares/authAdmin.middleware';
import { requireRole } from '../../middlewares/auth.middleware';
import { getAppSettings, patchAppSettings } from '../../controllers/admin/appSettingsAdmin.controller';

const router = Router();

router.use(authAdmin);
router.use(requireRole('admin', 'super_admin'));

router.get('/', getAppSettings);
router.patch('/', patchAppSettings);

export default router;

