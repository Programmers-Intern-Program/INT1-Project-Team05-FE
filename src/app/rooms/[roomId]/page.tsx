'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import type { DrawingCanvasHandle } from '@/components/DrawingCanvas';
import { DrawingCanvas } from '@/components/DrawingCanvas';
import PlayerChatBubble from '@/components/PlayerChatBubble';
import { useRoomStomp, type RoomStompDestination } from '@/hooks/useRoomStomp';

type Player = {
  id: number;
  /** 방 대기 중에는 userId와 동일, 라운드 시작 후에는 제출용 participantId와 매칭된 계정 ID */
  userId?: number;
  nickname: string;
  isHost: boolean;
  submitted: boolean;
  roundWinCount: number;
  bubble?: string;
};

type CurrentRoundParticipant = {
  participantId: number;
  roundWinCount: number;
  isHost: boolean;
  isWinner: boolean;
};

/** Spring/Jackson이 boolean getter `isHost()`를 JSON 키 `host`로보냅니다. */
type CurrentRoundParticipantJson = CurrentRoundParticipant & {
  host?: boolean;
  winner?: boolean;
};

type RoomDetailParticipant = {
  userId: number;
  nickname: string;
  isHost: boolean;
};

type RoomDetailData = {
  roomId: number;
  participants: RoomDetailParticipant[];
  /** Jackson에 따라 `playing`으로 올 수 있음 */
  isPlaying?: boolean;
  playing?: boolean;
};

type ApiResponse<T> = {
  resultCode: string;
  msg: string;
  data: T;
};

type RoundStartData = {
  roomId: number;
  roundId: number;
  roundNumber: number;
  keyword: string;
  status: 'READY' | 'IN_PROGRESS' | 'FINISHED';
  startedAt: string;
};

type CurrentRoundData = {
  roomId: number;
  roundId: number;
  roundNumber: number;
  keyword: string;
  status: 'READY' | 'IN_PROGRESS' | 'FINISHED';
  isTiebreaker: boolean;
  participants: CurrentRoundParticipant[];
};

/** Jackson이 `isTiebreaker()`를 `tiebreaker`로 직렬화하는 경우를 흡수합니다. */
type CurrentRoundDataJson = Omit<CurrentRoundData, 'isTiebreaker' | 'participants'> & {
  isTiebreaker?: boolean;
  tiebreaker?: boolean;
  participants: CurrentRoundParticipantJson[];
};

type SubmitDrawingData = {
  roundId: number;
  submittedAiAnswer: string;
  submittedScore: number;
  submittedCount: number;
  totalParticipantCount: number;
  roundFinished: boolean;
  gameFinished: boolean;
  tieBreakerStarted: boolean;
  roundWinnerParticipantId?: number;
  roundWinnerAiAnswer?: string;
  roundWinnerScore?: number;
  nextRoundId?: number;
  nextRoundNumber?: number;
};

type ChatMessageDtoWs = {
  type?: string;
  roomId?: number;
  sender?: string;
  message?: string;
};

function roomIsPlaying(room: RoomDetailData): boolean {
  return Boolean(room.isPlaying ?? room.playing);
}

function normalizeWsSubmitDrawing(o: Record<string, unknown>): SubmitDrawingData {
  return {
    roundId: Number(o.roundId),
    submittedAiAnswer: String(o.submittedAiAnswer ?? ''),
    submittedScore: Number(o.submittedScore ?? 0),
    submittedCount: Number(o.submittedCount ?? 0),
    totalParticipantCount: Number(o.totalParticipantCount ?? 0),
    roundFinished: Boolean(o.roundFinished),
    gameFinished: Boolean(o.gameFinished),
    tieBreakerStarted: Boolean(o.tieBreakerStarted),
    roundWinnerParticipantId:
      o.roundWinnerParticipantId != null ? Number(o.roundWinnerParticipantId) : undefined,
    roundWinnerAiAnswer: o.roundWinnerAiAnswer != null ? String(o.roundWinnerAiAnswer) : undefined,
    roundWinnerScore: o.roundWinnerScore != null ? Number(o.roundWinnerScore) : undefined,
    nextRoundId: o.nextRoundId != null ? Number(o.nextRoundId) : undefined,
    nextRoundNumber: o.nextRoundNumber != null ? Number(o.nextRoundNumber) : undefined,
  };
}

