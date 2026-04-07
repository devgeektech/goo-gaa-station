import { Router } from 'express';
import { updateLocation } from '../../controllers/driver/location.controller';

const router = Router();

/** PATCH /location — REST GPS update + optional socket broadcast (authDriver on parent mount) */
router.patch('/location', updateLocation);

export default router;
