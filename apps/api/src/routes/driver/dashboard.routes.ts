import { Router } from 'express';
import { getDriverDashboard } from '../../controllers/driver/driverDashboard.controller';

const router = Router();

router.get('/', getDriverDashboard);

export default router;
