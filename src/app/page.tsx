import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="relative min-h-[calc(100vh-4rem)] overflow-hidden">
      <div className="pointer-events-none absolute left-[-8%] top-[-20%] h-[360px] w-[360px] rounded-full bg-blue-500/25 blur-[120px]" />
      <div className="pointer-events-none absolute right-[-8%] top-[10%] h-[320px] w-[320px] rounded-full bg-violet-500/20 blur-[120px]" />
      <section className="relative mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl gap-12 px-6 py-16 md:grid-cols-[1.05fr_0.95fr] md:items-center">
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

            <Link
              href="/login"
              className="rounded-xl border border-white/15 bg-white/5 px-6 py-3 font-semibold text-white transition hover:bg-white/10"
            >
              로그인
            </Link>
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl backdrop-blur">
          <div className="rounded-2xl border border-white/10 bg-slate-950/80 p-5 text-white">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-sm text-slate-300">Round 1</span>
              <span className="rounded-full bg-gradient-to-r from-blue-500 to-violet-500 px-3 py-1 text-xs font-bold text-white">
                제시어: 사과
              </span>
            </div>

            <div className="flex h-72 items-center justify-center rounded-2xl bg-white">
              <div className="text-center text-slate-400">
                <div className="mx-auto mb-4 h-20 w-20 rounded-full border-8 border-red-400" />
                <p className="font-medium">Canvas Preview</p>
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
    </main>
  );
}