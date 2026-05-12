"use client";

import Link from "next/link";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { apiFetch } from "@/lib/api-client";

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [guestLoading, setGuestLoading] = useState(false);

  function completeLogin(
    tokens: { accessToken?: string; refreshToken?: string },
    options?: { requireRefreshToken?: boolean },
  ) {
    const requireRefreshToken = options?.requireRefreshToken ?? true;
    const accessToken = tokens?.accessToken;
    const refreshToken = tokens?.refreshToken;
    if (!accessToken) {
      throw new Error("서버 응답에서 accessToken을 찾을 수 없습니다.");
    }
    if (requireRefreshToken && !refreshToken) {
      throw new Error("서버 응답에서 refreshToken을 찾을 수 없습니다.");
    }

    localStorage.setItem("accessToken", accessToken);
    if (refreshToken) {
      localStorage.setItem("refreshToken", refreshToken);
    } else {
      localStorage.removeItem("refreshToken");
    }
    window.dispatchEvent(new Event("auth-changed"));
    const redirect = searchParams.get("redirect");
    const safeRedirect =
      redirect && redirect.startsWith("/") ? redirect : "/rooms";
    router.push(safeRedirect);
  }

  async function onLogin() {
    setError("");
    if (!email.trim() || !password.trim()) {
      setError("이메일과 비밀번호를 입력해주세요.");
      return;
    }

    setLoading(true);
    try {
      const data = await apiFetch<{
        accessToken?: string;
        refreshToken?: string;
      }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      completeLogin(data);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "로그인 중 오류가 발생했습니다.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function onGuestLogin() {
    setError("");
    setGuestLoading(true);
    try {
      const data = await apiFetch<{
        accessToken?: string;
        refreshToken?: string;
      }>("/api/auth/guest", {
        method: "POST",
      });
      completeLogin(data, { requireRefreshToken: false });
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "게스트 로그인 중 오류가 발생했습니다.",
      );
    } finally {
      setGuestLoading(false);
    }
  }

  return (
    <main className="min-h-[calc(100vh-4rem)]">
      {guestLoading ? (
        <div
          className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
          role="status"
          aria-live="assertive"
          aria-busy="true"
        >
          <div className="flex w-full max-w-sm flex-col items-center gap-4 rounded-3xl border border-cyan-300/30 bg-slate-900/95 px-8 py-9 text-center shadow-2xl ring-1 ring-cyan-300/20">
            <span className="inline-block h-12 w-12 animate-spin rounded-full border-[4px] border-cyan-100/25 border-t-cyan-200" />
            <p className="text-xl font-black text-white">게스트 계정 생성 중</p>
            <p className="text-sm leading-relaxed text-slate-300">
              닉네임을 만들고 로그인 중입니다.
              <br />
              잠시만 기다려 주세요.
            </p>
          </div>
        </div>
      ) : null}
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
              <span className="text-sm font-medium text-slate-200">
                비밀번호
              </span>
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
              disabled={loading || guestLoading}
              className="w-full rounded-xl bg-gradient-to-r from-blue-500 to-violet-500 px-4 py-3 font-semibold text-white shadow-lg shadow-blue-500/30 transition hover:from-blue-400 hover:to-violet-400 disabled:opacity-60"
            >
              {loading ? "로그인 중..." : "로그인"}
            </button>

            <button
              type="button"
              onClick={() => {
                void onGuestLogin();
              }}
              disabled={loading || guestLoading}
              className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 font-semibold text-white transition hover:bg-white/10 disabled:opacity-60"
            >
              {guestLoading
                ? "게스트 로그인 중... (닉네임 생성 중)"
                : "게스트로 시작하기"}
            </button>

            {error && (
              <p className="text-center text-sm text-rose-300">{error}</p>
            )}
          </form>

          <Link
            href="/signup"
            className="mt-6 block rounded-2xl border border-white/10 bg-slate-950/70 p-4 text-center text-sm text-slate-300 transition hover:border-blue-400/70 hover:bg-white/10"
          >
            계정이 없나요?{" "}
            <span className="font-semibold text-blue-300">회원가입</span>
          </Link>
        </div>
      </section>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-[calc(100vh-4rem)]">
          <section className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md items-center px-6 py-16">
            <p className="w-full text-center text-slate-400">불러오는 중…</p>
          </section>
        </main>
      }
    >
      <LoginPageContent />
    </Suspense>
  );
}
