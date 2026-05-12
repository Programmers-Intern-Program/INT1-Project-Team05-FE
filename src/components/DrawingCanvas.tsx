'use client';

import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type PointerEvent,
} from 'react';

const CANVAS_SIZE = 640;

export type DrawingCanvasHandle = {
  toDataUrl: () => string;
  clear: () => void;
  getHasDrawing: () => boolean;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
};

type DrawingCanvasProps = {
  strokeColor: string;
  lineWidth: number;
  isEraser: boolean;
  strokeOpacity?: number;
  className?: string;
};

/** 한 번의 layout read로 CSS·비트맵 좌표를 같이 계산한다 (호버 시 getBoundingClientRect 이중 호출 방지). */
function readPointerCoords(canvas: HTMLCanvasElement, clientX: number, clientY: number) {
  const rect = canvas.getBoundingClientRect();
  const xCss = clientX - rect.left;
  const yCss = clientY - rect.top;
  const sx = canvas.width / rect.width;
  const sy = canvas.height / rect.height;
  return {
    css: { x: xCss, y: yCss },
    bitmap: { x: xCss * sx, y: yCss * sy },
  };
}

const DrawingCanvasInner = forwardRef<DrawingCanvasHandle, DrawingCanvasProps>(
  function DrawingCanvas({ strokeColor, lineWidth, isEraser, strokeOpacity = 1, className }, ref) {
    const isHighlighter = !isEraser && strokeOpacity < 0.95;
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const isDrawing = useRef(false);
    const lastPoint = useRef<{ x: number; y: number } | null>(null);
    const strokeCount = useRef(0);
    const strokeDirty = useRef(false);
    const historyRef = useRef<string[]>([]);
    const redoRef = useRef<string[]>([]);
    const isRestoring = useRef(false);
    const rafRef = useRef<number | null>(null);
    /** 호버 시 pointermove가 rAF보다 촘촘할 때 layout read를 프레임당 1회로 줄인다. */
    const hoverRafRef = useRef<number | null>(null);
    const pendingHoverClientRef = useRef<{ x: number; y: number } | null>(null);
    /** 위치는 ref + DOM으로만 갱신해 포인터 이동마다 리렌더가 나지 않게 한다. */
    const cursorWrapRef = useRef<HTMLDivElement>(null);
    const [cursorVisible, setCursorVisible] = useState(false);

    const fillWhite = useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }, []);

    const snapshot = useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas) return '';
      return canvas.toDataURL('image/png');
    }, []);

    const restoreFromDataUrl = useCallback(
      (dataUrl: string) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const img = new Image();
        isRestoring.current = true;
        img.onload = () => {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          isRestoring.current = false;
        };
        img.onerror = () => {
          isRestoring.current = false;
        };
        img.src = dataUrl;
      },
      [],
    );

    const pushHistory = useCallback(() => {
      if (isRestoring.current) return;
      const url = snapshot();
      if (!url) return;
      const history = historyRef.current;
      if (history.length > 0 && history[history.length - 1] === url) return;
      history.push(url);
      if (history.length > 60) history.shift();
      redoRef.current = [];
    }, [snapshot]);

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = CANVAS_SIZE;
      canvas.height = CANVAS_SIZE;
      fillWhite();
      strokeCount.current = 0;
      historyRef.current = [];
      redoRef.current = [];
      pushHistory();
      return () => {
        if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
        if (hoverRafRef.current != null) cancelAnimationFrame(hoverRafRef.current);
      };
    }, [fillWhite]);

    const paintStroke = useCallback(
      (from: { x: number; y: number }, to: { x: number; y: number }) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.strokeStyle = isEraser ? '#ffffff' : strokeColor;
        ctx.lineWidth = isEraser ? lineWidth * 2.5 : lineWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.globalAlpha = isEraser ? 1 : strokeOpacity;
        ctx.stroke();
        ctx.restore();
        strokeCount.current += 1;
        strokeDirty.current = true;
      },
      [isEraser, lineWidth, strokeColor, strokeOpacity],
    );

    const paintDot = useCallback(
      (p: { x: number; y: number }) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const r = (isEraser ? lineWidth * 1.25 : lineWidth) / 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fillStyle = isEraser ? '#ffffff' : strokeColor;
        ctx.globalAlpha = isEraser ? 1 : strokeOpacity;
        ctx.fill();
        strokeCount.current += 1;
        strokeDirty.current = true;
      },
      [isEraser, lineWidth, strokeColor, strokeOpacity],
    );

    useImperativeHandle(ref, () => ({
      toDataUrl: () => canvasRef.current?.toDataURL('image/png') ?? '',
      clear: () => {
        fillWhite();
        strokeCount.current = 0;
        strokeDirty.current = false;
        historyRef.current = [];
        redoRef.current = [];
        pushHistory();
      },
      getHasDrawing: () => strokeCount.current > 0 || historyRef.current.length > 1,
      undo: () => {
        const history = historyRef.current;
        if (history.length <= 1) return;
        const last = history.pop();
        if (last) redoRef.current.unshift(last);
        const prev = history[history.length - 1];
        if (prev) restoreFromDataUrl(prev);
        strokeCount.current = history.length <= 1 ? 0 : 1;
      },
      redo: () => {
        const next = redoRef.current.shift();
        if (!next) return;
        historyRef.current.push(next);
        restoreFromDataUrl(next);
        strokeCount.current = 1;
      },
      canUndo: () => historyRef.current.length > 1,
      canRedo: () => redoRef.current.length > 0,
    }));

    const applyCursorTransform = useCallback((x: number, y: number) => {
      const el = cursorWrapRef.current;
      if (el) el.style.transform = `translate(${x}px, ${y}px)`;
    }, []);

    const onPointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      if (hoverRafRef.current != null) {
        cancelAnimationFrame(hoverRafRef.current);
        hoverRafRef.current = null;
      }
      pendingHoverClientRef.current = null;
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      isDrawing.current = true;
      strokeDirty.current = false;
      const { css, bitmap } = readPointerCoords(canvas, e.clientX, e.clientY);
      applyCursorTransform(css.x, css.y);
      setCursorVisible(true);
      lastPoint.current = bitmap;
      paintDot(bitmap);
    };

    const onPointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const drawing = isDrawing.current && lastPoint.current != null;
      if (drawing) e.preventDefault();

      if (!drawing) {
        pendingHoverClientRef.current = { x: e.clientX, y: e.clientY };
        if (hoverRafRef.current == null) {
          hoverRafRef.current = requestAnimationFrame(() => {
            hoverRafRef.current = null;
            const c = canvasRef.current;
            const pending = pendingHoverClientRef.current;
            if (!c || !pending) return;
            const { css } = readPointerCoords(c, pending.x, pending.y);
            applyCursorTransform(css.x, css.y);
          });
        }
        return;
      }

      const { css, bitmap } = readPointerCoords(canvas, e.clientX, e.clientY);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        applyCursorTransform(css.x, css.y);
      });

      if (!lastPoint.current) return;
      paintStroke(lastPoint.current, bitmap);
      lastPoint.current = bitmap;
    };

    const endStroke = () => {
      isDrawing.current = false;
      lastPoint.current = null;
      if (strokeDirty.current) {
        pushHistory();
        strokeDirty.current = false;
      }
    };

    return (
      <div
        className={[
          'relative aspect-square w-[min(88vw,min(34svh,300px))] max-w-full touch-none rounded-xl bg-white sm:w-[min(88vw,min(38svh,340px))]',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <canvas
          ref={canvasRef}
          className="h-full w-full rounded-xl"
          style={{ cursor: 'none' }}
          onPointerEnter={(e) => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const { css } = readPointerCoords(canvas, e.clientX, e.clientY);
            applyCursorTransform(css.x, css.y);
            setCursorVisible(true);
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={() => {
            endStroke();
            setCursorVisible(true);
          }}
          onPointerCancel={() => {
            endStroke();
            setCursorVisible(false);
          }}
          onPointerLeave={(e: PointerEvent<HTMLCanvasElement>) => {
            if (e.buttons === 0) endStroke();
            if (hoverRafRef.current != null) {
              cancelAnimationFrame(hoverRafRef.current);
              hoverRafRef.current = null;
            }
            pendingHoverClientRef.current = null;
            setCursorVisible(false);
          }}
        />
        <div
          ref={cursorWrapRef}
          className={`pointer-events-none absolute left-0 top-0 will-change-transform ${
            cursorVisible ? 'opacity-100' : 'opacity-0'
          }`}
          style={{ transform: 'translate(0px, 0px)' }}
          aria-hidden={!cursorVisible}
        >
            <div
              style={{
                width: `${(isEraser ? lineWidth * 2.5 : lineWidth) + 6}px`,
                height: `${(isEraser ? lineWidth * 2.5 : lineWidth) + 6}px`,
                transform: 'translate(-50%, -50%)',
                borderRadius: '9999px',
                border: isHighlighter
                  ? '2px solid rgba(168,85,247,0.95)'
                  : '2px solid rgba(15,23,42,0.85)',
                boxShadow:
                  '0 0 0 2px rgba(255,255,255,0.7), 0 0 10px rgba(2,6,23,0.18)',
                background: isEraser
                  ? 'rgba(226,232,240,0.18)'
                  : isHighlighter
                    ? 'rgba(168,85,247,0.08)'
                    : 'transparent',
              }}
            />
          </div>
        </div>
    );
  },
);

DrawingCanvasInner.displayName = 'DrawingCanvas';

export const DrawingCanvas = memo(DrawingCanvasInner);
