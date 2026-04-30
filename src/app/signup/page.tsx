'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function SignupPage() {
  const router = useRouter();
  const [nickname, setNickname] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // 브라우저에서 백엔드로 직접 요청하면 CORS preflight(OPTIONS)가 403으로 막힐 수 있어,
  // Next.js API 프록시(`/api/backend/...`)로 호출합니다.
  const API_BASE_URL = '/api/backend';

  async function onSignup() {
    setError('');

    const normalizedNickname = nickname.trim();
    const normalizedEmail = email.trim();

    if (!normalizedNickname || !normalizedEmail || !password.trim()) {
      setError('필수 값을 입력해주세요.');
      return;
    }

    if (password !== confirmPassword) {
      setError('비밀번호 확인이 일치하지 않습니다.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail, password, nickname: normalizedNickname }),
      });

      const raw = await res.text();
      let json: { msg?: string; data?: unknown } | null = null;
      try {
        json = raw ? JSON.parse(raw) : null;
      } catch {
        // ignore - raw text already available
      }

      if (!res.ok) {
        const msg = json?.msg || raw || '회원가입에 실패했습니다.';
        throw new Error(msg);
      }

      // 성공: data는 userId (number)
      router.push('/login');
    } catch (e) {
      setError(e instanceof Error ? e.message : '회원가입 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-[calc(100vh-4rem)]">
      <section className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md items-center px-6 py-16">
        <div className="w-full rounded-3xl border border-white/10 bg-white/[0.04] p-8 shadow-2xl backdrop-blur">
          <div className="text-center">
            <p className="text-sm font-semibold text-blue-300">Join DrawRace</p>
            <h1 className="mt-3 text-3xl font-extrabold text-white">회원가입</h1>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              계정을 만들고 친구들과 AI 그림 대결에 참여하세요.
            </p>
          </div>

          <form
            className="mt-8 space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              void onSignup();
            }}
          >
            <label className="block">
              <span className="text-sm font-medium text-slate-200">닉네임</span>
              <input
                type="text"
                placeholder="닉네임을 입력하세요"
                className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/80 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-blue-400"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
              />
              <p className="mt-2 text-xs text-slate-500">
                2~10자, 한글/영문/숫자만 사용할 수 있습니다.
              </p>
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-200">이메일</span>
              <input
                type="email"
                placeholder="example@email.com"
                className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/80 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-blue-400"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-200">비밀번호</span>
              <input
                type="password"
                placeholder="비밀번호를 입력하세요"
                className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/80 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-blue-400"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <p className="mt-2 text-xs text-slate-500">8~20자로 입력해주세요.</p>
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-200">비밀번호 확인</span>
              <input
                type="password"
                placeholder="비밀번호를 한 번 더 입력하세요"
                className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/80 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-blue-400"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </label>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-gradient-to-r from-blue-500 to-violet-500 px-4 py-3 font-semibold text-white shadow-lg shadow-blue-500/30 transition hover:from-blue-400 hover:to-violet-400 disabled:opacity-60"
            >
              {loading ? '가입 중...' : '회원가입'}
            </button>

            {error && <p className="text-center text-sm text-rose-300">{error}</p>}
          </form>

          <Link
            href="/login"
            className="mt-6 block rounded-2xl border border-white/10 bg-slate-950/70 p-4 text-center text-sm text-slate-300 transition hover:border-blue-400/70 hover:bg-white/10"
          >
            이미 계정이 있나요? <span className="font-semibold text-blue-300">로그인</span>
          </Link>
        </div>
      </section>
    </main>
  );
}