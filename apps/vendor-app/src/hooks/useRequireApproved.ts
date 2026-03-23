import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { getOnboardingStatus } from '../api/vendorOnboarding';

/**
 * Guard for product management screens: if vendor.approvalStatus !== 'approved',
 * redirect to ApprovalStatus screen. Returns { approved, loading }.
 */
export function useRequireApproved(): { approved: boolean; loading: boolean } {
  const router = useRouter();
  const [approved, setApproved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getOnboardingStatus()
      .then((data) => {
        if (cancelled) return;
        if (data.approvalStatus === 'approved') {
          setApproved(true);
        } else {
          router.replace('/vendor/approval-status');
        }
      })
      .catch(() => {
        if (!cancelled) router.replace('/vendor/approval-status');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  return { approved, loading };
}
