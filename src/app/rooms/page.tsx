'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { apiFetch, getHttpStatus } from '@/lib/api-client';
import { clearAuthSession, isUnauthorizedStatus } from '@/lib/auth-session';

type Room = {
  roomId: number;
  title: string;
  curPlayers: number;
  maxPlayers: number;
  isPlaying: boolean;
  hostNickname: string;
};

export default function RoomsPage() {
  const router = useRouter();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState('');
  const [maxPlayers, setMaxPlayers] = useState(2);
  const [totalRounds, setTotalRounds] = useState(3);
  const [password, setPassword] = useState('');

  /** 참가자 0명인 방은 백엔드에 남아 있어도 로비에서 숨김(유령 방 완화) */
  const lobbyRooms = useMemo(() => rooms.filter((r) => r.curPlayers > 0), [rooms]);

  const stats = useMemo(() => {
    const waiting = lobbyRooms.filter((r) => !r.isPlaying).length;
    const playing = lobbyRooms.filter((r) => r.isPlaying).length;
    return { waiting, playing, total: lobbyRooms.length };
  }, [lobbyRooms]);

  async function loadRooms() {
    try {
      setLoading(true);
      setError('');
      const data = await apiFetch<Room[]>(`/api/rooms`, { method: 'GET' });
      setRooms(data ?? []);
    } catch (e) {
      const status = getHttpStatus(e);
      if (isUnauthorizedStatus(status)) {
        clearAuthSession();
        setRooms([]);
        setError('로그인이 만료되었거나 권한이 없습니다. 다시 로그인해 주세요.');
        return;
      }
      setError(e instanceof Error ? e.message : '방 목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const initialTimer = window.setTimeout(() => {
      void loadRooms();
    }, 0);

    // 뒤로가기 복귀(BFCache), 탭 포커스 복귀 시 목록 재동기화
    const onPageShow = () => {
      void loadRooms();
    };
    const onFocus = () => {
      void loadRooms();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void loadRooms();
      }
    };

    window.addEventListener('pageshow', onPageShow);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearTimeout(initialTimer);
      window.removeEventListener('pageshow', onPageShow);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  useEffect(() => {
    if (!showCreate) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowCreate(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [showCreate]);

  async function handleCreateRoom() {
    setError('');
    if (!title.trim()) {
      setError('방 제목을 입력해주세요.');
      return;
    }
    const token = localStorage.getItem('accessToken');
    if (!token) {
      setError('로그인이 필요합니다.');
      return;
    }

    try {
      setLoading(true);
      const body = {
        title: title.trim(),
        maxPlayers,
        totalRounds,
        password: password.trim() ? password.trim() : '',
      };
      const created = await apiFetch<{ roomId: number }>(`/api/rooms`, {
        method: 'POST',
        body: JSON.stringify(body),
      });

      if (created?.roomId) {
        router.push(`/rooms/${created.roomId}`);
      }
    } catch (e) {
      const status = getHttpStatus(e);
      if (isUnauthorizedStatus(status)) {
        clearAuthSession();
        setError('로그인이 만료되었습니다. 다시 로그인해 주세요.');
        return;
      }
      setError(e instanceof Error ? e.message : '방 생성에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative min-h-[calc(100vh-4rem)] overflow-hidden text-white">
      <div className="pointer-events-none absolute left-1/2 top-[-180px] h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-blue-500/10 blur-3xl" />
      <div className="pointer-events-none absolute right-[-120px] top-[220px] h-[280px] w-[280px] rounded-full bg-violet-500/10 blur-3xl" />

      <section className="relative mx-auto max-w-7xl px-6 py-12">
        <div className="mb-10 grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
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
              <LobbyStat label="전체 방" value={stats.total} color="text-white" />
              <LobbyStat label="대기중" value={stats.waiting} color="text-emerald-300" />
              <LobbyStat label="게임중" value={stats.playing} color="text-rose-300" />
            </div>

            <button
              type="button"
              onClick={() => {
                setError('');
                setShowCreate(true);
              }}
              className="mt-4 w-full rounded-2xl bg-gradient-to-r from-blue-500 to-violet-500 px-5 py-4 text-base font-black text-white shadow-lg shadow-blue-500/25 transition hover:from-blue-400 hover:to-violet-400"
            >
              + 새 게임방 만들기
            </button>
          </div>
        </div>

        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white">참여 가능한 방</h2>
            <p className="mt-1 text-sm text-slate-400">
              대기 중인 방만 입장할 수 있습니다. 게임 진행 중인 방은 입장할 수 없습니다.
            </p>
          </div>

          <div className="hidden rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-300 md:block">
            대기 중인 방만 눌러 입장할 수 있습니다
          </div>
        </div>

        {error && !showCreate && (
          <div className="mb-6 rounded-[2rem] border border-white/10 bg-white/[0.04] p-8 text-center text-sm text-rose-300 shadow-2xl backdrop-blur">
            {error}
          </div>
        )}

        <section className="grid gap-5 lg:grid-cols-3">
          {lobbyRooms.map((room) => {
            const cardClass =
              'group relative overflow-hidden rounded-[2rem] border border-white/10 bg-slate-900/60 p-6 shadow-lg transition duration-300';
            const cardInteractive =
              'hover:-translate-y-0.5 hover:border-blue-300/40 hover:bg-slate-900/70 cursor-pointer';
            const cardDisabled = 'cursor-not-allowed opacity-[0.88] hover:translate-y-0';

            const inner = (
              <>
                <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-400 via-violet-400 to-cyan-300 opacity-60" />
                <div className="absolute right-[-32px] top-[-32px] h-24 w-24 rounded-full bg-blue-500/10 blur-2xl transition group-hover:bg-violet-400/15" />

                <div className="mb-6 flex items-start justify-between gap-4">
                  <div>
                    <p className="mb-2 text-xs font-semibold text-slate-400">방 #{room.roomId}</p>
                    <h3
                      className={`line-clamp-2 text-2xl font-black leading-tight text-white transition ${
                        room.isPlaying ? '' : 'group-hover:text-blue-100'
                      }`}
                    >
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
                  <RoomInfoBox label="라운드" value="-" />
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

                  <span
                    className={`rounded-full border px-4 py-2 text-sm font-bold transition ${
                      room.isPlaying
                        ? 'border-rose-500/30 bg-rose-500/10 text-rose-100'
                        : 'border border-white/10 bg-white/5 text-white group-hover:bg-blue-400/10 group-hover:border-blue-300/30'
                    }`}
                  >
                    {room.isPlaying ? '진행 중 · 입장 불가' : '입장하기 →'}
                  </span>
                </div>
              </>
            );

            if (room.isPlaying) {
              return (
                <div
                  key={room.roomId}
                  role="group"
                  aria-label={`${room.title} — 게임 진행 중 입장 불가`}
                  className={`${cardClass} ${cardDisabled}`}
                >
                  {inner}
                </div>
              );
            }

            return (
              <Link
                key={room.roomId}
                href={`/rooms/${room.roomId}`}
                className={`${cardClass} ${cardInteractive}`}
              >
                {inner}
              </Link>
            );
          })}
        </section>

        {lobbyRooms.length === 0 && !loading && (
          <div className="mt-10 rounded-[2rem] border border-white/10 bg-white/[0.04] p-12 text-center shadow-2xl backdrop-blur">
            <p className="text-2xl font-black text-white">아직 생성된 방이 없습니다.</p>
            <p className="mt-3 text-slate-400">새로운 방을 만들어 첫 번째 게임을 시작해보세요.</p>
          </div>
        )}
      </section>

      {showCreate ? (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="새 게임방 만들기"
          onClick={() => setShowCreate(false)}
        >
          <div
            className="w-full max-w-lg rounded-[2rem] border border-white/10 bg-slate-900/95 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-xl font-black text-white">새 게임방 만들기</h3>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="rounded-lg px-2 py-1 text-slate-300 transition hover:bg-white/10 hover:text-white"
                aria-label="닫기"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-300">방 제목</span>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white outline-none"
                  placeholder="예: 친구들과 그림 대결"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-slate-300">인원 (2~4)</span>
                  <input
                    type="number"
                    value={maxPlayers}
                    onChange={(e) => setMaxPlayers(Number(e.target.value))}
                    className="w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white outline-none"
                    min={2}
                    max={4}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-slate-300">라운드 (1~10)</span>
                  <input
                    type="number"
                    value={totalRounds}
                    onChange={(e) => setTotalRounds(Number(e.target.value))}
                    className="w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white outline-none"
                    min={1}
                    max={10}
                  />
                </label>
              </div>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-300">방 비밀번호 (선택)</span>
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white outline-none"
                  placeholder="비밀번호 없음이면 빈칸"
                />
              </label>

              {error ? <p className="text-sm text-rose-300">{error}</p> : null}

              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="flex-1 rounded-xl border border-white/20 px-4 py-3 text-sm font-bold text-slate-200 transition hover:bg-white/10"
                >
                  취소
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void handleCreateRoom()}
                  className="flex-1 rounded-xl bg-gradient-to-r from-blue-500 to-violet-500 px-4 py-3 text-sm font-black text-white shadow-lg shadow-blue-500/25 transition hover:from-blue-400 hover:to-violet-400 disabled:opacity-60"
                >
                  {loading ? '생성 중...' : '방 만들기'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
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