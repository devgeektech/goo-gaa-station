import { Router } from 'express';
import { getVendorWallet } from '../../controllers/vendor/vendorWallet.controller';

const router = Router();

router.get('/', getVendorWallet);

export default router;
