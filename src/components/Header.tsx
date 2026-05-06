'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

export default function Header() {
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [receivedRequestCount, setReceivedRequestCount] = useState(0);
  const reconcileTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const syncAuthState = () => {
      setIsLoggedIn(Boolean(localStorage.getItem('accessToken')));
    };

    syncAuthState();
    window.addEventListener('storage', syncAuthState);
    window.addEventListener('auth-changed', syncAuthState);
    return () => {
      window.removeEventListener('storage', syncAuthState);
      window.removeEventListener('auth-changed', syncAuthState);
    };
  }, []);

  useEffect(() => {
    if (!isLoggedIn) {
      setReceivedRequestCount(0);
      return;
    }

    const loadReceivedCount = async () => {
      const token = localStorage.getItem('accessToken');
      if (!token) {
        setReceivedRequestCount(0);
        return;
      }
      try {
        const res = await fetch('/api/backend/api/friendship/requests/received', {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
          },
          cache: 'no-store',
        });
        if (!res.ok) return;
        const json = (await res.json()) as { data?: unknown };
        const list = Array.isArray(json?.data) ? json.data : [];
        setReceivedRequestCount(list.length);
      } catch {
        /* 배지는 실패해도 조용히 무시 */
      }
    };

    void loadReceivedCount();
    const timer = window.setInterval(() => {
      void loadReceivedCount();
    }, 15000);
    const onFocus = () => {
      void loadReceivedCount();
    };
    const onFriendRequestsChanged = (evt: Event) => {
      const delta =
        evt instanceof CustomEvent && evt.detail && typeof evt.detail.delta === 'number'
          ? evt.detail.delta
          : 0;
      if (delta !== 0) {
        setReceivedRequestCount((prev) => Math.max(0, prev + delta));
      }
      // 낙관 반영 직후 서버를 바로 읽으면 아직 반영 전 값으로 되돌아갈 수 있어 짧게 지연 보정
      if (reconcileTimerRef.current) {
        clearTimeout(reconcileTimerRef.current);
      }
      reconcileTimerRef.current = setTimeout(() => {
        reconcileTimerRef.current = null;
        void loadReceivedCount();
      }, 1500);
    };
    window.addEventListener('focus', onFocus);
    window.addEventListener('auth-changed', onFocus);
    window.addEventListener('friend-requests-changed', onFriendRequestsChanged as EventListener);
    return () => {
      clearInterval(timer);
      if (reconcileTimerRef.current) {
        clearTimeout(reconcileTimerRef.current);
        reconcileTimerRef.current = null;
      }
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('auth-changed', onFocus);
      window.removeEventListener('friend-requests-changed', onFriendRequestsChanged as EventListener);
    };
  }, [isLoggedIn]);

  function handleLogout() {
    localStorage.removeItem('accessToken');
    setIsLoggedIn(false);
    window.dispatchEvent(new Event('auth-changed'));
    router.push('/');
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-slate-950/65 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="group inline-flex items-center gap-2">
          <span className="rounded-lg bg-gradient-to-br from-blue-400 to-violet-500 px-2 py-1 text-sm font-black text-white shadow-lg shadow-blue-500/25">
            DR
          </span>
          <span className="text-xl font-extrabold tracking-tight text-white transition group-hover:text-blue-200">
            DrawRace
          </span>
        </Link>

        <nav className="flex items-center gap-2 text-sm font-medium text-slate-300">
          <Link
            href="/rooms"
            className="rounded-lg px-3 py-2 transition hover:bg-white/10 hover:text-white"
          >
            방 목록
          </Link>
          {isLoggedIn ? (
            <Link
              href="/mypage"
              className="rounded-lg px-3 py-2 transition hover:bg-white/10 hover:text-white"
            >
              마이페이지
            </Link>
          ) : null}
          {isLoggedIn ? (
            <Link
              href={receivedRequestCount > 0 ? '/friends?tab=received' : '/friends'}
              className="relative rounded-lg px-3 py-2 transition hover:bg-white/10 hover:text-white"
            >
              친구
              {receivedRequestCount > 0 ? (
                <span className="absolute -right-1 -top-1 rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-black text-white">
                  +{receivedRequestCount}
                </span>
              ) : null}
            </Link>
          ) : null}
          {isLoggedIn ? (
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-full border border-white/20 px-4 py-2 font-semibold text-slate-100 transition hover:bg-white/10 hover:text-white"
            >
              로그아웃
            </button>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-lg px-3 py-2 transition hover:bg-white/10 hover:text-white"
              >
                로그인
              </Link>
              <Link
                href="/signup"
                className="rounded-full bg-gradient-to-r from-blue-500 to-violet-500 px-4 py-2 font-semibold text-white shadow-lg shadow-blue-500/20 transition hover:from-blue-400 hover:to-violet-400"
              >
                회원가입
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}