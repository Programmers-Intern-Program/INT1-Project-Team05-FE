import PlayerChatBubble from '@/components/PlayerChatBubble';

type RoomPageProps = {
  params: Promise<{
    roomId: string;
  }>;
};

type Player = {
  id: number;
  nickname: string;
  isHost: boolean;
  submitted: boolean;
  roundWinCount: number;
  bubble?: string;
};

const players: Player[] = [
  {
    id: 1,
    nickname: '도환',
    isHost: true,
    submitted: true,
    roundWinCount: 2,
    bubble: '이번 라운드 쉽다!',
  },
  {
    id: 2,
    nickname: '정원',
    isHost: false,
    submitted: false,
    roundWinCount: 1,
    bubble: '어렵다 ㅋㅋ',
  },
  {
    id: 3,
    nickname: '채은',
    isHost: false,
    submitted: true,
    roundWinCount: 0,
  },
  {
    id: 4,
    nickname: 'AI봇',
    isHost: false,
    submitted: false,
    roundWinCount: 0,
    bubble: '삐빅... 분석 중',
  },
];

export default async function RoomDetailPage({ params }: RoomPageProps) {
  const { roomId } = await params;

  const leftPlayers = players.slice(0, 2);
  const rightPlayers = players.slice(2, 4);

  return (
    <main className="relative min-h-[calc(100vh-4rem)] overflow-hidden text-white">
      <div className="pointer-events-none absolute left-1/2 top-[-220px] h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-blue-500/10 blur-3xl" />
      <div className="pointer-events-none absolute right-[-120px] top-[260px] h-[280px] w-[280px] rounded-full bg-violet-500/10 blur-3xl" />
      <div className="mx-auto max-w-[1440px] px-6 py-6">
        <TopHud roomId={roomId} />

        <section className="mt-6 grid gap-6 xl:grid-cols-[240px_minmax(0,1fr)_240px]">
          <PlayerColumn players={leftPlayers} />
          <GameBoard />
          <PlayerColumn players={rightPlayers} />
        </section>
      </div>
    </main>
  );
}

function TopHud({ roomId }: { roomId: string }) {
  return (
    <header className="rounded-[2rem] border border-white/10 bg-white/[0.04] px-6 py-5 shadow-2xl backdrop-blur">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <InfoChip label={`방 #${roomId}`} />
          <InfoChip label="라운드 1 / 3" />
          <InfoChip label="진행중" tone="green" />
          <InfoChip label="제출 2 / 4" tone="blue" />
        </div>

        <div className="flex flex-wrap justify-end gap-3">
          <button
            type="button"
            className="rounded-2xl border border-white/10 bg-slate-950/50 px-5 py-3 text-sm font-bold text-slate-200 transition hover:border-blue-300/40 hover:bg-blue-400/10 hover:text-blue-100"
          >
            방 나가기
          </button>
          <button
            type="button"
            className="rounded-2xl bg-gradient-to-r from-blue-500 to-violet-500 px-5 py-3 text-sm font-black text-white shadow-lg shadow-blue-500/20 transition hover:from-blue-400 hover:to-violet-400"
          >
            게임 시작
          </button>
        </div>
      </div>
    </header>
  );
}

