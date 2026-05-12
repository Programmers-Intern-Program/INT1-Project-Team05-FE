'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function HomePage() {
  const [infoModal, setInfoModal] = useState<null | 'game' | 'features'>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    const syncAuth = () => {
      setIsLoggedIn(Boolean(typeof window !== 'undefined' && localStorage.getItem('accessToken')));
    };
    syncAuth();
    window.addEventListener('storage', syncAuth);
    window.addEventListener('auth-changed', syncAuth);
    return () => {
      window.removeEventListener('storage', syncAuth);
      window.removeEventListener('auth-changed', syncAuth);
    };
  }, []);

  useEffect(() => {
    if (!infoModal) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setInfoModal(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [infoModal]);

  return (
    <main className="relative min-h-[calc(100vh-4rem)] overflow-hidden">
      <div className="pointer-events-none absolute left-[-8%] top-[-20%] h-[360px] w-[360px] rounded-full bg-blue-500/25 blur-[120px]" />
      <div className="pointer-events-none absolute right-[-8%] top-[10%] h-[320px] w-[320px] rounded-full bg-violet-500/20 blur-[120px]" />
      <section className="relative mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl gap-10 px-6 py-12 md:grid-cols-[1.05fr_0.95fr] md:items-center">
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
            DrawRace는 제한된 라운드 안에서 제시어에 맞춰 그림을 그리고, AI가 판별한 점수로
            승부를 겨루는 실시간 그림 대결 게임입니다.
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

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setInfoModal('game')}
              className="rounded-xl border border-white/10 bg-slate-900/70 px-4 py-2 text-sm font-bold text-slate-100 transition hover:bg-slate-900/90"
            >
              게임 소개
            </button>
            <button
              type="button"
              onClick={() => setInfoModal('features')}
              className="rounded-xl border border-white/10 bg-slate-900/70 px-4 py-2 text-sm font-bold text-slate-100 transition hover:bg-slate-900/90"
            >
              기능 소개
            </button>
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl backdrop-blur">
          <div className="rounded-2xl border border-white/10 bg-slate-950/80 p-5 text-white">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-sm text-slate-300">Round 1</span>
              <span className="rounded-full bg-gradient-to-r from-blue-500 to-violet-500 px-3 py-1 text-xs font-bold text-white">
                제시어: 전구
              </span>
            </div>

            <div className="flex h-72 items-center justify-center rounded-2xl bg-white">
              <div className="relative h-56 w-full max-w-[360px] rounded-xl bg-white">
                <svg
                  viewBox="0 0 360 220"
                  className="h-full w-full"
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
                      animation: 'drawPath 2.2s linear infinite',
                    }}
                  />
                  <circle
                    cx="0"
                    cy="0"
                    r="7"
                    fill="#a78bfa"
                    opacity="0.95"
                  >
                    <animateMotion
                      dur="2.2s"
                      repeatCount="indefinite"
                      rotate="auto"
                      path="M120 126 C120 92, 148 70, 182 70 C216 70, 244 92, 244 126 C244 152, 228 172, 204 178 L204 190 L160 190 L160 178 C136 172, 120 152, 120 126 Z"
                    />
                  </circle>
                </svg>
                <p className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 text-sm font-medium text-slate-400">
                  Canvas Preview
                </p>
              </div>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-3 text-center">
            <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
              <p className="text-xs text-slate-400">AI 점수</p>
              <p className="mt-1 text-xl font-bold text-white">0.95</p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
              <p className="text-xs text-slate-400">라운드</p>
              <p className="mt-1 text-xl font-bold text-white">1 / 3</p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
              <p className="text-xs text-slate-400">상태</p>
              <p className="mt-1 text-xl font-bold text-white">진행중</p>
            </div>
          </div>
        </div>
      </section>

      {infoModal ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={infoModal === 'game' ? '게임 소개' : '기능 소개'}
          onClick={() => setInfoModal(null)}
          style={{ animation: 'fadeIn 180ms ease-out' }}
        >
          <div
            className="w-full max-w-2xl rounded-3xl border border-white/10 bg-slate-900/95 p-6 shadow-2xl sm:p-7"
            onClick={(e) => e.stopPropagation()}
            style={{ animation: 'modalIn 220ms ease-out' }}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-200">
                  {infoModal === 'game' ? 'Game Guide' : 'Feature Guide'}
                </p>
                <h2 className="mt-2 text-2xl font-black text-white">{infoModal === 'game' ? '게임 소개' : '기능 소개'}</h2>
              </div>
              <button
                type="button"
                onClick={() => setInfoModal(null)}
                className="rounded-lg px-2 py-1 text-slate-300 transition hover:bg-white/10 hover:text-white"
                aria-label="닫기"
              >
                ✕
              </button>
            </div>

            {infoModal === 'game' ? (
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <article className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
                  <h3 className="text-base font-black text-white">진행 방식</h3>
                  <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-slate-300">
                    <li>방 입장 후 제시어를 확인하고 그림을 그립니다.</li>
                    <li>제한 시간 안에 제출하면 라운드가 집계됩니다.</li>
                    <li>모든 라운드 종료 후 최종 랭킹이 결정됩니다.</li>
                  </ul>
                </article>
                <article className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
                  <h3 className="text-base font-black text-white">규칙</h3>
                  <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-slate-300">
                    <li>대기 중 방에서만 입장이 가능합니다.</li>
                    <li>정원이 찬 방은 자동으로 입장이 비활성화됩니다.</li>
                    <li>방장은 대기 중에만 AI 플레이어를 추가/제거할 수 있습니다.</li>
                  </ul>
                </article>
              </div>
            ) : (
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <article className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
                  <h3 className="text-base font-black text-white">채팅/안전 기능</h3>
                  <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-slate-300">
                    <li>실시간 채팅을 통해 플레이어와 즉시 소통할 수 있습니다.</li>
                    <li>채팅은 AI/필터 기반 검열로 안전하게 운영됩니다.</li>
                    <li>라운드 중에도 채팅 로그가 실시간으로 동기화됩니다.</li>
                  </ul>
                </article>
                <article className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
                  <h3 className="text-base font-black text-white">게스트/편의 기능</h3>
                  <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-slate-300">
                    <li>게스트 시작 시 AI가 닉네임을 자동 추천/생성합니다.</li>
                    <li>제출, 점수, 랭킹 상태가 패널로 실시간 반영됩니다.</li>
                    <li>로그인 없이도 빠르게 체험 후 계정 전환이 가능합니다.</li>
                  </ul>
                </article>
              </div>
            )}
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