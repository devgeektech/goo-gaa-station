import { Router } from 'express';
import { validateIdParam } from '../../middlewares/validateObjectId.middleware';
import {
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  toggleProduct,
  deleteProduct,
} from '../../controllers/vendor/product.controller';

const router = Router();
router.param('id', validateIdParam);

router.get('/', listProducts);
router.get('/:id', getProduct);
router.post('/', createProduct);
router.patch('/:id/toggle', toggleProduct);
router.patch('/:id', updateProduct);
router.delete('/:id', deleteProduct);

export default router;
