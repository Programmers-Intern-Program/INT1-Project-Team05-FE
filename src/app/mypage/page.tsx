'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ProfileImage } from '@/components/ProfileImage';
import { apiFetch, getHttpStatus } from '@/lib/api-client';
import { clearAuthSession, isUnauthorizedStatus } from '@/lib/auth-session';

type UserInfo = {
  id: number;
  email: string;
  nickname: string;
  profileImageUrl: string | null;
  totalGameCount: number;
  winGameCount: number;
  isGuest: boolean;
};


export default function MyPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [user, setUser] = useState<UserInfo | null>(null);
  const [nextNickname, setNextNickname] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');

  const winRate = useMemo(() => {
    if (!user || user.totalGameCount <= 0) return 0;
    return Math.round((user.winGameCount / user.totalGameCount) * 1000) / 10;
  }, [user]);

  async function loadMyInfo() {
    setLoading(true);
    setError('');
    try {
      const me = await apiFetch<UserInfo>('/api/user/me', { method: 'GET' });
      setUser(me);
      setNextNickname('');
    } catch (e) {
      const status = getHttpStatus(e);
      if (isUnauthorizedStatus(status)) {
        clearAuthSession();
        router.replace('/login');
        return;
      }
      setError(e instanceof Error ? e.message : '내 정보를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadMyInfo();
  }, []);

  async function handleSaveProfile() {
    if (!user) return;
    if (!nextNickname.trim()) {
      setError('변경할 닉네임을 입력해 주세요.');
      return;
    }
    if (nextNickname.trim() === user.nickname) {
      setError('현재 닉네임과 동일합니다.');
      return;
    }
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const updated = await apiFetch<UserInfo>('/api/user/me', {
        method: 'PATCH',
        body: JSON.stringify({ nickname: nextNickname.trim() }),
      });
      setUser(updated);
      setNextNickname('');
      setMessage('닉네임이 변경되었습니다.');
    } catch (e) {
      setError(e instanceof Error ? e.message : '닉네임 변경에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  }

  async function handleUploadImage(file: File) {
    const form = new FormData();
    form.append('image', file);

    setUploading(true);
    setError('');
    setMessage('');
    try {
      const updated = await apiFetch<UserInfo>('/api/user/me/profile-image', {
        method: 'POST',
        body: form,
      });
      setUser(updated);
      setMessage('프로필 이미지가 변경되었습니다.');
    } catch (e) {
      setError(e instanceof Error ? e.message : '이미지 업로드에 실패했습니다.');
    } finally {
      setUploading(false);
    }
  }

  async function handleDeleteAccount() {
    if (!window.confirm('정말 회원 탈퇴하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) return;
    setDeleting(true);
    setError('');
    setMessage('');
    try {
      await apiFetch<null>('/api/user/me', { method: 'DELETE' });
      clearAuthSession();
      router.replace('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : '회원 탈퇴에 실패했습니다.');
    } finally {
      setDeleting(false);
    }
  }

  async function handleChangePassword() {
    if (!user) return;
    if (user.isGuest) {
      setError('게스트 계정은 비밀번호를 변경할 수 없습니다.');
      return;
    }
    if (!currentPassword || !newPassword || !newPasswordConfirm) {
      setError('현재/새 비밀번호를 모두 입력해 주세요.');
      return;
    }
    if (newPassword.length < 8 || newPassword.length > 20) {
      setError('새 비밀번호는 8자 이상 20자 이하로 입력해 주세요.');
      return;
    }
    if (newPassword !== newPasswordConfirm) {
      setError('새 비밀번호 확인이 일치하지 않습니다.');
      return;
    }

    setChangingPassword(true);
    setError('');
    setMessage('');
    try {
      await apiFetch<null>('/api/auth/password', {
        method: 'PATCH',
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });
      setCurrentPassword('');
      setNewPassword('');
      setNewPasswordConfirm('');
      setMessage('비밀번호가 변경되었습니다.');
    } catch (e) {
      setError(e instanceof Error ? e.message : '비밀번호 변경에 실패했습니다.');
    } finally {
      setChangingPassword(false);
    }
  }

  return (
    <main className="relative min-h-[calc(100vh-4rem)] overflow-hidden text-white">
      <div className="pointer-events-none absolute left-1/2 top-[-200px] h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-blue-500/10 blur-3xl" />
      <section className="relative mx-auto max-w-5xl px-6 py-12">
        <h1 className="text-4xl font-black tracking-tight">마이페이지</h1>
        <p className="mt-2 text-slate-400">프로필 정보와 게임 통계를 관리합니다.</p>

        {error ? <p className="mt-4 rounded-xl bg-rose-500/10 px-4 py-3 text-rose-200">{error}</p> : null}
        {message ? <p className="mt-4 rounded-xl bg-emerald-500/10 px-4 py-3 text-emerald-200">{message}</p> : null}

        {loading ? (
          <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.04] p-8 text-slate-300">불러오는 중...</div>
        ) : user ? (
          <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_1fr]">
            <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-6">
              <h2 className="text-xl font-bold">프로필</h2>
              <div className="mt-4 space-y-4">
                {!user.isGuest ? (
                  <p className="text-sm text-slate-300">
                    이메일 <span className="ml-2 font-semibold text-white">{user.email}</span>
                  </p>
                ) : null}
                <div className="rounded-xl border border-white/10 bg-slate-900/50 px-4 py-3">
                  <p className="text-xs font-semibold text-slate-400">현재 닉네임</p>
                  <p className="mt-1 text-lg font-black text-white">{user.nickname}</p>
                </div>

                {!user.isGuest ? (
                  <>
                    <label className="block">
                      <span className="mb-1 block text-sm text-slate-300">새 닉네임</span>
                      <input
                        value={nextNickname}
                        onChange={(e) => setNextNickname(e.target.value)}
                        className="w-full rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2 outline-none"
                        placeholder="변경할 닉네임 입력"
                        maxLength={20}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => void handleSaveProfile()}
                      disabled={saving || !nextNickname.trim()}
                      className="rounded-xl bg-gradient-to-r from-blue-500 to-violet-500 px-4 py-2 font-bold disabled:opacity-60"
                    >
                      {saving ? '변경 중...' : '닉네임 변경'}
                    </button>
                  </>
                ) : (
                  <p className="text-xs text-slate-400">게스트 계정은 닉네임 변경을 지원하지 않습니다.</p>
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-6">
              <h2 className="text-xl font-bold">통계</h2>
              <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                <StatCard label="총 게임" value={user.totalGameCount} />
                <StatCard label="승리" value={user.winGameCount} />
                <StatCard label="승률" value={`${winRate}%`} />
              </div>
              <p className="mt-4 text-xs text-slate-400">{user.isGuest ? '게스트 계정' : '일반 계정'}</p>
            </section>

            <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 lg:col-span-2">
              <h2 className="text-xl font-bold">프로필 이미지</h2>
              <div className="mt-4 flex flex-wrap items-center gap-4">
                <ProfileImage
                  src={user.profileImageUrl}
                  alt="프로필"
                  className="h-24 w-24 rounded-full border border-white/20 object-cover"
                />
                <div className="flex-1">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      void handleUploadImage(file);
                      e.currentTarget.value = '';
                    }}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="mt-3 rounded-xl border border-white/20 px-4 py-2 font-semibold disabled:opacity-60"
                  >
                    {uploading ? '업로드 중...' : '프로필 사진 변경'}
                  </button>
                </div>
              </div>
            </section>

            {!user.isGuest ? (
              <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 lg:col-span-2">
                <h2 className="text-xl font-bold">비밀번호 변경</h2>
                <div className="mt-4 space-y-3">
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-slate-300">현재 비밀번호</span>
                    <input
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2 outline-none"
                      placeholder="현재 비밀번호"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-slate-300">새 비밀번호</span>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2 outline-none"
                      placeholder="8~20자"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-slate-300">새 비밀번호 확인</span>
                    <input
                      type="password"
                      value={newPasswordConfirm}
                      onChange={(e) => setNewPasswordConfirm(e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2 outline-none"
                      placeholder="새 비밀번호 재입력"
                    />
                  </label>
                </div>
                <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-slate-400">비밀번호는 8자 이상 20자 이하입니다.</p>
                  <button
                    type="button"
                    onClick={() => void handleChangePassword()}
                    disabled={changingPassword}
                    className="rounded-xl border border-white/20 px-4 py-2 font-semibold disabled:opacity-60"
                  >
                    {changingPassword ? '변경 중...' : '비밀번호 변경'}
                  </button>
                </div>
              </section>
            ) : null}

            {user.isGuest ? (
              <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 lg:col-span-2">
                <h2 className="text-xl font-bold">게스트 세션</h2>
                <p className="mt-2 text-sm text-slate-300">
                  게스트 계정은 임시 계정입니다. 현재 세션을 종료하려면 우측 상단 로그아웃을 이용해 주세요.
                </p>
              </section>
            ) : (
              <section className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-6 lg:col-span-2">
                <h2 className="text-xl font-bold text-rose-200">회원 탈퇴</h2>
                <p className="mt-2 text-sm text-rose-100/90">탈퇴 시 계정 정보는 복구할 수 없습니다.</p>
                <button
                  type="button"
                  onClick={() => void handleDeleteAccount()}
                  disabled={deleting}
                  className="mt-4 rounded-xl bg-rose-500 px-4 py-2 font-bold text-white disabled:opacity-60"
                >
                  {deleting ? '탈퇴 처리 중...' : '회원 탈퇴'}
                </button>
              </section>
            )}
          </div>
        ) : null}
      </section>
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-900/70 p-4">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-black">{value}</p>
    </div>
  );
}
