# DeliverEats Vendor App (Expo)

React Native / Expo app for vendors. After completing onboarding Step 6 (submit), the app shows the **Approval Status** screen.

## Setup

```bash
cd apps/vendor-app
pnpm install
```

Set `EXPO_PUBLIC_API_URL` (e.g. `http://localhost:5000/api/v1`) and optionally `EXPO_PUBLIC_SOCKET_URL` (e.g. `http://localhost:5000`) for the API and Socket.IO server.

## Run

```bash
pnpm start
```

Then press `i` for iOS or `a` for Android simulator.

## Approval Status Screen

- **Route**: `/vendor/approval-status` (see `app/vendor/approval-status.tsx`).
- **After Step 6**: Navigate to this screen after calling `POST /api/v1/vendor/onboarding/submit`.
- **Data**: On mount calls `GET /api/v1/vendor/onboarding/status` for `approvalStatus`, `onboardingStep`, `submittedAt` (and `rejectionReason` when rejected).
- **Polling**: Every 30 seconds while `approvalStatus === 'pending'`.
- **Socket.IO**: Listens for `vendor:approved` and `vendor:rejected` when `accessToken` is set (see `useVendorSocket`).
- **FCM**: When the user taps a push notification whose payload contains `approvalStatus`, open this screen and pass it as a query param: `/vendor/approval-status?approvalStatus=approved` (or `rejected`).

## Navigation from onboarding

After submit (Step 6), navigate to the approval screen:

```ts
router.replace('/vendor/approval-status');
```

Wire `onGoToKycStep` to your Step 5 (KYC) screen route so that "Resubmit Documents" takes the vendor back to KYC.

## Auth

Set the vendor access token after login so API and socket use it:

```ts
import { setVendorAccessToken } from '@/src/api/client';
setVendorAccessToken(accessToken);
```

Pass the same `accessToken` to `<ApprovalStatus accessToken={accessToken} />` for socket events.
