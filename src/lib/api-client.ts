type ApiResponse<T> = {
  resultCode: string;
  msg: string;
  data: T;
};

const API_BASE_URL = '/api/backend';
const ACCESS_TOKEN_KEY = 'accessToken';
const REFRESH_TOKEN_KEY = 'refreshToken';

export type HttpError = Error & { status: number };

function createHttpError(message: string, status: number): HttpError {
  const err = new Error(message) as HttpError;
  err.status = status;
  return err;
}

export function getHttpStatus(error: unknown): number | undefined {
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const status = (error as { status?: unknown }).status;
    return typeof status === 'number' ? status : undefined;
  }
  return undefined;
}

function getAccessToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

function getRefreshToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

function storeTokens(tokens: { accessToken?: string; refreshToken?: string }) {
  if (typeof window === 'undefined') return;
  if (tokens.accessToken) localStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
  if (tokens.refreshToken) localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
}

function clearTokensSilently() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

async function parseResponse<T>(response: Response): Promise<{ json: ApiResponse<T> | null; text: string | null }> {
  const contentType = response.headers.get('content-type') || '';
  let json: ApiResponse<T> | null = null;
  let text: string | null = null;

  try {
    if (contentType.includes('application/json')) {
      json = (await response.json()) as ApiResponse<T>;
    } else {
      text = await response.text();
    }
  } catch {
    text = await response.text().catch(() => null);
  }

  return { json, text };
}

async function reissueAccessToken(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;

  const response = await fetch(`${API_BASE_URL}/api/auth/reissue`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
    cache: 'no-store',
  });

  const { json } = await parseResponse<{ accessToken?: string; refreshToken?: string }>(response);
  if (!response.ok || !json?.data?.accessToken) {
    clearTokensSilently();
    return null;
  }

  storeTokens(json.data);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('auth-changed'));
  }
  return json.data.accessToken ?? null;
}

type RequestOptions = {
  allowReissue: boolean;
  accessTokenOverride?: string | null;
};

async function requestWithAuth<T>(path: string, init: RequestInit | undefined, options: RequestOptions): Promise<T> {
  const isPublicAuthPath =
    path.startsWith('/api/auth/login') ||
    path.startsWith('/api/auth/guest') ||
    path.startsWith('/api/auth/reissue');
  const token = options.accessTokenOverride ?? getAccessToken();
  const isFormData = init?.body instanceof FormData;
  const headers = new Headers(init?.headers);

  if (!isFormData && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (!isPublicAuthPath && token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
    cache: 'no-store',
  });

  const { json, text } = await parseResponse<T>(response);

  if (!response.ok && options.allowReissue && (response.status === 401 || response.status === 403)) {
    const shouldSkipReissue =
      path.startsWith('/api/auth/login') ||
      path.startsWith('/api/auth/guest') ||
      path.startsWith('/api/auth/reissue');
    if (!shouldSkipReissue) {
      const newAccessToken = await reissueAccessToken();
      if (newAccessToken) {
        return requestWithAuth(path, init, { allowReissue: false, accessTokenOverride: newAccessToken });
      }
    }
  }

  if (!response.ok) {
    const msg = json?.msg || text || `요청 실패 (HTTP ${response.status})`;
    throw createHttpError(msg, response.status);
  }

  if (!json) {
    throw createHttpError(text || `요청 실패 (HTTP ${response.status})`, response.status);
  }

  return json.data as T;
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  return requestWithAuth(path, init, { allowReissue: true });
}