function InfoChip({
  label,
  tone = 'default',
}: {
  label: string;
  tone?: 'default' | 'green' | 'blue';
}) {
  const className = {
    default: 'border-white/10 bg-slate-950/70 text-slate-200',
    green: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300',
    blue: 'border-blue-400/30 bg-blue-500/10 text-blue-300',
  }[tone];

  return (
    <span className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${className}`}>
      {label}
    </span>
  );
}

function PlayerColumn({ players }: { players: Player[] }) {
  return (
    <aside className="flex flex-col gap-5">
      {players.map((player) => (
        <PlayerCard key={player.id} player={player} />
      ))}
    </aside>
  );
}

function PlayerCard({ player }: { player: Player }) {
  return (
    <div className="rounded-[1.75rem] border border-white/10 bg-slate-900/70 p-5 shadow-xl backdrop-blur">
      <PlayerChatBubble text={player.bubble} />

      <div className="flex flex-col items-center text-center">
        <div className="relative">
          <div className="flex h-20 w-20 items-center justify-center rounded-full border border-blue-400/30 bg-gradient-to-br from-[#0b1c3f] to-[#081122] text-2xl font-black text-white shadow-[0_0_30px_rgba(59,130,246,0.18)]">
            {player.nickname.slice(0, 1)}
          </div>
          <span
            className={`absolute bottom-1 right-1 h-4 w-4 rounded-full ${
              player.submitted ? 'bg-emerald-300' : 'bg-amber-300'
            }`}
          />
        </div>

        <div className="mt-4 flex items-center gap-2">
          <h3 className="text-2xl font-black tracking-tight text-white">{player.nickname}</h3>
          {player.isHost && (
            <span className="rounded-full bg-blue-500/15 px-2 py-1 text-[11px] font-black text-blue-300">
              호스트
            </span>
          )}
        </div>

        <p className="mt-2 text-sm text-slate-400">라운드 승리 {player.roundWinCount}회</p>

        <div className="mt-5 w-full rounded-2xl bg-slate-950/80 px-4 py-4">
          <p
            className={`text-base font-black ${
              player.submitted ? 'text-emerald-300' : 'text-amber-300'
            }`}
          >
            {player.submitted ? '제출 완료' : '그리는 중'}
          </p>
        </div>
      </div>
    </div>
  );
}

function GameBoard() {
  return (
    <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 shadow-2xl backdrop-blur">
      <div className="flex flex-col gap-3 rounded-[1.5rem] border border-white/10 bg-slate-900/70 p-5">
        <div className="flex flex-col gap-3">
          <div className="flex justify-center">
            <div className="rounded-2xl border border-blue-400/30 bg-blue-500/10 px-5 py-3 text-center">
              <p className="text-[11px] font-black uppercase tracking-[0.3em] text-blue-200">
                제시어
              </p>
              <p className="mt-1 text-3xl font-black tracking-tight text-white">사과</p>
            </div>
          </div>

          <div className="relative flex w-full justify-center">
            <p className="max-w-[460px] text-center text-sm leading-5 text-slate-300 lg:max-w-[420px]">
              게임이 시작되었습니다! 제시어에 맞춰 그림을 완성해 주세요.
            </p>

            <div className="hidden lg:flex absolute right-0 top-1/2 -translate-y-1/2 flex-wrap items-center gap-2">
              <div className="rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-2 text-sm font-bold text-slate-200">
                펜 8px
              </div>
              <div className="rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-2 text-sm font-bold text-slate-200">
                색 빨강
              </div>
            </div>
          </div>

          <div className="flex justify-center lg:hidden">
            <div className="flex flex-wrap items-center gap-3">
              <div className="rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-2 text-sm font-bold text-slate-200">
                펜 8px
              </div>
              <div className="rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-2 text-sm font-bold text-slate-200">
                색 빨강
              </div>
            </div>
          </div>
        </div>

        <div className="relative flex min-h-[380px] items-center justify-center rounded-[1.75rem] bg-gradient-to-b from-white/[0.06] to-white/[0.02] p-6 ring-1 ring-white/10">
          <span className="absolute left-5 top-5 rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-xs font-black text-slate-300">
            캔버스
          </span>

          <div className="text-center">
            <div className="mx-auto mb-6 h-32 w-32 rounded-full border-[12px] border-blue-400/60" />
            <h3 className="text-4xl font-black tracking-tight text-slate-100">그림판 영역</h3>
            <p className="mt-3 text-base text-slate-400">
              추후 실제 캔버스 또는 이미지 업로드 기능으로 연결됩니다.
            </p>
          </div>
        </div>

        <DrawingToolbar />
      </div>
    </section>
  );
}

function DrawingToolbar() {
  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/60 p-4">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <ToolButton label="검정" active />
          <ToolButton label="빨강" />
          <ToolButton label="파랑" />
          <ToolButton label="지우개" />
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            className="rounded-2xl border border-white/10 bg-slate-900/60 px-5 py-3 text-sm font-bold text-slate-200 transition hover:bg-slate-800/60 hover:border-blue-300/30"
          >
            초기화
          </button>

          <button
            type="button"
            className="rounded-2xl bg-gradient-to-r from-blue-500 to-violet-500 px-7 py-3 text-sm font-black text-white shadow-lg shadow-blue-500/20 transition hover:from-blue-400 hover:to-violet-400"
          >
            그림 제출
          </button>
        </div>
      </div>
    </div>
  );
}

function ToolButton({ label, active = false }: { label: string; active?: boolean }) {
  return (
    <button
      type="button"
      className={`rounded-2xl px-4 py-3 text-sm font-bold transition ${
        active
          ? 'bg-blue-500 text-white'
          : 'border border-white/10 bg-slate-900/60 text-slate-200 hover:bg-slate-800/60 hover:border-blue-300/30'
      }`}
    >
      {label}
    </button>
  );
}