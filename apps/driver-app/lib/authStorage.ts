import AsyncStorage from '@react-native-async-storage/async-storage';

const ACCESS = 'driver_access_token';
const REFRESH = 'driver_refresh_token';

export async function getAccessToken(): Promise<string | null> {
  return AsyncStorage.getItem(ACCESS);
}

export async function setTokens(access: string, refresh: string): Promise<void> {
  await AsyncStorage.multiSet([
    [ACCESS, access],
    [REFRESH, refresh],
  ]);
}

export async function clearTokens(): Promise<void> {
  await AsyncStorage.multiRemove([ACCESS, REFRESH]);
}
