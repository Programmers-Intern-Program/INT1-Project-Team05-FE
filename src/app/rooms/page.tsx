import Link from 'next/link';

const mockRooms = [
  {
    roomId: 1,
    title: '친구들과 그림 대결',
    curPlayers: 2,
    maxPlayers: 4,
    totalRounds: 3,
    isPlaying: false,
    hostNickname: '도환',
  },
  {
    roomId: 2,
    title: 'AI 판별 테스트방',
    curPlayers: 3,
    maxPlayers: 4,
    totalRounds: 5,
    isPlaying: true,
    hostNickname: 'AI봇',
  },
  {
    roomId: 3,
    title: '빠른 1라운드 승부',
    curPlayers: 1,
    maxPlayers: 2,
    totalRounds: 1,
    isPlaying: false,
    hostNickname: '정원',
  },
];

export default function RoomsPage() {
  const waitingRoomCount = mockRooms.filter((room) => !room.isPlaying).length;
  const playingRoomCount = mockRooms.filter((room) => room.isPlaying).length;

  return (
    <main className="relative min-h-[calc(100vh-4rem)] overflow-hidden text-white">
      <div className="pointer-events-none absolute left-1/2 top-[-180px] h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-blue-500/10 blur-3xl" />
      <div className="pointer-events-none absolute right-[-120px] top-[220px] h-[280px] w-[280px] rounded-full bg-violet-500/10 blur-3xl" />

      <section className="relative mx-auto max-w-7xl px-6 py-12">
        <div className="mb-10 grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-blue-400/20 bg-blue-500/10 px-4 py-2 text-sm font-semibold text-blue-200">
              <span className="h-2 w-2 rounded-full bg-cyan-200" />
              Game Lobby
            </div>

            <h1 className="text-4xl font-extrabold tracking-tight text-white md:text-6xl">
              그림 대결에 참여할
              <br />
              <span className="bg-gradient-to-r from-blue-300 via-cyan-200 to-fuchsia-300 bg-clip-text text-transparent">
                게임방을 선택하세요
              </span>
            </h1>

            <p className="mt-5 max-w-2xl text-base leading-8 text-slate-300">
              실시간으로 참가자들과 라운드를 진행하고, AI가 판별한 점수로 승부를 겨룹니다.
              대기 중인 방에 입장하거나 새로운 방을 만들어 게임을 시작하세요.
            </p>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 shadow-2xl backdrop-blur">
            <div className="grid grid-cols-3 gap-3">
              <LobbyStat label="전체 방" value={mockRooms.length} color="text-white" />
              <LobbyStat label="대기중" value={waitingRoomCount} color="text-emerald-300" />
              <LobbyStat label="게임중" value={playingRoomCount} color="text-rose-300" />
            </div>

            <button
              type="button"
              className="mt-4 w-full rounded-2xl bg-gradient-to-r from-blue-500 to-violet-500 px-5 py-4 text-base font-black text-white shadow-lg shadow-blue-500/25 transition hover:from-blue-400 hover:to-violet-400"
            >
              + 새 게임방 만들기
            </button>
          </div>
        </div>

        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white">참여 가능한 방</h2>
            <p className="mt-1 text-sm text-slate-400">현재 참여 가능한 게임방 목록입니다.</p>
          </div>

          <div className="hidden rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-300 md:block">
            방을 선택하면 게임 대기실로 이동합니다
          </div>
        </div>

        <section className="grid gap-5 lg:grid-cols-3">
          {mockRooms.map((room) => (
            <Link
              key={room.roomId}
              href={`/rooms/${room.roomId}`}
              className="group relative overflow-hidden rounded-[2rem] border border-white/10 bg-slate-900/60 p-6 shadow-lg transition duration-300 hover:-translate-y-0.5 hover:border-blue-300/40 hover:bg-slate-900/70"
            >
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-400 via-violet-400 to-cyan-300 opacity-60" />
              <div className="absolute right-[-32px] top-[-32px] h-24 w-24 rounded-full bg-blue-500/10 blur-2xl transition group-hover:bg-violet-400/15" />

              <div className="mb-6 flex items-start justify-between gap-4">
                <div>
                  <p className="mb-2 text-xs font-semibold text-slate-400">
                    방 #{room.roomId}
                  </p>
                  <h3 className="line-clamp-2 text-2xl font-black leading-tight text-white transition group-hover:text-blue-100">
                    {room.title}
                  </h3>
                  <p className="mt-3 text-sm text-slate-400">
                    주최 <span className="font-bold text-slate-200">{room.hostNickname}</span>
                  </p>
                </div>

                <StatusBadge isPlaying={room.isPlaying} />
              </div>

              <div className="mb-6 grid grid-cols-2 gap-3">
                <RoomInfoBox label="인원" value={`${room.curPlayers}/${room.maxPlayers}`} />
                <RoomInfoBox label="라운드" value={`${room.totalRounds}R`} />
              </div>

              <div className="h-2 overflow-hidden rounded-full bg-slate-800/70">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-blue-400 to-violet-300"
                  style={{ width: `${(room.curPlayers / room.maxPlayers) * 100}%` }}
                />
              </div>

              <div className="mt-6 flex items-center justify-between">
                <span className="text-sm text-slate-400">
                  {room.maxPlayers - room.curPlayers > 0
                    ? `${room.maxPlayers - room.curPlayers}자리 남음`
                    : '정원 마감'}
                </span>

                <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-bold text-white transition group-hover:bg-blue-400/10 group-hover:border-blue-300/30">
                  입장하기 →
                </span>
              </div>
            </Link>
          ))}
        </section>

        {mockRooms.length === 0 && (
          <div className="mt-10 rounded-[2rem] border border-white/10 bg-white/[0.04] p-12 text-center shadow-2xl backdrop-blur">
            <p className="text-2xl font-black text-white">아직 생성된 방이 없습니다.</p>
            <p className="mt-3 text-slate-400">새로운 방을 만들어 첫 번째 게임을 시작해보세요.</p>
          </div>
        )}
      </section>
    </main>
  );
}

function LobbyStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/80 p-4 text-center">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className={`mt-2 text-3xl font-black ${color}`}>{value}</p>
    </div>
  );
}

function StatusBadge({ isPlaying }: { isPlaying: boolean }) {
  if (isPlaying) {
    return (
      <span className="shrink-0 rounded-full border border-blue-400/30 bg-blue-500/10 px-3 py-1.5 text-xs font-bold text-blue-200">
        진행중
      </span>
    );
  }

  return (
    <span className="shrink-0 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-300">
      대기중
    </span>
  );
}

function RoomInfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="mt-2 text-xl font-bold text-white">{value}</p>
    </div>
  );
}