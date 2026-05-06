'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import type { DrawingCanvasHandle } from '@/components/DrawingCanvas';
import { DrawingCanvas } from '@/components/DrawingCanvas';
import PlayerChatBubble from '@/components/PlayerChatBubble';
import { useRoomStomp, type RoomStompDestination } from '@/hooks/useRoomStomp';
import { apiFetch, getHttpStatus } from '@/lib/api-client';
import { clearAuthSession, isUnauthorizedStatus } from '@/lib/auth-session';

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
  submitted: boolean;
};

/** Spring/Jackson이 boolean getter `isHost()`를 JSON 키 `host`로보냅니다. */
type CurrentRoundParticipantJson = CurrentRoundParticipant & {
  host?: boolean;
  winner?: boolean;
  submitted?: boolean;
  isSubmitted?: boolean;
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

type RoundStartData = {
  roomId: number;
  roundId: number;
  roundNumber: number;
  keyword: string;
  status: 'READY' | 'IN_PROGRESS' | 'FINISHED';
  startedAt: string;
};

/** STOMP 본문의 숫자 필드가 문자열로 올 때(Jackson 설정 등) 흡수 */
function parseStompNumeric(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && /^\d+$/.test(v)) return Number(v);
  return NaN;
}

/** `/sub/rooms/{id}` 로 오는 `RoundStartResponse` 형태를 `RoundStartData`로 변환 */
function parseStompRoundStartPayload(o: Record<string, unknown>, fallbackRoomId: number): RoundStartData | null {
  const kw = o.keyword;
  if (typeof kw !== 'string' || !kw.trim()) return null;
  const roundId = parseStompNumeric(o.roundId);
  const roundNumber = parseStompNumeric(o.roundNumber);
  if (!Number.isFinite(roundId) || roundId <= 0 || !Number.isFinite(roundNumber) || roundNumber <= 0) {
    return null;
  }
  let status: RoundStartData['status'] = 'IN_PROGRESS';
  const raw = o.status;
  if (raw === 'READY' || raw === 'IN_PROGRESS' || raw === 'FINISHED') {
    status = raw;
  } else if (raw && typeof raw === 'object' && 'name' in (raw as object)) {
    const n = (raw as { name?: unknown }).name;
    if (n === 'READY' || n === 'IN_PROGRESS' || n === 'FINISHED') status = n;
  }
  const rid = parseStompNumeric(o.roomId);
  const roomId = Number.isFinite(rid) && rid > 0 ? rid : fallbackRoomId;
  let startedAt = '';
  if (typeof o.startedAt === 'string') startedAt = o.startedAt;
  else if (o.startedAt != null) startedAt = JSON.stringify(o.startedAt);

  return {
    roomId,
    roundId,
    roundNumber,
    keyword: kw.trim(),
    status,
    startedAt,
  };
}

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

/** GET /api/rounds/{roundId}/submissions — 종료 라운드 점수판·그림 */
type RoundSubmissionItem = {
  participantId: number;
  nickname: string;
  imageData: string;
  aiAnswer: string;
  score: number;
  winner: boolean;
};

type RoundEndScoreboardState = {
  closedRoundId: number;
  keyword: string;
  roundNumber: number;
  gameFinished: boolean;
  items: RoundSubmissionItem[];
  loading: boolean;
  fetchError?: string;
};

function normalizeRoundSubmissionItem(raw: unknown): RoundSubmissionItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const participantId = Number(o.participantId);
  if (!Number.isFinite(participantId)) return null;
  return {
    participantId,
    nickname: String(o.nickname ?? ''),
    imageData: String(o.imageData ?? ''),
    aiAnswer: String(o.aiAnswer ?? ''),
    score: Number(o.score ?? 0),
    winner: Boolean(o.winner),
  };
}

/** GET /api/rooms/{roomId}/ranking */
type FinalRankingRow = {
  userId: number;
  nickname: string;
  roundWinCount: number;
  isWinner: boolean;
};

type FinalRankingBoardState = {
  loading: boolean;
  rows: FinalRankingRow[];
  fetchError?: string;
};

function normalizeRankingRow(raw: unknown): FinalRankingRow | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const userId = Number(o.userId);
  if (!Number.isFinite(userId)) return null;
  return {
    userId,
    nickname: String(o.nickname ?? ''),
    roundWinCount: Number(o.roundWinCount ?? 0),
    isWinner: Boolean(o.isWinner ?? o.winner),
  };
}

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

function normalizeRoundParticipant(p: CurrentRoundParticipantJson): CurrentRoundParticipant {
  return {
    participantId: p.participantId,
    roundWinCount: p.roundWinCount,
    isHost: Boolean(p.isHost ?? p.host),
    isWinner: Boolean(p.isWinner ?? p.winner),
    submitted: Boolean(p.submitted ?? p.isSubmitted),
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
    submitted: rp.submitted,
    roundWinCount: rp.roundWinCount,
  }));
}

