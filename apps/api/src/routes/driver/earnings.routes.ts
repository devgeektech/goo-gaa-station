import { Router } from 'express';
import { getDriverEarnings } from '../../controllers/driver/driverEarnings.controller';

const router = Router();

router.get('/', getDriverEarnings);

export default router;
