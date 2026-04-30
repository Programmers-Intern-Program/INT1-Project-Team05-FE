'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

type ApiResponse<T> = {
  resultCode: string;
  msg: string;
  data: T;
};

type Room = {
  roomId: number;
  title: string;
  curPlayers: number;
  maxPlayers: number;
  isPlaying: boolean;
  hostNickname: string;
};

const API_BASE_URL = '/api/backend';

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem('accessToken');

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });

  const contentType = response.headers.get('content-type') || '';
  let json: ApiResponse<T> | null = null;
  let text: string | null = null;

  try {
    if (contentType.includes('application/json')) {
      json = (await response.json()) as ApiResponse<T>;
    } else {
      text = await response.text();
    }
  } catch {
    text = await response.text().catch(() => null);
  }

  if (!response.ok) {
    const msg = json?.msg || text || `요청 실패 (HTTP ${response.status})`;
    throw new Error(msg);
  }
  if (!json) throw new Error(text || `요청 실패 (HTTP ${response.status})`);
  return json.data;
}

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

  const stats = useMemo(() => {
    const waiting = rooms.filter((r) => !r.isPlaying).length;
    const playing = rooms.filter((r) => r.isPlaying).length;
    return { waiting, playing, total: rooms.length };
  }, [rooms]);

  useEffect(() => {
    void (async () => {
      try {
        setLoading(true);
        setError('');
        const data = await apiFetch<Room[]>(`/api/rooms`, { method: 'GET' });
        setRooms(data ?? []);
      } catch (e) {
        // 방 목록은 로그인 필요라서, 토큰이 없으면 여기서 실패할 수 있음
        setError(e instanceof Error ? e.message : '방 목록을 불러오지 못했습니다.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

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
              <LobbyStat label="전체 방" value={stats.total} color="text-white" />
              <LobbyStat label="대기중" value={stats.waiting} color="text-emerald-300" />
              <LobbyStat label="게임중" value={stats.playing} color="text-rose-300" />
            </div>

            <button
              type="button"
              onClick={() => setShowCreate((v) => !v)}
              className="mt-4 w-full rounded-2xl bg-gradient-to-r from-blue-500 to-violet-500 px-5 py-4 text-base font-black text-white shadow-lg shadow-blue-500/25 transition hover:from-blue-400 hover:to-violet-400"
            >
              + 새 게임방 만들기
            </button>

            {showCreate && (
              <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/40 p-4">
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

                  {error && <p className="text-sm text-rose-300">{error}</p>}

                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => void handleCreateRoom()}
                    className="w-full rounded-xl bg-gradient-to-r from-blue-500 to-violet-500 px-4 py-3 text-sm font-black text-white shadow-lg shadow-blue-500/25 transition hover:from-blue-400 hover:to-violet-400 disabled:opacity-60"
                  >
                    {loading ? '생성 중...' : '방 만들기'}
                  </button>
                </div>
              </div>
            )}
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

        {error && !showCreate && (
          <div className="mb-6 rounded-[2rem] border border-white/10 bg-white/[0.04] p-8 text-center text-sm text-rose-300 shadow-2xl backdrop-blur">
            {error}
          </div>
        )}

        <section className="grid gap-5 lg:grid-cols-3">
          {rooms.map((room) => (
            <Link
              key={room.roomId}
              href={`/rooms/${room.roomId}`}
              className="group relative overflow-hidden rounded-[2rem] border border-white/10 bg-slate-900/60 p-6 shadow-lg transition duration-300 hover:-translate-y-0.5 hover:border-blue-300/40 hover:bg-slate-900/70"
            >
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-400 via-violet-400 to-cyan-300 opacity-60" />
              <div className="absolute right-[-32px] top-[-32px] h-24 w-24 rounded-full bg-blue-500/10 blur-2xl transition group-hover:bg-violet-400/15" />

              <div className="mb-6 flex items-start justify-between gap-4">
                <div>
                  <p className="mb-2 text-xs font-semibold text-slate-400">방 #{room.roomId}</p>
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
                  {room.maxPlayers - room.curPlayers > 0 ? `${room.maxPlayers - room.curPlayers}자리 남음` : '정원 마감'}
                </span>

                <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-bold text-white transition group-hover:bg-blue-400/10 group-hover:border-blue-300/30">
                  입장하기 →
                </span>
              </div>
            </Link>
          ))}
        </section>

        {rooms.length === 0 && !loading && (
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