import Constants from 'expo-constants';

const extra = Constants.expoConfig?.extra ?? {};

export const API_URL = (process.env.EXPO_PUBLIC_API_URL as string | undefined) ?? (extra.apiUrl as string) ?? 'http://localhost:3000';
export const SOCKET_URL = (process.env.EXPO_PUBLIC_SOCKET_URL as string | undefined) ?? (extra.socketUrl as string) ?? API_URL;
export const SUPPORT_EMAIL =
  (process.env.EXPO_PUBLIC_SUPPORT_EMAIL as string | undefined) ?? (extra.supportEmail as string) ?? 'support@delivereats.com';