/** 새로고침 후에도 제출 표시·AI 한 줄을 복구 (백엔드에 제출자 목록 API가 없을 때) */
type PersistedRoundUi = {
  roundId: number;
  submittedParticipantIds: number[];
  submitInfo: SubmitDrawingData | null;
};

const PERSIST_ROUND_KEY = (roomId: number) => `drawrace_round_ui_${roomId}`;

function loadPersistedRoundUi(roomId: number): PersistedRoundUi | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(PERSIST_ROUND_KEY(roomId));
    if (!raw) return null;
    return JSON.parse(raw) as PersistedRoundUi;
  } catch {
    return null;
  }
}

function savePersistedRoundUi(roomId: number, state: PersistedRoundUi) {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(PERSIST_ROUND_KEY(roomId), JSON.stringify(state));
}

function clearPersistedRoundUi(roomId: number) {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(PERSIST_ROUND_KEY(roomId));
}

function patchPersistedAfterSubmit(
  roomId: number,
  roundId: number,
  participantId: number,
  submitInfo: SubmitDrawingData,
  allParticipantIds: number[],
) {
  const prev = loadPersistedRoundUi(roomId);
  const idSet = new Set<number>();
  if (prev?.roundId === roundId) {
    for (const id of prev.submittedParticipantIds) idSet.add(id);
  }
  idSet.add(participantId);
  if (submitInfo.roundFinished) {
    for (const id of allParticipantIds) idSet.add(id);
  }
  savePersistedRoundUi(roomId, {
    roundId,
    submittedParticipantIds: [...idSet],
    submitInfo,
  });
}

function finalizePlayersForRound(roomId: number, roundId: number, players: Player[]): Player[] {
  const persisted = loadPersistedRoundUi(roomId);
  if (!persisted || persisted.roundId !== roundId) return players;
  const idSet = new Set(persisted.submittedParticipantIds);
  return players.map((p) => ({ ...p, submitted: p.submitted || idSet.has(p.id) }));
}

function getApiBaseUrl() {
  // 브라우저에서 백엔드로 직접 요청하면 CORS preflight(OPTIONS)가 막힐 수 있어,
  // Next.js API 프록시(`/api/backend/...`)로 통일합니다.
  return '/api/backend';
}

function normalizeRoundParticipant(p: CurrentRoundParticipantJson): CurrentRoundParticipant {
  return {
    participantId: p.participantId,
    roundWinCount: p.roundWinCount,
    isHost: Boolean(p.isHost ?? p.host),
    isWinner: Boolean(p.isWinner ?? p.winner),
  };
}

function normalizeCurrentRoundData(raw: CurrentRoundDataJson): CurrentRoundData {
  return {
    roomId: raw.roomId,
    roundId: raw.roundId,
    roundNumber: raw.roundNumber,
    keyword: raw.keyword,
    status: raw.status,
    isTiebreaker: Boolean(raw.isTiebreaker ?? raw.tiebreaker),
    participants: raw.participants.map(normalizeRoundParticipant),
  };
}

/** 라운드 API(participantId)와 방 상세(userId·nickname)를 맞춰 표시용 닉네임을 붙입니다. */
function buildPlayersFromRoundAndRoom(
  roundParticipants: CurrentRoundParticipantJson[],
  roomParticipants: RoomDetailParticipant[],
): Player[] {
  const roundNorm = roundParticipants.map(normalizeRoundParticipant);
  const hostsRoom = roomParticipants.filter((p) => p.isHost).sort((a, b) => a.userId - b.userId);
  const guestsRoom = roomParticipants.filter((p) => !p.isHost).sort((a, b) => a.userId - b.userId);
  const hostsRound = roundNorm.filter((p) => p.isHost).sort((a, b) => a.participantId - b.participantId);
  const guestsRound = roundNorm.filter((p) => !p.isHost).sort((a, b) => a.participantId - b.participantId);

  const nicknameByParticipantId = new Map<number, string>();
  const userIdByParticipantId = new Map<number, number>();
  hostsRound.forEach((rp, i) => {
    const rm = hostsRoom[i];
    if (rm) {
      nicknameByParticipantId.set(rp.participantId, rm.nickname);
      userIdByParticipantId.set(rp.participantId, rm.userId);
    }
  });
  guestsRound.forEach((rp, i) => {
    const rm = guestsRoom[i];
    if (rm) {
      nicknameByParticipantId.set(rp.participantId, rm.nickname);
      userIdByParticipantId.set(rp.participantId, rm.userId);
    }
  });

  return roundNorm.map((rp) => ({
    id: rp.participantId,
    userId: userIdByParticipantId.get(rp.participantId),
    nickname:
      nicknameByParticipantId.get(rp.participantId) ??
      (rp.isHost ? '호스트' : `참가자 ${rp.participantId}`),
    isHost: rp.isHost,
    submitted: false,
    roundWinCount: rp.roundWinCount,
  }));
}

