import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '@/context/AuthContext';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerShown: true, headerBackTitle: 'Back' }}>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ title: 'Sign in' }} />
          <Stack.Screen name="document-verification" options={{ title: 'Document verification' }} />
          <Stack.Screen name="application-status" options={{ title: 'Application status' }} />
          <Stack.Screen name="home" options={{ title: 'Home' }} />
        </Stack>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
