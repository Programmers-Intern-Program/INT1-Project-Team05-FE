"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ProfileImage } from "@/components/ProfileImage";
import { apiFetch, getHttpStatus } from "@/lib/api-client";
import { clearAuthSession, isUnauthorizedStatus } from "@/lib/auth-session";

type UserSearchResponse = {
  id: number;
  nickname: string;
  profileImageUrl: string | null;
};

type UserDetailResponse = {
  id: number;
  email: string;
  nickname: string;
  profileImageUrl: string | null;
  totalGameCount: number;
  winGameCount: number;
  isGuest: boolean;
};

type FriendRequestResponse = {
  friendshipId: number;
  userId: number;
  nickname: string;
  profileImageUrl: string | null;
};

type FriendInfoResponse = {
  id: number;
  nickname: string;
  profileImageUrl: string | null;
};

type FriendsTab = "search" | "received" | "sent" | "friends";
type SearchRelation = "friend" | "sent" | "received" | "available";
type ActionDone = "none" | "done";

const AUTH_REDIRECT = Symbol("AUTH_REDIRECT");

export default function FriendsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const activeTab: FriendsTab = useMemo(() => {
    if (
      tabParam === "search" ||
      tabParam === "received" ||
      tabParam === "sent" ||
      tabParam === "friends"
    ) {
      return tabParam;
    }
    return "search";
  }, [tabParam]);

  function goToFriendsTab(next: FriendsTab) {
    const sp = new URLSearchParams(searchParams.toString());
    sp.set("tab", next);
    router.replace(`/friends?${sp.toString()}`, { scroll: false });
  }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [searchNickname, setSearchNickname] = useState("");
  const [searchResult, setSearchResult] = useState<UserSearchResponse | null>(
    null,
  );
  const [sending, setSending] = useState(false);
  const [requestedUserIds, setRequestedUserIds] = useState<Set<number>>(
    new Set(),
  );
  const [lastRequestedUserId, setLastRequestedUserId] = useState<number | null>(
    null,
  );

  const [received, setReceived] = useState<FriendRequestResponse[]>([]);
  const [sent, setSent] = useState<FriendRequestResponse[]>([]);
  const [friends, setFriends] = useState<FriendInfoResponse[]>([]);
  const [processingRequestIds, setProcessingRequestIds] = useState<Set<number>>(
    new Set(),
  );
  const [deletingFriendIds, setDeletingFriendIds] = useState<Set<number>>(
    new Set(),
  );
  const [lastActionRequestId, setLastActionRequestId] = useState<number | null>(
    null,
  );
  const [lastDeletedFriendId, setLastDeletedFriendId] = useState<number | null>(
    null,
  );
  const [selectedUser, setSelectedUser] = useState<UserDetailResponse | null>(
    null,
  );
  const [profileLoading, setProfileLoading] = useState(false);

  useEffect(() => {
    if (lastRequestedUserId === null) return;
    const timer = window.setTimeout(() => setLastRequestedUserId(null), 1600);
    return () => window.clearTimeout(timer);
  }, [lastRequestedUserId]);

  useEffect(() => {
    if (lastActionRequestId === null) return;
    const timer = window.setTimeout(() => setLastActionRequestId(null), 1600);
    return () => window.clearTimeout(timer);
  }, [lastActionRequestId]);

  useEffect(() => {
    if (lastDeletedFriendId === null) return;
    const timer = window.setTimeout(() => setLastDeletedFriendId(null), 1600);
    return () => window.clearTimeout(timer);
  }, [lastDeletedFriendId]);

  async function withAuth<T>(
    task: () => Promise<T>,
  ): Promise<T | typeof AUTH_REDIRECT> {
    try {
      return await task();
    } catch (e) {
      const status = getHttpStatus(e);
      if (isUnauthorizedStatus(status)) {
        clearAuthSession();
        router.replace("/login");
        return AUTH_REDIRECT;
      }
      throw e;
    }
  }

  async function loadReceived() {
    const data = await withAuth(() =>
      apiFetch<FriendRequestResponse[]>("/api/friendship/requests/received", {
        method: "GET",
      }),
    );
    if (data !== AUTH_REDIRECT) setReceived(data);
  }

  async function loadSent() {
    const data = await withAuth(() =>
      apiFetch<FriendRequestResponse[]>("/api/friendship/requests/sent", {
        method: "GET",
      }),
    );
    if (data !== AUTH_REDIRECT) setSent(data);
  }

  async function loadFriends() {
    const data = await withAuth(() =>
      apiFetch<FriendInfoResponse[]>("/api/friendship", { method: "GET" }),
    );
    if (data !== AUTH_REDIRECT) setFriends(data);
  }

  useEffect(() => {
    void (async () => {
      try {
        await Promise.all([loadReceived(), loadSent(), loadFriends()]);
      } catch {
        /* 초기 배지용 프리로드 실패는 조용히 무시 */
      }
    })();
  }, []);

  useEffect(() => {
    if (activeTab === "received") {
      void (async () => {
        setLoading(true);
        setError("");
        try {
          await loadReceived();
        } catch (e) {
          setError(
            e instanceof Error
              ? e.message
              : "받은 요청 목록을 불러오지 못했습니다.",
          );
        } finally {
          setLoading(false);
        }
      })();
    } else if (activeTab === "sent") {
      void (async () => {
        setLoading(true);
        setError("");
        try {
          await loadSent();
        } catch (e) {
          setError(
            e instanceof Error
              ? e.message
              : "보낸 요청 목록을 불러오지 못했습니다.",
          );
        } finally {
          setLoading(false);
        }
      })();
    } else if (activeTab === "friends") {
      void (async () => {
        setLoading(true);
        setError("");
        try {
          await loadFriends();
        } catch (e) {
          setError(
            e instanceof Error ? e.message : "친구 목록을 불러오지 못했습니다.",
          );
        } finally {
          setLoading(false);
        }
      })();
    }
  }, [activeTab]);

  async function handleSearch() {
    const query = searchNickname.trim();
    if (!query) {
      setError("검색할 닉네임을 입력해 주세요.");
      return;
    }

    setLoading(true);
    setError("");
    setMessage("");
    setSearchResult(null);
    try {
      const result = await withAuth(() =>
        apiFetch<UserSearchResponse>(
          `/api/user/search?nickname=${encodeURIComponent(query)}`,
          { method: "GET" },
        ),
      );
      if (result !== AUTH_REDIRECT) setSearchResult(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "유저 검색에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSendRequest(userId: number, nickname: string) {
    if (requestedUserIds.has(userId) || sent.some((s) => s.userId === userId))
      return;
    setLastRequestedUserId(null);
    setSending(true);
    setError("");
    setMessage("");
    try {
      const ok = await withAuth(() =>
        apiFetch<null>(`/api/friendship/request/${userId}`, { method: "POST" }),
      );
      if (ok === AUTH_REDIRECT) return;
      setMessage(`${nickname}님께 친구 요청을 보냈습니다.`);
      setRequestedUserIds((prev) => new Set(prev).add(userId));
      setSent((prev) =>
        prev.some((x) => x.userId === userId)
          ? prev
          : [
              {
                friendshipId: Date.now(),
                userId,
                nickname,
                profileImageUrl: searchResult?.profileImageUrl ?? null,
              },
              ...prev,
            ],
      );
      setLastRequestedUserId(userId);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "친구 요청 전송에 실패했습니다.",
      );
    } finally {
      setSending(false);
    }
  }

  async function handleAccept(friendshipId: number) {
    window.dispatchEvent(
      new CustomEvent("friend-requests-changed", { detail: { delta: -1 } }),
    );
    setLastActionRequestId(null);
    setProcessingRequestIds((prev) => new Set(prev).add(friendshipId));
    const target =
      received.find((r) => r.friendshipId === friendshipId) ?? null;
    const prevReceived = received;
    if (target) {
      setReceived((prev) =>
        prev.filter((r) => r.friendshipId !== friendshipId),
      );
      setFriends((prev) =>
        prev.some((f) => f.id === target.userId)
          ? prev
          : [
              {
                id: target.userId,
                nickname: target.nickname,
                profileImageUrl: target.profileImageUrl,
              },
              ...prev,
            ],
      );
    }
    setError("");
    setMessage("");
    try {
      const ok = await withAuth(() =>
        apiFetch<null>(`/api/friendship/${friendshipId}/accept`, {
          method: "POST",
        }),
      );
      if (ok === AUTH_REDIRECT) return;
      setMessage("친구 요청을 수락했습니다.");
      setLastActionRequestId(friendshipId);
    } catch (e) {
      setReceived(prevReceived);
      window.dispatchEvent(
        new CustomEvent("friend-requests-changed", { detail: { delta: +1 } }),
      );
      setError(e instanceof Error ? e.message : "요청 수락에 실패했습니다.");
    } finally {
      setProcessingRequestIds((prev) => {
        const next = new Set(prev);
        next.delete(friendshipId);
        return next;
      });
    }
  }

  async function handleReject(friendshipId: number) {
    window.dispatchEvent(
      new CustomEvent("friend-requests-changed", { detail: { delta: -1 } }),
    );
    setLastActionRequestId(null);
    setProcessingRequestIds((prev) => new Set(prev).add(friendshipId));
    const prevReceived = received;
    setReceived((prev) => prev.filter((r) => r.friendshipId !== friendshipId));
    setError("");
    setMessage("");
    try {
      const ok = await withAuth(() =>
        apiFetch<null>(`/api/friendship/${friendshipId}/reject`, {
          method: "DELETE",
        }),
      );
      if (ok === AUTH_REDIRECT) return;
      setMessage("친구 요청을 거절했습니다.");
      setLastActionRequestId(friendshipId);
    } catch (e) {
      setReceived(prevReceived);
      window.dispatchEvent(
        new CustomEvent("friend-requests-changed", { detail: { delta: +1 } }),
      );
      setError(e instanceof Error ? e.message : "요청 거절에 실패했습니다.");
    } finally {
      setProcessingRequestIds((prev) => {
        const next = new Set(prev);
        next.delete(friendshipId);
        return next;
      });
    }
  }

  async function handleDeleteFriend(friendId: number, nickname: string) {
    if (!window.confirm(`${nickname}님을 친구 목록에서 삭제할까요?`)) return;
    setLastDeletedFriendId(null);
    setDeletingFriendIds((prev) => new Set(prev).add(friendId));
    const prevFriends = friends;
    setFriends((prev) => prev.filter((f) => f.id !== friendId));
    setError("");
    setMessage("");
    try {
      const ok = await withAuth(() =>
        apiFetch<null>(`/api/friendship/friends/${friendId}`, {
          method: "DELETE",
        }),
      );
      if (ok === AUTH_REDIRECT) return;
      setMessage("친구를 삭제했습니다.");
      setLastDeletedFriendId(friendId);
    } catch (e) {
      setFriends(prevFriends);
      setError(e instanceof Error ? e.message : "친구 삭제에 실패했습니다.");
    } finally {
      setDeletingFriendIds((prev) => {
        const next = new Set(prev);
        next.delete(friendId);
        return next;
      });
    }
  }

  async function openUserDetail(userId: number) {
    setProfileLoading(true);
    setError("");
    try {
      const detail = await withAuth(() =>
        apiFetch<UserDetailResponse>(`/api/user/${userId}`, { method: "GET" }),
      );
      if (detail !== AUTH_REDIRECT) setSelectedUser(detail);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "유저 정보를 불러오지 못했습니다.",
      );
    } finally {
      setProfileLoading(false);
    }
  }

  const tabTitle = useMemo(() => {
    switch (activeTab) {
      case "search":
        return "유저 검색";
      case "received":
        return "받은 요청";
      case "sent":
        return "보낸 요청";
      case "friends":
        return "친구 목록";
      default:
        return "";
    }
  }, [activeTab]);

  const friendIdSet = useMemo(
    () => new Set(friends.map((f) => f.id)),
    [friends],
  );
  const sentUserIdSet = useMemo(
    () => new Set(sent.map((s) => s.userId)),
    [sent],
  );
  const receivedUserIdSet = useMemo(
    () => new Set(received.map((r) => r.userId)),
    [received],
  );

  function getSearchRelation(userId: number): SearchRelation {
    if (friendIdSet.has(userId)) return "friend";
    if (sentUserIdSet.has(userId) || requestedUserIds.has(userId))
      return "sent";
    if (receivedUserIdSet.has(userId)) return "received";
    return "available";
  }

  const selectedUserRelation = selectedUser
    ? getSearchRelation(selectedUser.id)
    : "available";
  const selectedReceivedRequestId =
    selectedUserRelation === "received" && selectedUser
      ? (received.find((r) => r.userId === selectedUser.id)?.friendshipId ??
        null)
      : null;
  const selectedFriendId =
    selectedUserRelation === "friend" && selectedUser ? selectedUser.id : null;

  return (
    <main className="relative min-h-[calc(100vh-4rem)] overflow-hidden text-white">
      <div className="pointer-events-none absolute left-1/2 top-[-200px] h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-blue-500/10 blur-3xl" />
      <section className="relative mx-auto max-w-5xl px-6 py-12">
        <h1 className="text-4xl font-black tracking-tight">친구</h1>
        <p className="mt-2 text-slate-400">
          친구를 검색하고 요청을 관리하세요.
        </p>

        <div className="mt-6 flex flex-wrap gap-2">
          {(
            [
              ["search", "유저 검색"],
              ["received", "받은 요청"],
              ["sent", "보낸 요청"],
              ["friends", "친구 목록"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => goToFriendsTab(id)}
              className={`relative rounded-xl px-4 py-2 text-sm font-bold transition ${
                activeTab === id
                  ? "bg-gradient-to-r from-blue-500 to-violet-500 text-white"
                  : "border border-white/20 text-slate-200 hover:bg-white/10"
              }`}
            >
              {label}
              {id !== "search" ? (
                <span
                  className={`ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-black ${
                    activeTab === id
                      ? "bg-white/20 text-white"
                      : "bg-white/10 text-slate-200"
                  }`}
                >
                  {id === "received"
                    ? received.length
                    : id === "sent"
                      ? sent.length
                      : friends.length}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        {error ? (
          <p className="mt-4 rounded-xl bg-rose-500/10 px-4 py-3 text-rose-200">
            {error}
          </p>
        ) : null}
        {message ? (
          <p className="mt-4 rounded-xl bg-emerald-500/10 px-4 py-3 text-emerald-200">
            {message}
          </p>
        ) : null}

        <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.04] p-6">
          <h2 className="text-xl font-bold">{tabTitle}</h2>

          {activeTab === "search" ? (
            <div className="mt-4">
              <div className="flex flex-col gap-3 sm:flex-row">
                <input
                  value={searchNickname}
                  onChange={(e) => setSearchNickname(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void handleSearch();
                    }
                  }}
                  className="flex-1 rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2 outline-none"
                  placeholder="검색할 닉네임"
                  maxLength={20}
                />
                <button
                  type="button"
                  onClick={() => void handleSearch()}
                  disabled={loading}
                  className="rounded-xl border border-white/20 px-4 py-2 font-semibold disabled:opacity-60"
                >
                  {loading ? "검색 중..." : "검색"}
                </button>
              </div>

              {searchResult ? (
                <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-slate-900/60 p-4">
                  {(() => {
                    const relation = getSearchRelation(searchResult.id);
                    const disabled = sending || relation !== "available";
                    const buttonLabel =
                      relation === "friend"
                        ? "이미 친구"
                        : relation === "received"
                          ? "받은 요청 확인"
                          : relation === "sent"
                            ? "요청 완료"
                            : sending
                              ? "전송 중..."
                              : "친구 요청";
                    return (
                      <>
                        <button
                          type="button"
                          onClick={() => void openUserDetail(searchResult.id)}
                          className="flex items-center gap-3 rounded-lg px-1 py-1 text-left transition hover:bg-white/5"
                        >
                          <ProfileImage
                            src={searchResult.profileImageUrl}
                            alt="검색 유저 프로필"
                            className="h-12 w-12 rounded-full border border-white/20 object-cover"
                          />
                          <div>
                            <p className="text-xs text-slate-400">검색 결과</p>
                            <div className="mt-0.5 flex items-center gap-2">
                              <p className="text-lg font-bold">
                                {searchResult.nickname}
                              </p>
                              {relation === "friend" ? (
                                <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-black text-emerald-200">
                                  친구
                                </span>
                              ) : relation === "sent" ? (
                                <span className="rounded-full border border-cyan-400/30 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-black text-cyan-200">
                                  요청중
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void handleSendRequest(
                              searchResult.id,
                              searchResult.nickname,
                            )
                          }
                          disabled={disabled}
                          className="rounded-xl bg-gradient-to-r from-blue-500 to-violet-500 px-4 py-2 text-sm font-black text-white disabled:opacity-60"
                        >
                          <ActionButtonLabel
                            loading={sending && relation === "available"}
                            done={lastRequestedUserId === searchResult.id}
                            idleText={buttonLabel}
                            loadingText="전송 중..."
                            doneText="요청 완료"
                          />
                        </button>
                      </>
                    );
                  })()}
                </div>
              ) : null}
            </div>
          ) : null}

          {activeTab === "received" ? (
            <ListWrap empty="받은 친구 요청이 없습니다." loading={loading}>
              {received.map((r) => (
                <div
                  key={r.friendshipId}
                  className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-slate-900/60 p-4"
                >
                  <UserCell
                    userId={r.userId}
                    nickname={r.nickname}
                    imageUrl={r.profileImageUrl}
                    onOpen={(userId) => void openUserDetail(userId)}
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void handleAccept(r.friendshipId)}
                      disabled={processingRequestIds.has(r.friendshipId)}
                      className="rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-bold text-white disabled:opacity-60"
                    >
                      <ActionButtonLabel
                        loading={processingRequestIds.has(r.friendshipId)}
                        done={lastActionRequestId === r.friendshipId}
                        idleText="수락"
                        loadingText="처리 중..."
                        doneText="완료"
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleReject(r.friendshipId)}
                      disabled={processingRequestIds.has(r.friendshipId)}
                      className="rounded-lg border border-white/20 px-3 py-1.5 text-sm font-bold text-slate-200 disabled:opacity-60"
                    >
                      <ActionButtonLabel
                        loading={processingRequestIds.has(r.friendshipId)}
                        done={lastActionRequestId === r.friendshipId}
                        idleText="거절"
                        loadingText="처리 중..."
                        doneText="완료"
                      />
                    </button>
                  </div>
                </div>
              ))}
            </ListWrap>
          ) : null}

          {activeTab === "sent" ? (
            <ListWrap empty="보낸 친구 요청이 없습니다." loading={loading}>
              {sent.map((r) => (
                <div
                  key={r.friendshipId}
                  className="rounded-xl border border-white/10 bg-slate-900/60 p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <UserCell
                      userId={r.userId}
                      nickname={r.nickname}
                      imageUrl={r.profileImageUrl}
                      onOpen={(userId) => void openUserDetail(userId)}
                    />
                    <span className="rounded-full border border-cyan-400/30 bg-cyan-500/10 px-2.5 py-1 text-xs font-bold text-cyan-200">
                      요청됨
                    </span>
                  </div>
                </div>
              ))}
            </ListWrap>
          ) : null}

          {activeTab === "friends" ? (
            <ListWrap empty="친구가 없습니다." loading={loading}>
              {friends.map((f) => (
                <div
                  key={f.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-slate-900/60 p-4"
                >
                  <UserCell
                    userId={f.id}
                    nickname={f.nickname}
                    imageUrl={f.profileImageUrl}
                    onOpen={(userId) => void openUserDetail(userId)}
                  />
                  <button
                    type="button"
                    onClick={() => void handleDeleteFriend(f.id, f.nickname)}
                    disabled={deletingFriendIds.has(f.id)}
                    className="rounded-lg border border-rose-500/40 px-3 py-1.5 text-sm font-bold text-rose-200 disabled:opacity-60"
                  >
                    <ActionButtonLabel
                      loading={deletingFriendIds.has(f.id)}
                      done={lastDeletedFriendId === f.id}
                      idleText="삭제"
                      loadingText="삭제 중..."
                      doneText="완료"
                    />
                  </button>
                </div>
              ))}
            </ListWrap>
          ) : null}
        </section>
      </section>
      {selectedUser ? (
        <UserDetailModal
          user={selectedUser}
          onClose={() => setSelectedUser(null)}
          loading={profileLoading}
          relation={selectedUserRelation}
          pendingRequestId={selectedReceivedRequestId}
          isSending={sending}
          isProcessingRequest={
            selectedReceivedRequestId
              ? processingRequestIds.has(selectedReceivedRequestId)
              : false
          }
          isDeletingFriend={
            selectedFriendId ? deletingFriendIds.has(selectedFriendId) : false
          }
          requestedDone={lastRequestedUserId === selectedUser.id}
          processedDone={
            selectedReceivedRequestId
              ? lastActionRequestId === selectedReceivedRequestId
              : false
          }
          deletedDone={
            selectedFriendId ? lastDeletedFriendId === selectedFriendId : false
          }
          onSendRequest={() =>
            void handleSendRequest(selectedUser.id, selectedUser.nickname)
          }
          onAcceptRequest={() => {
            if (selectedReceivedRequestId)
              void handleAccept(selectedReceivedRequestId);
          }}
          onRejectRequest={() => {
            if (selectedReceivedRequestId)
              void handleReject(selectedReceivedRequestId);
          }}
          onDeleteFriend={() =>
            void handleDeleteFriend(selectedUser.id, selectedUser.nickname)
          }
          onMoveToReceivedTab={() => {
            goToFriendsTab("received");
            setSelectedUser(null);
          }}
        />
      ) : null}
    </main>
  );
}

function UserCell({
  userId,
  nickname,
  imageUrl,
  onOpen,
}: {
  userId: number;
  nickname: string;
  imageUrl: string | null;
  onOpen: (userId: number) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(userId)}
      className="flex items-center gap-3 rounded-lg px-1 py-1 text-left transition hover:bg-white/5"
    >
      <ProfileImage
        src={imageUrl}
        alt="프로필"
        className="h-10 w-10 rounded-full border border-white/20 object-cover"
      />
      <p className="font-bold text-white">{nickname}</p>
    </button>
  );
}

function ListWrap({
  children,
  empty,
  loading,
}: {
  children: React.ReactNode[];
  empty: string;
  loading: boolean;
}) {
  if (loading)
    return <p className="mt-4 text-sm text-slate-300">불러오는 중...</p>;
  if (children.length === 0)
    return <p className="mt-4 text-sm text-slate-400">{empty}</p>;
  return <div className="mt-4 space-y-3">{children}</div>;
}

function UserDetailModal({
  user,
  onClose,
  loading,
  relation,
  pendingRequestId,
  isSending,
  isProcessingRequest,
  isDeletingFriend,
  requestedDone,
  processedDone,
  deletedDone,
  onSendRequest,
  onAcceptRequest,
  onRejectRequest,
  onDeleteFriend,
  onMoveToReceivedTab,
}: {
  user: UserDetailResponse;
  onClose: () => void;
  loading: boolean;
  relation: SearchRelation;
  pendingRequestId: number | null;
  isSending: boolean;
  isProcessingRequest: boolean;
  isDeletingFriend: boolean;
  requestedDone: boolean;
  processedDone: boolean;
  deletedDone: boolean;
  onSendRequest: () => void;
  onAcceptRequest: () => void;
  onRejectRequest: () => void;
  onDeleteFriend: () => void;
  onMoveToReceivedTab: () => void;
}) {
  const winRate =
    user.totalGameCount > 0
      ? Math.round((user.winGameCount / user.totalGameCount) * 1000) / 10
      : 0;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="유저 상세 정보"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900/95 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-xl font-black">유저 상세</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-slate-300 transition hover:bg-white/10 hover:text-white"
          >
            ✕
          </button>
        </div>
        {loading ? (
          <p className="text-sm text-slate-300">불러오는 중...</p>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <ProfileImage
                src={user.profileImageUrl}
                alt="유저 프로필"
                className="h-16 w-16 rounded-full border border-white/20 object-cover"
              />
              <div>
                <p className="text-xl font-black">{user.nickname}</p>
                <p className="text-xs text-slate-400">{user.email}</p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg border border-white/10 bg-slate-950/70 p-3">
                <p className="text-xs text-slate-400">총 게임</p>
                <p className="mt-1 font-black">{user.totalGameCount}</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-slate-950/70 p-3">
                <p className="text-xs text-slate-400">승리</p>
                <p className="mt-1 font-black">{user.winGameCount}</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-slate-950/70 p-3">
                <p className="text-xs text-slate-400">승률</p>
                <p className="mt-1 font-black">{winRate}%</p>
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-400">
              {user.isGuest ? "게스트 계정" : "일반 계정"}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {relation === "available" ? (
                <button
                  type="button"
                  onClick={onSendRequest}
                  disabled={isSending}
                  className="rounded-lg bg-gradient-to-r from-blue-500 to-violet-500 px-3 py-1.5 text-sm font-bold text-white disabled:opacity-60"
                >
                  <ActionButtonLabel
                    loading={isSending}
                    done={requestedDone}
                    idleText="친구 요청"
                    loadingText="전송 중..."
                    doneText="요청 완료"
                  />
                </button>
              ) : null}
              {relation === "received" ? (
                <>
                  <button
                    type="button"
                    onClick={onAcceptRequest}
                    disabled={!pendingRequestId || isProcessingRequest}
                    className="rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-bold text-white disabled:opacity-60"
                  >
                    <ActionButtonLabel
                      loading={isProcessingRequest}
                      done={processedDone}
                      idleText="수락"
                      loadingText="처리 중..."
                      doneText="완료"
                    />
                  </button>
                  <button
                    type="button"
                    onClick={onRejectRequest}
                    disabled={!pendingRequestId || isProcessingRequest}
                    className="rounded-lg border border-white/20 px-3 py-1.5 text-sm font-bold text-slate-200 disabled:opacity-60"
                  >
                    <ActionButtonLabel
                      loading={isProcessingRequest}
                      done={processedDone}
                      idleText="거절"
                      loadingText="처리 중..."
                      doneText="완료"
                    />
                  </button>
                </>
              ) : null}
              {relation === "friend" ? (
                <button
                  type="button"
                  onClick={onDeleteFriend}
                  disabled={isDeletingFriend}
                  className="rounded-lg border border-rose-500/40 px-3 py-1.5 text-sm font-bold text-rose-200 disabled:opacity-60"
                >
                  <ActionButtonLabel
                    loading={isDeletingFriend}
                    done={deletedDone}
                    idleText="친구 삭제"
                    loadingText="삭제 중..."
                    doneText="완료"
                  />
                </button>
              ) : null}
              {relation === "sent" ? (
                <span className="rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-3 py-1.5 text-sm font-bold text-cyan-200">
                  요청 보냄
                </span>
              ) : null}
              {relation === "received" ? (
                <button
                  type="button"
                  onClick={onMoveToReceivedTab}
                  className="rounded-lg border border-white/20 px-3 py-1.5 text-sm font-bold text-slate-200 hover:bg-white/10"
                >
                  받은 요청 탭으로 이동
                </button>
              ) : null}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ActionButtonLabel({
  loading,
  done,
  idleText,
  loadingText,
  doneText,
}: {
  loading: boolean;
  done: boolean;
  idleText: string;
  loadingText: string;
  doneText: string;
}) {
  const state: ActionDone = loading ? "none" : done ? "done" : "none";
  if (loading) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <Spinner />
        {loadingText}
      </span>
    );
  }
  if (state === "done") {
    return (
      <span className="inline-flex items-center gap-1.5">✓ {doneText}</span>
    );
  }
  return <span>{idleText}</span>;
}

function Spinner() {
  return (
    <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
  );
}
