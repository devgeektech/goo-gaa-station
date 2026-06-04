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

function extractApiMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const body = payload as {
    code?: string;
    message?: { en?: string; de?: string } | string;
    error?: string;
    data?: { errors?: Record<string, string> } | null;
  };
  const msg = body.message;
  if (typeof msg === 'string' && msg.trim()) return msg.trim();
  if (msg && typeof msg === 'object') {
    if (typeof msg.en === 'string' && msg.en.trim()) return msg.en.trim();
    if (typeof msg.de === 'string' && msg.de.trim()) return msg.de.trim();
  }
  if (body.data?.errors && typeof body.data.errors === 'object') {
    const firstFieldError = Object.values(body.data.errors).find((v) => typeof v === 'string' && v.trim());
    if (typeof firstFieldError === 'string') return firstFieldError.trim();
  }
  if (typeof body.error === 'string' && body.error.trim()) return body.error.trim();
  return null;
}

function extractApiCode(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const code = (payload as { code?: string }).code;
  return typeof code === 'string' && code.trim() ? code.trim() : null;
}

function isGenericClientMessage(message: string): boolean {
  const m = message.trim();
  if (!m) return true;
  return (
    /^unknown error$/i.test(m) ||
    /^rejected$/i.test(m) ||
    /^request failed with status code \d+$/i.test(m) ||
    /^network error$/i.test(m) ||
    /^typeerror:\s*failed to fetch$/i.test(m) ||
    /^failed to fetch$/i.test(m)
  );
}

export type ApiErrorToastOptions = {
  /** Maps 413 / Failed to fetch to file-size guidance (e.g. banner image upload). */
  uploadMaxMb?: number;
};

/** Human-readable message from API/axios/RTK Query errors. */
export function getErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const fromBody = extractApiMessage(err.response?.data);
    if (fromBody) return fromBody;
    if (err.response?.status === 413) {
      return 'Upload is too large. Please use a smaller file (max 10 MB for banner images).';
    }
    if (err.response?.status) return `Request failed (${err.response.status})`;
    return err.message || 'Request failed';
  }

  // RTK Query / fetchBaseQuery (unwrap, useQuery error, etc.)
  if (err && typeof err === 'object') {
    const e = err as { data?: unknown; error?: unknown; status?: number | string };
    const fromData = extractApiMessage(e.data);
    if (fromData) return fromData;
    const fromRoot = extractApiMessage(err);
    if (fromRoot) return fromRoot;
    if (e.error && typeof e.error === 'object') {
      const nested = getErrorMessage(e.error);
      if (!isGenericClientMessage(nested)) return nested;
    }
    if (typeof e.status === 'number') {
      if (e.status === 413) {
        return 'Upload is too large. Please use a smaller file (max 10 MB for banner images).';
      }
      return `Request failed (${e.status})`;
    }
    if (typeof e.error === 'string' && e.error.trim()) {
      const errStr = e.error.trim();
      if (!isGenericClientMessage(errStr)) return errStr;
    }
    if (e.status === 'FETCH_ERROR') return 'Network error — check API URL and connection';
    if (e.status === 'PARSING_ERROR') return 'Invalid response from server';
  }

  if (err instanceof Error) return err.message;
  return 'Unknown error';
}

/** Toast copy: prefer API message as title; fallback label only when needed. */
export function apiErrorToast(
  err: unknown,
  fallbackTitle: string,
  options?: ApiErrorToastOptions
): { title: string; description?: string } {
  const maxMb = options?.uploadMaxMb;

  if (maxMb && err && typeof err === 'object') {
    const e = err as { data?: unknown; error?: unknown; status?: number | string };
    const code = extractApiCode(e.data);
    const apiMsg = extractApiMessage(e.data);

    if (e.status === 413 || code === 'FILE_TOO_LARGE') {
      return {
        title: `Banner image is too large. Maximum allowed size is ${maxMb} MB.`,
        description: apiMsg && !isGenericClientMessage(apiMsg) ? apiMsg : 'Use a smaller JPG, PNG, or WebP file and try again.',
      };
    }

    if (code === 'POSITION_CONFLICT') {
      return {
        title: apiMsg ?? 'This banner position is already in use.',
        description: 'Change the Position field to a number not used by another banner.',
      };
    }

    const transportFailed =
      e.status === 'FETCH_ERROR' ||
      (typeof e.error === 'string' && /failed to fetch|typeerror/i.test(e.error));
    if (transportFailed) {
      return {
        title: `Upload failed. The image may be over ${maxMb} MB or was blocked by the server.`,
        description: 'Compress the image or choose a smaller file, then try again.',
      };
    }
  }

  const apiMessage = getErrorMessage(err);
  if (apiMessage && !isGenericClientMessage(apiMessage)) {
    return { title: apiMessage };
  }
  return { title: fallbackTitle, description: apiMessage || undefined };
}

