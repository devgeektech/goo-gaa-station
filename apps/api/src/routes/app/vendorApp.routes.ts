import { Router } from 'express';
import { validateIdParam } from '../../middlewares/validateObjectId.middleware';
import { listVendors, getVendor, getRecommendedVendors } from '../../controllers/app/vendorApp.controller';
import { optionalAuth, authenticateJWT, requireRole } from '../../middlewares/auth.middleware';
import { addVendorRating, getVendorRatings } from '../../controllers/app/vendorRating.controller';

const router = Router();

router.param('id', validateIdParam);

router.get('/', optionalAuth, listVendors);
router.get('/recommended', optionalAuth, getRecommendedVendors);
router.get('/:id/ratings', getVendorRatings);
router.post('/:id/ratings', authenticateJWT, requireRole('user'), addVendorRating);
router.get('/:id', optionalAuth, getVendor);

export default router;
