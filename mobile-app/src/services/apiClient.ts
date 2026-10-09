import axios, {
  AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios';
import { env } from '../config/env';
import { AppError } from '../utils/errors';
import type { AuthSession, PaginationMeta } from '../types';

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  meta?: PaginationMeta;
  error?: { code: string; message: string; details?: unknown };
}

/**
 * The auth store registers these on start-up.
 *
 * Going through a registry rather than importing the store keeps the dependency
 * one-way — the store imports the client, never the reverse — which is what
 * stops a require cycle between them.
 */
interface AuthBridge {
  getSession: () => AuthSession | null;
  onSessionRefreshed: (session: AuthSession) => void | Promise<void>;
  onSessionExpired: () => void | Promise<void>;
}

let authBridge: AuthBridge | null = null;

export const registerAuthBridge = (bridge: AuthBridge): void => {
  authBridge = bridge;
};

export const api: AxiosInstance = axios.create({
  baseURL: env.apiUrl,
  timeout: 20_000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = authBridge?.getSession()?.accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

const toAppError = (error: unknown): AppError => {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<ApiEnvelope<unknown>>;

    if (axiosError.response) {
      const payload = axiosError.response.data?.error;
      return new AppError({
        code: payload?.code ?? 'HTTP_ERROR',
        message: payload?.message ?? `Request failed (${axiosError.response.status})`,
        details: payload?.details,
        status: axiosError.response.status,
      });
    }

    if (axiosError.code === 'ECONNABORTED') {
      return new AppError({
        code: 'TIMEOUT',
        message: 'The request took too long. Check your connection and try again.',
      });
    }

    return new AppError({
      code: 'NETWORK_ERROR',
      message: 'Cannot reach the server. Check your connection and that the API is running.',
    });
  }

  return new AppError({
    code: 'UNKNOWN',
    message: error instanceof Error ? error.message : 'Something went wrong',
  });
};

/**
 * A single in-flight refresh, shared by every request that 401s.
 *
 * Without this, a screen firing four parallel requests on a stale token would
 * start four refreshes; three of them would present an already-rotated refresh
 * token and fail, signing the user out mid-session.
 */
let refreshPromise: Promise<AuthSession | null> | null = null;

const refreshSession = async (): Promise<AuthSession | null> => {
  const refreshToken = authBridge?.getSession()?.refreshToken;
  if (!refreshToken || !authBridge) return null;

  try {
    // A bare axios call: the instance's interceptors would re-enter this path.
    const response = await axios.post<ApiEnvelope<{ session: AuthSession }>>(
      `${env.apiUrl}/auth/refresh`,
      { refreshToken },
      { timeout: 15_000, headers: { 'Content-Type': 'application/json' } },
    );

    const session = response.data?.data?.session;
    if (!session) return null;

    await authBridge.onSessionRefreshed(session);
    return session;
  } catch {
    return null;
  }
};

api.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    if (!axios.isAxiosError(error) || error.response?.status !== 401) {
      return Promise.reject(toAppError(error));
    }

    const original = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;

    // Never retry the auth endpoints themselves — a 401 from /login is the answer.
    const url = original?.url ?? '';
    if (!original || original._retried || url.includes('/auth/login') || url.includes('/auth/refresh')) {
      return Promise.reject(toAppError(error));
    }

    original._retried = true;

    refreshPromise = refreshPromise ?? refreshSession().finally(() => {
      refreshPromise = null;
    });

    const session = await refreshPromise;

    if (!session) {
      await authBridge?.onSessionExpired();
      return Promise.reject(toAppError(error));
    }

    original.headers.Authorization = `Bearer ${session.accessToken}`;
    return api.request(original);
  },
);

/** Unwraps the `{ success, data }` envelope so callers work with the payload. */
export const request = async <T>(config: AxiosRequestConfig): Promise<T> => {
  const response = await api.request<ApiEnvelope<T>>(config);
  return response.data.data;
};

/** Same, but keeps the pagination metadata alongside the rows. */
export const requestPaginated = async <T>(
  config: AxiosRequestConfig,
): Promise<{ items: T[]; meta: PaginationMeta }> => {
  const response = await api.request<ApiEnvelope<T[]>>(config);
  return {
    items: response.data.data ?? [],
    meta: response.data.meta ?? {
      page: 1,
      limit: response.data.data?.length ?? 0,
      total: response.data.data?.length ?? 0,
      totalPages: 1,
      hasMore: false,
    },
  };
};

export const get = <T>(url: string, params?: Record<string, unknown>): Promise<T> =>
  request<T>({ method: 'GET', url, params });

export const getList = <T>(
  url: string,
  params?: Record<string, unknown>,
): Promise<{ items: T[]; meta: PaginationMeta }> =>
  requestPaginated<T>({ method: 'GET', url, params });

export const post = <T>(url: string, data?: unknown): Promise<T> =>
  request<T>({ method: 'POST', url, data });

export const patch = <T>(url: string, data?: unknown): Promise<T> =>
  request<T>({ method: 'PATCH', url, data });

export const del = <T>(url: string, params?: Record<string, unknown>): Promise<T> =>
  request<T>({ method: 'DELETE', url, params });
