export function isUnauthorizedStatus(status: number | undefined): boolean {
  return status === 401 || status === 403;
}

export function clearAuthSession() {
  if (typeof window === "undefined") return;
  localStorage.removeItem("accessToken");
  localStorage.removeItem("refreshToken");
  window.dispatchEvent(new Event("auth-changed"));
}

/** JWT payload의 userId (STOMP 개인 알림 구독 등). 파싱 실패 시 null */
export function getJwtUserId(accessToken: string | null): number | null {
  if (!accessToken) return null;
  try {
    const parts = accessToken.split(".");
    if (parts.length < 2) return null;
    const payloadPart = parts[1]!;
    const base64 = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const decoded = atob(padded);
    const payload = JSON.parse(decoded) as {
      userId?: number;
      user_id?: number;
    };
    const id = payload.userId ?? payload.user_id;
    return typeof id === "number" ? id : id != null ? Number(id) : null;
  } catch {
    return null;
  }
}
