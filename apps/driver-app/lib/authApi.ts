import axios from 'axios';
import { API_URL } from '@/lib/config';

const base = `${API_URL.replace(/\/$/, '')}/api/v1/auth/driver`;

export async function sendDriverOtp(phone: string) {
  const res = await axios.post<{ success: boolean; data: unknown }>(`${base}/send-otp`, { phone });
  return res.data;
}

export async function verifyDriverOtp(phone: string, otp: string) {
  const res = await axios.post<{
    success: boolean;
    data: { accessToken: string; refreshToken: string; isNewDriver?: boolean; approvalStatus?: string };
  }>(`${base}/verify-otp`, { phone, otp });
  return res.data.data;
}
