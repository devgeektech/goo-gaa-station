import axios from 'axios';

export const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  withCredentials: true, // admin auth is cookie-based
  headers: {
    'Content-Type': 'application/json',
  },
});

/** Let the browser set multipart boundary (required for file uploads on PATCH/POST). */
apiClient.interceptors.request.use((config) => {
  if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
    if (config.headers && typeof config.headers === 'object') {
      const headers = config.headers as Record<string, unknown>;
      delete headers['Content-Type'];
      delete headers['content-type'];
    }
  }
  return config;
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
  const extractApiMessage = (payload: unknown): string | null => {
    if (!payload || typeof payload !== 'object') return null;
    const body = payload as {
      message?: { en?: string; de?: string } | string;
      error?: string;
      data?: { errors?: Record<string, string> };
    };
    const msg = body.message;
    if (typeof msg === 'string' && msg.trim()) return msg;
    if (msg && typeof msg === 'object') {
      if (typeof msg.en === 'string' && msg.en.trim()) return msg.en;
      if (typeof msg.de === 'string' && msg.de.trim()) return msg.de;
    }
    if (body.data?.errors && typeof body.data.errors === 'object') {
      const firstFieldError = Object.values(body.data.errors).find((v) => typeof v === 'string' && v.trim());
      if (typeof firstFieldError === 'string') return firstFieldError;
    }
    if (typeof body.error === 'string' && body.error.trim()) return body.error;
    return null;
  };

  if (axios.isAxiosError(err)) {
    const msg = (err.response?.data as ApiFailure | undefined)?.message;
    if (!msg) return err.message;
    if (typeof msg === 'string') return msg;
    return msg.en || msg.de || err.message;
  }
  // RTK Query / fetchBaseQuery errors are plain objects (non-axios).
  if (err && typeof err === 'object') {
    const e = err as { data?: unknown; error?: unknown };
    const fromData = extractApiMessage(e.data);
    if (fromData) return fromData;
    const fromRoot = extractApiMessage(err);
    if (fromRoot) return fromRoot;
    if (typeof e.error === 'string' && e.error.trim()) return e.error;
  }
  if (err instanceof Error) return err.message;
  return 'Unknown error';
}

