import axios, { type AxiosInstance } from 'axios';
import { API_URL } from '@/lib/config';

export type KycStatusValue = 'not_submitted' | 'pending' | 'approved' | 'rejected';

export type KycDocuments = {
  driversLicense: string | null;
  nationalId: string[];
  vehiclePhotos: string[];
};

export type KycStatusResponse = {
  kycStatus: KycStatusValue;
  kycRejectionReason: string | null;
  kycSubmittedAt: string | null;
  kycDocuments: KycDocuments;
};

function client(accessToken: string): AxiosInstance {
  return axios.create({
    baseURL: `${API_URL.replace(/\/$/, '')}/api/v1`,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
    timeout: 120000,
  });
}

export async function fetchKycStatus(accessToken: string) {
  const res = await client(accessToken).get<{ success: boolean; data: KycStatusResponse }>('/driver/kyc/status');
  return res.data.data;
}

export type KycUploadFile = { uri: string; name: string; type: string };

export async function uploadKycDocuments(
  accessToken: string,
  files: { driversLicense: KycUploadFile; nationalId: KycUploadFile[]; vehiclePhotos: KycUploadFile[] }
) {
  const form = new FormData();
  form.append('driversLicense', {
    uri: files.driversLicense.uri,
    name: files.driversLicense.name,
    type: files.driversLicense.type,
  } as unknown as Blob);
  for (const f of files.nationalId) {
    form.append('nationalId', { uri: f.uri, name: f.name, type: f.type } as unknown as Blob);
  }
  for (const f of files.vehiclePhotos) {
    form.append('vehiclePhotos', { uri: f.uri, name: f.name, type: f.type } as unknown as Blob);
  }
  const res = await client(accessToken).post<{ success: boolean; data: { message?: string; kycStatus?: string; kycSubmittedAt?: string } }>(
    '/driver/kyc/upload',
    form,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
    }
  );
  return res.data.data;
}

export async function patchKycResubmit(accessToken: string) {
  const res = await client(accessToken).patch<{ success: boolean; data: { kycStatus: string } }>('/driver/kyc/resubmit');
  return res.data.data;
}

export type ApiErrorShape = {
  success: false;
  message?: { en?: string; de?: string };
  data?: { missing?: string[] } | null;
  code?: string;
};

export function getApiErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const d = err.response?.data as ApiErrorShape | undefined;
    const en = d?.message?.en ?? d?.message?.de;
    if (en) return en;
    if (err.response?.status === 413) return 'Each file must be under 5MB';
    if (err.response?.status === 422) return 'Validation failed';
  }
  if (err instanceof Error) return err.message;
  return 'Something went wrong';
}

export function getMissingFields(err: unknown): string[] {
  if (axios.isAxiosError(err)) {
    const d = err.response?.data as ApiErrorShape | undefined;
    const m = d?.data && typeof d.data === 'object' && 'missing' in d.data ? (d.data as { missing?: string[] }).missing : undefined;
    return Array.isArray(m) ? m : [];
  }
  return [];
}
