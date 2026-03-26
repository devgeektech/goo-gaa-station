import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'driver_kyc_verification_complete';

export async function getKycVerificationComplete(): Promise<boolean> {
  const v = await AsyncStorage.getItem(KEY);
  return v === '1';
}

export async function setKycVerificationComplete(done: boolean): Promise<void> {
  await AsyncStorage.setItem(KEY, done ? '1' : '0');
}
