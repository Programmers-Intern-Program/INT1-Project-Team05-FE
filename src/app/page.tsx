"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const GAME_FLOW_LINES = [
  "방 입장 후 제시어를 확인하고 그림을 그립니다.",
  "제한 시간 안에 제출하면 라운드가 집계됩니다.",
  "모든 라운드 종료 후 최종 랭킹이 결정됩니다.",
] as const;

const GAME_RULE_LINES = [
  "대기 중 방에서만 입장이 가능합니다.",
  "정원이 찬 방은 자동으로 입장이 비활성화됩니다.",
  "방장은 대기 중에만 AI 플레이어를 추가/제거할 수 있습니다.",
] as const;

const FEATURE_CHAT_LINES = [
  "실시간 채팅을 통해 플레이어와 즉시 소통할 수 있습니다.",
  "채팅은 AI/필터 기반 검열로 안전하게 운영됩니다.",
  "라운드 중에도 채팅 로그가 실시간으로 동기화됩니다.",
] as const;

const FEATURE_GUEST_LINES = [
  "게스트 시작 시 AI가 닉네임을 자동 추천/생성합니다.",
  "제출, 점수, 랭킹 상태가 패널로 실시간 반영됩니다.",
  "로그인 없이도 빠르게 체험 후 계정 전환이 가능합니다.",
] as const;

type InfoAccent = "blue" | "violet" | "cyan" | "amber";

