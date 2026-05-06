type ApiResponse<T> = {
  resultCode: string;
  msg: string;
  data: T;
};

const API_BASE_URL = '/api/backend';

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

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
  const isFormData = init?.body instanceof FormData;
  const headers = new Headers(init?.headers);

  if (!isFormData && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
    cache: 'no-store',
  });

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

  if (!response.ok) {
    const msg = json?.msg || text || `요청 실패 (HTTP ${response.status})`;
    throw createHttpError(msg, response.status);
  }

  if (!json) {
    throw createHttpError(text || `요청 실패 (HTTP ${response.status})`, response.status);
  }

  return json.data as T;
}
