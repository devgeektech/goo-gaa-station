import axios from 'axios';

export const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  withCredentials: true, // admin auth is cookie-based
  headers: {
    'Content-Type': 'application/json',
  },
});

// Redirect to login on 401 when in browser (e.g. session expired or not logged in)
apiClient.interceptors.response.use(
  (res) => res,
  (err) => {
    if (typeof window !== 'undefined' && err.response?.status === 401) {
      const path = window.location.pathname;
      if (path !== '/login') window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export type ApiSuccess<T> = {
  success: true;
  data: T;
  total?: number;
  page?: number;
  limit?: number;
  totalPages?: number;
  hasNext?: boolean;
  hasPrev?: boolean;
};

export type ApiFailure = {
  success: false;
  message?: { en?: string; de?: string } | string;
};

export function getErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const msg = (err.response?.data as ApiFailure | undefined)?.message;
    if (!msg) return err.message;
    if (typeof msg === 'string') return msg;
    return msg.en || msg.de || err.message;
  }
  if (err instanceof Error) return err.message;
  return 'Unknown error';
}

