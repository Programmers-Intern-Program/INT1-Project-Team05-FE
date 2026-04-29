'use client';

import { useEffect, useMemo, useState } from 'react';

export default function PlayerChatBubble({
  text,
  durationMs = 2600,
}: {
  text?: string;
  durationMs?: number;
}) {
  const hasText = useMemo(() => Boolean(text && text.trim().length > 0), [text]);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!hasText) {
      setShow(false);
      return;
    }

    setShow(true);
    const t = window.setTimeout(() => setShow(false), durationMs);
    return () => window.clearTimeout(t);
  }, [hasText, durationMs]);

  return (
    <div className="min-h-[56px]">
      <div
        className={[
          'rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm font-semibold leading-relaxed text-slate-100',
          'transition-all duration-300 ease-out',
          show ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2 pointer-events-none',
        ].join(' ')}
        aria-hidden={!hasText}
      >
        {text}
      </div>
    </div>
  );
}

