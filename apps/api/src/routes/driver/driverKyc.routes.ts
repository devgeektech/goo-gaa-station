import { Router } from 'express';

import { getKycStatus, patchKycResubmit, postKycUpload } from '../../controllers/driver/kyc.controller';

const router = Router();

router.get('/status', getKycStatus);
router.post('/upload', postKycUpload);
router.patch('/resubmit', patchKycResubmit);

export default router;
