import { Router } from 'express';
import { authAdmin } from '../../middlewares/authAdmin.middleware';
import { requireRole } from '../../middlewares/auth.middleware';
import { validateIdParam, validateObjectId } from '../../middlewares/validateObjectId.middleware';
import {
  listVendors,
  getVendor,
  createVendor,
  updateVendor,
  blockVendor,
  approveVendor,
  rejectVendor,
  deleteVendor,
  listVendorProducts,
  listMenuItems,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
} from '../../controllers/admin/vendorAdmin.controller';

const router = Router();

router.use(authAdmin);
router.use(requireRole('admin', 'super_admin'));

router.param('id', validateIdParam);
router.param('itemId', (req, res, next, itemId) => validateObjectId(req, res, next, itemId, 'itemId'));

router.get('/', listVendors);
router.get('/:id', getVendor);
router.post('/', createVendor);
router.patch('/:id', updateVendor);
router.patch('/:id/block', blockVendor);
router.patch('/:id/approve', approveVendor);
router.patch('/:id/reject', rejectVendor);
router.delete('/:id', deleteVendor);

router.get('/:id/products', listVendorProducts);
router.get('/:id/menu-items', listMenuItems);
router.post('/:id/menu-items', createMenuItem);
router.patch('/:id/menu-items/:itemId', updateMenuItem);
router.delete('/:id/menu-items/:itemId', deleteMenuItem);

export default router;
