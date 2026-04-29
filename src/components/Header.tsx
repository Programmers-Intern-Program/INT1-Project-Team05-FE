import Link from 'next/link';

export default function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-slate-950/65 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="group inline-flex items-center gap-2">
          <span className="rounded-lg bg-gradient-to-br from-blue-400 to-violet-500 px-2 py-1 text-sm font-black text-white shadow-lg shadow-blue-500/25">
            DR
          </span>
          <span className="text-xl font-extrabold tracking-tight text-white transition group-hover:text-blue-200">
            DrawRace
          </span>
        </Link>

        <nav className="flex items-center gap-2 text-sm font-medium text-slate-300">
          <Link
            href="/rooms"
            className="rounded-lg px-3 py-2 transition hover:bg-white/10 hover:text-white"
          >
            방 목록
          </Link>
          <Link
            href="/login"
            className="rounded-lg px-3 py-2 transition hover:bg-white/10 hover:text-white"
          >
            로그인
          </Link>
          <Link
            href="/signup"
            className="rounded-full bg-gradient-to-r from-blue-500 to-violet-500 px-4 py-2 font-semibold text-white shadow-lg shadow-blue-500/20 transition hover:from-blue-400 hover:to-violet-400"
          >
            회원가입
          </Link>
        </nav>
      </div>
    </header>
  );
}