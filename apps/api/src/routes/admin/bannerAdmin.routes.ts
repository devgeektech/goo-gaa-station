import { Router } from 'express';
import { authAdmin } from '../../middlewares/authAdmin.middleware';
import { requireRole } from '../../middlewares/auth.middleware';
import { validateIdParam } from '../../middlewares/validateObjectId.middleware';
import {
  createBanner,
  deleteBanner,
  listBanners,
  toggleBannerStatus,
  updateBanner,
} from '../../controllers/admin/bannerAdmin.controller';

const router = Router();

router.use(authAdmin);
router.use(requireRole('admin', 'super_admin'));

router.get('/', listBanners);
router.post('/', createBanner);

router.param('id', validateIdParam);
router.patch('/:id', updateBanner);
router.patch('/:id/toggle', toggleBannerStatus);
router.delete('/:id', deleteBanner);

export default router;
