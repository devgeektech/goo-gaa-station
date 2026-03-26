import { useEffect, useState } from 'react';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { fetchKycStatus } from '@/lib/kycApi';
import { getKycVerificationComplete } from '@/lib/kycStorage';

/**
 * After Phase 7 auth: GET KYC status and route.
 */
export default function Index() {
  const router = useRouter();
  const { accessToken, ready } = useAuth();
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    if (!ready) return;

    if (!accessToken) {
      router.replace('/login');
      setBooting(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const [status, kycDone] = await Promise.all([fetchKycStatus(accessToken), getKycVerificationComplete()]);
        if (cancelled) return;
        if (kycDone && status.kycStatus === 'approved') {
          router.replace('/home');
          return;
        }
        switch (status.kycStatus) {
          case 'not_submitted':
            router.replace('/document-verification');
            break;
          case 'pending':
          case 'approved':
            router.replace('/application-status');
            break;
          case 'rejected':
            router.replace('/application-status');
            break;
          default:
            router.replace('/document-verification');
        }
      } catch {
        if (!cancelled) router.replace('/login');
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ready, accessToken, router]);

  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color="#DC2626" />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
