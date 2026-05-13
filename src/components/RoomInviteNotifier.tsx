"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useUserNotificationsStomp } from "@/hooks/useUserNotificationsStomp";
import { getJwtUserId } from "@/lib/auth-session";

type RoomInviteToast = {
  roomId: number;
  roomTitle: string;
  inviterNickname: string;
};

function parseRoomInvite(body: unknown): RoomInviteToast | null {
  if (!body || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  const rid = Number(o.roomId);
  const roomTitle =
    typeof o.roomTitle === "string" && o.roomTitle.trim()
      ? o.roomTitle.trim()
      : "방";
  const inviterNickname =
    typeof o.hostNickname === "string" && o.hostNickname.trim()
      ? o.hostNickname.trim()
      : "친구";
  if (!Number.isFinite(rid) || rid <= 0) return null;
  return { roomId: rid, roomTitle, inviterNickname };
}

export default function RoomInviteNotifier() {
  const [token, setToken] = useState<string | null>(null);
  const [toast, setToast] = useState<RoomInviteToast | null>(null);

  useEffect(() => {
    const sync = () => {
      setToken(
        typeof window !== "undefined"
          ? localStorage.getItem("accessToken")
          : null,
      );
    };
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener("auth-changed", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("auth-changed", sync);
    };
  }, []);

  const userId = token ? getJwtUserId(token) : null;

  const onNotify = useCallback((body: unknown) => {
    const parsed = parseRoomInvite(body);
    if (parsed) setToast(parsed);
  }, []);

  useUserNotificationsStomp(token, userId, onNotify);

  useEffect(() => {
    if (!toast) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [toast]);

  if (!toast) return null;

  const modal = (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6">
      <button
        type="button"
        className="absolute inset-0 bg-slate-950/75 backdrop-blur-sm"
        aria-label="닫기"
        onClick={() => setToast(null)}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="room-invite-heading"
        className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-slate-200/90 bg-zinc-50 text-slate-900 shadow-[0_24px_80px_-12px_rgba(0,0,0,0.55)] ring-1 ring-slate-900/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative px-5 pb-5 pt-5 sm:px-6 sm:pt-6">
          <button
            type="button"
            onClick={() => setToast(null)}
            className="absolute right-2 top-2 rounded-lg p-2 text-slate-500 transition hover:bg-slate-200/90 hover:text-slate-900"
            aria-label="알림 닫기"
          >
            <span aria-hidden className="text-xl leading-none">
              ×
            </span>
          </button>

          <div className="flex gap-3 pr-8">
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/15 text-base font-black text-emerald-700 ring-1 ring-emerald-600/20"
              aria-hidden
            >
              ✉
            </div>
            <div className="min-w-0 flex-1 pt-0.5">
              <p
                id="room-invite-heading"
                className="text-[11px] font-black uppercase tracking-[0.2em] text-emerald-700/90"
              >
                방 초대
              </p>
              <p className="mt-2 text-sm leading-relaxed text-slate-800 sm:text-[15px]">
                <span className="font-bold text-slate-950">
                  {toast.inviterNickname}
                </span>
                님이{" "}
                <span className="font-semibold text-blue-700">
                  「{toast.roomTitle}」
                </span>
                에 초대했습니다.
              </p>
            </div>
          </div>

          <div className="mt-5 flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end sm:gap-3">
            <Link
              href={`/rooms/${toast.roomId}`}
              onClick={() => setToast(null)}
              className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 text-sm font-black text-white shadow-lg shadow-blue-600/25 transition hover:from-blue-500 hover:to-violet-500 sm:w-auto sm:min-w-[8.5rem]"
            >
              방으로 가기
            </Link>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="h-11 w-full rounded-xl border border-slate-600 bg-slate-700 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-600 sm:w-auto sm:min-w-[5.5rem]"
            >
              나중에
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
