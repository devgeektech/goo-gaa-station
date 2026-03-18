import { ApprovalStatus } from '../../screens/vendor/ApprovalStatus';
import { useRouter, useLocalSearchParams } from 'expo-router';

/**
 * Route: /vendor/approval-status
 * Navigate here after Step 6 (submit) or when FCM notification with approvalStatus is tapped.
 * Query params: approvalStatus (pending | approved | rejected) from FCM payload.
 * Pass accessToken from your auth context for Socket.IO approval/reject events.
 */
export default function ApprovalStatusRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{ approvalStatus?: string }>();
  const initialApprovalStatus = params.approvalStatus as 'pending' | 'approved' | 'rejected' | undefined;
  // TODO: get accessToken from auth context, e.g. useAuth().accessToken
  const accessToken = null;

  return (
    <ApprovalStatus
      accessToken={accessToken}
      initialApprovalStatus={initialApprovalStatus ?? null}
      onGoToDashboard={() => router.replace('/')}
      onGoToKycStep={() => {
        // Navigate to your onboarding Step 5 (KYC Documents) screen.
        router.replace('/onboarding/kyc' as any);
      }}
    />
  );
}
