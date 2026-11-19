import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';

/**
 * Redirect to tab layout so the app opens with bottom nav (Home + Menu).
 * Approval status remains at /vendor/approval-status.
 */
export default function IndexRedirect() {
  const router = useRouter();
  const { accessToken, ready } = useAuth();

  // Old: always go to tabs, even without a token (socket never joined).
  // useEffect(() => {
  //   router.replace('/(tabs)');
  // }, [router]);

  useEffect(() => {
    if (!ready) return;
    if (!accessToken) {
      router.replace('/login');
      return;
    }
    router.replace('/(tabs)');
  }, [ready, accessToken, router]);

  return null;
}

