import { apiClient } from './client';

export type OnboardingStatusResponse = {
  onboardingStep: number;
  approvalStatus: 'none' | 'pending' | 'approved' | 'rejected' | null;
  submittedAt: string | null;
  name: string | null;
  rejectionReason?: string | null;
};

export async function getOnboardingStatus(): Promise<OnboardingStatusResponse> {
  const { data } = await apiClient.get<{ success: true; data: OnboardingStatusResponse }>('/vendor/onboarding/status');
  return data.data;
}

export async function resubmitOnboarding(): Promise<{ message: string; approvalStatus: string; onboardingStep: number }> {
  const { data } = await apiClient.post<{ success: true; data: { message: string; approvalStatus: string; onboardingStep: number } }>('/vendor/onboarding/resubmit');
  return data.data;
}
