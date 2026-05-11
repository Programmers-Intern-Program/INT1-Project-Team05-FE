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
  /** 백엔드 RoomInfoRes.ParticipantDto 의 isAi (Jackson 에 따라 ai 로 올 수 있음) */
  isAi: boolean;
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
  isAi?: boolean;
  ai?: boolean;
};

type RoomDetailData = {
  roomId: number;
  curPlayers: number;
  maxPlayers: number;
  /** 방 생성 시 설정한 총 라운드 수 (일반 라운드 기준) */
  totalRounds?: number;
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
  /** 백엔드 RoundStartResponse.timeLimit(초) — 없으면 FALLBACK_ROUND_TIME_LIMIT_SEC */
  timeLimit?: number;
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

  const tl = parseStompNumeric(o.timeLimit);
  const timeLimitNum = Number.isFinite(tl) && tl > 0 ? tl : undefined;

  return {
    roomId,
    roundId,
    roundNumber,
    keyword: kw.trim(),
    status,
    startedAt,
    ...(timeLimitNum != null ? { timeLimit: timeLimitNum } : {}),
  };
}

type CurrentRoundData = {
  roomId: number;
  roundId: number;
  roundNumber: number;
  keyword: string;
  status: 'READY' | 'IN_PROGRESS' | 'FINISHED';
  isTiebreaker: boolean;
  /** ISO 등 서버 시작 시각 — 있으면 탭 간 남은 시간 동기화 */
  startedAt?: string;
  /** 백엔드 현재 라운드 timeLimit(초) */
  timeLimit?: number;
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

/** 제출·라운드 종료 API의 score는 보통 0~1 유사도 — 화면에는 100점 만점으로 맞춘 정수 */
function submissionScoreToDisplayPoints(score: number): number {
  const s = Number(score);
  if (!Number.isFinite(s)) return 0;
  if (s >= 0 && s <= 1) return Math.round(s * 100);
  return Math.round(s);
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

type QuickDrawStroke = [number[], number[]];

function isQuickDrawStrokeArray(value: unknown): value is QuickDrawStroke[] {
  if (!Array.isArray(value)) return false;
  return value.every((stroke) => {
    if (!Array.isArray(stroke) || stroke.length < 2) return false;
    const [xs, ys] = stroke;
    return Array.isArray(xs) && Array.isArray(ys);
  });
}

function quickDrawToDataUrl(strokes: QuickDrawStroke[]): string | null {
  if (typeof document === 'undefined') return null;
  const size = 512;
  const padding = 24;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#111827';
  ctx.lineWidth = 6;

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const [xs, ys] of strokes) {
    const len = Math.min(xs.length, ys.length);
    for (let i = 0; i < len; i++) {
      const x = Number(xs[i]);
      const y = Number(ys[i]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return null;
  }

  const srcW = Math.max(1, maxX - minX);
  const srcH = Math.max(1, maxY - minY);
  const scale = Math.min((size - padding * 2) / srcW, (size - padding * 2) / srcH);
  const offsetX = (size - srcW * scale) / 2;
  const offsetY = (size - srcH * scale) / 2;

  const mapPoint = (x: number, y: number) => ({
    x: (x - minX) * scale + offsetX,
    y: (y - minY) * scale + offsetY,
  });

  for (const [xs, ys] of strokes) {
    const len = Math.min(xs.length, ys.length);
    if (len <= 0) continue;
    let started = false;
    ctx.beginPath();
    for (let i = 0; i < len; i++) {
      const x = Number(xs[i]);
      const y = Number(ys[i]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      const p = mapPoint(x, y);
      if (!started) {
        ctx.moveTo(p.x, p.y);
        started = true;
      } else {
        ctx.lineTo(p.x, p.y);
      }
    }
    if (started) ctx.stroke();
  }

  return canvas.toDataURL('image/png');
}

function resolveSubmissionImageSrc(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  if (value.startsWith('data:image')) return value;
  if (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('blob:')) return value;

  try {
    const parsed = JSON.parse(value) as unknown;
    if (isQuickDrawStrokeArray(parsed)) {
      return quickDrawToDataUrl(parsed);
    }
  } catch {
    // quickdraw JSON이 아니면 표시 불가
  }
  return null;
}

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

function roomCapacityFromDetail(d: RoomDetailData): {
  curPlayers: number;
  maxPlayers: number;
  totalRounds: number | null;
} {
  const t = d.totalRounds;
  const totalRounds =
    typeof t === 'number' && Number.isFinite(t) && t > 0 ? Math.floor(t) : null;
  return { curPlayers: d.curPlayers, maxPlayers: d.maxPlayers, totalRounds };
}

function roomIsPlaying(room: RoomDetailData): boolean {
  return Boolean(room.isPlaying ?? room.playing);
}

function participantDtoIsAi(p: RoomDetailParticipant): boolean {
  return Boolean(p.isAi ?? p.ai);
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
  let startedAt: string | undefined;
  const rawStarted = raw.startedAt as unknown;
  if (typeof rawStarted === 'string') startedAt = rawStarted;

  let timeLimit: number | undefined;
  const rawTl = raw.timeLimit as unknown;
  if (typeof rawTl === 'number' && Number.isFinite(rawTl) && rawTl > 0) {
    timeLimit = Math.floor(rawTl);
  }

  return {
    roomId: raw.roomId,
    roundId: raw.roundId,
    roundNumber: raw.roundNumber,
    keyword: raw.keyword,
    status: raw.status,
    isTiebreaker: Boolean(raw.isTiebreaker ?? raw.tiebreaker),
    ...(startedAt ? { startedAt } : {}),
    ...(timeLimit != null ? { timeLimit } : {}),
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
  const isAiByParticipantId = new Map<number, boolean>();
  hostsRound.forEach((rp, i) => {
    const rm = hostsRoom[i];
    if (rm) {
      nicknameByParticipantId.set(rp.participantId, rm.nickname);
      userIdByParticipantId.set(rp.participantId, rm.userId);
      isAiByParticipantId.set(rp.participantId, participantDtoIsAi(rm));
    }
  });
  guestsRound.forEach((rp, i) => {
    const rm = guestsRoom[i];
    if (rm) {
      nicknameByParticipantId.set(rp.participantId, rm.nickname);
      userIdByParticipantId.set(rp.participantId, rm.userId);
      isAiByParticipantId.set(rp.participantId, participantDtoIsAi(rm));
    }
  });

  return roundNorm.map((rp) => ({
    id: rp.participantId,
    userId: userIdByParticipantId.get(rp.participantId),
    nickname:
      nicknameByParticipantId.get(rp.participantId) ??
      (rp.isHost ? '호스트' : `참가자 ${rp.participantId}`),
    isHost: rp.isHost,
    isAi: Boolean(isAiByParticipantId.get(rp.participantId)),
    submitted: rp.submitted,
    roundWinCount: rp.roundWinCount,
  }));
}

/**
 * 말풍선·AI 표시 등만 이전 행을 이어 붙이고, 제출 여부는 mapped만 따른다.
 * (이전 라운드 submitted를 OR로 유지하면 새 라운드에서도 제출 완료로 고정되는 버그가 난다.)
 */
function mergePlayersKeepSubmitted(prev: Player[], mapped: Player[]): Player[] {
  const prevById = new Map(prev.map((p) => [p.id, p]));
  return mapped.map((p) => ({
    ...p,
    submitted: Boolean(p.submitted),
    bubble: prevById.get(p.id)?.bubble,
    isAi: p.isAi ?? prevById.get(p.id)?.isAi ?? false,
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
/** 서버 RoundService.ROUND_TIME_LIMIT 과 동일 — API 에 timeLimit 이 없을 때만 */
const FALLBACK_ROUND_TIME_LIMIT_SEC = 60;

/** 서버 시작 시각 + 제한 초 → 모든 탭이 동일 마감 시각 사용 */
function computeRoundCountdownEndsAtMs(
  roundInfo: RoundStartData | CurrentRoundData,
  timeLimitOverrideSec?: number | null,
): number {
  const tls =
    typeof timeLimitOverrideSec === 'number' &&
    Number.isFinite(timeLimitOverrideSec) &&
    timeLimitOverrideSec > 0
      ? Math.floor(timeLimitOverrideSec)
      : typeof roundInfo.timeLimit === 'number' &&
          Number.isFinite(roundInfo.timeLimit) &&
          roundInfo.timeLimit > 0
        ? Math.floor(roundInfo.timeLimit)
        : FALLBACK_ROUND_TIME_LIMIT_SEC;

  let startedMs: number | null = null;
  const raw =
    typeof roundInfo.startedAt === 'string' ? roundInfo.startedAt.trim() : '';
  if (raw.length > 0) {
    const p = Date.parse(raw);
    if (Number.isFinite(p)) startedMs = p;
  }
  if (startedMs != null) return startedMs + tls * 1000;
  return Date.now() + tls * 1000;
}

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
  const [timeOverSignal, setTimeOverSignal] = useState(0);
  /** RoundStartResponse.timeLimit을 roundId별로 기억해 current-round에도 적용 */
  const roundTimeLimitByRoundIdRef = useRef<Map<number, number>>(new Map());
  const [roundRemainingSec, setRoundRemainingSec] = useState<number | null>(null);
  const [roomCapacity, setRoomCapacity] = useState<{
    curPlayers: number;
    maxPlayers: number;
    totalRounds: number | null;
  } | null>(null);
  const [loadingStart, setLoadingStart] = useState(false);
  const [loadingSubmit, setLoadingSubmit] = useState(false);
  const [loadingAiAction, setLoadingAiAction] = useState(false);
  const [leavingRoom, setLeavingRoom] = useState(false);
  const [error, setError] = useState('');
  const [stompChatLine, setStompChatLine] = useState<string | null>(null);
  const [roundEndScoreboard, setRoundEndScoreboard] = useState<RoundEndScoreboardState | null>(null);
  const [finalRankingBoard, setFinalRankingBoard] = useState<FinalRankingBoardState | null>(null);
  /** 라운드 종료 시 STOMP `/ranking`·GET 시드로 갱신되는 누적 승수 랭킹 */
  const [liveRankingRows, setLiveRankingRows] = useState<FinalRankingRow[]>([]);

  const roundAdvanceSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const roundAdvanceCountdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const roundAdvanceEndsAtRef = useRef<number | null>(null);
  const roundTimerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
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
      setRoomCapacity(roomCapacityFromDetail(latest));
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
                isAi: participantDtoIsAi(p),
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
              isAi: participantDtoIsAi(p),
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
      if (roundTimerIntervalRef.current) {
        clearInterval(roundTimerIntervalRef.current);
        roundTimerIntervalRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (roundTimerIntervalRef.current) {
      clearInterval(roundTimerIntervalRef.current);
      roundTimerIntervalRef.current = null;
    }

    const inProgress = roundInfo?.status === 'IN_PROGRESS' && !submitInfo?.gameFinished;
    if (!inProgress || !roundInfo?.roundId) {
      setRoundRemainingSec(null);
      return;
    }

    const cachedTl = roundTimeLimitByRoundIdRef.current.get(roundInfo.roundId) ?? null;
    const deadline = computeRoundCountdownEndsAtMs(roundInfo, cachedTl);
    const tick = () => {
      const sec = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setRoundRemainingSec(sec);
    };
    tick();
    roundTimerIntervalRef.current = setInterval(tick, 250);

    return () => {
      if (roundTimerIntervalRef.current) {
        clearInterval(roundTimerIntervalRef.current);
        roundTimerIntervalRef.current = null;
      }
    };
  }, [
    roundInfo,
    submitInfo?.gameFinished,
  ]);

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
      if (dest === 'ranking') {
        const list = Array.isArray(body) ? body : [];
        const rows = list.map(normalizeRankingRow).filter((x): x is FinalRankingRow => x != null);
        setLiveRankingRows(rows);
        return;
      }
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
      if (evt === 'TIME_OVER') {
        const payloadRoundId = Number(o.data);
        const activeRoundId = roundInfo?.roundId;
        // 현재 라운드 타임오버일 때만 자동 제출 신호를 올린다.
        if (!Number.isFinite(payloadRoundId) || !activeRoundId || payloadRoundId === activeRoundId) {
          setRoundRemainingSec(0);
          showTransientStompChat('알림: 제한 시간이 종료되어 현재 그림을 자동 제출합니다.');
          setTimeOverSignal((v) => v + 1);
        }
        return;
      }
      const rs = parseStompRoundStartPayload(o, roomIdNumber);
      if (rs) {
        if (typeof rs.timeLimit === 'number' && Number.isFinite(rs.timeLimit) && rs.timeLimit > 0) {
          roundTimeLimitByRoundIdRef.current.set(rs.roundId, Math.floor(rs.timeLimit));
        }
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
      roundInfo?.roundId,
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
        setRoomCapacity(roomCapacityFromDetail(roomDetail));
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
        setRoomCapacity(roomCapacityFromDetail(latest));
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
                  isAi: participantDtoIsAi(p),
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
                isAi: participantDtoIsAi(p),
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
  const roundLabel = useMemo(() => {
    if (!roundInfo) return '라운드 -';
    const total = roomCapacity?.totalRounds;
    if (total != null && total > 0) return `라운드 ${roundInfo.roundNumber} / ${total}`;
    return `라운드 ${roundInfo.roundNumber}`;
  }, [roundInfo, roomCapacity?.totalRounds]);
  const submitLabel = submitInfo
    ? `제출 ${submitInfo.submittedCount} / ${submitInfo.totalParticipantCount}`
    : '제출 - / -';
  const statusLabel = roundInfo?.status === 'IN_PROGRESS' ? '진행중' : '대기중';
  const myUserId = getJwtUserId(typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null);
  const myPlayer = myUserId != null ? players.find((p) => p.userId === myUserId) : undefined;
  const isMyHost = Boolean(myPlayer?.isHost);
  const hasAiPlayer = players.some((p) => p.isAi);
  const canAddAi = roomCapacity ? roomCapacity.curPlayers < roomCapacity.maxPlayers : true;
  const aiParticipantIdSet = useMemo(
    () => new Set(players.filter((p) => p.isAi).map((p) => p.id)),
    [players],
  );
  const isRoomInProgress = roundInfo?.status === 'IN_PROGRESS' && !submitInfo?.gameFinished;

  useEffect(() => {
    if (!isRoomInProgress) setLiveRankingRows([]);
  }, [isRoomInProgress]);

  useEffect(() => {
    if (!roomIdNumber || !isRoomInProgress) return;
    let cancelled = false;
    void (async () => {
      try {
        const list = await apiFetch<unknown[]>(`/api/rooms/${roomIdNumber}/ranking`, { method: 'GET' });
        if (cancelled) return;
        const rows = (Array.isArray(list) ? list : [])
          .map(normalizeRankingRow)
          .filter((x): x is FinalRankingRow => x != null);
        setLiveRankingRows(rows);
      } catch {
        if (!cancelled) setLiveRankingRows([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [roomIdNumber, isRoomInProgress, roundInfo?.roundId]);

  const roundTimerLabel =
    roundRemainingSec != null
      ? `${Math.floor(roundRemainingSec / 60)}:${String(roundRemainingSec % 60).padStart(2, '0')}`
      : null;

  /** 에러·AI 결과만 (버튼/초기화와 무관하게 유지) */
  const feedbackLine = useMemo(() => {
    if (error) return error;
    if (submitInfo?.submittedAiAnswer) {
      const pts = submissionScoreToDisplayPoints(submitInfo.submittedScore);
      return `AI 판별: ${submitInfo.submittedAiAnswer} — 이번 라운드 ${pts}점 (유사도 ${submitInfo.submittedScore.toFixed(2)})`;
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
        clearStompChatLineAndTimer();
        // 토큰 만료 상태에서는 leave API도 계속 403이므로, 사용자를 화면에서 먼저 빠져나가게 한다.
        router.replace(`/login?redirect=${encodeURIComponent(`/rooms/${roomIdNumber}`)}`);
        return;
      }
      // 마지막 인원 퇴장 시 방 삭제 타이밍과 겹치면 404/409가 날 수 있다.
      if (st === 404 || st === 409) {
        clearStompChatLineAndTimer();
        router.replace('/rooms');
        return;
      }
      // 500은 실제 퇴장 실패일 수도 있으므로, 방 상태를 다시 확인해 안전하게 처리한다.
      if (st === 500) {
        try {
          const latest = await apiFetch<RoomDetailData>(`/api/rooms/${roomIdNumber}`, { method: 'GET' });
          const myUserId = getJwtUserId(typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null);
          const stillInRoom = myUserId != null && latest.participants.some((p) => p.userId === myUserId);
          if (!stillInRoom) {
            clearStompChatLineAndTimer();
            router.replace('/rooms');
            return;
          }
          // 백엔드에서 AI 포함/게임 진행 중 leave 처리 시 간헐적 500이 발생하는 케이스 완화:
          // 실제로는 방 화면 이탈이 우선이므로 로비로 먼저 이동시킨다.
          if (isRoomInProgress || hasAiPlayer) {
            clearStompChatLineAndTimer();
            router.replace('/rooms');
            return;
          }
          setError('방 나가기에 실패했습니다. 잠시 후 다시 시도해 주세요.');
          return;
        } catch (verifyErr) {
          const verifyStatus = getHttpStatus(verifyErr);
          if (verifyStatus === 404) {
            clearStompChatLineAndTimer();
            router.replace('/rooms');
            return;
          }
        }
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
      if (typeof data.timeLimit === 'number' && Number.isFinite(data.timeLimit) && data.timeLimit > 0) {
        roundTimeLimitByRoundIdRef.current.set(data.roundId, Math.floor(data.timeLimit));
      }
      setRoundInfo(data);

      // 시작 직후 현재 라운드를 가져와 참가자/키워드를 UI에 반영
      const curRaw = await apiFetch<CurrentRoundDataJson>(`/api/rooms/${roomIdNumber}/rounds/current`);
      const cur = normalizeCurrentRoundData(curRaw);
      setRoundInfo(cur);
      const latestRoom = await apiFetch<RoomDetailData>(`/api/rooms/${roomIdNumber}`);
      setRoomCapacity(roomCapacityFromDetail(latestRoom));
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

  async function handleAddAiPlayer() {
    if (!roomIdNumber) return;
    setError('');
    setLoadingAiAction(true);
    try {
      await apiFetch<RoomDetailData>(`/api/rooms/${roomIdNumber}/ai-participants`, { method: 'POST' });
      await refreshRoomParticipants();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'AI 참가자 추가에 실패했습니다.');
    } finally {
      setLoadingAiAction(false);
    }
  }

  async function handleRemoveAiPlayer() {
    if (!roomIdNumber) return;
    setError('');
    setLoadingAiAction(true);
    try {
      await apiFetch<RoomDetailData>(`/api/rooms/${roomIdNumber}/ai-participants`, { method: 'DELETE' });
      await refreshRoomParticipants();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'AI 참가자 제거에 실패했습니다.');
    } finally {
      setLoadingAiAction(false);
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
      const msg = e instanceof Error ? e.message : '그림 제출에 실패했습니다.';
      setError(msg);
      throw e instanceof Error ? e : new Error(msg);
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
          roomId={roomIdNumber}
          totalRounds={roomCapacity?.totalRounds ?? undefined}
          board={roundEndScoreboard}
          advanceCountdownSec={roundAdvanceCountdownSec}
          aiParticipantIds={aiParticipantIdSet}
          winnerFallbackNickname={
            players.find((p) => p.id === submitInfo?.roundWinnerParticipantId)?.nickname ?? null
          }
          onClose={({ gameFinished, openFinalRanking }) => {
            setRoundEndScoreboard(null);
            if (gameFinished && roomIdNumber && openFinalRanking) {
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
      {isRoomInProgress && !roundEndScoreboard ? (
        <LiveRankingSystemPanel rows={liveRankingRows} stompConnected={chatConnected} />
      ) : null}
      <div className="pointer-events-none absolute left-1/2 top-[-220px] h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-blue-500/10 blur-3xl" />
      <div className="pointer-events-none absolute right-[-120px] top-[260px] h-[280px] w-[280px] rounded-full bg-violet-500/10 blur-3xl" />
      <div className="mx-auto max-w-[1440px] px-4 py-4 sm:px-6 sm:py-5">
        <TopHud
          roomId={roomId}
          roundLabel={roundLabel}
          statusLabel={statusLabel}
          submitLabel={submitLabel}
          roundTimerLabel={roundTimerLabel}
          isMyHost={isMyHost}
          hasAiPlayer={hasAiPlayer}
          aiActionDisabled={
            loadingAiAction || leavingRoom || loadingStart || isRoomInProgress || (!hasAiPlayer && !canAddAi)
          }
          onAddAi={handleAddAiPlayer}
          onRemoveAi={handleRemoveAiPlayer}
          loadingAiAction={loadingAiAction}
          showStartButton={!isRoomInProgress}
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
          timeOverSignal={timeOverSignal}
          myAlreadySubmitted={Boolean(myPlayer?.submitted)}
          />
          <PlayerColumn players={rightPlayers} />
        </section>
      </div>
    </main>
  );
}

const ROUND_END_RANKING_PREVIEW = 4;

function RoundEndScoreboardOverlay({
  roomId,
  totalRounds,
  board,
  advanceCountdownSec,
  aiParticipantIds,
  winnerFallbackNickname,
  onClose,
}: {
  roomId: number;
  /** 방 설정 총 라운드(표시용). 없으면 생략 */
  totalRounds?: number | null;
  board: RoundEndScoreboardState;
  advanceCountdownSec: number | null;
  /** 라운드 제출 카드에서 AI 참가자 표시용(participantId) */
  aiParticipantIds: ReadonlySet<number>;
  winnerFallbackNickname: string | null;
  onClose: (opts: { gameFinished: boolean; openFinalRanking: boolean }) => void;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [rankingRows, setRankingRows] = useState<FinalRankingRow[]>([]);
  const [rankingLoading, setRankingLoading] = useState(false);
  const [rankingError, setRankingError] = useState<string | undefined>();

  const winnerName =
    board.items.find((x) => x.winner)?.nickname ?? winnerFallbackNickname ?? '라운드 우승';

  useEffect(() => {
    setStep(1);
    setRankingRows([]);
    setRankingError(undefined);
    setRankingLoading(false);
  }, [board.closedRoundId]);

  useEffect(() => {
    if (step !== 2 || !Number.isFinite(roomId) || roomId <= 0) return;
    let cancelled = false;
    setRankingLoading(true);
    setRankingError(undefined);
    void (async () => {
      try {
        const list = await apiFetch<unknown[]>(`/api/rooms/${roomId}/ranking`, { method: 'GET' });
        if (cancelled) return;
        const rows = (Array.isArray(list) ? list : [])
          .map(normalizeRankingRow)
          .filter((x): x is FinalRankingRow => x != null);
        setRankingRows(rows);
      } catch (e) {
        if (cancelled) return;
        setRankingRows([]);
        setRankingError(e instanceof Error ? e.message : '순위를 불러오지 못했습니다.');
      } finally {
        if (!cancelled) setRankingLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [step, roomId, board.closedRoundId]);

  const previewRows = rankingRows.slice(0, ROUND_END_RANKING_PREVIEW);
  const titleId = step === 1 ? 'round-scoreboard-title' : 'round-ranking-preview-title';

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="max-h-[min(92vh,880px)] w-full max-w-4xl overflow-y-auto rounded-[1.75rem] border border-white/15 bg-slate-900/95 p-5 shadow-2xl sm:p-8">
        {step === 1 ? (
          <>
            <div className="mb-6 text-center">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-300/90">라운드 결과</p>
              <h2 id="round-scoreboard-title" className="mt-2 text-2xl font-black text-white sm:text-3xl">
                라운드{' '}
                {board.roundNumber}
                {typeof totalRounds === 'number' && totalRounds > 0 ? (
                  <span className="font-bold text-slate-400">/{totalRounds}</span>
                ) : null}
                <span className="mx-2 text-slate-500">·</span>
                <span className="bg-gradient-to-r from-cyan-200 to-violet-200 bg-clip-text text-transparent">
                  {board.keyword}
                </span>
              </h2>
              <p className="mt-4 text-lg font-bold text-amber-200">
                우승 <span className="text-white">{winnerName}</span> 님
              </p>
              {board.gameFinished ? (
                <p className="mt-2 text-sm text-slate-400">
                  게임이 종료되었습니다. 아래에서 누적 순위를 확인한 뒤 최종 화면으로 이동할 수 있습니다.
                </p>
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
                  (() => {
                    const imageSrc = resolveSubmissionImageSrc(item.imageData);
                    const displayPts = submissionScoreToDisplayPoints(item.score);
                    return (
                  <div
                    key={item.participantId}
                    className={`overflow-hidden rounded-2xl border bg-slate-950/60 shadow-lg ${
                      item.winner
                        ? 'border-amber-400/50 ring-2 ring-amber-400/25'
                        : 'border-white/10'
                    }`}
                    aria-label={`${item.nickname}, ${displayPts}점`}
                  >
                    <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2.5 sm:px-4 sm:py-3">
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <span className="truncate text-base font-bold text-white sm:text-lg">{item.nickname}</span>
                        {aiParticipantIds.has(item.participantId) ? (
                          <span className="shrink-0 rounded-full border border-violet-400/45 bg-violet-500/20 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-violet-100">
                            AI
                          </span>
                        ) : null}
                      </div>
                      {item.winner ? (
                        <span className="shrink-0 rounded-full border border-amber-400/50 bg-amber-500/20 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-amber-200">
                          우승
                        </span>
                      ) : null}
                    </div>
                    <div className="relative aspect-square w-full bg-white">
                      {imageSrc ? (
                        <img
                          src={imageSrc}
                          alt={`${item.nickname} 제출`}
                          className="h-full w-full object-contain"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-sm text-slate-500">이미지 없음</div>
                      )}
                      <div
                        className={`pointer-events-none absolute bottom-2 right-2 rounded-xl border px-2.5 py-1.5 shadow-lg backdrop-blur-sm sm:bottom-3 sm:right-3 sm:px-3 sm:py-2 ${
                          item.winner
                            ? 'border-amber-400/40 bg-slate-950/88'
                            : 'border-white/20 bg-slate-950/88'
                        }`}
                      >
                        <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">점수</p>
                        <p
                          className={`text-lg font-black tabular-nums sm:text-xl ${
                            item.winner ? 'text-amber-200' : 'text-cyan-200'
                          }`}
                        >
                          {displayPts}점
                        </p>
                        {item.score >= 0 && item.score <= 1 ? (
                          <p className="mt-0.5 text-[10px] font-semibold tabular-nums text-slate-400">
                            유사도 {item.score.toFixed(2)}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <div className="border-t border-violet-400/30 bg-gradient-to-b from-violet-950/50 to-slate-950/80 px-3 py-3 sm:px-4 sm:py-4">
                      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-200 sm:text-[11px]">
                        AI 추론 제시어
                      </p>
                      <p className="mt-1.5 break-words text-base font-bold leading-snug text-white sm:text-lg">
                        {item.aiAnswer.trim() || '—'}
                      </p>
                    </div>
                  </div>
                    );
                  })()
                ))}
              </div>
            )}

            <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center sm:justify-center">
              <button
                type="button"
                onClick={() => setStep(2)}
                disabled={board.loading}
                className="rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 px-8 py-3 text-sm font-black text-white shadow-lg transition hover:from-cyan-400 hover:to-blue-500 disabled:opacity-50"
              >
                순위 보기
              </button>
              <button
                type="button"
                onClick={() =>
                  onClose({ gameFinished: board.gameFinished, openFinalRanking: board.gameFinished })
                }
                className="rounded-2xl border border-white/20 bg-white/5 px-8 py-3 text-sm font-bold text-slate-200 transition hover:bg-white/10"
              >
                {board.gameFinished ? '건너뛰고 최종 순위로' : '닫기'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="mb-6 text-center">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-violet-300/90">누적 순위</p>
              <h2 id="round-ranking-preview-title" className="mt-2 text-2xl font-black text-white sm:text-3xl">
                지금까지 라운드 승 수
              </h2>
              <p className="mt-2 text-sm text-slate-400">
                상위 {ROUND_END_RANKING_PREVIEW}명까지 표시합니다. 게임이 끝난 뒤에는 전체 순위 화면에서 자세히 볼 수
                있어요.
              </p>
            </div>

            {rankingLoading ? (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-400">
                <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-violet-400" />
                <p className="text-sm font-medium">순위를 불러오는 중…</p>
              </div>
            ) : rankingError ? (
              <p className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-6 text-center text-sm text-rose-200">
                {rankingError}
              </p>
            ) : previewRows.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-400">표시할 순위가 없습니다.</p>
            ) : (
              <ol className="mx-auto max-w-lg space-y-2">
                {previewRows.map((row, index) => {
                  const rank = index + 1;
                  const medal =
                    rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}`;
                  return (
                    <li
                      key={row.userId}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3.5"
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <span className="w-8 shrink-0 text-center text-lg">{medal}</span>
                        <div className="min-w-0">
                          <p className="truncate font-bold text-white">{row.nickname}</p>
                          <p className="text-xs text-slate-500">누적 라운드 승</p>
                        </div>
                      </div>
                      <span className="shrink-0 text-lg font-black tabular-nums text-cyan-200">
                        {row.roundWinCount}회
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}

            <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-center">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="rounded-2xl border border-white/20 bg-white/5 px-8 py-3 text-sm font-bold text-slate-200 transition hover:bg-white/10"
              >
                이전
              </button>
              {board.gameFinished ? (
                <button
                  type="button"
                  onClick={() => onClose({ gameFinished: true, openFinalRanking: true })}
                  className="rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 px-8 py-3 text-sm font-black text-slate-950 shadow-lg transition hover:from-amber-400 hover:to-orange-400"
                >
                  최종 순위 전체 보기
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => onClose({ gameFinished: board.gameFinished, openFinalRanking: false })}
                className="rounded-2xl bg-gradient-to-r from-blue-500 to-violet-500 px-8 py-3 text-sm font-black text-white shadow-lg transition hover:from-blue-400 hover:to-violet-400"
              >
                닫기
              </button>
            </div>
          </>
        )}
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

const LIVE_RANKING_PANEL_MAX = 6;

function LiveRankingSystemPanel({
  rows,
  stompConnected,
}: {
  rows: FinalRankingRow[];
  stompConnected: boolean;
}) {
  const preview = rows.slice(0, LIVE_RANKING_PANEL_MAX);
  return (
    <aside
      className="pointer-events-none fixed right-3 top-[4.5rem] z-[65] w-[260px] max-w-[calc(100vw-1.5rem)] select-none sm:right-5 sm:top-24"
      aria-label="실시간 라운드 랭킹"
    >
      <div className="pointer-events-auto rounded-2xl border border-amber-400/25 bg-slate-950/90 p-3 shadow-xl backdrop-blur-md">
        <div className="flex items-start justify-between gap-2 border-b border-white/10 pb-2">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-200/90">라운드별</p>
            <h2 className="text-sm font-black text-white">랭킹 시스템</h2>
          </div>
          <span
            className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
              stompConnected ? 'bg-emerald-500/15 text-emerald-200' : 'bg-slate-600/40 text-slate-400'
            }`}
            title={stompConnected ? '실시간 랭킹 채널 연결됨' : '연결 대기 중'}
          >
            {stompConnected ? 'LIVE' : '…'}
          </span>
        </div>
        <ol className="mt-2 max-h-[min(40vh,320px)] space-y-1.5 overflow-y-auto pr-0.5">
          {preview.length === 0 ? (
            <li className="rounded-xl bg-white/[0.03] px-3 py-4 text-center text-xs text-slate-500">
              순위 데이터를 불러오는 중입니다.
            </li>
          ) : (
            preview.map((row, i) => (
              <li
                key={row.userId}
                className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-sm"
              >
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="w-5 shrink-0 text-center text-xs font-black text-amber-200/90">{i + 1}</span>
                  <span className="truncate font-semibold text-slate-100">{row.nickname}</span>
                </span>
                <span className="shrink-0 text-xs font-bold tabular-nums text-cyan-200">{row.roundWinCount}승</span>
              </li>
            ))
          )}
        </ol>
        {rows.length > LIVE_RANKING_PANEL_MAX ? (
          <p className="mt-1.5 text-center text-[10px] text-slate-500">외 {rows.length - LIVE_RANKING_PANEL_MAX}명</p>
        ) : null}
      </div>
    </aside>
  );
}

function TopHud({
  roomId,
  roundLabel,
  statusLabel,
  submitLabel,
  roundTimerLabel,
  isMyHost,
  hasAiPlayer,
  aiActionDisabled,
  onAddAi,
  onRemoveAi,
  loadingAiAction,
  showStartButton,
  onStartGame,
  loadingStart,
  onLeaveRoom,
  leavingRoom,
}: {
  roomId: string;
  roundLabel: string;
  statusLabel: string;
  submitLabel: string;
  roundTimerLabel: string | null;
  isMyHost: boolean;
  hasAiPlayer: boolean;
  aiActionDisabled: boolean;
  onAddAi: () => void;
  onRemoveAi: () => void;
  loadingAiAction: boolean;
  showStartButton: boolean;
  onStartGame: () => void;
  loadingStart: boolean;
  onLeaveRoom: () => void | Promise<void>;
  leavingRoom: boolean;
}) {
  return (
    <header className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 shadow-2xl backdrop-blur sm:rounded-[2rem] sm:px-6 sm:py-4">
      <div className="grid grid-cols-1 gap-3 sm:gap-4 xl:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] xl:items-center">
        <div className="flex flex-wrap items-center gap-3 xl:min-w-0">
          <InfoChip label={`방 #${roomId}`} />
          <InfoChip label={roundLabel} />
          <InfoChip label={statusLabel} tone={statusLabel === '진행중' ? 'green' : 'default'} />
          <InfoChip label={submitLabel} tone="blue" />
        </div>

        <div className="flex shrink-0 justify-center xl:px-2" role="timer" aria-live="polite">
          {roundTimerLabel ? (
            <div className="rounded-2xl border border-cyan-300/40 bg-cyan-500/10 px-5 py-2.5 text-center shadow-lg shadow-cyan-500/5 sm:py-3">
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-200 sm:text-[11px]">남은 시간</p>
              <p className="mt-0.5 text-3xl font-black tabular-nums tracking-tight text-cyan-100 sm:text-4xl">
                {roundTimerLabel}
              </p>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3 xl:min-w-0">
          {isMyHost ? (
            <button
              type="button"
              onClick={hasAiPlayer ? onRemoveAi : onAddAi}
              disabled={aiActionDisabled}
              className="rounded-2xl border border-violet-300/30 bg-violet-500/10 px-5 py-3 text-sm font-bold text-violet-100 transition hover:bg-violet-500/20 disabled:opacity-50"
            >
              {loadingAiAction ? '처리 중...' : hasAiPlayer ? 'AI 제거' : 'AI 추가'}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void onLeaveRoom()}
            disabled={leavingRoom || loadingStart}
            className="rounded-2xl border border-white/20 bg-white/5 px-5 py-3 text-sm font-bold text-slate-200 transition hover:border-rose-400/40 hover:bg-rose-500/10 hover:text-rose-100 disabled:opacity-50"
          >
            {leavingRoom ? '나가는 중...' : '로비로 나가기'}
          </button>
          {showStartButton ? (
            <button
              type="button"
              onClick={onStartGame}
              disabled={loadingStart || leavingRoom}
              className="rounded-2xl bg-gradient-to-r from-blue-500 to-violet-500 px-5 py-3 text-sm font-black text-white shadow-lg shadow-blue-500/20 transition hover:from-blue-400 hover:to-violet-400 disabled:opacity-50"
            >
              {loadingStart ? '시작 중...' : '게임 시작'}
            </button>
          ) : null}
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
  const isAi = Boolean(player.isAi);
  return (
    <div
      className={`rounded-[1.75rem] border p-5 shadow-xl backdrop-blur ${
        isAi
          ? 'border-violet-400/35 bg-gradient-to-b from-violet-950/50 to-slate-900/75'
          : 'border-white/10 bg-slate-900/70'
      }`}
    >
      <PlayerChatBubble text={player.bubble} />

      <div className="flex flex-col items-center text-center">
        <div className="relative">
          <div
            className={`flex h-20 w-20 items-center justify-center rounded-full border text-2xl font-black text-white shadow-[0_0_30px_rgba(59,130,246,0.18)] ${
              isAi
                ? 'border-violet-400/50 bg-gradient-to-br from-violet-600/90 to-fuchsia-900/80 shadow-[0_0_28px_rgba(139,92,246,0.35)]'
                : 'border-blue-400/30 bg-gradient-to-br from-[#0b1c3f] to-[#081122]'
            }`}
          >
            {isAi ? '◇' : player.nickname.slice(0, 1)}
          </div>
          <span
            className={`absolute bottom-1 right-1 h-4 w-4 rounded-full ${
              player.submitted ? 'bg-emerald-300' : 'bg-amber-300'
            }`}
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <h3 className="text-2xl font-black tracking-tight text-white">{player.nickname}</h3>
          {isAi && (
            <span className="rounded-full border border-violet-400/40 bg-violet-500/20 px-2 py-1 text-[11px] font-black uppercase tracking-wide text-violet-200">
              AI
            </span>
          )}
          {player.isHost && (
            <span className="rounded-full bg-blue-500/15 px-2 py-1 text-[11px] font-black text-blue-300">
              호스트
            </span>
          )}
        </div>

        <p className="mt-2 text-sm text-slate-400">
          라운드 승리 {player.roundWinCount}회
          {isAi ? <span className="text-violet-200/80"> · 봇 (자동 제출)</span> : null}
        </p>

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

type BrushKind = 'pen' | 'highlighter' | 'eraser';

const PALETTE = [
  { name: '검정', color: '#171717' },
  { name: '빨강', color: '#ef4444' },
  { name: '파랑', color: '#2563eb' },
  { name: '초록', color: '#22c55e' },
  { name: '노랑', color: '#eab308' },
  { name: '주황', color: '#f97316' },
  { name: '보라', color: '#a855f7' },
  { name: '갈색', color: '#92400e' },
  { name: '회색', color: '#64748b' },
] as const;

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
  timeOverSignal,
  myAlreadySubmitted,
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
  timeOverSignal: number;
  myAlreadySubmitted: boolean;
}) {
  const canvasRef = useRef<DrawingCanvasHandle>(null);
  const [brush, setBrush] = useState<BrushKind>('pen');
  const [strokeColor, setStrokeColor] = useState<string>(PALETTE[0].color);
  const [lineWidth, setLineWidth] = useState(8);
  const [chatInput, setChatInput] = useState('');
  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false);
  const submitConfirmLockRef = useRef(false);
  const lastTimeOverSignalRef = useRef(0);
  const isEraser = brush === 'eraser';
  const isHighlighter = brush === 'highlighter';
  const effectiveLineWidth = isHighlighter ? Math.round(lineWidth * 1.8) : lineWidth;
  const effectiveOpacity = isHighlighter ? 0.35 : 1;

  useEffect(() => {
    canvasRef.current?.clear();
  }, [activeRoundId]);

  useEffect(() => {
    if (timeOverSignal <= 0) return;
    if (timeOverSignal === lastTimeOverSignalRef.current) return;
    lastTimeOverSignalRef.current = timeOverSignal;
    if (loadingSubmit || myAlreadySubmitted) return;

    const api = canvasRef.current;
    if (!api) return;
    // 타임오버 시에는 그림 유무와 관계없이 현재 캔버스를 자동 제출한다.
    void onSubmitDrawing(api.toDataUrl());
  }, [timeOverSignal, loadingSubmit, myAlreadySubmitted, onSubmitDrawing]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isTyping =
        e.target instanceof HTMLElement &&
        (e.target.tagName === 'INPUT' ||
          e.target.tagName === 'TEXTAREA' ||
          e.target.isContentEditable);
      if (isTyping) return;

      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;

      const key = e.key.toLowerCase();
      if (key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          canvasRef.current?.redo();
        } else {
          canvasRef.current?.undo();
        }
        return;
      }
      if (key === 'y') {
        e.preventDefault();
        canvasRef.current?.redo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  function handleClearCanvas() {
    canvasRef.current?.clear();
  }

  function handleSubmitClick() {
    const api = canvasRef.current;
    if (!api?.getHasDrawing()) {
      setError('캔버스에 그림을 그린 뒤 제출해 주세요.');
      return;
    }
    setSubmitConfirmOpen(true);
  }

  async function confirmSubmit() {
    if (submitConfirmLockRef.current) return;
    const api = canvasRef.current;
    if (!api?.getHasDrawing()) {
      setSubmitConfirmOpen(false);
      setError('캔버스에 그림을 그린 뒤 제출해 주세요.');
      return;
    }
    submitConfirmLockRef.current = true;
    setError('');
    try {
      await onSubmitDrawing(api.toDataUrl());
    } catch {
      // 오류 문구는 상위에서 setError 처리
    } finally {
      submitConfirmLockRef.current = false;
      setSubmitConfirmOpen(false);
    }
  }

  function handleSendChatClick() {
    const text = chatInput.trim();
    if (!text) return;
    onSendChat(text);
    setChatInput('');
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 shadow-2xl backdrop-blur sm:rounded-[2rem] sm:p-5">
      <div className="relative flex flex-col gap-2.5 overflow-hidden rounded-xl border border-white/10 bg-slate-900/70 p-4 sm:gap-3 sm:rounded-[1.5rem] sm:p-5">
        {loadingSubmit && !submitConfirmOpen ? (
          <div
            className="absolute inset-0 z-[35] flex flex-col items-center justify-center gap-3 rounded-[inherit] bg-slate-950/65 px-6 backdrop-blur-sm"
            role="status"
            aria-live="assertive"
            aria-busy="true"
          >
            <SubmitInProgressPanel />
          </div>
        ) : null}
        <div className="flex flex-col gap-2 sm:gap-3">
          {keyword ? (
            <div className="flex min-h-[4.5rem] items-start justify-center sm:min-h-[5rem]">
              <div className="max-w-[min(100%,28rem)] rounded-xl border border-blue-400/30 bg-blue-500/10 px-4 py-2.5 text-center sm:rounded-2xl sm:px-5 sm:py-3">
                <p className="text-[10px] font-black uppercase tracking-[0.28em] text-blue-200 sm:text-[11px] sm:tracking-[0.3em]">
                  제시어
                </p>
                <p className="mt-0.5 text-2xl font-black tracking-tight text-white sm:mt-1 sm:text-3xl">{keyword}</p>
              </div>
            </div>
          ) : null}

          <div className="flex w-full flex-col items-center gap-2 sm:gap-3">
            {feedbackLine ? (
              <div className="max-w-[min(100%,32rem)] rounded-2xl border border-amber-400/35 bg-amber-500/10 px-4 py-3 text-center shadow-inner sm:px-5 sm:py-3.5">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-200/90">AI 채점</p>
                <p className="mt-1.5 text-sm font-bold leading-relaxed text-amber-50 sm:text-base">{feedbackLine}</p>
              </div>
            ) : null}
            {stompChatLine ? (
              <p className="max-w-[520px] text-center text-xs leading-relaxed text-slate-400">{stompChatLine}</p>
            ) : null}
            <p className="max-w-[520px] text-center text-sm leading-relaxed text-slate-300">{instructionLine}</p>
            <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
              <div className="rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-2 text-sm font-bold text-slate-200">
                굵기 {lineWidth}px
              </div>
              <div className="rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-2 text-sm font-bold text-slate-200">
                {isEraser ? '지우개' : isHighlighter ? '형광펜' : '펜'}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-stretch justify-center rounded-xl bg-gradient-to-b from-white/[0.06] to-white/[0.02] p-3 ring-1 ring-white/10 sm:rounded-[1.75rem] sm:p-4">
          <div className="mx-auto flex w-full justify-center px-0.5">
            <DrawingCanvas
              ref={canvasRef}
              strokeColor={isEraser ? '#ffffff' : strokeColor}
              lineWidth={effectiveLineWidth}
              isEraser={isEraser}
              strokeOpacity={effectiveOpacity}
            />
          </div>
        </div>

        <DrawingToolbar
          brush={brush}
          onBrushChange={setBrush}
          strokeColor={strokeColor}
          onStrokeColorChange={setStrokeColor}
          lineWidth={lineWidth}
          onLineWidthChange={setLineWidth}
          onClear={handleClearCanvas}
          onUndo={() => canvasRef.current?.undo()}
          onRedo={() => canvasRef.current?.redo()}
          canUndo={Boolean(canvasRef.current?.canUndo())}
          canRedo={Boolean(canvasRef.current?.canRedo())}
          onSubmit={handleSubmitClick}
          loadingSubmit={loadingSubmit}
          interactionLocked={loadingSubmit}
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
      {submitConfirmOpen ? (
        <ConfirmModal
          title="그림 제출"
          description="정말 제출할까요? 제출 후에는 수정할 수 없습니다."
          confirmLabel={loadingSubmit ? '제출 중…' : '제출하기'}
          cancelLabel="취소"
          busy={loadingSubmit}
          disabled={loadingSubmit}
          onCancel={() => setSubmitConfirmOpen(false)}
          onConfirm={() => void confirmSubmit()}
        />
      ) : null}
    </section>
  );
}

function DrawingToolbar({
  brush,
  onBrushChange,
  strokeColor,
  onStrokeColorChange,
  lineWidth,
  onLineWidthChange,
  onClear,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onSubmit,
  loadingSubmit,
  interactionLocked,
}: {
  brush: BrushKind;
  onBrushChange: (b: BrushKind) => void;
  strokeColor: string;
  onStrokeColorChange: (c: string) => void;
  lineWidth: number;
  onLineWidthChange: (n: number) => void;
  onClear: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onSubmit: () => void;
  loadingSubmit: boolean;
  /** 제출 중 도구 조작 비활성화(자동 제출 등 모달 없이 진행될 때) */
  interactionLocked: boolean;
}) {
  const [openHelp, setOpenHelp] = useState<null | 'undo' | 'redo'>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenHelp(null);
    };
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      if (t.closest('[data-help-popover-root]')) return;
      setOpenHelp(null);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pointerdown', onPointerDown);
    };
  }, []);

  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/60 p-3 sm:rounded-[1.5rem] sm:p-4">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="flex flex-wrap items-center gap-3">
            <ToolButton
              label="펜"
              active={brush === 'pen'}
              disabled={interactionLocked}
              onClick={() => onBrushChange('pen')}
            />
            <ToolButton
              label="형광펜"
              active={brush === 'highlighter'}
              disabled={interactionLocked}
              onClick={() => onBrushChange('highlighter')}
            />
            <ToolButton
              label="지우개"
              active={brush === 'eraser'}
              disabled={interactionLocked}
              onClick={() => onBrushChange('eraser')}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {PALETTE.map((p) => (
              <button
                key={p.color}
                type="button"
                disabled={interactionLocked}
                onClick={() => onStrokeColorChange(p.color)}
                className={`h-8 w-8 rounded-full border transition disabled:opacity-40 ${
                  strokeColor === p.color ? 'border-white ring-2 ring-white/30' : 'border-white/15'
                }`}
                style={{ backgroundColor: p.color }}
                aria-label={`색상 ${p.name}`}
              />
            ))}
            <label
              className={`ml-1 flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-900/60 px-3 py-2 text-xs font-bold text-slate-200 ${
                interactionLocked ? 'pointer-events-none opacity-40' : ''
              }`}
            >
              커스텀
              <input
                type="color"
                value={strokeColor}
                disabled={interactionLocked}
                onChange={(e) => onStrokeColorChange(e.target.value)}
                className="h-6 w-8 cursor-pointer rounded disabled:cursor-not-allowed"
                aria-label="커스텀 색상"
              />
            </label>
          </div>
          <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-900/60 px-3 py-2">
            <span className="shrink-0 text-xs font-bold text-slate-400">펜 굵기</span>
            <input
              type="range"
              min={2}
              max={28}
              step={2}
              value={lineWidth}
              disabled={interactionLocked}
              onChange={(e) => onLineWidthChange(Number(e.target.value))}
              className="h-2 w-[min(100%,140px)] cursor-pointer accent-blue-500 disabled:cursor-not-allowed sm:w-32"
              aria-label="펜 굵기"
            />
            <span className="w-10 shrink-0 text-right font-mono text-xs font-bold text-slate-200">{lineWidth}px</span>
          </div>
          <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-900/60 px-3 py-2">
            <span className="shrink-0 text-xs font-bold text-slate-400">미리보기</span>
            <div className="h-6 w-24 rounded-lg bg-white/90" aria-hidden="true">
              <div
                className="mx-auto mt-[11px] rounded-full"
                style={{
                  width: '80%',
                  height: Math.max(2, Math.round(lineWidth / 2)),
                  backgroundColor: brush === 'eraser' ? '#e2e8f0' : strokeColor,
                  opacity: brush === 'highlighter' ? 0.35 : 1,
                }}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex flex-nowrap items-center gap-2">
            <div className="relative inline-flex items-center gap-1.5" data-help-popover-root>
              <button
                type="button"
                onClick={onUndo}
                disabled={!canUndo || interactionLocked}
                className="min-w-[104px] whitespace-nowrap rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-2.5 text-sm font-bold leading-none text-slate-200 transition hover:bg-slate-800/60 hover:border-blue-300/30 disabled:opacity-50"
              >
                실행 취소
              </button>
              <button
                type="button"
                onClick={() => setOpenHelp((prev) => (prev === 'undo' ? null : 'undo'))}
                className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[11px] font-black text-slate-200 transition hover:bg-white/10"
                aria-label="실행 취소 도움말 열기"
              >
                ?
              </button>
              {openHelp === 'undo' ? (
                <HelpPopover
                  title="실행 취소"
                  lines={['방금 그린 내용을 1단계 되돌립니다.', '단축키: Ctrl+Z (Mac: ⌘Z)']}
                />
              ) : null}
            </div>

            <div className="relative inline-flex items-center gap-1.5" data-help-popover-root>
              <button
                type="button"
                onClick={onRedo}
                disabled={!canRedo || interactionLocked}
                className="min-w-[104px] whitespace-nowrap rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-2.5 text-sm font-bold leading-none text-slate-200 transition hover:bg-slate-800/60 hover:border-blue-300/30 disabled:opacity-50"
              >
                다시 실행
              </button>
              <button
                type="button"
                onClick={() => setOpenHelp((prev) => (prev === 'redo' ? null : 'redo'))}
                className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[11px] font-black text-slate-200 transition hover:bg-white/10"
                aria-label="다시 실행 도움말 열기"
              >
                ?
              </button>
              {openHelp === 'redo' ? (
                <HelpPopover
                  title="다시 실행"
                  lines={[
                    '되돌린 내용을 다시 적용합니다.',
                    '단축키: Ctrl+Y 또는 Ctrl+Shift+Z (Mac: ⌘⇧Z)',
                  ]}
                />
              ) : null}
            </div>
          </div>

          <button
            type="button"
            onClick={onClear}
            disabled={interactionLocked}
            className="rounded-2xl border border-white/10 bg-slate-900/60 px-5 py-3 text-sm font-bold text-slate-200 transition hover:bg-slate-800/60 hover:border-blue-300/30 disabled:opacity-45"
          >
            초기화
          </button>

          <button
            type="button"
            onClick={onSubmit}
            disabled={interactionLocked || loadingSubmit}
            className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-500 to-violet-500 px-7 py-3 text-sm font-black text-white shadow-lg shadow-blue-500/25 transition hover:from-blue-400 hover:to-violet-400 disabled:opacity-85"
          >
            {loadingSubmit ? (
              <span className="relative z-[1] flex items-center justify-center gap-2">
                <span
                  className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/35 border-t-white"
                  aria-hidden
                />
                제출 중…
              </span>
            ) : (
              '그림 제출'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function ToolButton({
  label,
  active = false,
  disabled = false,
  onClick,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-2xl px-4 py-3 text-sm font-bold transition disabled:opacity-45 ${
        active
          ? 'bg-blue-500 text-white'
          : 'border border-white/10 bg-slate-900/60 text-slate-200 hover:bg-slate-800/60 hover:border-blue-300/30'
      }`}
    >
      {label}
    </button>
  );
}

function HelpPopover({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div className="absolute right-0 top-[44px] z-20 w-64 rounded-2xl border border-white/10 bg-slate-950/95 p-3 shadow-2xl backdrop-blur">
      <p className="text-sm font-black text-white">{title}</p>
      <ul className="mt-2 space-y-1 text-xs leading-relaxed text-slate-300">
        {lines.map((line) => (
          <li key={line} className="flex gap-2">
            <span className="mt-[6px] h-1 w-1 shrink-0 rounded-full bg-slate-500" />
            <span>{line}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-slate-500">팁: ESC 또는 바깥 클릭으로 닫을 수 있어요.</p>
    </div>
  );
}

function SpinnerRing({ className }: { className?: string }) {
  return (
    <span
      className={`inline-block shrink-0 animate-spin rounded-full border-[3px] border-white/25 border-t-cyan-200 ${className ?? 'h-8 w-8'}`}
      aria-hidden
    />
  );
}

function SubmitInProgressPanel({
  subtitle = '완료될 때까지 창을 닫지 마세요.',
}: {
  subtitle?: string;
}) {
  return (
    <div className="flex max-w-[min(100%,22rem)] flex-col items-center gap-3 rounded-2xl border border-cyan-400/35 bg-slate-900/95 px-7 py-7 text-center shadow-2xl shadow-cyan-500/20 ring-1 ring-cyan-400/25">
      <SpinnerRing className="h-11 w-11 border-[4px]" />
      <p className="text-[15px] font-black leading-snug tracking-tight text-white sm:text-lg">
        그림을 서버로 보내는 중이에요
      </p>
      <p className="text-xs font-medium leading-relaxed text-slate-400 sm:text-sm">{subtitle}</p>
    </div>
  );
}

function ConfirmModal({
  title,
  description,
  confirmLabel,
  cancelLabel,
  busy,
  disabled,
  onCancel,
  onConfirm,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  busy?: boolean;
  disabled?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (busy) return;
        onCancel();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [busy, onCancel]);

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-[3px]"
      role="dialog"
      aria-modal="true"
      aria-busy={busy ? 'true' : undefined}
      aria-label={title}
      onClick={() => {
        if (!busy) onCancel();
      }}
    >
      <div
        className={`w-full max-w-sm rounded-2xl border border-white/10 bg-slate-900/95 p-5 shadow-2xl ${busy ? 'ring-2 ring-cyan-400/30' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-black text-white">{title}</p>
            {!busy ? (
              <p className="mt-2 text-sm leading-relaxed text-slate-300">{description}</p>
            ) : (
              <div className="mt-5 flex flex-col items-center gap-4 pb-1 pt-2">
                <SpinnerRing className="h-10 w-10 border-[3px]" />
                <p className="text-center text-sm leading-relaxed text-slate-400">
                  이미지를 업로드하고 있어요. 네트워크에 따라 잠시 걸릴 수 있어요.
                </p>
              </div>
            )}
          </div>
          {!busy ? (
            <button
              type="button"
              onClick={onCancel}
              className="shrink-0 rounded-lg px-2 py-1 text-slate-300 transition hover:bg-white/10 hover:text-white"
              aria-label="닫기"
            >
              ✕
            </button>
          ) : null}
        </div>

        {!busy ? (
          <div className="mt-5 flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-bold text-slate-200 transition hover:bg-white/10"
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={Boolean(disabled)}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-500 to-violet-500 px-4 py-2.5 text-sm font-black text-white shadow-lg shadow-blue-500/25 transition hover:from-blue-400 hover:to-violet-400 disabled:opacity-60"
            >
              {confirmLabel}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}