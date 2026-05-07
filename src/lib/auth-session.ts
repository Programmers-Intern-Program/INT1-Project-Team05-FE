export function isUnauthorizedStatus(status: number | undefined): boolean {
  return status === 401 || status === 403;
}

export function clearAuthSession() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  window.dispatchEvent(new Event('auth-changed'));
}
