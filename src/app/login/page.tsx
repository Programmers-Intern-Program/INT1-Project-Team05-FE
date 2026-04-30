'use client';

import Link from 'next/link';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // 브라우저에서 백엔드로 직접 요청하면 CORS preflight(OPTIONS)가 403으로 막힐 수 있어,
  // Next.js API 프록시(`/api/backend/...`)를 통해 호출합니다.
  const API_BASE_URL = '/api/backend';

  async function onLogin() {
    setError('');
    if (!email.trim() || !password.trim()) {
      setError('이메일과 비밀번호를 입력해주세요.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const raw = await res.text();
      let json: { msg?: string; data?: { accessToken?: string } } | null = null;
      try {
        json = raw ? JSON.parse(raw) : null;
      } catch {
        // ignore
      }

      if (!res.ok) {
        const msg = json?.msg || raw || '로그인에 실패했습니다.';
        throw new Error(msg);
      }

      const accessToken = json?.data?.accessToken as string | undefined;
      if (!accessToken) {
        throw new Error('서버 응답에서 accessToken을 찾을 수 없습니다.');
      }

      localStorage.setItem('accessToken', accessToken);
      router.push('/rooms');
    } catch (e) {
      setError(e instanceof Error ? e.message : '로그인 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-[calc(100vh-4rem)]">
      <section className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md items-center px-6 py-16">
        <div className="w-full rounded-3xl border border-white/10 bg-white/[0.04] p-8 shadow-2xl backdrop-blur">
          <div className="text-center">
            <p className="text-sm font-semibold text-blue-300">Welcome Back</p>
            <h1 className="mt-3 text-3xl font-extrabold text-white">로그인</h1>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              DrawRace에 로그인하고 AI 그림 대결을 시작하세요.
            </p>
          </div>

          <form
            className="mt-8 space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              void onLogin();
            }}
          >
            <label className="block">
              <span className="text-sm font-medium text-slate-200">이메일</span>
              <input
                type="email"
                placeholder="example@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/80 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-blue-400"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-200">비밀번호</span>
              <input
                type="password"
                placeholder="비밀번호를 입력하세요"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/80 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-blue-400"
              />
            </label>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-gradient-to-r from-blue-500 to-violet-500 px-4 py-3 font-semibold text-white shadow-lg shadow-blue-500/30 transition hover:from-blue-400 hover:to-violet-400 disabled:opacity-60"
            >
              {loading ? '로그인 중...' : '로그인'}
            </button>

            {error && <p className="text-center text-sm text-rose-300">{error}</p>}
          </form>

          <Link
            href="/signup"
            className="mt-6 block rounded-2xl border border-white/10 bg-slate-950/70 p-4 text-center text-sm text-slate-300 transition hover:border-blue-400/70 hover:bg-white/10"
          >
            계정이 없나요? <span className="font-semibold text-blue-300">회원가입</span>
          </Link>
        </div>
      </section>
    </main>
  );
}