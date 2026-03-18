import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

/**
 * FCM: When a push notification is opened and the payload contains approvalStatus
 * (e.g. vendor_approved / vendor_rejected), navigate to the ApprovalStatus screen
 * and pass initialApprovalStatus so the correct state is shown immediately.
 * Example: linking.getInitialURL() or messaging().onNotificationOpenedApp() in a
 * separate effect or in a root component that has access to navigation.
 */
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: true }}>
        <Stack.Screen name="index" options={{ title: 'Vendor' }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="vendor/approval-status"
          options={{ title: 'Application Status' }}
        />
      </Stack>
    </SafeAreaProvider>
  );
}
