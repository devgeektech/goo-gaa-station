import { useEffect } from 'react';
import { useRouter } from 'expo-router';

/**
 * Redirect to tab layout so the app opens with bottom nav (Home + Menu).
 * Approval status remains at /vendor/approval-status.
 */
export default function IndexRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/(tabs)');
  }, [router]);
  return null;
}