function InfoSection({
  eyebrow,
  title,
  accent,
  numbered,
  lines,
}: {
  eyebrow: string;
  title: string;
  accent: InfoAccent;
  numbered?: boolean;
  lines: readonly string[];
}) {
  const bar =
    accent === "blue"
      ? "from-blue-500 via-sky-400 to-cyan-400"
      : accent === "violet"
        ? "from-violet-500 via-fuchsia-500 to-pink-400"
        : accent === "cyan"
          ? "from-cyan-500 via-teal-400 to-emerald-400"
          : "from-amber-500 via-orange-400 to-rose-400";

  const badge =
    accent === "blue"
      ? "border-blue-400/35 bg-blue-500/20 text-blue-100"
      : accent === "violet"
        ? "border-violet-400/35 bg-violet-500/20 text-violet-100"
        : accent === "cyan"
          ? "border-cyan-400/35 bg-cyan-500/20 text-cyan-100"
          : "border-amber-400/35 bg-amber-500/20 text-amber-100";

  const dot =
    accent === "blue"
      ? "bg-blue-400 shadow-[0_0_10px_rgba(56,189,248,0.45)]"
      : accent === "violet"
        ? "bg-violet-400 shadow-[0_0_10px_rgba(167,139,250,0.45)]"
        : accent === "cyan"
          ? "bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.45)]"
          : "bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.45)]";

  return (
    <section className="overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-slate-950/90 to-slate-950/50 shadow-[0_12px_40px_-20px_rgba(0,0,0,0.65)]">
      <div className={`h-1 bg-gradient-to-r ${bar}`} aria-hidden />
      <div className="p-5 sm:p-6 lg:p-7">
        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-500">
          {eyebrow}
        </p>
        <h3 className="mt-2 text-lg font-black tracking-tight text-white">
          {title}
        </h3>
        <ul className="mt-5 space-y-3" role="list">
          {lines.map((line, i) => (
            <li
              key={`${title}-${i}`}
              className="flex gap-3.5 rounded-xl border border-white/[0.08] bg-slate-900/50 px-4 py-3.5 sm:px-5 sm:py-4"
            >
              {numbered ? (
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-xs font-black tabular-nums ${badge}`}
                  aria-hidden
                >
                  {i + 1}
                </span>
              ) : (
                <span
                  className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${dot}`}
                  aria-hidden
                />
              )}
              <p className="min-w-0 flex-1 text-sm leading-relaxed text-slate-200">
                {line}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export default function HomePage() {
  const [infoModal, setInfoModal] = useState<null | "game" | "features">(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    const syncAuth = () => {
      setIsLoggedIn(
        Boolean(
          typeof window !== "undefined" && localStorage.getItem("accessToken"),
        ),
      );
    };
    syncAuth();
    window.addEventListener("storage", syncAuth);
    window.addEventListener("auth-changed", syncAuth);
    return () => {
      window.removeEventListener("storage", syncAuth);
      window.removeEventListener("auth-changed", syncAuth);
    };
  }, []);

  useEffect(() => {
    if (!infoModal) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setInfoModal(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [infoModal]);

  return (
    <main className="relative min-h-[calc(100vh-4rem)] overflow-hidden">
      <div className="pointer-events-none absolute left-[-8%] top-[-20%] h-[360px] w-[360px] rounded-full bg-blue-500/25 blur-[120px]" />
      <div className="pointer-events-none absolute right-[-8%] top-[10%] h-[320px] w-[320px] rounded-full bg-violet-500/20 blur-[120px]" />
      <section className="relative mx-auto grid max-w-6xl gap-x-14 gap-y-10 px-6 py-12 md:grid-cols-[1.05fr_0.95fr] md:items-stretch md:gap-x-20 lg:gap-x-24">
        <div className="flex min-h-0 flex-col md:h-full">
          <div>
            <p className="mb-4 inline-flex rounded-full border border-blue-300/30 bg-blue-400/10 px-4 py-2 text-sm font-semibold text-blue-200">
              AI Drawing Battle Game
            </p>

            <h1 className="text-4xl font-black leading-tight tracking-tight text-white md:text-6xl">
              AI가 내 그림을
              <br />
              <span className="bg-gradient-to-r from-blue-300 to-violet-300 bg-clip-text text-transparent">
                어떻게 해석할까?
              </span>
            </h1>

            <p className="mt-6 max-w-xl text-lg leading-8 text-slate-300">
              DrawRace는 제한된 라운드 안에서 제시어에 맞춰 그림을 그리고, AI가
              판별한 점수로 승부를 겨루는 실시간 그림 대결 게임입니다.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/rooms"
                className="rounded-xl bg-gradient-to-r from-blue-500 to-violet-500 px-6 py-3 font-semibold text-white shadow-lg shadow-blue-500/30 transition hover:from-blue-400 hover:to-violet-400"
              >
                방 목록 보기
              </Link>

              {!isLoggedIn ? (
                <Link
                  href="/login"
                  className="rounded-xl border border-white/15 bg-white/5 px-6 py-3 font-semibold text-white transition hover:bg-white/10"
                >
                  로그인
                </Link>
              ) : null}
            </div>
          </div>

          <div className="mt-10 grid max-w-xl gap-4 sm:grid-cols-2 md:mt-auto md:pt-10">
            <button
              type="button"
              onClick={() => setInfoModal("game")}
              className="group relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900/80 to-slate-950/90 p-6 text-left shadow-lg shadow-slate-950/40 outline-none ring-white/5 transition duration-300 hover:-translate-y-0.5 hover:border-blue-400/35 hover:shadow-blue-500/15 focus-visible:ring-2 focus-visible:ring-blue-400/50 sm:p-7"
            >
              <div className="pointer-events-none absolute -right-6 -top-10 h-28 w-28 rounded-full bg-blue-500/25 blur-2xl transition duration-500 group-hover:bg-blue-400/35" />
              <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-blue-400/40 to-transparent opacity-0 transition group-hover:opacity-100" />
              <div className="relative flex gap-5">
                <span
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-500/15 text-blue-200 ring-1 ring-blue-400/25 transition group-hover:bg-blue-500/25 group-hover:ring-blue-300/40"
                  aria-hidden
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-6 w-6"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                  >
                    <path
                      d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"
                      strokeLinecap="round"
                    />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-black uppercase tracking-[0.28em] text-blue-200/90">
                    Game
                  </p>
                  <h3 className="mt-1 text-lg font-black tracking-tight text-white">
                    게임 소개
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-slate-400">
                    라운드·제시어·AI 점수로 이어지는 진행과 규칙을 한곳에
                    모았어요.
                  </p>
                  <span className="mt-5 inline-flex items-center gap-1.5 text-xs font-bold text-blue-200/95 transition group-hover:gap-2.5">
                    살펴보기
                    <span aria-hidden className="translate-y-px">
                      →
                    </span>
                  </span>
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setInfoModal("features")}
              className="group relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900/80 to-slate-950/90 p-6 text-left shadow-lg shadow-slate-950/40 outline-none ring-white/5 transition duration-300 hover:-translate-y-0.5 hover:border-violet-400/35 hover:shadow-violet-500/15 focus-visible:ring-2 focus-visible:ring-violet-400/50 sm:p-7"
            >
              <div className="pointer-events-none absolute -right-6 -top-10 h-28 w-28 rounded-full bg-violet-500/25 blur-2xl transition duration-500 group-hover:bg-violet-400/35" />
              <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-violet-400/40 to-transparent opacity-0 transition group-hover:opacity-100" />
              <div className="relative flex gap-5">
                <span
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-violet-500/15 text-violet-200 ring-1 ring-violet-400/25 transition group-hover:bg-violet-500/25 group-hover:ring-violet-300/40"
                  aria-hidden
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-6 w-6"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                  >
                    <path
                      d="M12 2 2 7l10 5 10-5-10-5Z"
                      strokeLinejoin="round"
                    />
                    <path
                      d="m2 17 10 5 10-5M2 12l10 5 10-5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-black uppercase tracking-[0.28em] text-violet-200/90">
                    Features
                  </p>
                  <h3 className="mt-1 text-lg font-black tracking-tight text-white">
                    기능 소개
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-slate-400">
                    채팅·검열, 게스트·실시간 UI 등 서비스 편의 기능을
                    정리했어요.
                  </p>
                  <span className="mt-5 inline-flex items-center gap-1.5 text-xs font-bold text-violet-200/95 transition group-hover:gap-2.5">
                    살펴보기
                    <span aria-hidden className="translate-y-px">
                      →
                    </span>
                  </span>
                </div>
              </div>
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-col rounded-3xl border border-white/10 bg-white/[0.04] p-5 shadow-2xl backdrop-blur sm:p-6 md:h-full">
          <div className="flex min-h-0 flex-1 flex-col gap-4 sm:gap-5 rounded-2xl border border-white/10 bg-slate-950/80 p-4 text-white sm:p-5">
            <div className="shrink-0 flex flex-wrap items-stretch justify-between gap-2.5 sm:gap-3">
              <span className="inline-flex min-h-[2.25rem] items-center rounded-xl border border-white/12 bg-white/[0.06] px-3 py-1.5 text-xs font-bold tabular-nums text-white shadow-inner shadow-black/20 ring-1 ring-white/5 sm:min-h-[2.375rem] sm:px-3.5 sm:text-sm">
                <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400 sm:text-[11px]">
                  Round
                </span>
                <span className="ml-2 text-blue-200">1</span>
              </span>
              <span className="inline-flex min-h-[2.25rem] max-w-full min-w-0 flex-1 items-center justify-end sm:min-h-[2.375rem] sm:flex-initial">
                <span className="truncate rounded-full bg-gradient-to-r from-blue-500 to-violet-500 px-3 py-1.5 text-center text-xs font-bold text-white shadow-md shadow-blue-900/30 sm:px-4 sm:text-sm">
                  제시어: 전구
                </span>
              </span>
            </div>

            <div className="shrink-0 grid min-h-0 grid-cols-3 gap-2 sm:gap-3">
              <div className="flex min-h-[4.5rem] flex-col items-center justify-center gap-1 rounded-xl border border-white/12 bg-slate-900/80 px-2 py-2.5 text-center sm:min-h-[4.75rem] sm:px-3 sm:py-3">
                <p className="text-[11px] font-semibold leading-tight text-slate-400 sm:text-xs">
                  AI 점수
                </p>
                <p className="text-lg font-black tabular-nums leading-none text-white sm:text-xl">
                  0.95
                </p>
              </div>
              <div className="flex min-h-[4.5rem] flex-col items-center justify-center gap-1 rounded-xl border border-white/12 bg-slate-900/80 px-2 py-2.5 text-center sm:min-h-[4.75rem] sm:px-3 sm:py-3">
                <p className="text-[11px] font-semibold leading-tight text-slate-400 sm:text-xs">
                  라운드
                </p>
                <p className="text-lg font-black tabular-nums leading-none text-white sm:text-xl">
                  1 / 3
                </p>
              </div>
              <div className="flex min-h-[4.5rem] flex-col items-center justify-center gap-1 rounded-xl border border-white/12 bg-slate-900/80 px-2 py-2.5 text-center sm:min-h-[4.75rem] sm:px-3 sm:py-3">
                <p className="text-[11px] font-semibold leading-tight text-slate-400 sm:text-xs">
                  상태
                </p>
                <p className="text-lg font-black leading-none text-white sm:text-xl">
                  진행중
                </p>
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col">
              <div className="mx-auto flex min-h-0 w-full max-w-[360px] flex-1 flex-col">
                <div className="flex min-h-0 flex-1 flex-col rounded-2xl bg-white p-2.5 shadow-sm ring-1 ring-black/[0.06] sm:p-3">
                  <div className="relative flex-1 min-h-[13rem] overflow-hidden rounded-xl bg-white sm:min-h-[15rem] md:min-h-0">
                    <svg
                      viewBox="0 0 360 220"
                      className="absolute inset-0 block h-full w-full"
                      preserveAspectRatio="xMidYMid meet"
                      aria-label="drawing preview animation"
                    >
                      <path
                        id="preview-draw-path"
                        d="M120 126 C120 92, 148 70, 182 70 C216 70, 244 92, 244 126 C244 152, 228 172, 204 178 L204 190 L160 190 L160 178 C136 172, 120 152, 120 126 Z"
                        fill="none"
                        stroke="#f87171"
                        strokeWidth="8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        pathLength={1}
                        style={{
                          strokeDasharray: 1,
                          strokeDashoffset: 1,
                          animation: "drawPath 2.2s linear infinite",
                        }}
                      />
                      <circle cx="0" cy="0" r="7" fill="#a78bfa" opacity="0.95">
                        <animateMotion
                          dur="2.2s"
                          repeatCount="indefinite"
                          rotate="auto"
                          path="M120 126 C120 92, 148 70, 182 70 C216 70, 244 92, 244 126 C244 152, 228 172, 204 178 L204 190 L160 190 L160 178 C136 172, 120 152, 120 126 Z"
                        />
                      </circle>
                    </svg>
                    <p className="pointer-events-none absolute bottom-2 left-1/2 z-[1] -translate-x-1/2 text-xs font-medium text-slate-500 drop-shadow-[0_1px_0_rgba(255,255,255,0.9)] sm:text-sm">
                      Canvas Preview
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {infoModal ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={infoModal === "game" ? "게임 소개" : "기능 소개"}
          onClick={() => setInfoModal(null)}
          style={{ animation: "fadeIn 180ms ease-out" }}
        >
          <div
            className="flex max-h-[min(90vh,640px)] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-slate-900/95 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            style={{ animation: "modalIn 220ms ease-out" }}
          >
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-white/10 px-7 pb-5 pt-7 sm:px-9 sm:pb-6 sm:pt-8">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-200">
                  {infoModal === "game" ? "Game Guide" : "Feature Guide"}
                </p>
                <h2 className="mt-2 text-2xl font-black text-white">
                  {infoModal === "game" ? "게임 소개" : "기능 소개"}
                </h2>
                <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-400">
                  {infoModal === "game"
                    ? "제시어부터 랭킹까지, 한 판이 어떻게 돌아가는지와 방 규칙을 나눠 담았어요."
                    : "채팅·안전과 편의 기능을 주제별로 정리했어요."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInfoModal(null)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-slate-950/60 text-lg leading-none text-slate-300 transition hover:border-white/20 hover:bg-white/10 hover:text-white"
                aria-label="닫기"
              >
                ✕
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-7 py-6 sm:px-9 sm:py-7 sm:pb-9">
              {infoModal === "game" ? (
                <div className="grid gap-6 sm:grid-cols-2 sm:gap-7">
                  <InfoSection
                    eyebrow="Flow"
                    title="진행 방식"
                    accent="blue"
                    numbered
                    lines={GAME_FLOW_LINES}
                  />
                  <InfoSection
                    eyebrow="Lobby"
                    title="규칙"
                    accent="violet"
                    lines={GAME_RULE_LINES}
                  />
                </div>
              ) : (
                <div className="grid gap-6 sm:grid-cols-2 sm:gap-7">
                  <InfoSection
                    eyebrow="Safety"
                    title="채팅·안전 기능"
                    accent="cyan"
                    lines={FEATURE_CHAT_LINES}
                  />
                  <InfoSection
                    eyebrow="Experience"
                    title="게스트·편의 기능"
                    accent="amber"
                    lines={FEATURE_GUEST_LINES}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
      <style>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes modalIn {
          from {
            opacity: 0;
            transform: translateY(10px) scale(0.98);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @keyframes drawPath {
          0% {
            stroke-dashoffset: 1;
          }
          100% {
            stroke-dashoffset: 0;
          }
        }
      `}</style>
    </main>
  );
}