/** 같은 참가자 id면 이전 UI 상태(제출/말풍선)를 유지하고, 새 맵 값도 반영 */
function mergePlayersKeepSubmitted(prev: Player[], mapped: Player[]): Player[] {
  const prevById = new Map(prev.map((p) => [p.id, p]));
  const submittedById = new Map(prev.map((p) => [p.id, p.submitted]));
  return mapped.map((p) => ({
    ...p,
    submitted: Boolean(submittedById.get(p.id)) || Boolean(p.submitted),
    bubble: prevById.get(p.id)?.bubble,
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

/** 라운드 종료 직후 결과를 볼 시간을 준 뒤 다음 라운드(또는 로비)로 동기화 */
const ROUND_ADVANCE_SYNC_DELAY_MS = 10_000;

export default function RoomDetailPage() {
  const params = useParams<{ roomId: string }>();
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;
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
  const [leavingRoom, setLeavingRoom] = useState(false);
  const [error, setError] = useState('');
  const [stompChatLine, setStompChatLine] = useState<string | null>(null);
  const [roundEndScoreboard, setRoundEndScoreboard] = useState<RoundEndScoreboardState | null>(null);
  const [finalRankingBoard, setFinalRankingBoard] = useState<FinalRankingBoardState | null>(null);

  const roundAdvanceSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const roundAdvanceCountdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const roundAdvanceEndsAtRef = useRef<number | null>(null);
  /** 개발 모드 Strict Mode에서 effect가 두 번 돌며 join이 동시에 두 번 나가면 백엔드에서 500이 날 수 있음 — 최신 진입만 유효 */
  const roomEnterSeqRef = useRef(0);
  const [roundAdvanceCountdownSec, setRoundAdvanceCountdownSec] = useState<number | null>(null);
  const stompChatClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearStompChatLineAndTimer = useCallback(() => {
    if (stompChatClearTimerRef.current) {
      clearTimeout(stompChatClearTimerRef.current);
      stompChatClearTimerRef.current = null;
    }
    setStompChatLine(null);
  }, []);

  const showTransientStompChat = useCallback((line: string) => {
    setStompChatLine(line);
    if (stompChatClearTimerRef.current) {
      clearTimeout(stompChatClearTimerRef.current);
    }
    stompChatClearTimerRef.current = setTimeout(() => {
      stompChatClearTimerRef.current = null;
      setStompChatLine(null);
    }, 8000);
  }, []);

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
            const persisted = loadPersistedRoundUi(roomIdNumber);
            if (persisted?.roundId === data.roundId && persisted.submitInfo) {
              return persisted.submitInfo;
            }
            if (prev && prev.roundId === data.roundId) {
              return prev;
            }
            return null;
          });
          const myUid = getJwtUserId(localStorage.getItem('accessToken'));
          const mine = myUid != null ? finalized.find((pl) => pl.userId === myUid) : undefined;
          setParticipantId(String(mine?.id ?? finalized[0]?.id ?? ''));
        } catch (inner) {
          const st = getHttpStatus(inner);
          if (st === 403 || st === 404) {
            routerRef.current.replace('/rooms');
            return;
          }
          setPlayers((prev) =>
            mergePlayersKeepSubmitted(
              prev,
              latest.participants.map((p) => ({
                id: p.userId,
                userId: p.userId,
                nickname: p.nickname,
                isHost: p.isHost,
                submitted: false,
                roundWinCount: 0,
              })),
            ),
          );
          // 서버 반영 직후 current-round 조회가 잠깐 지연될 수 있어 한 번 더 동기화
          window.setTimeout(() => {
            void refreshRoomParticipants();
          }, 220);
        }
      } else {
        clearStompChatLineAndTimer();
        setRoundInfo(null);
        setSubmitInfo(null);
        clearPersistedRoundUi(roomIdNumber);
        setPlayers((prev) =>
          mergePlayersKeepSubmitted(
            prev,
            latest.participants.map((p) => ({
              id: p.userId,
              userId: p.userId,
              nickname: p.nickname,
              isHost: p.isHost,
              submitted: false,
              roundWinCount: 0,
            })),
          ),
        );
        setParticipantId('');
      }
    } catch (e) {
      const st = getHttpStatus(e);
      if (st === 404) {
        routerRef.current.replace('/rooms');
        return;
      }
      /* 그 외 STOMP 동기화 실패는 조용히 무시 */
    }
  }, [roomIdNumber, clearStompChatLineAndTimer]);

  const scheduleRoundAdvanceSync = useCallback(() => {
    if (roundAdvanceSyncTimerRef.current) {
      clearTimeout(roundAdvanceSyncTimerRef.current);
    }
    if (roundAdvanceCountdownIntervalRef.current) {
      clearInterval(roundAdvanceCountdownIntervalRef.current);
      roundAdvanceCountdownIntervalRef.current = null;
    }

    const endsAt = Date.now() + ROUND_ADVANCE_SYNC_DELAY_MS;
    roundAdvanceEndsAtRef.current = endsAt;
    setRoundAdvanceCountdownSec(Math.max(1, Math.ceil(ROUND_ADVANCE_SYNC_DELAY_MS / 1000)));

    const tick = () => {
      const end = roundAdvanceEndsAtRef.current;
      if (end == null) return;
      const left = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      setRoundAdvanceCountdownSec(left > 0 ? left : null);
    };
    tick();
    roundAdvanceCountdownIntervalRef.current = setInterval(tick, 250);

    roundAdvanceSyncTimerRef.current = setTimeout(() => {
      roundAdvanceSyncTimerRef.current = null;
      if (roundAdvanceCountdownIntervalRef.current) {
        clearInterval(roundAdvanceCountdownIntervalRef.current);
        roundAdvanceCountdownIntervalRef.current = null;
      }
      roundAdvanceEndsAtRef.current = null;
      setRoundAdvanceCountdownSec(null);
      void refreshRoomParticipants();
    }, ROUND_ADVANCE_SYNC_DELAY_MS);
  }, [refreshRoomParticipants]);

  useEffect(() => {
    return () => {
      if (roundAdvanceSyncTimerRef.current) {
        clearTimeout(roundAdvanceSyncTimerRef.current);
        roundAdvanceSyncTimerRef.current = null;
      }
      if (roundAdvanceCountdownIntervalRef.current) {
        clearInterval(roundAdvanceCountdownIntervalRef.current);
        roundAdvanceCountdownIntervalRef.current = null;
      }
      roundAdvanceEndsAtRef.current = null;
      if (stompChatClearTimerRef.current) {
        clearTimeout(stompChatClearTimerRef.current);
        stompChatClearTimerRef.current = null;
      }
    };
  }, []);

  /** 라운드 종료 후 제출 목록 API로 점수판·그림 갤러리 */
  useEffect(() => {
    if (!submitInfo?.roundFinished || submitInfo.roundWinnerParticipantId == null) return;
    const rid = submitInfo.roundId;
    if (!Number.isFinite(rid) || rid <= 0) return;

    const keyword = roundInfo?.keyword ?? '—';
    const roundNumber = roundInfo?.roundNumber ?? 0;
    const gameFinished = Boolean(submitInfo.gameFinished);

    setRoundEndScoreboard({
      closedRoundId: rid,
      keyword,
      roundNumber,
      gameFinished,
      items: [],
      loading: true,
    });

    let cancelled = false;

    async function fetchSubmissions(): Promise<RoundSubmissionItem[]> {
      const delays = [180, 320, 500, 700];
      for (let i = 0; i < delays.length; i++) {
        await new Promise((r) => setTimeout(r, delays[i]!));
        if (cancelled) return [];
        try {
          const list = await apiFetch<unknown[]>(`/api/rounds/${rid}/submissions`, { method: 'GET' });
          return (Array.isArray(list) ? list : [])
            .map(normalizeRoundSubmissionItem)
            .filter((x): x is RoundSubmissionItem => x != null);
        } catch {
          /* 다음 재시도 — 트랜잭션 커밋 전 403 등 */
        }
      }
      throw new Error('제출 목록을 불러오지 못했습니다.');
    }

    void (async () => {
      try {
        const items = await fetchSubmissions();
        if (cancelled) return;
        setRoundEndScoreboard((prev) =>
          prev && prev.closedRoundId === rid ? { ...prev, items, loading: false, fetchError: undefined } : prev,
        );
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : '제출 목록을 불러오지 못했습니다.';
        setRoundEndScoreboard((prev) =>
          prev && prev.closedRoundId === rid ? { ...prev, items: [], loading: false, fetchError: msg } : prev,
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    submitInfo?.roundFinished,
    submitInfo?.roundWinnerParticipantId,
    submitInfo?.roundId,
    submitInfo?.gameFinished,
    roundInfo?.keyword,
    roundInfo?.roundNumber,
  ]);

  /** 다음 라운드로 동기화되면 점수판 닫기 */
  useEffect(() => {
    if (!roundEndScoreboard) return;
    const cur = roundInfo?.roundId;
    if (cur != null && cur !== roundEndScoreboard.closedRoundId) {
      setRoundEndScoreboard(null);
    }
  }, [roundInfo?.roundId, roundEndScoreboard]);

  const onStompPayload = useCallback(
    (dest: RoomStompDestination, body: unknown) => {
      if (dest === 'chat') {
        const c = body as ChatMessageDtoWs;
        if (c?.message) {
          const sender = c.sender?.trim() || '';
          const isNotice = c.type === 'NOTICE' || sender === 'System' || !sender;
          if (!isNotice) {
            setPlayers((prev) =>
              prev.map((p) => (p.nickname === sender ? { ...p, bubble: c.message } : p)),
            );
          }
          showTransientStompChat(
            `${c.sender === 'System' ? '알림' : (c.sender ?? '알림')}: ${c.message}`,
          );
        }
        return;
      }
      if (!body || typeof body !== 'object') return;
      const o = body as Record<string, unknown>;
      const evt = o.type;
      if (evt === 'PLAYER_SUBMITTED') {
        const submittedPid = Number(o.participantId);
        const submittedCount = Number(o.submittedCount);
        const totalParticipantCount = Number(o.totalParticipantCount);
        const roundId =
          typeof o.roundId === 'number'
            ? o.roundId
            : roundInfo && 'roundId' in roundInfo
              ? roundInfo.roundId
              : 0;

        if (Number.isFinite(submittedPid) && submittedPid > 0) {
          setPlayers((prev) =>
            prev.map((p) => (Number(p.id) === submittedPid ? { ...p, submitted: true } : p)),
          );
        }

        if (Number.isFinite(submittedCount) && Number.isFinite(totalParticipantCount) && roundId > 0) {
          setSubmitInfo((prev) => ({
            roundId,
            submittedAiAnswer: prev?.submittedAiAnswer ?? '',
            submittedScore: prev?.submittedScore ?? 0,
            submittedCount,
            totalParticipantCount,
            roundFinished: submittedCount >= totalParticipantCount,
            gameFinished: prev?.gameFinished ?? false,
            tieBreakerStarted: prev?.tieBreakerStarted ?? false,
            roundWinnerParticipantId: prev?.roundWinnerParticipantId,
            roundWinnerAiAnswer: prev?.roundWinnerAiAnswer,
            roundWinnerScore: prev?.roundWinnerScore,
            nextRoundId: prev?.nextRoundId,
            nextRoundNumber: prev?.nextRoundNumber,
          }));
        }
        return;
      }
      if (typeof evt === 'string' && ['USER_ENTER', 'USER_LEAVE', 'HOST_CHANGED'].includes(evt)) {
        if (evt === 'USER_LEAVE') {
          const leaverId = o.leaverId != null ? Number(o.leaverId) : NaN;
          const myId = getJwtUserId(typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null);
          if (Number.isFinite(leaverId) && myId != null && leaverId === myId) {
            routerRef.current.replace('/rooms');
            return;
          }
        }
        void refreshRoomParticipants();
        return;
      }
      const rs = parseStompRoundStartPayload(o, roomIdNumber);
      if (rs) {
        clearPersistedRoundUi(roomIdNumber);
        setRoundInfo(rs);
        setSubmitInfo(null);
        clearStompChatLineAndTimer();
        void refreshRoomParticipants();
        return;
      }
      if (typeof o.submittedCount === 'number' && typeof o.totalParticipantCount === 'number') {
        const data = normalizeWsSubmitDrawing(o);
        setSubmitInfo(data);
        if (data.roundFinished) {
          setPlayers((prev) => prev.map((p) => ({ ...p, submitted: true })));
        }
        // 라운드 종료 STOMP 후 잠시 점수 문구를 보여 주고 다음 라운드/로비로 동기화
        scheduleRoundAdvanceSync();
      }
    },
    [
      refreshRoomParticipants,
      roomIdNumber,
      roundInfo,
      scheduleRoundAdvanceSync,
      showTransientStompChat,
      clearStompChatLineAndTimer,
    ],
  );

  const stompToken = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
  const { connected: chatConnected, publishChat } = useRoomStomp(
    roomIdNumber,
    Boolean(roomIdNumber && stompToken),
    stompToken,
    onStompPayload,
  );

  // STOMP 메시지를 순간적으로 놓친 탭(시크릿/백그라운드)도 주기적으로 현재 상태를 따라잡는다.
  useEffect(() => {
    if (!roomIdNumber) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      if (roundInfo?.status === 'IN_PROGRESS') return;
      void refreshRoomParticipants();
    }, 1200);

    return () => {
      window.clearInterval(timer);
    };
  }, [roomIdNumber, roundInfo?.status, refreshRoomParticipants]);

  useEffect(() => {
    if (!roomIdNumber) return;
    const enterSeq = ++roomEnterSeqRef.current;
    let cancelled = false;

    setRoundEndScoreboard(null);
    if (roundAdvanceSyncTimerRef.current) {
      clearTimeout(roundAdvanceSyncTimerRef.current);
      roundAdvanceSyncTimerRef.current = null;
    }
    if (roundAdvanceCountdownIntervalRef.current) {
      clearInterval(roundAdvanceCountdownIntervalRef.current);
      roundAdvanceCountdownIntervalRef.current = null;
    }
    roundAdvanceEndsAtRef.current = null;
    setRoundAdvanceCountdownSec(null);
    setFinalRankingBoard(null);
    clearStompChatLineAndTimer();

    const isStale = () => cancelled || enterSeq !== roomEnterSeqRef.current;

    // 방에 입장(참가자로 등록)
    void (async () => {
      setError('');
      try {
        // 1) 먼저 방 상세를 가져와서, 이미 내가 참여자인지 확인
        //    (방 생성 시 호스트는 백엔드가 이미 Participant로 넣어주기 때문에 join을 또 호출하면 중복이 생길 수 있음)
        const roomDetail = await apiFetch<RoomDetailData>(`/api/rooms/${roomIdNumber}`);
        if (isStale()) return;

        const myUserId = getJwtUserId(localStorage.getItem('accessToken'));
        const alreadyJoined = myUserId != null && roomDetail.participants.some((p) => p.userId === myUserId);

        if (!alreadyJoined && roomIsPlaying(roomDetail)) {
          setError('이미 게임이 시작된 방입니다. 로비에서 대기 중인 방을 선택해 주세요.');
          return;
        }

        // 2) 아직 참여자가 아니라면 join 호출
        if (!alreadyJoined) {
          try {
            await apiFetch<unknown>(`/api/rooms/${roomIdNumber}/join`, {
              method: 'POST',
              body: JSON.stringify({}),
            });
          } catch (joinErr) {
            const st = getHttpStatus(joinErr);
            if (isUnauthorizedStatus(st)) {
              clearAuthSession();
              throw joinErr;
            }
            const jm = joinErr instanceof Error ? joinErr.message : '';
            if (!jm.includes('이미 방에 참여') && !jm.includes('400-6')) {
              throw joinErr;
            }
          }
        }
        if (isStale()) return;

        // 3) 최신 방 상세 — 게임 중이면 현재 라운드까지 불러와 HUD·제출 표시 복원
        const latest = await apiFetch<RoomDetailData>(`/api/rooms/${roomIdNumber}`);
        if (isStale()) return;

        if (roomIsPlaying(latest)) {
          try {
            const dataRaw = await apiFetch<CurrentRoundDataJson>(`/api/rooms/${roomIdNumber}/rounds/current`);
            if (isStale()) return;

            const data = normalizeCurrentRoundData(dataRaw);
            setRoundInfo(data);
            const mappedPlayers = buildPlayersFromRoundAndRoom(dataRaw.participants, latest.participants);
            const finalized = finalizePlayersForRound(roomIdNumber, data.roundId, mappedPlayers);
            setPlayers((prev) => mergePlayersKeepSubmitted(prev, finalized));
            const persisted = loadPersistedRoundUi(roomIdNumber);
            if (persisted?.roundId === data.roundId && persisted.submitInfo) {
              setSubmitInfo(persisted.submitInfo);
            }
            const myUid = getJwtUserId(localStorage.getItem('accessToken'));
            const mine = myUid != null ? finalized.find((pl) => pl.userId === myUid) : undefined;
            setParticipantId(String(mine?.id ?? finalized[0]?.id ?? ''));
          } catch {
            if (isStale()) return;

            setRoundInfo(null);
            setSubmitInfo(null);
            setPlayers((prev) =>
              mergePlayersKeepSubmitted(
                prev,
                latest.participants.map((p) => ({
                  id: p.userId,
                  userId: p.userId,
                  nickname: p.nickname,
                  isHost: p.isHost,
                  submitted: false,
                  roundWinCount: 0,
                })),
              ),
            );
            setParticipantId('');
          }
        } else {
          if (isStale()) return;

          clearStompChatLineAndTimer();
          setRoundInfo(null);
          setSubmitInfo(null);
          clearPersistedRoundUi(roomIdNumber);
          setPlayers((prev) =>
            mergePlayersKeepSubmitted(
              prev,
              latest.participants.map((p) => ({
                id: p.userId,
                userId: p.userId,
                nickname: p.nickname,
                isHost: p.isHost,
                submitted: false,
                roundWinCount: 0,
              })),
            ),
          );
          setParticipantId('');
        }
      } catch (e) {
        if (isStale()) return;

        setError(e instanceof Error ? e.message : '방 입장에 실패했습니다.');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [roomIdNumber, clearStompChatLineAndTimer, refreshRoomParticipants]);

  const keyword = roundInfo?.keyword?.trim() ?? '';
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

  async function handleLeaveRoom() {
    if (!roomIdNumber) return;
    if (!window.confirm('이 방에서 나가시겠습니까?')) return;
    setError('');
    setLeavingRoom(true);
    try {
      await apiFetch<null>(`/api/rooms/${roomIdNumber}/leave`, { method: 'DELETE' });
      clearStompChatLineAndTimer();
      router.replace('/rooms');
      return;
    } catch (e) {
      const st = getHttpStatus(e);
      if (isUnauthorizedStatus(st)) {
        clearAuthSession();
        setError('로그인이 만료되었습니다. 다시 로그인해 주세요.');
        return;
      }
      if (st === 404) {
        clearStompChatLineAndTimer();
        router.replace('/rooms');
        return;
      }
      setError(e instanceof Error ? e.message : '방을 나가지 못했습니다.');
    } finally {
      setLeavingRoom(false);
    }
  }

  async function handleStartGame() {
    if (!roomIdNumber) return;
    setError('');
    clearStompChatLineAndTimer();
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
      setPlayers((prev) => mergePlayersKeepSubmitted(prev, finalizedStart));
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
      if (data.roundFinished) {
        scheduleRoundAdvanceSync();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '그림 제출에 실패했습니다.');
    } finally {
      setLoadingSubmit(false);
    }
  }

  function handleSendChat(message: string) {
    const trimmed = message.trim();
    if (!trimmed) return;
    const ok = publishChat(trimmed);
    if (!ok) {
      setError('채팅 서버 연결이 불안정합니다. 잠시 후 다시 시도해 주세요.');
    }
  }

  return (
    <main className="relative min-h-[calc(100vh-4rem)] overflow-hidden text-white">
      {roundEndScoreboard ? (
        <RoundEndScoreboardOverlay
          board={roundEndScoreboard}
          advanceCountdownSec={roundAdvanceCountdownSec}
          winnerFallbackNickname={
            players.find((p) => p.id === submitInfo?.roundWinnerParticipantId)?.nickname ?? null
          }
          onClose={({ gameFinished }) => {
            setRoundEndScoreboard(null);
            if (gameFinished && roomIdNumber) {
              setFinalRankingBoard({ loading: true, rows: [] });
              void (async () => {
                try {
                  const list = await apiFetch<unknown[]>(`/api/rooms/${roomIdNumber}/ranking`, {
                    method: 'GET',
                  });
                  const rows = (Array.isArray(list) ? list : [])
                    .map(normalizeRankingRow)
                    .filter((x): x is FinalRankingRow => x != null);
                  setFinalRankingBoard({ loading: false, rows });
                } catch (e) {
                  const msg = e instanceof Error ? e.message : '랭킹을 불러오지 못했습니다.';
                  setFinalRankingBoard({ loading: false, rows: [], fetchError: msg });
                }
              })();
            }
          }}
        />
      ) : null}
      {finalRankingBoard ? (
        <FinalRankingOverlay board={finalRankingBoard} onClose={() => setFinalRankingBoard(null)} />
      ) : null}
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
          onLeaveRoom={handleLeaveRoom}
          leavingRoom={leavingRoom}
        />

        {roundAdvanceCountdownSec != null && roundAdvanceCountdownSec > 0 ? (
          <div
            className="mt-3 flex items-center justify-center gap-2 rounded-2xl border border-cyan-400/25 bg-cyan-500/10 px-4 py-3 text-center shadow-lg backdrop-blur sm:mt-4"
            role="status"
            aria-live="polite"
          >
            <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-300" />
            <p className="text-sm font-semibold text-cyan-100 sm:text-base">
              다음 라운드(또는 로비)로 넘어가기까지{' '}
              <span className="font-black tabular-nums text-white">{roundAdvanceCountdownSec}</span>초
            </p>
          </div>
        ) : null}

        <section className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,200px)_minmax(0,1fr)_minmax(0,200px)] xl:gap-5">
          <PlayerColumn players={leftPlayers} />
          <GameBoard
            keyword={keyword}
            activeRoundId={roundInfo?.roundId ?? null}
            feedbackLine={feedbackLine}
            instructionLine={instructionLine}
            stompChatLine={stompChatLine}
            chatConnected={chatConnected}
            onSendChat={handleSendChat}
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

function RoundEndScoreboardOverlay({
  board,
  advanceCountdownSec,
  winnerFallbackNickname,
  onClose,
}: {
  board: RoundEndScoreboardState;
  advanceCountdownSec: number | null;
  winnerFallbackNickname: string | null;
  onClose: (opts: { gameFinished: boolean }) => void;
}) {
  const winnerName =
    board.items.find((x) => x.winner)?.nickname ?? winnerFallbackNickname ?? '라운드 우승';

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="round-scoreboard-title"
    >
      <div className="max-h-[min(92vh,880px)] w-full max-w-4xl overflow-y-auto rounded-[1.75rem] border border-white/15 bg-slate-900/95 p-5 shadow-2xl sm:p-8">
        <div className="mb-6 text-center">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-300/90">라운드 결과</p>
          <h2 id="round-scoreboard-title" className="mt-2 text-2xl font-black text-white sm:text-3xl">
            라운드 {board.roundNumber}
            <span className="mx-2 text-slate-500">·</span>
            <span className="bg-gradient-to-r from-cyan-200 to-violet-200 bg-clip-text text-transparent">
              {board.keyword}
            </span>
          </h2>
          <p className="mt-4 text-lg font-bold text-amber-200">
            우승 <span className="text-white">{winnerName}</span> 님
          </p>
          {board.gameFinished ? (
            <p className="mt-2 text-sm text-slate-400">게임이 종료되었습니다. 방 랭킹에서 전체 순위를 확인할 수 있습니다.</p>
          ) : null}
          {advanceCountdownSec != null && advanceCountdownSec > 0 ? (
            <p className="mt-3 text-sm font-semibold text-cyan-200">
              화면 전환까지{' '}
              <span className="font-black tabular-nums text-white">{advanceCountdownSec}</span>초
            </p>
          ) : null}
        </div>

        {board.loading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-400">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-blue-400" />
            <p className="text-sm font-medium">제출 그림·점수를 불러오는 중…</p>
          </div>
        ) : board.fetchError ? (
          <p className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-6 text-center text-sm text-rose-200">
            {board.fetchError}
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {board.items.map((item) => (
              <div
                key={item.participantId}
                className={`overflow-hidden rounded-2xl border bg-slate-950/60 shadow-lg ${
                  item.winner
                    ? 'border-amber-400/50 ring-2 ring-amber-400/25'
                    : 'border-white/10'
                }`}
              >
                <div className="flex items-center justify-between border-b border-white/10 px-3 py-2 sm:px-4">
                  <span className="font-bold text-white">{item.nickname}</span>
                  <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-black text-cyan-200">
                    {(item.score * 100).toFixed(0)}점
                  </span>
                </div>
                <div className="relative aspect-square w-full bg-white">
                  {item.imageData ? (
                    <img
                      src={item.imageData}
                      alt={`${item.nickname} 제출`}
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-slate-500">이미지 없음</div>
                  )}
                </div>
                <p className="px-3 py-2 text-xs leading-relaxed text-slate-400 sm:px-4">
                  AI: <span className="font-semibold text-slate-200">{item.aiAnswer}</span>
                </p>
                {item.winner ? (
                  <p className="px-3 pb-3 text-center text-xs font-black uppercase tracking-wider text-amber-300 sm:px-4">
                    ROUND WINNER
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        )}

        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => onClose({ gameFinished: board.gameFinished })}
            className="rounded-2xl bg-gradient-to-r from-blue-500 to-violet-500 px-8 py-3 text-sm font-black text-white shadow-lg transition hover:from-blue-400 hover:to-violet-400"
          >
            {board.gameFinished ? '닫고 최종 순위 보기' : '닫기'}
          </button>
        </div>
      </div>
    </div>
  );
}

function FinalRankingOverlay({
  board,
  onClose,
}: {
  board: FinalRankingBoardState;
  onClose: () => void;
}) {
  /** API의 isWinner가 둘 다 true로 올 수 있어, 화면은 라운드 승수 최댓값으로만 공동 우승 판별 */
  const maxRoundWins = board.rows.reduce((m, r) => Math.max(m, r.roundWinCount), 0);
  const podium = board.rows.filter((r) => r.roundWinCount === maxRoundWins && maxRoundWins > 0);
  const headline =
    maxRoundWins === 0
      ? '—'
      : podium.length === 1
        ? `${podium[0]!.nickname} 님`
        : `${podium.map((w) => w.nickname).join(' · ')} (공동 우승)`;

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="final-ranking-title"
    >
      <div className="w-full max-w-lg overflow-hidden rounded-[1.75rem] border border-amber-400/20 bg-slate-900/95 shadow-2xl ring-1 ring-amber-400/10 sm:max-w-xl">
        <div className="border-b border-white/10 bg-gradient-to-r from-amber-500/20 via-violet-500/15 to-cyan-500/15 px-6 py-6 text-center">
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-amber-200/90">게임 종료</p>
          <h2 id="final-ranking-title" className="mt-2 text-2xl font-black text-white sm:text-3xl">
            최종 우승
          </h2>
          <p className="mt-3 text-lg font-bold text-white">
            <span className="bg-gradient-to-r from-amber-200 to-yellow-100 bg-clip-text text-transparent">{headline}</span>
          </p>
        </div>

        <div className="max-h-[min(52vh,420px)] overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
          {board.loading ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-slate-400">
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-amber-400" />
              <p className="text-sm font-medium">최종 순위를 불러오는 중…</p>
            </div>
          ) : board.fetchError ? (
            <p className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-6 text-center text-sm text-rose-200">
              {board.fetchError}
            </p>
          ) : board.rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">표시할 순위가 없습니다.</p>
          ) : (
            <ol className="space-y-2">
              {board.rows.map((row, index) => {
                const rank = index + 1;
                const medal =
                  rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}`;
                const isChampion =
                  maxRoundWins > 0 && row.roundWinCount === maxRoundWins;
                return (
                  <li
                    key={row.userId}
                    className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3.5 ${
                      isChampion
                        ? 'border-amber-400/40 bg-amber-500/10 ring-1 ring-amber-400/20'
                        : 'border-white/10 bg-slate-950/50'
                    }`}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <span className="w-8 shrink-0 text-center text-lg">{medal}</span>
                      <div className="min-w-0">
                        <p className="truncate font-bold text-white">{row.nickname}</p>
                        <p className="text-xs text-slate-500">라운드 {row.roundWinCount}승</p>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      {isChampion ? (
                        <span className="rounded-full border border-amber-400/40 bg-amber-500/15 px-2.5 py-1 text-xs font-black text-amber-200">
                          우승
                        </span>
                      ) : (
                        <span className="text-sm font-semibold text-slate-400">{row.roundWinCount}승</span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        <div className="border-t border-white/10 px-4 py-4 sm:px-6">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 py-3 text-sm font-black text-slate-950 shadow-lg transition hover:from-amber-400 hover:to-orange-400"
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
}

function TopHud({
  roomId,
  roundLabel,
  statusLabel,
  submitLabel,
  onStartGame,
  loadingStart,
  onLeaveRoom,
  leavingRoom,
}: {
  roomId: string;
  roundLabel: string;
  statusLabel: string;
  submitLabel: string;
  onStartGame: () => void;
  loadingStart: boolean;
  onLeaveRoom: () => void | Promise<void>;
  leavingRoom: boolean;
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
            onClick={() => void onLeaveRoom()}
            disabled={leavingRoom || loadingStart}
            className="rounded-2xl border border-white/20 bg-white/5 px-5 py-3 text-sm font-bold text-slate-200 transition hover:border-rose-400/40 hover:bg-rose-500/10 hover:text-rose-100 disabled:opacity-50"
          >
            {leavingRoom ? '나가는 중...' : '방 나가기'}
          </button>
          <button
            type="button"
            onClick={onStartGame}
            disabled={loadingStart || leavingRoom}
            className="rounded-2xl bg-gradient-to-r from-blue-500 to-violet-500 px-5 py-3 text-sm font-black text-white shadow-lg shadow-blue-500/20 transition hover:from-blue-400 hover:to-violet-400 disabled:opacity-50"
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
  activeRoundId,
  feedbackLine,
  instructionLine,
  stompChatLine,
  chatConnected,
  onSendChat,
  setError,
  onSubmitDrawing,
  loadingSubmit,
}: {
  keyword: string;
  /** 라운드가 바뀌면 캔버스를 비움 (다음 라운드·로비 전환) */
  activeRoundId: number | null;
  feedbackLine: string | null;
  instructionLine: string;
  stompChatLine: string | null;
  chatConnected: boolean;
  onSendChat: (message: string) => void;
  setError: (msg: string) => void;
  onSubmitDrawing: (imageData: string) => void | Promise<void>;
  loadingSubmit: boolean;
}) {
  const canvasRef = useRef<DrawingCanvasHandle>(null);
  const [tool, setTool] = useState<DrawTool>('black');
  const [lineWidth, setLineWidth] = useState(8);
  const [chatInput, setChatInput] = useState('');
  const strokeColor = tool === 'eraser' ? '#ffffff' : STROKE[tool];
  const isEraser = tool === 'eraser';

  useEffect(() => {
    canvasRef.current?.clear();
  }, [activeRoundId]);

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

  function handleSendChatClick() {
    const text = chatInput.trim();
    if (!text) return;
    onSendChat(text);
    setChatInput('');
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 shadow-2xl backdrop-blur sm:rounded-[2rem] sm:p-5">
      <div className="flex flex-col gap-2.5 rounded-xl border border-white/10 bg-slate-900/70 p-4 sm:gap-3 sm:rounded-[1.5rem] sm:p-5">
        <div className="flex flex-col gap-2 sm:gap-3">
          {keyword ? (
            <div className="flex justify-center">
              <div className="rounded-xl border border-blue-400/30 bg-blue-500/10 px-4 py-2.5 text-center sm:rounded-2xl sm:px-5 sm:py-3">
                <p className="text-[10px] font-black uppercase tracking-[0.28em] text-blue-200 sm:text-[11px] sm:tracking-[0.3em]">
                  제시어
                </p>
                <p className="mt-0.5 text-2xl font-black tracking-tight text-white sm:mt-1 sm:text-3xl">{keyword}</p>
              </div>
            </div>
          ) : null}

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
        <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/60 p-3">
          <span className={`text-xs font-semibold ${chatConnected ? 'text-emerald-300' : 'text-slate-400'}`}>
            {chatConnected ? '채팅 연결됨' : '채팅 연결 중...'}
          </span>
          <input
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSendChatClick();
              }
            }}
            maxLength={200}
            placeholder="메시지를 보내면 프로필 옆 말풍선으로 잠깐 표시됩니다"
            className="min-w-0 flex-1 rounded-lg border border-white/10 bg-slate-900/70 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500"
          />
          <button
            type="button"
            onClick={handleSendChatClick}
            disabled={!chatConnected || !chatInput.trim()}
            className="rounded-lg bg-gradient-to-r from-blue-500 to-violet-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
          >
            전송
          </button>
        </div>
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