/** 같은 참가자 id면 이전 제출 표시를 유지하고, 새 맵의 제출 표시(세션 복원 등)도 반영 */
function mergePlayersKeepSubmitted(prev: Player[], mapped: Player[]): Player[] {
  const submittedById = new Map(prev.map((p) => [p.id, p.submitted]));
  return mapped.map((p) => ({
    ...p,
    submitted: Boolean(submittedById.get(p.id)) || Boolean(p.submitted),
  }));
}

function getJwtUserId(token: string | null): number | null {
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const payloadPart = parts[1]!;
    const base64 = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const decoded = atob(padded);
    const payload = JSON.parse(decoded) as { userId?: number; user_id?: number };
    const id = payload.userId ?? payload.user_id;
    return typeof id === 'number' ? id : id != null ? Number(id) : null;
  } catch {
    return null;
  }
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;

  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });

  const contentType = response.headers.get('content-type') || '';

  // 응답이 JSON이 아닐 수도 있으므로 안전하게 처리
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

  if (!json) {
    throw new Error(text || `요청 실패 (HTTP ${response.status})`);
  }

  return json.data;
}

export default function RoomDetailPage() {
  const params = useParams<{ roomId: string }>();
  const roomId = params?.roomId ?? '';
  const roomIdNumber = Number(roomId);

  const [players, setPlayers] = useState<Player[]>([]);
  const leftPlayers = players.slice(0, 2);
  const rightPlayers = players.slice(2, 4);

  const [participantId, setParticipantId] = useState<string>('');
  const [roundInfo, setRoundInfo] = useState<RoundStartData | CurrentRoundData | null>(null);
  const [submitInfo, setSubmitInfo] = useState<SubmitDrawingData | null>(null);
  const [loadingStart, setLoadingStart] = useState(false);
  const [loadingSubmit, setLoadingSubmit] = useState(false);
  const [error, setError] = useState('');
  const [stompChatLine, setStompChatLine] = useState<string | null>(null);

  const refreshRoomParticipants = useCallback(async () => {
    if (!roomIdNumber) return;
    try {
      const latest = await apiFetch<RoomDetailData>(`/api/rooms/${roomIdNumber}`);
      if (roomIsPlaying(latest)) {
        try {
          const dataRaw = await apiFetch<CurrentRoundDataJson>(`/api/rooms/${roomIdNumber}/rounds/current`);
          const data = normalizeCurrentRoundData(dataRaw);
          setRoundInfo(data);
          const mappedPlayers = buildPlayersFromRoundAndRoom(dataRaw.participants, latest.participants);
          const finalized = finalizePlayersForRound(roomIdNumber, data.roundId, mappedPlayers);
          setPlayers((prev) => mergePlayersKeepSubmitted(prev, finalized));
          setSubmitInfo((prev) => {
            if (prev) return prev;
            const p = loadPersistedRoundUi(roomIdNumber);
            return p?.roundId === data.roundId && p.submitInfo ? p.submitInfo : prev;
          });
          const myUid = getJwtUserId(localStorage.getItem('accessToken'));
          const mine = myUid != null ? finalized.find((pl) => pl.userId === myUid) : undefined;
          setParticipantId(String(mine?.id ?? finalized[0]?.id ?? ''));
        } catch {
          setPlayers(
            latest.participants.map((p) => ({
              id: p.userId,
              userId: p.userId,
              nickname: p.nickname,
              isHost: p.isHost,
              submitted: false,
              roundWinCount: 0,
            })),
          );
        }
      } else {
        setRoundInfo(null);
        setSubmitInfo(null);
        clearPersistedRoundUi(roomIdNumber);
        setPlayers(
          latest.participants.map((p) => ({
            id: p.userId,
            userId: p.userId,
            nickname: p.nickname,
            isHost: p.isHost,
            submitted: false,
            roundWinCount: 0,
          })),
        );
        setParticipantId('');
      }
    } catch {
      /* STOMP 동기화 실패는 조용히 무시 */
    }
  }, [roomIdNumber]);

  const onStompPayload = useCallback(
    (dest: RoomStompDestination, body: unknown) => {
      if (dest === 'chat') {
        const c = body as ChatMessageDtoWs;
        if (c?.message) {
          setStompChatLine(`${c.sender === 'System' ? '알림' : (c.sender ?? '알림')}: ${c.message}`);
        }
        return;
      }
      if (!body || typeof body !== 'object') return;
      const o = body as Record<string, unknown>;
      const evt = o.type;
      if (typeof evt === 'string' && ['USER_ENTER', 'USER_LEAVE', 'HOST_CHANGED'].includes(evt)) {
        void refreshRoomParticipants();
        return;
      }
      if (typeof o.keyword === 'string' && typeof o.roundNumber === 'number' && typeof o.roundId === 'number') {
        clearPersistedRoundUi(roomIdNumber);
        const rs: RoundStartData = {
          roomId: Number(o.roomId ?? roomIdNumber),
          roundId: Number(o.roundId),
          roundNumber: Number(o.roundNumber),
          keyword: String(o.keyword),
          status: (o.status as RoundStartData['status']) ?? 'IN_PROGRESS',
          startedAt: String(o.startedAt ?? ''),
        };
        setRoundInfo(rs);
        setSubmitInfo(null);
        setStompChatLine(null);
        void refreshRoomParticipants();
        return;
      }
      if (typeof o.submittedCount === 'number' && typeof o.totalParticipantCount === 'number') {
        const data = normalizeWsSubmitDrawing(o);
        setSubmitInfo(data);
        if (data.roundFinished) {
          setPlayers((prev) => prev.map((p) => ({ ...p, submitted: true })));
        }
      }
    },
    [refreshRoomParticipants, roomIdNumber],
  );

  const stompToken = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
  useRoomStomp(roomIdNumber, Boolean(roomIdNumber && stompToken), stompToken, onStompPayload);

  useEffect(() => {
    if (!roomIdNumber) return;

    // 방에 입장(참가자로 등록)
    void (async () => {
      setError('');
      try {
        // 1) 먼저 방 상세를 가져와서, 이미 내가 참여자인지 확인
        //    (방 생성 시 호스트는 백엔드가 이미 Participant로 넣어주기 때문에 join을 또 호출하면 중복이 생길 수 있음)
        const roomDetail = await apiFetch<RoomDetailData>(`/api/rooms/${roomIdNumber}`);
        const myUserId = getJwtUserId(localStorage.getItem('accessToken'));
        const alreadyJoined = myUserId != null && roomDetail.participants.some((p) => p.userId === myUserId);

        // 2) 아직 참여자가 아니라면 join 호출
        if (!alreadyJoined) {
          await apiFetch(`/api/rooms/${roomIdNumber}/join`, {
            method: 'POST',
            body: JSON.stringify({}),
          });
        }

        // 3) 최신 방 상세 — 게임 중이면 현재 라운드까지 불러와 HUD·제출 표시 복원
        const latest = await apiFetch<RoomDetailData>(`/api/rooms/${roomIdNumber}`);
        if (roomIsPlaying(latest)) {
          try {
            const dataRaw = await apiFetch<CurrentRoundDataJson>(`/api/rooms/${roomIdNumber}/rounds/current`);
            const data = normalizeCurrentRoundData(dataRaw);
            setRoundInfo(data);
            const mappedPlayers = buildPlayersFromRoundAndRoom(dataRaw.participants, latest.participants);
            const finalized = finalizePlayersForRound(roomIdNumber, data.roundId, mappedPlayers);
            setPlayers(finalized);
            const persisted = loadPersistedRoundUi(roomIdNumber);
            if (persisted?.roundId === data.roundId && persisted.submitInfo) {
              setSubmitInfo(persisted.submitInfo);
            }
            const myUid = getJwtUserId(localStorage.getItem('accessToken'));
            const mine = myUid != null ? finalized.find((pl) => pl.userId === myUid) : undefined;
            setParticipantId(String(mine?.id ?? finalized[0]?.id ?? ''));
          } catch {
            setRoundInfo(null);
            setSubmitInfo(null);
            setPlayers(
              latest.participants.map((p) => ({
                id: p.userId,
                userId: p.userId,
                nickname: p.nickname,
                isHost: p.isHost,
                submitted: false,
                roundWinCount: 0,
              })),
            );
            setParticipantId('');
          }
        } else {
          setRoundInfo(null);
          setSubmitInfo(null);
          clearPersistedRoundUi(roomIdNumber);
          setPlayers(
            latest.participants.map((p) => ({
              id: p.userId,
              userId: p.userId,
              nickname: p.nickname,
              isHost: p.isHost,
              submitted: false,
              roundWinCount: 0,
            })),
          );
          setParticipantId('');
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : '방 입장에 실패했습니다.');
      }
    })();
  }, [roomIdNumber]);

  const keyword = roundInfo?.keyword ?? '사과';
  const roundLabel = roundInfo ? `라운드 ${roundInfo.roundNumber}` : '라운드 -';
  const submitLabel = submitInfo
    ? `제출 ${submitInfo.submittedCount} / ${submitInfo.totalParticipantCount}`
    : '제출 - / -';
  const statusLabel = roundInfo?.status === 'IN_PROGRESS' ? '진행중' : '대기중';

  /** 에러·AI 결과만 (버튼/초기화와 무관하게 유지) */
  const feedbackLine = useMemo(() => {
    if (error) return error;
    if (submitInfo?.submittedAiAnswer) {
      return `AI 판별: ${submitInfo.submittedAiAnswer} (${submitInfo.submittedScore.toFixed(2)})`;
    }
    return null;
  }, [error, submitInfo]);

  /** 항상 보이는 안내 (진행 단계별 고정 문구) */
  const instructionLine = useMemo(() => {
    if (roundInfo?.status === 'IN_PROGRESS') {
      return '제시어에 맞춰 그림을 완성해 주세요.';
    }
    return '방에 입장했습니다. 호스트가 게임을 시작하면 제시어가 공개됩니다.';
  }, [roundInfo?.status]);

  async function handleStartGame() {
    if (!roomIdNumber) return;
    setError('');
    setLoadingStart(true);
    try {
      clearPersistedRoundUi(roomIdNumber);
      const data = await apiFetch<RoundStartData>(`/api/rooms/${roomIdNumber}/start`, { method: 'POST' });
      setRoundInfo(data);

      // 시작 직후 현재 라운드를 가져와 참가자/키워드를 UI에 반영
      const curRaw = await apiFetch<CurrentRoundDataJson>(`/api/rooms/${roomIdNumber}/rounds/current`);
      const cur = normalizeCurrentRoundData(curRaw);
      setRoundInfo(cur);
      const latestRoom = await apiFetch<RoomDetailData>(`/api/rooms/${roomIdNumber}`);
      const mappedPlayers = buildPlayersFromRoundAndRoom(curRaw.participants, latestRoom.participants);
      setSubmitInfo(null);
      const finalizedStart = finalizePlayersForRound(roomIdNumber, cur.roundId, mappedPlayers);
      setPlayers(finalizedStart);
      const myUid = getJwtUserId(localStorage.getItem('accessToken'));
      const mine = myUid != null ? finalizedStart.find((pl) => pl.userId === myUid) : undefined;
      setParticipantId(String(mine?.id ?? finalizedStart[0]?.id ?? ''));
    } catch (e) {
      setError(e instanceof Error ? e.message : '게임 시작에 실패했습니다.');
    } finally {
      setLoadingStart(false);
    }
  }

  async function handleSubmitDrawing(imageData: string) {
    if (!roundInfo?.roundId) {
      setError('먼저 게임이 시작된 뒤에 제출할 수 있습니다.');
      return;
    }

    const pid = Number(participantId);
    if (!Number.isFinite(pid) || pid <= 0) {
      setError('내 참가 정보를 찾을 수 없습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.');
      return;
    }

    if (!imageData.startsWith('data:image')) {
      setError('캔버스 이미지를 만들 수 없습니다. 다시 시도해 주세요.');
      return;
    }

    setError('');
    setLoadingSubmit(true);
    try {
      const data = await apiFetch<SubmitDrawingData>(`/api/rounds/${roundInfo.roundId}/submit`, {
        method: 'POST',
        body: JSON.stringify({ participantId: pid, imageData }),
      });
      setSubmitInfo(data);
      patchPersistedAfterSubmit(roomIdNumber, roundInfo.roundId, pid, data, players.map((p) => p.id));

      setPlayers((prev) => {
        let next = prev.map((p) =>
          Number(p.id) === Number(pid) ? { ...p, submitted: true } : p,
        );
        if (data.roundFinished) {
          next = next.map((p) => ({ ...p, submitted: true }));
        }
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : '그림 제출에 실패했습니다.');
    } finally {
      setLoadingSubmit(false);
    }
  }

  return (
    <main className="relative min-h-[calc(100vh-4rem)] overflow-hidden text-white">
      <div className="pointer-events-none absolute left-1/2 top-[-220px] h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-blue-500/10 blur-3xl" />
      <div className="pointer-events-none absolute right-[-120px] top-[260px] h-[280px] w-[280px] rounded-full bg-violet-500/10 blur-3xl" />
      <div className="mx-auto max-w-[1440px] px-4 py-4 sm:px-6 sm:py-5">
        <TopHud
          roomId={roomId}
          roundLabel={roundLabel}
          statusLabel={statusLabel}
          submitLabel={submitLabel}
          onStartGame={handleStartGame}
          loadingStart={loadingStart}
        />

        <section className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,200px)_minmax(0,1fr)_minmax(0,200px)] xl:gap-5">
          <PlayerColumn players={leftPlayers} />
          <GameBoard
            keyword={keyword}
            feedbackLine={feedbackLine}
            instructionLine={instructionLine}
            stompChatLine={stompChatLine}
            setError={setError}
            onSubmitDrawing={handleSubmitDrawing}
            loadingSubmit={loadingSubmit}
          />
          <PlayerColumn players={rightPlayers} />
        </section>
      </div>
    </main>
  );
}

