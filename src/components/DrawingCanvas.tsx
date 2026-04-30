'use client';

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  type PointerEvent,
} from 'react';

const CANVAS_SIZE = 640;

export type DrawingCanvasHandle = {
  toDataUrl: () => string;
  clear: () => void;
  getHasDrawing: () => boolean;
};

type DrawingCanvasProps = {
  strokeColor: string;
  lineWidth: number;
  isEraser: boolean;
  className?: string;
};

function getPointerPos(canvas: HTMLCanvasElement, clientX: number, clientY: number) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY,
  };
}

export const DrawingCanvas = forwardRef<DrawingCanvasHandle, DrawingCanvasProps>(
  function DrawingCanvas({ strokeColor, lineWidth, isEraser, className }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const isDrawing = useRef(false);
    const lastPoint = useRef<{ x: number; y: number } | null>(null);
    const strokeCount = useRef(0);

    const fillWhite = useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }, []);

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = CANVAS_SIZE;
      canvas.height = CANVAS_SIZE;
      fillWhite();
      strokeCount.current = 0;
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
        ctx.stroke();
        ctx.restore();
        strokeCount.current += 1;
      },
      [isEraser, lineWidth, strokeColor],
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
        ctx.fill();
        strokeCount.current += 1;
      },
      [isEraser, lineWidth, strokeColor],
    );

    useImperativeHandle(ref, () => ({
      toDataUrl: () => canvasRef.current?.toDataURL('image/png') ?? '',
      clear: () => {
        fillWhite();
        strokeCount.current = 0;
      },
      getHasDrawing: () => strokeCount.current > 0,
    }));

    const onPointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      isDrawing.current = true;
      const p = getPointerPos(canvas, e.clientX, e.clientY);
      lastPoint.current = p;
      paintDot(p);
    };

    const onPointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
      if (!isDrawing.current || !lastPoint.current) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      e.preventDefault();
      const p = getPointerPos(canvas, e.clientX, e.clientY);
      paintStroke(lastPoint.current, p);
      lastPoint.current = p;
    };

    const endStroke = () => {
      isDrawing.current = false;
      lastPoint.current = null;
    };

    return (
      <canvas
        ref={canvasRef}
        className={[
          'aspect-square w-[min(88vw,min(34svh,300px))] max-w-full touch-none rounded-xl bg-white sm:w-[min(88vw,min(38svh,340px))]',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        style={{ cursor: 'crosshair' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endStroke}
        onPointerCancel={endStroke}
        onPointerLeave={(e: PointerEvent<HTMLCanvasElement>) => {
          if (e.buttons === 0) endStroke();
        }}
      />
    );
  },
);
