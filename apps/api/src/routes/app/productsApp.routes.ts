import { Router } from 'express';
import { validateIdParam } from '../../middlewares/validateObjectId.middleware';
import { Product } from '../../models/Product';
import { AppError } from '../../utils/AppError';
import { sendSuccess } from '../../utils/response';
import { asyncHandler } from '../../utils/asyncHandler';

const router = Router();

router.param('id', validateIdParam);

/** GET /api/v1/app/products/:id — Public product detail (available, not deleted) */
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const product = await Product.findOne({
      _id: req.params.id,
      isAvailable: true,
      isDeleted: false,
    })
      .populate('vendor', '_id name logo')
      .populate('category', '_id name')
      .lean();
    if (!product) {
      throw new AppError(
        { en: 'Product not found', de: 'Produkt nicht gefunden' },
        404,
        'NOT_FOUND'
      );
    }
    return sendSuccess(res, product);
  })
);

export default router;