function TopHud({
  roomId,
  roundLabel,
  statusLabel,
  submitLabel,
  onStartGame,
  loadingStart,
}: {
  roomId: string;
  roundLabel: string;
  statusLabel: string;
  submitLabel: string;
  onStartGame: () => void;
  loadingStart: boolean;
}) {
  return (
    <header className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 shadow-2xl backdrop-blur sm:rounded-[2rem] sm:px-6 sm:py-4">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <InfoChip label={`방 #${roomId}`} />
          <InfoChip label={roundLabel} />
          <InfoChip label={statusLabel} tone={statusLabel === '진행중' ? 'green' : 'default'} />
          <InfoChip label={submitLabel} tone="blue" />
        </div>

        <div className="flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={onStartGame}
            className="rounded-2xl bg-gradient-to-r from-blue-500 to-violet-500 px-5 py-3 text-sm font-black text-white shadow-lg shadow-blue-500/20 transition hover:from-blue-400 hover:to-violet-400"
          >
            {loadingStart ? '시작 중...' : '게임 시작'}
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

type DrawTool = 'black' | 'red' | 'blue' | 'eraser';

const STROKE: Record<Exclude<DrawTool, 'eraser'>, string> = {
  black: '#171717',
  red: '#ef4444',
  blue: '#2563eb',
};

const TOOL_LABEL: Record<DrawTool, string> = {
  black: '검정',
  red: '빨강',
  blue: '파랑',
  eraser: '지우개',
};

function GameBoard({
  keyword,
  feedbackLine,
  instructionLine,
  stompChatLine,
  setError,
  onSubmitDrawing,
  loadingSubmit,
}: {
  keyword: string;
  feedbackLine: string | null;
  instructionLine: string;
  stompChatLine: string | null;
  setError: (msg: string) => void;
  onSubmitDrawing: (imageData: string) => void | Promise<void>;
  loadingSubmit: boolean;
}) {
  const canvasRef = useRef<DrawingCanvasHandle>(null);
  const [tool, setTool] = useState<DrawTool>('black');
  const [lineWidth, setLineWidth] = useState(8);
  const strokeColor = tool === 'eraser' ? '#ffffff' : STROKE[tool];
  const isEraser = tool === 'eraser';

  function handleClearCanvas() {
    canvasRef.current?.clear();
  }

  function handleSubmitClick() {
    const api = canvasRef.current;
    if (!api?.getHasDrawing()) {
      setError('캔버스에 그림을 그린 뒤 제출해 주세요.');
      return;
    }
    setError('');
    void onSubmitDrawing(api.toDataUrl());
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 shadow-2xl backdrop-blur sm:rounded-[2rem] sm:p-5">
      <div className="flex flex-col gap-2.5 rounded-xl border border-white/10 bg-slate-900/70 p-4 sm:gap-3 sm:rounded-[1.5rem] sm:p-5">
        <div className="flex flex-col gap-2 sm:gap-3">
          <div className="flex justify-center">
            <div className="rounded-xl border border-blue-400/30 bg-blue-500/10 px-4 py-2.5 text-center sm:rounded-2xl sm:px-5 sm:py-3">
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-blue-200 sm:text-[11px] sm:tracking-[0.3em]">
                제시어
              </p>
              <p className="mt-0.5 text-2xl font-black tracking-tight text-white sm:mt-1 sm:text-3xl">{keyword}</p>
            </div>
          </div>

          <div className="flex w-full flex-col items-center gap-2 sm:gap-3">
            {feedbackLine ? (
              <p className="max-w-[520px] text-center text-sm font-semibold leading-relaxed text-amber-200/95">
                {feedbackLine}
              </p>
            ) : null}
            {stompChatLine ? (
              <p className="max-w-[520px] text-center text-xs leading-relaxed text-slate-400">{stompChatLine}</p>
            ) : null}
            <p className="max-w-[520px] text-center text-sm leading-relaxed text-slate-300">{instructionLine}</p>
            <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
              <div className="rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-2 text-sm font-bold text-slate-200">
                펜 {lineWidth}px
              </div>
              <div className="rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-2 text-sm font-bold text-slate-200">
                {isEraser ? '지우개' : `색 ${TOOL_LABEL[tool]}`}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-stretch justify-center rounded-xl bg-gradient-to-b from-white/[0.06] to-white/[0.02] p-3 ring-1 ring-white/10 sm:rounded-[1.75rem] sm:p-4">
          <div className="mx-auto flex w-full justify-center px-0.5">
            <DrawingCanvas
              ref={canvasRef}
              strokeColor={strokeColor}
              lineWidth={lineWidth}
              isEraser={isEraser}
            />
          </div>
        </div>

        <DrawingToolbar
          tool={tool}
          onToolChange={setTool}
          lineWidth={lineWidth}
          onLineWidthChange={setLineWidth}
          onClear={handleClearCanvas}
          onSubmit={handleSubmitClick}
          loadingSubmit={loadingSubmit}
        />
      </div>
    </section>
  );
}

function DrawingToolbar({
  tool,
  onToolChange,
  lineWidth,
  onLineWidthChange,
  onClear,
  onSubmit,
  loadingSubmit,
}: {
  tool: DrawTool;
  onToolChange: (t: DrawTool) => void;
  lineWidth: number;
  onLineWidthChange: (n: number) => void;
  onClear: () => void;
  onSubmit: () => void;
  loadingSubmit: boolean;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/60 p-3 sm:rounded-[1.5rem] sm:p-4">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="flex flex-wrap items-center gap-3">
            <ToolButton label="검정" active={tool === 'black'} onClick={() => onToolChange('black')} />
            <ToolButton label="빨강" active={tool === 'red'} onClick={() => onToolChange('red')} />
            <ToolButton label="파랑" active={tool === 'blue'} onClick={() => onToolChange('blue')} />
            <ToolButton label="지우개" active={tool === 'eraser'} onClick={() => onToolChange('eraser')} />
          </div>
          <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-900/60 px-3 py-2">
            <span className="shrink-0 text-xs font-bold text-slate-400">펜 굵기</span>
            <input
              type="range"
              min={2}
              max={28}
              step={2}
              value={lineWidth}
              onChange={(e) => onLineWidthChange(Number(e.target.value))}
              className="h-2 w-[min(100%,140px)] cursor-pointer accent-blue-500 sm:w-32"
              aria-label="펜 굵기"
            />
            <span className="w-10 shrink-0 text-right font-mono text-xs font-bold text-slate-200">{lineWidth}px</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onClear}
            className="rounded-2xl border border-white/10 bg-slate-900/60 px-5 py-3 text-sm font-bold text-slate-200 transition hover:bg-slate-800/60 hover:border-blue-300/30"
          >
            초기화
          </button>

          <button
            type="button"
            onClick={onSubmit}
            className="rounded-2xl bg-gradient-to-r from-blue-500 to-violet-500 px-7 py-3 text-sm font-black text-white shadow-lg shadow-blue-500/20 transition hover:from-blue-400 hover:to-violet-400"
          >
            {loadingSubmit ? '제출 중...' : '그림 제출'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ToolButton({
  label,
  active = false,
  onClick,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
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