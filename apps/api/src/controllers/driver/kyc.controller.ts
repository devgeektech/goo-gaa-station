/**
 * Driver KYC HTTP controller (STEP 4).
 * Routes: GET `/api/v1/driver/kyc/status`, POST `/upload`, PATCH `/resubmit`.
 * Mount: `authDriver` + router in `routes/index.ts`.
 */
export { getKycStatus, postKycUpload, patchKycResubmit } from '../driverKyc.controller';
