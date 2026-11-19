import { apiClient } from './client';

export async function sendVendorOtp(phone: string): Promise<{ otp?: string; maskedPhone?: string }> {
  const { data } = await apiClient.post<{
    success: boolean;
    data: { message?: string; otp?: string; maskedPhone?: string };
  }>('/auth/vendor/send-otp', { phone });
  return data.data;
}

export async function verifyVendorOtp(
  phone: string,
  otp: string
): Promise<{ accessToken: string; refreshToken: string }> {
  const { data } = await apiClient.post<{
    success: boolean;
    data: { accessToken: string; refreshToken: string };
  }>('/auth/vendor/verify-otp', { phone, otp });
  return data.data;
}
